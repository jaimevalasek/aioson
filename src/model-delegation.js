'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const { loadModelCatalog } = require('./agent-execution/model-catalog');
const { resolveModel, validateReasoningEffort } = require('./agent-execution/model-resolver');
const { isInsideRoot, resolveInsideRoot, validateFeatureSlug } = require('./verification/path-policy');

const HOSTS = ['claude', 'codex', 'opencode'];
const MODES = ['auto', 'native', 'external'];
const TASK_KINDS = ['research', 'image-research', 'critique', 'verification', 'general'];
const MAX_TASK_BYTES = 128 * 1024;
const SAFE_MODEL_LITERAL = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,199}$/;
const SAFE_TOOL = /^[a-z][a-z0-9_-]{0,49}$/;

function normalizeHost(value) {
  const normalized = String(value || '').trim().toLowerCase();
  return HOSTS.includes(normalized) ? normalized : null;
}

function detectHost(explicit, env = process.env) {
  const requested = String(explicit || '').trim().toLowerCase();
  if (requested) return normalizeHost(requested);
  const fromEnv = String((env && (env.AIOSON_RUNNER_TOOL || env.AIOSON_TOOL)) || '').trim().toLowerCase();
  return HOSTS.includes(fromEnv) ? fromEnv : 'claude';
}

function normalizeMode(value) {
  const normalized = String(value || 'auto').trim().toLowerCase();
  return MODES.includes(normalized) ? normalized : null;
}

function normalizeKind(value) {
  const normalized = String(value || 'general').trim().toLowerCase();
  return TASK_KINDS.includes(normalized) ? normalized : null;
}

function normalizeDisplayModel(value) {
  const display = String(value || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').trim();
  if (!display || display.length > 200) return null;
  if (!/^[\p{L}\p{N} ._:/-]+$/u.test(display)) return null;
  return display.toLowerCase().replace(/\s+/g, '-').replace(/^-+|-+$/g, '');
}

function parseTools(value, kind = 'general') {
  const defaults = {
    research: ['web-search', 'web-fetch'],
    'image-research': ['web-search', 'image-search', 'web-fetch'],
    critique: ['read'],
    verification: ['read'],
    general: ['read']
  };
  const raw = Array.isArray(value) ? value : String(value || '').split(',');
  const selected = raw.map(item => String(item || '').trim().toLowerCase()).filter(Boolean);
  const tools = selected.length ? selected : defaults[kind];
  if (tools.some(tool => !SAFE_TOOL.test(tool))) return { ok: false, reason: 'invalid_tool' };
  return { ok: true, tools: [...new Set(tools)] };
}

function validateTaskText(value) {
  const task = String(value || '').trim();
  if (!task) return { ok: false, reason: 'task_required' };
  if (Buffer.byteLength(task, 'utf8') > MAX_TASK_BYTES) return { ok: false, reason: 'task_too_large' };
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(task)) return { ok: false, reason: 'task_contains_control_characters' };
  return { ok: true, task };
}

async function readTask(projectDir, { task, taskFile } = {}) {
  if (taskFile) {
    const safe = resolveInsideRoot(projectDir, taskFile);
    if (!safe.ok) return safe;
    let realRoot;
    let realTask;
    try {
      [realRoot, realTask] = await Promise.all([fs.realpath(projectDir), fs.realpath(safe.path)]);
    } catch (error) {
      return { ok: false, reason: error.code === 'ENOENT' ? 'task_file_missing' : 'task_file_unreadable' };
    }
    if (!isInsideRoot(realRoot, realTask)) return { ok: false, reason: 'task_file_symlink_escape' };
    let handle;
    try {
      handle = await fs.open(realTask, 'r');
      const stat = await handle.stat();
      if (!stat.isFile()) return { ok: false, reason: 'task_file_not_regular' };
      if (stat.size > MAX_TASK_BYTES) return { ok: false, reason: 'task_too_large' };
      const validated = validateTaskText(await handle.readFile('utf8'));
      return validated.ok ? { ...validated, task_file: safe.relative_path } : validated;
    } catch {
      return { ok: false, reason: 'task_file_unreadable' };
    } finally {
      if (handle) await handle.close();
    }
  }
  return validateTaskText(task);
}

async function resolveDelegationModel(provider, requestedValue, reasoningEffort, catalogLoader = loadModelCatalog) {
  const requested = String(requestedValue || '').trim();
  if (!requested) return { ok: false, reason: 'model_required' };
  if (requested.toLowerCase() === 'configured-default') {
    return { ok: false, reason: 'explicit_model_required', model_requested: requested };
  }
  let catalog = await catalogLoader(provider);
  if (!catalog || typeof catalog !== 'object') catalog = { available: false, reason: 'catalog_unavailable', models: [] };

  let input = requested;
  let displayNormalized = false;
  const normalizedDisplay = normalizeDisplayModel(requested);
  if (!SAFE_MODEL_LITERAL.test(input) && !normalizedDisplay) {
    return { ok: false, reason: 'invalid_model', model_requested: requested };
  }
  if (!catalog.available && provider !== 'codex' && !SAFE_MODEL_LITERAL.test(input)) {
    input = normalizedDisplay;
    displayNormalized = input !== requested;
  }
  if (!catalog.available && !SAFE_MODEL_LITERAL.test(input)) {
    return { ok: false, reason: catalog.reason || 'invalid_model', model_requested: requested };
  }

  const resolution = resolveModel(input, catalog);
  if (!resolution.ok) return { ...resolution, model_requested: requested };
  if (resolution.strategy === 'fuzzy_unique') {
    return {
      ok: false,
      reason: 'model_confirmation_required',
      model_requested: requested,
      candidates: [resolution.resolved]
    };
  }
  const effort = validateReasoningEffort(resolution, reasoningEffort);
  if (!effort.ok) return { ...effort, model_requested: requested };
  return {
    ok: true,
    model_requested: requested,
    model_resolved: resolution.resolved,
    model_resolution_strategy: displayNormalized ? 'normalized_literal' : resolution.strategy,
    catalog_source: resolution.catalog_source || null,
    reasoning_effort: effort.reasoning_effort,
    reasoning_effort_verification: effort.verification
  };
}

function resolveResearchPath(kind, researchSlug) {
  if (!['research', 'image-research'].includes(kind) || !researchSlug) return null;
  const validation = validateFeatureSlug(researchSlug);
  if (!validation.ok) return validation;
  return {
    ok: true,
    path: `researchs/${validation.feature_slug}/summary.md`,
    directory: `researchs/${validation.feature_slug}`
  };
}

function buildWorkerPrompt({ task, kind, host, provider, model, tools, researchPath }) {
  const researchContract = kind === 'image-research'
    ? '\nFor every image candidate include its source page, direct asset URL when available, relevance, license/usage status, and any uncertainty. Never label an asset ready to use when its license is unknown.'
    : kind === 'research'
      ? '\nSupport material claims with direct source URLs and distinguish source evidence from inference.'
      : '';
  const persistence = researchPath
    ? `\nReturn a complete result to the parent; the parent owns persistence at ${researchPath.path}. Do not write it yourself.`
    : '\nReturn the complete result to the parent. Do not write project files.';
  return [
    'You are an isolated AIOSON delegated worker. Work only on the bounded task below.',
    `Task kind: ${kind}`,
    `Host: ${host}; provider: ${provider}; model binding: ${model}`,
    `Available/requested capabilities: ${tools.join(', ') || 'none declared'}`,
    '',
    'TASK',
    task,
    '',
    'BOUNDARIES',
    '- Read-only: do not edit code, prompts, briefings, plans, or project state.',
    '- Do not widen product scope or replace the parent agent\'s completeness/scope judgment.',
    '- Do not spawn another subagent.',
    '- If a required capability is unavailable, report the limitation instead of pretending the work ran.',
    researchContract.trim(),
    persistence.trim(),
    '',
    'OUTPUT',
    'Return: summary, findings/candidates, source URLs, recommended use, artifacts (normally none), and limitations. Keep requested-model provenance separate from factual findings.'
  ].filter(Boolean).join('\n');
}

function nativeDirective(host, model) {
  if (host === 'claude') {
    return `Dispatch one Claude Code native subagent now and bind its invocation model exactly to ${model}. Use the isolated researcher role when available. Do not run the task in the parent model and do not claim delegation without a completed subagent result.`;
  }
  if (host === 'codex') {
    return `Dispatch one Codex native custom agent/subagent only if its custom-agent model configuration is exactly ${model}. If no loaded custom agent proves that model binding, do not inherit silently; use the external fallback.`;
  }
  return `Dispatch one native ${host} worker now and bind its model exactly to ${model}. If the host cannot prove the binding, use the external fallback.`;
}

async function buildDelegationPlan({
  projectDir,
  host,
  provider,
  mode = 'auto',
  model,
  reasoningEffort,
  kind = 'general',
  tools,
  task,
  taskFile,
  researchSlug,
  explicitModelRequest = false,
  catalogLoader = loadModelCatalog,
  env = process.env
}) {
  if (!explicitModelRequest) return { ok: false, reason: 'explicit_model_request_required' };
  const resolvedHost = detectHost(host, env);
  if (!resolvedHost) return { ok: false, reason: 'invalid_host', valid: HOSTS };
  const resolvedProvider = provider ? normalizeHost(provider) : resolvedHost;
  if (!resolvedProvider) return { ok: false, reason: 'invalid_provider', valid: HOSTS };
  const resolvedMode = normalizeMode(mode);
  if (!resolvedMode) return { ok: false, reason: 'invalid_mode', valid: MODES };
  const resolvedKind = normalizeKind(kind);
  if (!resolvedKind) return { ok: false, reason: 'invalid_task_kind', valid: TASK_KINDS };
  const taskResult = await readTask(projectDir, { task, taskFile });
  if (!taskResult.ok) return taskResult;
  const toolResult = parseTools(tools, resolvedKind);
  if (!toolResult.ok) return toolResult;
  const modelResult = await resolveDelegationModel(resolvedProvider, model, reasoningEffort, catalogLoader);
  if (!modelResult.ok) return modelResult;
  const researchPath = resolveResearchPath(resolvedKind, researchSlug);
  if (researchPath && !researchPath.ok) return researchPath;

  const preferredMode = resolvedMode === 'auto'
    ? (resolvedProvider === resolvedHost ? 'native' : 'external')
    : resolvedMode;
  if (preferredMode === 'native' && resolvedProvider !== resolvedHost) {
    return { ok: false, reason: 'native_cross_provider_forbidden', host: resolvedHost, provider: resolvedProvider };
  }

  const workerPrompt = buildWorkerPrompt({
    task: taskResult.task,
    kind: resolvedKind,
    host: resolvedHost,
    provider: resolvedProvider,
    model: modelResult.model_resolved,
    tools: toolResult.tools,
    researchPath
  });
  return {
    ok: true,
    version: 1,
    explicit_model_request: true,
    host: resolvedHost,
    provider: resolvedProvider,
    mode: preferredMode,
    task_kind: resolvedKind,
    task_file: taskResult.task_file || null,
    tools: toolResult.tools,
    ...modelResult,
    worker_write_policy: 'read-only',
    persistence: researchPath
      ? { owner: 'parent', path: researchPath.path, directory: researchPath.directory }
      : { owner: 'parent', path: null, directory: null },
    worker_prompt: workerPrompt,
    native_dispatch: preferredMode === 'native'
      ? { required: true, host: resolvedHost, model: modelResult.model_resolved, directive: nativeDirective(resolvedHost, modelResult.model_resolved) }
      : null,
    external_fallback: {
      authorized_by_explicit_request: true,
      provider: resolvedProvider,
      model: modelResult.model_resolved,
      command: 'aioson delegation:run'
    },
    provenance: {
      model_requested: modelResult.model_requested,
      model_resolved: modelResult.model_resolved,
      model_resolution_strategy: modelResult.model_resolution_strategy,
      host: resolvedHost,
      provider: resolvedProvider,
      mode: preferredMode
    }
  };
}

module.exports = {
  HOSTS,
  MAX_TASK_BYTES,
  MODES,
  TASK_KINDS,
  buildDelegationPlan,
  buildWorkerPrompt,
  detectHost,
  normalizeDisplayModel,
  normalizeKind,
  normalizeMode,
  parseTools,
  readTask,
  resolveDelegationModel,
  resolveResearchPath,
  validateTaskText
};
