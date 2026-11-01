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
