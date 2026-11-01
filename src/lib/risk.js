// Plain words for how a change reaches each consumer, and why.

export const RISK = {
  action: { label: 'Will break', appearance: 'removed', fallback: 'Uses the part that changes' },
  watch: { label: 'Watch on upgrade', appearance: 'moved', fallback: 'Safe on its pinned version; breaks when it upgrades' },
  info: { label: 'Informed', appearance: 'default', fallback: 'Uses this contract, but not the part that changes' },
};

export function risk(severity) {
  return RISK[severity] || RISK.info;
}

// One short line from the first piece of evidence Layer gave, e.g.
// "package-lock.json pins npm:@fernway/jobs-client 3.4.1, a major behind 4.2.0"
// becomes "pins @fernway/jobs-client 3.4.1, a major behind 4.2.0".
export function reasonLine(consumer = {}) {
  const ev = String((consumer.why || []).find(Boolean) || '').trim();
  if (!ev) return risk(consumer.severity).fallback;
  if (ev === 'layer.yaml') return 'Declares it uses this contract';
  let m = ev.match(/^(?:\S+ )?pins (?:[a-z]+:)?(\S+)(.*)$/);
  if (m) return `Pins ${shortPackage(m[1])}${m[2]}`;
  m = ev.match(/^layer\.yaml consumes (.+)$/);
  if (m) return `Declares it uses ${m[1]}`;
  m = ev.match(/^(\S+) calls (.+)$/);
  if (m) return `Calls ${m[2]} from ${m[1]}`;
  return ev.replace(/^[a-z]+:/, '');
}

// Go modules are long paths; the last two segments name them well enough.
function shortPackage(p) {
  return p.includes('/') && !p.startsWith('@') ? p.split('/').slice(-2).join('/') : p;
}
