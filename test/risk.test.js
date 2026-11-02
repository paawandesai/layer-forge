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

import { riskAppearance, riskLabel } from '../src/lib/risk.js';
import { blastRadius, changesText } from '../src/lib/format.js';

test('risk level labels and colors', () => {
  assert.equal(riskLabel({ name: 'critical' }), 'Critical risk');
  assert.equal(riskLabel(null), '');
  assert.equal(riskAppearance({ name: 'high' }), 'removed');
  assert.equal(riskAppearance({ name: 'moderate' }), 'moved');
  assert.equal(riskAppearance({}), 'default');
});

test('risk is optional on changes and appears in agent text', () => {
  const base = { id: 'a', contract: { name: 'jobs-api', repo: 'github.com/fernway-test/jobs-api' }, class: 'breaking', state: 'in_flight' };
  assert.equal(blastRadius([base])[0].risk, null);
  const [e] = blastRadius([{ ...base, risk: { level: 1, name: 'critical', reason: 'Definitely breaking, not merged yet' } }]);
  assert.deepEqual(e.risk, { level: 1, name: 'critical', reason: 'Definitely breaking, not merged yet' });
  assert.match(changesText([e]), /in flight\. Critical risk \(Definitely breaking, not merged yet\)\./);
});
