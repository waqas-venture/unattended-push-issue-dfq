---
name: df-hubspot
description: HubSpot Connector Source reference: what it's used for, its key Bronze Data Tables and relationships, and source-specific gotchas. Use when writing Transformation Specs or queries over HubSpot Bronze Data. Pairs with `df-data-pipeline`, `df-bronze-data-analysis`, `df-ad-hoc-queries`.
---

# HubSpot Connector Source

## Domain

HubSpot is a CRM and marketing/sales/service platform. Businesses use it for contact and company management, deal pipeline tracking, marketing campaigns and email, lead scoring, service tickets, and content management. It is organized into product "Hubs" (Marketing, Sales, Service, CMS, Operations) that all share a single unified CRM database, so contacts, companies, deals, and tickets are the cross-hub objects that get ingested into DataFabrIQ.

## Key Tables & Relationships

Bronze Data Tables are named `hubspot_<record_type>` (e.g. `hubspot_deals`).

- **`hubspot_contacts`** — individual people; the most-connected object. Identified by `hs_object_id`.
- **`hubspot_companies`** — organization records.
- **`hubspot_deals`** — sales opportunities moving through pipeline stages.
- **`hubspot_tickets`** — service/support requests.
- Marketing/engagement Tables: `hubspot_email_events`, `hubspot_forms`, `hubspot_form_submissions`, `hubspot_marketing_emails`, `hubspot_campaigns`, `hubspot_engagements`, `hubspot_meetings`.

HubSpot models relationships between its CRM objects as many-to-many **associations**, not foreign keys. DataFabrIQ ingests these into per-object association Tables: `hubspot_contacts_associations`, `hubspot_companies_associations`, `hubspot_deals_associations`, `hubspot_tickets_associations`, `hubspot_quotes_associations`, `hubspot_line_items_associations`, `hubspot_leads_associations`. Each has `source_object_id`, `associated_object_type`, `associated_object_id`, `association_type`. Join through these Tables (never directly by id) and always filter on `associated_object_type` to target the right related object.

## Gotchas

- **Never join objects directly by id** — go through the per-object association Tables, and always filter `associated_object_type` (e.g. `= 'contacts'`) or you will join the wrong object type.
- **Many-to-many associations** — one deal can link to many contacts/companies; account for this to avoid double-counting in aggregations.
- **Timestamps are Unix milliseconds** (not seconds). Convert via `DATEADD(SECOND, TRY_CAST(col AS BIGINT) / 1000, '1970-01-01')`. Some fields may be ISO strings depending on ingestion config.
- **Booleans are strings** — `hs_is_closed_won`, `hs_is_closed` are `'true'`/`'false'` strings, not real booleans.
- **IDs are numeric strings** — `hs_object_id` is the canonical id across all objects; compare as strings.
- **Amounts may be strings** — `deals.amount` can be a string; always `TRY_CAST(... AS FLOAT)`, never `CAST`.
- **Stage and pipeline values are IDs, not labels** — `dealstage` and `pipeline` hold internal IDs; query distinct values to discover the actual IDs in a team's account.
- **Lifecycle stages are lowercase strings** (e.g. `marketingqualifiedlead`).
- **Internal vs custom property names** — column names are `snake_case` internal names; `hs_`-prefixed are HubSpot-managed, others may be default or user-created custom properties. Field names vary by account.
- **Archived/merged records** may still be present in Bronze Data; check for `archived`/`is_deleted`/`hs_is_merged` where present.
- **Cross-platform joins** use email (`LOWER()` both sides) or company domain.

## Full schema

For the authoritative object and property catalog, see HubSpot's CRM API and properties docs: https://developers.hubspot.com/docs/api/crm/understanding-the-crm and https://developers.hubspot.com/docs/api/crm/properties. For the team's actual ingested Tables and Columns, call `get_bronze_schema_context` (or `get_source_connector_schemas`) — names and available custom properties vary per account. The T-SQL (Azure Synapse Serverless) dialect for queries is documented in `df-ad-hoc-queries`.
