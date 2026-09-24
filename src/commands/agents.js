'use strict';

const path = require('node:path');
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
const { AUTOPILOT_HANDOFF_STAGES, loadOrCreateState, runWorkflowNext } = require('./workflow-next');
const { resolveAutopilotSignal } = require('../autopilot-signal');
const {
  bootstrapDirectAgentPrompt,
  classifyDirectAgentRuntime
} = require('../execution-gateway');
const { readAutonomyProtocol, resolveEffectiveMode } = require('../autonomy-policy');
const { readAgentManifest, buildAgentCapabilitySummary } = require('../agent-manifests');
const { emitSecurityRuntimeEvent } = require('../lib/security/runtime-events');
const { buildChainActivationContext } = require('../neural-chain-activation');
const { buildAgentContextActivation } = require('../agent-context-activation');
const { resolveTargetDir } = require('../lib/project-root');

const WORKFLOW_AGENT_IDS = new Set([
  'setup',
  'product',
  'sheldon',
  'planner',
  'orchestrator',
  'dev',
  'qa'
]);

function buildTesterActivationContext(options = {}) {
  // Lets `agent:prompt tester --feature=<slug>` pin the slug into the prompt.
  // Without it, @tester resolves the slug via `feature:current`, which returns
  // none once a feature is closed — so a standalone post-close test pass would
  // wrongly fall back to project mode. An explicit slug keeps it feature-scoped.
  const featureSlug = String(options.feature || options.slug || '').trim();
  if (!featureSlug) return '';
  return [
    `Feature slug: ${featureSlug}.`,
    `This is a standalone test pass over the already-implemented feature "${featureSlug}"; write only test-report-${featureSlug}.md as the review/correction artifact.`,
    'The feature may already be closed — do NOT fall back to project mode or pick a different slug.'
  ].join('\n');
}

// Direct activations receive the same streamlined contract as tracked runs.
function buildSheldonActivationContext(options) {
  const slug = String(options.feature || options.slug || '').trim() || '{slug}';
  return [
    'Active lane: STREAMLINED.',
    `Review and enrich prd-${slug}.md in place, add concrete acceptance criteria, preserve any referenced prototype, and set sheldon_review: approved.`,
    'Do not create requirements, spec, design-doc, readiness, implementation-plan, conformance, decision-checkpoint, or harness artifacts.',
    'Hand off to @planner. Legacy specialists are opt-in only for a named unresolved decision.'
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
      'Use the complete app_target catalog: `app_target_recon_attack_surface`, `app_target_config_deployment`, `app_target_ownership_idor`, `app_target_auth_rate_limit`, `app_target_session_csrf`, `app_target_injection_xss`, `app_target_secrets_crypto`, `app_target_insecure_design_race`, `app_target_integrity_supply_chain`, `app_target_logging_monitoring`, and `app_target_error_exception`; add `app_target_ssrf`, `app_target_file_upload_parser`, `app_target_browser_exposure`, `app_target_api_realtime`, `app_target_cloud_host`, `app_target_native_client`, and `app_target_llm_agentic` when evidence triggers them.'
    );
    lines.push(
      'Create all ten OWASP Top 10:2025 roll-up rows and every applicable WSTG/ASVS/API/LLM/mobile/native row. Record `passed`, `finding`, `not_applicable`, or `not_tested` with evidence, including coverage by source path/module and sanitized URL/route/method.'
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
  const targetDir = resolveTargetDir(args);
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

  const targetDir = resolveTargetDir(args[1]);
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
    } else if (promptAgent.id === 'tester') {
      activationContext = buildTesterActivationContext(options);
    } else if (promptAgent.id === 'sheldon') {
      activationContext = buildSheldonActivationContext(options);
    }
    const contextTask = String(options.task || options.goal || '').trim();
    const generatedContext = await buildAgentContextActivation(targetDir, {
      agent: promptAgent.id,
      mode: 'planning',
      task: contextTask,
      feature: options.feature || options.slug || ''
    });
    const chainActivationContext = await buildChainActivationContext(targetDir, {
      agent: promptAgent.id,
      featureSlug: options.feature ? String(options.feature).trim() : null
    });
    activationContext = [activationContext, generatedContext, chainActivationContext].filter(Boolean).join('\n\n');
    const autonomyProtocol = await readAutonomyProtocol(targetDir);
    const manifest = await readAgentManifest(targetDir, promptAgent.id);
    effectiveMode = resolveEffectiveMode({
      protocol: autonomyProtocol,
      tool,
      agentId: promptAgent.id,
      manifest,
      requestedMode: options.mode || null
    });
    // Direct handoffs carry the autopilot exception too — without it the
    // injected scope boundary instructs a manual stop and overrides the agent
    // .md's autopilot section even when the flag/scheme says to chain.
    let autoHandoff = false;
    if (AUTOPILOT_HANDOFF_STAGES.has(promptAgent.id)) {
      try {
        const signal = await resolveAutopilotSignal(targetDir, {
          slug: options.feature ? String(options.feature).trim() : null,
          auto: options.auto === true,
          step: options.step === true
        });
        autoHandoff = signal.enabled;
      } catch {
        autoHandoff = false;
      }
    }
    prompt = buildAgentPrompt(promptAgent, tool, {
      instructionPath,
      interactionLanguage: locale,
      autonomyMode: effectiveMode,
      capabilitySummary: buildAgentCapabilitySummary(manifest, tool),
      activationContext,
      autoHandoff,
      // The benchmark agent is the measured-traversal orchestrator: its
      // wrapper must authorize conducting the chain instead of ordering the
      // manual-stop handoff (the Cockpit freezes this exact prompt per round).
      orchestration: promptAgent.id === 'benchmark' ? 'benchmark-traversal' : ''
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
