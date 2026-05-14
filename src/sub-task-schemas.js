'use strict';

// Sub-Task Scout — schemas
//
// Plain-JS schemas (no external lib) consumed by the hand-rolled validator
// in `src/sub-task-engine.js`. Three shapes:
//
//   INPUT_SCHEMA  — `aioson scout:prep` arguments (transient, never persisted)
//   OUTPUT_SCHEMA — scout report JSON (persisted at .aioson/runtime/scouts/{id}.json)
//   CONFIG_SCHEMA — `.aioson/config/scout-engine.json` overrides (all optional)
//
// Schema-node grammar (recursive):
//   { type: 'string'|'integer'|'array'|'object'|'enum',
//     required?: boolean,                 // applies inside an object's properties
//     enum?: string[],                    // when type === 'enum'
//     min?: number, max?: number,         // string length OR integer range
//     items?: <schema-node>,              // when type === 'array'
//     properties?: { [key]: <schema-node> }, // when type === 'object'
//     additionalProperties?: boolean }    // strict (default true; set false to reject unknown keys)
//
// V1 parent_agent whitelist is `['deyvin']` only. Engine accepts the param so
// future multi-agent expansion is a config flip, not a refactor.

const PARENT_AGENT_V1 = ['deyvin'];
const STATUS_ENUM = ['success', 'partial', 'no_findings', 'error'];
const CONFIDENCE_ENUM = ['low', 'medium', 'high'];
const RELEVANCE_ENUM = ['low', 'medium', 'high'];
const SCHEMA_VERSION = 1;

const SCOPE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    paths: { type: 'array', items: { type: 'string', min: 1, max: 500 } },
    globs: { type: 'array', items: { type: 'string', min: 1, max: 500 } },
    exclude: { type: 'array', items: { type: 'string', min: 1, max: 500 } },
    files_resolved: { type: 'array', items: { type: 'string', min: 1, max: 500 } }
  }
};

const FINDING_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    file: { type: 'string', required: true, min: 1, max: 500 },
    line: { type: 'integer', required: true, min: 1, max: 10_000_000 },
    evidence: { type: 'string', required: true, min: 1, max: 200 },
    relevance: { type: 'enum', required: true, enum: RELEVANCE_ENUM },
    explanation: { type: 'string', required: true, min: 20, max: 300 }
  }
};

const NEXT_SCOUT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    question: { type: 'string', required: true, min: 10, max: 500 },
    scope: SCOPE_SCHEMA
  }
};

const ERROR_ENTRY_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    type: { type: 'string', required: true, min: 1, max: 100 },
    message: { type: 'string', required: true, min: 1, max: 1000 }
  }
};

const OUTPUT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    schema_version: { type: 'integer', required: true, min: 1, max: 1 }, // const 1 in V1
    id: { type: 'string', required: true, min: 1, max: 200 },
    parent_agent: { type: 'enum', required: true, enum: PARENT_AGENT_V1 },
    parent_session_id: { type: 'string', required: true, min: 1, max: 500 },
    parent_session_excerpt: { type: 'string', required: true, min: 50, max: 1000 },
    feature_slug: { type: 'string', required: false, min: 1, max: 200 },
    question: { type: 'string', required: true, min: 10, max: 500 },
    scope: { ...SCOPE_SCHEMA, required: true },
    completed_at: { type: 'string', required: true, min: 20, max: 40 }, // ISO 8601
    status: { type: 'enum', required: true, enum: STATUS_ENUM },
    confidence: { type: 'enum', required: true, enum: CONFIDENCE_ENUM },
    recommendation: { type: 'string', required: true, min: 30, max: 1000 },
    findings: { type: 'array', required: true, items: FINDING_SCHEMA },
    files_inspected: { type: 'array', required: true, items: { type: 'string', min: 1, max: 500 } },
    next_scout_suggested: { type: 'object', required: false, ...NEXT_SCOUT_SCHEMA },
    errors: { type: 'array', required: false, items: ERROR_ENTRY_SCHEMA }
  }
};

const INPUT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    question: { type: 'string', required: true, min: 10, max: 500 },
    scope_paths: { type: 'array', required: false, items: { type: 'string', min: 1, max: 500 } },
    scope_globs: { type: 'array', required: false, items: { type: 'string', min: 1, max: 500 } },
    scope_exclude: { type: 'array', required: false, items: { type: 'string', min: 1, max: 500 } },
    parent_agent: { type: 'enum', required: true, enum: PARENT_AGENT_V1 },
    parent_session_id: { type: 'string', required: true, min: 1, max: 500 },
    parent_session_excerpt: { type: 'string', required: true, min: 50, max: 1000 },
    feature_slug: { type: 'string', required: false, min: 1, max: 200 },
    max_files_in_scope_override: { type: 'integer', required: false, min: 1, max: 200 }
  }
};
// `scope_paths` OR `scope_globs` required — enforced as a cross-field rule
// in `validateInput()`, not via schema (no oneOf in this minimal grammar).

const CONFIG_SCHEMA = {
  type: 'object',
  additionalProperties: false, // strict: unknown keys rejected (BR-11)
  properties: {
    max_scouts_per_session: { type: 'integer', required: false, min: 1, max: 100 },
    max_files_in_scope: { type: 'integer', required: false, min: 1, max: 500 },
    max_retries_on_malformed_json: { type: 'integer', required: false, min: 0, max: 5 },
    max_depth: { type: 'integer', required: false, min: 1, max: 5 },
    scout_dir: { type: 'string', required: false, min: 1, max: 500 },
    archive_root: { type: 'string', required: false, min: 1, max: 500 },
    prune_unattached_after_days: { type: 'integer', required: false, min: 7, max: 365 },
    slow_completion_warn_seconds: { type: 'integer', required: false, min: 10, max: 3600 }
  }
};

const DEFAULT_CONFIG = Object.freeze({
  max_scouts_per_session: 3,
  max_files_in_scope: 20,
  max_retries_on_malformed_json: 1,
  max_depth: 2,
  scout_dir: '.aioson/runtime/scouts',
  archive_root: '.aioson/context/features',
  prune_unattached_after_days: 90,
  slow_completion_warn_seconds: 300
});

module.exports = {
  PARENT_AGENT_V1,
  STATUS_ENUM,
  CONFIDENCE_ENUM,
  RELEVANCE_ENUM,
  SCHEMA_VERSION,
  INPUT_SCHEMA,
  OUTPUT_SCHEMA,
  CONFIG_SCHEMA,
  DEFAULT_CONFIG,
  SCOPE_SCHEMA,
  FINDING_SCHEMA
};
