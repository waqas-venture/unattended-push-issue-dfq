---
description: Update an existing DataFabrIQ team — change metrics, transformations, dashboard views, or context.
argument-hint: [optional-team-slug]
---

You are following a `plan → build → validate → update-context → review & push` workflow, starting with a bootstrap to start the workflow, then planning.

**Never commit and never push on your own.** Every phase before the last leaves its changes in the working tree. The workflow ends with a single commit and push of the working branch — the branch checked out when the workflow starts — made only after the developer has reviewed the diff and explicitly said to proceed. The gold pipeline run, and any verification of its output, come after the change reaches `draft` — the platform reads only pushed commits.

# Bootstrap first

Bootstrap first — keep the initial context load minimal. Do this before planning, since bootstrapping involves starting a workflow and updating state.

1. Establish the active team and start the workflow:
   - Call `start_workflow_entry_point` with the team_slug of `$ARGUMENTS`.
   - When team_slug is empty or no active team, establish one first with /df-select-team, then use `start_workflow_entry_point`
2. Follow the `df-team-context-bootstrap` skill: locate the repo checkout and its working branch, and identify the project item the branch implements with `get_item_summary_for_branch`. All work happens on the working branch, and nothing is committed or pushed during bootstrap.

# Start the Plan phase of the workflow

Then enter plan mode after bootstrapped.

Use /df-pipeline-update, which drives the phased `plan → build → validate → update-context → review & push` workflow and loads further skills and context per phase, only as each phase needs them.

1. Enter plan mode.
2. Read `context/customer-domain.md`, `context/data-domain.md`, and `context/application-domain.md`. **Do not load schemas, diffs, mapping configurations, or other skills yet.**
3. Then pause and ask the user to explain what they want to update, to start the planning. The user will provide an area for update - data pipeline (bronze, gold, transformation spec queries, kpi definitions, dashboard view functionality & code).  Refine the request against the domain files until the change is concrete.
