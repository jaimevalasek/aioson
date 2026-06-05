'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const { exists, ensureDir } = require('./utils');

const HANDOFF_RELATIVE_PATH = '.aioson/context/last-handoff.json';
const HANDOFF_PROTOCOL_RELATIVE_PATH = '.aioson/context/handoff-protocol.json';
const CONFIRMATIONS_JSONL = '.aioson/runtime/session-confirmations.jsonl';
const DECISION_RATIONALE_MAX = 5;

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

// SF-project-19: artifact_uris paths must stay project-relative so a forged
// handoff cannot point downstream consumers at /etc/passwd or escape via "..".
// Rejects absolute paths and any segment containing "..".
function isSafeArtifactPath(p) {
  if (typeof p !== 'string' || !p.trim()) return false;
  if (path.isAbsolute(p)) return false;
  return !p.split(/[\\/]+/).includes('..');
}

function coerceArtifactUri(item, fallbackAgent) {
  if (typeof item === 'string') {
    if (!isSafeArtifactPath(item)) return null;
    return {
      path: item,
      kind: 'other',
      agent: fallbackAgent || 'unknown',
      added_at: null
    };
  }
  if (item && typeof item === 'object' && isSafeArtifactPath(item.path)) {
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

async function collectDecisionRationale(targetDir) {
  const accPath = path.join(targetDir, CONFIRMATIONS_JSONL);
  try {
    const raw = await fs.readFile(accPath, 'utf8');
    const lines = raw.trim().split('\n').filter(Boolean);
    const entries = [];
    for (const line of lines) {
      try {
        const obj = JSON.parse(line);
        entries.push({
          agent: obj.agent || 'unknown',
          decision: obj.decision || '',
          alternatives_considered: null,
          rationale: obj.quote || null,
          confidence: 'confirmed'
        });
      } catch {
        // skip malformed lines
      }
    }
    // BR-AO-04: FIFO — keep only the last N entries
    return entries.slice(-DECISION_RATIONALE_MAX);
  } catch {
    return [];
  }
}

async function clearConfirmationsAccumulator(targetDir) {
  const accPath = path.join(targetDir, CONFIRMATIONS_JSONL);
  try {
    await fs.unlink(accPath);
  } catch {
    // file may not exist
  }
}

async function writeHandoff(targetDir, payload) {
  const handoffPath = path.join(targetDir, HANDOFF_RELATIVE_PATH);
  const protocolPath = path.join(targetDir, HANDOFF_PROTOCOL_RELATIVE_PATH);
  await ensureDir(path.dirname(handoffPath));

  // M2: collect decision rationale from session confirmations
  const sessionRationale = await collectDecisionRationale(targetDir);
  const existingRationale = Array.isArray(payload.decisionRationale) ? payload.decisionRationale : [];
  const mergedRationale = [...existingRationale, ...sessionRationale].slice(-DECISION_RATIONALE_MAX);

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
    feature_slug: payload.featureSlug || null,
    optional_handoffs: Array.isArray(payload.optionalHandoffs) ? payload.optionalHandoffs : [],
    decision_rationale: mergedRationale.length > 0 ? mergedRationale : undefined
  };
  await fs.writeFile(handoffPath, `${JSON.stringify(handoff, null, 2)}\n`, 'utf8');

  // Clear accumulator after writing to handoff
  await clearConfirmationsAccumulator(targetDir);

  const protocol = payload.protocol || buildBasicHandoffProtocol(payload);
  await fs.writeFile(protocolPath, `${JSON.stringify(protocol, null, 2)}\n`, 'utf8');

  return {
    handoffPath: HANDOFF_RELATIVE_PATH,
    protocolPath: HANDOFF_PROTOCOL_RELATIVE_PATH,
    handoff,
    protocol
  };
}

// SF-project-10: stale-handoff guard. Default TTL is 7 days; a feature_slug
// mismatch against dev-state.md is also treated as stale even when fresh.
// Both checks can be skipped via options for callers (tests, audits) that need
// the raw read.
const DEFAULT_HANDOFF_TTL_MS = 7 * 24 * 60 * 60 * 1000;

async function readActiveFeatureFromDevState(targetDir) {
  const devStatePath = path.join(targetDir, '.aioson/context/dev-state.md');
  if (!(await exists(devStatePath))) return null;
  try {
    const text = await fs.readFile(devStatePath, 'utf8');
    if (!text.startsWith('---')) return null;
    const closing = text.indexOf('\n---', 3);
    if (closing === -1) return null;
    const front = text.slice(3, closing);
    const match = front.match(/^\s*active_feature:\s*(.+?)\s*$/m);
    return match ? match[1].trim().replace(/^["']|["']$/g, '') : null;
  } catch {
    return null;
  }
}

async function readHandoff(targetDir, options = {}) {
  const handoffPath = path.join(targetDir, HANDOFF_RELATIVE_PATH);
  if (!(await exists(handoffPath))) return null;
  let parsed;
  try {
    const content = await fs.readFile(handoffPath, 'utf8');
    parsed = JSON.parse(content);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object') return null;

  const skipStaleCheck = options.skipStaleCheck === true;
  if (skipStaleCheck) return parsed;

  const ttlMs = Number.isFinite(options.ttlMs) ? options.ttlMs : DEFAULT_HANDOFF_TTL_MS;
  const sessionEndedAt = Date.parse(parsed.session_ended_at || '');
  if (Number.isFinite(sessionEndedAt) && Date.now() - sessionEndedAt > ttlMs) {
    return null;
  }

  if (parsed.feature_slug) {
    const activeFeature = await readActiveFeatureFromDevState(targetDir);
    if (activeFeature && activeFeature !== parsed.feature_slug) {
      return null;
    }
  }

  return parsed;
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
  const optionalHandoffs = buildOptionalWorkflowHandoffs(state, completedStage);

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
    featureSlug: state.featureSlug || null,
    optionalHandoffs
  };
}

function buildOptionalWorkflowHandoffs(state, completedStage) {
  const stage = String(completedStage || '').replace(/^@/, '').trim().toLowerCase();
  const featureArg = state && state.featureSlug ? ` --feature=${state.featureSlug}` : '';
  if (stage === 'dev') {
    return [
      {
        agent: '@scope-check',
        mode: 'post-dev',
        command: `aioson workflow:next . --agent=scope-check --scope-mode=post-dev${featureArg}`,
        reason: 'Optional drift check: compare the approved plan against the implementation diff before QA when behavior, files, or scope changed unexpectedly.'
      }
    ];
  }
  if (stage === 'qa' || stage === 'tester' || stage === 'pentester') {
    return [
      {
        agent: '@scope-check',
        mode: 'post-fix',
        command: `aioson workflow:next . --agent=scope-check --scope-mode=post-fix${featureArg}`,
        reason: 'Optional post-fix check: use only when verification or security corrections changed behavior or product scope.'
      }
    ];
  }
  return [];
}

function mapStageToCapability(stageName) {
  const normalized = String(stageName || '').replace(/^@/, '').trim().toLowerCase();
  if (!normalized) return null;

  const map = {
    setup: 'initialize_project_context',
    product: 'define_product_scope',
    analyst: 'analyze_requirements',
    'scope-check': 'check_scope_alignment',
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
  CONFIRMATIONS_JSONL,
  DECISION_RATIONALE_MAX,
  ARTIFACT_KINDS,
  coerceArtifactUri,
  coerceArtifactUris,
  collectDecisionRationale,
  writeHandoff,
  readHandoff,
  readHandoffProtocol,
  buildWorkflowHandoff,
  buildWorkflowHandoffProtocol,
  buildRuntimeLogHandoff
};
