import Resolver from '@forge/resolver';
import { fetch } from '@forge/api';
import { createClient, layerConfig, LayerError } from './lib/layer.js';
import { blastRadius, summarize, consumersText, changesText } from './lib/format.js';

const client = () => createClient({ ...layerConfig(), fetch });

function failure(err) {
  if (err instanceof LayerError) return { error: { code: err.code, status: err.status, message: err.message } };
  console.error(err);
  return { error: { code: 'internal', message: 'Layer could not be reached. Try again in a minute.' } };
}

const resolver = new Resolver();

// Issue panel: the contract changes in this issue's pull requests.
resolver.define('getBlastRadius', async (req) => {
  const issueKey = req.context?.extension?.issue?.key;
  if (!issueKey) return { error: { code: 'no_issue', message: 'Open an issue to see its blast radius.' } };
  try {
    const body = await client().changesForIssue(issueKey);
    const entries = blastRadius(body.changes);
    return { issueKey, summary: summarize(entries), entries };
  } catch (err) {
    return failure(err);
  }
});

export const handler = resolver.getDefinitions();

// Rovo actions (also the MCP tools). Each returns text for the agent.
const asText = (fn) => async (payload) => {
  try {
    return await fn(payload);
  } catch (err) {
    return `Layer error: ${failure(err).error.message}`;
  }
};

export const getConsumers = asText(async ({ contract, repo }) => consumersText(await client().consumers({ name: contract, repo })));

export const getIncomingChanges = asText(async ({ repo, owner }) => {
  if (!repo && !owner) return 'Give a consuming repository (owner/name) or an owner handle such as @acme/web-team.';
  const r = repo && !repo.includes('.') ? `github.com/${repo}` : repo;
  return changesText(blastRadius((await client().changes({ repo: r, owner })).changes));
});

export const getIssueChanges = asText(async (payload) => {
  const issueKey = payload.issueKey || payload.context?.jira?.issueKey;
  if (!issueKey) return 'Give a Jira issue key such as JOBS-12.';
  const entries = blastRadius((await client().changesForIssue(issueKey)).changes);
  return `${summarize(entries)}\n${changesText(entries)}`;
});
