---
description: Explore, analyze, or build a one-off report from a DataFabrIQ team's data.
argument-hint: [optional-team-slug]
---

Begin in plan mode. This is a read-only plugin: it can query and inspect data
but cannot modify the Data Pipeline.

Bootstrap first — keep the initial context load minimal:

1. Follow the `df-team-context-bootstrap` skill: if the team's repo is checked out
   in this session, read `context/customer-domain.md`, `context/data-domain.md`,
   and `context/application-domain.md` — `data-domain.md` describes how the data
   are modeled, which grounds most exploration questions without loading schemas.
2. Clarify the question or report the user wants before planning.

Then route to the `df-adhoc-exploration` skill, which runs a read-only
plan → build → validate cycle: produce a plan for the user to approve, execute it
with read-only queries to build the answer (a dataset or report), then validate
the result. Schema context loads during build, scoped to the question.

For an overview of the team's pipeline state and which read-only skill fits a
task, use the `df-readonly-guide` skill.

Call ExitPlanMode once the plan is ready for the user to review.
