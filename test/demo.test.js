import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEMO_ISSUES, demoKeys, demoTeamProjects } from '../src/lib/demo.js';
import { parseTeamProjects } from '../src/lib/tickets.js';

test('demo keys run FERN-1 upward, one per issue', () => {
  assert.equal(demoKeys().length, DEMO_ISSUES.length);
  assert.equal(demoKeys()[0], 'FERN-1');
});

test('demo team mapping parses', () => {
  const map = parseTeamProjects(demoTeamProjects());
  assert.equal(map['@fernway-test/dispatch'], 'FERN');
  assert.equal(Object.keys(map).length, 5);
});

import { demoFailure, demoReport, pickIssueType, planDemo } from '../src/lib/demo.js';

test('pickIssueType prefers Task, then Story, then any standard type', () => {
  assert.equal(pickIssueType([{ name: 'Bug' }, { name: 'Task' }]), 'Task');
  assert.equal(pickIssueType([{ name: 'Sub-task', subtask: true }, { name: 'Story' }, { name: 'Bug' }]), 'Story');
  assert.equal(pickIssueType([{ name: 'Sub-task', subtask: true }, { name: 'Epic' }, { name: 'Work item' }]), 'Work item');
  assert.equal(pickIssueType([]), null);
});

test('planDemo creates all on a fresh project and the rest on a partial one', () => {
  assert.equal(planDemo({ nextNumber: 1 }).create.length, 6);
  const p = planDemo({ existingKeys: ['FERN-2', 'FERN-1'], nextNumber: 3 });
  assert.deepEqual(p.create.map((c) => c.key), ['FERN-3', 'FERN-4', 'FERN-5', 'FERN-6']);
  assert.deepEqual(p.kept, ['FERN-1', 'FERN-2']);
  assert.equal(p.create[0].summary, 'Rename eta to eta_at in the job-assigned event');
  assert.deepEqual(planDemo({ existingKeys: ['FERN-1', 'FERN-2', 'FERN-3', 'FERN-4', 'FERN-5', 'FERN-6'] }).create, []);
});

test('planDemo refuses a FERN project with other issues or a numbering gap', () => {
  assert.match(planDemo({ existingKeys: ['FERN-1', 'FERN-7'] }).error, /already has other issues/);
  assert.match(planDemo({ existingKeys: ['FERN-3'] }).error, /already has other issues/);
  assert.match(planDemo({ existingKeys: [], nextNumber: 9 }).error, /FERN-9, not FERN-1/);
});

test('demo failures and reports read plainly', () => {
  assert.match(demoFailure(403, ''), /Jira administrator/);
  assert.match(demoFailure(500, 'boom'), /500: boom/);
  assert.equal(
    demoReport({ created: ['FERN-1'], kept: [], mapped: true, issueType: 'Story' }),
    'Created FERN-1 in FERN as Story issues. Mapped the five Fernway teams to FERN, so "Tell teams" files their issues there.',
  );
  assert.equal(demoReport({ kept: ['FERN-1'] }), 'FERN-1 was already there.');
});

import { isDemoData } from '../src/lib/demo.js';

test('isDemoData recognizes Fernway results only', () => {
  assert.equal(isDemoData([{ producer: 'fernway-test/jobs-api' }]), true);
  assert.equal(isDemoData([{ producer: 'fernway-test/jobs-api' }, { producer: 'acme/orders' }]), false);
  assert.equal(isDemoData([]), false);
});

test('reloading after Tell filed FERN-7 and on keeps the six demo issues', () => {
  const plan = planDemo({ existingKeys: ['FERN-1', 'FERN-2', 'FERN-3', 'FERN-4', 'FERN-5', 'FERN-6', 'FERN-7', 'FERN-11'] });
  assert.equal(plan.error, undefined);
  assert.deepEqual(plan.create, []);
  assert.equal(plan.kept.length, 6);
});
