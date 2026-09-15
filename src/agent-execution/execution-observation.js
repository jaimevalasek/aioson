'use strict';

// A read-only projection of the run ledger. Both monitors use this, never the
// process telemetry table: attempts in that table may outlive their engine.
function currentActivity(live, now = Date.now()) {
  if (!live) return null;
  const sampled = Date.parse(live.heartbeat_at);
  const age = Number.isFinite(sampled) ? Math.max(0, now - sampled) : 0;
  const writeAge = live.last_write_age_ms == null ? null : live.last_write_age_ms + age;
  const outputAge = live.last_output_age_ms == null ? null : live.last_output_age_ms + age;
  const stallMs = live.stall_ms ?? 300000;
  const unproductiveMs = live.unproductive_ms ?? stallMs * 3;
  return {
    ...live,
    sample_age_ms: age,
    last_write_age_ms: writeAge,
    last_output_age_ms: outputAge,
    // Older engines latched these flags forever. A recent measured write is
    // positive evidence of recovery; absence of measurements is no verdict.
    stalled: live.measured !== false && Boolean(live.stalled) && (writeAge == null || writeAge >= stallMs) && (outputAge == null || outputAge >= stallMs),
    unproductive: live.measured !== false && Boolean(live.unproductive) && (writeAge == null || writeAge >= unproductiveMs)
  };
}

function observeExecution(status, plan = null) {
  const units = status.units || [];
  const running = status.running || [];
  const plans = new Map((plan?.units || []).map(unit => [unit.id, unit]));
  const byId = new Map(units.map(unit => [unit.id, unit]));
  const done = unit => unit && (unit.status === 'skipped' || (unit.status === 'passed' && (plan?.policy?.qa.require_pass ? ['passed', 'skipped'] : ['passed', 'failed', 'skipped']).includes(unit.qa?.status)));
  const waiting = [];
  for (const unit of units) {
    if (unit.owner === 'integration') continue;
    const stage = unit.dev?.status === 'pending' ? 'dev' : (unit.qa?.status === 'pending' && unit.status === 'passed' ? 'qa' : null);
    if (!stage) continue;
    const deps = plans.get(unit.id)?.depends_on || [];
    const repairBlocked = (unit.repair_dependencies || []).filter(id => !done(byId.get(id)));
    const blocked = repairBlocked.length ? repairBlocked : deps.length ? deps.filter(dep => {
      const target = byId.get(dep.unit);
      return target && (dep.gate === 'after_dev' ? !['passed', 'skipped'].includes(target.status) : !done(target));
    }).map(dep => dep.unit) : units.filter(other => other.owner === 'lane' && other.wave < unit.wave && !done(other)).map(other => other.id);
    const writes = new Set((plans.get(unit.id)?.files || []).map(file => file.toLowerCase()));
    const conflicts = running.filter(active => (plans.get(active.unit)?.files || []).some(file => writes.has(file.toLowerCase()))).map(active => active.unit);
    let reason = blocked.length ? (repairBlocked.length || deps.length ? 'dependencies' : 'previous_wave') : conflicts.length ? 'write_conflict' : 'capacity';
    if (!blocked.length && conflicts.length) blocked.push(...conflicts);
    if (status.run?.status !== 'running') reason = 'run_paused';
    else if (!status.engine?.alive) reason = 'engine_missing';
    waiting.push({ unit: unit.id, stage, reason, blocked_by: blocked });
  }
  const assignments = Object.entries(plan?.lanes || {}).flatMap(([lane, config]) => ['dev', 'qa'].map(stage => ({
    lane, stage, host: config[stage]?.host || null, model: config[stage]?.model || null,
    reasoning_effort: config[stage]?.reasoning_effort || null,
    routing_profile: config[stage]?.routing_profile || null,
    active: running.filter(item => item.lane === lane && item.stage === stage).map(item => ({
      unit: item.unit, host: item.host, model: item.model, routing_profile: item.routing_profile || null,
      matches: item.host === config[stage]?.host && item.model === config[stage]?.model
    }))
  })));
  const events = [];
  for (const unit of units) for (const stage of ['dev', 'qa']) {
    const row = unit[stage];
    if (row?.started_at) events.push({ at: row.started_at, unit: unit.id, stage, type: 'started', host: row.host, model: row.model });
    if (row?.finished_at) events.push({ at: row.finished_at, unit: unit.id, stage, type: row.status, host: row.host, model: row.model });
  }
  for (const decision of status.decisions || []) events.push({ ...decision, type: 'decision' });
  events.sort((a, b) => String(b.at).localeCompare(String(a.at)));
  const active = new Set(running.map(item => item.unit)).size;
  const limit = plan?.parallel?.max_concurrent_lanes ?? null;
  const ready = waiting.filter(item => item.reason === 'capacity').length;
  const blocked = waiting.length - ready;
  return {
    assignments, waiting, events,
    concurrency: {
      active,
      ready,
      blocked,
      available: limit == null ? null : Math.max(0, limit - active),
      limit,
      scope: 'unit_pipelines'
    },
    counts: {
      total: units.filter(unit => unit.owner === 'lane').length,
      dev_passed: units.filter(unit => unit.owner === 'lane' && unit.dev?.status === 'passed').length,
      qa_passed: units.filter(unit => unit.owner === 'lane' && unit.qa?.status === 'passed').length,
      qa_failed: units.filter(unit => unit.qa?.status === 'failed').length,
      accepted: units.filter(unit => unit.owner === 'lane' && unit.dev?.status === 'passed' && unit.qa?.status === 'passed').length,
      findings: (status.findings || []).length
    }
  };
}

module.exports = { currentActivity, observeExecution };
