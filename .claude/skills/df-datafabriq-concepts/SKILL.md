---
name: df-datafabriq-concepts
description: Canonical glossary, entity map, and skill map for the DataFabrIQ Data Pipeline (Connectors, Bronze Data, Dashboard Data Model, Transformation Specs, Gold Data, KPI Definitions, Dashboards, Views, Widgets). Load when terminology grounding is needed, and use its skill map to decide which skill to load next; other skills reference this instead of redefining terms.
---

# DataFabrIQ Concepts

The single source of truth for DataFabrIQ terminology, the entity model, and
the map of which skill to load when. Load it when you need to ground the
vocabulary; use the skill map to load further skills step-wise as the work
requires them — don't front-load.

## The Data Pipeline at a glance

The whole collection of configuration and data for a team is the **Data Pipeline**.
It flows in one direction:

```
Connector Sources → Bronze Data → Transformation Specs → Gold Data (Dashboard Data Model schema) → KPI Definitions → Dashboard Views / Widgets
```

## Entity glossary

- **Connector / Connector Source** — an integration to an external platform
  (HubSpot, Stripe, Salesforce, NetSuite, QuickBooks, Maxio, etc.). The
  **Custom Files** connector is the bring-your-own-data source: user-uploaded
  CSV/XLSX files, one Bronze Table per CSV file or XLSX sheet.
- **Schema** — a set of **Tables**, each with **Columns**. Everywhere in prose,
  use Table and Column (never "object"/"field").
- **Bronze Data** — the ingested Connector Source data, stored in per-connector
  Tables and Columns close to the source shape.
- **Dashboard Data Model** — the Schema (Tables and Columns) that defines the
  Gold Data schema the team's metrics are computed against.
- **Transformation Spec** — a query that produces exactly one Gold Data Table,
  reading from Bronze Tables and/or other Gold Tables. Exactly one spec per
  Dashboard Data Model Table; a spec is a `.json` descriptor plus a `.sql` file
  in the team repo.
- **Gold Data** — the unified, stored data that all Dashboards use, shaped by
  the Dashboard Data Model.
- **KPI Definition** — the application-facing data interface into Gold Data: a
  Base Query and a Live Query (see below).
- **Dashboard** — a Draft or Active collection of KPI Definitions and Dashboard Views.
- **Dashboard View** — either custom code that renders the whole view, or a
  collection of **Widgets**.
- **Widget** — a single visualization that uses a KPI Definition.
- **Ops App Object Type / OpsAppObjects** — a team-declared object type that
  makes custom Views stateful: their code reads and writes objects of the type
  at runtime (the `opsAppObjects` host API). Declared in the pipeline config as
  `data-pipelines/main/objects/<table_name>.json` — the file name IS the type's
  snake_case table name, its unique id (no UUIDs). Every type's objects are
  JSON documents validated against the type's JSON Schema; a type that sets
  `ingestToBronze` is also ingested into Bronze by the built-in
  **OpsAppObjects** connector as `opsappobjects_<table_name>` — one Table per
  type — the only Bronze source fed *from* the app itself.

## Key mechanics (summaries)

- **Transformation layering** — a spec may reference another spec's Gold Table
  by bare name; the pipeline derives a dependency order and builds the Tables
  sequentially in it. References must be acyclic. This lets Gold Tables form
  layers of abstraction, each a data contract. Full authoring guidance:
  `df-data-pipeline-manager` → `references/layering.md`.
- **KPI queries** — the Base Query reads **only Gold Tables (never Bronze)**
  and is materialized as `mv_<kpi_name>` (KPI Name lowercased,
  underscore-separated); the Live Query reads that materialized view with
  `@paramName` placeholders (Synapse T-SQL — always `@name`, never `:name`).
  Full authoring guidance: `df-data-pipeline-manager` → `references/kpi-queries.md`.
- **Custom Files uploads** — a new version of an existing Custom Files file
  can be uploaded from an agent session: `create_custom_file_upload` returns a
  short-lived upload URL and `curl` command (file bytes never pass through the
  model), and `complete_custom_file_upload` makes it live; the next Custom
  connector sync ingests it into Bronze. Requires a shell (Claude Code /
  Cowork). Full flow: `df-data-pipeline-manager` → `references/tools-and-runs.md`.
- **Active vs Draft** — every team has two pipeline configurations: Active is
  built from the repo's `main` branch and Draft from its `draft` branch. The
  platform reads only pushed commits, so config edits become the Draft once
  they reach `draft` — pushed to it directly when the working branch is
  `draft`, or merged into it when the working branch is a branch cut from
  `draft` (e.g. an Idea1 project item's branch). Read/query tools take
  `schema_type` (`"active"` default, `"draft"` for work-in-progress). Nothing
  goes live until the user publishes the draft in the web app (which merges
  the draft).
- **The pipeline config is repo files, edited directly** — the entire config
  lives in the team's connected GitHub repo (checked out locally): structural
  config (dashboard, views, widgets, KPI Definitions, data model,
  Transformation Specs, Ops App Object Types, pipeline settings) as JSON descriptors, KPI and spec
  SQL as `.sql` files, custom view/widget code as a per-folder Vite + TS + React
  project under `src/`, context files under `context/`. Reading config means
  reading the files; changing config means editing sources directly on the
  working branch (see `df-team-context-bootstrap`),
  validating SQL via `validate_sql_query`, and running the root `npm run build`
  (which builds each custom view/widget to its gitignored `dist/index.js` and
  assembles everything — those bundles included — into
  `data-pipelines/main/build-output/pipeline-config.json`, the only committed
  build output). The orchestrating workflow then commits and pushes the working
  branch — never `main`, never a new branch, never a pull request. See
  `df-dashboard-source-code` for the layout and editing workflow.

## The phased workflow

Configuration workflows (`/df-update`, `/df-implement-project-item`, `/df-prototype`) run the same five phases,
always in order:

```
plan → build → validate → update-context → commit & push
```

The last phase is the only one that writes to the remote, and each entry point
owns its own policy for it: `/df-update` and `/df-implement-project-item` make
one commit and push of the working branch only after the developer has reviewed
the diff and said to proceed; `/df-prototype` commits and pushes the working
branch automatically at the end of every build iteration; `/df-explore` never
commits or pushes. The gold pipeline run a push to `draft` schedules — and any
verification of its output — comes after that push.

Read-only exploration (`/df-explore`) runs the lighter plan → build → validate
cycle with no update-context or push phase. Every entry point starts with the two
bootstraps: `df-select-team`, then `df-team-context-bootstrap` (the three domain
context files).

## Skill map — what to load when

Load skills step-wise, at the phase that needs them:

**Bootstrap (every session, first)**
- `df-select-team` — establish the active team.
- `df-team-context-bootstrap` — locate the team repo and its working branch;
  identify the branch's project item; read `customer-domain.md`,
  `data-domain.md`, `application-domain.md`.

**Scenario orchestrators (pick one per request)**
- `df-pipeline-update` — focused change to an existing pipeline/dashboard.
- `df-adhoc-exploration` — read-only question, report, or investigation.
- `df-prototype` — quick prototype dashboard view with mock data, for customer
  feedback; light plan, automatic commit & push of the working branch each
  iteration.

**Phase skills (invoked by the orchestrators)**
- `df-plan-phase` — produce the plan the user approves; minimal targeted reads.
- `df-update-context-phase` — persist the domain context files (final phase).

**Build / authoring (load per change scope, build phase only)**
- `df-data-pipeline-manager` — modify the model, specs, KPIs, views, widgets;
  references: `layering.md`, `kpi-queries.md`, `transformation-spec-format.md`,
  `tools-and-runs.md`.
- `df-dashboard-source-code` — edit repo-stored SQL, context files, custom code.
- `df-custom-widgets` / `df-custom-dashboard-view` — custom-rendered widgets/views.

**Reference (load when querying or inspecting)**
- `df-data-pipeline` — read-only model of the pipeline entities.
- `df-data-pipeline-viewer` — read-tool selection for inspecting configuration.
- `df-ad-hoc-queries` — SQL construction for the MCP query tools; references:
  `dialect.md`, `sql-patterns.md`.
- `df-bronze-data-analysis` / `df-business-metrics-analysis` — querying Bronze / Gold data.

**Connectors (load only for the sources involved)**
- `df-hubspot`, `df-stripe`, `df-salesforce`, `df-netsuite`, `df-quickbooks`, `df-maxio`.

## Relationship invariants

- Exactly one Transformation Spec per Dashboard Data Model Table — removing a
  Table means deleting its spec's `.json` and `.sql` files together.
- A spec reads Bronze Tables and/or other Gold Tables; Gold-on-Gold references
  must be acyclic and define the dependency order the specs run in.
- A KPI Definition's Base Query reads only Gold Tables; its Live Query reads
  `mv_<kpi_name>`. Specs build the Gold data contracts; KPI queries consume them.
- Dashboard Views and Widgets reference KPI Definitions (a Widget uses one KPI
  Definition; a custom-code View may use several).
