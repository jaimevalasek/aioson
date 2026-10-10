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

function findingPath(finding) {
  const raw = finding?.path || finding?.location;
  if (typeof raw !== 'string' || raw.includes(',')) return null;
  return normalizePath(raw);
}

// Findings that say a check could not run yet, or that only observe.
const NON_DEFECT_FINDING_KINDS = new Set(['verification_not_run', 'manual_verification_deferred', 'note']);
const NON_DEFECT_SEVERITIES = new Set(['low', 'info', 'informational', 'note']);

// Paths a defect finding of the failed report points at directly.
function defectPaths(outcome) {
  return new Set((outcome?.findings || [])
    .filter(finding => !NON_DEFECT_FINDING_KINDS.has(String(finding?.kind || finding?.check || ''))
      && !NON_DEFECT_SEVERITIES.has(String(finding?.severity || '').trim().toLowerCase()))
    .map(findingPath)
    .filter(Boolean)
    .map(file => file.toLowerCase()));
}

// A cross-unit repair request is trusted only as structured data: an
// unflagged lane/integration/orchestrator message must name an exact path
// compiled into the plan. Free-form prose never changes scheduling.
// A message to integration/orchestrator is often a hand-off (verify later,
// document a variable, run a suite once a future unit exists); its paths
// reopen another unit only when a defect finding of the same report points
// at them. In one migration run such hand-offs about future deliverables
// stopped the routing of the real defect beside them, and a low-severity
// ".env.example" documentation gap would have reopened the foundation unit.
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
  const corroborated = defectPaths(outcome);
  const messages = (outcome.messages || []).filter(message =>
    ['contract_change', 'note'].includes(message?.kind)
    && !message.flagged?.length
    && /^(lane:[^\s]+|unit:[^\s]+|integration|orchestrator)$/.test(String(message.to || ''))
    && Array.isArray(message.paths));
  const paths = messages.flatMap(message => {
    const handOff = ['integration', 'orchestrator'].includes(message.to);
    return (message.paths || [])
      .map(normalizePath)
      .filter(Boolean)
      .filter(file => !handOff || corroborated.has(file.toLowerCase()));
  })
    .filter(file => !own.has(file.toLowerCase()) && canonical.has(file.toLowerCase()));
  return [...new Set(paths.map(file => file.toLowerCase()))].map(lower => canonical.get(lower));
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

function unitInFlight(unit) {
  // A delivered implementation queued for review has no writer. Treating it
  // as active can defer an upstream repair behind a review that waits for the
  // failed consumer itself, leaving neither side able to make progress.
  return unit?.status === 'running'
    || unit?.dev?.status === 'running'
    || unit?.qa?.status === 'running';
}

const waveOf = unit => Number(unit?.wave) || 0;

// A later unit that has not started yet creates or changes the path in its
// own wave: a consumer naming it describes future work, not a defect any
// owner can repair now.
function unitStarted(unitState) {
  return Boolean(unitState) && unitState.status !== 'pending';
}

// Route a failed consumer to the closest compiled owner of the reported path.
// Explicit ancestors remain authoritative. In continuous mode, shared checks
// (typecheck, build, integration suites) may expose a unique earlier or
// same-wave owner even when the planner omitted a cross-lane edge; the exact
// compiled path is still the authority. A later-wave owner is never pulled
// backwards: one that has not started yet only defers the path to its own
// wave, and in continuous mode one that already ran (a run continues past a
// paused unit) owns the defect it wrote. Continuous mode routes one producer
// at a time — one a defect finding points at before one only a message
// names, then the earliest — and leaves unassignable paths to the consumer's
// next review: a single path without an owner no longer stops the repair of
// the others. A review that failed on another unit's file (`stage: 'qa'`)
// leaves the consumer's delivered code as it is: after the repair only its
// review runs again, and the units built on it stay valid.
function contractRepairResolution(plan, state, consumerId, outcome, continuous = false, stage = 'dev') {
  const consumer = (plan.units || []).find(unit => unit.id === consumerId);
  if (!consumer) return { status: 'unresolved', reason: 'consumer_missing', paths: [] };
  const paths = externalRepairPaths(plan, consumerId, outcome);
  if (!paths.length) return { status: 'not_applicable', reason: 'no_external_paths', paths: [] };
  const ancestors = ancestorsOf(plan, consumerId);
  const owned = [];
  const futurePaths = [];
  let unassigned = null;
  for (const repairPath of paths) {
    const laneOwners = (plan.units || []).filter(unit => unit.id !== consumerId
      && unit.owner === 'lane'
      && unitFiles(unit).has(repairPath.toLowerCase()));
    const compiledOwners = laneOwners.filter(unit => waveOf(unit) <= waveOf(consumer));
    const ancestralOwners = compiledOwners.filter(unit => ancestors.has(unit.id));
    let owners = ancestralOwners.length ? ancestralOwners : continuous ? compiledOwners : [];
    if (!owners.length) {
      const later = laneOwners.filter(unit => waveOf(unit) > waveOf(consumer));
      const started = later.filter(unit => unitStarted(state.units?.[unit.id]));
      if (later.length && !started.length) {
        futurePaths.push(repairPath);
        continue;
      }
      if (continuous) owners = started;
    }
    let reason = null;
    if (!owners.length) reason = 'owner_missing';
    else {
      const latestWave = Math.max(...owners.map(waveOf));
      const latest = owners.filter(unit => waveOf(unit) === latestWave);
      if (latest.length !== 1) reason = 'owner_ambiguous';
      else owned.push({ path: repairPath, target: latest[0] });
    }
    if (!reason) continue;
    if (!continuous) return { status: 'unresolved', reason, paths, future_paths: futurePaths };
    unassigned ||= { reason, paths: [] };
    unassigned.paths.push(repairPath);
  }
  if (!owned.length) {
    return unassigned
      ? { status: 'unresolved', reason: unassigned.reason, paths: unassigned.paths, future_paths: futurePaths }
      : { status: 'not_applicable', reason: 'future_owners_only', paths: [], future_paths: futurePaths };
  }
  const order = new Map((plan.units || []).map((unit, index) => [unit.id, index]));
  const defects = defectPaths(outcome);
  const proven = new Set(owned.filter(item => defects.has(item.path.toLowerCase())).map(item => item.target.id));
  const producers = [...new Map(owned.map(item => [item.target.id, item.target])).values()]
    .sort((a, b) => (Number(proven.has(b.id)) - Number(proven.has(a.id))) || (waveOf(a) - waveOf(b)) || (order.get(a.id) - order.get(b.id)));
  if (producers.length > 1 && !continuous) return { status: 'unresolved', reason: 'multiple_producers', paths, future_paths: futurePaths };
  const target = producers[0];
  const targetPaths = owned.filter(item => item.target.id === target.id).map(item => item.path);
  const current = state.units[target.id];
  const delivered = current?.status === 'passed' && current.qa?.status === 'passed';
  const recoverable = continuous && ['pending', 'running', 'decision_required', 'passed'].includes(current?.status);
  if (!delivered && !recoverable) return { status: 'unresolved', reason: 'producer_not_recoverable', paths: targetPaths, producer: target.id };
  const max = plan.lanes?.[target.lane]?.qa?.max_rework_rounds || 0;
  const contractRepairLimit = continuous ? Math.max(2, max) : 2;
  if ((current.contract_repairs || 0) >= contractRepairLimit) return { status: 'unresolved', reason: 'contract_repair_limit', paths: targetPaths, producer: target.id };
  const producerDescendants = descendantsOf(plan, target.id);
  const reviewOnly = stage === 'qa' && state.units?.[consumerId]?.dev?.status === 'passed' && !producerDescendants.includes(consumerId);
  const affected = [...new Set([...producerDescendants, ...(reviewOnly ? [consumerId] : descendantsOf(plan, consumerId))])];
  const evidence = scopedRepairEvidence(outcome, targetPaths);
  const repair = { unit: target.id, max, contract_repair_limit: contractRepairLimit, target_status: current.status, ...evidence, paths: targetPaths, affected, ...(reviewOnly ? { consumer: consumerId, consumer_review_only: true } : {}) };
  const blockers = affected.filter(id => id !== consumerId && unitInFlight(state.units[id]));
  if (continuous && blockers.length > 0) return { status: 'deferred', reason: 'affected_units_running', repair, paths: targetPaths, producer: target.id, blockers };
  for (const id of affected) {
    if ([target.id, consumerId].includes(id)) continue;
    const status = state.units[id]?.status;
    if (status === 'running' || (!continuous && status === 'passed')) return { status: 'unresolved', reason: 'affected_unit_not_reopenable', paths: targetPaths, producer: target.id };
  }
  if (!continuous && (current.rework?.rounds || 0) >= max) return { status: 'unresolved', reason: 'rework_limit', paths: targetPaths, producer: target.id };
  return { status: 'routable', reason: null, repair, paths: targetPaths, producer: target.id, blockers: [] };
}

// Owners of the given paths whose pipeline is writing right now. A
// supervisor that repairs those paths waits for them instead of racing them.
function ownersInFlight(plan, state, consumerId, paths) {
  const selected = new Set((paths || []).map(file => String(file).toLowerCase()));
  return (plan.units || [])
    .filter(unit => unit.id !== consumerId && unit.owner === 'lane'
      && [...unitFiles(unit)].some(file => selected.has(file))
      && unitInFlight(state.units?.[unit.id]))
    .map(unit => unit.id);
}

function contractRepairTarget(plan, state, consumerId, outcome, continuous = false, stage = 'dev') {
  const resolution = contractRepairResolution(plan, state, consumerId, outcome, continuous, stage);
  return resolution.status === 'routable' ? resolution.repair : null;
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

function clearDeferredRepair(consumer) {
  if (!consumer) return;
  const blockers = new Set(consumer.deferred_contract_repair?.blockers || []);
  delete consumer.deferred_contract_repair;
  consumer.repair_dependencies = (consumer.repair_dependencies || []).filter(id => !blockers.has(id));
}

function deferContractRepair(consumer, stage, resolution, outcome, at = new Date().toISOString()) {
  if (!consumer || resolution?.status !== 'deferred' || !resolution.repair) return null;
  const repair = resolution.repair;
  consumer.deferred_contract_repair = {
    stage,
    producer: repair.unit,
    paths: repair.paths,
    affected: repair.affected,
    blockers: resolution.blockers,
    outcome: {
      kind: outcome.kind,
      reason: outcome.reason || 'deferred_contract_repair',
      findings: repair.findings,
      messages: repair.messages
    },
    queued_at: at
  };
  consumer.repair_dependencies = [...new Set([...(consumer.repair_dependencies || []), ...resolution.blockers])];
  consumer.pending_decision = null;
  consumer.status = 'pending';
  return repair;
}

function applyContractRepair(plan, state, consumerId, repair, at = new Date().toISOString()) {
  if (!repair?.unit || !state.units?.[repair.unit]) return false;
  const producer = state.units[repair.unit];
  const consumer = state.units[consumerId];
  clearDeferredRepair(consumer);
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
      consumer_report: (repair.consumer_review_only ? consumer?.qa?.report : null) || consumer?.dev?.report || consumer?.qa?.report || null,
      consumer_evidence: ((repair.consumer_review_only ? consumer?.qa?.evidence : null) || consumer?.dev?.evidence || consumer?.qa?.evidence || []).slice(0, 12),
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

  const producerBusy = unitInFlight(producer);

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
    if (id === consumerId && repair.consumer_review_only) {
      // Its implementation stands; its review waits for the producer and runs again.
      unit.status = 'passed';
      unit.qa = { status: 'pending', invalidated_by: repair.unit };
      unit.pending_decision = null;
      unit.repair_dependencies = [...new Set([...(unit.repair_dependencies || []), repair.unit])];
      unit.retry_context = {
        ...unit.retry_context,
        qa: { reason: 'upstream_contract_repair', producer: repair.unit, findings: repair.findings, paths: repair.paths }
      };
      continue;
    }
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
  // A stage that passed left observations and hand-offs, not failure
  // evidence: a review that failed after an approved DEV is judged on the
  // review's own report.
  const direct = [unit?.dev, unit?.qa, unit?.retry_context?.dev, unit?.retry_context?.qa]
    .find(value => value?.status !== 'passed' && value?.findings?.length && value?.messages?.length);
  if (direct) return { kind: 'failed', reason: direct.reason || 'persisted_cross_unit_failure', findings: direct.findings, messages: direct.messages };
  const handledAt = Date.parse(unit?.invalidations?.at(-1)?.at || '');
  for (const row of [...(unit?.rework?.history || [])].reverse()) {
    if (Number.isFinite(handledAt) && Date.parse(row.at || '') <= handledAt) continue;
    const stage = [row.dev, row.qa].find(value => value?.messages?.length);
    if (row.findings?.length && stage) return { kind: 'failed', reason: row.source || 'persisted_cross_unit_failure', findings: row.findings, messages: stage.messages };
  }
  return null;
}

function reconcileDeferredContractRepairs(plan, state, at = new Date().toISOString()) {
  const routed = [];
  const unresolved = [];
  const waiting = [];
  let changed = false;
  for (const planned of plan.units || []) {
    const consumer = state.units?.[planned.id];
    const deferred = consumer?.deferred_contract_repair;
    if (!deferred) continue;
    const outcome = repairOutcomeFromState(consumer) || deferred.outcome;
    if (!outcome) {
      waiting.push({ unit: planned.id, stage: deferred.stage || 'dev', blockers: deferred.blockers || [] });
      continue;
    }
    const resolution = contractRepairResolution(plan, state, planned.id, outcome, true, deferred.stage || 'dev');
    if (resolution.status === 'deferred') {
      const previousBlockers = new Set(deferred.blockers || []);
      const retainedDependencies = (consumer.repair_dependencies || []).filter(id => !previousBlockers.has(id));
      const nextDependencies = [...new Set([...retainedDependencies, ...resolution.blockers])];
      if (JSON.stringify(deferred.blockers || []) !== JSON.stringify(resolution.blockers)
          || JSON.stringify(consumer.repair_dependencies || []) !== JSON.stringify(nextDependencies)) changed = true;
      consumer.repair_dependencies = nextDependencies;
      consumer.deferred_contract_repair = { ...deferred, blockers: resolution.blockers };
      waiting.push({ unit: planned.id, stage: deferred.stage || 'dev', producer: resolution.producer, blockers: resolution.blockers });
      continue;
    }
    if (resolution.status !== 'routable') {
      const previousBlockers = new Set(deferred.blockers || []);
      consumer.repair_dependencies = (consumer.repair_dependencies || []).filter(id => !previousBlockers.has(id));
      delete consumer.deferred_contract_repair;
      unresolved.push({ unit: planned.id, stage: deferred.stage || 'dev', outcome, resolution });
      changed = true;
      continue;
    }
    const repair = resolution.repair;
    if (!applyContractRepair(plan, state, planned.id, repair, at)) continue;
    state.decisions ||= [];
    state.decisions.push({ unit: planned.id, stage: deferred.stage || 'dev', choice: 'reroute', target: repair.unit, reason_before: 'affected_units_running', source: 'automatic_contract_repair_deferred', at });
    routed.push({ unit: planned.id, stage: deferred.stage || 'dev', producer: repair.unit, repair });
    changed = true;
  }
  return { changed, routed, unresolved, waiting };
}

module.exports = { externalRepairPaths, scopedRepairEvidence, contractRepairResolution, contractRepairTarget, deferContractRepair, applyContractRepair, repairOutcomeFromState, reconcileDeferredContractRepairs, ownersInFlight };
