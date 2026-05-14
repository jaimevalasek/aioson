'use strict';

// Sub-Task Scout — engine
//
// Pure module. No file/network I/O outside `loadConfig()` (single read of
// `.aioson/config/scout-engine.json` when present). All other functions
// operate on plain JS objects.
//
// Exports the contract layer wrapped by `aioson scout:prep|validate|commit`:
//   buildPrompt(input)    — standardized sub-agent prompt (Nautilus pattern)
//   validateInput(obj)    — `scout:prep` arg validation + cross-field rule
//   validateOutput(obj)   — scout report JSON validation
//   validateConfig(obj)   — `.aioson/config/scout-engine.json` validation
//   enforceCaps(state,a)  — per-session cap enforcement (mutates state)
//   generateScoutId(opts) — id format: scout-{slug?-}{ISO-date}-{rand6}
//   loadConfig(rootPath)  — defaults + optional override file (sole I/O op)
//   defaultConfig()       — frozen defaults clone (safe to mutate caller-side)
//
// See: requirements-deyvin-subtask-scout.md, plan-core-engine.md (ACs E1-E7).

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const {
  PARENT_AGENT_V1,
  SCHEMA_VERSION,
  INPUT_SCHEMA,
  OUTPUT_SCHEMA,
  CONFIG_SCHEMA,
  DEFAULT_CONFIG
} = require('./sub-task-schemas');

const CONFIG_FILE_REL = '.aioson/config/scout-engine.json';

// ---------------------------------------------------------------------------
// Recursive validator (hand-rolled, ~150 LOC budget)
// ---------------------------------------------------------------------------

function isPlainObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

function validateValue(value, node, pathStack) {
  const errs = [];
  const fieldPath = pathStack.length ? pathStack.join('.') : '<root>';

  // Type dispatch
  switch (node.type) {
    case 'string': {
      if (typeof value !== 'string') {
        errs.push({ field: fieldPath, reason: `expected string, got ${typeof value}` });
        break;
      }
      if (node.min != null && value.length < node.min) {
        errs.push({ field: fieldPath, reason: `length ${value.length} < min ${node.min}` });
      }
      if (node.max != null && value.length > node.max) {
        errs.push({ field: fieldPath, reason: `length ${value.length} > max ${node.max}` });
      }
      break;
    }
    case 'integer': {
      if (typeof value !== 'number' || !Number.isInteger(value)) {
        errs.push({ field: fieldPath, reason: `expected integer, got ${typeof value}` });
        break;
      }
      if (node.min != null && value < node.min) {
        errs.push({ field: fieldPath, reason: `value ${value} < min ${node.min}` });
      }
      if (node.max != null && value > node.max) {
        errs.push({ field: fieldPath, reason: `value ${value} > max ${node.max}` });
      }
      break;
    }
    case 'enum': {
      if (typeof value !== 'string' || !node.enum.includes(value)) {
        errs.push({ field: fieldPath, reason: `value ${JSON.stringify(value)} not in enum [${node.enum.join(', ')}]` });
      }
      break;
    }
    case 'array': {
      if (!Array.isArray(value)) {
        errs.push({ field: fieldPath, reason: `expected array, got ${typeof value}` });
        break;
      }
      if (node.items) {
        for (let i = 0; i < value.length; i++) {
          const childErrs = validateValue(value[i], node.items, [...pathStack, `[${i}]`]);
          for (const e of childErrs) errs.push(e);
        }
      }
      break;
    }
    case 'object': {
      if (!isPlainObject(value)) {
        errs.push({ field: fieldPath, reason: `expected object, got ${value === null ? 'null' : typeof value}` });
        break;
      }
      const props = node.properties || {};
      const allowedKeys = new Set(Object.keys(props));
      for (const [k, child] of Object.entries(props)) {
        if (k in value) {
          const childErrs = validateValue(value[k], child, [...pathStack, k]);
          for (const e of childErrs) errs.push(e);
        } else if (child.required) {
          errs.push({ field: pathStack.length ? `${fieldPath}.${k}` : k, reason: 'required' });
        }
      }
      if (node.additionalProperties === false) {
        for (const k of Object.keys(value)) {
          if (!allowedKeys.has(k)) {
            errs.push({ field: pathStack.length ? `${fieldPath}.${k}` : k, reason: 'unknown key' });
          }
        }
      }
      break;
    }
    default:
      errs.push({ field: fieldPath, reason: `unknown schema type "${node.type}"` });
  }
  return errs;
}

function runSchema(value, rootSchema) {
  const errors = validateValue(value, rootSchema, []);
  return { ok: errors.length === 0, errors };
}

// ---------------------------------------------------------------------------
// validateInput — schema + cross-field rule (BR-02 enforcement enters here)
// ---------------------------------------------------------------------------

function validateInput(obj) {
  const result = runSchema(obj, INPUT_SCHEMA);
  // Cross-field: at least one of scope_paths / scope_globs must be non-empty.
  if (isPlainObject(obj)) {
    const pathsEmpty = !Array.isArray(obj.scope_paths) || obj.scope_paths.length === 0;
    const globsEmpty = !Array.isArray(obj.scope_globs) || obj.scope_globs.length === 0;
    if (pathsEmpty && globsEmpty) {
      result.errors.push({
        field: 'scope',
        reason: 'at least one of scope_paths or scope_globs required'
      });
      result.ok = false;
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// validateOutput — full scout report schema check
// ---------------------------------------------------------------------------

function validateOutput(obj) {
  return runSchema(obj, OUTPUT_SCHEMA);
}

// ---------------------------------------------------------------------------
// validateConfig — strict (additionalProperties: false in CONFIG_SCHEMA)
// ---------------------------------------------------------------------------

function validateConfig(obj) {
  return runSchema(obj, CONFIG_SCHEMA);
}

// ---------------------------------------------------------------------------
// defaultConfig — frozen clone (caller may merge without mutating shared state)
// ---------------------------------------------------------------------------

function defaultConfig() {
  return { ...DEFAULT_CONFIG };
}

// ---------------------------------------------------------------------------
// loadConfig — sole I/O entry; merges file overrides on top of defaults.
// Missing file → defaults. Invalid file → throws structured error.
// ---------------------------------------------------------------------------

function loadConfig(rootPath) {
  const filePath = path.join(rootPath, CONFIG_FILE_REL);
  let raw;
  try {
    raw = fs.readFileSync(filePath, 'utf8');
  } catch (err) {
    if (err.code === 'ENOENT') return defaultConfig();
    const e = new Error(`scout-engine: cannot read config at ${filePath}: ${err.message}`);
    e.code = 'config_read_error';
    throw e;
  }
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    const e = new Error(`scout-engine: invalid JSON in ${filePath}: ${err.message}`);
    e.code = 'config_invalid';
    throw e;
  }
  const v = validateConfig(parsed);
  if (!v.ok) {
    const e = new Error(`scout-engine: config validation failed: ${v.errors.map((x) => `${x.field} ${x.reason}`).join('; ')}`);
    e.code = 'config_invalid';
    e.details = v.errors;
    throw e;
  }
  return { ...DEFAULT_CONFIG, ...parsed };
}

// ---------------------------------------------------------------------------
// generateScoutId — `scout-{slug-?}{YYYY-MM-DD}-{rand6}`
// ---------------------------------------------------------------------------

function generateScoutId(opts = {}) {
  const date = (opts.date instanceof Date ? opts.date : new Date()).toISOString().slice(0, 10);
  const rand = crypto.randomBytes(3).toString('hex');
  const slug = opts.feature_slug;
  if (slug && typeof slug === 'string' && slug.length > 0) {
    return `scout-${slug}-${date}-${rand}`;
  }
  return `scout-${date}-${rand}`;
}

// ---------------------------------------------------------------------------
// enforceCaps — pure state mutation. State shape:
//   { sessions: { [parent_session_id]: { scouts_in_session, retries_by_id } } }
//
// action shape (one of):
//   { kind: 'prep',     parent_session_id, scope_size, config }
//   { kind: 'commit',   parent_session_id }                     // decrements
//   { kind: 'validate', parent_session_id, scout_id, config }   // tracks retries
//
// Returns: { ok, error?: {code, message, details?}, state (same reference) }
// ---------------------------------------------------------------------------

function enforceCaps(state, action) {
  if (!isPlainObject(state)) {
    return capError('state_invalid', 'state must be an object', { got: typeof state });
  }
  if (!isPlainObject(state.sessions)) state.sessions = {};
  if (!isPlainObject(action)) {
    return capError('action_invalid', 'action must be an object', { got: typeof action });
  }
  const sid = action.parent_session_id;
  if (typeof sid !== 'string' || sid.length === 0) {
    return capError('action_invalid', 'action.parent_session_id required (string)');
  }
  const session = state.sessions[sid] || (state.sessions[sid] = {
    scouts_in_session: 0,
    started_at: new Date().toISOString(),
    last_prep_at: null,
    retries_by_id: {}
  });

  const config = action.config || DEFAULT_CONFIG;

  switch (action.kind) {
    case 'prep': {
      const size = Number.isInteger(action.scope_size) ? action.scope_size : 0;
      const filesCap = Number.isInteger(action.max_files_override)
        ? action.max_files_override
        : config.max_files_in_scope;
      if (size > filesCap) {
        return capError(
          'scope_too_large',
          `resolved scope ${size} exceeds limit ${filesCap}`,
          { resolved_count: size, limit: filesCap },
          state
        );
      }
      if (session.scouts_in_session >= config.max_scouts_per_session) {
        return capError(
          'cap_exceeded',
          `max_scouts_per_session=${config.max_scouts_per_session} reached for parent_session_id=${sid}`,
          { current: session.scouts_in_session, limit: config.max_scouts_per_session },
          state
        );
      }
      session.scouts_in_session += 1;
      session.last_prep_at = new Date().toISOString();
      return { ok: true, state };
    }
    case 'commit': {
      if (session.scouts_in_session > 0) session.scouts_in_session -= 1;
      return { ok: true, state };
    }
    case 'validate': {
      const id = action.scout_id;
      if (typeof id !== 'string' || id.length === 0) {
        return capError('action_invalid', 'action.scout_id required (string)');
      }
      const current = session.retries_by_id[id] || 0;
      const maxRetries = config.max_retries_on_malformed_json;
      if (current >= maxRetries) {
        // Already exhausted; report and do not increment further.
        return capError(
          'retry_exhausted',
          `scout ${id} exceeded max_retries_on_malformed_json=${maxRetries}`,
          { retries: current, limit: maxRetries },
          state
        );
      }
      session.retries_by_id[id] = current + 1;
      return { ok: true, state };
    }
    default:
      return capError('action_invalid', `unknown action.kind=${JSON.stringify(action.kind)}`);
  }
}

function capError(code, message, details, state) {
  const out = { ok: false, error: { code, message } };
  if (details) out.error.details = details;
  if (state) out.state = state;
  return out;
}

// ---------------------------------------------------------------------------
// buildPrompt — Nautilus-pattern sub-agent prompt. 8 sections enforced.
// ---------------------------------------------------------------------------

function buildPrompt(input, options = {}) {
  const v = validateInput(input);
  if (!v.ok) {
    const e = new Error(`buildPrompt: input validation failed: ${v.errors.map((x) => `${x.field} ${x.reason}`).join('; ')}`);
    e.code = 'input_invalid';
    e.details = v.errors;
    throw e;
  }
  const scopeList = formatScopeList(input);
  const outputSchemaSummary = formatOutputSchemaSummary();
  const outputPath = options && typeof options.expected_output_path === 'string' && options.expected_output_path.length > 0
    ? options.expected_output_path
    : '<output_path returned by aioson scout:prep>';

  return [
    'You are a sub-task scout for AIOSON. Your job is read-only investigation.',
    '',
    '## Question',
    input.question,
    '',
    '## Why this scout was dispatched (parent context)',
    input.parent_session_excerpt,
    '',
    '## Scope (files you may read)',
    scopeList,
    '',
    '## Hard constraints',
    '- Tools allowed: Read, Grep ONLY.',
    '- Tools forbidden: Bash, Edit, Write, NotebookEdit, any execution.',
    '- You may not request files outside the scope above.',
    '- You may not modify any file.',
    '- You must produce ONLY a single JSON object matching the output schema below. No prose outside the JSON.',
    '',
    '## Output schema',
    outputSchemaSummary,
    '',
    '## Output target',
    `Write the JSON to: ${outputPath}`,
    '',
    '## Required fields you must populate',
    '- parent_session_excerpt: copy verbatim from above (50-1000 chars)',
    '- recommendation: actionable, future-LLM-readable narrative (30-1000 chars)',
    '- findings[i].evidence: code/text quote, max 200 chars',
    '- findings[i].explanation: why this finding matters to the question (20-300 chars)',
    '- confidence: your honest self-assessment (low | medium | high)',
    '- files_inspected: every file you actually read (audit trail)',
    '',
    '## What success looks like',
    'A future agent in cold-load reading this scout report should reconstruct WHY it was dispatched and WHAT to do next, without needing the parent agent\'s chat history.'
  ].join('\n');
}

function formatScopeList(input) {
  const lines = [];
  if (Array.isArray(input.scope_paths) && input.scope_paths.length > 0) {
    lines.push('### Explicit paths');
    for (const p of input.scope_paths) lines.push(`- ${p}`);
  }
  if (Array.isArray(input.scope_globs) && input.scope_globs.length > 0) {
    lines.push('### Globs (resolve relative to project root)');
    for (const g of input.scope_globs) lines.push(`- ${g}`);
  }
  if (Array.isArray(input.scope_exclude) && input.scope_exclude.length > 0) {
    lines.push('### Exclude');
    for (const x of input.scope_exclude) lines.push(`- ${x}`);
  }
  return lines.length === 0 ? '(empty — should not occur, validateInput would have rejected)' : lines.join('\n');
}

function formatOutputSchemaSummary() {
  return [
    `schema_version (=${SCHEMA_VERSION}), id, parent_agent (one of: ${PARENT_AGENT_V1.join(', ')}),`,
    'parent_session_id, parent_session_excerpt (50-1000 chars), feature_slug?,',
    'question (10-500 chars), scope { paths[], globs[], exclude[], files_resolved[] },',
    'completed_at (ISO 8601), status (success|partial|no_findings|error),',
    'confidence (low|medium|high), recommendation (30-1000 chars),',
    'findings[] (each: file, line, evidence ≤200 chars, relevance, explanation 20-300 chars),',
    'files_inspected[], next_scout_suggested?, errors?'
  ].join('\n');
}

module.exports = {
  buildPrompt,
  validateInput,
  validateOutput,
  validateConfig,
  enforceCaps,
  generateScoutId,
  loadConfig,
  defaultConfig,
  // Exposed for tests & sibling modules
  CONFIG_FILE_REL,
  PARENT_AGENT_V1,
  SCHEMA_VERSION
};
