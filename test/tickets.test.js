import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseTeamProjects, planConsumerIssues } from '../src/lib/tickets.js';

test('parses team to project lines and skips junk', () => {
  assert.deepEqual(parseTeamProjects('# comment\n@Fernway-Test/Dispatch = DISP\nnot a line\n@a/b=WEB\n'), {
    '@fernway-test/dispatch': 'DISP',
    '@a/b': 'WEB',
  });
});

const entry = (contract, consumers) => ({
  contract,
  producer: 'fernway-test/jobs-api',
  pr: 7,
  findings: ["GET /jobs: technician_id changed from 'string' to 'integer'"],
  consumers,
});

test('one issue per breaking team, mapped projects, watch-only consumers skipped', () => {
  const plans = planConsumerIssues({
    issueKey: 'JOBS-12',
    defaultProject: 'JOBS',
    teamProjects: { '@fernway-test/dispatch': 'DISP' },
    entries: [
      entry('jobs-api', [
        { repo: 'fernway-test/dispatch', severity: 'action', owners: ['@fernway-test/dispatch'], why: ['go.mod pins client'] },
        { repo: 'fernway-test/web', severity: 'action', owners: ['@fernway-test/ops-tools'], why: [] },
        { repo: 'fernway-test/mobile-tech', severity: 'watch', owners: ['@fernway-test/mobile'], why: [] },
      ]),
      entry('job-events', [{ repo: 'fernway-test/dispatch', severity: 'action', owners: ['@fernway-test/dispatch'], why: [] }]),
    ],
  });
  assert.deepEqual(
    plans.map((p) => [p.owner, p.project]),
    [
      ['@fernway-test/dispatch', 'DISP'],
      ['@fernway-test/ops-tools', 'JOBS'],
    ],
  );
  assert.equal(plans[0].summary, 'Prepare fernway-test/dispatch for jobs-api, job-events changes in JOBS-12');
  assert.equal(plans[0].description.type, 'doc');
  assert.match(JSON.stringify(plans[0].description), /Why fernway-test\/dispatch is affected: go.mod pins client/);
});

test('nothing breaking means nothing to file', () => {
  const plans = planConsumerIssues({
    issueKey: 'X-1',
    defaultProject: 'X',
    entries: [entry('a', [{ repo: 'r', severity: 'watch', owners: ['@t'], why: [] }])],
  });
  assert.equal(plans.length, 0);
});

test('teams for a project come from the mapping', async () => {
  const { teamsForProject } = await import('../src/lib/tickets.js');
  const map = parseTeamProjects('@a/web = WEB\n@a/admin = WEB\n@a/dispatch = DISP');
  assert.deepEqual(teamsForProject(map, 'WEB'), ['@a/web', '@a/admin']);
  assert.deepEqual(teamsForProject(map, 'NONE'), []);
});

test('filedFor finds the issue a consumer task was filed for', async () => {
  const { filedFor } = await import('../src/lib/tickets.js');
  const link = { type: { name: 'Relates' }, outwardIssue: { key: 'FERN-1' } };
  assert.equal(filedFor({ fields: { labels: ['layer-consumer'], issuelinks: [link] } }), 'FERN-1');
  assert.equal(filedFor({ fields: { labels: [], issuelinks: [link] } }), null);
  assert.equal(filedFor({ fields: { labels: ['layer-consumer'], issuelinks: [] } }), null);
});

import { adfLines, chooseAction, dueDate } from '../src/lib/tickets.js';

test('adfLines flattens a filed description for preview', () => {
  const [plan] = planConsumerIssues({
    issueKey: 'JOBS-12',
    defaultProject: 'JOBS',
    entries: [entry('jobs-api', [{ repo: 'fernway-test/web', severity: 'action', owners: ['@t/ops'], why: ['pins client'] }])],
  });
  const lines = adfLines(plan.description);
  assert.match(lines[0], /^JOBS-12 changes jobs-api/);
  assert.ok(lines.some((l) => l.startsWith('• ') && l.includes('technician_id')));
  assert.ok(lines.includes('• Why fernway-test/web is affected: pins client'));
  assert.deepEqual(plan.repos, ['fernway-test/web']);
});

test('chooseAction comments on an open Layer issue for the same repos in the same project', () => {
  const plan = { project: 'OPS', repos: ['fernway-test/web'] };
  assert.deepEqual(chooseAction(plan, [{ key: 'OPS-3', project: 'OPS', summary: 'Prepare fernway-test/web for jobs-api changes in JOBS-12' }]), {
    mode: 'comment',
    target: 'OPS-3',
  });
  assert.deepEqual(chooseAction(plan, [{ key: 'DISP-3', project: 'DISP', summary: 'Prepare fernway-test/web for x' }]), { mode: 'create' });
  assert.deepEqual(chooseAction(plan, []), { mode: 'create' });
});

test('dueDate accepts today or later in yyyy-mm-dd', () => {
  const today = new Date('2026-11-02T10:00:00Z');
  assert.equal(dueDate('2026-11-20', today), '2026-11-20');
  assert.equal(dueDate('2026-11-02', today), '2026-11-02');
  assert.equal(dueDate('2026-10-01', today), null);
  assert.equal(dueDate('next week', today), null);
  assert.equal(dueDate('', today), null);
});
