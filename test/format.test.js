import { test } from 'node:test';
import assert from 'node:assert/strict';
import { blastRadius, summarize, consumersText, changesText, shortRepo } from '../src/lib/format.js';

const change = (id, consumer, owners, extra = {}) => ({
  id,
  contract: { repo: 'github.com/fernway-test/jobs-api', name: 'jobs-api' },
  class: 'breaking',
  state: 'in_flight',
  change_request: 7,
  findings: [{ location: 'GET /jobs/{id}', message: "technician_id changed from 'string' to 'integer'" }],
  findings_total: 5,
  route: { consumer, severity: 'action', owners, edges: [{ evidence: 'go.mod pins client v1.8.0' }] },
  ...extra,
});

test('groups routes of one change into one entry', () => {
  const entries = blastRadius([
    change('c1', 'github.com/fernway-test/dispatch', ['@fernway-test/dispatch']),
    change('c1', 'github.com/fernway-test/web', ['@fernway-test/ops-tools']),
  ]);
  assert.equal(entries.length, 1);
  assert.equal(entries[0].producer, 'fernway-test/jobs-api');
  assert.deepEqual(entries[0].consumers.map((c) => c.repo), ['fernway-test/dispatch', 'fernway-test/web']);
});

test('breaking changes sort first', () => {
  const entries = blastRadius([
    change('a', 'github.com/x/y', [], { class: 'compatible', contract: { name: 'aaa' } }),
    change('b', 'github.com/x/y', [], { contract: { name: 'zzz' } }),
  ]);
  assert.deepEqual(entries.map((e) => e.class), ['breaking', 'compatible']);
});

test('summary counts repositories and teams', () => {
  const entries = blastRadius([
    change('c1', 'github.com/fernway-test/dispatch', ['@fernway-test/dispatch']),
    change('c1', 'github.com/fernway-test/web', ['@fernway-test/ops-tools']),
  ]);
  assert.equal(summarize(entries), '1 breaking contract change, reaching 2 consuming repositories owned by 2 teams.');
  assert.match(summarize([]), /No contract changes/);
});

test('consumers text names coverage and evidence', () => {
  const text = consumersText({
    contract: { name: 'jobs-api' },
    consumers: [{ repo: 'github.com/fernway-test/web', confidence: 'high', edges: [{ evidence: 'pins npm:@fernway/jobs-client 4.2.0' }] }],
    coverage: { indexed_repos: 14 },
  });
  assert.match(text, /jobs-api has 1 consumer among 14 indexed repositories/);
  assert.match(text, /fernway-test\/web \(high confidence\): pins/);
  assert.match(consumersText({ contract: { name: 'x' }, consumers: [], coverage: { indexed_repos: 3 } }), /No repository consumes x, among 3/);
});

test('changes text and short repo', () => {
  assert.equal(shortRepo('gitlab.com/a/b'), 'a/b');
  const text = changesText(blastRadius([change('c1', 'github.com/fernway-test/web', ['@fernway-test/ops-tools'])]));
  assert.match(text, /jobs-api in fernway-test\/jobs-api PR #7: breaking, in flight. Reaches fernway-test\/web \(@fernway-test\/ops-tools\)/);
});

test('groupFindings folds one field change across endpoints', async () => {
  const { groupFindings } = await import('../src/lib/format.js');
  const groups = groupFindings([
    { location: 'GET /jobs', message: "the `jobs/items/technician_id` response's property `type` changed from `string` to `integer` for status `200`" },
    { location: 'POST /jobs', message: "the `technician_id` response's property `type` changed from `string` to `integer` for status `201`" },
    { location: 'DELETE /jobs/{id}', message: 'endpoint removed' },
  ]);
  assert.deepEqual(groups, [
    { text: 'technician_id changed from string to integer', locations: ['GET /jobs', 'POST /jobs'] },
    { text: 'endpoint removed', locations: ['DELETE /jobs/{id}'] },
  ]);
});

test('findingLines prefers grouped findings', async () => {
  const { findingLines } = await import('../src/lib/format.js');
  assert.deepEqual(findingLines({ findings: ['a', 'b'], findingGroups: [{ text: 'x changed', locations: ['GET /a', 'GET /b'] }] }), ['x changed (GET /a, GET /b)']);
  assert.deepEqual(findingLines({ findings: ['a', 'b'] }, 1), ['a']);
});
