import { test } from 'node:test';
import assert from 'node:assert/strict';
import { emptyView, errorView, partialNote } from '../src/lib/states.js';

test('errorView covers each failure kind', () => {
  assert.equal(errorView({ code: 'not_connected' }).kind, 'not_connected');
  assert.equal(errorView({ code: 'not_connected' }).retry, false);
  assert.equal(errorView({ status: 401, code: 'unauthorized' }).kind, 'refused');
  assert.equal(errorView({ status: 403 }).kind, 'refused');
  assert.equal(errorView({ status: 429 }).retry, true);
  assert.equal(errorView({ code: 'internal', message: 'x' }).kind, 'unreachable');
  assert.equal(errorView({ status: 502 }).kind, 'unreachable');
  assert.equal(errorView({ code: 'jira', message: 'Jira answered 400' }).body, 'Jira answered 400');
  assert.equal(errorView({ code: 'no_issue', message: 'Open an issue' }).body, 'Open an issue');
  assert.equal(errorView().kind, 'unreachable');
});

test('emptyView names the issue key and how to link a pull request', () => {
  const v = emptyView('FERN-9');
  assert.equal(v.title, 'No contract changes');
  assert.match(v.body, /FERN-9/);
  assert.match(v.body, /feature\/FERN-9-/);
});

test('partialNote reports trimmed findings and the route limit', () => {
  assert.equal(partialNote([{ findingsTotal: 3, findings: [1, 2, 3] }]), '');
  assert.equal(partialNote([{ findingsTotal: 5, findings: [1, 2] }]), '3 more findings are on the pull requests.');
  assert.equal(partialNote([{ findingsTotal: 2, findings: [1] }]), '1 more finding is on the pull requests.');
  assert.match(partialNote([], { routes: 200 }), /newest 200 routes/);
});
