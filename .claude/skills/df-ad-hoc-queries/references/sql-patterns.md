# SQL Patterns for Transformation Specs and Ad Hoc Queries

## SQL Patterns for Transformation Specs

Transformation specs build Gold Data tables. A spec's query can read from
**Bronze Data tables and/or other Gold Data tables** (any other spec's output
table) — so specs can be layered, with later specs building on the gold tables
earlier specs produce. Bronze Data is raw and untyped, so all defensive patterns
below apply to bronze reads; gold tables are already typed, so reads from
another spec's gold table generally do not need defensive casting.

### Referencing other gold tables (layering)

To build a gold table from another spec's output, reference that gold table by
its **unqualified table name** (its `outputTable`, e.g. `customers`,
`revenue_events`) — exactly as you reference a bronze table. The pipeline
resolves the name to the gold schema automatically and orders the run so the
referenced table is built first. You do **not** schema-qualify it and you do
**not** sequence the specs yourself.

```sql
-- Spec for `customer_revenue` (a higher-layer table) building on the
-- `customers` and `revenue_events` gold tables produced by other specs:
SELECT
    c.customer_id,
    c.customer_name,
    SUM(r.deal_total_mrr) AS total_mrr
FROM customers c
JOIN revenue_events r ON r.customer_id = c.customer_id
GROUP BY c.customer_id, c.customer_name
```

The only hard rule is that gold-on-gold references must be **acyclic** — two
specs cannot reference each other's output tables (directly or transitively),
or the run is rejected before it starts. See the `df-data-pipeline` skill for the
layering model and `df-data-pipeline-manager` for how to structure layered specs.

Transformation specs that read raw Bronze Data still require the defensive
patterns below.

### Defensive Numeric Casting

Provide a fallback default when NULL results from failed casts are not acceptable:

```sql
COALESCE(TRY_CAST(d.amount AS FLOAT), 0.0) AS amount
```

### Empty String Handling

Bronze Data columns often contain empty strings instead of NULL. Use `NULLIF`
before casting:

```sql
TRY_CAST(NULLIF(d.employee_count, '') AS BIGINT) AS employee_count
```

### Date Conversions

```sql
-- String to DATE
TRY_CAST(d.closedate AS DATE) AS close_date

-- Computed date fields (T-SQL DATEDIFF takes a date part as the first argument)
DATEDIFF(DAY, TRY_CAST(d.createdate AS DATE), CAST(GETDATE() AS DATE)) AS days_since_created
```

### Timestamp from Unix Milliseconds

HubSpot and some other sources store timestamps as Unix milliseconds. Convert to
a datetime by adding the number of seconds since the epoch:

```sql
DATEADD(SECOND, TRY_CAST(c.createdate AS BIGINT) / 1000, '1970-01-01') AS created_at
```

### Boolean from String Values

Bronze booleans are stored as strings. Use CASE expressions, not casting:

```sql
-- HubSpot uses 'true'/'false' strings (T-SQL bit columns are 1/0)
CASE WHEN d.hs_is_closed_won = 'true' THEN 1 ELSE 0 END AS is_closed_won

-- HubSpot uses '1'/'0' strings for some fields
CASE WHEN d.is_open_sales_deal = '1' THEN 1 ELSE 0 END AS is_open
```

### Weighted Calculations

When multiplying fields that need casting, apply defensive casting to each:

```sql
d.amount * COALESCE(TRY_CAST(d.hs_deal_stage_probability AS FLOAT), 0.0) AS weighted_amount
```

### CTE Structure

Use CTEs for complex transformations with multiple steps:

```sql
WITH source_data AS (
  SELECT
    d.id,
    COALESCE(TRY_CAST(d.amount AS FLOAT), 0.0) AS amount,
    TRY_CAST(d.closedate AS DATE) AS close_date
  FROM source_table d
  WHERE d.id IS NOT NULL
),
enriched AS (
  SELECT
    s.*,
    DATEDIFF(DAY, s.close_date, CAST(GETDATE() AS DATE)) AS days_since_close
  FROM source_data s
)
SELECT * FROM enriched
```

### Window Functions for Transitions

Use LAG/LEAD to derive transition records from history tables:

```sql
SELECT
  h.deal_id,
  h.stage_name AS to_stage,
  LAG(h.stage_name) OVER (PARTITION BY h.deal_id ORDER BY h.updated_at) AS from_stage,
  h.updated_at AS transition_date
FROM deal_stage_history h
```

## SQL Patterns for Ad Hoc Queries

### Data Sampling

Start with a small sample to understand the data shape:

```sql
SELECT TOP (10) * FROM hubspot_deals
```

### Validation Queries

Check for null and empty values in a STRING column:

```sql
-- Only use the empty string check on STRING columns
SELECT
  COUNT(*) AS total_rows,
  COUNT(amount) AS non_null_count,
  SUM(CASE WHEN amount = '' THEN 1 ELSE 0 END) AS empty_string_count,
  SUM(CASE WHEN amount IS NULL THEN 1 ELSE 0 END) AS null_count
FROM hubspot_deals
```

Check distinct values for a field:

```sql
SELECT DISTINCT dealstage, COUNT(*) AS cnt
FROM hubspot_deals
GROUP BY dealstage
ORDER BY cnt DESC
```

### Aggregation with Defensive Casting

```sql
SELECT
  d.pipeline,
  COUNT(d.hs_object_id) AS deal_count,
  SUM(COALESCE(TRY_CAST(d.amount AS FLOAT), 0.0)) AS total_value
FROM hubspot_deals d
WHERE d.hs_is_closed = 'false'
GROUP BY d.pipeline
```

## Schema Naming Convention

A fully qualified table name follows the pattern: `{catalog}.{schema}.{table_name}`

For example: `datafabriq_production_databricks.gold_a1b2c3d4_e5f6_7890_abcd_ef1234567890.customers`

When using the MCP query tools, you do not need to fully qualify table names —
the tools resolve the schema automatically. Use unqualified table names (e.g.,
`hubspot_deals`, `customers`).

## Querying KPI Definition Results

To query the data that results from a KPI definition query, use `mv_<kpi_name>`
where `kpi_name` is the lowercase, underscore-separated version of the KPI name.
For example:

- KPI "Monthly Revenue" → `mv_monthly_revenue`
- KPI "Executive Summary" → `mv_executive_summary`

```sql
SELECT * FROM mv_monthly_revenue WHERE month >= '2026-01-01'
```

## Bronze Table Naming Convention

Bronze Data tables follow `{source}_{record_type}` in lowercase snake_case:

| Source | Example Tables |
|---|---|
| HubSpot | `hubspot_contacts`, `hubspot_companies`, `hubspot_deals` |
| Stripe | `stripe_customers`, `stripe_subscriptions`, `stripe_invoices` |
| Salesforce | `salesforce_accounts`, `salesforce_contacts`, `salesforce_opportunities` |
| NetSuite | `netsuite_customers`, `netsuite_transactions` |
| QuickBooks | `quickbooks_invoices`, `quickbooks_customers` |
| Maxio | `maxio_subscriptions`, `maxio_customers` |
