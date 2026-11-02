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

// Picks the issue type demo issues are created with: Task when the project
// has it, otherwise the first standard (non-subtask) type.
export function pickIssueType(types = []) {
  const standard = types.filter((t) => !t.subtask);
  return (standard.find((t) => t.name === 'Task') || standard.find((t) => t.name === 'Story') || standard.find((t) => t.name !== 'Epic') || standard[0])?.name || null;
}

// What loading the demo will do, given the issue keys already in FERN.
// Keys must line up with the Fernway branches, so a FERN project with
// other issues cannot be used.
export function planDemo({ existingKeys = [], nextNumber } = {}) {
  const keys = demoKeys();
  const existing = [...existingKeys].sort((a, b) => num(a) - num(b));
  if (existing.some((k, i) => k !== keys[i])) {
    return {
      error: `Project ${DEMO_PROJECT.key} already has other issues (${existing.slice(0, 3).join(', ')}), so new issues would not get the keys FERN-1 to FERN-6 that the demo pull requests use. Load the demo on a site without a ${DEMO_PROJECT.key} project, or rename that project's key.`,
    };
  }
  const missing = keys.slice(existing.length);
  // Jira never reuses a number, so deleted demo issues leave a gap.
  if (missing.length && nextNumber && nextNumber !== num(missing[0])) {
    return {
      error: `Jira would number the next ${DEMO_PROJECT.key} issue ${DEMO_PROJECT.key}-${nextNumber}, not ${missing[0]}, because earlier issues were deleted. Delete the ${DEMO_PROJECT.key} project (and empty it from the trash), then load the demo again.`,
    };
  }
  return { create: missing.map((key) => ({ key, ...DEMO_ISSUES[num(key) - 1] })), kept: existing };
}

function num(key) {
  return Number(String(key).split('-')[1]);
}

// Turns a Jira failure into advice for the admin page.
export function demoFailure(status, text = '') {
  if (status === 401 || status === 403) {
    return 'Jira refused: loading the demo creates a project, which needs the Jira administrator permission on this site.';
  }
  if (status === 400 && /project.*(key|name)/i.test(text)) {
    return `Jira would not create project ${DEMO_PROJECT.key}: ${text.slice(0, 200)}`;
  }
  return `Jira answered ${status}: ${text.slice(0, 200)}`;
}

export function demoReport({ created = [], kept = [], mapped = false, issueType } = {}) {
  const parts = [];
  if (created.length) parts.push(`Created ${created.join(', ')} in ${DEMO_PROJECT.key}${issueType && issueType !== 'Task' ? ` as ${issueType} issues` : ''}.`);
  if (kept.length) parts.push(`${kept.join(', ')} ${kept.length === 1 ? 'was' : 'were'} already there.`);
  if (mapped) parts.push('Mapped the five Fernway teams to FERN, so "Tell teams" files their issues there.');
  if (!created.length && !kept.length) parts.push('Nothing to create.');
  return parts.join(' ');
}
