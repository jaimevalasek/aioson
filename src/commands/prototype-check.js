'use strict';

/**
 * aioson prototype:check — deterministic fidelity guard for the prototype contract.
 *
 * When a PRD carries a `## Prototype contract` (legacy: Prototype reference), this
 * command verifies that the prototype reaches the single product authority:
 *   1. the referenced prototype.html + manifest exist (no dangling pointer);
 *   2. the Core interactions the manifest lists are echoed in the PRD acceptance
 *      contract authored by Product/Sheldon.
 *
 * It is a STRUCTURAL check, not a semantic one: coverage is a folded substring match
 * of each manifest interaction phrase against the PRD text. The prototype
 * contract instructs Product/Sheldon to preserve the interaction names
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
const { resolveInsideRoot } = require('../verification/path-policy');

const BAR = '━'.repeat(30);

// Match the surface detectors: fold diacritics so a localized requirements file
// (pt-BR ACs) is compared the same way as an English one.
function fold(s) {
  return String(s || '').normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
}

// The `## Prototype reference` section body, if present. Captures from the heading
// to the next `## ` heading or end of file (no `m` flag, so `$` means end-of-input).
function prototypeReferenceSection(prd) {
  const m = String(prd || '').match(/##\s+Prototype (?:contract|reference)[^\n]*\n([\s\S]*?)(?=\n##\s|$)/i);
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
  const strict = Boolean(options.strict || String(options.policy || '').toLowerCase() === 'strict');
  const dir = contextDir(targetDir);

  const prdFile = slug ? `prd-${slug}.md` : 'prd.md';
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
      message: 'PRD has no `## Prototype contract` — feature has no prototype contract.' });
  }

  // Resolve prototype + manifest paths (from the section, else the default location).
  const protoRel = parsePath(section, 'prototype')
    || (slug ? `.aioson/briefings/${slug}/prototype.html` : null);
  const manifestRel = parsePath(section, 'manifest')
    || (slug ? `.aioson/briefings/${slug}/prototype-manifest.md` : null);

  const checks = { prototype_exists: false, manifest_exists: false, prd_acceptance_contract: false };

  const protoSafe = protoRel ? resolveInsideRoot(targetDir, protoRel) : { ok: false, reason: 'missing_path' };
  if (!protoSafe.ok) {
    return emit({ ok: false, status: 'fail', reason: protoSafe.reason, field: 'prototype', feature_slug: slug, checks,
      message: `\`## Prototype reference\` prototype path is invalid: ${protoRel || '(unspecified)'}.` });
  }
  const protoContent = await readFileSafe(protoSafe.path);
  checks.prototype_exists = protoContent !== null;
  if (!checks.prototype_exists) {
    return emit({ ok: false, status: 'fail', reason: 'dangling_prototype', feature_slug: slug, checks,
      message: `\`## Prototype reference\` points to ${protoRel || '(unspecified)'}, but that file is missing.` });
  }

  const manifestSafe = manifestRel ? resolveInsideRoot(targetDir, manifestRel) : { ok: false, reason: 'missing_path' };
  if (!manifestSafe.ok) {
    return emit({ ok: false, status: 'fail', reason: manifestSafe.reason, field: 'manifest', feature_slug: slug, checks,
      message: `\`## Prototype reference\` manifest path is invalid: ${manifestRel || '(unspecified)'}.` });
  }
  const manifest = await readFileSafe(manifestSafe.path);
  checks.manifest_exists = manifest !== null;
  if (!checks.manifest_exists) {
    return emit({ ok: false, status: 'fail', reason: 'missing_manifest', feature_slug: slug, checks,
      message: `Prototype exists but its manifest ${manifestRel || '(unspecified)'} is missing.` });
  }

  checks.prd_acceptance_contract = /##\s+Acceptance Criteria\b/i.test(prd);
  if (!checks.prd_acceptance_contract) {
    return emit({ ok: false, status: 'fail', reason: 'missing_acceptance_criteria', feature_slug: slug, checks,
      message: 'PRD references a prototype but has no `## Acceptance Criteria` bridge for its interactions.' });
  }

  const interactions = extractInteractions(manifest);
  const prdFolded = fold(prd);
  const uncovered = interactions.filter((i) => !prdFolded.includes(fold(i)));
  const covered = interactions.length - uncovered.length;
  const interactionsResult = { total: interactions.length, covered, uncovered };

  if (interactions.length === 0) {
    return emit({ ok: true, status: 'ok', feature_slug: slug, checks, interactions: interactionsResult,
      message: 'Prototype, manifest, and PRD acceptance contract are present. Manifest lists no machine-readable Core interactions to cover.' });
  }

  if (covered === 0) {
    return emit({ ok: false, status: 'fail', reason: 'no_ac_coverage', feature_slug: slug, checks, interactions: interactionsResult,
      message: 'None of the prototype Core interactions appear in the PRD acceptance contract.' });
  }

  if (uncovered.length > 0) {
    return emit({ ok: !strict, status: strict ? 'fail' : 'warn', reason: 'partial_ac_coverage', feature_slug: slug, checks, interactions: interactionsResult,
      message: 'Some prototype Core interactions have no matching acceptance criterion. Add an AC per interaction (or defer it explicitly in the PRD).' });
  }

  return emit({ ok: true, status: 'ok', feature_slug: slug, checks, interactions: interactionsResult,
    message: 'Every prototype Core interaction is echoed in the PRD acceptance contract.' });
}

module.exports = { runPrototypeCheck };
