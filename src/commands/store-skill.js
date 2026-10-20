'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const { exists } = require('../utils');
const { readConfig, requireSite } = require('./config');
const { readWorkspace, findProjectRoot } = require('./workspace');
const { scanPackage, formatScanReport } = require('../lib/store/security-scan');
const { resolveTargetDir } = require('../lib/project-root');
const { assertInstallSlug, installTarget } = require('../lib/store/install-containment');

const DEFAULT_BASE_URL = 'https://aioson.com';
const SKILLS_DIRS = ['.aioson/skills', '.aioson/installed-skills'];

function resolveBaseUrl(config) {
  return String(config.aiosonBaseUrl || DEFAULT_BASE_URL).replace(/\/+$/, '');
}

function requireToken(config, t) {
  const token = config.aiosonToken;
  if (!token) throw new Error(t('store.error_not_authenticated'));
  return token;
}

async function storeGet(url, token) {
  const response = await fetch(url, {
    headers: { authorization: `Bearer ${token}`, accept: 'application/json' },
    signal: AbortSignal.timeout(15000)
  });
  const text = await response.text();
  let parsed = null;
  try { parsed = JSON.parse(text); } catch { /* */ }
  if (!response.ok) {
    const detail = (parsed && parsed.error) ? String(parsed.error) : `${response.status} ${response.statusText}`;
    throw new Error(`HTTP ${response.status}: ${detail}`);
  }
  return parsed;
}

async function storePost(url, payload, token) {
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
      accept: 'application/json'
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(30000)
  });

  const text = await response.text();
  let parsed = null;
  try { parsed = JSON.parse(text); } catch { /* */ }

  if (!response.ok) {
    const detail = (parsed && parsed.error) ? String(parsed.error) : `${response.status} ${response.statusText}`;
    throw new Error(`HTTP ${response.status}: ${detail}`);
  }

  return parsed;
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
  const config = await readConfig();
  // Mesmo site do system:publish: --base-url > AIOSON_BASE_URL > padrão, com o
  // token daquele site (sem login nele, recusa).
  const { token, baseUrl } = requireSite(config, options, t);
  const projectDir = await findProjectRoot(resolveTargetDir(args));
  const slug = String(options.slug || '').trim();
  if (!slug) throw new Error(t('store.error_missing_slug'));

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
  const config = await readConfig();
  const token = requireToken(config, t);
  const projectDir = await findProjectRoot(resolveTargetDir(args));
  const baseUrl = resolveBaseUrl(config);

  const ref = String(options.slug || options.code || args[1] || args[0] || '').trim();
  if (!ref) throw new Error(t('store.error_missing_code_or_slug'));

  logger.log(t('store.install_skill_fetching', { ref }));
  const response = await storePost(`${baseUrl}/api/store/skills/install`, { ref }, token);

  const slug = response.slug;
  if (!slug || !response.files || typeof response.files !== 'object') {
    throw new Error(t('store.error_invalid_response'));
  }
  // Slug e caminhos vêm do servidor: tudo dentro de installed-skills/<slug>/
  // antes de criar pasta ou gravar arquivo.
  const destDir = path.join(projectDir, '.aioson', 'installed-skills', assertInstallSlug(slug, t));

  // Install-side preview and scan
  const publisher = response.publisher || 'unknown';
  const version = response.version || '?';
  const serverHash = response.hash || null;
  const trusted = Boolean(response.trusted);
  const downloads = response.downloads != null ? response.downloads : null;
  const rating = response.rating != null ? `${Number(response.rating).toFixed(1)}/5` : null;

  logger.log(t('store.install_preview_header', { slug, publisher, version }));
  if (trusted) logger.log(t('store.install_preview_trusted'));
  else logger.log(t('store.install_preview_unverified'));
  if (downloads != null) logger.log(t('store.install_preview_downloads', { count: downloads }));
  if (rating) logger.log(t('store.install_preview_rating', { rating }));
  if (serverHash) logger.log(t('store.install_preview_hash', { hash: serverHash.slice(0, 12) }));

  // Scan files received from server before writing
  const stringFiles = Object.fromEntries(
    Object.entries(response.files).filter(([, v]) => typeof v === 'string')
  );
  const targets = Object.entries(stringFiles).map(([relPath, content]) => [installTarget(destDir, relPath, t), content]);
  const scan = scanPackage(stringFiles, 'skill');
  formatScanReport(scan, logger);
  if (!scan.ok) throw new Error(t('store.error_install_scan_failed', { slug }));

  // Verify hash integrity if server sent one
  if (serverHash && scan.hash !== serverHash) {
    throw new Error(t('store.error_hash_mismatch', { slug }));
  }

  if (options.inspect) {
    logger.log(t('store.install_inspect_files', { count: Object.keys(stringFiles).length }));
    for (const f of Object.keys(stringFiles).sort()) logger.log(`  ${f}`);
    logger.log(t('store.install_inspect_hint'));
    return { ok: true, slug, inspect: true, files: Object.keys(stringFiles) };
  }

  if (!trusted && !options.force) {
    logger.log(t('store.install_unverified_hint', { slug }));
  }

  await fs.mkdir(destDir, { recursive: true });

  for (const [filePath, content] of targets) {
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, content, 'utf8');
  }

  logger.log(t('store.install_skill_done', { slug, path: destDir }));
  return { ok: true, slug, path: destDir };
}

// ── skill:list --remote ──────────────────────────────────────────────────────

async function runSkillListRemote({ args, options, logger, t }) {
  const config = await readConfig();
  const token = requireToken(config, t);
  const baseUrl = resolveBaseUrl(config);
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
