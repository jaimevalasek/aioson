'use strict';

const { randomUUID } = require('node:crypto');
const { readPlan, sessionDirectory, acquireExecution, saveSnapshot } = require('./plan-store');
const { validatePlanDependencies } = require('./task-decomposer');
const { readPreservedOutput } = require('./delivery-artifacts');

async function prepareRevision(projectDir, squad, session, taskIds, feedback) {
  if (![squad, session].every(value => typeof value === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/.test(value))) return { ok: false, error: 'invalid_identity' };
  if (!Array.isArray(taskIds) || !taskIds.length || !String(feedback || '').trim()) return { ok: false, error: 'revision_scope_required' };
  const directory = sessionDirectory(projectDir, squad, session);
  if (!readPlan(directory)) return { ok: false, error: 'plan_not_found' };
  const release = acquireExecution(directory);
  if (!release) return { ok: false, error: 'session_in_use' };
  try {
    const original = readPlan(directory);
    if (validatePlanDependencies(original) || (original.squad_slug && original.squad_slug !== squad)
      || (original.session_id && original.session_id !== session) || original.execution_status !== 'completed'
      || !original.tasks.length || original.tasks.some(task => !['completed', 'done'].includes(task.status))) {
      return { ok: false, error: 'revision_requires_completed_session' };
    }
    if (taskIds.some(id => !original.tasks.some(task => task.id === id))) return { ok: false, error: 'unknown_revision_task' };
    for (const task of original.tasks) {
      const reference = task.result?.delivery_evidence;
      if (!reference || !new RegExp(`^\\.aioson/squads/${squad}/sessions/[a-zA-Z0-9_-]+/deliveries/[a-f0-9]{64}\\.json$`).test(reference.path)) {
        return { ok: false, error: 'revision_evidence_missing', task_id: task.id };
      }
      const artifact = await readPreservedOutput(projectDir, reference);
      if (artifact.task_id !== task.id) return { ok: false, error: 'revision_evidence_mismatch', task_id: task.id };
    }
    const affected = new Set(taskIds);
    for (let changed = true; changed;) {
      changed = false;
      for (const task of original.tasks) {
        if (!affected.has(task.id) && (task.dependencies || []).some(id => affected.has(id))) {
          affected.add(task.id); changed = true;
        }
      }
    }
    const id = randomUUID();
    const plan = structuredClone(original);
    delete plan.revision;
    delete plan.budget_state;
    plan.id = id;
    plan.session_id = id;
    plan.execution_status = 'prepared';
    plan.created_at = new Date().toISOString();
    plan.revision_of = { session_id: session, revision: original.revision || 0, task_ids: taskIds, feedback: String(feedback).trim() };
    for (const task of plan.tasks) {
      if (!affected.has(task.id)) continue;
      task.revision_context = { source_session: session, previous_delivery: task.result.delivery_evidence,
        feedback: taskIds.includes(task.id) ? String(feedback).trim() : 'Regenerate this derived output using the revised dependencies; preserve unrelated content.' };
      task.status = 'pending';
      delete task.result;
      delete task.updated_at;
    }
    saveSnapshot(sessionDirectory(projectDir, squad, id), plan);
    return { ok: true, status: 'prepared', squad, session_id: id, revision_of: session,
      affected_tasks: [...affected], preserved_tasks: original.tasks.filter(task => !affected.has(task.id)).map(task => task.id),
      next_action: `aioson squad resume . --squad=${squad} --session=${id}` };
  } finally { release(); }
}

module.exports = { prepareRevision };
