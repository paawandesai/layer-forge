import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setupSteps } from '../src/lib/setup.js';

const all = ['FERN-1', 'FERN-2', 'FERN-3', 'FERN-4', 'FERN-5', 'FERN-6'];

test('fresh site: connect first, others wait', () => {
  const { steps, next } = setupSteps({ connection: { error: { code: 'not_connected' } }, demo: { exists: false } });
  assert.deepEqual(steps.map((s) => s.status), ['todo', 'waiting', 'waiting']);
  assert.equal(next, 0);
  assert.equal(steps[2].href, '');
});

test('connected, no demo: load is next', () => {
  const { steps, next } = setupSteps({ connection: { ok: true }, demo: { exists: false } });
  assert.deepEqual(steps.map((s) => s.status), ['done', 'todo', 'waiting']);
  assert.equal(next, 1);
});

test('partial demo names the missing keys', () => {
  const { steps } = setupSteps({ connection: { ok: true }, demo: { exists: true, keys: all.slice(0, 4) } });
  assert.match(steps[1].body, /FERN-5, FERN-6/);
});

test('ready: open FERN-1 with its breaking count', () => {
  const { steps, next } = setupSteps({ connection: { ok: true, breaking: 5 }, demo: { exists: true, keys: all } });
  assert.equal(next, 2);
  assert.equal(steps[2].href, '/browse/FERN-1');
  assert.match(steps[2].body, /5 breaking contract changes/);
});
