---
name: df-ad-hoc-queries
description: Guide for writing safe, correct SQL queries for use with DataFabrIQ MCP query tools. Covers MCP tool selection and the core defensive type casting rules; its references cover the full T-SQL (Synapse Serverless) dialect mapping and worked SQL patterns for bronze and gold schemas.
---

# Overview

This skill is a SQL query construction reference for writing SQL queries that
run via DataFabrIQ MCP query tools. The MCP tools handle authentication, schema
resolution, query execution, and result formatting — your job is to construct
well-formed SQL that queries the Bronze Data and Gold Data schemas correctly
and safely.

## References — load at the step that needs them

| Reference | Read it when |
|---|---|
| `references/dialect.md` | Before writing any SQL — the T-SQL (Synapse Serverless) function/syntax mapping and the dialect mistakes that fail at the engine |
| `references/sql-patterns.md` | Writing transformation-spec or ad-hoc queries — worked patterns (defensive casting, dates, unix ms, booleans, CTEs, window functions, gold-on-gold layering references), naming conventions, and querying KPI results (`mv_*`) |

# MCP Tool Selection

Always start by discovering the schema, then construct SQL, then run the query.

## Schema Discovery

| Tool | Purpose |
|------|---------|
| `mcp__datafabriq__get_bronze_schema_context` | Get Bronze Data schema — tables, columns, and types |
| `mcp__datafabriq__get_gold_schema_context` | Get Gold Data schema — tables, columns, metrics context |

Load only the schema the query targets, when you are ready to write it —
construct SQL using the actual table and column names from the schema context,
never assumed names.

## Running Queries

| Scenario | Tool |
|----------|------|
| Any query, either schema, bronze or gold | `mcp__datafabriq__run_query` (pass `schema: "bronze"` or `schema: "gold"`) |
| Fetching the result of a query you started | `mcp__datafabriq__get_data_export_status` |

`run_query` never returns rows in the tool response and never truncates the
result set. It writes the full result to a file and returns an `exportId`:

1. Call `run_query` with `sql`, `schema` (`bronze` or `gold`), optionally
   `schema_type` (`active` — the default — or `draft`, gold only) and `format`
   (`csv` — the default — `jsonl`, or `xlsx` when a person wants a spreadsheet).
2. Poll `get_data_export_status` with the `exportId` until `status` is
   `completed`. A failed query reports its error message here — fix the SQL and
   call `run_query` again.
3. On completion the tool returns a short-lived, read-only download URL and the
   exact `curl` command. Download the file and inspect it with shell tools or a
   script (`head`, `wc -l`, `grep`, a Python script) — **never read the whole
   file into the conversation**. That is the entire point of the file-based
   contract.

The download URL is an Azure blob SAS URL that expires in an hour. It is the
only agent-fetchable download path. If a URL
expires, call `get_data_export_status` again for a fresh one.

The older `run_bronze_adhoc_query`, `run_gold_adhoc_query`,
`run_bronze_adhoc_query_export` and `run_gold_adhoc_query_export` tools are
deprecated; use `run_query` instead.

# Query requirements

Queries must use T-SQL syntax (Azure Synapse Serverless SQL) — see
`references/dialect.md` for the full mapping. Only use T-SQL compatible syntax
and functions. Column names must be fully qualified, e.g.
`SELECT hubspot_deals.amount FROM hubspot_deals WHERE hubspot_deals.pipeline = 'default'`.

## Type Casting Rule: Always Use TRY_CAST()

**All type conversions MUST use `TRY_CAST()`, never `CAST()`.** This is a hard rule.

Bronze Data contains empty strings, malformed values, and nulls stored as
strings. `CAST()` throws errors on these values and causes query failures.
`TRY_CAST()` returns NULL on conversion failure instead of throwing an error.

```sql
-- WRONG: Will fail on empty strings or malformed values
CAST(field AS FLOAT)

-- CORRECT: Returns NULL on failure
TRY_CAST(field AS FLOAT)
```

Use `TRY_CAST()` consistently in Gold Data schema queries as well, for
consistency across the codebase.

**Important:** Empty string handling patterns (`field = ''`,
`NULLIF(field, '')`) only apply to STRING columns. Comparing a typed column
(BIGINT, FLOAT, DECIMAL, etc.) to an empty string causes a conversion error.
Check column types from the schema context before applying these patterns.

## Bronze vs Gold Data

- **Bronze Data schema** — Raw data from source connectors (e.g.,
  `hubspot_contacts`, `stripe_customers`). All columns are strings; defensive
  casting is required.
- **Gold Data schema** — Transformed Dashboard Data Model data (e.g.,
  `customers`, `subscriptions`, `revenue_events`). Columns are properly typed.
