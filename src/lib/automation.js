// Jira automation action "Check Layer blast radius": the comment it posts and
// how it reads its configuration.
import { findingLines, summarize } from './format.js';
import { reasonLine, risk } from './risk.js';

export function automationConfig(payload = {}) {
  const src = payload.inputs || payload;
  return {
    issueKey: String(src.issueKey || payload.context?.issue?.key || '').trim().toUpperCase(),
    tell: String(src.tellTeams || '').toLowerCase() === 'yes',
  };
}

// An ADF comment, posted only when something will break.
export function blastComment(entries = [], told = []) {
  const breaking = entries.filter((e) => e.consumers.some((c) => c.severity === 'action'));
  if (!breaking.length) return null;
  const p = (text) => ({ type: 'paragraph', content: [{ type: 'text', text }] });
  const list = (items) => ({ type: 'bulletList', content: items.map((t) => ({ type: 'listItem', content: [p(t)] })) });
  const content = [p(`Layer: ${summarize(entries)}`)];
  for (const e of breaking) {
    content.push(p(`${e.contract} (${e.producer}${e.pr ? ` #${e.pr}` : ''}):`));
    content.push(
      list([
        ...findingLines(e, 3),
        ...e.consumers.map((c) => `${risk(c.severity).label}: ${c.repo} (${c.owners.join(', ') || 'no owners'}). ${reasonLine(c)}`),
      ]),
    );
  }
  if (told.length) content.push(p(`Told: ${told.map((t) => `${t.owner} in ${t.key}`).join(', ')}.`));
  return { type: 'doc', version: 1, content };
}
