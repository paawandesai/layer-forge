import React, { useEffect, useState } from 'react';
import ForgeReconciler, { Button, Heading, Inline, Link, Lozenge, SectionMessage, Spinner, Stack, Text } from '@forge/react';
import { invoke } from '@forge/bridge';
import { ChangeCard, ErrorState } from './components.jsx';

function TellConsumers({ teams, told: initialTold }) {
  const [told, setTold] = useState(initialTold || {});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const pending = teams.filter((t) => !told[t]);

  const tell = async () => {
    setBusy(true);
    setError(null);
    const res = await invoke('tellConsumers').catch((e) => ({ error: { message: String(e) } }));
    if (res.error) setError(res.error.message);
    else setTold(res.told);
    setBusy(false);
  };

  return (
    <Stack space="space.100">
      {pending.length ? (
        <Stack space="space.050">
          <Button appearance="primary" isDisabled={busy} onClick={tell}>
            {busy ? 'Filing issues' : `Tell ${pending.length} team${pending.length === 1 ? '' : 's'}`}
          </Button>
          <Text size="small">{`Files a linked issue for ${pending.join(', ')}.`}</Text>
        </Stack>
      ) : null}
      {Object.entries(told).map(([owner, key]) => (
        <Inline key={owner} space="space.100">
          <Lozenge appearance="success">Told</Lozenge>
          <Text>{owner}</Text>
          <Link href={`/browse/${key}`}>{key}</Link>
        </Inline>
      ))}
      {error ? (
        <SectionMessage title="Could not file every issue" appearance="error">
          <Text>{error}</Text>
        </SectionMessage>
      ) : null}
    </Stack>
  );
}

function App() {
  const [state, setState] = useState(null);
  useEffect(() => {
    invoke('getBlastRadius').then(setState, (e) => setState({ error: { message: String(e) } }));
  }, []);

  if (!state) return <Spinner label="Asking Layer" />;
  if (state.error) return <ErrorState error={state.error} />;
  return (
    <Stack space="space.200">
      <Heading size="small">{state.summary}</Heading>
      {state.teamsToTell.length || Object.keys(state.told).length ? <TellConsumers teams={state.teamsToTell} told={state.told} /> : null}
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
