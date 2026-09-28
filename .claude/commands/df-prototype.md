---
description: Build or iterate a quick prototype dashboard view in DataFabrIQ — a React mock-up with static or simple mock data, for fast customer feedback.
argument-hint: [optional-team-slug]
---

You are following a lightweight `plan → build → validate → update-context → commit & push` workflow for a **prototype dashboard view**, starting with a bootstrap to start the workflow, then a short plan.

This is the fast-feedback entry point. Prototypes are custom dashboard views (React apps) with mock data — either static data embedded in the view's TypeScript, or simple CSV/XLSX mock data uploaded through the Custom Files connector into a minimal data model. They exist so a customer can click through a real view in the draft dashboard and give feedback quickly. No production data modeling, no transformation layering, no validation suites.

**In this workflow, you should commit and push the working branch — the branch checked out when the workflow starts — automatically at the end of every build iteration; there is no review gate.** Never `main`, never a new branch, never a pull request. The prototype appears in the draft dashboard once it is on `draft`: at every push when the working branch is `draft`, or once the working branch merges into it.

# Bootstrap

Bootstrap first — keep the initial context load minimal. Do this before planning, since bootstrapping involves starting a workflow and updating state.

1. Establish the active team and start the workflow:
   - Call `start_workflow_entry_point` with the team_slug of `$ARGUMENTS`.
   - When team_slug is empty or no active team, establish one first with /df-select-team, then use `start_workflow_entry_point`
2. Follow the `df-team-context-bootstrap` skill: locate the repo checkout and its working branch, and identify the project item the branch implements with `get_item_summary_for_branch`. All work happens on the working branch, and nothing is committed or pushed during bootstrap. If the three `context/*.md` files do not exist yet, that is normal for a prototype team — continue; they are created in the update-context phase.

**Do not load** `df-plan-phase`, `df-data-pipeline-manager`, connector skills, schema tools (`get_source_connector_schemas`, `get_bronze_schema_context`, `get_gold_schema_context`), or the draft diff. The `df-prototype` skill names the only skills and tools this workflow needs, at the phase that needs them.

# Start the Plan phase of the workflow

Use /df-prototype, which drives the phased workflow and loads the few skills it needs per phase.

1. Read `context/customer-domain.md`, `context/data-domain.md`, and `context/application-domain.md` if they exist. **Do not load schemas, diffs, or other skills yet.**
2. Then pause and ask the user for the prototype inputs:
   - the mock-up source — a path to an existing static `.html` prototype (read it in full), and/or a description or screenshot of what to build;
   - the working mode — **HTML-first** (keep iterating on the standalone `.html` file, convert it into a view later in the session) or **view now** (build the DataFabrIQ view immediately);
   - the view name;
   - the data mode — **static** mock data embedded in the view (default), or **mock pipeline** (CSV/XLSX mock data uploaded via Custom Files and read through a KPI).
   Refine the request until the view, its interactions, and its data are concrete.
   