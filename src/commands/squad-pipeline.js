'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const {
  openRuntimeDb,
  runtimeStoreExists,
  listPipelines,
  getPipelineDAG,
  getTopologicalOrder
} = require('../runtime-store');
const { resolveTargetDir } = require('../lib/project-root');
const { runPipelineSession } = require('../squad/pipeline-sessions');

// Handoff transport state is not evidence that a node's output was accepted.
function classifyNodes(db, pipelineSlug, order, edges) {
  const handoffs = db.prepare('SELECT * FROM squad_handoffs WHERE pipeline_slug = ? ORDER BY created_at DESC, rowid DESC').all(pipelineSlug);
  const latest = edge => handoffs.find(h => h.from_squad === edge.source_squad
    && h.from_port === edge.source_port && h.to_squad === edge.target_squad
    && h.to_port === edge.target_port);
  const usable = handoff => {
    if (!handoff || !['pending', 'consumed'].includes(handoff.status)) return false;
    try { return JSON.parse(handoff.payload_json)?.skipped !== true; } catch { return false; }
  };
  const nodeStatus = {};
  for (const slug of order) {
    const outgoing = edges.filter(edge => edge.source_squad === slug);
    const incoming = edges.filter(edge => edge.target_squad === slug);
    const outputs = outgoing.map(latest);
    const inputs = incoming.map(latest);
    const skipped = outputs.length > 0 && outputs.every(h => {
      try { return JSON.parse(h?.payload_json)?.skipped === true; } catch { return false; }
    });
    if (skipped) nodeStatus[slug] = 'skipped';
    else if (outputs.length && outputs.every(usable)) nodeStatus[slug] = 'produced';
    else if (!inputs.every(usable)) nodeStatus[slug] = 'blocked';
    else if (inputs.length && inputs.every(h => h.status === 'consumed')) nodeStatus[slug] = 'unverified';
    else nodeStatus[slug] = 'pending';
  }
  return { nodeStatus, handoffs };
}

function findNextPendingNode(order, nodeStatus) {
  return order.find(slug => nodeStatus[slug] === 'pending') || null;
}

function findSquadOrchestratorAgent(projectDir, squadSlug) {
  // Convention: squad orchestrator is at .aioson/squads/{slug}/agents/{slug}-orchestrator.md
  // or the first agent in the squad
  return `@${squadSlug}-orchestrator`;
}

async function requirePipelineSlug(slugArg, logger) {
  if (!slugArg) {
    logger.error('Usage: aioson squad:pipeline [path] --sub=run --pipeline=<slug>');
    return null;
  }
  return slugArg;
}

async function runSquadPipeline({ args = [], options = {}, logger = console } = {}) {
  const projectDir = resolveTargetDir(args);
  const subcommand = options.sub || args[1] || 'list';
  const slugArg = options.pipeline || args[2];

  const hasDb = await runtimeStoreExists(projectDir);
  if (!hasDb) {
    logger.error('Runtime store not initialized. Run: aioson runtime:init .');
    return { ok: false, error: 'runtime_not_initialized' };
  }

  const result = await openRuntimeDb(projectDir, { mustExist: true });
  if (!result) {
    logger.error('Could not open runtime store.');
    return { ok: false, error: 'db_open_failed' };
  }
  const { db } = result;

  try {
    if (options['run-id']) {
      const dag = getPipelineDAG(db, slugArg);
      if (!dag) return { ok: false, error: 'not_found' };
      const order = getTopologicalOrder(db, slugArg);
      if (!order) return { ok: false, error: 'cycle_detected' };
      return await runPipelineSession(projectDir, dag, order, { ...options, sub: subcommand }, logger);
    }
    if (subcommand === 'list') {
      const pipelines = listPipelines(db);
      if (pipelines.length === 0) {
        logger.log('No pipelines found. Use @squad pipeline create <name> to prepare one.');
        return { ok: true, pipelines: [] };
      }
      logger.log(`Pipelines (${pipelines.length}):`);
      for (const p of pipelines) {
        logger.log(`  ${p.slug}  [${p.status}]  ${p.name || ''}`);
      }
      return { ok: true, pipelines };
    }

    if (subcommand === 'show') {
      if (!slugArg) {
        logger.error('Usage: aioson squad:pipeline [path] --sub=show --pipeline=<slug>');
        return { ok: false, error: 'missing_slug' };
      }
      const dag = getPipelineDAG(db, slugArg);
      if (!dag) {
        logger.error(`Pipeline not found: ${slugArg}`);
        return { ok: false, error: 'not_found' };
      }
      const order = getTopologicalOrder(db, slugArg);
      logger.log(`Pipeline: ${dag.pipeline.name || dag.pipeline.slug}`);
      logger.log(`Status: ${dag.pipeline.status}  Trigger: ${dag.pipeline.trigger_mode}`);
      logger.log(`Nodes: ${dag.nodes.length}  Edges: ${dag.edges.length}`);
      if (order) {
        logger.log(`Topological order: ${order.join(' → ')}`);
      } else {
        logger.log('⚠️  Cycle detected — invalid pipeline.');
      }
      for (const edge of dag.edges) {
        logger.log(`  [${edge.source_squad}:${edge.source_port}] → [${edge.target_squad}:${edge.target_port}]`);
      }
      return { ok: true, dag, topologicalOrder: order };
    }

    if (subcommand === 'status') {
      if (!slugArg) {
        logger.error('Usage: aioson squad:pipeline [path] --sub=status --pipeline=<slug>');
        return { ok: false, error: 'missing_slug' };
      }
      const dag = getPipelineDAG(db, slugArg);
      if (!dag) {
        logger.error(`Pipeline not found: ${slugArg}`);
        return { ok: false, error: 'not_found' };
      }
      const handoffs = db
        .prepare('SELECT * FROM squad_handoffs WHERE pipeline_slug = ? ORDER BY created_at DESC')
        .all(slugArg);
      const pending = handoffs.filter(h => h.status === 'pending').length;
      const consumed = handoffs.filter(h => h.status === 'consumed').length;
      const failed = handoffs.filter(h => h.status === 'failed').length;
      logger.log(`Pipeline: ${dag.pipeline.slug}  Status: ${dag.pipeline.status}`);
      logger.log(`Handoffs — pending: ${pending}  consumed: ${consumed}  failed: ${failed}`);
      return { ok: true, pipeline: dag.pipeline, handoffs: { pending, consumed, failed } };
    }

    // --- NEW: run (guided mode) ---
    if (subcommand === 'run' || subcommand === 'continue') {
      const slug = await requirePipelineSlug(slugArg, logger);
      if (!slug) return { ok: false, error: 'missing_slug' };

      const dag = getPipelineDAG(db, slug);
      if (!dag) {
        logger.error(`Pipeline not found: ${slug}`);
        return { ok: false, error: 'not_found' };
      }

      const order = getTopologicalOrder(db, slug);
      if (!order) {
        logger.error('Cycle detected in pipeline — cannot run.');
        return { ok: false, error: 'cycle_detected' };
      }

      const { nodeStatus, handoffs } = classifyNodes(db, slug, order, dag.edges);

      // Show pipeline progress
      logger.log('');
      logger.log(`Pipeline: ${dag.pipeline.name || dag.pipeline.slug}`);
      logger.log(`Mode: guided (the system suggests, you execute)`);
      logger.log('');

      logger.log('Progress:');
      for (const nodeSlugg of order) {
        const status = nodeStatus[nodeSlugg];
        const icon = status === 'completed' ? '[v]'
          : status === 'produced' ? '[~]'
          : '[>]';
        // Only mark the first pending as [>], rest as [ ]
        const displayIcon = status === 'pending'
          ? (nodeSlugg === findNextPendingNode(order, nodeStatus) ? '[>]' : '[ ]')
          : icon;
        logger.log(`  ${displayIcon} ${nodeSlugg} (${status})`);
      }
      logger.log('');

      // Find next node to activate
      const nextNode = findNextPendingNode(order, nodeStatus);

      if (!nextNode) {
        const status = Object.values(nodeStatus).some(value => value === 'unverified' || value === 'produced') ? 'unverified' : 'blocked';
        logger.log('No ready node. Verify execution evidence; handoff transport does not prove pipeline completion.');
        return { ok: true, pipeline: slug, status, nextNode: null, nodeStatus };
      }

      // Guidance is read-only: the executing consumer owns acknowledgement.
      const pendingIncoming = handoffs.filter(h => h.to_squad === nextNode && h.status === 'pending'
        && dag.edges.some(edge => edge.source_squad === h.from_squad && edge.source_port === h.from_port
          && edge.target_squad === h.to_squad && edge.target_port === h.to_port));
      logger.log('Prepared guidance only; no squad was executed and no handoff was consumed.');

      const orchestratorAgent = findSquadOrchestratorAgent(projectDir, nextNode);
      logger.log(`Next: activate squad "${nextNode}"`);
      logger.log(`  Agent: ${orchestratorAgent}`);
      logger.log(`  Command: aioson agent ${orchestratorAgent} --tool=claude`);
      logger.log('');
      logger.log('After the squad completes its work, run:');
      logger.log(`  aioson squad:pipeline . --sub=run --pipeline=${slug}`);

      return {
        ok: true,
        pipeline: slug,
        status: 'prepared',
        incomingHandoffIds: pendingIncoming.map(h => h.id),
        nextNode,
        orchestratorAgent,
        nodeStatus
      };
    }

    // --- NEW: skip ---
    if (subcommand === 'skip') {
      const slug = await requirePipelineSlug(slugArg, logger);
      if (!slug) return { ok: false, error: 'missing_slug' };

      const dag = getPipelineDAG(db, slug);
      if (!dag) {
        logger.error(`Pipeline not found: ${slug}`);
        return { ok: false, error: 'not_found' };
      }

      const order = getTopologicalOrder(db, slug);
      if (!order) {
        logger.error('Cycle detected — cannot skip.');
        return { ok: false, error: 'cycle_detected' };
      }

      const { nodeStatus } = classifyNodes(db, slug, order, dag.edges);
      const nextNode = findNextPendingNode(order, nodeStatus);

      if (!nextNode) {
        logger.log('No pending node to skip.');
        return { ok: true, pipeline: slug, skipped: null };
      }

      // Create synthetic handoffs for all outgoing edges of the skipped node
      const outEdges = dag.edges.filter(e => e.source_squad === nextNode);
      if (!outEdges.length) {
        logger.error('Cannot record a terminal skip without an execution receipt; no state changed.');
        return { ok: false, error: 'skip_requires_receipt', pipeline: slug, node: nextNode };
      }
      const insertHandoff = db.prepare(`
        INSERT INTO squad_handoffs (id, pipeline_slug, from_squad, from_port, to_squad, to_port, payload_json, status, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?)
      `);

      for (const edge of outEdges) {
        const id = `skip-${nextNode}-${edge.target_squad}-${Date.now()}`;
        insertHandoff.run(
          id,
          slug,
          edge.source_squad,
          edge.source_port,
          edge.target_squad,
          edge.target_port,
          JSON.stringify({ skipped: true, reason: 'Node skipped by user' }),
          new Date().toISOString()
        );
      }

      logger.log(`Skipped node: ${nextNode}`);
      if (outEdges.length > 0) {
        logger.log(`Created ${outEdges.length} synthetic handoff(s) for downstream nodes.`);
      }
      logger.log('');
      logger.log('Run again to see the next node:');
      logger.log(`  aioson squad:pipeline . --sub=run --pipeline=${slug}`);

      return { ok: true, pipeline: slug, skipped: nextNode };
    }

    logger.error(`Unknown subcommand: ${subcommand}. Available: list, show, status, run, continue, skip`);
    return { ok: false, error: 'unknown_subcommand' };
  } finally {
    db.close();
  }
}

module.exports = { runSquadPipeline };
