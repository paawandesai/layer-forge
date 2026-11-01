import React from 'react';
import { Inline, Link, Lozenge, SectionMessage, Stack, Text, Strong } from '@forge/react';
import { prUrl } from '../lib/format.js';

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

export function ErrorState({ error }) {
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

// Stacked rather than tabular, so it reads in the narrow issue sidebar too.
export function ChangeCard({ entry }) {
  const cls = CLASS_LOZENGE[entry.class] || CLASS_LOZENGE.compatible;
  const url = prUrl(entry.producer, entry.pr);
  const groups = entry.findingGroups || [];
  return (
    <Stack space="space.100">
      <Inline space="space.100" alignBlock="center" shouldWrap>
        <Strong>{entry.contract}</Strong>
        <Lozenge appearance={cls.appearance}>{cls.label}</Lozenge>
      </Inline>
      {url ? <Link href={url} openNewTab>{`${entry.producer} #${entry.pr}`}</Link> : <Text>{entry.producer}</Text>}
      {groups.slice(0, 3).map((g, i) => (
        <Stack key={i} space="space.050">
          <Text>{g.text}</Text>
          <Text size="small" color="color.text.subtlest">{g.locations.join(', ')}</Text>
        </Stack>
      ))}
      {groups.length > 3 ? <Text size="small">{`and ${groups.length - 3} more kinds of change`}</Text> : null}
      {entry.consumers.length ? (
        <Stack space="space.100">
          <Strong>{`Consumers (${entry.consumers.length})`}</Strong>
          {entry.consumers.map((c, i) => {
            const sev = SEVERITY_LOZENGE[c.severity] || SEVERITY_LOZENGE.info;
            return (
              <Stack key={`${entry.id}-${i}`} space="space.025">
                <Inline space="space.100" alignBlock="center" shouldWrap>
                  <Lozenge appearance={sev.appearance}>{sev.label}</Lozenge>
                  <Text>{c.repo}</Text>
                </Inline>
                <Text size="small" color="color.text.subtlest">{c.owners.join(', ') || 'No owners'}</Text>
              </Stack>
            );
          })}
        </Stack>
      ) : (
        <Text>No other repository consumes this contract.</Text>
      )}
    </Stack>
  );
}
