# Layering transformation specs (data contracts)

This is the canonical layering guidance for DataFabrIQ transformation specs.
Read it when designing new Gold Tables, adding an intermediate layer, or
factoring shared logic out of multiple specs.

## The mechanism

A transformation spec is not limited to raw Bronze Data: its query can reference
**any Bronze Table and/or any other Gold Table** (any other spec's output Table).
The gold pipeline derives a **dependency order** from the spec queries — a
reference to another spec's output Table is a dependency edge — and builds the
Gold Tables **one at a time in that order**, making each table queryable before
any spec that depends on it runs. The only constraint is that Gold-on-Gold
references must be **acyclic**; a circular dependency is rejected before the run
starts. You do **not** order the specs yourself and you do **not**
schema-qualify the gold reference — reference the gold table by its bare
`outputTable` name and the pipeline resolves and sequences it.

## Designing the layers

Use this to organize Gold Tables into **layers of abstraction — each one a data
contract**. There is **no fixed number of layers and no prescribed taxonomy**;
design the layers from the team's needs:

- **Start from core customer needs (top-down).** The top layer is the Gold
  Tables the KPI Base Queries read — the answers the dashboard must produce.
  Work downward from there to the Tables required to compute them.
- **Add an intermediate layer only when it earns its place.** A new layer is
  justified when it establishes a clean **semantic entity** (a well-defined
  business concept — a unified `customer`, a `subscription` — abstracted away
  from raw source quirks) or a **verifiable calculation** (an intermediate
  result you can query and validate on its own before the layers above depend
  on it). If a Table doesn't make something clearer, reusable, or independently
  checkable, don't add it.
- **The lowest layers read raw Bronze Data** and turn it into those clean,
  typed entities; higher layers compose and derive from the layers below them.

## Guidance

- **Every layer is a set of Gold Tables in the Dashboard Data Model.** There is
  no separate store for intermediate layers — each layered Table is a Dashboard
  Data Model Table with exactly one spec, defined (with typed Columns and a
  description) the same way as any other Table. Layering is *logical* (by
  dependency). Mark an intermediate Table clearly in its description so it's
  obvious it exists to feed downstream specs rather than KPIs.
- **Prefer layering over copy-pasted SQL.** When two specs need the same
  cleaning, joining, or derivation, factor it into a shared lower-layer Table
  and have both build on it — instead of duplicating the logic. This is the
  DataFabrIQ analogue of a shared CTE that lives across specs, and it makes the
  shared result independently verifiable.
- **Keep it acyclic and as flat as the problem allows.** Don't create mutual
  references. Favor a clear, one-directional flow from Bronze up through each
  layer. Deep chains are fine when each layer is justified, but every extra
  layer adds a sequential build step.
- **Reference gold tables by bare name.** In the `.sql` file, write
  `FROM revenue_events` (not a schema-qualified name); `validate_sql_query`
  checks syntax, and the pipeline qualifies and orders it at run time.

## Planning layers (plan phase)

When a plan involves transformation specs, make the layers explicit up front:

- Work top-down from the Gold Tables the KPIs read to the intermediate Tables
  required to compute them; add an intermediate Table only where it establishes
  a clean semantic entity or a verifiable calculation.
- Factor logic that more than one spec needs into a shared lower-layer Gold
  Table instead of duplicating it.
- List new/changed Gold Tables roughly in dependency order and keep the
  references acyclic. The pipeline computes the exact order — the plan just
  makes the layers and their direction explicit.

## Removing a layered Table

Before removing a Gold Table, check no other spec references it (removing an
upstream layer Table breaks the specs that read it) — list the
`transformation-specs/` folder and search the spec `.sql` files for the Table
name. Then delete its `data-model/tables/<table-name>.json` and its spec's
`transformation-specs/<outputTable>.json` and `.sql` files together
(see `df-dashboard-source-code`).
