'use strict';

/**
 * aioson revision:open / revision:list / revision:resolve — Phase 2
 *
 * Usage:
 *   aioson revision:open . --slug=feature-x --requested-by=analyst --target=product
 *     --target-artifact=.aioson/context/prd-feature-x.md --reason="..." --severity=blocking
 *   aioson revision:list . --slug=feature-x [--status=pending]
 *   aioson revision:resolve . --rev-id=rev-001 --slug=feature-x --approve|--reject [--force-revision]
 */

const path = require('node:path');

const revStore = require('../dossier/revision-store');
const { isValidSlug } = require('../dossier/schema');

function resolveContextDir(targetDir) {
  return path.join(path.resolve(process.cwd(), targetDir || '.'), '.aioson', 'context');
}

function pickSlug(options) {
  const raw = options.slug || options.feature;
  return raw ? String(raw) : null;
}

async function runRevisionOpen({ args = [], options = {}, logger } = {}) {
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

  const requestedBy = options['requested-by'] || options.requestedBy;
  const target = options.target;
  const targetArtifact = options['target-artifact'] || options.targetArtifact;
  const reason = options.reason;
  const severity = options.severity || 'advisory';
  const evidenceCodeRefs = options['evidence-code-refs']
    ? String(options['evidence-code-refs']).split(',').map((s) => s.trim()).filter(Boolean)
    : [];

  if (!requestedBy) {
    if (jsonOut) return { ok: false, reason: 'missing_requested_by' };
    log('--requested-by=<agent> is required.');
    return { ok: false };
  }
  if (!target) {
    if (jsonOut) return { ok: false, reason: 'missing_target' };
    log('--target=<agent> is required.');
    return { ok: false };
  }
  if (!targetArtifact) {
    if (jsonOut) return { ok: false, reason: 'missing_target_artifact' };
    log('--target-artifact=<path> is required.');
    return { ok: false };
  }
  if (!reason) {
    if (jsonOut) return { ok: false, reason: 'missing_reason' };
    log('--reason="..." is required.');
    return { ok: false };
  }

  const ctxDir = resolveContextDir(targetDir);

  try {
    const revision = await revStore.open({
      slug,
      contextDir: ctxDir,
      requestedBy,
      target,
      targetArtifact,
      reason,
      severity,
      evidenceCodeRefs
    });

    if (jsonOut) return { ok: true, slug, revision };
    log(`Revision opened: ${revision.id}`);
    log(`  slug: ${slug}`);
    log(`  requested_by: ${revision.requested_by} → target: ${revision.target}`);
    log(`  severity: ${revision.severity}   status: ${revision.status}`);
    if (revision.severity === 'blocking') {
      log(`  ⚠ Handoff will be blocked until resolved.`);
      log(`  Resolve with: aioson revision:resolve . --slug=${slug} --rev-id=${revision.id} --approve|--reject`);
    }
    return { ok: true, slug, revision };
  } catch (err) {
    if (err && err.code === 'EREVAGENT') {
      if (jsonOut) return { ok: false, reason: 'invalid_agent', message: err.message };
      log(err.message);
      return { ok: false };
    }
    if (err && err.code === 'EREVSCHEMA') {
      if (jsonOut) return { ok: false, reason: 'schema_error', message: err.message };
      log(err.message);
      return { ok: false };
    }
    throw err;
  }
}

async function runRevisionList({ args = [], options = {}, logger } = {}) {
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

  const filterStatus = options.status ? String(options.status) : null;
  const ctxDir = resolveContextDir(targetDir);

  const revisions = await revStore.list({ slug, contextDir: ctxDir, status: filterStatus });

  if (jsonOut) return { ok: true, slug, revisions, count: revisions.length };

  if (revisions.length === 0) {
    log(`No revisions found for "${slug}"${filterStatus ? ` with status=${filterStatus}` : ''}.`);
    return { ok: true, slug, revisions: [], count: 0 };
  }

  log(`Revisions for "${slug}"${filterStatus ? ` (status=${filterStatus})` : ''}:`);
  for (const r of revisions) {
    const flag = r.severity === 'blocking' ? '⚠' : '·';
    log(`  ${flag} ${r.id}  ${r.status.padEnd(10)}  ${r.requested_by} → ${r.target}  [${r.severity}]`);
    log(`      ${r.reason.slice(0, 80)}${r.reason.length > 80 ? '...' : ''}`);
  }
  return { ok: true, slug, revisions, count: revisions.length };
}

async function runRevisionResolve({ args = [], options = {}, logger } = {}) {
  const targetDir = args[0] || '.';
  const slug = pickSlug(options);
  const revId = options['rev-id'] || options.revId;
  const jsonOut = Boolean(options.json);
  const forceRevision = Boolean(options['force-revision'] || options.forceRevision);
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
  if (!revId) {
    if (jsonOut) return { ok: false, reason: 'missing_rev_id' };
    log('--rev-id=<rev-NNN> is required.');
    return { ok: false };
  }

  const hasApprove = Boolean(options.approve);
  const hasReject = Boolean(options.reject);
  if (!hasApprove && !hasReject) {
    if (jsonOut) return { ok: false, reason: 'missing_action' };
    log('Either --approve or --reject is required.');
    return { ok: false };
  }
  if (hasApprove && hasReject) {
    if (jsonOut) return { ok: false, reason: 'conflicting_action' };
    log('Cannot use --approve and --reject together.');
    return { ok: false };
  }

  const action = hasApprove ? 'approve' : 'reject';
  const ctxDir = resolveContextDir(targetDir);

  try {
    const { revision, gateIncremented } = await revStore.resolve({
      slug,
      contextDir: ctxDir,
      revId,
      action,
      forceRevision
    });

    if (jsonOut) return { ok: true, slug, revision, gateIncremented };

    if (action === 'reject') {
      log(`Revision ${revId} rejected.`);
      log(`  Blocking revisions (if any) removed — handoff may now proceed.`);
    } else {
      log(`Revision ${revId} approved.`);
      if (gateIncremented) {
        log(`  Gate '${gateIncremented.gate}' revision round: ${gateIncremented.rounds}/${revStore.MAX_REVISION_ROUNDS}`);
      }
      log(`  Re-run @${revision.target} with revision context:`);
      log(`    aioson agent:prompt ${revision.target} . --revision-context=${revId}`);
    }
    return { ok: true, slug, revision, gateIncremented };
  } catch (err) {
    if (err && err.code === 'EREVNOTFOUND') {
      if (jsonOut) return { ok: false, reason: 'not_found', revId };
      log(err.message);
      return { ok: false };
    }
    if (err && err.code === 'EREVNOTPENDING') {
      if (jsonOut) return { ok: false, reason: 'not_pending', revId, status: err.status };
      log(err.message);
      return { ok: false };
    }
    if (err && err.code === 'EREVLOOP') {
      if (jsonOut) return { ok: false, reason: 'anti_loop', gate: err.gate, rounds: err.rounds, max: revStore.MAX_REVISION_ROUNDS };
      log(`Anti-loop: gate '${err.gate}' reached max revision rounds (${err.rounds}/${revStore.MAX_REVISION_ROUNDS}).`);
      log(`  Use --force-revision to override.`);
      return { ok: false };
    }
    throw err;
  }
}

module.exports = { runRevisionOpen, runRevisionList, runRevisionResolve };
