'use strict';

/**
 * aioson squad:autorun — Autonomous squad execution
 *
 * Given a high-level goal, this command:
 *   1. Decomposes the goal into a task plan (heuristic or structured)
 *   2. Activates the intra-squad bus for real-time communication
 *   3. Runs each task through the worker-runner with optional reflection
 *   4. Coordinator monitors the bus for blocks or feedback
 *   5. Reports the final session summary
 *
 * Phase 1 additions:
 *   - Gap Closure Loop: failed tasks are retried up to 3x with failure context
 *   - Budget Gating: halts before a task if session token budget is exceeded
 *   - Heartbeat Protocol: posts bus heartbeat every 30s during long tasks
 *   - Anti-Analysis-Loop Guard: warns executor if N+ status without result
 *   - Squad STATE.md: cross-session memory updated at start/end
 *
 * Usage:
 *   aioson squad:autorun . --squad=content-team --goal="Create 3 podcast episodes"
 *   aioson squad:autorun . --squad=content-team --goal="..." --reflect --bus --mode=structured
 *   aioson squad:autorun . --squad=content-team --plan=SESSION_ID  (resume from saved plan)
 *   aioson squad:autorun . --squad=content-team --plan=SESSION_ID --dry-run
 *
 * Flags:
 *   --goal            High-level objective (required unless --plan is given)
 *   --reflect         Run reflection after each task (default: false)
 *   --bus             Enable intra-bus for inter-executor communication (default: true)
 *   --mode            Decomposition mode: heuristic (default) | structured
 *   --plan            Resume from existing session plan (session ID)
 *   --dry-run         Show plan without executing
 *   --sequential      Force sequential execution even for independent tasks (default: false)
 *   --timeout         Per-task timeout in seconds (default: 120)
 *   --max-retries     Gap closure max retry attempts (default: 3)
 *   --no-gap-closure  Disable automatic retry on task failure
 */

const fs = require('node:fs/promises');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const {
  decompose,
  getReadyTasks,
  isPlanComplete,
  updateTaskStatus,
  validatePlanDependencies,
  loadPlan,
  formatPlan
} = require('../squad/task-decomposer');
const bus = require('../squad/intra-bus');
const { reflect, formatReport } = require('../squad/reflection');
const { runWorker, listWorkers } = require('../worker-runner');
const stateManager = require('../squad/state-manager');
const { getUnresolvedBlocks } = require('../squad/intra-bus');
const interSquadEvents = require('../squad/inter-squad-events');
const { runHook, HOOK_DENY } = require('../lib/hook-protocol');
const { extractLearnings, persistAgentMemory } = require('../squad/learning-extractor');
const { validateBrief, autoFixBrief } = require('../squad/brief-validator');
const { resolveEngine, translateToTeamConfig, writeTeamConfig } = require('../squad/agent-teams-adapter');
const { resolveTargetDir } = require('../lib/project-root');
const { acquireExecution, sessionDirectory, mutatePlan } = require('../squad/plan-store');
const { preserveOutput, readPreservedOutput } = require('../squad/delivery-artifacts');

const STATUS_ICON = {
  pending: '○',
  in_progress: '●',
  completed: '✓',
  failed: '✗',
  escalated: '⚠',
  skipped: '–',
  needs_iteration: '↩',
  unverified: '?',
  awaiting_review: '◌',
  paused_budget: 'Ⅱ'
};

function icon(status) {
  return STATUS_ICON[status] || '?';
}

function nowIso() { return new Date().toISOString(); }

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

const { loadBudget, createExecutionBudget } = require('../squad/execution-budget');

function hasExecutionEvidence(output) {
  if (output === null || output === undefined) return false;
  if (typeof output === 'string') return output.trim().length > 0;
  if (Array.isArray(output)) return output.length > 0;
  if (typeof output === 'object') {
    return Object.keys(output).some((key) => hasExecutionEvidence(output[key]));
  }
  return true;
}

async function loadAttemptHistory(projectDir, squadSlug, sessionId, taskId) {
  const plan = await loadPlan(projectDir, squadSlug, sessionId);
  const savedTask = plan?.tasks?.find((candidate) => candidate.id === taskId);
  return Array.isArray(savedTask?.result?.attempt_history)
    ? savedTask.result.attempt_history
    : [];
}

// ─── Heartbeat wrapper ────────────────────────────────────────────────────────

/**
 * Run a task with heartbeat pulses on the bus every 30s.
 * Clears the interval on task completion/failure regardless.
 */
async function runTaskWithHeartbeat(projectDir, squadSlug, task, sessionId, options, runFn) {
  const { enableBus } = options;
  const startMs = Date.now();

  let hbInterval = null;
  if (enableBus) {
    hbInterval = setInterval(async () => {
      const elapsed = Math.round((Date.now() - startMs) / 1000);
      await bus.post(projectDir, squadSlug, sessionId, {
        from: 'coordinator',
        to: '*',
        type: 'heartbeat',
        content: `${task.title} — ${elapsed}s elapsed`,
        metadata: { task_id: task.id, elapsed_s: elapsed }
      }).catch(() => {});
    }, 30_000);
  }

  try {
    return await runFn();
  } finally {
    if (hbInterval) clearInterval(hbInterval);
  }
}

// ─── Anti-analysis-loop guard ─────────────────────────────────────────────────

/**
 * Check if an executor appears to be in an analysis loop.
 * Posts a coordinator feedback message if the threshold is exceeded.
 */
async function checkAntiLoop(projectDir, squadSlug, sessionId, task, enableBus, threshold = 8) {
  if (!enableBus || !task.executor) return;

  const messages = await bus.read(projectDir, squadSlug, sessionId).catch(() => []);
  if (bus.isAnalysisLoop(messages, task.executor, threshold)) {
    await bus.post(projectDir, squadSlug, sessionId, {
      from: 'coordinator',
      to: task.executor,
      type: 'feedback',
      content: `Analysis loop detected for "${task.title}". You have posted ${threshold}+ status updates without a result. Stop analyzing — produce concrete output now, or post a "block" message explaining why you cannot proceed.`,
      metadata: { task_id: task.id, anti_loop: true }
    }).catch(() => {});
  }
}

// ─── Core task runner ─────────────────────────────────────────────────────────

/**
 * Run a single task (no retry logic here — handled by gap closure wrapper).
 */
async function runTask(projectDir, squadSlug, task, sessionId, options, logger) {
  const { enableBus, enableReflect, timeoutMs } = options;
  if (task.revision_context) {
    try { await readPreservedOutput(projectDir, task.revision_context.previous_delivery); }
    catch (error) {
      const result = { error: `revision_evidence_invalid: ${error.message}`, worker_ran: false, completed_at: null };
      await updateTaskStatus(projectDir, squadSlug, sessionId, task.id, 'unverified', result);
      return { task, finalStatus: 'unverified', workerResult: { ok: false, ...result }, reflectionResult: null, persistedResult: result };
    }
  }
  const currentPlan = await loadPlan(projectDir, squadSlug, sessionId);
  const specialist = task.specialist?.slug && task.specialist.persistent !== true
    ? task.specialist
    : null;
  const executionSlug = specialist?.slug || task.executor || task.id;
  const taskCtx = {
    projectDir,
    squadSlug,
    executorSlug: executionSlug || 'unknown',
    taskTitle: task.title,
    iteration: task._attempt || 1
  };

  // Post status to bus
  if (enableBus) {
    await bus.post(projectDir, squadSlug, sessionId, {
      from: task.executor || 'coordinator',
      to: '*',
      type: 'status',
      content: `Starting: ${task.title}${task._attempt > 1 ? ` (retry ${task._attempt})` : ''}`,
      metadata: { task_id: task.id, attempt: task._attempt || 1 }
    }).catch(() => {});
  }

  await updateTaskStatus(projectDir, squadSlug, sessionId, task.id, 'in_progress');

  // Build worker input with fresh context pointers (2.2: paths, not inline content)
  const workerInput = {
    project_dir: projectDir,
    revision_context: task.revision_context || null,
    dependency_deliveries: (task.dependencies || []).map(id => ({ task_id: id,
      delivery: currentPlan.tasks.find(dependency => dependency.id === id)?.result?.delivery_evidence || null })),
    task_id: task.id,
    title: task.title,
    description: task.description,
    acceptance_criteria: task.acceptance_criteria,
    read_first_hints: task.read_first_hints || [],  // executor reads these, not coordinator
    must_haves: task.must_haves || null,
    session_id: sessionId,
    inter_squad_events: options.incomingEvents || [],
    bus_enabled: enableBus,
    execution_owner: task.executor || null,
    ...(task._eval_artifact !== undefined ? { artifact: task._eval_artifact } : {}),
    ...(task._eval_feedback ? { review_feedback: task._eval_feedback } : {}),
    ...(task._voting_instance ? { voting_instance: task._voting_instance } : {}),
    ...(specialist
      ? {
          specialist: {
            slug: specialist.slug,
            role: specialist.role || null,
            contribution: specialist.contribution || null,
            integration_owner: specialist.integration_owner || task.executor || null,
            instructions: specialist.instructions || null
          }
        }
      : {}),
    ...(task._failure_context ? { failure_context: task._failure_context, attempt: task._attempt } : {})
  };

  let workerResult = null;
  let taskOutput = null;
  let workerRan = false;

  const workers = await listWorkers(projectDir, squadSlug);
  const workerConfig = workers.find(
    (worker) => worker.slug === executionSlug || (!specialist && worker.slug === task.id)
  );

  if (workerConfig) {
    workerRan = true;
    workerResult = await runWorker(projectDir, squadSlug, workerConfig.slug, workerInput, {
      timeoutMs,
      triggerType: 'autorun',
      beforeAttempt: options.executionBudget
        ? (input) => options.executionBudget.reserve(task._budget_task_id || task.id, input)
        : undefined
    });
    if (workerResult.attempts === 0) workerRan = false;
    if (workerResult.budgetBlocked) {
      const latest = await loadPlan(projectDir, squadSlug, sessionId);
      const saved = latest.tasks.find((item) => item.id === task.id)?.result || {};
      const pausedResult = { ...saved, budget_pause: workerResult.budget_pause,
        ...(workerResult.lastAttempt ? { last_worker_attempt: workerResult.lastAttempt } : {}), completed_at: null };
      if (task._voting_instance) delete pausedResult.budget_resume;
      if (!task._voting_instance) await updateTaskStatus(projectDir, squadSlug, sessionId, task.id, 'paused_budget', pausedResult);
      return { task, finalStatus: 'paused_budget', workerResult, reflectionResult: null, persistedResult: pausedResult };
    }
    taskOutput = workerResult.ok
      ? JSON.stringify(workerResult.output || '')
      : `Worker failed: ${workerResult.error}`;
  } else {
    const error = specialist ? 'specialist_executor_unavailable' : 'no_worker_script';
    taskOutput = specialist
      ? `[specialist-unavailable] Task "${task.title}" requires ephemeral specialist "${specialist.slug}". Legacy autorun refuses to substitute integration owner "${task.executor}". Scaffold the specialist worker or use the Agent Teams engine.`
      : `[no-worker-script] Task "${task.title}" assigned to executor "${task.executor}". Run manually or scaffold a worker with: aioson squad:worker --squad=${squadSlug} create --slug=${task.executor}`;
    workerResult = {
      ok: false,
      error,
      output: { message: taskOutput },
      noScript: true,
      attempts: 0
    };
  }

  if (workerResult.ok && !hasExecutionEvidence(workerResult.output)) {
    workerResult = {
      ...workerResult,
      ok: false,
      error: 'invalid_worker_output',
      invalidOutput: true
    };
    taskOutput = 'Worker failed: output did not contain execution evidence';
  }

  // Anti-analysis-loop check after task runs
  await checkAntiLoop(projectDir, squadSlug, sessionId, task, enableBus);

  // Reflection pass — pass full task object so verify-gate can check must_haves
  let reflectionResult = null;
  if (taskOutput && workerResult.ok) {
    try {
      reflectionResult = await reflect(taskOutput, {
      ...taskCtx,
      iteration: task._attempt || 1,
      task                            // enables must_haves verification
      }, enableReflect ? {} : {
        fallbackChecklist: [{ id: 'non_empty', label: 'Output is not empty', critical: true }]
      });
    } catch (error) {
      reflectionResult = {
        verdict: 'UNVERIFIED', passed: false, score: null,
        issues: [error.message], critical_failures: [], needs_llm_review: [],
        summary: `Evaluation failed: ${error.message}`
      };
    }

    if (enableBus) {
      await bus.post(projectDir, squadSlug, sessionId, {
        from: task.executor || 'coordinator',
        to: '*',
        type: 'feedback',
        content: formatReport(reflectionResult, task.executor),
        metadata: { task_id: task.id, verdict: reflectionResult.verdict }
      }).catch(() => {});
    }
  }

  // Determine final status
  let finalStatus;
  if (!workerResult.ok) {
    finalStatus = 'failed';
  } else if (reflectionResult) {
    switch (reflectionResult.verdict) {
      case 'DONE':
      case 'DONE_WITH_CONCERNS':
        finalStatus = reflectionResult.passed === true ? 'completed' : 'unverified';
        break;
      case 'NEEDS_ITERATION': finalStatus = 'needs_iteration'; break;
      case 'ESCALATE': finalStatus = 'escalated'; break;
      default: finalStatus = 'unverified';
    }
  } else {
    finalStatus = 'unverified';
  }

  let deliveryEvidence = null;
  let deliveryError = null;
  if (workerResult.ok) {
    try { deliveryEvidence = await preserveOutput(projectDir, squadSlug, sessionId, task.id, workerResult.output); }
    catch (error) {
      deliveryError = `evidence_persistence_failed: ${error.message}`;
      finalStatus = 'unverified';
    }
  }

  // Candidate execution is not acceptance: voting and review own the final write.
  const persistedStatus = finalStatus === 'completed' && task._defer_acceptance ? 'awaiting_review' : finalStatus;

  const attemptHistory = await loadAttemptHistory(
    projectDir,
    squadSlug,
    sessionId,
    task.id
  );
  const finishedAt = nowIso();
  const attemptRecord = {
    attempt: task._attempt || workerResult.attempt || 1,
    status: persistedStatus,
    worker_ran: workerRan,
    error: workerResult.ok ? null : workerResult.error,
    timed_out: Boolean(workerResult.timedOut),
    output_summary: String(taskOutput || '').slice(0, 500),
    finished_at: finishedAt
  };
  const persistedResult = {
    delivery_evidence: deliveryEvidence,
    ...(deliveryError ? { error: deliveryError } : {}),
    worker_ran: workerRan,
    output_summary: String(taskOutput || '').slice(0, 500),
    execution_evidence: workerResult.ok
      ? {
          worker: workerConfig?.slug || null,
          attempt: workerResult.attempt || task._attempt || 1,
          duration_ms: workerResult.durationMs || null,
          output_present: true
        }
      : null,
    attempt_history: [...attemptHistory, attemptRecord],
    reflection: reflectionResult,
    finished_at: finishedAt,
    completed_at: persistedStatus === 'completed' ? finishedAt : null
  };
  if (!task._voting_instance) await updateTaskStatus(projectDir, squadSlug, sessionId, task.id, persistedStatus, persistedResult);

  if (enableBus) {
    await bus.post(projectDir, squadSlug, sessionId, {
      from: task.executor || 'coordinator',
      to: '*',
      type: 'result',
      content: `${icon(finalStatus)} ${task.title} → ${finalStatus.toUpperCase()}${reflectionResult ? ` (reflection: ${reflectionResult.verdict})` : ''}`,
      metadata: { task_id: task.id, status: finalStatus }
    }).catch(() => {});
  }

  return { task, finalStatus, workerResult, reflectionResult, persistedResult };
}

// ─── Inter-squad dependency validation ───────────────────────────────────────

/**
 * Validate inter-squad dependencies declared in manifest.depends_on.
 * Returns { satisfied: boolean, unmet: Array<{squad, event}> }
 */
async function validateInterSquadDependencies(projectDir, manifest, savedEvents = null) {
  const deps = manifest.depends_on || [];
  if (deps.length === 0) return { satisfied: true, unmet: [] };

  const unmet = [];
  for (const dep of deps) {
    if (!dep.event) continue;
    try {
      const events = savedEvents ? savedEvents.filter((event) =>
        (!dep.squad || event.fromSquad === dep.squad) && interSquadEvents.matchesPattern(event.event, dep.event)) : await interSquadEvents.peek(projectDir, {
        toSquad: manifest.slug,
        fromSquad: dep.squad,
        subscriptions: [dep.event]
      });
      if (events.length === 0) {
        unmet.push({ squad: dep.squad || '(unknown)', event: dep.event });
      }
    } catch {
      unmet.push({ squad: dep.squad || '(unknown)', event: dep.event });
    }
  }

  return { satisfied: unmet.length === 0, unmet };
}

// ─── Bus coordinator intelligence ────────────────────────────────────────────

// ── Block classification helpers ─────────────────────────────────────────────

function extractKeyName(content) {
  const m = content.match(/([A-Z_]{3,}_(?:KEY|TOKEN|SECRET|ID))/i);
  return m ? m[1].toUpperCase() : 'API key';
}

function extractMissingPath(content) {
  const m = content.match(/(?:file|path|found)[:\s]+([./\w-]+\.\w+)/i);
  return m ? m[1] : 'unknown file';
}

function extractDependencyId(content) {
  const m = content.match(/task[- _](\d{2})/i);
  return m ? `task-${m[1]}` : null;
}

function classifyBlock(content) {
  const c = String(content || '').toLowerCase();
  if (/api\s*key|credential|secret|token\b|\.env/.test(c))     return 'api_key';
  if (/file\s*not\s*found|no such file|enoent|missing file/.test(c)) return 'file_missing';
  if (/permission\s*denied|access\s*denied|forbidden|403/.test(c))   return 'permission';
  if (/timed?\s*out|etimedout|deadline|exceeded/.test(c))             return 'timeout';
  if (/depends\s*on|waiting\s*for|requires\s*task|blocked\s*by/.test(c)) return 'dependency';
  return 'generic';
}

/**
 * Strategy map: each strategy returns an { action, message, metadata } object.
 */
const BLOCK_STRATEGIES = {
  api_key: (block, _ctx) => ({
    action: 'human-gate',
    message: `API key/credential required: ${extractKeyName(block.content)}. Add to .env and restart the session.`,
    metadata: { resolution: 'human_escalation', key_hint: extractKeyName(block.content) }
  }),

  file_missing: (block, ctx) => {
    const missingFile = extractMissingPath(block.content);
    const prevResults = (ctx.recentResults || []).filter((r) => r.includes('.') || r.includes('/'));
    const hint = prevResults.length > 0
      ? `Check if a previous task created it. Recent results: ${prevResults.slice(0, 2).join(' | ')}`
      : `Verify the file path and that the producing task ran successfully.`;
    return {
      action: 'retry-with-context',
      message: `File not found: ${missingFile}. ${hint}`,
      metadata: { resolution: 'context_hint', missing_file: missingFile }
    };
  },

  dependency: (block, _ctx) => {
    const depId = extractDependencyId(block.content);
    return {
      action: 'wait-and-retry',
      message: depId
        ? `Waiting for ${depId} to complete before proceeding.`
        : `Dependency not satisfied. Wait for upstream tasks to complete.`,
      metadata: { resolution: 'dependency_wait', dep_id: depId }
    };
  },

  permission: (_block, _ctx) => ({
    action: 'human-gate',
    message: 'Permission denied — this operation requires manual intervention or elevated access.',
    metadata: { resolution: 'human_escalation' }
  }),

  timeout: (_block, _ctx) => ({
    action: 'abort-and-escalate',
    message: 'Task exceeded its timeout. It may need to be decomposed into smaller steps.',
    metadata: { resolution: 'escalate_decompose' }
  }),

  generic: (block, ctx) => {
    const recentCtx = (ctx.recentResults || []).join('\n');
    return {
      action: 'coordinator-hint',
      message: `Coordinator attempting to resolve block. Try proceeding with available information.${recentCtx ? `\nContext from other executors:\n${recentCtx}` : ''}`,
      metadata: { resolution: 'coordinator_hint' }
    };
  }
};

/**
 * After each wave, inspect the bus for unresolved block messages and
 * attempt automatic resolution using the strategy pattern.
 *
 * Block types: api_key, file_missing, dependency, permission, timeout, generic
 * Actions: human-gate, retry-with-context, wait-and-retry, abort-and-escalate, coordinator-hint
 */
async function handleBusBlocks(projectDir, squadSlug, sessionId, logger) {
  const allMessages = await bus.read(projectDir, squadSlug, sessionId).catch(() => []);
  const unresolved = getUnresolvedBlocks(allMessages);

  if (unresolved.length === 0) return;

  const recentResultMessages = allMessages
    .filter((m) => m.type === 'result')
    .slice(-3)
    .map((m) => `${m.from}: ${String(m.content || '').slice(0, 100)}`);

  for (const block of unresolved) {
    const blockType = classifyBlock(block.content);
    const strategy = BLOCK_STRATEGIES[blockType] || BLOCK_STRATEGIES.generic;
    const resolution = strategy(block, { recentResults: recentResultMessages });

    if (resolution.action === 'human-gate' || resolution.action === 'abort-and-escalate') {
      logger.log(`  ⚠ Block [${blockType}] requires human attention: "${String(block.content || '').slice(0, 80)}"`);
    }

    await bus.post(projectDir, squadSlug, sessionId, {
      from: 'coordinator',
      to: block.from,
      type: 'resolution',
      content: resolution.message,
      metadata: { block_id: block.id, block_type: blockType, ...resolution.metadata }
    }).catch(() => {});
  }
}

// ─── Gap Closure Loop ─────────────────────────────────────────────────────────

/**
 * Run a task with automatic retry on failure (gap closure).
 *
 * On failure:
 *   1. Capture the error as failure context
 *   2. Re-run the task with the failure context injected into workerInput
 *   3. Repeat up to maxRetries times
 *   4. If still failing after maxRetries: escalate
 *
 * ESCALATE results are NOT retried — they require coordinator/human attention.
 */
async function runTaskWithGapClosure(
  projectDir, squadSlug, task, sessionId, options, logger,
  maxRetries = 3
) {
  const { enableBus } = options;
  let currentTask = { ...task, _attempt: 1 };
  let lastError = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    currentTask = { ...currentTask, _attempt: attempt };

    // Announce gap closure retry on bus (only from attempt 2 onwards)
    if (attempt > 1 && enableBus) {
      await bus.post(projectDir, squadSlug, sessionId, {
        from: 'coordinator',
        to: task.executor || '*',
        type: 'gap_closure_attempt',
        content: `Retrying "${task.title}" (attempt ${attempt}/${maxRetries}). Previous failure: ${lastError}`,
        metadata: { task_id: task.id, attempt, prev_error: lastError }
      }).catch(() => {});
    }

    // Run with heartbeat
    const result = await runTaskWithHeartbeat(
      projectDir, squadSlug, task, sessionId, options,
      () => runTask(projectDir, squadSlug, currentTask, sessionId, options, logger)
    );

    if (result.finalStatus === 'completed') {
      if (attempt > 1) {
        logger.log(`    ↩ Gap closed after ${attempt} attempt(s)`);
      }
      return result;
    }

    // Don't retry escalated tasks — they need human/coordinator attention
    if (['escalated', 'unverified', 'paused_budget'].includes(result.finalStatus) || result.workerResult?.retryable === false) {
      return result;
    }

    // Capture failure context for next attempt
    lastError = result.workerResult?.error || result.reflectionResult?.summary || `task failed on attempt ${attempt}`;
    currentTask = {
      ...currentTask,
      _failure_context: lastError
    };

    if (attempt < maxRetries) {
      logger.log(`    ↩ Gap closure attempt ${attempt}/${maxRetries} failed — retrying with context`);
    }
  }

  // Exhausted retries — escalate
  logger.log(`    ✗ Gap closure exhausted (${maxRetries} attempts) — escalating`);

  const latestPlan = await loadPlan(projectDir, squadSlug, sessionId);
  const latestTask = latestPlan?.tasks?.find((candidate) => candidate.id === task.id);
  const latestResult = latestTask?.result && typeof latestTask.result === 'object'
    ? latestTask.result
    : {};
  const finishedAt = nowIso();
  await updateTaskStatus(projectDir, squadSlug, sessionId, task.id, 'escalated', {
    ...latestResult,
    gap_closure_exhausted: true,
    last_error: lastError,
    finished_at: finishedAt,
    completed_at: null
  });

  if (enableBus) {
    await bus.post(projectDir, squadSlug, sessionId, {
      from: 'coordinator',
      to: '*',
      type: 'block',
      content: `Task "${task.title}" escalated after ${maxRetries} gap closure attempts. Last error: ${lastError}`,
      metadata: { task_id: task.id, gap_closure_exhausted: true, attempts: maxRetries }
    }).catch(() => {});
  }

  return {
    task,
    finalStatus: 'escalated',
    workerResult: { ok: false, error: lastError, gap_closure_exhausted: true },
    reflectionResult: null
  };
}

// ─── Sampling-and-Voting (Plan 81 §Sprint 4) ────────────────────────────────

/**
 * Synthesize votes from multiple worker instances.
 * Returns { consensus, winningOutput, allVotes }.
 *
 * Agreement requires identical output from accepted candidates. Matching status
 * alone says nothing about content; this is not a semantic consensus evaluator.
 */
function synthesizeVotes(votes) {
  const statusCounts = {};
  for (const v of votes) {
    const s = v.finalStatus === 'completed'
      ? JSON.stringify(v.workerResult?.output)
      : `status:${v.finalStatus || 'unknown'}`;
    statusCounts[s] = (statusCounts[s] || 0) + 1;
  }

  let bestStatus = 'unknown';
  let bestCount = 0;
  for (const [s, count] of Object.entries(statusCounts)) {
    if (count > bestCount) { bestStatus = s; bestCount = count; }
  }

  const consensus = bestCount / votes.length;
  const winningVotes = votes.filter((v) => (v.finalStatus === 'completed'
    ? JSON.stringify(v.workerResult?.output)
    : `status:${v.finalStatus || 'unknown'}`) === bestStatus);

  return {
    consensus,
    bestStatus: winningVotes[0]?.finalStatus || 'unknown',
    tied: Object.values(statusCounts).filter((count) => count === bestCount).length > 1,
    agreement_kind: 'exact_output',
    winningOutput: winningVotes[0],
    allVotes: votes.map((v) => ({
      finalStatus: v.finalStatus,
      evidence: v.persistedResult || null,
      outputSummary: JSON.stringify(v.workerResult?.output || '').slice(0, 200)
    }))
  };
}

/**
 * Run a task with sampling-and-voting for critical decisions.
 *
 * Spawns N instances of the same task in parallel, then synthesizes votes.
 * If consensus < threshold, escalates to human-gate.
 *
 * @param {object} task — task with voting config: { instances, threshold }
 * @param {number} instances — number of parallel instances (default: 3)
 * @param {number} threshold — minimum consensus fraction (default: 0.66)
 */
async function runTaskWithVoting(
  projectDir, squadSlug, task, sessionId, options, logger,
  instances = 3, threshold = 0.66
) {
  const { enableBus } = options;

  if (enableBus) {
    await bus.post(projectDir, squadSlug, sessionId, {
      from: 'coordinator',
      to: '*',
      type: 'status',
      content: `Sampling-and-Voting: running ${instances} instances of "${task.title}"`,
      metadata: { task_id: task.id, voting: true, instances }
    }).catch(() => {});
  }

  // Spawn N instances in parallel
  const instancePromises = [];
  for (let i = 1; i <= instances; i++) {
    const previousVote = task.result?.budget_resume?.kind === 'voting' ? task.result.budget_resume.votes[i - 1] : null;
    if (previousVote && previousVote.finalStatus !== 'paused_budget') {
      instancePromises.push(Promise.resolve({ ...previousVote, task }));
      continue;
    }
    const instanceTask = { ...task, _attempt: 1, _voting_instance: i, _defer_acceptance: true };
    instancePromises.push(
      runTaskWithHeartbeat(
        projectDir, squadSlug, instanceTask, sessionId, options,
        () => runTask(projectDir, squadSlug, instanceTask, sessionId, options, logger)
      ).catch((err) => ({
        task: instanceTask,
        finalStatus: 'failed',
        workerResult: { ok: false, error: err.message },
        reflectionResult: null
      }))
    );
  }

  const votes = await Promise.all(instancePromises);
  if (votes.some((vote) => vote.finalStatus === 'paused_budget')) {
    const pausedResult = {
      budget_pause: options.executionBudget.snapshot().pause, completed_at: null,
      budget_resume: { kind: 'voting', votes: votes.map(({ finalStatus, workerResult, reflectionResult, persistedResult }) => ({ finalStatus, workerResult, reflectionResult, persistedResult })) }
    };
    await updateTaskStatus(projectDir, squadSlug, sessionId, task.id, 'paused_budget', pausedResult);
    return { task, finalStatus: 'paused_budget', workerResult: null, reflectionResult: null };
  }
  const result = synthesizeVotes(votes);

  if (enableBus) {
    await bus.post(projectDir, squadSlug, sessionId, {
      from: 'coordinator',
      to: '*',
      type: 'feedback',
      content: `Voting result for "${task.title}": consensus=${(result.consensus * 100).toFixed(0)}% status=${result.bestStatus} (${instances} instances)`,
      metadata: { task_id: task.id, consensus: result.consensus, bestStatus: result.bestStatus }
    }).catch(() => {});
  }

  // If consensus below threshold, escalate
  if (result.consensus < threshold || result.tied || result.bestStatus !== 'completed') {
    logger.log(`    ⚠ Voting not accepted: agreement=${(result.consensus * 100).toFixed(0)}%, threshold=${(threshold * 100).toFixed(0)}%, status=${result.bestStatus}, tied=${result.tied} — escalating`);

    await updateTaskStatus(projectDir, squadSlug, sessionId, task.id, 'escalated', {
      voting: { agreement_kind: result.agreement_kind, consensus: result.consensus, threshold, allVotes: result.allVotes },
      finished_at: nowIso(),
      completed_at: null
    });

    if (enableBus) {
      await bus.post(projectDir, squadSlug, sessionId, {
        from: 'coordinator',
        to: '*',
        type: 'block',
        content: `Task "${task.title}" — voting did not establish an accepted output. Requires human review.`,
        metadata: { task_id: task.id, voting_escalated: true }
      }).catch(() => {});
    }

    return {
      task,
      finalStatus: 'escalated',
      workerResult: { ok: false, error: 'voting_not_accepted', voting: result },
      reflectionResult: null
    };
  }

  // Use the winning vote as the result
  await updateTaskStatus(projectDir, squadSlug, sessionId, task.id, 'completed', {
    ...result.winningOutput.persistedResult,
    voting: { agreement_kind: result.agreement_kind, consensus: result.consensus, allVotes: result.allVotes },
    completed_at: nowIso()
  });
  return result.winningOutput;
}

// ─── Evaluator-Optimizer Loop (Plan 82 §ITEM 4) ──────────────────────────────

/**
 * Run a task through an evaluator-optimizer loop (dev→qa→dev...):
 *   1. Generator phase: run the task as the implementer
 *   2. Evaluator phase: run a review task against criteria (fresh context)
 *   3. If PASS → done. If FAIL → inject structured feedback → repeat
 *   4. Max iterations before escalating to human
 *
 * The key: the evaluator receives only the artifact, not the generator's reasoning.
 * This prevents confirmation bias (same principle as verify-gate).
 */
async function runWithEvalOptimize(
  projectDir, squadSlug, task, sessionId, options, logger,
  maxIterations = 3
) {
  const { enableBus } = options;
  let lastFeedback = null;
  let lastResult = null;
  let iterationsRun = 0;
  let lastEvaluation = null;
  const checkpoint = task.result?.budget_resume?.kind === 'review' ? task.result.budget_resume : null;

  if ((task.reviewer || 'qa') === (task.specialist?.slug || task.executor)) {
    await updateTaskStatus(projectDir, squadSlug, sessionId, task.id, 'unverified', {
      error: 'independent_reviewer_required', completed_at: null
    });
    return { task, finalStatus: 'unverified', workerResult: null, reflectionResult: null };
  }

  if (enableBus) {
    await bus.post(projectDir, squadSlug, sessionId, {
      from: 'coordinator',
      to: '*',
      type: 'status',
      content: `Evaluator-Optimizer: starting loop for "${task.title}" (max ${maxIterations} iterations)`,
      metadata: { task_id: task.id, eval_optimize: true, max_iterations: maxIterations }
    }).catch(() => {});
  }

  for (let iteration = checkpoint?.iteration || 1; iteration <= maxIterations; iteration++) {
    iterationsRun = iteration;
    // ── Generator phase ──────────────────────────────────────────────────────
    const generatorTask = {
      ...task,
      _attempt: iteration,
      _defer_acceptance: true,
      ...(lastFeedback ? { _eval_feedback: lastFeedback, _eval_iteration: iteration } : {})
    };

    lastResult = checkpoint && iteration === checkpoint.iteration ? checkpoint.generatedResult : await runTaskWithHeartbeat(
      projectDir, squadSlug, generatorTask, sessionId, options,
      () => runTask(projectDir, squadSlug, generatorTask, sessionId, options, logger)
    );

    if (lastResult.finalStatus !== 'completed') {
      logger.log(`    ↳ Eval-Optimize iteration ${iteration}: generator failed — escalating`);
      return lastResult;
    }

    // ── Evaluator phase ──────────────────────────────────────────────────────
    const reviewTask = {
      id: `${task.id}-review-${iteration}`,
      title: `Review: ${task.title} (iteration ${iteration})`,
      description: [
        `Evaluate the output of task "${task.title}".`,
        ``,
        `Criteria to check (ALL must pass):`,
        ...(task.review_criteria || []).map((c) => `- ${c}`),
        ``,
        `Output PASS if all criteria are met.`,
        `Output FAIL with structured feedback: specific file:line references, exact criterion violated, minimum change to pass.`,
        ``,
        `Do NOT consider how the implementer reasoned — evaluate only the artifact.`
      ].join('\n'),
      executor: task.reviewer || 'qa',
      acceptance_criteria: ['Output either PASS or FAIL with structured feedback'],
      _eval_artifact: lastResult.workerResult?.output || null
    };
    reviewTask._budget_task_id = task.id;

    const evalResult = await runTaskWithHeartbeat(
      projectDir, squadSlug, reviewTask, sessionId, options,
      () => runTask(projectDir, squadSlug, reviewTask, sessionId, options, logger)
    );

    if (evalResult.finalStatus === 'paused_budget') {
      await updateTaskStatus(projectDir, squadSlug, sessionId, task.id, 'paused_budget', {
        ...lastResult.persistedResult, completed_at: null,
        budget_pause: evalResult.workerResult.budget_pause,
        budget_resume: { kind: 'review', iteration, generatedResult: {
          finalStatus: lastResult.finalStatus, workerResult: lastResult.workerResult,
          reflectionResult: lastResult.reflectionResult, persistedResult: lastResult.persistedResult
        } }
      });
      return { task, finalStatus: 'paused_budget', workerResult: evalResult.workerResult, reflectionResult: null };
    }

    const reviewOutput = evalResult.workerResult?.output;
    lastEvaluation = evalResult.persistedResult || { error: evalResult.workerResult?.error || 'evaluation_unavailable' };
    const verdict = typeof reviewOutput === 'string' ? reviewOutput.trim()
      : reviewOutput?.verdict || reviewOutput?.result;
    const evalOutput = typeof reviewOutput === 'string' ? reviewOutput : JSON.stringify(reviewOutput || {});
    const passed = evalResult.finalStatus === 'completed' && verdict === 'PASS';

    if (enableBus) {
      await bus.post(projectDir, squadSlug, sessionId, {
        from: 'coordinator',
        to: '*',
        type: 'feedback',
        content: `Eval-Optimize iteration ${iteration}/${maxIterations}: ${passed ? 'PASS' : 'FAIL'} — ${evalOutput.slice(0, 120)}`,
        metadata: { task_id: task.id, iteration, verdict: passed ? 'PASS' : 'FAIL' }
      }).catch(() => {});
    }

    if (passed) {
      logger.log(`    ↳ Eval-Optimize PASS at iteration ${iteration}`);
      await updateTaskStatus(projectDir, squadSlug, sessionId, task.id, 'completed', {
        ...lastResult.persistedResult,
        eval_optimize: { iterations: iteration, verdict: 'PASS', reviewer: reviewTask.executor, evaluation: evalResult.persistedResult },
        completed_at: nowIso()
      });
      return lastResult;
    }

    lastFeedback = evalOutput.slice(0, 1000);
    await updateTaskStatus(projectDir, squadSlug, sessionId, task.id, 'needs_iteration', {
      ...lastResult.persistedResult,
      eval_optimize: { iterations: iteration, verdict: 'FAIL', reviewer: reviewTask.executor, last_feedback: lastFeedback, evaluation: lastEvaluation },
      completed_at: null
    });
    if (evalResult.finalStatus !== 'completed') break;
    logger.log(`    ↳ Eval-Optimize FAIL at iteration ${iteration} — applying feedback`);
  }

  // Max iterations reached — escalate
  logger.log(`    ✗ Eval-Optimize: stopped after ${iterationsRun}/${maxIterations} iterations without acceptance — escalating`);

  await updateTaskStatus(projectDir, squadSlug, sessionId, task.id, 'escalated', {
    ...lastResult?.persistedResult,
    eval_optimize: { iterations: iterationsRun, verdict: 'FAIL', last_feedback: lastFeedback, evaluation: lastEvaluation },
    finished_at: nowIso(),
    completed_at: null
  });

  if (enableBus) {
    await bus.post(projectDir, squadSlug, sessionId, {
      from: 'coordinator',
      to: '*',
      type: 'block',
      content: `Task "${task.title}" — eval-optimize loop exhausted (${maxIterations} iterations). Requires human review.`,
      metadata: { task_id: task.id, eval_optimize_exhausted: true }
    }).catch(() => {});
  }

  return {
    task,
    finalStatus: 'escalated',
    workerResult: { ok: false, error: 'eval_optimize_exhausted', last_feedback: lastFeedback },
    reflectionResult: null
  };
}

// ─── Main command ─────────────────────────────────────────────────────────────

async function runSquadAutorun({ args, options = {}, logger }) {
  const targetDir = resolveTargetDir(args);
  const squadSlug = String(options.squad || options.s || '').trim();

  if (!squadSlug) {
    logger.error('Error: --squad is required');
    return { ok: false, error: 'missing_squad' };
  }

  const dryRun = Boolean(options['dry-run'] || options.dryRun);
  const enableBus = options.bus !== false && options.bus !== 'false';
  const enableReflect = Boolean(options.reflect);
  const sequential = Boolean(options.sequential);
  const mode = String(options.mode || 'heuristic').trim();
  const timeoutMs = (options.timeout ? Number(options.timeout) : 120) * 1000;
  const existingPlanId = String(options.plan || '').trim();
  const enableGapClosure = options['no-gap-closure'] !== true && options['no-gap-closure'] !== 'true';
  const maxRetries = Math.min(Math.max(Number(options['max-retries'] || 3), 1), 5);
  const requestedEngine = String(options.engine || 'legacy').trim();
  const ignoreDeps = Boolean(options['ignore-deps'] || options.ignoreDeps);
  const waitDeps = Boolean(options['wait-deps'] || options.waitDeps);
  const waitDepsTimeoutMs = (options['wait-deps-timeout'] ? Number(options['wait-deps-timeout']) : 60) * 1000;

  // ── Resolve execution engine (Plan 81 §1.1) ──────────────────────────────
  const engineResult = resolveEngine(requestedEngine);
  if (engineResult.fallback) {
    logger.log(`⚠ ${engineResult.reason} — falling back to legacy engine`);
  }

  // ── Load token budget ──────────────────────────────────────────────────────
  const budget = await loadBudget(targetDir, squadSlug);


  // ── Load or create plan ────────────────────────────────────────────────────
  let plan;
  let sessionId;

  if (existingPlanId) {
    plan = await loadPlan(targetDir, squadSlug, existingPlanId);
    if (!plan) {
      logger.error(`Plan not found: session "${existingPlanId}" for squad "${squadSlug}"`);
      return { ok: false, error: 'plan_not_found' };
    }
    sessionId = existingPlanId;
    logger.log(`Resuming plan [${sessionId}] — ${plan.tasks.length} tasks`);
  } else {
    const goal = String(options.goal || '').trim();
    if (!goal) {
      logger.error('Error: --goal is required (or --plan to resume an existing plan)');
      return { ok: false, error: 'missing_goal' };
    }

    sessionId = randomUUID();
    logger.log(`Decomposing goal for squad "${squadSlug}" [${mode}]...`);
    plan = await decompose(targetDir, squadSlug, goal, { sessionId, mode, save: !dryRun });
    logger.log(`Plan ready: ${plan.tasks.length} tasks across ${Object.keys(plan.parallel_groups).length} parallel group(s)`);
  }

  const invalidPlan = validatePlanDependencies(plan);
  if (invalidPlan) {
    logger.error(`Invalid plan: ${invalidPlan}`);
    return { ok: false, error: 'invalid_plan', detail: invalidPlan };
  }

  // ── Show plan ──────────────────────────────────────────────────────────────
  if (options.json) {
    if (dryRun) return { ok: true, dryRun: true, plan };
  } else {
    logger.log('');
    logger.log(formatPlan(plan));
    logger.log('');
  }

  if (dryRun) {
    logger.log('[dry-run] Plan shown above. No tasks executed.');
    return { ok: true, dryRun: true, plan };
  }

  // ── Handle structured mode ─────────────────────────────────────────────────
  if (mode === 'structured' && plan.structured_prompt) {
    const promptPath = path.join(
      targetDir, '.aioson', 'squads', squadSlug, 'sessions', sessionId, 'decompose-prompt.md'
    );
    const promptContent = [
      '---',
      `session_id: ${sessionId}`,
      `squad: ${squadSlug}`,
      `created_at: ${plan.created_at}`,
      '---',
      '',
      plan.structured_prompt,
      '',
      '> After the agent fills in the JSON above, run:',
      `> aioson squad:autorun . --squad=${squadSlug} --plan=${sessionId}`
    ].join('\n');

    const { ensureDir } = require('../utils');
    await ensureDir(path.dirname(promptPath));
    await fs.writeFile(promptPath, promptContent, 'utf8');

    logger.log(`[structured] Decomposition prompt saved to: ${path.relative(targetDir, promptPath)}`);
    logger.log('Activate your agent to fill in the plan, then resume with:');
    logger.log(`  aioson squad:autorun . --squad=${squadSlug} --plan=${sessionId}`);
    return { ok: true, status: 'prepared', mode: 'structured', session_id: sessionId, sessionId, promptPath: path.relative(targetDir, promptPath), plan };
  }

  if (!plan.tasks.length) return { ok: false, error: 'empty_plan', status: 'unverified', session_id: sessionId };

  const releaseExecution = acquireExecution(sessionDirectory(targetDir, squadSlug, sessionId));
  if (!releaseExecution) {
    logger.error(`Session ${sessionId} already has an active executor. Wait for it to finish before resuming.`);
    return { ok: false, error: 'session_in_use', session_id: sessionId };
  }
  try {
  // Reload after claiming: another run may have completed while this one loaded.
  plan = await loadPlan(targetDir, squadSlug, sessionId);
  const currentPlanError = plan ? validatePlanDependencies(plan) : 'plan missing';
  if (currentPlanError) return { ok: false, error: 'invalid_plan', detail: currentPlanError };
  const interrupted = plan.tasks.filter((task) => ['in_progress', 'running'].includes(task.status));
  if (interrupted.length) {
    logger.error(`Session ${sessionId} has interrupted tasks: ${interrupted.map((task) => task.id).join(', ')}. Reconcile their effects before marking them completed or resetting them to pending.`);
    return { ok: false, error: 'reconciliation_required', session_id: sessionId, tasks: interrupted.map((task) => task.id) };
  }

  // ── Load squad manifest (for inter-squad config and hooks) ─────────────────
  let squadManifest = {};
  try {
    const manifestPath = path.join(targetDir, '.aioson', 'squads', squadSlug, 'squad.manifest.json');
    squadManifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
  } catch { /* manifest is optional */ }

  const savedEventSession = await interSquadEvents.getSession(targetDir, { toSquad: squadSlug, sessionId });
  const dependencySnapshot = plan.revision_of ? (plan.inter_squad_events || []) : savedEventSession?.events;

  // ── Inter-squad dependency validation ─────────────────────────────────────
  if (!ignoreDeps && (squadManifest.depends_on || []).length > 0) {
    const depResult = await validateInterSquadDependencies(targetDir, squadManifest, dependencySnapshot);
    if (!depResult.satisfied) {
      const depList = depResult.unmet.map((d) => `${d.squad}/${d.event}`).join(', ');
      if (waitDeps) {
        logger.log(`⏳ Waiting for inter-squad events: ${depList}`);
        const deadline = Date.now() + waitDepsTimeoutMs;
        let resolved = false;
        while (Date.now() < deadline) {
          await sleep(3000);
          const retry = await validateInterSquadDependencies(targetDir, squadManifest, dependencySnapshot);
          if (retry.satisfied) { resolved = true; break; }
        }
        if (!resolved) {
          logger.error(`✗ Dependencies still unmet after ${waitDepsTimeoutMs / 1000}s: ${depList}`);
          return { ok: false, error: 'unmet_dependencies', unmet: depResult.unmet };
        }
        logger.log('  ✓ Dependencies satisfied');
      } else {
        logger.warn(`⚠ Unmet inter-squad dependencies: ${depList}`);
        logger.warn('  Use --ignore-deps to run anyway, or --wait-deps to poll until satisfied');
        return { ok: false, error: 'unmet_dependencies', unmet: depResult.unmet };
      }
    }
  }

  // Freeze event identity before dispatch. Resumes recover this snapshot, even after TTL.
  const eventSession = await interSquadEvents.bindSession(targetDir, {
    toSquad: squadSlug, sessionId,
    subscriptions: squadManifest.subscriptions || [], dependencies: squadManifest.depends_on || [],
    ignoreDependencies: ignoreDeps,
    acceptNew: !plan.revision_of && plan.tasks.length > 0 && plan.tasks.every((task) => task.status === 'pending')
  });
  if (!eventSession.ok) return eventSession;
  const incomingEvents = plan.revision_of ? (plan.inter_squad_events || []) : eventSession.events;
  plan = mutatePlan(sessionDirectory(targetDir, squadSlug, sessionId), (current) => {
    current.inter_squad_events = incomingEvents;
  });
  if (incomingEvents.length) logger.log(`Inter-squad events bound to session ${sessionId}: ${incomingEvents.length}`);

  // ── Record session start in STATE.md ───────────────────────────────────────
  await stateManager.recordSessionStart(targetDir, squadSlug, sessionId, plan.goal).catch(() => {});

  // ── Agent Teams engine path (Plan 81 §1.1) ────────────────────────────────
  if (engineResult.engine === 'agent-teams') {
    logger.log(`Engine: agent-teams (Claude Code ${engineResult.version})`);
    const teamConfig = translateToTeamConfig(targetDir, squadManifest, plan, {
      budget, enableBus
    });
    const configPath = await writeTeamConfig(targetDir, squadSlug, teamConfig);
    logger.log(`Team config: ${path.relative(targetDir, configPath)}`);
    logger.log(`Teammates: ${teamConfig.teammates.map((t) => t.name).join(', ')}`);
    logger.log(`Tasks: ${teamConfig.tasks.length}`);
    logger.log('');
    logger.log('Agent Teams configuration prepared; no tasks executed. Use:');
    logger.log(`  claude --team ${path.relative(targetDir, configPath)}`);
    logger.log('');

    mutatePlan(sessionDirectory(targetDir, squadSlug, sessionId), (current) => {
      current.execution_status = 'prepared';
    });
    await stateManager.updateState(targetDir, squadSlug, {
      meta: { execution_status: 'prepared' }
    }).catch(() => {});

    return {
      ok: true,
      status: 'prepared',
      engine: 'agent-teams',
      session_id: sessionId,
      squad: squadSlug,
      configPath: path.relative(targetDir, configPath),
      teamConfig
    };
  }

  // ── 3.3 Hook Exit Code Protocol — pre_run hook ─────────────────────────────
  const preRunHook = squadManifest.hooks?.pre_run;
  if (preRunHook) {
    logger.log(`Running pre_run hook: ${preRunHook.slice(0, 60)}${preRunHook.length > 60 ? '...' : ''}`);
    const hookResult = runHook(preRunHook, {
      squad: squadSlug,
      session_id: sessionId,
      goal: plan.goal,
      project_dir: targetDir
    });
    if (hookResult.denied) {
      logger.error(`✗ Pre-run hook denied execution${hookResult.stderr ? ': ' + hookResult.stderr : ''}`);
      return { ok: false, error: 'hook_denied', hook: preRunHook, reason: hookResult.stderr };
    }
    if (hookResult.warn) {
      logger.log(`  ⚠ Pre-run hook exited ${hookResult.exitCode} (non-fatal)${hookResult.stderr ? ': ' + hookResult.stderr : ''}`);
    } else {
      logger.log('  ✓ Pre-run hook passed');
    }
  }

  // ── Execute tasks (legacy engine) ─────────────────────────────────────────
  logger.log(`Starting execution — session [${sessionId}]`);
  if (enableBus) logger.log('Intra-squad bus: enabled');
  if (enableReflect) logger.log('Reflection: enabled');
  if (enableGapClosure) logger.log(`Gap closure: enabled (max ${maxRetries} retries)`);
  if (budget.maxTokensPerSession !== Infinity) {
    logger.log(`Budget: ${budget.maxTokensPerSession.toLocaleString()} tokens/session`);
  }
  logger.log('');

  const results = [];
  let completedCount = 0;
  let failedCount = 0;
  let escalatedCount = 0;
  const startedAt = Date.now();

  const executionBudget = createExecutionBudget(targetDir, squadSlug, sessionId, budget);
  const runOptions = { enableBus, enableReflect, timeoutMs, executionBudget, incomingEvents };

  // Readiness is authoritative, including when saved parallel groups are stale.
  let group = 0;
  while (true) {
    if (executionBudget.snapshot().pause) break;

    plan = await loadPlan(targetDir, squadSlug, sessionId);
    const groupTasks = getReadyTasks(plan);
    if (groupTasks.length === 0) break;
    group++;

    logger.log(`── Group ${group} (${groupTasks.length} task${groupTasks.length > 1 ? 's' : ''})${groupTasks.length > 1 && !sequential ? ' — running in parallel' : ''}`);

    // ── Run tasks in this group ────────────────────────────────────────────
    const runTask_ = async (task) => {
      // Brief validation guard (Plan 80 §1): validate brief before spawn
      if (task.brief_path) {
        const briefResult = await validateBrief(task.brief_path, targetDir);
        if (!briefResult.ready) {
          // Auto-fix simple fields (out_of_scope only)
          if (briefResult.issues.length === 1 && briefResult.issues[0].field === 'out_of_scope') {
            await autoFixBrief(task.brief_path, targetDir);
            logger.log(`  ↩ Auto-fixed brief for ${task.id} (out_of_scope)`);
          } else {
            if (enableBus) {
              await bus.post(targetDir, squadSlug, sessionId, {
                from: 'coordinator', to: '*', type: 'block',
                content: `Brief NOT READY for ${task.id}: ${briefResult.issues.map((i) => i.message).join(', ')}`,
                metadata: { task_id: task.id, brief_validation: briefResult }
              }).catch(() => {});
            }
            logger.log(`  ⚠ ${task.id}: brief NOT READY (${briefResult.issues.length} issues) — skipping`);
            await updateTaskStatus(targetDir, squadSlug, sessionId, task.id, 'skipped', {
              skip_reason: 'brief_not_ready', issues: briefResult.issues
            });
            return { task, finalStatus: 'skipped', workerResult: null, reflectionResult: null };
          }
        }
      }

      logger.log(`  ${icon('in_progress')} ${task.id}: ${task.title}`);

      // Sampling-and-Voting path (Plan 81 §Sprint 4)
      if (task.voting) {
        const votingInstances = Number.isInteger(task.voting.instances) && task.voting.instances > 0 ? Math.min(task.voting.instances, 5) : 3;
        const votingThreshold = Number.isFinite(task.voting.threshold) && task.voting.threshold > 0 && task.voting.threshold <= 1 ? task.voting.threshold : 0.66;
        logger.log(`    ↳ Voting: ${votingInstances} instances, threshold ${(votingThreshold * 100).toFixed(0)}%`);
        const runner = runTaskWithVoting(
          targetDir, squadSlug, task, sessionId, runOptions, logger,
          votingInstances, votingThreshold
        );
        return runner.then((r) => {
          logger.log(`  ${icon(r.finalStatus)} ${task.id}: ${r.finalStatus.toUpperCase()}`);
          return r;
        });
      }

      // Evaluator-Optimizer path (Plan 82 §ITEM 4)
      if (task.review_loop) {
        const maxReviewIter = Number.isInteger(task.max_review_iterations) && task.max_review_iterations > 0 ? Math.min(task.max_review_iterations, 5) : 3;
        logger.log(`    ↳ Eval-Optimize: max ${maxReviewIter} iterations, reviewer=${task.reviewer || 'qa'}`);
        return runWithEvalOptimize(
          targetDir, squadSlug, task, sessionId, runOptions, logger, maxReviewIter
        ).then((r) => {
          logger.log(`  ${icon(r.finalStatus)} ${task.id}: ${r.finalStatus.toUpperCase()}`);
          return r;
        });
      }

      const runner = enableGapClosure
        ? runTaskWithGapClosure(targetDir, squadSlug, task, sessionId, runOptions, logger, maxRetries)
        : runTaskWithHeartbeat(targetDir, squadSlug, task, sessionId, runOptions,
            () => runTask(targetDir, squadSlug, task, sessionId, runOptions, logger));
      return runner.then((r) => {
        logger.log(`  ${icon(r.finalStatus)} ${task.id}: ${r.finalStatus.toUpperCase()}`);
        return r;
      });
    };

    let groupResults;
    if (sequential || groupTasks.length === 1) {
      groupResults = [];
      for (const task of groupTasks) {
        if (executionBudget.snapshot().pause) break;
        groupResults.push(await runTask_(task));
      }
    } else {
      // Keep session ownership until every in-flight task has settled, even if
      // one task throws while its siblings are still producing effects.
      const settled = await Promise.allSettled(groupTasks.map(runTask_));
      const rejected = settled.filter((result) => result.status === 'rejected');
      if (rejected.length) throw new AggregateError(rejected.map((result) => result.reason), 'Task execution failed');
      groupResults = settled.map((result) => result.value);
    }

    results.push(...groupResults);

    // Accumulate token usage estimate for budget tracking
    for (const r of groupResults) {

      if (r.finalStatus === 'completed') completedCount++;
      else if (r.finalStatus === 'failed') failedCount++;
      else if (r.finalStatus === 'escalated') escalatedCount++;
    }

    // Bus coordinator: resolve any unresolved blocks after this wave
    if (enableBus) {
      await handleBusBlocks(targetDir, squadSlug, sessionId, logger).catch(() => {});
    }

    // Short pause between waves to allow bus writes to flush
    if (groupTasks.length > 1) await sleep(100);
  }

  plan = await loadPlan(targetDir, squadSlug, sessionId);
  completedCount = plan.tasks.filter((task) => ['completed', 'done'].includes(task.status)).length;
  failedCount = plan.tasks.filter((task) => task.status === 'failed').length;
  escalatedCount = plan.tasks.filter((task) => task.status === 'escalated').length;
  const blockedTasks = plan.tasks.filter((task) => task.status === 'pending').map((task) => ({
    id: task.id,
    waiting_for: (task.dependencies || []).filter((id) => !plan.tasks.some((dependency) => dependency.id === id && ['completed', 'done'].includes(dependency.status)))
  }));
  const evaluationPending = plan.tasks.filter((task) => ['needs_iteration', 'unverified', 'awaiting_review'].includes(task.status))
    .map((task) => ({ id: task.id, status: task.status, reason: task.result?.reflection?.summary || task.result?.error || 'Awaiting acceptance' }));

  // ── Record session end in STATE.md ─────────────────────────────────────────
  const usage = executionBudget.snapshot();
  const executionStatus = usage.pause ? 'paused_budget' : completedCount === plan.tasks.length ? 'completed' : 'incomplete';
  executionBudget.finish(executionStatus);
  if (executionStatus === 'completed' && plan.tasks.length > 0) {
    await interSquadEvents.acknowledgeSession(targetDir, { toSquad: squadSlug, sessionId });
  }
  const pendingMarker = `[autorun:${sessionId}]`;
  if (executionStatus === 'completed' && results.length > 0) {
    await stateManager.recordSessionEnd(targetDir, squadSlug, sessionId, results).catch(() => {});
  }
  await stateManager.updateState(targetDir, squadSlug, { resolvePending: [pendingMarker] }).catch(() => {});
  await stateManager.updateState(targetDir, squadSlug, {
    meta: { execution_status: executionStatus },
    ...(executionStatus !== 'completed' ? {
      tasksCompleted: results.filter((result) => result.finalStatus === 'completed').length,
      addPending: [`${pendingMarker} ${executionStatus}; resume with --plan=${sessionId}`]
    } : {})
  }).catch(() => {});

  // ── 5.1 Automatic Learning Extraction ─────────────────────────────────────
  if (completedCount > 0) {
    const allBusMessages = enableBus
      ? await bus.read(targetDir, squadSlug, sessionId).catch(() => [])
      : [];
    const allReflections = results
      .filter((r) => r.reflectionResult)
      .map((r) => r.reflectionResult);

    const learnings = await extractLearnings(targetDir, squadSlug, sessionId, {
      busMessages: allBusMessages,
      taskResults: results.filter((result) => result.finalStatus === 'completed'),
      reflectionReports: allReflections
    }).catch(() => []);

    if (learnings.length > 0) {
      // Persist learnings to per-agent memory files (Plan 81 §Sprint 4)
      await persistAgentMemory(targetDir, squadSlug, learnings, results).catch(() => {});
      // Will be shown in the summary section below
      results._extractedLearnings = learnings.length;
    }
  }

  // ── Session summary ────────────────────────────────────────────────────────
  const elapsed = Math.round((Date.now() - startedAt) / 1000);
  const busSummary = enableBus
    ? await bus.summary(targetDir, squadSlug, sessionId).catch(() => null)
    : null;

  const summary = {
    ok: completedCount === plan.tasks.length && !usage.pause,
    session_id: sessionId,
    squad: squadSlug,
    goal: plan.goal,
    elapsed_s: elapsed,
    budget_used: usage.estimated_tokens,
    budget_usage: usage,
    status: executionStatus,
    budget_limit: Number.isFinite(budget.maxTokensPerSession) ? budget.maxTokensPerSession : null,
    blocked_tasks: blockedTasks,
    evaluation_pending: evaluationPending,
    paused_tasks: plan.tasks.filter((task) => task.status === 'paused_budget').map((task) => task.id),
    tasks: {
      total: plan.tasks.length,
      completed: completedCount,
      failed: failedCount,
      escalated: escalatedCount
    },
    bus: busSummary
      ? { total_messages: busSummary.total, blocks: busSummary.blocks.length }
      : null
  };

  if (options.json) return summary;

  logger.log('');
  logger.log(`── Autorun ${executionStatus} ─────────────────────────────────────────`);
  if (usage.pause) logger.log(`Budget pause (${usage.pause.scope}): ${usage.pause.task_id}; next attempt needs ~${usage.pause.required_estimate} tokens. Increase the configured limit and resume with --plan=${sessionId}.`);
  for (const task of blockedTasks) logger.log(`Blocked: ${task.id}; waiting for: ${task.waiting_for.join(', ')}`);
  for (const task of evaluationPending) logger.log(`Evaluation pending: ${task.id} (${task.status}); ${task.reason}`);
  logger.log(`Session:   ${sessionId}`);
  logger.log(`Elapsed:   ${elapsed}s`);
  logger.log(`Tasks:     ${completedCount}/${plan.tasks.length} completed  ${failedCount > 0 ? `| ${failedCount} failed` : ''}  ${escalatedCount > 0 ? `| ${escalatedCount} escalated` : ''}`);
  if (budget.maxTokensPerSession !== Infinity) {
    logger.log(`Tokens:    ~${usage.estimated_tokens.toLocaleString()} reserved (estimate) / ${budget.maxTokensPerSession.toLocaleString()} budget; provider measurement unavailable`);
  }
  if (busSummary && busSummary.total > 0) {
    logger.log(`Bus:       ${busSummary.total} messages${busSummary.blocks.length > 0 ? ` | ⚠ ${busSummary.blocks.length} block(s)` : ''}`);
  }
  if (escalatedCount > 0) {
    logger.log('');
    logger.log('⚠ Escalated tasks require coordinator attention:');
    for (const r of results.filter((r) => r.finalStatus === 'escalated')) {
      const exhausted = r.workerResult?.gap_closure_exhausted ? ' (gap closure exhausted)' : '';
      logger.log(`  ${r.task.id}: ${r.task.title}${exhausted}`);
    }
  }
  logger.log('');
  logger.log(`Plan:      .aioson/squads/${squadSlug}/sessions/${sessionId}/plan.json`);
  logger.log(`State:     .aioson/squads/${squadSlug}/STATE.md`);
  if (enableBus) logger.log(`Bus:       .aioson/squads/${squadSlug}/sessions/${sessionId}/bus.jsonl`);

  return summary;
  } finally {
    releaseExecution();
  }
}

module.exports = { runSquadAutorun };
