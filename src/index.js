import Resolver from '@forge/resolver';
import api, { fetch, route } from '@forge/api';
import { kvs as storage } from '@forge/kvs';
import { createClient, layerConfig, LayerError } from './lib/layer.js';
import { blastRadius, summarize, consumersText, changesText } from './lib/format.js';
import { parseTeamProjects, planConsumerIssues } from './lib/tickets.js';

const client = () => createClient({ ...layerConfig(), fetch });

function failure(err) {
  if (err instanceof LayerError) return { error: { code: err.code, status: err.status, message: err.message } };
  console.error(err);
  return { error: { code: 'internal', message: 'Layer could not be reached. Try again in a minute.' } };
}

const resolver = new Resolver();

// Issue panel: the contract changes in this issue's pull requests.
resolver.define('getBlastRadius', async (req) => {
  const issueKey = req.context?.extension?.issue?.key;
  if (!issueKey) return { error: { code: 'no_issue', message: 'Open an issue to see its blast radius.' } };
  try {
    const body = await client().changesForIssue(issueKey);
    const entries = blastRadius(body.changes);
    const plans = planConsumerIssues({ issueKey, entries, defaultProject: issueKey.split('-')[0] });
    const told = (await storage.get(`told:${issueKey}`)) || {};
    return { issueKey, summary: summarize(entries), entries, teamsToTell: plans.map((p) => p.owner), told };
  } catch (err) {
    return failure(err);
  }
});

const SETTINGS_KEY = 'settings';
const ADMIN_MODULE = 'layer-admin';

async function settings() {
  return (await storage.get(SETTINGS_KEY)) || { teamProjects: '' };
}

resolver.define('getSettings', async () => settings());

resolver.define('saveSettings', async (req) => {
  if (!req.context?.moduleKey?.endsWith(ADMIN_MODULE)) return { error: { message: 'Settings are saved from the admin page.' } };
  const teamProjects = String(req.payload?.teamProjects || '').slice(0, 10000);
  await storage.set(SETTINGS_KEY, { teamProjects });
  return { saved: true, teams: Object.keys(parseTeamProjects(teamProjects)).length };
});

async function jira(path, body) {
  const res = await api.asUser().requestJira(path, {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Jira answered ${res.status}: ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : {};
}

// "Tell the consumers": one linked issue per team whose repository will break.
// Already-filed teams are remembered per issue, so a second click adds only new ones.
resolver.define('tellConsumers', async (req) => {
  const issue = req.context?.extension?.issue;
  if (!issue?.key) return { error: { message: 'Open an issue first.' } };
  try {
    const entries = blastRadius((await client().changesForIssue(issue.key)).changes);
    const defaultProject = issue.key.split('-')[0];
    const plans = planConsumerIssues({
      issueKey: issue.key,
      entries,
      teamProjects: parseTeamProjects((await settings()).teamProjects),
      defaultProject,
    });
    const toldKey = `told:${issue.key}`;
    const told = (await storage.get(toldKey)) || {};
    const created = [];
    for (const plan of plans) {
      if (told[plan.owner]) continue;
      const made = await jira(route`/rest/api/3/issue`, {
        fields: {
          project: { key: plan.project },
          issuetype: { name: 'Task' },
          summary: plan.summary,
          description: plan.description,
          labels: ['layer-consumer'],
        },
      });
      await jira(route`/rest/api/3/issueLink`, {
        type: { name: 'Relates' },
        inwardIssue: { key: made.key },
        outwardIssue: { key: issue.key },
      });
      told[plan.owner] = made.key;
      created.push({ owner: plan.owner, key: made.key });
      await storage.set(toldKey, told);
    }
    return { created, told };
  } catch (err) {
    if (err instanceof LayerError) return failure(err);
    console.error(err);
    return { error: { code: 'jira', message: String(err.message || err) } };
  }
});

export const handler = resolver.getDefinitions();

// Rovo actions (also the MCP tools). Each returns text for the agent.
const asText = (fn) => async (payload) => {
  try {
    return await fn(payload);
  } catch (err) {
    return `Layer error: ${failure(err).error.message}`;
  }
};

export const getConsumers = asText(async ({ contract, repo }) => consumersText(await client().consumers({ name: contract, repo })));

export const getIncomingChanges = asText(async ({ repo, owner }) => {
  if (!repo && !owner) return 'Give a consuming repository (owner/name) or an owner handle such as @acme/web-team.';
  const r = repo && !repo.includes('.') ? `github.com/${repo}` : repo;
  return changesText(blastRadius((await client().changes({ repo: r, owner })).changes));
});

export const getIssueChanges = asText(async (payload) => {
  const issueKey = payload.issueKey || payload.context?.jira?.issueKey;
  if (!issueKey) return 'Give a Jira issue key such as JOBS-12.';
  const entries = blastRadius((await client().changesForIssue(issueKey)).changes);
  return `${summarize(entries)}\n${changesText(entries)}`;
});
