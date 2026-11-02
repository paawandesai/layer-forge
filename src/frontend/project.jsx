import React, { useEffect, useState } from 'react';
import ForgeReconciler, { Heading, Inline, Lozenge, SectionMessage, Stack, Text } from '@forge/react';
import { invoke } from '@forge/bridge';
import { ChangeCard, ErrorState, Loading } from './components.jsx';

function App() {
  const [state, setState] = useState(null);
  const load = () => {
    setState(null);
    invoke('getIncoming').then(setState, (e) => setState({ error: { message: String(e) } }));
  };
  useEffect(load, []);

  if (!state) return <Loading label="Collecting changes to the contracts this project's teams use" />;
  if (state.error) return <ErrorState error={state.error} onRetry={load} />;
  if (state.teams.length === 0) {
    return (
      <SectionMessage title="No teams mapped to this project" appearance="information">
        <Text>A Jira admin maps code owner teams to projects on the Layer for Jira admin page.</Text>
      </SectionMessage>
    );
  }
  const total = state.entries.length;
  return (
    <Stack space="space.300">
      <Stack space="space.100">
        <Heading size="medium">Incoming contract changes</Heading>
        <Text>
          {total
            ? `${total} change${total === 1 ? '' : 's'} in flight or recently merged to contracts this project's teams use.`
            : `Nothing is changing in the contracts ${state.teams.join(', ')} use.`}
        </Text>
      </Stack>
      {state.groups
        .filter((g) => g.changes.length)
        .map((g) => (
          <Stack key={g.team} space="space.150">
            <Inline space="space.100" alignBlock="center" shouldWrap>
              <Heading size="small">{g.team}</Heading>
              {g.breaking ? <Lozenge appearance="removed">{`${g.breaking} will break`}</Lozenge> : null}
            </Inline>
            <Text size="small" color="color.text.subtle">{g.summary}</Text>
            {g.changes.map((e) => (
              <ChangeCard key={`${g.team}-${e.id}`} entry={e} />
            ))}
          </Stack>
        ))}
      {state.groups.some((g) => !g.changes.length) && total ? (
        <Text size="small" color="color.text.subtle">
          {`Nothing incoming for ${state.groups.filter((g) => !g.changes.length).map((g) => g.team).join(', ')}.`}
        </Text>
      ) : null}
    </Stack>
  );
}

ForgeReconciler.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
