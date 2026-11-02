# Layer for Jira for agent builders

Layer for Jira gives agents one answer before they change code: which other teams' services consume a contract (an API, event schema or database schema), and whether a change will break them. The same tools are available three ways:

| Where | How to use it |
|---|---|
| Rovo, on a site with the app installed | Chat with the **Contract Steward** agent, or add the **layer-contract-check** skill to your own Rovo agent. |
| Rovo Studio | Build an agent and add the **Layer for Jira** tools under Tools. |
| An outside agent (Claude, Rovo Dev, others) | Add the remote MCP server `https://mcp.atlassian.com/forge/176a7b78-247a-4860-a77c-96c16250c304` and sign in with an account on that site. A site admin enables the app's tools for MCP first. |

All tools answer in Markdown text, with links to pull requests and Jira issues.

## Tools

### get-contract-consumers

Who uses a contract. Read-only.

| Input | Required | Example |
|---|---|---|
| `contract` | yes | `jobs-api` |
| `repo` | yes, the repository that owns the contract | `fernway-test/jobs-api` |

Example answer:

```
jobs-api has 4 consumers among 12 indexed repositories:
- fernway-test/dispatch (high confidence): go.mod pins go:github.com/fernway-test/jobs-api/client
- fernway-test/web (high confidence): package-lock.json pins npm:@fernway/jobs-client 4.2.0
- ...
```

### get-issue-blast-radius

What a Jira issue's pull requests will break. Read-only. Pull requests are linked by the issue key in their branch name, such as `FERN-1-technician-ids`.

| Input | Required | Example |
|---|---|---|
| `issueKey` | no; defaults to the issue being viewed | `FERN-1` |

Example answer:

```
1 breaking contract change, reaching 4 consuming repositories owned by 4 teams.
- jobs-api in [fernway-test/jobs-api #296](https://github.com/fernway-test/jobs-api/pull/296): breaking, in flight. Reaches fernway-test/dispatch (will break: Pins jobs-api/client; @fernway-test/dispatch), ...
  technician_id changed from string to integer (GET /jobs/{id}, GET /jobs)
```

### get-incoming-changes

Contract changes coming to what a team or service uses. Read-only.

| Input | Required | Example |
|---|---|---|
| `repo` | one of these, or none | `fernway-test/web` |
| `owner` |  | `@fernway-test/mobile` |
| `project` |  | `FERN`; with no input at all, the teams mapped to the current Jira project |

### tell-consumers (Rovo only)

Files one linked Jira issue for each team whose code will break, or comments on the issue Layer already filed for that team. Rovo asks the person to confirm before it runs. It is not exposed over MCP.

| Input | Required | Example |
|---|---|---|
| `issueKey` | yes | `FERN-1` |
| `dueDate` | no | `2026-12-01` |

## Reading the answers

- **Will break**: the consumer uses the part that changes. Tell its owners before merge.
- **Watch on upgrade**: safe on its pinned version; breaks when it upgrades.
- **Informed**: uses the contract, but not the part that changes.
- **Breaking / Possibly breaking / Compatible**: the kind of change to the contract itself.

Owners are code owner handles. "No contract changes" means none of the issue's pull requests change a contract another repository uses.

## Suggested agent instructions

```
Before editing an API, event or schema, call get-contract-consumers. If a consumer
will break, tell the user who owns it and suggest telling them before merge.
When starting a Jira issue, call get-issue-blast-radius with its key.
Copy links exactly as returned. Say when Layer found nothing.
```

A ready-made skill file for outside agents is in [skills/layer-contract-check/SKILL.md](../skills/layer-contract-check/SKILL.md).
