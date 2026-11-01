// The Fernway demo: a Jira project whose issue keys match the branches of
// the Fernway test fleet's demo pull requests (FERN-1-..., FERN-2-...).

export const DEMO_PROJECT = { key: 'FERN', name: 'Fernway Jobs' };

export const DEMO_ISSUES = [
  {
    summary: 'Store technician IDs as integers',
    description: 'Technician IDs are numeric everywhere else. Change technician_id in the jobs API from string to integer.',
  },
  {
    summary: 'Rename invoice amount to total',
    description: 'Finance wants "total" on invoices to match the ledger. Rename the amount field in the billing API.',
  },
  {
    summary: 'Add region to the job-assigned event',
    description: 'Dispatch needs the job region on job-assigned so notifications can route by region.',
  },
  {
    summary: 'Remove the pay-invoice endpoint',
    description: 'Payments moved to the payment provider. Remove POST /invoices/{id}/pay from the billing API.',
  },
  {
    summary: 'Move token introspection under /oauth',
    description: 'Align identity with the OAuth spec: move /introspect to /oauth/introspect.',
  },
  {
    summary: 'Add a priority column to jobs',
    description: 'Ops wants to sort jobs by priority. Add a nullable priority column to the jobs table.',
  },
];

export const DEMO_TEAMS = [
  '@fernway-test/dispatch',
  '@fernway-test/api-guild',
  '@fernway-test/ops-tools',
  '@fernway-test/mobile',
  '@fernway-test/portal',
];

export function demoKeys() {
  return DEMO_ISSUES.map((_, i) => `${DEMO_PROJECT.key}-${i + 1}`);
}

// Default team mapping lines for the demo, added only when none are set.
export function demoTeamProjects() {
  return DEMO_TEAMS.map((t) => `${t} = ${DEMO_PROJECT.key}`).join('\n');
}
