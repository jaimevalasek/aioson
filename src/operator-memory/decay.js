'use strict';

/**
 * operator-memory — per-category TTL decay engine (Phase 5, v1.16.0).
 *
 * PMD-03: category half-life (identity=365d, autonomy=180d, tooling=90d, default=90d).
 * Decay prompt fires when (now - last_reinforced) >= half_life, debounced 30d per slug
 * via _decay_state.json.
 *
 * Per-category override via env: AIOSON_OPERATOR_DECAY_<CATEGORY>_DAYS (e.g.
 * AIOSON_OPERATOR_DECAY_IDENTITY_DAYS=730 for 2-year identity persistence).
 */

const fs = require('node:fs');
const path = require('node:path');
const { getStorageRoot } = require('./storage');
const { readDecision } = require('./decision');
const { listDecisionSlugs } = require('./index-md');

const DECAY_STATE_FILE = '_decay_state.json';

const HALF_LIFE_DAYS_DEFAULT = {
  identity: 365,
  autonomy: 180,
  tooling: 90,
  default: 90
};

const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_PROMPT_DEBOUNCE_DAYS = 30;

function halfLifeForCategory(category) {
  const envKey = `AIOSON_OPERATOR_DECAY_${String(category).toUpperCase()}_DAYS`;
  const override = process.env[envKey];
  if (override && !Number.isNaN(Number(override))) {
    return Number(override);
  }
  return HALF_LIFE_DAYS_DEFAULT[category] ?? HALF_LIFE_DAYS_DEFAULT.default;
}

function decayStatePath(identity) {
  return path.join(getStorageRoot(identity), DECAY_STATE_FILE);
}

function loadDecayState(identity) {
  const p = decayStatePath(identity);
  if (!fs.existsSync(p)) return {};
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch {
    return {};
  }
}

function saveDecayState(identity, state) {
  const p = decayStatePath(identity);
  const tmp = `${p}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(state, null, 2), 'utf8');
  fs.renameSync(tmp, p);
}

/**
 * Compute days since last_reinforced for a decision.
 */
function daysSinceReinforced(decision, now = Date.now()) {
  const reinforced = new Date(decision.last_reinforced || decision.promoted_at || 0).getTime();
  if (!reinforced) return Infinity;
  return Math.floor((now - reinforced) / DAY_MS);
}

/**
 * Identify stale decisions whose decay-prompt debounce window has elapsed.
 *
 * @returns {Array<{slug, category, days_stale, half_life}>} candidates to surface
 */
function findStaleDecisions(identity, options = {}) {
  const now = options.now || Date.now();
  const debounceDays = options.debounceDays ?? DEFAULT_PROMPT_DEBOUNCE_DAYS;
  const state = loadDecayState(identity);
  const slugs = listDecisionSlugs(identity);
  const stale = [];

  for (const slug of slugs) {
    const decision = readDecision(identity, slug);
    if (!decision) continue;
    const category = decision.category || 'default';
    const halfLife = halfLifeForCategory(category);
    const daysStale = daysSinceReinforced(decision, now);
    if (daysStale < halfLife) continue;

    const last = state[slug];
    if (last) {
      const daysSincePrompt = Math.floor((now - new Date(last).getTime()) / DAY_MS);
      if (daysSincePrompt < debounceDays) continue;
    }
    stale.push({ slug, category, days_stale: daysStale, half_life: halfLife, title: decision.body?.slice(0, 80) || slug });
  }

  return stale;
}

/**
 * Mark a stale decision's prompt as shown (updates debounce timestamp).
 */
function markDecayPromptShown(identity, slug) {
  const state = loadDecayState(identity);
  state[slug] = new Date().toISOString();
  saveDecayState(identity, state);
}

function formatDecayPrompt(stale) {
  return `⏱ Memory '${stale.slug}' is ${stale.days_stale}d stale (${stale.category}, half-life=${stale.half_life}d). Still valid? aioson op:reinforce ${stale.slug} | op:forget ${stale.slug}`;
}

/**
 * Clean up history/ entries older than maxAgeDays (default 365). Phase 5
 * cleanup runs alongside decay sweep — hard-delete old soft-deleted items.
 *
 * @returns {Array<string>} paths of files removed
 */
function cleanupHistory(identity, options = {}) {
  const maxAgeDays = options.maxAgeDays || 365;
  const now = options.now || Date.now();
  const historyDir = path.join(getStorageRoot(identity), 'history');
  if (!fs.existsSync(historyDir)) return [];

  const removed = [];
  for (const f of fs.readdirSync(historyDir)) {
    if (!f.endsWith('.md')) continue;
    const full = path.join(historyDir, f);
    try {
      const stat = fs.statSync(full);
      const ageDays = Math.floor((now - stat.mtimeMs) / DAY_MS);
      if (ageDays >= maxAgeDays) {
        fs.unlinkSync(full);
        removed.push(full);
      }
    } catch { /* ignore */ }
  }

  return removed;
}

module.exports = {
  findStaleDecisions,
  markDecayPromptShown,
  formatDecayPrompt,
  cleanupHistory,
  loadDecayState,
  saveDecayState,
  halfLifeForCategory,
  daysSinceReinforced,
  HALF_LIFE_DAYS_DEFAULT,
  DEFAULT_PROMPT_DEBOUNCE_DAYS,
  DECAY_STATE_FILE,
  DAY_MS
};
