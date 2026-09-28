---
name: df-adhoc-exploration
description: Orchestrates ad-hoc data questions and one-off reports against an existing DataFabrIQ team. Drives a read-only plan → build (queries) → validate (sanity check) sequence. Use this skill (or its entry point `/df-explore`) when the user has a question or report request, not a configuration change.
---

# DataFabrIQ Ad-Hoc Exploration

Runs a **read-only** plan → build → validate cycle scoped to exploration and
one-off reporting: produce a plan the user approves, execute it with read-only
queries and tools to build the answer (a dataset or report), then validate the
result. This skill never modifies the Data Pipeline.

The companion entry point is the `/df-explore` slash command, which puts Claude
in plan mode and routes here.

## When to Use

- The user has a one-off question they want to answer from their data, OR
- The user wants to investigate an anomaly, OR
- The user wants a one-off report or dataset.

Do not use this skill for pipeline configuration changes — those use
`df-pipeline-update` (`/df-update`).

## Phase 1 — Plan

Begin in plan mode and produce a short, read-only plan the user reviews and
approves before any queries run.

**Preconditions (bootstrap already done):** the active team is established
(`df-select-team`) and the three domain context files have been read
(`df-team-context-bootstrap`) — `data-domain.md` describes how the data are
modeled and grounds most exploration questions without loading schemas.

**Required reads before producing the plan:**

1. `mcp__datafabriq__get_team_orchestration_state` — to know what data and
   metrics are available.

Do not front-load `get_gold_schema_context` / `get_bronze_schema_context` in
this phase — schema context loads in Phase 2, scoped to the Tables the question
actually touches. Narrow exception: if the plan hinges on whether the needed
data exists at all and the domain files don't answer it, load the single
narrowest schema read that does.

The plan should explicitly state:

- The hypothesis or question being answered.
- The data being read (bronze or gold, which Tables / KPIs / Views).
- How it will be queried (which read-only tools and the shape of the queries).
- What output will be generated (a dataset, a one-off report, a chart summary).

For the entity model that grounds the plan, see the read-only `df-data-pipeline`
skill and `df-datafabriq-concepts`.

End the plan phase by calling `ExitPlanMode` for user approval. This is a
read-only workflow — the plan never includes write operations.

## Phase 2 — Build

Execute the approved plan using read-only tools only:

- Load schema context now, scoped to the question — `get_gold_schema_context`
  and/or `get_bronze_schema_context` for the Tables the plan named.
- Invoke `df-bronze-data-analysis` or `df-business-metrics-analysis` (the latter for
  Gold Data) and use `run_query` (with `schema: "gold"` or `schema: "bronze"`)
  to answer the question.
- Use `df-data-pipeline-viewer` (and the read-only `df-data-pipeline` model) to inspect
  pipeline configuration where the question requires it.
- Produce the dataset or report the plan named. Every `run_query` result already
  arrives as a file — download it with the URL from `get_data_export_status` and
  hand that file to the user, or summarise from it, rather than pasting rows.

## Phase 3 — Validate

Sanity-check the result:

- Cross-reference the result against a related KPI or known value to confirm the
  answer is in the right order of magnitude.
- If the user supplied an expected value during the conversation, run that as a
  single ad-hoc check via `run_query`.

There is no update-context phase — exploration produces an answer, not a
pipeline change.
