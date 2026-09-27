// Ambient declarations for the values the host injects as function arguments when
// it runs the built index.js (see the dashboard-source-code skill).
//
// React itself is imported normally (and marked external in vite.config.ts), but
// `kpiDefinitions`, `fetchKpiData`, `opsAppObjects`, `opsAppDocuments`, `TeamRole` and
// `userContext` are not module imports — they are arguments in scope at runtime.
// Declaring them here lets source files reference them with full type-checking.

/** A KPI definition from the dashboard (the contract's KPI Definition shape). */
interface KpiDefinition {
  id: string;
  name: string;
  description: string;
  targetValue: number | null;
  metadata: Record<string, string>;
  resultType: number;
  baseQuery: string;
  liveQuery: string;
  parameters: Array<{
    name: string;
    dataType: string;
    defaultValue: string | null;
    required: boolean;
    description: string;
    allowedValues: string[] | null;
  }>;
  drilldownQuery: string | null;
}

interface KpiAxisValue {
  type: string;
  text: string | null;
  number: number | null;
}

/** The response shape returned by fetchKpiData. */
interface WidgetDataResponse {
  widgetId: string;
  resultType: number;
  scalarValue: number | null;
  dataPoints: Array<{ x: KpiAxisValue; y: number }> | null;
  series: Array<{
    kpiDefinition: { name: string };
    dataPoints: Array<{ x: KpiAxisValue; y: number }>;
  }> | null;
  tabularColumns: Array<{ name: string }> | null;
  tabularRows: Array<{ values: string[] }> | null;
}

/** All KPI definitions available to this view. */
declare const kpiDefinitions: ReadonlyArray<KpiDefinition>;

/** Fetch data for any KPI by id, optionally overriding its parameters. */
declare function fetchKpiData(
  kpiId: string,
  filters?: Record<string, string>
): Promise<WidgetDataResponse>;

// ── Stateful objects (opsAppObjects) — views only ──────────────────────────
// Team-scoped objects declared in data-pipelines/main/objects/<table_name>.json: JSON documents
// validated against each type's JSON Schema; a type may also be ingested into bronze
// (`ingestToBronze`). Documents are typed by the declarations the repo build generates from every
// type's schema (data-pipelines/main/dashboard/build/pipeline-build/dist/ops-app-object-types.d.ts,
// included by this project's tsconfig). Injected into custom views only; widget code never receives it.

/** A flat primitive value: the value type of the untyped default record and of query `where` filters; datetime/date values are ISO8601 strings. */
type OpsAppObjectValue = string | number | boolean | null;

/** Any JSON value: the value type of an object document's properties. */
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

/** The untyped record: every declared property is present, though its value may be null. */
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

// ── User context (userContext) — views only ────────────────────────────────
// The authenticated user the session runs under, as the server authorized them.
// Use it for attribution fields and role-based affordances; canWrite stays the
// write gate.

/** The ops app's user context: the user behind the session, server-resolved. */
interface OpsAppUserContext {
  id: string;
  /** Currently the user's email address (the platform has no separate display name). */
  displayName: string;
  role: TeamRole;
}

declare const userContext: OpsAppUserContext;

/**
 * Team-scoped stateful objects declared in data-pipelines/main/objects/.
 * Reads are available to every viewer; writes require Editor role (gate UI on canWrite).
 *
 * Every object is a JSON document validated against its type's schema. Every read and write takes
 * a type argument for the declared properties, so a data layer is strongly typed:
 * `useGetOpsAppObject<Case>(…)`, `upsert<Case>(…)`. Without one, records are the untyped flat
 * primitive map. For a type with a listProjection, type list and query reads with the projection:
 * `useListOpsAppObjects<CaseListItem>(…)` (the build generates `<Title>ListItem` from the projection).
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
   * A type with a listProjection returns only the projected root properties. There is no "get
   * everything" call: an object type can hold a large data set, so page yourself by advancing
   * `skip` (a page shorter than `take` is the last).
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
   * Inserts or replaces an object — the whole document, validated against the type's schema.
   * Mints an id when the object carries none. Resolves the stored object in full.
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

// ── Documents (opsAppDocuments) — views only ───────────────────────────────
// Team-scoped file blobs (rendered PDFs, exports) a view can create, read,
// replace, delete and hand to the user as a download. Injected into custom
// views only; widget code never receives it. Writes follow canWrite.

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
   * PDF in the browser and stores it as a document. `url` is the document's download route.
   * `marginPt` is a page margin in points, applied on all sides; it defaults to 0, so the
   * document should own its own margins through its own CSS.
   */
  renderPdf(input: { html: string; fileName: string; pageSize?: PdfPageSize; marginPt?: number }): Promise<{ documentId: string; url: string }>;
  /** Hands a stored document to the browser as a download; the host performs it outside any sandbox. */
  download(documentId: string): Promise<void>;
};
