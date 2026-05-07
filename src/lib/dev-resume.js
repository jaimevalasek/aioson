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
  if (!raw) return { active_phase: null, next_step: null };
  const fmMatch = raw.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!fmMatch) return { active_phase: null, next_step: null };
  const fm = {};
  for (const line of fmMatch[1].split(/\r?\n/)) {
    const idx = line.indexOf(':');
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    const val = line.slice(idx + 1).trim().replace(/^["']|["']$/g, '');
    fm[key] = val;
  }
  return {
    active_phase: fm.active_phase || null,
    next_step: fm.next_step || null
  };
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
  const { active_phase, next_step: devStateNext } = extractDevStateFields(devStateRaw);

  const planManifestPath = path.join(targetDir, '.aioson', 'plans', featureSlug, 'manifest.md');
  const planRaw = await readFileOrNull(planManifestPath);
  const sheldonPlan = planRaw ? `.aioson/plans/${featureSlug}/manifest.md` : null;

  const artifactsConsumed = Array.isArray(lastHandoff && lastHandoff.artifact_uris)
    ? lastHandoff.artifact_uris
    : [];

  return {
    feature_slug: featureSlug,
    classification,
    current_phase: active_phase || 'unknown',
    artifacts_consumed: artifactsConsumed,
    code_map_paths: extractCodeMapPaths(dossierRaw),
    sheldon_plan: sheldonPlan,
    next_step: devStateNext || deriveNextStepFromPlan(planRaw)
  };
}

module.exports = {
  buildDevResumeData,
  extractDevStateFields,
  extractCodeMapPaths,
  deriveNextStepFromPlan
};
