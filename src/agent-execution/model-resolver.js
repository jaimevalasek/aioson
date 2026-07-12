'use strict';

const { MAX_MODEL_NAME_LENGTH, REASONING_EFFORTS } = require('./schema');

const LITERAL_MODEL_ID = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,199}$/;
const GENERIC_ALIASES = new Set(['gpt', 'model', 'openai', 'codex']);

function tokens(value) {
  return String(value || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().match(/[a-z]+|\d+/g) || [];
}

function normalizeModelName(value) { return tokens(value).join('-'); }
function numericTokens(value) { return tokens(value).filter(token => /^\d+$/.test(token)); }
function alphaTokens(value) { return tokens(value).filter(token => /^[a-z]+$/.test(token)); }

function distance(left, right) {
  const a = String(left); const b = String(right);
  if (a.length > MAX_MODEL_NAME_LENGTH || b.length > MAX_MODEL_NAME_LENGTH) return Number.POSITIVE_INFINITY;
  const matrix = Array.from({ length: a.length + 1 }, () => Array(b.length + 1).fill(0));
  for (let i = 0; i <= a.length; i++) matrix[i][0] = i;
  for (let j = 0; j <= b.length; j++) matrix[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(matrix[i - 1][j] + 1, matrix[i][j - 1] + 1, matrix[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        matrix[i][j] = Math.min(matrix[i][j], matrix[i - 2][j - 2] + cost);
      }
    }
  }
  return matrix[a.length][b.length];
}

function candidates(models) {
  return (Array.isArray(models) ? models : []).filter(model => model && typeof model.slug === 'string')
    .map(model => ({
      slug: model.slug,
      display_name: typeof model.display_name === 'string' ? model.display_name : model.slug,
      supported_efforts: Array.isArray(model.supported_efforts) ? model.supported_efforts : []
    }));
}

function uniqueBySlug(models) { return [...new Map(models.map(model => [model.slug, model])).values()]; }
function diagnosticSlugs(models) { return uniqueBySlug(models).map(model => model.slug).sort().slice(0, 5); }

function success(requested, model, strategy, catalog) {
  return {
    ok: true,
    requested,
    resolved: model.slug,
    strategy,
    catalog_source: catalog?.source || null,
    catalog_fetched_at: catalog?.fetched_at || null,
    supported_efforts: model.supported_efforts || []
  };
}

function failure(requested, reason, models = [], catalog = null) {
  return {
    ok: false,
    requested,
    resolved: null,
    reason,
    candidates: diagnosticSlugs(models),
    catalog_source: catalog?.source || null,
    catalog_fetched_at: catalog?.fetched_at || null
  };
}

function resolveModel(value, catalog) {
  const requested = typeof value === 'string' ? value.trim() : '';
  if (!requested) return failure(requested, 'invalid_model');
  if (requested.length > MAX_MODEL_NAME_LENGTH) return failure(requested.slice(0, MAX_MODEL_NAME_LENGTH), 'invalid_model');
  if (requested === 'configured-default') {
    return success(requested, { slug: requested, supported_efforts: [] }, 'configured_default', catalog);
  }
  if (!catalog?.available) {
    if (!LITERAL_MODEL_ID.test(requested)) return failure(requested, catalog?.reason || 'catalog_unavailable');
    return success(requested, { slug: requested, supported_efforts: [] }, 'unverified_literal', null);
  }
  const models = candidates(catalog.models);
  const exact = models.find(model => model.slug === requested);
  if (exact) return success(requested, exact, 'exact_slug', catalog);

  const requestedKey = normalizeModelName(requested);
  const normalized = uniqueBySlug(models.filter(model => normalizeModelName(model.slug) === requestedKey
    || normalizeModelName(model.display_name) === requestedKey));
  if (normalized.length === 1) return success(requested, normalized[0], 'normalized_name', catalog);
  if (normalized.length > 1) return failure(requested, 'ambiguous_model', normalized, catalog);

  const requestedTokens = tokens(requested);
  const isGeneric = requestedTokens.length === 1 && GENERIC_ALIASES.has(requestedTokens[0]);
  const isUsableAlias = requestedKey.length >= 4 && !isGeneric && requestedTokens.some(token => /^[a-z]+$/.test(token));
  if (isUsableAlias) {
    const alias = uniqueBySlug(models.filter(model => {
      const slugTokens = tokens(model.slug); const displayTokens = tokens(model.display_name);
      const suffix = list => list.length >= requestedTokens.length
        && requestedTokens.every((token, index) => token === list[list.length - requestedTokens.length + index]);
      return suffix(slugTokens) || suffix(displayTokens);
    }));
    if (alias.length === 1) return success(requested, alias[0], 'unique_alias', catalog);
    if (alias.length > 1) return failure(requested, 'ambiguous_model', alias, catalog);
  }

  const requestedNumbers = numericTokens(requested);
  const requestedAlpha = alphaTokens(requested);
  const eligible = models.filter(model => {
    const modelNumbers = numericTokens(model.slug);
    if (requestedNumbers.length && requestedNumbers.join('.') !== modelNumbers.join('.')) return false;
    const modelAlpha = alphaTokens(model.slug);
    return !requestedAlpha.length || requestedAlpha[0] === modelAlpha[0];
  });
  const ranked = eligible.map(model => ({ model, score: distance(requestedKey, normalizeModelName(model.slug)) }))
    .sort((a, b) => a.score - b.score || a.model.slug.localeCompare(b.model.slug));
  const maxDistance = Math.min(3, Math.max(1, Math.floor(requestedKey.length * 0.1)));
  if (!ranked.length || ranked[0].score > maxDistance) return failure(requested, 'model_not_found', [], catalog);
  const best = ranked.filter(item => item.score === ranked[0].score);
  if (best.length !== 1) return failure(requested, 'ambiguous_model', best.map(item => item.model), catalog);
  return success(requested, best[0].model, 'fuzzy_unique', catalog);
}

function validateReasoningEffort(resolution, effort) {
  if (effort === undefined || effort === null || effort === '') return { ok: true, reasoning_effort: null, verification: 'inherited' };
  if (!REASONING_EFFORTS.includes(effort)) return { ok: false, reason: 'invalid_reasoning_effort', supported: REASONING_EFFORTS };
  if (!resolution?.ok) return { ok: false, reason: resolution?.reason || 'model_resolution_failed', supported: [] };
  const supported = Array.isArray(resolution.supported_efforts) ? resolution.supported_efforts : [];
  if (supported.length && !supported.includes(effort)) return { ok: false, reason: 'unsupported_reasoning_effort', supported };
  return { ok: true, reasoning_effort: effort, verification: supported.length ? 'catalog' : 'unverified' };
}

module.exports = { distance, normalizeModelName, resolveModel, validateReasoningEffort };
