---
name: df-data-pipeline-manager
description: Use this skill to manage DataFabrIQ Data Pipelines. Read, modify, and update Dashboard Data Models, Transformation Specs for Dashboard Data Model Tables, and Dashboards, Dashboard Views, KPI Definitions and Widgets by editing the pipeline config files in the team's connected GitHub repo. Transformation Specs define SQL queries that build Gold Data for each Gold Table from Bronze Data and/or other Gold Tables — so specs can be layered into data contracts and run in dependency order. Use when the user asks about datafabriq, Dashboard Data Models, Transformation Specs, data mappings, Dashboards and KPI Definitions and Widgets, or wants to modify these in their Data Pipeline.
---

# DataFabrIQ Data Pipeline Management

Manage the full data pipeline: dashboard data model setup, transformation
specs, and KPI definitions/views/widgets. The pipeline config is files in the
team's connected GitHub repo, checked out locally — reading config means
reading those files, and changing config means editing them and running the root
`npm run build`.
The datafabriq MCP tools support the work with schema context, queries,
validation, and pipeline operations. For the entity model see the read-only
`df-data-pipeline` skill and `df-datafabriq-concepts`; this skill covers how to
**change** each part.

Edits become the **Draft** pipeline once they reach `draft` — pushed to it, or
merged into it from the working branch; until then, the platform still sees the
previous draft. Read/query tools take
`schema_type` (`"active"` default, `"draft"`). See `df-datafabriq-concepts`.

## References — load at the step that needs them

| Reference | Read it when |
|---|---|
| `references/layering.md` | Designing Gold Table layers, adding an intermediate Table, factoring shared spec logic, or removing a layered Table |
| `references/transformation-spec-format.md` | Creating, renaming, or deleting a spec's `transformation-specs/<outputTable>.json` (file shape, rename/delete rules) |
| `references/kpi-queries.md` | Creating or modifying KPI Definitions (base/live query design, `mv_<kpi_name>`, parameters, result types) |
| `references/tools-and-runs.md` | The supporting MCP tools, the Ops App Object tools, uploading a new version of a Custom Files file, and pipeline-run/debounce behavior |

## Workflow — load context just-in-time at each step

### 1. Understand the data involved

Load only what the change touches: read
`data-pipelines/main/data-model/model.json` and the
`data-model/tables/<table-name>.json` files for the current Gold schema;
`get_bronze_schema_context` (plus `run_query` with `schema: "bronze"` to sample Column
values) only when writing or changing a spec that reads those Bronze tables.

### 2. Set up or modify the Dashboard Data Model

- Add/modify Tables and Columns: create or edit
  `data-model/tables/<table-name>.json` (file name = the Table's snake_case
  `name` verbatim).
- Descriptions only: edit `description` in `data-model/model.json` (overall)
  or in the Table's `data-model/tables/<table-name>.json` (per-table).
- **When you remove a Table**, also delete its spec's
  `transformation-specs/<outputTable>.json` and `.sql` files as part of the same
  change — first check nothing else references the Table
  (see `references/layering.md`).

### 3. Build Transformation Specs

Read the existing spec's metadata first
(`data-pipelines/main/transformation-specs/<outputTable>.json`). The SQL lives
in the repo — edit
`data-pipelines/main/dashboard/src/data-layer/queries/transformation-specs/<outputTable>.sql`
directly, validate with `validate_sql_query` until clean, then build (see
`df-dashboard-source-code`). The SQL's column aliases
must match the Table's Column names exactly. The `.json` file carries only the
non-query metadata — see `references/transformation-spec-format.md`.

A spec may read Bronze Tables, other Gold Tables, or both — prefer layering
over re-deriving from Bronze (`references/layering.md`). Use the
connector skills (df-hubspot, df-stripe, df-salesforce, df-netsuite, df-quickbooks, df-maxio) for
source-platform concepts, and `df-ad-hoc-queries` for SQL patterns and defensive
casting.

### 4. Add KPI Definitions, Dashboard Views, and Widgets

Read granularly from the repo: `dashboard/dashboard.json` (name),
`views/<view-slug>/view.json`, `views/<view-slug>/<widget-slug>/widget.json`,
and `kpi-definitions/<kpi-slug>.json` for the specific items. Modify by
editing the files (shapes in `df-dashboard-source-code` →
`references/structural-config.md`):

- **KPI Definition** — add: create `kpi-definitions/<kpi-slug>.json` (fresh
  UUID `id`) plus its `-base.sql`/`-live.sql` (and `-drilldown.sql`) files;
  update: edit the files, never change the `id`; remove: delete the `.json`
  and all its `.sql` files together.
- **Widget** — add: create `views/<view-slug>/<widget-slug>/widget.json`
  (fresh UUID `id`; folder name = slug of the title); remove: delete the whole
  `<widget-slug>/` folder.
- **View** — add: create `views/<view-slug>/view.json` (fresh UUID `id`;
  folder name = slug of the name); remove: delete the whole `<view-slug>/`
  folder (removes its widgets too).

For KPI base/live query design see `references/kpi-queries.md`; for custom
view/widget code see `df-custom-dashboard-view` / `df-custom-widgets` and
`df-dashboard-source-code`.

## Ops App Object Types (stateful ops app objects)

An Ops App Object Type is a team-declared object type that custom view code
reads and writes at runtime via the `opsAppObjects` host API (see
`df-custom-dashboard-view`; widgets do not have access). Each type is one file:
`data-pipelines/main/objects/<table_name>.json` — the file name IS the type's
snake_case table name, which is its unique id (no UUIDs; never generate one).
Every type has the same shape, declared with `definitionVersion: 1`: a JSON
Schema subset (`schema`) its documents are validated against, a required
`sequenceField` naming a required root property typed `integer` or `string`
with `format: date-time | date`, an optional `listProjection` (the root
property names that list and query reads return), and an `ingestToBronze`
flag (default `false`). With `ingestToBronze: true` — supported only for a
flat schema of root primitive properties with snake_case names, never the
reserved `id`/`sequence_number`/`change_number` — the built-in OpsAppObjects
connector ingests the type to bronze as `opsappobjects_<table_name>`, so
Transformation Specs can layer Gold Tables on app-written data. Every other
type lives in the object store and is served to views directly. A descriptor
without `definitionVersion` is the legacy `fields` form: the build and the
platform migrate it on the fly, and `/df-migrate-legacy-components-in-repo`
rewrites it in the repo.

**Deciding on `ingestToBronze`:** set it `true` only when the state must flow
into the data pipeline (bronze → Gold Tables → KPI queries and Transformation
Specs), and shape that type flat; otherwise leave it `false`, nest the schema
as the app needs, and model one document per user-facing unit. Full shape and
rules: `df-dashboard-source-code` → `references/structural-config.md`.

**Versioning: definitions evolve additively only.** Object rows are stored
once per team, shared across active and draft configs, so once a type exists
the only permitted changes ADD to it — new optional properties (at any level)
or grown `enum` lists — and every change must increment the descriptor's
`versionNumber` in the same edit. The table name and `sequenceField` are
immutable; the descriptor file is permanent; existing properties keep their
names, types and `required` status; `listProjection` and `ingestToBronze`
change only with a version bump. Violations make reads, writes, and ingestion
for the table fail until the descriptor is fixed. Full invariants and semantics:
`df-dashboard-source-code` → `references/structural-config.md`.

## Where to Make Each Change

| Scenario | Files / tools |
|----------|---------------|
| Single Table's spec | Read/edit `transformation-specs/<outputTable>.json` and its `.sql` file |
| Removing a spec | Delete the spec's `.json` and `.sql` files together (always when its Gold Table is dropped) |
| All specs / multiple Tables | List and read the `transformation-specs/` folder |
| What source data is available | `get_source_connector_schemas` |
| New version of a Custom Files source file | `create_custom_file_upload` → run the returned `curl` command → `complete_custom_file_upload`, then a Custom connector sync ingests it (see `references/tools-and-runs.md`) |
| Target Table structure | Edit `data-model/tables/<table-name>.json` (when removing a Table, also delete its spec files) |
| Model descriptions | Edit `description` in `data-model/model.json` / `data-model/tables/<table-name>.json` |
| Views | Create `views/<view-slug>/view.json` / delete the `<view-slug>/` folder (deletes its widgets too) |
| KPIs and visualizations | Read/edit `kpi-definitions/<kpi-slug>.json` (+ paired `.sql` files), `view.json`, and `widget.json` |
| Ops App Object Types for stateful custom views | Create/edit `data-pipelines/main/objects/<table_name>.json` (see the Object Types section) |
| Reading or writing a type's objects from the session | The `*_ops_app_object*` MCP tools (see `references/tools-and-runs.md`) |

After any config change: run the root `npm run build`;

## Best Practices

1. **Always read before updating** — check current state in the repo files.
2. **Match Column names exactly** — SELECT aliases must equal the Table's Column names.
3. **Sample Bronze Data first** — verify Column values and types with `run_query` (`schema: "bronze"`) before writing a spec.
4. **Handle nulls at the transformation layer** — COALESCE/CASE in specs so Gold is clean.
5. **Layer specs into data contracts** — see `references/layering.md`; keep references acyclic.
6. **Document reasoning** — explain mapping decisions in the spec's `reasoning` field.
