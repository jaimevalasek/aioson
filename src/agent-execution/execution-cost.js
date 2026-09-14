'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { officialOpenAiTariff } = require('./openai-prices');

const PRICES_PATH = '.aioson/config/execution-prices.json';
const SOURCE = 'https://openrouter.ai/api/v1/models';
const RATE_KEYS = ['input', 'output', 'cache_read', 'cache_write'];
const amount = value => (typeof value === 'number' || (typeof value === 'string' && /^(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(value))) && Number.isFinite(Number(value)) && Number(value) >= 0 ? Number(value) : null;

function validateCatalog(value) {
  if (!value || value.version !== 1 || value.currency !== 'USD' || value.unit !== 'token' || value.provider !== 'openrouter' || !Number.isFinite(Date.parse(value.fetched_at)) || !Array.isArray(value.models) || value.models.length === 0 || value.models.length > 5000) throw new Error('Invalid pricing catalog');
  const seen = new Set();
  for (const row of value.models) {
    if (!row || typeof row.id !== 'string' || row.id.length > 200 || seen.has(row.id) || !row.rates || !/^https:\/\//.test(row.source || '')) throw new Error('Invalid or duplicate model tariff');
    seen.add(row.id);
    for (const key of RATE_KEYS) if (row.rates[key] !== null && amount(row.rates[key]) === null) throw new Error(`Invalid ${key} tariff`);
  }
  return value;
}

async function readPriceCatalog(projectDir) {
  try {
    const file = path.join(projectDir, PRICES_PATH);
    if ((await fs.stat(file)).size > 5 * 1024 * 1024) throw new Error('Pricing catalog exceeds 5 MB');
    return { ok: true, catalog: validateCatalog(JSON.parse(await fs.readFile(file, 'utf8'))) };
  } catch (error) {
    return { ok: false, reason: error.code === 'ENOENT' ? 'prices_not_loaded' : 'prices_invalid', detail: error.message, catalog: null };
  }
}

async function refreshPriceCatalog(projectDir, { fetchImpl = fetch, now = new Date().toISOString() } = {}) {
  const response = await fetchImpl(SOURCE, { signal: AbortSignal.timeout(10000), redirect: 'error' });
  if (!response.ok) throw new Error(`Pricing source returned HTTP ${response.status}`);
  let bytes = 0;
  const chunks = [];
  for await (const chunk of response.body) {
    bytes += chunk.byteLength;
    if (bytes > 5 * 1024 * 1024) throw new Error('Pricing response exceeds 5 MB');
    chunks.push(Buffer.from(chunk));
  }
  const raw = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  if (!Array.isArray(raw.data)) throw new Error('Pricing source did not return models');
  const models = raw.data.filter(item => item && typeof item.id === 'string' && item.pricing).map(item => ({
    id: item.id,
    source: SOURCE,
    context_window_tokens: Number.isSafeInteger(item.context_length) ? item.context_length : null,
    rates: { input: amount(item.pricing.prompt), output: amount(item.pricing.completion), cache_read: amount(item.pricing.input_cache_read), cache_write: amount(item.pricing.input_cache_write) },
    additional_pricing: Object.fromEntries(Object.entries(item.pricing).filter(([key, value]) => !['prompt', 'completion', 'input_cache_read', 'input_cache_write'].includes(key) && amount(value) > 0))
  }));
  const catalog = validateCatalog({ version: 1, currency: 'USD', provider: 'openrouter', unit: 'token', fetched_at: now, models });
  const file = path.join(projectDir, PRICES_PATH);
  await fs.mkdir(path.dirname(file), { recursive: true });
  const temp = `${file}.${crypto.randomUUID()}.tmp`;
  await fs.writeFile(temp, JSON.stringify(catalog, null, 2) + '\n');
  await fs.rename(temp, file);
  return catalog;
}

function findTariff(catalog, host, model) {
  const official = officialOpenAiTariff(host, model);
  if (official) return official;
  if (!catalog) return null;
  // Only exact identity mappings. Display names and configured-default are
  // deliberately not fuzzy matched to an API model with a different price.
  const id = host === 'codex' ? `openai/${model}` : host === 'claude' ? `anthropic/${model}` : host === 'opencode' && model.startsWith('openrouter/') ? model.slice('openrouter/'.length) : null;
  const row = catalog.models.find(item => item.id === id);
  return row ? { ...row, provider: catalog.provider, fetched_at: catalog.fetched_at, currency: catalog.currency, unit: catalog.unit } : null;
}

function estimateCost(usage, tariff) {
  if (!usage || !tariff) return { usd: null, complete: false, reason: usage ? 'exact_tariff_unavailable' : 'usage_unavailable', tariff: tariff || null };
  const mapping = { input: 'uncached_input_tokens', output: 'output_tokens', cache_read: 'cache_read_tokens', cache_write: 'cache_write_tokens' };
  let total = 0, upper = 0, known = 0;
  const missing = [];
  for (const [rate, key] of Object.entries(mapping)) {
    const tokens = usage[key];
    if (!Number.isSafeInteger(tokens) || tokens < 0) { missing.push(key); continue; }
    if (tokens === 0) { known++; continue; }
    const price = amount(tariff.rates[rate]);
    if (price === null) { missing.push(`${rate}_price`); continue; }
    known++; total += tokens * price;
    upper += tokens * price * (rate === 'output' ? tariff.long_context?.output_multiplier || 1 : tariff.long_context?.input_multiplier || 1);
  }
  const extras = Object.keys(tariff.additional_pricing || {}).length > 0;
  // Turn totals are not per-request context: never choose the expensive tier
  // from cumulative input. Show the Standard short/long envelope instead.
  const tierUnknown = Boolean(tariff.long_context && !(usage.complete !== false && Number.isSafeInteger(usage.input_tokens) && usage.input_tokens <= tariff.long_context.threshold));
  return { usd: known ? total : null, ...(tierUnknown ? { usd_upper: known ? upper : null, context_tier: 'unknown', range_basis: 'all_short_to_all_long_requests' } : {}), complete: missing.length === 0 && !extras && !tierUnknown && usage.complete !== false, reason: missing.length ? 'partial_usage_or_tariff' : tierUnknown ? 'per_request_context_unavailable' : extras ? 'token_estimate_excludes_other_charges' : null, missing, basis: 'equivalent_api_token_estimate', tariff };
}

module.exports = { PRICES_PATH, SOURCE, validateCatalog, readPriceCatalog, refreshPriceCatalog, findTariff, estimateCost };
