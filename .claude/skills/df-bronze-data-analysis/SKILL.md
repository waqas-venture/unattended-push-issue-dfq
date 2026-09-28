---
name: df-bronze-data-analysis
description: Query and analyze Bronze Data (ingested Connector Source data) with the DataFabrIQ MCP query tools. Use for exploring Connector Source Tables/Columns, sampling raw values, data-quality checks, and exporting bronze query results. SQL dialect: see `df-ad-hoc-queries`. For Gold Data use `df-business-metrics-analysis`.
---

Use mcp__datafabriq__get_bronze_schema_context to get the bronze schema context — the Bronze Data Tables and Columns available in the Bronze layer. This shows all Connector Source Tables (e.g., hubspot_contacts, stripe_customers) with their Columns and data types, formatted as SQL DDL.

Use mcp__datafabriq__run_query with `schema: "bronze"` to run a SQL query against the bronze schema. The SQL must be T-SQL compatible with Azure Synapse Serverless SQL. Column names must be fully qualified, e.g. SELECT hubspot_contacts.email FROM hubspot_contacts WHERE hubspot_contacts.source = 'HubSpot'

`run_query` returns no rows inline and never truncates: it writes the full result set to a file (`format` defaults to `csv`; `jsonl` and `xlsx` are also available) and returns an `exportId`. Poll mcp__datafabriq__get_data_export_status with that `exportId` until `status` is `completed` — it then returns a short-lived, read-only download URL and the `curl` command to fetch the file. Query errors also surface there, so you can correct the SQL and run it again. Inspect the downloaded file with shell tools or a script; don't read it into the conversation.

## Bronze Table Naming Convention

Bronze Data Tables follow the naming convention `{source}_{record_type}` in lowercase snake_case:

| Source | Record Type | Bronze Table |
|--------|-------------|--------------|
| HubSpot | Contacts | `hubspot_contacts` |
| HubSpot | Companies | `hubspot_companies` |
| HubSpot | Deals | `hubspot_deals` |
| Stripe | Customers | `stripe_customers` |
| Stripe | Subscriptions | `stripe_subscriptions` |
| Stripe | Invoices | `stripe_invoices` |
| Salesforce | Accounts | `salesforce_accounts` |
| Salesforce | Contacts | `salesforce_contacts` |
| NetSuite | Customers | `netsuite_customers` |

## Bronze vs Gold Schema

- **Bronze schema** contains Bronze Data directly from Connector Sources. Use this to explore what data is available from each source, validate data quality, or investigate source-level details.
- **Gold schema** contains the transformed Gold Data — the Dashboard Data Model. Use the gold schema tools (`mcp__datafabriq__get_gold_schema_context`, and `mcp__datafabriq__run_query` with `schema: "gold"`) for querying the business-ready Gold Data.

Use the bronze schema when you need to:
- Explore Connector Source data before transformation
- Check what Columns are available from a specific Connector Source
- Validate data quality or completeness at the source level
- Investigate discrepancies between source and transformed data
- Build or debug Transformation Specs
