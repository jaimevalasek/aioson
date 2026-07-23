'use strict';

/**
 * aioson prototype:check — deterministic fidelity guard for the prototype contract.
 *
 * The command first verifies that a prototype is owned by the active feature,
 * not borrowed from another feature or reactivated from historical text. It then
 * verifies that the prototype reaches the single product authority:
 *   1. PRD status, feature owner, canonical paths, files, and manifest agree;
 *   2. the Core interactions the manifest lists are echoed in the PRD acceptance
 *      contract authored by Product/Sheldon.
 *
 * It is a STRUCTURAL check, not a semantic one: coverage is a folded substring match
 * of each manifest interaction phrase against the PRD text. The prototype
 * contract instructs Product/Sheldon to preserve the interaction names
 * (e.g. "add card persists and re-renders"), so the match is deterministic, not fuzzy.
 *
 * Features with an explicit `prototype_status: none` or no legacy binding are a
 * no-op (status: not_applicable).
 *
 * Usage:
 *   aioson prototype:check . --feature=kanban
 *   aioson prototype:check . --feature=kanban --json
 */

const path = require('node:path');
const { readFileSafe, contextDir } = require('../preflight-engine');
const {
  validatePrototypeBinding
} = require('../lib/prototype-binding');

const BAR = '━'.repeat(30);

// Match the surface detectors: fold diacritics so a localized requirements file
// (pt-BR ACs) is compared the same way as an English one.
function fold(s) {
  return String(s || '').normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
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

  const binding = await validatePrototypeBinding({
    targetDir,
    slug,
    prd,
    strict,
    includeManifestContent: true
  });
  const manifest = binding.manifest_content || '';
  delete binding.manifest_content;
  const checks = {
    ...binding.checks,
    prd_acceptance_contract: false
  };

  if (!binding.applicable && binding.ok) {
    return emit({
      ok: true,
      status: 'not_applicable',
      reason: binding.status === 'none' ? 'explicit_none' : 'no_prototype_binding',
      feature_slug: slug,
      binding,
      checks,
      message: binding.message
    });
  }

  if (!binding.ok) {
    const first = binding.issues[0];
    return emit({
      ok: false,
      status: 'fail',
      reason: first.reason,
      field: first.field,
      feature_slug: slug,
      binding,
      checks,
      message: first.message
    });
  }

  checks.prd_acceptance_contract = /##\s+Acceptance Criteria\b/i.test(prd);
  if (!checks.prd_acceptance_contract) {
    return emit({ ok: false, status: 'fail', reason: 'missing_acceptance_criteria', feature_slug: slug, binding, checks,
      message: 'PRD references a prototype but has no `## Acceptance Criteria` bridge for its interactions.' });
  }

  const interactions = extractInteractions(manifest);
  const prdFolded = fold(prd);
  const uncovered = interactions.filter((i) => !prdFolded.includes(fold(i)));
  const covered = interactions.length - uncovered.length;
  const interactionsResult = { total: interactions.length, covered, uncovered };

  if (interactions.length === 0) {
    const hasWarning = binding.warnings.length > 0;
    return emit({ ok: true, status: hasWarning ? 'warn' : 'ok', reason: hasWarning ? binding.warnings[0].reason : undefined,
      feature_slug: slug, binding, checks, interactions: interactionsResult,
      message: hasWarning ? binding.warnings[0].message : 'Owned prototype, manifest, and PRD acceptance contract are present. Manifest lists no machine-readable Core interactions to cover.' });
  }

  if (covered === 0) {
    return emit({ ok: false, status: 'fail', reason: 'no_ac_coverage', feature_slug: slug, binding, checks, interactions: interactionsResult,
      message: 'None of the prototype Core interactions appear in the PRD acceptance contract.' });
  }

  if (uncovered.length > 0) {
    return emit({ ok: !strict, status: strict ? 'fail' : 'warn', reason: 'partial_ac_coverage', feature_slug: slug, binding, checks, interactions: interactionsResult,
      message: 'Some prototype Core interactions have no matching acceptance criterion. Add an AC per interaction (or defer it explicitly in the PRD).' });
  }

  const hasWarning = binding.warnings.length > 0;
  return emit({ ok: true, status: hasWarning ? 'warn' : 'ok', reason: hasWarning ? binding.warnings[0].reason : undefined,
    feature_slug: slug, binding, checks, interactions: interactionsResult,
    message: hasWarning ? binding.warnings[0].message : 'Every owned prototype Core interaction is echoed in the PRD acceptance contract.' });
}

module.exports = { runPrototypeCheck };
