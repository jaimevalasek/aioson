'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { AGENTS, validateManifest } = require('./schema');
const { capabilities } = require('./capabilities');
const { loadModelCatalog } = require('./model-catalog');
const { resolveModel, validateReasoningEffort } = require('./model-resolver');
const { validateFeatureSlug } = require('../verification/path-policy');

function assertFeatureSlug(feature) {
  const validation = validateFeatureSlug(feature);
  if (!validation.ok) {
    const error = new TypeError(`Invalid agent execution feature slug: ${JSON.stringify(feature)}`);
    error.code = validation.reason;
    throw error;
  }
  return validation.feature_slug;
}

function manifestPath(projectDir, feature) {
  const safeFeature = assertFeatureSlug(feature);
  return path.join(projectDir, '.aioson', 'context', `agent-execution-${safeFeature}.json`);
}

function executionEntry(feature, id, host, { enabled = true, lane = false } = {}) {
  return {
    enabled,
    host,
    mode: 'external',
    model: 'configured-default',
    ...(host === 'codex' ? { reasoning_effort: 'medium' } : {}),
    writable_roots: [],
    ...(lane
      ? {
          prompt: `.aioson/context/execution-prompts/${feature}/${id}.md`,
          write_paths: []
        }
      : {}),
    fallbacks: [],
    report: `.aioson/context/reports/${feature}/{run_id}/${lane ? `dev-${id}` : id}.json`
  };
}

function defaults(feature, host = 'codex', { cycleLimits } = {}) {
  feature = assertFeatureSlug(feature);
  const agents = {};
  for (const id of AGENTS) {
    agents[id] = executionEntry(feature, id, host, {
      enabled: id === 'dev' || id === 'qa'
    });
  }
  return {
    version: 2,
    feature,
    host,
    generated_at: new Date().toISOString(),
    agents,
    development_lanes: {
      strategy: 'single',
      integration_owner: 'dev',
      lanes: {
        backend: executionEntry(feature, 'backend', host, { enabled: false, lane: true }),
        frontend: executionEntry(feature, 'frontend', host, { enabled: false, lane: true })
      }
    },
    capacity_policy: { strategy: 'pause', max_attempts: 1, backoff_ms: 0 },
    cycle_limits: { dev_qa: 1, tester: 1, pentester: 1, ...cycleLimits },
    orchestration: {
      mode: 'autopilot',
      max_checkpoints: 10,
      stop_conditions: [
        'workflow_complete',
        'human_decision_required',
        'gate_blocked',
        'cycle_limit_reached',
        'capacity_unavailable',
        'feature_close_human_gate'
      ]
    },
    chain_work_policy: {
      enabled: true,
      fallback_owner: 'dev',
      require_enabled_owner: true,
      qa_revalidation: true,
      block_handoff_on_actionable: true,
      owner_by_kind: {
        inspect: 'dev',
        fix: 'dev',
        test: 'tester',
        security: 'pentester',
        documentation: 'dev'
      }
    },
    reporting: { format: 'json', markdown: true }
  };
}

/**
 * `orchestration.execution` — `single` (default; absent on every manifest that
 * predates the field) or `orchestrated` (set by `execution:compile`).
 */
function resolveExecutionMode(manifest) {
  const value = manifest && manifest.orchestration && manifest.orchestration.execution;
  return value === 'orchestrated' ? 'orchestrated' : 'single';
}

/** Validate then atomically rewrite the manifest (tmp + rename). */
async function writeManifest(projectDir, feature, manifest) {
  const file = manifestPath(projectDir, feature);
  const validation = validateManifest(manifest, feature);
  if (!validation.ok) {
    const error = new Error('agent execution manifest invalid');
    error.code = 'manifest_invalid';
    error.errors = validation.errors;
    throw error;
  }
  await fs.mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.${crypto.randomUUID()}.tmp`;
  await fs.writeFile(tmp, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  await fs.rename(tmp, file);
  return { path: file, digest: digest(manifest) };
}

function resolveOrchestrationPolicy(manifest) {
  const value = manifest && manifest.orchestration;
  return {
    mode: value && ['inherit', 'autopilot', 'step_by_step'].includes(value.mode) ? value.mode : 'inherit',
    max_checkpoints: Number.isInteger(value?.max_checkpoints) && value.max_checkpoints > 0
      ? value.max_checkpoints
      : 10,
    stop_conditions: Array.isArray(value?.stop_conditions) ? [...value.stop_conditions] : []
  };
}

function resolveChainWorkPolicy(manifest) {
  const value = manifest && manifest.chain_work_policy;
  const fallback = 'dev';
  const ownerByKind = {
    inspect: 'dev',
    fix: 'dev',
    test: 'dev',
    security: 'dev',
    documentation: 'dev',
    ...(value && value.owner_by_kind)
  };
  const enabledAgents = manifest && manifest.agents ? manifest.agents : {};
  const requireEnabled = value ? value.require_enabled_owner !== false : true;
  let fallbackOwner = value && typeof value.fallback_owner === 'string' ? value.fallback_owner : fallback;
  if (requireEnabled && Object.keys(enabledAgents).length > 0 && enabledAgents[fallbackOwner]?.enabled !== true) {
    fallbackOwner = enabledAgents.dev?.enabled === true ? 'dev' : fallbackOwner;
  }

  for (const [kind, owner] of Object.entries(ownerByKind)) {
    if (requireEnabled && enabledAgents[owner]?.enabled !== true) ownerByKind[kind] = fallbackOwner;
  }

  return {
    enabled: value ? value.enabled !== false : true,
    fallback_owner: fallbackOwner,
    require_enabled_owner: requireEnabled,
    qa_revalidation: value ? value.qa_revalidation !== false : true,
    block_handoff_on_actionable: value ? value.block_handoff_on_actionable === true : false,
    owner_by_kind: ownerByKind
  };
}

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
  }
  return value;
}

function digest(value) {
  return crypto.createHash('sha256').update(JSON.stringify(stable(value))).digest('hex');
}

async function initManifest(projectDir, feature, host, { cycleLimits } = {}) {
  const file = manifestPath(projectDir, feature);
  const base = defaults(feature, host, { cycleLimits });
  await fs.mkdir(path.dirname(file), { recursive: true });
  try {
    const value = JSON.parse(await fs.readFile(file, 'utf8'));
    return { path: file, manifest: value, digest: digest(value), created: false, unchanged: true };
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }

  const serialized = `${JSON.stringify(base, null, 2)}\n`;
  try {
    await fs.writeFile(file, serialized, { encoding: 'utf8', flag: 'wx' });
    return { path: file, manifest: base, digest: digest(base), created: true, unchanged: false };
  } catch (error) {
    if (error.code === 'EEXIST') {
      const value = JSON.parse(await fs.readFile(file, 'utf8'));
      return { path: file, manifest: value, digest: digest(value), created: false, unchanged: true };
    }
    throw error;
  }
}

async function loadManifest(projectDir, feature) {
  const file = manifestPath(projectDir, feature);
  try {
    const value = JSON.parse(await fs.readFile(file, 'utf8'));
    const validation = validateManifest(value, feature);
    return { exists: true, path: file, manifest: value, digest: digest(value), ...validation };
  } catch (error) {
    if (error.code === 'ENOENT') return { exists: false, legacy: true, path: file, ok: true };
    return { exists: true, path: file, ok: false, errors: [{ path: '$', message: error.message }] };
  }
}

function resolveAgent(manifest, agent, overrides = {}) {
  const entry = manifest.agents[agent];
  return {
    ...entry,
    host: overrides.host || entry.host || manifest.host,
    model: overrides.model || entry.model,
    source: 'manifest',
    target: agent,
    agent
  };
}

function resolveDevelopmentLane(manifest, lane, overrides = {}) {
  const entry = manifest.development_lanes?.lanes?.[lane];
  if (!entry) return null;
  return {
    ...entry,
    host: overrides.host || entry.host || manifest.host,
    model: overrides.model || entry.model,
    source: 'manifest-development-lane',
    target: `dev:${lane}`,
    agent: 'dev',
    lane
  };
}

function resolveExecutionTarget(manifest, { agent = 'dev', lane = null } = {}, overrides = {}) {
  if (lane) return resolveDevelopmentLane(manifest, lane, overrides);
  return manifest.agents?.[agent] ? resolveAgent(manifest, agent, overrides) : null;
}

async function resolveExecutionEntry(entry, { catalogLoader = loadModelCatalog, allowHostSignature = false } = {}) {
  const cap = capabilities(entry.host);
  if (entry.reasoning_effort && !cap.reasoning_effort) {
    return {
      ...entry,
      ok: false,
      reason: 'unsupported_reasoning_effort',
      host: entry.host,
      model_requested: entry.model,
      candidates: []
    };
  }
  const catalog = cap.model_catalog
    ? await catalogLoader(entry.host)
    : { available: false, reason: 'unsupported_model_catalog', models: [] };
  let model = resolveModel(entry.model, catalog);
  // A fresh host signature is stronger evidence than a stale provider catalog:
  // it ran this exact literal model/effort through the real CLI on this machine.
  // Only runtime routing marks an entry this way after reading that evidence;
  // ordinary manifest resolution remains catalog-driven.
  if (!model.ok && allowHostSignature === true && entry.signature_validated === true) {
    model = {
      ok: true,
      requested: entry.model,
      resolved: entry.model,
      strategy: 'host_signature',
      supported_efforts: entry.reasoning_effort ? [entry.reasoning_effort] : [],
      catalog_source: catalog?.source || null,
      catalog_fetched_at: catalog?.fetched_at || null
    };
  }
  if (!model.ok) return { ...entry, ...model, model_requested: entry.model };
  let effort = validateReasoningEffort(model, entry.reasoning_effort);
  if (!effort.ok && effort.reason === 'unsupported_reasoning_effort' && allowHostSignature === true && entry.signature_validated === true) {
    effort = { ok: true, reasoning_effort: entry.reasoning_effort, verification: 'host_signature' };
  }
  if (!effort.ok) {
    return {
      ...entry,
      ok: false,
      reason: effort.reason,
      supported: effort.supported,
      candidates: [],
      model_requested: entry.model,
      model_resolved: model.resolved
    };
  }
  return {
    ...entry,
    ok: true,
    model_requested: entry.model,
    model: model.resolved,
    model_resolved: model.resolved,
    model_resolution_strategy: model.strategy,
    catalog_source: model.catalog_source,
    catalog_fetched_at: model.catalog_fetched_at,
    reasoning_effort: effort.reasoning_effort,
    reasoning_effort_verification: effort.verification
  };
}

async function resolveAgentExecution(manifest, agent, overrides = {}, options = {}) {
  return resolveExecutionEntry(resolveAgent(manifest, agent, overrides), options);
}

async function resolveDevelopmentLaneExecution(manifest, lane, overrides = {}, options = {}) {
  const entry = resolveDevelopmentLane(manifest, lane, overrides);
  if (!entry) return { ok: false, reason: 'development_lane_unknown', lane, candidates: [] };
  return resolveExecutionEntry(entry, options);
}

module.exports = {
  assertFeatureSlug,
  defaults,
  digest,
  initManifest,
  loadManifest,
  manifestPath,
  resolveAgent,
  resolveAgentExecution,
  resolveDevelopmentLane,
  resolveDevelopmentLaneExecution,
  resolveExecutionEntry,
  resolveExecutionMode,
  resolveExecutionTarget,
  resolveOrchestrationPolicy,
  resolveChainWorkPolicy,
  writeManifest
};
