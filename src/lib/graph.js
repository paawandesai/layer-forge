// Teamwork Graph objects for Layer's view of a site's services: one software
// service per repository, linked to the services it consumes and to the Jira
// issues whose pull requests change it. Pure, so the shapes are tested.
import { issueKeyIn, shortRepo } from './format.js';

const SERVICE = 'atlassian:software-service';
const id = (repo) => `layer:${shortRepo(repo)}`;
const url = (repo) => `https://github.com/${shortRepo(repo)}`;

export function graphObjects(changes = [], now = new Date().toISOString()) {
  const services = new Map();
  const get = (repo) => {
    const key = shortRepo(repo);
    if (!services.has(key)) services.set(key, { repo: key, calls: new Set(), issues: new Set(), contracts: new Set(), owners: new Set() });
    return services.get(key);
  };
  for (const c of changes) {
    const producer = c.contract?.repo;
    if (!producer) continue;
    const p = get(producer);
    if (c.contract?.name) p.contracts.add(c.contract.name);
    const key = issueKeyIn(c.ref);
    if (key) p.issues.add(key);
    if (c.route?.consumer) {
      const consumer = get(c.route.consumer);
      consumer.calls.add(shortRepo(producer));
      for (const o of c.route.owners || []) consumer.owners.add(o);
    }
  }
  const seq = Date.parse(now);
  return [...services.values()]
    .sort((a, b) => a.repo.localeCompare(b.repo))
    .map((s) => {
      const set = [];
      if (s.issues.size) set.push({ associationType: 'issueIdOrKeys', values: [...s.issues].sort() });
      if (s.calls.size) set.push({ associationType: SERVICE, values: [...s.calls].sort().map((r) => ({ entityId: id(r) })) });
      const description = [
        s.contracts.size ? `Publishes ${[...s.contracts].sort().join(', ')}.` : '',
        s.calls.size ? `Uses ${[...s.calls].sort().join(', ')}.` : '',
        s.owners.size ? `Owned by ${[...s.owners].sort().join(', ')}.` : '',
      ]
        .filter(Boolean)
        .join(' ');
      return {
        schemaVersion: '2.0',
        id: id(s.repo),
        updateSequenceNumber: seq,
        displayName: s.repo.split('/').pop(),
        description: description || 'Repository known to Layer.',
        url: url(s.repo),
        createdAt: now,
        lastUpdatedAt: now,
        permissions: [{ accessControls: [{ principals: [{ type: 'ATLASSIAN_WORKSPACE' }] }] }],
        ...(set.length ? { associations: { lastUpdatedAt: now, set } } : {}),
        [SERVICE]: {
          serviceType: s.contracts.size ? 'API' : 'Service',
          tags: ['layer', ...[...s.contracts].sort()].slice(0, 20),
          ...(s.calls.size ? { associationsMetadata: Object.fromEntries([...s.calls].map((r) => [id(r), [{ associationType: 'CALLS' }]])) } : {}),
        },
      };
    });
}
