---
name: df-maxio
description: Maxio Connector Source reference: what it's used for, its key Bronze Data Tables and relationships, and source-specific gotchas. Use when writing Transformation Specs or queries over Maxio Bronze Data. Pairs with `df-data-pipeline`, `df-bronze-data-analysis`, `df-ad-hoc-queries`.
---

# Maxio Connector Source

## Domain

Maxio is a SaaS financial operations platform from the merger of **Chargify** (Maxio Advanced Billing — subscription billing, usage-based billing, dunning, payment processing) and **SaaSOptics** (Maxio Financial Reporting — ASC 606 revenue recognition, SaaS analytics). B2B SaaS companies use it to manage the full subscription lifecycle (trials, upgrades, downgrades, cancellations), recurring and metered billing, and SaaS metrics (MRR, ARR, churn, LTV). Its defining strength is native, categorized MRR movement tracking — unlike general-purpose billing or accounting tools.

## Key Tables & Relationships

Bronze Data Tables are named `maxio_<record_type>` (e.g. `maxio_subscriptions`). Records join by integer id foreign keys.

- **`maxio_customers`** (`id`) — account holders; one customer has many subscriptions.
- **`maxio_subscriptions`** (`id`) → `customer_id`, → `product_id`. The central object; `state` drives lifecycle.
- **`maxio_products`** → `product_family_id`; **`maxio_product_families`**.
- **`maxio_components`** → `product_family_id` — add-ons; attached to subscriptions via **`maxio_allocations`** (`subscription_id` + `component_id`, with quantity changes).
- **`maxio_invoices`** → `subscription_id`, `customer_id` (with nested/flattened line items); **`maxio_transactions`** → `subscription_id` (charge/payment/refund/adjustment, with `gateway_transaction_id`); `maxio_credit_notes`.
- **`maxio_mrr_movements`** → `subscription_id` — categorized MRR changes (`new_business`, `renewal`, `expansion`, `contraction`, `churn`, `reactivation`). Primary source for MRR analysis.
- Lifecycle: `maxio_subscription_events`, `maxio_migrations` (product changes), `maxio_subscription_groups`, `maxio_coupons` (joined via `coupon_code` = `code`), `maxio_price_points`.

## Gotchas

- **Monetary amounts are in cents** (integers) — divide by 100 (`amount_in_cents / 100.0`). Note some Tables use plain `amount` (decimal dollars) — check the field name.
- **Prefer `mrr_movements` over manual MRR** — computing MRR from subscription prices misses proration, component changes, and mid-cycle adjustments; the native movement Table is authoritative.
- **`canceled` vs `expired`** — `canceled` is explicit cancellation; `expired` is natural end-of-term. Subscription `state` values are lowercase (`active`, `trialing`, `past_due`, `soft_failure`, `on_hold`, `canceled`, `expired`, `suspended`, `paused`).
- **Product interval normalization** — to derive MRR from prices, normalize by `interval`/`interval_unit` (quarterly = /3, annual = /12, etc.).
- **Component pricing scheme matters** — `per_unit` is simple (quantity × unit_price); `volume`, `tiered`, and `stairstep` require bracket logic using allocation quantity and price-point brackets.
- **Proration** — mid-cycle changes produce partial-period invoice line items; `period_range_start`/`period_range_end` mark the partial period.
- **Archived products** (`archived_at` set) may still have active subscriptions on older product versions.
- **`snap_day`** controls the monthly billing day — relevant to cohort and billing-cycle alignment.
- **Recurring coupons** (`recurring` with `duration_period_count`) expire after N periods; the discount ending shows as expansion in `mrr_movements`.
- **Timestamps** are ISO 8601 with timezone.
- **`customer.reference`** commonly stores an external CRM/ERP id (Salesforce Account ID, HubSpot Company ID) — the most reliable cross-platform join key when populated; otherwise match email (`LOWER()` both sides) or `gateway_transaction_id` to a payment gateway like Stripe.

## Full schema

For the authoritative object and field catalog, see Maxio's developer docs: https://developers.maxio.com/ (Advanced Billing API reference). For the team's actual ingested Tables and Columns (and how invoice line items are flattened), call `get_bronze_schema_context` (or `get_source_connector_schemas`). The T-SQL (Azure Synapse Serverless) dialect for queries is documented in `df-ad-hoc-queries`.
