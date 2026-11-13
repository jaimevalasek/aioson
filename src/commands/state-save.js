'use strict';

/**
 * aioson state:save (alias: dev:state:write) — create/update dev-state.md
 * for @dev session resumption.
 *
 * Stores active feature, phase, next step, and a compact context package.
 * Each feature has its own file — .aioson/context/features/<slug>/dev-state.md
 * — so two features in progress never overwrite each other's phase, next step
 * or history. .aioson/context/dev-state.md stays as a copy of the last one
 * written: the file a reader that names no feature opens.
 * Invoked by upstream agents (@product, @sheldon, @planner; legacy specialists supported) at
 * session end so the next @dev activation auto-resumes on `next_step` instead
 * of cold-starting.
 *
 * Usage:
 *   aioson dev:state:write . --feature=checkout --phase=3 \
 *     --next="Implement notification listeners" --context=prd,impl-plan
 *   aioson state:save . --feature=checkout --next="Continue payment webhook"
 *
 * --context (optional): comma-separated canonical type tokens. Each token
 * resolves to a feature-scoped path. Max 4 entries total (including the
 * always-included project.context.md anchor). Unknown tokens or missing
 * files emit a warning and are skipped — never fail the command.
 *
 * Canonical context tokens:
 *   prd          → prd-{slug}.md
 *   impl-plan    → implementation-plan-{slug}.md
 *   sheldon      → prd-{slug}.md (compatibility alias)
 *   requirements/spec/architecture/design-doc/readiness remain legacy optional tokens
 *   design-doc   → design-doc-{slug}.md (falls back to design-doc.md)
 *   readiness    → readiness-{slug}.md (falls back to readiness.md)
 *   ui-spec      → ui-spec.md
 *   dossier      → features/{slug}/dossier.md
 *   simple-plan  → simple-plans/{slug}.md
 *
 * When --context is omitted, auto-detect includes project context + reviewed PRD
 * + implementation plan when present.
 *
 * `--phase=<n>` means phase n just finished. Besides the rotating History below,
 * each write appends a stamped line to the ledger `dev:progress` reads.
 */

const fs = require('node:fs/promises');
const path = require('node:path');
const { contextDir, readFileSafe, parseFrontmatter, scanArtifacts, featureDevStateRel } = require('../preflight-engine');
const { resolveTargetDir } = require('../lib/project-root');
const { isUsableDesignDocFile } = require('../lib/design-doc-seed');
const { appendPhaseCheckpoint } = require('../lib/dev-progress');
const { exists } = require('../utils');

const MAX_CONTEXT = 4;

const CONTEXT_TYPE_MAP = {
  prd:           { rel: (slug) => `prd-${slug}.md` },
  requirements:  { rel: (slug) => `requirements-${slug}.md` },
  spec:          { rel: (slug) => `spec-${slug}.md` },
  architecture:  { rel: () => 'architecture.md' },
  'impl-plan':   { rel: (slug) => `implementation-plan-${slug}.md` },
  sheldon:       { rel: (slug) => `prd-${slug}.md` },
  'design-doc':  { rel: (slug) => `design-doc-${slug}.md`, fallback: () => 'design-doc.md' },
  readiness:     { rel: (slug) => `readiness-${slug}.md`, fallback: () => 'readiness.md' },
  'ui-spec':      { rel: () => 'ui-spec.md' },
  dossier:       { rel: (slug) => `features/${slug}/dossier.md` },
  'simple-plan': { rel: (slug) => `simple-plans/${slug}.md` }
};

function nowDate() {
  return new Date().toISOString().slice(0, 10);
}

function parseContextFlag(value) {
  if (value === undefined || value === null || value === '') return null;
  return String(value).split(',').map((s) => s.trim()).filter(Boolean);
}

async function fileExistsRel(targetDir, rel) {
  try {
    await fs.access(path.join(contextDir(targetDir), rel));
    return true;
  } catch {
    return false;
  }
}

// The feature's own state file and the project-level copy, then the stamped line
// `dev:progress` reads. A failed stamp never fails the checkpoint.
async function writeCheckpoint(targetDir, statePaths, text, stamp, now, warnings) {
  for (const statePath of statePaths) {
    await fs.mkdir(path.dirname(statePath), { recursive: true });
    await fs.writeFile(statePath, text, 'utf8');
  }
  const checkpoint = await appendPhaseCheckpoint(targetDir, stamp, now);
  if (!checkpoint.ok) warnings.push(`phase stamp not recorded (${checkpoint.reason}); dev:progress will not count this checkpoint`);
}

// The state a write continues (its phase when `--phase` is omitted, and its
// history): this feature's own file. The project-level file continues them
// only while it is this feature's (a state written before features had their
// own) — another feature's phase and history are not this one's to inherit.
async function readStateToContinue(slug, statePath, featurePath) {
  const sharedContent = await readFileSafe(statePath);
  if (!featurePath) return sharedContent;
  const ownContent = await readFileSafe(featurePath);
  if (ownContent) return ownContent;
  const sharedFeature = sharedContent ? String(parseFrontmatter(sharedContent).active_feature || '').trim() : '';
  return sharedFeature === slug ? sharedContent : null;
}

async function runStateSave({ args, options = {}, logger, now = Date.now }) {
  const targetDir = resolveTargetDir(args);
  const slug = options.feature ? String(options.feature) : null;
  const phase = options.phase ? String(options.phase) : null;
  const next = options.next ? String(options.next) : null;
  const specVersion = options['spec-version'] ? String(options['spec-version']) : null;
  const status = options.status ? String(options.status) : 'in_progress';
  const plan = options.plan ? String(options.plan) : null;
  const contextTokens = parseContextFlag(options.context);

  if (!slug) {
    if (options.json) return { ok: false, reason: 'missing_feature' };
    logger.log('--feature=<slug> is required.');
    return { ok: false };
  }

  if (!next) {
    if (options.json) return { ok: false, reason: 'missing_next' };
    logger.log('--next="<next step>" is required.');
    return { ok: false };
  }

  // Build context package
  const artifacts = await scanArtifacts(targetDir, slug);
  const contextPackage = [];
  const warnings = [];

  if (contextTokens) {
    // Explicit mode: agent declares the canonical types to include.
    // Always anchor with project.context.md (counts toward the 4-entry cap).
    if (artifacts.project_context.exists) contextPackage.push('project.context.md');

    for (const rawToken of contextTokens) {
      const token = rawToken.toLowerCase();
      if (contextPackage.length >= MAX_CONTEXT) {
        warnings.push(`context cap reached (${MAX_CONTEXT}); skipped "${token}" and remaining`);
        break;
      }
      const def = CONTEXT_TYPE_MAP[token];
      if (!def) {
        warnings.push(`unknown context type "${token}" (valid: ${Object.keys(CONTEXT_TYPE_MAP).join(', ')})`);
        continue;
      }
      const relPath = def.rel(slug);
      if (await fileExistsRel(targetDir, relPath)) {
        if (!contextPackage.includes(relPath)) contextPackage.push(relPath);
      } else if (def.fallback) {
        const fb = def.fallback();
        // A slug-less design-doc.md may be the retired installer seed (the
        // framework's own code layout) — never the feature design document.
        const fbUsable = token === 'design-doc'
          ? await isUsableDesignDocFile(path.join(contextDir(targetDir), fb))
          : await fileExistsRel(targetDir, fb);
        if (fbUsable) {
          if (!contextPackage.includes(fb)) contextPackage.push(fb);
        } else {
          warnings.push(`"${token}" file missing (${relPath}); skipped`);
        }
      } else {
        warnings.push(`"${token}" file missing (${relPath}); skipped`);
      }
    }
  } else {
    // Auto-detect the compact canonical implementation context.
    if (artifacts.project_context.exists) contextPackage.push('project.context.md');
    if (artifacts.prd.exists) contextPackage.push(`prd-${slug}.md`);
    if (plan) contextPackage.push(plan);
    else if (artifacts.implementation_plan.exists) contextPackage.push(`implementation-plan-${slug}.md`);
  }

  const today = nowDate();
  const statePath = path.join(contextDir(targetDir), 'dev-state.md');
  const featureRel = featureDevStateRel(slug);
  const featurePath = featureRel ? path.join(contextDir(targetDir), featureRel) : null;
  if (!featurePath) warnings.push(`"${slug}" cannot name a feature folder; only dev-state.md was written`);

  const existingContent = await readStateToContinue(slug, statePath, featurePath);
  const existingFm = existingContent ? parseFrontmatter(existingContent) : {};

  // Build history entry
  const historyLine = `- ${today}: phase ${phase || existingFm.active_phase || '?'} — ${next}`;
  const existingHistory = [];
  if (existingContent) {
    const historyMatch = existingContent.match(/## History\n([\s\S]*?)(?=\n##|\s*$)/);
    if (historyMatch) {
      const lines = historyMatch[1].split('\n').filter((l) => l.trim().startsWith('-'));
      existingHistory.push(...lines.slice(-4)); // keep last 4 + new = 5 total
    }
  }
  const history = [...existingHistory, historyLine];

  const lines = [
    '---',
    `last_updated: ${today}`,
    `active_feature: ${slug}`,
    phase ? `active_phase: ${phase}` : (existingFm.active_phase ? `active_phase: ${existingFm.active_phase}` : null),
    `next_step: "${next}"`,
    specVersion ? `last_spec_version: ${specVersion}` : (existingFm.last_spec_version ? `last_spec_version: ${existingFm.last_spec_version}` : null),
    `status: ${status}`,
    '---',
    '',
    '# Dev State',
    '',
    `**Feature:** ${slug}`,
    phase ? `**Phase:** ${phase}` : null,
    `**Status:** ${status}`,
    `**Next step:** ${next}`,
    '',
    '## Context package',
    '',
    ...contextPackage.map((f, i) => `${i + 1}. ${f}`),
    '',
    '## History',
    '',
    ...history,
    ''
  ].filter((l) => l !== null);

  await writeCheckpoint(
    targetDir,
    featurePath ? [featurePath, statePath] : [statePath],
    lines.join('\n'),
    { feature: slug, phase, next },
    now,
    warnings
  );

  const result = {
    ok: true,
    path: path.relative(targetDir, statePath),
    feature_path: featurePath ? path.relative(targetDir, featurePath) : null,
    active_feature: slug,
    active_phase: phase,
    next_step: next,
    last_spec_version: specVersion,
    context_package: contextPackage,
    warnings
  };

  if (options.json) return result;

  logger.log('dev-state.md updated:');
  if (result.feature_path) logger.log(`  feature state: ${result.feature_path.split(path.sep).join('/')}`);
  logger.log(`  active_feature: ${slug}`);
  if (phase) logger.log(`  active_phase: ${phase}`);
  logger.log(`  next_step: "${next}"`);
  if (specVersion) logger.log(`  last_spec_version: ${specVersion}`);
  logger.log(`  context_package: [${contextPackage.join(', ')}]`);
  for (const w of warnings) logger.log(`  warn: ${w}`);
  if (warnings.length === 0 && contextTokens) {
    // Visible confirmation banner — agent kernels can rely on this to know
    // they fulfilled the dev-state.md producer contract for @dev cold-resume.
    const preview = next.length > 80 ? `${next.slice(0, 77)}...` : next;
    logger.log(`  ✓ @dev will auto-resume on cold start: next_step="${preview}"`);
  }

  return result;
}

/**
 * runStateReset — F1 (workflow-handoff-integrity v1.9.7)
 *
 * Clears `.aioson/context/dev-state.md` and the own file of the feature it
 * names (`features/<slug>/dev-state.md`): left behind, that one would be read
 * again by the next `preflight --feature=<slug>`. Idempotent: no-op when
 * there is nothing to clear.
 *
 * With `--feature=<slug>` it clears that feature's state and nothing else:
 * its own file, and the project-level file only while it names that feature.
 *
 * Behavior:
 *   - Default: deletes the file(s) outright.
 *   - With `--archive`: keeps a copy under `.aioson/runtime/devstate-history/`
 *     (`{ISO}.md`; `{ISO}-<slug>.md` for a feature file that differs from it).
 *
 * Usage:
 *   aioson state:reset .
 *   aioson state:reset . --archive
 *   aioson state:reset . --feature=checkout --archive --json
 */
async function runStateReset({ args, options = {}, logger }) {
  const targetDir = resolveTargetDir(args);
  const statePath = path.join(contextDir(targetDir), 'dev-state.md');
  const archive = Boolean(options.archive);
  const requested = typeof options.feature === 'string' ? options.feature.trim() : '';

  const sharedExists = await exists(statePath);
  const sharedContent = sharedExists ? await fs.readFile(statePath, 'utf8') : null;
  const sharedFeature = sharedContent ? String(parseFrontmatter(sharedContent).active_feature || '').trim() : '';
  const feature = requested || sharedFeature;
  const featureRel = feature ? featureDevStateRel(feature) : null;
  const featurePath = featureRel ? path.join(contextDir(targetDir), featureRel) : null;
  const clearShared = sharedExists && (!requested || sharedFeature === requested);
  const clearFeature = Boolean(featurePath) && await exists(featurePath);

  if (!clearShared && !clearFeature) {
    // AC-F1-03 — idempotent: no-op when absent.
    const reason = sharedExists ? 'points_to_other' : 'no_state_file';
    const result = { ok: true, removed: false, archived: null, reason, ...(sharedExists ? { active_feature: sharedFeature || null } : {}) };
    if (options.json) return result;
    logger.log(sharedExists
      ? `state:reset — dev-state.md names ${sharedFeature || 'no feature'}, not ${requested}; nothing to do.`
      : 'state:reset — no dev-state.md present; nothing to do.');
    return result;
  }

  let archivedTo = null;
  const featureContent = clearFeature ? await fs.readFile(featurePath, 'utf8') : null;
  if (archive) {
    const historyDir = path.join(targetDir, '.aioson', 'runtime', 'devstate-history');
    await fs.mkdir(historyDir, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    if (clearShared) {
      archivedTo = path.join(historyDir, `${stamp}.md`);
      await fs.writeFile(archivedTo, sharedContent, 'utf8');
    }
    // The project-level file is normally a copy of the feature's: one archive.
    if (clearFeature && (!clearShared || featureContent !== sharedContent)) {
      const featureArchive = path.join(historyDir, `${stamp}-${feature}.md`);
      await fs.writeFile(featureArchive, featureContent, 'utf8');
      archivedTo = archivedTo || featureArchive;
    }
  }

  if (clearShared) await fs.unlink(statePath);
  if (clearFeature) await fs.unlink(featurePath);
  const removed = true;

  const result = {
    ok: true,
    removed,
    archived: archivedTo ? path.relative(targetDir, archivedTo) : null,
    feature_state_removed: clearFeature
  };

  if (options.json) return result;

  if (archivedTo) {
    logger.log(`state:reset — dev-state.md archived to ${result.archived} and removed.`);
  } else {
    logger.log('state:reset — dev-state.md removed (no archive).');
  }
  return result;
}

module.exports = {
  runStateSave,
  runStateReset,
  CONTEXT_TYPE_MAP,
  MAX_CONTEXT,
  parseContextFlag
};
