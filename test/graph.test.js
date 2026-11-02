import { test } from 'node:test';
import assert from 'node:assert/strict';
import { graphObjects } from '../src/lib/graph.js';

const change = (consumer, owners) => ({
  id: 'c1',
  contract: { name: 'jobs-api', repo: 'github.com/fernway-test/jobs-api' },
  ref: 'FERN-1-technician-id-int',
  route: { consumer, owners },
});

test('graphObjects makes one service per repository with calls and issue links', () => {
  const now = '2026-11-02T00:00:00.000Z';
  const objs = graphObjects([change('github.com/fernway-test/web', ['@fernway-test/ops-tools']), change('github.com/fernway-test/dispatch', [])], now);
  assert.deepEqual(objs.map((o) => o.id), ['layer:fernway-test/dispatch', 'layer:fernway-test/jobs-api', 'layer:fernway-test/web']);
  const jobs = objs[1];
  assert.equal(jobs.displayName, 'jobs-api');
  assert.equal(jobs.url, 'https://github.com/fernway-test/jobs-api');
  assert.deepEqual(jobs.associations.set, [{ associationType: 'issueIdOrKeys', values: ['FERN-1'] }]);
  assert.equal(jobs['atlassian:software-service'].serviceType, 'API');
  assert.equal(jobs.description, 'Publishes jobs-api.');
  const web = objs[2];
  assert.deepEqual(web.associations.set, [{ associationType: 'atlassian:software-service', values: [{ entityId: 'layer:fernway-test/jobs-api' }] }]);
  assert.equal(web.description, 'Uses fernway-test/jobs-api. Owned by @fernway-test/ops-tools.');
  assert.deepEqual(web['atlassian:software-service'].associationsMetadata, { 'layer:fernway-test/jobs-api': [{ associationType: 'CALLS' }] });
  assert.equal(web.updateSequenceNumber, Date.parse(now));
  assert.deepEqual(web.permissions, [{ accessControls: [{ principals: [{ type: 'ATLASSIAN_WORKSPACE' }] }] }]);
});

test('graphObjects ignores rows without a producer', () => {
  assert.deepEqual(graphObjects([{ id: 'x' }]), []);
});
