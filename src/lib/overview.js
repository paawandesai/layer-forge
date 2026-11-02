// The dashboard gadget's summary: breaking changes in flight across the
// teams this site maps, and which teams have not been told yet.

// entries: blastRadius() output (with .issue from the branch).
// told: { [issueKey]: { [owner]: filedKey } }
export function riskOverview(entries = [], told = {}) {
  const inFlight = entries.filter((e) => e.state !== 'merged');
  const breaking = inFlight.filter((e) => e.class === 'breaking');
  const waiting = [];
  const reached = new Set();
  for (const e of breaking) {
    for (const c of e.consumers) {
      if (c.severity !== 'action') continue;
      for (const owner of c.owners) {
        reached.add(owner);
        const done = e.issue && told[e.issue]?.[owner];
        if (!done && !waiting.some((w) => w.team === owner && w.id === e.id)) {
          waiting.push({ team: owner, id: e.id, contract: e.contract, issue: e.issue || '', repo: c.repo });
        }
      }
    }
  }
  const rows = breaking.map((e) => ({
    id: e.id,
    contract: e.contract,
    producer: e.producer,
    pr: e.pr,
    issue: e.issue || '',
    willBreak: e.consumers.filter((c) => c.severity === 'action').length,
    waiting: waiting.filter((w) => w.id === e.id).map((w) => w.team),
  }));
  const headline = breaking.length
    ? `${breaking.length} breaking change${breaking.length === 1 ? '' : 's'} in flight, reaching ${reached.size} team${reached.size === 1 ? '' : 's'}; ${new Set(waiting.map((w) => w.team)).size} not told yet.`
    : `No breaking contract changes in flight${inFlight.length ? `, ${inFlight.length} compatible` : ''}.`;
  return { headline, breaking: breaking.length, inFlight: inFlight.length, rows, waiting };
}
