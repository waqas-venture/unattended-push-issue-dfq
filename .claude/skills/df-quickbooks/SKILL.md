---
name: df-quickbooks
description: QuickBooks Connector Source reference: what it's used for, its key Bronze Data Tables and relationships, and source-specific gotchas. Use when writing Transformation Specs or queries over QuickBooks Bronze Data. Pairs with `df-data-pipeline`, `df-bronze-data-analysis`, `df-ad-hoc-queries`.
---

# QuickBooks Connector Source

## Domain

QuickBooks Online (Intuit) is a small-to-mid-market accounting and financial management platform — a double-entry accounting system built on a Chart of Accounts. Businesses use it for invoicing and AR, bills and AP, expense and bank management, payroll, tax prep, and financial reporting (P&L, Balance Sheet, Cash Flow). Every transaction posts at least a debit and a credit across accounts classified as Assets, Liabilities, Equity, Income, or Expenses. QuickBooks Online (QBO) is the cloud version relevant to DataFabrIQ ingestion.

## Key Tables & Relationships

Bronze Data Tables are named `quickbooks_<recordtype>` — the QuickBooks record type name lowercased with non-alphanumerics dropped, singular, no word separators (e.g. `quickbooks_invoice`, `quickbooks_journalentry`, `quickbooks_billpayment`). Records reference each other via `*Ref` fields; ids are numeric strings.

- Entities: **`quickbooks_customer`** (self-references via `ParentRef` for sub-customers/jobs), **`quickbooks_vendor`**.
- Revenue transactions: **`quickbooks_invoice`** → `CustomerRef`, **`quickbooks_payment`** (links to invoices via `LinkedTxn`), `quickbooks_salesreceipt`, `quickbooks_creditmemo`.
- Expense transactions: **`quickbooks_bill`** → `VendorRef`, **`quickbooks_billpayment`** (links to bills via `LinkedTxn`), `quickbooks_purchase`.
- Accounting: **`quickbooks_account`** (chart of accounts, the classification backbone; `parent_account_id`/`parent_account_name` carry the flattened `ParentRef` for hierarchy rollups), `quickbooks_journalentry` (Debit/Credit lines), `quickbooks_deposit`, `quickbooks_transfer`.
- Products: **`quickbooks_item`** (links transactions to `IncomeAccountRef`/`ExpenseAccountRef`).
- Derived ledger tables:
  - **`quickbooks_transactionline`** — one row per posting line across JournalEntry, Bill, Purchase, Deposit, Transfer, Invoice, CreditMemo and SalesReceipt. Grain: (`txn_type`, `txn_id`, `line_id`). `account_id` → `quickbooks_account.id`; (`txn_type`, `txn_id`) → the parent table's `id` (`txn_type = 'Invoice'` → `quickbooks_invoice`, etc.). `posting_type` is `Debit`/`Credit`; `amount` is signed — positive debit, negative credit — so `SUM(amount)` per account is the net posted movement. Also carries `entity_*`, `class_*`, `department_*`, `item_*`, `detail_type`, `txn_date`, `doc_number`, `last_updated`.
  - **`quickbooks_trialbalance`** — the accrual TrialBalance report per account per calendar month (`period_start` = 1st, `period_end` = last day) from 2024-01 forward. Grain: (`period_end`, `account_id`, `report_pulled_at`). `account_id` → `quickbooks_account.id`. `ending_balance = debit - credit`.

Relationships: transaction → entity via `CustomerRef`/`VendorRef`; line items → Item via `ItemRef`; Item → account via `IncomeAccountRef`/`ExpenseAccountRef`; payments → invoices and bill payments → bills via `LinkedTxn`; optional `ClassRef`/`DepartmentRef` segmentation; account hierarchy via `parent_account_id` (top level = `parent_account_id IS NULL`).

## Gotchas

- **Accrual vs cash basis** — the same data supports both. Accrual uses Invoice/Bill `TxnDate`; cash uses Payment/SalesReceipt and BillPayment/Purchase `TxnDate`. Be explicit about which basis a metric uses.
- **`Balance` is the UNPAID portion, not the total** — use `TotalAmt` for revenue; `Balance` only for AR/AP aging. `Customer.Balance` is the total across all that customer's invoices; `BalanceWithJobs` rolls in sub-customers.
- **Amounts are decimal dollars, not cents** (e.g. `150.00`) — divide Stripe amounts by 100 when reconciling, do not divide QuickBooks amounts.
- **Nested `Line` arrays on the entity tables are JSON strings** — use `quickbooks_transactionline` for line-level analysis instead of parsing them.
- **Filter line `DetailType = 'SalesItemLineDetail'`** when summing invoice lines from the raw `Line` JSON — otherwise you double-count `SubTotalLineDetail` and `DiscountLineDetail` rows. `quickbooks_transactionline` already skips subtotal and description-only lines and expands group lines to their components.
- **Transaction lines are one-sided** — only the line-side postings are emitted; the header-side AR/AP/bank offset rows and tax lines are not. Lines therefore do not sum to `TotalAmt` on taxed forms, and the table is not a balanced ledger (debits ≠ credits). Item-based lines are posted to the item's income account (sales forms) or expense account (bills/purchases). A Transfer is two rows: `line_id = 'from'` (credit) and `'to'` (debit).
- **Deleted transactions linger in `quickbooks_transactionline`** — it is incremental on `last_updated`, so lines of deleted (or edited-away) transactions only disappear at the weekly full re-read. Anti-join to the parent table on (`txn_type`, `txn_id`) when it matters.
- **Trial balance mixes two kinds of numbers** — balance-sheet accounts (Asset/Liability/Equity) are cumulative as of `period_end`; P&L accounts (Income/Expense) show only that month's activity. Join `quickbooks_account.classification` to tell them apart before aggregating across months.
- **Take `MAX(report_pulled_at)` per `period_end`** when reading `quickbooks_trialbalance` — every pull is kept, and the trailing 3 months are re-pulled each sync, so a period has several snapshots. The latest is the current view; older ones are history of how a closed month moved.
- **`ending_balance` sign convention** — `debit - credit`, so assets and expenses read positive, liabilities, equity and income read negative. Negate for presentation of credit-normal accounts.
- **Trial balance month completeness is per-connection** — judged in the connection's "Report time zone" (UTC when unset); a month appears only after it has ended in that zone.
- **IDs are numeric strings** (e.g. `"42"`) — always compare as strings.
- **Dates are ISO `YYYY-MM-DD`**.
- **Deleted vs inactive** — deleted transactions carry `status = "Deleted"` (filter out); inactive entities/items/accounts have `Active = 0`.
- **Sub-customers and sub-accounts** — `ParentRef` builds parent-child hierarchies; decide whether to roll up to the parent (`ParentRef IS NULL` = top level). For accounts use `parent_account_id`/`parent_account_name` on `quickbooks_account` (`parent_account_name` falls back to the `FullyQualifiedName` prefix when QuickBooks omits the ref name).
- **Classes/Departments are optional** — verify `ClassRef`/`DepartmentRef` are populated before segmenting by them.
- **Multi-currency** — `CurrencyRef` may be present; convert to a reporting currency before aggregating.
- **No native MRR/ARR** — derive recurring revenue from repeating Customer+Item+interval patterns, or join an authoritative subscription source (Stripe, Maxio).
- **Cross-platform joins** use email with `LOWER()` both sides, or normalized company name.

## Full schema

For the authoritative entity and field catalog, see Intuit's Accounting API reference: https://developer.intuit.com/app/developer/qbo/docs/api/accounting/all-entities/account. For the team's actual ingested Tables and Columns (and how `LinkedTxn` and other nested structures are serialized), call `get_bronze_schema_context` (or `get_source_connector_schemas`). The T-SQL (Azure Synapse Serverless) dialect for queries is documented in `df-ad-hoc-queries`.
