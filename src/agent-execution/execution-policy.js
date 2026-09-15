'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');

const POLICY_PATH = '.aioson/config/execution-policy.json';
const DEFAULT_POLICY = Object.freeze({
  version: 1,
  context: { models: [] },
  qa: { require_pass: true, max_rework_rounds: 1 }
});

function normalizePolicy(value = {}) {
  const errors = [];
  const object = item => item && typeof item === 'object' && !Array.isArray(item);
  const keys = (item, allowed, prefix) => {
    if (!object(item)) { errors.push(`${prefix}: must be an object`); return false; }
    for (const key of Object.keys(item)) if (!allowed.includes(key)) errors.push(`${prefix}.${key}: unknown field`);
    return true;
  };
  if (!keys(value, ['version', 'context', 'qa'], 'policy')) return { ok: false, errors };
  if (value.version !== undefined && value.version !== 1) errors.push('version: must be 1');
  const context = { ...DEFAULT_POLICY.context, ...value.context };
  const qa = { ...DEFAULT_POLICY.qa, ...value.qa };
  // The three budget fields are accepted only so existing project policy
  // files keep loading. They no longer constrain, restart or compact a model
  // process; context is observed and reported after each attempt.
  if (value.context !== undefined) keys(value.context, ['max_fraction', 'max_tokens', 'max_continuations', 'models'], 'context');
  if (value.qa !== undefined) keys(value.qa, ['require_pass', 'max_rework_rounds'], 'qa');
  if (typeof qa.require_pass !== 'boolean') errors.push('qa.require_pass: must be boolean');
  if (!Number.isInteger(qa.max_rework_rounds) || qa.max_rework_rounds < 0 || qa.max_rework_rounds > 3) errors.push('qa.max_rework_rounds: must be 0..3');
  if (!Array.isArray(context.models) || context.models.length > 100) errors.push('context.models: must contain at most 100 entries');
  else {
    const seen = new Set();
    for (const model of context.models) {
      // max_tokens is a legacy quality-budget field. Accept but discard it;
      // context_window_tokens remains useful as an observational fallback when
      // a host does not report its actual window.
      if (!keys(model, ['host', 'model', 'context_window_tokens', 'max_tokens'], 'context.models[]')) continue;
      if (typeof model.host !== 'string' || !model.host || typeof model.model !== 'string' || !model.model || model.model.length > 200) errors.push('context.models[]: host and exact model required');
      const id = `${model.host}/${model.model}`;
      if (seen.has(id)) errors.push(`context.models: duplicate ${id}`);
      seen.add(id);
      if (!Number.isSafeInteger(model.context_window_tokens) || model.context_window_tokens < 1000) errors.push('context_window_tokens: must be a positive window >= 1000');
    }
  }
  const models = Array.isArray(context.models)
    ? context.models
      .filter(object)
      .map(({ host, model, context_window_tokens }) => ({ host, model, context_window_tokens }))
    : [];
  return { ok: errors.length === 0, errors, policy: { version: 1, context: { models }, qa } };
}

async function readExecutionPolicy(projectDir) {
  try {
    const file = path.join(projectDir, POLICY_PATH);
    if ((await fs.stat(file)).size > 65536) throw new Error('policy exceeds 64 KB');
    return normalizePolicy(JSON.parse(await fs.readFile(file, 'utf8')));
  } catch (error) {
    if (error.code === 'ENOENT') return normalizePolicy();
    return { ok: false, errors: [error.message] };
  }
}

function contextWindow(policy, host, model, reportedWindow = null) {
  if (!policy) return null;
  const config = policy.context;
  const entry = config.models.find(item => item.host === host && item.model === model);
  const known = [entry?.context_window_tokens, reportedWindow].filter(value => Number.isSafeInteger(value) && value > 0);
  const window = known.length ? Math.min(...known) : null;
  const harnessReported = Number.isSafeInteger(reportedWindow) && reportedWindow > 0;
  return {
    limit_tokens: window,
    source: entry && harnessReported ? 'project_configuration+harness' : entry ? 'project_configuration' : window ? 'harness_or_catalog' : 'unknown'
  };
}

module.exports = { POLICY_PATH, DEFAULT_POLICY, normalizePolicy, readExecutionPolicy, contextWindow };
