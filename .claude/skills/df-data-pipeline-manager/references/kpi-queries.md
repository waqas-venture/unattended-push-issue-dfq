# KPI Definition base and live queries

Read this when creating or modifying KPI Definitions.

KPI Definition queries are the **application-facing data interface into Gold
Data** — the counterpart to Transformation Specs, which build the Gold data
contracts (and may read Bronze and/or other Gold Tables, see
`references/layering.md`). Accordingly, a **KPI query reads only Gold Tables —
never Bronze Data directly**: turning raw Bronze into clean Gold is the specs'
job, and KPIs consume the finished Gold Tables. If a metric needs data not yet
in Gold, add or extend a Transformation Spec first.

## The two-layer query approach

Both queries are `.sql` files in the repo — `kpi-definitions/<kpi-slug>-base.sql`
and `<kpi-slug>-live.sql` (and `-drilldown.sql` if present), where `<kpi-slug>`
is the slug of the KPI's Name, per `df-dashboard-source-code`. Edit them directly
and validate each with `validate_sql_query`; the KPI's non-query metadata
(name, description, resultType, parameters, targetValue, metadata) lives in
`dashboard/kpi-definitions/<kpi-slug>.json`.

- **base query** — Pre-computes all data **from the Gold Data tables** (never
  from Bronze) into a materialized view named `mv_<kpi_name>`, where
  `<kpi_name>` is the KPI's Name lowercased and underscore-separated (see
  `df-ad-hoc-queries`). Has no parameter placeholders. Design it to pre-compute
  expensive joins and aggregations and store all fields the live query needs.
- **live query** — Queries the base query's output rowset — the `mv_<kpi_name>`
  materialized view — at runtime with `@paramName` placeholders (Synapse T-SQL
  parameter markers — always `@name`, never `:name`). Handles timeframe
  filtering, re-bucketing (e.g., monthly data → quarterly/annual view), and
  dynamic threshold application. All computations that depend on user-supplied
  values belong here, not in the base query.

When adding a KPI from a metrics group, copy both queries exactly from the
group's `kpi-definition.md` into the `.sql` files — do not modify them unless
adapting to a custom schema. The KPI's `parameters` array (in its
`<kpi-slug>.json`) defines the `@paramName` values that widgets pass at
runtime.

## Result types

Set `resultType` to match the output shape: `0` (Scalar) — single value;
`1` (SingleSeries) — one dimension + one value column; `2` (MultiSeries) — one
dimension + multiple value columns; `3` (Tabular).

## Custom-rendered views and widgets

Views and widgets can optionally carry self-contained React code that renders
in a sandboxed iframe — a custom view replaces the widget grid; a custom widget
replaces the built-in renderer. The code is repo-managed and edited directly —
see the `df-custom-widgets` and `df-custom-dashboard-view` skills and
`df-dashboard-source-code` for the file layout, build, and host contract. The
object's non-code metadata lives in its `view.json`/`widget.json` descriptor
alongside the code.
