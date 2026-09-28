# Transformation Spec format and mechanics

The canonical description of the
`data-pipelines/main/transformation-specs/<outputTable>.json` file shape. The
file carries the **metadata**; the SQL query lives in the repo as
`transformation-specs/<outputTable>.sql` (per `df-dashboard-source-code`), edited
directly and validated with `validate_sql_query` — never inlined in the JSON.

## Structure

```json
{
  "name": "build_<table>",
  "description": "Description of what this transformation does",
  "outputTable": "<table_name>",
  "reasoning": "Explanation of mapping decisions and logic"
}
```

These JSON property names are the literal file contract. `outputTable` names
the Dashboard Data Model Table this spec builds (e.g., `"customers"`,
`"deals"`, `"subscriptions"`) and is also the `.json` and `.sql` file name. The
SQL's column aliases must match that Table's Column names exactly.

- **SQL query**: A SQL SELECT statement that returns columns matching the
  Dashboard Data Model Table's Column names. It may query Bronze Data tables,
  other Gold Tables (other specs' output Tables, referenced by bare name — see
  `references/layering.md`), or both. Edited as the paired `.sql` file in the
  repo — never part of the JSON.
- **`reasoning`**: Explain the mapping logic — why Columns are mapped the way
  they are, any derivation logic, type conversions, or assumptions.

## Creating and renaming

Create the `.json` file for a new spec; edit it for an existing one. To rename
the output Table for an existing spec, update the `outputTable` value in the
JSON and rename both the `.json` and the `.sql` file to the new `outputTable`.

## Deleting a spec

Delete the spec's `transformation-specs/<outputTable>.json` and the matching
`.sql` file together. Always do this when you drop the spec's output Table from
the Dashboard Data Model — the spec that builds a removed Table is orphaned and
should not run.

## Worked examples

For transformation-spec query examples and SQL patterns, see `df-ad-hoc-queries`
(dialect, defensive casting, window functions).
