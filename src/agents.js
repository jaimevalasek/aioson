'use strict';

const { AGENT_DEFINITIONS } = require('./constants');

function normalizeAgentName(input) {
  return String(input || '')
    .trim()
    .toLowerCase()
    .replace(/^@/, '');
}

function getAgentDefinition(name) {
  const normalized = normalizeAgentName(name);
  return AGENT_DEFINITIONS.find((agent) => {
    if (agent.id === normalized) return true;
    return Array.isArray(agent.aliases) && agent.aliases.includes(normalized);
  }) || null;
}

function listAgentDefinitions() {
  return [...AGENT_DEFINITIONS];
}

function resolveInstructionPath(agent, locale) {
  return agent.path;
}

function buildAgentPrompt(agent, tool, options = {}) {
  const safeTool = String(tool || 'codex').toLowerCase();
  const instructionPath = options.instructionPath || agent.path;
  const targetDir = options.targetDir ? String(options.targetDir) : '.';
  const interactionLanguage = String(options.interactionLanguage || 'en');
  const autonomyMode = String(options.autonomyMode || '').trim();
  const autoHandoff = options.autoHandoff === true;
  const capabilitySummary = String(options.capabilitySummary || '').trim();
  const activationContext = String(options.activationContext || '').trim();
  const dependsOn = Array.isArray(options.dependsOn) ? options.dependsOn : agent.dependsOn;
  const dependencyText =
    dependsOn.length > 0
      ? `Check required context files first: ${dependsOn.join(', ')}.`
      : 'No prerequisite context files are required.';
  const activationBlock = activationContext
    ? [
      '',
      '## Activation Context',
      '',
      activationContext
    ].join('\n')
    : '';

  const autonomyBlock = [
    '',
    '## Autonomy Contract',
    '',
    `**Autonomy mode:** ${autonomyMode || 'guarded'}. Respect this as the maximum automation level allowed for this activation.`,
    capabilitySummary ? `**Capability summary:** ${capabilitySummary}` : '**Capability summary:** No manifest declared for this agent in the current workspace.'
  ].join('\n');

  const lifecycleBlock = [
    '',
    '',
    '## AIOSON Runtime boundary — mandatory, do not skip',
    '',
    '> Runtime persistence belongs to the AIOSON gateway. Do not try to replay telemetry manually with `aioson runtime-log` shell snippets from inside the agent session.',
    '',
    '> If the user needs dashboard-visible tracked execution in an external client, they must enter through `aioson workflow:next` or `aioson agent:prompt` before continuing.',
    '',
    `**Language boundary:** Agent instructions are canonical in English. All user-facing communication must be in ${interactionLanguage}.`,
    '',
    `**Scope boundary:** You operate exclusively as ${agent.command}. Do not perform work that belongs to another agent. When your work is complete, output only the handoff — which agent is next and why. Do not continue into that agent\'s territory.${autoHandoff ? ' Exception: autopilot handoff is active for this stage — follow `.aioson/docs/autopilot-handoff.md` and auto-invoke the next agent\'s skill when no stop condition applies. The chain runs the whole feature: the spec authority (`@sheldon`/`@orchestrator`) seeds the agentic scheme and crosses into `@dev` via the `dev-state.md` cold-start packet once its own gates/decisions are settled, and the post-dev review cycle (`@dev` → initial `@qa` → enabled/triggered `@tester`/`@pentester` → final `@qa` → enabled `@validator`) continues automatically. Specialists own bounded corrections; `@dev` re-enters only for consolidated cross-cutting work. It stops only for a genuine human decision or a stop condition, and NEVER auto-runs `feature:close`/publish — those require explicit human approval.' : ''}`,
  ].join('\n');

  if (safeTool === 'claude') {
    return `Read ${instructionPath} and execute ${agent.command}. ${dependencyText}${activationBlock}\n\nWrite output to ${agent.output}.${autonomyBlock}${lifecycleBlock}`;
  }

  if (safeTool === 'opencode') {
    return `Use agent "${agent.id}" from ${instructionPath}. ${dependencyText}${activationBlock}\n\nSave output to ${agent.output}.${autonomyBlock}${lifecycleBlock}`;
  }

  return `Read AGENTS.md and execute ${agent.command} using ${instructionPath}. ${dependencyText}${activationBlock}\n\nSave output to ${agent.output}.${autonomyBlock}${lifecycleBlock}`;
}

module.exports = {
  normalizeAgentName,
  getAgentDefinition,
  listAgentDefinitions,
  resolveInstructionPath,
  buildAgentPrompt
};
