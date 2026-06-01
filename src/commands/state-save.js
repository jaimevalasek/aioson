'use strict';

/**
 * aioson state:save (alias: dev:state:write) — create/update dev-state.md
 * for @dev session resumption.
 *
 * Stores active feature, phase, next step, spec version, and context package.
 * Invoked by upstream agents (@analyst, @product, @sheldon, @architect) at
 * session end so the next @dev activation auto-resumes on `next_step` instead
 * of cold-starting.
 *
 * Usage:
 *   aioson dev:state:write . --feature=checkout --phase=3 \
 *     --next="Implement notification listeners" --context=spec,requirements,impl-plan
 *   aioson state:save . --feature=checkout --next="Continue payment webhook"
 *
 * --context (optional): comma-separated canonical type tokens. Each token
 * resolves to a feature-scoped path. Max 4 entries total (including the
 * always-included project.context.md anchor). Unknown tokens or missing
 * files emit a warning and are skipped — never fail the command.
 *
 * Canonical context tokens:
 *   prd          → prd-{slug}.md
 *   requirements → requirements-{slug}.md
 *   spec         → spec-{slug}.md
 *   architecture → architecture.md
 *   impl-plan    → implementation-plan-{slug}.md
 *   sheldon      → sheldon-enrichment-{slug}.md
 *   design-doc   → design-doc-{slug}.md (falls back to design-doc.md)
 *   dossier      → features/{slug}/dossier.md
 *   simple-plan  → simple-plans/{slug}.md
 *
 * When --context is omitted, auto-detect kicks in (legacy behavior): include
 * project.context.md + spec-{slug}.md + plan if present.
 */

const fs = require('node:fs/promises');
const path = require('node:path');
const { contextDir, readFileSafe, parseFrontmatter, scanArtifacts } = require('../preflight-engine');

const MAX_CONTEXT = 4;

const CONTEXT_TYPE_MAP = {
  prd:           { rel: (slug) => `prd-${slug}.md` },
  requirements:  { rel: (slug) => `requirements-${slug}.md` },
  spec:          { rel: (slug) => `spec-${slug}.md` },
  architecture:  { rel: () => 'architecture.md' },
  'impl-plan':   { rel: (slug) => `implementation-plan-${slug}.md` },
  sheldon:       { rel: (slug) => `sheldon-enrichment-${slug}.md` },
  'design-doc':  { rel: (slug) => `design-doc-${slug}.md`, fallback: () => 'design-doc.md' },
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

async function runStateSave({ args, options = {}, logger }) {
  const targetDir = path.resolve(process.cwd(), args[0] || '.');
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
        if (await fileExistsRel(targetDir, fb)) {
          if (!contextPackage.includes(fb)) contextPackage.push(fb);
        } else {
          warnings.push(`"${token}" file missing (${relPath}); skipped`);
        }
      } else {
        warnings.push(`"${token}" file missing (${relPath}); skipped`);
      }
    }
  } else {
    // Auto-detect (legacy behavior): keep backward compatibility for callers
    // that haven't migrated to --context yet.
    if (artifacts.project_context.exists) contextPackage.push('project.context.md');
    if (artifacts.spec.exists) contextPackage.push(`spec-${slug}.md`);
    if (plan) contextPackage.push(plan);
    else if (artifacts.implementation_plan.exists) contextPackage.push(`implementation-plan-${slug}.md`);
  }

  const today = nowDate();
  const statePath = path.join(contextDir(targetDir), 'dev-state.md');

  const existingContent = await readFileSafe(statePath);
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

  await fs.mkdir(path.dirname(statePath), { recursive: true });
  await fs.writeFile(statePath, lines.join('\n'), 'utf8');

  const result = {
    ok: true,
    path: path.relative(targetDir, statePath),
    active_feature: slug,
    active_phase: phase,
    next_step: next,
    last_spec_version: specVersion,
    context_package: contextPackage,
    warnings
  };

  if (options.json) return result;

  logger.log('dev-state.md updated:');
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
 * Clears `.aioson/context/dev-state.md`. Idempotent: no-op when file is absent.
 *
 * Behavior:
 *   - Default: deletes the file outright.
 *   - With `--archive`: moves to `.aioson/runtime/devstate-history/{ISO}.md` for audit trail.
 *
 * Usage:
 *   aioson state:reset .
 *   aioson state:reset . --archive
 *   aioson state:reset . --archive --json
 */
async function runStateReset({ args, options = {}, logger }) {
  const targetDir = path.resolve(process.cwd(), args[0] || '.');
  const statePath = path.join(contextDir(targetDir), 'dev-state.md');
  const archive = Boolean(options.archive);

  let archivedTo = null;
  let removed = false;

  try {
    await fs.access(statePath);
  } catch {
    // AC-F1-03 — idempotent: no-op when absent.
    const result = { ok: true, removed: false, archived: null, reason: 'no_state_file' };
    if (options.json) return result;
    logger.log('state:reset — no dev-state.md present; nothing to do.');
    return result;
  }

  if (archive) {
    const historyDir = path.join(targetDir, '.aioson', 'runtime', 'devstate-history');
    await fs.mkdir(historyDir, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    archivedTo = path.join(historyDir, `${stamp}.md`);
    const content = await fs.readFile(statePath, 'utf8');
    await fs.writeFile(archivedTo, content, 'utf8');
  }

  await fs.unlink(statePath);
  removed = true;

  const result = {
    ok: true,
    removed,
    archived: archivedTo ? path.relative(targetDir, archivedTo) : null
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
