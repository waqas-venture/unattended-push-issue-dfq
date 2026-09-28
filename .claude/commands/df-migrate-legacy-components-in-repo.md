---
description: Migrate every legacy component in a team's repo to the current platform shape — hand-written single-file views/widgets into Vite + TypeScript + React projects, widget-composed views into single view apps, legacy object type descriptors into definitionVersion 1, inline KPI and spec SQL into the paired .sql files, every remaining project up to the current template, and a report of drift in the platform-owned build scaffolding.
argument-hint: [optional-team-slug]
---

One-purpose migration, covering every obsolete shape a customer repo still carries:

1. **Legacy single-file code.** A view or widget folder must never hold its own `index.js`: custom
   code is a Vite + TypeScript + React project whose build output (`dist/index.js`, gitignored) is
   embedded in `data-pipelines/main/build-output/pipeline-config.json` by the repo-root
   `npm run build`. The current build kit **fails** on a hand-written single-file `index.js`.
2. **Widget-composed views.** **Widgets are deprecated.** A view whose content is a folder of
   widgets — custom-code widgets, config-only standard widgets, or a mix — is converted into a
   single **custom view app** that lays its former widgets out as components in a grid inside the
   view, and the widget folders are deleted.
3. **Legacy object type descriptors.** An Ops App Object type descriptor
   (`data-pipelines/main/objects/<table_name>.json`) has a version property `definitionVersion: 1` and a JSON
   Schema. A descriptor without `definitionVersion` is the legacy `fields` form; the build and the
   platform migrate it on the fly, and this command rewrites it in the repo.
4. **Legacy inline SQL.** KPI and Transformation Spec SQL lives in the paired `.sql` files. The
   build **fails** on a KPI descriptor carrying `baseQuery`/`liveQuery`/`drilldownQuery` or a spec
   descriptor carrying `query`; this command moves the SQL out.

It also brings every remaining view/widget project up to the current platform template and reports
drift in the platform-owned build scaffolding — so run it once per repo even if there is nothing
legacy to convert.

**Never commit and never push on your own.** Do the conversion, build, and hand the change to the
developer; the single commit and push of the working branch — the branch checked out when the
workflow starts — happen only after they review the diff and say to proceed.

## Where standard widgets stand

Standard (config-only) widgets **still render** — the platform's built-in renderer for each
`viewType` is intact, so a repo left alone keeps working. They are nonetheless deprecated: no new
widget is ever added, and this migration reproduces each one as a component inside the view app.
Section 4 describes every `viewType` precisely enough to rebuild it. Once a view is converted, its
`view.json` stays, its widget folders are gone, and the platform ignores widgets for that view
entirely (a view with code never renders the widget grid).

# 1. Bootstrap

1. Establish the active team and start the workflow:
   - Call `start_workflow_entry_point` with the team_slug of `$ARGUMENTS`.
   - When team_slug is empty or no active team, establish one first with /df-select-team, then use `start_workflow_entry_point`
2. Follow the `df-team-context-bootstrap` skill: locate the repo checkout and its working branch, and
   identify the project item the branch implements with `get_item_summary_for_branch`. All work
   happens on the working branch. Nothing is committed or pushed during bootstrap.

# 2. Survey the repo

## 2.1 Views and widgets

Enumerate `data-pipelines/main/dashboard/views/<view-slug>/` and each view's `<widget-slug>/`
subfolders. Classify **every view** into exactly one of:

- **Legacy single-file** — the folder holds an `index.js` and **no** `package.json`. Hand-written
  code that breaks the build; section 3 converts it to a project.
- **Widget-composed** — the view folder has `<widget-slug>/widget.json` subfolders. Section 4
  converts the whole view into one view app and deletes the widget folders. A view can be both this
  and legacy single-file (a legacy view whose widgets are also legacy) — convert it once, in
  section 4, taking the view's own legacy `index.js` as the starting layout.
- **Current** — the view folder is a Vite project with no widget subfolders. Nothing to convert;
  section 7 still reconciles it against the template.

Classify each widget folder too, since it determines how it is ported:

- **Custom-code widget** — a Vite project (`package.json` + `src/`), or a legacy single-file
  `index.js`. Its code is React and ports across nearly as-is.
- **Standard widget** — `widget.json` only. Its rendering is reproduced from its `viewType` and
  `dataConfig.settings`, per section 4.

Also flag the **stale** artifact: an `index.js` sitting beside a `package.json` is a leftover
bin-placed build output from an older build kit. The root build deletes it on its own — no
conversion needed, but the deletion belongs in the same commit.

Note that `ops sync-customer-repos` only reports folder-root `index.js` files, so a widget-composed
view whose widgets are all standard appears in **no** platform report. This survey is the only thing
that finds it.

## 2.2 Legacy object type descriptors

Enumerate `data-pipelines/main/objects/<table_name>.json`. A descriptor **without a
`definitionVersion` key** is the legacy form — `{ "fields": [{ "name", "type" }], "sequenceField",
"versionNumber" }`. It builds (the build migrates it on the fly); section 5 rewrites it to
`definitionVersion: 1`. For each legacy descriptor, also grep every `.sql` under
`data-pipelines/main/dashboard/src/data-layer/queries/` (transformation specs and KPI
base/live/drilldown queries) for `opsappobjects_<table_name>` and note whether any query reads the
type's bronze view — that decides the `ingestToBronze` question in section 5.

## 2.3 Legacy inline SQL

Enumerate `data-pipelines/main/dashboard/kpi-definitions/<kpi-slug>.json` and
`data-pipelines/main/transformation-specs/<outputTable>.json`. A KPI descriptor carrying
`baseQuery`, `liveQuery` or `drilldownQuery`, or a spec descriptor carrying `query`, holds inline SQL
that fails the build; section 6 moves it into the paired `.sql` files. Note, per descriptor, whether
a paired `.sql` file already exists.

## 2.4 Project drift

Survey **every** project folder for drift against the current platform template. The templates
are at `data-pipelines/main/dashboard/templates/v1/dashboard/` (views) and `.../v1/widget/` (widgets);
the platform refreshes them, so they are always the current contract. Diff each project's
`package.json`, `tsconfig.json`, `vite.config.ts`, `.gitignore`, and `src/globals.d.ts` against its
template and note what differs. The drift you will most often find:

- A `package.json` build script ending in a copy step — projects copied from an older template have
  `"build": "tsc && vite build && node -e \"require('fs').copyFileSync('dist/index.js','index.js')\""`,
  which keeps re-creating the folder-root `index.js` on every per-project build.
- A missing `react-dom` / `@types/react-dom` dependency, which older templates omitted even though the
  Vite config marks `react-dom` external.
- A reflowed `tsconfig.json` (multi-line `lib` / `paths` arrays) — cosmetic, but it should converge.
- A missing or stale `src/globals.d.ts`, so the host contract types are wrong or absent.
- A `tsconfig.json` `include` without the `"../../build/pipeline-build/dist/ops-app-object-types.d.ts"`
  entry, so the object type declarations the repo build generates are invisible to the view.
- Genuinely project-specific additions — an extra path alias for a shared folder, extra `include`
  entries, extra dependencies the code actually imports. **These are not drift.** Note them separately;
  section 7 preserves them.

## 2.5 Build scaffolding drift

Check the scaffolding the platform seeds into the repo (section 8 lists each path and who owns it):
the build kit under `data-pipelines/main/dashboard/build/pipeline-build/` and its `kit-version`, the
templates under `data-pipelines/main/dashboard/templates/v1/`, the root `package.json` build script,
the root `.gitignore` entries, `setup.sh`, and `.idea1/settings.json`. Note what is missing or stale.

## 2.6 Report

Report to the user: the views to convert (and which shape), the stale files, the legacy object type
descriptors (and which of them a query reads), the descriptors holding inline SQL, the per-project
drift, and the scaffolding drift. If all are empty, say so and stop — there is nothing to migrate.

**Before converting any widget-composed view, get the user's explicit go-ahead**, because some
per-widget host features do not exist inside a custom view (see "What does not carry over" in
section 4). Legacy single-file conversion, descriptor conversion, SQL moves and template
reconciliation need no such confirmation; the `ingestToBronze` decision in section 5 is a question
of its own.

# 3. Convert each legacy single-file folder

For a legacy view with no widgets, and for a legacy widget being ported inside a view app that the
user has chosen to keep as a widget.

Load `df-custom-dashboard-view` for a view or `df-custom-widgets` for a widget, then
`df-dashboard-source-code` → `references/custom-code.md` for the project layout and host contract.

For each legacy folder:

1. Read the existing `index.js` in full and understand exactly what it renders and how it uses its
   host arguments — a view gets
   `(React, kpiDefinitions, fetchKpiData, opsAppObjects, opsAppDocuments, TeamRole, userContext)`, a
   widget gets `(React, data)`.
2. Copy the platform template into the folder — `data-pipelines/main/dashboard/templates/v1/dashboard/`
   for a view, `.../templates/v1/widget/` for a widget. Never edit the template in place.
3. Port the existing behavior into `src/App.tsx` (splitting into further `src/**` files where the code
   is large enough to warrant it), as idiomatic TypeScript + React with JSX. Use `src/globals.d.ts` as
   the host contract — don't hand-redefine those types.
4. Leave `view.json` / `widget.json` untouched: the id, name, order, and widget config must not change.
5. `git rm` the folder-root `index.js`.

**Preserve behavior exactly.** This is a migration, not a redesign — same data, same layout, same
formatting, same interactions. If the existing code is genuinely broken, say so and ask; do not
silently "improve" it.

# 4. Convert each widget-composed view into a view app

The end state per view: `data-pipelines/main/dashboard/views/<view-slug>/` is a single Vite +
TypeScript + React project whose `App.tsx` renders a grid of components, one per former widget. The
`<widget-slug>/` folders are gone. `view.json` is untouched — same `id`, `name`, `order`.

## 4.1 Set the project up

Copy `data-pipelines/main/dashboard/templates/v1/dashboard/` into the view folder (never edit the
template in place). The view host contract is
`(React, kpiDefinitions, fetchKpiData, opsAppObjects, opsAppDocuments, TeamRole, userContext)`,
declared ambiently in `src/globals.d.ts` — treat that file as the source of truth and never
hand-redefine those types. Give each former widget its own file, e.g.
`src/widgets/<WidgetName>.tsx`, and keep `App.tsx` to layout and composition.

## 4.2 Reproduce the grid

The platform laid widgets out on a **3-column** grid with a **150px** row height and 16px gutters,
from each widget's `layoutConfig` (`row`, `column`, `rowSpan`, `columnSpan`, all 0-based). Reproduce
that with CSS Grid in the view app:

```css
.widget-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  grid-auto-rows: 150px;
  gap: 16px;
}
```

and place each component at `grid-column: <column + 1> / span <columnSpan>` and
`grid-row: <row + 1> / span <rowSpan>`. Order the components by the widget's `order`. Collapse to a
single column at narrow widths. Each widget rendered as a card with its `title` as a heading — match
what the widget grid looked like; don't redesign it.

## 4.3 Move each widget's data fetch into the view

A widget received only `data` — the response for its bound KPI, with the KPI's `@paramName`
parameters already resolved. The view app fetches that itself:

```typescript
const kpi = kpiDefinitions.find(k => k.id === "<widget.json kpiDefinitionId>");
const data = await fetchKpiData(kpi.id, filters);
```

`filters` reproduces exactly what the host resolved per widget: for each parameter of the bound KPI,
take `widget.dataConfig.settings[param.name]` when present (as a string), else the parameter's
`defaultValue`. Anything in `settings` that is *not* a KPI parameter name is display config, not a
filter — it belongs to the component (section 4.5).

Fetch per component with a `React.useEffect` + `useState`, or hoist the fetches into `App.tsx` and
pass results down. Either is fine; keep the loading and empty states the widgets had.

The KPI definitions and their `.sql` files stay exactly as they are — this migration changes
rendering only, never a query.

## 4.4 Port custom-code widgets as-is

A custom widget is already React and needs almost no change:

- Its `src/App.tsx` (or its legacy `index.js` body) becomes the component's body.
- The `data` global becomes a `data: WidgetDataResponse` prop the view passes in.
- `react`/`react-dom` imports stay as they are — they resolve to the host globals at runtime in a
  view exactly as they did in a widget.
- Anything the widget loaded via a runtime `<script>` tag (Chart.js, D3, Recharts…) keeps working;
  make sure two components don't each inject the same library — load it once in `App.tsx`.
- A widget never had `opsAppObjects`; inside the view it now could. **Don't add stateful behavior
  during the migration** — that is a separate, deliberate change.

Merge the widget project's own extra dependencies into the view project's `package.json`.

## 4.5 Rebuild standard widgets as components

A standard widget is a `viewType` plus `dataConfig.settings`. Rebuild each as a component with the
same visual result. Recharts is what the platform's own renderers use; load it (or any charting
library) at runtime via a `<script>` tag — external libraries are never npm imports in view code.
Simple types (Number, Table) are better hand-rolled than library-driven.

Shared conventions across the types:

- **Default series palette:** `#0d6efd`, `#198754`, `#dc3545`, `#ffc107`, `#0dcaf0`, `#6f42c1`,
  `#d63384`, `#fd7e14`, `#20c997`, `#6610f2`, cycled.
- **`format`** (on most types) is either a keyword — `currency`, `percent`, `number` — or an
  Excel-like pattern (`$#,##0.00`, `€#,##0`, `0.00%`, `#,##0`): prefix/suffix around the number,
  `,` = thousands grouping, digits after `.` = decimal places, `%` = multiply by 100 and append `%`.
  No format means grouped with `decimals` (default 0) decimal places. `seriesFormats`
  (`Record<seriesName, string>`) overrides `format` per series. Write one `formatValue` helper in
  the view app and use it everywhere.
- **`description`** renders as muted text under the title.
- **x-axis values** arrive as `{ type, text, number }`: `Category` → `text`, `Time` → `number` is a
  unix timestamp rendered as a local date, `Number` → `number`.

| `viewType` | Expected result type | Renders | Key `dataConfig.settings` |
|---|---|---|---|
| `Number` | Scalar | Large formatted `scalarValue` with an icon above it | `icon` (Bootstrap icon class, default `bi-graph-up`), `colorTheme`, `format`, `currencyCode`, `decimals`, `description` |
| `LineChart` | SingleSeries / MultiSeries | Line chart, one line per series | `showGrid` (default true), `showLegend` (default true), `height`, `xAxisLabel`, `yAxisLabel`, `format`, `yAxisFormat`, `seriesFormats`, `description`; plus `seriesStyles` (per-series `displayName`/`color`), `referenceLines` (horizontal `y` lines with a `label` and optional above/below green/red shading), `differenceBand` (fill between an `upperSeries` and `lowerSeries`) |
| `AreaChart` | SingleSeries / MultiSeries | Filled line chart | Same chart settings as `LineChart` (no line-specific extras) |
| `ColumnChart` | SingleSeries / MultiSeries | Vertical bars | Same chart settings |
| `BarChart` | SingleSeries / MultiSeries | Horizontal bars | Same chart settings |
| `PieChart` | SingleSeries / MultiSeries | Pie with a centered total; multi-series slices are each series' summed total; categories past the 10th collapse into "Other" | `showLegend`, `format`, `description` |
| `Table` | SingleSeries / MultiSeries / Tabular | Data table; first column is the x-axis (its label from the axis type), one column per series | `format`, `seriesFormats`, `description` |
| `Funnel` | SingleSeries | Funnel of stages in data-point order | `format`, `seriesFormats`, `description` |
| `Waterfall` | MultiSeries — one series per metric, data points per time bucket | Horizontally scrollable per-bucket cards: a stacked bar with a beginning reference, additions above (green) and losses below (red), an ending dot, and a 2×2 metric grid with trend badges | `beginning` `{column, label, format?}`, `changeColumns[]` `{column, label, sentiment: positive\|negative, order, format?}` (1–4), `ending` `{column, label, format?}`, `metricGridColumns[]` `{column, label, positiveDirection: up\|down, order, format?}`, `format`. `column` names a series; bucket keys `YYYY-MM`, `YYYY-QN`, `YYYY` and epoch values render as friendly labels, oldest bucket first |
| `RadialScore` | MultiSeries — each series has data points `x="current"` and `x="previous"` | Circular progress ring with the score, a letter grade, a trend vs. previous, and a mini-metric breakdown from the other series | `overallSeriesName` (null = first series), `maxScore` (default 100), `gradeThresholds` `{a,b,c,d}` (default 90/80/70/60, with ±3 / +7 bands giving A-/B+/… ), `format`. Ring color by percent of max: ≥80% `#198754`, ≥60% `#ffc107`, ≥40% `#fd7e14`, else `#dc3545` |
| `Sankey` | MultiSeries — series name = source stage, x = target stage, y = volume | Sankey flow diagram, source stages first in node order | `showConversionRates` (default true), `format`, `nodeWidth` (default 20), `nodePadding` (default 30) |
| `BubbleChart` | MultiSeries — one series per bubble, with data points whose `x` category names the metric | Scatter/bubble chart with quadrant reference lines | `xMetricName`, `yMetricName`, `sizeMetricName` (each names one of those x categories), `xAxisLabel`, `yAxisLabel`, `quadrantXThreshold` / `quadrantYThreshold` (null = median of the data), `quadrantLabels` `[topLeft, topRight, bottomLeft, bottomRight]`, `xFormat`, `yFormat` |
| `Heatmap` | MultiSeries — series name = row, x = column, y = cell value | Matrix with a color gradient per cell | `lowColor` (default `#ffffff`), `highColor` (default `#0d6efd`), `showValues` (default true), `isPercentage` (default true), `format` |

If a widget's stored settings don't match what its `viewType` expects — a `Waterfall` with no
`changeColumns`, a `BubbleChart` whose metric names don't appear in the data — say so and ask rather
than inventing a rendering. Sample the live data first with `get_widget_data` (`schema_type:
"draft"`, the widget `id` from `widget.json`) while the widget still exists, so you are building
against the real shape.

## 4.6 Per-widget runtime filters

If a bound KPI has parameters, the widget grid gave each widget a filter bar the viewer could change,
which refetched that widget. Reproduce it in the component — a control per parameter (a
`select` when the parameter has `allowedValues`, a date input for `date`/`timeframe`, otherwise a
text input) whose value goes into the `filters` argument of `fetchKpiData`. Default each control to
the same resolved value as section 4.3.

## 4.7 What does not carry over

Two host features belong to the widget grid and have no equivalent in a custom view. Tell the user
before converting, and confirm:

- **Per-widget export** (the CSV/image dropdown on each widget card) and the **view-level Export
  button** — both are hidden for custom views.
- **Drilldown** — clicking a data point on a widget whose KPI has a `drilldownQuery` opened a
  drilldown panel. View code can only call `fetchKpiData`, so a drilldown query is not reachable;
  the interaction is dropped. Note in your report every widget that had it (its KPI's
  `drilldownQuery` is non-empty), since those views lose a real capability.

## 4.8 Finish the view

`git rm -r` every `<widget-slug>/` folder in the converted view, in the same change as the new view
project. `view.json` keeps its `id`, `name` and `order` verbatim — the id is what the platform
correlates ACLs and permalinks by, and changing it silently drops the view's permissions.

# 5. Convert each legacy object type descriptor

For each `data-pipelines/main/objects/<table_name>.json` the survey found without
`definitionVersion`. Load `df-dashboard-source-code` → `references/structural-config.md` for the
version-1 shape, the flat-schema restriction and the versioning invariants.

## 5.1 Rewrite the descriptor mechanically

Rewrite the descriptor to `definitionVersion: 1` with **exactly** the mapping the build applies on
the fly, so the built artifact is unchanged by the conversion:

- `schema` is a root object node (`"type": "object"`) whose `properties` hold one entry per legacy
  field, in field order, typed as the nullable union of the field's type: `string` →
  `["string", "null"]`, `integer` → `["integer", "null"]`, `number` → `["number", "null"]`,
  `boolean` → `["boolean", "null"]`, `date` → `["string", "null"]` with `"format": "date"`,
  `datetime` → `["string", "null"]` with `"format": "date-time"`.
- The `sequenceField` property is **non-nullable** — its single type (`"integer"`, or `"string"`
  with its `format`) — and is the **only** entry in the root `required`.
- `ingestToBronze` is `true`.
- `sequenceField` and `versionNumber` carry over verbatim (an absent `versionNumber` is written as
  `0`); `fields` is deleted.

Never change `sequenceField` or the table name (the file name). `versionNumber` stays as it is for
this mechanical rewrite — the definition it declares is identical to the one the build derived from
the legacy form.

For example, the legacy

```json
{
  "fields": [
    { "name": "body", "type": "string" },
    { "name": "noted_at", "type": "datetime" }
  ],
  "sequenceField": "noted_at",
  "versionNumber": 0
}
```

becomes

```json
{
  "definitionVersion": 1,
  "schema": {
    "type": "object",
    "properties": {
      "body": { "type": ["string", "null"] },
      "noted_at": { "type": "string", "format": "date-time" }
    },
    "required": ["noted_at"]
  },
  "sequenceField": "noted_at",
  "ingestToBronze": true,
  "versionNumber": 0
}
```

## 5.2 Decide `ingestToBronze` per type

After the mechanical rewrite every converted type has `ingestToBronze: true`, which keeps the
OpsAppObjects connector refreshing its `opsappobjects_<table_name>` bronze view on every write. Use
the survey's grep result:

- **A transformation spec or KPI `.sql` reads `opsappobjects_<table_name>`** — keep `true`; the
  type feeds the data pipeline.
- **No query reads it** — propose `ingestToBronze: false` to the user, stating plainly that the type
  then lives in the object store only and its `opsappobjects_<table_name>` bronze view stops being
  refreshed. Apply their answer. Flipping the flag is a definition change beyond the mechanical
  mapping, so it bumps `versionNumber` in the same edit.

Any other change the user asks for — new optional properties, a root `title`, a `listProjection` —
also bumps `versionNumber` and stays within the versioning invariants (properties only added and
optional; `sequenceField` and the table name untouched).

## 5.3 Generated types

The repo build emits a TypeScript alias per object type (`<Title>`, PascalCased from the schema's
root `title`, default the PascalCased table name — `customer_notes` → `CustomerNotes` — with
`body?: string | null`-style members and a non-optional sequence member) into
`data-pipelines/main/dashboard/build/pipeline-build/dist/ops-app-object-types.d.ts`, ambient in every
view project that includes it. View code reading a converted type can type its `opsAppObjects` calls
with that alias (`useListOpsAppObjects<CustomerNotes>(…)`, `upsert<CustomerNotes>(…)`). Adopting the
alias is a separate code change from this migration — mention it in the report rather than editing
view code here.

# 6. Move legacy inline SQL into the paired `.sql` files

For each descriptor the survey found with inline SQL. Load `df-dashboard-source-code` →
`references/sql-queries.md` for the exact file paths and the KPI name→slug rule.

1. **KPI descriptor** (`dashboard/kpi-definitions/<kpi-slug>.json`): write `baseQuery` to
   `data-pipelines/main/dashboard/src/data-layer/queries/kpi-definitions/<kpi-slug>-base.sql`,
   `liveQuery` to `<kpi-slug>-live.sql` and `drilldownQuery` to `<kpi-slug>-drilldown.sql`, then
   delete those keys from the JSON.
2. **Spec descriptor** (`transformation-specs/<outputTable>.json`): write `query` to
   `data-pipelines/main/dashboard/src/data-layer/queries/transformation-specs/<outputTable>.sql`,
   then delete the key.
3. When a paired `.sql` file **already exists** with different content, stop and ask the user which
   version is authoritative — do not overwrite either silently.
4. Validate every moved `.sql` with `validate_sql_query`. The SQL moves verbatim; if validation
   fails, report the error and ask rather than rewriting the query.

# 7. Bring every remaining project up to the current template

Do this for **every** view and widget project left in the repo, not just the ones you converted. The
template is the current toolchain and host contract; a project that has drifted from it either builds
differently from what the platform expects or keeps re-creating files the build has to clean up.

**Reconcile, do not overwrite.** Copying the template files over a project would discard deliberate
project-specific configuration. For each file, adopt the template's version of everything below, and
carry the project's own additions forward.

| File | Adopt from the template | Keep from the project |
|---|---|---|
| `package.json` | `"type": "module"`, `"build": "tsc && vite build"` (no copy step), and the `react` + `react-dom` dependencies with the `@types/*`, `@vitejs/plugin-react`, `typescript`, `vite` devDependency toolchain | the project `name`, and any extra dependency the code actually imports |
| `tsconfig.json` | every `compilerOptions` value — notably `jsx: "react"`, `jsxFactory: "React.createElement"`, `jsxFragmentFactory: "React.Fragment"`, `moduleResolution: "bundler"`, `strict`, `noEmit`, the `ESNext` target/module and the `lib` list — the `@/*` path mapping, and the `include` entry `"../../build/pipeline-build/dist/ops-app-object-types.d.ts"` (the object type declarations the repo build generates; ambient in view code) | additional `paths` entries and additional `include` entries (for example an alias to a folder shared between views) |
| `vite.config.ts` | the whole `build` block — `outDir: 'dist'`, `emptyOutDir`, `lib.entry: src/main.tsx`, `lib.name: 'DataFabriqView'`, `formats: ['iife']`, `fileName: () => 'index.js'` — plus `react({ jsxRuntime: 'classic' })`, `external: ['react', 'react-dom']` with the `React` / `ReactDOM` globals mapping, and `output.footer: 'return DataFabriqView;'` | additional `resolve.alias` entries |
| `.gitignore` | `node_modules`, `package-lock.json`, `dist` | any extra ignore the project added |
| `src/globals.d.ts` | the file verbatim — it is the canonical host contract. A **view** declares `kpiDefinitions`, `fetchKpiData`, `opsAppObjects`, `opsAppDocuments`, `TeamRole` and `userContext`; a **widget** declares only `data`, and must not declare `opsAppObjects` (remove the declaration if a stale widget template has it) | nothing — never hand-edit this file |

Leave `src/App.tsx`, `src/main.tsx`, and every other `src/**` file alone except where a template change
forces an edit — for instance, if adopting `strict`, `noUnusedLocals`, or `noUnusedParameters` makes
`tsc` fail, fix the code the option flags rather than dropping the option.

Anything the survey flagged as project-specific stays. If you cannot tell whether a difference is
deliberate or drift, ask rather than guess — silently dropping a shared-folder alias breaks that
project's build.

# 8. Verify the build scaffolding

The platform seeds the build scaffolding into every customer repo and refreshes the platform-owned
parts through its `sync-customer-repos` run. Hand edits to a platform-owned path are drift that the
next sync overwrites, so this section **reports** rather than edits, except for the customer-owned
root files.

| Path | Owner | What to check |
|---|---|---|
| `data-pipelines/main/dashboard/build/pipeline-build/` | Platform — refreshed when its `kit-version` is stale | The kit is present with `src/build-all.mjs` and `kit-version`. The view template's `tsconfig.json` includes `../../build/pipeline-build/dist/ops-app-object-types.d.ts`, so a kit that does not produce that file is older than the templates expect |
| `data-pipelines/main/dashboard/templates/v1/` | Platform — subtree reconciled exactly | `dashboard/` and `widget/` templates present, each with `package.json`, `tsconfig.json`, `vite.config.ts`, `.gitignore`, `src/App.tsx`, `src/main.tsx`, `src/globals.d.ts`; the view `globals.d.ts` declares all seven host globals |
| `package.json` (repo root) | Customer — created when absent | `"scripts": { "build": "node data-pipelines/main/dashboard/build/pipeline-build/src/build-all.mjs" }`; fix in place when the script is missing or points elsewhere |
| `.gitignore` (repo root) | Customer — created when absent | contains `**/dist/` and `**/node_modules/`; add the missing entries in place |
| `setup.sh` | Platform — refreshed on drift | present, executable, and sets `merge.ff=false`, `pull.ff=true`, `pull.rebase=false` |
| `.idea1/settings.json` | Platform — refreshed on drift | present and naming `draft` as the branch working branches are cut from |

For every platform-owned path that is missing or stale, tell the user and direct them to have the
platform's `sync-customer-repos` run for the team — never hand-edit those paths. Fix the two
customer-owned root files in place as part of this change when they are wrong.

# 9. Build

Run `npm run build` at the repo root. It must finish clean: every project — converted or merely
reconciled — type-checks and bundles, no folder-root `index.js` remains anywhere, every descriptor
carries its SQL in the `.sql` files, and `data-pipelines/main/build-output/pipeline-config.json` is
regenerated. Fix every error and re-run until it succeeds.

A project whose `tsconfig.json` or `vite.config.ts` you changed is the likely culprit for a new
failure — a newly adopted compiler option, or a dropped alias the code still imports through. Fix the
project, not the template.

Then confirm the artifact actually carries the migration:

- each converted view's assembled `viewCode` is the new bundle, and a converted view carries no
  widgets at all;
- each converted object type's entry is unchanged apart from any `ingestToBronze` change the user
  chose (and its version bump) — the mechanical rewrite alone produces no artifact diff;
- each KPI and spec whose SQL moved carries the same query text as before.

# 10. Review, push, and verify

1. Summarize what changed, per item: views converted from single-file, views converted from widgets
   (naming each widget and how it was ported, plus any dropped export/drilldown), object type
   descriptors converted (and each `ingestToBronze` decision), SQL moved out of descriptors,
   projects reconciled to the template, and the scaffolding drift reported for the platform sync.
   Then show the developer the changed-file list (`git status --short`) and the diff. The `index.js`
   and widget-folder deletions are part of the change.
2. Wait for explicit approval. Do not commit or push before it.
3. One commit on the working branch — the new `src/**` files, the reconciled project config files,
   the converted object type descriptors, the moved `.sql` files and their trimmed descriptors, the
   fixed customer-owned root files, the `index.js` and widget-folder deletions, and the updated
   `build-output/pipeline-config.json` — then one push of the working branch. No pull request, no
   new branch.
4. Verify each touched view still renders its data once the change is on `draft` — pushed to it, or
   merged into it from the working branch: have the user preview the views in draft mode.
   `get_widget_data` (`schema_type: "draft"`) still works for any widget left unconverted, but a
   converted view has no widgets to query — it has to be looked at. A reconciled project is a rebuilt
   bundle even when its source did not change, so check the reconciled ones too. For an object type
   whose `ingestToBronze` was set to `false`, confirm with the user that no dashboard query depends
   on its bronze view.
5. Direct the user to publish in the web app when they are satisfied. Publishing merges `draft` into
   `main` and makes the migration live.
