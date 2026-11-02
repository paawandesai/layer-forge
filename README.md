# Layer for Jira

Shows, on a Jira issue, which other teams' services its code change will break, and gives Rovo agents the same answer.

- **Blast radius** issue panel: contract changes in the issue's pull requests, and the consuming repositories and owners each one reaches.
- **Contract Steward** Rovo agent, with three reusable actions: contract consumers, incoming changes for a team or repository, and an issue's blast radius.
- **Layer for Jira** Rovo MCP server exposing the same three tools.
- **Incoming changes** project page: contract changes coming to the teams an admin mapped to the project.
- **Fernway demo loader** on the admin page: creates the FERN project with six issues whose keys match the Fernway demo pull request branches, so judges see data on a fresh site.
- **Tell the consumers**: one click files a linked Jira issue for each team whose repository will break. Admins map code owner teams to Jira projects on the app's admin page.

Data comes from the Layer API. Pull requests are matched to issues by the issue key in their title or branch.

## Develop

```sh
npm install
npm test
forge deploy -e development
```
