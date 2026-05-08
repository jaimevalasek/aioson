'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const { exists } = require('../utils');
const { readConfig } = require('./config');
const { readWorkspace, findProjectRoot } = require('./workspace');
const { scanPackage, formatScanReport } = require('../lib/store/security-scan');

const DEFAULT_BASE_URL = 'https://aioson.com';
const GENOMES_DIR = '.aioson/genomes';

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
    headers: {
      authorization: `Bearer ${token}`,
      accept: 'application/json'
    },
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

// ── Format detection ───────────────────────────────────────────────────────

/**
 * Detect which format(s) exist for a given slug.
 * Returns { kind, primary, paths } where:
 *   - kind: 'folder' | 'single-file' | 'both' | 'none'
 *   - primary: which one to act on ('folder' wins on conflict)
 *   - paths: { folder?, mdFile?, metaFile?, refsDir? }
 */
async function findGenomeFormat(projectDir, slug) {
  const folderPath = path.join(projectDir, GENOMES_DIR, slug);
  const skillMdPath = path.join(folderPath, 'SKILL.md');
  const mdPath = path.join(projectDir, GENOMES_DIR, `${slug}.md`);
  const metaPath = path.join(projectDir, GENOMES_DIR, `${slug}.meta.json`);
  const refsDir = path.join(projectDir, GENOMES_DIR, `${slug}.refs`);

  const folderExists = await exists(skillMdPath);
  const fileExists = await exists(mdPath);

  if (folderExists && fileExists) {
    return {
      kind: 'both',
      primary: 'folder',
      paths: { folder: folderPath, mdFile: mdPath, metaFile: metaPath, refsDir }
    };
  }
  if (folderExists) {
    return { kind: 'folder', primary: 'folder', paths: { folder: folderPath } };
  }
  if (fileExists) {
    return {
      kind: 'single-file',
      primary: 'single-file',
      paths: { mdFile: mdPath, metaFile: metaPath, refsDir }
    };
  }
  return { kind: 'none', primary: null, paths: {} };
}

// ── Folder collection (Track 4.2/4.3) ──────────────────────────────────────

/**
 * Recursively walk all files in a genome folder (Track 4.2/4.3 modular format).
 * Mirrors collectSkillFiles() pattern from store-skill.js.
 * Returns { relativePath: fileContent } for text files. Binary files skipped.
 */
async function collectGenomeFolder(genomeDir) {
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

  await walk(genomeDir, '');
  return files;
}

// ── Legacy single-file refs collection ─────────────────────────────────────

async function collectRefs(refsDir) {
  const refs = {};
  if (!(await exists(refsDir))) return refs;
  const entries = await fs.readdir(refsDir);
  for (const entry of entries) {
    try {
      refs[entry] = await fs.readFile(path.join(refsDir, entry), 'utf8');
    } catch { /* */ }
  }
  return refs;
}

// ── Parse minimal metadata for list output ─────────────────────────────────

/**
 * Read minimal metadata from a folder genome (SKILL.md frontmatter + manifest.json).
 * Returns { slug, name, track, fidelity_score, advisor_ready, type, language, format }
 */
async function parseFolderMetadata(folderPath, slug) {
  const meta = { slug, format: 'folder' };
  const manifestPath = path.join(folderPath, 'manifest.json');
  if (await exists(manifestPath)) {
    try {
      const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
      meta.name = manifest.domain || manifest.persona_source || slug;
      meta.track = manifest.track || null;
      meta.fidelity_score = manifest.fidelity_score != null ? manifest.fidelity_score : null;
      meta.advisor_ready = Boolean(manifest.advisor_ready);
      meta.type = manifest.type || null;
      meta.language = manifest.language || null;
      meta.viability_score = manifest.viability_score != null ? manifest.viability_score : null;
    } catch { /* invalid manifest — fall back to defaults */ }
  }
  return meta;
}

/**
 * Read minimal metadata from single-file genome (.meta.json).
 */
async function parseSingleFileMetadata(genomesDir, slug) {
  const meta = { slug, format: 'single-file' };
  const metaPath = path.join(genomesDir, `${slug}.meta.json`);
  if (await exists(metaPath)) {
    try {
      const m = JSON.parse(await fs.readFile(metaPath, 'utf8'));
      meta.name = m.name || m.domain || slug;
      meta.version = m.version || null;
      meta.track = m.track || null;
      meta.fidelity_score = m.fidelity_score != null ? m.fidelity_score : null;
      meta.type = m.type || null;
      meta.language = m.language || null;
    } catch { /* */ }
  }
  return meta;
}

// ── genome:publish ──────────────────────────────────────────────────────────

async function runGenomePublish({ args, options, logger, t }) {
  const config = await readConfig();
  const token = requireToken(config, t);
  const projectDir = await findProjectRoot(path.resolve(process.cwd(), args[0] || '.'));
  const slug = String(options.slug || '').trim();
  if (!slug) throw new Error(t('store.error_missing_slug'));

  const fmt = await findGenomeFormat(projectDir, slug);

  if (fmt.kind === 'none') {
    throw new Error(t('store.error_genome_not_found', {
      slug,
      path: path.join(projectDir, GENOMES_DIR, slug)
    }));
  }

  if (fmt.kind === 'both') {
    logger.log(t('store.publish_genome_conflict_warn', { slug }));
  }

  // ── Folder format (Track 4.2/4.3) ────────────────────────────────────────
  if (fmt.primary === 'folder') {
    return await publishFolderGenome({
      projectDir, slug, folderPath: fmt.paths.folder, options, logger, t, config, token
    });
  }

  // ── Single-file format (legacy) ──────────────────────────────────────────
  return await publishSingleFileGenome({
    projectDir, slug, paths: fmt.paths, options, logger, t, config, token
  });
}

async function publishFolderGenome({ projectDir, slug, folderPath, options, logger, t, config, token }) {
  logger.log(t('store.publish_genome_folder_collecting'));
  const files = await collectGenomeFolder(folderPath);
  const fileCount = Object.keys(files).length;

  if (!files['SKILL.md']) {
    throw new Error(t('store.error_genome_missing_skillmd', { slug }));
  }
  if (!files['manifest.json']) {
    throw new Error(t('store.error_genome_missing_manifest', { slug }));
  }

  // Validate manifest.json parses
  let manifest;
  try {
    manifest = JSON.parse(files['manifest.json']);
  } catch (err) {
    throw new Error(t('store.error_genome_invalid_manifest', { slug, detail: err.message }));
  }

  // Security scan
  const scan = scanPackage(files, 'genome');
  formatScanReport(scan, logger);
  if (!scan.ok) throw new Error(t('store.error_scan_failed'));
  if (scan.warnings.length > 0 && !options.force) {
    throw new Error(t('store.error_scan_warnings', { count: scan.warnings.length }));
  }

  const ws = await readWorkspace(projectDir);
  const visibility = options.private ? 'private' : 'public';
  const paid = Boolean(options.paid);

  if (options['dry-run']) {
    logger.log(t('store.publish_dry_run', { type: 'genome', slug, visibility }));
    logger.log(t('store.publish_genome_folder_files', { count: fileCount }));
    logger.log(t('store.publish_genome_folder_track', {
      track: manifest.track || '?',
      fidelity: manifest.fidelity_score != null ? manifest.fidelity_score.toFixed(2) : '?',
      advisor: manifest.advisor_ready ? 'yes' : 'no'
    }));
    logger.log(t('store.publish_scan_ok', { hash: scan.hash.slice(0, 12) }));
    return {
      ok: true, dryRun: true, slug, visibility, paid, fileCount,
      format: 'folder', track: manifest.track, hash: scan.hash
    };
  }

  logger.log(t('store.publish_scan_ok', { hash: scan.hash.slice(0, 12) }));
  logger.log(t('store.publish_genome_folder_sending', { count: fileCount }));
  const baseUrl = resolveBaseUrl(config);
  const response = await storePost(`${baseUrl}/api/store/genomes/publish`, {
    kind: 'aioson.store.genome',
    format: 'folder',
    slug,
    files,
    track: manifest.track || null,
    visibility,
    paid,
    hash: scan.hash,
    workspaceSlug: ws?.slug || null
  }, token);

  logger.log(t('store.publish_genome_done', { slug, url: `${baseUrl}/store/genomes/${slug}` }));
  return { ok: true, slug, visibility, paid, fileCount, format: 'folder', response };
}

async function publishSingleFileGenome({ projectDir, slug, paths, options, logger, t, config, token }) {
  logger.log(t('store.publish_genome_validating'));
  const content = await fs.readFile(paths.mdFile, 'utf8');

  let meta = {};
  if (await exists(paths.metaFile)) {
    try { meta = JSON.parse(await fs.readFile(paths.metaFile, 'utf8')); } catch { /* */ }
  }

  const refs = await collectRefs(paths.refsDir);

  // Security scan
  const allFiles = { [`${slug}.md`]: content };
  if (meta) allFiles[`${slug}.meta.json`] = JSON.stringify(meta);
  for (const [k, v] of Object.entries(refs)) allFiles[`refs/${k}`] = v;

  const scan = scanPackage(allFiles, 'genome');
  formatScanReport(scan, logger);
  if (!scan.ok) throw new Error(t('store.error_scan_failed'));
  if (scan.warnings.length > 0 && !options.force) {
    throw new Error(t('store.error_scan_warnings', { count: scan.warnings.length }));
  }

  const ws = await readWorkspace(projectDir);
  const visibility = options.private ? 'private' : 'public';
  const paid = Boolean(options.paid);

  if (options['dry-run']) {
    logger.log(t('store.publish_dry_run', { type: 'genome', slug, visibility }));
    logger.log(t('store.publish_scan_ok', { hash: scan.hash.slice(0, 12) }));
    return { ok: true, dryRun: true, slug, visibility, paid, format: 'single-file', hash: scan.hash };
  }

  logger.log(t('store.publish_scan_ok', { hash: scan.hash.slice(0, 12) }));
  logger.log(t('store.publish_genome_sending'));
  const baseUrl = resolveBaseUrl(config);
  const response = await storePost(`${baseUrl}/api/store/genomes/publish`, {
    kind: 'aioson.store.genome',
    format: 'single-file',
    slug,
    content,
    meta,
    refs,
    visibility,
    paid,
    hash: scan.hash,
    workspaceSlug: ws?.slug || null
  }, token);

  logger.log(t('store.publish_genome_done', { slug, url: `${baseUrl}/store/genomes/${slug}` }));
  return { ok: true, slug, visibility, paid, format: 'single-file', response };
}

// ── genome:install (store) ──────────────────────────────────────────────────

async function runGenomeInstallStore({ args, options, logger, t }) {
  const config = await readConfig();
  const token = requireToken(config, t);
  const projectDir = await findProjectRoot(path.resolve(process.cwd(), args[0] || '.'));
  const baseUrl = resolveBaseUrl(config);

  // Accept: --slug=X or positional code/slug
  const ref = String(options.slug || options.code || args[1] || args[0] || '').trim();
  if (!ref) throw new Error(t('store.error_missing_code_or_slug'));

  const ws = await readWorkspace(projectDir);
  logger.log(t('store.install_genome_fetching', { ref }));

  const response = await storePost(`${baseUrl}/api/store/genomes/install`, {
    ref,
    workspaceSlug: ws?.slug || null
  }, token);

  const slug = response.slug;
  if (!slug) throw new Error(t('store.error_invalid_response'));

  // Detect response format: folder (has `files` map) or single-file (has `content`)
  const isFolder = response.format === 'folder' || (response.files && typeof response.files === 'object');
  const isSingleFile = response.format === 'single-file' || typeof response.content === 'string';

  if (!isFolder && !isSingleFile) {
    throw new Error(t('store.error_invalid_response'));
  }

  if (isFolder) {
    return await installFolderGenome({ projectDir, slug, response, options, logger, t });
  }

  return await installSingleFileGenome({ projectDir, slug, response, options, logger, t });
}

async function installFolderGenome({ projectDir, slug, response, options, logger, t }) {
  // Server-sent files map { 'SKILL.md': '...', 'manifest.json': '...', 'references/...': '...' }
  const files = response.files;

  // Filter to string entries only (defensive)
  const stringFiles = Object.fromEntries(
    Object.entries(files).filter(([, v]) => typeof v === 'string')
  );

  if (!stringFiles['SKILL.md']) {
    throw new Error(t('store.error_genome_missing_skillmd', { slug }));
  }

  // Server-side metadata for preview
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

  // Security scan files received from server before writing
  const scan = scanPackage(stringFiles, 'genome');
  formatScanReport(scan, logger);
  if (!scan.ok) throw new Error(t('store.error_install_scan_failed', { slug }));

  // Verify hash if server sent one
  if (serverHash && scan.hash !== serverHash) {
    throw new Error(t('store.error_hash_mismatch', { slug }));
  }

  if (options.inspect) {
    logger.log(t('store.install_inspect_files', { count: Object.keys(stringFiles).length }));
    for (const f of Object.keys(stringFiles).sort()) logger.log(`  ${f}`);
    logger.log(t('store.install_inspect_hint'));
    return { ok: true, slug, format: 'folder', inspect: true, files: Object.keys(stringFiles) };
  }

  if (!trusted && !options.force) {
    logger.log(t('store.install_unverified_hint', { slug }));
  }

  const destDir = path.join(projectDir, GENOMES_DIR, slug);

  // Backup any existing folder OR legacy single-file conflict
  const legacyMd = path.join(projectDir, GENOMES_DIR, `${slug}.md`);
  if ((await exists(legacyMd)) && !options.force) {
    const backupPath = path.join(projectDir, GENOMES_DIR, `${slug}.legacy-backup.md`);
    logger.log(t('store.install_backing_up_legacy', { path: backupPath }));
    await fs.rename(legacyMd, backupPath);
    const legacyMeta = path.join(projectDir, GENOMES_DIR, `${slug}.meta.json`);
    if (await exists(legacyMeta)) {
      await fs.rename(legacyMeta, path.join(projectDir, GENOMES_DIR, `${slug}.legacy-backup.meta.json`));
    }
  }
  if ((await exists(destDir)) && !options.force) {
    logger.log(t('store.install_folder_exists', { path: destDir }));
  }

  // Write all files preserving directory structure
  await fs.mkdir(destDir, { recursive: true });
  for (const [relPath, content] of Object.entries(stringFiles)) {
    const filePath = path.join(destDir, relPath);
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, content, 'utf8');
  }

  logger.log(t('store.install_genome_folder_done', {
    slug, path: destDir, count: Object.keys(stringFiles).length
  }));
  return { ok: true, slug, path: destDir, format: 'folder', fileCount: Object.keys(stringFiles).length };
}

async function installSingleFileGenome({ projectDir, slug, response, options, logger, t }) {
  if (!response.content) {
    throw new Error(t('store.error_invalid_response'));
  }

  const destPath = path.join(projectDir, GENOMES_DIR, `${slug}.md`);
  const metaDestPath = path.join(projectDir, GENOMES_DIR, `${slug}.meta.json`);

  // Backup existing version if present
  if ((await exists(destPath)) && !options.force) {
    const backupPath = path.join(projectDir, GENOMES_DIR, `${slug}.backup.md`);
    logger.log(t('store.install_backing_up', { path: backupPath }));
    await fs.copyFile(destPath, backupPath);
  }

  await fs.mkdir(path.dirname(destPath), { recursive: true });
  await fs.writeFile(destPath, response.content, 'utf8');

  if (response.meta) {
    await fs.writeFile(metaDestPath, `${JSON.stringify(response.meta, null, 2)}\n`, 'utf8');
  }

  // Write refs if present (legacy {slug}.refs/ flat dir)
  if (response.refs && typeof response.refs === 'object') {
    const refsDir = path.join(projectDir, GENOMES_DIR, `${slug}.refs`);
    await fs.mkdir(refsDir, { recursive: true });
    for (const [name, content] of Object.entries(response.refs)) {
      await fs.writeFile(path.join(refsDir, name), content, 'utf8');
    }
  }

  logger.log(t('store.install_genome_done', { slug, path: destPath }));
  return { ok: true, slug, path: destPath, format: 'single-file' };
}

// ── genome:install (user-facing alias for genome:install:store) ─────────────

async function runGenomeInstall({ args, options, logger, t }) {
  // Accept: aioson genome:install <code-or-slug> or --slug=X or --code=X
  const ref = String(options.slug || options.code || args[0] || '').trim();
  if (!ref) throw new Error(t('store.error_missing_code_or_slug'));
  return runGenomeInstallStore({ args, options: { ...options, slug: ref }, logger, t });
}

// ── genome:list ─────────────────────────────────────────────────────────────

async function runGenomeList({ args, options, logger, t }) {
  // --remote: list published genomes on aioson.com
  if (options.remote) {
    const config = await readConfig();
    const token = requireToken(config, t);
    const baseUrl = resolveBaseUrl(config);
    logger.log(t('store.list_remote_fetching', { type: 'genomes' }));
    const response = await storeGet(`${baseUrl}/api/store/genomes`, token);
    const genomes = response.genomes || [];
    if (genomes.length === 0) {
      logger.log(t('store.list_remote_empty', { type: 'genomes' }));
    } else {
      logger.log(t('store.list_remote_header', { count: genomes.length, type: 'genomes' }));
      for (const g of genomes) {
        logger.log(t('store.list_remote_item', { slug: g.slug, name: g.name || g.slug, visibility: g.visibility || '?' }));
      }
    }
    return { ok: true, genomes, remote: true };
  }

  // local list — walk both folder format and single-file format
  const projectDir = await findProjectRoot(path.resolve(process.cwd(), args[0] || '.'));
  const genomesDir = path.join(projectDir, GENOMES_DIR);

  if (!(await exists(genomesDir))) {
    logger.log(t('store.list_genome_empty'));
    return { ok: true, genomes: [] };
  }

  const entries = await fs.readdir(genomesDir, { withFileTypes: true });
  const genomes = [];

  // Track folder slugs to skip duplicate single-file entries (folder wins)
  const folderSlugs = new Set();

  // First pass: folders (Track 4.2/4.3)
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const slug = entry.name;
    const skillMdPath = path.join(genomesDir, slug, 'SKILL.md');
    if (await exists(skillMdPath)) {
      folderSlugs.add(slug);
      const meta = await parseFolderMetadata(path.join(genomesDir, slug), slug);
      genomes.push(meta);
    }
  }

  // Second pass: single-file genomes
  // Excluded: INDEX.md (registry/discovery file), backups, README.md, and uppercase-only names
  const NON_GENOME_FILES = new Set(['INDEX.md', 'README.md', 'CHANGELOG.md', 'NOTES.md', 'TODO.md']);
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    if (!entry.name.endsWith('.md')) continue;
    if (entry.name.endsWith('.backup.md') || entry.name.endsWith('.legacy-backup.md')) continue;
    if (NON_GENOME_FILES.has(entry.name)) continue;
    const slug = entry.name.replace(/\.md$/, '');
    // Skip if folder format already exists for this slug
    if (folderSlugs.has(slug)) {
      logger.log(t('store.list_genome_conflict_warn', { slug }));
      continue;
    }
    const meta = await parseSingleFileMetadata(genomesDir, slug);
    genomes.push(meta);
  }

  if (genomes.length === 0) {
    logger.log(t('store.list_genome_empty'));
  } else {
    logger.log(t('store.list_genome_header', { count: genomes.length }));
    for (const g of genomes) {
      const isFolder = g.format === 'folder';
      const folderMarker = isFolder ? '📁' : '  ';
      const advisorMarker = g.advisor_ready ? '🎙️' : '  ';
      const trackMarker = g.track ? `(track ${g.track})` : (g.version ? `(v${g.version})` : '');
      const fidelityMarker = (g.fidelity_score != null) ? ` fidelity:${g.fidelity_score.toFixed(2)}` : '';
      const advisorTag = g.advisor_ready ? ' [advisor-ready]' : '';
      logger.log(t('store.list_genome_item_v2', {
        folderMarker,
        advisorMarker,
        slug: g.slug,
        name: g.name,
        track: trackMarker,
        fidelity: fidelityMarker,
        advisor: advisorTag
      }));
    }
  }

  return { ok: true, genomes };
}

// ── genome:remove ────────────────────────────────────────────────────────────

async function runGenomeRemove({ args, options, logger, t }) {
  const projectDir = await findProjectRoot(path.resolve(process.cwd(), args[0] || '.'));
  const slug = String(options.slug || args[0] || '').trim();
  if (!slug) throw new Error(t('store.error_missing_slug'));

  const fmt = await findGenomeFormat(projectDir, slug);

  if (fmt.kind === 'none') {
    throw new Error(t('store.error_genome_not_found', {
      slug,
      path: path.join(projectDir, GENOMES_DIR, slug)
    }));
  }

  const genomesDir = path.join(projectDir, GENOMES_DIR);

  // Folder format removal
  if (fmt.primary === 'folder') {
    if (!options.force) {
      // Backup folder by zipping its content into a backup.json (simple snapshot)
      const backupPath = path.join(genomesDir, `${slug}.folder-backup.json`);
      const files = await collectGenomeFolder(fmt.paths.folder);
      await fs.writeFile(backupPath, JSON.stringify(files, null, 2), 'utf8');
      logger.log(t('store.install_backing_up', { path: backupPath }));
    }
    await fs.rm(fmt.paths.folder, { recursive: true, force: true });
  }

  // Also remove single-file artifacts if they exist (clean up after the conflict)
  if (fmt.kind === 'both' || fmt.primary === 'single-file') {
    const mdPath = fmt.paths.mdFile || path.join(genomesDir, `${slug}.md`);
    const metaPath = fmt.paths.metaFile || path.join(genomesDir, `${slug}.meta.json`);
    const refsDir = fmt.paths.refsDir || path.join(genomesDir, `${slug}.refs`);

    if (await exists(mdPath)) {
      if (!options.force && fmt.primary === 'single-file') {
        const backupPath = path.join(genomesDir, `${slug}.backup.md`);
        await fs.copyFile(mdPath, backupPath);
        logger.log(t('store.install_backing_up', { path: backupPath }));
      }
      await fs.unlink(mdPath);
    }
    if (await exists(metaPath)) await fs.unlink(metaPath);
    if (await exists(refsDir)) {
      const refs = await fs.readdir(refsDir);
      for (const r of refs) await fs.unlink(path.join(refsDir, r));
      await fs.rmdir(refsDir);
    }
  }

  logger.log(t('store.remove_genome_done', { slug }));
  return { ok: true, slug, format: fmt.primary };
}

module.exports = {
  runGenomePublish,
  runGenomeInstallStore,
  runGenomeInstall,
  runGenomeList,
  runGenomeRemove,
  // Exported for testing / reuse
  findGenomeFormat,
  collectGenomeFolder,
  parseFolderMetadata,
  parseSingleFileMetadata
};
