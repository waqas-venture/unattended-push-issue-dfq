---
name: df-custom-widgets
description: Use this skill when creating or configuring custom dashboard widgets. Custom widgets contain self-contained code that renders any visualization. The widget code runs inside a sandboxed iframe and receives data from its bound KPI definition's query — and nothing else; stateful app capabilities (the `opsAppObjects` host API) are only available in custom dashboard views. Use this skill when the user wants a chart type not available in the fixed widget types, or wants full control over the widget rendering. The widget code and its widget.json configuration live in the team's connected GitHub repo and are edited directly in-session — see the `df-dashboard-source-code` skill. Widget data comes from the get_widget_data MCP tool.
---

# Custom Widget Code

## Overview

A custom widget renders any visualization with self-contained code that runs inside a sandboxed iframe with access to `React` and the widget's data. When a widget has no custom code, the built-in renderer for its `viewType` is used.

## Where the code lives and how to edit it

Widget code lives as source files in the team's connected GitHub repo, checked out locally in this session, under `data-pipelines/main/dashboard/views/<view-slug>/<widget-slug>/`. Edit it **directly** — see the `df-dashboard-source-code` skill for the repo layout, the working-branch workflow, the per-widget Vite + TypeScript + React project, the root `npm run build` (which builds the project to its gitignored `dist/index.js` and embeds that in the committed pipeline-config artifact), and the `(React, data)` host contract for widgets. This skill covers how to **design** the widget and what data it gets; `df-dashboard-source-code` owns the mechanics of writing and building the code. The widget's **configuration** (title, viewType, data config, layout, summary) is its `widget.json` in the same folder; a widget has custom code when its folder is a Vite project (a `package.json` and `src/`).

1. Scope the change: read the repo files — `dashboard/views/*/view.json` and `*/widget.json` for the views and widgets, and the target widget's folder (a `package.json` and `src/` tell you whether custom code already exists). Read the bound KPI definition from `dashboard/kpi-definitions/<kpi-slug>.json` and examine its query SQL (the paired `.sql` files, per `df-dashboard-source-code`) for the data shape the code will receive; `get_widget_data` (with the widget `id` from `widget.json`) fetches a live sample.
2. Design the change — what the widget should show and how it should behave, naming the KPI and any data or parameter specifics. Edit existing code in place by default; rewrite from scratch only if the user asked for that.
3. Make the edits in the repo per `df-dashboard-source-code`: for a new widget, create the `views/<view-slug>/<widget-slug>/` project (and `widget.json` with a fresh UUID `id`); for an edit, modify the existing files. The widget's non-code config (title, viewType, kpiDefinitionId, layout, dataConfig) lives in `widget.json`; the code is the folder's Vite project under `src/`. Run the root build.
4. Once the change is on the `draft` branch — pushed to it, or merged into it from the working branch — have the user preview in draft mode and publish. Publishing merges the `draft` branch to make the changes live.

## Widget code capabilities

Useful when designing the widget (full mechanics in `df-dashboard-source-code`):

- The code runs as a React 18 function component in a sandboxed iframe and receives the raw data response of the widget's bound KPI definition. A widget is authored as a per-widget Vite + TypeScript + React project that builds to a single `dist/index.js`.
- It can load any public charting library (Chart.js, D3, Recharts, etc.) dynamically via script tags, so any visualization is possible.
- When custom code is present, rendering is driven entirely by the code — the widget's `viewType` is only a category hint.
- The data shape follows the KPI's `resultType` (Scalar, SingleSeries, MultiSeries, Tabular) and the KPI's `@paramName` query parameters are resolved from KPI defaults, the widget's `dataConfig.settings`, and dashboard filters.

## No stateful objects in widgets

Widget code's scope has **only** `data` (the bound KPI's response). Widgets are
legacy and work exclusively with their bound KPI definition's data — they do
**not** receive the `opsAppObjects` host API, and cannot read or write
team-scoped stateful objects. When the user wants stateful app capabilities
(task boards, annotations, planning tools), build a **custom dashboard view**
instead — see the `df-custom-dashboard-view` skill.

## Widget JSON Structure

```json
{
  "id": "<guid>",
  "title": "My Widget Title",
  "order": 0,
  "viewType": "LineChart",
  "kpiDefinitionId": "<kpi-guid>",
  "dataConfig": { "settings": {} },
  "layoutConfig": { "row": 0, "column": 0, "rowSpan": 1, "columnSpan": 2 }
}
```

- This is the `widget.json` file shape; the widget's code is never part of this file — it lives alongside it as the folder's Vite project under `src/`.
- `viewType` is the enum name (`Number`, `LineChart`, `BarChart`, `Table`, `PieChart`, `AreaChart`, `ColumnChart`, `Funnel`, `Waterfall`, `RadialScore`, `Sankey`, `BubbleChart`, `Heatmap`) and is a category hint; when the widget has code in the repo, rendering is driven by the code regardless of `viewType`.
- A widget with no custom code in the repo falls back to the built-in renderer for `viewType`.
- `kpiDefinitionId` must reference a KPI definition — this determines the data query.
