'use strict';

/**
 * aioson session:kickoff [dir] --agent=<id> --feature=<slug> [--phase=<n>] [--tool=<harness>] [--json]
 *
 * Prints the one line that starts `--agent` in a NEW conversation of
 * `--tool` and tells it where to begin: @dev on `--phase` compiles that
 * phase's capsule first, @qa starts at its Deterministic preflight, any other
 * agent resumes the feature from disk (src/lib/session-kickoff.js). The Play
 * types this text into the session it reopens and never composes one itself.
 *
 * `--phase` counts only for @dev and must be a phase of
 * implementation-plan-<slug>.md. Without `--tool`, the harness of the live
 * session that runs this command, else claude. Writes nothing.
 */

const { getAgentDefinition } = require('../agents');
const { isValidSlug } = require('../dossier/schema');
const { resolveTargetDir } = require('../lib/project-root');
const { resolveRuntimePaths } = require('../runtime-store');
const { listSupportedTools } = require('../lib/tool-capabilities');
const {
  DEFAULT_KICKOFF_TOOL,
  buildKickoff,
  knownTool,
  liveSessionTool,
  readPlanPhases
} = require('../lib/session-kickoff');

// A flag with no value parses as `true`, and that is no value here.
function optionText(value) {
  return typeof value === 'string' || typeof value === 'number' ? String(value).trim() : '';
}

function refusal(options, logger) {
  return (reason, message, extra = {}) => {
    if (!options.json && logger) logger.error(message);
    return { ok: false, reason, ...extra };
  };
}

/** The live session that launched this process (same resolution as hooks:emit), or null. */
async function launcherLiveSession(targetDir) {
  const { resolveLauncherLiveSession } = require('./live');
  const { runtimeDir } = resolveRuntimePaths(targetDir);
  return resolveLauncherLiveSession(targetDir, runtimeDir).catch(() => null);
}

/**
 * The harness a kickoff is written for: `--tool` when the registry knows it,
 * else the live session's own, else claude. `{ error }` for an unknown `--tool`.
 */
async function resolveKickoffTool(targetDir, option, live) {
  const requested = optionText(option);
  if (requested) {
    const tool = knownTool(requested);
    return tool ? { tool } : { error: requested };
  }
  const session = live === undefined ? await launcherLiveSession(targetDir) : live;
  return { tool: liveSessionTool(session) || DEFAULT_KICKOFF_TOOL };
}

/** A phase id of the feature's plan, normalized (`03` → `3`), or a refusal. */
async function resolvePlanPhase(targetDir, feature, value, refuse, flag) {
  const raw = optionText(value);
  if (!/^\d+$/.test(raw)) return { refused: refuse(`invalid_${flag}`, `--${flag}=<n> must be a phase number of the plan.`) };
  const read = await readPlanPhases(targetDir, feature);
  if (!read) return { refused: refuse('plan_not_found', `No implementation plan for ${feature}.`) };
  const phases = read.ids;
  // A phase the tools cannot see would be skipped in silence: the order is not trusted until the heading is fixed.
  if (read.unparsed.length > 0) {
    const headings = read.unparsed.map((item) => `"${item.heading}"`).join(', ');
    return { refused: refuse('plan_heading_unparsed', `implementation-plan-${feature}.md has phase headings no phase tool reads: ${headings}. Write each as "## Phase <n> — title" (or ":" / "-") and run this again.`, { phases, unparsed: read.unparsed }) };
  }
  const id = String(Number(raw));
  if (!phases.includes(id)) {
    return { refused: refuse('unknown_phase', `Phase ${id} is not in implementation-plan-${feature}.md. Phases: ${phases.join(', ') || 'none'}.`, { phases }) };
  }
  return { id, phases };
}

async function runSessionKickoff({ args = [], options = {}, logger } = {}) {
  const targetDir = resolveTargetDir(args);
  const refuse = refusal(options, logger);

  const agentName = optionText(options.agent);
  if (!agentName) return refuse('missing_agent', '--agent=<id> is required.');
  const agent = getAgentDefinition(agentName);
  if (!agent) return refuse('unknown_agent', `Unknown agent: ${agentName}.`);

  const feature = optionText(options.feature || options.slug);
  if (!feature) return refuse('missing_feature', '--feature=<slug> is required.');
  if (!isValidSlug(feature)) return refuse('invalid_feature', `Not a feature slug: ${feature}.`);

  const resolved = await resolveKickoffTool(targetDir, options.tool);
  if (resolved.error) {
    return refuse('unknown_tool', `Unknown harness: ${resolved.error}. Known: ${listSupportedTools().join(', ')}.`, { tools: listSupportedTools() });
  }

  let phase = null;
  // A bare `--phase` is a phase that was meant and lost, not "no phase".
  if (agent.id === 'dev' && options.phase !== undefined) {
    const checked = await resolvePlanPhase(targetDir, feature, options.phase, refuse, 'phase');
    if (checked.refused) return checked.refused;
    phase = checked.id;
  }

  const kickoff = buildKickoff({ targetDir, agent, feature, phase, tool: resolved.tool });
  if (!options.json && logger) logger.log(kickoff);
  return { ok: true, agent: agent.id, feature, phase: phase === null ? null : Number(phase), tool: resolved.tool, kickoff };
}

module.exports = {
  runSessionKickoff,
  resolveKickoffTool,
  resolvePlanPhase,
  launcherLiveSession,
  optionText
};
