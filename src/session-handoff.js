'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const { exists, ensureDir } = require('./utils');

const HANDOFF_RELATIVE_PATH = '.aioson/context/last-handoff.json';
const HANDOFF_PROTOCOL_RELATIVE_PATH = '.aioson/context/handoff-protocol.json';

// handoff-protocol.json schema_version for `artifact_uris`:
// v1 (legacy) — array of strings; v2 — array of {path, kind, agent, added_at}.
// Writers always emit v2; readers coerce v1 transparently.
const ARTIFACT_KINDS = Object.freeze([
  'prd',
  'requirements',
  'spec',
  'plan',
  'dossier',
  'code',
  'test',
  'manifest',
  'conformance',
  'research',
  'other'
]);

function coerceArtifactUri(item, fallbackAgent) {
  if (typeof item === 'string') {
    if (!item.trim()) return null;
    return {
      path: item,
      kind: 'other',
      agent: fallbackAgent || 'unknown',
      added_at: null
    };
  }
  if (item && typeof item === 'object' && typeof item.path === 'string' && item.path.trim()) {
    const kind = ARTIFACT_KINDS.includes(item.kind) ? item.kind : 'other';
    const agent = typeof item.agent === 'string' && item.agent.trim()
      ? item.agent
      : (fallbackAgent || 'unknown');
    const addedAt = typeof item.added_at === 'string' && item.added_at.trim()
      ? item.added_at
      : null;
    return { path: item.path, kind, agent, added_at: addedAt };
  }
  return null;
}

function coerceArtifactUris(uris, fallbackAgent) {
  if (!Array.isArray(uris)) return [];
  return uris
    .map((item) => coerceArtifactUri(item, fallbackAgent))
    .filter(Boolean);
}

async function writeHandoff(targetDir, payload) {
  const handoffPath = path.join(targetDir, HANDOFF_RELATIVE_PATH);
  const protocolPath = path.join(targetDir, HANDOFF_PROTOCOL_RELATIVE_PATH);
  await ensureDir(path.dirname(handoffPath));
  const handoff = {
    version: 1,
    session_ended_at: new Date().toISOString(),
    last_agent: payload.lastAgent || null,
    last_stage: payload.lastStage || null,
    what_was_done: payload.whatWasDone || null,
    what_comes_next: payload.whatComesNext || null,
    next_agent: payload.nextAgent || null,
    open_decisions: Array.isArray(payload.openDecisions) ? payload.openDecisions : [],
    context_files_updated: Array.isArray(payload.contextFilesUpdated) ? payload.contextFilesUpdated : [],
    workflow_mode: payload.workflowMode || null,
    classification: payload.classification || null,
    feature_slug: payload.featureSlug || null
  };
  await fs.writeFile(handoffPath, `${JSON.stringify(handoff, null, 2)}\n`, 'utf8');

  const protocol = payload.protocol || buildBasicHandoffProtocol(payload);
  await fs.writeFile(protocolPath, `${JSON.stringify(protocol, null, 2)}\n`, 'utf8');

  return {
    handoffPath: HANDOFF_RELATIVE_PATH,
    protocolPath: HANDOFF_PROTOCOL_RELATIVE_PATH,
    handoff,
    protocol
  };
}

async function readHandoff(targetDir) {
  const handoffPath = path.join(targetDir, HANDOFF_RELATIVE_PATH);
  if (!(await exists(handoffPath))) return null;
  try {
    const content = await fs.readFile(handoffPath, 'utf8');
    return JSON.parse(content);
  } catch {
    return null;
  }
}

async function readHandoffProtocol(targetDir) {
  const protocolPath = path.join(targetDir, HANDOFF_PROTOCOL_RELATIVE_PATH);
  if (!(await exists(protocolPath))) return null;
  try {
    const content = await fs.readFile(protocolPath, 'utf8');
    const parsed = JSON.parse(content);
    if (parsed && typeof parsed === 'object') {
      const fromAgentId = parsed.from && typeof parsed.from === 'object'
        ? parsed.from.agent_id || null
        : null;
      parsed.artifact_uris = coerceArtifactUris(parsed.artifact_uris, fromAgentId);
    }
    return parsed;
  } catch {
    return null;
  }
}

function buildWorkflowHandoff(state, completedStage, nextAgent) {
  const agentLabel = completedStage ? `@${completedStage}` : null;
  const nextLabel = nextAgent ? `@${nextAgent}` : null;

  return {
    lastAgent: agentLabel,
    lastStage: completedStage || null,
    whatWasDone: completedStage
      ? `Stage ${agentLabel} completed.`
      : 'Workflow state updated.',
    whatComesNext: nextLabel
      ? `Next stage: ${nextLabel}`
      : 'Workflow is complete. No pending stages.',
    nextAgent: nextLabel,
    workflowMode: state.mode || null,
    classification: state.classification || null,
    featureSlug: state.featureSlug || null
  };
}

function mapStageToCapability(stageName) {
  const normalized = String(stageName || '').replace(/^@/, '').trim().toLowerCase();
  if (!normalized) return null;

  const map = {
    setup: 'initialize_project_context',
    product: 'define_product_scope',
    analyst: 'analyze_requirements',
    architect: 'design_architecture',
    'ux-ui': 'design_ui_spec',
    pm: 'plan_delivery',
    orchestrator: 'coordinate_parallel_work',
    dev: 'implement_feature',
    pentester: 'adversarial_review',
    qa: 'verify_feature',
    committer: 'prepare_commit'
  };

  return map[normalized] || null;
}

function buildWorkflowHandoffProtocol(state, completedStage, nextAgent, options = {}) {
  const fromAgentId = completedStage || null;
  const toAgentId = nextAgent || null;
  const fromCapability = mapStageToCapability(fromAgentId);
  const toCapability = mapStageToCapability(toAgentId);

  return {
    version: '1.0',
    protocol_id: `hnd-${fromAgentId || 'init'}-${toAgentId || 'end'}-${Date.now()}`,
    created_at: new Date().toISOString(),
    workflow_mode: state.mode || null,
    classification: state.classification || null,
    feature_slug: state.featureSlug || null,
    from: {
      agent_id: fromAgentId,
      capability_transferred: fromCapability
    },
    to: {
      agent_id: toAgentId,
      capability_required: toCapability
    },
    capabilities_transferred: fromCapability ? [fromCapability] : [],
    artifact_uris: coerceArtifactUris(options.artifactUris, fromAgentId),
    gate_status: options.gateStatus && typeof options.gateStatus === 'object' ? options.gateStatus : {},
    autonomy_mode: options.autonomyMode || null,
    validation: {
      handoff_contract_ok: options.handoffContractOk !== false,
      technical_gate_ok: options.technicalGateOk !== false,
      validated_at: new Date().toISOString()
    }
  };
}

function buildBasicHandoffProtocol(payload) {
  const fromAgentId = payload.lastStage ? String(payload.lastStage).replace(/^@/, '') : null;
  const toAgentId = payload.nextAgent ? String(payload.nextAgent).replace(/^@/, '') : null;
  const fromCapability = mapStageToCapability(fromAgentId);
  return {
    version: '1.0',
    protocol_id: `hnd-${fromAgentId || 'init'}-${toAgentId || 'end'}-${Date.now()}`,
    created_at: new Date().toISOString(),
    workflow_mode: payload.workflowMode || null,
    classification: payload.classification || null,
    feature_slug: payload.featureSlug || null,
    from: {
      agent_id: fromAgentId,
      capability_transferred: fromCapability
    },
    to: {
      agent_id: toAgentId,
      capability_required: mapStageToCapability(toAgentId)
    },
    capabilities_transferred: fromCapability ? [fromCapability] : [],
    artifact_uris: coerceArtifactUris(payload.contextFilesUpdated, fromAgentId),
    gate_status: {},
    autonomy_mode: payload.autonomyMode || null,
    validation: {
      handoff_contract_ok: true,
      technical_gate_ok: true,
      validated_at: new Date().toISOString()
    }
  };
}

function buildRuntimeLogHandoff(agentName, message, summary) {
  return {
    lastAgent: agentName ? `@${agentName.replace(/^@/, '')}` : null,
    lastStage: null,
    whatWasDone: summary || message || 'Agent session completed.',
    whatComesNext: null,
    nextAgent: null
  };
}

module.exports = {
  HANDOFF_RELATIVE_PATH,
  HANDOFF_PROTOCOL_RELATIVE_PATH,
  ARTIFACT_KINDS,
  coerceArtifactUri,
  coerceArtifactUris,
  writeHandoff,
  readHandoff,
  readHandoffProtocol,
  buildWorkflowHandoff,
  buildWorkflowHandoffProtocol,
  buildRuntimeLogHandoff
};
