---
name: df-update-context-phase
description: Persists per-team context to the team's context files so the next session inherits what was built and why. Use as the update-context phase of the configuration entry-point workflows (`/df-update`, `/df-implement-project-item`, `/df-prototype`). Reads before it writes to preserve prior content.
---

# DataFabrIQ Update Context Phase

The fourth phase of the standard phased workflow (see `df-datafabriq-concepts`), before the final commit-and-push phase.
It persists the "why" and the cross-cutting narrative of a DataFabrIQ workflow
into the team's **context files**. The product contract is that any user on the
team — in this Cowork session or a future one — should be able to read these
files and understand the state of the team's DataFabrIQ setup.

## What Context Files Are

Context files are markdown, CSV, XLSX, and JSON documents that live as files in
the team's connected GitHub repo (checked out locally in this session), under
`context/` at the repo root. They capture narrative and rationale that does not
belong on any single Dashboard, KPI Definition, or Widget.

- **Path**: every context file lives under `context/<path>` in the repo (for
  example `context/data-domain.md`).
- **Access**: read and edit these files **directly** with normal file tools —
  see the `df-dashboard-source-code` skill. Work on the working branch. No build or
  validation step is needed for context files.

## Standardized Files — the three domain files

Three files always exist for every onboarded team. The filenames are fixed — do
not invent alternatives for routine context. These are the same files every
workflow reads at bootstrap (see `df-team-context-bootstrap`), so what this phase
writes is what the next session starts from.

| Path | Purpose |
|---|---|
| `customer-domain.md` | Who the customer is: business and domain terms, definitions, goals, requirements, source platforms in scope, and onboarding milestones. |
| `data-domain.md` | How data are modeled: data contracts, schema design, the Bronze → Gold flow and higher modeling layers, and each metric's semantic meaning and specific calculation definition. |
| `application-domain.md` | How the dashboard functions: views and widgets, UX workflows, and UI behavior. |

## Read Before Write

For every file you intend to update:

1. List the existing files under `context/` to see what already exists.
2. For each file you plan to write, read it first.
3. Edit the existing content in place rather than overwriting from scratch.
4. Write the merged content back.

A file that does not exist yet — the expected case during onboarding — is simply
created with full content (creating any intermediate folders the path needs).

## What Belongs Here vs. on Config Objects

Descriptions on data-model objects, the dashboard data model, KPI definitions,
and widgets already have their own homes — they stay there, in the config files
in the team's repo (see `df-dashboard-source-code`):

- the overall Dashboard Data Model description — `data-pipelines/main/data-model/model.json`
- per-Table descriptions — `data-pipelines/main/data-model/tables/<table-name>.json`
- a KPI's description — `data-pipelines/main/dashboard/kpi-definitions/<kpi-slug>.json`
- a widget's summary — its `widget.json`

The three domain files capture what those objects do **not** carry: the *why*
behind a choice, and the cross-cutting narrative that spans multiple objects. If a piece of information would be more useful attached to
the object itself, put it there; only what's left over belongs in a context
file.

## When This Phase Is Skipped

If a workflow produced no material change to the team's setup (for example a
read-only exploration that saved no artifacts), this phase can be skipped
entirely. The scenario skills (`df-pipeline-update`, `df-prototype`,
`df-adhoc-exploration`) describe which files are in scope for each scenario.
