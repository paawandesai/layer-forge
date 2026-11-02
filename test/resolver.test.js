// Runs the real resolver and Rovo action code with Forge's APIs mocked, so
// import and wiring mistakes (like the Nov 1 constructor crash) fail here.
import { test, mock, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

const store = new Map();
const jiraCalls = [];
let jiraRoutes = {};
let layerBody = { changes: [] };
let layerStatus = 200;

const res = (status, body) => ({
  ok: status >= 200 && status < 300,
  status,
  text: async () => (body === undefined ? '' : typeof body === 'string' ? body : JSON.stringify(body)),
});

mock.module('@forge/api', {
  namedExports: {
    route: (strings, ...values) => strings.reduce((s, part, i) => s + part + (i < values.length ? encodeURIComponent(values[i]) : ''), ''),
    fetch: async (url) => {
      assert.match(url, /^https:\/\/layer\.test\/v1\//);
      return res(layerStatus, layerBody);
    },
    asUser: () => ({
      requestJira: async (path, opts = {}) => {
        const method = opts.method || 'GET';
        jiraCalls.push({ method, path, body: opts.body ? JSON.parse(opts.body) : undefined });
        const hit = Object.entries(jiraRoutes).find(([k]) => `${method} ${path}`.startsWith(k));
        return hit ? res(...hit[1](opts)) : res(404, { errorMessages: ['not found'] });
      },
    }),
  },
});
const graphCalls = [];
mock.module('@forge/teamwork-graph', {
  namedExports: { graph: { setObjects: async (req) => (graphCalls.push(req), { success: true }) } },
});
mock.module('@forge/kvs', {
  namedExports: {
    kvs: { get: async (k) => store.get(k), set: async (k, v) => void store.set(k, v), delete: async (k) => void store.delete(k) },
  },
});

process.env.LAYER_API_URL = 'https://layer.test';
const app = await import('../src/index.js');

const call = (functionKey, { payload, issue, moduleKey = 'app:layer-blast-radius', project } = {}) =>
  app.handler({ call: { functionKey, payload }, context: { moduleKey, extension: { issue, project } } });

const route = (consumer, severity, owners) => ({
  id: 'c1',
  contract: { name: 'jobs-api', repo: 'github.com/fernway-test/jobs-api' },
  class: 'breaking',
  state: 'in_flight',
  change_request: 296,
  ref: 'FERN-1-technician-ids',
  findings: [{ location: 'GET /jobs/{id}', message: "the `/technician_id` response's property type changed from `string` to `integer` for status `200`" }],
  findings_total: 1,
  route: { consumer, severity, owners, edges: [{ evidence: 'go.mod pins go:github.com/fernway-test/jobs-api/client' }] },
});

beforeEach(() => {
  store.clear();
  jiraCalls.length = 0;
  jiraRoutes = {};
  layerStatus = 200;
  layerBody = { changes: [route('github.com/fernway-test/dispatch', 'action', ['@fernway-test/dispatch'])] };
  process.env.LAYER_TOKEN = 'lsite_test';
});

test('getBlastRadius returns the shaped blast radius', async () => {
  const out = await call('getBlastRadius', { issue: { key: 'FERN-1' } });
  assert.equal(out.error, undefined);
  assert.equal(out.entries.length, 1);
  assert.equal(out.entries[0].consumers[0].repo, 'fernway-test/dispatch');
  assert.deepEqual(out.teamsToTell, ['@fernway-test/dispatch']);
  assert.equal(out.routes, 1);
  assert.match(out.summary, /^1 breaking contract change/);
});

test('getBlastRadius reports a missing connection and an unreachable Layer', async () => {
  delete process.env.LAYER_TOKEN;
  assert.equal((await call('getBlastRadius', { issue: { key: 'FERN-1' } })).error.code, 'not_connected');
  process.env.LAYER_TOKEN = 'lsite_test';
  layerStatus = 503;
  layerBody = 'upstream down';
  assert.equal((await call('getBlastRadius', { issue: { key: 'FERN-1' } })).error.status, 503);
});

test('getBlastRadius points a filed task back to its source issue', async () => {
  layerBody = { changes: [] };
  jiraRoutes['GET /rest/api/3/issue/FERN-7'] = () => [
    200,
    { fields: { labels: ['layer-consumer'], issuelinks: [{ type: { name: 'Relates' }, outwardIssue: { key: 'FERN-1' } }] } },
  ];
  const out = await call('getBlastRadius', { issue: { key: 'FERN-7' } });
  assert.equal(out.filedFor, 'FERN-1');
});

test('tellConsumers files once, links it, then comments instead of duplicating', async () => {
  jiraRoutes['POST /rest/api/3/search/jql'] = () => [200, { issues: [] }];
  jiraRoutes['POST /rest/api/3/issue/'] = () => [200, {}];
  jiraRoutes['POST /rest/api/3/issueLink'] = () => [201];
  jiraRoutes['POST /rest/api/3/issue'] = () => [201, { key: 'FERN-9' }];
  const preview = await call('previewTell', { issue: { key: 'FERN-1' } });
  assert.equal(preview.plans[0].action.mode, 'create');
  const out = await call('tellConsumers', { issue: { key: 'FERN-1' }, payload: { dueDate: '2999-01-01' } });
  assert.deepEqual(out.told, { '@fernway-test/dispatch': 'FERN-9' });
  const created = jiraCalls.find((c) => c.method === 'POST' && c.path === '/rest/api/3/issue');
  assert.equal(created.body.fields.duedate, '2999-01-01');
  assert.deepEqual(created.body.fields.labels, ['layer-consumer']);
  assert.ok(jiraCalls.some((c) => c.path === '/rest/api/3/issueLink'));
  // A second click with nothing new to tell does nothing.
  jiraCalls.length = 0;
  assert.deepEqual((await call('tellConsumers', { issue: { key: 'FERN-1' } })).created, []);
  // After the app's memory is lost, the open issue gets a comment.
  store.clear();
  jiraRoutes['POST /rest/api/3/search/jql'] = () => [
    200,
    { issues: [{ key: 'FERN-9', fields: { project: { key: 'FERN' }, summary: 'Prepare fernway-test/dispatch for jobs-api changes in FERN-1' } }] },
  ];
  jiraRoutes['POST /rest/api/3/issue/FERN-9/comment'] = () => [201, {}];
  const again = await call('tellConsumers', { issue: { key: 'FERN-1' } });
  assert.deepEqual(again.created, [{ owner: '@fernway-test/dispatch', key: 'FERN-9', mode: 'comment' }]);
});

test('admin-only resolvers refuse other modules', async () => {
  assert.match((await call('loadDemo')).error.message, /admin page/);
  assert.match((await call('saveSettings', { payload: { teamProjects: 'x' } })).error.message, /admin page/);
  const ok = await call('saveSettings', { moduleKey: 'app:layer-admin', payload: { teamProjects: '@a/b = FERN' } });
  assert.deepEqual(ok, { saved: true, teams: 1 });
});

test('getSetup reports connection and demo state', async () => {
  const out = await call('getSetup', { moduleKey: 'app:layer-admin' });
  assert.deepEqual(out.steps.map((s) => s.status), ['done', 'todo', 'waiting']);
  assert.equal(out.next, 1);
});

test('Rovo actions return text, including on failure', async () => {
  assert.match(await app.getIssueChanges({ issueKey: 'FERN-1' }), /fernway-test\/dispatch \(will break: Pins jobs-api\/client/);
  assert.match(await app.getConsumers({}), /Give the contract name/);
  layerStatus = 500;
  layerBody = { error: 'internal', message: 'boom' };
  assert.match(await app.getIssueChanges({ issueKey: 'FERN-1' }), /^Layer error: /);
});

test('incoming changes for "my team" use the project mapping', async () => {
  await call('saveSettings', { moduleKey: 'app:layer-admin', payload: { teamProjects: '@fernway-test/dispatch = FERN' } });
  const text = await app.getIncomingChanges({ context: { jira: { projectKey: 'FERN' } } });
  assert.match(text, /^@fernway-test\/dispatch \(mapped to FERN\):/);
  assert.match(text, /jobs-api in \[fernway-test\/jobs-api #296\]/);
  assert.match(await app.getIncomingChanges({ project: 'OPS' }), /No code owner teams are mapped to Jira project OPS/);
  assert.match(await app.getIncomingChanges({}), /Jira project key/);
});

test('the Rovo tell action files issues and links them on the site', async () => {
  jiraRoutes['POST /rest/api/3/search/jql'] = () => [200, { issues: [] }];
  jiraRoutes['POST /rest/api/3/issueLink'] = () => [201];
  jiraRoutes['POST /rest/api/3/issue'] = () => [201, { key: 'FERN-9' }];
  jiraRoutes['GET /rest/api/3/serverInfo'] = () => [200, { baseUrl: 'https://x.atlassian.net' }];
  const text = await app.tellConsumersAction({ issueKey: 'fern-1' });
  assert.equal(text, 'Told 1 team about FERN-1:\n- @fernway-test/dispatch: filed [FERN-9](https://x.atlassian.net/browse/FERN-9)');
  assert.match(await app.tellConsumersAction({ issueKey: 'FERN-1' }), /already told about FERN-1: @fernway-test\/dispatch in \[FERN-9\]/);
  assert.match(await app.tellConsumersAction({}), /Give the Jira issue key/);
});

test('Teamwork Graph connection stores the id, syncs services, and forgets on delete', async () => {
  graphCalls.length = 0;
  assert.deepEqual(await app.onGraphConnectionChange({ action: 'CREATED', connectionId: 'conn-1' }), { success: true });
  assert.equal(store.get('graph:connection').connectionId, 'conn-1');
  assert.equal(graphCalls[0].connectionId, 'conn-1');
  assert.deepEqual(graphCalls[0].objects.map((o) => o.id), ['layer:fernway-test/dispatch', 'layer:fernway-test/jobs-api']);
  await app.refreshGraph();
  assert.equal(graphCalls.length, 2);
  await app.onGraphConnectionChange({ action: 'DELETED', connectionId: 'conn-1' });
  assert.equal(store.get('graph:connection'), undefined);
  await app.refreshGraph();
  assert.equal(graphCalls.length, 2);
});
