---
name: df-pipeline-update
description: Orchestrates a change to an existing DataFabrIQ team's pipeline or dashboard — new or modified metrics, transformations, KPI definitions, dashboard views, widgets, or context. Drives the plan → build → validate → update-context → review & push sequence end-to-end on the session's working branch, loading skills and schema context step-wise as each phase needs them, and committing and pushing only at the end, after the developer reviews. Use this skill (or its entry points `/df-update` and `/df-implement-project-item`) when the team already has a published pipeline and the user is requesting a specific change, or an Idea1 project item's spec describes one.
---

# DataFabrIQ Pipeline Update

Runs the standard workflow `plan → build → validate → update-context → review & push`
(see `df-datafabriq-concepts`), scoped to the specific change the user asked for on a
team that already has a published Data Pipeline. This is a focused edit, not a full
rebuild — load only the context each phase needs, when it needs it.

**Nothing is committed or pushed until Phase 5.** Phases 2–4 leave every change in
the working tree so the developer can review it. The workflow then makes a single
commit and push of the working branch (see `df-team-context-bootstrap`). The
platform reads only pushed commits, and builds the Draft configuration from
`draft`, so the gold pipeline run and its output are verified once the change
reaches `draft`.

The companion entry points are the `/df-update` slash command (a change the user
describes) and the `/df-implement-project-item` slash command (the spec in an
Idea1 project item's description); both put Claude in plan mode and route here.

## Preconditions (bootstrap already done)

Before this skill runs, the entry point has already:

1. Established the active team (`df-select-team`).
2. Identified the working branch and the project item it implements, if any, and
   read the three domain context files per `df-team-context-bootstrap` —
   `context/customer-domain.md`, `context/data-domain.md`,
   `context/application-domain.md`.
3. Clarified what to change — with the user, or from the project item's spec.

If any of these are missing, do them now before Phase 1.

## Phase 1 — Plan

Make sure your are in Plan mode.

Invoke the `df-plan-phase` skill, scoped to the requested change.

**Read only the objects being changed** — the domain files plus targeted reads
are the plan's input:

- Dashboard-related change → list the repo's `dashboard/views/` and
  `dashboard/kpi-definitions/` folders for IDs and names, then read the
  specific `kpi-definitions/<kpi-slug>.json` / `widget.json` files named.
- Transformation change → the named Gold Table's
  `transformation-specs/<outputTable>.json` and its `.sql` file from the repo.
- Custom-code change → the specific view/widget source files from the repo.

**Do not** call `get_source_connector_schemas` or `get_bronze_schema_context`,
and do not read the full data model, or all specs in this
phase — schema context loads in the build phase, at the step that writes SQL
against it. Narrow exception: if the plan cannot name its targets without
schema knowledge (e.g. "does a column for this exist?"), load the single
narrowest read that answers it.

The Plan phase ends when the user has approved the plan and you are in auto mode or any mode besides plan mode - in a mode that will allow edits. Then you can move to the Build phase.

## Phase 2 — Build

To start the Build phase, the user should have already approved the plan and should be in auto mode.

Load skills and schema context by the scope of the change — this is where the
heavier context belongs:

| Change scope | Skills to load | Context to load now |
|---|---|---|
| New or modified metric / KPI | `df-data-pipeline-manager` (+ its `references/kpi-queries.md`)  | Gold model via the repo `data-model/` files. A KPI base query reads **only Gold Tables, never Bronze** — if the metric needs data not yet in Gold, add/extend a Transformation Spec first |
| Transformation spec change | `df-data-pipeline-manager`, plus the relevant source connector skill | `get_bronze_schema_context` for the source tables involved; sample with `run_query` (`schema: "bronze"`) |
| New intermediate Gold Table (layering) | `df-data-pipeline-manager` → `references/layering.md` | The repo `data-model/` files, plus bronze context if the new layer reads Bronze |
| Removing a Gold Table / model object | `df-data-pipeline-manager` | The `transformation-specs/` folder and spec `.sql` files — first check no other spec references the Table (removing an upstream layer breaks specs that read it). Delete the Table's `data-model/tables/<table-name>.json` and its spec's `.json` and `.sql` files together |
| Dashboard view structure | `df-data-pipeline-manager` | The repo `dashboard/views/<view-slug>/` files (`view.json`, `widget.json`) |
| Custom widget code | `df-custom-widgets` → `df-dashboard-source-code` | The widget's source folder and bound KPI |
| Full-view custom render | `df-custom-dashboard-view` → `df-dashboard-source-code` | The view's source folder and its KPIs |
| New version of a Custom Files source file | `df-data-pipeline-manager` → `references/tools-and-runs.md` | None — `create_custom_file_upload` → run the returned `curl` command → `complete_custom_file_upload`. No repo edit; the new data lands in Bronze on the next Custom connector sync, then flows through existing specs |
| Context-only edit | Skip directly to the update-context phase | — |

When a change adds repeated cleaning/joining/derivation logic, prefer factoring
it into a shared lower-layer Gold Table rather than duplicating the SQL — see
`df-data-pipeline-manager` → `references/layering.md` for the full layering and
data-contract guidance (dependency order, acyclic references, bare-name
references).

All builds are local repo edits on the working branch, pushed once in Phase 5:
transformation-spec and KPI
SQL is edited as `.sql` files and validated with `validate_sql_query`; object
metadata lives in the paired JSON descriptors (`widget.json`, `view.json`,
`kpi-definitions/<kpi-slug>.json`, `transformation-specs/<outputTable>.json`);
custom view/widget code is edited in its source folder.

**Before moving to Phase 3: run the root `npm run build`** (see
`df-dashboard-source-code`). Phase 2 ends at a green root build with everything
still uncommitted — do not commit or push.

Only the parts of the build necessary for the requested change should run.

## Phase 3 — Validate locally

Everything checkable without the platform, checked now — the gold pipeline cannot
see the change until Phase 5 pushes it.

- Every edited `.sql` validates clean with `validate_sql_query` against the team's
  dialect. Validate a KPI's `base`, `live`, and `drilldown` queries together as a
  labeled batch so the result names the failing file.
- The root `npm run build` succeeds. Its config validation is the structural check:
  naming/id/reference rules, JSON syntax, widget→KPI references, missing spec SQL,
  and every custom view/widget type-checking and bundling cleanly.
- Sanity-read what you changed — a spec's SQL against the bronze columns it reads
  (`get_bronze_schema_context`, `run_query` with `schema: "bronze"`), a KPI query
  against the Gold Tables it reads.

Fix and re-run until both are clean. Gold-pipeline verification against the draft
schema happens once the change reaches `draft` (Phase 5).

## Phase 4 — Update Context

Invoke the `df-update-context-phase` skill and update the three domain files:

- `customer-domain.md` — customer and business-domain terms, definitions, and requirements.
- `data-domain.md` — how data are modeled: data contracts, schema design, the flow from Bronze to Gold and through higher layers, and each metric's semantic meaning and calculation definition.
- `application-domain.md` — how dashboard views and widgets function and how the UX workflows and UI behave.

## Phase 5 — Review, push, and verify

This is the only phase that writes to the remote. Do not commit or push before it.

1. **Hand the change to the developer.** Summarize what changed and why, then show
   them the changed-file list (`git status --short`) and the diff.
2. **Wait for explicit approval.** Not a rhetorical check-in — do not commit or
   push until they say to proceed. If they want changes, go back to Phase 2.
3. **One commit, one push.** Commit the sources and
   `data-pipelines/main/build-output/pipeline-config.json` together on the
   working branch, then push it (`git push origin <working-branch>`, with `-u`
   when the branch has no upstream yet). When the branch implements a project
   item, the commit message references the item's url. If the push is rejected
   as non-fast-forward, `git pull --no-rebase origin <working-branch>` and push
   again; when the pull has conflicts, stop and tell the developer. Never
   force-push. No pull request, no new branch.
4. **Verify the gold run once the change is on `draft`.** A push to `draft` that
   touches spec SQL, the data model, or spec metadata schedules a gold pipeline
   run on a 30-second debounce; there is no separate trigger step. A push to any
   other working branch schedules no run: the change reaches the Draft
   configuration when the branch merges into `draft` — for a project item's
   branch, through the Idea1 workflow's pull request (e.g. `idea1
   next-workflow-step`), which this workflow does not open. Tell the developer
   that, and verify the run the merge schedules when they ask.

   `get_pipeline_run_status` (`dataPipelineConfigurationId: "draft"`) reports a run's `Status` (`InProgress` / `Completed` / `Failed`) and `Stage`. A status read during the debounce window reflects whatever run preceded this push, not the one it scheduled.

   `Stage: Cancelled` means a newer push superseded this run before it finished — its `Status` still reads `Failed`, but that's the superseded run's outcome, not this push's; the run this push scheduled is the one still in progress.

   A completed run's `Specs Executed` and `Records Transformed` describe what the run actually did. A `Completed` run touching noticeably fewer specs or records than the change should have produced is a signal the push didn't change what's committed.

   `get_gold_schema_context`, `run_query`, and `get_widget_data` (`schema_type: "draft"`) verify a completed run's output against draft — schema structure, ad hoc rows, and a specific widget's computed result, respectively.
5. **If verification fails**, it traces back to the underlying file — spec SQL,
   data model, or KPI query. Fix that file on the working branch, re-run the root
   build, show the developer the new diff, and push a follow-up commit; once it
   is on `draft` it schedules its own new run to check the same way. A fix after
   verification is a second commit; that is expected, not a failure of the
   process.

## Publishing

This skill does not auto-publish. After the five phases:

1. The draft → main PR holds all changes made to the draft config since the last
   published config; verified output against draft is what "ready to publish" means.
   A working branch other than `draft` joins it once the branch merges into `draft`.
2. Summarize the changes in the draft → main PR for the user.
3. Direct the user to publish in the web app when ready.
