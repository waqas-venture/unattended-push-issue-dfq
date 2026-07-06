# DataFabrIQ pipeline build kit

Platform-owned. Do not edit — the platform refreshes this kit; local changes will be overwritten.

The repo is the source of truth for the pipeline config, and this kit is its build. `npm run build`
at the **repo root** (the seeded root package.json wires it here) builds everything:

1. **Pipeline config** — assembles the source files under `data-pipelines/main/` (dashboard, views,
   widgets, KPI definitions and their `.sql`, data model, transformation specs and their `.sql`,
   pipeline settings) into a single artifact in this kit's `dist/` folder, validating everything on
   the way: JSON syntax, required fields, UUIDs, folder/file naming (name-slug rules), duplicate
   slugs and output tables, widget→KPI references, missing spec SQL.
2. **Custom views and widgets** — every view/widget folder that is a Vite project (has a
   `package.json`) is built (`npm install` on first run, then `npm run build`) into its own
   `dist/index.js`. Hand-written single-file `index.js` views/widgets need no build.
3. **Bin-place** — copies every `dist/` output to its committed location: the config artifact to
   `data-pipelines/main/build-output/pipeline-config.json`, each view/widget bundle to its
   folder-root `index.js`.

All `dist/` folders are gitignored; only the bin-placed copies are committed. **The platform reads
the committed outputs** — after any source change, run the build and commit the changed sources and
bin-placed outputs together, then push to `draft`. An unbuilt push leaves the platform serving the
previous outputs.

No dependencies for the kit itself — Node ≥ 20 only (view/widget projects install their own
toolchains). See the `dashboard-source-code` skill for the file layout and editing rules.
