'use strict';

/**
 * aioson prototype:check — deterministic fidelity guard for the prototype contract.
 *
 * When a PRD carries a `## Prototype reference` (the carrier @product writes), this
 * command verifies that the prototype actually reaches the build:
 *   1. the referenced prototype.html + manifest exist (no dangling pointer);
 *   2. a requirements-{slug}.md bridge exists;
 *   3. the Core interactions the manifest lists are echoed as acceptance criteria
 *      in requirements (this is the only place infidelity becomes machine-checkable —
 *      @validator never reads the prototype, only the AC authored by @analyst).
 *
 * It is a STRUCTURAL check, not a semantic one: coverage is a folded substring match
 * of each manifest interaction phrase against the requirements text. The prototype
 * contract instructs @analyst to echo the interaction names verbatim
 * (e.g. "add card persists and re-renders"), so the match is deterministic, not fuzzy.
 *
 * Features with no `## Prototype reference` are a no-op (status: not_applicable).
 *
 * Usage:
 *   aioson prototype:check . --feature=kanban
 *   aioson prototype:check . --feature=kanban --json
 */

const path = require('node:path');
const { readFileSafe, contextDir } = require('../preflight-engine');

const BAR = '━'.repeat(30);

// Match the surface detectors: fold diacritics so a localized requirements file
// (pt-BR ACs) is compared the same way as an English one.
function fold(s) {
  return String(s || '').normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
}

// The `## Prototype reference` section body, if present. Captures from the heading
// to the next `## ` heading or end of file (no `m` flag, so `$` means end-of-input).
function prototypeReferenceSection(prd) {
  const m = String(prd || '').match(/##\s+Prototype reference[^\n]*\n([\s\S]*?)(?=\n##\s|$)/i);
  return m ? m[1] : null;
}

function parsePath(section, key) {
  const m = String(section || '').match(new RegExp(`^[-*]\\s*${key}:\\s*(\\S+)`, 'mi'));
  return m ? m[1] : null;
}

// Core interactions are listed in the manifest as backtick-quoted tokens
// (e.g. - `add card` — ...). Prefer a "Core interactions" section; fall back to the
// whole manifest so older manifests still yield tokens. Deduped, normalized.
function extractInteractions(manifest) {
  const text = String(manifest || '');
  const section = text.match(/##\s+Core interactions[\s\S]*?(?=\n##\s|$)/i);
  const scope = section ? section[0] : text;
  const tokens = [...scope.matchAll(/`([^`]+)`/g)].map((t) => t[1].trim()).filter(Boolean);
  return [...new Set(tokens)];
}

async function runPrototypeCheck({ args, options = {}, logger }) {
  const targetDir = path.resolve(process.cwd(), args[0] || '.');
  const slug = options.feature ? String(options.feature) : null;
  const dir = contextDir(targetDir);

  const prdFile = slug ? `prd-${slug}.md` : 'prd.md';
  const reqFile = slug ? `requirements-${slug}.md` : 'requirements.md';
  const prd = await readFileSafe(path.join(dir, prdFile));

  const emit = (result) => {
    if (options.json) return result;
    logger.log('');
    logger.log(slug ? `Prototype check — ${slug}` : 'Prototype check');
    logger.log(BAR);
    logger.log(`Status: ${result.status}`);
    if (result.message) logger.log(result.message);
    if (result.interactions && result.interactions.total > 0) {
      logger.log(`Interactions covered: ${result.interactions.covered}/${result.interactions.total}`);
      if (result.interactions.uncovered.length) {
        logger.log(`Uncovered: ${result.interactions.uncovered.map((i) => `"${i}"`).join(', ')}`);
      }
    }
    logger.log('');
    return result;
  };

  if (!prd) {
    return emit({ ok: true, status: 'skipped', reason: 'no_prd', feature_slug: slug,
      message: `No ${prdFile} found — nothing to check.` });
  }

  const section = prototypeReferenceSection(prd);
  if (!section) {
    return emit({ ok: true, status: 'not_applicable', feature_slug: slug,
      message: 'PRD has no `## Prototype reference` — feature has no prototype contract.' });
  }

  // Resolve prototype + manifest paths (from the section, else the default location).
  const protoRel = parsePath(section, 'prototype')
    || (slug ? `.aioson/briefings/${slug}/prototype.html` : null);
  const manifestRel = parsePath(section, 'manifest')
    || (slug ? `.aioson/briefings/${slug}/prototype-manifest.md` : null);

  const checks = { prototype_exists: false, manifest_exists: false, requirements_exists: false };

  const protoAbs = protoRel ? path.resolve(targetDir, protoRel) : null;
  const protoContent = protoAbs ? await readFileSafe(protoAbs) : null;
  checks.prototype_exists = protoContent !== null;
  if (!checks.prototype_exists) {
    return emit({ ok: false, status: 'fail', reason: 'dangling_prototype', feature_slug: slug, checks,
      message: `\`## Prototype reference\` points to ${protoRel || '(unspecified)'}, but that file is missing.` });
  }

  const manifestAbs = manifestRel ? path.resolve(targetDir, manifestRel) : null;
  const manifest = manifestAbs ? await readFileSafe(manifestAbs) : null;
  checks.manifest_exists = manifest !== null;
  if (!checks.manifest_exists) {
    return emit({ ok: false, status: 'fail', reason: 'missing_manifest', feature_slug: slug, checks,
      message: `Prototype exists but its manifest ${manifestRel || '(unspecified)'} is missing.` });
  }

  const requirements = await readFileSafe(path.join(dir, reqFile));
  checks.requirements_exists = requirements !== null;
  if (!checks.requirements_exists) {
    return emit({ ok: false, status: 'fail', reason: 'missing_requirements', feature_slug: slug, checks,
      message: `PRD references a prototype but ${reqFile} is missing — @analyst has not authored the acceptance-criteria bridge.` });
  }

  const interactions = extractInteractions(manifest);
  const reqFolded = fold(requirements);
  const uncovered = interactions.filter((i) => !reqFolded.includes(fold(i)));
  const covered = interactions.length - uncovered.length;
  const interactionsResult = { total: interactions.length, covered, uncovered };

  if (interactions.length === 0) {
    return emit({ ok: true, status: 'ok', feature_slug: slug, checks, interactions: interactionsResult,
      message: 'Prototype, manifest, and requirements all present. Manifest lists no machine-readable Core interactions to cover.' });
  }

  if (covered === 0) {
    return emit({ ok: false, status: 'fail', reason: 'no_ac_coverage', feature_slug: slug, checks, interactions: interactionsResult,
      message: 'None of the prototype Core interactions appear in the requirements ACs — the prototype is not reaching @validator.' });
  }

  if (uncovered.length > 0) {
    return emit({ ok: true, status: 'warn', reason: 'partial_ac_coverage', feature_slug: slug, checks, interactions: interactionsResult,
      message: 'Some prototype Core interactions have no matching acceptance criterion. Add an AC per interaction (or defer it explicitly in the PRD).' });
  }

  return emit({ ok: true, status: 'ok', feature_slug: slug, checks, interactions: interactionsResult,
    message: 'Every prototype Core interaction is echoed in the requirements ACs.' });
}

module.exports = { runPrototypeCheck };
