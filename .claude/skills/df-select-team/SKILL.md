---
name: df-select-team
description: Context for picking the DataFabriq team a session operates on. Use when the user is doing DataFabriq work and the team to operate on is not yet established for the session.
---

# Selecting a DataFabriq Team

DataFabriq organizes everything by team. Each team has its own connectors, bronze data, gold tables, transformation specs, KPI definitions, dashboards, and custom code.
Tools that read or write DataFabriq data require an active team set in the current MCP session.

A user may belong to multiple teams.

The `get_available_teams` tool lists the teams a user is authorized to access. It also indicates whether an active team is already set for the current session.

When the user has exactly one available team, the active team is set automatically when the session begins.

## From a repo checkout: the repo's team

A team's pipeline config lives in its connected GitHub repo. When the session runs in a checkout of that repo, the repo identifies the team:

1. Take the repository as `owner/name` from the checkout's origin remote (`git remote get-url origin` — e.g. `git@github.com:acme-co/acme-pipeline.git` → `acme-co/acme-pipeline`).
2. Call `get_team_for_repository` with that `repository_full_name`. It returns the team, among the user's available teams, whose pipeline config lives in the repo, with its `team_slug`. It does not change the active team.
3. One team returned → that is the team. More than one → ask the user which one. An error means none of the user's teams has this repo connected; fall back to the picker or the verbal flow below.

## Preferred flow: visual picker

If the host supports MCP App resources, use the visual picker. Two equivalent ways to open it depending on how the host triggers Apps:

- **Resource-based hosts** (e.g. Claude Desktop): read the `ui://select_team/mcp-app.html` resource directly.
- **Tool-based hosts** (e.g. the modelcontextprotocol/ext-apps reference host): call the `select_team` tool — the host renders the App referenced by its `_meta.ui.resourceUri`.

In both cases the picker is pre-populated with the teams the user belongs to, and when the user clicks a team it calls `set_active_team` on their behalf. The session's active team is set as soon as the picker completes — no separate tool call from you.

## Fallback: verbal flow

If the host does not support MCP App resources at all, fall back to the verbal flow:

1. The `get_available_teams` tool lists the teams a user is authorized to access.
2. The team is identified by `team_slug`, a stable, human-readable identifier returned by `get_available_teams`. Slugs look like `my-cool-team` or `acme`; they are not interchangeable across teams.
3. Use `set_active_team` to set the team for the session.

When the user has set a team explicitly (via the picker or `set_active_team`), that's the team all tools operate on for the rest of the session.
