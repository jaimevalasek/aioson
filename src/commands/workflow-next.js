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
const { validateHandoffContract, formatContractError, getBlockingRevisions, parseFrontmatterValue } = require('../handoff-contract');
const { buildPathGuardBlock } = require('../path-guard');
const { logError, buildHealingPrompt } = require('../self-healing');
const { validateHandoffProtocol } = require('../handoff-validator');
const { readAutonomyProtocol, resolveEffectiveMode } = require('../autonomy-policy');
const { readAgentManifest, buildAgentCapabilitySummary } = require('../agent-manifests');
const { runMemoryReflectPrepare } = require('./memory-reflect-prepare');
const { inspectStagedChanges } = require('../lib/git-commit-guard');
const { emitSecurityRuntimeEvent } = require('../lib/security/runtime-events');
const { runSecurityAudit } = require('./security-audit');
const dossierBootstrap = require('../dossier/dossier-bootstrap');
const dossierStore = require('../dossier/store');
const { emitDossierEvent } = require('../lib/dossier-telemetry');

const STATE_RELATIVE_PATH = '.aioson/context/workflow.state.json';
const CONFIG_RELATIVE_PATH = '.aioson/context/workflow.config.json';
const EVENTS_RELATIVE_PATH = '.aioson/context/workflow.events.jsonl';
const SCOPE_CHECK_MODES = new Set(['pre-dev', 'post-dev', 'post-fix', 'final']);

const DEFAULT_FEATURE_WORKFLOW_BY_CLASSIFICATION = {
  MICRO: ['product', 'dev', 'qa'],
  SMALL: ['product', 'analyst', 'scope-check', 'architect', 'discovery-design-doc', 'dev', 'qa'],
  MEDIUM: ['product', 'analyst', 'architect', 'discovery-design-doc', 'scope-check', 'dev', 'pentester', 'qa']
};

// Stages eligible for autopilot handoff (auto_handoff: true in project.context.md).
// The chain always breaks at the @dev handoff — see .aioson/docs/autopilot-handoff.md.
const AUTOPILOT_HANDOFF_STAGES = new Set(['analyst', 'scope-check', 'architect', 'discovery-design-doc']);

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
      SMALL: ['setup', 'product', 'analyst', 'scope-check', 'architect', 'discovery-design-doc', 'dev', 'qa'],
      MEDIUM: ['setup', 'product', 'analyst', 'architect', 'discovery-design-doc', 'ux-ui', 'pm', 'orchestrator', 'scope-check', 'dev', 'qa']
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

function chooseActiveFeature(features, preferredSlug = null) {
  const activeFeatures = (features || []).filter((feature) => feature.status === 'in_progress');
  if (preferredSlug) {
    const preferred = activeFeatures.find((feature) => feature.slug === preferredSlug);
    if (preferred) return preferred;
  }
  return activeFeatures.length > 0 ? activeFeatures[activeFeatures.length - 1] : null;
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
  const handoffPath = path.join(targetDir, '.aioson/context/last-handoff.json');
  const hasProjectPrd = await exists(prdPath);
  const featuresMarkdown = await fs.readFile(featuresPath, 'utf8').catch(() => '');
  const features = parseFeaturesMarkdown(featuresMarkdown);
  const lastHandoff = await readJsonIfExists(handoffPath).catch(() => null);
  const preferredSlug = lastHandoff && lastHandoff.feature_slug ? lastHandoff.feature_slug : null;
  const activeFeature = chooseActiveFeature(features, preferredSlug);

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
  const anyExists = async (candidates) => {
    for (const candidate of candidates) {
      if (await exists(candidate)) return true;
    }
    return false;
  };

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

  if (stage === 'scope-check') {
    if (state.mode === 'feature' && slug) {
      return await exists(path.join(base, `scope-check-${slug}.md`));
    }
    return await exists(path.join(base, 'scope-check.md'));
  }

  if (stage === 'architect') {
    return await exists(path.join(base, 'architecture.md'));
  }

  if (stage === 'ux-ui') {
    return await exists(path.join(base, 'ui-spec.md'));
  }

  if (stage === 'discovery-design-doc') {
    const designDocCandidates = slug
      ? [path.join(base, `design-doc-${slug}.md`), path.join(base, 'design-doc.md')]
      : [path.join(base, 'design-doc.md')];
    const readinessCandidates = slug
      ? [path.join(base, `readiness-${slug}.md`), path.join(base, 'readiness.md')]
      : [path.join(base, 'readiness.md')];
    return (await anyExists(designDocCandidates)) && (await anyExists(readinessCandidates));
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
  // discovery-design-doc is inferable from its design-doc + readiness artifacts
  // (it has both a validateStageArtifacts branch and a handoff contract). Without
  // it, MEDIUM sequences — where scope-check sits AFTER discovery-design-doc —
  // could never infer scope-check as completed during stale-state recovery.
  return ['setup', 'product', 'analyst', 'scope-check', 'architect', 'discovery-design-doc', 'ux-ui', 'orchestrator'].includes(
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
    const contractCheck = await validateHandoffContract(targetDir, draftState, normalizeAgentName(stage));
    if (!contractCheck.ok) break;
    completed.push(normalizeAgentName(stage));
  }
  return completed;
}

function mergeInferredCompletedStages(state, inferredCompleted) {
  if (!state || !Array.isArray(state.sequence) || !Array.isArray(inferredCompleted)) {
    return { state, changed: false };
  }

  const sequence = state.sequence.map(normalizeAgentName);
  const completedSet = new Set((state.completed || []).map(normalizeAgentName).filter(Boolean));
  const skippedSet = new Set((state.skipped || []).map(normalizeAgentName).filter(Boolean));
  let changed = false;

  for (const stage of inferredCompleted.map(normalizeAgentName).filter(Boolean)) {
    if (!sequence.includes(stage)) continue;
    if (!completedSet.has(stage)) {
      completedSet.add(stage);
      changed = true;
    }
    if (skippedSet.delete(stage)) {
      changed = true;
    }
  }

  if (!changed) return { state, changed: false };

  return {
    changed: true,
    state: buildStatePayload({
      ...state,
      sequence,
      completed: sequence.filter((stage) => completedSet.has(stage)),
      skipped: sequence.filter((stage) => skippedSet.has(stage))
    })
  };
}

// SF-project-18: cross-check workflow.state.json#completed against runtime
// telemetry. Stages claimed as completed without a corresponding agent_done
// event in .aioson/runtime/aios.sqlite are surfaced as a warning. Detection
// is best-effort — if the runtime DB is unavailable, the check is silently
// skipped (the framework still works in environments without telemetry).
async function detectUnsubstantiatedCompletions(targetDir, completedStages, logger = null) {
  if (!Array.isArray(completedStages) || completedStages.length === 0) return [];
  let runtimeStore;
  try {
    runtimeStore = require('../runtime-store');
  } catch {
    return [];
  }
  if (!runtimeStore.runtimeStoreExists) return [];
  let dbExists;
  try { dbExists = await runtimeStore.runtimeStoreExists(targetDir); } catch { return []; }
  if (!dbExists) return [];
  let handle;
  try {
    handle = await runtimeStore.openRuntimeDb(targetDir);
  } catch {
    return [];
  }
  // openRuntimeDb resolves to { db, dbPath, runtimeDir } — the raw better-sqlite3
  // handle lives on `.db`.
  const db = handle && handle.db;
  if (!db || typeof db.prepare !== 'function') {
    try { if (db && typeof db.close === 'function') db.close(); } catch { /* ignore */ }
    return [];
  }
  let unsubstantiated = [];
  try {
    let stmt;
    try {
      // agent identity lives on execution_events.agent_name (agent_events has no
      // agent column). agent_done/stage_completed events are written there by
      // appendRunEvent for every tracked run.
      stmt = db.prepare(
        "SELECT 1 FROM execution_events WHERE agent_name = ? AND event_type IN ('agent_done', 'stage_completed') LIMIT 1"
      );
    } catch {
      // schema differences across versions — abort the cross-check.
      return [];
    }
    const missing = [];
    let substantiated = 0;
    for (const stage of completedStages) {
      try {
        if (stmt.get(stage)) substantiated += 1;
        else missing.push(stage);
      } catch {
        return [];
      }
    }
    // Only treat missing stages as suspicious when the workflow demonstrably
    // emits per-stage telemetry (≥1 completed stage has an agent_done event).
    // Projects that never emit per-stage telemetry would otherwise warn on every
    // run — keep the cross-check best-effort and silent for them.
    unsubstantiated = substantiated > 0 ? missing : [];
  } finally {
    try { db.close(); } catch { /* ignore */ }
  }
  if (unsubstantiated.length > 0 && logger && typeof logger.warn === 'function') {
    logger.warn(
      `[workflow:next] state-file integrity warning — completed stages without agent_done telemetry: ${unsubstantiated.join(', ')}. ` +
      `If you did not just edit workflow.state.json by hand, this may indicate tampering.`
    );
  }
  return unsubstantiated;
}

async function loadOrCreateState(targetDir, options = {}) {
  const statePath = path.join(targetDir, STATE_RELATIVE_PATH);
  let existing = await readJsonIfExists(statePath);

  // Mode/feature-transition guard: if the persisted state no longer matches
  // the current mode from features.md, it is stale. This covers both directions:
  // a feature was paused/closed and project mode should resume, or a new
  // feature was opened while a project workflow state still exists.
  if (existing) {
    const modeInfo = await detectWorkflowMode(targetDir);
    if (
      existing.mode !== modeInfo.mode ||
      (modeInfo.mode === 'feature' && existing.featureSlug !== modeInfo.featureSlug) ||
      (modeInfo.mode !== 'feature' && existing.featureSlug)
    ) {
      existing = null;
    }
  }

  if (existing && typeof existing === 'object' && Array.isArray(existing.sequence)) {
    // SF-project-18: warn-on-mismatch only, never refuse — preserves
    // backwards-compat with environments that lack runtime telemetry.
    if (Array.isArray(existing.completed) && existing.completed.length > 0 && options.logger) {
      await detectUnsubstantiatedCompletions(targetDir, existing.completed, options.logger);
    }
    const reconciled = reconcileWorkflowState(existing);
    const inferredCompleted = (reconciled.state.current || (reconciled.state.detour && reconciled.state.detour.active))
      ? []
      : await inferCompletedStages(targetDir, reconciled.state);
    const merged = mergeInferredCompletedStages(reconciled.state, inferredCompleted);
    const finalReconciled = merged.changed ? reconcileWorkflowState(merged.state) : reconciled;
    const changed = reconciled.changed || merged.changed || finalReconciled.changed;
    if (changed) {
      await writeJson(statePath, finalReconciled.state);
    }
    return { statePath, state: finalReconciled.state, created: false };
  }

  const context = await validateProjectContextFile(targetDir);
  const modeInfo = await detectWorkflowMode(targetDir);

  // Feature classification (from prd-{slug}.md frontmatter) takes precedence
  // over the project classification. A MICRO feature inside a MEDIUM project
  // must be sequenced and gated as MICRO.
  let featurePrdClassification = null;
  if (modeInfo.mode === 'feature' && modeInfo.featureSlug) {
    const prdPath = path.join(targetDir, '.aioson/context', `prd-${modeInfo.featureSlug}.md`);
    const prdContent = await fs.readFile(prdPath, 'utf8').catch(() => '');
    if (prdContent) {
      const parsed = parseFrontmatterValue(prdContent, 'classification');
      if (parsed) featurePrdClassification = parsed;
    }
  }

  const classification = normalizeClassification(
    options.classification
      || featurePrdClassification
      || (context.data && context.data.classification)
      || 'MICRO',
    'MICRO'
  );
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

/**
 * Detects whether the current feature has a harness contract awaiting
 * validation. Used by runWorkflowNext to route to @validator (as a detour)
 * before any other agent. Implements AC-HD-14 of harness-driven-aioson.
 *
 * Returns true only when ALL of the following hold:
 *   - state.mode === 'feature' AND state.featureSlug is set
 *   - .aioson/plans/<slug>/harness-contract.json exists
 *   - .aioson/plans/<slug>/progress.json exists, parses, and reports
 *     status === 'waiting_validation'
 *
 * Without these conditions the function returns false and the workflow
 * routing proceeds exactly as before (zero behavior change for MICRO/SMALL
 * or any MEDIUM feature without a contract).
 */
function shouldRouteToValidator(targetDir, state) {
  if (!state || state.mode !== 'feature' || !state.featureSlug) return false;
  const fsLocal = require('node:fs');
  const planDir = path.join(targetDir, '.aioson', 'plans', state.featureSlug);
  const contractPath = path.join(planDir, 'harness-contract.json');
  const progressPath = path.join(planDir, 'progress.json');
  if (!fsLocal.existsSync(contractPath) || !fsLocal.existsSync(progressPath)) return false;
  try {
    const progress = JSON.parse(fsLocal.readFileSync(progressPath, 'utf8'));
    return progress && progress.status === 'waiting_validation';
  } catch {
    // Corrupted progress: do NOT override routing — fail safe to default flow.
    return false;
  }
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

async function readTextIfExists(filePath) {
  try {
    return await fs.readFile(filePath, 'utf8');
  } catch (err) {
    if (err && err.code === 'ENOENT') return null;
    throw err;
  }
}

function parseDevStateContextPackage(raw) {
  if (!raw) return [];
  const section = raw.match(/## Context package\r?\n\r?\n([\s\S]*?)(?:\r?\n\r?\n## |\s*$)/);
  if (!section) return [];
  return section[1]
    .split(/\r?\n/)
    .map((line) => {
      const match = line.trim().match(/^\d+\.\s+(.+)$/);
      return match ? match[1].trim() : null;
    })
    .filter(Boolean);
}

function parseDevStateFrontmatter(raw) {
  if (!raw) return {};
  const fmMatch = raw.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!fmMatch) return {};
  const fm = {};
  for (const line of fmMatch[1].split(/\r?\n/)) {
    const idx = line.indexOf(':');
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    const value = line.slice(idx + 1).trim().replace(/^["']|["']$/g, '');
    if (key) fm[key] = value;
  }
  return fm;
}

function shouldUseDevStateForFeature(raw, featureSlug) {
  if (!raw) return false;
  const fm = parseDevStateFrontmatter(raw);
  if (!fm.active_feature) return false;
  const status = String(fm.status || '').toLowerCase();
  if (status === 'done' || status === 'abandoned') return false;
  if (fm.active_feature !== featureSlug) return false;
  return true;
}

function normalizeContextDependency(relPath) {
  const cleaned = String(relPath || '').trim().replace(/\\/g, '/');
  if (!cleaned) return null;
  if (cleaned.startsWith('.aioson/')) return cleaned;
  return `.aioson/context/${cleaned}`;
}

async function resolveStageDependencies(targetDir, state, stageName, agent) {
  if (stageName === 'scope-check') {
    const contextDir = path.join(targetDir, '.aioson', 'context');
    const slug = state.featureSlug;
    const candidates = [
      'project.context.md',
      'features.md',
      slug ? `prd-${slug}.md` : 'prd.md',
      slug ? `requirements-${slug}.md` : 'discovery.md',
      slug ? `spec-${slug}.md` : 'spec.md',
      slug ? `sheldon-enrichment-${slug}.md` : 'sheldon-enrichment.md',
      'architecture.md',
      slug ? `design-doc-${slug}.md` : null,
      slug ? `readiness-${slug}.md` : null,
      'design-doc.md',
      'readiness.md',
      'ui-spec.md',
      slug ? `implementation-plan-${slug}.md` : 'implementation-plan.md',
      'dev-state.md',
      'last-handoff.json',
      'project-pulse.md'
    ].filter(Boolean);
    const existing = [];
    for (const candidate of candidates) {
      if (await exists(path.join(contextDir, candidate))) {
        existing.push(normalizeContextDependency(candidate));
      }
    }
    return existing.length > 0 ? existing : agent.dependsOn;
  }

  if (stageName === 'discovery-design-doc') {
    const contextDir = path.join(targetDir, '.aioson', 'context');
    const slug = state.featureSlug;
    const candidates = [
      'project.context.md',
      slug ? `prd-${slug}.md` : 'prd.md',
      slug ? `requirements-${slug}.md` : 'discovery.md',
      slug ? `spec-${slug}.md` : 'spec.md',
      'architecture.md',
      slug ? `design-doc-${slug}.md` : null,
      slug ? `readiness-${slug}.md` : null,
      'design-doc.md',
      'readiness.md',
      'project-map.md'
    ].filter(Boolean);
    const existing = [];
    for (const candidate of candidates) {
      if (await exists(path.join(contextDir, candidate))) {
        existing.push(normalizeContextDependency(candidate));
      }
    }
    return existing.length > 0 ? existing : agent.dependsOn;
  }

  if (stageName !== 'dev' || state.mode !== 'feature' || !state.featureSlug) {
    return agent.dependsOn;
  }

  const contextDir = path.join(targetDir, '.aioson', 'context');
  const devStatePath = path.join(contextDir, 'dev-state.md');
  const devStateRaw = await readTextIfExists(devStatePath);
  const devStatePackage = shouldUseDevStateForFeature(devStateRaw, state.featureSlug)
    ? parseDevStateContextPackage(devStateRaw)
      .map(normalizeContextDependency)
      .filter(Boolean)
    : [];

  if (devStatePackage.length > 0) {
    return Array.from(new Set(['.aioson/context/dev-state.md', ...devStatePackage]));
  }

  const slug = state.featureSlug;
  const candidates = [
    'project.context.md',
    `prd-${slug}.md`,
    `requirements-${slug}.md`,
    `spec-${slug}.md`,
    `design-doc-${slug}.md`,
    `readiness-${slug}.md`,
    'design-doc.md',
    'readiness.md',
    `scope-check-${slug}.md`,
    'scope-check.md',
    `implementation-plan-${slug}.md`
  ];
  const existing = [];
  for (const candidate of candidates) {
    if (await exists(path.join(contextDir, candidate))) {
      existing.push(normalizeContextDependency(candidate));
    }
  }
  return existing.length > 0 ? existing : agent.dependsOn;
}

function inferScopeCheckMode(state, requestedMode = null) {
  if (requestedMode) return requestedMode;
  const completed = Array.isArray(state.completed) ? state.completed.map(normalizeAgentName) : [];
  const current = normalizeAgentName(state.current || state.next);
  if (completed.includes('dev')) return 'post-dev';
  if (completed.includes('qa') || completed.includes('tester') || completed.includes('pentester')) return 'post-fix';
  if (current === 'scope-check') return 'pre-dev';
  return 'pre-dev';
}

function buildScopeCheckActivationContext(state, mode) {
  const resolvedMode = inferScopeCheckMode(state, mode);
  const lines = [
    `Scope-check mode: ${resolvedMode}`,
    `Workflow mode: ${state.mode || 'unknown'}`,
    `Classification: ${state.classification || 'unknown'}`
  ];
  if (state.featureSlug) lines.push(`Feature slug: ${state.featureSlug}`);
  if (resolvedMode === 'pre-dev') {
    lines.push('Compare user intent against planning artifacts before implementation.');
  } else if (resolvedMode === 'post-dev') {
    lines.push('Compare the approved scope-check/design artifacts against the actual implementation diff and changed files before QA.');
  } else if (resolvedMode === 'post-fix') {
    lines.push('Compare approved scope, QA/tester/pentester findings, and the correction diff; confirm the fix did not change product intent.');
  } else if (resolvedMode === 'final') {
    lines.push('Reconcile intent, plan, delivered behavior, and remaining exclusions before close/commit/release.');
  }
  return lines.join('\n');
}

function buildStageActivationContext(state, stageName, dependencies, scopeCheckMode = null) {
  if (stageName === 'scope-check') {
    return buildScopeCheckActivationContext(state, scopeCheckMode);
  }

  if (stageName !== 'dev' || state.mode !== 'feature' || !state.featureSlug) return '';
  return [
    `Feature slug: ${state.featureSlug}`,
    `Workflow mode: ${state.mode}`,
    `Classification: ${state.classification || 'unknown'}`,
    dependencies.includes('.aioson/context/dev-state.md')
      ? 'Resume source: .aioson/context/dev-state.md'
      : 'Resume source: active feature artifacts'
  ].join('\n');
}

async function activateStage(targetDir, state, locale, tool, explicitAgent = null, requestedMode = null, scopeCheckMode = null) {
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

  let autoHandoff = false;
  if (
    AUTOPILOT_HANDOFF_STAGES.has(stageName) &&
    state.mode === 'feature' &&
    (state.classification === 'SMALL' || state.classification === 'MEDIUM')
  ) {
    try {
      const projectContext = await validateProjectContextFile(targetDir);
      autoHandoff = Boolean(projectContext && projectContext.data && projectContext.data.auto_handoff === true);
    } catch {
      autoHandoff = false;
    }
  }

  const instructionPath = await resolveExistingInstructionPath(targetDir, agent, locale);
  const dependencies = await resolveStageDependencies(targetDir, state, stageName, agent);
  let prompt = buildAgentPrompt(agent, tool, {
    instructionPath,
    targetDir,
    interactionLanguage: locale,
    autonomyMode: effectiveMode,
    capabilitySummary: buildAgentCapabilitySummary(agentManifest, tool),
    dependsOn: dependencies,
    autoHandoff,
    activationContext: buildStageActivationContext(state, stageName, dependencies, scopeCheckMode)
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

/**
 * F3 (workflow-handoff-integrity v1.9.6) — pending-decisions guard.
 *
 * Reads `.aioson/plans/{slug}/manifest.md` frontmatter. If `status` matches
 * `pending-<X>-decisions`, throws a hard error recommending the agent that
 * resolves those decisions. `--force` overrides.
 *
 * Whitelist (DD-02): known agents are [architect, product, pm, qa]. Unknown
 * captured groups still block but are flagged as unrecognized so typos don't
 * silently route to nonexistent agents.
 *
 * Errors:
 *   - WORKFLOW_NEXT_PENDING_DECISIONS — pending state detected, advance blocked.
 *
 * @param {string} targetDir   Project root.
 * @param {string|null} slug   Feature slug (null in project mode → no-op).
 * @param {boolean} force      When true, skip the check (--force override).
 * @returns {Promise<void>}    Resolves silently when no pending decisions block; throws otherwise.
 */
const PENDING_STATE_WHITELIST = ['architect', 'product', 'pm', 'qa'];

async function assertManifestNotPending(targetDir, slug, force) {
  if (force) return; // AC-F3-03 — explicit override.
  if (!slug) return; // AC-F3-04 — no feature context, nothing to guard.
  const manifestPath = path.join(targetDir, '.aioson', 'plans', slug, 'manifest.md');
  let content;
  try {
    content = await fs.readFile(manifestPath, 'utf8');
  } catch {
    return; // AC-F3-04 — no manifest (e.g. MICRO without Sheldon stage), skip.
  }
  const status = parseFrontmatterValue(content, 'status');
  if (!status) return; // No status field → nothing to assert.
  const match = String(status).match(/^pending-(.+)-decisions$/);
  if (!match) return; // AC-F3-02 — only pending-*-decisions pattern blocks.
  const captured = match[1].toLowerCase();
  const known = PENDING_STATE_WHITELIST.includes(captured);
  const recommendation = known
    ? `Próximo agente recomendado: @${captured}.`
    : `Estado desconhecido '${captured}' — whitelist atual: ${PENDING_STATE_WHITELIST.map((a) => `@${a}`).join(', ')}.`;
  const err = new Error(
    `[workflow:next] Gate blocked: ${slug} manifest tem status 'pending-${captured}-decisions'. ${recommendation} Use --force para override.`
  );
  err.code = 'WORKFLOW_NEXT_PENDING_DECISIONS';
  err.slug = slug;
  err.pendingState = captured;
  err.knownState = known;
  throw err;
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
    // F3 (workflow-handoff-integrity v1.9.6) — pending-decisions guard.
    // Hard error if sheldon manifest has unresolved decisions; --force overrides.
    try {
      await assertManifestNotPending(targetDir, state.featureSlug, Boolean(options.force));
    } catch (err) {
      if (err && err.code === 'WORKFLOW_NEXT_PENDING_DECISIONS') {
        logErrorLine(err.message);
      }
      throw err;
    }

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
            // SF-project-17: the current validator error set is intentionally
            // soft (missing manifests / unknown capabilities are common during
            // bootstrap), so we WARN and continue. Blocking would require a
            // validator that distinguishes warnings from hard contract
            // violations — see SF-17 dev_session_note for the deferred fix.
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

    // ── Living Memory: reflect bootstrap if the completed stage produced
    //    a relevant diff (routes/models/contracts/volume). Best-effort —
    //    never fail the workflow on reflection errors.
    try {
      await runMemoryReflectPrepare({
        args: [targetDir],
        options: { agent: completedStage, json: true },
        logger: { log: () => {}, error: () => {} }
      });
    } catch { /* reflection is advisory; never block the workflow */ }
  }

  if (options.skip) {
    state = applySkip(config, state, options.skip);
  }

  let requestedAgent = options.agent ? normalizeAgentName(options.agent) : null;

  // ── Harness Validator Routing (AC-HD-14) ────────────────────────────────
  // When the active feature has a harness-contract and progress is
  // `waiting_validation`, route to @validator as a detour. Explicit user
  // override (--agent=…) is preserved; auto-routing only fires when no agent
  // was requested. Without contract or in MICRO/SMALL, this is a no-op.
  if (!requestedAgent && shouldRouteToValidator(targetDir, state)) {
    requestedAgent = 'validator';
  }

  const activationAgent = normalizeAgentName(requestedAgent || state.current || state.next);
  const scopeCheckMode = activationAgent === 'scope-check' ? getScopeCheckModeOption(options) : null;
  const requestedAutonomyMode = scopeCheckMode && activationAgent === 'scope-check' ? null : options.mode || null;
  const activation = await activateStage(targetDir, state, locale, tool, requestedAgent, requestedAutonomyMode, scopeCheckMode);
  state = activation.state;

  // ── Living Memory: if a reflect manifest is pending (created above by the
  //    completed agent), prepend a one-line instruction so the next agent
  //    consumes it before any other action.
  try {
    const reflectPath = path.join(targetDir, '.aioson/runtime/reflect-prompt.json');
    if (await exists(reflectPath) && activation.prompt) {
      activation.prompt =
        'ℹ [memory] reflect-prompt.json pending — before any other action, read .aioson/runtime/reflect-prompt.json and run `aioson memory:reflect-commit . --agent=' + (activation.agent || 'dev') + ' --output=<path>` per your Memory Reflection section.\n\n' +
        activation.prompt;
    }
  } catch { /* ignore */ }
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
      // SF-project-17: the validator currently returns errors for soft
      // conditions (missing manifest, unknown capability) that occur during
      // normal bootstrap. Treating them as blockers would break the workflow
      // for any agent whose manifest has not been committed yet. Until the
      // validator is refactored to separate warnings from hard contract
      // violations, this caller emits a warning and continues — see
      // SF-project-17 dev_session_note.
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
  persistState,
  appendWorkflowEvent,
  resolveLocaleForTarget,
  reconcileWorkflowState,
  finalizeCurrentStage,
  applySkip,
  activateStage,
  runWorkflowNext,
  assertManifestNotPending,
  PENDING_STATE_WHITELIST,
  shouldRouteToValidator,
  detectUnsubstantiatedCompletions
};
