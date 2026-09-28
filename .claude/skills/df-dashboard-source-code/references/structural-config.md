# Structural pipeline config — JSON descriptor shapes and rules

The repo IS the pipeline config: these files are assembled by the repo build into
the one artifact the platform reads (cached by commit). Editing them is how you
change the config.

## File shapes

camelCase, 2-space indent, LF, nulls/empties omitted — keep the style so server
rewrites don't churn your diffs. Paths are relative to `data-pipelines/main/`.

- `pipeline.json` — `{ "schemaVersion": 1, "materializedViewsEnabled": bool, "materializeToDatabricks": bool, "dataMapping": { "configurationName", "description" } }`
- `dashboard/dashboard.json` — `{ "name": "<dashboard name>" }`
- `dashboard/views/<view-slug>/view.json` — `{ "id": "<uuid>", "name": "<view name>", "order": <int> }`. The folder name must be the slug of `name` (same slug rule as KPIs — see `sql-queries.md`). Renaming a view = update `name` AND move the whole folder to the new slug.
- `dashboard/views/<view-slug>/<widget-slug>/widget.json` — `{ "id", "title", "order", "viewType", "kpiDefinitionId", "dataConfig": { "settings": {…} }, "layoutConfig": { "row", "column", "rowSpan", "columnSpan" }, "summary" }`. `viewType` is the enum name (`Number`, `LineChart`, `BarChart`, `Table`, `PieChart`, `AreaChart`, `ColumnChart`, `Funnel`, `Waterfall`, `RadialScore`, `Sankey`, `BubbleChart`, `Heatmap`).
- `dashboard/kpi-definitions/<kpi-slug>.json` — `{ "id", "name", "description", "targetValue", "resultType", "parameters": […], "metadata" }`. `resultType` is the enum name (`Scalar`, `SingleSeries`, `MultiSeries`, `Tabular`). The SQL stays in the paired `.sql` files — never inline queries in the JSON.
- `data-model/model.json` — `{ "description", "metadata" }`
- `data-model/tables/<table-name>.json` — `{ "name", "displayName", "description", "columns": [{ "name", "displayName", "dataType", "maxLength", "label", "description" }] }`. File name = the table's snake_case `name` verbatim.
- `transformation-specs/<outputTable>.json` — `{ "name", "description", "outputTable", "reasoning" }`. The SQL stays in the paired `.sql` file.
- `objects/<table_name>.json` — an object type definition for the stateful ops-app-objects store: `{ "definitionVersion": 1, "schema": {…}, "sequenceField", "listProjection"?, "ingestToBronze"?, "versionNumber"? }`; full shape and rules in the "Ops App Object type definitions" section below. The file name IS the type's snake_case table name — its unique id; the descriptor carries no id or name of its own.

## Ops App Object type definitions

`objects/<table_name>.json` declares one object type that custom view code
reads and writes at runtime via the `opsAppObjects` host API (see
`references/custom-code.md`; views only — widgets do not receive the API). One
file per type.
The **file name IS the type's table name** — semantically a table in the
backend that stores the objects, and the type's unique id everywhere (host API
calls, bronze views, this repo). Object types have no UUID; never generate one.

Every object type has the same shape. Its objects are **JSON documents
validated against a JSON Schema subset** (`schema`), ordered by a
`sequenceField`, optionally listed through a `listProjection`, and — when
`ingestToBronze` is `true` — also ingested into bronze as
`opsappobjects_<table_name>`, so Transformation Specs and KPI queries read them
like any other bronze table. Every type shares the table-name rule,
`versionNumber`, platform-minted ids, change numbers, sequence counters, the
CRUD/query host API, the MCP object tools and the TypeScript declarations the
repo build generates.

Validation — the root `npm run build` fails otherwise:

- file name — the table name: snake_case matching `^[a-z][a-z0-9_]*$` plus
  `.json`. The descriptor must NOT contain `id`, `name`, or `tableName` keys —
  the file name alone identifies the type.
- `definitionVersion` — `1` for the descriptor form below. Absent means `0`:
  the legacy form, migrated on the fly (see "Legacy descriptors").
- `schema` (required) — a root object node (`"type": "object"`) with at least
  one entry in `properties`, built from the keyword subset below.
- `sequenceField` (required) — names a root property that is listed in the
  root `required` and whose schema is exactly `{ "type": "integer" }`,
  `{ "type": "string", "format": "date-time" }` or
  `{ "type": "string", "format": "date" }` (plus `title`/`description`). It
  drives `sequenceNumber` ordering and can never be null on a write.
- `listProjection` — optional; distinct root property names.
- `ingestToBronze` — optional boolean, default `false`. `true` requires a flat
  schema (see "Bronze ingestion").
- `versionNumber` — a non-negative integer; may be omitted (treated as 0, and
  the build emits it as 0). Governed by the versioning invariants below.

### Deciding on `ingestToBronze`

Set `ingestToBronze: true` only when the state must flow into the data
pipeline — bronze → Gold Tables → KPI queries and Transformation Specs — and
shape that type **flat**: root primitive properties only. In every other case
leave it `false`: the type lives in the object store, its schema nests freely,
is validated on every write, is typed in view code by the declarations the
repo build generates, and stores exactly the shape the view writes. Model
state as **one document per user-facing unit** — a saved snapshot is one
object, rather than a header plus child rows — and keep each document well
under Cosmos's 2 MB item limit. Declare a `listProjection` for any type a view
lists, and type the view's data layer with the host API generics
(`references/custom-code.md`).

### A flat type ingested into bronze

`objects/customer_notes.json` declares the type whose table name is
`customer_notes`: nullable primitives at the root, a `date-time` sequence
field, and `ingestToBronze: true`:

```json
{
  "definitionVersion": 1,
  "schema": {
    "type": "object",
    "properties": {
      "title": { "type": ["string", "null"] },
      "body": { "type": ["string", "null"] },
      "score": { "type": ["number", "null"] },
      "attempt_count": { "type": ["integer", "null"] },
      "resolved": { "type": ["boolean", "null"] },
      "due_on": { "type": ["string", "null"], "format": "date" },
      "noted_at": { "type": "string", "format": "date-time" }
    },
    "required": ["noted_at"]
  },
  "sequenceField": "noted_at",
  "ingestToBronze": true,
  "versionNumber": 0
}
```

The schema declares no root `title`, so the repo build generates the
TypeScript alias `CustomerNotes` (the PascalCased table name): every nullable
property is an optional member such as `body?: string | null`, and the
sequence member `noted_at: string` is non-optional.

### A nested type in the object store

`objects/saved_cases.json` declares the type whose table name is
`saved_cases`, kept in the object store (`ingestToBronze: false`) and listed
through a `listProjection`. Its root `title` (`Case`) names the TypeScript type
the repo build generates for view code, and each `$defs` entry becomes a type
of its own:

```json
{
  "definitionVersion": 1,
  "schema": {
    "type": "object",
    "title": "Case",
    "properties": {
      "name": { "type": "string" },
      "savedAt": { "type": "string", "format": "date-time" },
      "savedBy": { "type": "string" },
      "basedOnCaseId": { "type": ["string", "null"] },
      "inputsFingerprint": { "type": "string" },
      "anchorCashSource": { "type": "string", "enum": ["actual", "assumption"] },
      "scenarios": { "type": "array", "items": { "$ref": "#/$defs/Scenario" } },
      "growth": { "type": "object", "additionalProperties": { "type": "object", "additionalProperties": { "$ref": "#/$defs/GrowthCell" } } },
      "outputs": { "type": "array", "items": { "$ref": "#/$defs/MonthOutput" } }
    },
    "required": ["name", "savedAt", "savedBy", "scenarios", "outputs"],
    "$defs": {
      "Scenario": { "type": "object", "properties": { "key": { "type": "string" }, "name": { "type": "string" } }, "required": ["key", "name"] },
      "GrowthCell": { "type": "object", "properties": { "newLogos": { "type": "integer" } } },
      "MonthOutput": { "type": "object", "properties": { "month": { "type": "string", "format": "date" }, "revenueK": { "type": "number" } } }
    }
  },
  "sequenceField": "savedAt",
  "listProjection": ["name", "savedAt", "savedBy", "basedOnCaseId", "inputsFingerprint"],
  "ingestToBronze": false,
  "versionNumber": 0
}
```

Here `growth` is a two-level **map** (`additionalProperties` schemas: scenario
key → department key → cell), `scenarios` and `outputs` are **arrays** of
`$defs` records, `basedOnCaseId` is a **nullable** union, `savedAt` and `month`
carry validated **formats**, and `anchorCashSource` is an **enum**.

### Legacy descriptors (`definitionVersion` absent)

A descriptor without `definitionVersion` is the legacy form —
`{ "fields": [{ "name", "type" }], "sequenceField", "versionNumber" }`, with
`type` ∈ `string | integer | number | boolean | date | datetime`. The repo
build and the platform migrate it on the fly to its version-1 equivalent:
every field becomes a root property typed `[<type>, "null"]` (`date` →
`["string", "null"]` with `format: "date"`, `datetime` → `["string", "null"]`
with `format: "date-time"`), the sequence field is non-nullable and the only
`required` entry, and `ingestToBronze` is `true`. A legacy descriptor builds
unchanged; the `/df-migrate-legacy-components-in-repo` command rewrites it to
version 1 in the repo, and the built artifact is identical before and after.

#### Schema subset

| Keyword | Where allowed | Rule |
|---|---|---|
| `type` | any node | one of `string`, `number`, `integer`, `boolean`, `object`, `array`, `null`, or a non-empty array of distinct ones (`["string", "null"]` is a nullable string) |
| `properties` | object nodes | property name → schema. Names match `^[A-Za-z_][A-Za-z0-9_]*$` at every level (camelCase is natural; root names are snake_case when `ingestToBronze` is `true`); the root names `id`, `sequenceNumber`, `changeNumber`, `sequence_number` and `change_number` are reserved |
| `required` | object nodes | names declared in the same node's `properties` |
| `additionalProperties` | object nodes | `true` — an untyped open object; or a schema — a **map** whose dynamic keys each hold a value of that schema |
| `items` | array nodes | one schema; required on every array node |
| `enum` | any node | non-empty list of primitives, matching `type` when both are given |
| `format` | any node | `date-time` and `date` are validated on strings; every other value is an annotation |
| `title`, `description` | any node | annotations. The root `title` names the generated TypeScript type — the build PascalCases it (`"Saved case"` → `SavedCase`; default: the PascalCased table name) |
| `$defs` | root only | name → schema; each key is an identifier (`^[A-Za-z_][A-Za-z0-9_]*$`, PascalCase by convention) and becomes a generated TypeScript alias named by its PascalCased key |
| `$ref` | any node | local `#/$defs/<name>` only, alone on its node apart from `title`/`description`; recursion is allowed |

Any other keyword fails the build and the platform load.

**Object nodes are closed by default.** A node with `properties` and no
`additionalProperties` accepts exactly its declared properties and rejects
unknown ones — what keeps the generated TypeScript exact.
`additionalProperties: true` is the explicit untyped-object form;
`additionalProperties: <schema>` models a map with dynamic keys. Every object
node needs `properties` or `additionalProperties`.

### Bronze ingestion (`ingestToBronze: true`)

Bronze ingestion is supported for **flat** schemas only. With
`ingestToBronze: true` the root node declares no `additionalProperties`, the
schema has no `$defs` or `$ref`, and every root property is a single primitive
type (`string`, `integer`, `number`, `boolean`), optionally nullable
(`[<type>, "null"]`), optionally with `enum` or `format`. Root property names
are snake_case (`^[a-z][a-z0-9_]*$`) because they become bronze view columns.

The built-in **OpsAppObjects** connector ingests each such type as bronze view
`opsappobjects_<table_name>`: columns are the root properties
(string→NVARCHAR, with `format: date`→DATE and `format: date-time`→DATETIME2;
integer→BIGINT; number→FLOAT; boolean→BIT) plus the reserved `id` (string),
`sequence_number` (BIGINT), and `change_number` (BIGINT). date-time/date
values are stored in objects as ISO8601 strings and land as real
DATETIME2/DATE columns. Rows arrive ordered by `sequence_number`. A write from
view code to an `ingestToBronze` type debounces an automatic connector sync
(60 s), then the normal bronze→gold flow runs — Transformation Specs and KPI
queries read `opsappobjects_<table_name>` like any other bronze table. A type
with `ingestToBronze: false` lives in the object store only and is served to
views directly.

### Reads, writes, projection and ordering

An object is stored as the **whole JSON document**, validated against the
union (highest-version) schema on every write. `get` and `upsert` are always
the whole document, while `list` and the filtered `query` return exactly the
`listProjection` properties (applied as a Cosmos SELECT projection, so a large
document lists cheaply) — or whole documents for a type without a projection.
Reads return the stored document; a declared root property whose type admits
`null` and that is absent from the document reads as `null`. The filtered
query (`where`) matches root properties with primitive values, and
`descending: true` on list and query orders newest-first by `sequenceNumber`.

### Versioning invariants & procedure

Object data is stored ONCE per team, shared by the active and draft configs.
So definitions evolve **additively only** — once a type exists, the only
permitted changes add to it, and every change must increment `versionNumber`.

- the file name (= table name) and `sequenceField` are immutable;
- the definition file is permanent — once a type exists, its descriptor stays
  in the repo;
- definitions declaring the same `versionNumber` must be identical — if you
  change the definition, bump the version in the same edit;
- properties are only ever added — at any level: the root, nested objects, map
  values, array items, `$defs` entries — and every added property is optional
  (each object node's `required` set stays identical across versions);
- `enum` lists may grow;
- every node keeps its `type` set, `format`, `additionalProperties` (compared
  recursively when it is a schema) and `items` structure;
- `listProjection` and `ingestToBronze` may change, with a version bump
  (turning `ingestToBronze` on requires the flat schema above).

The platform verifies these invariants pairwise across the active and draft
configs whenever it loads the type; a violation makes reads, writes, and
connector ingestion for that table fail until the descriptor is fixed.

**To extend custom code with new functionality:** add new optional properties
AND increment `versionNumber`, keeping every existing declaration unchanged.
This is what lets two config versions operate on the same rows
simultaneously: rows are stored in the highest-version (union) shape. Reads
return the stored document — a nullable root property absent from a row
written before it existed reads, and ingests into bronze, as `null` — and a
write from an older-version view carries newer-version properties forward
along object nesting and map keys, while arrays are written whole by the
writer.

## Rules

- **Generate a new UUID for every new view/widget/KPI** and never change an
  existing `id` — ids are how the platform correlates ACLs and permalinks.
  (Object types are the exception: they have no UUID — the file name / table
  name is their id.)
- **Never put these in the JSON files:** SQL queries, custom code,
  ACLs/permissions, or permalink slugs. They live elsewhere (`.sql` files, a
  view/widget project's `src/**`, or the platform).
- **Create/delete files as a unit:** a new KPI = its `.json` + its `.sql`
  files; a deleted spec = its `.json` + its `.sql`; a deleted view = its whole
  folder. (Object type files are never deleted — see the versioning
  invariants above.)
- `order` controls display order (0-based) among sibling views/widgets.
- **Build after every change: `npm run build` at the repo root.** The repo build
  builds every view/widget project into that folder's `dist/index.js`, validates
  everything (naming/ids/references, JSON syntax), and assembles the pipeline
  config — embedding those built bundles — into
  `data-pipelines/main/build-output/pipeline-config.json`, the **only** committed
  build output and the only thing **the platform reads**. An unbuilt push leaves
  the platform serving the previous artifact.
- **Never hand-edit anything under `data-pipelines/main/build-output/`** — it
  is generated by the build. All `dist/` folders are build intermediates and
  stay gitignored.
