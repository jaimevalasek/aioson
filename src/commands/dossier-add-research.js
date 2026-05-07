'use strict';

const path = require('node:path');

const researchIndexStore = require('../dossier/research-index-store');
const { isValidSlug, RESEARCH_VERDICTS, isCanonicalAgent } = require('../dossier/schema');

function resolveContextDir(targetDir) {
  return path.join(path.resolve(process.cwd(), targetDir || '.'), '.aioson', 'context');
}

function pickFeatureSlug(options) {
  const raw = options.slug || options.feature;
  return raw ? String(raw) : null;
}

async function runDossierAddResearch({ args = [], options = {}, logger } = {}) {
  const targetDir = args[0] || '.';
  const slug = pickFeatureSlug(options);
  const jsonOut = Boolean(options.json);
  const log = (msg) => { if (logger && !jsonOut) logger.log(msg); };

  if (!slug) {
    if (jsonOut) return { ok: false, reason: 'missing_slug' };
    log('--slug=<feature-slug> is required.');
    return { ok: false };
  }
  if (!isValidSlug(slug)) {
    if (jsonOut) return { ok: false, reason: 'invalid_slug', slug };
    log(`Invalid slug "${slug}" — must be kebab-case.`);
    return { ok: false };
  }

  const researchSlug = options['research-slug'] || options.researchSlug;
  if (!researchSlug || !isValidSlug(String(researchSlug))) {
    if (jsonOut) return { ok: false, reason: 'invalid_research_slug', researchSlug: researchSlug || null };
    log(`--research-slug=<kebab-case> is required.`);
    return { ok: false };
  }

  const agent = options.agent ? String(options.agent) : null;
  if (!agent || !isCanonicalAgent(agent)) {
    if (jsonOut) return { ok: false, reason: 'invalid_agent', agent };
    log(`--agent=<canonical-agent-id> is required (got: ${JSON.stringify(agent)}).`);
    return { ok: false };
  }

  const verdict = options.verdict ? String(options.verdict) : null;
  if (!verdict || !RESEARCH_VERDICTS.has(verdict)) {
    if (jsonOut) return { ok: false, reason: 'invalid_verdict', verdict, allowed: [...RESEARCH_VERDICTS] };
    log(`--verdict must be one of [${[...RESEARCH_VERDICTS].join(', ')}] (got: ${JSON.stringify(verdict)}).`);
    return { ok: false };
  }

  const whyRelevant = options['why-relevant'] || options.whyRelevant || options.why || null;
  if (!whyRelevant || !String(whyRelevant).trim()) {
    if (jsonOut) return { ok: false, reason: 'missing_why_relevant' };
    log('--why-relevant="<short reason>" is required (≤200 chars).');
    return { ok: false };
  }

  const summaryPathOption = options['summary-path'] || options.summaryPath;
  const summaryPath = summaryPathOption ? String(summaryPathOption) : undefined;

  const contextDir = resolveContextDir(targetDir);

  try {
    const result = await researchIndexStore.addResearch({
      slug,
      contextDir,
      researchSlug: String(researchSlug),
      verdict,
      agent,
      whyRelevant: String(whyRelevant),
      summaryPath
    });
    if (jsonOut) {
      return {
        ok: true,
        slug,
        researchSlug: String(researchSlug),
        added: result.added,
        updated: result.updated
      };
    }
    if (result.added) {
      log(`Research added to dossier "${slug}": ${researchSlug} (verdict: ${verdict}).`);
    } else if (result.updated) {
      log(`Research updated in dossier "${slug}": ${researchSlug} (verdict: ${verdict}).`);
    } else {
      log(`Research already recorded (idempotent — no-op).`);
    }
    return { ok: true, slug, researchSlug: String(researchSlug), added: result.added, updated: result.updated };
  } catch (err) {
    if (err && err.code === 'EDOSSIERMISSING') {
      if (jsonOut) return { ok: false, reason: 'not_found', slug };
      log(`Dossier not found for slug "${slug}". Run dossier:init first.`);
      return { ok: false };
    }
    if (err && err.code === 'EDOSSIERSLUG') {
      if (jsonOut) return { ok: false, reason: 'invalid_slug', slug };
      log(err.message);
      return { ok: false };
    }
    if (err && err.code === 'ERESEARCHVALIDATION') {
      if (jsonOut) return { ok: false, reason: 'validation_error', errors: err.errors };
      log(`Validation error: ${err.errors.join('; ')}`);
      return { ok: false };
    }
    throw err;
  }
}

module.exports = { runDossierAddResearch };
