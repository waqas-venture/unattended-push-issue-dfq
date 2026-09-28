---
name: df-netsuite
description: NetSuite Connector Source reference: what it's used for, its key Bronze Data Tables and relationships, and source-specific gotchas. Use when writing Transformation Specs or queries over NetSuite Bronze Data. Pairs with `df-data-pipeline`, `df-bronze-data-analysis`, `df-ad-hoc-queries`.
---

# NetSuite Connector Source

## Domain

NetSuite (Oracle) is a cloud ERP for mid-market to enterprise companies — a double-entry accounting system with integrated business modules. Organizations use it for general ledger accounting, accounts receivable and payable, ASC 606 revenue recognition, order-to-cash and procure-to-pay, inventory and procurement, financial consolidation, and CRM. Its defining capability versus QuickBooks is multi-entity/subsidiary (OneWorld) operation with native multi-currency and intercompany consolidation. Every transaction belongs to a subsidiary and can be segmented by department, class, and location.

## Key Tables & Relationships

Bronze Data Tables are named `netsuite_<object>` (e.g. `netsuite_invoices`); actual names depend on the connector — verify. Records join by `internalId` references.

- Segmentation/reference: **`netsuite_subsidiaries`**, **`netsuite_departments`**, **`netsuite_classes`**, **`netsuite_locations`**, **`netsuite_periods`**, **`netsuite_accounts`** (chart of accounts). Most support parent-child hierarchy via `parent`.
- Entities: **`netsuite_customers`**, **`netsuite_vendors`**, **`netsuite_partners`**, **`netsuite_contacts`** (linked via `company`).
- Order-to-cash chain: **`netsuite_sales_orders`** → **`netsuite_item_fulfillments`** (`createdFrom`) → **`netsuite_invoices`** (`createdFrom`) → **`netsuite_customer_payments`** (apply list links to invoices). Also `netsuite_cash_sales`, `netsuite_credit_memos`, `netsuite_customer_deposits`, `netsuite_return_authorizations`.
- Procure-to-pay chain: **`netsuite_purchase_orders`** → **`netsuite_item_receipts`** → **`netsuite_vendor_bills`** → **`netsuite_vendor_payments`**. Also `netsuite_vendor_credits`, `netsuite_expense_reports`.
- Inventory: **`netsuite_items`** (referenced by all transaction line Tables), `netsuite_inventory_adjustments`.
- Transaction line Tables (e.g. `netsuite_invoice_lines`) carry `item`, `amount`, and line-level segment fields.
- Revenue recognition: **`netsuite_rev_rec_schedules`** → **`netsuite_rev_rec_plans`** (period-by-period recognized/deferred).
- CRM: `netsuite_opportunities`, `netsuite_campaigns`, `netsuite_campaign_events`, `netsuite_support_cases`.

Entities own their transactions: Customer → sales orders/invoices/cash sales/credit memos/opportunities/cases; Vendor → POs/bills/credits. Invoice lines link to rev rec schedules via `revRecSchedule`.

## Gotchas

- **`internalId` is the primary join key** (numeric string); **`tranId`** is the human-facing document number (e.g. "INV-001234") — display only.
- **Multi-entity/subsidiary consolidation** — in OneWorld accounts every transaction requires a subsidiary; single-subsidiary accounts may lack the field. Subsidiary/elimination logic only applies to OneWorld. Consolidated reporting may need to traverse the subsidiary hierarchy and handle intercompany eliminations.
- **Currency** — transactions store both transaction-currency and base-currency amounts plus `exchangeRate`; confirm which amount you are aggregating and convert with `exchangeRate` for consolidated figures.
- **Line-level vs header-level segments** — a line's department/class/location can differ from the header; use line-level values for accurate segment reporting.
- **Status values differ by transaction type** — Sales Order, Invoice, and Purchase Order statuses are distinct sets; check actual values in the data.
- **Field names vary by connector** — SuiteAnalytics Connect, REST/SuiteTalk, SOAP, and third-party connectors expose different field names; always verify against the schema.
- **Custom field prefixes** — `custbody_*` (transaction body), `custcol_*` (line), `custentity_*` (entity), `custitem_*` (item); custom records use `customrecord_*` and may be separate Tables.
- **Booleans may be strings** (`"true"`/`"false"` or `"T"`/`"F"`) depending on connector; `isInactive = 1` records are usually excluded from active reporting.
- **Closed periods** (`isClosed = 1`) are final/authoritative.
- **Item price levels** — `basePrice` is Price Level 1; actual transaction prices may differ.
- **`externalId`** commonly stores a CRM system id (Salesforce Id, HubSpot `hs_object_id`) — prefer it over name/email matching for cross-platform joins; otherwise match email with `LOWER()` both sides.

## Full schema

For the authoritative record and field catalog, see NetSuite's records browser and SuiteTalk/REST docs: https://docs.oracle.com/en/cloud/saas/netsuite/ns-online-help/ (Records Browser / SuiteAnalytics). For the team's actual ingested Tables and Columns (which depend heavily on the connector), call `get_bronze_schema_context` (or `get_source_connector_schemas`). The T-SQL (Azure Synapse Serverless) dialect for queries is documented in `df-ad-hoc-queries`.
