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
