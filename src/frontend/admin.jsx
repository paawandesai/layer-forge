import React, { useEffect, useState } from 'react';
import ForgeReconciler, { Button, Form, FormFooter, FormSection, Heading, Label, SectionMessage, Spinner, Stack, Text, TextArea, useForm } from '@forge/react';
import { invoke } from '@forge/bridge';

function App() {
  const [settings, setSettings] = useState(null);
  const [result, setResult] = useState(null);
  const { handleSubmit, register } = useForm();

  useEffect(() => {
    invoke('getSettings').then(setSettings, () => setSettings({ teamProjects: '' }));
  }, []);

  const [demo, setDemo] = useState(null);
  const [loading, setLoading] = useState(false);
  const save = async (data) => setResult(await invoke('saveSettings', data));
  const loadDemo = async () => {
    setLoading(true);
    setDemo(await invoke('loadDemo').catch((e) => ({ error: { message: String(e) } })));
    setLoading(false);
  };

  if (!settings) return <Spinner label="Loading settings" />;
  return (
    <Stack space="space.200">
      <Heading size="medium">Layer for Jira</Heading>
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
