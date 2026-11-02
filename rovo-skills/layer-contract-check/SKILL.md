---
name: layer-contract-check
description: Before a team changes an API, event schema or database schema, or when someone asks what a Jira issue's code change will break, check with Layer which other teams' services consume it and whether they will break.
---

# Layer contract check

Use Layer's tools so a code change never surprises the teams that depend on it.

## Which tool

- About to change a contract, or asked who uses one: `get-contract-consumers` with the contract name (for example `jobs-api`) and the repository that owns it (for example `fernway-test/jobs-api`).
- Asked what a Jira issue's pull requests will break: `get-issue-blast-radius` with the issue key, or none to use the issue being viewed.
- Asked what is changing in the APIs a team or service uses: `get-incoming-changes` with a repository or team handle. For "my team", pass nothing and it uses the teams mapped to the current Jira project.
- The user agreed to tell the affected teams: `tell-consumers` with the issue key. Show the teams first and ask before calling it.

## Reading the answer

- Will break: the consumer uses the part that changes. Tell its owners before merge.
- Watch on upgrade: safe on its pinned version; breaks when it upgrades.
- Informed: uses the contract, not the part that changes.

Name owners exactly as returned, copy links as given, and say when Layer found nothing and what was searched.
