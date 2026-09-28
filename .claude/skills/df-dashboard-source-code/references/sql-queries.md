# Editing SQL queries in the team repo

SQL queries are Synapse Serverless **T-SQL**. Each query is a plain `.sql` file.
Edit the file, validate, fix, then build.

## File paths

**Transformation Spec query** → `transformation-specs/<outputTable>.sql`, where
`<outputTable>` is the spec's `outputTable` value **verbatim** (it is already
snake_case, e.g. `customers.sql`, `deal_stage_transitions.sql`). Do not re-slug it.

**KPI Definition queries** → `kpi-definitions/<kpi-slug>-base.sql`,
`<kpi-slug>-live.sql`, and `<kpi-slug>-drilldown.sql`. The `-drilldown.sql` file
exists only when the KPI has a drilldown query. `<kpi-slug>` is derived from the
KPI's **Name** by the rule below.

## KPI name → slug rule

`<kpi-slug>` is `GenerateSlugFromName(kpi.Name)` — the exact platform rule
(`TeamSlugService.GenerateSlugFromName`):

1. Lowercase the name (invariant culture) and trim surrounding whitespace.
2. Replace every run of one-or-more characters that are **not** `a–z` or `0–9`
   with a **single hyphen** `-`. (This covers spaces, punctuation, `&`, `/`,
   etc. — any run collapses to one hyphen.)
3. Trim leading and trailing hyphens.
4. If the result is shorter than 2 characters, prefix it with `team-`.
5. If longer than 60 characters, truncate to 60 and trim a trailing hyphen.

The separator is a **hyphen `-`**, not an underscore, and the slug is all
lowercase alphanumeric + hyphens.

Examples:
- `"Net Revenue Retention"` → `net-revenue-retention`
- `"MRR (Monthly)"` → `mrr-monthly`
- `"Win Rate %"` → `win-rate`
- `"Customers & Accounts"` → `customers-accounts`

So a KPI named `Net Revenue Retention` maps to
`kpi-definitions/net-revenue-retention-base.sql`, `net-revenue-retention-live.sql`,
and (if present) `net-revenue-retention-drilldown.sql`.

KPI names are unique per dashboard; two KPIs that slug to the same value is an
error (it would overwrite a file). The `liveQuery` uses `@paramName` parameter
markers (Synapse T-SQL — always `@name`, never `:name`).

## Validate before building

After editing **any** `.sql`, syntax-check it with the `validate_sql_query` MCP
tool against the team's dialect:

- Validate the queries you changed. For a KPI, validate its `base`, `live`, and
  `drilldown` queries **together** as a labeled batch so the result tells you
  which file failed.
- If validation reports an error, fix the `.sql` and re-validate. Repeat until clean.
- Only move on to the build once every edited query validates without errors.

Then run the root `npm run build`.

## Deleting a query

When you remove a Transformation Spec (for example after dropping its output
Table from the Dashboard Data Model), delete both its
`transformation-specs/<outputTable>.json` and the matching
`transformation-specs/<outputTable>.sql` query file. Likewise, when a KPI
Definition is deleted, remove its `kpi-definitions/<kpi-slug>.json` and its
`kpi-definitions/<kpi-slug>-*.sql` files. A removed config object's files are
all removed together — no orphaned `.json` or `.sql` files. Run the root build;
the deletion is part of the change the orchestrating workflow commits.
