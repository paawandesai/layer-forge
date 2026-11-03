# Trying Layer for Jira (judges)

This takes about 5 minutes and needs no accounts or tokens. The app comes connected to Layer's demo data for **Fernway**, a fictional field-service company with 12 repositories and open pull requests.

## 1. Install

1. Open the installation link from the submission.
2. Choose your Jira Cloud site and press **Install**. Accept the permissions: read and write Jira issues, store app settings, and call layer-api.fly.dev.

## 2. Load the demo (Jira admin)

1. In Jira, open **Settings** (the gear, top right), then **Marketplace apps**. If the page says app management has moved to Administration, ignore that: scroll the left sidebar to **Layer for Jira** (under Apps).
2. Under **Get started**, step 1 should say **Connected to Layer**.
3. Press **Load the Fernway demo**. It creates the project **Fernway Jobs (FERN)** with issues FERN-1 to FERN-6, which match the Fernway pull requests, and maps the Fernway teams to it.
   - It takes about 15 seconds. If your site already has a project with the key FERN, the app says so and changes nothing. Use a site without one.
4. Step 3 now links **FERN-1**.

## 3. See the blast radius

1. Open **FERN-1, Store technician IDs as integers**.
2. In the issue's right-hand details, open **Blast radius**. It shows the breaking change to `jobs-api` and the teams it reaches: who **will break**, who should **watch on upgrade**, and why.
3. Press **Tell N teams**. Check the preview, pick a due date if you like, and confirm. Linked tasks appear in FERN, one per affected team. Open one: it points back to FERN-1.
4. Other issues to try: FERN-2 (change a billing field's type), FERN-3 (rename an event field), FERN-4 (remove an endpoint) and FERN-6 (a database change).
5. Open **FERN**, then the **Incoming changes** tab across the top of the project, to see changes grouped by team.

## 4. Dashboard and automation (optional)

- **Dashboard:** open **Dashboards**, create one, press **Add gadget**, and add **Contract risk**. It lists breaking changes in flight across the Fernway teams and which teams have not been told.
- **Automation:** in **FERN**, open **Project settings**, then **Automation**, and create a rule. Use the trigger "Work item transitioned" to In Progress and the action **Check Layer blast radius** (issue key `{{issue.key}}`). The first time, Jira asks you to **Connect** Atlassian Automation to Layer for Jira; press Connect. Move FERN-4 to In Progress: Layer comments with the blast radius. New actions can take up to 20 minutes to appear in the rule builder after install.

## 5. Ask Rovo (sites with Rovo)

1. Open Rovo chat and pick **Contract Steward** under agents.
2. Try these questions:
   - "What does FERN-1 break?"
   - "Who uses jobs-api in fernway-test/jobs-api?"
   - "What contract changes are coming to the APIs my team calls?" (ask this from a FERN issue)
   - "Tell the affected teams about FERN-2." Rovo asks you to confirm before it files anything.
3. In Rovo Studio, you can add the **Layer for Jira** tools and the **layer-contract-check** skill to any agent.

## 6. Teamwork Graph (optional, site admins)

In Atlassian Administration, open **Apps**, your site, **Connected apps**, **Layer for Jira**, then **Connections**, and press **Connect** under Teamwork Graph connectors. Fernway's services, what each one uses, and the FERN issues changing them appear in the Teamwork Graph, so Rovo search can find them.

## If something looks wrong

- **"Layer is not answering":** the demo server is briefly unavailable. Press **Try again** after a minute.
- **No Blast radius in the sidebar:** reload the issue. It is also under the issue's **Apps** button.
- **"No contract changes" on FERN-1:** the demo was loaded into a project whose keys do not match. Load it on a site without an existing FERN project.

The demo data is read-only and shared by everyone trying the app. Your site sends Layer nothing except issue keys and the names you ask about.
