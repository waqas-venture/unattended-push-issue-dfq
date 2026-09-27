#!/usr/bin/env node
// DataFabrIQ pipeline-config assembler. Given a repo checkout whose structural pipeline config lives
// under data-pipelines/main/, this walks the decomposed source files, validates them, and assembles
// THE build artifact — a single pipeline-config.json — into this kit's dist/ folder. The bin-place
// step (build-all.mjs) copies it to the committed location the platform reads
// (data-pipelines/main/build-output/pipeline-config.json).
//
// Custom view/widget code is read from each project's build output (<folder>/dist/index.js) and
// embedded in the artifact, so build-all.mjs must build the view/widget projects BEFORE assembling.
// A view/widget folder never holds a committed index.js of its own.
//
// Ops App Object types (data-pipelines/main/objects/<table_name>.json) have one shape: a JSON
// document validated by a JSON Schema subset, with an optional list projection, and an
// `ingestToBronze` flag that selects bronze ingestion (supported for flat schemas). Legacy
// descriptors (no definitionVersion, a `fields` list) are migrated to that shape on the fly.
// readObjectTypes() is exported on its own so build-all.mjs validates the descriptors and generates
// every type's TypeScript declarations (object-type-declarations.mjs) before the view projects build.
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
const OBJECTS_ROOT = `${ROOT}/objects`;
const QUERIES_ROOT = `${ROOT}/dashboard/src/data-layer/queries`;
const SETTINGS_FILE = `${ROOT}/pipeline.json`;
const DASHBOARD_META_FILE = `${ROOT}/dashboard/dashboard.json`;

const VIEW_TYPES = new Set([
  'Number', 'LineChart', 'BarChart', 'Table', 'PieChart', 'AreaChart', 'ColumnChart',
  'Funnel', 'Waterfall', 'RadialScore', 'Sankey', 'BubbleChart', 'Heatmap',
]);
const RESULT_TYPES = new Set(['Scalar', 'SingleSeries', 'MultiSeries', 'Tabular']);
const OBJECT_IDENTIFIER = /^[a-z][a-z0-9_]*$/;
const OBJECT_DEFINITION_VERSION = 1;

// The legacy (definitionVersion 0) descriptor form: a `fields` list in the canonical type vocabulary.
// A legacy descriptor is validated against these and migrated to the schema form on the fly.
const LEGACY_FIELD_TYPES = new Set(['string', 'integer', 'number', 'boolean', 'date', 'datetime']);
const LEGACY_SEQUENCE_FIELD_TYPES = new Set(['integer', 'datetime', 'date']);
const LEGACY_RESERVED_FIELD_NAMES = new Set(['id', 'sequence_number', 'change_number']);
const LEGACY_FIELD_FORMATS = { date: 'date', datetime: 'date-time' };
const LEGACY_ONLY_KEYS = ['fields'];
const SCHEMA_FORM_KEYS = ['schema', 'listProjection', 'ingestToBronze'];

// A bronze-ingested type's schema is flat: every root property is a single primitive — one of these,
// optionally nullable — with a snake_case name, since the property list IS the bronze view's columns.
const BRONZE_PROPERTY_TYPES = new Set(['string', 'integer', 'number', 'boolean']);
const BRONZE_NESTING_KEYWORDS = ['properties', 'items', 'additionalProperties'];

// The JSON Schema subset an object type's "schema" is written in. Every node declares `type`,
// `enum` or `$ref`; object nodes are closed by default (a node with `properties` and no
// `additionalProperties` rejects unknown properties at runtime); `$defs` live at the root only and
// `$ref` is a local "#/$defs/<Name>" reference alone on its node apart from the annotations.
const SCHEMA_TYPES = new Set(['string', 'number', 'integer', 'boolean', 'object', 'array', 'null']);
const SCHEMA_NODE_KEYWORDS = new Set([
  'type', 'properties', 'required', 'additionalProperties', 'items', 'enum', 'format', 'title', 'description', '$ref',
]);
const SCHEMA_ROOT_KEYWORDS = new Set([...SCHEMA_NODE_KEYWORDS, '$defs']);
const SCHEMA_REF_NODE_KEYWORDS = new Set(['$ref', 'title', 'description']);
const SCHEMA_ENUM_PRIMITIVES = new Set(['null', 'string', 'number', 'boolean']);
const SCHEMA_VALIDATED_FORMATS = new Set(['date-time', 'date']);
const SCHEMA_PROPERTY_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;
const SCHEMA_RESERVED_ROOT_PROPERTY_NAMES = new Set(['id', 'sequenceNumber', 'changeNumber', 'sequence_number', 'change_number']);
export const SCHEMA_REF = /^#\/\$defs\/([A-Za-z_][A-Za-z0-9_]*)$/;
const SCHEMA_MAX_DEPTH = 32;
// The three node shapes (annotations aside) a sequenceField resolves to, key-sorted.
const SCHEMA_SEQUENCE_NODES = new Set([
  '{"type":"integer"}',
  '{"format":"date-time","type":"string"}',
  '{"format":"date","type":"string"}',
]);

const errors = [];
export const fail = (message) => errors.push(message);
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
export const isPlainObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

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

// ── object types ─────────────────────────────────────────────────────────
// The file name IS the object type's table name — its unique id. Descriptors carry no id or name
// of their own, so agents never generate ids for object types. One shape: `schema` (the JSON Schema
// subset) describes the document, `sequenceField` names the required root property that orders
// versions, `listProjection` optionally narrows list and query reads, and `ingestToBronze` selects
// bronze ingestion — which requires a flat schema, since every root property becomes a view column.
// `definitionVersion` says which form the descriptor is written in: 1 is the schema form; absent
// (0) is the legacy `fields` form, validated and migrated to its version 1 equivalent on the fly.
// The artifact carries version 1 only. Entries come out in artifact order (by tableName = file
// name) and canonical key order:
//   { tableName, definitionVersion, schema, sequenceField, listProjection, ingestToBronze, versionNumber }
// with `schema` ordinally key-sorted and `listProjection` omitted when empty — the platform writer
// emits the identical form (byte parity). Every problem is reported through fail().

export function readObjectTypes(repoRoot) {
  const entries = [];
  for (const file of listJsonFiles(join(repoRoot, OBJECTS_ROOT))) {
    const path = join(repoRoot, OBJECTS_ROOT, file);
    const type = readJson(path) ?? {};
    const tableName = file.slice(0, -'.json'.length);
    const errorsBefore = errors.length;
    requireFields(type, ['sequenceField'], path);
    for (const key of ['id', 'name', 'tableName']) {
      if (type[key] !== undefined) {
        fail(`${path}: "${key}" must not be in the descriptor — the table name is given by the file name, and object types have no other id`);
      }
    }
    if (type.kind !== undefined) {
      fail(`${path}: "kind" is not a descriptor key — bronze ingestion is the "ingestToBronze" flag`);
    }
    if (!OBJECT_IDENTIFIER.test(tableName)) {
      fail(`${path}: file name "${tableName}" must match ${OBJECT_IDENTIFIER} (it is the table name; a bronze-ingested type's view is named after it)`);
    }
    if (type.versionNumber !== undefined && (!Number.isInteger(type.versionNumber) || type.versionNumber < 0)) {
      fail(`${path}: "versionNumber" must be a non-negative integer`);
    }

    const definitionVersion = type.definitionVersion ?? 0;
    if (definitionVersion === OBJECT_DEFINITION_VERSION) {
      entries.push(readObjectType(type, tableName, path));
    } else if (definitionVersion === 0) {
      // A legacy descriptor is migrated only once it is valid — a migrated entry is always a
      // well-formed version 1 entry.
      validateLegacyObjectType(type, path);
      if (errors.length === errorsBefore) entries.push(migrateLegacyObjectType(type, tableName));
    } else {
      fail(`${path}: "definitionVersion" must be ${OBJECT_DEFINITION_VERSION} — a descriptor without it is a legacy "fields" descriptor, migrated on the fly (got ${JSON.stringify(type.definitionVersion)})`);
    }
  }
  return entries.map(prune);
}

/**
 * Validates a legacy (definitionVersion 0) descriptor: a non-empty `fields` list of unique
 * snake_case names in the canonical type vocabulary, none of them a platform-emitted column, and a
 * `sequenceField` naming an integer, datetime or date field. The schema-form keys are rejected —
 * a descriptor that uses them declares `definitionVersion: 1`.
 */
function validateLegacyObjectType(type, path) {
  for (const key of SCHEMA_FORM_KEYS) {
    if (type[key] !== undefined) {
      fail(`${path}: "${key}" is a definitionVersion ${OBJECT_DEFINITION_VERSION} key — declare "definitionVersion": ${OBJECT_DEFINITION_VERSION} (a descriptor without it is a legacy "fields" descriptor)`);
    }
  }

  const fields = Array.isArray(type.fields) ? type.fields : [];
  if (fields.length === 0) fail(`${path}: "fields" must be a non-empty array`);
  const fieldNames = new Set();
  for (const field of fields) {
    requireFields(field, ['name', 'type'], path);
    if (field.name && !OBJECT_IDENTIFIER.test(field.name)) {
      fail(`${path}: field name "${field.name}" must match ${OBJECT_IDENTIFIER} (it becomes a bronze view column)`);
    }
    if (field.name && LEGACY_RESERVED_FIELD_NAMES.has(field.name)) {
      fail(`${path}: field name "${field.name}" is reserved (a platform-emitted column)`);
    }
    if (field.name) {
      if (fieldNames.has(field.name)) fail(`${path}: duplicate field name "${field.name}"`);
      fieldNames.add(field.name);
    }
    if (field.type !== undefined && field.type !== null && field.type !== '' && !LEGACY_FIELD_TYPES.has(field.type)) {
      fail(`${path}: field "${field.name}" type "${field.type}" is not one of ${[...LEGACY_FIELD_TYPES].join(', ')}`);
    }
  }

  if (type.sequenceField) {
    const sequenceField = fields.find((f) => f.name === type.sequenceField);
    if (!sequenceField) {
      fail(`${path}: sequenceField "${type.sequenceField}" does not match any field`);
    } else if (!LEGACY_SEQUENCE_FIELD_TYPES.has(sequenceField.type)) {
      fail(`${path}: sequenceField "${type.sequenceField}" must reference an integer, datetime or date field`);
    }
  }
}

/**
 * The version 1 entry of a valid legacy descriptor: one root property per field — nullable, with
 * date and datetime as formatted strings — except the sequence field, which is required and
 * non-nullable; ingested into bronze; the version number preserved. The platform writer migrates a
 * legacy definition to the identical entry (byte parity).
 */
function migrateLegacyObjectType(type, tableName) {
  const properties = {};
  for (const field of type.fields) {
    const format = LEGACY_FIELD_FORMATS[field.type];
    const baseType = format === undefined ? field.type : 'string';
    properties[field.name] = field.name === type.sequenceField
      ? { type: baseType, format }
      : { type: [baseType, 'null'], format };
  }
  return {
    tableName,
    definitionVersion: OBJECT_DEFINITION_VERSION,
    schema: sortedDeep({ type: 'object', properties, required: [type.sequenceField] }),
    sequenceField: type.sequenceField,
    listProjection: undefined,
    ingestToBronze: true,
    versionNumber: type.versionNumber ?? 0,
  };
}

function readObjectType(type, tableName, path) {
  for (const key of LEGACY_ONLY_KEYS) {
    if (type[key] !== undefined) {
      fail(`${path}: "${key}" is a legacy (definitionVersion 0) key — a definitionVersion ${OBJECT_DEFINITION_VERSION} descriptor declares its document shape in "schema"`);
    }
  }
  if (type.ingestToBronze !== undefined && typeof type.ingestToBronze !== 'boolean') {
    fail(`${path}: "ingestToBronze" must be a boolean (got ${JSON.stringify(type.ingestToBronze)})`);
  }
  const ingestToBronze = type.ingestToBronze === true;

  const schema = validateSchema(type.schema, path);
  const rootProperties = schema !== null && isPlainObject(schema.properties) ? schema.properties : {};
  const defs = schema !== null && isPlainObject(schema.$defs) ? schema.$defs : {};

  // The sequence value comes from a root property every document carries, typed as an integer or
  // an ISO8601 date-time/date string — resolved through `$ref` so a def may name the type.
  if (type.sequenceField) {
    const node = rootProperties[type.sequenceField];
    if (node === undefined) {
      fail(`${path}: sequenceField "${type.sequenceField}" must name a root property of the schema`);
    } else {
      if (!Array.isArray(schema.required) || !schema.required.includes(type.sequenceField)) {
        fail(`${path}: sequenceField "${type.sequenceField}" must be listed in the schema's root "required"`);
      }
      const resolved = resolveSchemaRef(node, defs);
      if (resolved === null || !isSequenceValueNode(resolved)) {
        fail(`${path}: sequenceField "${type.sequenceField}" must resolve to {"type":"integer"} or {"type":"string","format":"date-time"|"date"} (title and description aside)`);
      }
    }
  }

  if (type.listProjection !== undefined) {
    if (!Array.isArray(type.listProjection)) {
      fail(`${path}: "listProjection" must be an array of root property names`);
    } else {
      const seen = new Set();
      for (const name of type.listProjection) {
        if (typeof name !== 'string') {
          fail(`${path}: listProjection entries must be root property names (got ${JSON.stringify(name)})`);
          continue;
        }
        if (seen.has(name)) fail(`${path}: duplicate listProjection name "${name}"`);
        seen.add(name);
        if (!Object.hasOwn(rootProperties, name)) {
          fail(`${path}: listProjection name "${name}" must name a root property of the schema`);
        }
      }
    }
  }

  if (ingestToBronze && schema !== null) validateFlatSchema(schema, path);

  return {
    tableName,
    definitionVersion: OBJECT_DEFINITION_VERSION,
    schema: schema === null ? undefined : sortedDeep(schema),
    sequenceField: type.sequenceField,
    listProjection: listOrUndef(type.listProjection),
    // `ingestToBronze` and `versionNumber` are always emitted (false and 0 when the descriptor omits
    // them) — the platform writer emits both unconditionally, and one canonical form keeps byte parity.
    ingestToBronze,
    versionNumber: type.versionNumber ?? 0,
  };
}

/**
 * A bronze-ingested type's schema is flat: no `$defs` and no root map (so no `$ref` anywhere), and
 * every root property is a single primitive — optionally nullable — with a snake_case name, since
 * the root property list IS the bronze view's column list.
 */
function validateFlatSchema(schema, path) {
  const where = `${path}: ingestToBronze requires a flat schema`;
  if (schema.$defs !== undefined) fail(`${where} — the root declares "$defs"`);
  if (schema.additionalProperties !== undefined) fail(`${where} — the root declares "additionalProperties"`);
  if (!isPlainObject(schema.properties)) return;
  for (const [name, node] of Object.entries(schema.properties)) {
    if (!OBJECT_IDENTIFIER.test(name) || !isFlatPropertyNode(node)) {
      fail(`${where} — root property "${name}" must be a single primitive type (string, integer, number or boolean, optionally nullable) with a snake_case name`);
    }
  }
}

function isFlatPropertyNode(node) {
  if (!isPlainObject(node) || node.$ref !== undefined || node.type === undefined) return false;
  if (BRONZE_NESTING_KEYWORDS.some((keyword) => node[keyword] !== undefined)) return false;
  const types = (Array.isArray(node.type) ? node.type : [node.type]).filter((type) => type !== 'null');
  return types.length === 1 && BRONZE_PROPERTY_TYPES.has(types[0]);
}

/**
 * Walks a schema against the subset — keyword whitelist per node, the `type` vocabulary,
 * closed-by-default objects, the property-name rule, reserved root names, local `$ref`s into `$defs`,
 * the depth cap — reporting every problem through fail(). Returns the schema when it is an object,
 * null otherwise.
 */
function validateSchema(schema, path) {
  if (!isPlainObject(schema)) {
    fail(`${path}: "schema" must be an object (the root schema node)`);
    return null;
  }
  const where = `${path}: schema $`;
  if (schema.type !== 'object') fail(`${where}: root "type" must be "object"`);
  if (!isPlainObject(schema.properties) || Object.keys(schema.properties).length === 0) {
    fail(`${where}: root "properties" must be a non-empty object`);
  } else {
    for (const name of Object.keys(schema.properties)) {
      if (SCHEMA_RESERVED_ROOT_PROPERTY_NAMES.has(name)) {
        fail(`${where}: root property name "${name}" is reserved (a platform-emitted property)`);
      }
    }
  }
  if (schema.$defs !== undefined && !isPlainObject(schema.$defs)) {
    fail(`${where}.$defs: must be an object of name → schema node`);
  }
  const defs = isPlainObject(schema.$defs) ? schema.$defs : {};
  for (const name of Object.keys(defs)) {
    if (!SCHEMA_PROPERTY_NAME.test(name)) fail(`${where}.$defs: def name "${name}" must match ${SCHEMA_PROPERTY_NAME}`);
  }

  const context = { path, defs };
  walkSchemaNode(schema, '$', 0, true, context);
  // Each def is walked once, at its own site — a `$ref` never descends into its target, which is
  // what lets defs reference themselves and each other.
  for (const [name, def] of Object.entries(defs)) walkSchemaNode(def, `$.$defs.${name}`, 0, false, context);
  // A def that is itself a `$ref` leads to a concrete node.
  const reported = new Set();
  for (const [name, def] of Object.entries(defs)) {
    if (reported.has(name)) continue;
    const chain = [name];
    let current = def;
    while (isPlainObject(current) && typeof current.$ref === 'string') {
      const match = SCHEMA_REF.exec(current.$ref);
      if (match === null) break;
      if (chain.includes(match[1])) {
        fail(`${where}.$defs.${name}: the "$ref" chain ${chain.join(' → ')} → ${match[1]} must reach a concrete node`);
        for (const visited of chain) reported.add(visited);
        break;
      }
      chain.push(match[1]);
      current = defs[match[1]];
    }
  }
  return schema;
}

function walkSchemaNode(node, nodePath, depth, isRoot, context) {
  const where = `${context.path}: schema ${nodePath}`;
  if (!isPlainObject(node)) {
    fail(`${where}: must be a schema node (an object)`);
    return;
  }
  if (depth > SCHEMA_MAX_DEPTH) {
    fail(`${where}: nests deeper than ${SCHEMA_MAX_DEPTH} levels`);
    return;
  }
  const allowed = isRoot ? SCHEMA_ROOT_KEYWORDS : SCHEMA_NODE_KEYWORDS;
  for (const key of Object.keys(node)) {
    if (!allowed.has(key)) fail(`${where}: unsupported keyword "${key}" (the subset allows ${[...allowed].join(', ')})`);
  }
  for (const key of ['title', 'description']) {
    if (node[key] !== undefined && typeof node[key] !== 'string') fail(`${where}: "${key}" must be a string`);
  }

  if (node.$ref !== undefined) {
    const extra = Object.keys(node).filter((key) => allowed.has(key) && !SCHEMA_REF_NODE_KEYWORDS.has(key));
    if (extra.length > 0) {
      fail(`${where}: a "$ref" node carries only "title" and "description" besides the reference (found ${extra.map((key) => `"${key}"`).join(', ')})`);
    }
    const match = typeof node.$ref === 'string' ? SCHEMA_REF.exec(node.$ref) : null;
    if (match === null) {
      fail(`${where}: "$ref" must be a local reference "#/$defs/<Name>" (got ${JSON.stringify(node.$ref)})`);
    } else if (!Object.hasOwn(context.defs, match[1])) {
      fail(`${where}: "$ref" must name a declared def (there is no $defs entry "${match[1]}")`);
    }
    return;
  }

  const types = readSchemaTypes(node, where);
  if (node.type === undefined && node.enum === undefined) fail(`${where}: must declare "type", "enum" or "$ref"`);
  const isObject = types.has('object');
  const isArray = types.has('array');
  const child = (value, suffix) => walkSchemaNode(value, `${nodePath}.${suffix}`, depth + 1, false, context);

  if (node.properties !== undefined) {
    if (!isPlainObject(node.properties)) {
      fail(`${where}: "properties" must be an object of name → schema node`);
    } else {
      if (!isObject) fail(`${where}: "properties" requires "type" to include "object"`);
      for (const [name, value] of Object.entries(node.properties)) {
        if (!SCHEMA_PROPERTY_NAME.test(name)) fail(`${where}: property name "${name}" must match ${SCHEMA_PROPERTY_NAME}`);
        child(value, `properties.${name}`);
      }
    }
  }
  if (node.required !== undefined) {
    if (!Array.isArray(node.required)) {
      fail(`${where}: "required" must be an array of property names`);
    } else {
      if (!isObject) fail(`${where}: "required" requires "type" to include "object"`);
      const seen = new Set();
      for (const name of node.required) {
        if (typeof name !== 'string') {
          fail(`${where}: "required" entries must be property names (got ${JSON.stringify(name)})`);
          continue;
        }
        if (seen.has(name)) fail(`${where}: duplicate "required" entry "${name}"`);
        seen.add(name);
        if (!isPlainObject(node.properties) || !Object.hasOwn(node.properties, name)) {
          fail(`${where}: required property "${name}" must be declared in "properties"`);
        }
      }
    }
  }
  if (node.additionalProperties !== undefined) {
    if (!isObject) fail(`${where}: "additionalProperties" requires "type" to include "object"`);
    if (typeof node.additionalProperties !== 'boolean') child(node.additionalProperties, 'additionalProperties');
  }
  if (isObject && node.properties === undefined && node.additionalProperties === undefined) {
    fail(`${where}: an object node must declare the record's properties, a map via an "additionalProperties" schema, or "additionalProperties": true for an untyped object`);
  }

  if (node.items !== undefined) {
    if (!isArray) fail(`${where}: "items" requires "type" to include "array"`);
    child(node.items, 'items');
  }
  if (isArray && node.items === undefined) fail(`${where}: an array node must declare "items" (one schema node)`);

  if (node.enum !== undefined) {
    if (!Array.isArray(node.enum) || node.enum.length === 0) {
      fail(`${where}: "enum" must be a non-empty array of primitive values`);
    } else {
      const seen = new Set();
      for (const value of node.enum) {
        const primitive = value === null ? 'null' : typeof value;
        if (!SCHEMA_ENUM_PRIMITIVES.has(primitive)) {
          fail(`${where}: enum value ${JSON.stringify(value)} must be a primitive (null, string, number or boolean)`);
          continue;
        }
        const literal = JSON.stringify(value);
        if (seen.has(literal)) fail(`${where}: duplicate enum value ${literal}`);
        seen.add(literal);
        if (types.size > 0 && !enumValueMatchesTypes(value, primitive, types)) {
          fail(`${where}: enum value ${literal} must match the node's type (${[...types].join(' | ')})`);
        }
      }
    }
  }

  if (node.format !== undefined) {
    if (typeof node.format !== 'string') {
      fail(`${where}: "format" must be a string`);
    } else if (SCHEMA_VALIDATED_FORMATS.has(node.format) && !types.has('string')) {
      fail(`${where}: format "${node.format}" requires "type" to include "string"`);
    }
  }
}

/** The node's `type` as a set of vocabulary names (empty when absent), reporting invalid entries. */
function readSchemaTypes(node, where) {
  const types = new Set();
  if (node.type === undefined) return types;
  const list = Array.isArray(node.type) ? node.type : [node.type];
  if (list.length === 0) fail(`${where}: "type" array must be non-empty`);
  for (const value of list) {
    if (typeof value !== 'string' || !SCHEMA_TYPES.has(value)) {
      fail(`${where}: type ${JSON.stringify(value)} is not one of ${[...SCHEMA_TYPES].join(', ')}`);
      continue;
    }
    if (types.has(value)) fail(`${where}: duplicate type "${value}"`);
    types.add(value);
  }
  return types;
}

const enumValueMatchesTypes = (value, primitive, types) =>
  primitive === 'number'
    ? types.has('number') || (types.has('integer') && Number.isInteger(value))
    : types.has(primitive);

/** Follows `$ref`s through the defs (a visited set ends a cycle) to the concrete node, or null. */
function resolveSchemaRef(node, defs) {
  const visited = new Set();
  let current = node;
  while (isPlainObject(current) && typeof current.$ref === 'string') {
    const match = SCHEMA_REF.exec(current.$ref);
    if (match === null || visited.has(match[1])) return null;
    visited.add(match[1]);
    current = defs[match[1]];
  }
  return isPlainObject(current) ? current : null;
}

function isSequenceValueNode(node) {
  const { title, description, ...shape } = node;
  return SCHEMA_SEQUENCE_NODES.has(JSON.stringify(sortedDeep(shape)));
}

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
    for (const forbidden of ['baseQuery', 'liveQuery', 'drilldownQuery']) {
      if (kpi[forbidden] !== undefined) {
        fail(`${path}: "${forbidden}" must not be in the JSON descriptor (SQL lives in .sql files)`);
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
          widgetCode: readText(p(VIEWS_ROOT, viewDir, widgetDir, 'dist', 'index.js')) ?? undefined,
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
        viewCode: readText(p(VIEWS_ROOT, viewDir, 'dist', 'index.js')) ?? undefined,
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

  // ── object types (artifact order: by tableName = file name) ──
  const objectTypes = readObjectTypes(repoRoot);

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
    objectTypes,
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
    `${artifact.mappingConfig.portableTransformationSpecs.length} specs, ` +
    `${artifact.objectTypes.length} object types → ${join(outDir, 'pipeline-config.json')}`);
}
