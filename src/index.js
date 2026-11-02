import ResolverModule from '@forge/resolver';
import { asUser, fetch, route } from '@forge/api';
import { kvs as storage } from '@forge/kvs';
import { createClient, layerConfig, LayerError } from './lib/layer.js';
import { blastRadius, summarize, consumersText, changesText, groupIncoming } from './lib/format.js';
import { adfLines, chooseAction, dueDate, filedFor, parseTeamProjects, planConsumerIssues, teamsForProject } from './lib/tickets.js';
import { DEMO_PROJECT, demoFailure, demoKeys, demoReport, demoTeamProjects, pickIssueType, planDemo } from './lib/demo.js';
import { setupSteps } from './lib/setup.js';

const client = () => createClient({ ...layerConfig(), fetch });

function failure(err) {
  if (err instanceof LayerError) return { error: { code: err.code, status: err.status, message: err.message } };
  console.error(err);
  return { error: { code: 'internal', message: 'Layer could not be reached. Try again in a minute.' } };
}

// The package is CommonJS; under "type": "module" its default import is the whole exports object.
const Resolver = ResolverModule.default ?? ResolverModule;
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
    // A task Layer filed for another issue points back to it instead of saying "no changes".
    const parent = entries.length
      ? null
      : await jira(route`/rest/api/3/issue/${issueKey}?fields=labels,issuelinks`, null, { allow404: true })
          .then(filedFor, () => null);
    return {
      issueKey,
      filedFor: parent,
      summary: summarize(entries),
      entries,
      routes: (body.changes || []).length,
      teamsToTell: plans.map((p) => p.owner),
      told,
    };
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
  const res = await asUser().requestJira(path, {
    method,
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  if (allow404 && res.status === 404) return null;
  const text = await res.text();
  if (!res.ok) {
    const err = new Error(`Jira answered ${res.status}: ${text.slice(0, 300)}`);
    err.status = res.status;
    err.body = text;
    throw err;
  }
  return text ? JSON.parse(text) : {};
}

// "Tell the consumers": one linked issue per team whose repository will break.
// Already-told teams are remembered per issue, and an open issue Layer filed
// earlier for the same team gets a comment instead of a duplicate.
async function tellPlans(issueKey) {
  const entries = blastRadius((await client().changesForIssue(issueKey)).changes);
  const plans = planConsumerIssues({
    issueKey,
    entries,
    teamProjects: parseTeamProjects((await settings()).teamProjects),
    defaultProject: issueKey.split('-')[0],
  });
  const told = (await storage.get(`told:${issueKey}`)) || {};
  const open = await jira(route`/rest/api/3/search/jql`, {
    jql: `issue in linkedIssues("${issueKey}") AND labels = layer-consumer AND statusCategory != Done`,
    fields: ['summary', 'project'],
    maxResults: 50,
  }).then(
    (r) => (r.issues || []).map((i) => ({ key: i.key, project: i.fields?.project?.key, summary: i.fields?.summary || '' })),
    () => [],
  );
  return { told, plans: plans.filter((p) => !told[p.owner]).map((p) => ({ ...p, action: chooseAction(p, open) })) };
}

resolver.define('previewTell', async (req) => {
  const issue = req.context?.extension?.issue;
  if (!issue?.key) return { error: { message: 'Open an issue first.' } };
  try {
    const { plans } = await tellPlans(issue.key);
    return {
      plans: plans.map((p) => ({ owner: p.owner, project: p.project, summary: p.summary, lines: adfLines(p.description), action: p.action })),
    };
  } catch (err) {
    return failure(err);
  }
});

async function fileIssue(plan, sourceKey, due) {
  const fields = {
    project: { key: plan.project },
    issuetype: { name: 'Task' },
    summary: plan.summary,
    description: plan.description,
    labels: ['layer-consumer'],
  };
  let made;
  try {
    made = await jira(route`/rest/api/3/issue`, { fields: due ? { ...fields, duedate: due } : fields });
  } catch (err) {
    // Some projects leave the due date off their create screen.
    if (!(due && err.status === 400 && /duedate/i.test(err.body || ''))) throw err;
    made = await jira(route`/rest/api/3/issue`, { fields });
  }
  await jira(route`/rest/api/3/issueLink`, { type: { name: 'Relates' }, inwardIssue: { key: made.key }, outwardIssue: { key: sourceKey } });
  return made.key;
}

async function commentIssue(plan, target) {
  const note = { type: 'paragraph', content: [{ type: 'text', text: 'Layer update: the change this issue tracks still affects your repositories.' }] };
  await jira(route`/rest/api/3/issue/${target}/comment`, { body: { ...plan.description, content: [note, ...plan.description.content] } });
  return target;
}

resolver.define('tellConsumers', async (req) => {
  const issue = req.context?.extension?.issue;
  if (!issue?.key) return { error: { message: 'Open an issue first.' } };
  try {
    const due = dueDate(req.payload?.dueDate);
    const { told, plans } = await tellPlans(issue.key);
    const created = [];
    for (const plan of plans) {
      const key = plan.action.mode === 'comment' ? await commentIssue(plan, plan.action.target) : await fileIssue(plan, issue.key, due);
      told[plan.owner] = key;
      created.push({ owner: plan.owner, key, mode: plan.action.mode });
      await storage.set(`told:${issue.key}`, told);
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
const PROJECT_TEMPLATES = [
  { projectTypeKey: 'software', projectTemplateKey: 'com.pyxis.greenhopper.jira:gh-simplified-kanban-classic' },
  { projectTypeKey: 'business', projectTemplateKey: 'com.atlassian.jira-core-project-templates:jira-core-simplified-task-tracking' },
];

async function createDemoProject() {
  const me = await jira(route`/rest/api/3/myself`);
  let last;
  for (const t of PROJECT_TEMPLATES) {
    try {
      return await jira(route`/rest/api/3/project`, {
        key: DEMO_PROJECT.key,
        name: DEMO_PROJECT.name,
        leadAccountId: me.accountId,
        assigneeType: 'UNASSIGNED',
        ...t,
      });
    } catch (err) {
      if (err.status !== 400) throw err;
      last = err;
    }
  }
  throw last;
}

const adf = (text) => ({ type: 'doc', version: 1, content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] });

resolver.define('loadDemo', async (req) => {
  if (!req.context?.moduleKey?.endsWith(ADMIN_MODULE)) return { error: { message: 'The demo loads from the admin page.' } };
  try {
    let project = await jira(route`/rest/api/3/project/${DEMO_PROJECT.key}`, null, { allow404: true });
    if (!project) project = await createDemoProject();
    const found = await jira(route`/rest/api/3/search/jql`, {
      jql: `project = ${DEMO_PROJECT.key} ORDER BY key ASC`,
      fields: ['summary'],
      maxResults: 100,
    });
    const plan = planDemo({ existingKeys: (found.issues || []).map((i) => i.key) });
    if (plan.error) return { error: { message: plan.error } };
    const meta = await jira(route`/rest/api/3/issue/createmeta/${DEMO_PROJECT.key}/issuetypes`);
    const issueType = pickIssueType(meta.issueTypes || meta.values || []);
    if (!issueType) return { error: { message: `Project ${DEMO_PROJECT.key} has no issue type the demo can use.` } };
    const created = [];
    for (const issue of plan.create) {
      const made = await jira(route`/rest/api/3/issue`, {
        fields: { project: { key: DEMO_PROJECT.key }, issuetype: { name: issueType }, summary: issue.summary, description: adf(issue.description) },
      });
      if (made.key !== issue.key) {
        // Jira skipped numbers because earlier issues were deleted; undo and explain.
        await jira(route`/rest/api/3/issue/${made.key}`, null, { method: 'DELETE' }).catch(() => null);
        const gap = planDemo({ existingKeys: plan.kept.concat(created), nextNumber: Number(made.key.split('-')[1]) });
        return { error: { message: gap.error || `Expected ${issue.key} but Jira created ${made.key}.` }, created };
      }
      created.push(made.key);
    }
    const current = await settings();
    const mapped = !current.teamProjects.trim();
    if (mapped) await storage.set(SETTINGS_KEY, { teamProjects: demoTeamProjects() });
    return { project: DEMO_PROJECT.key, created, keys: demoKeys(), report: demoReport({ created, kept: plan.kept, mapped, issueType }) };
  } catch (err) {
    console.error(err);
    return { error: { message: err.status ? demoFailure(err.status, err.body) : String(err.message || err) } };
  }
});

// Admin page: the first-run checklist. The FERN-1 query doubles as the connection check.
resolver.define('getSetup', async () => {
  const [connection, demo] = await Promise.all([
    client()
      .changesForIssue(demoKeys()[0])
      .then(
        (body) => ({ ok: true, breaking: blastRadius(body.changes).filter((e) => e.class === 'breaking').length }),
        (err) => failure(err),
      ),
    jira(route`/rest/api/3/project/${DEMO_PROJECT.key}`, null, { allow404: true })
      .then(async (project) => {
        if (!project) return { exists: false, keys: [] };
        const found = await jira(route`/rest/api/3/search/jql`, {
          jql: `project = ${DEMO_PROJECT.key} ORDER BY key ASC`,
          fields: ['summary'],
          maxResults: 100,
        });
        return { exists: true, keys: (found.issues || []).map((i) => i.key) };
      })
      .catch((err) => {
        console.error(err);
        return { exists: false, keys: [] };
      }),
  ]);
  return setupSteps({ connection, demo });
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
    const entries = blastRadius(unique);
    // Link each change to its Jira issue when the branch names one on this site.
    const keys = [...new Set(entries.map((e) => e.issue).filter(Boolean))].slice(0, 20);
    const found = await Promise.all(
      keys.map((k) =>
        jira(route`/rest/api/3/issue/${k}?fields=summary`, null, { allow404: true }).then(
          (i) => (i ? [k, i.fields?.summary || ''] : null),
          () => null,
        ),
      ),
    );
    const issues = Object.fromEntries(found.filter(Boolean));
    for (const e of entries) e.issueSummary = issues[e.issue] ?? null;
    return { projectKey, teams, entries, groups: groupIncoming(entries, teams) };
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
