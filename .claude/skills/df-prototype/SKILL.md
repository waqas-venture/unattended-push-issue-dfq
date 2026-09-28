---
name: df-prototype
description: Orchestrates a quick prototype dashboard view for a DataFabrIQ team — a React mock-up rendered as a custom dashboard view, backed by static mock data embedded in TypeScript or by simple CSV/XLSX mock data uploaded through the Custom Files connector. Drives a light plan → build → validate → update-context → commit & push sequence with a small context load, and commits and pushes the session's working branch automatically after every build iteration. Also covers iterating on a standalone static `.html` mock-up and converting it into a real view at any point. Use this skill (or its entry point `/df-prototype`) when the user wants a fast, iterative UI or workflow prototype with mock or minimal data — not production data modeling or transformation work (that is `df-pipeline-update`).
---

# DataFabrIQ Prototype

Run a lightweight `plan → build → validate → update-context → commit & push`
workflow (see `df-datafabriq-concepts`) that turns a mock-up into a real,
interactive **prototype dashboard view** running in the team's draft dashboard.
The goal is a quick turnaround for customer feedback and rapid refinement —
small context, few skills, mock data, no complex data modeling.

**Commits and pushes the working branch automatically at the end of every
build iteration.** There is no developer review gate. The working branch is the
one checked out when the workflow started (see `df-team-context-bootstrap`) —
never `main`, never a new branch, never a pull request, never a force-push. The
draft dashboard shows the prototype once it is on `draft`: at every iteration
when the working branch is `draft`, or once the working branch merges into it.

The companion entry point is the `/df-prototype` slash command, which
bootstraps, puts Claude in plan mode, and routes here.

## Scope

In scope:

- Custom dashboard views as prototypes, each a per-view Vite +
  TypeScript + React project (see `df-custom-dashboard-view` and
  `df-dashboard-source-code`).
- Mock data in one of two **data modes**:
  - **Static** (default) — data embedded in the view as typed TypeScript in
    `src/mockData.ts`. No KPIs, no data model, no pipeline.
  - **Mock pipeline** — CSV/XLSX mock data uploaded through the **Custom Files**
    connector into Bronze, one minimal Gold Table per file/sheet, and one
    Tabular KPI per table that the view reads through `fetchKpiData`. See
    `references/mock-data-pipeline.md`.
- Users may provide a standalone static `.html` mock-up (HTML-first mode), where you will
  convert it into a view. See
  `references/mockup-porting.md`.

Out of scope: connector data modeling, layered Gold Tables, KPI parameterization,
validation test suites, and widgets (prototypes are always full custom views).

## Preconditions (bootstrap already done)

Before this skill runs, the entry point has already:

1. Established the active team (`df-select-team`) and called
   `start_workflow_entry_point`.
2. Located the team repo and its working branch, identified the branch's
   project item, and read `context/customer-domain.md`,
   `context/data-domain.md`, `context/application-domain.md` **if they exist**
   (`df-team-context-bootstrap`). Missing files are normal for a prototype team
   and are created in Phase 4 — do not block on them.
3. Collected the inputs below.

## Inputs

Ask for anything missing before planning — do not invent it:

1. **Mock-up source** — a path to an existing static `.html` prototype (read the
   whole file), and/or a written description or screenshot.
2. **Working mode** — *HTML-first* (iterate on the `.html` only, convert later)
   or *view now* (build the DataFabrIQ view immediately).
3. **View name** — the folder is its slug (lowercase; runs of non `a–z0–9` →
   single `-`; trimmed; see the slug rule in `df-dashboard-source-code` →
   `references/sql-queries.md`). Needed once a view is being built.
4. **Data mode** — static or mock pipeline.

## HTML-first mode

When the user wants to keep working on the static `.html` before it becomes a
view:

- Edit that file in place and tell the user to reload it in their browser or view it in your preview viewer.
  Repeat per round of feedback.
- Keep it a **single self-contained file** — one `<style>` block, the data in
  one clearly delimited `<script>` block (for example `const DATA = {...}`), and
  the behavior as small render functions per section. That structure keeps the
  file shareable and makes the later conversion mechanical.
- No repo edits, no build, and no commit or push happen in this mode — the file
  is not part of the team repo. If the user wants it tracked, place it under
  `context/prototypes/<name>.html`; it then rides the next commit as a context
  artifact.
- At any point the user can ask to "turn this into a view": run the **Convert**
  procedure in `references/mockup-porting.md`, then continue from Phase 2 step 5.
  After conversion the `.html` is the design reference only — iterate on the
  view, not the file.

## Phase 1 — Plan (light)

Work through a simple plan with the user - — do **not** load
`df-plan-phase`, `df-data-pipeline-manager`, connector skills, or any schema
tool. Reads allowed: the mock-up file, the three `context/*.md` files, the
repo's `data-pipelines/main/dashboard/views/**` (names, ids, and
`order` only), and — only when editing an existing prototype — that view's
`src/` folder.

Produce a short plan:

```
## Context
<what the user asked for; what the mock-up shows; whether a view already exists>

## Goal
<one sentence>

## View(s)
- <view name> → `dashboard/views/<view-slug>/` (new | edit)

## Data mode
- static → `src/mockData.ts` with <tables/shapes>
  — or —
- mock pipeline → Custom Files: <file(s)/sheet(s)>; Gold Tables: <names>; KPIs: <names>

## Verification
- root `npm run build` green; working branch pushed; view visible in the draft dashboard once on `draft`
- (mock pipeline, once on `draft`) gold run completes; `get_widget_data` / `run_query` (`schema_type: "draft"`) return the mock rows
```

Ask for missing inputs first, and begin implementation once the user is happy with the plan.

## Phase 2 — Build

Load `df-custom-dashboard-view`, then `df-dashboard-source-code` and its
`references/custom-code.md`. Nothing else unless the mock-pipeline reference
below calls for it.

1. **Create the view project.** Copy
   `data-pipelines/main/dashboard/templates/v1/dashboard/` to
   `data-pipelines/main/dashboard/views/<view-slug>/` (never edit the template
   in place). Write `view.json` — `{ "id": "<fresh UUID>", "name": "<view
   name>", "order": <next after existing views> }`. For an existing prototype,
   edit its files in place.
2. **Port the mock-up** into the project per `references/mockup-porting.md`
   (the Convert procedure) — or build from the description using the same
   structure: `src/App.tsx` as the root, one component per section under
   `src/components/`, data in `src/mockData.ts`.
3. **Static mode:** type the data (`interface` per row shape) and export it from
   `src/mockData.ts`. No KPIs, no data model, no specs.
4. **Mock pipeline mode:** follow `references/mock-data-pipeline.md` end to end
   — write the CSV/XLSX, upload it through the Custom Files MCP tools, trigger
   the sync, add the minimal data model table(s), spec(s), and one Tabular KPI
   per table, and read the rows in the view with `fetchKpiData`.
5. **Run the root `npm run build`** and fix every type-check, bundle, or config
   error until it is green. Never move on with a failing build.

## Phase 3 — Validate (local)

- The root `npm run build` is green.
- Mock pipeline only: every `.sql` you wrote validates clean.

That is all. No validation suites and no pipeline runs before the push — the
platform reads only pushed commits.

## Phase 4 — Update Context

Invoke `df-update-context-phase`. Read each file before writing; create any that
do not exist (normal for a prototype team). Keep it short and specific:

- `context/application-domain.md` — the view, what it demonstrates, its
  interaction flow, and that it is a **prototype backed by mock data**.
- `context/data-domain.md` — the mock tables and columns and that they are
  mock; for the mock pipeline, the Custom Files connection names and the
  Bronze/Gold table and KPI names.
- `context/customer-domain.md` — the customer ask or feedback the prototype
  addresses, and open questions the next round should answer.

## Phase 5 — Commit & push (automatic)

The only phase that writes to the remote. Run it at the end of **every** build
iteration without asking:

```
git add -A data-pipelines/main context
git commit -m "prototype: <view name> — <one-line summary>"
git push origin <working-branch>
```

- Add `-u` to the push when the working branch has no upstream yet. When the
  branch implements a project item, the commit message references the item's url.
- If the push is rejected as non-fast-forward: `git pull --no-rebase origin
  <working-branch>` then push again; when the pull has conflicts, stop and tell
  the developer. Never force-push.
- Commit only `data-pipelines/main/**` (including the generated
  `build-output/pipeline-config.json`) and `context/**`. `dist/` and
  `node_modules/` stay gitignored.
- Never `main`, never a new branch, never a pull request.

When the working branch is `draft`, tell the user the view is live in the draft
dashboard — name the view and remind them to open the dashboard in draft mode.
On any other working branch, tell them the view reaches the draft dashboard when
the branch merges into `draft` (for a project item's branch, through the Idea1
workflow's pull request).

**Mock pipeline only:** a push to `draft` schedules a gold run on a 30-second
debounce; a push to any other working branch schedules none until it merges.
Poll `get_pipeline_run_status` (`dataPipelineConfigurationId: "draft"`) until
`Completed`, then spot-check with `get_widget_data` or `run_query`
(`schema_type: "draft"`). If it fails, fix the underlying file, re-run the root
build, commit, and push again — a follow-up commit is expected, not a failure.

## Iterating

Each round of feedback is Phase 2 → 5 again; re-plan only when the scope
changes. In HTML-first mode a round is "edit the `.html`, reload"; the session
switches to view iteration the moment the user asks to convert (Convert, then
Phase 2 step 5 onward).

- **Mock pipeline re-uploads** must keep the same headers in the same order; to
  change columns, upload under a new connection name and update the table, spec,
  and KPI (see `references/mock-data-pipeline.md`).
- **Graduating static → mock pipeline:** keep the component tree, replace the
  `src/mockData.ts` imports with `fetchKpiData` reads, then follow the mock
  pipeline reference.

## Publishing

This skill never publishes. When the customer accepts the prototype, the user
publishes the draft in the web app; a prototype can also stay in draft
indefinitely for further rounds.
