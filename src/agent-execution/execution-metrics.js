'use strict';
const { aggregateUsage } = require('./execution-usage');
const { officialOpenAiTariff } = require('./openai-prices');
const { estimateCost } = require('./execution-cost');

const tokenCount = value => Number.isSafeInteger(value) && value >= 0 ? value : null;

function attemptContext(attempt = {}) {
  const legacy = attempt.context_budget || {};
  const current = attempt.context_window || {};
  const limit = tokenCount(current.limit_tokens) ?? tokenCount(legacy.context_window_tokens);
  // Cumulative input is not active context. Report only a peak observed by a
  // harness; null is more truthful than presenting millions of replay/cache
  // tokens as a model-window reading.
  const used = tokenCount(attempt.usage?.peak_context_tokens);
  const declaredSource = [current.source, legacy.window_source]
    .find(value => typeof value === 'string' && value && value !== 'unknown');
  return {
    limit_tokens: limit,
    used_tokens: used,
    used_fraction: limit && used !== null ? used / limit : null,
    source: declaredSource || attempt.usage?.context_source || 'unknown',
    complete: limit !== null && used !== null
  };
}

function summarizeContext(attempts) {
  const rows = attempts.map(attemptContext);
  const limits = [...new Set(rows.map(row => row.limit_tokens).filter(value => value !== null))];
  const used = rows.map(row => row.used_tokens).filter(value => value !== null);
  const fractions = rows.map(row => row.used_fraction).filter(value => value !== null);
  return {
    limit_tokens: limits.length === 1 ? limits[0] : null,
    used_tokens: used.length ? Math.max(...used) : null,
    used_fraction: fractions.length ? Math.max(...fractions) : null,
    measured_attempts: used.length,
    total_attempts: rows.length,
    complete: rows.length > 0 && rows.every(row => row.complete)
  };
}

function durationMetrics(attempts, now) {
  const ranges = attempts.map(item => [Date.parse(item.started_at), item.finished_at ? Date.parse(item.finished_at) : now]).filter(([start, end]) => Number.isFinite(start) && Number.isFinite(end) && end >= start).sort((a, b) => a[0] - b[0]);
  let active = 0, end = null;
  for (const range of ranges) { active += Math.max(0, range[1] - Math.max(range[0], end ?? range[0])); end = Math.max(end ?? range[1], range[1]); }
  const wall = ranges.length ? Math.max(...ranges.map(range => range[1])) - ranges[0][0] : null;
  return { wall_ms: wall, active_ms: ranges.length ? active : null, waiting_ms: wall === null ? null : wall - active, agent_ms: ranges.length ? ranges.reduce((sum, range) => sum + range[1] - range[0], 0) : null };
}

function summarizeAttempts(attempts, now = Date.now()) {
  const costs = attempts.map(item => item.cost);
  const knownCosts = costs.filter(item => typeof item?.usd === 'number');
  const usage = aggregateUsage(attempts.map(item => item.usage));
  return {
    attempts: attempts.length,
    ...durationMetrics(attempts, now),
    usage,
    context: summarizeContext(attempts),
    total_tokens: typeof usage.input_tokens === 'number' && typeof usage.output_tokens === 'number' ? usage.input_tokens + usage.output_tokens : null,
    cost: { usd: knownCosts.length ? knownCosts.reduce((sum, item) => sum + item.usd, 0) : null, ...(knownCosts.some(item => typeof item.usd_upper === 'number') ? { usd_upper: knownCosts.reduce((sum, item) => sum + (item.usd_upper ?? item.usd), 0) } : {}), complete: attempts.length > 0 && knownCosts.length === attempts.length && costs.every(item => item?.complete), priced_attempts: knownCosts.length, basis: 'equivalent_api_token_estimate' }
  };
}

function groupAttempts(attempts, dimensions, now) {
  const groups = new Map();
  for (const attempt of attempts) {
    const identity = Object.fromEntries(dimensions.map(key => [key, attempt[key] ?? null]));
    const key = JSON.stringify(identity);
    if (!groups.has(key)) groups.set(key, { identity, rows: [] });
    groups.get(key).rows.push(attempt);
  }
  return [...groups.values()].map(({ identity, rows }) => ({ ...identity, tariff: rows.find(row => row.cost?.tariff)?.cost.tariff || null, recalculated: rows.some(row => row.cost_recalculated), ...summarizeAttempts(rows, now) }))
    .sort((a, b) => (b.total_tokens ?? -1) - (a.total_tokens ?? -1));
}

function executionMetrics(state, now = Date.now(), plan = null) {
  // Old ledgers only retained the latest stage. Display its observed duration
  // without claiming an exhaustive attempt or token history.
  const history = Array.isArray(state.attempts) ? state.attempts : [];
  const attempts = history.map(item => {
    const tariff = officialOpenAiTariff(item.host, item.model);
    // Read-only correction: retain the price actually recorded at dispatch.
    return tariff ? { ...item, recorded_cost: item.cost || null, cost: estimateCost(item.usage, tariff), cost_recalculated: true } : { ...item };
  });
  for (const unit of Object.values(state.units || {})) for (const stage of ['dev', 'qa']) {
    const row = unit[stage];
    if (!row?.started_at || attempts.some(item => item.unit === unit.id && item.stage === stage && item.role_attempt_id === row.attempt_id)) continue;
    if (!row.finished_at && attempts.some(item => item.unit === unit.id && item.stage === stage && !item.finished_at)) continue;
    if (history.length && row.status !== 'running') continue;
    attempts.push({ id: row.attempt_id || `legacy:${unit.id}:${stage}`, unit: unit.id, wave: unit.wave, stage, host: row.host, model: row.model, started_at: row.started_at, finished_at: row.finished_at, usage: row.usage || null });
  }
  for (const attempt of attempts) {
    attempt.lane = attempt.lane ?? state.units?.[attempt.unit]?.lane ?? null;
    attempt.context = attemptContext(attempt);
    // Old ledgers may retain the retired enforcement inputs. They remain
    // readable for migration, but public reports expose only the actual model
    // window and its observed peak use.
    delete attempt.context_budget;
    delete attempt.context_window;
  }
  const plannedUnits = new Map((plan?.units || []).map(unit => [unit.id, unit]));
  const models = groupAttempts(attempts, ['host', 'model'], now);
  const waves = (state.waves || []).map(wave => {
    const rows = attempts.filter(item => item.wave === wave.wave);
    const ids = [...new Set([
      ...(wave.units || []),
      ...Object.values(state.units || {}).filter(unit => unit.wave === wave.wave).map(unit => unit.id),
      ...rows.map(item => item.unit).filter(Boolean)
    ])];
    const units = ids.map(id => {
      const unitRows = rows.filter(item => item.unit === id);
      const runtime = state.units?.[id] || {};
      const planned = plannedUnits.get(id) || {};
      return {
        id,
        phase: planned.phase || runtime.phase || String(id).replace(/^phase-/, ''),
        phase_number: planned.phase_number ?? runtime.phase_number ?? null,
        lane: planned.lane ?? runtime.lane ?? unitRows[0]?.lane ?? null,
        owner: planned.owner ?? runtime.owner ?? null,
        scope: planned.scope || runtime.scope || null,
        file_count: Array.isArray(planned.files) ? planned.files.length : null,
        status: runtime.status || null,
        dev_status: runtime.dev?.status || null,
        qa_status: runtime.qa?.status || null,
        ...summarizeAttempts(unitRows, now),
        roles: groupAttempts(unitRows, ['stage', 'host', 'model'], now)
      };
    });
    return { wave: wave.wave, ...summarizeAttempts(rows, now), units, models: groupAttempts(rows, ['host', 'model'], now), roles: groupAttempts(rows, ['lane', 'stage', 'host', 'model'], now) };
  });
  return { history_complete: Array.isArray(state.attempts) && state.attempt_history_complete !== false, ...summarizeAttempts(attempts, now), models, waves, attempts };
}

module.exports = { attemptContext, durationMetrics, summarizeAttempts, executionMetrics };
