import { test } from 'node:test';
import assert from 'node:assert/strict';
import { reasonLine, risk } from '../src/lib/risk.js';

test('risk labels are plain words', () => {
  assert.equal(risk('action').label, 'Will break');
  assert.equal(risk('watch').label, 'Watch on upgrade');
  assert.equal(risk('info').label, 'Informed');
  assert.equal(risk('odd').label, 'Informed');
});

test('reasonLine shortens evidence', () => {
  assert.equal(
    reasonLine({ why: ['package-lock.json pins npm:@fernway/jobs-client 3.4.1, a major behind 4.2.0'] }),
    'Pins @fernway/jobs-client 3.4.1, a major behind 4.2.0',
  );
  assert.equal(reasonLine({ why: ['go.mod pins go:github.com/fernway-test/jobs-api/client'] }), 'Pins jobs-api/client');
  assert.equal(reasonLine({ why: ['layer.yaml consumes jobs-api'] }), 'Declares it uses jobs-api');
  assert.equal(reasonLine({ why: ['layer.yaml'] }), 'Declares it uses this contract');
  assert.equal(reasonLine({ why: ['a.py calls billing-api over HTTP'] }), 'Calls billing-api over HTTP from a.py');
});

test('reasonLine falls back to what the risk means', () => {
  assert.equal(reasonLine({ severity: 'watch', why: [] }), 'Safe on its pinned version; breaks when it upgrades');
  assert.equal(reasonLine({ severity: 'action' }), 'Uses the part that changes');
});
