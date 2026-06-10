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
 *   - next_step (from dev-state.md or derived from plan manifest)
 */

const fs = require('node:fs/promises');
const path = require('node:path');

const { parseCodeMapBlock, parseYamlCodeMap } = require('../dossier/codemap-store');
const {
  parseFeaturesTable,
  parseFrontmatterField
} = require('../commands/dossier-audit');

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

async function buildDevResumeData(projectPath) {
  const targetDir = path.resolve(projectPath || '.');
  const ctxDir = path.join(targetDir, '.aioson', 'context');

  const lastHandoff = await readJsonOrNull(path.join(ctxDir, 'last-handoff.json'));
  const featureSlug = lastHandoff && lastHandoff.feature_slug ? lastHandoff.feature_slug : null;
  if (!featureSlug) return null;

  const featuresRaw = await readFileOrNull(path.join(ctxDir, 'features.md'));
  const features = featuresRaw ? parseFeaturesTable(featuresRaw) : [];
  const feature = features.find((f) => f.slug === featureSlug);
  if (!feature || feature.status !== 'in_progress') return null;

  const dossierPath = path.join(ctxDir, 'features', featureSlug, 'dossier.md');
  const dossierRaw = await readFileOrNull(dossierPath);

  const prdRaw = await readFileOrNull(path.join(ctxDir, `prd-${featureSlug}.md`));
  const specRaw = await readFileOrNull(path.join(ctxDir, `spec-${featureSlug}.md`));
  const classification = readClassificationFromFrontmatters([dossierRaw, prdRaw, specRaw]);

  const devStateRaw = await readFileOrNull(path.join(ctxDir, 'dev-state.md'));
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

module.exports = {
  buildDevResumeData,
  extractDevStateFields,
  isCurrentDevStateForFeature,
  extractCodeMapPaths,
  deriveNextStepFromPlan,
  readCorrectionsStatus,
  listOpenCorrections
};
