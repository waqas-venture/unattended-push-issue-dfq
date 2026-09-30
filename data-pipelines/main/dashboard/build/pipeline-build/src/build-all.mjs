#!/usr/bin/env node
// DataFabrIQ repo build — builds EVERYTHING in the repo and bin-places the build output.
// Wired to `npm run build` at the repo root (see the seeded root package.json).
//
// Steps:
//   0. Validate the Ops App Object type descriptors (data-pipelines/main/objects/*.json;
//      definitionVersion 0 descriptors are migrated on the fly) and generate the TypeScript
//      declarations for every object type (object-type-declarations.mjs)
//      → <kit>/dist/ops-app-object-types.d.ts, which every view project's tsconfig includes. Runs
//      FIRST so the view builds compile against the declarations this build produced.
//   1. Build every custom view/widget project (a folder under data-pipelines/main/dashboard/views/
//      containing a package.json): `npm install` (always, not just when node_modules is missing —
//      an existing node_modules doesn't mean the packages are up to date), then `npm run build`
//      → <folder>/dist/index.js. Every view/widget with custom code IS such a project.
//   2. Sweep folder-root index.js files. A view/widget folder never holds a committed index.js:
//      beside a project it is a stale output from an older build kit and is deleted; on its own it is
//      a legacy single-file view/widget and fails the build (convert it with
//      /df-migrate-legacy-components-in-repo).
//   3. Assemble the pipeline config (assemble.mjs) → <kit>/dist/pipeline-config.json, embedding each
//      project's built dist/index.js. Assembly runs AFTER the builds so the artifact carries the code
//      this build produced, not the previous build's.
//   4. Bin-place: copy the config artifact to its committed location,
//      data-pipelines/main/build-output/pipeline-config.json.
//
// All dist/ folders are gitignored — the generated declarations included; the artifact is the ONLY
// committed build output. The platform reads it via GitHub, so after any source change: run this
// build, review the changes, then commit the changed sources and the artifact together and push to
// the working branch.
//
// Exits non-zero on the first failure (an invalid object type, a view/widget build error, a
// folder-root index.js that needs migrating, or an invalid config).

import { existsSync, mkdirSync, copyFileSync, readdirSync, statSync, writeFileSync, rmSync } from 'node:fs';
import { join, resolve, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { assemble, readObjectTypes, serializeArtifact, getErrors, findRepoRoot } from './assemble.mjs';
import { emitObjectTypeDeclarations, OBJECT_TYPE_DECLARATIONS_FILE } from './object-type-declarations.mjs';

const ROOT = 'data-pipelines/main';
const VIEWS_ROOT = `${ROOT}/dashboard/views`;
const BUILD_OUTPUT = `${ROOT}/build-output`;

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = process.argv[2] ? resolve(process.argv[2]) : findRepoRoot(scriptDir);
if (!repoRoot || !existsSync(join(repoRoot, ROOT))) {
  console.error(`No ${ROOT}/ found${repoRoot ? ` under ${repoRoot}` : ''}. Run from the repo, or pass the repo root.`);
  process.exit(2);
}

const rel = (p) => relative(repoRoot, p);
const kitDist = join(scriptDir, '..', 'dist');
let failures = 0;

// ── 0. object types → TypeScript declarations for the view projects ─────
const declarations = emitObjectTypeDeclarations(readObjectTypes(repoRoot));
if (getErrors().length > 0) {
  console.error(`✗ object types INVALID — ${getErrors().length} error(s):\n`);
  for (const message of getErrors()) console.error(`  • ${message}`);
  process.exit(1);
}
mkdirSync(kitDist, { recursive: true });
const declarationsPath = join(kitDist, OBJECT_TYPE_DECLARATIONS_FILE);
writeFileSync(declarationsPath, declarations);
console.log(`✓ generated object type declarations → ${rel(declarationsPath)}`);

// ── 1. build every view/widget project → its dist/index.js ──────────────
const listDirs = (p) =>
  existsSync(p) ? readdirSync(p).filter((f) => statSync(join(p, f)).isDirectory()).sort() : [];

const isProject = (dir) => existsSync(join(dir, 'package.json'));

// The view/widget folders, identified exactly as the assembler identifies them — a view folder holds a
// view.json, a widget folder a widget.json. Anything else under a view (src/, dist/, node_modules/) is
// project internals, not an artifact folder.
const artifactDirs = [];
for (const viewDir of listDirs(join(repoRoot, VIEWS_ROOT))) {
  const viewPath = join(repoRoot, VIEWS_ROOT, viewDir);
  if (!existsSync(join(viewPath, 'view.json'))) continue; // the assembler reports this as an error
  artifactDirs.push(viewPath);
  for (const widgetDir of listDirs(viewPath)) {
    const widgetPath = join(viewPath, widgetDir);
    if (existsSync(join(widgetPath, 'widget.json'))) artifactDirs.push(widgetPath);
  }
}
const projectDirs = artifactDirs.filter(isProject);

const builtProjects = [];
for (const projectDir of projectDirs) {
  const label = rel(projectDir);
  console.log(`  installing dependencies in ${label}…`);
  const install = spawnSync('npm', ['install', '--no-audit', '--no-fund'], { cwd: projectDir, stdio: 'inherit' });
  if (install.status !== 0) {
    console.error(`✗ npm install failed in ${label}`);
    failures++;
    continue;
  }
  console.log(`  building ${label}…`);
  const build = spawnSync('npm', ['run', 'build'], { cwd: projectDir, stdio: 'inherit' });
  if (build.status !== 0) {
    console.error(`✗ build failed in ${label}`);
    failures++;
    continue;
  }
  if (!existsSync(join(projectDir, 'dist', 'index.js'))) {
    console.error(`✗ ${label}: build produced no dist/index.js`);
    failures++;
    continue;
  }
  builtProjects.push(projectDir);
  console.log(`✓ built ${label} → ${rel(join(projectDir, 'dist', 'index.js'))}`);
}

// ── 2. sweep folder-root index.js files ─────────────────────────────────
for (const artifactDir of artifactDirs) {
  const indexPath = join(artifactDir, 'index.js');
  if (!existsSync(indexPath)) continue;
  if (isProject(artifactDir)) {
    rmSync(indexPath);
    console.log(`✓ removed stale ${rel(indexPath)} (the artifact embeds dist/index.js — commit the deletion)`);
    continue;
  }
  console.error(
    `✗ ${rel(indexPath)}: legacy single-file view/widget code is no longer supported. Convert this ` +
    `folder to a Vite + TypeScript + React project (copy ${ROOT}/dashboard/templates/v1/) and delete ` +
    `the folder-root index.js — run the /df-migrate-legacy-components-in-repo command to do this.`);
  failures++;
}

if (failures > 0) {
  console.error(`\n✗ ${failures} error(s) — nothing assembled or bin-placed. Fix the errors and re-run.`);
  process.exit(1);
}

// ── 3. assemble the pipeline config → kit dist/ ─────────────────────────
const artifact = assemble(repoRoot);
if (getErrors().length > 0) {
  console.error(`✗ pipeline config INVALID — ${getErrors().length} error(s):\n`);
  for (const message of getErrors()) console.error(`  • ${message}`);
  process.exit(1);
}
mkdirSync(kitDist, { recursive: true });
const artifactDistPath = join(kitDist, 'pipeline-config.json');
writeFileSync(artifactDistPath, serializeArtifact(artifact));
console.log(`✓ assembled pipeline config → ${rel(artifactDistPath)}`);

// ── 4. bin-place: copy the artifact to its committed location ────────────
mkdirSync(join(repoRoot, BUILD_OUTPUT), { recursive: true });
copyFileSync(artifactDistPath, join(repoRoot, BUILD_OUTPUT, 'pipeline-config.json'));
console.log(`✓ bin-placed ${BUILD_OUTPUT}/pipeline-config.json`);

const d = artifact.dashboard;
console.log(
  `\n✓ build complete: ${d.dashboardViews.length} views, ` +
  `${d.dashboardViews.reduce((n, v) => n + v.widgets.length, 0)} widgets, ` +
  `${d.kpiDefinitions.length} KPIs, ${artifact.dataModel.tables.length} tables, ` +
  `${artifact.mappingConfig.portableTransformationSpecs.length} specs, ` +
  `${artifact.objectTypes.length} object types; ` +
  `${builtProjects.length} view/widget project(s) built. Review the changes, then commit the changed ` +
  `sources and ${BUILD_OUTPUT}/pipeline-config.json together.`);
