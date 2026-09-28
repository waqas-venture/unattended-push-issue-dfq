---
name: df-custom-dashboard-view
description: Use this skill when creating or configuring custom dashboard views. Custom dashboard views contain self-contained code that renders an entire view with access to all KPI definitions and the ability to fetch data for any KPI. Views can also read and write team-scoped stateful objects (the `opsAppObjects` host API), to support views that are stateful apps, and produce documents such as rendered PDFs (the `opsAppDocuments` host API). The view code runs inside a sandboxed iframe. Use this skill when the user wants full control over a dashboard view's rendering instead of the standard widget grid. The view code and its view.json configuration live in the team's connected GitHub repo and are edited directly in-session — see the `df-dashboard-source-code` skill.
---

# Custom Dashboard View Code

## Overview

A custom dashboard view replaces the standard widget grid with self-contained code that renders an entire view inside a sandboxed iframe. The code has access to all KPI definitions and a function to fetch data for any KPI. When a view has no custom code, the standard widget grid is used.

This differs from **custom widgets**, which operate on a single KPI's data. Custom dashboard views have access to **all** KPI definitions and can fetch data for **any** of them, enabling complex multi-KPI visualizations and custom layouts. Custom views are also the **only** place stateful app capabilities (the `opsAppObjects` and `opsAppDocuments` host APIs) are available — widgets are legacy and work exclusively with their bound KPI's data.

## Where the code lives and how to edit it

View code lives as source files in the team's connected GitHub repo, checked out locally in this session, under `data-pipelines/main/dashboard/views/<view-slug>/`. Edit it **directly** — see the `df-dashboard-source-code` skill for the repo layout, the working-branch workflow, the per-view Vite + TypeScript + React project, the root `npm run build` (which builds the project to its gitignored `dist/index.js` and embeds that in the committed pipeline-config artifact), and the `(React, kpiDefinitions, fetchKpiData, opsAppObjects, opsAppDocuments, TeamRole, userContext)` host contract. This skill covers how to **design** the view and what data it gets; `df-dashboard-source-code` owns the mechanics of writing and building the code.

1. Scope the change: read the repo files — `dashboard/views/*/view.json` for the views and `dashboard/kpi-definitions/*.json` for the KPI definitions, and check the target view's folder (a `package.json` and `src/` tell you whether custom code already exists). Examine the KPI definitions' query SQL (the paired `.sql` files in the repo, per `df-dashboard-source-code`) for the data columns available.
2. Design the change — what the view should show and how it should behave, naming the KPIs and any data or parameter specifics. Edit existing code in place by default; rewrite from scratch only if the user asked for that.
3. Make the edits in the repo per `df-dashboard-source-code`: for a new view, create the `views/<view-slug>/` project (and `view.json` with a fresh UUID `id`; folder name = slug of the view name); for an edit, modify the existing files. The view's non-code metadata (`id`, `name`, `order`) lives in `view.json`; the code is the folder's Vite project under `src/`. Run the root build;
4. Once the change is on the `draft` branch — pushed to it, or merged into it from the working branch — have the user preview in draft mode and publish. Publishing merges the `draft` branch to make the changes live.

## View code capabilities

Useful when designing the view (full mechanics in `df-dashboard-source-code`):

- The code runs as a React 18 function component in a sandboxed iframe with access to every KPI definition in the dashboard and an async `fetchKpiData(kpiId, filters?)` function to fetch any KPI's data. A view is authored as a per-view Vite + TypeScript + React project that builds to a single `dist/index.js`.
- It can load any public charting library (Chart.js, D3, Recharts, etc.) dynamically via script tags, so any layout or visualization is possible.
- The data shape follows each KPI's `resultType` (Scalar, SingleSeries, MultiSeries, Tabular), and a KPI's `@paramName` query parameters can be overridden per fetch via the `filters` argument.

## Stateful objects

A view can also **read and write team-scoped objects** via the injected
`opsAppObjects` host API, making it a stateful app (task boards, annotations,
planning tools, saved scenarios). Each **object type** is declared as a repo
file `data-pipelines/main/objects/<table_name>.json` — the file name IS the
type's snake_case table name, its unique id everywhere. Every type has the
same shape: a JSON Schema (`schema`) its documents are validated against, a
`sequenceField`, an optional `listProjection`, and an `ingestToBronze` flag
that also ingests the type into bronze (flat schemas only). The full host
contract (`opsAppObjects` TypeScript
declarations and semantics) is in `df-dashboard-source-code` →
`references/custom-code.md`, and the descriptor shapes, schema subset and
validation rules are in `references/structural-config.md`.

Design guidance:

- **Decide `ingestToBronze` by where the data has to go.** Set it `true` only
  when the state must flow into the data pipeline (bronze → Gold Tables → KPI
  queries and transformation specs), and shape that type flat — root primitive
  properties only; otherwise leave it `false` and nest the schema as the app
  needs.
- **One document per user-facing unit.** Model state as the thing the user
  saves, opens or lists — a saved snapshot is one object, rather than a header
  plus child rows — and keep each document well under Cosmos's 2 MB item
  limit.
- **Declare a `listProjection` for anything listed.** List and query reads of
  a type with a projection return only the projected root properties, so a
  large document lists cheaply; get and upsert are the whole document.
- **Type the data layer.** Every read and write takes a type argument —
  `useGetOpsAppObject<Case>`, `upsert<Case>`,
  `useListOpsAppObjects<CaseListItem>` — using the aliases the repo build
  generates from every type's schema (`<Title>` from the schema's root
  `title`, default the PascalCased table name; `<Title>ListItem` from its
  projection).
- **Gate every edit affordance on `opsAppObjects.canWrite`** — it is
  server-resolved (Editor role and above); Reader sessions and shared
  read-only links get `canWrite = false` and their writes reject with 403.
- **Objects are team-shared, not per-user** — every viewer of the view sees
  and (with Editor role) edits the same rows.
- **`ingestToBronze` data flows into the pipeline** — writes to a type with
  `ingestToBronze: true` are ingested to bronze as `opsappobjects_<table_name>`,
  so KPI queries and transformation specs can query what the view writes;
  every other type lives in the object store and is read back by the view.
- **Declare the object type file alongside the view code** in the same
  draft-branch change — the view's `opsAppObjects` calls only work for declared
  types.
- **Extend types additively, never destructively** — to build new
  functionality on an existing type, add optional properties AND increment
  the descriptor's `versionNumber`; every existing declaration, the table
  name and the `sequenceField` stay as they are. Rows are shared across the
  active and draft configs: reads return the stored document (a nullable root
  property absent from an older row reads `null`) and writes preserve
  newer-version properties server-side. Invariants: `df-dashboard-source-code` →
  `references/structural-config.md`.
- **Use `reserveSequenceNumberBlock` for human-facing sequential numbers**
  (PO numbers, invoice numbers, ticket ids) — it is atomic and gapless across
  concurrent users; never compute `max + 1` from a page of objects.
- **Filter on the server** with `useQueryOpsAppObjects(tableName, where, skip,
  take, descending?)` (equality filters on root properties with primitive
  values) instead of paging a whole type and filtering in the browser —
  registers, audit trails and "my items" views should query, not scan.
- **List newest-first with `descending: true`** — `useListOpsAppObjects` and
  `useQueryOpsAppObjects` order by `sequenceNumber`; pass `descending: true`
  for a most-recent-first list instead of reversing a page in the browser.
- **Attribute with `userContext`** — the in-scope user context
  `{ id, displayName, role }` is server-resolved when the session is
  established (it is its own global, separate from `opsAppObjects`); write
  `displayName`/`id` into `created_by`-style fields and use `role` for
  role-specific affordances (e.g. an approval step only Admins see) — `role` is
  the `TeamRole` enum injected into the view's scope, so compare it as
  `userContext.role === TeamRole.Admin`, never as a string. `canWrite` remains
  the write gate.

## Documents

A view can produce **files the user keeps** via the injected `opsAppDocuments`
host API: `renderPdf({ html, fileName, pageSize?, marginPt? })` renders
self-contained HTML to PDF in the browser (`marginPt` is a uniform page margin
in points, default 0) and stores it as a team-scoped document;
`download(documentId)` hands a stored document to the browser (the host
performs the download outside any sandbox, so the view never needs
`window.open` or `<a download>`); `create`/`replace`/`remove` and the live/lazy
`useListOpsAppDocuments`/`useGetOpsAppDocument` read hooks manage arbitrary
blobs. Full contract and semantics: `df-dashboard-source-code`
→ `references/custom-code.md`.

Design guidance:

- **Build print-like HTML** for `renderPdf` — inline CSS, data-URI images,
  tables and block layout, no scripts or external URLs. Generate the HTML
  string from data the view already holds.
- **Record produced documents in an object type** (document id, what it
  relates to, `userContext.displayName`, timestamp) when the app needs a
  register of what was issued; a document's own metadata is all the document
  store holds.
- **Gate document writes on `opsAppObjects.canWrite`** — the same server-side
  write gate applies.

## Shareable Permalink

Custom dashboard views can be shared via a permalink. Create a permalink via the API:

```
POST /v1/teams/active/dashboards/{dashboardId}/views/{viewId}/permalink
Body: { "dataPipelineConfigurationId": "..." }
Response: { "slug": "abc12xyz" }
```

The standalone view is then accessible at `/views/{slug}`. It requires authentication and shows a simple header with the brand logo above the scrolling view content.
