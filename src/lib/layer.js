// Client for the Layer API. The app only reads from Layer; all contract
// and consumer logic stays on the server.

export class LayerError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export function layerConfig(env = process.env) {
  return {
    baseUrl: (env.LAYER_API_URL || 'https://layer-api.fly.dev').replace(/\/+$/, ''),
    token: env.LAYER_TOKEN || '',
  };
}

export function createClient({ baseUrl, token, fetch }) {
  async function get(path, params) {
    if (!token) {
      throw new LayerError(0, 'not_connected', 'This site is not connected to Layer yet.');
    }
    const qs = new URLSearchParams(Object.entries(params).filter(([, v]) => v)).toString();
    const res = await fetch(`${baseUrl}${path}${qs ? `?${qs}` : ''}`, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
    });
    const text = await res.text();
    let body = {};
    try {
      body = text ? JSON.parse(text) : {};
    } catch {
      body = {};
    }
    if (!res.ok) {
      throw new LayerError(res.status, body.error || `http_${res.status}`, body.message || text.slice(0, 200));
    }
    return body;
  }

  return {
    // Who consumes a contract: GET /v1/contracts/consumers.
    consumers: ({ repo, name }) => get('/v1/contracts/consumers', { repo, name }),
    // Routed changes for a consuming repository or an owner handle.
    changes: ({ repo, owner }) => get('/v1/changes', { repo, owner }),
    // Changes whose PR title or branch names a Jira issue key.
    changesForIssue: (issue) => get('/v1/changes', { issue }),
  };
}
