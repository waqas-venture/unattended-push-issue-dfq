---
name: df-plan-phase
description: Plans the next DataFabrIQ workflow. Reads team state, structures the work into the five phases (plan → build → validate → update-context → review & push), and emits a plan the user reviews before any writes. Use as the first phase of the configuration entry-point workflows (`/df-update`, `/df-implement-project-item`).
---

# DataFabrIQ Plan Phase

The first phase of the standard phased workflow (see `df-datafabriq-concepts`).
It produces the plan that the DataFabrIQ configuration workflows (`/df-update`, `/df-implement-project-item`) start with, and is always followed by an explicit user approval
step. (Read-only exploration via `/df-explore` plans within the
`df-adhoc-exploration` skill itself.)

Workflows will specify the right initial context and state to read as input to planning.

## No Writes In This Phase

During the plan phase, make no writes:

- Do not commit or push to the team's repo.
- Do not call any `update_*` context tool.
- Do not call `trigger_draft_gold_pipeline_run`.

Read tools are fine — and required. The only "running" allowed is the
read-only `run_query` (bronze or gold) *if* it's needed to confirm the data
shape required by the plan.

## Step 1 — Read Team State (minimal reads)

Read only what the plan needs. The starting context is the bootstrap — the
active team (`df-select-team`), the working branch and its project item, and the
three domain context files (`df-team-context-bootstrap`) — plus the
**targeted** reads the scenario skill
names for the specific change: the relevant config files in the repo checkout
(the named spec's `.json`/`.sql`, the specific `kpi-definitions/<kpi-slug>.json`,
`view.json`/`widget.json` — see `df-dashboard-source-code`). Do not dump full
schemas, the whole `transformation-specs/` folder, or the draft diff into the
plan phase; the build phase loads those at the step that uses them.

## Step 2 — Gather Missing User Inputs

Each entry point has scenario-specific required inputs (see the relevant
scenario skill — `df-pipeline-update`).
If the user — or, for `/df-implement-project-item`, the project item's spec —
has not supplied an input that the plan needs, **ask for it before writing the
plan**. Do not invent answers.

## Step 3 — Write the Plan

Produce a plan in this shape:

```
## Context
<2–4 sentences: what the user asked for, what state the team is in. Name the
working branch, and the project item's url when the branch implements one.>

## Goal
<One sentence: the concrete outcome of this workflow.>

## Required inputs
- <input>: <value or "MISSING — need to ask user">

## Issues
- <numbered task list, naming specific issues or objects/fields that don't exist in source connectors, but are needed to complete this work>

## Phase breakdown

### Build
- <numbered task list, each task naming the skill and the files or tools involved>

### Validate
- <numbered task list>

### Update context
- <numbered task list, naming the context files to be created or updated (typically `customer-domain.md`, `data-domain.md`, and/or `application-domain.md`)>

## Items to change
- <list config items (Dashboard Data Model Table names, Transformation
  Spec names, KPI Definition names, widget/view IDs) and context
  files>

## Verification
- <how to confirm the workflow succeeded — what the user should see in the
  draft pipeline run outcome and the context files>
```

Do not use workarounds in the plan - when there are issues or blockers, note them in the "Issues" section and call out the missing inputs in the "Required inputs" section. The plan should be a clear, honest assessment of what it will take to get from the current state to the goal, even if external blockers need to be resolved first.

### Plan the transformation-spec layers

When the work involves transformation specs, plan the **Gold Table layers of
abstraction** up front: a spec can read any Bronze Table and/or any other Gold
Table, and the pipeline builds them in dependency order (acyclic). List the
new/changed Gold Tables roughly in dependency order in "Items to change". Read
`df-data-pipeline-manager` → `references/layering.md` for the full layering and
data-contract guidance, including its "Planning layers" section.

## Build tasks are repo edits

The pipeline config and its source all live as files in the team's connected GitHub repo, checked
out locally: the structural config (data model, Transformation Spec and KPI Definition metadata,
views, widgets, pipeline settings) as JSON descriptors, Transformation Spec and KPI SQL as `.sql`
files, custom view/widget code as a per-folder Vite + TS + React project under `src/`, and context
files under `context/`. Build tasks edit these files **directly** in-session on the working branch:
edit the file, validate SQL via `validate_sql_query`, run `npm run build` at the repo root
(validates the config, builds all views/widgets, and assembles the one committed build output the
platform reads). The plan names the files/artifacts to touch; see
the `df-dashboard-source-code` skill for the repo layout, slug rule, file shapes, and build/host
contract. Once pushed, the changes reach the team's `draft` branch for preview — directly when the
working branch is `draft`, or when the working branch merges into it — then are published through
the normal draft flow.

## Step 4 — Exit Plan Mode

After the user approves the Plan, call `ExitPlanMode` and hand control to the appropriate
build phase (described in the scenario skill).

## When the Plan Itself Reveals a Mismatch

If reading team state shows the request is the wrong scenario (e.g., the user
typed `/df-update` but the team is empty), say so in the plan and route to the
correct scenario skill — do not silently switch entry points without
acknowledging it.
