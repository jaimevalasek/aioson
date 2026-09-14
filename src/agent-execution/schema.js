'use strict';

const path = require('node:path');

const HOSTS = ['claude', 'codex', 'opencode', 'kimi', 'qwen', 'antigravity'];
const MODES = ['fresh-session', 'subagent', 'external', 'current-session'];
const AGENTS = ['dev', 'qa', 'tester', 'pentester', 'validator'];
const REASONING_EFFORTS = ['low', 'medium', 'high', 'xhigh', 'max', 'ultra'];
// Effort vocabulary is per host, not one shared list: `ultra` is codex
// vocabulary and the claude CLI rejects it — a shared list let an
// `--effort=ultra` claude lane pass every static check and fail at dispatch.
const HOST_REASONING_EFFORTS = {
  claude: REASONING_EFFORTS.filter((effort) => effort !== 'ultra'),
  antigravity: ['low', 'medium', 'high']
};
function effortsForHost(host) {
  return HOST_REASONING_EFFORTS[String(host || '').toLowerCase()] || REASONING_EFFORTS;
}
const FALLBACK_REASONS = ['capacity', 'unavailable'];
const MAX_MODEL_NAME_LENGTH = 200;
const MAX_DEVELOPMENT_LANES = 8;
const MANIFEST_VERSIONS = [1, 2];
const ORCHESTRATION_MODES = ['inherit', 'autopilot', 'step_by_step'];
const CHAIN_WORK_KINDS = ['inspect', 'fix', 'test', 'security', 'documentation'];
const CHAIN_WORK_OWNERS = ['dev', 'tester', 'pentester'];
const ROOT_KEYS = [
  'version',
  'feature',
  'host',
  'generated_at',
  'agents',
  'development_lanes',
  'capacity_policy',
  'cycle_limits',
  'reporting',
  'orchestration',
  'chain_work_policy'
];
const AGENT_KEYS = ['enabled', 'host', 'mode', 'model', 'reasoning_effort', 'writable_roots', 'fallbacks', 'report'];
// `qa` (optional, additive): the lane's own reviewer for the orchestrated path —
// a second process/model that reviews and tests the lane's units and may apply
// bounded fixes (`max_fix_files`). Absent → the lane has no lane-level QA and
// the feature's single @qa verdict stays the only review, exactly as today.
const LANE_KEYS = [...AGENT_KEYS, 'prompt', 'write_paths', 'qa'];
const LANE_QA_KEYS = ['host', 'model', 'reasoning_effort', 'report', 'fallbacks', 'max_fix_files', 'max_rework_rounds'];
const MAX_QA_FIX_FILES = 20;
// `max_rework_rounds` (optional, 0–3, default 0): a failed lane review sends the
// unit back to its implementer with the findings, up to this many times, before
// the failure becomes a finding for the integration owner. Opt-in: every round
// is a full dev + qa process.
const MAX_QA_REWORK_ROUNDS = 3;
// `orchestration.execution` (optional, additive): `single` (default — DEV
// implements everything in the session) or `orchestrated` (compiled lanes run
// as parallel external processes via `execution:run`; DEV integrates).
const EXECUTION_MODES = ['single', 'orchestrated'];
const SECRET_KEY = /token|secret|password|authorization|api[_-]?key/i;
const SAFE_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function isPlainObject(value) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function isSafeRelativePath(value) {
  if (typeof value !== 'string' || !value.trim()) return false;
  if (/^(?:[A-Za-z]:[\\/]|[\\/]{1,2})/.test(value)) return false;
  return !value.split(/[\\/]+/).includes('..');
}

function isSafeWritablePath(value) {
  if (typeof value !== 'string' || !value.trim()) return false;
  if (value.split(/[\\/]+/).includes('..')) return false;
  return isSafeRelativePath(value) || path.isAbsolute(value);
}

function validateFallbacks(fallbacks, basePath, add) {
  if (!Array.isArray(fallbacks)) {
    add(basePath, 'must be an array');
    return;
  }
  fallbacks.forEach((fallback, index) => {
    const current = `${basePath}[${index}]`;
    if (!isPlainObject(fallback)) {
      add(current, 'must be {host, model, on?}');
      return;
    }
    for (const key of Object.keys(fallback)) {
      if (!['host', 'model', 'on'].includes(key)) add(`${current}.${key}`, 'unknown field');
    }
    if (!HOSTS.includes(fallback.host)) add(`${current}.host`, `must be one of ${HOSTS.join(', ')}`);
    if (typeof fallback.model !== 'string' || !fallback.model.trim()) {
      add(`${current}.model`, 'must be a non-empty model id');
    } else if (fallback.model.length > MAX_MODEL_NAME_LENGTH) {
      add(`${current}.model`, `must be at most ${MAX_MODEL_NAME_LENGTH} characters`);
    }
    if (fallback.on !== undefined) {
      if (!Array.isArray(fallback.on) || fallback.on.length === 0) {
        add(`${current}.on`, 'must be a non-empty array');
      } else {
        if (new Set(fallback.on).size !== fallback.on.length) add(`${current}.on`, 'must not contain duplicates');
        fallback.on.forEach((reason, reasonIndex) => {
          if (!FALLBACK_REASONS.includes(reason)) {
            add(`${current}.on[${reasonIndex}]`, `must be one of ${FALLBACK_REASONS.join(', ')}`);
          }
        });
      }
    }
  });
}

function validateLaneQa(qa, basePath, add) {
  if (!isPlainObject(qa)) {
    add(basePath, 'must be an object');
    return;
  }
  for (const key of Object.keys(qa)) {
    if (!LANE_QA_KEYS.includes(key)) {
      add(`${basePath}.${key}`, SECRET_KEY.test(key)
        ? 'secret fields are forbidden; use environment configuration'
        : 'unknown field');
    }
  }
  if (!HOSTS.includes(qa.host)) add(`${basePath}.host`, `must be one of ${HOSTS.join(', ')}`);
  if (typeof qa.model !== 'string' || !qa.model.trim()) {
    add(`${basePath}.model`, 'must be a non-empty model id');
  } else if (qa.model.length > MAX_MODEL_NAME_LENGTH) {
    add(`${basePath}.model`, `must be at most ${MAX_MODEL_NAME_LENGTH} characters`);
  }
  if (qa.reasoning_effort !== undefined && !REASONING_EFFORTS.includes(qa.reasoning_effort)) {
    add(`${basePath}.reasoning_effort`, `must be one of ${REASONING_EFFORTS.join(', ')}`);
  }
  if (typeof qa.report !== 'string' || !qa.report.includes('{run_id}')) {
    add(`${basePath}.report`, 'must include {run_id}');
  }
  if (qa.fallbacks !== undefined) validateFallbacks(qa.fallbacks, `${basePath}.fallbacks`, add);
  if (qa.max_fix_files !== undefined
    && (!Number.isInteger(qa.max_fix_files) || qa.max_fix_files < 0 || qa.max_fix_files > MAX_QA_FIX_FILES)) {
    add(`${basePath}.max_fix_files`, `must be an integer between 0 and ${MAX_QA_FIX_FILES}`);
  }
  if (qa.max_rework_rounds !== undefined
    && (!Number.isInteger(qa.max_rework_rounds) || qa.max_rework_rounds < 0 || qa.max_rework_rounds > MAX_QA_REWORK_ROUNDS)) {
    add(`${basePath}.max_rework_rounds`, `must be an integer between 0 and ${MAX_QA_REWORK_ROUNDS}`);
  }
}

function validateExecutionEntry(entry, basePath, add, { lane = false } = {}) {
  if (!isPlainObject(entry)) {
    add(basePath, 'is required');
    return;
  }
  const allowed = lane ? LANE_KEYS : AGENT_KEYS;
  for (const key of Object.keys(entry)) {
    if (!allowed.includes(key)) {
      add(`${basePath}.${key}`, SECRET_KEY.test(key)
        ? 'secret fields are forbidden; use environment configuration'
        : 'unknown field');
    }
  }
  if (typeof entry.enabled !== 'boolean') add(`${basePath}.enabled`, 'must be boolean');
  if (!HOSTS.includes(entry.host)) add(`${basePath}.host`, `must be one of ${HOSTS.join(', ')}`);
  if (!MODES.includes(entry.mode)) add(`${basePath}.mode`, `must be one of ${MODES.join(', ')}`);
  if (typeof entry.model !== 'string' || !entry.model.trim()) {
    add(`${basePath}.model`, 'must be a non-empty model id');
  } else if (entry.model.length > MAX_MODEL_NAME_LENGTH) {
    add(`${basePath}.model`, `must be at most ${MAX_MODEL_NAME_LENGTH} characters`);
  }
  if (entry.reasoning_effort !== undefined && !REASONING_EFFORTS.includes(entry.reasoning_effort)) {
    add(`${basePath}.reasoning_effort`, `must be one of ${REASONING_EFFORTS.join(', ')}`);
  }
  if (!Array.isArray(entry.writable_roots)) {
    add(`${basePath}.writable_roots`, 'must be an array');
  } else {
    entry.writable_roots.forEach((root, index) => {
      if (!isSafeWritablePath(root)) {
        add(`${basePath}.writable_roots[${index}]`, 'must be a non-empty path without traversal');
      }
    });
  }
  validateFallbacks(entry.fallbacks, `${basePath}.fallbacks`, add);
  if (typeof entry.report !== 'string' || !entry.report.includes('{run_id}')) {
    add(`${basePath}.report`, 'must include {run_id}');
  }

  if (lane) {
    if (!isSafeRelativePath(entry.prompt)) add(`${basePath}.prompt`, 'must be a project-relative path without traversal');
    if (!Array.isArray(entry.write_paths)) {
      add(`${basePath}.write_paths`, 'must be an array');
    } else {
      entry.write_paths.forEach((writePath, index) => {
        if (!isSafeRelativePath(writePath)) {
          add(`${basePath}.write_paths[${index}]`, 'must be a project-relative path or glob without traversal');
        }
      });
      if (entry.enabled && entry.write_paths.length === 0) {
        add(`${basePath}.write_paths`, 'must declare at least one path when the lane is enabled');
      }
    }
    if (entry.qa !== undefined) validateLaneQa(entry.qa, `${basePath}.qa`, add);
  }
}

function validateDevelopmentLanes(value, add) {
  if (value === undefined) return;
  if (!isPlainObject(value)) {
    add('$.development_lanes', 'must be an object');
    return;
  }
  for (const key of Object.keys(value)) {
    if (!['strategy', 'integration_owner', 'lanes'].includes(key)) add(`$.development_lanes.${key}`, 'unknown field');
  }
  if (!['single', 'split'].includes(value.strategy)) add('$.development_lanes.strategy', 'must be single or split');
  if (value.integration_owner !== 'dev') add('$.development_lanes.integration_owner', 'must equal dev');
  if (!isPlainObject(value.lanes)) {
    add('$.development_lanes.lanes', 'must be an object');
    return;
  }
  const laneIds = Object.keys(value.lanes);
  if (laneIds.length > MAX_DEVELOPMENT_LANES) {
    add('$.development_lanes.lanes', `must contain at most ${MAX_DEVELOPMENT_LANES} lanes`);
  }
  for (const laneId of laneIds) {
    if (!SAFE_ID.test(laneId)) add(`$.development_lanes.lanes.${laneId}`, 'lane id must be kebab-case');
    validateExecutionEntry(value.lanes[laneId], `$.development_lanes.lanes.${laneId}`, add, { lane: true });
  }
  if (value.strategy === 'split' && !laneIds.some((laneId) => value.lanes[laneId]?.enabled === true)) {
    add('$.development_lanes.lanes', 'split strategy requires at least one enabled lane');
  }
}

function validateOrchestration(value, add) {
  if (value === undefined) return;
  if (!isPlainObject(value)) {
    add('$.orchestration', 'must be an object');
    return;
  }
  for (const key of Object.keys(value)) {
    if (!['mode', 'max_checkpoints', 'stop_conditions', 'execution'].includes(key)) {
      add(`$.orchestration.${key}`, 'unknown field');
    }
  }
  if (!ORCHESTRATION_MODES.includes(value.mode)) {
    add('$.orchestration.mode', `must be one of ${ORCHESTRATION_MODES.join(', ')}`);
  }
  if (value.execution !== undefined && !EXECUTION_MODES.includes(value.execution)) {
    add('$.orchestration.execution', `must be one of ${EXECUTION_MODES.join(', ')}`);
  }
  if (!Number.isInteger(value.max_checkpoints) || value.max_checkpoints < 1 || value.max_checkpoints > 50) {
    add('$.orchestration.max_checkpoints', 'must be an integer between 1 and 50');
  }
  if (!Array.isArray(value.stop_conditions) || value.stop_conditions.length === 0) {
    add('$.orchestration.stop_conditions', 'must be a non-empty array');
  } else {
    value.stop_conditions.forEach((condition, index) => {
      if (typeof condition !== 'string' || !/^[a-z][a-z0-9_]*$/.test(condition)) {
        add(`$.orchestration.stop_conditions[${index}]`, 'must be a snake_case identifier');
      }
    });
  }
}

function validateChainWorkPolicy(value, add) {
  if (value === undefined) return;
  if (!isPlainObject(value)) {
    add('$.chain_work_policy', 'must be an object');
    return;
  }
  const allowed = [
    'enabled',
    'fallback_owner',
    'require_enabled_owner',
    'qa_revalidation',
    'block_handoff_on_actionable',
    'owner_by_kind'
  ];
  for (const key of Object.keys(value)) {
    if (!allowed.includes(key)) add(`$.chain_work_policy.${key}`, 'unknown field');
  }
  for (const key of ['enabled', 'require_enabled_owner', 'qa_revalidation', 'block_handoff_on_actionable']) {
    if (typeof value[key] !== 'boolean') add(`$.chain_work_policy.${key}`, 'must be boolean');
  }
  if (!CHAIN_WORK_OWNERS.includes(value.fallback_owner)) {
    add('$.chain_work_policy.fallback_owner', `must be one of ${CHAIN_WORK_OWNERS.join(', ')}`);
  }
  if (!isPlainObject(value.owner_by_kind)) {
    add('$.chain_work_policy.owner_by_kind', 'must be an object');
    return;
  }
  for (const [kind, owner] of Object.entries(value.owner_by_kind)) {
    if (!CHAIN_WORK_KINDS.includes(kind)) add(`$.chain_work_policy.owner_by_kind.${kind}`, 'unknown work kind');
    if (!CHAIN_WORK_OWNERS.includes(owner)) {
      add(`$.chain_work_policy.owner_by_kind.${kind}`, `must be one of ${CHAIN_WORK_OWNERS.join(', ')}`);
    }
  }
  for (const kind of CHAIN_WORK_KINDS) {
    if (!Object.hasOwn(value.owner_by_kind, kind)) {
      add(`$.chain_work_policy.owner_by_kind.${kind}`, 'is required');
    }
  }
}

function validateManifest(value, expectedFeature) {
  const errors = [];
  const add = (errorPath, message) => errors.push({ path: errorPath, message });
  if (!isPlainObject(value)) return { ok: false, errors: [{ path: '$', message: 'must be an object' }] };

  const scanSecrets = (node, current = '$') => {
    if (!isPlainObject(node) && !Array.isArray(node)) return;
    for (const [key, child] of Object.entries(node)) {
      if (SECRET_KEY.test(key)) add(`${current}.${key}`, 'secret fields are forbidden; use environment configuration');
      scanSecrets(child, `${current}.${key}`);
    }
  };
  scanSecrets(value);

  for (const key of Object.keys(value)) {
    if (!ROOT_KEYS.includes(key)) add(`$.${key}`, SECRET_KEY.test(key)
      ? 'secret fields are forbidden; use environment configuration'
      : 'unknown field');
  }
  if (!MANIFEST_VERSIONS.includes(value.version)) add('$.version', `must be one of ${MANIFEST_VERSIONS.join(', ')}`);
  if (!SAFE_ID.test(value.feature || '')) add('$.feature', 'must be a kebab-case slug');
  if (expectedFeature && value.feature !== expectedFeature) add('$.feature', `must equal ${expectedFeature}`);
  if (!HOSTS.includes(value.host)) add('$.host', `must be one of ${HOSTS.join(', ')}`);

  if (!isPlainObject(value.agents)) {
    add('$.agents', 'must be an object');
  } else {
    for (const key of Object.keys(value.agents)) {
      if (!AGENTS.includes(key)) add(`$.agents.${key}`, 'unknown agent');
    }
  }
  for (const id of AGENTS) validateExecutionEntry(value.agents?.[id], `$.agents.${id}`, add);
  validateDevelopmentLanes(value.development_lanes, add);
  validateOrchestration(value.orchestration, add);
  validateChainWorkPolicy(value.chain_work_policy, add);

  const limits = value.cycle_limits;
  if (!isPlainObject(limits)) {
    add('$.cycle_limits', 'is required');
  } else {
    for (const [key, number] of Object.entries(limits)) {
      if (!Number.isInteger(number) || number < 0) add(`$.cycle_limits.${key}`, 'must be a non-negative integer');
    }
  }

  if (!isPlainObject(value.capacity_policy)
    || !['pause', 'retry', 'wait', 'fallback'].includes(value.capacity_policy.strategy)) {
    add('$.capacity_policy.strategy', 'must be pause, retry, wait, or fallback');
  } else {
    for (const key of Object.keys(value.capacity_policy)) {
      if (!['strategy', 'max_attempts', 'backoff_ms', 'allow_cross_host'].includes(key)) {
        add(`$.capacity_policy.${key}`, 'unknown field');
      }
    }
    if (!Number.isInteger(value.capacity_policy.max_attempts) || value.capacity_policy.max_attempts < 1) {
      add('$.capacity_policy.max_attempts', 'must be a positive integer');
    }
    if (!Number.isInteger(value.capacity_policy.backoff_ms) || value.capacity_policy.backoff_ms < 0) {
      add('$.capacity_policy.backoff_ms', 'must be a non-negative integer');
    }
    if (value.capacity_policy.allow_cross_host !== undefined
      && typeof value.capacity_policy.allow_cross_host !== 'boolean') {
      add('$.capacity_policy.allow_cross_host', 'must be boolean');
    }
  }

  if (!isPlainObject(value.reporting)) {
    add('$.reporting', 'is required');
  } else {
    for (const key of Object.keys(value.reporting)) {
      if (!['format', 'markdown'].includes(key)) add(`$.reporting.${key}`, 'unknown field');
    }
  }
  return { ok: errors.length === 0, errors };
}

module.exports = {
  AGENTS,
  EXECUTION_MODES,
  FALLBACK_REASONS,
  HOSTS,
  effortsForHost,
  LANE_QA_KEYS,
  MAX_QA_FIX_FILES,
  MAX_DEVELOPMENT_LANES,
  MAX_MODEL_NAME_LENGTH,
  MANIFEST_VERSIONS,
  MODES,
  ORCHESTRATION_MODES,
  CHAIN_WORK_KINDS,
  CHAIN_WORK_OWNERS,
  REASONING_EFFORTS,
  validateManifest
};
