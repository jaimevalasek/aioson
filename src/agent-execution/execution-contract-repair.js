'use strict';

function normalizePath(value) {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().replace(/\\/g, '/').replace(/:\d+(?:-\d+)?$/, '').replace(/^\.\//, '');
  return normalized && !normalized.startsWith('../') && !normalized.startsWith('/') ? normalized : null;
}

function unitFiles(unit) {
  return new Set((unit?.files || []).map(normalizePath).filter(Boolean).map(file => file.toLowerCase()));
}

function ancestorsOf(plan, consumerId) {
  const units = new Map((plan.units || []).map(unit => [unit.id, unit]));
  const ancestors = new Set();
  const visit = id => {
    for (const dependency of units.get(id)?.depends_on || []) {
      if (!units.has(dependency.unit) || ancestors.has(dependency.unit)) continue;
      ancestors.add(dependency.unit);
      visit(dependency.unit);
    }
  };
  visit(consumerId);
  return ancestors;
}

function descendantsOf(plan, producerId) {
  const affected = new Set([producerId]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const unit of plan.units || []) {
      if (affected.has(unit.id) || !(unit.depends_on || []).some(dependency => affected.has(dependency.unit))) continue;
      affected.add(unit.id);
      changed = true;
    }
  }
  return [...affected];
}

// A cross-unit repair request is trusted only as structured data: an
// unflagged lane/integration/orchestrator message must name an exact path
// compiled into the plan. Free-form prose never changes scheduling.
function externalRepairPaths(plan, consumerId, outcome) {
  if (!['failed', 'blocked'].includes(outcome?.kind)) return [];
  const consumer = (plan.units || []).find(unit => unit.id === consumerId);
  if (!consumer) return [];
  const own = unitFiles(consumer);
  const canonical = new Map();
  for (const unit of plan.units || []) for (const file of unit.files || []) {
    const normalized = normalizePath(file);
    if (normalized && !canonical.has(normalized.toLowerCase())) canonical.set(normalized.toLowerCase(), normalized);
  }
  const messages = (outcome.messages || []).filter(message =>
    ['contract_change', 'note'].includes(message?.kind)
    && !message.flagged?.length
    && /^(lane:[^\s]+|unit:[^\s]+|integration|orchestrator)$/.test(String(message.to || ''))
    && Array.isArray(message.paths));
  const paths = messages.flatMap(message => message.paths || [])
    .map(normalizePath)
    .filter(Boolean)
    .filter(file => !own.has(file.toLowerCase()) && canonical.has(file.toLowerCase()));
  return [...new Set(paths.map(file => file.toLowerCase()))].map(lower => canonical.get(lower));
}

function findingPath(finding) {
  const raw = finding?.path || finding?.location;
  if (typeof raw !== 'string' || raw.includes(',')) return null;
  return normalizePath(raw);
}

// A consumer can report several independent failures at once. Once routing
// selects one producer, its retry prompt must carry only that producer's
// defect. Mixed evidence previously sent a missing consumer-owned file to an
// upstream DEV and encouraged an otherwise correct agent to edit outside its
// compiled unit.
function scopedRepairEvidence(outcome, paths) {
  const selected = new Set(paths.map(path => path.toLowerCase()));
  const directFindings = (outcome.findings || []).filter(finding => {
    const path = findingPath(finding);
    return path && selected.has(path.toLowerCase());
  });
  const findings = directFindings.length ? directFindings : (outcome.findings || []);
  const messages = (outcome.messages || []).flatMap(message => {
    const normalized = (message.paths || []).map(normalizePath).filter(Boolean);
    const relevant = normalized.filter(path => selected.has(path.toLowerCase()));
    if (!relevant.length) return [];
    const hasUnrelated = normalized.some(path => !selected.has(path.toLowerCase()));
    return [{
      ...message,
      paths: [...new Set(relevant)],
      text: hasUnrelated
        ? `Downstream contract repair requested for ${[...new Set(relevant)].join(', ')}; use the scoped findings as the failure evidence.`
        : message.text
    }];
  });
  return { findings, messages };
}

// Route a failed consumer to the closest compiled owner of the reported path.
// Explicit ancestors remain authoritative. In continuous mode, shared checks
// (typecheck, build, integration suites) may expose a unique earlier or
// same-wave owner even when the planner omitted a cross-lane edge; the exact
// compiled path is still the authority and later-wave owners are never pulled
// backwards.
function contractRepairTarget(plan, state, consumerId, outcome, continuous = false) {
  const consumer = (plan.units || []).find(unit => unit.id === consumerId);
  if (!consumer) return null;
  const paths = externalRepairPaths(plan, consumerId, outcome);
  if (!paths.length) return null;
  const ancestors = ancestorsOf(plan, consumerId);
  const targets = [];
  for (const repairPath of paths) {
    const compiledOwners = (plan.units || []).filter(unit => unit.id !== consumerId
      && unit.owner === 'lane'
      && (Number(unit.wave) || 0) <= (Number(consumer.wave) || 0)
      && unitFiles(unit).has(repairPath.toLowerCase()));
    const ancestralOwners = compiledOwners.filter(unit => ancestors.has(unit.id));
    const owners = ancestralOwners.length ? ancestralOwners : continuous ? compiledOwners : [];
    if (!owners.length) return null;
    const latestWave = Math.max(...owners.map(unit => Number(unit.wave) || 0));
    const latest = owners.filter(unit => (Number(unit.wave) || 0) === latestWave);
    if (latest.length !== 1) return null;
    targets.push(latest[0]);
  }
  if (!targets.length || targets.some(target => target.id !== targets[0].id)) return null;
  const target = targets[0];
  const current = state.units[target.id];
  const delivered = current?.status === 'passed' && current.qa?.status === 'passed';
  const recoverable = continuous && ['pending', 'running', 'decision_required', 'passed'].includes(current?.status);
  if (!delivered && !recoverable) return null;
  const max = plan.lanes?.[target.lane]?.qa?.max_rework_rounds || 0;
  const contractRepairLimit = continuous ? Math.max(2, max) : 2;
  if ((current.contract_repairs || 0) >= contractRepairLimit) return null;
  const affected = [...new Set([...descendantsOf(plan, target.id), ...descendantsOf(plan, consumerId)])];
  for (const id of affected) {
    if ([target.id, consumerId].includes(id)) continue;
    const status = state.units[id]?.status;
    if (status === 'running' || (!continuous && status === 'passed')) return null;
  }
  if (!continuous && (current.rework?.rounds || 0) >= max) return null;
  const evidence = scopedRepairEvidence(outcome, paths);
  return { unit: target.id, max, contract_repair_limit: contractRepairLimit, target_status: current.status, ...evidence, paths, affected };
}

function compactStage(stage) {
  if (!stage) return null;
  return {
    status: stage.status || null,
    host: stage.host || null,
    model: stage.model || null,
    report: stage.report || null,
    verdict: stage.verdict || null
  };
}

function mergeUnique(left = [], right = []) {
  const seen = new Set();
  return [...left, ...right].filter(item => {
    const key = JSON.stringify(item);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function applyContractRepair(plan, state, consumerId, repair, at = new Date().toISOString()) {
  if (!repair?.unit || !state.units?.[repair.unit]) return false;
  const producer = state.units[repair.unit];
  const consumer = state.units[consumerId];
  const previousRepair = producer.retry_context?.dev;
  const samePendingRepair = producer.status === 'pending'
    && previousRepair?.reason === 'downstream_contract_repair'
    && JSON.stringify([...(previousRepair.paths || [])].sort()) === JSON.stringify([...(repair.paths || [])].sort());
  if (!samePendingRepair) {
    const repairRound = (producer.rework?.rounds || 0) + 1;
    const history = [...(producer.rework?.history || []), {
      round: repairRound,
      findings: repair.findings,
      dev: compactStage(producer.dev),
      qa: compactStage(producer.qa),
      at,
      source: 'downstream_contract_repair',
      consumer: consumerId,
      consumer_report: consumer?.dev?.report || consumer?.qa?.report || null,
      consumer_evidence: (consumer?.dev?.evidence || consumer?.qa?.evidence || []).slice(0, 12),
      paths: repair.paths
    }];
    producer.rework = { rounds: repairRound, max: repair.max, history };
    producer.contract_repairs = (producer.contract_repairs || 0) + 1;
  }
  producer.retry_context = {
    ...producer.retry_context,
    dev: {
      reason: 'downstream_contract_repair',
      findings: mergeUnique(samePendingRepair ? previousRepair.findings : [], repair.findings),
      messages: mergeUnique(samePendingRepair ? previousRepair.messages : [], repair.messages),
      paths: repair.paths
    }
  };

  const producerBusy = producer.status === 'running'
    || producer.dev?.status === 'running'
    || producer.qa?.status === 'running'
    || (producer.status === 'passed' && producer.qa?.status === 'pending');

  for (const id of repair.affected || descendantsOf(plan, repair.unit)) {
    const unit = state.units[id];
    if (!unit || unit.owner !== 'lane') continue;
    unit.invalidations = [...(unit.invalidations || []), {
      at,
      source: 'downstream_contract_repair',
      producer: repair.unit,
      consumer: consumerId,
      paths: repair.paths,
      previous: { status: unit.status, dev: compactStage(unit.dev), qa: compactStage(unit.qa) }
    }];
    if (id === repair.unit && producerBusy) continue;
    unit.status = 'pending';
    unit.dev = { status: 'pending', invalidated_by: repair.unit };
    unit.qa = { status: 'pending', invalidated_by: repair.unit };
    unit.pending_decision = null;
    if (id !== repair.unit) {
      unit.repair_dependencies = [...new Set([...(unit.repair_dependencies || []), repair.unit])];
      unit.retry_context = {
        ...unit.retry_context,
        dev: { reason: 'upstream_contract_repair', producer: repair.unit, findings: repair.findings, paths: repair.paths }
      };
    }
  }
  state.contract_repairs = [...(state.contract_repairs || []), {
    at,
    producer: repair.unit,
    consumer: consumerId,
    paths: repair.paths,
    affected: repair.affected || descendantsOf(plan, repair.unit),
    coalesced: samePendingRepair
  }];
  return true;
}

function repairOutcomeFromState(unit) {
  const direct = [unit?.dev, unit?.qa, unit?.retry_context?.dev, unit?.retry_context?.qa]
    .find(value => value?.findings?.length && value?.messages?.length);
  if (direct) return { kind: 'failed', reason: direct.reason || 'persisted_cross_unit_failure', findings: direct.findings, messages: direct.messages };
  const handledAt = Date.parse(unit?.invalidations?.at(-1)?.at || '');
  for (const row of [...(unit?.rework?.history || [])].reverse()) {
    if (Number.isFinite(handledAt) && Date.parse(row.at || '') <= handledAt) continue;
    const stage = [row.dev, row.qa].find(value => value?.messages?.length);
    if (row.findings?.length && stage) return { kind: 'failed', reason: row.source || 'persisted_cross_unit_failure', findings: row.findings, messages: stage.messages };
  }
  return null;
}

module.exports = { externalRepairPaths, scopedRepairEvidence, contractRepairTarget, applyContractRepair, repairOutcomeFromState };
