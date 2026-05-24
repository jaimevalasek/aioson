'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const { exists, ensureDir } = require('../utils');
const { readConfig } = require('./config');
const { readWorkspace, findProjectRoot } = require('./workspace');

let _terser = null;
function getTerser() {
  if (!_terser) _terser = require('terser');
  return _terser;
}

const DEFAULT_BASE_URL = 'https://aioson.com';
const SYSTEM_PACKAGES_DIR = '.aioson/system-packages';
const BACKUPS_DIR = '.aioson/.backups';

// Extensions allowed in a system package (Vite React source tree)
const SYSTEM_ALLOWED_EXTS = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs',
  '.json', '.jsonc',
  '.css', '.scss', '.sass', '.less',
  '.html',
  '.svg', '.ico',
  '.md', '.txt',
  '.sql',
  '.env', '.env.example', '.env.template',
  '.yaml', '.yml',
  '.toml',
  '.gitignore',
]);

const SYSTEM_BUILD_ALLOWED_EXTS = new Set([
  '.js', '.jsx', '.mjs', '.cjs',
  '.json', '.jsonc',
  '.css',
  '.html',
  '.svg', '.ico',
  '.sql',
  '.yaml', '.yml',
  '.prisma',
]);

// Dirs/files to skip when collecting sources
const SKIP_DIRS = new Set([
  'node_modules', '.git', 'dist', 'build', '.turbo', '.next',
  '.cache', 'coverage', '.nyc_output', 'out',
  // AIOSON tooling — não faz parte do código-fonte do sistema
  '.aioson', '.claude', '.gemini', '.codex', 'researchs',
]);

const SKIP_DIRS_BUILD = new Set([
  'node_modules', '.git', '.turbo', '.next',
  '.cache', 'coverage', '.nyc_output',
  'src', 'dashboard/src',
  '.aioson', '.claude', '.gemini', '.codex', 'researchs',
]);

const SKIP_FILES = new Set([
  'package-lock.json', 'yarn.lock', 'pnpm-lock.yaml',
  'bun.lockb',
]);

const MAX_FILE_BYTES = 512 * 1024;             // 512 KB per file (source)
const MAX_FILE_BYTES_BUILD = 2 * 1024 * 1024;  // 2 MB per file (compiled bundles)
const MAX_PACKAGE_BYTES = 20 * 1024 * 1024;    // 20 MB total

/**
 * Parseia lista de emails autorizados a partir de:
 *   1. Flag CLI --invite="email1,email2,email3" (string com separadores , ; espaço quebra)
 *   2. Fallback: campo `authorized_emails` no system.json (array ou string)
 * Devolve array dedup, lowercase, trimmed, validado (contém @).
 */
function parseInviteEmails(cliInvite, manifestEmails) {
  const raw = cliInvite ?? manifestEmails;
  if (!raw) return [];
  let parts;
  if (Array.isArray(raw)) {
    parts = raw.map(String);
  } else {
    parts = String(raw).split(/[,;\s\n]+/);
  }
  return Array.from(new Set(
    parts.map((s) => s.trim().toLowerCase()).filter((s) => s.length > 0 && s.includes('@'))
  ));
}

function resolveBaseUrl(config) {
  return String(config.aiosonBaseUrl || DEFAULT_BASE_URL).replace(/\/+$/, '');
}

function requireToken(config, t) {
  const token = config.aiosonToken;
  if (!token) throw new Error(t('store.error_not_authenticated'));
  return token;
}

async function storePost(url, payload, token) {
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
      accept: 'application/json',
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(120000),
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

async function storeGet(url, token) {
  const response = await fetch(url, {
    headers: { authorization: `Bearer ${token}`, accept: 'application/json' },
    signal: AbortSignal.timeout(15000),
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
 * Collect all eligible source files under `dir`.
 * Returns { relativePath: content } — only text files with allowed extensions.
 */
async function collectSystemFiles(dir, { buildMode = false } = {}) {
  const files = {};
  let totalBytes = 0;
  const errors = [];
  const skipDirs = buildMode ? SKIP_DIRS_BUILD : SKIP_DIRS;
  const allowedExts = buildMode ? SYSTEM_BUILD_ALLOWED_EXTS : SYSTEM_ALLOWED_EXTS;

  async function walk(current, rel) {
    const entries = await fs.readdir(current, { withFileTypes: true });
    for (const entry of entries) {
      if (skipDirs.has(entry.name)) continue;
      if (rel && skipDirs.has(`${rel}/${entry.name}`)) continue;
      if (SKIP_FILES.has(entry.name)) continue;

      const fullPath = path.join(current, entry.name);
      const relPath = rel ? `${rel}/${entry.name}` : entry.name;

      if (entry.isDirectory()) {
        await walk(fullPath, relPath);
        continue;
      }

      const ext = entry.name.includes('.')
        ? `.${entry.name.split('.').pop().toLowerCase()}`
        : '';

      if (!allowedExts.has(ext) && ext !== '') continue;

      try {
        const stat = await fs.stat(fullPath);
        const maxBytes = buildMode ? MAX_FILE_BYTES_BUILD : MAX_FILE_BYTES;
        if (stat.size > maxBytes) {
          errors.push(`File too large (skipped): "${relPath}" (${(stat.size / 1024).toFixed(0)} KB)`);
          continue;
        }
        totalBytes += stat.size;
        if (totalBytes > MAX_PACKAGE_BYTES) {
          errors.push(`Package exceeds ${MAX_PACKAGE_BYTES / 1024 / 1024} MB limit — stop collecting.`);
          return;
        }
        let content = await fs.readFile(fullPath, 'utf8');

        if (buildMode && (ext === '.js' || ext === '.mjs' || ext === '.cjs')) {
          try {
            const terser = getTerser();
            const result = await terser.minify(content, {
              compress: { passes: 2, drop_console: false },
              mangle: {
                toplevel: true,
                properties: { regex: /^_/ },
              },
              format: { comments: false },
            });
            if (result.code) content = result.code;
          } catch {
            // terser failed on this file — keep original compiled JS
          }
        }

        files[relPath] = content;
      } catch {
        // binary or unreadable — skip silently
      }
    }
  }

  await walk(dir, '');
  return { files, totalBytes, errors };
}

/**
 * Parse and validate system.json.
 * Returns the parsed manifest or throws.
 */
async function readSystemJson(dir, t) {
  const manifestPath = path.join(dir, 'system.json');
  if (!(await exists(manifestPath))) {
    throw new Error(t('system.error_no_manifest', { path: manifestPath }));
  }
  let manifest;
  try {
    manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
  } catch {
    throw new Error(t('system.error_invalid_manifest'));
  }
  if (!manifest.slug) throw new Error(t('system.error_manifest_missing_slug'));
  if (!manifest.version) throw new Error(t('system.error_manifest_missing_version'));
  if (!manifest.name) throw new Error(t('system.error_manifest_missing_name'));
  return manifest;
}

// ── system:package ──────────────────────────────────────────────────────────

async function runSystemPackage({ args, options, logger, t }) {
  const dir = path.resolve(process.cwd(), args[0] || '.');

  logger.log(t('system.package_reading_manifest'));
  const manifest = await readSystemJson(dir, t);
  logger.log(t('system.package_manifest_ok', { slug: manifest.slug, version: manifest.version, name: manifest.name }));

  logger.log(t('system.package_collecting_files'));
  const { files, totalBytes, errors } = await collectSystemFiles(dir);

  if (errors.length > 0) {
    for (const e of errors) logger.log(`  [WARN] ${e}`);
  }

  const fileCount = Object.keys(files).length;
  logger.log(t('system.package_files_found', { count: fileCount, kb: (totalBytes / 1024).toFixed(1) }));

  if (!files['system.json']) {
    throw new Error(t('system.error_no_manifest', { path: path.join(dir, 'system.json') }));
  }

  if (options['dry-run']) {
    logger.log(t('system.package_dry_run', { slug: manifest.slug, version: manifest.version }));
    for (const f of Object.keys(files).sort()) logger.log(`  ${f}`);
    return { ok: true, dryRun: true, manifest, fileCount, totalBytes };
  }

  // Save package descriptor locally
  const projectDir = await findProjectRoot(dir);
  const pkgDir = path.join(projectDir, SYSTEM_PACKAGES_DIR, manifest.slug);
  await ensureDir(pkgDir);

  const pkgFile = path.join(pkgDir, `${manifest.slug}-${manifest.version}.json`);
  await fs.writeFile(pkgFile, JSON.stringify({ manifest, files }, null, 2), 'utf8');

  logger.log(t('system.package_saved', { path: pkgFile }));
  return { ok: true, manifest, fileCount, totalBytes, path: pkgFile };
}

// ── system:publish ──────────────────────────────────────────────────────────

async function runSystemPublish({ args, options, logger, t }) {
  const config = await readConfig();
  const token = requireToken(config, t);
  const dir = path.resolve(process.cwd(), args[0] || '.');
  const buildMode = Boolean(options.build);

  logger.log(t('system.publish_reading_manifest'));
  const manifest = await readSystemJson(dir, t);
  logger.log(t('system.package_manifest_ok', { slug: manifest.slug, version: manifest.version, name: manifest.name }));

  if (buildMode) {
    const buildCmd = manifest.build_command || 'npm run build';
    logger.log(`Building: ${buildCmd}`);
    const { execSync } = require('child_process');
    try {
      execSync(buildCmd, { cwd: dir, stdio: 'inherit', timeout: 300_000 });
    } catch (e) {
      throw new Error(`Build failed: ${e.message}`);
    }
    logger.log('Build complete. Collecting compiled output (source excluded)...');
  } else {
    logger.log(t('system.package_collecting_files'));
  }

  const { files, totalBytes, errors } = await collectSystemFiles(dir, { buildMode });

  if (errors.length > 0) {
    for (const e of errors) logger.log(`  [WARN] ${e}`);
  }

  const fileCount = Object.keys(files).length;
  logger.log(t('system.package_files_found', { count: fileCount, kb: (totalBytes / 1024).toFixed(1) }));

  // Basic integrity checks
  if (!files['system.json']) {
    throw new Error(t('system.error_no_manifest', { path: path.join(dir, 'system.json') }));
  }
  if (!files['package.json']) {
    throw new Error(t('system.error_missing_package_json'));
  }

  const visibility = options.private ? 'private' : 'public';
  const paid = Boolean(options.paid);
  const ws = await readWorkspace(dir);

  // Lista de emails autorizados a instalar quando visibility=private.
  // Aceita via --invite="email1,email2" OU campo `authorized_emails` no
  // manifest (system.json). Sem efeito quando visibility !== private.
  const authorizedEmails = parseInviteEmails(options.invite, manifest.authorized_emails);

  if (options['dry-run']) {
    logger.log(t('system.publish_dry_run', { slug: manifest.slug, version: manifest.version, visibility }));
    return { ok: true, dryRun: true, manifest, fileCount, totalBytes, visibility, authorizedEmails };
  }

  logger.log(t('system.publish_sending'));
  const baseUrl = resolveBaseUrl(config);
  const response = await storePost(`${baseUrl}/api/store/systems/publish`, {
    kind: 'aioson.store.system',
    slug: manifest.slug,
    version: manifest.version,
    files,
    manifest,
    visibility,
    paid,
    authorizedEmails,
    workspaceSlug: ws?.slug || null,
  }, token);

  logger.log(t('system.publish_done', { slug: manifest.slug, url: `${baseUrl}/store/systems/${manifest.slug}` }));
  logger.log(t('system.publish_summary', { files: fileCount, kb: (totalBytes / 1024).toFixed(1) }));
  return { ok: true, manifest, fileCount, totalBytes, visibility, paid, response };
}

// ── system:list ─────────────────────────────────────────────────────────────

async function runSystemList({ args, options, logger, t }) {
  if (options.remote) {
    const config = await readConfig();
    const token = requireToken(config, t);
    const baseUrl = resolveBaseUrl(config);
    logger.log(t('list_remote_fetching', { type: 'systems' }));
    const response = await storeGet(`${baseUrl}/api/store/systems`, token);
    const systems = response.systems || [];
    if (systems.length === 0) {
      logger.log(t('system.list_remote_empty'));
    } else {
      logger.log(t('system.list_remote_header', { count: systems.length }));
      for (const s of systems) {
        logger.log(t('system.list_remote_item', { slug: s.slug, name: s.name || s.slug, version: s.version || '?', visibility: s.visibility || '?' }));
      }
    }
    return { ok: true, systems, remote: true };
  }

  // Local: list cached system packages
  const projectDir = await findProjectRoot(path.resolve(process.cwd(), args[0] || '.'));
  const pkgsDir = path.join(projectDir, SYSTEM_PACKAGES_DIR);

  if (!(await exists(pkgsDir))) {
    logger.log(t('system.list_local_empty'));
    return { ok: true, systems: [] };
  }

  const entries = await fs.readdir(pkgsDir, { withFileTypes: true });
  const systems = entries
    .filter(e => e.isDirectory())
    .map(e => ({ slug: e.name }));

  if (systems.length === 0) {
    logger.log(t('system.list_local_empty'));
  } else {
    logger.log(t('system.list_local_header', { count: systems.length }));
    for (const s of systems) {
      logger.log(t('system.list_local_item', { slug: s.slug }));
    }
  }

  return { ok: true, systems };
}

// ── system:install (developer use — downloads source from store) ─────────────

async function runSystemInstall({ args, options, logger, t }) {
  const config = await readConfig();
  const token = requireToken(config, t);
  const projectDir = await findProjectRoot(path.resolve(process.cwd(), args[0] || '.'));
  const baseUrl = resolveBaseUrl(config);

  const ref = String(options.slug || options.code || args[1] || '').trim();
  if (!ref) throw new Error(t('store.error_missing_code_or_slug'));

  logger.log(t('system.install_fetching', { ref }));

  const response = await storePost(`${baseUrl}/api/store/systems/install`, {
    ref,
    workspaceSlug: (await readWorkspace(projectDir))?.slug || null,
  }, token);

  const slug = response.manifest?.slug || response.slug;
  if (!slug || !response.files) throw new Error(t('store.error_invalid_response'));

  const version = response.manifest?.version || '?';
  const publisher = response.publisher || 'unknown';
  logger.log(t('store.install_preview_header', { slug, version, publisher }));

  if (options.inspect) {
    logger.log(t('store.install_inspect_files', { count: Object.keys(response.files).length }));
    for (const f of Object.keys(response.files).sort()) logger.log(`  ${f}`);
    logger.log(t('store.install_inspect_hint'));
    return { ok: true, slug, inspect: true, files: Object.keys(response.files) };
  }

  const pkgDir = path.join(projectDir, SYSTEM_PACKAGES_DIR, slug);

  if ((await exists(pkgDir)) && !options.force) {
    const backupDir = path.join(projectDir, BACKUPS_DIR, `system-packages/${slug}`);
    logger.log(t('store.install_backing_up', { path: backupDir }));
    await fs.rm(backupDir, { recursive: true, force: true });
    await fs.cp(pkgDir, backupDir, { recursive: true });
    await fs.rm(pkgDir, { recursive: true, force: true });
  }

  // Write files
  logger.log(t('system.install_writing'));
  for (const [relPath, content] of Object.entries(response.files)) {
    if (typeof content !== 'string') continue;
    const destPath = path.join(pkgDir, relPath);
    await ensureDir(path.dirname(destPath));
    await fs.writeFile(destPath, content, 'utf8');
  }

  logger.log(t('system.install_done', { slug, path: pkgDir }));
  return { ok: true, slug, path: pkgDir, manifest: response.manifest };
}

module.exports = { runSystemPackage, runSystemPublish, runSystemList, runSystemInstall };
