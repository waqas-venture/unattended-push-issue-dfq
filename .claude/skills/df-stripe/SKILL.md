---
name: df-stripe
description: Stripe Connector Source reference: what it's used for, its key Bronze Data Tables and relationships, and source-specific gotchas. Use when writing Transformation Specs or queries over Stripe Bronze Data. Pairs with `df-data-pipeline`, `df-bronze-data-analysis`, `df-ad-hoc-queries`.
---

# Stripe Connector Source

## Domain

Stripe is payment infrastructure for internet businesses. Companies use it to accept one-time and recurring payments, run subscription billing with flexible pricing (per-unit, tiered, volume, usage-based), issue and track invoices, recognize revenue (ASC 606), prevent fraud (Radar), and reconcile money movement (fees, refunds, payouts). It is developer-first and API-driven, so its data model is well-structured and relational, with every object carrying a type-prefixed string id.

## Key Tables & Relationships

Bronze Data Tables are named `stripe_<record_type>` (e.g. `stripe_subscriptions`). Objects join by id reference (no junction Tables).

- **`stripe_customers`** (`cus_`) — the billing anchor; subscriptions, invoices, and charges all reference it.
- **`stripe_subscriptions`** (`sub_`) → `customer`. Recurring billing relationship.
- **`stripe_subscription_items`** (`si_`) → `subscription`, → `price`. Price + quantity pairs.
- **`stripe_prices`** (`price_`) → `product`; **`stripe_products`** (`prod_`). Define how much / what is sold.
- **`stripe_invoices`** (`in_`) → `customer`, → `subscription`; **`stripe_invoice_line_items`** → `invoice`.
- **`stripe_charges`** (`ch_`) → `customer`, → `invoice`, → `balance_transaction`. Actual payment attempts.
- **`stripe_payment_intents`** (`pi_`), **`stripe_refunds`** (`re_`) → `charge`, **`stripe_disputes`** (`dp_`) → `charge`.
- **`stripe_balance_transactions`** (`txn_`) — the financial ledger / source of truth for net amounts and fees.
- **`stripe_payouts`** (`po_`), **`stripe_coupons`**, **`stripe_discounts`**, **`stripe_payment_methods`** (`pm_`).
- Connect (marketplace): **`stripe_accounts`** (`acct_`), **`stripe_transfers`** (`tr_`), **`stripe_application_fees`** (`fee_`).

Cardinality: Customer 1→* Subscriptions/Invoices/Charges; Subscription 1→* Subscription Items and Invoices; Subscription Item *→1 Price *→1 Product; Charge 1→1 Balance Transaction, 1→* Refunds, 1→0..1 Dispute; Payout 1→* Balance Transactions.

## Gotchas

- **Amounts are in minor units (cents)** — divide by 100 for dollars (`amount / 100.0`). Watch zero-decimal currencies like JPY; always check the `currency` field for multi-currency.
- **Timestamps are Unix epoch seconds** (not milliseconds like HubSpot): `DATEADD(SECOND, col, '1970-01-01')`.
- **ID prefixes encode object type** (`cus_`, `sub_`, `in_`, `ch_`, `pi_`, `txn_`, etc.) — useful for sanity-checking joins.
- **`balance_transactions` is the financial source of truth** — charges show gross; balance transactions show net after fees. Use them for reconciliation.
- **Filter `livemode = 1`** — test-mode data may be present in Bronze Data.
- **Subscription `incomplete`/`incomplete_expired`** statuses (initial payment never succeeded) should usually be excluded from active counts and MRR.
- **`cancel_at_period_end = 1`** means still `active` but churning at period end — not yet churned.
- **`invoice.billing_reason`** (`subscription_create`/`subscription_cycle`/`subscription_update`/`manual`) is key to segmenting new vs. renewal vs. expansion MRR.
- **Proration noise** — mid-cycle changes create prorated invoice line items (`proration = 1`); filter when computing clean MRR.
- **`metadata` is flat key-value JSON**, often holding external system IDs (CRM, internal user IDs) — the most reliable cross-platform join key when populated. May be flattened as `metadata_<key>`. Otherwise join on email with `LOWER()` both sides.

## Full schema

For the authoritative object and field catalog, see Stripe's API reference: https://stripe.com/docs/api. For the team's actual ingested Tables and Columns (and how `metadata` is flattened), call `get_bronze_schema_context` (or `get_source_connector_schemas`). The T-SQL (Azure Synapse Serverless) dialect for queries is documented in `df-ad-hoc-queries`.
