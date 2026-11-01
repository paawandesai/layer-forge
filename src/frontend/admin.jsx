import React, { useEffect, useState } from 'react';
import ForgeReconciler, {
  Button,
  Form,
  FormFooter,
  FormSection,
  Heading,
  Inline,
  Label,
  Link,
  Lozenge,
  SectionMessage,
  Spinner,
  Stack,
  Strong,
  Text,
  TextArea,
  useForm,
} from '@forge/react';
import { invoke } from '@forge/bridge';

const STEP_LOZENGE = {
  done: { appearance: 'success', label: 'Done' },
  todo: { appearance: 'inprogress', label: 'Next' },
  waiting: { appearance: 'default', label: 'Waiting' },
};

function Checklist({ setup }) {
  if (!setup) return <Spinner size="small" label="Checking setup" />;
  return (
    <Stack space="space.150">
      {setup.steps.map((s, i) => {
        const lz = i === setup.next ? STEP_LOZENGE.todo : STEP_LOZENGE[s.status === 'done' ? 'done' : 'waiting'];
        return (
          <Stack key={s.title} space="space.050">
            <Inline space="space.100" alignBlock="center">
              <Lozenge appearance={lz.appearance}>{lz.label}</Lozenge>
              {s.href ? <Link href={s.href}>{`${i + 1}. ${s.title}`}</Link> : <Strong>{`${i + 1}. ${s.title}`}</Strong>}
            </Inline>
            <Text size="small">{s.body}</Text>
          </Stack>
        );
      })}
    </Stack>
  );
}

function App() {
  const [settings, setSettings] = useState(null);
  const [result, setResult] = useState(null);
  const { handleSubmit, register } = useForm();

  const [setup, setSetup] = useState(null);
  const refreshSetup = () => invoke('getSetup').then(setSetup, () => setSetup(null));
  useEffect(() => {
    invoke('getSettings').then(setSettings, () => setSettings({ teamProjects: '' }));
    refreshSetup();
  }, []);

  const [demo, setDemo] = useState(null);
  const [loading, setLoading] = useState(false);
  const save = async (data) => setResult(await invoke('saveSettings', data));
  const loadDemo = async () => {
    setLoading(true);
    setDemo(await invoke('loadDemo').catch((e) => ({ error: { message: String(e) } })));
    setLoading(false);
    refreshSetup();
  };

  if (!settings) return <Spinner label="Loading settings" />;
  return (
    <Stack space="space.200">
      <Heading size="medium">Layer for Jira</Heading>
      <Heading size="small">Get started</Heading>
      <Checklist setup={setup} />
      <Heading size="small">Team routing</Heading>
      <Text>
        This site reads Layer's contract graph with a read-only token, limited to the repositories your Layer operator allowed.
        Map each code owner team to the Jira project where its issues belong. Teams without a line get issues in the changing issue's project.
      </Text>
      <Form onSubmit={handleSubmit(save)}>
        <FormSection>
          <Label labelFor="teamProjects">Team to project, one per line</Label>
          <TextArea
            {...register('teamProjects')}
            id="teamProjects"
            defaultValue={settings.teamProjects}
            placeholder={'@fernway-test/dispatch = DISP\n@fernway-test/ops-tools = OPS'}
          />
        </FormSection>
        <FormFooter>
          <Button appearance="primary" type="submit">
            Save
          </Button>
        </FormFooter>
      </Form>
      {result?.saved ? (
        <SectionMessage appearance="success">
          <Text>{`Saved ${result.teams} team mapping${result.teams === 1 ? '' : 's'}.`}</Text>
        </SectionMessage>
      ) : null}
      <Heading size="small">Fernway demo</Heading>
      <Text>
        Creates the Fernway Jobs project (FERN) with six issues whose pull requests live in the Fernway test company, then maps the Fernway teams to it.
        Open FERN-1 afterwards to see its blast radius.
      </Text>
      <Button isDisabled={loading} onClick={loadDemo}>
        {loading ? 'Loading the demo' : 'Load the Fernway demo'}
      </Button>
      {demo?.keys ? (
        <SectionMessage appearance="success">
          <Text>{demo.created.length ? `Created ${demo.created.join(', ')} in ${demo.project}.` : `The demo is already loaded in ${demo.project}.`}</Text>
        </SectionMessage>
      ) : null}
      {demo?.error ? (
        <SectionMessage appearance="error">
          <Text>{demo.error.message}</Text>
        </SectionMessage>
      ) : null}
      {result?.error ? (
        <SectionMessage appearance="error">
          <Text>{result.error.message}</Text>
        </SectionMessage>
      ) : null}
    </Stack>
  );
}

ForgeReconciler.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
