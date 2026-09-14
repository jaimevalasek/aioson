'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { estimateCost, findTariff, refreshPriceCatalog, readPriceCatalog, validateCatalog, SOURCE } = require('../src/agent-execution/execution-cost');
const { durationMetrics, executionMetrics } = require('../src/agent-execution/execution-metrics');

test('parallel wall time, occupied time, waiting and agent sum are distinct', () => {
  const at = seconds => new Date(seconds * 1000).toISOString();
  const attempts = [[1, 11], [5, 15], [20, 25]].map(([start, end]) => ({ started_at: at(start), finished_at: at(end) }));
  assert.deepEqual(durationMetrics(attempts, 30000), { wall_ms: 24000, active_ms: 19000, waiting_ms: 5000, agent_ms: 25000 });
});

test('cost uses disjoint cache buckets and exact official tariff identity', () => {
  const tariff = { id: 'openai/exact', source: SOURCE, rates: { input: 0.000002, output: 0.00001, cache_read: 0.0000002, cache_write: null } };
  const catalog = { provider: 'openrouter', models: [tariff], currency: 'USD', unit: 'token', fetched_at: '2026-09-13T00:00:00Z' };
  const usage = { input_tokens: 1000, uncached_input_tokens: 200, cache_read_tokens: 800, cache_write_tokens: 0, output_tokens: 100, complete: true };
  const quote = findTariff(catalog, 'codex', 'exact');
  const cost = estimateCost(usage, quote);
  assert.ok(Math.abs(cost.usd - 0.00156) < 1e-12);
  assert.equal(cost.complete, true);
  assert.equal(cost.tariff.fetched_at, catalog.fetched_at);
  assert.equal(findTariff(catalog, 'codex', 'similar'), null);
  assert.equal(estimateCost({ ...usage, cache_read_tokens: null }, quote).complete, false);
  assert.equal(estimateCost(usage, null).usd, null);
});

test('official tariff refresh persists provenance and refuses invalid input without replacing previous data', async t => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'aioson-prices-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const body = { data: [{ id: 'vendor/model', context_length: 200000, pricing: { prompt: '0.000002', completion: '0.00001', input_cache_read: '0.0000002' } }] };
  let url;
  const catalog = await refreshPriceCatalog(dir, { fetchImpl: async value => { url = value; return new Response(JSON.stringify(body)); } });
  assert.equal(url, SOURCE);
  assert.equal((await readPriceCatalog(dir)).catalog.fetched_at, catalog.fetched_at);
  await assert.rejects(refreshPriceCatalog(dir, { fetchImpl: async () => new Response('{}') }), /did not return models/);
  assert.equal((await readPriceCatalog(dir)).catalog.models.length, 1);
  assert.throws(() => validateCatalog({ ...catalog, unit: 'million_tokens' }), /Invalid pricing/);
  assert.throws(() => validateCatalog({ ...catalog, models: [{ ...catalog.models[0], rates: { ...catalog.models[0].rates, input: true } }] }), /Invalid input/);
});

test('failed/reworked attempts remain counted and legacy snapshots do not invent token usage', () => {
  const state = { waves: [{ wave: 1 }], units: {}, attempts: [{ id: 'a', wave: 1, reason: 'timeout', usage: null }, { id: 'b', wave: 1, usage: { input_tokens: 100, output_tokens: 5, complete: true }, cost: { usd: 0.01, complete: true } }] };
  const metrics = executionMetrics(state);
  assert.equal(metrics.attempts.length, 2);
  assert.equal(metrics.usage.complete, false);
  assert.equal(metrics.cost.complete, false);
  assert.equal(metrics.waves[0].attempts, 2);
  const legacy = executionMetrics({ waves: [], units: {} });
  assert.equal(legacy.history_complete, false);
  assert.equal(legacy.usage.input_tokens, null);
});

test('wave breakdown reconciles roles and actual models without double counting cache', () => {
  const usage = input => ({ input_tokens: input, uncached_input_tokens: input / 2, cache_read_tokens: input / 2, cache_write_tokens: 0, output_tokens: 10, complete: true });
  const attempt = (unit, stage, model, input, wave = 1) => ({ unit, stage, model, host: 'test-host', wave, usage: input === null ? null : usage(input), cost: input === null ? null : { usd: input / 100, complete: true } });
  const state = { units: { api: { id: 'api', wave: 1, lane: 'backend', status: 'passed', dev: { status: 'passed' }, qa: { status: 'passed' } }, ui: { id: 'ui', wave: 1, lane: 'frontend', status: 'running', dev: { status: 'passed' }, qa: { status: 'running' } } }, waves: [{ wave: 1, units: ['api', 'ui'] }, { wave: 2 }, { wave: 3 }], attempts: [
    attempt('api', 'dev', 'builder', 100), attempt('api', 'dev', 'fallback', 200), attempt('ui', 'dev', 'builder', 400),
    attempt('api', 'qa', 'reviewer', 600), attempt('ui', 'qa', 'reviewer', 700), attempt('api', 'dev', 'builder', null),
    attempt('api', 'dev', 'builder', 8000, 2), attempt('unknown', 'qa', 'legacy', null)
  ] };
  const plan = { units: [{ id: 'api', phase: '2-backend-api', lane: 'backend', scope: 'Construir API', files: ['src/api.js'] }, { id: 'ui', phase: '2-frontend-ui', lane: 'frontend', scope: 'Construir UI', files: ['src/ui.js', 'src/ui.test.js'] }] };
  const before = JSON.stringify(state), metrics = executionMetrics(state, Date.now(), plan), wave = metrics.waves[0];
  assert.equal(JSON.stringify(state), before);
  assert.equal(wave.roles.length, 6);
  assert.equal(wave.models[0].model, 'reviewer');
  assert.equal(wave.models[0].total_tokens, 1320);
  assert.equal(wave.total_tokens, 2050);
  assert.equal(wave.roles.reduce((sum, role) => sum + (role.total_tokens || 0), 0), wave.total_tokens);
  assert.equal(wave.roles.reduce((sum, role) => sum + (role.cost.usd || 0), 0), wave.cost.usd);
  assert.equal(wave.roles.find(role => role.lane === 'backend' && role.model === 'builder').attempts, 2);
  assert.equal(wave.roles.find(role => role.lane === 'backend' && role.model === 'builder').usage.complete, false);
  assert.equal(wave.roles.find(role => role.model === 'legacy').lane, null);
  assert.equal(wave.roles.find(role => role.model === 'legacy').total_tokens, null);
  assert.deepEqual(wave.units.map(unit => unit.phase), ['2-backend-api', '2-frontend-ui', 'unknown']);
  assert.equal(wave.units[0].scope, 'Construir API');
  assert.equal(wave.units[1].file_count, 2);
  assert.equal(wave.units[0].dev_status, 'passed');
  assert.equal(wave.units[0].total_tokens, 930);
  assert.equal(metrics.waves[1].total_tokens, 8010);
  assert.deepEqual(metrics.waves[2].roles, []);
  assert.equal(metrics.waves[2].total_tokens, null);
});

test('Codex equivalent cost uses official Standard rates, keeps history and exposes unknown context tiers', () => {
  const usage = { input_tokens: 1000000, uncached_input_tokens: 100000, cache_read_tokens: 900000, cache_write_tokens: 0, output_tokens: 10000, complete: true };
  const recorded = { usd: 0.48, complete: true, tariff: { provider: 'openrouter' } };
  const state = { waves: [{ wave: 1 }], units: {}, attempts: [{ id: 's', wave: 1, host: 'codex', model: 'gpt-5.6-sol', usage, cost: recorded }] };
  const before = JSON.stringify(state);
  const metrics = executionMetrics(state);
  assert.equal(JSON.stringify(state), before, 'view never mutates the ledger');
  assert.equal(metrics.attempts[0].recorded_cost, recorded);
  assert.equal(metrics.models[0].tariff.provider, 'openai');
  assert.equal(metrics.models[0].tariff.rates.input, 4 / 1e6);
  assert.ok(Math.abs(metrics.cost.usd - 0.96) < 1e-10);
  assert.ok(Math.abs(metrics.cost.usd_upper - 1.82) < 1e-10);
  assert.equal(metrics.cost.complete, false);
  assert.equal(metrics.waves[0].cost.usd_upper, metrics.cost.usd_upper);
  const small = estimateCost({ ...usage, input_tokens: 100, uncached_input_tokens: 100, cache_read_tokens: 0 }, findTariff(null, 'codex', 'gpt-6-astra'));
  assert.equal(small.usd_upper, undefined, 'a complete total below threshold proves all requests were short');
  assert.equal(findTariff(null, 'opencode', 'openrouter/openai/gpt-5.6-sol'), null, 'provider routing must not silently change');
});
