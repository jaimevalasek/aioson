'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { AGENTS, validateManifest } = require('./schema');
const { capabilities } = require('./capabilities');
const { loadModelCatalog } = require('./model-catalog');
const { resolveModel, validateReasoningEffort } = require('./model-resolver');

function manifestPath(projectDir, feature) { return path.join(projectDir, '.aioson', 'context', `agent-execution-${feature}.json`); }
function defaults(feature, host = 'codex', { cycleLimits } = {}) {
  const agents = {};
  for (const id of AGENTS) {
    agents[id] = {
      enabled: true,
      host,
      mode: 'external',
      model: 'configured-default',
      ...(host === 'codex' ? { reasoning_effort: 'medium' } : {}),
      writable_roots: [],
      fallbacks: [],
      report: `.aioson/context/reports/${feature}/{run_id}/${id}.json`
    };
  }
  return {
    version: 1,
    feature,
    host,
    generated_at: new Date().toISOString(),
    agents,
    capacity_policy: { strategy: 'pause', max_attempts: 1, backoff_ms: 0 },
    cycle_limits: { dev_qa: 1, tester: 1, pentester: 1, ...cycleLimits },
    reporting: { format: 'json', markdown: true }
  };
}
function stable(value) { if (Array.isArray(value)) return value.map(stable); if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(k => [k, stable(value[k])])); return value; }
function digest(value) { return crypto.createHash('sha256').update(JSON.stringify(stable(value))).digest('hex'); }
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
  try { const value = JSON.parse(await fs.readFile(file, 'utf8')); const validation = validateManifest(value, feature); return { exists: true, path: file, manifest: value, digest: digest(value), ...validation }; }
  catch (error) { if (error.code === 'ENOENT') return { exists: false, legacy: true, path: file, ok: true }; return { exists: true, path: file, ok: false, errors: [{ path: '$', message: error.message }] }; }
}
function resolveAgent(manifest, agent, overrides = {}) { const entry = manifest.agents[agent]; return { ...entry, host: overrides.host || entry.host || manifest.host, model: overrides.model || entry.model, source: 'manifest' }; }
async function resolveExecutionEntry(entry, { catalogLoader = loadModelCatalog } = {}) {
  const cap = capabilities(entry.host);
  if (entry.reasoning_effort && !cap.reasoning_effort) return { ok: false, reason: 'unsupported_reasoning_effort', host: entry.host, model_requested: entry.model, candidates: [] };
  const catalog = cap.model_catalog ? await catalogLoader(entry.host) : { available: false, reason: 'unsupported_model_catalog', models: [] };
  const model = resolveModel(entry.model, catalog);
  if (!model.ok) return { ...entry, ...model, model_requested: entry.model };
  const effort = validateReasoningEffort(model, entry.reasoning_effort);
  if (!effort.ok) return { ...entry, ok: false, reason: effort.reason, supported: effort.supported, candidates: [], model_requested: entry.model, model_resolved: model.resolved };
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
async function resolveAgentExecution(manifest, agent, overrides = {}, options = {}) { return resolveExecutionEntry(resolveAgent(manifest, agent, overrides), options); }
module.exports = { defaults, digest, initManifest, loadManifest, manifestPath, resolveAgent, resolveAgentExecution, resolveExecutionEntry };
