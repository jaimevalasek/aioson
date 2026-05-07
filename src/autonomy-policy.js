'use strict';

// Enforcement boundary (SF-project-15):
//   - resolveEffectiveMode / canRunHeadless / getAgentMaxMode are consulted
//     by workflow-execute, workflow-status, agents, and workflow-next, but
//     they only STAMP an effective_mode label on plan steps and gate the
//     headless/TTY decision. They do not, by themselves, refuse commands.
//   - isCommandAllowed (whitelist/blacklist enforcement) is wired into
//     src/sandbox.js#executeInSandbox via opts.policy. Callers that want a
//     real refusal-on-disallowed-command gate must pass the active toolPolicy
//     when invoking executeInSandbox. Other tool-call paths (Bash emissions
//     from agent prompts via the harness) remain advisory until a harness-
//     level pre-execution hook is added — see SF-project-15 backlog.
//   - getAgentMaxMode (SF-project-16) caps any manifest-supplied
//     autonomy_modes at the protocol global_mode so manifest declarations
//     can only narrow, never widen, the agent ceiling.

const fs = require('node:fs/promises');
const path = require('node:path');
const { exists } = require('./utils');

const AUTONOMY_PROTOCOL_RELATIVE_PATH = '.aioson/config/autonomy-protocol.json';
const MODES = ['guarded', 'trusted', 'headless'];

function buildDefaultProtocol() {
  return {
    version: '1.0',
    global_mode: 'guarded',
    tools: {},
    agents: {}
  };
}

function normalizeMode(mode, fallback = 'guarded') {
  const safe = String(mode || '').trim().toLowerCase();
  return MODES.includes(safe) ? safe : fallback;
}

async function readAutonomyProtocol(targetDir) {
  const protocolPath = path.join(targetDir, AUTONOMY_PROTOCOL_RELATIVE_PATH);
  if (!(await exists(protocolPath))) return buildDefaultProtocol();

  try {
    const raw = await fs.readFile(protocolPath, 'utf8');
    const parsed = JSON.parse(raw);
    return {
      ...buildDefaultProtocol(),
      ...parsed,
      global_mode: normalizeMode(parsed.global_mode, 'guarded'),
      tools: parsed.tools && typeof parsed.tools === 'object' ? parsed.tools : {},
      agents: parsed.agents && typeof parsed.agents === 'object' ? parsed.agents : {}
    };
  } catch {
    return buildDefaultProtocol();
  }
}

function getToolPolicy(protocol, tool) {
  const safeTool = String(tool || 'codex').trim().toLowerCase();
  const policy = protocol && protocol.tools && typeof protocol.tools === 'object'
    ? protocol.tools[safeTool]
    : null;
  const rawFallbackMode = String(policy && policy.fallback_mode ? policy.fallback_mode : 'guarded').trim().toLowerCase();

  return {
    mode: normalizeMode(policy && policy.mode, protocol && protocol.global_mode ? protocol.global_mode : 'guarded'),
    fallback_mode: ['guarded', 'headless', 'abort'].includes(rawFallbackMode) ? rawFallbackMode : 'guarded',
    shell_whitelist: Array.isArray(policy && policy.shell_whitelist) ? policy.shell_whitelist : [],
    shell_blacklist: Array.isArray(policy && policy.shell_blacklist) ? policy.shell_blacklist : [],
    aioson_whitelist: Array.isArray(policy && policy.aioson_whitelist) ? policy.aioson_whitelist : [],
    requires_tty: policy && Object.prototype.hasOwnProperty.call(policy, 'requires_tty')
      ? Boolean(policy.requires_tty)
      : true,
    max_auto_retries: Number.isInteger(policy && policy.max_auto_retries) ? policy.max_auto_retries : 3
  };
}

function getAgentPolicy(protocol, agentId) {
  if (!protocol || !protocol.agents || typeof protocol.agents !== 'object') return {};
  return protocol.agents[String(agentId || '').trim()] || {};
}

function getMostPermissiveMode(modes, fallback = 'guarded') {
  if (!Array.isArray(modes) || modes.length === 0) return fallback;
  let bestIndex = MODES.indexOf(normalizeMode(fallback, 'guarded'));
  for (const mode of modes) {
    const index = MODES.indexOf(normalizeMode(mode, fallback));
    if (index > bestIndex) bestIndex = index;
  }
  return MODES[bestIndex];
}

function getAgentMaxMode(protocol, agentId, manifest = null) {
  const globalMode = normalizeMode(protocol && protocol.global_mode, 'guarded');
  const globalIndex = MODES.indexOf(globalMode);

  const agentPolicy = getAgentPolicy(protocol, agentId);
  if (agentPolicy && agentPolicy.max_mode) {
    return normalizeMode(agentPolicy.max_mode, 'guarded');
  }
  if (manifest && Array.isArray(manifest.autonomy_modes) && manifest.autonomy_modes.length > 0) {
    // SF-project-16: cap manifest-declared modes at the global ceiling.
    // A manifest may NARROW the autonomy ceiling but never WIDEN it — so a
    // forged manifest claiming `headless` under a global `guarded` policy
    // collapses back to guarded.
    const manifestMode = getMostPermissiveMode(manifest.autonomy_modes, 'guarded');
    const manifestIndex = MODES.indexOf(manifestMode);
    return MODES[Math.min(manifestIndex, globalIndex)];
  }
  return globalMode;
}

function resolveEffectiveMode({ protocol, tool, agentId, manifest = null, requestedMode = null }) {
  const toolPolicy = getToolPolicy(protocol || buildDefaultProtocol(), tool);
  const toolMode = normalizeMode(toolPolicy.mode, 'guarded');
  const agentMode = getAgentMaxMode(protocol || buildDefaultProtocol(), agentId, manifest);

  const toolIndex = MODES.indexOf(toolMode);
  const agentIndex = MODES.indexOf(agentMode);
  const baseIndex = Math.min(toolIndex, agentIndex);

  if (!requestedMode) return MODES[baseIndex];

  const requestedIndex = MODES.indexOf(normalizeMode(requestedMode, 'guarded'));
  return MODES[Math.min(baseIndex, requestedIndex)];
}

function matchPattern(value, pattern) {
  const escaped = String(pattern || '')
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*/g, '.*');
  return new RegExp(`^${escaped}$`, 'i').test(String(value || ''));
}

function isCommandAllowed(policy, commandType, commandString) {
  if (!policy) return false;
  const safeType = String(commandType || '').trim().toLowerCase();
  const whitelist = Array.isArray(policy[`${safeType}_whitelist`]) ? policy[`${safeType}_whitelist`] : [];
  const blacklist = Array.isArray(policy[`${safeType}_blacklist`]) ? policy[`${safeType}_blacklist`] : [];

  for (const pattern of blacklist) {
    if (matchPattern(commandString, pattern)) return false;
  }

  if (whitelist.length === 0) return true;
  return whitelist.some((pattern) => matchPattern(commandString, pattern));
}

function canRunHeadless(policy) {
  return Boolean(policy) && policy.requires_tty === false;
}

module.exports = {
  AUTONOMY_PROTOCOL_RELATIVE_PATH,
  MODES,
  readAutonomyProtocol,
  getToolPolicy,
  getAgentPolicy,
  getAgentMaxMode,
  resolveEffectiveMode,
  isCommandAllowed,
  canRunHeadless
};
