'use strict';

/**
 * The text that starts an agent in a NEW conversation of a harness. The
 * person pastes it, or the Play types it into the session it reopens; the
 * Play never writes it itself. It is one line — an Enter inside it would send
 * half — and has two parts: the harness's own activation, then where to start.
 *
 * Activation, never guessed: Claude Code runs the slash command the installer
 * ships for the agent (`.claude/commands/aioson/agent/<id>.md` →
 * `/aioson:agent:<id>`, which hooks:emit records as the agent taking over the
 * session). A project without that file, and every other harness, gets the
 * lead agent:prompt opens its prompt with (agentActivationLead, src/agents.js).
 *
 * Where to start: @dev on a phase compiles that phase's capsule first; @qa
 * starts at its Deterministic preflight, because Dev's conversation never
 * carries over to it; any other agent resumes the feature from disk.
 */

const fs = require('node:fs');
const path = require('node:path');
const { getAgentDefinition, agentActivationLead } = require('../agents');
const { listSupportedTools, getToolCapabilities } = require('./tool-capabilities');
const { parsePlanPhases, unparsedPhaseHeadings } = require('./plan-document');
const { readFeatureArtifactSafe } = require('../preflight-engine');

const DEFAULT_KICKOFF_TOOL = 'claude';

/** The installed Claude Code slash command of an agent, or null when the project has none. */
function claudeSlashCommand(targetDir, agent) {
  const file = path.join(targetDir || '.', '.claude', 'commands', 'aioson', 'agent', `${agent.id}.md`);
  return fs.existsSync(file) ? `/aioson:agent:${agent.id}` : null;
}

function activation(targetDir, agent, tool) {
  const slash = tool === 'claude' ? claudeSlashCommand(targetDir, agent) : null;
  return slash || agentActivationLead(agent, tool);
}

function startInstruction(agent, feature, phase) {
  if (agent.id === 'dev' && phase) {
    return `Continue feature ${feature} at phase ${phase}: first run \`aioson dev:resume-data . --feature=${feature} --phase=${phase} --capsule\` and start from that capsule.`;
  }
  if (agent.id === 'dev') {
    return `Continue feature ${feature}: first run \`aioson dev:resume-data . --json\` and resume from its checkpoint.`;
  }
  if (agent.id === 'qa') {
    return `Verify feature ${feature} in this new session: start at your Deterministic preflight with --feature=${feature}; Dev's conversation does not carry over.`;
  }
  return `Continue feature ${feature} from its artifacts on disk.`;
}

/**
 * One harness's kickoff. `agent` is an id or a definition; `phase` counts
 * only for @dev.
 */
function buildKickoff({ targetDir, agent, feature, phase = null, tool }) {
  const definition = typeof agent === 'string' ? getAgentDefinition(agent) : agent;
  if (!definition) throw new Error(`Unknown agent: ${agent}`);
  const harness = String(tool || DEFAULT_KICKOFF_TOOL).trim().toLowerCase();
  const text = `${activation(targetDir, definition, harness)} ${startInstruction(definition, feature, phase)}`;
  return text.replace(/\s+/g, ' ').trim();
}

/** `{ <harness>: kickoff }` for every harness the host registry knows. */
function buildKickoffMap({ targetDir, agent, feature, phase = null }) {
  return Object.fromEntries(listSupportedTools().map((tool) => [tool, buildKickoff({ targetDir, agent, feature, phase, tool })]));
}

/** A `--tool` value the registry knows, lowercased; null otherwise. */
function knownTool(value) {
  const tool = typeof value === 'string' ? value.trim().toLowerCase() : '';
  return tool && getToolCapabilities(tool) ? tool : null;
}

/** The harness a live session was opened with (its state.json), when the registry knows it. */
function liveSessionTool(live) {
  if (!live || !live.sessionDir) return null;
  try {
    const state = JSON.parse(fs.readFileSync(path.join(live.sessionDir, 'state.json'), 'utf8'));
    return knownTool(state.tool_session);
  } catch {
    return null;
  }
}

/** Phase ids in plan order, each once (a plan may number 1, 3, 5). */
function planPhaseIds(planText) {
  return [...new Set(parsePlanPhases(planText).map((phase) => phase.id))];
}

/** `{ ids, unparsed }` — the phase ids in plan order and the phase-like headings no tool reads; null without a plan. */
async function readPlanPhases(targetDir, feature) {
  const plan = await readFeatureArtifactSafe(targetDir, feature, `implementation-plan-${feature}.md`);
  return plan ? { ids: planPhaseIds(plan), unparsed: unparsedPhaseHeadings(plan) } : null;
}

module.exports = {
  DEFAULT_KICKOFF_TOOL,
  buildKickoff,
  buildKickoffMap,
  knownTool,
  liveSessionTool,
  planPhaseIds,
  readPlanPhases
};
