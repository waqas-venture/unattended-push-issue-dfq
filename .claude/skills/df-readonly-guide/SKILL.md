---
name: df-readonly-guide
description: Entry point for the read-only DataFabrIQ plugin. Reports Data Pipeline state (Connector Sources, Dashboard Data Model, KPI Definitions, Dashboard Views and Widgets) and routes the user to the right skill — bronze/gold query analysis, pipeline inspection, SQL guidance, or a connector skill. Use when the user asks what they can do, what skills are available, how to get started, what data they have access to, or wants a Data Pipeline overview.
---

# DataFabrIQ Readonly Guide

This skill helps you discover what's available in the readonly DataFabrIQ plugin and navigate to the right skill for your task.

> **Tip:** The `/df-explore` slash command is the standard entry point for
> exploration — it begins in plan mode and runs a read-only plan → build →
> validate cycle via the `df-adhoc-exploration` skill. Use it when you have a
> specific question or a one-off report request rather than open-ended browsing.

## Step 1: Check Pipeline Status

Call `mcp__datafabriq__get_data_pipeline_context` to see the current state of the Data Pipeline. This returns:
- **Connector Sources** — which platforms are connected and ingesting data
- **Bronze and Gold schema names** — the schema names to use when writing queries

The rest of the configuration — the Dashboard Data Model, KPI Definitions, and Dashboard Views and Widgets — is files in the team's connected GitHub repo, checked out locally; read them per `df-data-pipeline-viewer`.

Summarize the status concisely: which Connector Sources are active, how many Dashboard Data Model Tables exist, how many KPI Definitions and Widgets are configured.

## Step 2: Guide to the Right Skill

Based on what the user wants to do, recommend the appropriate skill:

| User wants to... | Recommended skill |
|---|---|
| Explore Connector Source data or check what's in Bronze Tables | `/df-bronze-data-analysis` |
| Query business metrics or run ad hoc Gold Data queries | `/df-business-metrics-analysis` |
| Understand Data Pipeline configuration, view the Dashboard Data Model or Transformation Specs | `/df-data-pipeline-viewer` |
| SQL query construction guide for ad hoc queries of user data | `/df-ad-hoc-queries` |
| Understand a specific platform's data model | See connector skills below |

### Connector Skills

Map the `source` field from `sourceConnectors.connectors[]` in the pipeline context to the relevant skill:

| Source | Skill |
|--------|-------|
| `df-hubspot` | `/df-hubspot` |
| `df-stripe` | `/df-stripe` |
| `df-salesforce` | `/df-salesforce` |
| `df-netsuite` | `/df-netsuite` |
| `df-quickbooks` | `/df-quickbooks` |
| `df-maxio` | `/df-maxio` |

Only recommend connector skills for sources that appear in the pipeline context.

## What This Plugin Can Do

This is a **read-only** plugin for data exploration and analysis:
- Query and analyze Bronze Data from Connector Sources
- Query and analyze Gold Data (business metrics)
- Inspect Data Pipeline configuration: the Dashboard Data Model, Transformation Specs, KPI Definitions, Dashboards
- Understand platform-specific data models and relationships
- Run SQL queries directly against the SQL engine

## What This Plugin Cannot Do

This plugin does not support modifying Data Pipeline configuration. To update the Dashboard Data Model, Transformation Specs, KPI Definitions, or Widgets, the full DataFabrIQ plugin is needed.
