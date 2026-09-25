'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const { mutatePlan, readPlan, sessionDirectory } = require('./plan-store');

async function loadBudget(projectDir, squadSlug) {
  let manifest = {};
  for (const name of ['squad.manifest.json', 'squad.json']) {
    try {
      manifest = JSON.parse(await fs.readFile(path.join(projectDir, '.aioson/squads', squadSlug, name), 'utf8'));
      break;
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }
  const config = manifest.budget ?? {};
  if (!config || typeof config !== 'object' || Array.isArray(config)) throw new Error('Invalid squad budget');
  const limit = (key) => {
    if (config[key] === undefined || config[key] === null) return Infinity;
    if (!Number.isSafeInteger(config[key]) || config[key] < 0) throw new Error(`Invalid budget.${key}: expected non-negative integer`);
    return config[key];
  };
  const action = config.action_on_exceed ?? 'pause';
  if (!['pause', 'abort'].includes(action)) throw new Error('Invalid budget.action_on_exceed');
  return { maxTokensPerSession: limit('max_tokens_per_session'), maxTokensPerTask: limit('max_tokens_per_task'), actionOnExceed: action };
}

function estimateAttemptTokens(input) {
  return Math.ceil(JSON.stringify(input || {}).length / 4) + 500;
}

function initializeUsage(plan) {
  if (plan.budget_state) {
    const usage = plan.budget_state;
    if (!Number.isSafeInteger(usage.estimated_tokens) || usage.estimated_tokens < 0 ||
        !Number.isSafeInteger(usage.attempts) || usage.attempts < 0 ||
        !usage.task_estimates || typeof usage.task_estimates !== 'object' || Array.isArray(usage.task_estimates) ||
        Object.values(usage.task_estimates).some((value) => !Number.isSafeInteger(value) || value < 0)) {
      throw new Error('Invalid persisted budget accounting; reconcile before resuming');
    }
    return usage;
  }
  const usage = {
    estimated_tokens: 0, measured_tokens: null, measurement: 'unavailable',
    accounting: 'estimated_dispatch_reservations', history_complete: true,
    attempts: 0, task_estimates: {}, pause: null
  };
  for (const task of plan.tasks) {
    const history = task.result?.attempt_history || [];
    const count = history.length ? history.filter((attempt) => attempt.worker_ran !== false).length
      : task.result?.worker_ran === false ? 0 : ['completed', 'done', 'failed', 'escalated'].includes(task.status) ? 1 : 0;
    if (!count) continue;
    const estimate = estimateAttemptTokens({ description: task.description, acceptance_criteria: task.acceptance_criteria }) * count;
    usage.task_estimates = { ...usage.task_estimates, [task.id]: estimate };
    usage.estimated_tokens += estimate;
    usage.attempts += count;
    usage.history_complete = false;
  }
  plan.budget_state = usage;
  return usage;
}

function createExecutionBudget(projectDir, squadSlug, sessionId, limits) {
  const directory = sessionDirectory(projectDir, squadSlug, sessionId);
  mutatePlan(directory, (plan) => {
    const usage = initializeUsage(plan);
    usage.pause = null;
    usage.limits = {
      session: Number.isFinite(limits.maxTokensPerSession) ? limits.maxTokensPerSession : null,
      task: Number.isFinite(limits.maxTokensPerTask) ? limits.maxTokensPerTask : null,
      action: limits.actionOnExceed
    };
    for (const task of plan.tasks) {
      if (task.status === 'paused_budget' || (task.status === 'skipped' && task.result?.skip_reason === 'budget_exceeded')) {
        task.status = 'pending';
      }
    }
    plan.execution_status = 'running';
  });

  return {
    reserve(taskId, input) {
      let result;
      mutatePlan(directory, (plan) => {
        const usage = plan.budget_state;
        if (usage.pause) {
          result = { ok: false, error: 'budget_exceeded', budgetBlocked: true, retryable: false, budget_pause: usage.pause };
          return false;
        }
        const estimate = estimateAttemptTokens(input);
        const taskUsed = Object.hasOwn(usage.task_estimates, taskId) ? usage.task_estimates[taskId] : 0;
        const scope = taskUsed + estimate > limits.maxTokensPerTask ? 'task'
          : usage.estimated_tokens + estimate > limits.maxTokensPerSession ? 'session' : null;
        if (scope) {
          const pause = { scope, task_id: taskId, required_estimate: estimate,
            used_estimate: scope === 'task' ? taskUsed : usage.estimated_tokens,
            limit: scope === 'task' ? limits.maxTokensPerTask : limits.maxTokensPerSession,
            action: limits.actionOnExceed, at: new Date().toISOString() };
          usage.pause = pause;
          plan.execution_status = 'paused_budget';
          result = { ok: false, error: 'budget_exceeded', budgetBlocked: true, retryable: false, budget_pause: pause };
          return;
        }
        usage.estimated_tokens += estimate;
        usage.task_estimates = { ...usage.task_estimates, [taskId]: taskUsed + estimate };
        usage.attempts++;
        result = { ok: true };
      });
      return result;
    },
    snapshot() { return readPlan(directory).budget_state; },
    finish(status) {
      return mutatePlan(directory, (plan) => { plan.execution_status = status; });
    }
  };
}

module.exports = { loadBudget, estimateAttemptTokens, createExecutionBudget };
