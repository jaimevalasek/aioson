'use strict';

// Verification sub-agent policy (.aioson/config/verification.json).
//
// Piece 1 of the "smart harness, fewer agents doing more" redesign. This is the
// reader the @dev phase-loop (auto-continue) and the post-dev review cycle
// consult to decide WHICH verification sub-agent runs, WHEN, and on WHICH model
// — resolved per host harness.
//
// Two dispatch modes per agent, keyed by the host harness (claude|codex|opencode):
//   - native:   in-harness sub-agent. On Claude Code the Task tool runs a Claude
//               model tier (e.g. sonnet-4.6); codex/opencode run their own
//               configured model. You CANNOT run a codex/gpt model as a native
//               Claude Code sub-agent — that is what `external` is for.
//   - external: spawn a different vendor CLI as a read-only auditor
//               (`aioson verify:implementation --tool=...`). The only way to bring
//               a cross-vendor model in while hosted elsewhere — see `cross_check`.
//
// The file is auto-generated from template/.aioson/config/verification.json by the
// installer (isConfigMergePath additive merge) and is hand-editable: user values
// survive `aioson update`, only `version` is template-owned. A missing or
// malformed file degrades to buildDefaultVerificationConfig() — never throws.

const fs = require('node:fs/promises');
const path = require('node:path');
const { exists } = require('./utils');

const VERIFICATION_CONFIG_RELATIVE_PATH = '.aioson/config/verification.json';
const KNOWN_HOSTS = ['claude', 'codex', 'opencode'];
const DISPATCH_MODES = ['native', 'external'];
const VERIFICATION_AGENTS = ['qa', 'tester', 'pentester', 'validator'];
const TRIGGERS = ['per-phase', 'end-of-feature', 'sensitive-surface'];
const DEFAULT_HOST = 'claude';
const DEFAULT_MODEL = 'configured-default';

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

function defaultTriggers(agentId) {
  switch (agentId) {
    case 'qa': return ['per-phase', 'end-of-feature'];
    case 'pentester': return ['sensitive-surface', 'end-of-feature'];
    default: return ['end-of-feature'];
  }
}

function defaultReport(agentId) {
  switch (agentId) {
    case 'qa': return 'qa-report-{slug}.md';
    case 'tester': return 'test-report-{slug}.md';
    case 'pentester': return 'security-findings-{slug}.json';
    case 'validator': return 'validator-report-{slug}.json';
    default: return `${agentId}-report-{slug}.md`;
  }
}

function buildDefaultAgent(agentId) {
  // pentester/validator default to the strongest tier; qa/tester to a cheaper
  // tier — the per-phase verifier should be cheap, the security/contract
  // verdicts should not be.
  const claudeModel = (agentId === 'pentester' || agentId === 'validator') ? 'opus-4.8' : 'sonnet-4.6';
  const agent = {
    enabled: (agentId === 'qa' || agentId === 'validator') ? true : 'auto',
    triggers: defaultTriggers(agentId),
    dispatch: {
      claude: { mode: 'native', model: claudeModel },
      codex: { mode: 'native', model: DEFAULT_MODEL },
      opencode: { mode: 'native', model: DEFAULT_MODEL }
    },
    report: defaultReport(agentId)
  };
  if (agentId === 'validator') {
    agent.cross_check = { enabled: false, mode: 'external', tool: 'codex', model: DEFAULT_MODEL };
  }
  return agent;
}

function buildDefaultVerificationConfig() {
  const agents = {};
  for (const id of VERIFICATION_AGENTS) agents[id] = buildDefaultAgent(id);
  return {
    version: '1.0',
    host: 'auto',
    agents,
    budget: {
      max_subagents_per_phase: 1,
      skip_on_micro: true,
      full_smoke: 'end-of-feature-only'
    },
    phase_loop: {
      auto_continue: true,
      compact_between_phases: true,
      max_fix_retries_per_phase: 2
    }
  };
}

// ---------------------------------------------------------------------------
// Normalization
// ---------------------------------------------------------------------------

// Collapse an arbitrary value to a known host, falling back when unrecognized.
function normalizeHost(host, fallback = DEFAULT_HOST) {
  const safe = String(host || '').trim().toLowerCase();
  return KNOWN_HOSTS.includes(safe) ? safe : fallback;
}

// The top-level `host` setting additionally allows the literal 'auto'.
function normalizeHostSetting(host) {
  const safe = String(host || 'auto').trim().toLowerCase();
  if (safe === 'auto') return 'auto';
  return KNOWN_HOSTS.includes(safe) ? safe : 'auto';
}

function normalizeEnabled(value, fallback = 'auto') {
  if (value === true || value === false) return value;
  if (String(value).trim().toLowerCase() === 'auto') return 'auto';
  return fallback;
}

function normalizeDispatchMode(mode, fallback = 'native') {
  const safe = String(mode || '').trim().toLowerCase();
  return DISPATCH_MODES.includes(safe) ? safe : fallback;
}

function normalizeModel(model, fallback = DEFAULT_MODEL) {
  return typeof model === 'string' && model.trim() ? model.trim() : fallback;
}

function normalizeDispatchEntry(entry, fallbackEntry) {
  const safe = entry && typeof entry === 'object' ? entry : {};
  return {
    mode: normalizeDispatchMode(safe.mode, fallbackEntry.mode),
    model: normalizeModel(safe.model, fallbackEntry.model)
  };
}

function normalizeTriggers(triggers, fallback) {
  if (!Array.isArray(triggers)) return [...fallback];
  const cleaned = triggers
    .map((t) => String(t || '').trim().toLowerCase())
    .filter((t) => TRIGGERS.includes(t));
  return cleaned.length ? Array.from(new Set(cleaned)) : [...fallback];
}

function normalizeAgent(parsed, agentId) {
  const def = buildDefaultAgent(agentId);
  const raw = parsed && typeof parsed === 'object' ? parsed : {};
  const rawDispatch = raw.dispatch && typeof raw.dispatch === 'object' ? raw.dispatch : {};
  const dispatch = {};
  for (const host of KNOWN_HOSTS) {
    dispatch[host] = normalizeDispatchEntry(rawDispatch[host], def.dispatch[host]);
  }
  const agent = {
    enabled: normalizeEnabled(raw.enabled, def.enabled),
    triggers: normalizeTriggers(raw.triggers, def.triggers),
    dispatch,
    report: normalizeModel(raw.report, def.report)
  };
  if (def.cross_check) {
    const rawCc = raw.cross_check && typeof raw.cross_check === 'object' ? raw.cross_check : {};
    agent.cross_check = {
      enabled: typeof rawCc.enabled === 'boolean' ? rawCc.enabled : def.cross_check.enabled,
      mode: normalizeDispatchMode(rawCc.mode, def.cross_check.mode),
      tool: normalizeHost(rawCc.tool, def.cross_check.tool),
      model: normalizeModel(rawCc.model, def.cross_check.model)
    };
  }
  return agent;
}

function normalizeBudget(parsed) {
  const def = buildDefaultVerificationConfig().budget;
  const raw = parsed && typeof parsed === 'object' ? parsed : {};
  return {
    max_subagents_per_phase: Number.isInteger(raw.max_subagents_per_phase) && raw.max_subagents_per_phase >= 0
      ? raw.max_subagents_per_phase
      : def.max_subagents_per_phase,
    skip_on_micro: typeof raw.skip_on_micro === 'boolean' ? raw.skip_on_micro : def.skip_on_micro,
    full_smoke: normalizeModel(raw.full_smoke, def.full_smoke)
  };
}

function normalizePhaseLoop(parsed) {
  const def = buildDefaultVerificationConfig().phase_loop;
  const raw = parsed && typeof parsed === 'object' ? parsed : {};
  return {
    auto_continue: typeof raw.auto_continue === 'boolean' ? raw.auto_continue : def.auto_continue,
    compact_between_phases: typeof raw.compact_between_phases === 'boolean'
      ? raw.compact_between_phases
      : def.compact_between_phases,
    max_fix_retries_per_phase: Number.isInteger(raw.max_fix_retries_per_phase) && raw.max_fix_retries_per_phase >= 0
      ? raw.max_fix_retries_per_phase
      : def.max_fix_retries_per_phase
  };
}

function normalizeVerificationConfig(parsed) {
  const def = buildDefaultVerificationConfig();
  const raw = parsed && typeof parsed === 'object' ? parsed : {};
  const rawAgents = raw.agents && typeof raw.agents === 'object' ? raw.agents : {};
  const agents = {};
  // Always materialize the four known agents (defaults fill any gaps)...
  for (const id of VERIFICATION_AGENTS) agents[id] = normalizeAgent(rawAgents[id], id);
  // ...and preserve any user-defined extra agents (best-effort, generic shape).
  for (const id of Object.keys(rawAgents)) {
    if (!VERIFICATION_AGENTS.includes(id)) agents[id] = normalizeAgent(rawAgents[id], id);
  }
  return {
    version: typeof raw.version === 'string' ? raw.version : def.version,
    host: normalizeHostSetting(raw.host),
    agents,
    budget: normalizeBudget(raw.budget),
    phase_loop: normalizePhaseLoop(raw.phase_loop)
  };
}

// ---------------------------------------------------------------------------
// Read
// ---------------------------------------------------------------------------

async function readVerificationConfig(targetDir) {
  const configPath = path.join(targetDir, VERIFICATION_CONFIG_RELATIVE_PATH);
  if (!(await exists(configPath))) return buildDefaultVerificationConfig();
  try {
    const rawText = await fs.readFile(configPath, 'utf8');
    return normalizeVerificationConfig(JSON.parse(rawText));
  } catch {
    return buildDefaultVerificationConfig();
  }
}

// ---------------------------------------------------------------------------
// Resolution / getters
// ---------------------------------------------------------------------------

// Precedence: explicit arg > config.host (when not 'auto') > env > default.
function resolveHost(config, explicitHost = null, env = process.env) {
  const explicit = String(explicitHost || '').trim().toLowerCase();
  if (KNOWN_HOSTS.includes(explicit)) return explicit;

  const configured = config && typeof config.host === 'string' ? config.host.trim().toLowerCase() : 'auto';
  if (KNOWN_HOSTS.includes(configured)) return configured;

  const envTool = String((env && (env.AIOSON_RUNNER_TOOL || env.AIOSON_TOOL)) || '').trim().toLowerCase();
  if (KNOWN_HOSTS.includes(envTool)) return envTool;

  return DEFAULT_HOST;
}

function getAgentConfig(config, agentId) {
  const id = String(agentId || '').trim();
  if (config && config.agents && typeof config.agents === 'object' && config.agents[id]) {
    return config.agents[id];
  }
  if (VERIFICATION_AGENTS.includes(id)) return buildDefaultAgent(id);
  return null;
}

// Resolve the {mode, model, host} a verification sub-agent should run on for the
// active host harness. Falls back to the default-host entry, then to built-ins.
function getAgentDispatch(config, agentId, host = null) {
  const agent = getAgentConfig(config, agentId);
  if (!agent) return null;
  const resolvedHost = resolveHost(config, host);
  const dispatch = agent.dispatch && typeof agent.dispatch === 'object' ? agent.dispatch : {};
  const entry = dispatch[resolvedHost] || dispatch[DEFAULT_HOST];
  if (entry && typeof entry === 'object') {
    return { host: resolvedHost, mode: normalizeDispatchMode(entry.mode), model: normalizeModel(entry.model) };
  }
  const def = buildDefaultAgent(agentId);
  const defEntry = def.dispatch[resolvedHost] || def.dispatch[DEFAULT_HOST];
  return { host: resolvedHost, mode: defEntry.mode, model: defEntry.model };
}

// Resolve enabled:true|false|'auto' to a concrete boolean given run context.
// 'auto' lets the framework decide: pentester only on a sensitive surface,
// tester on anything above MICRO, everything else on.
function resolveAgentEnabled(config, agentId, context = {}) {
  const agent = getAgentConfig(config, agentId);
  if (!agent) return false;
  if (agent.enabled === true) return true;
  if (agent.enabled === false) return false;
  const classification = String(context.classification || '').trim().toUpperCase();
  const sensitiveSurface = Boolean(context.sensitiveSurface);
  switch (String(agentId).trim()) {
    case 'pentester': return sensitiveSurface;
    case 'tester': return classification !== 'MICRO';
    default: return true;
  }
}

function getAgentTriggers(config, agentId) {
  const agent = getAgentConfig(config, agentId);
  return agent && Array.isArray(agent.triggers) ? [...agent.triggers] : [];
}

function agentHasTrigger(config, agentId, trigger) {
  return getAgentTriggers(config, agentId).includes(String(trigger || '').trim().toLowerCase());
}

function getAgentReportTemplate(config, agentId) {
  const agent = getAgentConfig(config, agentId);
  return agent && typeof agent.report === 'string' ? agent.report : '';
}

function resolveAgentReportPath(config, agentId, slug) {
  return getAgentReportTemplate(config, agentId).replace(/\{slug\}/g, String(slug || '').trim());
}

function getCrossCheck(config, agentId) {
  const agent = getAgentConfig(config, agentId);
  if (!agent || !agent.cross_check || typeof agent.cross_check !== 'object') return null;
  const cc = agent.cross_check;
  return {
    enabled: Boolean(cc.enabled),
    mode: normalizeDispatchMode(cc.mode, 'external'),
    tool: normalizeHost(cc.tool, 'codex'),
    model: normalizeModel(cc.model)
  };
}

function getBudget(config) {
  return normalizeBudget(config && config.budget);
}

// Phase-loop behavior: whether @dev auto-continues across phases, compacts
// between them, and how many in-phase fix retries are allowed before stopping.
function getPhaseLoop(config) {
  return normalizePhaseLoop(config && config.phase_loop);
}

// Composed decision: should `agentId` run for `context.trigger` right now?
// Combines trigger membership + enabled resolution + the skip-on-micro budget
// guard (per-phase verification is suppressed on MICRO to save tokens).
function shouldRunForTrigger(config, agentId, context = {}) {
  const trigger = String(context.trigger || '').trim().toLowerCase();
  if (!agentHasTrigger(config, agentId, trigger)) return false;
  if (!resolveAgentEnabled(config, agentId, context)) return false;
  const classification = String(context.classification || '').trim().toUpperCase();
  if (getBudget(config).skip_on_micro && classification === 'MICRO' && trigger === 'per-phase') return false;
  return true;
}

module.exports = {
  VERIFICATION_CONFIG_RELATIVE_PATH,
  KNOWN_HOSTS,
  DISPATCH_MODES,
  VERIFICATION_AGENTS,
  TRIGGERS,
  DEFAULT_HOST,
  DEFAULT_MODEL,
  buildDefaultVerificationConfig,
  buildDefaultAgent,
  normalizeVerificationConfig,
  readVerificationConfig,
  resolveHost,
  getAgentConfig,
  getAgentDispatch,
  resolveAgentEnabled,
  getAgentTriggers,
  agentHasTrigger,
  getAgentReportTemplate,
  resolveAgentReportPath,
  getCrossCheck,
  getBudget,
  getPhaseLoop,
  shouldRunForTrigger
};
