#!/usr/bin/env node
// DataFabrIQ repo build — builds EVERYTHING in the repo and bin-places the outputs.
// Wired to `npm run build` at the repo root (see the seeded root package.json).
//
// Steps:
//   1. Assemble the pipeline config (assemble.mjs) → <kit>/dist/pipeline-config.json.
//   2. Build every custom view/widget that is a Vite project (a folder under
//      data-pipelines/main/dashboard/views/ containing a package.json): `npm install` when
//      node_modules is missing, then `npm run build` → <folder>/dist/index.js.
//      Hand-written single-file views/widgets (index.js without a package.json) need no build.
//   3. Bin-place: copy every build's dist/ output to its committed location —
//      the config artifact → data-pipelines/main/build-output/pipeline-config.json,
//      each view/widget dist/index.js → its folder-root index.js.
//
// All dist/ folders are gitignored; ONLY the bin-placed copies are committed. The platform reads the
// committed outputs via GitHub, so after any source change: run this build, then commit and push the
// changed sources AND bin-placed outputs together.
//
// Exits non-zero on the first failure (invalid config, or a view/widget build error).

import { existsSync, mkdirSync, copyFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { assemble, serializeArtifact, getErrors, findRepoRoot } from './assemble.mjs';

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
let failures = 0;

// ── 1. assemble the pipeline config → kit dist/ ─────────────────────────
const kitDist = join(scriptDir, '..', 'dist');
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

// ── 2. build every view/widget Vite project → its dist/ ─────────────────
const listDirs = (p) =>
  existsSync(p) ? readdirSync(p).filter((f) => statSync(join(p, f)).isDirectory()).sort() : [];

const projectDirs = [];
for (const viewDir of listDirs(join(repoRoot, VIEWS_ROOT))) {
  const viewPath = join(repoRoot, VIEWS_ROOT, viewDir);
  if (existsSync(join(viewPath, 'package.json'))) projectDirs.push(viewPath);
  for (const widgetDir of listDirs(viewPath)) {
    const widgetPath = join(viewPath, widgetDir);
    if (existsSync(join(widgetPath, 'package.json'))) projectDirs.push(widgetPath);
  }
}

const builtProjects = [];
for (const projectDir of projectDirs) {
  const label = rel(projectDir);
  if (!existsSync(join(projectDir, 'node_modules'))) {
    console.log(`  installing dependencies in ${label}…`);
    const install = spawnSync('npm', ['install', '--no-audit', '--no-fund'], { cwd: projectDir, stdio: 'inherit' });
    if (install.status !== 0) {
      console.error(`✗ npm install failed in ${label}`);
      failures++;
      continue;
    }
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

if (failures > 0) {
  console.error(`\n✗ ${failures} build(s) failed — nothing bin-placed. Fix the errors and re-run.`);
  process.exit(1);
}

// ── 3. bin-place: copy dist/ outputs to their committed locations ────────
mkdirSync(join(repoRoot, BUILD_OUTPUT), { recursive: true });
copyFileSync(artifactDistPath, join(repoRoot, BUILD_OUTPUT, 'pipeline-config.json'));
console.log(`✓ bin-placed ${BUILD_OUTPUT}/pipeline-config.json`);

for (const projectDir of builtProjects) {
  copyFileSync(join(projectDir, 'dist', 'index.js'), join(projectDir, 'index.js'));
  console.log(`✓ bin-placed ${rel(join(projectDir, 'index.js'))}`);
}

const d = artifact.dashboard;
console.log(
  `\n✓ build complete: ${d.dashboardViews.length} views, ` +
  `${d.dashboardViews.reduce((n, v) => n + v.widgets.length, 0)} widgets, ` +
  `${d.kpiDefinitions.length} KPIs, ${artifact.dataModel.tables.length} tables, ` +
  `${artifact.mappingConfig.portableTransformationSpecs.length} specs; ` +
  `${builtProjects.length} view/widget project(s) built. Commit the changed sources and bin-placed outputs together.`);
