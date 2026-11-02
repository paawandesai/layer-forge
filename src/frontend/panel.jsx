import React, { useEffect, useState } from 'react';
import ForgeReconciler, {
  Button,
  DatePicker,
  Heading,
  Inline,
  Label,
  Link,
  Lozenge,
  Modal,
  ModalBody,
  ModalFooter,
  ModalHeader,
  ModalTitle,
  ModalTransition,
  SectionMessage,
  Stack,
  Strong,
  Text,
} from '@forge/react';
import { invoke } from '@forge/bridge';
import { ChangeCard, DemoLabel, ErrorState, Loading } from './components.jsx';
import { isDemoData } from '../lib/demo.js';
import { emptyView, partialNote } from '../lib/states.js';

function Preview({ plans, onClose, onConfirm, busy }) {
  const [due, setDue] = useState('');
  const files = plans.filter((p) => p.action.mode === 'create').length;
  const comments = plans.length - files;
  const label = [files ? `File ${files} issue${files === 1 ? '' : 's'}` : '', comments ? `comment on ${comments}` : ''].filter(Boolean).join(' and ');
  return (
    <Modal onClose={onClose}>
      <ModalHeader>
        <ModalTitle>Tell the teams whose code will break</ModalTitle>
      </ModalHeader>
      <ModalBody>
        <Stack space="space.200">
          {plans.map((p) => (
            <Stack key={p.owner} space="space.050">
              <Inline space="space.100" alignBlock="center" shouldWrap>
                <Strong>{p.owner}</Strong>
                <Lozenge>{p.action.mode === 'comment' ? `Comment on ${p.action.target}` : `New issue in ${p.project}`}</Lozenge>
              </Inline>
              <Text>{p.summary}</Text>
              {p.lines.slice(0, 6).map((l, i) => (
                <Text key={i} size="small" color="color.text.subtle">
                  {l}
                </Text>
              ))}
            </Stack>
          ))}
          {files ? (
            <Stack space="space.050">
              <Label labelFor="layer-due">Due date for new issues (optional)</Label>
              <DatePicker id="layer-due" value={due} onChange={(v) => setDue(v || '')} />
            </Stack>
          ) : null}
        </Stack>
      </ModalBody>
      <ModalFooter>
        <Button appearance="subtle" onClick={onClose}>
          Cancel
        </Button>
        <Button appearance="primary" isDisabled={busy} onClick={() => onConfirm(due)}>
          {busy ? 'Filing' : label.charAt(0).toUpperCase() + label.slice(1)}
        </Button>
      </ModalFooter>
    </Modal>
  );
}

function TellConsumers({ teams, told: initialTold }) {
  const [told, setTold] = useState(initialTold || {});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [plans, setPlans] = useState(null);
  const [note, setNote] = useState(null);
  const pending = teams.filter((t) => !told[t]);

  const preview = async () => {
    setBusy(true);
    setError(null);
    const res = await invoke('previewTell').catch((e) => ({ error: { message: String(e) } }));
    if (res.error) setError(res.error.message);
    else if (res.plans.length) setPlans(res.plans);
    else {
      // Told from elsewhere meanwhile (Rovo or automation): show who and where.
      setTold(res.told || told);
      setNote('Every team was already told. Their issues are listed below.');
    }
    setBusy(false);
  };

  const tell = async (dueDate) => {
    setBusy(true);
    const res = await invoke('tellConsumers', { dueDate }).catch((e) => ({ error: { message: String(e) } }));
    if (res.error) setError(res.error.message);
    else setTold(res.told);
    setPlans(null);
    setBusy(false);
  };

  return (
    <Stack space="space.100">
      {pending.length ? (
        <Stack space="space.050">
          <Inline>
            <Button appearance="primary" isDisabled={busy} onClick={preview}>
              {busy && !plans ? 'Preparing' : `Tell ${pending.length} team${pending.length === 1 ? '' : 's'}`}
            </Button>
          </Inline>
          <Text size="small">{`Shows the issue for ${pending.join(', ')} before filing it.`}</Text>
        </Stack>
      ) : null}
      {Object.entries(told).map(([owner, key]) => (
        <Inline key={owner} space="space.100" alignBlock="center" shouldWrap>
          <Lozenge appearance="success">Told</Lozenge>
          <Text>{owner}</Text>
          <Link href={`/browse/${key}`}>{key}</Link>
        </Inline>
      ))}
      {note ? <Text size="small">{note}</Text> : null}
      {error ? (
        <SectionMessage title="Could not tell every team" appearance="error">
          <Text>{error}</Text>
        </SectionMessage>
      ) : null}
      <ModalTransition>{plans ? <Preview plans={plans} busy={busy} onClose={() => setPlans(null)} onConfirm={tell} /> : null}</ModalTransition>
    </Stack>
  );
}

function App() {
  const [state, setState] = useState(null);
  const load = () => {
    setState(null);
    invoke('getBlastRadius').then(setState, (e) => setState({ error: { message: String(e) } }));
  };
  useEffect(load, []);

  if (!state) return <Loading label="Checking this issue's pull requests" />;
  if (state.error) return <ErrorState error={state.error} onRetry={load} />;
  if (state.filedFor) {
    return (
      <SectionMessage title="Filed by Layer" appearance="information">
        <Text>
          {'Layer filed this for your team because '}
          <Link href={`/browse/${state.filedFor}`}>{state.filedFor}</Link>
          {' changes a contract your repository uses. The full blast radius is on that issue.'}
        </Text>
      </SectionMessage>
    );
  }
  if (!state.entries.length) {
    const v = emptyView(state.issueKey);
    return (
      <SectionMessage title={v.title} appearance={v.appearance}>
        <Text>{v.body}</Text>
      </SectionMessage>
    );
  }
  const partial = partialNote(state.entries, { routes: state.routes });
  return (
    <Stack space="space.200">
      {isDemoData(state.entries) ? <DemoLabel /> : null}
      <Heading size="small">{state.summary}</Heading>
      {partial ? <Text size="small" color="color.text.subtle">{partial}</Text> : null}
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
