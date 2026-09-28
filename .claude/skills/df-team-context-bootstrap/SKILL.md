---
name: df-team-context-bootstrap
description: Required entry-point bootstrap for every DataFabrIQ workflow. Explains how to locate the team's repo checkout and its working branch, identify the Idea1 project item the branch implements, and read the three domain context files (customer-domain.md, application-domain.md, data-domain.md) that ground all further work. Use at the start of any DataFabrIQ session, right after the active team is established via `df-select-team`, before loading schemas, diffs, or heavyweight skills.
---

# Team Context Bootstrap

Every DataFabrIQ workflow starts with two cheap bootstraps, in order:

1. **Active team** — established via the `df-select-team` skill (required first; all
   MCP tools operate on the session's active team).
2. **Repo and domain context** — this skill: locate the team's repo checkout and
   its working branch, identify the project item the branch implements, and read
   the three domain files.

Do these before loading anything else. **Do not** call schema tools
(`get_source_connector_schemas`, `get_bronze_schema_context`,
`get_gold_schema_context`), or other heavyweight skills at
this point, and do not read the full data model or spec folders — the workflow
phases load those when they are actually needed.

## The team repo

The team's connected GitHub repo is checked out locally in the session.

Read-only hosts may not have the repo checked out at all. In that case skip the
working branch and the domain files and proceed with read-only MCP tools — but
never assume a checkout is absent without looking for the markers first.

## The working branch

The **working branch** is the branch checked out in the session when the workflow
starts (`git branch --show-current`). All DataFabrIQ work happens on it —
`draft`, or a branch cut from `draft` for a piece of work, such as an Idea1
project item's branch. Never switch or create branches; if the checkout is on
`main` or has no branch checked out, stop and ask the developer which branch to
work on. See `df-dashboard-source-code` for the full repo rules.

## The branch's project item

When the Idea1 MCP tools are available, identify whether the working branch
implements an Idea1 project item:

1. Take the repository as `owner/name` from the checkout's origin remote
   (`git remote get-url origin` — e.g. `git@github.com:acme-co/acme-pipeline.git`
   or `https://github.com/acme-co/acme-pipeline.git` → `acme-co/acme-pipeline`).
2. Call the Idea1 `get_item_summary_for_branch` tool with that
   `repositoryFullName` and the working branch as `branchName`.
3. A summary means the branch implements that project item. Tell the developer
   the item (its url and title) and its workflow status, and carry its url
   through the workflow — the plan's Context names it, and the commit message
   references it. A "not under workflow management" result means the branch is
   plain git work with no project item; continue without one.

The summary leaves out the item's description; load it with
`get_item_description` only when the workflow implements the item's spec. The
workflow never changes an item's workflow status or workflow context — the idea1
CLI and web app own those transitions.

Hosts without the Idea1 MCP tools skip this step.

## The three domain context files

The keys to the team's prior decisions live under `context/` at the repo root.
Read all three **first** — they are small, and everything else in the session
builds on them:

| File | What it holds |
|---|---|
| `context/customer-domain.md` | Who the customer is: business and domain terms, definitions, goals, and requirements. |
| `context/data-domain.md` | How data are modeled: data contracts, schema design, the Bronze → Gold flow, layering decisions, and each metric's semantic meaning and calculation definition. |
| `context/application-domain.md` | How the dashboard functions: views and widgets, UX workflows, and UI behavior. |

These files are the durable memory across sessions. A plan that contradicts
them is almost certainly wrong — refine the user's request against them before
proposing anything.

## If the files don't exist

Guide the user to create the 3 domain files, starting with customer-domain.md.
In `/df-prototype` this is not a blocker: a prototype team often starts with no
context files, and the workflow creates them in its update-context phase.

## What to load next

After the bootstrap, use the **skill map** in `df-datafabriq-concepts` to decide
which skill to load for the task at hand — orchestrators, phase skills,
authoring skills, and references load step-wise as the workflow needs them.
