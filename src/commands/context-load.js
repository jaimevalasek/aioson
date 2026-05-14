'use strict';

/**
 * aioson context:load — silent telemetry verb invoked by agents on rule/brain load.
 *
 * Active Learning Loop Phase 1 (DD-1 resolution: option (b) central CLI verb).
 * Each invocation emits 1 row in execution_events with event_type='rule_loaded'
 * or 'brain_loaded'. Tier-1 silent: no stdout unless --verbose.
 *
 * Usage:
 *   aioson context:load [path] --target=<rule|brain>:<slug> --agent=<name> [--feature=<slug>] [--verbose]
 *   aioson context:load . --target=rule --agent=dev --batch="security-baseline,disk-first-artifacts"
 */

const fs = require('node:fs');
const path = require('node:path');
const { openRuntimeDb, appendContextLoadEvent } = require('../runtime-store');

const PAYLOAD_BYTE_CAP = 4 * 1024; // BR-ALL-08

function parseTarget(rawTarget) {
  const text = String(rawTarget || '').trim();
  if (!text) return { kind: null, slug: null };
  const idx = text.indexOf(':');
  if (idx < 0) {
    return { kind: text.toLowerCase(), slug: null };
  }
  const kind = text.slice(0, idx).toLowerCase();
  const slug = text.slice(idx + 1).trim();
  return { kind, slug: slug || null };
}

function normalizeKind(kind) {
  if (kind === 'rule' || kind === 'rules') return 'rule';
  if (kind === 'brain' || kind === 'brains') return 'brain';
  return null;
}

function resolveRuleTarget(targetDir, slug) {
  const relPosix = path.posix.join('.aioson', 'rules', `${slug}.md`);
  const absPath = path.join(targetDir, '.aioson', 'rules', `${slug}.md`);
  return { absPath, relPath: relPosix, exists: fs.existsSync(absPath) };
}

function resolveBrainTarget(targetDir, slug) {
  const baseAbs = path.join(targetDir, '.aioson', 'brains');
  const baseRel = ['.aioson', 'brains'];
  const parts = String(slug).split('/').filter(Boolean);

  let attempt = parts.slice();
  while (attempt.length > 0) {
    const fileName = `${attempt[attempt.length - 1]}.brain.json`;
    const segments = attempt.slice(0, -1);
    const abs = path.join(baseAbs, ...segments, fileName);
    if (fs.existsSync(abs)) {
      const rel = path.posix.join(...baseRel, ...segments, fileName);
      return { absPath: abs, relPath: rel, exists: true };
    }
    attempt.pop();
  }

  const fallbackAbs = path.join(baseAbs, `${parts[0] || slug}.brain.json`);
  const fallbackRel = path.posix.join(...baseRel, `${parts[0] || slug}.brain.json`);
  return { absPath: fallbackAbs, relPath: fallbackRel, exists: false };
}

function resolveTarget(targetDir, kind, slug) {
  if (kind === 'rule') return resolveRuleTarget(targetDir, slug);
  return resolveBrainTarget(targetDir, slug);
}

function clampPayload(payload) {
  const json = JSON.stringify(payload);
  if (Buffer.byteLength(json, 'utf8') <= PAYLOAD_BYTE_CAP) return payload;
  const clone = { ...payload };
  if (clone.target_path && clone.target_path.length > 512) {
    clone.target_path = clone.target_path.slice(0, 509) + '...';
  }
  return clone;
}

function parseBatch(value) {
  if (!value) return [];
  return String(value)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

function buildPayload({ kind, slug, relPath, agentName, featureSlug, classification }) {
  const payload = {
    target_slug: slug,
    target_path: relPath,
    agent_name: agentName
  };
  if (featureSlug) payload.feature_slug = featureSlug;
  if (classification) payload.classification = classification;
  return clampPayload(payload);
}

function eventTypeForKind(kind) {
  return kind === 'rule' ? 'rule_loaded' : 'brain_loaded';
}

async function runContextLoad({ args, options = {}, logger, t }) {
  const targetDir = path.resolve(process.cwd(), args[0] || '.');
  const verbose = Boolean(options.verbose);
  const json = Boolean(options.json);
  const log = (msg) => { if (verbose && logger && typeof logger.log === 'function') logger.log(msg); };

  const rawTarget = options.target;
  if (!rawTarget) {
    if (json) return { ok: false, reason: 'missing_target' };
    if (logger && typeof logger.log === 'function') {
      logger.log(t ? t('context_load.target_required') : 'context:load requires --target=<rule|brain>:<slug>');
    }
    return { ok: false, reason: 'missing_target' };
  }

  const agentName = options.agent ? String(options.agent).trim().replace(/^@/, '') : '';
  if (!agentName) {
    if (json) return { ok: false, reason: 'missing_agent' };
    if (logger && typeof logger.log === 'function') {
      logger.log(t ? t('context_load.agent_required') : 'context:load requires --agent=<name>');
    }
    return { ok: false, reason: 'missing_agent' };
  }

  const { kind: rawKind, slug: parsedSlug } = parseTarget(rawTarget);
  const kind = normalizeKind(rawKind);
  if (!kind) {
    if (json) return { ok: false, reason: 'invalid_target' };
    if (logger && typeof logger.log === 'function') {
      logger.log(t ? t('context_load.target_invalid', { target: rawTarget }) : `context:load invalid --target value: ${rawTarget}`);
    }
    return { ok: false, reason: 'invalid_target' };
  }

  const batchSlugs = parseBatch(options.batch);
  const slugs = batchSlugs.length > 0 ? batchSlugs : (parsedSlug ? [parsedSlug] : []);
  if (slugs.length === 0) {
    if (json) return { ok: false, reason: 'missing_slug' };
    if (logger && typeof logger.log === 'function') {
      logger.log(t ? t('context_load.target_invalid', { target: rawTarget }) : `context:load missing slug (target=${rawTarget})`);
    }
    return { ok: false, reason: 'missing_slug' };
  }

  const featureSlug = options.feature ? String(options.feature).trim() : null;
  const classification = options.classification ? String(options.classification).trim() : null;

  let dbHandle;
  try {
    dbHandle = await openRuntimeDb(targetDir);
  } catch (err) {
    if (json) return { ok: false, reason: 'runtime_db_unavailable', error: String(err && err.message || err) };
    log(`context:load runtime db unavailable: ${err && err.message ? err.message : err}`);
    return { ok: false, reason: 'runtime_db_unavailable' };
  }

  const { db } = dbHandle;
  const emitted = [];
  const missing = [];
  const eventType = eventTypeForKind(kind);

  try {
    const tx = db.transaction((items) => {
      for (const item of items) {
        appendContextLoadEvent(db, {
          eventType,
          agentName,
          message: `${eventType}:${item.slug}`,
          payload: item.payload
        });
      }
    });

    const items = slugs.map((slug) => {
      const resolved = resolveTarget(targetDir, kind, slug);
      if (!resolved.exists) missing.push({ slug, expected: resolved.relPath });
      const payload = buildPayload({
        kind,
        slug,
        relPath: resolved.relPath,
        agentName,
        featureSlug,
        classification
      });
      emitted.push({ slug, relPath: resolved.relPath, exists: resolved.exists });
      return { slug, payload };
    });

    tx(items);
  } finally {
    db.close();
  }

  if (verbose) {
    for (const item of emitted) {
      log(`context:load ${eventType} ${item.slug} → ${item.relPath}${item.exists ? '' : ' (missing — emitted anyway)'}`);
    }
  }

  if (json) {
    return {
      ok: true,
      kind,
      event_type: eventType,
      agent: agentName,
      feature_slug: featureSlug,
      emitted: emitted.length,
      missing
    };
  }

  return { ok: true, emitted: emitted.length, missing: missing.length };
}

module.exports = { runContextLoad };
