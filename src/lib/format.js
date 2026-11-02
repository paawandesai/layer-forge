import { reasonLine, risk, riskLabel } from './risk.js';

// Pure shaping of Layer responses for the issue panel and Rovo answers.

const CLASS_ORDER = { breaking: 0, possibly_breaking: 1, compatible: 2 };

export function shortRepo(repo = '') {
  return repo.replace(/^(github\.com|gitlab\.com)\//, '');
}

// Groups routed changes (one row per change and consumer) into one entry
// per contract change, each with the consumers it reaches.
export function blastRadius(changes = []) {
  const byId = new Map();
  for (const c of changes) {
    let entry = byId.get(c.id);
    if (!entry) {
      entry = {
        id: c.id,
        contract: c.contract?.name || '',
        producer: shortRepo(c.contract?.repo),
        class: c.class || 'compatible',
        state: c.state || '',
        pr: c.change_request,
        issue: issueKeyIn(c.ref),
        risk: c.risk && c.risk.name ? { level: c.risk.level, name: c.risk.name, reason: c.risk.reason || '' } : null,
        findings: (c.findings || []).map((f) => `${f.location}: ${f.message}`),
        findingGroups: groupFindings(c.findings || []),
        findingsTotal: c.findings_total ?? (c.findings || []).length,
        consumers: [],
      };
      byId.set(c.id, entry);
    }
    if (c.route?.consumer) {
      entry.consumers.push({
        repo: shortRepo(c.route.consumer),
        severity: c.route.severity || 'info',
        owners: c.route.owners || [],
        why: (c.route.edges || []).map((e) => e.evidence),
      });
    }
  }
  return [...byId.values()].sort(
    (a, b) => (CLASS_ORDER[a.class] ?? 9) - (CLASS_ORDER[b.class] ?? 9) || a.contract.localeCompare(b.contract),
  );
}

// One finding per endpoint repeats the same field change many times. Groups
// findings whose message matches once the status code and the field's parent
// path are dropped, and strips the backticks the checker quotes values with.
export function groupFindings(findings = []) {
  const groups = new Map();
  for (const f of findings) {
    const text = String(f.message || '')
      .replace(/\s+for status `?\d{3}`?/g, '')
      .replace(/`([^`]*)`/g, (_, v) => v.split('/').pop())
      .replace(/^the /, '')
      .replace(/^(\S+) (?:request|response)'s property type changed from (\S+) to (\S+)$/, '$1 changed from $2 to $3');
    const key = text;
    let g = groups.get(key);
    if (!g) groups.set(key, (g = { text, locations: [] }));
    if (f.location && !g.locations.includes(f.location)) g.locations.push(f.location);
  }
  return [...groups.values()];
}

// Readable finding lines: grouped when available, raw otherwise.
export function findingLines(entry, limit = 5) {
  const groups = entry.findingGroups;
  const lines = groups?.length
    ? groups.map((g) => (g.locations.length ? `${g.text} (${g.locations.join(', ')})` : g.text))
    : entry.findings || [];
  return lines.slice(0, limit);
}

export function prUrl(producer, pr) {
  return producer && pr ? `https://github.com/${producer}/pull/${pr}` : '';
}

export function summarize(entries) {
  const breaking = entries.filter((e) => e.class === 'breaking');
  const teams = new Set(entries.flatMap((e) => e.consumers.flatMap((c) => c.owners)));
  const repos = new Set(entries.flatMap((e) => e.consumers.map((c) => c.repo)));
  if (entries.length === 0) return 'No contract changes in the pull requests linked to this issue.';
  const head = breaking.length
    ? `${breaking.length} breaking contract change${breaking.length === 1 ? '' : 's'}`
    : `${entries.length} contract change${entries.length === 1 ? '' : 's'}, none breaking`;
  return `${head}, reaching ${repos.size} consuming repositor${repos.size === 1 ? 'y' : 'ies'} owned by ${teams.size} team${teams.size === 1 ? '' : 's'}.`;
}

// Plain text for a Rovo answer about a contract's consumers.
export function consumersText(body) {
  const name = body.contract?.name || 'this contract';
  const list = body.consumers || [];
  const indexed = body.coverage?.indexed_repos;
  if (list.length === 0) {
    return `No repository consumes ${name}${indexed ? `, among ${indexed} indexed repositories` : ''}.`;
  }
  const lines = list.map(
    (c) => `- ${shortRepo(c.repo)} (${c.confidence} confidence): ${(c.edges || []).map((e) => e.evidence).join('; ')}`,
  );
  return [`${name} has ${list.length} consumer${list.length === 1 ? '' : 's'}${indexed ? ` among ${indexed} indexed repositories` : ''}:`, ...lines].join('\n');
}

export function changesText(entries) {
  if (entries.length === 0) return 'No contract changes found.';
  return entries
    .map((e) => {
      const who = e.consumers
        .map((c) => `${c.repo} (${risk(c.severity).label.toLowerCase()}: ${reasonLine(c)}; ${c.owners.join(', ') || 'no owners'})`)
        .join(', ');
      const url = prUrl(e.producer, e.pr);
      const pr = e.pr ? ` in [${e.producer} #${e.pr}](${url})` : '';
      const level = e.risk ? ` ${riskLabel(e.risk)} (${e.risk.reason}).` : '';
      return `- ${e.contract}${pr}: ${e.class.replace('_', ' ')}, ${e.state.replace('_', ' ')}.${level} Reaches ${who || 'no consumers'}.\n  ${findingLines(e, 3).join('\n  ')}`;
    })
    .join('\n');
}

// The Jira issue key a branch names, e.g. "FERN-1-technician-ids" -> "FERN-1".
export function issueKeyIn(ref = '') {
  const m = String(ref || '').match(/(?:^|[^A-Za-z0-9])([A-Za-z][A-Za-z0-9]+-\d+)(?![0-9])/);
  return m ? m[1].toUpperCase() : '';
}

// Incoming changes for a project, one group per mapped team, each change
// keeping only that team's consumers. Teams with nothing incoming are kept
// so the page can say so.
export function groupIncoming(entries = [], teams = []) {
  return teams.map((team) => {
    const changes = entries
      .map((e) => ({ ...e, consumers: e.consumers.filter((c) => c.owners.includes(team)) }))
      .filter((e) => e.consumers.length);
    const breaking = changes.filter((e) => e.consumers.some((c) => c.severity === 'action')).length;
    const summary = changes.length
      ? `${changes.length} incoming change${changes.length === 1 ? '' : 's'}, ${breaking ? `${breaking} will break ${team}'s code` : 'none breaking'}.`
      : 'Nothing incoming.';
    return { team, changes, breaking, summary };
  });
}
