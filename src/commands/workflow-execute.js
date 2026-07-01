'use strict';

/**
 * aioson workflow:execute — unified runner shell on top of workflow:next.
 *
 * Dry-run previews the next actionable steps using the real workflow state.
 * Execution advances one or more valid checkpoints and writes a resumable snapshot.
 */

const fs = require('node:fs/promises');
const path = require('node:path');
const {
  detectClassification,
  scanArtifacts,
  readPhaseGates
} = require('../preflight-engine');
const {
  readAutonomyProtocol,
  getToolPolicy,
  canRunHeadless,
  resolveEffectiveMode
} = require('../autonomy-policy');
const { readAgentManifest } = require('../agent-manifests');
const { exists, ensureDir } = require('../utils');
const { validateHandoffContract } = require('../handoff-contract');
const { readHandoff, readHandoffProtocol } = require('../session-handoff');
const {
  STATE_RELATIVE_PATH,
  buildDefaultWorkflowConfig,
  readWorkflowConfig,
  runWorkflowNext
} = require('./workflow-next');
const { runWorkflowStatus } = require('./workflow-status');
const {
  PARALLEL_RELATIVE_DIR,
  collectWritePathConflicts,
  extractStatusWritePathItems
} = require('../parallel-workspace');

const BAR = '━'.repeat(45);
const EXECUTION_STATE_RELATIVE_PATH = '.aioson/context/workflow-execute.json';
const DEFAULT_AGENTIC_MAX_CYCLES = 3;

const STEP_META = {
  setup: { description: 'Initialize project context', gate_before: null, gate_after: null },
  product: { description: 'Generate PRD', gate_before: null, gate_after: null },
  analyst: { description: 'Map requirements + spec', gate_before: null, gate_after: 'A' },
  architect: { description: 'Architecture design', gate_before: 'A', gate_after: 'B' },
  'discovery-design-doc': { description: 'Prepare design-doc and readiness contract', gate_before: 'B', gate_after: null },
  'ux-ui': { description: 'UI/UX design', gate_before: 'A', gate_after: 'B', optional: true },
  pm: { description: 'Backlog + PM plan', gate_before: 'B', gate_after: 'C' },
  orchestrator: { description: 'Coordinate execution lanes', gate_before: 'C', gate_after: null },
  dev: { description: 'Implementation', gate_before: null, gate_after: 'C' },
  qa: { description: 'QA + feature closure', gate_before: 'C', gate_after: 'D' },
  committer: { description: 'Prepare commit', gate_before: 'D', gate_after: null }
};

const GATE_NAMES = {
  A: 'requirements',
  B: 'design',
  C: 'plan',
  D: 'execution'
};

const GATE_RESPONSIBLE_AGENT = {
  A: '@analyst',
  B: '@architect',
  C: '@pm (for MEDIUM) or @dev (for SMALL/MICRO)',
  D: '@qa'
};

async function readJsonIfExists(filePath) {
  if (!(await exists(filePath))) return null;
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function writeJson(filePath, payload) {
  await ensureDir(path.dirname(filePath));
  await fs.writeFile(filePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

function normalizeClassification(value, fallback = 'SMALL') {
  const safe = String(value || '').trim().toUpperCase();
  return ['MICRO', 'SMALL', 'MEDIUM'].includes(safe) ? safe : fallback;
}

function normalizeAgentName(value) {
  return String(value || '').trim().toLowerCase().replace(/^@/, '');
}

function quoteCliArg(value) {
  return `'${String(value || '').replace(/'/g, "'\\''")}'`;
}

function parsePositiveIntegerOption(value, fallback, min = 1, max = 10) {
  const parsed = Number.parseInt(String(value || ''), 10);
  if (!Number.isInteger(parsed)) return fallback;
  if (parsed < min) return min;
  if (parsed > max) return max;
  return parsed;
}

function isAgenticRequested(options = {}) {
  return Boolean(
    options.agentic ||
    options['agentic-run'] ||
    options.autopilot === 'agentic' ||
    options.autopilot === 'runtime' ||
    // Seeding the scheme IS turning on autopilot — the whole point of --seed is to
    // persist an enabled agentic_policy the interactive agents then follow.
    options.seed ||
    options['seed-only']
  );
}

function buildAgenticPolicy(options = {}, classification = 'SMALL') {
  const enabled = isAgenticRequested(options);
  if (!enabled) return null;

  const maxDevQaCycles = parsePositiveIntegerOption(
    options['max-dev-qa-cycles'] || options.maxDevQaCycles || options['max-cycles'],
    DEFAULT_AGENTIC_MAX_CYCLES
  );
  const maxTesterCycles = parsePositiveIntegerOption(
    options['max-tester-cycles'] || options.maxTesterCycles || options['max-specialist-cycles'],
    DEFAULT_AGENTIC_MAX_CYCLES
  );
  const maxPentesterCycles = parsePositiveIntegerOption(
    options['max-pentester-cycles'] || options.maxPentesterCycles || options['max-specialist-cycles'],
    DEFAULT_AGENTIC_MAX_CYCLES
  );

  return {
    enabled: true,
    mode: 'runtime_policy',
    source: 'workflow:execute',
    stop_conditions: [
      'feature_status_done',
      'human_decision_required',
      'gate_blocked',
      'context_budget_exceeded',
      'cycle_limit_reached',
      'critical_security_human_gate',
      'feature_close_human_gate'
    ],
    review_cycle: {
      hub: 'qa',
      max_dev_qa_cycles: maxDevQaCycles,
      max_tester_correction_cycles: maxTesterCycles,
      max_pentester_correction_cycles: maxPentesterCycles,
      qa_fail_route: 'dev',
      tester_route: 'tester after qa coverage trigger',
      pentester_route: 'pentester after sensitive-surface trigger or MEDIUM sequence stage',
      validator_route: 'validator when harness contract is present',
      feature_close: 'human_gate'
    },
    lanes: {
      enabled: classification === 'MEDIUM',
      strategy: 'parallelize_only_independent_write_scopes',
      guard_command: 'aioson parallel:guard . --lane=<n>',
      conflict_action: 'block_lane'
    },
    sidecars: {
      scouts: {
        enabled: true,
        read_only: true,
        max_per_session: 3,
        max_files_in_scope: 20,
        allowed_parent_agents: ['deyvin', 'dev', 'product', 'briefing', 'orache']
      },
      research: {
        enabled: true,
        cache_dir: 'researchs/',
        cache_ttl_days: 7
      }
    }
  };
}

function formatAgenticPolicyLines(policy) {
  if (!policy || !policy.enabled) return [];
  return [
    `Agentic policy: enabled (dev<->qa max ${policy.review_cycle.max_dev_qa_cycles} cycles)`,
    `Review loop: qa fail -> dev; tester max ${policy.review_cycle.max_tester_correction_cycles}; pentester max ${policy.review_cycle.max_pentester_correction_cycles}; close=${policy.review_cycle.feature_close}`,
    `Parallel lanes: ${policy.lanes.enabled ? 'enabled for independent write scopes' : 'disabled for this classification'}`
  ];
}

function findNextFromSequence(sequence, completed, skipped = []) {
  const done = new Set([...(completed || []), ...(skipped || [])].map(normalizeAgentName));
  return sequence.find((stage) => !done.has(normalizeAgentName(stage))) || null;
}

function getFocusStage(state) {
  if (!state || typeof state !== 'object') return null;
  return state.current || state.next || null;
}

function isGateApproved(gates, gateLetter) {
  if (!gateLetter) return true;
  const gateName = GATE_NAMES[gateLetter];
  return gateName ? gates[gateName] === 'approved' : true;
}

async function resolveFeatureSequence(targetDir, classification) {
  const fallback = buildDefaultWorkflowConfig();
  try {
    const { config } = await readWorkflowConfig(targetDir);
    const sequence = config.feature && config.feature[classification];
    return Array.isArray(sequence) && sequence.length > 0
      ? [...sequence]
      : [...(fallback.feature[classification] || fallback.feature.SMALL)];
  } catch {
    return [...(fallback.feature[classification] || fallback.feature.SMALL)];
  }
}

function inferCompletedStagesFromArtifacts(sequence, artifacts, gates) {
  const completed = [];

  for (const stage of sequence) {
    const normalized = normalizeAgentName(stage);
    let inferred = false;

    if (normalized === 'product') {
      inferred = Boolean(artifacts.prd && artifacts.prd.exists);
    } else if (normalized === 'analyst') {
      inferred = Boolean(artifacts.requirements && artifacts.requirements.exists && gates.requirements === 'approved');
    } else if (normalized === 'architect') {
      inferred = Boolean(artifacts.architecture && artifacts.architecture.exists && gates.design === 'approved');
    } else if (normalized === 'pm') {
      inferred = Boolean(artifacts.implementation_plan && artifacts.implementation_plan.exists && gates.plan === 'approved');
    } else if (normalized === 'qa') {
      inferred = gates.execution === 'approved';
    } else {
      break;
    }

    if (!inferred) break;
    completed.push(normalized);
  }

  return completed;
}

async function seedFeatureWorkflowState(targetDir, slug, classification, startFrom) {
  const statePath = path.join(targetDir, STATE_RELATIVE_PATH);
  const existing = await readJsonIfExists(statePath);
  const focusStage = getFocusStage(existing);

  if (
    existing &&
    existing.mode === 'feature' &&
    existing.featureSlug &&
    existing.featureSlug !== slug &&
    focusStage
  ) {
    return {
      ok: false,
      reason: 'different_active_feature',
      active_feature: existing.featureSlug,
      active_stage: focusStage
    };
  }

  if (existing && existing.mode === 'feature' && existing.featureSlug === slug) {
    return {
      ok: true,
      resumed: true,
      state: existing,
      statePath: STATE_RELATIVE_PATH
    };
  }

  const artifacts = await scanArtifacts(targetDir, slug);
  const gates = await readPhaseGates(targetDir, slug);
  const sequence = await resolveFeatureSequence(targetDir, classification);
  const completed = inferCompletedStagesFromArtifacts(sequence, artifacts, gates);
  const normalizedStartFrom = startFrom ? normalizeAgentName(startFrom) : null;

  let skipped = [];
  let next = findNextFromSequence(sequence, completed, skipped);

  if (normalizedStartFrom && sequence.includes(normalizedStartFrom)) {
    const targetIndex = sequence.indexOf(normalizedStartFrom);
    skipped = sequence.slice(0, targetIndex).filter((stage) => !completed.includes(stage));
    next = normalizedStartFrom;
  }

  const state = {
    version: 1,
    mode: 'feature',
    classification,
    sequence,
    current: null,
    next,
    completed,
    skipped,
    featureSlug: slug,
    detour: null,
    updatedAt: new Date().toISOString()
  };

  await writeJson(statePath, state);
  return {
    ok: true,
    resumed: false,
    state,
    statePath: STATE_RELATIVE_PATH
  };
}

async function previewFeatureWorkflowState(targetDir, slug, classification, startFrom) {
  const existing = await readJsonIfExists(path.join(targetDir, STATE_RELATIVE_PATH));
  const focusStage = getFocusStage(existing);

  if (
    existing &&
    existing.mode === 'feature' &&
    existing.featureSlug &&
    existing.featureSlug !== slug &&
    focusStage
  ) {
    return {
      ok: false,
      reason: 'different_active_feature',
      active_feature: existing.featureSlug,
      active_stage: focusStage
    };
  }

  if (existing && existing.mode === 'feature' && existing.featureSlug === slug) {
    return {
      ok: true,
      resumed: true,
      state: existing,
      statePath: STATE_RELATIVE_PATH
    };
  }

  const artifacts = await scanArtifacts(targetDir, slug);
  const gates = await readPhaseGates(targetDir, slug);
  const sequence = await resolveFeatureSequence(targetDir, classification);
  const completed = inferCompletedStagesFromArtifacts(sequence, artifacts, gates);
  const normalizedStartFrom = startFrom ? normalizeAgentName(startFrom) : null;

  let skipped = [];
  let next = findNextFromSequence(sequence, completed, skipped);

  if (normalizedStartFrom && sequence.includes(normalizedStartFrom)) {
    const targetIndex = sequence.indexOf(normalizedStartFrom);
    skipped = sequence.slice(0, targetIndex).filter((stage) => !completed.includes(stage));
    next = normalizedStartFrom;
  }

  return {
    ok: true,
    resumed: false,
    state: {
      version: 1,
      mode: 'feature',
      classification,
      sequence,
      current: null,
      next,
      completed,
      skipped,
      featureSlug: slug,
      detour: null,
      updatedAt: new Date().toISOString()
    },
    statePath: STATE_RELATIVE_PATH
  };
}

function buildDryRunSuggestion(planData) {
  const active = planData.steps.find((step) => step.status === 'active');
  if (active) {
    return {
      action: active.predicted_blockers.length > 0 ? 'complete_stage' : 'continue_stage',
      agent: active.agent,
      command: `aioson workflow:next . --complete=${active.agent}`,
      reason: `Preview stage @${active.agent}.`
    };
  }

  const next = planData.steps.find((step) => step.status !== 'completed' && step.status !== 'skipped');
  if (!next) {
    return {
      action: 'workflow_complete',
      agent: null,
      command: null,
      reason: 'Preview workflow has no pending stage.'
    };
  }

  return {
    action: next.status === 'blocked' ? 'blocked' : 'activate_stage',
    agent: next.agent,
    command: `aioson workflow:next . --agent=${next.agent}`,
    reason: next.status === 'blocked'
      ? `Preview stage @${next.agent} is blocked.`
      : `Preview next official stage is @${next.agent}.`
  };
}

function buildDryRunArtifactsSummary(artifacts) {
  return Object.entries(artifacts || {}).map(([id, artifact]) => ({
    id,
    label: artifact && artifact.path ? path.basename(artifact.path) : id,
    file: artifact && artifact.path ? artifact.path : null,
    exists: Boolean(artifact && artifact.exists)
  }));
}

function buildDryRunStatusSnapshot({ targetDir, slug, classification, workflowState, planData, tool }) {
  const suggestion = buildDryRunSuggestion(planData);
  return {
    ok: true,
    projectName: path.basename(targetDir),
    classification,
    mode: 'feature',
    featureSlug: slug,
    tool,
    state: workflowState,
    stateCreated: false,
    dryRun: true,
    activeStage: workflowState.current || workflowState.next || null,
    queuedNextStage: workflowState.next || null,
    pendingGates: [],
    contractCheck: null,
    artifacts: buildDryRunArtifactsSummary(planData.artifacts),
    suggestion
  };
}

async function buildExecutionPlan(targetDir, slug, classification, workflowState = null, startFrom = null) {
  const sequence = workflowState && Array.isArray(workflowState.sequence) && workflowState.sequence.length > 0
    ? [...workflowState.sequence]
    : await resolveFeatureSequence(targetDir, classification);
  const artifacts = await scanArtifacts(targetDir, slug);
  const gates = await readPhaseGates(targetDir, slug);
  const normalizedStartFrom = startFrom ? normalizeAgentName(startFrom) : null;
  const focusStage = getFocusStage(workflowState);
  const inferredCompleted = inferCompletedStagesFromArtifacts(sequence, artifacts, gates);
  const completedSet = new Set((workflowState && workflowState.completed) || inferredCompleted);
  const skippedSet = new Set((workflowState && workflowState.skipped) || []);

  const applyStartFrom = Boolean(
    normalizedStartFrom &&
    sequence.includes(normalizedStartFrom) &&
    (!workflowState || (!workflowState.current && workflowState.next === normalizedStartFrom))
  );

  const scopedSequence = applyStartFrom
    ? sequence.slice(sequence.indexOf(normalizedStartFrom)).filter(Boolean)
    : sequence;

  const steps = [];
  for (const [index, agent] of scopedSequence.entries()) {
    const meta = STEP_META[agent] || {
      description: `Execute @${agent}`,
      gate_before: null,
      gate_after: null,
      optional: false
    };

    let status = 'pending';
    if (completedSet.has(agent)) status = 'completed';
    else if (skippedSet.has(agent)) status = 'skipped';
    else if (focusStage === agent) status = 'active';

    const predictedBlockers = [];
    if (status !== 'completed' && status !== 'skipped' && meta.gate_before && !isGateApproved(gates, meta.gate_before)) {
      const responsible = GATE_RESPONSIBLE_AGENT[meta.gate_before] || 'previous agent';
      const featureArg = slug ? ` --feature=${quoteCliArg(slug)}` : '';
      predictedBlockers.push(
        `Gate ${meta.gate_before} (${GATE_NAMES[meta.gate_before] || meta.gate_before}) not approved — ` +
        `responsible: ${responsible} — ` +
        `approve with: aioson gate:approve .${featureArg} --gate=${meta.gate_before}`
      );
      if (status === 'pending') status = 'blocked';
    }

    if (status === 'active' && workflowState) {
      const contractCheck = await validateHandoffContract(targetDir, workflowState, agent);
      if (!contractCheck.ok) {
        predictedBlockers.push(...contractCheck.missing);
      }
    }

    const skip = status === 'skipped' || (
      status === 'completed' &&
      inferredCompleted.includes(agent)
    );
    const skipReason = status === 'skipped'
      ? 'workflow state marks this stage as skipped'
      : skip
        ? 'artifacts already satisfy this stage'
        : null;

    steps.push({
      step: index + 1,
      agent,
      description: meta.description,
      gate_before: meta.gate_before,
      gate_after: meta.gate_after,
      optional: Boolean(meta.optional),
      status,
      skip,
      skip_reason: skipReason,
      predicted_blockers: predictedBlockers
    });
  }

  return {
    steps,
    artifacts,
    gates,
    sequence
  };
}

function buildCheckpointPayload(activation, handoff, handoffProtocol) {
  const safeActivation = activation && typeof activation === 'object' ? activation : {};
  return {
    active_stage: safeActivation.agent || null,
    current: safeActivation.current || null,
    next: safeActivation.next || null,
    effective_mode: safeActivation.effectiveMode || null,
    instruction_path: safeActivation.instructionPath || null,
    prompt: safeActivation.prompt || null,
    handoff,
    handoff_protocol: handoffProtocol
  };
}

async function writeExecutionCheckpoint(targetDir, payload) {
  const execPath = path.join(targetDir, EXECUTION_STATE_RELATIVE_PATH);
  const existing = await readJsonIfExists(execPath);
  const history = Array.isArray(existing && existing.history) ? [...existing.history] : [];
  if (payload.checkpoint) {
    history.push({
      at: new Date().toISOString(),
      active_stage: payload.checkpoint.active_stage || null,
      next: payload.checkpoint.next || null,
      effective_mode: payload.checkpoint.effective_mode || null,
      handoff_to: payload.checkpoint.handoff && payload.checkpoint.handoff.next_agent
        ? String(payload.checkpoint.handoff.next_agent).replace(/^@/, '')
        : null
    });
  }
  const nextPayload = {
    version: 1,
    feature: payload.feature,
    classification: payload.classification,
    tool: payload.tool,
    requested_mode: payload.requestedMode || null,
    status: payload.status,
    started_at: existing && existing.feature === payload.feature ? existing.started_at : new Date().toISOString(),
    updated_at: new Date().toISOString(),
    resumed_count: existing && existing.feature === payload.feature ? Number(existing.resumed_count || 0) + (payload.resumed ? 1 : 0) : (payload.resumed ? 1 : 0),
    workflow_state_path: STATE_RELATIVE_PATH,
    checkpoint: payload.checkpoint || null,
    status_snapshot: payload.statusSnapshot || null,
    suggestion: payload.suggestion || null,
    resume_command: payload.resumeCommand || null,
    agentic_policy: payload.agenticPolicy || null,
    history
  };
  await writeJson(execPath, nextPayload);
  return nextPayload;
}

async function readStatusSnapshot(targetDir, tool, t) {
  return runWorkflowStatus({
    args: [targetDir],
    options: { json: true, tool },
    logger: { log() {}, error() {} },
    t
  });
}

function parseLaneStatusIndex(fileName) {
  const match = String(fileName || '').match(/^agent-(\d+)\.status\.md$/);
  if (!match) return null;
  const value = Number(match[1]);
  if (!Number.isFinite(value) || value <= 0) return null;
  return Math.floor(value);
}

async function readLaneWritePaths(parallelDir, index) {
  const absPath = path.join(parallelDir, `agent-${index}.status.md`);
  try {
    const content = await fs.readFile(absPath, 'utf8');
    return { lane: index, writePathItems: extractStatusWritePathItems(content) };
  } catch {
    return { lane: index, writePathItems: [] };
  }
}

async function runLaneGuardPreflight(targetDir, laneIndex) {
  const parallelDir = path.join(targetDir, PARALLEL_RELATIVE_DIR);
  if (!(await exists(parallelDir))) {
    return { ok: true, skipped: true, reason: 'no_parallel_workspace' };
  }

  let entries;
  try {
    entries = await fs.readdir(parallelDir);
  } catch {
    return { ok: true, skipped: true, reason: 'parallel_dir_unreadable' };
  }

  const laneIndices = entries
    .map(parseLaneStatusIndex)
    .filter((v) => v !== null)
    .sort((a, b) => a - b);

  if (!laneIndices.includes(laneIndex)) {
    return { ok: false, skipped: false, reason: 'lane_not_found', lane: laneIndex };
  }

  const lanes = await Promise.all(laneIndices.map((i) => readLaneWritePaths(parallelDir, i)));
  const conflictReport = collectWritePathConflicts(lanes);
  const laneConflicts = conflictReport.conflicts.filter((c) =>
    Array.isArray(c.lanes) && c.lanes.includes(laneIndex)
  );
  const targetLane = lanes.find((l) => l.lane === laneIndex);
  const writePathCount = targetLane ? targetLane.writePathItems.length : 0;
  const unassigned = writePathCount === 0;

  return {
    ok: laneConflicts.length === 0 && !unassigned,
    skipped: false,
    lane: laneIndex,
    writePathCount,
    unassigned,
    conflictCount: laneConflicts.length,
    conflicts: laneConflicts,
    invalidCount: conflictReport.invalidCount,
    invalidPatterns: conflictReport.invalidPatterns
  };
}

async function performRunnerTransition(targetDir, suggestion, tool, requestedMode, logger, t) {
  if (!suggestion || !suggestion.action) {
    return { ok: false, reason: 'missing_suggestion' };
  }

  if (suggestion.action === 'workflow_complete') {
    return { ok: true, transition: 'complete', result: null };
  }

  if (suggestion.action === 'activate_stage' || suggestion.action === 'continue_stage') {
    const result = await runWorkflowNext({
      args: [targetDir],
      options: {
        tool,
        ...(requestedMode ? { mode: requestedMode } : {}),
        ...(suggestion.agent ? { agent: suggestion.agent } : {})
      },
      logger,
      t
    });
    return {
      ok: true,
      transition: 'activate',
      agent: suggestion.agent || null,
      result
    };
  }

  if (suggestion.action === 'complete_stage' && suggestion.agent) {
    const safeAgent = normalizeAgentName(suggestion.agent);
    const result = await runWorkflowNext({
      args: [targetDir],
      options: {
        tool,
        complete: safeAgent,
        ...(requestedMode ? { mode: requestedMode } : {}),
        ...((safeAgent === 'dev' || safeAgent === 'qa') ? { 'auto-heal': true } : {})
      },
      logger,
      t
    });
    return {
      ok: true,
      transition: 'complete',
      agent: safeAgent,
      result
    };
  }

  return { ok: false, reason: 'unsupported_suggestion_action', action: suggestion.action };
}

async function runWorkflowExecute({ args, options = {}, logger }) {
  const targetDir = path.resolve(process.cwd(), args[0] || '.');
  const slug = options.feature ? String(options.feature).trim() : null;
  const tool = options.tool ? String(options.tool).trim() : 'claude';
  const requestedMode = options.mode ? String(options.mode).trim() : null;
  const dryRun = Boolean(options['dry-run'] || options.dry);
  const seedOnly = Boolean(options.seed || options['seed-only']);
  const startFrom = options['start-from'] ? String(options['start-from']).trim() : null;
  const skipOptional = Boolean(options['skip-optional']);
  const parsedMaxCheckpoints = Number.parseInt(String(options['max-checkpoints'] || '1'), 10);
  const maxCheckpoints = Number.isInteger(parsedMaxCheckpoints) && parsedMaxCheckpoints > 0
    ? parsedMaxCheckpoints
    : 1;
  const parsedLane = options.lane !== undefined ? Number(options.lane) : null;
  const laneIndex = Number.isInteger(parsedLane) && parsedLane > 0 ? parsedLane : null;
  const t = (key, payload) => payload?.agent || payload?.stage || key;

  if (!slug) {
    if (options.json) return { ok: false, reason: 'missing_feature' };
    logger.log('--feature=<slug> is required.');
    return { ok: false };
  }

  let classification = options.classification ? String(options.classification).toUpperCase() : null;
  if (!classification) classification = await detectClassification(targetDir, slug);
  if (!classification) classification = 'SMALL';
  classification = normalizeClassification(classification, 'SMALL');
  const agenticPolicy = buildAgenticPolicy(options, classification);

  const autonomyProtocol = await readAutonomyProtocol(targetDir);
  const toolPolicy = getToolPolicy(autonomyProtocol, tool);
  if (requestedMode === 'headless' && !canRunHeadless(toolPolicy)) {
    const failure = { ok: false, reason: 'headless_not_supported', tool };
    if (options.json) return failure;
    logger.error(`Tool ${tool} does not support headless mode. Fallback required.`);
    return failure;
  }

  const parallelGuard = laneIndex !== null
    ? await runLaneGuardPreflight(targetDir, laneIndex)
    : null;

  if (parallelGuard && !parallelGuard.ok && !parallelGuard.skipped) {
    if (parallelGuard.reason === 'lane_not_found') {
      const failure = { ok: false, reason: 'parallel_lane_not_found', lane: laneIndex };
      if (options.json) return failure;
      logger.error(`Lane ${laneIndex} not found in parallel workspace.`);
      return failure;
    }
    if (parallelGuard.conflictCount > 0) {
      logger.error(
        `[parallel:guard] Lane ${laneIndex} has ${parallelGuard.conflictCount} write-scope conflict(s) with other lanes. Proceeding with warning.`
      );
    }
    if (parallelGuard.unassigned) {
      logger.error(
        `[parallel:guard] Lane ${laneIndex} has no write paths declared. Run parallel:assign before executing.`
      );
    }
  }

  const seeded = dryRun
    ? await previewFeatureWorkflowState(targetDir, slug, classification, startFrom)
    : await seedFeatureWorkflowState(targetDir, slug, classification, startFrom);
  if (!seeded.ok) {
    if (options.json) return seeded;
    logger.error(
      `Another active feature workflow is in progress: ${seeded.active_feature} (@${seeded.active_stage}).`
    );
    return seeded;
  }

  const planData = await buildExecutionPlan(targetDir, slug, classification, seeded.state, startFrom);
  for (const step of planData.steps) {
    const manifest = await readAgentManifest(targetDir, step.agent);
    step.effective_mode = resolveEffectiveMode({
      protocol: autonomyProtocol,
      tool,
      agentId: step.agent,
      manifest,
      requestedMode
    });
  }

  const activePlan = planData.steps.filter((step) => step.status !== 'completed' && !(skipOptional && step.optional));
  const blockedSteps = planData.steps.filter((step) => step.predicted_blockers.length > 0);
  const statusSnapshot = dryRun
    ? buildDryRunStatusSnapshot({ targetDir, slug, classification, workflowState: seeded.state, planData, tool })
    : await readStatusSnapshot(targetDir, tool, t);
  const resumeCommand = [
    'aioson',
    'workflow:execute',
    quoteCliArg(targetDir),
    `--feature=${quoteCliArg(slug)}`,
    `--tool=${quoteCliArg(tool)}`,
    ...(requestedMode ? [`--mode=${quoteCliArg(requestedMode)}`] : []),
    ...(maxCheckpoints !== 1 ? [`--max-checkpoints=${quoteCliArg(maxCheckpoints)}`] : []),
    ...(agenticPolicy ? ['--agentic'] : []),
    ...(agenticPolicy && agenticPolicy.review_cycle.max_dev_qa_cycles !== DEFAULT_AGENTIC_MAX_CYCLES
      ? [`--max-dev-qa-cycles=${quoteCliArg(agenticPolicy.review_cycle.max_dev_qa_cycles)}`]
      : []),
    ...(agenticPolicy && agenticPolicy.review_cycle.max_tester_correction_cycles !== DEFAULT_AGENTIC_MAX_CYCLES
      ? [`--max-tester-cycles=${quoteCliArg(agenticPolicy.review_cycle.max_tester_correction_cycles)}`]
      : []),
    ...(agenticPolicy && agenticPolicy.review_cycle.max_pentester_correction_cycles !== DEFAULT_AGENTIC_MAX_CYCLES
      ? [`--max-pentester-cycles=${quoteCliArg(agenticPolicy.review_cycle.max_pentester_correction_cycles)}`]
      : [])
  ].join(' ');

  if (dryRun) {
    const result = {
      ok: true,
      feature: slug,
      classification,
      tool,
      requested_mode: requestedMode,
      dry_run: true,
      resumed: seeded.resumed,
      state_path: seeded.statePath,
      execution_state_path: EXECUTION_STATE_RELATIVE_PATH,
      max_checkpoints: maxCheckpoints,
      steps: planData.steps,
      active_steps: activePlan.length,
      blocked_steps: blockedSteps.length,
      gates: planData.gates,
      status_snapshot: statusSnapshot,
      suggestion: statusSnapshot && statusSnapshot.suggestion ? statusSnapshot.suggestion : null,
      resume_command: resumeCommand,
      agentic_policy: agenticPolicy,
      parallel_guard: parallelGuard
    };

    if (options.json) return result;

    logger.log('');
    logger.log(`Workflow Execution Plan — ${slug} (${classification})`);
    logger.log(BAR);
    for (const step of planData.steps) {
      const gateInfo = step.gate_after ? ` → Gate ${step.gate_after}` : '';
      const statusInfo = `[${step.status}]`;
      const modeInfo = step.effective_mode ? ` [mode=${step.effective_mode}]` : '';
      logger.log(`Step ${step.step}: @${step.agent} ${statusInfo} — ${step.description}${gateInfo}${modeInfo}`);
      for (const blocker of step.predicted_blockers) {
        logger.log(`  - blocker: ${blocker}`);
      }
    }
    logger.log('');
    logger.log(`Blocked steps: ${blockedSteps.length} | Remaining: ${activePlan.length}`);
    logger.log(`Resume state: ${seeded.resumed ? 'existing workflow state reused' : 'new workflow state seeded'}`);
    if (statusSnapshot && statusSnapshot.suggestion && statusSnapshot.suggestion.command) {
      logger.log(`Suggested command: ${statusSnapshot.suggestion.command}`);
    }
    for (const line of formatAgenticPolicyLines(agenticPolicy)) {
      logger.log(line);
    }
    logger.log('');
    return result;
  }

  // --seed: persist the workflow.state.json + workflow-execute.json (with an
  // enabled agentic_policy) and STOP. Unlike a full run, it does not drive stage
  // transitions from the CLI — in an interactive Claude Code session the agents
  // themselves follow the scheme. This is what the spec->dev handoff calls so a
  // feature built the normal way carries the autopilot contract without the user
  // running anything. Idempotent: re-seeding the same slug reuses existing state.
  if (seedOnly) {
    const handoff = await readHandoff(targetDir);
    const handoffProtocol = await readHandoffProtocol(targetDir);
    const nextStage = seeded.state ? (seeded.state.current || seeded.state.next || null) : null;
    const executionState = await writeExecutionCheckpoint(targetDir, {
      feature: slug,
      classification,
      tool,
      requestedMode,
      resumed: seeded.resumed,
      status: nextStage ? 'active' : 'completed',
      checkpoint: buildCheckpointPayload(null, handoff, handoffProtocol),
      statusSnapshot,
      suggestion: statusSnapshot && statusSnapshot.suggestion ? statusSnapshot.suggestion : null,
      resumeCommand,
      agenticPolicy
    });

    const result = {
      ok: true,
      feature: slug,
      classification,
      tool,
      requested_mode: requestedMode,
      seeded: true,
      resumed: seeded.resumed,
      state_path: seeded.statePath,
      execution_state_path: EXECUTION_STATE_RELATIVE_PATH,
      next_stage: nextStage,
      checkpoint: executionState.checkpoint,
      execution_state: executionState,
      status_snapshot: statusSnapshot,
      suggestion: statusSnapshot && statusSnapshot.suggestion ? statusSnapshot.suggestion : null,
      resume_command: resumeCommand,
      agentic_policy: agenticPolicy,
      parallel_guard: parallelGuard
    };

    if (options.json) return result;

    logger.log('');
    logger.log(`Agentic workflow scheme seeded → ${EXECUTION_STATE_RELATIVE_PATH}`);
    logger.log(`Feature: ${slug} (${classification})   Next stage: @${nextStage || 'none'}`);
    logger.log(
      `Autopilot: ${agenticPolicy && agenticPolicy.enabled
        ? 'enabled — interactive agents run the chain to feature:close (human gate)'
        : 'disabled'}`
    );
    for (const line of formatAgenticPolicyLines(agenticPolicy)) logger.log(line);
    logger.log('');
    return result;
  }

  const executionTransitions = [];
  let activation = null;
  let currentStatus = statusSnapshot;

  for (let index = 0; index < maxCheckpoints; index += 1) {
    const suggestion = currentStatus && currentStatus.suggestion ? currentStatus.suggestion : null;
    let transitionResult;

    try {
      transitionResult = await performRunnerTransition(
        targetDir,
        suggestion,
        tool,
        requestedMode,
        logger,
        t
      );
    } catch (error) {
      const failure = {
        ok: false,
        reason: 'workflow_next_failed',
        feature: slug,
        classification,
        message: error.message,
        transitions: executionTransitions
      };
      if (options.json) return failure;
      logger.error(error.message);
      return failure;
    }

    if (!transitionResult.ok) {
      const failure = {
        ok: false,
        reason: transitionResult.reason || 'runner_transition_failed',
        feature: slug,
        classification,
        transitions: executionTransitions
      };
      if (options.json) return failure;
      logger.error(`Runner transition failed: ${failure.reason}`);
      return failure;
    }

    if (transitionResult.transition === 'complete' && !transitionResult.result) {
      break;
    }

    activation = transitionResult.result || activation;
    executionTransitions.push({
      index: index + 1,
      transition: transitionResult.transition,
      agent: transitionResult.agent || null,
      active_stage: activation && activation.agent ? activation.agent : null,
      next_stage: activation && activation.next ? activation.next : null,
      completed_stage: activation && activation.completedStage ? activation.completedStage : null
    });

    currentStatus = await readStatusSnapshot(targetDir, tool, t);

    const nextSuggestion = currentStatus && currentStatus.suggestion ? currentStatus.suggestion : null;
    if (!nextSuggestion || nextSuggestion.action === 'continue_stage' || nextSuggestion.action === 'workflow_complete') {
      break;
    }
  }

  const handoff = await readHandoff(targetDir);
  const handoffProtocol = await readHandoffProtocol(targetDir);
  const refreshedStatus = currentStatus || await readStatusSnapshot(targetDir, tool, t);
  const executionState = await writeExecutionCheckpoint(targetDir, {
    feature: slug,
    classification,
    tool,
    requestedMode,
    resumed: seeded.resumed,
    status: activation && activation.agent ? 'active' : 'completed',
    checkpoint: buildCheckpointPayload(activation, handoff, handoffProtocol),
    statusSnapshot: refreshedStatus,
    suggestion: refreshedStatus && refreshedStatus.suggestion ? refreshedStatus.suggestion : null,
    resumeCommand,
    agenticPolicy
  });

  const result = {
    ok: true,
    feature: slug,
    classification,
    tool,
    requested_mode: requestedMode,
    resumed: seeded.resumed,
    state_path: seeded.statePath,
    execution_state_path: EXECUTION_STATE_RELATIVE_PATH,
    max_checkpoints: maxCheckpoints,
    checkpoint: executionState.checkpoint,
    execution_state: executionState,
    status_snapshot: refreshedStatus,
    suggestion: refreshedStatus && refreshedStatus.suggestion ? refreshedStatus.suggestion : null,
    resume_command: resumeCommand,
    agentic_policy: agenticPolicy,
    transitions: executionTransitions,
    active_stage: activation && activation.agent ? activation.agent : null,
    next_stage: activation && activation.next ? activation.next : null,
    handoff,
    handoff_protocol: handoffProtocol,
    parallel_guard: parallelGuard
  };

  if (!options.json) {
    logger.log('');
    logger.log(`Workflow checkpoint stored at ${EXECUTION_STATE_RELATIVE_PATH}`);
    logger.log(`Feature: ${slug}`);
    logger.log(`Resumed: ${seeded.resumed ? 'yes' : 'no'}`);
  }

  return result;
}

module.exports = {
  EXECUTION_STATE_RELATIVE_PATH,
  buildAgenticPolicy,
  buildExecutionPlan,
  seedFeatureWorkflowState,
  runWorkflowExecute
};
