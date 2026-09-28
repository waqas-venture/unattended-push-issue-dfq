# Mock pipeline — CSV/XLSX mock data behind a prototype view

The mock-pipeline data mode puts mock data through the real Data Pipeline with
the smallest possible footprint: a CSV or XLSX file → Bronze via the **Custom
Files** connector → one minimal Gold Table per file/sheet → one Tabular KPI per
table → the view reads rows with `fetchKpiData`. No layering, no
parameterization, no connector skills.

Load `df-data-pipeline-manager` → `references/kpi-queries.md` or
`df-dashboard-source-code` → `references/sql-queries.md` only if a file-shape
question below is not answered here — keep the context small.

## 1. Write the mock file(s)

- Prefer **CSV, one file per table** — simplest to generate and re-upload.
  XLSX works too: one sheet per table, sheet name = table name.
- Row 1 of every file/sheet is the header row. Header names become Bronze
  column names after snake-casing (`Order Date` → `order_date`), so use plain,
  unique headers.
- Use ISO dates (`2026-01-31`), plain numbers (no currency symbols or thousands
  separators), and consistent casing for categories.
- Generate the file with a short node or python script in the session's scratch
  directory; keep the generator so the next round can regenerate it.

Every Bronze column from a custom file is **text**; types are applied in the
spec SQL (step 4).

## 2. Upload through the Custom Files connector

The file bytes never pass through the model — the MCP tools hand you a staging
URL and you `curl` the file to it.

1. `create_custom_file_upload` with `connectionName: "<Table Name>"` and
   `fileName: "<file>.csv"` (or `.xlsx`). Use a new name for a new table; reuse
   the existing name (or pass `connectionId`) to upload a new version.
2. Run the returned `curl` command exactly as given, with the local path.
3. `complete_custom_file_upload` with the returned `uploadId` and
   `connectionId`, the same `fileName`, and — for a brand-new connection — the
   `connectionName`.
4. `trigger_custom_files_sync`, then poll `get_custom_files_sync_status` until
   `Completed`. Per-file parse errors are reported there.

Rules that bite:

- **Headers are immutable per connection.** A new version must have the same
  headers in the same order or completion fails (the current version stays
  live). To change columns, upload under a **new connection name** and update
  the table, spec, and KPI to match; delete the old connection in the web app's
  Connections page if it is no longer needed.
- **Names must not collide after snake-casing** — `Sales Data` and `Sales-Data`
  both become `sales_data` and are rejected.
- Needs a shell (Claude Code / Cowork). Without one, direct the user to upload
  on the Connections page.

## 3. Bronze table names

- CSV, or an XLSX with one sheet: `custom_<snake(connectionName)>`
- XLSX with several sheets: `custom_<snake(connectionName)>__<snake(sheetName)>`

Confirm with `get_bronze_schema_context` scoped to the Custom source if unsure.

## 4. Minimal Gold Table + spec (per table)

All paths are under `data-pipelines/main/`. File name = the table's snake_case
name, verbatim.

`data-model/model.json` (create if missing):

```json
{ "description": "Prototype data model backed by mock Custom Files data.", "metadata": {} }
```

`data-model/tables/<table>.json`:

```json
{
  "name": "<table>",
  "displayName": "<Table Name>",
  "description": "Mock data for the <view name> prototype.",
  "columns": [
    { "name": "order_date", "displayName": "Order Date", "dataType": "date", "description": "…" },
    { "name": "region", "displayName": "Region", "dataType": "string", "maxLength": 100, "description": "…" },
    { "name": "revenue", "displayName": "Revenue", "dataType": "decimal", "description": "…" }
  ]
}
```

`transformation-specs/<table>.json`:

```json
{
  "name": "build_<table>",
  "description": "Types the mock <Table Name> rows from the Custom Files upload.",
  "outputTable": "<table>",
  "reasoning": "Prototype mock data — a straight projection with type casts; no business logic."
}
```

`dashboard/src/data-layer/queries/transformation-specs/<table>.sql` — every
Bronze column is text, so cast each one and alias it to the table's column name
exactly:

```sql
SELECT
  TRY_CAST(order_date AS DATE)          AS order_date,
  region                                AS region,
  TRY_CAST(revenue AS DECIMAL(18, 2))   AS revenue
FROM custom_<snake_connection_name>
```

Validate with `validate_sql_query`.

## 5. One Tabular KPI per table

`dashboard/kpi-definitions/<kpi-slug>.json` (slug = the KPI name slugged; name
it after the table, e.g. `Mock Orders`):

```json
{
  "id": "<fresh UUID>",
  "name": "Mock Orders",
  "description": "All rows of the mock orders table for the prototype view.",
  "targetValue": null,
  "resultType": "Tabular",
  "parameters": [],
  "metadata": {}
}
```

`dashboard/src/data-layer/queries/kpi-definitions/<kpi-slug>-base.sql` and
`<kpi-slug>-live.sql` — both simply:

```sql
SELECT * FROM <table>
```

Validate both together with `validate_sql_query`. No `-drilldown.sql`.

## 6. Read the rows in the view

```ts
interface OrderRow { order_date: string; region: string; revenue: number }

function rowsOf(response: WidgetDataResponse): Record<string, string>[] {
  const columns = response.tabularColumns ?? [];
  return (response.tabularRows ?? []).map(row =>
    Object.fromEntries(columns.map((column, i) => [column.name, row.values[i]])));
}

const kpi = kpiDefinitions.find(k => k.name === 'Mock Orders');
// in a useEffect: const response = await fetchKpiData(kpi.id); setRows(rowsOf(response).map(toOrderRow));
```

Tabular values arrive as strings — convert numbers and dates in a small `toXRow`
mapper. Keep the component tree identical to the static version so switching
data modes is a one-module change.

## 7. After the push

Once the commit that adds the table and spec is on `draft` — pushed to it, or
merged into it from the working branch — it schedules a gold run (30-second
debounce). Poll `get_pipeline_run_status` (`dataPipelineConfigurationId:
"draft"`) to `Completed`, then confirm rows with `run_query`
(`schema: "gold"`, `schema_type: "draft"`) or `get_widget_data`
(`schema_type: "draft"`). A failure points at one of the files above — fix it,
rebuild, commit, push again.
