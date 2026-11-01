// Copy and kind for every non-result state of the issue panel and project page,
// kept pure so each state is tested without rendering.

// What went wrong, in words an issue reader can act on.
export function errorView(error = {}) {
  const status = error.status ?? 0;
  if (error.code === 'not_connected') {
    return {
      kind: 'not_connected',
      appearance: 'information',
      title: 'Layer is not connected yet',
      body: 'A Jira admin connects this site under Apps, Manage apps, Layer for Jira. Until then this panel has nothing to show.',
      retry: false,
    };
  }
  if (error.code === 'no_issue' || error.code === 'no_project') {
    return { kind: error.code, appearance: 'information', title: 'Nothing to check here', body: error.message, retry: false };
  }
  if (status === 401 || status === 403) {
    return {
      kind: 'refused',
      appearance: 'warning',
      title: 'Layer refused this site',
      body: 'The connection to Layer was turned off or its access changed. A Jira admin can reconnect it on the Layer for Jira admin page.',
      retry: false,
    };
  }
  if (status === 429) {
    return { kind: 'busy', appearance: 'warning', title: 'Layer is busy', body: 'Too many requests at once. Try again in a minute.', retry: true };
  }
  if (error.code === 'jira') {
    return { kind: 'jira', appearance: 'error', title: 'Jira did not accept the request', body: error.message, retry: true };
  }
  return {
    kind: 'unreachable',
    appearance: 'warning',
    title: 'Layer is not answering',
    body: 'This is usually brief. Your issue is unaffected; try again in a minute.',
    retry: true,
  };
}

// The panel's empty state. Layer only sees pull requests whose branch names
// the issue key, so the empty state says how to link one.
export function emptyView(issueKey) {
  return {
    kind: 'empty',
    appearance: 'success',
    title: 'No contract changes',
    body: `None of the pull requests linked to ${issueKey || 'this issue'} change an API, event or schema another repository uses. Layer finds pull requests whose branch name includes the issue key, such as feature/${issueKey || 'JOBS-12'}-short-name.`,
  };
}

// Results shown are a subset when Layer trimmed findings or hit its page limit.
export function partialNote(entries = [], { limit = 200, routes = 0 } = {}) {
  const hidden = entries.reduce((n, e) => n + Math.max(0, (e.findingsTotal || 0) - (e.findings || []).length), 0);
  const parts = [];
  if (routes >= limit) parts.push(`Showing the newest ${limit} routes; older ones are left out.`);
  if (hidden > 0) parts.push(`${hidden} more finding${hidden === 1 ? ' is' : 's are'} on the pull requests.`);
  return parts.join(' ');
}
