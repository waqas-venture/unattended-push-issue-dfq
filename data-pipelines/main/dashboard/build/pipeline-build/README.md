# DataFabrIQ pipeline build kit

Platform-owned. Do not edit — the platform refreshes this kit; local changes will be overwritten.

The repo is the source of truth for the pipeline config, and this kit is its build. `npm run build`
at the **repo root** (the seeded root package.json wires it here) builds everything:

1. **Object types** — validates every Ops App Object type descriptor under
   `data-pipelines/main/objects/` and generates the TypeScript declarations for every object type
   into this kit's `dist/ops-app-object-types.d.ts`: one alias per type, its list-item projection,
   and one per `$defs` entry. Every custom view project's `tsconfig.json` includes that file, so a
   view's data layer compiles against the exact document shapes. Runs first, so the view builds see
   the declarations this build produced.

   Object types have one shape: a JSON document described by a JSON Schema subset (`schema`), a
   `sequenceField` naming the required root property that orders objects, an optional
   `listProjection` that narrows list and query reads, and an `ingestToBronze` flag that selects
   bronze ingestion — supported when the schema is flat (every root property a single primitive,
   optionally nullable, with a snake_case name, since the root properties become the bronze view's
   columns). A descriptor declares `definitionVersion: 1`; a legacy descriptor without it (a
   `fields` list) is migrated to the schema form on the fly, and the artifact carries version 1
   only.
2. **Custom views and widgets** — every view/widget folder is a Vite project (it has a
   `package.json`) and is built (`npm install` on first run, then `npm run build`) into its own
   `dist/index.js`.
3. **Pipeline config** — assembles the source files under `data-pipelines/main/` (dashboard, views,
   widgets, KPI definitions and their `.sql`, data model, transformation specs and their `.sql`,
   object types, pipeline settings) into a single artifact in this kit's `dist/` folder, embedding
   each view/widget's built `dist/index.js`, and validating everything on the way: JSON syntax,
   required fields, UUIDs, folder/file naming (name-slug rules), duplicate slugs and output tables,
   widget→KPI references, missing spec SQL, object type descriptors. Assembly runs after the
   view/widget builds, so the artifact always carries the code this build produced.
4. **Bin-place** — copies the config artifact to its committed location,
   `data-pipelines/main/build-output/pipeline-config.json`.

All `dist/` folders are gitignored — the generated declarations included; the artifact is the only
committed build output. **The platform reads that artifact** — after any source change, run the
build, review the changes, then commit the changed sources and the artifact together and push to
`draft`. An unbuilt push leaves the platform serving the previous artifact.

No dependencies for the kit itself — Node ≥ 20 only (view/widget projects install their own
toolchains). See the `dashboard-source-code` skill for the file layout and editing rules.
