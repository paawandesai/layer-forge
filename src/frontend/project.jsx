import React, { useEffect, useState } from 'react';
import ForgeReconciler, { Heading, SectionMessage, Stack, Text } from '@forge/react';
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
  const breaking = state.entries.filter((e) => e.class === 'breaking').length;
  return (
    <Stack space="space.200">
      <Heading size="medium">Incoming contract changes</Heading>
      <Text>
        {state.entries.length
          ? `${state.entries.length} change${state.entries.length === 1 ? '' : 's'} to contracts that ${state.teams.join(', ')} depend on, ${breaking} breaking.`
          : `Nothing is changing in the contracts ${state.teams.join(', ')} depend on.`}
      </Text>
      {state.entries.map((e) => (
        <ChangeCard key={e.id} entry={e} />
      ))}
    </Stack>
  );
}

ForgeReconciler.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
