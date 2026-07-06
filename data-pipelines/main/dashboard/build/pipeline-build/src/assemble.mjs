#!/usr/bin/env node
// DataFabrIQ pipeline-config assembler. Given a repo checkout whose structural pipeline config lives
// under data-pipelines/main/, this walks the decomposed source files, validates them, and assembles
// THE build artifact — a single pipeline-config.json — into this kit's dist/ folder. The bin-place
// step (build-all.mjs) copies it to the committed location the platform reads
// (data-pipelines/main/build-output/pipeline-config.json).
//
// The emitted JSON is canonical: camelCase, fixed key order, 2-space indent, LF, trailing newline,
// nulls/empty-optionals omitted, metadata dictionaries ordinally key-sorted, lowercase UUIDs. The
// platform emits the identical form when it writes config changes, so the two writers never churn
// each other's commits. Node >= 20, no dependencies.
//
// Usage:
//   node src/assemble.mjs [repoRoot] [--out <dir>]

import { readFileSync, readdirSync, existsSync, statSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = 'data-pipelines/main';
const VIEWS_ROOT = `${ROOT}/dashboard/views`;
const KPI_ROOT = `${ROOT}/dashboard/kpi-definitions`;
const MODEL_ROOT = `${ROOT}/data-model`;
const SPECS_ROOT = `${ROOT}/transformation-specs`;
const QUERIES_ROOT = `${ROOT}/dashboard/src/data-layer/queries`;
const SETTINGS_FILE = `${ROOT}/pipeline.json`;
const DASHBOARD_META_FILE = `${ROOT}/dashboard/dashboard.json`;

const VIEW_TYPES = new Set([
  'Number', 'LineChart', 'BarChart', 'Table', 'PieChart', 'AreaChart', 'ColumnChart',
  'Funnel', 'Waterfall', 'RadialScore', 'Sankey', 'BubbleChart', 'Heatmap',
]);
const RESULT_TYPES = new Set(['Scalar', 'SingleSeries', 'MultiSeries', 'Tabular']);

const errors = [];
const fail = (message) => errors.push(message);
export const getErrors = () => errors;

// Mirror of the platform slug rule (TeamSlugService.GenerateSlugFromName).
export function slug(name) {
  let s = String(name).toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  if (s.length < 2) s = `team-${s}`;
  if (s.length > 60) s = s.slice(0, 60).replace(/-+$/g, '');
  return s;
}

// ── canonical emit helpers ────────────────────────────────────────────────

const emptyToUndef = (v) => (v === null || v === undefined || v === '' ? undefined : v);
const listOrUndef = (v) => (Array.isArray(v) && v.length > 0 ? v : undefined);
const uuid = (v) => (typeof v === 'string' ? v.toLowerCase() : v);

/** Recursively sorts plain-object keys ordinally (metadata / settings dictionaries). */
function sortedDeep(value) {
  if (Array.isArray(value)) return value.map(sortedDeep);
  if (value && typeof value === 'object') {
    const out = {};
    for (const key of Object.keys(value).sort()) out[key] = sortedDeep(value[key]);
    return out;
  }
  return value;
}

const dictOrUndef = (v) =>
  v && typeof v === 'object' && Object.keys(v).length > 0 ? sortedDeep(v) : undefined;

/** Recursively removes undefined-valued keys so JSON.stringify omits them. */
function prune(value) {
  if (Array.isArray(value)) return value.map(prune);
  if (value && typeof value === 'object') {
    const out = {};
    for (const [key, v] of Object.entries(value)) {
      if (v !== undefined) out[key] = prune(v);
    }
    return out;
  }
  return value;
}

// ── file readers ──────────────────────────────────────────────────────────

function readJson(path) {
  let raw;
  try {
    raw = readFileSync(path, 'utf8');
  } catch {
    return null;
  }
  try {
    return JSON.parse(raw);
  } catch (parseError) {
    fail(`${path}: invalid JSON — ${parseError.message}`);
    return null;
  }
}

const readText = (path) => (existsSync(path) ? readFileSync(path, 'utf8') : null);

const listDirs = (path) =>
  existsSync(path) ? readdirSync(path).filter((f) => statSync(join(path, f)).isDirectory()).sort() : [];

const listJsonFiles = (path) =>
  existsSync(path) ? readdirSync(path).filter((f) => f.endsWith('.json')).sort() : [];

function requireFields(object, fields, path) {
  for (const field of fields) {
    if (object?.[field] === undefined || object?.[field] === null || object?.[field] === '') {
      fail(`${path}: missing required field "${field}"`);
    }
  }
}

function requireUuid(value, path, field) {
  if (typeof value !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) {
    fail(`${path}: "${field}" must be a UUID (got ${JSON.stringify(value)})`);
  }
}

// ── normalizers (canonical key order matching the platform's serializer) ──

const normalizeParameter = (p) => ({
  name: p.name,
  dataType: p.dataType,
  defaultValue: p.defaultValue ?? undefined,
  required: p.required ?? false,
  description: p.description ?? '',
  allowedValues: p.allowedValues ?? undefined,
});

const normalizeColumn = (c) => ({
  name: c.name,
  displayName: c.displayName ?? '',
  dataType: c.dataType,
  maxLength: c.maxLength ?? undefined,
  label: c.label ?? '',
  description: c.description ?? '',
  metadata: dictOrUndef(c.metadata),
});

// ── assembly ──────────────────────────────────────────────────────────────

export function assemble(repoRoot) {
  errors.length = 0;
  const p = (...segments) => join(repoRoot, ...segments);

  const settings = readJson(p(SETTINGS_FILE)) ?? {};
  const meta = readJson(p(DASHBOARD_META_FILE)) ?? {};

  // ── KPI definitions + their SQL (artifact order: by name slug = file name) ──
  const kpiSlugs = new Map();
  const kpiIds = new Set();
  const kpiDefinitions = listJsonFiles(p(KPI_ROOT)).map((file) => {
    const path = p(KPI_ROOT, file);
    const kpi = readJson(path) ?? {};
    requireFields(kpi, ['id', 'name'], path);
    if (kpi.id) requireUuid(kpi.id, path, 'id');
    if (kpi.resultType !== undefined && !RESULT_TYPES.has(kpi.resultType)) {
      fail(`${path}: resultType "${kpi.resultType}" is not one of ${[...RESULT_TYPES].join(', ')}`);
    }
    for (const forbidden of ['baseQuery', 'liveQuery', 'drilldownQuery', 'validationStatus']) {
      if (kpi[forbidden] !== undefined) {
        fail(`${path}: "${forbidden}" must not be in the JSON descriptor (SQL lives in .sql files; validation state is platform-held)`);
      }
    }

    const kpiSlug = slug(kpi.name ?? '');
    if (file !== `${kpiSlug}.json`) {
      fail(`${path}: file name must be the slug of the KPI name ("${kpiSlug}.json")`);
    }
    if (kpiSlugs.has(kpiSlug)) fail(`${path}: KPI name slug "${kpiSlug}" collides with ${kpiSlugs.get(kpiSlug)}`);
    kpiSlugs.set(kpiSlug, file);
    if (kpi.id) {
      const idLower = uuid(kpi.id);
      if (kpiIds.has(idLower)) fail(`${path}: duplicate KPI id ${kpi.id}`);
      kpiIds.add(idLower);
    }

    return {
      id: uuid(kpi.id),
      name: kpi.name,
      description: emptyToUndef(kpi.description),
      targetValue: kpi.targetValue ?? undefined,
      resultType: kpi.resultType ?? 'Scalar',
      parameters: listOrUndef((kpi.parameters ?? []).map(normalizeParameter)),
      metadata: dictOrUndef(kpi.metadata),
      baseQuery: emptyToUndef(readText(p(QUERIES_ROOT, 'kpi-definitions', `${kpiSlug}-base.sql`))),
      liveQuery: emptyToUndef(readText(p(QUERIES_ROOT, 'kpi-definitions', `${kpiSlug}-live.sql`))),
      drilldownQuery: emptyToUndef(readText(p(QUERIES_ROOT, 'kpi-definitions', `${kpiSlug}-drilldown.sql`))),
    };
  });

  // ── views + widgets + custom code (artifact order: by order field, then id) ──
  const viewIds = new Set();
  const views = [];
  for (const viewDir of listDirs(p(VIEWS_ROOT))) {
    const viewJsonPath = p(VIEWS_ROOT, viewDir, 'view.json');
    const view = readJson(viewJsonPath);
    if (view === null) {
      if (!existsSync(viewJsonPath)) fail(`${p(VIEWS_ROOT, viewDir)}: missing view.json`);
      continue;
    }
    requireFields(view, ['id', 'name'], viewJsonPath);
    if (view.id) {
      requireUuid(view.id, viewJsonPath, 'id');
      const idLower = uuid(view.id);
      if (viewIds.has(idLower)) fail(`${viewJsonPath}: duplicate view id ${view.id}`);
      viewIds.add(idLower);
    }
    if (view.name && slug(view.name) !== viewDir) {
      fail(`${viewJsonPath}: folder "${viewDir}" must be the slug of the view name ("${slug(view.name)}")`);
    }

    const widgets = [];
    const widgetIds = new Set();
    for (const widgetDir of listDirs(p(VIEWS_ROOT, viewDir))) {
      const widgetJsonPath = p(VIEWS_ROOT, viewDir, widgetDir, 'widget.json');
      if (!existsSync(widgetJsonPath)) continue; // non-widget folder (e.g. src/ of a custom view project)
      const widget = readJson(widgetJsonPath);
      if (widget === null) continue;
      requireFields(widget, ['id', 'title'], widgetJsonPath);
      if (widget.id) {
        requireUuid(widget.id, widgetJsonPath, 'id');
        const idLower = uuid(widget.id);
        if (widgetIds.has(idLower)) fail(`${widgetJsonPath}: duplicate widget id ${widget.id}`);
        widgetIds.add(idLower);
      }
      if (widget.title && slug(widget.title) !== widgetDir) {
        fail(`${widgetJsonPath}: folder "${widgetDir}" must be the slug of the widget title ("${slug(widget.title)}")`);
      }
      if (widget.viewType !== undefined && !VIEW_TYPES.has(widget.viewType)) {
        fail(`${widgetJsonPath}: viewType "${widget.viewType}" is not one of ${[...VIEW_TYPES].join(', ')}`);
      }
      if (widget.kpiDefinitionId && !kpiIds.has(uuid(widget.kpiDefinitionId))) {
        fail(`${widgetJsonPath}: kpiDefinitionId ${widget.kpiDefinitionId} does not match any KPI definition`);
      }
      if (widget.validationStatus !== undefined) {
        fail(`${widgetJsonPath}: "validationStatus" must not be in the JSON descriptor (platform-held state)`);
      }

      widgets.push({
        order: widget.order ?? 0,
        value: {
          id: uuid(widget.id),
          title: widget.title,
          viewType: widget.viewType ?? 'Number',
          kpiDefinitionId: widget.kpiDefinitionId ? uuid(widget.kpiDefinitionId) : undefined,
          dataConfig: { settings: sortedDeep(widget.dataConfig?.settings ?? {}) },
          layoutConfig: {
            row: widget.layoutConfig?.row ?? 0,
            column: widget.layoutConfig?.column ?? 0,
            rowSpan: widget.layoutConfig?.rowSpan ?? 1,
            columnSpan: widget.layoutConfig?.columnSpan ?? 1,
          },
          summary: emptyToUndef(widget.summary),
          widgetCode: readText(p(VIEWS_ROOT, viewDir, widgetDir, 'index.js')) ?? undefined,
        },
      });
    }
    widgets.sort((a, b) => (a.order - b.order) || (a.value.id < b.value.id ? -1 : a.value.id > b.value.id ? 1 : 0));

    views.push({
      order: view.order ?? 0,
      value: {
        id: uuid(view.id),
        name: view.name,
        widgets: widgets.map((w) => w.value),
        viewCode: readText(p(VIEWS_ROOT, viewDir, 'index.js')) ?? undefined,
      },
    });
  }
  views.sort((a, b) => (a.order - b.order) || (a.value.id < b.value.id ? -1 : a.value.id > b.value.id ? 1 : 0));

  // ── data model (artifact order: by table name = file name) ──
  const model = readJson(p(MODEL_ROOT, 'model.json')) ?? {};
  const tableNames = new Set();
  const tables = listJsonFiles(p(MODEL_ROOT, 'tables')).map((file) => {
    const path = p(MODEL_ROOT, 'tables', file);
    const table = readJson(path) ?? {};
    requireFields(table, ['name'], path);
    if (table.name && file !== `${table.name}.json`) {
      fail(`${path}: file name must be the table name verbatim ("${table.name}.json")`);
    }
    if (table.name) {
      if (tableNames.has(table.name)) fail(`${path}: duplicate table name "${table.name}"`);
      tableNames.add(table.name);
    }
    return {
      name: table.name,
      displayName: emptyToUndef(table.displayName),
      description: emptyToUndef(table.description),
      columns: listOrUndef((table.columns ?? []).map(normalizeColumn)),
      metadata: dictOrUndef(table.metadata),
    };
  });

  // ── transformation specs + their SQL (artifact order: by outputTable = file name) ──
  const outputTables = new Set();
  const specs = listJsonFiles(p(SPECS_ROOT)).map((file) => {
    const path = p(SPECS_ROOT, file);
    const spec = readJson(path) ?? {};
    requireFields(spec, ['name', 'outputTable'], path);
    if (spec.outputTable && file !== `${spec.outputTable}.json`) {
      fail(`${path}: file name must be the outputTable verbatim ("${spec.outputTable}.json")`);
    }
    if (spec.outputTable) {
      if (outputTables.has(spec.outputTable)) fail(`${path}: duplicate outputTable "${spec.outputTable}"`);
      outputTables.add(spec.outputTable);
    }
    if (spec.query !== undefined) {
      fail(`${path}: "query" must not be in the JSON descriptor (SQL lives in the paired .sql file)`);
    }

    const query = emptyToUndef(readText(p(QUERIES_ROOT, 'transformation-specs', `${spec.outputTable}.sql`)));
    if (query === undefined) {
      fail(`${path}: no SQL file at ${QUERIES_ROOT}/transformation-specs/${spec.outputTable}.sql — the spec would produce nothing`);
    }

    return {
      name: spec.name,
      description: emptyToUndef(spec.description),
      outputTable: spec.outputTable,
      reasoning: emptyToUndef(spec.reasoning),
      metadata: dictOrUndef(spec.metadata),
      query,
    };
  });

  // ── the artifact (key order mirrors the platform's PipelineConfigArtifact) ──
  return prune({
    schemaVersion: 1,
    materializeToDatabricks: settings.materializeToDatabricks ?? true,
    dashboard: {
      name: meta.name ?? '',
      kpiDefinitions: kpiDefinitions,
      dashboardViews: views.map((v) => v.value),
    },
    dataModel: {
      description: emptyToUndef(model.description),
      tables,
      metadata: dictOrUndef(model.metadata),
    },
    mappingConfig: {
      configurationName: emptyToUndef(settings.dataMapping?.configurationName),
      description: emptyToUndef(settings.dataMapping?.description),
      portableTransformationSpecs: specs,
      metadata: dictOrUndef(settings.dataMapping?.metadata),
    },
  });
}

export const serializeArtifact = (artifact) => JSON.stringify(artifact, null, 2) + '\n';

export function findRepoRoot(startDir) {
  let dir = resolve(startDir);
  for (let i = 0; i < 10; i++) {
    if (existsSync(join(dir, 'data-pipelines'))) return dir;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

// ── CLI ─────────────────────────────────────────────────────────────────
const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const args = process.argv.slice(2);
  const outIndex = args.indexOf('--out');
  const outDir = outIndex >= 0 ? args.splice(outIndex, 2)[1] : join(dirname(fileURLToPath(import.meta.url)), '..', 'dist');
  const repoRoot = args[0] ? resolve(args[0]) : findRepoRoot(dirname(fileURLToPath(import.meta.url)));

  if (!repoRoot || !existsSync(join(repoRoot, ROOT))) {
    console.error(`No ${ROOT}/ found${repoRoot ? ` under ${repoRoot}` : ''}. Pass the repo root: node src/assemble.mjs <repoRoot>`);
    process.exit(2);
  }

  const artifact = assemble(repoRoot);

  if (errors.length > 0) {
    console.error(`✗ pipeline config INVALID — ${errors.length} error(s):\n`);
    for (const message of errors) console.error(`  • ${message}`);
    process.exit(1);
  }

  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, 'pipeline-config.json'), serializeArtifact(artifact));

  const d = artifact.dashboard;
  console.log(
    `✓ pipeline config OK: ${d.dashboardViews.length} views, ` +
    `${d.dashboardViews.reduce((n, v) => n + v.widgets.length, 0)} widgets, ` +
    `${d.kpiDefinitions.length} KPIs, ${artifact.dataModel.tables.length} tables, ` +
    `${artifact.mappingConfig.portableTransformationSpecs.length} specs → ${join(outDir, 'pipeline-config.json')}`);
}
