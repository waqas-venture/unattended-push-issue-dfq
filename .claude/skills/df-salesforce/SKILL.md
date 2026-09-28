---
name: df-salesforce
description: Salesforce Connector Source reference: what it's used for, its key Bronze Data Tables and relationships, and source-specific gotchas. Use when writing Transformation Specs or queries over Salesforce Bronze Data. Pairs with `df-data-pipeline`, `df-bronze-data-analysis`, `df-ad-hoc-queries`.
---

# Salesforce Connector Source

## Domain

Salesforce is the leading enterprise CRM. Organizations use it for sales pipeline and opportunity management, account and contact management, forecasting (rolling pipeline up by forecast category), lead capture and conversion, marketing campaigns and attribution, customer service (Service Cloud cases), and CPQ. Data spans clouds — a Marketing Cloud campaign generates a Lead, which converts to an Opportunity, whose customer may later open Cases — and these standard objects are what get ingested into DataFabrIQ.

## Key Tables & Relationships

Bronze Data Tables are named `salesforce_<object>` (e.g. `salesforce_opportunities`). Objects join by id reference.

- **`salesforce_accounts`** — companies; self-references via `ParentId` for account hierarchy.
- **`salesforce_contacts`** → `AccountId`. People at an account.
- **`salesforce_leads`** — unqualified prospects; on conversion set `IsConverted = 1` and the `ConvertedContactId` / `ConvertedAccountId` / `ConvertedOpportunityId` links.
- **`salesforce_opportunities`** → `AccountId`, → `OwnerId`. Deals tracked through `StageName`.
- **`salesforce_opportunity_contact_roles`** — junction of Opportunity *↔* Contact (stakeholders).
- **`salesforce_opportunity_history`** — stage/amount changes over time (pipeline movement analysis).
- **`salesforce_opportunity_line_items`** → `OpportunityId`, → `Product2Id`; **`salesforce_products`** (Product2).
- **`salesforce_campaigns`** + **`salesforce_campaign_members`** — junction of Campaign *↔* Lead/Contact.
- **`salesforce_cases`** → `AccountId` / `ContactId` (Service Cloud); **`salesforce_users`** (owners, `ManagerId` hierarchy); **`salesforce_tasks`** / **`salesforce_events`** (activities via `WhoId`/`WhatId`).

## Gotchas

- **Salesforce IDs come in 15-char (case-sensitive) and 18-char (case-insensitive) forms** — consistent within an org's export, but watch the two forms when joining to external systems.
- **Field naming** — standard fields are PascalCase (`AccountId`, `CloseDate`); custom fields end `__c`, custom relationships `__r`, custom objects `__c`. Bronze Columns may be snake_cased depending on ingestion — verify against the schema.
- **Deleted records** appear with `IsDeleted = 1` — filter `IsDeleted = 0` (or snake_case `is_deleted = 0`) unless analyzing deletions.
- **Dates** — datetime fields (`CreatedDate`) are ISO 8601 UTC with time; date-only fields (`CloseDate`, `ActivityDate`) have no time.
- **`Opportunity.Amount` vs line items** — when line items are enabled, `Amount` is the sum of `OpportunityLineItem.TotalPrice`; not all orgs use line items.
- **Forecast fields** — `ForecastCategory`/`ForecastCategoryName` are system-managed from the stage; forecast overrides live on `ForecastingItem`, not the Opportunity.
- **`RecordTypeId`** drives different layouts/picklists and can represent different sales processes (e.g. New Business vs. Renewal) on one object.
- **Person Accounts** blur Account/Contact — an Account record can carry Contact fields; handle both shapes if enabled.
- **Multi-currency** — check for `CurrencyIsoCode` and convert before aggregating.
- **Ownership** — use `OwnerId` for current owner, `CreatedById` for creator (reassignment does not change creator).
- **Cross-platform joins** use email with `LOWER()` both sides, or account/company name.

## Full schema

For the authoritative object and field catalog, see Salesforce's Object Reference: https://developer.salesforce.com/docs/atlas.en-us.object_reference.meta/object_reference/. For the team's actual ingested Tables, Columns, and custom (`__c`) fields, call `get_bronze_schema_context` (or `get_source_connector_schemas`). The T-SQL (Azure Synapse Serverless) dialect for queries — including the `DATEADD(unit, DATEDIFF(unit, 0, date), 0)` truncation idiom (no `DATETRUNC`) — is documented in `df-ad-hoc-queries`.
