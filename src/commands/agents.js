'use strict';

const path = require('node:path');
const fsp = require('node:fs/promises');
const {
  normalizeAgentName,
  listAgentDefinitions,
  getAgentDefinition,
  resolveInstructionPath,
  buildAgentPrompt
} = require('../agents');
const { normalizeInteractionLanguage } = require('../locales');
const { validateProjectContextFile, getInteractionLanguage } = require('../context');
const { exists } = require('../utils');
const { loadOrCreateState, runWorkflowNext } = require('./workflow-next');
const {
  bootstrapDirectAgentPrompt,
  classifyDirectAgentRuntime
} = require('../execution-gateway');
const { readAutonomyProtocol, resolveEffectiveMode } = require('../autonomy-policy');
const { readAgentManifest, buildAgentCapabilitySummary } = require('../agent-manifests');
const { emitSecurityRuntimeEvent } = require('../lib/security/runtime-events');

const WORKFLOW_AGENT_IDS = new Set([
  'setup',
  'product',
  'analyst',
  'scope-check',
  'architect',
  'ux-ui',
  'pm',
  'orchestrator',
  'dev',
  'qa'
]);
const SCOPE_CHECK_MODES = new Set(['pre-dev', 'post-dev', 'post-fix', 'final']);

function normalizeScopeCheckMode(input) {
  const mode = String(input || '').trim().toLowerCase();
  return SCOPE_CHECK_MODES.has(mode) ? mode : null;
}

function getScopeCheckModeOption(options = {}) {
  return normalizeScopeCheckMode(
    options.scopeMode ||
    options['scope-mode'] ||
    options.checkMode ||
    options['check-mode'] ||
    options.mode
  );
}

function buildScopeCheckActivationContext(options = {}) {
  const mode = getScopeCheckModeOption(options) || 'pre-dev';
  const lines = [`Scope-check mode: ${mode}.`];
  const featureSlug = String(options.feature || options.slug || '').trim();
  if (featureSlug) lines.push(`Feature slug: ${featureSlug}.`);
  if (mode === 'pre-dev') {
    lines.push('Compare user intent against planning artifacts before implementation.');
  } else if (mode === 'post-dev') {
    lines.push('Compare the approved planning artifacts against the actual implementation diff and changed files before QA.');
  } else if (mode === 'post-fix') {
    lines.push('Compare approved scope, QA/tester/pentester findings, and correction diff; confirm the fix did not change product intent.');
  } else if (mode === 'final') {
    lines.push('Reconcile intent, plan, delivered behavior, and remaining exclusions before close/commit/release.');
  }
  return lines.join('\n');
}

function buildTesterActivationContext(options = {}) {
  // Lets `agent:prompt tester --feature=<slug>` pin the slug into the prompt.
  // Without it, @tester resolves the slug via `feature:current`, which returns
  // none once a feature is closed — so a standalone post-close test pass would
  // wrongly fall back to project mode. An explicit slug keeps it feature-scoped.
  const featureSlug = String(options.feature || options.slug || '').trim();
  if (!featureSlug) return '';
  return [
    `Feature slug: ${featureSlug}.`,
    `This is a standalone test pass over the already-implemented feature "${featureSlug}"; write test-plan-${featureSlug}.md and test-inventory-${featureSlug}.md.`,
    'The feature may already be closed — do NOT fall back to project mode or pick a different slug.'
  ].join('\n');
}

// True when the project's workflow.config.json routes @sheldon directly into
// @dev in any sequence — i.e. the lean lane is active. Best-effort + read-only.
async function detectLeanLaneFromConfig(targetDir) {
  try {
    const configPath = path.join(targetDir, '.aioson', 'context', 'workflow.config.json');
    const config = JSON.parse(await fsp.readFile(configPath, 'utf8'));
    const groups = [config.feature, config.project].filter((g) => g && typeof g === 'object');
    for (const group of groups) {
      for (const seq of Object.values(group)) {
        if (!Array.isArray(seq)) continue;
        const norm = seq.map((s) => String(s || '').trim().toLowerCase().replace(/^@/, ''));
        const i = norm.indexOf('sheldon');
        if (i !== -1 && norm[i + 1] === 'dev') return true;
      }
    }
    return false;
  } catch {
    return false;
  }
}

// Deterministic lane signal for a directly-activated @sheldon. When the project
// opted into the lean lane (workflow.config.json routes @sheldon -> @dev) but the
// session is started by hand (slash / agent:prompt, not workflow:next), nothing
// otherwise tells @sheldon to run RF-LEAN — so it falls back to enrichment mode
// and hands to @analyst. This pins the lane into the prompt so the LLM does not
// have to infer it. Empty string ⇒ full chain (unchanged default behavior).
async function buildSheldonActivationContext(targetDir, options) {
  if (!(await detectLeanLaneFromConfig(targetDir))) return '';
  const slug = String(options.feature || options.slug || '').trim() || '{slug}';
  return [
    'Active lane: LEAN (workflow.config.json routes @sheldon -> @dev).',
    `Run RF-LEAN as the single spec authority — in this one pass produce requirements-${slug}.md, spec-${slug}.md (gates A/B/C marked approved), design-doc-${slug}.md, readiness-${slug}.md, implementation-plan-${slug}.md (status: approved), and the §2c RG-* harness-contract for a runtime feature.`,
    'Hand off to @dev when done. Do NOT route to @analyst/@architect/@discovery-design-doc/@pm — they are collapsed into you in this lane.'
  ].join('\n');
}

function normalizePentesterTargetMode(input) {
  const mode = String(input || '').trim().toLowerCase();
  if (!mode) return null;
  if (mode === 'framework_target' || mode === 'app_target') return mode;
  return '__invalid__';
}

function buildPentesterActivationContext(options, t) {
  const targetMode = normalizePentesterTargetMode(options.mode);
  if (targetMode === '__invalid__') {
    throw new Error(t('agents.prompt_invalid_target_mode', { mode: options.mode }));
  }

  const featureSlug = String(options.feature || options.slug || '').trim();
  const scope = String(options.scope || '').trim();

  if (targetMode !== 'app_target' && !targetMode) return '';

  if (targetMode === 'app_target' && !featureSlug) {
    throw new Error(t('agents.prompt_missing_feature_for_app_target'));
  }

  if (targetMode === 'app_target' && !scope) {
    throw new Error(t('agents.prompt_missing_scope_for_app_target'));
  }

  const lines = [`Requested target mode: ${targetMode}.`];
  if (featureSlug) lines.push(`Feature slug: ${featureSlug}.`);
  if (scope) lines.push(`Requested scope: ${scope}.`);

  if (targetMode === 'app_target') {
    lines.push(
      'Use only the app_target surface catalog (`app_target_ownership_idor`, `app_target_secrets_crypto`, `app_target_injection_xss`, `app_target_insecure_design_race`, `app_target_auth_rate_limit`).'
    );
    lines.push(
      'Do not mix framework surfaces unless the feature explicitly touches AIOSON runtime boundaries and you record a `cross_scope_reason`.'
    );
  } else {
    lines.push(
      'Preserve the legacy framework surface catalog (`memory_context`, `tool_invocation`, `delegation_handoff`, `protocol_contract`, `secret_handling`, `runtime_permissions`).'
    );
  }

  return lines.join('\n');
}

async function resolveLocaleForTarget(targetDir, options) {
  const fromOption = options.language || options.lang;
  if (fromOption) return normalizeInteractionLanguage(fromOption);

  const context = await validateProjectContextFile(targetDir);
  if (context.parsed && context.data) {
    return getInteractionLanguage(context.data, 'en');
  }

  return 'en';
}

async function resolveExistingInstructionPath(targetDir, agent, locale) {
  const candidate = resolveInstructionPath(agent, locale);
  const candidateAbs = path.join(targetDir, candidate);
  if (await exists(candidateAbs)) return candidate;
  return agent.path;
}

async function runAgentsList({ args, options, logger, t }) {
  const targetDir = path.resolve(process.cwd(), args[0] || '.');
  const locale = await resolveLocaleForTarget(targetDir, options);
  const agents = listAgentDefinitions();
  logger.log(t('agents.list_title', { locale }));
  for (const agent of agents) {
    const deps = agent.dependsOn.length > 0 ? agent.dependsOn.join(', ') : t('agents.none');
    const instructionPath = await resolveExistingInstructionPath(targetDir, agent, locale);
    logger.log(
      t('agents.agent_line', {
        label: agent.displayName || agent.id,
        command: agent.command,
        id: agent.id
      })
    );
    logger.log(t('agents.path_line', { path: instructionPath }));
    logger.log(t('agents.active_path_line', { path: agent.path }));
    logger.log(t('agents.depends_line', { value: deps }));
    logger.log(t('agents.output_line', { value: agent.output }));
  }

  return { ok: true, targetDir, count: agents.length, agents, locale };
}

async function runAgentPrompt({ args, options, logger, t }) {
  const name = args[0];
  if (!name) {
    throw new Error(t('agents.prompt_usage_error'));
  }

  const agent = getAgentDefinition(name);
  if (!agent) {
    throw new Error(t('agents.prompt_unknown_agent', { agent: name }));
  }

  const targetDir = path.resolve(process.cwd(), args[1] || '.');
  const locale = await resolveLocaleForTarget(targetDir, options);
  const tool = options.tool || 'codex';
  const isHeadless = Boolean(options.headless);

  let routed = false;
  let requestedAgent = normalizeAgentName(agent.id);
  let runtime = null;
  let promptAgent = agent;
  let instructionPath = null;
  let prompt = null;
  let effectiveMode = null;
  let activationContext = '';
  let pentesterTargetMode = null;

  if (!isHeadless && WORKFLOW_AGENT_IDS.has(requestedAgent)) {
    const loaded = await loadOrCreateState(targetDir, options);
    const hasWorkflowStage = Boolean(loaded.state.current || loaded.state.next || loaded.state.sequence.length > 0);
    if (hasWorkflowStage) {
      const workflowResult = await runWorkflowNext({
        args: [targetDir],
        options: {
          ...options,
          tool,
          requestedAgent
        },
        logger: { log() {}, error() {} },
        t
      });

      routed = workflowResult.agent !== requestedAgent;
      runtime = workflowResult.runtime || null;
      promptAgent = getAgentDefinition(workflowResult.agent) || agent;
      instructionPath = workflowResult.instructionPath;
      prompt = workflowResult.prompt;
      effectiveMode = workflowResult.effectiveMode || null;
    }
  }

  if (!prompt) {
    instructionPath = await resolveExistingInstructionPath(targetDir, promptAgent, locale);
    if (promptAgent.id === 'pentester') {
      pentesterTargetMode = normalizePentesterTargetMode(options.mode);
      activationContext = buildPentesterActivationContext(options, t);
    } else if (promptAgent.id === 'scope-check') {
      activationContext = buildScopeCheckActivationContext(options);
    } else if (promptAgent.id === 'tester') {
      activationContext = buildTesterActivationContext(options);
    } else if (promptAgent.id === 'sheldon') {
      activationContext = await buildSheldonActivationContext(targetDir, options);
    }
    const autonomyProtocol = await readAutonomyProtocol(targetDir);
    const manifest = await readAgentManifest(targetDir, promptAgent.id);
    effectiveMode = resolveEffectiveMode({
      protocol: autonomyProtocol,
      tool,
      agentId: promptAgent.id,
      manifest,
      requestedMode: promptAgent.id === 'scope-check' && getScopeCheckModeOption(options) ? null : options.mode || null
    });
    prompt = buildAgentPrompt(promptAgent, tool, {
      instructionPath,
      interactionLanguage: locale,
      autonomyMode: effectiveMode,
      capabilitySummary: buildAgentCapabilitySummary(manifest, tool),
      activationContext
    });
    const runtimeClass = classifyDirectAgentRuntime(promptAgent.id);
    const handoffLabel = runtimeClass.source === 'squad_session'
      ? 'Squad session handoff'
      : runtimeClass.source === 'orchestration'
        ? 'Orchestration handoff'
        : 'Direct agent handoff';
    if (!isHeadless) {
      runtime = await bootstrapDirectAgentPrompt(targetDir, {
        agentName: promptAgent.id,
        tool,
        locale,
        instructionPath,
        prompt,
        title: `${handoffLabel}: @${promptAgent.id}`,
        message: `Prompt generated for @${promptAgent.id}`
      });
    }
  }

  let headlessOutputPath = null;
  if (isHeadless) {
    if (options.output) {
      const fs = require('node:fs');
      headlessOutputPath = path.resolve(targetDir, String(options.output));
      fs.mkdirSync(path.dirname(headlessOutputPath), { recursive: true });
      fs.writeFileSync(headlessOutputPath, prompt, 'utf8');
      logger.log(t('agents.prompt_headless_saved', { path: headlessOutputPath }) || `Headless prompt saved to ${headlessOutputPath}`);
    } else {
      logger.log(prompt);
    }
  } else {
    logger.log(t('agents.prompt_title', { agent: promptAgent.id, tool, locale }));
    logger.log(prompt);
  }

  if (
    promptAgent.id === 'pentester' &&
    pentesterTargetMode === 'app_target' &&
    runtime &&
    runtime.runKey
  ) {
    await emitSecurityRuntimeEvent({
      targetDir,
      runKey: runtime.runKey,
      eventType: 'pentester_app_target_invoked',
      message: `@pentester app_target invoked for ${String(options.feature || options.slug || '').trim()}`,
      status: 'queued',
      payload: {
        target_mode: 'app_target',
        feature_slug: String(options.feature || options.slug || '').trim(),
        target_scope: String(options.scope || '').trim(),
        tool,
        locale
      }
    });
  }

  return {
    ok: true,
    targetDir,
    agent: promptAgent.id,
    requestedAgent,
    routed,
    tool,
    locale,
    instructionPath,
    prompt,
    runtime,
    effectiveMode,
    headless: isHeadless,
    headlessOutputPath
  };
}

module.exports = {
  runAgentsList,
  runAgentPrompt
};
