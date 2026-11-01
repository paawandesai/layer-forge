import Resolver from '@forge/resolver';
import api, { fetch, route } from '@forge/api';
import { kvs as storage } from '@forge/kvs';
import { createClient, layerConfig, LayerError } from './lib/layer.js';
import { blastRadius, summarize, consumersText, changesText } from './lib/format.js';
import { parseTeamProjects, planConsumerIssues, teamsForProject } from './lib/tickets.js';
import { DEMO_ISSUES, DEMO_PROJECT, demoKeys, demoTeamProjects } from './lib/demo.js';

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

async function jira(path, body, { method = body ? 'POST' : 'GET', allow404 = false } = {}) {
  const res = await api.asUser().requestJira(path, {
    method,
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  if (allow404 && res.status === 404) return null;
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

// Admin page: create the FERN project with the demo issues whose keys
// match the Fernway demo branches, and map the Fernway teams to it.
resolver.define('loadDemo', async (req) => {
  if (!req.context?.moduleKey?.endsWith(ADMIN_MODULE)) return { error: { message: 'The demo loads from the admin page.' } };
  try {
    let project = await jira(route`/rest/api/3/project/${DEMO_PROJECT.key}`, null, { allow404: true });
    if (!project) {
      const me = await jira(route`/rest/api/3/myself`);
      project = await jira(route`/rest/api/3/project`, {
        key: DEMO_PROJECT.key,
        name: DEMO_PROJECT.name,
        projectTypeKey: 'software',
        projectTemplateKey: 'com.pyxis.greenhopper.jira:gh-simplified-kanban-classic',
        leadAccountId: me.accountId,
        assigneeType: 'UNASSIGNED',
      });
    }
    const found = await jira(route`/rest/api/3/search/jql`, {
      jql: `project = ${DEMO_PROJECT.key} ORDER BY key ASC`,
      fields: ['summary'],
      maxResults: 100,
    });
    const existing = (found.issues || []).map((i) => i.key);
    const keys = demoKeys();
    if (existing.length && existing.join() !== keys.slice(0, existing.length).join()) {
      return { error: { message: `Project ${DEMO_PROJECT.key} already has other issues, so the demo keys would not line up. Remove it or load the demo on a fresh site.` } };
    }
    const created = [];
    for (const [i, issue] of DEMO_ISSUES.entries()) {
      if (i < existing.length) continue;
      const made = await jira(route`/rest/api/3/issue`, {
        fields: {
          project: { key: DEMO_PROJECT.key },
          issuetype: { name: 'Task' },
          summary: issue.summary,
          description: { type: 'doc', version: 1, content: [{ type: 'paragraph', content: [{ type: 'text', text: issue.description }] }] },
        },
      });
      if (made.key !== keys[i]) return { error: { message: `Expected ${keys[i]} but Jira created ${made.key}.` } };
      created.push(made.key);
    }
    const current = await settings();
    if (!current.teamProjects.trim()) await storage.set(SETTINGS_KEY, { teamProjects: demoTeamProjects() });
    return { project: DEMO_PROJECT.key, created, keys };
  } catch (err) {
    console.error(err);
    return { error: { message: String(err.message || err) } };
  }
});

// Project page: contract changes coming to the teams mapped to this project.
resolver.define('getIncoming', async (req) => {
  const projectKey = req.context?.extension?.project?.key;
  if (!projectKey) return { error: { code: 'no_project', message: 'Open a project to see its incoming changes.' } };
  const teams = teamsForProject(parseTeamProjects((await settings()).teamProjects), projectKey);
  if (teams.length === 0) return { projectKey, teams, entries: [] };
  try {
    const all = [];
    for (const owner of teams) all.push(...((await client().changes({ owner })).changes || []));
    const seen = new Set();
    const unique = all.filter((c) => {
      const k = `${c.id}|${c.route?.consumer}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
    return { projectKey, teams, entries: blastRadius(unique) };
  } catch (err) {
    return failure(err);
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

// Accepts owner/name and adds the GitHub host, which Layer's repository IDs carry.
const fullRepo = (repo) => (repo && !repo.split('/')[0].includes('.') ? `github.com/${repo}` : repo);

export const getConsumers = asText(async ({ contract, repo }) => {
  if (!contract || !repo) return 'Give the contract name and the repository that owns it, for example jobs-api in fernway-test/jobs-api.';
  return consumersText(await client().consumers({ name: contract, repo: fullRepo(repo) }));
});

export const getIncomingChanges = asText(async ({ repo, owner }) => {
  if (!repo && !owner) return 'Give a consuming repository (owner/name) or an owner handle such as @acme/web-team.';
  const r = fullRepo(repo);
  return changesText(blastRadius((await client().changes({ repo: r, owner })).changes));
});

export const getIssueChanges = asText(async (payload) => {
  const issueKey = payload.issueKey || payload.context?.jira?.issueKey;
  if (!issueKey) return 'Give a Jira issue key such as JOBS-12.';
  const entries = blastRadius((await client().changesForIssue(issueKey)).changes);
  return `${summarize(entries)}\n${changesText(entries)}`;
});
