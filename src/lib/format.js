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
        findings: (c.findings || []).map((f) => `${f.location}: ${f.message}`),
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
      const who = e.consumers.map((c) => `${c.repo} (${c.owners.join(', ') || 'no owners'})`).join(', ');
      const pr = e.pr ? ` in ${e.producer} PR #${e.pr}` : '';
      return `- ${e.contract}${pr}: ${e.class.replace('_', ' ')}, ${e.state.replace('_', ' ')}. Reaches ${who || 'no consumers'}.\n  ${e.findings.slice(0, 3).join('\n  ')}`;
    })
    .join('\n');
}
