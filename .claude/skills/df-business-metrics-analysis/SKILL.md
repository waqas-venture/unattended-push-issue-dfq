---
name: df-business-metrics-analysis
description: Query and analyze Gold Data (the unified Dashboard Data Model) with the DataFabrIQ MCP query tools. Use for ad-hoc metric questions, aggregations/pivots, and exports against Gold Tables. For raw source data use `df-bronze-data-analysis`; SQL dialect: see `df-ad-hoc-queries`.
---

Use mcp__datafabriq__get_gold_schema_context to get the context on what the Gold Data schema is and how it's used and what the Tables and Columns represent, and how important metrics are represented across the Dashboard Data Model.

Use mcp__datafabriq__run_query with `schema: "gold"` to run a SQL query against the Gold Data schema. The SQL must be T-SQL compatible with Azure Synapse Serverless SQL. Column names must be fully qualified, e.g. SELECT customers.arr FROM customers WHERE customers.email = 'test@test.com'. Pass `schema_type: "draft"` to query the draft gold schema, or pass "active" to query the active gold schema.

`run_query` returns no rows inline and never truncates: it writes the full result set to a file (`format` defaults to `csv`; `jsonl` and `xlsx` are also available) and returns an `exportId`. Poll mcp__datafabriq__get_data_export_status with that `exportId` until `status` is `completed` — it then returns a short-lived, read-only download URL and the `curl` command to fetch the file. Query errors also surface there, so you can correct the SQL and run it again. Inspect the downloaded file with shell tools or a script; don't read it into the conversation..

Look at the KPI Definitions inside the gold schema context - the KPI definitions themselves contain useful SQL queries that produce different key metrics that are useful, and you may mix and match or draw from those queries to understand how to answer questions about the data.
