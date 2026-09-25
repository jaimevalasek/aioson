'use strict';

const path = require('node:path');
const { createHash } = require('node:crypto');
const { sessionDirectory, readPlan, saveSnapshot, acquireExecution } = require('./plan-store');
const { decompose, validatePlanDependencies } = require('./task-decomposer');
const { readPreservedOutput } = require('./delivery-artifacts');
const { readSessionStatus, validSessionIdentity } = require('../commands/squad-status');

const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');

function graphShape(dag, order) {
  return { nodes: [...order], task_plans: Object.fromEntries(dag.nodes.map(node => [node.squad_slug, JSON.parse(node.config_json || '{}')?.task_plan || null])),
    edges: dag.edges.map(edge => ({ from: edge.source_squad, output: edge.source_port,
    to: edge.target_squad, input: edge.target_port, transform: edge.transform_json || null })) };
}

async function inspectNode(projectDir, node, pipeline, runId) {
  const status = await readSessionStatus(projectDir, node.squad, node.session_id);
  if (!status.ok) return { ...node, status: status.error === 'plan_not_found' ? 'pending' : 'unverified', error: status.error };
  const plan = readPlan(sessionDirectory(projectDir, node.squad, node.session_id));
  if (plan?.pipeline_context?.pipeline !== pipeline || plan.pipeline_context.run_id !== runId || plan.pipeline_context.squad !== node.squad) {
    return { ...node, status: 'unverified', error: 'pipeline_session_conflict' };
  }
  if (status.status === 'completed') {
    try {
      if (!status.evidence.length) throw new Error('No accepted output evidence');
      for (const entry of status.evidence) {
        const artifact = await readPreservedOutput(projectDir, entry.delivery);
        if (artifact.task_id !== entry.task_id) throw new Error('Delivery task identity mismatch');
      }
    } catch (error) { return { ...node, status: 'unverified', error: error.message }; }
  }
  return { ...node, status: status.status, evidence: status.evidence, next_action: status.next_action,
    requires_contract_review: plan.requires_contract_review === true };
}

async function runPipelineSession(projectDir, dag, order, options, logger) {
  const pipeline = dag.pipeline.slug;
  const runId = options['run-id'];
  if (![pipeline, runId, ...order].every(validSessionIdentity)) return { ok: false, error: 'invalid_identity' };
  if (!order.length) return { ok: false, error: 'empty_pipeline' };
  const sub = options.sub || 'run';
  if (!['run', 'continue', 'status'].includes(sub)) return { ok: false, error: 'unsupported_session_action' };
  const shape = graphShape(dag, order);
  if (shape.edges.some(edge => edge.transform && edge.transform !== 'null' && edge.transform !== '{}')) return { ok: false, error: 'pipeline_transform_unsupported' };
  const directory = path.join(projectDir, '.aioson', 'pipelines', pipeline, 'runs', runId);
  let run = readPlan(directory);
  if (!run && sub === 'status') return { ok: false, error: 'pipeline_run_not_found' };
  if (!run && !String(options.goal || '').trim()) return { ok: false, error: 'missing_goal' };
  const release = sub === 'status' ? null : acquireExecution(directory);
  if (sub !== 'status' && !release) return { ok: false, error: 'pipeline_run_in_use' };
  try {
    run = readPlan(directory);
    if (!run) {
      run = { pipeline, run_id: runId, goal: String(options.goal).trim(), graph: shape, graph_hash: hash(shape),
        nodes: order.map(squad => ({ squad, session_id: `pipeline-${hash([pipeline, runId, squad]).slice(0, 24)}` })) };
      saveSnapshot(directory, run);
    }
    if (run.pipeline !== pipeline || run.run_id !== runId || run.graph_hash !== hash(shape)) return { ok: false, error: 'pipeline_structure_changed' };
    if (options.goal && String(options.goal).trim() !== run.goal) return { ok: false, error: 'pipeline_goal_conflict' };
    const nodes = await Promise.all(run.nodes.map(node => inspectNode(projectDir, node, pipeline, runId)));
    for (const node of nodes) {
      const incoming = shape.edges.filter(edge => edge.to === node.squad);
      if (incoming.some(edge => !nodes.some(source => source.squad === edge.from && source.status === 'completed'))) {
        // Even an old downstream receipt is stale when a required source is unverified.
        node.status = 'blocked';
      }
    }
    const complete = nodes.every(node => node.status === 'completed');
    const next = nodes.find(node => ['pending', 'prepared', 'incomplete', 'paused_budget'].includes(node.status));
    if (next && sub !== 'status') {
      const nodeDirectory = sessionDirectory(projectDir, next.squad, next.session_id);
      let plan = readPlan(nodeDirectory);
      if (!plan) {
        const incoming = shape.edges.filter(edge => edge.to === next.squad).map(edge => {
          const source = nodes.find(node => node.squad === edge.from);
          return { from_squad: source.squad, from_port: edge.output, to_port: edge.input,
            session_id: source.session_id, deliveries: source.evidence.map(entry => ({ task_id: entry.task_id, ...entry.delivery })) };
        });
        const configured = run.graph.task_plans[next.squad];
        if (configured) {
          const error = validatePlanDependencies(configured);
          if (error || !configured.tasks.length) return { ok: false, error: 'invalid_node_plan', detail: error || 'empty tasks', squad: next.squad };
          const tasks = structuredClone(configured.tasks).map(task => {
            const pending = { ...task, status: 'pending' };
            delete pending.result;
            return pending;
          });
          plan = { session_id: next.session_id, squad_slug: next.squad, goal: run.goal, tasks,
            parallel_groups: { 1: tasks.map(task => task.id) }, decomposition_mode: 'configured' };
        } else {
          plan = await decompose(projectDir, next.squad, run.goal, { sessionId: next.session_id, save: false });
          plan.requires_contract_review = true;
        }
        plan.execution_status = 'prepared';
        plan.pipeline_context = { pipeline, run_id: runId, squad: next.squad, inputs: incoming };
        saveSnapshot(nodeDirectory, plan);
        next.status = 'prepared';
      } else if (plan.pipeline_context?.pipeline !== pipeline || plan.pipeline_context?.run_id !== runId) {
        return { ok: false, error: 'pipeline_session_conflict', squad: next.squad };
      }
      next.requires_contract_review = plan.requires_contract_review === true;
    }
    const result = { ok: true, pipeline, run_id: runId, goal: run.goal,
      status: complete ? 'completed' : next ? next.status === 'pending' ? 'pending' : 'prepared' : nodes.some(node => node.status === 'running') ? 'running' : 'blocked',
      nodes, nextNode: next?.squad || null,
      next_action: next ? next.status === 'pending'
        ? `aioson squad:pipeline . --sub=run --pipeline=${pipeline} --run-id=${runId}`
        : `aioson squad resume . --squad=${next.squad} --session=${next.session_id}` : null };
    logger.log(`Pipeline ${pipeline} / ${runId}: ${result.status}`);
    for (const node of nodes) logger.log(`  ${node.squad}: ${node.status} [${node.session_id}]`);
    if (result.next_action) logger.log(`Next action: ${result.next_action}`);
    if (next?.requires_contract_review) logger.log('Review the generated task contract first; unresolved semantic criteria remain unverified.');
    return result;
  } finally { release?.(); }
}

module.exports = { runPipelineSession };
