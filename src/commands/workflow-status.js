'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const { exists } = require('../utils');
const { validateProjectContextFile } = require('../context');
const { readHandoff, readHandoffProtocol } = require('../session-handoff');
const { runtimeStoreExists, openRuntimeDb, listPipelines } = require('../runtime-store');
const { readAutonomyProtocol, resolveEffectiveMode } = require('../autonomy-policy');
const { readAgentManifest, buildAgentCapabilitySummary } = require('../agent-manifests');
const { validateHandoffContract } = require('../handoff-contract');
const { loadOrCreateState } = require('./workflow-next');

const STATE_RELATIVE_PATH = '.aioson/context/workflow.state.json';

async function scanSquads(targetDir) {
  const squadsDir = path.join(targetDir, '.aioson/squads');
  if (!(await exists(squadsDir))) return [];

  try {
    const entries = await fs.readdir(squadsDir, { withFileTypes: true });
    const squads = [];
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const manifestPath = path.join(squadsDir, entry.name, 'squad.manifest.json');
      const agentsDir = path.join(squadsDir, entry.name, 'agents');
      let agentCount = 0;
      try {
        const agents = await fs.readdir(agentsDir);
        agentCount = agents.filter((file) => file.endsWith('.md')).length;
      } catch {
        agentCount = 0;
      }

      let status = 'active';
      try {
        const raw = await fs.readFile(manifestPath, 'utf8');
        const manifest = JSON.parse(raw);
        status = manifest.status || 'active';
      } catch {
        status = 'active';
      }

      squads.push({ slug: entry.name, agentCount, status });
    }
    return squads;
  } catch {
    return [];
  }
}

async function scanGenomes(targetDir) {
  const genomesDir = path.join(targetDir, '.aioson/genomes');
  if (!(await exists(genomesDir))) return 0;
  try {
    const entries = await fs.readdir(genomesDir);
    return entries.filter((file) => file.endsWith('.md') || file.endsWith('.json')).length;
  } catch {
    return 0;
  }
}

async function getPipelineCount(targetDir) {
  const hasDb = await runtimeStoreExists(targetDir);
  if (!hasDb) return { total: 0, active: 0 };
  const handle = await openRuntimeDb(targetDir, { mustExist: true });
  if (!handle) return { total: 0, active: 0 };
  try {
    const pipelines = listPipelines(handle.db);
    const active = pipelines.filter((pipeline) => pipeline.status === 'active').length;
    return { total: pipelines.length, active };
  } finally {
    handle.db.close();
  }
}

function getFocusStage(state) {
  if (!state || typeof state !== 'object') return null;
  return state.current || state.next || null;
}

function getQueuedNextStage(state) {
  if (!state || typeof state !== 'object') return null;
  if (state.detour && state.detour.active) return state.detour.returnTo || null;
  if (state.current && state.next && state.current !== state.next) return state.next;
  return null;
}

async function preferExistingArtifact(targetDir, candidates) {
  for (const candidate of candidates.filter(Boolean)) {
    if (await exists(path.join(targetDir, candidate))) return candidate;
  }
  return candidates.filter(Boolean)[0];
}

async function buildKeyArtifacts(targetDir, state) {
  const featureSlug = state && state.featureSlug ? String(state.featureSlug) : null;
  const designDocFile = await preferExistingArtifact(targetDir, featureSlug
    ? [`.aioson/context/design-doc-${featureSlug}.md`, '.aioson/context/design-doc.md']
    : ['.aioson/context/design-doc.md']);
  const readinessFile = await preferExistingArtifact(targetDir, featureSlug
    ? [`.aioson/context/readiness-${featureSlug}.md`, '.aioson/context/readiness.md']
    : ['.aioson/context/readiness.md']);
  const artifacts = [
    {
      id: 'project_context',
      label: 'project.context.md',
      file: '.aioson/context/project.context.md'
    },
    {
      id: 'prd',
      label: featureSlug ? `prd-${featureSlug}.md` : 'prd.md',
      file: featureSlug ? `.aioson/context/prd-${featureSlug}.md` : '.aioson/context/prd.md'
    },
    {
      id: 'analysis',
      label: featureSlug ? `requirements-${featureSlug}.md` : 'discovery.md',
      file: featureSlug ? `.aioson/context/requirements-${featureSlug}.md` : '.aioson/context/discovery.md'
    },
    {
      id: 'architecture',
      label: 'architecture.md',
      file: '.aioson/context/architecture.md'
    },
    {
      id: 'design_doc',
      label: path.basename(designDocFile),
      file: designDocFile
    },
    {
      id: 'readiness',
      label: path.basename(readinessFile),
      file: readinessFile
    },
    {
      id: 'ui_spec',
      label: 'ui-spec.md',
      file: '.aioson/context/ui-spec.md'
    },
    {
      id: 'workflow_state',
      label: 'workflow.state.json',
      file: STATE_RELATIVE_PATH
    },
    {
      id: 'last_handoff',
      label: 'last-handoff.json',
      file: '.aioson/context/last-handoff.json'
    },
    {
      id: 'handoff_protocol',
      label: 'handoff-protocol.json',
      file: '.aioson/context/handoff-protocol.json'
    }
  ];

  if (featureSlug) {
    artifacts.splice(3, 0, {
      id: 'spec',
      label: `spec-${featureSlug}.md`,
      file: `.aioson/context/spec-${featureSlug}.md`
    });
  }

  const withPresence = [];
  for (const artifact of artifacts) {
    withPresence.push({
      ...artifact,
      exists: await exists(path.join(targetDir, artifact.file))
    });
  }
  return withPresence;
}

function extractPendingGates(contractCheck) {
  if (!contractCheck || !Array.isArray(contractCheck.missing)) return [];
  const gates = [];
  for (const item of contractCheck.missing) {
    const match = /^gate\s+([A-Z])/i.exec(String(item));
    if (match) gates.push(match[1].toUpperCase());
  }
  return Array.from(new Set(gates));
}

function isGateCPlanBlocker(contractCheck) {
  if (!contractCheck || !Array.isArray(contractCheck.missing)) return false;
  return contractCheck.missing.some((item) => {
    const text = String(item || '').toLowerCase();
    return (
      text.includes('gate c not approved') ||
      text.includes('gate_plan_not_approved') ||
      text.includes('implementation-plan')
    );
  });
}

function buildSuggestion({
  contextValid,
  state,
  tool,
  focusStage,
  contractCheck
}) {
  const safeTool = String(tool || 'codex').trim().toLowerCase();
  if (!contextValid) {
    return {
      action: 'initialize_project',
      agent: 'setup',
      command: `aioson workflow:next . --tool=${safeTool}`,
      reason: 'Project context is missing or invalid.'
    };
  }

  if (!state || !Array.isArray(state.sequence)) {
    return {
      action: 'initialize_workflow',
      agent: null,
      command: `aioson workflow:next . --tool=${safeTool}`,
      reason: 'Workflow state is not initialized yet.'
    };
  }

  if (!focusStage) {
    return {
      action: 'workflow_complete',
      agent: null,
      command: null,
      reason: 'The workflow has no pending stage.'
    };
  }

  if (!state.current) {
    return {
      action: 'activate_stage',
      agent: focusStage,
      command: `aioson workflow:next . --tool=${safeTool}`,
      reason: `Next official stage is @${focusStage}.`
    };
  }

  if (contractCheck && Array.isArray(contractCheck.missing) && contractCheck.missing.length > 0) {
    if (focusStage === 'dev' && state.mode === 'feature' && state.featureSlug && isGateCPlanBlocker(contractCheck)) {
      return {
        action: 'resolve_gate_c',
        agent: 'pm',
        command: `aioson workflow:next . --agent=pm --tool=${safeTool}`,
        reason: `@dev is blocked by Gate C: implementation plan is missing or not approved. Run @pm first.`,
        details: [...contractCheck.missing]
      };
    }

    return {
      action: 'continue_stage',
      agent: focusStage,
      command: `aioson workflow:next . --agent=${focusStage} --tool=${safeTool}`,
      reason: `@${focusStage} still has pending deliverables before handoff.`,
      details: [...contractCheck.missing]
    };
  }

  const autoHealFlag = focusStage === 'dev' || focusStage === 'qa' ? ' --auto-heal' : '';
  return {
    action: 'complete_stage',
    agent: focusStage,
    command: `aioson workflow:next . --complete=${focusStage}${autoHealFlag} --tool=${safeTool}`,
    reason: `@${focusStage} appears ready for the next handoff.`,
    details: contractCheck && Array.isArray(contractCheck.warnings) ? [...contractCheck.warnings] : []
  };
}

function timeSince(isoString) {
  const now = Date.now();
  const then = new Date(isoString).getTime();
  const diffMs = now - then;
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}

async function runWorkflowStatus({ args, options, logger, t }) {
  const targetDir = path.resolve(process.cwd(), args[0] || '.');
  const tool = options.tool || 'codex';

  let state = null;
  let stateCreated = false;
  try {
    const loaded = await loadOrCreateState(targetDir, options);
    state = loaded.state;
    stateCreated = loaded.created;
  } catch {
    const statePath = path.join(targetDir, STATE_RELATIVE_PATH);
    try {
      const raw = await fs.readFile(statePath, 'utf8');
      state = JSON.parse(raw);
    } catch {
      state = null;
    }
  }

  const context = await validateProjectContextFile(targetDir);
  const projectName = (context.data && context.data.project_name) || path.basename(targetDir);
  const classification = (state && state.classification)
    || (context.data && context.data.classification)
    || 'unknown';
  const mode = (state && state.mode) || 'project';
  const featureSlug = (state && state.featureSlug) || null;
  const focusStage = getFocusStage(state);
  const queuedNextStage = getQueuedNextStage(state);

  const handoff = await readHandoff(targetDir);
  const handoffProtocol = await readHandoffProtocol(targetDir);
  const artifacts = await buildKeyArtifacts(targetDir, state);
  const squads = await scanSquads(targetDir);
  const genomeCount = await scanGenomes(targetDir);
  const pipelines = await getPipelineCount(targetDir);

  let effectiveMode = null;
  let capabilitySummary = '';
  if (focusStage) {
    const protocol = await readAutonomyProtocol(targetDir);
    const manifest = await readAgentManifest(targetDir, focusStage);
    effectiveMode = resolveEffectiveMode({
      protocol,
      tool,
      agentId: focusStage,
      manifest
    });
    capabilitySummary = buildAgentCapabilitySummary(manifest, tool);
  }

  const contractCheck = focusStage
    ? await validateHandoffContract(targetDir, state, focusStage)
    : { ok: true, missing: [], warnings: [] };
  const pendingGates = extractPendingGates(contractCheck);
  const suggestion = buildSuggestion({
    contextValid: context.valid,
    state,
    tool,
    focusStage,
    contractCheck
  });

  if (options.suggest) {
    logger.log(`Suggested next action: ${suggestion.action}${suggestion.agent ? ` (@${suggestion.agent})` : ''}`);
    logger.log(`Reason: ${suggestion.reason}`);
    if (suggestion.command) {
      logger.log('Command:');
      logger.log(`  ${suggestion.command}`);
    }
    if (Array.isArray(suggestion.details) && suggestion.details.length > 0) {
      logger.log('Details:');
      for (const detail of suggestion.details) logger.log(`  - ${detail}`);
    }
  } else {
    logger.log('');
    logger.log(`Project: ${projectName} (${classification})`);
    logger.log(`Mode: ${mode}${featureSlug ? ` — feature: ${featureSlug}` : ''}`);
    logger.log(`Tool: ${String(tool).toLowerCase()}`);
    if (stateCreated) logger.log('State: initialized from current artifacts');
    logger.log('');

    if (state && state.sequence) {
      const completed = new Set(state.completed || []);
      const skipped = new Set(state.skipped || []);
      const current = getFocusStage(state);

      logger.log('Workflow:');
      for (const stage of state.sequence) {
        let marker = 'pending';
        if (completed.has(stage)) marker = 'done';
        else if (skipped.has(stage)) marker = 'skip';
        else if (stage === current) marker = 'now';

        const icon = marker === 'done'
          ? '[v]'
          : marker === 'skip'
            ? '[-]'
            : marker === 'now'
              ? '[>]'
              : '[ ]';
        logger.log(`  ${icon} @${stage}`);
      }
      if (state.detour && state.detour.active) {
        logger.log(`  Detour: @${state.detour.agent} (returns to @${state.detour.returnTo})`);
      }
      logger.log('');
    }

    logger.log('Current Status:');
    logger.log(`  Active stage: ${focusStage ? `@${focusStage}` : 'none'}`);
    logger.log(`  Queued next: ${queuedNextStage ? `@${queuedNextStage}` : 'none'}`);
    logger.log(`  Autonomy mode: ${effectiveMode || 'n/a'}`);
    logger.log(`  Pending gate: ${pendingGates.length > 0 ? pendingGates.join(', ') : 'none'}`);
    logger.log(`  Handoff contract: ${contractCheck.ok ? 'ready' : 'blocked'}`);
    if (capabilitySummary) logger.log(`  Capabilities: ${capabilitySummary}`);
    logger.log('');

    logger.log('Artifacts:');
    for (const artifact of artifacts) {
      const icon = artifact.exists ? '[v]' : '[ ]';
      logger.log(`  ${icon} ${artifact.label}`);
    }
    logger.log('');

    if (pipelines.total > 0) {
      logger.log(`Pipelines: ${pipelines.total} (${pipelines.active} active)`);
      logger.log('');
    }

    if (squads.length > 0) {
      logger.log(`Squads (${squads.length}):`);
      for (const squad of squads) {
        logger.log(`  ${squad.slug} — ${squad.agentCount} agents [${squad.status}]`);
      }
      logger.log('');
    }

    if (genomeCount > 0) {
      logger.log(`Genomes: ${genomeCount}`);
      logger.log('');
    }

    if (handoff) {
      logger.log('Last handoff:');
      if (handoff.last_agent) logger.log(`  Agent: ${handoff.last_agent}`);
      if (handoff.what_was_done) logger.log(`  Done: ${handoff.what_was_done}`);
      if (handoff.what_comes_next) logger.log(`  Next: ${handoff.what_comes_next}`);
      if (Array.isArray(handoff.optional_handoffs) && handoff.optional_handoffs.length > 0) {
        logger.log('  Optional handoffs:');
        for (const optional of handoff.optional_handoffs) {
          const label = optional.agent || '@unknown';
          const mode = optional.mode ? ` (${optional.mode})` : '';
          const command = optional.command ? ` — ${optional.command}` : '';
          logger.log(`    - ${label}${mode}${command}`);
        }
      }
      if (handoff.session_ended_at) logger.log(`  When: ${timeSince(handoff.session_ended_at)} ago`);
      logger.log('');
    }

    if (handoffProtocol) {
      logger.log('Handoff protocol:');
      if (handoffProtocol.from && handoffProtocol.from.agent_id) {
        logger.log(`  From: @${handoffProtocol.from.agent_id}`);
      }
      if (handoffProtocol.to && handoffProtocol.to.agent_id) {
        logger.log(`  To: @${handoffProtocol.to.agent_id}`);
      }
      if (handoffProtocol.autonomy_mode) {
        logger.log(`  Autonomy: ${handoffProtocol.autonomy_mode}`);
      }
      if (handoffProtocol.validation) {
        logger.log(
          `  Validation: contract=${handoffProtocol.validation.handoff_contract_ok !== false ? 'ok' : 'failed'}, technical=${handoffProtocol.validation.technical_gate_ok !== false ? 'ok' : 'failed'}`
        );
      }
      logger.log('');
    }

    logger.log('Suggestion:');
    logger.log(`  ${suggestion.reason}`);
    if (suggestion.command) logger.log(`  ${suggestion.command}`);
  }

  return {
    ok: true,
    projectName,
    classification,
    mode,
    featureSlug,
    tool: String(tool).toLowerCase(),
    state,
    stateCreated,
    activeStage: focusStage,
    queuedNextStage,
    effectiveMode,
    capabilitySummary,
    pendingGates,
    contractCheck,
    artifacts,
    squads,
    genomeCount,
    pipelines,
    handoff,
    handoffProtocol,
    suggestion
  };
}

module.exports = { runWorkflowStatus };
