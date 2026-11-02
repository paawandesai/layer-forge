import React, { useState } from 'react';
import ForgeReconciler, { Label, Select, Stack, Text, Textfield, useConfig } from '@forge/react';
import { view } from '@forge/bridge';

const TELL = [
  { label: 'No, only comment', value: 'no' },
  { label: 'Yes, also tell the affected teams', value: 'yes' },
];

function Config() {
  const saved = useConfig() || {};
  const [cfg, setCfg] = useState({ issueKey: saved.issueKey || '{{issue.key}}', tellTeams: saved.tellTeams || 'no' });
  const update = (next) => {
    const merged = { ...cfg, ...next };
    setCfg(merged);
    view.submit(merged);
  };
  return (
    <Stack space="space.150">
      <Text>Comments on the issue with its blast radius when its pull requests will break another team's code.</Text>
      <Label labelFor="layer-issue">Issue key</Label>
      <Textfield id="layer-issue" value={cfg.issueKey} onChange={(e) => update({ issueKey: e.target.value })} onBlur={() => view.submit(cfg)} />
      <Label labelFor="layer-tell">Also file issues for the affected teams?</Label>
      <Select
        inputId="layer-tell"
        options={TELL}
        value={TELL.find((o) => o.value === cfg.tellTeams)}
        onChange={(o) => update({ tellTeams: o.value })}
      />
    </Stack>
  );
}

ForgeReconciler.render(
  <React.StrictMode>
    <Config />
  </React.StrictMode>,
);
