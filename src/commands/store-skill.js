'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const { exists } = require('../utils');
const { readConfig } = require('./config');
const { readWorkspace } = require('./workspace');
const { scanPackage, formatScanReport } = require('../lib/store/security-scan');
const { assertInstallSlug, textFiles, installTargets, writeInstallTargets } = require('../lib/store/install-containment');
const { reviewInstallPackage } = require('../lib/store/install-review');
const { defaultStoreSite, resolvePublishContext, resolveInstallContext } = require('../lib/store/command-context');
const { storeGet, storePostJson } = require('../lib/store/http');

const SKILLS_DIRS = ['.aioson/skills', '.aioson/installed-skills'];

function storePost(url, payload, token) {
  return storePostJson(url, payload, token, 30000);
}

/**
 * Collect all files in a skill directory recursively.
 * Returns { relativePath: fileContent } for text files.
 */
async function collectSkillFiles(skillDir) {
  const files = {};

  async function walk(dir, base) {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      const relPath = base ? `${base}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        await walk(fullPath, relPath);
      } else {
        try {
          files[relPath] = await fs.readFile(fullPath, 'utf8');
        } catch { /* binary files skipped */ }
      }
    }
  }

  await walk(skillDir, '');
  return files;
}

async function findSkillDir(projectDir, slug) {
  for (const base of SKILLS_DIRS) {
    const skillDir = path.join(projectDir, base, slug);
    if (await exists(path.join(skillDir, 'SKILL.md'))) {
      return skillDir;
    }
  }
  return null;
}

// ── skill:publish ───────────────────────────────────────────────────────────

async function runSkillPublish({ args, options, logger, t }) {
  const { token, baseUrl, projectDir, slug } = await resolvePublishContext(await readConfig(), { args, options, t });

  const skillDir = await findSkillDir(projectDir, slug);
  if (!skillDir) {
    throw new Error(t('store.error_skill_not_found', { slug }));
  }

  logger.log(t('store.publish_skill_collecting'));
  const files = await collectSkillFiles(skillDir);
  const fileCount = Object.keys(files).length;

  if (!files['SKILL.md']) {
    throw new Error(t('store.error_skill_missing_skillmd', { slug }));
  }

  // Security scan
  const scan = scanPackage(files, 'skill');
  formatScanReport(scan, logger);
  if (!scan.ok) throw new Error(t('store.error_scan_failed'));
  if (scan.warnings.length > 0 && !options.force) {
    throw new Error(t('store.error_scan_warnings', { count: scan.warnings.length }));
  }

  const ws = await readWorkspace(projectDir);
  const visibility = options.private ? 'private' : 'public';
  const paid = Boolean(options.paid);

  if (options['dry-run']) {
    logger.log(t('store.publish_dry_run', { type: 'skill', slug, visibility }));
    logger.log(t('store.publish_skill_files', { count: fileCount }));
    logger.log(t('store.publish_scan_ok', { hash: scan.hash.slice(0, 12) }));
    return { ok: true, dryRun: true, slug, visibility, paid, fileCount, hash: scan.hash };
  }

  logger.log(t('store.publish_scan_ok', { hash: scan.hash.slice(0, 12) }));
  logger.log(t('store.publish_skill_sending', { count: fileCount, url: baseUrl }));
  const response = await storePost(`${baseUrl}/api/store/skills/publish`, {
    kind: 'aioson.store.skill',
    slug,
    files,
    visibility,
    paid,
    hash: scan.hash,
    workspaceSlug: ws?.slug || null
  }, token);

  logger.log(t('store.publish_skill_done', { slug, url: `${baseUrl}/store/skills/${slug}` }));
  return { ok: true, slug, visibility, paid, fileCount, response };
}

// ── skill:install:store ─────────────────────────────────────────────────────

async function runSkillInstallStore({ args, options, logger, t }) {
  const { token, baseUrl, projectDir, ref } = await resolveInstallContext(await readConfig(), { args, options, t });

  logger.log(t('store.install_skill_fetching', { ref }));
  const response = await storePost(`${baseUrl}/api/store/skills/install`, { ref }, token);

  const slug = response.slug;
  if (!slug || !response.files || typeof response.files !== 'object') {
    throw new Error(t('store.error_invalid_response'));
  }
  // Slug e caminhos vêm do servidor: tudo dentro de installed-skills/<slug>/
  // antes de criar pasta ou gravar arquivo. Prévia, scan e hash antes também.
  const destDir = path.join(projectDir, '.aioson', 'installed-skills', assertInstallSlug(slug, t));
  const files = textFiles(response.files);
  const targets = installTargets(destDir, files, t);
  if (reviewInstallPackage({ response, slug, version: response.version || '?', files, type: 'skill', options, logger, t })) {
    return { ok: true, slug, inspect: true, files: Object.keys(files) };
  }

  await fs.mkdir(destDir, { recursive: true });
  await writeInstallTargets(targets);
  logger.log(t('store.install_skill_done', { slug, path: destDir }));
  return { ok: true, slug, path: destDir };
}

// ── skill:list --remote ──────────────────────────────────────────────────────

async function runSkillListRemote({ args, options, logger, t }) {
  const { token, baseUrl } = defaultStoreSite(await readConfig(), t);
  logger.log(t('store.list_remote_fetching', { type: 'skills' }));
  const response = await storeGet(`${baseUrl}/api/store/skills`, token);
  const skills = response.skills || [];
  if (skills.length === 0) {
    logger.log(t('store.list_remote_empty', { type: 'skills' }));
  } else {
    logger.log(t('store.list_remote_header', { count: skills.length, type: 'skills' }));
    for (const s of skills) {
      logger.log(t('store.list_remote_item', { slug: s.slug, name: s.title || s.slug, visibility: s.visibility || '?' }));
    }
  }
  return { ok: true, skills, remote: true };
}

module.exports = { runSkillPublish, runSkillInstallStore, runSkillListRemote };
