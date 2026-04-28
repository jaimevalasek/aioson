'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const readline = require('node:readline');

const store = require('../dossier/store');
const codemapStore = require('../dossier/codemap-store');
const { compact, shouldCompact } = require('../dossier/dossier-compact');
const { initFromExisting } = require('../dossier/dossier-bootstrap');
const { ALLOWED_CLASSIFICATIONS, isValidSlug, isCanonicalAgent } = require('../dossier/schema');

function resolveContextDir(targetDir) {
  return path.join(path.resolve(process.cwd(), targetDir || '.'), '.aioson', 'context');
}

function pickSlug(options) {
  const raw = options.slug || options.feature;
  return raw ? String(raw) : null;
}

async function readProjectClassification(ctxDir) {
  const ctxPath = path.join(ctxDir, 'project.context.md');
  try {
    const raw = await fs.readFile(ctxPath, 'utf8');
    const match = raw.match(/^classification:\s*"?([A-Z]+)"?\s*$/m);
    if (match && ALLOWED_CLASSIFICATIONS.has(match[1])) {
      return match[1];
    }
  } catch {
    // ignored — caller falls back
  }
  return null;
}

async function runDossierInit({ args = [], options = {}, logger } = {}) {
  const targetDir = args[0] || '.';
  const slug = pickSlug(options);
  const jsonOut = Boolean(options.json);
  const log = (msg) => { if (logger && !jsonOut) logger.log(msg); };

  if (!slug) {
    if (jsonOut) return { ok: false, reason: 'missing_slug' };
    log('--slug=<feature-slug> is required.');
    return { ok: false };
  }
  if (!isValidSlug(slug)) {
    if (jsonOut) return { ok: false, reason: 'invalid_slug', slug };
    log(`Invalid slug "${slug}" — must be kebab-case (lowercase, digits and hyphens).`);
    return { ok: false };
  }

  const ctxDir = resolveContextDir(targetDir);
  let classification = options.classification ? String(options.classification).toUpperCase() : null;
  if (classification && !ALLOWED_CLASSIFICATIONS.has(classification)) {
    if (jsonOut) return { ok: false, reason: 'invalid_classification', classification };
    log(`Invalid classification "${classification}" — use MICRO | SMALL | MEDIUM.`);
    return { ok: false };
  }
  if (!classification) {
    classification = (await readProjectClassification(ctxDir)) || 'MEDIUM';
  }

  // --from-existing: synthesize from existing artifacts
  if (options['from-existing'] || options.fromExisting) {
    try {
      const result = await initFromExisting({
        slug,
        contextDir: ctxDir,
        classification,
        targetDir: path.resolve(process.cwd(), targetDir || '.')
      });
      if (result.created === false) {
        if (jsonOut) return { ok: true, slug, reason: 'unchanged', path: result.path };
        log(`Dossier unchanged (artifacts not modified since last bootstrap).`);
        return { ok: true };
      }
      if (jsonOut) return { ok: true, slug, path: result.path, classification: result.classification, artifactsFound: result.artifactsFound };
      log(`Dossier bootstrapped: ${result.path}`);
      log(`  classification: ${result.classification}`);
      log(`  artifacts found: ${result.artifactsFound.join(', ')}`);
      return { ok: true, path: result.path };
    } catch (err) {
      if (err && err.code === 'EBOOTSTRAPEMPTY') {
        if (jsonOut) return { ok: false, reason: 'no_artifacts', slug };
        log(`No artifacts found for slug "${slug}" — use dossier:init without --from-existing.`);
        return { ok: false };
      }
      if (err && err.code === 'EDOSSIEREXISTS') {
        if (jsonOut) return { ok: false, reason: 'already_exists', slug, path: err.path };
        log(`Dossier already exists at ${err.path}.`);
        return { ok: false };
      }
      if (err && err.code === 'EDOSSIERSCHEMA') {
        if (jsonOut) return { ok: false, reason: 'schema_violation', errors: err.errors };
        log(`Schema error: ${err.message}`);
        return { ok: false };
      }
      throw err;
    }
  }

  const prdFile = path.join(ctxDir, `prd-${slug}.md`);
  let hasPrd = false;
  try { await fs.access(prdFile); hasPrd = true; } catch { /* absent */ }

  let initOpts = { slug, contextDir: ctxDir, classification };

  if (!hasPrd) {
    let whyText = '';
    let whatText = '';
    if (!jsonOut && process.stdin.isTTY) {
      const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
      whyText = await new Promise(resolve => rl.question('Why? ', resolve));
      whatText = await new Promise(resolve => { rl.question('What? ', ans => { rl.close(); resolve(ans); }); });
    }
    initOpts.author = 'dossier-init-prompt';
    initOpts.whyText = whyText;
    initOpts.whatText = whatText;
  }

  try {
    const result = await store.init(initOpts);
    if (jsonOut) {
      return { ok: true, slug, path: result.path, dir: result.dir, classification };
    }
    log(`Dossier created: ${result.path}`);
    log(`  classification: ${classification}`);
    log(`  status: active   schema: 1.0`);
    return { ok: true, path: result.path };
  } catch (err) {
    if (err && err.code === 'EDOSSIEREXISTS') {
      if (jsonOut) return { ok: false, reason: 'already_exists', slug, path: err.path };
      log(`Dossier already exists at ${err.path}. Aborting (atomic init, no --force).`);
      return { ok: false };
    }
    if (err && err.code === 'EDOSSIERSCHEMA') {
      if (jsonOut) return { ok: false, reason: 'schema_violation', errors: err.errors };
      log(`Dossier schema violation: ${err.errors.join('; ')}`);
      return { ok: false };
    }
    if (err && err.code === 'EDOSSIERSLUG') {
      if (jsonOut) return { ok: false, reason: 'invalid_slug', slug };
      log(err.message);
      return { ok: false };
    }
    throw err;
  }
}

async function runDossierShow({ args = [], options = {}, logger } = {}) {
  const targetDir = args[0] || '.';
  const slug = pickSlug(options);
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

  const ctxDir = resolveContextDir(targetDir);
  try {
    const result = await store.show({ slug, contextDir: ctxDir });
    if (jsonOut) {
      return {
        ok: true,
        slug,
        path: result.path,
        frontmatter: result.frontmatter,
        sections: Object.keys(result.sections),
        warn: result.warn || null
      };
    }
    log(result.header);
    log(result.raw);
    if (result.warn === 'history_corrupted') {
      log(`Warning: dossier-history.md is corrupted or unreadable — history content may be lost.`);
    }
    return { ok: true, path: result.path, warn: result.warn || null };
  } catch (err) {
    if (err && err.code === 'EDOSSIERMISSING') {
      if (jsonOut) return { ok: false, reason: 'not_found', slug, path: err.path };
      log(`Dossier not found for slug "${slug}" (expected at ${err.path}).`);
      return { ok: false };
    }
    if (err && (err.code === 'EDOSSIERPARSE' || err.code === 'EDOSSIERSCHEMA')) {
      if (jsonOut) return { ok: false, reason: err.code, errors: err.errors, message: err.message };
      log(`Cannot read dossier: ${err.message}`);
      return { ok: false };
    }
    throw err;
  }
}

async function runDossierAddFinding({ args = [], options = {}, logger } = {}) {
  const targetDir = args[0] || '.';
  const slug = pickSlug(options);
  const jsonOut = Boolean(options.json);
  const log = (msg) => { if (logger && !jsonOut) logger.log(msg); };

  if (!slug) {
    if (jsonOut) return { ok: false, reason: 'missing_slug' };
    log('--slug=<feature-slug> is required.');
    return { ok: false };
  }
  if (!isValidSlug(slug)) {
    if (jsonOut) return { ok: false, reason: 'invalid_slug', slug };
    log(`Invalid slug "${slug}".`);
    return { ok: false };
  }

  const agent = options.agent ? String(options.agent) : null;
  const section = options.section ? String(options.section) : null;
  const content = options.content ? String(options.content) : null;

  if (!agent || !isCanonicalAgent(agent)) {
    if (jsonOut) return { ok: false, reason: 'invalid_agent', agent };
    log(`--agent=<canonical-agent-id> is required (got: ${JSON.stringify(agent)}).`);
    return { ok: false };
  }
  if (!section || !section.trim()) {
    if (jsonOut) return { ok: false, reason: 'missing_section' };
    log('--section=<section-name> is required.');
    return { ok: false };
  }
  if (!content || !content.trim()) {
    if (jsonOut) return { ok: false, reason: 'missing_content' };
    log('--content="..." is required.');
    return { ok: false };
  }

  const ctxDir = resolveContextDir(targetDir);

  try {
    const result = await store.addFinding({ slug, contextDir: ctxDir, agent, section, content });
    if (jsonOut) return { ok: true, slug, added: result.added, hash: result.hash };
    if (result.added) {
      log(`Finding added to dossier "${slug}" (section: ${section}, agent: ${agent}).`);
    } else {
      log(`Finding already recorded (idempotent — no-op).`);
    }
    return { ok: true, slug, added: result.added, hash: result.hash };
  } catch (err) {
    if (err && err.code === 'EDOSSIERMISSING') {
      if (jsonOut) return { ok: false, reason: 'not_found', slug };
      log(`Dossier not found for slug "${slug}". Run dossier:init first.`);
      return { ok: false };
    }
    throw err;
  }
}

async function runDossierAddCodemap({ args = [], options = {}, logger } = {}) {
  const targetDir = args[0] || '.';
  const slug = pickSlug(options);
  const jsonOut = Boolean(options.json);
  const log = (msg) => { if (logger && !jsonOut) logger.log(msg); };

  if (!slug) {
    if (jsonOut) return { ok: false, reason: 'missing_slug' };
    log('--slug=<feature-slug> is required.');
    return { ok: false };
  }
  if (!isValidSlug(slug)) {
    if (jsonOut) return { ok: false, reason: 'invalid_slug', slug };
    log(`Invalid slug "${slug}".`);
    return { ok: false };
  }

  const filePath = options.file ? String(options.file) : null;
  if (!filePath) {
    if (jsonOut) return { ok: false, reason: 'missing_file' };
    log('--file=<path> is required.');
    return { ok: false };
  }

  const lines = options.lines ? String(options.lines) : undefined;
  const role = options.role ? String(options.role) : undefined;
  const coupling = options.coupling ? String(options.coupling) : undefined;
  const addedBy = options['added-by'] ? String(options['added-by']) : undefined;

  const ctxDir = resolveContextDir(targetDir);

  try {
    const result = await codemapStore.addCodemap({ slug, contextDir: ctxDir, filePath, lines, role, coupling, addedBy });
    if (jsonOut) return { ok: true, slug, added: result.added, path: result.path, warn: result.warn || null };
    if (result.added) {
      log(`Code map entry added to dossier "${slug}": ${filePath}`);
    } else {
      log(`Entry already recorded (idempotent — no-op).`);
    }
    if (result.warn === 'file_not_found') {
      log(`Warning: file not found on disk — "${filePath}" registered as planned file.`);
    }
    return { ok: true, slug, added: result.added, warn: result.warn || null };
  } catch (err) {
    if (err && err.code === 'EDOSSIERMISSING') {
      if (jsonOut) return { ok: false, reason: 'not_found', slug };
      log(`Dossier not found for slug "${slug}". Run dossier:init first.`);
      return { ok: false };
    }
    if (err && err.code === 'ECODEMAPVALIDATION') {
      if (jsonOut) return { ok: false, reason: 'validation_error', errors: err.errors };
      log(`Validation error: ${err.errors.join('; ')}`);
      return { ok: false };
    }
    throw err;
  }
}

async function runDossierLinkRule({ args = [], options = {}, logger } = {}) {
  const targetDir = args[0] || '.';
  const slug = pickSlug(options);
  const jsonOut = Boolean(options.json);
  const log = (msg) => { if (logger && !jsonOut) logger.log(msg); };

  if (!slug) {
    if (jsonOut) return { ok: false, reason: 'missing_slug' };
    log('--slug=<feature-slug> is required.');
    return { ok: false };
  }
  if (!isValidSlug(slug)) {
    if (jsonOut) return { ok: false, reason: 'invalid_slug', slug };
    log(`Invalid slug "${slug}".`);
    return { ok: false };
  }

  const rulePath = options.rule ? String(options.rule) : null;
  if (!rulePath) {
    if (jsonOut) return { ok: false, reason: 'missing_rule' };
    log('--rule=<path> is required.');
    return { ok: false };
  }

  const reason = options.reason ? String(options.reason) : undefined;
  const ctxDir = resolveContextDir(targetDir);
  const base = path.resolve(process.cwd(), targetDir || '.');

  try {
    const result = await codemapStore.linkRule({ slug, contextDir: ctxDir, rulePath, reason, targetDir: base });
    if (jsonOut) return { ok: true, slug, added: result.added, path: result.path };
    if (result.added) {
      log(`Rule linked in dossier "${slug}": ${rulePath}`);
    } else {
      log(`Rule already linked (idempotent — no-op).`);
    }
    return { ok: true, slug, added: result.added };
  } catch (err) {
    if (err && err.code === 'EDOSSIERMISSING') {
      if (jsonOut) return { ok: false, reason: 'not_found', slug };
      log(`Dossier not found for slug "${slug}". Run dossier:init first.`);
      return { ok: false };
    }
    if (err && err.code === 'ELINKREULEPATH') {
      if (jsonOut) return { ok: false, reason: 'invalid_rule_path', message: err.message };
      log(`Invalid rule path: ${err.message}`);
      return { ok: false };
    }
    if (err && err.code === 'ELINKREULENOTFOUND') {
      if (jsonOut) return { ok: false, reason: 'rule_not_found', path: err.path };
      log(`Rule file not found: ${err.path}`);
      return { ok: false };
    }
    throw err;
  }
}

async function runDossierCompact({ args = [], options = {}, logger } = {}) {
  const targetDir = args[0] || '.';
  const slug = pickSlug(options);
  const jsonOut = Boolean(options.json);
  const log = (msg) => { if (logger && !jsonOut) logger.log(msg); };

  if (!slug) {
    if (jsonOut) return { ok: false, reason: 'missing_slug' };
    log('--slug=<feature-slug> is required.');
    return { ok: false };
  }
  if (!isValidSlug(slug)) {
    if (jsonOut) return { ok: false, reason: 'invalid_slug', slug };
    log(`Invalid slug "${slug}".`);
    return { ok: false };
  }

  const force = Boolean(options.force);
  const ctxDir = resolveContextDir(targetDir);

  try {
    const result = await compact({ slug, contextDir: ctxDir, force });
    if (jsonOut) return { ok: true, slug, ...result };
    if (!result.compacted) {
      log(`Compaction skipped: ${result.reason} (${result.sizeBytes} bytes).`);
    } else {
      log(`Dossier compacted: ${result.migratedSections.length} section(s) migrated to history.`);
      log(`  Active size: ${result.activeSizeBytes} bytes`);
      log(`  History: ${result.historyPath}`);
    }
    return { ok: true, slug, ...result };
  } catch (err) {
    if (err && err.code === 'EDOSSIERMISSING') {
      if (jsonOut) return { ok: false, reason: 'not_found', slug };
      log(`Dossier not found for slug "${slug}". Run dossier:init first.`);
      return { ok: false };
    }
    throw err;
  }
}

module.exports = {
  runDossierInit,
  runDossierShow,
  runDossierAddFinding,
  runDossierAddCodemap,
  runDossierLinkRule,
  runDossierCompact
};
