---
name: df-data-pipeline
description: Read-only guide to how a DataFabrIQ Data Pipeline works and what its entities are — Bronze Data, Transformation Specs, Gold Data (the Dashboard Data Model), KPI Definitions, Dashboard Views and Widgets — so you have the context to query and inspect each part. Use when you need to understand the pipeline's structure before querying or analyzing it. To modify any of these, the full DataFabrIQ plugin's `df-data-pipeline-manager` skill is needed.
---

# DataFabrIQ Data Pipeline (Model & Read Context)

This skill explains how the entities of a DataFabrIQ Data Pipeline fit together
so you can query and inspect each part. It is **read-only** — to change the
pipeline, see the `df-data-pipeline-manager` skill (available in the full
DataFabrIQ plugin). For the canonical glossary and skill map, see
`df-datafabriq-concepts`; for the read-tool selection table, see
`df-data-pipeline-viewer`; for SQL query construction, see `df-ad-hoc-queries`.

## High-Level Pipeline Pattern

```
Bronze Data (source connector data) → Transformation Specs → Gold Data (Dashboard Data Model) → KPI Definitions → Dashboard Views → Widgets
```

- **Bronze Data** — raw data ingested from connected source platforms or a team's platform data, organized
  into per-source Tables and Columns. The starting point for any query into
  source data. All Bronze columns are strings — defensive casting required
  (see `df-ad-hoc-queries`). Team-declared Ops App Object Types (stateful objects written by custom views) that set `ingestToBronze` are ingested into Bronze via the built-in OpsAppObjects connector as `opsappobjects_<table_name>` Tables, with typed columns per the schema's root properties; every other Ops App Object Type lives in the object store (see `df-datafabriq-concepts`).
- **Transformation Specs** — SQL queries that map source data into Gold Data
  Columns; one spec produces one Gold Table. A spec reads Bronze Tables and/or
  other Gold Tables, so specs are **layered** and run in dependency order
  (acyclic) — an intermediate Gold Table may exist only to feed downstream
  specs, not KPIs. Details in `df-datafabriq-concepts` → "Key mechanics".
- **Gold Data (Dashboard Data Model)** — the cleaned, unified, typed Tables and
  Columns that specs populate and KPI queries compute against.
- **KPI Definitions** — the application-facing queries that compute business
  metrics from Gold Data. The Base Query materializes to `mv_<kpi_name>`; the
  Live Query reads that view with `@paramName` parameters. KPI queries never
  read Bronze directly. Query the KPI's results via `mv_<kpi_name>` (see
  `df-ad-hoc-queries`).
- **Dashboard Views / Widgets** — a dashboard contains views; each view contains
  widgets (or is rendered by custom code). A custom view's code replaces the
  widget grid; a custom widget's code replaces the built-in renderer. Custom
  code is repo-managed; a view or widget has custom code when its repo folder is a
  Vite + TypeScript + React project (a `package.json` and `src/`).

## Active vs Draft

Every team has an **Active** (published) and a **Draft** (work-in-progress)
pipeline configuration. Read and query tools accept `schema_type` — `"active"`
(default) or `"draft"`. Use `"draft"` to inspect or query work-in-progress
pipeline data.

## Inspecting the pipeline

The pipeline config is files in the team's connected GitHub repo, checked out
locally — reading the config means reading these files (see `df-data-pipeline-viewer`
for the full path map): the Dashboard Data Model under
`data-pipelines/main/data-model/`, Transformation Spec metadata under
`data-pipelines/main/transformation-specs/` (SQL under
`.../dashboard/src/data-layer/queries/transformation-specs/`), and the dashboard's
views, widgets, and KPI definitions under `data-pipelines/main/dashboard/`.

The remaining read tools: `get_source_connector_schemas` (active Connector
Sources and their bronze schemas). Load schema context only when the task actually needs it:
`get_bronze_schema_context` for Bronze queries (see `df-bronze-data-analysis`),
`get_gold_schema_context` for Gold queries (see `df-business-metrics-analysis`).

## Making changes

This skill is read-only. To update the Dashboard Data Model, Transformation
Specs, KPI Definitions, Dashboard Views, or Widgets — and for guidance on
constructing their queries and code — use the `df-data-pipeline-manager` skill in
the full DataFabrIQ plugin.
