import { test } from 'node:test';
import assert from 'node:assert/strict';
import { riskOverview } from '../src/lib/overview.js';

const e = (id, cls, state, issue, consumers) => ({ id, contract: id, producer: 'p', pr: 1, class: cls, state, issue, consumers });

test('riskOverview counts breaking in-flight changes and teams not told', () => {
  const entries = [
    e('a', 'breaking', 'in_flight', 'FERN-1', [
      { repo: 'dispatch', severity: 'action', owners: ['@t/dispatch'] },
      { repo: 'web', severity: 'action', owners: ['@t/ops'] },
      { repo: 'mobile', severity: 'watch', owners: ['@t/mobile'] },
    ]),
    e('b', 'breaking', 'merged', 'FERN-2', [{ repo: 'web', severity: 'action', owners: ['@t/ops'] }]),
    e('c', 'compatible', 'in_flight', '', []),
  ];
  const o = riskOverview(entries, { 'FERN-1': { '@t/dispatch': 'FERN-7' } });
  assert.equal(o.breaking, 1);
  assert.equal(o.inFlight, 2);
  assert.deepEqual(o.rows[0].waiting, ['@t/ops']);
  assert.equal(o.rows[0].willBreak, 2);
  assert.equal(o.headline, '1 breaking change in flight, reaching 2 teams; 1 not told yet.');
});

test('riskOverview with nothing breaking', () => {
  assert.equal(riskOverview([e('c', 'compatible', 'in_flight', '', [])]).headline, 'No breaking contract changes in flight, 1 compatible.');
  assert.equal(riskOverview([]).headline, 'No breaking contract changes in flight.');
});
