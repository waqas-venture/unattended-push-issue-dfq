# T-SQL Dialect Reference (Azure Synapse Serverless)

Use these T-SQL forms. Do not use Spark/Hive/Databricks idioms. Synapse
Serverless validates everything at the engine; mistakes here surface as cryptic
SQL errors at execution time, not as silent fixes.

> **Common dialect mistakes that fail at the engine — verify these first whenever you write SQL:**
> 1. `LIMIT N` — Synapse uses `SELECT TOP (N)`, not `LIMIT N`. Place `TOP (N)` after `SELECT` (and after `DISTINCT` if present).
> 2. Backticks (`` `col` ``) or double-quotes (`"col"`) for identifiers — Synapse requires square brackets: `[col]`.
> 3. Reserved-word column names (`user`, `order`, `key`, `group`, `top`, `partition`, `function`, `cube`, `commit`, `transaction`, `cluster`) — must be bracketed in every position they appear: `customers.[user]`, `AS [order]`, `JOIN customers c [order] ON …`.

## Function and syntax mapping

| Use this (T-SQL) | Not this |
|---|---|
| `SELECT TOP (N) … ORDER BY …` | `… ORDER BY … LIMIT N` |
| `SELECT DISTINCT TOP (N) …` (DISTINCT first, then TOP) | `SELECT TOP (N) DISTINCT …` |
| `FORMAT(col, 'yyyy-MM')` | `DATE_FORMAT(col, 'yyyy-MM')` |
| `DATEADD(month, DATEDIFF(month, 0, col), 0)` (portable date truncation) | `DATE_TRUNC('month', col)` or `DATETRUNC(month, col)` (Synapse Serverless does **not** support `DATETRUNC`) |
| `EOMONTH(col)` | `LAST_DAY(col)` |
| `CAST(GETDATE() AS DATE)` | `CURRENT_DATE` / `CURRENT_DATE()` |
| `DATEDIFF(DAY, start, end)` (date part required) | `DATEDIFF(end, start)` |
| `DATEADD(MONTH, -12, CAST(GETDATE() AS DATE))` | `CURRENT_DATE() - INTERVAL '12' MONTH` |
| `DATEADD(SECOND, epoch_seconds, '1970-01-01')` | `FROM_UNIXTIME(epoch_seconds)` |
| `DATEDIFF(SECOND, '1970-01-01', col)` | `UNIX_TIMESTAMP(col)` |
| `TRY_CAST(col AS DATE)` | `DATE(col)` |
| `CAST('2024-01-01' AS DATE)` / `CAST('…' AS DATETIME2)` / `CAST('…' AS TIME)` | `DATE '2024-01-01'`, `TIMESTAMP '…'`, `TIME '…'` (typed literals not supported) |
| `JSON_VALUE(col, '$.path')` | `GET_JSON_OBJECT(col, '$.path')` |
| `YEAR(col)` / `MONTH(col)` / `DAY(col)` (or `DATEPART(part, col)` for HOUR / MINUTE / SECOND / etc.) | `EXTRACT(YEAR FROM col)` |
| `DATEPART(QUARTER, col)` | `QUARTER(col)` |
| `LEN(col)` | `LENGTH(col)` |
| `CEILING(col)` | `CEIL(col)` |
| `POWER(x, y)` | `POW(x, y)` |
| `STDEV(col)` (sample) / `STDEVP(col)` (population) | `STDDEV(col)` / `STDDEV_SAMP(col)` / `STDDEV_POP(col)` |
| `LIKE` (Synapse default collation is case-insensitive) | `ILIKE` |
| `ROUND(col, 0)` (precision arg always required) | `ROUND(col)` |
| `+` for string concat (or `CONCAT(...)`) | `\|\|` |
| `ORDER BY col [ASC\|DESC]` (no NULLS clause; default is NULLS FIRST for ASC, NULLS LAST for DESC) | `ORDER BY col ASC NULLS FIRST` / `… NULLS LAST` |
| `[col]` square brackets for any quoted identifier (spaces, reserved words) | `` `col` `` (backticks) or `"col"` (double-quotes) |
| `… UNPIVOT (val FOR series IN (...)) AS u ORDER BY …` (alias is required) | `… UNPIVOT (val FOR series IN (...)) ORDER BY …` |
| Derive months from `UNION ALL` of existing date columns + `SELECT DISTINCT DATEADD(month, DATEDIFF(month, 0, …), 0)` | `EXPLODE(SEQUENCE(start, end, INTERVAL '1' MONTH))` |

Synapse Serverless does **not** support recursive CTEs, `SEQUENCE`, `EXPLODE`,
`LATERAL VIEW`, `INTERVAL` literals, or `DATETRUNC`. To produce a series of
months, derive them from existing dates in the data using `UNION ALL` +
`SELECT DISTINCT DATEADD(month, DATEDIFF(month, 0, …), 0)`.
