# Convert — a static `.html` mock-up into a real view

A prototype mock-up is a single `.html` file with embedded CSS, JavaScript, and
data — interactive, shareable, and disposable. A DataFabrIQ view is a React app
in a per-view Vite + TypeScript project under
`data-pipelines/main/dashboard/views/<view-slug>/`, built by the root
`npm run build` into a function body the host invokes as
`(React, kpiDefinitions, fetchKpiData, opsAppObjects, opsAppDocuments, TeamRole, userContext)`
and renders in a
sandboxed iframe (mechanics in `df-dashboard-source-code` →
`references/custom-code.md`). This procedure turns the former into the latter.
It works the same whether the file was authored outside the session or iterated
on in HTML-first mode.

## 1. Inventory the file

Read the whole file first and list:

- **Sections and layout** — header, KPI tiles, charts, tables, side panels; the
  order they appear in and how they are arranged.
- **Interactions** — tabs, filters, dropdowns, sorting, drill-downs, modals,
  toggles, hover details. Every one of them must survive the conversion; the
  feedback loop depends on clicking through them.
- **Data** — inline arrays and objects in `<script>` (often a `DATA` constant),
  any computed/derived values, and the number formats used.
- **External libraries** — `<script src="…">` tags (Chart.js, D3, ECharts, …)
  and how they are called.
- **Styling** — `<style>` blocks, inline `style=` attributes, fonts, icon fonts,
  color palette.
- **Browser APIs** — `fetch`, `localStorage`, `setInterval`, `window.onload`,
  `alert`/`confirm`/`prompt`, `document.write`.

## 2. Mapping — HTML construct → view project

| In the `.html` | In the view project |
|---|---|
| `<body>` markup | `src/App.tsx` returns the root element; each major section becomes a component in `src/components/<Section>.tsx`, imported with the `@/` alias |
| Inline data (`const DATA = …`) | `src/mockData.ts` — exported constants with an `interface` per row shape. This module is the seam that later becomes `fetchKpiData` in the mock-pipeline data mode |
| `getElementById` / `innerHTML` / `addEventListener` / `classList.toggle` | React state and props: `useState` for the selected tab, filter, or row; `useMemo` for derived data; conditional rendering instead of show/hide; handlers named `<element>_<event>` (e.g. `regionSelect_change`) |
| `<style>` block | One CSS string rendered as `<style>{css}</style>` at the root of `App.tsx` (the iframe is sandboxed — there is no global stylesheet). Prefix or scope class names to the view. Prefer inheriting fonts and colors from the host unless the mock-up depends on them |
| Inline `style=""` | `style={{ … }}` objects, or move into the CSS string |
| `<script src>` chart library | Load at runtime: in a `useEffect`, append a `<script>` tag for the CDN URL (guard with a loaded flag), then draw into a `ref`'d container; declare the global with a minimal `declare const Chart: …` in a `.d.ts`. Never `npm install` or `import` it |
| `alert` / `confirm` / `prompt` | Inline UI (a status line, a confirm button) |
| `localStorage`, timers | `useState` + `useEffect` with cleanup |
| `fetch` of a real endpoint | Mock data in `src/mockData.ts` |
| `<html>`, `<head>`, `<title>`, `<meta>`, `<body>`, `window.onload`, `document.write` | Dropped |

## 3. Rules

- **Fidelity.** Same sections in the same order, same labels, same numbers in
  the mock data, every interaction preserved. Improve the code, not the design —
  design changes are the customer's call and happen in the next round.
- **Types.** `tsc` runs in the root build: strict types, no `any`, no unused
  imports or variables. Give every mock row an `interface`.
- **No new dependencies.** The template's `package.json` is complete. Charting
  libraries load via script tag at runtime.
- **Host globals are optional.** A static prototype renders from its mock data
  alone — leave `kpiDefinitions`, `fetchKpiData`, `opsAppObjects`,
  `opsAppDocuments`, `TeamRole` and `userContext` untouched and remove the
  template's `kpiDefinitions.length` starter line.
- **Self-contained styling.** Nothing outside the iframe styles the view; if the
  mock-up relied on a CSS framework from a CDN, either load it via a runtime
  `<link>` tag the same way as scripts or inline the handful of rules it used.

## 4. Steps

1. Copy `data-pipelines/main/dashboard/templates/v1/dashboard/` to
   `data-pipelines/main/dashboard/views/<view-slug>/` and write `view.json`
   with a fresh UUID, the view `name`, and the next `order`.
2. Create `src/mockData.ts` from the inventory's data.
3. Port sections one at a time into `src/components/`, wiring state in
   `src/App.tsx`. Keep `src/main.tsx` default-exporting `<App/>`.
4. Add the CSS string and any runtime script loaders.
5. Run `npm run build` at the repo root; fix until green. (Inside the view
   folder, that project's own `npm run build` gives faster feedback, but always
   finish with the root build — only it regenerates the committed artifact.)
6. Return to the orchestrator at Phase 2 step 5 (`df-prototype`).

## 5. After conversion

The `.html` file remains the design reference for the conversation; do not try
to keep both in sync. From here on, feedback is applied to the view and reaches
the customer through the automatic commit and push of the working branch.
