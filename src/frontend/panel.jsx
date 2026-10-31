import React, { useEffect, useState } from 'react';
import ForgeReconciler, { Button, DynamicTable, Heading, Inline, Link, Lozenge, SectionMessage, Spinner, Stack, Text, Strong } from '@forge/react';
import { invoke } from '@forge/bridge';

const CLASS_LOZENGE = {
  breaking: { appearance: 'removed', label: 'Breaking' },
  possibly_breaking: { appearance: 'moved', label: 'Possibly breaking' },
  compatible: { appearance: 'success', label: 'Compatible' },
};

const SEVERITY_LOZENGE = {
  action: { appearance: 'removed', label: 'Will break' },
  watch: { appearance: 'moved', label: 'On upgrade' },
  info: { appearance: 'default', label: 'Informed' },
};

function ErrorState({ error }) {
  if (error.code === 'not_connected') {
    return (
      <SectionMessage title="Connect Layer" appearance="information">
        <Text>An admin connects this site to Layer under Apps, Layer for Jira settings.</Text>
      </SectionMessage>
    );
  }
  return (
    <SectionMessage title="Blast radius unavailable" appearance="warning">
      <Text>{error.message}</Text>
    </SectionMessage>
  );
}

function ChangeCard({ entry }) {
  const cls = CLASS_LOZENGE[entry.class] || CLASS_LOZENGE.compatible;
  const rows = entry.consumers.map((c, i) => {
    const sev = SEVERITY_LOZENGE[c.severity] || SEVERITY_LOZENGE.info;
    return {
      key: `${entry.id}-${i}`,
      cells: [
        { key: 'repo', content: c.repo },
        { key: 'owners', content: c.owners.join(', ') || 'No owners' },
        { key: 'impact', content: <Lozenge appearance={sev.appearance}>{sev.label}</Lozenge> },
      ],
    };
  });
  return (
    <Stack space="space.100">
      <Inline space="space.100" alignBlock="center">
        <Strong>{entry.contract}</Strong>
        <Lozenge appearance={cls.appearance}>{cls.label}</Lozenge>
        <Text>{entry.producer}{entry.pr ? ` #${entry.pr}` : ''}</Text>
      </Inline>
      {entry.findings.slice(0, 5).map((f, i) => (
        <Text key={i}>{f}</Text>
      ))}
      {entry.findingsTotal > 5 ? <Text>{`and ${entry.findingsTotal - 5} more`}</Text> : null}
      {rows.length ? (
        <DynamicTable
          head={{ cells: [{ key: 'repo', content: 'Consumer' }, { key: 'owners', content: 'Owners' }, { key: 'impact', content: 'Impact' }] }}
          rows={rows}
        />
      ) : (
        <Text>No other repository consumes this contract.</Text>
      )}
    </Stack>
  );
}

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
        <Inline space="space.100" alignBlock="center">
          <Button appearance="primary" isDisabled={busy} onClick={tell}>
            {busy ? 'Filing issues' : `Tell ${pending.length} team${pending.length === 1 ? '' : 's'}`}
          </Button>
          <Text>{`Files a linked issue for ${pending.join(', ')}.`}</Text>
        </Inline>
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
