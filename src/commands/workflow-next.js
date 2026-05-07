'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const { getAgentDefinition, resolveInstructionPath, buildAgentPrompt } = require('../agents');
const { normalizeInteractionLanguage } = require('../locales');
const { validateProjectContextFile, getInteractionLanguage } = require('../context');
const { exists, ensureDir } = require('../utils');
const { syncWorkflowRuntime } = require('../execution-gateway');
const { writeHandoff, buildWorkflowHandoff, buildWorkflowHandoffProtocol } = require('../session-handoff');
const { runTechnicalGate, formatGateError } = require('../workflow-gates');
const { buildTestBriefing } = require('../test-briefing');
const { validateHandoffContract, formatContractError, getBlockingRevisions } = require('../handoff-contract');
const { buildPathGuardBlock } = require('../path-guard');
const { logError, buildHealingPrompt } = require('../self-healing');
const { validateHandoffProtocol } = require('../handoff-validator');
const { readAutonomyProtocol, resolveEffectiveMode } = require('../autonomy-policy');
const { readAgentManifest, buildAgentCapabilitySummary } = require('../agent-manifests');
const { inspectStagedChanges } = require('../lib/git-commit-guard');
const { emitSecurityRuntimeEvent } = require('../lib/security/runtime-events');
const { runSecurityAudit } = require('./security-audit');
const dossierBootstrap = require('../dossier/dossier-bootstrap');
const dossierStore = require('../dossier/store');
const { emitDossierEvent } = require('../lib/dossier-telemetry');

const STATE_RELATIVE_PATH = '.aioson/context/workflow.state.json';
const CONFIG_RELATIVE_PATH = '.aioson/context/workflow.config.json';
const EVENTS_RELATIVE_PATH = '.aioson/context/workflow.events.jsonl';

const DEFAULT_FEATURE_WORKFLOW_BY_CLASSIFICATION = {
  MICRO: ['product', 'dev', 'qa'],
  SMALL: ['product', 'analyst', 'dev', 'qa'],
  MEDIUM: ['product', 'analyst', 'dev', 'pentester', 'qa']
};

function normalizeAgentName(input) {
  return String(input || '')
    .trim()
    .toLowerCase()
    .replace(/^@/, '');
}

function normalizeClassification(value, fallback = 'MICRO') {
  const text = String(value || '').trim().toUpperCase();
  if (text === 'MICRO' || text === 'SMALL' || text === 'MEDIUM') return text;
  return fallback;
}

function buildDefaultWorkflowConfig() {
  return {
    version: 1,
    project: {
      MICRO: ['setup', 'dev'],
      SMALL: ['setup', 'product', 'analyst', 'architect', 'dev', 'qa'],
      MEDIUM: ['setup', 'product', 'analyst', 'architect', 'ux-ui', 'pm', 'orchestrator', 'dev', 'qa']
    },
    feature: DEFAULT_FEATURE_WORKFLOW_BY_CLASSIFICATION,
    rules: {
      required: ['dev'],
      allowDetours: true
    }
  };
}

function parseFeaturesMarkdown(markdown) {
  return String(markdown || '')
    .split(/\r?\n/)
    .slice(3)
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => line.startsWith('|'))
    .map((line) => line.split('|').map((part) => part.trim()))
    .filter((parts) => parts.length >= 5)
    .map((parts) => ({
      slug: parts[1],
      status: parts[2],
      started: parts[3],
      completed: parts[4]
    }))
    .filter((row) => row.slug && row.slug !== 'slug')
    .filter((row) => !/^-+$/ .test(row.slug));
}

async function readJsonIfExists(filePath) {
  if (!(await exists(filePath))) return null;
  const content = await fs.readFile(filePath, 'utf8');
  return JSON.parse(content);
}

async function writeJson(filePath, payload) {
  await ensureDir(path.dirname(filePath));
  await fs.writeFile(filePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

async function appendJsonLine(filePath, payload) {
  await ensureDir(path.dirname(filePath));
  await fs.appendFile(filePath, `${JSON.stringify(payload)}\n`, 'utf8');
}

function buildWorkflowEventMessage({ created, state, activation, completedStage, options }) {
  const requestedAgent = options.requestedAgent ? normalizeAgentName(options.requestedAgent) : null;
  if (requestedAgent && activation.agent && requestedAgent !== activation.agent) {
    return `Workflow enforced @${activation.agent} after direct request for @${requestedAgent}.`;
  }
  if (completedStage && activation.agent) {
    return `Completed @${completedStage}. Next stage ready: @${activation.agent}.`;
  }
  if (completedStage && !activation.agent) {
    return `Completed @${completedStage}. Workflow has no pending stage.`;
  }
  if (state.detour && state.detour.active) {
    return `Detour started with @${state.detour.agent}. Return to ${
      state.detour.returnTo ? `@${state.detour.returnTo}` : 'the main flow'
    }.`;
  }
  if (options.skip && activation.agent) {
    return `Workflow advanced to @${activation.agent} after skip.`;
  }
  if (activation.agent) {
    return created
      ? `Workflow initialized at @${activation.agent}.`
      : `Stage @${activation.agent} is active.`;
  }
  return 'Workflow has no pending stage.';
}

function buildWorkflowEventType({ completedStage, state, activation, options }) {
  const requestedAgent = options.requestedAgent ? normalizeAgentName(options.requestedAgent) : null;
  if (requestedAgent && activation.agent && requestedAgent !== activation.agent) return 'routed';
  if (completedStage) return 'completed';
  if (state.detour && state.detour.active) return 'workflow';
  if (options.skip) return 'workflow';
  if (activation.agent) return 'start';
  return 'workflow';
}

async function appendWorkflowEvent(targetDir, payload) {
  const eventsPath = path.join(targetDir, EVENTS_RELATIVE_PATH);
  await appendJsonLine(eventsPath, payload);
  return eventsPath;
}

async function readWorkflowConfig(targetDir) {
  const configPath = path.join(targetDir, CONFIG_RELATIVE_PATH);
  const userConfig = await readJsonIfExists(configPath);
  const base = buildDefaultWorkflowConfig();
  if (!userConfig || typeof userConfig !== 'object') {
    return { configPath, config: base, exists: false };
  }

  const merged = {
    ...base,
    ...userConfig,
    project: {
      ...base.project,
      ...(userConfig.project || {})
    },
    feature: {
      ...base.feature,
      ...(userConfig.feature || {})
    },
    rules: {
      ...base.rules,
      ...(userConfig.rules || {})
    }
  };

  return { configPath, config: merged, exists: true };
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

async function detectWorkflowMode(targetDir) {
  const prdPath = path.join(targetDir, '.aioson/context/prd.md');
  const featuresPath = path.join(targetDir, '.aioson/context/features.md');
  const hasProjectPrd = await exists(prdPath);
  const featuresMarkdown = await fs.readFile(featuresPath, 'utf8').catch(() => '');
  const features = parseFeaturesMarkdown(featuresMarkdown);
  const activeFeature = features.find((feature) => feature.status === 'in_progress') || null;

  if (activeFeature) {
    return {
      mode: 'feature',
      featureSlug: activeFeature.slug,
      features
    };
  }

  return {
    mode: hasProjectPrd ? 'project' : 'project',
    featureSlug: null,
    features
  };
}

function getSequenceForMode(config, mode, classification) {
  const group = mode === 'feature' ? config.feature : config.project;
  const sequence = group[normalizeClassification(classification, 'MICRO')];
  return Array.isArray(sequence) && sequence.length > 0 ? [...sequence] : [];
}

async function validateStageArtifacts(targetDir, state, stage) {
  const base = path.join(targetDir, '.aioson/context');
  const slug = state.featureSlug;

  if (stage === 'setup') {
    const context = await validateProjectContextFile(targetDir);
    return context.valid;
  }

  if (stage === 'product') {
    if (state.mode === 'feature' && slug) {
      const prdFeature = path.join(base, `prd-${slug}.md`);
      const prdFix = path.join(base, `prd-${slug}-fix.md`);
      return (await exists(prdFeature)) || (await exists(prdFix));
    }
    return await exists(path.join(base, 'prd.md'));
  }

  if (stage === 'analyst') {
    if (state.mode === 'feature' && slug) {
      const requirements = path.join(base, `requirements-${slug}.md`);
      const spec = path.join(base, `spec-${slug}.md`);
      return (await exists(requirements)) && (await exists(spec));
    }
    return await exists(path.join(base, 'discovery.md'));
  }

  if (stage === 'architect') {
    return await exists(path.join(base, 'architecture.md'));
  }

  if (stage === 'ux-ui') {
    return await exists(path.join(base, 'ui-spec.md'));
  }

  if (stage === 'orchestrator') {
    return await exists(path.join(base, 'parallel'));
  }

  return true;
}

function isRequiredAgent(config, agentName) {
  return Array.isArray(config.rules?.required)
    ? config.rules.required.map(normalizeAgentName).includes(agentName)
    : false;
}

function buildStatePayload(input) {
  return {
    version: 1,
    mode: input.mode,
    classification: input.classification,
    sequence: input.sequence,
    current: input.current || null,
    next: input.next || null,
    completed: Array.isArray(input.completed) ? input.completed : [],
    skipped: Array.isArray(input.skipped) ? input.skipped : [],
    featureSlug: input.featureSlug || null,
    detour: input.detour || null,
    updatedAt: new Date().toISOString()
  };
}

function findNextFromSequence(sequence, completed, skipped) {
  const done = new Set([...(completed || []), ...(skipped || [])].map(normalizeAgentName));
  return sequence.find((stage) => !done.has(normalizeAgentName(stage))) || null;
}

function reconcileWorkflowState(state) {
  if (!state || typeof state !== 'object' || !Array.isArray(state.sequence)) {
    return { state, changed: false };
  }

  const sequence = state.sequence.map(normalizeAgentName);
  const completed = Array.from(new Set((state.completed || []).map(normalizeAgentName).filter(Boolean)));
  const skippedSet = new Set((state.skipped || []).map(normalizeAgentName).filter(Boolean));
  const detour = state.detour && typeof state.detour === 'object'
    ? {
        ...state.detour,
        agent: normalizeAgentName(state.detour.agent),
        returnTo: normalizeAgentName(state.detour.returnTo)
      }
    : null;
  let changed = false;

  // If a later stage is already completed, any unresolved earlier stage was
  // effectively bypassed outside the workflow and must not remain "active".
  const furthestCompletedIndex = sequence.reduce((max, stage, index) => (
    completed.includes(stage) ? Math.max(max, index) : max
  ), -1);

  if (furthestCompletedIndex >= 0) {
    for (let index = 0; index < furthestCompletedIndex; index += 1) {
      const stage = sequence[index];
      if (!completed.includes(stage) && !skippedSet.has(stage)) {
        skippedSet.add(stage);
        changed = true;
      }
    }
  }

  const skipped = sequence.filter((stage) => skippedSet.has(stage));
  const resolved = new Set([...completed, ...skipped]);
  let current = state.current ? normalizeAgentName(state.current) : null;
  let next = state.next ? normalizeAgentName(state.next) : null;
  const currentIsActiveDetour = Boolean(
    detour &&
    detour.active &&
    current &&
    current === detour.agent
  );

  if (current && ((!sequence.includes(current) && !currentIsActiveDetour) || resolved.has(current))) {
    current = null;
    changed = true;
  }

  if (!detour || !detour.active) {
    if (current) {
      const currentIndex = sequence.indexOf(current);
      const expectedQueuedNext = sequence.find(
        (stage, index) => index > currentIndex && !resolved.has(stage)
      ) || null;
      if (next && next !== current && next !== expectedQueuedNext) {
        next = expectedQueuedNext || current;
        changed = true;
      } else if (!next) {
        next = expectedQueuedNext || current;
        changed = true;
      }
    } else {
      const inferredNext = findNextFromSequence(sequence, completed, skipped);
      if (next !== inferredNext) {
        next = inferredNext;
        changed = true;
      }
    }
  }

  if (!changed) {
    return { state, changed: false };
  }

  return {
    changed: true,
    state: buildStatePayload({
      ...state,
      sequence,
      completed,
      skipped,
      current,
      next,
      detour
    })
  };
}

function isInferableStage(stage) {
  return ['setup', 'product', 'analyst', 'architect', 'ux-ui', 'orchestrator'].includes(
    normalizeAgentName(stage)
  );
}

function isSecurityGateBlocked(contractCheck, state, stageName) {
  if (normalizeAgentName(stageName) !== 'qa' || state.mode !== 'feature' || !state.featureSlug) {
    return false;
  }
  return contractCheck.missing.some((item) =>
    item.includes('security:') ||
    item.includes(`security-findings-${state.featureSlug}.json`)
  );
}

function buildQaSecurityAuditBriefing(result, targetDir) {
  if (!result) return '';

  if (result.ok === false && result.reason) {
    return [
      '## Secure by Default audit',
      `- Auto-run failed before QA review: ${result.reason}.`,
      '- Gate D will remain blocked until a valid `security-findings-{slug}.json` artifact exists.',
      '- If CLI is unavailable in your client, use the fallback checklist and record the limitation explicitly in the QA report and `project-pulse.md`.'
    ].join('\n');
  }

  return [
    '## Secure by Default audit',
    `- Auto-ran \`security:audit\` for feature \`${result.slug}\` at QA activation.`,
    `- Exit code: ${result.exitCode}. Findings: ${result.findingsCount}.`,
    `- Summary: critical=${result.summary.critical}, high=${result.summary.high}, medium=${result.summary.medium}, low=${result.summary.low}, inconclusive=${result.summary.inconclusive}.`,
    `- Artifact: \`${path.relative(targetDir, result.artifactPath)}\`.`,
    '- If the audit or manual heuristics indicate auth, money, or ownership risk, invoke `@pentester` with `--mode=app_target --feature=<slug> --scope=<target>` before final Gate D sign-off.',
    '- If CLI is unavailable in your client, use the fallback checklist and record the limitation explicitly in the QA report and `project-pulse.md`.'
  ].join('\n');
}

async function inferCompletedStages(targetDir, draftState) {
  const completed = [];
  for (const stage of draftState.sequence) {
    if (!isInferableStage(stage)) break;
    const valid = await validateStageArtifacts(targetDir, draftState, stage);
    if (!valid) break;
    completed.push(normalizeAgentName(stage));
  }
  return completed;
}

async function loadOrCreateState(targetDir, options = {}) {
  const statePath = path.join(targetDir, STATE_RELATIVE_PATH);
  const existing = await readJsonIfExists(statePath);
  if (existing && typeof existing === 'object' && Array.isArray(existing.sequence)) {
    const reconciled = reconcileWorkflowState(existing);
    if (reconciled.changed) {
      await writeJson(statePath, reconciled.state);
    }
    return { statePath, state: reconciled.state, created: false };
  }

  const context = await validateProjectContextFile(targetDir);
  const classification = normalizeClassification(
    options.classification || (context.data && context.data.classification) || 'MICRO',
    'MICRO'
  );
  const modeInfo = await detectWorkflowMode(targetDir);
  const { config } = await readWorkflowConfig(targetDir);
  const sequence = getSequenceForMode(config, modeInfo.mode, classification);
  const draftState = buildStatePayload({
    mode: modeInfo.mode,
    classification,
    sequence,
    current: null,
    next: null,
    completed: [],
    skipped: [],
    featureSlug: modeInfo.featureSlug,
    detour: null
  });
  const completed = await inferCompletedStages(targetDir, draftState);
  const next = findNextFromSequence(sequence, completed, []);
  const state = buildStatePayload({
    mode: modeInfo.mode,
    classification,
    sequence,
    current: null,
    next,
    completed,
    skipped: [],
    featureSlug: modeInfo.featureSlug,
    detour: null
  });

  await writeJson(statePath, state);
  return { statePath, state, created: true };
}

async function persistState(targetDir, nextState) {
  const statePath = path.join(targetDir, STATE_RELATIVE_PATH);
  await writeJson(statePath, nextState);
  return statePath;
}

function ensureAgentInSequence(state, agentName) {
  if (state.sequence.includes(agentName)) return;
  throw new Error(`Agent ${agentName} is not part of the active workflow sequence.`);
}

function ensureSkippableTarget(config, state, targetAgent) {
  const normalizedTarget = normalizeAgentName(targetAgent);
  ensureAgentInSequence(state, normalizedTarget);

  const currentIndex = state.next ? state.sequence.indexOf(state.next) : -1;
  const targetIndex = state.sequence.indexOf(normalizedTarget);
  const devIndex = state.sequence.indexOf('dev');

  if (currentIndex === -1) {
    throw new Error('No next stage is available to skip from.');
  }
  if (targetIndex === -1 || targetIndex < currentIndex) {
    throw new Error(`Cannot skip backwards to ${targetAgent}.`);
  }
  if (normalizedTarget === 'dev') return;
  if (devIndex !== -1 && targetIndex > devIndex) {
    throw new Error('Cannot skip past @dev because @dev is mandatory.');
  }
  if (isRequiredAgent(config, normalizedTarget) && normalizedTarget !== 'dev') {
    return;
  }
}

async function finalizeCurrentStage(targetDir, config, state, stageName) {
  const normalizedStage = normalizeAgentName(stageName || state.current || state.next);
  if (!normalizedStage) {
    throw new Error('No stage is active to complete.');
  }

  // ── Harness Done Gate ───────────────────────────────────────────────────
  if (state.mode === 'feature' && state.featureSlug) {
    const contractPath = path.join(targetDir, '.aioson', 'plans', state.featureSlug, 'harness-contract.json');
    const progressPath = path.join(targetDir, '.aioson', 'plans', state.featureSlug, 'progress.json');
    
    // Se contrato existe, verificamos o progresso
    const fs = require('node:fs');
    if (fs.existsSync(contractPath) && fs.existsSync(progressPath)) {
      try {
        const progress = JSON.parse(fs.readFileSync(progressPath, 'utf8'));
        // Bloqueia se não estiver pronto para o gate E o estágio for crítico (dev/qa)
        if (!progress.ready_for_done_gate && (normalizedStage === 'dev' || normalizedStage === 'qa')) {
          throw new Error(`[Harness Block] A feature "${state.featureSlug}" não passou na validação contratual. Execute 'aioson harness:validate' e resolva os problemas antes de concluir o estágio @${normalizedStage}.`);
        }
      } catch (err) {
        if (err.message.includes('[Harness Block]')) throw err;
        // Se erro de parse, ignoramos para não quebrar o workflow por corrupção
      }
    }
  }

  if (state.detour && state.detour.active && normalizeAgentName(state.detour.agent) === normalizedStage) {
    const validDetour = await validateStageArtifacts(targetDir, state, normalizedStage);
    if (!validDetour) {
      throw new Error(`Cannot complete detour ${normalizedStage}; expected artifacts are missing.`);
    }
    const nextState = buildStatePayload({
      ...state,
      current: null,
      next: state.detour.returnTo,
      detour: null
    });
    return { state: nextState, completedStage: normalizedStage };
  }

  ensureAgentInSequence(state, normalizedStage);
  const valid = await validateStageArtifacts(targetDir, state, normalizedStage);
  if (!valid) {
    throw new Error(`Cannot complete ${normalizedStage}; expected artifacts are missing.`);
  }

  // ── Handoff Contract Gate ───────────────────────────────────────────────
  const contractCheck = await validateHandoffContract(targetDir, state, normalizedStage);
  if (!contractCheck.ok) {
    if (isSecurityGateBlocked(contractCheck, state, normalizedStage)) {
      await emitSecurityRuntimeEvent({
        targetDir,
        eventType: 'security_gate_blocked',
        message: `Gate D blocked for ${state.featureSlug} at @qa`,
        status: 'failed',
        agentName: 'qa',
        source: 'workflow',
        workflowState: state,
        workflowStage: 'qa',
        payload: {
          feature_slug: state.featureSlug,
          classification: state.classification,
          blockers: contractCheck.missing
        }
      });
    }
    const errMsg = formatContractError(contractCheck);
    await logError(targetDir, normalizedStage, errMsg, 'contract');
    throw new Error(errMsg);
  }

  // ── Revision Gate (Phase 2) ─────────────────────────────────────────────
  const blockingRevisions = await getBlockingRevisions(targetDir, state.featureSlug);
  if (blockingRevisions.length > 0) {
    const ids = blockingRevisions.map((r) => r.id).join(', ');
    const errMsg = [
      `[Revision Gate BLOCKED]`,
      `Feature: ${state.featureSlug}`,
      ``,
      `Pending blocking revision(s): ${ids}`,
      ``,
      `Resolve each revision before completing this stage:`,
      ...blockingRevisions.map((r) => `  aioson revision:resolve . --slug=${state.featureSlug} --rev-id=${r.id} --approve|--reject`)
    ].join('\n');
    await logError(targetDir, normalizedStage, errMsg, 'revision');
    throw new Error(errMsg);
  }

  // ── Technical Compilation/Test Gate ─────────────────────────────────────
  const techGate = await runTechnicalGate(targetDir, normalizedStage);
  if (!techGate.ok) {
    const errMsg = formatGateError(techGate);
    await logError(targetDir, normalizedStage, errMsg, 'technical');
    throw new Error(errMsg);
  }

  const completed = Array.from(new Set([...(state.completed || []), normalizedStage]));
  const next = findNextFromSequence(state.sequence, completed, state.skipped || []);
  const nextState = buildStatePayload({
    ...state,
    completed,
    current: null,
    next,
    detour: null
  });

  return { state: nextState, completedStage: normalizedStage };
}

function applySkip(config, state, target) {
  const normalizedTarget = normalizeAgentName(target);
  ensureSkippableTarget(config, state, normalizedTarget);
  const currentIndex = state.sequence.indexOf(state.next);
  const targetIndex = state.sequence.indexOf(normalizedTarget);
  const toSkip = state.sequence.slice(currentIndex, targetIndex);
  if (toSkip.some((agent) => normalizeAgentName(agent) === 'dev')) {
    throw new Error('Cannot skip @dev because it is mandatory.');
  }

  const skipped = Array.from(new Set([...(state.skipped || []), ...toSkip]));
  return buildStatePayload({
    ...state,
    skipped,
    current: null,
    next: normalizedTarget
  });
}

async function ensureFeatureDossier(targetDir, state) {
  if (state.mode !== 'feature' || !state.featureSlug) return;
  const classification = String(state.classification || '').toUpperCase();
  if (classification !== 'SMALL' && classification !== 'MEDIUM') return;

  const ctxDir = path.join(targetDir, '.aioson', 'context');
  const dossierFile = path.join(ctxDir, 'features', state.featureSlug, 'dossier.md');
  try {
    await fs.access(dossierFile);
    return;
  } catch {
    // proceed to create
  }

  let mode = null;
  try {
    await dossierBootstrap.initFromExisting({
      slug: state.featureSlug,
      contextDir: ctxDir,
      classification,
      targetDir
    });
    mode = 'from-existing';
  } catch (err) {
    if (err && err.code === 'EBOOTSTRAPEMPTY') {
      try {
        await dossierStore.init({
          slug: state.featureSlug,
          contextDir: ctxDir,
          classification,
          whyText: '(auto-init by workflow:next; no source artifacts yet)',
          whatText: '(auto-init by workflow:next; no source artifacts yet)'
        });
        mode = 'minimal-fallback';
      } catch {
        return;
      }
    } else if (err && err.code === 'EDOSSIEREXISTS') {
      return;
    } else {
      return;
    }
  }

  if (mode) {
    await emitDossierEvent(targetDir, {
      agent: 'workflow-next',
      type: 'dossier_auto_initialized',
      summary: `${state.featureSlug} ${mode}`,
      meta: {
        feature_slug: state.featureSlug,
        classification,
        trigger_source: 'workflow_next_pre_stage',
        mode
      }
    });
  }
}

async function activateStage(targetDir, state, locale, tool, explicitAgent = null, requestedMode = null) {
  const stageName = normalizeAgentName(explicitAgent || state.current || state.next);
  if (!stageName) {
    return {
      state,
      agent: null,
      instructionPath: null,
      prompt: null
    };
  }

  // Pre-stage hook: ensure feature dossier exists for SMALL/MEDIUM features.
  // Silent (no logging); idempotent (no-op if dossier already exists).
  // Defense-in-depth alongside the @product prompt instruction.
  await ensureFeatureDossier(targetDir, state);

  // ── Committer Safety Gate ───────────────────────────────────────────────
  if (stageName === 'committer') {
    const guard = await inspectStagedChanges(targetDir, { allowWarnings: false });
    if (guard.summary.stagedCount === 0) {
      throw new Error(
        `[Committer Gate BLOCKED] Nenhum arquivo no stage para commit. ` +
        `Execute primeiro: aioson commit:prepare . --agent-safe --staged-only --mode=headless`
      );
    }
    if (!guard.ok) {
      throw new Error(
        `[Committer Gate BLOCKED] Arquivos proibidos detectados no stage ` +
        `(node_modules, build artifacts, secrets, etc.). ` +
        `Execute 'aioson git:guard .' para ver detalhes, corrija e rode 'aioson commit:prepare . --agent-safe --staged-only --mode=headless' antes de ativar @committer.`
      );
    }
  }

  // ── Test Briefing Injection for qa/tester ───────────────────────────────
  let testBriefing = '';
  let securityAuditBriefing = '';
  if (stageName === 'qa' || stageName === 'tester') {
    try {
      testBriefing = await buildTestBriefing(targetDir);
    } catch {
      // Non-fatal: if briefing generation fails, proceed without it
      testBriefing = '';
    }
  }

  if (
    stageName === 'qa' &&
    state.mode === 'feature' &&
    state.classification === 'MEDIUM' &&
    state.featureSlug
  ) {
    try {
      const auditResult = await runSecurityAudit({
        args: [targetDir],
        options: {
          slug: state.featureSlug,
          json: true,
          runtimeAgentName: 'qa',
          runtimeSource: 'workflow',
          runtimeState: state,
          runtimeWorkflowStage: 'qa'
        },
        logger: { log() {}, error() {}, warn() {} }
      });
      securityAuditBriefing = buildQaSecurityAuditBriefing(auditResult, targetDir);
    } catch {
      securityAuditBriefing = buildQaSecurityAuditBriefing({
        ok: false,
        reason: 'audit_runtime_failure'
      }, targetDir);
    }
  }

  // ── Path Guard Injection for implementation agents ────────────────────────
  let pathGuardBlock = '';
  if (['dev', 'architect', 'ux-ui', 'pentester', 'qa', 'tester', 'committer'].includes(stageName)) {
    try {
      pathGuardBlock = await buildPathGuardBlock(targetDir);
    } catch {
      pathGuardBlock = '';
    }
  }

  const agent = getAgentDefinition(stageName);
  if (!agent) {
    throw new Error(`Unknown agent: ${stageName}`);
  }

  const autonomyProtocol = await readAutonomyProtocol(targetDir);
  const agentManifest = await readAgentManifest(targetDir, agent.id);
  const effectiveMode = resolveEffectiveMode({
    protocol: autonomyProtocol,
    tool,
    agentId: agent.id,
    manifest: agentManifest,
    requestedMode
  });

  const instructionPath = await resolveExistingInstructionPath(targetDir, agent, locale);
  let prompt = buildAgentPrompt(agent, tool, {
    instructionPath,
    targetDir,
    interactionLanguage: locale,
    autonomyMode: effectiveMode,
    capabilitySummary: buildAgentCapabilitySummary(agentManifest, tool)
  });

  if (testBriefing) {
    prompt += '\n\n' + testBriefing;
  }

  if (securityAuditBriefing) {
    prompt += '\n\n' + securityAuditBriefing;
  }

  if (pathGuardBlock) {
    prompt += '\n\n' + pathGuardBlock;
  }

  let nextState = state;
  if (explicitAgent && stageName !== normalizeAgentName(state.next)) {
    nextState = buildStatePayload({
      ...state,
      current: stageName,
      detour: {
        active: true,
        agent: stageName,
        returnTo: state.next
      }
    });
  } else {
    nextState = buildStatePayload({
      ...state,
      current: stageName
    });
  }

  return {
    state: nextState,
    agent: stageName,
    instructionPath,
    prompt,
    effectiveMode
  };
}

async function runWorkflowNext({ args, options, logger, t }) {
  if (options.status || options.suggest) {
    const { runWorkflowStatus } = require('./workflow-status');
    return runWorkflowStatus({ args, options, logger, t });
  }

  const logErrorLine = typeof logger.error === 'function'
    ? logger.error.bind(logger)
    : typeof logger.log === 'function'
      ? logger.log.bind(logger)
      : () => {};

  const targetDir = path.resolve(process.cwd(), args[0] || '.');
  const tool = options.tool || 'codex';
  const locale = await resolveLocaleForTarget(targetDir, options);
  const { config } = await readWorkflowConfig(targetDir);
  const loaded = await loadOrCreateState(targetDir, options);
  let state = loaded.state;
  let completedStage = null;

  if (options.complete || options['complete-current']) {
    let finalized;
    try {
      finalized = await finalizeCurrentStage(
        targetDir,
        config,
        state,
        options.complete === true ? state.current || state.next : options.complete
      );
    } catch (err) {
      // ── Auto-heal intercept ───────────────────────────────────────────────
      const autoHeal = Boolean(options['auto-heal'] || options.autoHeal);
      const isHealabled = autoHeal && (
        err.message.includes('[Technical Gate BLOCKED]') ||
        err.message.includes('[Handoff Contract BLOCKED]')
      );
      if (isHealabled) {
        const failedStage = normalizeAgentName(options.complete === true ? state.current || state.next : options.complete);
        await logError(targetDir, failedStage, err.message, 'technical');
        const retryCount = await require('../self-healing').getRetryCount(targetDir, failedStage);
        if (retryCount < require('../self-healing').MAX_RETRIES) {
          await require('../self-healing').incrementRetryCount(targetDir, failedStage, err.message.substring(0, 200));
          // Build healing activation
          const baseActivation = await activateStage(targetDir, state, locale, tool, failedStage, options.mode || null);
          const healingPrompt = buildHealingPrompt(
            baseActivation.prompt || '',
            failedStage,
            { error: err.message },
            retryCount + 1
          );
          const healedState = {
            ...baseActivation.state,
            current: failedStage,
            detour: null
          };
          await persistState(targetDir, healedState);
          const eventPayload = {
            id: Date.now(),
            kind: 'workflow',
            createdAt: new Date().toISOString(),
            eventType: 'heal',
            message: `Auto-heal @${failedStage} — retry ${retryCount + 1}/3`,
            mode: state.mode,
            classification: state.classification,
            featureSlug: state.featureSlug,
            current: failedStage,
            next: state.next,
            completed: state.completed,
            skipped: state.skipped,
            sequence: state.sequence,
            healing: true,
            retryCount: retryCount + 1,
            autonomyMode: baseActivation.effectiveMode || null
          };
          await appendWorkflowEvent(targetDir, eventPayload);
          const runtime = await syncWorkflowRuntime(targetDir, {
            state: healedState,
            eventPayload,
            activationAgent: failedStage,
            completedStage: null
          });
          const healingHandoff = buildWorkflowHandoff(healedState, null, failedStage);
          healingHandoff.protocol = buildWorkflowHandoffProtocol(healedState, null, failedStage, {
            autonomyMode: baseActivation.effectiveMode || null,
            handoffContractOk: true,
            technicalGateOk: false,
            artifactUris: []
          });
          const healingValidation = await validateHandoffProtocol(targetDir, healingHandoff.protocol);
          if (!healingValidation.ok) {
            logErrorLine('Handoff protocol warning:');
            for (const err of healingValidation.errors) logErrorLine(`  - ${err}`);
          }
          await writeHandoff(targetDir, healingHandoff);
          logger.log(t('workflow_heal.title', { stage: `@${failedStage}`, count: retryCount + 1 }));
          logger.log(healingPrompt);
          return {
            ok: true,
            targetDir,
            locale,
            tool,
            statePath: STATE_RELATIVE_PATH,
            configPath: CONFIG_RELATIVE_PATH,
            created: loaded.created,
            mode: state.mode,
            classification: state.classification,
            current: healedState.current,
            next: healedState.next,
            detour: healedState.detour,
            completed: healedState.completed,
            skipped: healedState.skipped,
            completedStage: null,
            featureSlug: state.featureSlug,
            runtime,
            agent: failedStage,
            instructionPath: baseActivation.instructionPath,
            prompt: healingPrompt,
            autoHealed: true,
            effectiveMode: baseActivation.effectiveMode || null
          };
        }
      }
      throw err;
    }
    state = finalized.state;
    completedStage = finalized.completedStage;
    await require('../self-healing').incrementRetryCount(targetDir, completedStage, '');
    const { getRetryCount } = require('../self-healing');
    const retries = await getRetryCount(targetDir, completedStage);
    if (retries > 0) {
      // Reset retry count on successful completion after healing
      const retriesPath = path.join(targetDir, '.aioson/context/pipeline-retries', `${completedStage}.json`);
      try { await fs.unlink(retriesPath); } catch { /* ignore */ }
    }
  }

  if (options.skip) {
    state = applySkip(config, state, options.skip);
  }

  const requestedAgent = options.agent ? normalizeAgentName(options.agent) : null;
  const activation = await activateStage(targetDir, state, locale, tool, requestedAgent, options.mode || null);
  state = activation.state;
  const statePath = await persistState(targetDir, state);
  const eventPayload = {
    id: Date.now(),
    kind: 'workflow',
    createdAt: new Date().toISOString(),
    eventType: buildWorkflowEventType({ completedStage, state, activation, options }),
    message: buildWorkflowEventMessage({
      created: loaded.created,
      state,
      activation,
      completedStage,
      options
    }),
    mode: state.mode,
    classification: state.classification,
    featureSlug: state.featureSlug,
    current: state.current,
    next: state.detour && state.detour.active ? state.detour.returnTo : state.next,
    completedStage,
    detour: state.detour,
    requestedAgent: options.requestedAgent ? normalizeAgentName(options.requestedAgent) : null,
    completed: state.completed,
    skipped: state.skipped,
    sequence: state.sequence,
    autonomyMode: activation.effectiveMode || null
  };
  await appendWorkflowEvent(targetDir, eventPayload);
  const runtime = await syncWorkflowRuntime(targetDir, {
    state,
    eventPayload,
    activationAgent: activation.agent,
    completedStage
  });

  // Generate session handoff when a stage completes or workflow finishes
  if (completedStage || !activation.agent) {
    const handoffData = buildWorkflowHandoff(state, completedStage, activation.agent);
    handoffData.autonomyMode = activation.effectiveMode || null;
    handoffData.protocol = buildWorkflowHandoffProtocol(state, completedStage, activation.agent, {
      autonomyMode: activation.effectiveMode || null,
      handoffContractOk: true,
      technicalGateOk: true,
      artifactUris: []
    });
    const handoffValidation = await validateHandoffProtocol(targetDir, handoffData.protocol);
    if (!handoffValidation.ok) {
      logErrorLine('Handoff protocol warning:');
      for (const err of handoffValidation.errors) logErrorLine(`  - ${err}`);
    }
    await writeHandoff(targetDir, handoffData);
  }

  const payload = {
    ok: true,
    targetDir,
    locale,
    tool,
    statePath: STATE_RELATIVE_PATH,
    configPath: CONFIG_RELATIVE_PATH,
    created: loaded.created,
    mode: state.mode,
    classification: state.classification,
    current: state.current,
    next: state.detour && state.detour.active ? state.detour.returnTo : state.next,
    detour: state.detour,
    completed: state.completed,
    skipped: state.skipped,
    completedStage,
    featureSlug: state.featureSlug,
    runtime,
    agent: activation.agent,
    effectiveMode: activation.effectiveMode || null,
    instructionPath: activation.instructionPath,
    prompt: activation.prompt
  };

  logger.log(t('workflow_next.title', {
    mode: state.mode,
    classification: state.classification
  }));
  if (completedStage) {
    logger.log(t('workflow_next.completed', { agent: `@${completedStage}` }));
  }
  if (state.detour && state.detour.active) {
    logger.log(
      t('workflow_next.detour', {
        agent: `@${state.detour.agent}`,
        returnTo: `@${state.detour.returnTo}`
      })
    );
  }
  if (activation.agent) {
    logger.log(t('workflow_next.current_agent', { agent: `@${activation.agent}` }));
    if (payload.next) {
      logger.log(t('workflow_next.next_agent', { agent: `@${payload.next}` }));
    }
    logger.log(activation.prompt);
  } else {
    logger.log(t('workflow_next.done'));
  }
  logger.log(t('workflow_next.state_file', { path: STATE_RELATIVE_PATH }));

  return payload;
}

module.exports = {
  STATE_RELATIVE_PATH,
  CONFIG_RELATIVE_PATH,
  EVENTS_RELATIVE_PATH,
  buildDefaultWorkflowConfig,
  parseFeaturesMarkdown,
  readWorkflowConfig,
  detectWorkflowMode,
  loadOrCreateState,
  reconcileWorkflowState,
  finalizeCurrentStage,
  applySkip,
  activateStage,
  runWorkflowNext
};
