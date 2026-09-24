'use strict';

const { openRuntimeDb } = require('./runtime-store');
const { reconcileNoiseState } = require('./neural-chain-noise-projection');
const { listWorkItems, normalizeAgent } = require('./neural-chain-work-items');
const { canonicalAgentId } = require('./agents');
const { loadManifest, resolveChainWorkPolicy } = require('./agent-execution/manifest');

const CHAIN_EXECUTOR_AGENTS = new Set(['dev', 'tester', 'pentester']);
const CHAIN_OBSERVER_AGENTS = new Set(['qa']);

function cleanPromptText(value) {
  return String(value || '').replace(/[\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function formatActivationItem(item, requestedAgent) {
  const ownership = item.claimed_by
    ? `claimed by ${item.claimed_by} until ${item.lease_until || 'lease expiry unknown'}`
    : `claim with \`aioson chain:claim . --id=${item.work_item_id} --agent=${requestedAgent} --json\``;
  return `- ${item.work_item_id} [${item.kind}] ${item.target_path} — ${cleanPromptText(item.reason)}; source: ${item.source_path}; confidence: ${Number(item.confidence).toFixed(2)}; ${ownership}.`;
}

function formatObserverItem(item) {
  const ownership = item.claimed_by
    ? `claimed by ${item.claimed_by} until ${item.lease_until || 'lease expiry unknown'}`
    : `owned by ${item.owner_agent}`;
  return `- ${item.work_item_id} [${item.kind}] ${item.target_path} — ${cleanPromptText(item.reason)}; confidence: ${Number(item.confidence).toFixed(2)}; ${ownership}.`;
}

async function readPolicy(targetDir, featureSlug) {
  if (!featureSlug) return resolveChainWorkPolicy(null);
  const loaded = await loadManifest(targetDir, featureSlug);
  return resolveChainWorkPolicy(loaded.exists && loaded.ok ? loaded.manifest : null);
}

async function buildChainActivationContext(targetDir, {
  agent,
  featureSlug = null,
  limit = 8
} = {}) {
  // Retired ids (`deyvin`, `pair`) resolve to the agent that absorbed them.
  const requestedAgent = canonicalAgentId(agent);
  const isExecutor = CHAIN_EXECUTOR_AGENTS.has(requestedAgent);
  const isObserver = CHAIN_OBSERVER_AGENTS.has(requestedAgent);
  if (!isExecutor && !isObserver) return '';

  let handle;
  try {
    const policy = await readPolicy(targetDir, featureSlug);
    if (!policy.enabled) return '';
    handle = await openRuntimeDb(targetDir, { mustExist: true });
    if (!handle) return '';
    reconcileNoiseState({ db: handle.db, targetDir });
    const items = listWorkItems(handle.db, {
      featureSlug,
      includeUnspecified: Boolean(featureSlug),
      agent: isExecutor ? normalizeAgent(requestedAgent) : null,
      statuses: ['open', 'claimed', 'in_progress', 'blocked'],
      limit
    });
    if (items.length === 0) return '';

    if (isObserver) {
      return [
        '## Neural Chain impact queue — QA oversight',
        '',
        `There ${items.length === 1 ? 'is' : 'are'} ${items.length} unresolved impact item(s) for this feature. QA does not claim or implement them.`,
        '',
        ...items.map(formatObserverItem),
        '',
        'Require the owning agent to resolve every blocking item with concrete evidence, then independently revalidate any correction before acceptance. An impact item is an inspection lead, not proof that code must change.'
      ].join('\n');
    }

    return [
      '## Neural Chain impact queue',
      '',
      `There ${items.length === 1 ? 'is' : 'are'} ${items.length} actionable impact item(s) available for this activation. These are causal inspection tasks, not proof that code must change.`,
      '',
      ...items.map((item) => formatActivationItem(item, requestedAgent)),
      '',
      'Before editing an item, claim it atomically. Inspect the source change and target evidence; use `verified_no_change` when no edit is required. Resolve completed work with `aioson chain:resolve . --id=<NC-id> --agent=' + requestedAgent + ' --token=<claim-token> --outcome=<fixed|verified-no-change|false-positive|obsolete> --evidence="<tests or inspection evidence>"`. Do not touch an item claimed by another run.'
    ].join('\n');
  } catch {
    return '';
  } finally {
    if (handle && handle.db) handle.db.close();
  }
}

async function inspectChainHandoffGate(targetDir, { featureSlug, agent } = {}) {
  const requestedAgent = normalizeAgent(agent);
  if (!featureSlug || requestedAgent !== 'dev') {
    return { ok: true, skipped: true, reason: 'not_dev_feature_handoff', items: [] };
  }

  let handle;
  try {
    const policy = await readPolicy(targetDir, featureSlug);
    if (!policy.enabled || !policy.block_handoff_on_actionable) {
      return { ok: true, skipped: true, reason: 'policy_not_blocking', items: [], policy };
    }
    handle = await openRuntimeDb(targetDir, { mustExist: true });
    if (!handle) return { ok: true, skipped: true, reason: 'runtime_db_missing', items: [], policy };
    reconcileNoiseState({ db: handle.db, targetDir });
    const items = listWorkItems(handle.db, {
      featureSlug,
      includeUnspecified: true,
      agent: 'dev',
      statuses: ['open', 'claimed', 'in_progress', 'blocked'],
      limit: 50
    });
    return {
      ok: items.length === 0,
      skipped: false,
      reason: items.length === 0 ? null : 'actionable_chain_work',
      items,
      policy
    };
  } catch {
    // Neural Chain remains best-effort when its store is unavailable. A queue
    // that can be read and contains work is blocking; infrastructure failure is
    // reported by its own diagnostics and must not corrupt workflow state.
    return { ok: true, skipped: true, reason: 'chain_unavailable', items: [] };
  } finally {
    if (handle && handle.db) handle.db.close();
  }
}

module.exports = {
  CHAIN_EXECUTOR_AGENTS,
  CHAIN_OBSERVER_AGENTS,
  buildChainActivationContext,
  formatActivationItem,
  formatObserverItem,
  inspectChainHandoffGate
};
