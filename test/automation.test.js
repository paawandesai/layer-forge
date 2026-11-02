import { test } from 'node:test';
import assert from 'node:assert/strict';
import { automationConfig, blastComment } from '../src/lib/automation.js';

test('automationConfig reads inputs flat or nested', () => {
  assert.deepEqual(automationConfig({ issueKey: 'fern-1', tellTeams: 'yes' }), { issueKey: 'FERN-1', tell: true });
  assert.deepEqual(automationConfig({ inputs: { issueKey: 'FERN-2' } }), { issueKey: 'FERN-2', tell: false });
  assert.deepEqual(automationConfig({ context: { issue: { key: 'FERN-3' } } }), { issueKey: 'FERN-3', tell: false });
});

test('blastComment only when something breaks', () => {
  const entry = {
    contract: 'jobs-api',
    producer: 'fernway-test/jobs-api',
    pr: 296,
    class: 'breaking',
    findingGroups: [{ text: 'technician_id changed from string to integer', locations: ['GET /jobs'] }],
    consumers: [{ repo: 'fernway-test/dispatch', severity: 'action', owners: ['@t/dispatch'], why: ['layer.yaml consumes jobs-api'] }],
  };
  const doc = blastComment([entry], [{ owner: '@t/dispatch', key: 'FERN-9' }]);
  const text = JSON.stringify(doc);
  assert.match(text, /Layer: 1 breaking contract change/);
  assert.match(text, /Will break: fernway-test\/dispatch \(@t\/dispatch\). Declares it uses jobs-api/);
  assert.match(text, /Told: @t\/dispatch in FERN-9/);
  assert.equal(blastComment([{ ...entry, consumers: [{ ...entry.consumers[0], severity: 'watch' }] }]), null);
});
