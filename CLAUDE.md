# DataFabrIQ pipeline repo

This repo **is** the DataFabrIQ data pipeline configuration. The dashboard, its views and widgets,
the KPI definitions, the data model, and the transformation specs all live here as source files —
your file edit IS the change. The platform reads one committed build output from this repo:
`data-pipelines/main/build-output/pipeline-config.json`.

Everything here is platform-agnostic scaffolding maintained by DataFabrIQ. Team-specific knowledge
lives in `context/` — read those files first.

## Layout

| Artifact | Path |
|---|---|
| Pipeline settings | `data-pipelines/main/pipeline.json` |
| Dashboard name | `data-pipelines/main/dashboard/dashboard.json` |
| View descriptor | `data-pipelines/main/dashboard/views/<view-slug>/view.json` |
| Custom view code | `data-pipelines/main/dashboard/views/<view-slug>/src/**` (Vite + TS + React project) |
| Widget descriptor | `data-pipelines/main/dashboard/views/<view-slug>/<widget-slug>/widget.json` |
| Custom widget code | `data-pipelines/main/dashboard/views/<view-slug>/<widget-slug>/src/**` |
| KPI Definition metadata | `data-pipelines/main/dashboard/kpi-definitions/<kpi-slug>.json` |
| KPI Definition queries | `data-pipelines/main/dashboard/src/data-layer/queries/kpi-definitions/<kpi-slug>-base.sql`, `-live.sql`, `-drilldown.sql` |
| Data model | `data-pipelines/main/data-model/model.json` + `data-model/tables/<table-name>.json` |
| Transformation Spec metadata | `data-pipelines/main/transformation-specs/<outputTable>.json` |
| Transformation Spec query | `data-pipelines/main/dashboard/src/data-layer/queries/transformation-specs/<outputTable>.sql` |
| Ops App Object type definition (JSON Schema; `ingestToBronze` selects bronze ingestion) | `data-pipelines/main/objects/<table_name>.json` |
| Team context documents | `context/<path>` |
| Build output (generated — never hand-edit) | `data-pipelines/main/build-output/pipeline-config.json` |

Correlation to the platform is **by filename and folder** — a view/widget folder is the slug of its
name, a KPI's files are the slug of its name, a spec's files are its output table name verbatim. The
JSON descriptors carry the ids.

## Setup

`./setup.sh` at the repo root sets this folder up with every tool and setting it needs to build,
run, and test locally, such as the git config that keeps merges to merge commits. It is idempotent:
run it after cloning and whenever it changes. Anything a clone needs beyond the committed files belongs
in it.

## Building

`npm run build` **at the repo root is the only build step.** It:

1. validates the Ops App Object type descriptors and emits
   `data-pipelines/main/dashboard/build/pipeline-build/dist/ops-app-object-types.d.ts` — the
   TypeScript declarations for every object type, which view projects include (gitignored like
   every `dist/` output);
2. builds every custom view/widget project (`npm install` on first run, then `tsc && vite build`)
   into that folder's `dist/index.js`;
3. validates the whole config and assembles it — embedding each built `dist/index.js` — into
   `data-pipelines/main/build-output/pipeline-config.json`.

Rules:

- **Custom view/widget code is a Vite project under `src/`.** Its build output is `dist/index.js`,
  which is gitignored; the code reaches the platform only inside the pipeline-config artifact.
- **Never hand-edit anything under `build-output/`.** Run the build.
- `dist/` and `node_modules/` are gitignored and never committed.
- A per-folder `npm run build` is fine for fast iteration, but always finish with the root build —
  the artifact is only regenerated there.
- An unbuilt push leaves the platform serving the previous artifact.

## Platform-owned paths — never edit in place

- `data-pipelines/main/dashboard/build/` — the pipeline build kit
- `data-pipelines/main/dashboard/templates/` — the view/widget starter projects (copy one into a
  view/widget folder to start new work)
- `.claude/skills/`, `.claude/commands/`, `.claude/settings.json`, `.mcp.json`
- `.idea1/settings.json`, `.idea1/.gitignore`
- `setup.sh`

The platform refreshes these; local changes are overwritten.

## Working rules

- **Work on the branch that is checked out** — `draft`, or a branch cut from `draft` for a piece of
  work, such as an idea1 project item's branch. Never make changes on `main`. `.idea1/settings.json`
  declares `draft` to the idea1 workflow, so an idea1 project item's branch is cut from `draft` and its
  pull request targets `draft`. Publishing merges `draft` into `main` and makes the change live.
- **Never open pull requests and never create or switch branches.** The idea1 workflow owns branching
  and pull requests.
- **Merge only with merge commits.** Never rebase or squash: pull with `git pull --no-rebase` and merge
  with `git merge --no-ff`. When a pull or merge has conflicts, stop and tell the developer there are
  conflicts to resolve before the merge can complete.
- **Do not commit or push on your own.** Make the changes, validate the SQL, run the root build, and
  leave the result in the working tree for the developer to review. The workflow ends with a single
  commit and push of the checked-out branch, made only after the developer has reviewed the diff and
  said to proceed.
- Validate every edited `.sql` file with the `validate_sql_query` MCP tool before building.
- Keep `context/` current: after a change lands, update the context documents so the next session
  inherits what was built and why.

# Context files, README.md's, Skills, and Code comments

Create and maintain README.md files in folders that contain a significant code layer. README.md files are concise overviews of the abstraction layer, how it's used, and how it integrates in the rest of the system. README.md files should NOT contain code level details or control flow narratives. It should explain the absctraction layer - what exists, how it's used, any key invariants, and how it integrates in the rest of the system.

In context/*.md files, skills, and code comments, follow these guidelines:

- Documentation should describe the current design and implementation only, in the present tense
- Do not describe changes, prior versions, specific dates, or historical context (e.g., "replaces OldClass", "formerly known as")
- Describe how entities and functionality are generally used within the overall layers and codebase, but do not enumerate specific other classes that use the layer, or specific concrete types, etc, just state the general abstraction and how it's used.
  - Generalize descriptions and provide one specific as an example rather than all specifics (e.g., "Used by services that support author attribution (e.g., Intercom)"). This way the comment remains correct if the specific usage changes. Do not list every specific usage instance.
- Focus on what the layer code does and how it should be used, not its history or external dependencies
