# layer-forge

Layer for Jira, our Codegeist 2026 entry: a Forge app that is only a client of the private Layer API (layer-api.fly.dev).

- Never copy Layer server, indexer or edge code here, and never describe how the indexer finds contracts or consumers. This repo and the demo video show results only.
- New API needs go to company-agent `docs/loop/backlog.md` for the product loop; do not edit company-agent product code from this repo's work.
- Pure logic lives in `src/lib/` with tests in `test/` (`npm test`). Forge glue is `src/index.js` (resolver and Rovo actions, which double as the rovo:mcp tools) and `src/frontend/` (UI Kit).
- Deploy from a cloud session: `export FORGE_API_TOKEN="$FORGE_API_LAYER"` (the environment variable has that name), then `forge deploy -e development --non-interactive` and, after scope or egress changes, `forge install -e development --site layer-dev.atlassian.net --product jira --upgrade --non-interactive --confirm-scopes`. Use `@forge/cli@14.2.0` while the container's Node is older than 22.23.4.
- Layer settings are Forge variables: `LAYER_API_URL` (optional) and `LAYER_TOKEN` (`forge variables set -e development --encrypt LAYER_TOKEN ...`).
