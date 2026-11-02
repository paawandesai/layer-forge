import ResolverModule from '@forge/resolver';
import { asUser, fetch, route } from '@forge/api';
import { kvs as storage } from '@forge/kvs';
import { createClient, layerConfig, LayerError } from './lib/layer.js';
import { blastRadius, summarize, consumersText, changesText, groupIncoming } from './lib/format.js';
import { adfLines, chooseAction, dueDate, filedFor, parseTeamProjects, planConsumerIssues, teamsForProject } from './lib/tickets.js';
import { DEMO_PROJECT, DEMO_TEAMS, isDemoData, demoFailure, demoKeys, demoReport, demoTeamProjects, pickIssueType, planDemo } from './lib/demo.js';
import { setupSteps } from './lib/setup.js';
import { riskOverview } from './lib/overview.js';
import { automationConfig, blastComment } from './lib/automation.js';
import { graph } from '@forge/teamwork-graph';
import { graphObjects } from './lib/graph.js';

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

// Team-to-project mapping. Until an admin saves one, the Fernway demo teams map
// to FERN, so a site with the demo issues but no saved mapping still works.
async function teamMap() {
  const saved = (await settings()).teamProjects;
  return parseTeamProjects(saved.trim() ? saved : demoTeamProjects());
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
    const { plans, told } = await tellPlans(issue.key);
    return {
      told,
      plans: plans.map((p) => ({ owner: p.owner, project: p.project, summary: p.summary, lines: adfLines(p.description), action: p.action })),
    };
  } catch (err) {
    return failure(err);
  }
});

// Team projects differ: use Task when the project has it, else its closest type.
async function issueTypeFor(projectKey, cache) {
  if (!cache.has(projectKey)) {
    const meta = await jira(route`/rest/api/3/issue/createmeta/${projectKey}/issuetypes`).catch(() => null);
    cache.set(projectKey, pickIssueType(meta?.issueTypes || meta?.values || []) || 'Task');
  }
  return cache.get(projectKey);
}

async function fileIssue(plan, sourceKey, due, types = new Map()) {
  const fields = {
    project: { key: plan.project },
    issuetype: { name: await issueTypeFor(plan.project, types) },
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

async function tellTeams(issueKey, dueValue) {
  const due = dueDate(dueValue);
  const { told, plans } = await tellPlans(issueKey);
  const created = [];
  const types = new Map();
  for (const plan of plans) {
    const key = plan.action.mode === 'comment' ? await commentIssue(plan, plan.action.target) : await fileIssue(plan, issueKey, due, types);
    told[plan.owner] = key;
    created.push({ owner: plan.owner, key, mode: plan.action.mode });
    await storage.set(`told:${issueKey}`, told);
  }
  return { created, told };
}

resolver.define('tellConsumers', async (req) => {
  const issue = req.context?.extension?.issue;
  if (!issue?.key) return { error: { message: 'Open an issue first.' } };
  try {
    return await tellTeams(issue.key, req.payload?.dueDate);
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
  const teams = teamsForProject(await teamMap(), projectKey);
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

// Dashboard gadget: breaking changes across every mapped team, and who has
// not been told yet.
resolver.define('getOverview', async () => {
  try {
    const mapped = Object.keys(parseTeamProjects((await settings()).teamProjects));
    const teams = mapped.length ? mapped : DEMO_TEAMS;
    const seen = new Set();
    const all = [];
    for (const owner of teams) {
      for (const c of (await client().changes({ owner })).changes || []) {
        const k = `${c.id}|${c.route?.consumer}`;
        if (seen.has(k)) continue;
        seen.add(k);
        all.push(c);
      }
    }
    const entries = blastRadius(all);
    const keys = [...new Set(entries.map((e) => e.issue).filter(Boolean))];
    const told = Object.fromEntries(await Promise.all(keys.map(async (k) => [k, (await storage.get(`told:${k}`)) || {}])));
    return { ...riskOverview(entries, told), teams, demo: isDemoData(entries) };
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

// "My team": with no repository or owner, the teams an admin mapped to the
// named project, or to the project the user is looking at.
export const getIncomingChanges = asText(async ({ repo, owner, project, context }) => {
  if (repo || owner) return changesText(blastRadius((await client().changes({ repo: fullRepo(repo), owner })).changes));
  const projectKey = String(project || context?.jira?.projectKey || '').toUpperCase();
  if (!projectKey) return 'Give a consuming repository (owner/name), an owner handle such as @acme/web-team, or a Jira project key.';
  const teams = teamsForProject(await teamMap(), projectKey);
  if (!teams.length) return `No code owner teams are mapped to Jira project ${projectKey}. Ask for the team's owner handle, such as @acme/web-team.`;
  const sections = [];
  for (const team of teams) {
    const entries = blastRadius((await client().changes({ owner: team })).changes);
    sections.push(`${team} (mapped to ${projectKey}):\n${changesText(entries)}`);
  }
  return sections.join('\n\n');
});

export const getIssueChanges = asText(async (payload) => {
  const issueKey = payload.issueKey || payload.context?.jira?.issueKey;
  if (!issueKey) return 'Give a Jira issue key such as JOBS-12.';
  const entries = blastRadius((await client().changesForIssue(issueKey)).changes);
  return `${summarize(entries)}\n${changesText(entries)}`;
});

// Rovo write action. Rovo asks the person to confirm before it runs, because
// its verb is CREATE; the agent prompt also asks first and shows the plan.
export const tellConsumersAction = async (payload) => {
  const issueKey = String(payload.issueKey || payload.context?.jira?.issueKey || '').toUpperCase();
  if (!issueKey) return 'Give the Jira issue key whose consumers should be told, such as FERN-1.';
  try {
    const { created, told } = await tellTeams(issueKey, payload.dueDate);
    const base = await jira(route`/rest/api/3/serverInfo`).then((i) => i.baseUrl || '', () => '');
    const link = (k) => (base ? `[${k}](${base}/browse/${k})` : k);
    if (!created.length) {
      const before = Object.entries(told);
      return before.length
        ? `Every affected team was already told about ${issueKey}: ${before.map(([o, k]) => `${o} in ${link(k)}`).join(', ')}.`
        : `No team needs to be told: nothing in ${issueKey}'s pull requests breaks another repository.`;
    }
    return [
      `Told ${created.length} team${created.length === 1 ? '' : 's'} about ${issueKey}:`,
      ...created.map((c) => `- ${c.owner}: ${c.mode === 'comment' ? 'commented on' : 'filed'} ${link(c.key)}`),
    ].join('\n');
  } catch (err) {
    if (err instanceof LayerError) return `Layer error: ${failure(err).error.message}`;
    console.error(err);
    return `Jira error: ${String(err.message || err).slice(0, 300)}`;
  }
};

// Teamwork Graph connector: once an admin connects it, Layer's services and
// their consumers go into the graph, linked to the Jira issues changing them.

const GRAPH_KEY = 'graph:connection';

async function syncGraph(connectionId) {
  const mapped = Object.keys(parseTeamProjects((await settings()).teamProjects));
  const teams = mapped.length ? mapped : DEMO_TEAMS;
  const changes = [];
  for (const owner of teams) changes.push(...((await client().changes({ owner })).changes || []));
  const objects = graphObjects(changes);
  for (let i = 0; i < objects.length; i += 100) {
    const result = await graph.setObjects({ objects: objects.slice(i, i + 100), connectionId });
    if (!result.success) console.error('Teamwork Graph rejected objects', JSON.stringify(result.error || result).slice(0, 1000));
  }
  return objects.length;
}

export const onGraphConnectionChange = async (event) => {
  const { action, connectionId } = event || {};
  if (action === 'DELETED') {
    await storage.delete(GRAPH_KEY).catch(() => null);
    return { success: true };
  }
  if (connectionId) {
    await storage.set(GRAPH_KEY, { connectionId, at: new Date().toISOString() });
    try {
      console.log(`Teamwork Graph: sent ${await syncGraph(connectionId)} services`);
    } catch (err) {
      console.error('Teamwork Graph sync failed', err);
    }
  }
  return { success: true };
};

// Hourly refresh while a connection exists.
export const refreshGraph = async () => {
  const conn = await storage.get(GRAPH_KEY);
  if (!conn?.connectionId) return;
  try {
    console.log(`Teamwork Graph: refreshed ${await syncGraph(conn.connectionId)} services`);
  } catch (err) {
    console.error('Teamwork Graph refresh failed', err);
  }
};

// Jira automation action: check the blast radius, comment when something will
// break, and optionally tell the affected teams.
export const automationCheck = async (payload) => {
  const { issueKey, tell } = automationConfig(payload);
  if (!/^[A-Z][A-Z0-9_]+-\d+$/.test(issueKey)) return { errors: [{ message: `Not an issue key: "${issueKey}". Use {{issue.key}}.` }] };
  try {
    const entries = blastRadius((await client().changesForIssue(issueKey)).changes);
    const told = tell ? (await tellTeams(issueKey)).created : [];
    const body = blastComment(entries, told);
    if (body) await jira(route`/rest/api/3/issue/${issueKey}/comment`, { body });
    return { commented: !!body, told: told.length };
  } catch (err) {
    console.error(err);
    return { errors: [{ message: err instanceof LayerError ? failure(err).error.message : `Jira error: ${String(err.message || err).slice(0, 200)}` }] };
  }
};
