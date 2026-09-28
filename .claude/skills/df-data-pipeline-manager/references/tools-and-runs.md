# Supporting MCP tools and pipeline run behavior

## Changing config

All config changes are repo-file edits — there are no MCP config-write tools. The
edits reach `draft` once the orchestrating workflow commits and pushes them —
directly when the working branch is `draft`, or when the working branch merges
into it. See `df-dashboard-source-code` for the
layout, file shapes, and the root `npm run build` requirement. The supporting MCP
tools:

| Tool | Description |
|------|-------------|
| `mcp__datafabriq__validate_sql_query` | Syntax-check a SQL query (transformation spec or KPI base/live/drilldown) against the team's dialect before building the config |
| `mcp__datafabriq__get_source_connector_schemas` | Active Connector Sources and their bronze schemas |
| `mcp__datafabriq__get_bronze_schema_context` / `get_gold_schema_context` | Detailed schema context for Bronze / Gold queries |

Always read the current files before updating.

## Uploading a new version of a Custom Files file

The Custom Files connector ingests user-uploaded CSV/XLSX files. To replace the
file behind an existing Custom Files connection — or create a new one — from an
agent session, use the two-step upload flow — file bytes never travel through
the model or the MCP protocol:

| Tool | Description |
|------|-------------|
| `mcp__datafabriq__create_custom_file_upload` | Starts the upload for a connection (by `connectionId` or `connectionName`; call with neither to list the team's files). If `connectionName` doesn't match an existing file, a new connection is created — but only on completion, not here. Returns an `uploadId`, a `connectionId`, a short-lived write-only upload URL, and the exact `curl` command to run |
| `mcp__datafabriq__complete_custom_file_upload` | Verifies the uploaded file and makes it the connection's live version, creating the connection first if it's a brand new one |
| `mcp__datafabriq__trigger_custom_files_sync` | Triggers an ingestion sync for the Custom Files connector — the same operation as clicking "Sync Now" on the Connections page |
| `mcp__datafabriq__get_custom_files_sync_status` | Polls the status of the team's most recent Custom Files sync — progress, records fetched/stored, error message if failed |

The flow: call `create_custom_file_upload` → run the returned `curl` command
against the local file → call `complete_custom_file_upload` with the
`uploadId` and `connectionId` (plus `connectionName` when it's a brand new
connection, so it's created only once the upload is confirmed). Requires a shell
(Claude Code / Cowork); in a client with no execution environment, direct the
user to the Connections page in the web app instead.

The new file version is ingested into Bronze Data on the next Custom connector
sync — call `trigger_custom_files_sync` (equivalent to "Sync Now" on the
Connections page), or wait for the scheduled sync to pick it up. Poll
`get_custom_files_sync_status` to confirm the sync completed before assuming
the new data is live. Uploading does not trigger a pipeline run by itself;
downstream Gold Tables refresh once the sync lands and a pipeline run
executes.

## Ops App Object tools

The agent-facing counterpart of the `opsAppObjects` host API: read and write a
team's Ops App Objects from the session — seeding reference data, inspecting
what a stateful view wrote, or correcting a record. Object types are declared
in the repo (`data-pipelines/main/objects/<table_name>.json`; shapes in
`df-dashboard-source-code` → `references/structural-config.md`): each is a
JSON Schema its documents are validated against, with an `ingestToBronze`
flag for the types that are also ingested to bronze. Every tool
takes `tableName` (the descriptor's file name) and `schema_type` (`"active"`
default, `"draft"` for types declared on the draft configuration).

| Tool | Description |
|------|-------------|
| `mcp__datafabriq__get_ops_app_object_definitions` | The team's declared object types: each type's `tableName`, `schema`, `sequenceField`, `listProjection`, `ingestToBronze` and `versionNumber`. Call it first to learn the table names and the exact shape writes must supply |
| `mcp__datafabriq__list_ops_app_objects` | A page of objects (`skip`, `take` — default and max 1000 — and `descending` for newest-first), ordered by sequence number. The page is exported as JSONL to a short-lived download URL, returned with the exact `curl` command — fetch it out-of-band; the response reports `totalCount` and `hasMore` |
| `mcp__datafabriq__query_ops_app_objects` | The same paged JSONL export, filtered by `where` — equality on root properties with primitive values (AND semantics; `null` matches null/unset) |
| `mcp__datafabriq__get_ops_app_object` | One object by `objectId` — the whole document, inline |
| `mcp__datafabriq__upsert_ops_app_object` | Inserts or replaces one object from `properties` — the whole document, validated against the type's schema. Omit `objectId` to mint one |
| `mcp__datafabriq__delete_ops_app_object` | Deletes one object by `objectId` |
| `mcp__datafabriq__reserve_ops_app_object_sequence_block` | Atomically reserves a gapless block on the named counter `propertyName` of the type (`blockLength` default 1, max 1000). The counter is independent of the stored objects |

JSONL rows are the object's root properties plus `id`, `sequence_number` and
`change_number` — for a type with `ingestToBronze: true` the same shape as its
`opsappobjects_<table_name>` bronze view. A type with a `listProjection` lists
and queries only the projected root properties; `get_ops_app_object` returns
the whole document. Writes to an `ingestToBronze` type debounce a connector
sync (60 s) that lands in bronze; every other type is served to views directly
from the object store.

## Pipeline Run Behavior

Pushes to `draft` (including merges into it) that modify transformation specs or the dashboard data model
automatically trigger a gold pipeline run with a **30-second debounce**. Rapid
successive pushes are coalesced into a single pipeline run. You do not need to
manually trigger a pipeline run after pushing changes — it happens
automatically.

Until the change is on `draft`, nothing is scheduled and the draft config the
platform sees is unchanged — the platform reads only pushed commits, and a push
to any other working branch schedules no run. So a gold run, and any
verification of its output, can only follow the change reaching `draft` (see the
orchestrating workflow's final phase — `df-pipeline-update` Phase 5 or
`df-prototype` Phase 5).

During a run, the gold pipeline builds the Gold Tables **one spec at a time in
dependency order** (derived from the spec queries, so a spec that reads another
spec's output Table runs after it). If the specs form a circular Gold-on-Gold
dependency, the run fails at the prepare step before any table is built — fix
the cycle and re-run.

To check the success of a data pipeline run, poll `get_pipeline_run_status` and monitor it to completion (see `df-pipeline-update` → Phase 3). If a run
is stuck with nothing left to push, `trigger_draft_gold_pipeline_run`
forces a fresh one.

If a new pipeline run is triggered while one is already running, the older run
is automatically cancelled at its next checkpoint.
