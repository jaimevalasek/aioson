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
const { resolveAutopilotSignal } = require('../autopilot-signal');
const { runMemoryReflectPrepare } = require('./memory-reflect-prepare');
const { runReviewCycle } = require('./review-cycle');
const { inspectStagedChanges } = require('../lib/git-commit-guard');
const { readDecisionCheckpoint } = require('../lib/decision-checkpoint');
const { emitSecurityRuntimeEvent } = require('../lib/security/runtime-events');
const { buildChainActivationContext, inspectChainHandoffGate } = require('../neural-chain-activation');
const { buildAgentContextActivation } = require('../agent-context-activation');
const dossierBootstrap = require('../dossier/dossier-bootstrap');
const dossierStore = require('../dossier/store');
const { emitDossierEvent } = require('../lib/dossier-telemetry');
const { parseVerificationReport } = require('../verification/report-parser');
const { applyPolicy } = require('../verification/policy-engine');
const { normalizePolicy } = require('../verification/result');
const {
  evaluateContractIntegrityGate,
  formatContractIntegrityGateError
} = require('../harness/contract-integrity-gate');
const { runSpecAnalyze } = require('./spec-analyze');
const {
  validateFeatureSlug,
  featureContextDir,
  verificationRunsDir,
  relativeFromRoot
} = require('../verification/path-policy');
const {
  FEATURE_WORKFLOW_BY_CLASSIFICATION,
  copyWorkflowMap
} = require('../workflow-profile');
const { reviewStatus } = require('../review-intelligence/engine');
const { validateCurrentSheldonReview } = require('../lib/sheldon-review');
const { inspectTemplateVersion } = require('../template-version-status');
const { resolveTargetDir } = require('../lib/project-root');
const { isUsableDesignDocFile } = require('../lib/design-doc-seed');

const { resolveActiveFeature } = require('./feature-current');
const { featureStateArchivePath, hasWorkflowProgress, readArchivedFeatureState, archiveFeatureState, bindingMovedEvent, describeBindingRegistry } = require('../lib/workflow-binding');

const STATE_RELATIVE_PATH = '.aioson/context/workflow.state.json';
const CONFIG_RELATIVE_PATH = '.aioson/context/workflow.config.json';
const EVENTS_RELATIVE_PATH = '.aioson/context/workflow.events.jsonl';
const SCOPE_CHECK_MODES = new Set(['pre-dev', 'post-dev', 'post-fix', 'final']);

const DEFAULT_FEATURE_WORKFLOW_BY_CLASSIFICATION = copyWorkflowMap(
  FEATURE_WORKFLOW_BY_CLASSIFICATION
);

// Stages eligible for autopilot handoff — the FULL feature chain (see
// .aioson/docs/autopilot-handoff.md). Activation = auto_handoff: true in
// project.context.md OR the seeded scheme (resolveAutopilotSignal). Two segments:
//   1. PRD → independent Sheldon review → plan → dev chain. Other specialists
//      remain explicit/evidence-triggered detours.
//   2. post-dev review cycle: @dev → initial @qa → enabled @tester/@pentester
//      (when their @qa triggers fire) → final @qa → enabled @validator → STOPS
//      before feature:close (human gate).
const AUTOPILOT_HANDOFF_STAGES = new Set([
  'product', 'sheldon', 'planner', 'orchestrator',
  'analyst', 'scope-check', 'architect', 'discovery-design-doc', 'pm',
  'dev', 'qa', 'tester', 'pentester', 'validator'
]);

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

function readExpectedFeature(options = {}) {
  const hasKebab = Object.prototype.hasOwnProperty.call(options, 'expect-feature');
  const hasCamel = Object.prototype.hasOwnProperty.call(options, 'expectFeature');
  if (!hasKebab && !hasCamel) return { provided: false, featureSlug: null };

  const raw = hasKebab ? options['expect-feature'] : options.expectFeature;
  const value = String(raw === true ? '' : raw || '').trim().toLowerCase();
  if (value === 'none' || value === 'project') {
    return { provided: true, featureSlug: null };
  }
  const validation = validateFeatureSlug(value);
  if (!validation.ok) {
    const error = new Error(
      `[workflow:next] Invalid --expect-feature value "${String(raw)}". Use a feature slug or "none" for project mode.`
    );
    error.code = 'WORKFLOW_EXPECT_FEATURE_INVALID';
    throw error;
  }
  return { provided: true, featureSlug: validation.feature_slug };
}

function assertExpectedFeature(state, options = {}, binding = null) {
  const expected = readExpectedFeature(options);
  if (!expected.provided) return expected;

  const activeFeature = state && state.mode === 'feature'
    ? String(state.featureSlug || '').trim() || null
    : null;
  if (expected.featureSlug === activeFeature) return expected;

  const registryLine = describeBindingRegistry(binding, activeFeature);
  const error = new Error(
    [
      '[workflow:next] Workflow binding mismatch — activation aborted before agent routing.',
      `Expected feature: ${expected.featureSlug || '(project mode)'}`,
      `Active workflow: ${activeFeature || '(project mode)'}`,
      registryLine,
      'Reclassify the current request first. Use Dev Simple Plan without workflow:next for unrelated bounded work, or pass the active feature slug only after confirming continuation.'
    ].filter(Boolean).join('\n')
  );
  error.code = 'WORKFLOW_FEATURE_MISMATCH';
  error.expectedFeature = expected.featureSlug;
  error.activeFeature = activeFeature;
  throw error;
}

function ensureSheldonBeforePlanner(sequence) {
  const normalized = (Array.isArray(sequence) ? sequence : [])
    .map(normalizeAgentName)
    .filter(Boolean);
  const productIndex = normalized.indexOf('product');
  const plannerIndex = normalized.indexOf('planner');
  if (productIndex === -1 || plannerIndex === -1 || plannerIndex < productIndex) return normalized;
  const withoutSheldon = normalized.filter((stage) => stage !== 'sheldon');
  withoutSheldon.splice(withoutSheldon.indexOf('planner'), 0, 'sheldon');
  return withoutSheldon;
}

function buildDefaultWorkflowConfig() {
  return {
    version: 1,
    project: {
      MICRO: ['setup', 'product', 'sheldon', 'planner', 'dev', 'qa'],
      SMALL: ['setup', 'product', 'sheldon', 'planner', 'dev', 'qa'],
      MEDIUM: ['setup', 'product', 'sheldon', 'planner', 'dev', 'qa']
    },
    feature: DEFAULT_FEATURE_WORKFLOW_BY_CLASSIFICATION,
    rules: {
      required: ['sheldon', 'dev'],
      allowDetours: true
    }
  };
}

function parseFeaturesMarkdown(markdown) {
  return String(markdown || '')
    .split(/\r?\n/)
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

function resolveVerificationPolicy(options = {}, state = {}) {
  const explicit = options.verificationPolicy ||
    options['verification-policy'] ||
    options.verification_policy ||
    options.policy;
  if (explicit) return normalizePolicy(explicit) || 'standard';
  // Classification controls the expected depth of an explicit plan, not which
  // review tools run. Strict verification must be requested or risk-triggered.
  return 'standard';
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

async function collectHandoffArtifactUris(targetDir, state, completedStage, technicalGate = null) {
  const slug = state.featureSlug;
  const addedAt = new Date().toISOString();
  const candidate = (relativePath, kind) => ({
    path: relativePath,
    kind,
    agent: completedStage,
    added_at: addedAt
  });
  const candidates = [];

  if (slug) {
    const prd = `.aioson/context/prd-${slug}.md`;
    const briefing = `.aioson/briefings/${slug}/briefings.md`;
    const prototype = `.aioson/briefings/${slug}/prototype.html`;
    const prototypeManifest = `.aioson/briefings/${slug}/prototype-manifest.md`;
    const plan = `.aioson/context/implementation-plan-${slug}.md`;
    const dossier = `.aioson/context/features/${slug}/dossier.md`;
    const mapping = `mappings/${slug}/continuity.md`;

    if (completedStage === 'product' || completedStage === 'sheldon') {
      candidates.push(
        candidate(prd, 'prd'),
        candidate(briefing, 'briefing'),
        candidate(prototype, 'prototype'),
        candidate(prototypeManifest, 'manifest')
      );
      if (completedStage === 'sheldon') {
        try {
          const status = await reviewStatus({ rootDir: targetDir, featureSlug: slug });
          const sheldon = (status.agents || []).find((item) => item.agent === 'sheldon');
          if (sheldon?.report_path) candidates.push(candidate(sheldon.report_path, 'evidence'));
        } catch {
          // The handoff contract owns the blocking review check.
        }
      }
    } else if (completedStage === 'planner') {
      candidates.push(candidate(prd, 'prd'), candidate(plan, 'plan'));
    } else if (completedStage === 'dev') {
      candidates.push(
        candidate(plan, 'plan'),
        candidate('.aioson/context/dev-state.md', 'evidence'),
        candidate(dossier, 'dossier')
      );
    } else if (completedStage === 'qa') {
      candidates.push(candidate(`.aioson/context/qa-report-${slug}.md`, 'qa_report'));
      if (technicalGate?.evidence_path) {
        candidates.push(candidate(technicalGate.evidence_path, 'evidence'));
      }
    }
    candidates.push(candidate(mapping, 'mapping'));
  } else if (completedStage === 'setup') {
    candidates.push(candidate('.aioson/context/project.context.md', 'other'));
  } else if (completedStage === 'product') {
    candidates.push(candidate('.aioson/context/prd.md', 'prd'));
  } else if (completedStage === 'planner') {
    candidates.push(candidate('.aioson/context/implementation-plan.md', 'plan'));
  }

  const present = [];
  for (const item of candidates) {
    if (await exists(path.join(targetDir, item.path))) present.push(item);
  }
  return present;
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
  for (const classification of ['MICRO', 'SMALL', 'MEDIUM']) {
    merged.project[classification] = ensureSheldonBeforePlanner(merged.project[classification]);
    merged.feature[classification] = ensureSheldonBeforePlanner(merged.feature[classification]);
  }
  merged.rules.required = Array.from(new Set([
    ...((Array.isArray(merged.rules.required) ? merged.rules.required : []).map(normalizeAgentName)),
    'sheldon',
    'dev'
  ]));

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
  // The feature registry binds the workflow: project-pulse.md `active_feature`
  // is the single source of truth `feature:current` answers from, and the
  // workflow once kept its own — the pulse moved to a new feature, the
  // workflow stayed on the previous one, and `workflow:next` without
  // --expect-feature answered about the wrong feature with a true-looking
  // "already completed". The pulse wins when it names a feature in progress;
  // the last handoff, then the last feature in progress, are the fallbacks.
  let registry = null;
  try {
    registry = await resolveActiveFeature(targetDir);
  } catch {
    registry = null;
  }
  const registrySlug = registry && registry.source === 'pulse' && registry.slug ? registry.slug : null;
  const registryFeature = registrySlug
    ? (features || []).find((feature) => feature.slug === registrySlug && feature.status === 'in_progress') || null
    : null;
  const preferredSlug = registryFeature
    ? registryFeature.slug
    : (lastHandoff && lastHandoff.feature_slug ? lastHandoff.feature_slug : null);
  const activeFeature = chooseActiveFeature(features, preferredSlug);

  if (activeFeature) {
    return {
      mode: 'feature',
      featureSlug: activeFeature.slug,
      features,
      binding_source: registryFeature ? 'pulse' : (lastHandoff && lastHandoff.feature_slug === activeFeature.slug ? 'last-handoff' : 'features.md'),
      registry: registrySlug
    };
  }

  return {
    mode: hasProjectPrd ? 'project' : 'project',
    featureSlug: null,
    features,
    binding_source: null,
    registry: registrySlug
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
  const hasApprovedFrontmatter = async (filePath, field = 'status') => {
    const content = await fs.readFile(filePath, 'utf8').catch(() => '');
    if (!content) return false;
    const value = parseFrontmatterValue(content, field);
    return String(value || '').trim().toLowerCase() === 'approved';
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
    // The slug-less design-doc.md may be the retired installer seed (the
    // framework's own code layout) — never a feature design document.
    const anyUsableDesignDoc = async (candidates) => {
      for (const candidate of candidates) {
        if (await isUsableDesignDocFile(candidate)) return true;
      }
      return false;
    };
    return (await anyUsableDesignDoc(designDocCandidates)) && (await anyExists(readinessCandidates));
  }

  if (stage === 'pm') {
    // PM is a bounded advisory detour. It owns no canonical artifact.
    return true;
  }

  if (stage === 'planner') {
    const planPath = slug
      ? path.join(base, `implementation-plan-${slug}.md`)
      : path.join(base, 'implementation-plan.md');
    return (await exists(planPath)) && (await hasApprovedFrontmatter(planPath));
  }

  if (stage === 'sheldon') {
    // Sheldon enriches the PRD in place; tracked features also require the
    // current hash-bound review, not only the editable frontmatter marker.
    const prdPath = slug ? path.join(base, `prd-${slug}.md`) : path.join(base, 'prd.md');
    if (!(await exists(prdPath)) || !(await hasApprovedFrontmatter(prdPath, 'sheldon_review'))) {
      return false;
    }
    if (state.mode === 'feature' && slug) {
      const review = await validateCurrentSheldonReview(targetDir, slug, prdPath);
      return review.ok;
    }
    return true;
  }

  if (stage === 'orchestrator') {
    // Orchestrator is an optional coordination consultation with no canonical
    // document of its own.
    return true;
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
  // pm is inferable from implementation-plan-{slug}.md for the same reason:
  // it sits before scope-check in the MEDIUM feature sequence.
  // Sheldon and Planner are inferable from the in-place PRD review marker and
  // approved implementation plan. Legacy spec authorities remain inferable.
  return ['setup', 'product', 'planner', 'analyst', 'scope-check', 'architect', 'discovery-design-doc', 'ux-ui', 'pm', 'sheldon', 'orchestrator'].includes(
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
  const shouldPersist = options.persist !== false;
  let existing = await readJsonIfExists(statePath);
  const modeInfo = await detectWorkflowMode(targetDir);
  const binding = { source: modeInfo.binding_source || null, registry: modeInfo.registry || null, moved: null, restored: null };

  // Mode/feature-transition guard: if the persisted state no longer matches
  // the feature the registry binds (or the mode), it is stale. This covers
  // both directions: a feature was paused/closed and project mode should
  // resume, or another feature became active while a workflow state for the
  // previous one still exists. The previous feature's progress is archived
  // beside it — regenerating over it once erased `completed` silently.
  if (existing) {
    if (
      existing.mode !== modeInfo.mode ||
      (modeInfo.mode === 'feature' && existing.featureSlug !== modeInfo.featureSlug) ||
      (modeInfo.mode !== 'feature' && existing.featureSlug)
    ) {
      binding.moved = { from: existing.featureSlug || null, to: modeInfo.featureSlug || null, mode: modeInfo.mode, archived: null, persisted: false };
      Object.assign(binding.moved, await archiveFeatureState(targetDir, existing, { persist: shouldPersist }));
      existing = null;
    }
  }

  // A feature the workflow was bound to before returns with its progress.
  if (!existing && modeInfo.mode === 'feature' && modeInfo.featureSlug) {
    const archived = await readArchivedFeatureState(targetDir, modeInfo.featureSlug);
    if (archived) {
      existing = archived;
      binding.restored = { feature: modeInfo.featureSlug, from: path.relative(targetDir, featureStateArchivePath(targetDir, modeInfo.featureSlug)).split(path.sep).join('/') };
    }
  }
  if ((binding.moved || binding.restored) && shouldPersist) {
    try {
      await appendWorkflowEvent(targetDir, {
        at: new Date().toISOString(),
        event: 'binding_moved',
        from: binding.moved ? binding.moved.from : null,
        to: modeInfo.featureSlug || null,
        mode: modeInfo.mode,
        source: binding.source,
        archived: binding.moved ? binding.moved.archived : null,
        restored: binding.restored ? binding.restored.from : null
      });
    } catch { /* the events log is best-effort */ }
  }

  if (existing && typeof existing === 'object' && Array.isArray(existing.sequence)) {
    const currentSequence = existing.sequence.map(normalizeAgentName);
    const upgradedSequence = ensureSheldonBeforePlanner(currentSequence);
    let upgradedStateChanged = false;
    if (JSON.stringify(upgradedSequence) !== JSON.stringify(currentSequence)) {
      existing.sequence = upgradedSequence;
      existing.skipped = (existing.skipped || []).filter((stage) => normalizeAgentName(stage) !== 'sheldon');
      upgradedStateChanged = true;
    }

    if (existing.featureSlug) {
      const sheldonIndex = upgradedSequence.indexOf('sheldon');
      const currentIndex = upgradedSequence.indexOf(normalizeAgentName(existing.current));
      const nextIndex = upgradedSequence.indexOf(normalizeAgentName(existing.next));
      const completed = (existing.completed || []).map(normalizeAgentName);
      const skipped = (existing.skipped || []).map(normalizeAgentName);
      const progressedPastSheldon = sheldonIndex !== -1 && (
        completed.some((stage) => upgradedSequence.indexOf(stage) >= sheldonIndex)
        || skipped.includes('sheldon')
        || currentIndex > sheldonIndex
        || nextIndex > sheldonIndex
      );
      if (progressedPastSheldon) {
        const prdPath = path.join(targetDir, '.aioson/context', `prd-${existing.featureSlug}.md`);
        const currentReview = await validateCurrentSheldonReview(
          targetDir,
          existing.featureSlug,
          prdPath
        );
        if (!currentReview.ok) {
          const downstream = new Set(upgradedSequence.slice(sheldonIndex));
          existing.completed = completed.filter((stage) => !downstream.has(stage));
          existing.skipped = skipped.filter((stage) => !downstream.has(stage));
          existing.current = null;
          existing.next = 'sheldon';
          upgradedStateChanged = true;
        }
      }
    }
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
    const changed = upgradedStateChanged || reconciled.changed || merged.changed || finalReconciled.changed || Boolean(binding.restored);
    if (changed && shouldPersist) {
      await writeJson(statePath, finalReconciled.state);
      if (binding.restored) await fs.unlink(featureStateArchivePath(targetDir, modeInfo.featureSlug)).catch(() => {});
    }
    return {
      statePath,
      state: finalReconciled.state,
      created: false,
      changed,
      persisted: changed && shouldPersist,
      binding
    };
  }

  const context = await validateProjectContextFile(targetDir);

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

  if (shouldPersist) await writeJson(statePath, state);
  return {
    statePath,
    state,
    created: true,
    changed: true,
    persisted: shouldPersist,
    binding
  };
}

/** One line per binding move/restore for the operator; nothing when the binding stood still. */
function describeBinding(binding) {
  if (!binding) return [];
  const lines = [];
  if (binding.moved) {
    const from = binding.moved.from || '(project mode)';
    const to = binding.moved.to || '(project mode)';
    const via = binding.source === 'pulse' ? 'project-pulse.md active_feature' : (binding.source || 'features.md');
    lines.push(`[workflow:next] workflow binding moved: ${from} → ${to} (feature registry: ${via})${binding.moved.archived ? `; previous progress ${binding.moved.persisted ? 'archived at' : 'would be archived at'} ${binding.moved.archived}` : ''}`);
    if (binding.moved.archive_skipped) lines.push(`[workflow:next] warning: ${from}'s progress is NOT archived — "${from}" cannot name .aioson/context/features/<slug>/ (${binding.moved.archive_skipped}); the move replaces it`);
  }
  if (binding.restored) {
    lines.push(`[workflow:next] workflow progress restored for ${binding.restored.feature} from ${binding.restored.from}`);
  }
  return lines;
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

function isInactiveCompletedStage(state, stageName) {
  const normalizedStage = normalizeAgentName(stageName || state.current || state.next);
  if (!normalizedStage) return false;
  const completedStages = new Set((state.completed || []).map(normalizeAgentName));
  const activeStage = normalizeAgentName(state.current || state.next);
  const activeDetour = state.detour && state.detour.active
    ? normalizeAgentName(state.detour.agent)
    : null;
  return completedStages.has(normalizedStage)
    && normalizedStage !== activeStage
    && normalizedStage !== activeDetour;
}

/**
 * Keep a lightweight context cache for every feature classification. The
 * dossier is intelligence infrastructure, not a canonical artifact or gate:
 * initialization is best-effort and can never block stage activation.
 */
async function ensureFeatureDossier(targetDir, state) {
  if (state.mode !== 'feature' || !state.featureSlug) return;

  const classification = normalizeClassification(state.classification, 'MICRO');
  const contextDir = path.join(targetDir, '.aioson', 'context');
  const dossierFile = path.join(contextDir, 'features', state.featureSlug, 'dossier.md');
  if (await exists(dossierFile)) return;

  let mode = null;
  try {
    await dossierBootstrap.initFromExisting({
      slug: state.featureSlug,
      contextDir,
      classification,
      targetDir
    });
    mode = 'from-existing';
  } catch (err) {
    if (!err || err.code !== 'EBOOTSTRAPEMPTY') return;
    try {
      await dossierStore.init({
        slug: state.featureSlug,
        contextDir,
        classification,
        whyText: '(lightweight workflow context cache)',
        whatText: '(populated as evidence becomes available)'
      });
      mode = 'minimal-fallback';
    } catch {
      return;
    }
  }

  if (!mode) return;
  try {
    await emitDossierEvent(targetDir, {
      agent: 'workflow-next',
      type: 'dossier_auto_initialized',
      summary: `${state.featureSlug} ${mode}`,
      meta: {
        feature_slug: state.featureSlug,
        classification,
        trigger_source: 'workflow_next_context_cache',
        mode,
        blocking: false
      }
    });
  } catch {
    // Context-cache telemetry is deliberately non-blocking.
  }
}

function qaReportRelativePath(featureSlug) {
  return `.aioson/context/qa-report-${featureSlug}.md`;
}

async function readQaVerdict(targetDir, featureSlug) {
  if (!featureSlug) return null;
  const reportPath = path.join(targetDir, qaReportRelativePath(featureSlug));
  const report = await fs.readFile(reportPath, 'utf8').catch(() => '');
  if (!report) return null;
  const raw = parseFrontmatterValue(report, 'verdict')
    || parseFrontmatterValue(report, 'status')
    || ((report.match(/(?:\*\*)?verdict(?:\*\*)?\s*:\s*([A-Za-z_-]+)/i) || [])[1]);
  const normalized = String(raw || '').trim().toLowerCase();
  if (['pass', 'passed', 'approved'].includes(normalized)) return 'pass';
  if (['fail', 'failed', 'blocked'].includes(normalized)) return 'fail';
  return normalized || null;
}

async function advanceQaDevCycle(targetDir, featureSlug) {
  return runReviewCycle({
    args: [targetDir],
    options: {
      sub: 'advance',
      json: true,
      feature: featureSlug,
      plan: qaReportRelativePath(featureSlug),
      source: 'qa',
      to: 'dev',
      summary: 'QA verdict FAIL; consolidated correction cycle'
    },
    logger: { log() {}, error() {} }
  });
}

async function resolveQaDevCycle(targetDir, featureSlug) {
  return runReviewCycle({
    args: [targetDir],
    options: {
      sub: 'resolve',
      json: true,
      feature: featureSlug,
      source: 'qa',
      to: 'dev'
    },
    logger: { log() {}, error() {} }
  });
}

async function resetQaDevCycle(targetDir, featureSlug) {
  return runReviewCycle({
    args: [targetDir],
    options: {
      sub: 'reset',
      json: true,
      feature: featureSlug,
      source: 'qa',
      to: 'dev'
    },
    logger: { log() {}, error() {} }
  });
}

async function finalizeCurrentStage(targetDir, config, state, stageName) {
  const normalizedStage = normalizeAgentName(stageName || state.current || state.next);
  if (!normalizedStage) {
    throw new Error('No stage is active to complete.');
  }

  if (isInactiveCompletedStage(state, normalizedStage)) {
    return {
      state,
      completedStage: normalizedStage,
      alreadyCompleted: true
    };
  }
  let qaVerdict = null;
  if (normalizedStage === 'qa' && state.mode === 'feature' && state.featureSlug) {
    qaVerdict = await readQaVerdict(targetDir, state.featureSlug);
    if (qaVerdict === 'fail') {
      const reviewCycle = await advanceQaDevCycle(targetDir, state.featureSlug);
      if (!reviewCycle.ok) {
        throw new Error(`[QA Correction Cycle] Cannot route QA findings: ${reviewCycle.reason || 'unknown error'}.`);
      }
      if (reviewCycle.action === 'stop_cycle_limit') {
        const error = new Error(
          `[QA Cycle Limit Reached] ${state.featureSlug} exhausted ${reviewCycle.cycle}/${reviewCycle.max_cycles} QA→DEV correction cycle(s). `
          + 'Stop automatic review and require a human/product decision or an explicit review-cycle reset.'
        );
        error.code = 'WORKFLOW_QA_CYCLE_LIMIT';
        error.reviewCycle = reviewCycle;
        throw error;
      }
      if (reviewCycle.action !== 'invoke_dev') {
        throw new Error(`[QA Correction Cycle] Unexpected action: ${reviewCycle.action || 'none'}.`);
      }
      const completed = (state.completed || [])
        .map(normalizeAgentName)
        .filter((stage) => stage && stage !== 'dev' && stage !== 'qa');
      return {
        state: buildStatePayload({
          ...state,
          completed,
          current: null,
          next: 'dev',
          detour: null
        }),
        completedStage: null,
        attemptedStage: 'qa',
        correctionCycle: reviewCycle
      };
    }
  }
  let auditCodeSummary = null;
  let rulesCheckSummary = null;
  let scopeDriftSummary = null;
  let executionSummary = null;

  // ── Harness Done Gate ───────────────────────────────────────────────────
  if (state.mode === 'feature' && state.featureSlug) {
    // ── Orchestrated execution gate ─────────────────────────────────────────
    // With orchestrated execution selected in the manifest, the planner stage
    // cannot complete on a missing or stale compiled plan — "does not run
    // without models per role" is an engine gate here, not a prompt line. DEV
    // gets an advisory when the compiled lanes never ran to completion.
    const executionGate = await inspectExecutionGate(targetDir, state.featureSlug, normalizedStage);
    if (executionGate.blocking) {
      throw new Error(executionGate.message);
    }
    if (executionGate.mode === 'orchestrated' || executionGate.advisory) executionSummary = executionGate;
    if (normalizedStage === 'dev') {
      const chainGate = await inspectChainHandoffGate(targetDir, {
        featureSlug: state.featureSlug,
        agent: normalizedStage
      });
      if (!chainGate.ok) {
        const ids = chainGate.items.map((item) => item.work_item_id).join(', ');
        throw new Error(
          `[Neural Chain Gate BLOCKED] @dev has ${chainGate.items.length} unresolved actionable impact item(s): ${ids}. `
          + 'Claim, inspect, and resolve them with evidence before completing DEV.'
        );
      }
    }
    if (normalizedStage === 'dev' || normalizedStage === 'qa') {
      // Reject missing/abbreviated delivery paths and other cheap handoff
      // structure before running the feature's potentially expensive commands.
      const structuralContract = await validateHandoffContract(
        targetDir,
        state,
        normalizedStage,
        { structuralOnly: true }
      );
      if (!structuralContract.ok) {
        if (isSecurityGateBlocked(structuralContract, state, normalizedStage)) {
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
              blockers: structuralContract.missing
            }
          });
        }
        const errMsg = formatContractError(structuralContract);
        await logError(targetDir, normalizedStage, errMsg, 'contract-structure');
        throw new Error(errMsg);
      }

      const harnessContractPath = path.join(
        targetDir,
        '.aioson',
        'plans',
        state.featureSlug,
        'harness-contract.json'
      );
      // Harnesses are optional specialist evidence on NON-runtime features.
      // But when the framework detects a runtime surface deterministically
      // (prototype-manifest / migrations), §2c makes the contract mandatory —
      // and feature:close enforces exactly that. Evaluate the same gate here,
      // missing-contract case included, so the block lands at @dev-done with
      // an actionable message instead of surfacing four gates later at close
      // (A5: the close-time discovery was the root cause of the rework).
      const hasHarnessContract = await exists(harnessContractPath);
      const integrityGate = await evaluateContractIntegrityGate(targetDir, state.featureSlug, {
        runChecks: hasHarnessContract
      });
      if (!integrityGate.ok) {
        const errMsg = formatContractIntegrityGateError(integrityGate, normalizedStage);
        await logError(targetDir, normalizedStage, errMsg, 'harness-contract');
        throw new Error(errMsg);
      }

      // ── Scope drift gate (absorbs @scope-check's deterministic spec:analyze) ──
      // scope-check is no longer a default stage; this is the drift check a
      // dev/qa completion keeps. It used to run only when a LEGACY artifact
      // (spec-/design-doc-/readiness-{slug}.md) existed — artifacts every
      // canonical kernel forbids — so in the PRD → plan route it never fired and
      // no gate ever compared the delivered code with the plan. It now runs for
      // the canonical artifacts too, post-implementation (`--stage`): planned
      // paths must exist and the delivered diff is compared with the plan.
      //
      // Honest tiering. BLOCK on what the completing stage owns or what is
      // broken beyond doubt: execution-stage completeness errors (a planned
      // file missing, a retired file still present), an invalid harness
      // contract, a readiness declared blocked. Upstream-stage completeness
      // errors (a malformed PRD or plan table) are surfaced with their owner —
      // they were sheldon's or planner's seal to refuse, feature:close still
      // blocks on them, and a dev completion is the wrong place to pay that
      // debt. Warnings (drift, staleness, wave overlap) are advisory: they ride
      // the finalize result, a guard event, and the persisted
      // spec-analyze-{slug}.json, and never block. Defensive: never crashes.
      const scopeArtifacts = [
        path.join(targetDir, '.aioson', 'context', `implementation-plan-${state.featureSlug}.md`),
        path.join(targetDir, '.aioson', 'context', `prd-${state.featureSlug}.md`),
        path.join(targetDir, '.aioson', 'context', `spec-${state.featureSlug}.md`),
        path.join(targetDir, '.aioson', 'context', `design-doc-${state.featureSlug}.md`),
        path.join(targetDir, '.aioson', 'context', `readiness-${state.featureSlug}.md`)
      ];
      if (await Promise.any(scopeArtifacts.map(async (filePath) => {
        if (await exists(filePath)) return true;
        throw new Error('missing');
      })).catch(() => false)) try {
        const drift = await runSpecAnalyze({
          args: [targetDir],
          options: { feature: state.featureSlug, stage: normalizedStage },
          logger: { log() {}, error() {} }
        });
        if (drift && Array.isArray(drift.findings)) {
          const ownedError = (f) => f.severity === 'error' && (!f.stage || f.stage === 'execution');
          const blocking = drift.findings.filter(ownedError);
          const upstream = drift.findings.filter((f) => f.severity === 'error' && !ownedError(f));
          const advisories = drift.findings.filter((f) => f.severity === 'warning');
          scopeDriftSummary = {
            stage: normalizedStage,
            blocking: blocking.map((f) => `${f.check}: ${f.message}`),
            upstream: upstream.map((f) => `[${f.stage}] ${f.check}: ${f.message}`),
            advisories: advisories.map((f) => `${f.check}: ${f.message}`),
            report: `.aioson/context/spec-analyze-${state.featureSlug}.json`
          };
          if (blocking.length > 0) {
            const errs = blocking.map((f) => `  - ${f.check}: ${f.message}`).join('\n');
            const driftMsg = `[Scope Drift Gate] @${normalizedStage} blocked — spec:analyze found ${blocking.length} drift error(s):\n${errs}\nResolve the drift (or run @scope-check) before completing this stage.`;
            await logError(targetDir, normalizedStage, driftMsg, 'scope-drift');
            throw new Error(driftMsg);
          }
          if (advisories.length > 0 || upstream.length > 0) {
            try {
              const { emitGuardEvent } = require('../harness/guard-events');
              await emitGuardEvent(targetDir, {
                eventType: 'scope_drift_findings',
                agent: normalizedStage,
                message: `${advisories.length} drift advisory(ies), ${upstream.length} upstream error(s) — advisory`,
                payload: { slug: state.featureSlug, advisories: advisories.map((f) => f.check), upstream: upstream.map((f) => f.check) }
              });
            } catch { /* telemetry best-effort */ }
          }
        }
      } catch (driftErr) {
        if (driftErr && driftErr.message && driftErr.message.includes('[Scope Drift Gate]')) throw driftErr;
        // spec:analyze unavailable or non-analyzable — non-blocking
      }

      // ── Code-quality gate (deterministic audit:code) ───────────────────────
      // Build-free scan of the changed files for the non-security categories
      // (anti-patterns / TODOs / dead code / duplication). Unlike the integrity
      // and drift gates above — which enforce the feature's DECLARED contract /
      // spec — audit:code is a heuristic opinion, so it defaults to ADVISORY: the
      // report is persisted (.aioson/context/audit-code.json), a guard event is
      // emitted, and a summary rides the finalize result, but the stage is NOT
      // blocked. Set verification.json `audit_code.tracked_gate: "block"` to make a
      // HIGH finding in scope a hard gate, or "off" to skip. Defensive: only a
      // deliberate block-mode throw escapes; any other error is swallowed.
      try {
        const { readVerificationConfig, getAuditCodePolicy } = require('../verification-policy');
        const auditPolicy = getAuditCodePolicy(await readVerificationConfig(targetDir));
        if (auditPolicy.tracked_gate !== 'off') {
          const { runAuditCode } = require('./audit-code');
          const codeAudit = await runAuditCode({
            args: [targetDir],
            options: { changed: auditPolicy.scope !== 'full', json: true, suppressExitCode: true },
            logger: { log() {}, error() {} }
          });
          const high = codeAudit && codeAudit.by_severity ? (codeAudit.by_severity.HIGH || 0) : 0;
          const med = codeAudit && codeAudit.by_severity ? (codeAudit.by_severity.MED || 0) : 0;
          const categories = Object.keys((codeAudit && codeAudit.by_category) || {});
          auditCodeSummary = { gate: auditPolicy.tracked_gate, scope: auditPolicy.scope, high, med, categories };
          if (high > 0 && auditPolicy.tracked_gate === 'block') {
            const msg = `[Code-Quality Gate] @${normalizedStage} blocked — audit:code found ${high} HIGH finding(s) in the ${auditPolicy.scope} files (${categories.join(', ')}). Fix them, or relax verification.json audit_code.tracked_gate to "advisory"/"off". See .aioson/context/audit-code.json`;
            await logError(targetDir, normalizedStage, msg, 'audit-code');
            throw new Error(msg);
          }
          if (high > 0) {
            try {
              const { emitGuardEvent } = require('../harness/guard-events');
              await emitGuardEvent(targetDir, {
                eventType: 'audit_code_findings',
                agent: normalizedStage,
                message: `${high} HIGH / ${med} MED in ${auditPolicy.scope} files (${categories.join(', ')}) — advisory`,
                payload: { slug: state.featureSlug, high, med, scope: auditPolicy.scope }
              });
            } catch { /* telemetry best-effort */ }
          }
        }
      } catch (auditErr) {
        if (auditErr && auditErr.message && auditErr.message.includes('[Code-Quality Gate]')) throw auditErr;
        // audit:code unavailable / non-git — non-blocking
      }

      // ── Rule-compliance gate (deterministic rules:check) ───────────────────
      // The gate above asks "is this code any good?"; this one asks "is this
      // code obeying the rules the project itself declared?". That is why it
      // defaults to BLOCK: a rule outranks every feature-scoped artifact, so a
      // PRD, plan, or dossier deviation can never resolve a conflict in its own
      // favour. The escape hatch is the rule file — edit it, scope it, or delete
      // it — or relax verification.json rules_check.tracked_gate.
      try {
        const { readVerificationConfig, getRulesCheckPolicy } = require('../verification-policy');
        const rulesPolicy = getRulesCheckPolicy(await readVerificationConfig(targetDir));
        if (rulesPolicy.tracked_gate !== 'off') {
          const { runRulesCheck } = require('./rules-check');
          const rulesReport = await runRulesCheck({
            args: [targetDir],
            options: { changed: rulesPolicy.scope !== 'full', json: true, suppressExitCode: true },
            logger: { log() {}, error() {} }
          });
          const high = rulesReport && rulesReport.by_severity ? (rulesReport.by_severity.HIGH || 0) : 0;
          const med = rulesReport && rulesReport.by_severity ? (rulesReport.by_severity.MED || 0) : 0;
          const broken = (rulesReport && rulesReport.rules_enforced || [])
            .filter((rule) => !rule.ok).map((rule) => rule.name);
          rulesCheckSummary = { gate: rulesPolicy.tracked_gate, scope: rulesPolicy.scope, high, med, rules: broken };
          if (high > 0 && rulesPolicy.tracked_gate === 'block') {
            // An established divergence is not this slice's fault, and the fix
            // is a decision about the whole codebase. Say so, instead of asking
            // the agent to migrate a tree it was never sent to migrate.
            const legacy = rulesReport && rulesReport.divergence
              ? ` This project already breaks the rule in ${rulesReport.divergence.offending_files} of ${rulesReport.divergence.scanned_files} source files, so it is an established convention, not this slice's drift — the human decides once: migrate, run \`aioson rules:check . --baseline\` to accept the existing code as counted debt while new violations still block, or edit the rule.`
              : '';
            const msg = `[Rule-Compliance Gate] @${normalizedStage} blocked — rules:check found ${high} violation(s) of ${broken.join(', ')} in the ${rulesPolicy.scope} files. A project rule outranks the PRD, the plan, and any recorded deviation: fix the code, or change the rule itself.${legacy} See .aioson/context/rules-check.json`;
            await logError(targetDir, normalizedStage, msg, 'rules-check');
            throw new Error(msg);
          }
          if (high > 0 || med > 0) {
            try {
              const { emitGuardEvent } = require('../harness/guard-events');
              await emitGuardEvent(targetDir, {
                eventType: 'rules_check_violations',
                agent: normalizedStage,
                message: `${high} HIGH / ${med} MED against ${broken.join(', ') || 'enforced rules'} in ${rulesPolicy.scope} files`,
                payload: { slug: state.featureSlug, high, med, scope: rulesPolicy.scope, rules: broken }
              });
            } catch { /* telemetry best-effort */ }
          }
        }
      } catch (rulesErr) {
        if (rulesErr && rulesErr.message && rulesErr.message.includes('[Rule-Compliance Gate]')) throw rulesErr;
        // rules:check unavailable / non-git — non-blocking
      }
    }

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

  let correctionCycleResolution = null;
  if (normalizedStage === 'dev' && state.mode === 'feature' && state.featureSlug) {
    const resolved = await resolveQaDevCycle(targetDir, state.featureSlug);
    if (resolved.action === 'invoke_qa') correctionCycleResolution = resolved;
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

  // Reconcile eagerly: completing a later stage must never leave `next` pointing
  // at an earlier unresolved stage (e.g. lean-lane sheldon that only chained via
  // prompt). Without this, `--complete=dev` re-activated the spec agent and the
  // reconcile only healed on the NEXT load — after the backwards activation had
  // already been printed and persisted.
  const reconciled = reconcileWorkflowState(nextState);
  let correctionCycleReset = null;
  if (normalizedStage === 'qa' && qaVerdict === 'pass' && state.featureSlug) {
    correctionCycleReset = await resetQaDevCycle(targetDir, state.featureSlug);
  }

  return {
    state: reconciled.changed ? reconciled.state : nextState,
    completedStage: normalizedStage,
    handoffContractOk: contractCheck.ok,
    technicalGate: techGate,
    ...(correctionCycleResolution ? { correctionCycleResolution } : {}),
    ...(correctionCycleReset ? { correctionCycleReset } : {}),
    ...(auditCodeSummary ? { auditCode: auditCodeSummary } : {}),
    ...(rulesCheckSummary ? { rulesCheck: rulesCheckSummary } : {}),
    ...(scopeDriftSummary ? { scopeDrift: scopeDriftSummary } : {}),
    ...(executionSummary ? { execution: executionSummary } : {})
  };
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
  const required = new Set((config.rules?.required || []).map(normalizeAgentName));
  const skippedRequired = toSkip.find((agent) => required.has(normalizeAgentName(agent)));
  if (skippedRequired) {
    throw new Error(`Cannot skip @${normalizeAgentName(skippedRequired)} because it is mandatory.`);
  }

  const skipped = Array.from(new Set([...(state.skipped || []), ...toSkip]));
  return buildStatePayload({
    ...state,
    skipped,
    current: null,
    next: normalizedTarget
  });
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
      slug ? `features/${slug}/implementation-ledger.md` : null,
      slug ? `features/${slug}/verification-report.md` : null,
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

function routeLabel(route) {
  return route ? `@${normalizeAgentName(route)}` : '@qa';
}

function workflowGuidanceForVerification(verdict, route, normalReturnTo) {
  if (verdict === 'PASS') {
    return `PASS: keep normal workflow ownership (${routeLabel(normalReturnTo || route)}), then continue diff/scope review.`;
  }
  if (verdict === 'NEEDS_DEV_FIX') {
    return 'NEEDS_DEV_FIX: do not approve clean post-dev scope; route concrete file:line findings to @dev.';
  }
  if (verdict === 'NEEDS_SCOPE_DECISION') {
    return `NEEDS_SCOPE_DECISION: route to ${routeLabel(route)}; do not patch product scope locally.`;
  }
  if (verdict === 'NEEDS_QA_RECHECK') {
    return 'NEEDS_QA_RECHECK: route to @qa after scope alignment is clear.';
  }
  if (verdict === 'NEEDS_SECURITY_REVIEW') {
    return 'NEEDS_SECURITY_REVIEW: preserve the security review owner and route to @pentester.';
  }
  return `INCONCLUSIVE: route to the owner of missing evidence (${routeLabel(route)}) when strict verification applies.`;
}

async function findImplementationVerificationReport(targetDir, slug) {
  const slugResult = validateFeatureSlug(slug);
  if (!slugResult.ok) return null;

  const latestPath = path.join(featureContextDir(targetDir, slug), 'verification-report.md');
  if (await exists(latestPath)) {
    return {
      absolutePath: latestPath,
      relativePath: relativeFromRoot(targetDir, latestPath),
      source: 'latest'
    };
  }

  const runsDir = verificationRunsDir(targetDir, slug);
  let entries = [];
  try {
    entries = await fs.readdir(runsDir);
  } catch {
    return null;
  }
  const reportName = entries
    .filter((entry) => /-report\.md$/i.test(entry))
    .sort()
    .pop();
  if (!reportName) return null;

  const reportPath = path.join(runsDir, reportName);
  return {
    absolutePath: reportPath,
    relativePath: relativeFromRoot(targetDir, reportPath),
    source: 'verification-runs'
  };
}

async function buildImplementationVerificationBriefing(targetDir, state, scopeCheckMode, policy) {
  const mode = inferScopeCheckMode(state, scopeCheckMode);
  if (
    state.mode !== 'feature' ||
    !state.featureSlug ||
    !['post-dev', 'post-fix', 'final'].includes(mode)
  ) {
    return null;
  }

  const slug = state.featureSlug;
  const latestPath = `.aioson/context/features/${slug}/verification-report.md`;
  const reportRef = await findImplementationVerificationReport(targetDir, slug);
  const lines = [
    '## Implementation verification briefing',
    `Policy: ${policy}`,
    `Expected latest report: ${latestPath}`,
    'Workflow note: this briefing only validates local report artifacts; it never runs `--tool` or any external auditor.'
  ];

  if (!reportRef) {
    lines.push('Report status: missing');
    if (state.classification === 'MICRO') {
      lines.push('MICRO: missing report is not a workflow blocker by default; record residual risk only when the dev handoff relied on verification.');
    } else if (policy === 'strict') {
      lines.push('Strict policy guidance: do not issue final clean scope approval until @dev produces a valid report or documents an explicit N/A rationale.');
    } else {
      lines.push('Guidance: absence is advisory unless the feature policy or dev handoff made verification strict.');
    }
    return {
      status: 'missing',
      mode,
      policy,
      report_path: null,
      verdict: 'INCONCLUSIVE',
      recommended_route: state.classification === 'MICRO' ? state.next || 'qa' : 'dev',
      briefing: lines.join('\n')
    };
  }

  lines.push(`Report path: ${reportRef.relativePath}`);
  lines.push(`Validate command: aioson verify:implementation . --feature=${slug} --check-report=${reportRef.relativePath} --policy=${policy} --json`);

  const parsed = await parseVerificationReport(targetDir, slug, reportRef.relativePath, policy);
  if (!parsed.ok) {
    lines.push(`Report status: invalid (${parsed.reason})`);
    lines.push('Guidance: treat this as INCONCLUSIVE local evidence; do not treat auditor prose as PASS.');
    return {
      status: 'invalid',
      mode,
      policy,
      report_path: reportRef.relativePath,
      verdict: 'INCONCLUSIVE',
      recommended_route: 'qa',
      reason: parsed.reason,
      briefing: lines.join('\n')
    };
  }

  const policyResult = applyPolicy(parsed.report, policy);
  lines.push('Report status: schema-valid');
  lines.push(`Report verdict: ${parsed.report.verdict}`);
  lines.push(`Policy verdict: ${policyResult.verdict}`);
  lines.push(`Policy route: ${routeLabel(policyResult.recommended_route)}`);
  lines.push(`Blocking findings: ${policyResult.blocking_findings_count || 0}`);
  lines.push(`Guidance: ${workflowGuidanceForVerification(policyResult.verdict, policyResult.recommended_route, state.next)}`);
  lines.push('Scope-check still must inspect the diff and approved plan; a PASS report is not final approval.');

  return {
    status: 'valid',
    mode,
    policy,
    report_path: reportRef.relativePath,
    report_source: reportRef.source,
    verdict: policyResult.verdict,
    auditor_verdict: parsed.report.verdict,
    recommended_route: policyResult.recommended_route,
    blocking_findings_count: policyResult.blocking_findings_count || 0,
    reason: policyResult.reason,
    briefing: lines.join('\n')
  };
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

/**
 * Orchestrated execution — deterministic pins for the stages that touch it.
 *
 *   planner:            the offer (roles unlocked + every role signed) → ask
 *                       once, tables, compile; a stale compiled plan → recompile.
 *                       NOT unlocked → for MEDIUM and larger features, one line
 *                       naming the locked state and the unlock step. Silence
 *                       here was the incident: a 77-file plan written for one
 *                       context because the option was invisible until a file
 *                       nobody had created existed. MICRO/SMALL stay
 *                       byte-identical — the lean lane never carries it.
 *   dev / orchestrator: the manifest says orchestrated → run the engine, answer
 *                       decisions, integrate from the ledger. The routed doc
 *                       carries the protocol; the pin carries the STATE.
 *
 * Never throws: an unreadable roles file or plan yields no pin, not a broken
 * activation.
 */
async function buildExecutionActivationContext(targetDir, state, stageName) {
  if (state.mode !== 'feature' || !state.featureSlug) return '';
  if (!['planner', 'dev', 'orchestrator'].includes(stageName)) return '';
  const slug = state.featureSlug;
  try {
    if (stageName === 'planner') {
      const { offerExecution, describeOnboarding, installedExecutionHosts } = require('../lib/execution-roles');
      const { readExecutionPlan, verifyExecutionPlan } = require('../agent-execution/execution-plan');
      const offer = await offerExecution(targetDir);
      if (!offer.available) {
        // MICRO, SMALL and an unknown classification stay silent (the lean
        // default); MEDIUM and anything larger carry the state line.
        if (['', 'MICRO', 'SMALL'].includes(String(state.classification || '').trim().toUpperCase())) return '';
        const installed = await installedExecutionHosts();
        const onboarding = describeOnboarding(offer, { feature: slug, installed });
        return `Orchestrated execution: NOT UNLOCKED here (${offer.reason}; execution hosts installed on this machine: ${installed.join(', ') || 'none'}). `
          + `After writing the plan, \`aioson execution:offer . --feature=${slug} --json\` measures \`plan.scale\` and \`plan.recommendation\` — a split candidate earns the one question (single DEV or orchestrated lanes), and the measured recommendation is the one to present: the lock never flips it; \`onboarding.next\` names the unlock step (now: ${onboarding.next}).`;
      }
      const roles = Object.entries(offer.roles.roles)
        .map(([key, role]) => `${key}=${role.host}/${role.model}${role.reasoning_effort ? `/${role.reasoning_effort}` : ''}`)
        .join(', ');
      const lines = [
        `Orchestrated execution: AVAILABLE (roles signed on this machine: ${roles}).`,
        `Ask the user once (AskUserQuestion): single DEV or orchestrated lanes with these roles — recommend what \`plan.recommendation\` measures (aioson execution:offer . --feature=${slug} --json), never a fixed default. `
        + 'On orchestrated: add the `## Development execution lanes` and `## Execution Sequence` tables to the plan, then run '
        + `\`aioson execution:compile . --feature=${slug}\` before completing — with orchestrated execution selected, the planner stage cannot complete on a missing or stale compiled plan.`
      ];
      const compiled = await readExecutionPlan(targetDir, slug);
      if (compiled.exists) {
        const verified = await verifyExecutionPlan(targetDir, slug);
        lines.push(verified.ok
          ? `Compiled execution plan: fresh (${compiled.plan?.summary?.units ?? '?'} units, ${compiled.plan?.summary?.waves ?? '?'} waves). Editing the plan tables requires recompiling.`
          : `Compiled execution plan: STALE — ${verified.issues[0] || 'recompile'}`);
      }
      return lines.join('\n');
    }
    const { loadManifest, resolveExecutionMode } = require('../agent-execution/manifest');
    const loaded = await loadManifest(targetDir, slug);
    if (!loaded.exists || !loaded.ok || resolveExecutionMode(loaded.manifest) !== 'orchestrated') return '';
    const { statusExecution } = require('../agent-execution/execution-run');
    const status = await statusExecution({ projectDir: targetDir, feature: slug });
    const lines = [
      "Orchestrated execution: this feature's lanes run as external processes — follow `.aioson/docs/dev/execution-lanes.md` § Compiled orchestrated execution."
    ];
    if (!status.run) {
      lines.push(`Run state: ${status.compiled ? 'compiled, not started' : `NOT COMPILED — run: aioson execution:compile . --feature=${slug}`}.`);
      lines.push(`Next: aioson execution:run . --feature=${slug} --preflight --json, then aioson execution:run . --feature=${slug}; answer decisions with execution:decide; integrate from aioson execution:status . --feature=${slug} --json.`);
    } else {
      const run = status.run;
      lines.push(`Run state: ${run.status}${run.reason ? ` (${run.reason})` : ''} — lane units passed ${run.units.passed}/${run.units.lane}, qa passed ${run.units.qa_passed}, findings ${status.findings.length}, decisions pending ${run.decisions_pending.length}.`);
      for (const decision of run.decisions_pending) {
        lines.push(`Decision pending: ${decision.unit} [${decision.stage}] ${decision.reason} → ${decision.hint}`);
      }
      if (status.resume_command) lines.push(`Resume: ${status.resume_command}`);
      if (run.status === 'completed') {
        lines.push(`Integration units for dev: ${(status.integration?.units || []).join(', ') || 'none'}; resolve every finding in the ledger before completing DEV.`);
      }
    }
    return lines.join('\n');
  } catch {
    return '';
  }
}

/**
 * The planner's scale advisory under single-DEV execution: a plan at or above
 * the split floor (`AIOSON_EXECUTION_SPLIT_MIN_FILES`, 12 files) that records
 * no execution choice — no `## Development execution lanes` table and no
 * `execution:` line in its frontmatter — is the measured shape of a question
 * never asked. Advisory, never blocking: the answer may legitimately be single
 * DEV; what the gate charges is that nobody recorded it.
 */
async function inspectExecutionScale(targetDir, slug) {
  const none = { blocking: false, advisory: false };
  const { measurePlanScale, resolveExecutionChoice, splitMinFiles, formatPlanScale, formatRecommendation, formatUnit, proposeSplit, recommendExecution, unitCeiling } = require('../lib/plan-scale');
  const { parseDevelopmentLanes } = require('../harness/plan-waves');
  let content;
  try {
    content = await fs.readFile(path.join(targetDir, '.aioson', 'context', `implementation-plan-${slug}.md`), 'utf8');
  } catch {
    return none;
  }
  const scale = measurePlanScale(content, { minFiles: splitMinFiles(process.env), ceiling: unitCeiling(process.env) });
  const choice = resolveExecutionChoice(content);
  if (!scale.split_candidate) return none;
  if (!choice.choice) {
    const recommendation = recommendExecution(scale, { proposal: proposeSplit(content, { minFiles: splitMinFiles(process.env), ceiling: unitCeiling(process.env) }) });
    return {
      blocking: false,
      advisory: true,
      mode: 'single',
      check: 'execution_scale',
      scale,
      recommendation,
      message: `[Execution Scale] the plan for "${slug}" touches ${formatPlanScale(scale)} — a split candidate (floor ${scale.threshold.min_files} files for one context) — and records no execution choice. Ask the owner once (single DEV or orchestrated lanes), recommending the measured choice: ${formatRecommendation(recommendation)}. A locked roles file never flips the recommendation — it only names the unlock step. Record the answer: \`execution: single\` in the plan frontmatter, or the \`## Development execution lanes\` table + aioson execution:seed . --feature=${slug} --lanes=<lane-a,lane-b>.`
    };
  }
  if (choice.choice !== 'orchestrated') return none;
  // Orchestrated in name only: one unit per wave, or a unit one context cannot carry.
  const over = scale.units.filter((unit) => unit.over_budget);
  const serial = scale.parallelism.serial;
  if (over.length === 0 && !serial) return none;
  const lanesTable = parseDevelopmentLanes(content);
  const laneCount = lanesTable ? lanesTable.rows.length : 0;
  const findings = [];
  if (serial) findings.push(`serial by construction (${laneCount} lane(s), ${scale.parallelism.waves} wave(s) of one unit each, critical path ${scale.parallelism.critical_path_processes} processes)`);
  if (over.length > 0) findings.push(`over the unit ceiling (${scale.ceiling.max_files} files / ${scale.ceiling.max_acs} ACs per context): ${over.map(formatUnit).join(', ')}`);
  return {
    blocking: false,
    advisory: true,
    mode: 'orchestrated',
    check: 'execution_scale',
    scale,
    message: `[Execution Scale] the plan for "${slug}" is orchestrated but ${findings.join('; ')}. Cut the rows per lane/surface inside a wave (\`plan.scale.units\` and \`plan.split_proposal\` in aioson execution:offer . --feature=${slug} --json) and join the halves with Interface Contract rows — lanes are the model axis, one \`{lane}_dev\` role each.`
  };
}

/**
 * The orchestrated-execution stage gate. Only when the manifest selects
 * `orchestration.execution: orchestrated`:
 *   planner completion → BLOCKS on a missing/stale compiled plan (the plan
 *                        must be recompiled after every table edit);
 *   dev completion     → ADVISORY when the compiled lanes never ran to
 *                        completion (the ledger may hold unresolved findings).
 * Any other manifest → no gate, no output (the single-DEV route is untouched).
 */
async function inspectExecutionGate(targetDir, slug, stage) {
  const none = { blocking: false, advisory: false };
  if (!['planner', 'dev'].includes(stage)) return none;
  try {
    const { loadManifest, resolveExecutionMode } = require('../agent-execution/manifest');
    const loaded = await loadManifest(targetDir, slug);
    if (!loaded.exists || !loaded.ok || resolveExecutionMode(loaded.manifest) !== 'orchestrated') {
      // A manifest that DECLARES orchestrated but fails validation must never
      // silently take the single-DEV route — one unknown field or a version
      // skew would erase the whole gate. It blocks the planner and advises DEV.
      if (loaded.exists && !loaded.ok) {
        const details = (loaded.errors || []).map((e) => `${e.path}: ${e.message}`);
        if (loaded.manifest?.orchestration?.execution === 'orchestrated') {
          return {
            blocking: stage === 'planner',
            advisory: stage !== 'planner',
            mode: 'orchestrated',
            plan: 'invalid_manifest',
            issues: details,
            message: `[Execution Manifest BLOCKED] agent-execution-${slug}.json declares orchestrated execution but fails validation: ${details.slice(0, 3).join('; ')}. Fix the manifest (or recompile: aioson execution:compile . --feature=${slug}).`
          };
        }
        return {
          blocking: false,
          advisory: true,
          plan: 'invalid_manifest',
          issues: details,
          message: `[Execution] agent-execution-${slug}.json exists but cannot be validated (${details.slice(0, 2).join('; ')}) — the workflow proceeds on the single-DEV route; fix or remove the file if that is not intended`
        };
      }
      return stage === 'planner' ? inspectExecutionScale(targetDir, slug) : none;
    }
    const { verifyExecutionPlan } = require('../agent-execution/execution-plan');
    const verified = await verifyExecutionPlan(targetDir, slug);
    if (stage === 'planner') {
      if (verified.ok) {
        // Compiled and fresh — the shape is still measured: one unit per wave
        // or a unit above the ceiling is an advisory even when the roles file
        // and the compile are both green.
        const scale = await inspectExecutionScale(targetDir, slug);
        return scale.advisory ? { ...scale, plan: 'fresh' } : { blocking: false, advisory: false, mode: 'orchestrated', plan: 'fresh' };
      }
      return {
        blocking: true,
        advisory: false,
        mode: 'orchestrated',
        plan: 'stale',
        issues: verified.issues,
        message: `[Execution Plan BLOCKED] orchestrated execution is selected for "${slug}" but the compiled plan is missing or stale: ${verified.issues[0]}. Run: aioson execution:compile . --feature=${slug} (or set orchestration.execution back to single in agent-execution-${slug}.json).`
      };
    }
    const { statusExecution } = require('../agent-execution/execution-run');
    const status = await statusExecution({ projectDir: targetDir, feature: slug });
    const runStatus = status.run ? status.run.status : 'not_started';
    if (runStatus === 'completed' && verified.ok) {
      return { blocking: false, advisory: false, mode: 'orchestrated', plan: 'fresh', run: 'completed', findings: status.findings.length };
    }
    return {
      blocking: false,
      advisory: true,
      mode: 'orchestrated',
      plan: verified.ok ? 'fresh' : 'stale',
      run: runStatus,
      decisions_pending: (status.decisions_pending || []).map((item) => item.unit),
      message: `orchestrated execution is selected but the run is ${runStatus}${verified.ok ? '' : ' and the compiled plan is stale'} — DEV is completing without the compiled lanes; the ledger (aioson execution:status . --feature=${slug}) may hold unresolved findings`
    };
  } catch (error) {
    return { blocking: false, advisory: true, mode: 'orchestrated', error: error.message };
  }
}

async function activateStage(
  targetDir,
  state,
  locale,
  tool,
  explicitAgent = null,
  requestedMode = null,
  scopeCheckMode = null,
  verificationPolicy = 'standard',
  autopilotOptions = {}
) {
  const stageName = normalizeAgentName(explicitAgent || state.current || state.next);
  if (!stageName) {
    return {
      state,
      agent: null,
      instructionPath: null,
      prompt: null
    };
  }

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
  if (stageName === 'qa' || stageName === 'tester') {
    try {
      testBriefing = await buildTestBriefing(targetDir);
    } catch {
      // Non-fatal: if briefing generation fails, proceed without it
      testBriefing = '';
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
    // Frontmatter flag OR the seeded scheme (slug-scoped) — the per-feature
    // "Autopilot" choice only seeds workflow-execute.json and never writes
    // auto_handoff, so reading the frontmatter alone silently disabled it.
    try {
      const signal = await resolveAutopilotSignal(targetDir, {
        slug: state.featureSlug,
        auto: autopilotOptions.auto === true,
        step: autopilotOptions.step === true
      });
      autoHandoff = signal.enabled;
    } catch {
      autoHandoff = false;
    }
  }

  const instructionPath = await resolveExistingInstructionPath(targetDir, agent, locale);
  const dependencies = await resolveStageDependencies(targetDir, state, stageName, agent);
  const verificationBriefing = stageName === 'scope-check'
    ? await buildImplementationVerificationBriefing(targetDir, state, scopeCheckMode, verificationPolicy)
    : null;
  const stageContextTasks = {
    setup: 'repair and validate project context',
    product: 'define the active feature PRD and current-system fit',
    sheldon: 'review and enrich the active PRD before planning',
    planner: 'create the executable implementation plan from the approved PRD',
    dev: 'implement the approved PRD and plan with focused tests',
    qa: 'verify the delivered behavior against the approved PRD and normal production path'
  };
  const contextTask = [
    stageContextTasks[stageName] || `execute the ${stageName} stage`,
    state.featureSlug ? `for feature ${state.featureSlug}` : 'for the current project request'
  ].join(' ');
  const generatedContext = await buildAgentContextActivation(targetDir, {
    agent: stageName,
    mode: 'planning',
    task: contextTask,
    feature: state.featureSlug || ''
  });
  const chainActivationContext = await buildChainActivationContext(targetDir, {
    agent: stageName,
    featureSlug: state.featureSlug || null
  });
  const executionActivationContext = await buildExecutionActivationContext(targetDir, state, stageName);
  const activationContext = [
    buildStageActivationContext(state, stageName, dependencies, scopeCheckMode),
    executionActivationContext,
    verificationBriefing && verificationBriefing.briefing,
    generatedContext,
    chainActivationContext
  ].filter(Boolean).join('\n\n');
  let prompt = buildAgentPrompt(agent, tool, {
    instructionPath,
    targetDir,
    interactionLanguage: locale,
    autonomyMode: effectiveMode,
    capabilitySummary: buildAgentCapabilitySummary(agentManifest, tool),
    dependsOn: dependencies,
    autoHandoff,
    activationContext
  });

  if (testBriefing) {
    prompt += '\n\n' + testBriefing;
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
    effectiveMode,
    verification: verificationBriefing
      ? {
          status: verificationBriefing.status,
          mode: verificationBriefing.mode,
          policy: verificationBriefing.policy,
          report_path: verificationBriefing.report_path,
          verdict: verificationBriefing.verdict,
          auditor_verdict: verificationBriefing.auditor_verdict || null,
          recommended_route: verificationBriefing.recommended_route,
          blocking_findings_count: verificationBriefing.blocking_findings_count || 0,
          reason: verificationBriefing.reason || null
        }
      : null
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

  // The durable checkpoint is independent of the optional phased manifest, so
  // lean SMALL workflows cannot lose a blocking product decision merely
  // because no manifest was created.
  const decisionCheckpoint = await readDecisionCheckpoint(targetDir, slug);
  if (decisionCheckpoint.exists && (!decisionCheckpoint.ok || decisionCheckpoint.pending.length > 0)) {
    const detail = decisionCheckpoint.ok
      ? `pending decision(s): ${decisionCheckpoint.pending.map((item) => item.id).join(', ')}`
      : `invalid checkpoint: ${decisionCheckpoint.errors.join('; ')}`;
    const err = new Error(
      `[workflow:next] Gate blocked: ${slug} decision checkpoint has ${detail}. Resolve it in .aioson/context/features/${slug}/decision-checkpoint.json before advancing. Use --force for override.`
    );
    err.code = 'WORKFLOW_NEXT_PENDING_DECISIONS';
    err.slug = slug;
    err.pendingState = 'product';
    err.knownState = true;
    throw err;
  }

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

  const targetDir = resolveTargetDir(args);
  const tool = options.tool || 'codex';
  const locale = await resolveLocaleForTarget(targetDir, options);
  const templateVersion = await inspectTemplateVersion(targetDir);
  if (templateVersion.warning && logger && typeof logger.warn === 'function') {
    logger.warn(templateVersion.warning);
  }
  const { config } = await readWorkflowConfig(targetDir);
  const expectedFeature = readExpectedFeature(options);
  const loaded = await loadOrCreateState(targetDir, {
    ...options,
    persist: expectedFeature.provided ? false : options.persist
  });
  let state = loaded.state;
  assertExpectedFeature(state, options, loaded.binding);
  if (expectedFeature.provided && loaded.changed && !loaded.persisted) {
    // The preview never archived the previous feature's progress; persisting
    // the moved state now must, or the move would be the silent discard again.
    if (loaded.binding && loaded.binding.moved && loaded.binding.moved.archived && !loaded.binding.moved.persisted) {
      const previous = await readJsonIfExists(path.join(targetDir, STATE_RELATIVE_PATH)).catch(() => null);
      if (previous && previous.featureSlug === loaded.binding.moved.from) {
        Object.assign(loaded.binding.moved, await archiveFeatureState(targetDir, previous));
      }
    }
    await persistState(targetDir, state);
    if (loaded.binding && loaded.binding.restored) await fs.unlink(featureStateArchivePath(targetDir, state.featureSlug)).catch(() => {});
    // This late persist IS the move on the --expect-feature path: it gets the
    // event the loader appends when it persists (the move once left no trace
    // in workflow.events.jsonl), and the lines below speak in the past tense.
    if (loaded.binding && (loaded.binding.moved || loaded.binding.restored)) {
      await appendWorkflowEvent(targetDir, bindingMovedEvent({ from: loaded.binding.moved ? loaded.binding.moved.from : null, to: state.featureSlug || null, mode: state.mode, source: loaded.binding.source, archived: loaded.binding.moved ? loaded.binding.moved.archived : null, restored: loaded.binding.restored ? loaded.binding.restored.from : null })).catch(() => {});
    }
  }
  for (const line of describeBinding(loaded.binding)) logger.log(line);
  let completedStage = null;
  let reviewCycleTransition = null;
  let reviewCycleResolution = null;
  let completionEvidence = null;

  if (options.complete || options['complete-current']) {
    // F3 (workflow-handoff-integrity v1.9.6) — pending-decisions guard.
    // Hard error if sheldon manifest has unresolved decisions; --force overrides.
    const completionTarget = options.complete === true ? state.current || state.next : options.complete;
    if (!isInactiveCompletedStage(state, completionTarget)) {
      try {
        await assertManifestNotPending(targetDir, state.featureSlug, Boolean(options.force));
      } catch (err) {
        if (err && err.code === 'WORKFLOW_NEXT_PENDING_DECISIONS') {
          logErrorLine(err.message);
        }
        throw err;
      }
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
        err.message.includes('[Handoff Contract BLOCKED]') ||
        err.message.includes('[Harness Contract Gate BLOCKED]')
      );
      if (isHealabled) {
        const failedStage = normalizeAgentName(options.complete === true ? state.current || state.next : options.complete);
        await logError(targetDir, failedStage, err.message, 'technical');
        const retryCount = await require('../self-healing').getRetryCount(targetDir, failedStage);
        if (retryCount < require('../self-healing').MAX_RETRIES) {
          await require('../self-healing').incrementRetryCount(targetDir, failedStage, err.message.substring(0, 200));
          // Build healing activation
          const baseActivation = await activateStage(
            targetDir,
            state,
            locale,
            tool,
            failedStage,
            options.mode || null,
            null,
            resolveVerificationPolicy(options, state),
            options
          );
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
    completionEvidence = finalized;
    reviewCycleTransition = finalized.correctionCycle || null;
    reviewCycleResolution = finalized.correctionCycleResolution || null;
    if (finalized.alreadyCompleted) {
      logger.log(`@${completedStage} is already completed; no gates or handoff were repeated.`);
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
        current: state.current,
        next: state.next,
        detour: state.detour,
        completed: state.completed,
        skipped: state.skipped,
        completedStage,
        featureSlug: state.featureSlug,
        agent: state.current || state.next || null,
        instructionPath: null,
        prompt: null,
        alreadyCompleted: true,
        idempotent: true
      };
    }
    if (!reviewCycleTransition && completedStage) {
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
  const verificationPolicy = resolveVerificationPolicy(options, state);
  const activation = await activateStage(
    targetDir,
    state,
    locale,
    tool,
    requestedAgent,
    requestedAutonomyMode,
    scopeCheckMode,
    verificationPolicy,
    options
  );
  state = activation.state;

  if (reviewCycleTransition && activation.agent === 'dev' && activation.prompt) {
    const cycle = `${reviewCycleTransition.cycle}/${reviewCycleTransition.max_cycles}`;
    activation.prompt = [
      `## Bounded QA correction cycle (${cycle})`,
      `Read \`${reviewCycleTransition.plan}\` and correct only its reproducible implementation findings.`,
      'Keep product intent unchanged, run focused evidence for the affected paths, then complete DEV normally; the workflow will return to one final QA pass.',
      '',
      activation.prompt
    ].join('\n');
  }

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
    autonomyMode: activation.effectiveMode || null,
    verification: activation.verification || null,
    reviewCycle: reviewCycleTransition || reviewCycleResolution || null
  };
  await appendWorkflowEvent(targetDir, eventPayload);
  const runtime = await syncWorkflowRuntime(targetDir, {
    state,
    eventPayload,
    activationAgent: activation.agent,
    completedStage
  });

  // Generate session handoff when a stage completes or workflow finishes
  if (completedStage || reviewCycleTransition || !activation.agent) {
    const handoffData = buildWorkflowHandoff(state, completedStage, activation.agent);
    handoffData.autonomyMode = activation.effectiveMode || null;
    const artifactUris = completedStage
      ? await collectHandoffArtifactUris(
          targetDir,
          state,
          completedStage,
          completionEvidence?.technicalGate || null
        )
      : [];
    handoffData.protocol = buildWorkflowHandoffProtocol(state, completedStage, activation.agent, {
      autonomyMode: activation.effectiveMode || null,
      handoffContractOk: completionEvidence?.handoffContractOk === true,
      technicalGateOk: completionEvidence?.technicalGate?.ok === true,
      artifactUris
    });
    const handoffValidation = await validateHandoffProtocol(targetDir, handoffData.protocol);
    if (!handoffValidation.ok) {
      if (completedStage) {
        throw new Error(
          `[Handoff Protocol BLOCKED]\n${handoffValidation.errors.map((item) => `  - ${item}`).join('\n')}`
        );
      }
      for (const err of handoffValidation.errors) logErrorLine(`Handoff protocol pending: ${err}`);
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
    binding: loaded.binding || null,
    runtime,
    agent: activation.agent,
    effectiveMode: activation.effectiveMode || null,
    verification: activation.verification || null,
    instructionPath: activation.instructionPath,
    prompt: activation.prompt,
    reviewCycle: reviewCycleTransition || reviewCycleResolution || null,
    // Completion evidence travels in the payload too: a --json caller (the
    // Autopilot engine included) is blind to logger advisories, and an
    // advisory that exists only as a log line does not exist for automation.
    ...(completionEvidence && completionEvidence.auditCode ? { auditCode: completionEvidence.auditCode } : {}),
    ...(completionEvidence && completionEvidence.rulesCheck ? { rulesCheck: completionEvidence.rulesCheck } : {}),
    ...(completionEvidence && completionEvidence.scopeDrift ? { scopeDrift: completionEvidence.scopeDrift } : {}),
    ...(completionEvidence && completionEvidence.execution ? { execution: completionEvidence.execution } : {}),
    templateVersion
  };

  logger.log(t('workflow_next.title', {
    mode: state.mode,
    classification: state.classification
  }));
  if (completedStage) {
    logger.log(t('workflow_next.completed', { agent: `@${completedStage}` }));
  }
  // Drift that did not block still has to be SEEN: the plan is the contract
  // and a delivered diff that walked away from it is news for the owner even
  // when the walk was the right call — it gets recorded, not discovered at
  // close. Upstream errors name their owner instead of blocking the wrong one.
  const scopeDrift = completionEvidence && completionEvidence.scopeDrift;
  if (scopeDrift && (scopeDrift.advisories.length > 0 || scopeDrift.upstream.length > 0)) {
    logger.log(`[Scope Drift] advisory for @${scopeDrift.stage} — ${scopeDrift.advisories.length} drift warning(s), ${scopeDrift.upstream.length} upstream error(s) (owner: product/sheldon/planner); full report: ${scopeDrift.report}`);
    for (const line of [...scopeDrift.advisories, ...scopeDrift.upstream].slice(0, 5)) logger.log(`  - ${line}`);
  }
  // The execution advisories have to be SEEN too: a split-candidate plan
  // with no recorded choice, or a DEV completing beside an unfinished
  // orchestrated run, is news for the owner, not a JSON field.
  const executionEvidence = completionEvidence && completionEvidence.execution;
  if (executionEvidence && executionEvidence.advisory && executionEvidence.message) {
    logger.log(executionEvidence.message.startsWith('[') ? executionEvidence.message : `[Execution] ${executionEvidence.message}`);
  }
  if (reviewCycleTransition) {
    logger.log(`QA correction cycle ${reviewCycleTransition.cycle}/${reviewCycleTransition.max_cycles}: @qa → @dev`);
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
  AUTOPILOT_HANDOFF_STAGES,
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
  isInactiveCompletedStage,
  applySkip,
  activateStage,
  runWorkflowNext,
  buildExecutionActivationContext,
  inspectExecutionGate,
  assertManifestNotPending,
  PENDING_STATE_WHITELIST,
  shouldRouteToValidator,
  detectUnsubstantiatedCompletions,
  readExpectedFeature,
  assertExpectedFeature,
  describeBinding,
  featureStateArchivePath,
  hasWorkflowProgress
};
