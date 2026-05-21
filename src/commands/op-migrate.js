'use strict';

/**
 * aioson op:migrate — explicit one-shot migration from `.aioson/context/user-profile.md`
 * (Phase 5, v1.16.0). PMD-10: deprecation tied to feature.md status, not version.
 *
 * Idempotent: re-runs after first successful migration skip silently (checks
 * deprecated_by frontmatter field on user-profile.md).
 *
 * Field mapping (known 8 dimensions, conservative subset):
 *   autonomy_preference   → category=identity, signal_type=authorization
 *   communication_style   → category=identity, signal_type=authorization
 *   feedback_density      → category=identity, signal_type=authorization
 *   correction_tolerance  → category=identity, signal_type=correction
 *   tool_authorization    → category=tooling, signal_type=authorization
 *   workflow_strictness   → category=autonomy, signal_type=authorization
 *   ui_style              → category=identity, signal_type=authorization
 *   verbosity             → category=identity, signal_type=authorization
 *
 * Unknown fields in user-profile.md are preserved (not migrated).
 */

const fs = require('node:fs');
const path = require('node:path');
const { resolveIdentity } = require('../operator-memory/identity');
const { ensureStorageTree } = require('../operator-memory/storage');
const { captureSignal } = require('../operator-memory/proposal');
const { readDecision, promoteProposal } = require('../operator-memory/decision');
const { deriveSlug } = require('../operator-memory/slug');
const { emitDossierEvent } = require('../lib/dossier-telemetry');

const KNOWN_FIELDS = {
  autonomy_preference: { category: 'identity', signal_type: 'authorization' },
  communication_style: { category: 'identity', signal_type: 'authorization' },
  feedback_density: { category: 'identity', signal_type: 'authorization' },
  correction_tolerance: { category: 'identity', signal_type: 'correction' },
  tool_authorization: { category: 'tooling', signal_type: 'authorization' },
  workflow_strictness: { category: 'autonomy', signal_type: 'authorization' },
  ui_style: { category: 'identity', signal_type: 'authorization' },
  verbosity: { category: 'identity', signal_type: 'authorization' }
};

function parseUserProfileFrontmatter(content) {
  const m = content.match(/^---\n([\s\S]*?)\n---/);
  if (!m) return null;
  const out = {};
  for (const line of m[1].split('\n')) {
    const fm = line.match(/^([a-z_]+):\s*(.*)$/);
    if (fm) {
      let v = fm[2].trim();
      if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1);
      if (v.startsWith("'") && v.endsWith("'")) v = v.slice(1, -1);
      out[fm[1]] = v;
    }
  }
  return out;
}

function rewriteUserProfileWithDeprecation(filePath, fm) {
  const content = fs.readFileSync(filePath, 'utf8');
  const m = content.match(/^---\n([\s\S]*?)\n---/);
  if (!m) return false;
  if (fm.deprecated_by === 'operator-memory') return false; // already deprecated
  const updatedFm = { ...fm, deprecated_by: 'operator-memory', deprecated_at: new Date().toISOString() };
  const fmLines = Object.entries(updatedFm).map(([k, v]) => `${k}: ${v}`);
  const newContent = `---\n${fmLines.join('\n')}\n---\n${content.slice(m[0].length)}`;
  const tmp = `${filePath}.tmp`;
  fs.writeFileSync(tmp, newContent, 'utf8');
  fs.renameSync(tmp, filePath);
  return true;
}

async function runOpMigrate({ args = [], options = {}, logger }) {
  const targetDir = process.cwd();
  const profilePath = path.join(targetDir, '.aioson', 'context', 'user-profile.md');

  if (options.help === true || args.includes('--help') || args.includes('-h')) {
    if (logger) logger.log('op:migrate — explicit one-shot import from .aioson/context/user-profile.md into operator-memory. Idempotent.');
    return { ok: true };
  }

  if (!fs.existsSync(profilePath)) {
    const msg = 'op:migrate — no .aioson/context/user-profile.md to migrate (skipped).';
    if (options.json) return { ok: true, migrated: 0, skipped: 0, reason: 'no_user_profile' };
    if (logger) logger.log(msg);
    return { ok: true, migrated: 0 };
  }

  const content = fs.readFileSync(profilePath, 'utf8');
  const fm = parseUserProfileFrontmatter(content);
  if (!fm) {
    if (options.json) return { ok: false, error: 'user-profile.md has no parseable frontmatter' };
    if (logger && logger.error) logger.error('op:migrate — user-profile.md has no parseable frontmatter');
    return { ok: false, exitCode: 1 };
  }

  if (fm.deprecated_by === 'operator-memory') {
    const msg = 'op:migrate — user-profile.md already deprecated (idempotent skip).';
    if (options.json) return { ok: true, migrated: 0, skipped: 0, reason: 'already_deprecated' };
    if (logger) logger.log(msg);
    return { ok: true, migrated: 0, idempotent: true };
  }

  const resolved = resolveIdentity();
  ensureStorageTree(resolved.identity);

  let migrated = 0;
  let skipped = 0;
  const results = [];

  for (const [field, value] of Object.entries(fm)) {
    if (!KNOWN_FIELDS[field]) continue; // unknown field — preserve in user-profile.md
    if (!value || value === 'null' || value === '') { skipped += 1; continue; }
    const config = KNOWN_FIELDS[field];
    const proposalText = `${field}: ${value}`;
    const slug = deriveSlug(proposalText);

    const existing = readDecision(resolved.identity, slug);
    if (existing) {
      skipped += 1;
      results.push({ field, slug, action: 'skipped_existing' });
      continue;
    }

    // Capture + immediately promote (one-shot, skip 2x threshold)
    const cap = captureSignal({
      identity: resolved.identity,
      slug,
      signal_type: config.signal_type,
      quote: `(migrated from user-profile.md: ${field})`,
      proposal: proposalText,
      source_agent: 'migrate'
    });
    promoteProposal({ identity: resolved.identity, proposal: { ...cap.proposal, detected_count: 2 } });
    migrated += 1;
    results.push({ field, slug, action: 'migrated', category: config.category });

    await emitDossierEvent(targetDir, {
      agent: 'op-migrate',
      type: 'op_migrate',
      summary: `migrated ${field} → ${slug}`,
      meta: { identity_prefix: resolved.identity.slice(0, 8), field, slug, category: config.category }
    });
  }

  rewriteUserProfileWithDeprecation(profilePath, fm);

  if (options.json) {
    return { ok: true, migrated, skipped, results, identity: resolved.identity };
  }
  if (logger) {
    logger.log(`op:migrate — imported ${migrated} field(s) from user-profile.md (${skipped} skipped).`);
    if (migrated > 0) logger.log('user-profile.md frontmatter marked deprecated_by: operator-memory');
  }
  return { ok: true, migrated, skipped };
}

module.exports = { runOpMigrate, KNOWN_FIELDS };
