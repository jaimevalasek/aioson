'use strict';

/**
 * dev-resume — build the resume payload @dev consumes when starting a new chat.
 *
 * Returns null if no in-progress feature is detected (so @dev knows it is a
 * cold start). Otherwise returns an envelope with:
 *   - feature_slug, classification, current_phase
 *   - artifacts_consumed (from last-handoff.json artifact_uris, v2 form)
 *   - code_map_paths (from dossier ## Code Map files[].path)
 *   - sheldon_plan (path if .aioson/plans/{slug}/manifest.md exists)
 *   - next_step (from the feature's dev-state.md or derived from plan manifest)
 *
 * The feature is the one asked for (`feature`), else the one the live session
 * running this works on, else the last handoff's. The state is that feature's
 * own file (features/<slug>/dev-state.md); the project-level dev-state.md
 * counts only while it names the same feature.
 */

const fs = require('node:fs/promises');
const path = require('node:path');

const { parseCodeMapBlock, parseYamlCodeMap } = require('../dossier/codemap-store');
const {
  parseFeaturesTable,
  parseFrontmatterField
} = require('../commands/dossier-audit');
const { featureDevStateRel } = require('../preflight-engine');
const { readSessionFeature } = require('./session-feature');

async function readFileOrNull(filePath) {
  try {
    return await fs.readFile(filePath, 'utf8');
  } catch (err) {
    if (err && err.code === 'ENOENT') return null;
    throw err;
  }
}

async function readJsonOrNull(filePath) {
  const raw = await readFileOrNull(filePath);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

// First match wins, so callers list sources by authority: the PRD carries the
// feature's tier (classify --apply); the dossier holds a bootstrap-time copy.
function readClassificationFromFrontmatters(rawList) {
  for (const raw of rawList) {
    if (!raw) continue;
    const cls = parseFrontmatterField(raw, 'classification');
    if (cls) return cls.toUpperCase();
  }
  return null;
}

function extractDevStateFields(raw) {
  if (!raw) return { active_feature: null, active_phase: null, next_step: null, status: null };
  const fmMatch = raw.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!fmMatch) return { active_feature: null, active_phase: null, next_step: null, status: null };
  const fm = {};
  for (const line of fmMatch[1].split(/\r?\n/)) {
    const idx = line.indexOf(':');
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    const val = line.slice(idx + 1).trim().replace(/^["']|["']$/g, '');
    fm[key] = val;
  }
  return {
    active_feature: fm.active_feature || null,
    active_phase: fm.active_phase || null,
    next_step: fm.next_step || null,
    status: fm.status || null
  };
}

function isCurrentDevStateForFeature(fields, featureSlug) {
  if (!fields) return false;
  if (!fields.active_feature) return false;
  const status = String(fields.status || '').toLowerCase();
  if (status === 'done' || status === 'abandoned') return false;
  if (fields.active_feature !== featureSlug) return false;
  return true;
}

function extractCodeMapPaths(dossierRaw) {
  if (!dossierRaw) return [];
  const block = parseCodeMapBlock(dossierRaw);
  if (!block) return [];
  const yamlText = dossierRaw.slice(block.codeStart, block.codeEnd);
  const map = parseYamlCodeMap(yamlText);
  if (!Array.isArray(map.files)) return [];
  const paths = map.files
    .map((f) => (f && typeof f.path === 'string' ? f.path : null))
    .filter(Boolean);
  return Array.from(new Set(paths));
}

function readCorrectionsStatus(raw) {
  const fmMatch = raw.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  // No frontmatter or no status field: treat as open — a corrections plan
  // must never be silently skipped because of a malformed header.
  if (!fmMatch) return 'open';
  for (const line of fmMatch[1].split(/\r?\n/)) {
    const m = line.match(/^status:\s*([^#]*)/);
    if (m) {
      const val = m[1].trim().replace(/^["']|["']$/g, '').toLowerCase();
      return val || 'open';
    }
  }
  return 'open';
}

async function listOpenCorrections(targetDir, featureSlug) {
  const planDir = path.join(targetDir, '.aioson', 'plans', featureSlug);
  let entries;
  try {
    entries = await fs.readdir(planDir);
  } catch (err) {
    if (err && err.code === 'ENOENT') return [];
    throw err;
  }
  const out = [];
  for (const name of entries.filter((n) => /^corrections-.+\.md$/.test(n)).sort()) {
    const raw = await readFileOrNull(path.join(planDir, name));
    if (!raw) continue;
    const status = readCorrectionsStatus(raw);
    if (status === 'open' || status === 'in_progress') {
      out.push(`.aioson/plans/${featureSlug}/${name}`);
    }
  }
  return out;
}

function deriveNextStepFromPlan(planRaw) {
  if (!planRaw) return null;
  const lines = planRaw.split('\n');
  for (const line of lines) {
    const m = line.match(/^[-*]\s+\[\s*\]\s+(.+)$/);
    if (m) return m[1].trim();
  }
  return null;
}

async function buildDevResumeData(projectPath, { feature: requestedFeature = null, env = process.env } = {}) {
  const targetDir = path.resolve(projectPath || '.');
  const ctxDir = path.join(targetDir, '.aioson', 'context');

  const lastHandoffRaw = await readJsonOrNull(path.join(ctxDir, 'last-handoff.json'));
  const featuresRaw = await readFileOrNull(path.join(ctxDir, 'features.md'));
  const features = featuresRaw ? parseFeaturesTable(featuresRaw) : [];
  const inProgress = (slug) => Boolean(slug) && features.some((f) => f.slug === slug && f.status === 'in_progress');

  // The last handoff is one per project: with two sessions on two features it
  // is whichever handed off last, so the session's own feature comes first.
  const session = requestedFeature ? null : await readSessionFeature(targetDir, env).catch(() => null);
  const candidates = requestedFeature
    ? [requestedFeature]
    : [session && session.feature, lastHandoffRaw && lastHandoffRaw.feature_slug];
  const featureSlug = candidates.find(inProgress) || null;
  if (!featureSlug) return null;
  // A handoff of another feature says nothing about this one.
  const lastHandoff = lastHandoffRaw && lastHandoffRaw.feature_slug === featureSlug ? lastHandoffRaw : null;

  const dossierPath = path.join(ctxDir, 'features', featureSlug, 'dossier.md');
  const dossierRaw = await readFileOrNull(dossierPath);

  const prdRaw = await readFileOrNull(path.join(ctxDir, `prd-${featureSlug}.md`));
  const specRaw = await readFileOrNull(path.join(ctxDir, `spec-${featureSlug}.md`));
  const classification = readClassificationFromFrontmatters([prdRaw, specRaw, dossierRaw]);

  const ownStateRel = featureDevStateRel(featureSlug);
  const devStateRaw = (ownStateRel ? await readFileOrNull(path.join(ctxDir, ownStateRel)) : null)
    || await readFileOrNull(path.join(ctxDir, 'dev-state.md'));
  const devStateFields = extractDevStateFields(devStateRaw);
  const useDevState = isCurrentDevStateForFeature(devStateFields, featureSlug);

  const planManifestPath = path.join(targetDir, '.aioson', 'plans', featureSlug, 'manifest.md');
  const planRaw = await readFileOrNull(planManifestPath);
  const sheldonPlan = planRaw ? `.aioson/plans/${featureSlug}/manifest.md` : null;

  const artifactsConsumed = Array.isArray(lastHandoff && lastHandoff.artifact_uris)
    ? lastHandoff.artifact_uris
    : [];

  const decisionRationale = Array.isArray(lastHandoff && lastHandoff.decision_rationale)
    ? lastHandoff.decision_rationale
    : [];

  // QA corrections plans with status open/in_progress take precedence over any
  // persisted next_step: a stale dev-state pointer must not hide mandatory
  // corrections from a fresh @dev session (loop-guardrails incident, 2026-06-09).
  const openCorrections = await listOpenCorrections(targetDir, featureSlug);
  const baseNextStep = useDevState && devStateFields.next_step
    ? devStateFields.next_step
    : deriveNextStepFromPlan(planRaw);

  return {
    feature_slug: featureSlug,
    classification,
    current_phase: useDevState && devStateFields.active_phase ? devStateFields.active_phase : 'unknown',
    artifacts_consumed: artifactsConsumed,
    code_map_paths: extractCodeMapPaths(dossierRaw),
    sheldon_plan: sheldonPlan,
    next_step: openCorrections.length > 0
      ? `Apply mandatory corrections from ${openCorrections[0]}, then return to @qa for re-verification`
      : baseNextStep,
    open_corrections: openCorrections.length > 0 ? openCorrections : undefined,
    decision_rationale: decisionRationale.length > 0 ? decisionRationale : undefined
  };
}

// A thread older than this is history, not a second chat: it does not make a
// resume ambiguous (a project keeps a stale in_progress state for weeks).
const OPEN_THREAD_WINDOW_DAYS = 7;
const CLOSED_FEATURE_STATUSES = new Set(['done', 'abandoned', 'paused']);

const CLOSED_PLAN_STATUSES = new Set(['done', 'abandoned', 'paused']);

function readFrontmatterValue(raw, key) {
  const match = String(raw || '').match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) return null;
  const line = match[1].split(/\r?\n/).find((entry) => entry.startsWith(`${key}:`));
  if (!line) return null;
  return line.slice(key.length + 1).replace(/#.*$/, '').trim().replace(/^["']|["']$/g, '').toLowerCase() || null;
}

function readLastUpdated(raw) {
  const value = readFrontmatterValue(raw, 'last_updated');
  return value && /^\d{4}-\d{2}-\d{2}/.test(value) ? value.slice(0, 10) : null;
}

/**
 * The dev threads open in this folder: one per `features/<slug>/dev-state.md`
 * still in progress — a tracked feature or a Simple Plan alike, the state
 * `dev:state:write` keeps for each. The project-level dev-state.md is NOT a
 * source: it is the copy of whoever wrote last, which is exactly the pointer
 * two chats on one folder overwrite for each other.
 *
 * Newest first. `stale` marks a thread untouched for OPEN_THREAD_WINDOW_DAYS.
 */
async function listOpenDevThreads(targetDir, { now = Date.now() } = {}) {
  const ctxDir = path.join(path.resolve(targetDir || '.'), '.aioson', 'context');
  let slugs;
  try {
    slugs = await fs.readdir(path.join(ctxDir, 'features'));
  } catch (err) {
    if (err && err.code === 'ENOENT') return [];
    throw err;
  }
  const featuresRaw = await readFileOrNull(path.join(ctxDir, 'features.md'));
  const statusOf = new Map((featuresRaw ? parseFeaturesTable(featuresRaw) : []).map((row) => [row.slug, String(row.status || '').toLowerCase()]));
  const threads = [];
  for (const slug of slugs.sort()) {
    const relative = featureDevStateRel(slug);
    if (!relative || CLOSED_FEATURE_STATUSES.has(statusOf.get(slug))) continue;
    const file = path.join(ctxDir, relative);
    const raw = await readFileOrNull(file);
    if (!raw) continue;
    const fields = extractDevStateFields(raw);
    if (!isCurrentDevStateForFeature(fields, slug)) continue;
    // A finished Simple Plan leaves its dev-state `in_progress` (the lane writes
    // it only while work remains): the plan's own status is what closes the thread.
    const planRaw = await readFileOrNull(path.join(ctxDir, 'simple-plans', `${slug}.md`));
    if (planRaw && CLOSED_PLAN_STATUSES.has(readFrontmatterValue(planRaw, 'status'))) continue;
    const lastUpdated = readLastUpdated(raw);
    const modified = await fs.stat(file).then((stat) => stat.mtimeMs).catch(() => 0);
    const touched = lastUpdated ? Date.parse(`${lastUpdated}T00:00:00Z`) : modified;
    threads.push({
      feature: slug,
      kind: planRaw ? 'simple-plan' : 'feature',
      phase: fields.active_phase,
      next_step: fields.next_step,
      last_updated: lastUpdated,
      stale: now - touched > OPEN_THREAD_WINDOW_DAYS * 86400000,
      modified
    });
  }
  return threads
    .sort((a, b) => String(b.last_updated || '').localeCompare(String(a.last_updated || '')) || b.modified - a.modified)
    .map(({ modified: _modified, ...thread }) => thread);
}

module.exports = {
  OPEN_THREAD_WINDOW_DAYS,
  listOpenDevThreads,
  buildDevResumeData,
  extractDevStateFields,
  isCurrentDevStateForFeature,
  extractCodeMapPaths,
  deriveNextStepFromPlan,
  readCorrectionsStatus,
  listOpenCorrections
};
