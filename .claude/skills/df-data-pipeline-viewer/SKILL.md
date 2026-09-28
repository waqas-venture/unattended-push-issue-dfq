---
name: df-data-pipeline-viewer
description: Use this skill to inspect and understand your DataFabrIQ data pipeline configuration. View the dashboard data model, source connector schemas, transformation specs, data mapping configuration, and dashboard KPI definitions and widgets. Use when the user asks about their pipeline setup, data model structure, transformation specs, or dashboard configuration.
---

# DataFabrIQ Data Pipeline Viewer

Inspect your DataFabrIQ Data Pipeline configuration. The pipeline follows this flow:

```
Bronze Data (Connector Source data) → Transformation Specs → Gold Data (Dashboard Data Model) → KPI Definitions → Dashboard Views → Widgets
```

## Where the Configuration Lives

The pipeline config is files in the team's connected GitHub repo, checked out locally — inspecting the config means reading these files:

| Config | File(s) |
|--------|---------|
| Pipeline settings | `data-pipelines/main/pipeline.json` |
| Dashboard Data Model | `data-pipelines/main/data-model/model.json` + `data-pipelines/main/data-model/tables/<table-name>.json` |
| Transformation Spec metadata | `data-pipelines/main/transformation-specs/<outputTable>.json` |
| Transformation Spec SQL | `data-pipelines/main/dashboard/src/data-layer/queries/transformation-specs/<outputTable>.sql` |
| Dashboard name | `data-pipelines/main/dashboard/dashboard.json` |
| Dashboard views | `data-pipelines/main/dashboard/views/<view-slug>/view.json` |
| Widgets | `data-pipelines/main/dashboard/views/<view-slug>/<widget-slug>/widget.json` |
| KPI Definitions | `data-pipelines/main/dashboard/kpi-definitions/<kpi-slug>.json` (SQL in the paired `.sql` files under `.../queries/kpi-definitions/`) |
| Ops App Object Types (stateful ops app objects — types that set `ingestToBronze` are ingested to Bronze as `opsappobjects_<table_name>`; the others live in the object store) | `data-pipelines/main/objects/<table_name>.json` |

## Available Tools

| Tool | Description |
|------|-------------|
| `mcp__datafabriq__get_source_connector_schemas` | Get all active Connector Sources and their bronze schemas (Tables, Columns, data types) |

## Where to Look

| You want to... | Where to look |
|----------------|---------------|
| See what Connector Source data is being ingested | `get_source_connector_schemas` |
| Understand the Dashboard Data Model structure | `data-model/model.json` and `data-model/tables/*.json` |
| See how Connector Source data maps to the Gold Data | The `transformation-specs/` folder (each spec's `.json` metadata and paired `.sql` query) |
| Inspect the SQL transformation for one Gold Table | `transformation-specs/<outputTable>.json` and `.../queries/transformation-specs/<outputTable>.sql` |
| View KPI Definitions and Widgets | `dashboard/kpi-definitions/<kpi-slug>.json` (+ paired `.sql` files), `views/<view-slug>/view.json`, and `<widget-slug>/widget.json` |
| See unpublished draft changes | PR of the draft -> main branches |

## Typical Exploration Flow

1. Start with `get_source_connector_schemas` to see what Connector Sources are connected and what data is available
2. Read `data-model/model.json` and the `data-model/tables/*.json` files to see the Gold Data Dashboard Data Model that Transformation Specs produce
3. Read a spec's `transformation-specs/<outputTable>.json` and its `.sql` query file to inspect how a specific Gold Table (e.g., `customers`) is built from Connector Source data
4. List `dashboard/kpi-definitions/` and `dashboard/views/` for a summary of KPI Definitions, views, and Widgets, then read the individual `.json` (and paired `.sql`) files for full details
