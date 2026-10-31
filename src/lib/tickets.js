// Turns a blast radius into one Jira issue per affected owner team.

// Parses admin settings lines such as "@fernway-test/dispatch = DISP".
export function parseTeamProjects(text = '') {
  const map = {};
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const m = line.match(/^(@\S+)\s*=\s*([A-Z][A-Z0-9_]+)$/);
    if (m) map[m[1].toLowerCase()] = m[2];
  }
  return map;
}

function text(t) {
  return { type: 'text', text: t };
}
function para(...content) {
  return { type: 'paragraph', content };
}
function bullets(items) {
  return { type: 'bulletList', content: items.map((i) => ({ type: 'listItem', content: [para(text(i))] })) };
}

// Only consumers that will break (severity "action") get an issue. A team
// that owns several affected repositories gets one issue covering all.
export function planConsumerIssues({ issueKey, entries, teamProjects = {}, defaultProject }) {
  const byTeam = new Map();
  for (const e of entries) {
    for (const c of e.consumers) {
      if (c.severity !== 'action') continue;
      for (const owner of c.owners.length ? c.owners : ['(no owner)']) {
        if (!byTeam.has(owner)) byTeam.set(owner, []);
        byTeam.get(owner).push({ entry: e, consumer: c });
      }
    }
  }
  return [...byTeam.entries()].map(([owner, items]) => {
    const contracts = [...new Set(items.map((i) => i.entry.contract))];
    const repos = [...new Set(items.map((i) => i.consumer.repo))];
    const body = [
      para(text(`${issueKey} changes ${contracts.join(', ')} in a way Layer expects to break ${repos.join(', ')}, owned by ${owner}.`)),
    ];
    for (const { entry, consumer } of items) {
      body.push(para(text(`${entry.contract} (${entry.producer}${entry.pr ? ` PR #${entry.pr}` : ''}) in ${consumer.repo}:`)));
      const lines = [...entry.findings.slice(0, 5), ...consumer.why.map((w) => `Why ${consumer.repo} is affected: ${w}`)];
      if (lines.length) body.push(bullets(lines));
    }
    return {
      owner,
      project: teamProjects[owner.toLowerCase()] || defaultProject,
      summary: `Prepare ${repos.join(', ')} for ${contracts.join(', ')} changes in ${issueKey}`.slice(0, 250),
      description: { type: 'doc', version: 1, content: body },
    };
  });
}
