import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createClient, layerConfig, LayerError } from '../src/lib/layer.js';

function fakeFetch(status, body, seen) {
  return async (url, init) => {
    seen.push({ url, init });
    return { ok: status < 400, status, text: async () => (typeof body === 'string' ? body : JSON.stringify(body)) };
  };
}

test('sends the token and drops empty params', async () => {
  const seen = [];
  const c = createClient({ baseUrl: 'https://api.test', token: 't0k', fetch: fakeFetch(200, { consumers: [] }, seen) });
  await c.consumers({ name: 'jobs-api', repo: undefined });
  assert.equal(seen[0].url, 'https://api.test/v1/contracts/consumers?name=jobs-api');
  assert.equal(seen[0].init.headers.Authorization, 'Bearer t0k');
});

test('issue lookup uses the issue filter', async () => {
  const seen = [];
  const c = createClient({ baseUrl: 'https://api.test', token: 't', fetch: fakeFetch(200, { changes: [] }, seen) });
  await c.changesForIssue('JOBS-12');
  assert.equal(seen[0].url, 'https://api.test/v1/changes?issue=JOBS-12');
});

test('errors carry the server code', async () => {
  const c = createClient({ baseUrl: 'https://api.test', token: 't', fetch: fakeFetch(404, { error: 'unknown_contract', message: 'no such contract' }, []) });
  await assert.rejects(c.consumers({ name: 'x' }), (e) => e instanceof LayerError && e.status === 404 && e.code === 'unknown_contract');
});

test('no token means not connected, without a request', async () => {
  const seen = [];
  const c = createClient({ baseUrl: 'https://api.test', token: '', fetch: fakeFetch(200, {}, seen) });
  await assert.rejects(c.changes({ owner: '@a/b' }), (e) => e.code === 'not_connected');
  assert.equal(seen.length, 0);
});

test('config defaults to the hosted API and trims slashes', () => {
  assert.deepEqual(layerConfig({}), { baseUrl: 'https://layer-api.fly.dev', token: '' });
  assert.equal(layerConfig({ LAYER_API_URL: 'http://x/' }).baseUrl, 'http://x');
});
