---
description: Implement the spec in an Idea1 project item's description for the DataFabrIQ team whose repo is checked out — metrics, transformations, dashboard views, or context.
---

You are following a `plan → build → validate → update-context → review & push` workflow, starting with a bootstrap to start the workflow, then planning. The change to make is the spec in the description of the Idea1 project item `$ARGUMENTS`.

**Never commit and never push on your own.** Every phase before the last leaves its changes in the working tree. The workflow ends with a single commit and push of the working branch — the branch checked out when the workflow starts — made only after the developer has reviewed the diff and explicitly said to proceed. The gold pipeline run, and any verification of its output, come after the change reaches `draft` — the platform reads only pushed commits.

# Bootstrap first

Bootstrap first — keep the initial context load minimal. Do this before planning, since bootstrapping involves starting a workflow and updating state.

1. Establish the active team from the repo and start the workflow:
   - The session runs in a checkout of the team's pipeline-config repo. Determine the team from it, per the "From a repo checkout" section of /df-select-team: take the repository as `owner/name` from `git remote get-url origin`, and call `get_team_for_repository` with it as `repository_full_name`.
   - Call `start_workflow_entry_point` with the returned team's slug as team_slug.
2. Follow the `df-team-context-bootstrap` skill: locate the repo checkout and its working branch, and identify the project item the branch implements with `get_item_summary_for_branch`. All work happens on the working branch, and nothing is committed or pushed during bootstrap.
   - This workflow is to implement the spec in the description of the idea1 project item associated with the working branch.

# Start the Plan phase of the workflow

Then enter plan mode after bootstrapped.

Use /df-pipeline-update, which drives the phased `plan → build → validate → update-context → review & push` workflow and loads further skills and context per phase, only as each phase needs them.

1. Enter plan mode.
2. Read `context/customer-domain.md`, `context/data-domain.md`, and `context/application-domain.md`. **Do not load schemas, diffs, mapping configurations, or other skills yet.**
3. Implement the spec in the Project Item description for the idea1 project item associated with this working branch, using `get_item_description` to read the project item description. The spec names the area to change - data pipeline (bronze, gold, transformation spec queries, kpi definitions, dashboard view functionality & code). Refine the spec against the domain files until the change is concrete; when the spec leaves an input the plan needs unanswered, or contradicts the domain files, ask the user rather than guessing.
