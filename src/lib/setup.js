// The admin page's first-run checklist: three steps, each with a live status.
import { errorView } from './states.js';
import { DEMO_PROJECT, demoKeys } from './demo.js';

// connection: { ok: true, changes } or { error }
// demo: { exists, keys: [...existing issue keys] }
export function setupSteps({ connection = {}, demo = {} } = {}) {
  const connected = !!connection.ok;
  const want = demoKeys();
  const have = new Set(demo.keys || []);
  const loaded = demo.exists && want.every((k) => have.has(k));
  const first = want[0];
  const breaking = connection.breaking ?? 0;

  const steps = [
    connected
      ? { title: 'Connected to Layer', status: 'done', body: 'This site reads Layer with a read-only connection.' }
      : { title: 'Connect to Layer', status: 'todo', body: errorView(connection.error).body },
    loaded
      ? { title: 'Fernway demo loaded', status: 'done', body: `Project ${DEMO_PROJECT.key} has the six demo issues.` }
      : {
          title: 'Load the Fernway demo',
          status: connected ? 'todo' : 'waiting',
          body: demo.exists
            ? `Project ${DEMO_PROJECT.key} exists but is missing ${want.filter((k) => !have.has(k)).join(', ')}. Load the demo to add them.`
            : `Creates project ${DEMO_PROJECT.key} with six issues linked to the Fernway test company's pull requests.`,
        },
    {
      title: `Open ${first}`,
      status: connected && loaded ? 'done' : 'waiting',
      body:
        connected && loaded
          ? `${first} has ${breaking} breaking contract change${breaking === 1 ? '' : 's'}. Its Blast radius panel is in the issue's sidebar.`
          : `After the steps above, ${first} shows which teams its change will break.`,
      href: connected && loaded ? `/browse/${first}` : '',
    },
  ];
  return { steps, next: steps.findIndex((s) => s.status !== 'done') };
}
