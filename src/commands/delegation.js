'use strict';

const path = require('node:path');
const { buildDelegationPlan } = require('../model-delegation');
const { redact } = require('../agent-execution/adapters/base');

const DEFAULT_TIMEOUT = 600000;
const DEFAULT_MAX_OUTPUT = 256 * 1024;

function boundedInteger(value, fallback, min, max) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.min(max, Math.max(min, Math.floor(parsed))) : fallback;
}

function planOptions(projectDir, options, catalogLoader, forceExternal = false) {
  return {
    projectDir,
    host: options.host,
    provider: options.provider || options.tool,
    mode: forceExternal ? 'external' : options.mode,
    model: options.model,
    reasoningEffort: options['reasoning-effort'],
    kind: options.kind,
    tools: options.tools,
    task: options.task,
    taskFile: options['task-file'],
    researchSlug: options['research-slug'] || options.slug,
    explicitModelRequest: options['explicit-model-request'] === true,
    catalogLoader
  };
}

function renderPlan(logger, result) {
  if (!result.ok) {
    logger.error(`Delegation blocked: ${result.reason}`);
    if (result.candidates && result.candidates.length) logger.error(`Candidates: ${result.candidates.join(', ')}`);
    return;
  }
  logger.log(`Delegation: ${result.mode} ${result.provider}/${result.model_resolved}`);
  logger.log(`Task: ${result.task_kind}; tools: ${result.tools.join(', ')}`);
  if (result.native_dispatch) logger.log(result.native_dispatch.directive);
  if (result.persistence.path) logger.log(`Parent persists result at: ${result.persistence.path}`);
}

async function runDelegationPlan({ args, options = {}, logger, catalogLoader }) {
  const projectDir = path.resolve(process.cwd(), args[0] || '.');
  const result = await buildDelegationPlan(planOptions(projectDir, options, catalogLoader));
  if (!options.json) renderPlan(logger, result);
  return result;
}

async function runDelegationRun({ args, options = {}, logger, catalogLoader, adapterRegistry }) {
  const projectDir = path.resolve(process.cwd(), args[0] || '.');
  const result = await buildDelegationPlan(planOptions(projectDir, options, catalogLoader, true));
  if (!result.ok) {
    if (!options.json) renderPlan(logger, result);
    return result;
  }
  const adapters = adapterRegistry || {
    claude: require('../agent-execution/adapters/claude'),
    codex: require('../agent-execution/adapters/codex'),
    opencode: require('../agent-execution/adapters/opencode')
  };
  const adapter = adapters[result.provider];
  if (!adapter) return { ok: false, reason: 'unsupported_provider', provider: result.provider };
  if (result.provider === 'opencode') {
    return { ok: false, reason: 'external_read_only_unavailable', provider: result.provider };
  }

  const timeout = boundedInteger(options.timeout, DEFAULT_TIMEOUT, 1000, 30 * 60 * 1000);
  const maxOutput = boundedInteger(options['max-output'], DEFAULT_MAX_OUTPUT, 1024, 1024 * 1024);
  let stdout = '';
  let stderr = '';
  let outputExceeded = false;
  const append = (current, data) => {
    const next = current + String(data || '');
    if (Buffer.byteLength(next, 'utf8') > maxOutput) {
      outputExceeded = true;
      return next.slice(-maxOutput);
    }
    return next;
  };
  const execution = await adapter.execute({
    mode: 'external',
    model: result.model_resolved,
    reasoning_effort: result.reasoning_effort,
    sandbox_mode: 'read-only',
    writable_roots: [],
    cwd: projectDir,
    prompt_text: result.worker_prompt,
    timeout,
    onStdout: data => { stdout = append(stdout, data); },
    onStderr: data => { stderr = append(stderr, data); }
  });
  if (outputExceeded) {
    return { ok: false, reason: 'output_limit', provider: result.provider, model_resolved: result.model_resolved };
  }
  const final = {
    ok: Boolean(execution.ok),
    reason: execution.ok ? null : execution.reason,
    mode: 'external',
    provider: result.provider,
    model_requested: result.model_requested,
    model_resolved: result.model_resolved,
    model_resolution_strategy: result.model_resolution_strategy,
    reasoning_effort: result.reasoning_effort,
    task_kind: result.task_kind,
    persistence: result.persistence,
    result: redact(stdout).trim(),
    error: execution.ok ? null : redact(stderr || execution.error || '').trim().slice(0, 2000),
    provenance: result.provenance
  };
  if (!options.json) {
    logger.log(`Delegation completed: ${final.provider}/${final.model_resolved}`);
    if (final.result) logger.log(final.result);
    if (!final.ok) logger.error(final.error || final.reason);
  }
  return final;
}

module.exports = {
  DEFAULT_MAX_OUTPUT,
  DEFAULT_TIMEOUT,
  boundedInteger,
  runDelegationPlan,
  runDelegationRun
};
