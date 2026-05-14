'use strict';

/**
 * Active Learning Loop — Phase 4 doctor curation checks.
 *
 * Pure-where-possible helpers consumed by `src/doctor.js#runDoctor`. The shape
 * mirrors `assessScoutPruning`: each helper returns `{ ok, items?, params?,
 * skipped?, reason? }` and `doctor.js` is responsible for translating to
 * `checks[].push(...)` rows with i18n keys.
 *
 * BR-ALL-11: MICRO projects opt out of these checks (caller short-circuits).
 * The helpers themselves do not read classification — they are pure data
 * functions over (db, fs).
 */

const fs = require('node:fs/promises');
const path = require('node:path');

const MIN_STALENESS_FEATURES = 5;
const MIN_DISTILLATION_LAG = 5;

// Pure: derive N = max(5, ceil(avg_days_between_last_5_features / 7)).
// Allows low-velocity projects (1 feature every 6 weeks) to stretch the
// window beyond the floor without penalising high-velocity teams.
function computeStalenessThreshold(featureCloseDates) {
  const sorted = (Array.isArray(featureCloseDates) ? featureCloseDates : [])
    .map((d) => +new Date(d))
    .filter((n) => Number.isFinite(n))
    .sort((a, b) => a - b);
  if (sorted.length < 2) return MIN_STALENESS_FEATURES;
  const last = sorted.slice(-5);
  const span = last[last.length - 1] - last[0];
  const avgDaysBetween = span / (24 * 60 * 60 * 1000) / (last.length - 1);
  return Math.max(MIN_STALENESS_FEATURES, Math.ceil(avgDaysBetween / 7));
}

async function readProjectClassification(targetDir) {
  try {
    const raw = await fs.readFile(path.join(targetDir, '.aioson/context/project.context.md'), 'utf8');
    const match = raw.match(/^classification\s*:\s*["']?([A-Z]+)["']?/m);
    return match ? match[1].trim().toUpperCase() : null;
  } catch {
    return null;
  }
}

async function readClosedFeatures(targetDir) {
  try {
    const raw = await fs.readFile(path.join(targetDir, '.aioson/context/features.md'), 'utf8');
    const closed = [];
    const lines = raw.split('\n');
    for (const line of lines) {
      // pipe-table row: | slug | status | started | completed |
      const m = line.match(/^\|\s*([\w-]+)\s*\|\s*(\w+)\s*\|\s*([\d-]+|—)\s*\|\s*([\d-]+|—)\s*\|/);
      if (!m) continue;
      const [, slug, status, , completed] = m;
      if (status === 'status' || slug === 'slug') continue; // header
      if (status !== 'done') continue;
      const date = completed && completed !== '—' ? completed : null;
      closed.push({ slug, completed: date });
    }
    return closed;
  } catch {
    return [];
  }
}

async function listRuleSlugs(targetDir) {
  try {
    const dir = path.join(targetDir, '.aioson/rules');
    const entries = await fs.readdir(dir, { withFileTypes: true });
    return entries
      .filter((e) => e.isFile() && e.name.endsWith('.md') && !e.name.startsWith('_'))
      .map((e) => e.name.slice(0, -3));
  } catch {
    return [];
  }
}

// assessRuleStaleness — returns the set of rules with zero `rule_loaded` event
// over the last `N` closed features. `N` = computeStalenessThreshold().
// payload_json.target_slug is the canonical identifier; payload_json.feature_slug
// associates the event with a feature (NULL when loaded outside a feature flow —
// EC-ALL-02). Both paths count toward "loaded at some point".
async function assessRuleStaleness({ db, targetDir, threshold, recentFeatureSlugs }) {
  const ruleSlugs = await listRuleSlugs(targetDir);
  if (ruleSlugs.length === 0) {
    return { ok: true, items: [], threshold, ruleCount: 0 };
  }

  // Build set of slugs that DID get loaded inside the last N features OR with
  // no feature_slug bound (outside any feature flow — still counts as alive).
  const rows = db.prepare(`
    SELECT DISTINCT json_extract(payload_json, '$.target_slug') AS slug,
                    json_extract(payload_json, '$.feature_slug') AS feature_slug
    FROM execution_events
    WHERE event_type = 'rule_loaded'
      AND payload_json IS NOT NULL
  `).all();

  const recent = new Set(recentFeatureSlugs);
  const loaded = new Set();
  for (const r of rows) {
    if (!r.slug) continue;
    if (r.feature_slug === null || r.feature_slug === undefined || recent.has(r.feature_slug)) {
      loaded.add(r.slug);
    }
  }

  const stale = ruleSlugs.filter((s) => !loaded.has(s));
  // Look up last_loaded_at for each stale rule (informational hint).
  const items = [];
  const lastLoadedStmt = db.prepare(`
    SELECT MAX(created_at) AS last
    FROM execution_events
    WHERE event_type = 'rule_loaded'
      AND json_extract(payload_json, '$.target_slug') = ?
  `);
  for (const slug of stale) {
    const r = lastLoadedStmt.get(slug);
    items.push({ slug, last_loaded_at: r && r.last ? r.last : null });
  }
  return { ok: stale.length === 0, items, threshold, ruleCount: ruleSlugs.length };
}

// assessLearningOrphans — learnings with status='promoted' whose `promoted_to`
// rule has zero `rule_loaded` events AFTER the promotion timestamp.
async function assessLearningOrphans({ db }) {
  const promoted = db.prepare(`
    SELECT learning_id, promoted_to, updated_at
    FROM project_learnings
    WHERE status = 'promoted'
      AND promoted_to IS NOT NULL
      AND promoted_to <> ''
  `).all();

  if (promoted.length === 0) return { ok: true, items: [] };

  const hasPostPromotionLoad = db.prepare(`
    SELECT 1
    FROM execution_events
    WHERE event_type = 'rule_loaded'
      AND (json_extract(payload_json, '$.target_path') = ?
           OR json_extract(payload_json, '$.target_slug') = ?)
      AND created_at > ?
    LIMIT 1
  `);

  const orphans = [];
  for (const row of promoted) {
    // target_slug is the basename without extension; target_path is the
    // full posix path (e.g. ".aioson/rules/foo.md"). Match either form.
    const slugFromPath = (() => {
      const p = String(row.promoted_to);
      const base = p.split('/').pop() || p;
      return base.endsWith('.md') ? base.slice(0, -3) : base;
    })();
    const hit = hasPostPromotionLoad.get(row.promoted_to, slugFromPath, row.updated_at || '1970-01-01T00:00:00.000Z');
    if (!hit) {
      orphans.push({
        learning_id: row.learning_id,
        promoted_to: row.promoted_to,
        promoted_at: row.updated_at || null
      });
    }
  }
  return { ok: orphans.length === 0, items: orphans };
}

// assessDistillationLag — fires when N≥5 features are status='done' in
// features.md but `evolution_log` has fewer than that many
// event_type='auto_distillation' rows tied to those slugs. Escape valve when
// the Phase 5 hook fails silently (BR-ALL-05).
async function assessDistillationLag({ db, closedFeatures }) {
  const closed = Array.isArray(closedFeatures) ? closedFeatures : [];
  if (closed.length < MIN_DISTILLATION_LAG) {
    return {
      ok: true,
      params: { closed: closed.length, distillations: null, threshold: MIN_DISTILLATION_LAG },
      items: []
    };
  }
  const slugs = closed.map((f) => f.slug);
  const placeholders = slugs.map(() => '?').join(',');
  const row = db.prepare(`
    SELECT COUNT(DISTINCT feature_slug) AS distillations
    FROM evolution_log
    WHERE event_type = 'auto_distillation'
      AND feature_slug IN (${placeholders})
  `).get(...slugs);
  const distillations = Number(row && row.distillations) || 0;
  const missing = slugs.filter((s) => {
    const hit = db.prepare(`
      SELECT 1 FROM evolution_log
      WHERE event_type = 'auto_distillation' AND feature_slug = ?
      LIMIT 1
    `).get(s);
    return !hit;
  });
  return {
    ok: distillations >= closed.length,
    params: { closed: closed.length, distillations, threshold: MIN_DISTILLATION_LAG },
    items: missing.map((slug) => ({ slug }))
  };
}

module.exports = {
  MIN_STALENESS_FEATURES,
  MIN_DISTILLATION_LAG,
  computeStalenessThreshold,
  readProjectClassification,
  readClosedFeatures,
  listRuleSlugs,
  assessRuleStaleness,
  assessLearningOrphans,
  assessDistillationLag
};
