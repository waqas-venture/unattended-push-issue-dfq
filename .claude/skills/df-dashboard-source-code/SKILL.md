---
name: df-dashboard-source-code
description: Use this skill to edit the DataFabrIQ pipeline config, which lives as source files in the team's connected GitHub repo (checked out locally) — the structural config (dashboard views/widgets/KPI definitions, data model, transformation specs, pipeline settings), KPI Definition and Transformation Spec SQL queries, context files, and custom dashboard view and widget code. Covers the repo layout and working-branch workflow; its references cover the JSON descriptor shapes, the exact file paths and KPI name→filename slug rule, validating SQL with validate_sql_query, and building custom views/widgets with the per-view Vite + TypeScript + React project and the host code contract. Use whenever a change targets the pipeline config or repo-stored pipeline source.
---

# Dashboard Source Code

Repo-stored DataFabrIQ artifacts — SQL queries, context files, and custom
view/widget code — are edited **directly in the team's connected GitHub repo**,
which is checked out locally in this session (locate it per
`df-team-context-bootstrap`). Make the file changes, validate, and build.

## Working rules

- **Each change request is self-contained.** Work only with files in the repo checkout.
- **Work on the working branch** — the branch checked out when the workflow
  started (see `df-team-context-bootstrap`): `draft`, or a branch cut from
  `draft`, such as an Idea1 project item's branch. Active config → `main`;
  draft config → `draft`. Never make changes on `main`.
- **Committing and pushing is owned by the orchestrating workflow.** Make the
  file changes, validate, and run the root `npm run build`;
- **Never open pull requests, never create or switch branches.** A branch cut
  from `draft` reaches it through the Idea1 workflow's pull request; the user
  publishes the draft, which merges it into `main`.
- **Only modify files under `data-pipelines/main/` and `context/`.**
  Never edit the platform-owned build kit under
  `data-pipelines/main/dashboard/build/` or the mini-app templates under
  `data-pipelines/main/dashboard/templates/` — the platform owns them. Copy a
  template into a view/widget folder to start new work; don't edit the template
  in place (an `npm install` in the build kit is local-only).
- **Create files that don't exist** when the artifact is new.
- **You own every repo write.** The repo files ARE the pipeline config — the
  repo is the single source of truth and your file edit IS the change. Keep the
  repo consistent.
- **Build after every change: `npm run build` at the repo root.** The repo build
  builds every custom view/widget project into that folder's gitignored
  `dist/index.js`, validates everything (every object type descriptor
  included), emits the object type declarations view code compiles against,
  and assembles the config — embedding those built bundles — into
  `data-pipelines/main/build-output/pipeline-config.json`.
  That artifact is the **only** committed build output, and the only thing the
  platform reads. Never hand-edit anything under
  `data-pipelines/main/build-output/`.
- Custom code lives in the folder's Vite project under `src/`; its build output is `dist/index.js`, which is gitignored and reaches the platform only inside the artifact.

## Repo layout

Paths are constants from the platform (`DashboardGitStoreBase`):

| Artifact | Path |
|----------|------|
| Pipeline settings | `data-pipelines/main/pipeline.json` |
| Dashboard name | `data-pipelines/main/dashboard/dashboard.json` |
| View descriptor | `data-pipelines/main/dashboard/views/<view-slug>/view.json` |
| Widget descriptor | `data-pipelines/main/dashboard/views/<view-slug>/<widget-slug>/widget.json` |
| Custom view code | `data-pipelines/main/dashboard/views/<view-slug>/src/**` (Vite + TS + React project) |
| Custom widget code | `data-pipelines/main/dashboard/views/<view-slug>/<widget-slug>/src/**` |
| KPI Definition metadata | `data-pipelines/main/dashboard/kpi-definitions/<kpi-slug>.json` |
| Data model | `data-pipelines/main/data-model/model.json` + `data-pipelines/main/data-model/tables/<table-name>.json` |
| Ops App Object type definition | `data-pipelines/main/objects/<table_name>.json` (file name = table name = the type's unique id; a JSON Schema plus `sequenceField`, optional `listProjection` and `ingestToBronze`) |
| Generated object type declarations (gitignored build output) | `data-pipelines/main/dashboard/build/pipeline-build/dist/ops-app-object-types.d.ts` — ambient in every view project via its `tsconfig.json` `include` |
| Transformation Spec metadata | `data-pipelines/main/transformation-specs/<outputTable>.json` |
| Transformation Spec query | `data-pipelines/main/dashboard/src/data-layer/queries/transformation-specs/<outputTable>.sql` |
| KPI Definition queries | `data-pipelines/main/dashboard/src/data-layer/queries/kpi-definitions/<kpi-slug>-base.sql`, `-live.sql`, `-drilldown.sql` |
| Context files | `context/<path>` (repo root) |
| Build output (generated — never hand-edit) | `data-pipelines/main/build-output/pipeline-config.json` |

Correlation back to the model is **by filename/folder** — SQL and code files
pair with their JSON descriptor by shared key (KPI name slug, spec
`outputTable`, view/widget folder). These files are the source of truth for the
whole structural config: the platform assembles the runtime dashboard, data
model, and mapping configuration directly from the artifact the build assembles
out of them (cached by commit).

## References — load for the artifact you're editing

| Reference | Read it when |
|---|---|
| `references/structural-config.md` | Editing the structural config JSON descriptors — file shapes, id/UUID rules, create/delete-as-a-unit rules, ops app object type definitions (the JSON Schema subset, deciding on `ingestToBronze`, versioning invariants), and the root-build requirement |
| `references/sql-queries.md` | Editing/deleting Transformation Spec or KPI `.sql` files — exact file paths, the KPI name→slug rule, and the validate-then-build loop with `validate_sql_query` |
| `references/custom-code.md` | Creating or editing custom view/widget code — authoring modes, host code contract and TypeScript shapes (the typed `opsAppObjects` data layer and the build-generated object types), the platform Vite template, and the build step |

## Editing context files

Context files live under `context/<path>` at the repo root (markdown, csv,
json, or binary). Edit the file in place, or create it (with any intermediate
folders) if it doesn't exist. Preserve unrelated content — read before you
write. No build or validation step is needed for context files; the orchestrating
workflow commits them with everything else.

## Finishing

After all edits for the request: SQL queries validate clean and the root
`npm run build` succeeds. List the changed files (`git status --short`) and
return to the orchestrating workflow, which decides how the change is
committed and pushed.
