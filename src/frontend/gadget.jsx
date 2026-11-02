import React, { useEffect, useState } from 'react';
import ForgeReconciler, { Heading, Inline, Link, Lozenge, Stack, Strong, Text } from '@forge/react';
import { invoke } from '@forge/bridge';
import { DemoLabel, ErrorState, Loading } from './components.jsx';
import { prUrl } from '../lib/format.js';

function App() {
  const [state, setState] = useState(null);
  const load = () => {
    setState(null);
    invoke('getOverview').then(setState, (e) => setState({ error: { message: String(e) } }));
  };
  useEffect(load, []);

  if (!state) return <Loading label="Collecting contract risk across teams" />;
  if (state.error) return <ErrorState error={state.error} onRetry={load} />;
  return (
    <Stack space="space.200">
      {state.demo ? <DemoLabel /> : null}
      <Heading size="small">{state.headline}</Heading>
      {state.rows.map((r) => (
        <Stack key={r.id} space="space.050">
          <Inline space="space.100" alignBlock="center" shouldWrap>
            <Strong>{r.contract}</Strong>
            <Lozenge appearance="removed">{`${r.willBreak} will break`}</Lozenge>
            {r.waiting.length ? <Lozenge appearance="moved">{`${r.waiting.length} not told`}</Lozenge> : <Lozenge appearance="success">All told</Lozenge>}
          </Inline>
          <Inline space="space.100" shouldWrap>
            {r.issue ? <Link href={`/browse/${r.issue}`}>{r.issue}</Link> : null}
            {r.pr ? (
              <Link href={prUrl(r.producer, r.pr)} openNewTab>
                {`${r.producer} #${r.pr}`}
              </Link>
            ) : null}
          </Inline>
          {r.waiting.length ? (
            <Text size="small" color="color.text.subtle">
              {`Waiting for a heads-up: ${r.waiting.join(', ')}`}
            </Text>
          ) : null}
        </Stack>
      ))}
    </Stack>
  );
}

ForgeReconciler.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
