# Creating / editing custom view & widget code

A custom **view** renders an entire dashboard view; a custom **widget** renders
one widget bound to a KPI Definition. Both are authored the same way and live in a
per-folder project. Each project builds to a gitignored `dist/index.js`, which the
repo-root `npm run build` embeds in the pipeline-config artifact the platform reads.

## Scaffolding

Views and Widgets are React apps - A per-folder Vite + TypeScript + React project, copied from the platform
template (see below), whose build produces a single `dist/index.js`.

To create new views/widgets → copy the platform template and use
the multi-file build.

## Host code contract

The built `dist/index.js` is **a function body** (not a function definition) that the
host invokes and which must `return` a React element. Views and widgets get
different argument lists:

```
view:   (React, kpiDefinitions, fetchKpiData, opsAppObjects, opsAppDocuments, TeamRole, userContext) => { …; return <element>; }
widget: (React, data) => { …; return <element>; }
```

- `React` — React 18 (`createElement`, `useState`, `useEffect`, `useMemo`,
  etc.). `react` and `react-dom` are **external** — provided by the host, never
  bundled.
- `kpiDefinitions: ReadonlyArray<KpiDefinition>`,
  `fetchKpiData(kpiId, filters?) => Promise<WidgetDataResponse>`,
  `opsAppObjects` (see "Stateful objects" below), `opsAppDocuments` (see
  "Documents" below), the `TeamRole` enum and `userContext` (see "User context"
  below) are **in-scope globals** for view code, not imports (declared
  ambiently in `src/globals.d.ts`).
- A widget receives `data` — the `WidgetDataResponse` for its bound KPI — and
  nothing else; a view can fetch data for any KPI via `fetchKpiData`.
- The host passes a view's seven arguments in exactly this order; a bundle that
  uses only the leading arguments works unchanged. **Widgets receive `data`
  alone** — widgets are legacy and work only with their bound KPI's data;
  stateful app capabilities are view-only.
- External charting libraries (Chart.js, D3, Recharts, etc.) are loaded at
  runtime via DOM script tags — not via npm imports.

`fetchKpiData(kpiId, filters?)` resolves a KPI's data. `filters` are optional
`@paramName` overrides (key-value pairs matching the KPI's parameter names; a
`timeframe` parameter expands to `_start`/`_end` dates).

TypeScript shapes (mirror these in `src/globals.d.ts`):

```typescript
interface KpiDefinition {
  id: string;
  name: string;
  description: string;
  targetValue: number | null;
  metadata: Record<string, string>;
  resultType: number;        // 0=Scalar, 1=SingleSeries, 2=MultiSeries, 3=Tabular
  baseQuery: string;
  liveQuery: string;
  parameters: Array<{
    name: string;
    dataType: string;        // "date" | "string" | "number" | "boolean" | "timeframe" | "pointInTime" | "enum"
    defaultValue: string | null;
    required: boolean;
    description: string;
    allowedValues: string[] | null;
  }>;
  drilldownQuery: string | null;
}

interface KpiAxisValue {
  type: string;              // "Category" | "Time" | "Number"
  text: string | null;
  number: number | null;
}

interface WidgetDataResponse {
  widgetId: string;          // the kpiId in this context
  resultType: number;        // 0=Scalar, 1=SingleSeries, 2=MultiSeries, 3=Tabular
  scalarValue: number | null;
  dataPoints: Array<{ x: KpiAxisValue; y: number }> | null;
  series: Array<{
    kpiDefinition: { name: string };
    dataPoints: Array<{ x: KpiAxisValue; y: number }>;
  }> | null;
  tabularColumns: Array<{ name: string }> | null;
  tabularRows: Array<{ values: string[] }> | null;
}

declare const kpiDefinitions: ReadonlyArray<KpiDefinition>;
declare function fetchKpiData(
  kpiId: string,
  filters?: Record<string, string>
): Promise<WidgetDataResponse>;
```

The data shape follows the KPI's `resultType`. Examine the bound KPI's
`baseQuery`/`liveQuery` to know what columns and types to expect.

## Stateful objects (opsAppObjects) — views only

`opsAppObjects` lets **view** code **read and write team-scoped objects** —
turning a view into a stateful app (task boards, annotations, planning tools,
saved scenarios). It is injected into custom views only; stateful capabilities
call for a custom view. Object types are declared in the repo as
`data-pipelines/main/objects/<table_name>.json` (shape and rules in
`references/structural-config.md`). The file name IS the type's snake_case
table name — its unique id, and the value every host API call takes. Every
object type has the same shape — JSON documents validated against the type's
JSON Schema — and a type with `ingestToBronze: true` is also ingested into
bronze as `opsappobjects_<table_name>`. Ambient declarations (mirror these in
`src/globals.d.ts`):

```typescript
// ── Stateful objects (opsAppObjects) — views only ──────────────────────────
// Team-scoped objects declared in data-pipelines/main/objects/<table_name>.json: JSON documents
// validated against each type's JSON Schema; a type may also be ingested into bronze
// (`ingestToBronze`). Documents are typed by the declarations the repo build generates from every
// type's schema (data-pipelines/main/dashboard/build/pipeline-build/dist/ops-app-object-types.d.ts,
// included by this project's tsconfig). Injected into custom views only; widget code never receives it.

/** A primitive value: the value type of query `where` filters and of a flat type's root properties; date-time/date values are ISO8601 strings. */
type OpsAppObjectValue = string | number | boolean | null;

/** Any JSON value: the value type of an object's properties. */
type OpsAppObjectJsonValue = OpsAppObjectValue | OpsAppObjectJsonValue[] | { [property: string]: OpsAppObjectJsonValue };

/** A JSON Schema subset node, as declared in the descriptor. */
type OpsAppObjectSchema = { [keyword: string]: OpsAppObjectJsonValue };

/** A declared object type: its JSON Schema, ordering property, list projection and whether its objects are ingested into bronze as opsappobjects_<tableName>. */
interface OpsAppObjectTypeDefinition {
  /** The object type's unique id: its snake_case table name (the objects/<table_name>.json file name). */
  tableName: string;
  schema: OpsAppObjectSchema;
  sequenceField: string;
  /** Root properties that list and query reads return; empty when they return the whole document. */
  listProjection: string[];
  /** Whether objects are ingested into bronze (flat, primitive schemas only). */
  ingestToBronze: boolean;
  /** Monotone schema version, incremented with every change to the definition. */
  versionNumber: number;
}

/** The platform-managed keys every record carries alongside its declared properties. */
interface OpsAppObjectMeta {
  id: string;
  sequenceNumber: number;
}

/** The untyped record shape — a flat map of primitive values — used when a read or write names no type argument. */
type OpsAppObjectProperties = Record<string, OpsAppObjectValue>;

/** A stored object as view code sees it: the declared properties at the top level plus the platform keys. */
type OpsAppObjectRecord<TItem extends object = OpsAppObjectProperties> = TItem & OpsAppObjectMeta;

/** The untyped flat record: root primitive properties, any of which may be null, plus the platform keys. */
interface OpsAppObject {
  id: string;
  sequenceNumber: number;
  [field: string]: OpsAppObjectValue;
}

/**
 * The result of a live read hook — the RTK Query shape, with `data` as the flattened object(s).
 * Re-renders with a fresh result whenever the object type changes (own writes and remote changes).
 */
interface OpsAppQueryResult<TData> {
  data: TData | undefined;      // undefined before the first successful load
  isLoading: boolean;           // true only on first load (no cached data yet)
  isFetching: boolean;          // true whenever a request is in flight, incl. background refetch
  isSuccess: boolean;
  isError: boolean;
  error: unknown;               // the error, when isError
  refetch(): void;              // force an immediate refetch
}

type OpsAppObjectsListTrigger<TItem extends object = OpsAppObjectProperties> = (tableName: string, skip: number, take: number, descending?: boolean) => Promise<OpsAppObjectRecord<TItem>[]>;
type OpsAppObjectGetTrigger<T extends object = OpsAppObjectProperties> = (tableName: string, id: string) => Promise<OpsAppObjectRecord<T> | null>;
type OpsAppObjectsQueryTrigger<TItem extends object = OpsAppObjectProperties> = (tableName: string, where: Record<string, OpsAppObjectValue>, skip: number, take: number, descending?: boolean) => Promise<OpsAppObjectRecord<TItem>[]>;

/** The platform's team role. Injected into the view's scope, so it can be used as a value too. */
declare enum TeamRole {
  Admin = 0,
  Editor = 1,
  Member = 2,
  Reader = 3
}

/**
 * Team-scoped stateful objects declared in data-pipelines/main/objects/.
 * Reads are available to every viewer; writes require Editor role (gate UI on canWrite).
 *
 * Every read and write takes a type argument for the declared properties, so a data layer is
 * strongly typed: `useGetOpsAppObject<Case>(…)`, `upsert<Case>(…)`. Without one, records are the
 * untyped flat map. For a type with a listProjection, type list and query reads with the
 * projection: `useListOpsAppObjects<CaseListItem>(…)` (the build generates `<Title>ListItem` from
 * the projection).
 *
 * Reads follow the RTK Query pattern: each has a **live** hook (auto-updates on change) and a
 * **lazy** hook (fetch on demand via the returned trigger). Call the hooks at the top level of your
 * view, following the rules of hooks.
 */
declare const opsAppObjects: {
  /** The object types declared in the pipeline config. */
  readonly definitions: ReadonlyArray<OpsAppObjectTypeDefinition>;
  /** Server-resolved write capability for the current session. */
  readonly canWrite: boolean;

  /**
   * Live query for a page of objects — the `take`-sized slice starting at `skip`, ordered by
   * sequenceNumber (ascending, or descending when `descending` is true). Auto-updates on change.
   * A type with a listProjection returns only the projected root properties. There is
   * no "get everything" call: an object type can hold a large data set, so page yourself by
   * advancing `skip` (a page shorter than `take` is the last).
   */
  useListOpsAppObjects<TItem extends object = OpsAppObjectProperties>(tableName: string, skip: number, take: number, descending?: boolean): OpsAppQueryResult<OpsAppObjectRecord<TItem>[]>;
  /**
   * Live query for a single object by id — the whole document. Auto-updates on change. A missing
   * object resolves to `isError` (a 404) — check `isError` rather than expecting `data === undefined`.
   */
  useGetOpsAppObject<T extends object = OpsAppObjectProperties>(tableName: string, id: string): OpsAppQueryResult<OpsAppObjectRecord<T>>;

  /** Lazy version of useListOpsAppObjects: `[fetchPage, result]`; `result` then auto-updates. */
  useLazyListOpsAppObjects<TItem extends object = OpsAppObjectProperties>(): [OpsAppObjectsListTrigger<TItem>, OpsAppQueryResult<OpsAppObjectRecord<TItem>[]>];
  /** Lazy version of useGetOpsAppObject: `[fetchObject, result]`; `fetchObject` resolves null when absent. */
  useLazyGetOpsAppObject<T extends object = OpsAppObjectProperties>(): [OpsAppObjectGetTrigger<T>, OpsAppQueryResult<OpsAppObjectRecord<T>>];

  /**
   * Live server-side filtered query: equality on root properties with primitive values (AND
   * semantics; null matches null/unset), ordered by sequenceNumber and paged and projected like
   * useListOpsAppObjects. Datetime/date values compare as exact ISO strings. Refreshes once writes
   * are confirmed (no optimistic update).
   */
  useQueryOpsAppObjects<TItem extends object = OpsAppObjectProperties>(tableName: string, where: Record<string, OpsAppObjectValue>, skip: number, take: number, descending?: boolean): OpsAppQueryResult<OpsAppObjectRecord<TItem>[]>;
  /** Lazy version of useQueryOpsAppObjects: `[runQuery, result]`. */
  useLazyQueryOpsAppObjects<TItem extends object = OpsAppObjectProperties>(): [OpsAppObjectsQueryTrigger<TItem>, OpsAppQueryResult<OpsAppObjectRecord<TItem>[]>];

  /**
   * Inserts or replaces an object — the whole document, validated against the type's schema. Mints
   * an id when the object carries none. Resolves the stored object in full.
   */
  upsert<T extends object = OpsAppObjectProperties>(tableName: string, object: T & { id?: string }): Promise<OpsAppObjectRecord<T>>;
  /** Deletes an object; resolves whether it existed. */
  remove(tableName: string, id: string): Promise<boolean>;

  /**
   * Atomically reserves a gapless block of numbers on the named counter `propertyName` (a
   * snake_case identifier, e.g. "po_number") of object type `objectName`. blockLength defaults
   * to 1 (max 1000). Reserved numbers are consumed on return and never reused, even if the
   * caller discards them. Requires canWrite.
   */
  reserveSequenceNumberBlock(objectName: string, propertyName: string, blockLength?: number): Promise<{ reservedBlockStart: number; reservedBlockEnd: number }>;
};
```

Semantics:

- **One object type shape, one API.** Objects are team-shared (every viewer
  sees the same records). Every type stores a JSON document — any JSON its
  schema allows (nested objects, maps, arrays, nullable unions, enums; root
  primitives only for a type with `ingestToBronze: true`) — as the object's
  properties, plus the platform keys `id` and `sequenceNumber`. date-time/date
  properties are ISO8601 strings. Unknown properties, missing required
  properties, wrong types, a null sequence property, or non-ISO date-time
  strings reject with 400 errors.
- **Records are typed by the caller.** Every read and write takes a type
  argument for the declared properties — `useGetOpsAppObject<Case>(…)`,
  `upsert<Case>(…)`, `useListOpsAppObjects<CaseListItem>(…)` — and returns
  `OpsAppObjectRecord<T>`, i.e. `T & { id; sequenceNumber }`. Without a type
  argument the record is the untyped flat map (`OpsAppObjectProperties`).
  Every type is typed by the aliases the repo build generates from its schema
  (see "Generated types" below).
- **Documents are read and written whole.** `useGetOpsAppObject` and
  `useLazyGetOpsAppObject` return the stored document — a declared root
  property whose type admits `null` and that is absent from the document reads
  as `null`; `upsert` replaces the whole document, validated server-side
  against the type's schema (a violation is a 400 naming the JSON path). Model
  one document per user-facing unit and keep it well under Cosmos's 2 MB item
  limit.
- **List and query return the `listProjection`.** For a type that declares
  one, `useListOpsAppObjects` and `useQueryOpsAppObjects` (and their lazy
  twins) return only the projected root properties — type them with a `Pick`
  of the document type, which is what the generated `<Title>ListItem` is. A
  type without a projection lists whole documents.
- **Reads are RTK Query hooks** — each read has a **live** hook
  (`useListOpsAppObjects`, `useGetOpsAppObject`, `useQueryOpsAppObjects`) that
  auto-updates on any change, and a **lazy** hook (`useLazyListOpsAppObjects`,
  `useLazyGetOpsAppObject`, `useLazyQueryOpsAppObjects`) that returns
  `[trigger, result]` for on-demand fetches (e.g. in an event handler). Call
  them at the top level of the view, following the rules of hooks. Live hooks
  re-render the view with fresh data automatically.
- **Ordering** — list and query results are ordered by `sequenceNumber`,
  ascending by default and newest-first with `descending: true`. The sequence
  number is driven by the type's `sequenceField` (integer → its value;
  date-time/date → epoch ms).
- **Paging is explicit** — the list hooks return a single `[skip, skip+take)`
  page; there is no "all objects" call, because an object type can hold a large
  data set. Page through a type by advancing `skip` (a page shorter than `take`
  is the last one); `take` is capped server-side (max 1000). A live list hook
  keeps one page live — pass the `skip`/`take` of the page the view is showing.
- **`useGetOpsAppObject` on a missing object** resolves to `isError` (a 404);
  the lazy `useLazyGetOpsAppObject` trigger resolves `null` when absent instead.
- **`upsert` replaces the WHOLE object** — the whole document, every time.
  Read-modify-write when changing a subset. Properties added by a newer
  definition version (e.g. on the draft while you run against the active
  config) are preserved server-side: a write from an older-version view
  carries newer-version properties forward along object nesting and map keys
  while arrays are written whole, and a nullable root property added after a
  row was last written reads as `null`. See the versioning invariants in
  `references/structural-config.md`.
- **`canWrite` is server-resolved** (Editor role or above AND token scope).
  Gate every edit affordance on it and never assume writes succeed — Reader
  sessions and shared read-only links get `canWrite = false` and their writes
  reject with 403.
- **The user is `userContext`, not part of `opsAppObjects`** — see "User
  context" below; `canWrite` stays the write gate.
- **Filtered reads are server-side** — `useQueryOpsAppObjects(tableName, where,
  skip, take, descending?)` (and its lazy twin) apply equality filters on
  **root properties with primitive values** — the type's root-level
  string/number/boolean/null properties — with AND semantics (`null` matches
  rows where the property is null or unset), ordered by `sequenceNumber`, paged
  and projected exactly like the list hooks. date-time/date values compare as
  exact ISO strings. Prefer it over paging a
  whole type and filtering in the browser. Filtered results refresh once a
  write is confirmed by the server (no optimistic update, unlike the list
  hooks' in-place replacements).
- **Sequence numbers are reserved atomically** — `reserveSequenceNumberBlock(
  objectName, propertyName, blockLength?)` returns a contiguous, gapless
  `{ reservedBlockStart, reservedBlockEnd }` on a named counter (e.g.
  `"po_number"`) of the type; concurrent callers never receive the same
  number. Numbers are consumed on return and never reused, even if discarded.
  Reservations write no object, are not ingested to bronze, and trigger no
  sync — use them for human-facing sequential ids instead of computing
  max + 1 client-side.
- **Live multi-user refresh** — a live hook re-renders with the fresh page/object
  on this session's own writes and on other users' changes (SignalR-driven cache
  invalidation).
- **`ingestToBronze` types flow into bronze** — each write to a type with
  `ingestToBronze: true` debounces an automatic connector sync (60 s); the
  built-in OpsAppObjects connector lands the type as bronze view
  `opsappobjects_<table_name>`, queryable by transformation specs and KPI
  queries like any other bronze table. Every other type lives in the object
  store and is served to views directly.

Usage example — a live, paged list over the flat `customer_notes` type from
`references/structural-config.md`, typed with its generated `CustomerNotes`
alias (nullable properties are optional members, so the upsert names only what
it sets):

```typescript
const PAGE_SIZE = 50;
const [page, setPage] = React.useState(0);

// Live query for the page on screen — re-renders automatically on any change (own
// writes and other users'), and refetches the new page when `page` changes.
const { data: notes, isLoading } = opsAppObjects.useListOpsAppObjects<CustomerNotes>("customer_notes", page * PAGE_SIZE, PAGE_SIZE);

const addNote_click = async () => {
  await opsAppObjects.upsert<CustomerNotes>("customer_notes", { title: newTitle, resolved: false, noted_at: new Date().toISOString() });
  // no manual refresh — the live query re-renders with the updated page
};

if (isLoading) return React.createElement("div", null, "Loading…");

// Gate edits on canWrite:
<button onClick={addNote_click} disabled={!opsAppObjects.canWrite}>Add note</button>
```

For an on-demand fetch (e.g. a "load more" handler) use the lazy hook:

```typescript
const [fetchPage] = opsAppObjects.useLazyListOpsAppObjects<CustomerNotes>();
const loadMore_click = async () => {
  const next = await fetchPage("customer_notes", offset, PAGE_SIZE); // returns OpsAppObjectRecord<CustomerNotes>[]
  // …append `next` to your own accumulated list
};
```

### Typed data layer — a nested type

The `saved_cases` type from `references/structural-config.md` (root
`title: "Case"`, `listProjection: ["name", "savedAt", "savedBy",
"basedOnCaseId", "inputsFingerprint"]`) gives view code the ambient aliases
`Case`, `CaseListItem`, `Scenario`, `GrowthCell` and `MonthOutput`, generated
by the repo build. A data layer built on them:

```typescript
const PAGE_SIZE = 50;

// The Open screen: newest first, projected to the list properties — one small row per case.
const { data: cases, isLoading } = opsAppObjects.useListOpsAppObjects<CaseListItem>("saved_cases", 0, PAGE_SIZE, true);

// "Already saved?" — a server-side equality filter on a root primitive property, projected the same way.
const { data: matches } = opsAppObjects.useQueryOpsAppObjects<CaseListItem>("saved_cases", { inputsFingerprint }, 0, 1);
const alreadySaved = matches !== undefined && matches.length > 0;

// Open: the whole document, on demand.
const [fetchCase] = opsAppObjects.useLazyGetOpsAppObject<Case>();
const openCase_click = async (id: string) => {
  const stored = await fetchCase("saved_cases", id); // OpsAppObjectRecord<Case> | null
  if (stored === null) return;
  setCurrentCase(stored);
};

// Save: one upsert of the whole document, validated against the schema server-side.
// Pass `id` to replace an existing case; omit it to mint a new one.
const saveCase_click = async () => {
  const saved = await opsAppObjects.upsert<Case>("saved_cases", {
    name,
    savedAt: new Date().toISOString(),
    savedBy: userContext.displayName,
    basedOnCaseId: baseCaseId,
    inputsFingerprint,
    anchorCashSource: "actual",
    scenarios,
    growth,
    outputs,
  });
  setCurrentCase(saved); // OpsAppObjectRecord<Case>: the stored document plus id and sequenceNumber
};
```

### Generated types

The repo build (`npm run build`) validates every `objects/<table_name>.json`
descriptor and emits
`data-pipelines/main/dashboard/build/pipeline-build/dist/ops-app-object-types.d.ts`
— a gitignored global declaration file with, per object type:

- `type <Title> = { … }` — the document type. `<Title>` is the schema's root
  `title` (PascalCase), defaulting to the PascalCased table name
  (`saved_cases` → `SavedCases`, `customer_notes` → `CustomerNotes`).
  `required` properties are non-optional and every other property is optional;
  a `type` union (including `null`) is a TypeScript union; `enum` is a literal
  union; `array` is `Array<T>`; an `additionalProperties` schema is a
  `Record<string, T>` map; `description` and validated `format` become JSDoc.
  A legacy descriptor (no `definitionVersion`) yields the declarations of its
  migrated form — `customer_notes` gives `CustomerNotes` with
  `body?: string | null` members and a non-optional sequence member.
- `type <Title>ListItem = Pick<Title, …>` from `listProjection` (or
  `= <Title>` for a type without one) — the type for list and query reads.
- one alias per `$defs` entry, named by its key (`Scenario`, `GrowthCell`, …).
  `$defs` names are repo-global: two types that share a name declare
  deep-equal schemas.

The view template's `tsconfig.json` includes that file
(`"../../build/pipeline-build/dist/ops-app-object-types.d.ts"` in `include`),
so the aliases are ambient in view code — reference them directly, without
imports. Run the root build once after cloning the repo to materialize the
file; an existing view adopts the include line in its `tsconfig.json`
`include` array. A root `title` or `$defs` key that matches a `globals.d.ts`
name or a common DOM/ES global type name fails the build.

## Documents (opsAppDocuments) — views only

`opsAppDocuments` lets **view** code produce **files the user can keep** —
rendered PDFs (purchase orders, statements, hand-off packets), exports, or any
other blob — stored per team and handed to the browser as downloads. It is
injected into custom views only; widget code does not receive it. Ambient
declarations (mirror these in `src/globals.d.ts`):

```typescript
/** A stored document's metadata. Ids are platform-minted. */
interface OpsAppDocument {
  id: string;
  fileName: string;
  contentType: string;
  sizeBytes: number;
  createdAt: string;      // ISO8601
  createdBy: string;      // the creating user's email address
  lastModified: string;   // ISO8601
}

type PdfPageSize = "Letter" | "A4";

/** The bytes and identity of a document to store: a Blob, or text encoded as UTF-8. */
interface OpsAppDocumentContent {
  fileName: string;
  contentType: string;
  content: Blob | string;
}

type OpsAppDocumentsListTrigger = () => Promise<OpsAppDocument[]>;
type OpsAppDocumentGetTrigger = (documentId: string) => Promise<OpsAppDocument | null>;

/**
 * Reads follow the RTK Query pattern: each has a **live** hook (auto-updates when the team's
 * documents change) and a **lazy** hook (fetch on demand via the returned trigger). Call the hooks
 * at the top level of your view, following the rules of hooks. `renderPdf` and `download` are not
 * reads and are plain calls.
 */
declare const opsAppDocuments: {
  /** Live query for all of the team's documents, newest first. Auto-updates on every write. */
  useListOpsAppDocuments(): OpsAppQueryResult<OpsAppDocument[]>;
  /**
   * Live query for a single document's metadata by id. Auto-updates on change. A missing document
   * resolves to `isError` (a 404) — check `isError` rather than expecting `data === undefined`.
   */
  useGetOpsAppDocument(documentId: string): OpsAppQueryResult<OpsAppDocument>;

  /** Lazy version of useListOpsAppDocuments: `[fetchDocuments, result]`; `result` then auto-updates. */
  useLazyListOpsAppDocuments(): [OpsAppDocumentsListTrigger, OpsAppQueryResult<OpsAppDocument[]>];
  /** Lazy version of useGetOpsAppDocument: `[fetchDocument, result]`; `fetchDocument` resolves null when absent. */
  useLazyGetOpsAppDocument(): [OpsAppDocumentGetTrigger, OpsAppQueryResult<OpsAppDocument>];

  /** Stores a new document (max 50 MiB); the platform mints its id. Requires canWrite. */
  create(input: OpsAppDocumentContent): Promise<OpsAppDocument>;
  /** Replaces an existing document's bytes and name in place. Requires canWrite. */
  replace(documentId: string, input: OpsAppDocumentContent): Promise<OpsAppDocument>;
  /** Deletes a document; resolves whether it existed. Requires canWrite. */
  remove(documentId: string): Promise<boolean>;
  /**
   * Renders self-contained HTML (inline CSS, data-URI images, no scripts or external URLs) to
   * PDF in the browser and stores it as a document. `pageSize` defaults to Letter; `marginPt` is
   * the page margin in points on all sides (default 0). `url` is the document's download route.
   */
  renderPdf(input: { html: string; fileName: string; pageSize?: PdfPageSize; marginPt?: number }): Promise<{ documentId: string; url: string }>;
  /** Hands a stored document to the browser as a download; the host performs it outside any sandbox. */
  download(documentId: string): Promise<void>;
};
```

Semantics:

- **Documents are team-scoped file blobs** with platform-minted ids and
  metadata (`fileName`, `contentType`, `sizeBytes`, `createdAt`, `createdBy`,
  `lastModified`). Writes (`create`, `replace`, `remove`, `renderPdf`) follow
  the same write gate as objects — gate affordances on `opsAppObjects.canWrite`.
  A document may be at most 50 MiB; file names are plain ASCII with an
  extension.
- **`renderPdf` renders in the browser** — the host lays the HTML out in a
  hidden same-origin frame and rasterizes it page by page (Letter by default, or
  A4; `marginPt` sets a uniform page margin in points, default 0), then stores
  the PDF as a document. The HTML must therefore be
  **self-contained**: inline `<style>`/CSS, images as data URIs, no scripts and
  no external URLs (they are not fetched). Keep documents simple and print-like
  (tables, headings, block layout); build the HTML string in the view from the
  data it already has.
- **`download` works from inside the embedded frame** — the host performs the
  download outside any sandbox (it delegates to the top-level window when
  embedded), so views never need `window.open`, `<a download>` or blob URLs of
  their own. The `url` returned by `renderPdf` is the document's download route,
  for display or later `download(documentId)` calls.
- **Reads follow the RTK Query pattern**, like `opsAppObjects`: a live hook
  (`useListOpsAppDocuments`, `useGetOpsAppDocument`) that re-renders whenever the
  team's documents change, and a lazy hook (`useLazyListOpsAppDocuments`,
  `useLazyGetOpsAppDocument`) returning `[trigger, result]` for fetching from an
  event handler. Every write invalidates the document cache, so a list rendered
  from the live hook picks up a `create`, `replace` or `remove` on its own. Keep
  the *record* of a document (its id, who produced it, when) in an object type
  when the app needs to relate it to other state.

Usage example — render a purchase order and hand it to the user:

```typescript
const exportPo_click = async () => {
  const html = buildPurchaseOrderHtml(order); // self-contained HTML string
  const { documentId } = await opsAppDocuments.renderPdf({ html, fileName: `PO-${order.po_number}.pdf` });
  await opsAppObjects.upsert("po_documents", { po_id: order.id, document_id: documentId, created_by: userContext.displayName, created_at: new Date().toISOString() });
  await opsAppDocuments.download(documentId);
};
```

## User context (`userContext`) — views only

The user the session runs under, as the server authorized them — the ops app
counterpart of the platform's `CoreApplicationContext.userContext`, established
when the session is (the ops app's token exchange returns it) and provided to the
view as an in-scope global, separate from the objects and documents stores.

```typescript
/** The ops app's user context: the user behind the session, server-resolved. */
interface OpsAppUserContext {
  id: string;
  /** Currently the user's email address (the platform has no separate display name). */
  displayName: string;
  role: TeamRole;
}

declare const userContext: OpsAppUserContext;
```

- **`userContext` is server-resolved** — `{ id, displayName, role }` for the
  authenticated session. `role` is the `TeamRole` enum (`TeamRole.Admin`,
  `TeamRole.Editor`, `TeamRole.Member`, `TeamRole.Reader`), injected into the
  view's scope, so compare with `userContext.role === TeamRole.Admin`, never a
  string; `displayName` is currently the email address.
- Use it for attribution fields (e.g. `created_by`) and role-based affordances
  (an approval step only Admins see). It is **not** a write gate —
  `opsAppObjects.canWrite` is.

## Per-view Vite project structure — copy the platform template

**Don't scaffold the project by hand.** The platform seeds canonical,
ready-to-build Vite + TypeScript + React templates into the repo under
`data-pipelines/main/dashboard/templates/v1/` (platform-owned — never edit the
templates in place). Start every new view/widget by copying the matching template:

- **New view** → copy `data-pipelines/main/dashboard/templates/v1/dashboard/`
  into `data-pipelines/main/dashboard/views/<view-slug>/`.
- **New widget** → copy `data-pipelines/main/dashboard/templates/v1/widget/`
  into `data-pipelines/main/dashboard/views/<view-slug>/<widget-slug>/`.

Each template already contains the full toolchain so the build "just works":

- `package.json` — `"type": "module"`, `"build": "tsc && vite build"`, `react` and
  `react-dom` plus the `@types/*`, `@vitejs/plugin-react`, `typescript`, `vite`
  toolchain.
- `tsconfig.json` — `ESNext` target/module, `moduleResolution: "bundler"`,
  classic-JSX (`jsx: "react"`, `jsxFactory: "React.createElement"`), `strict`,
  `paths: { "@/*": ["./src/*"] }`, and an `include` entry for the generated
  object type declarations
  (`"../../build/pipeline-build/dist/ops-app-object-types.d.ts"`, see
  "Generated types" above).
- `vite.config.ts` — `@vitejs/plugin-react` with the **classic** JSX runtime and
  an IIFE library build whose `footer: 'return DataFabriqView;'` makes the built
  file a valid function body that returns the view element (`react`/`react-dom`
  external, mapped to the host globals).
- `src/main.tsx` — default-exports `<App/>` (the element the built function body
  returns).
- `src/App.tsx` — the root component to build out.
- `src/globals.d.ts` — **the canonical host contract**. The view template
  declares the `KpiDefinition`/`WidgetDataResponse`/`KpiAxisValue`/`OpsAppObject*`/
  `OpsAppDocument*`/`OpsAppUserContext` shapes and the `kpiDefinitions` /
  `fetchKpiData` / `opsAppObjects` / `opsAppDocuments` / `TeamRole` /
  `userContext` globals; the widget template declares only the `data` global
  (`WidgetDataResponse`). Treat this file as the source of truth — don't
  hand-redefine it.
- `.gitignore` — ignores `node_modules` and `dist`.

After copying a **view** template, verify `src/globals.d.ts` declares
`opsAppObjects` (including the generic `useQueryOpsAppObjects`,
`OpsAppObjectRecord<T>` and `reserveSequenceNumberBlock`), `opsAppDocuments`
and `userContext`, and that `tsconfig.json` includes
`../../build/pipeline-build/dist/ops-app-object-types.d.ts` — if the seeded
template predates a feature, append or update the ambient blocks from the
"Stateful objects (opsAppObjects)", "Documents (opsAppDocuments)" and "User
context (userContext)" sections above and add the include entry. In a **widget** project, none of
`opsAppObjects`, `opsAppDocuments` or `userContext` may be declared or used —
the host never injects them into widgets; if a seeded widget template declares
them, remove the declarations. Then add a `view.json` (or `widget.json`
for a widget) at the folder root with the descriptor shape from
`references/structural-config.md` (fresh UUID `id`), and author the view/widget
logic across `src/**` (components, data-layer, services as needed); `react` and
`react-dom` are imported normally but resolve to the host globals at runtime.

## Build

Run `npm run build` at the **repo root** — it builds every view/widget project
(`npm install` on first run, then the project's `tsc && vite build` into
`dist/index.js`), then assembles the pipeline config, embedding each built bundle,
into `data-pipelines/main/build-output/pipeline-config.json` and bin-placing that
one file. The build order matters: the assembly reads what the builds just
produced. (Working iteratively inside one view's folder, you can run that
project's own `npm run build` for faster feedback, but always finish with the root
build — the artifact is only regenerated there.)

**Fix every type-check / bundle error and re-run until the build succeeds.
Never hand off a view/widget whose build failed.**

Then return to the orchestrating workflow. What lands in that commit: the `src/**` files, the project config files (`package.json`,
`tsconfig.json`, `vite.config.ts`, `view.json`/`widget.json`, `.gitignore`), and
the updated `data-pipelines/main/build-output/pipeline-config.json`. `dist/` and
`node_modules/` stay gitignored — they are never committed.

## Widgets

Widgets follow the identical project / build pattern in their
`<view-slug>/<widget-slug>/` folder, with a `widget.json` instead of
`view.json`. A widget's code receives **only** the data for its bound KPI —
no `kpiDefinitions`, `fetchKpiData`, `opsAppObjects`, or `opsAppDocuments`. For
stateful app capabilities, build a custom view instead.
