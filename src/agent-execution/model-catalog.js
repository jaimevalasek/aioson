'use strict';

const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { REASONING_EFFORTS } = require('./schema');

const DEFAULT_MAX_BYTES = 5 * 1024 * 1024;
const DEFAULT_MAX_MODELS = 1000;
const SAFE_MODEL_ID = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,199}$/;

function unavailable(reason) {
  return { available: false, reason, source: null, fetched_at: null, client_version: null, models: [] };
}

function codexHome(env, home) {
  const configured = typeof env.CODEX_HOME === 'string' ? env.CODEX_HOME.trim() : '';
  return configured || path.join(home, '.codex');
}

function normalizeEfforts(levels) {
  if (!Array.isArray(levels)) return [];
  const supported = new Set(REASONING_EFFORTS);
  return [...new Set(levels.map(level => typeof level === 'string' ? level : level?.effort)
    .filter(effort => typeof effort === 'string' && supported.has(effort)))];
}

function sanitizeModels(models) {
  if (!Array.isArray(models)) return [];
  const bySlug = new Map();
  for (const model of models) {
    const slug = typeof model?.slug === 'string' ? model.slug.trim() : '';
    if (!SAFE_MODEL_ID.test(slug) || bySlug.has(slug)) continue;
    const display = typeof model.display_name === 'string' && model.display_name.trim()
      ? model.display_name.trim().slice(0, 200)
      : slug;
    bySlug.set(slug, {
      slug,
      display_name: display,
      supported_efforts: normalizeEfforts(model.supported_reasoning_levels)
    });
  }
  return [...bySlug.values()];
}

async function loadModelCatalog(host, options = {}) {
  if (host !== 'codex') return unavailable('unsupported_model_catalog');
  const env = options.env || process.env;
  const home = options.home || os.homedir();
  const file = path.join(codexHome(env, home), 'models_cache.json');
  const maxBytes = Math.max(1, Number(options.maxBytes) || DEFAULT_MAX_BYTES);
  const maxModels = Math.max(1, Number(options.maxModels) || DEFAULT_MAX_MODELS);
  let stat;
  try {
    stat = await fs.stat(file);
  } catch {
    return unavailable('catalog_unavailable');
  }
  if (!stat.isFile()) return unavailable('catalog_unavailable');
  if (stat.size > maxBytes) return unavailable('catalog_too_large');
  let parsed;
  try {
    parsed = JSON.parse(await fs.readFile(file, 'utf8'));
  } catch {
    return unavailable('catalog_invalid');
  }
  if (Array.isArray(parsed?.models) && parsed.models.length > maxModels) return unavailable('catalog_too_many_models');
  const models = sanitizeModels(parsed?.models);
  if (!models.length) return unavailable('catalog_incompatible');
  return {
    available: true,
    reason: null,
    source: 'codex_local_cache',
    fetched_at: typeof parsed.fetched_at === 'string' ? parsed.fetched_at.slice(0, 100) : null,
    client_version: typeof parsed.client_version === 'string' ? parsed.client_version.slice(0, 50) : null,
    models
  };
}

module.exports = { DEFAULT_MAX_BYTES, DEFAULT_MAX_MODELS, loadModelCatalog, sanitizeModels };
