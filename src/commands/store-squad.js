'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const { exists, ensureDir } = require('../utils');
const { readConfig, requireSite } = require('./config');
const { readWorkspace, findProjectRoot } = require('./workspace');
const { scanPackage, formatScanReport } = require('../lib/store/security-scan');
const { resolveTargetDir } = require('../lib/project-root');
const { assertInstallSlug, installTarget } = require('../lib/store/install-containment');

const DEFAULT_BASE_URL = 'https://aioson.com';
const SQUADS_DIR = '.aioson/squads';
const INSTALLED_SKILLS_DIR = '.aioson/installed-skills';
const GENOMES_DIR = '.aioson/genomes';
const BACKUPS_DIR = '.aioson/.backups';

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
    signal: AbortSignal.timeout(60000)
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
 * Collect all files in a directory recursively.
 * Returns { relativePath: fileContent }
 */
async function collectDirFiles(dir, baseLabel) {
  const files = {};

  async function walk(current, rel) {
    const entries = await fs.readdir(current, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(current, entry.name);
      const relPath = rel ? `${rel}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        await walk(fullPath, relPath);
      } else {
        try {
          files[`${baseLabel}/${relPath}`] = await fs.readFile(fullPath, 'utf8');
        } catch { /* binary files skipped */ }
      }
    }
  }

  if (await exists(dir)) await walk(dir, '');
  return files;
}

/**
 * Parse squad.md / manifest to find bundled skills and genomes.
 * Looks for frontmatter fields: bundled_skills, bundled_genomes
 */
function parseBundledDeps(content) {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) return { skills: [], genomes: [] };

  const skills = [];
  const genomes = [];

  for (const line of match[1].split('\n')) {
    const [key, ...rest] = line.split(':');
    const val = rest.join(':').trim().replace(/^["'\[]|["'\]]$/g, '');
    const k = (key || '').trim();
    if (k === 'bundled_skills') skills.push(...val.split(',').map(s => s.trim()).filter(Boolean));
    if (k === 'bundled_genomes') genomes.push(...val.split(',').map(s => s.trim()).filter(Boolean));
  }

  return { skills, genomes };
}

// ── squad:publish ───────────────────────────────────────────────────────────

async function runSquadPublish({ args, options, logger, t }) {
  const config = await readConfig();
  // Mesmo site do system:publish: --base-url > AIOSON_BASE_URL > padrão, com o
  // token daquele site (sem login nele, recusa).
  const { token, baseUrl } = requireSite(config, options, t);
  const projectDir = await findProjectRoot(resolveTargetDir(args));
  const slug = String(options.slug || '').trim();
  if (!slug) throw new Error(t('store.error_missing_slug'));

  const squadDir = path.join(projectDir, SQUADS_DIR, slug);
  if (!(await exists(squadDir))) {
    throw new Error(t('store.error_squad_not_found', { slug, path: squadDir }));
  }

  logger.log(t('store.publish_squad_analyzing_agents'));
  const agentsDir = path.join(squadDir, 'agents');
  const agentFiles = await collectDirFiles(agentsDir, 'agents');
  const agentCount = Object.keys(agentFiles).length;
  logger.log(t('store.publish_squad_agents_found', { count: agentCount }));

  // Read squad.md to discover bundled deps
  const squadMdPath = path.join(squadDir, 'squad.md');
  let bundledSkillSlugs = String(options['bundle-skills'] || '').split(',').map(s => s.trim()).filter(Boolean);
  let bundledGenomeSlugs = String(options['bundle-genomes'] || '').split(',').map(s => s.trim()).filter(Boolean);

  if (await exists(squadMdPath)) {
    const squadMdContent = await fs.readFile(squadMdPath, 'utf8');
    const parsed = parseBundledDeps(squadMdContent);
    bundledSkillSlugs = [...new Set([...bundledSkillSlugs, ...parsed.skills])];
    bundledGenomeSlugs = [...new Set([...bundledGenomeSlugs, ...parsed.genomes])];
  }

  logger.log(t('store.publish_squad_analyzing_deps'));

  // Collect bundled skills
  const skillFiles = {};
  for (const skillSlug of bundledSkillSlugs) {
    const skillDir = path.join(projectDir, INSTALLED_SKILLS_DIR, skillSlug);
    const altSkillDir = path.join(projectDir, '.aioson/skills', skillSlug);
    const src = (await exists(path.join(skillDir, 'SKILL.md'))) ? skillDir : altSkillDir;
    if (await exists(path.join(src, 'SKILL.md'))) {
      const files = await collectDirFiles(src, '');
      for (const [k, v] of Object.entries(files)) {
        skillFiles[`skills/${skillSlug}/${k}`] = v;
      }
      logger.log(t('store.publish_squad_bundling_skill', { slug: skillSlug }));
    } else {
      logger.log(t('store.publish_squad_skill_missing', { slug: skillSlug }));
    }
  }

  // Collect bundled genomes
  const genomeFiles = {};
  for (const genomeSlug of bundledGenomeSlugs) {
    const genomePath = path.join(projectDir, GENOMES_DIR, `${genomeSlug}.md`);
    const metaPath = path.join(projectDir, GENOMES_DIR, `${genomeSlug}.meta.json`);
    if (await exists(genomePath)) {
      genomeFiles[`genomes/${genomeSlug}.md`] = await fs.readFile(genomePath, 'utf8');
      if (await exists(metaPath)) {
        genomeFiles[`genomes/${genomeSlug}.meta.json`] = await fs.readFile(metaPath, 'utf8');
      }
      logger.log(t('store.publish_squad_bundling_genome', { slug: genomeSlug }));
    } else {
      logger.log(t('store.publish_squad_genome_missing', { slug: genomeSlug }));
    }
  }

  // Collect squad root files (squad.md, etc.)
  const squadRootFiles = await collectDirFiles(squadDir, 'squad');

  const allFiles = { ...squadRootFiles, ...skillFiles, ...genomeFiles };

  // Security scan — squads carry the highest risk (arbitrary dir contents)
  logger.log(t('store.publish_scanning'));
  const scan = scanPackage(allFiles, 'squad');
  formatScanReport(scan, logger);
  if (!scan.ok) throw new Error(t('store.error_scan_failed'));
  if (scan.warnings.length > 0 && !options.force) {
    throw new Error(t('store.error_scan_warnings', { count: scan.warnings.length }));
  }

  const manifest = {
    slug,
    version: String(options.version || '1.0.0'),
    bundled: {
      skills: bundledSkillSlugs,
      genomes: bundledGenomeSlugs
    }
  };

  const ws = await readWorkspace(projectDir);
  const visibility = options.private ? 'private' : 'public';
  const paid = Boolean(options.paid);

  if (options['dry-run']) {
    logger.log(t('store.publish_dry_run', { type: 'squad', slug, visibility }));
    logger.log(t('store.publish_squad_summary', {
      agents: agentCount,
      skills: bundledSkillSlugs.length,
      genomes: bundledGenomeSlugs.length
    }));
    logger.log(t('store.publish_scan_ok', { hash: scan.hash.slice(0, 12) }));
    return { ok: true, dryRun: true, slug, visibility, paid, agentCount, manifest, hash: scan.hash };
  }

  logger.log(t('store.publish_scan_ok', { hash: scan.hash.slice(0, 12) }));
  logger.log(t('store.publish_squad_sending', { url: baseUrl }));
  const response = await storePost(`${baseUrl}/api/store/squads/publish`, {
    kind: 'aioson.store.squad',
    slug,
    files: allFiles,
    manifest,
    visibility,
    paid,
    hash: scan.hash,
    workspaceSlug: ws?.slug || null
  }, token);

  logger.log(t('store.publish_squad_done', { slug, url: `${baseUrl}/store/squads/${slug}` }));
  logger.log(t('store.publish_squad_summary', {
    agents: agentCount,
    skills: bundledSkillSlugs.length,
    genomes: bundledGenomeSlugs.length
  }));
  return { ok: true, slug, visibility, paid, agentCount, manifest, hash: scan.hash, response };
}

// ── squad:install ───────────────────────────────────────────────────────────

async function runSquadInstall({ args, options, logger, t }) {
  const config = await readConfig();
  const token = requireToken(config, t);
  const projectDir = await findProjectRoot(resolveTargetDir(args));
  const baseUrl = resolveBaseUrl(config);

  const ref = String(options.slug || options.code || args[1] || args[0] || '').trim();
  const grantEmail = String(options.email || args[2] || '').trim();
  if (!ref) throw new Error(t('store.error_missing_code_or_slug'));

  const ws = await readWorkspace(projectDir);
  logger.log(t('store.install_squad_fetching', { ref }));

  const response = await storePost(`${baseUrl}/api/store/squads/install`, {
    ref,
    email: grantEmail || null,
    workspaceSlug: ws?.slug || null
  }, token);

  const slug = response.manifest?.slug || response.slug;
  if (!slug || !response.files) throw new Error(t('store.error_invalid_response'));
  const squadDir = path.join(projectDir, SQUADS_DIR, assertInstallSlug(slug, t));

  // Install-side preview and scan
  const publisher = response.publisher || 'unknown';
  const version = response.manifest?.version || response.version || '?';
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

  // Scan files received from server — squads are the highest-risk package type
  logger.log(t('store.install_scanning'));
  const stringFiles = Object.fromEntries(
    Object.entries(response.files).filter(([, v]) => typeof v === 'string')
  );
  // Destino de cada arquivo conferido antes de qualquer remoção, cópia ou
  // escrita (caminhos vêm do servidor): squad/ e agents/ na pasta do squad,
  // skills/<slug>/ na pasta da skill, genomes/ em .aioson/genomes.
  const plan = [];
  for (const [relPath, content] of Object.entries(stringFiles)) {
    if (relPath.startsWith('skills/')) {
      // skills/{skill-slug}/... → .aioson/installed-skills/{skill-slug}/...
      const [skillSlug, ...parts] = relPath.slice('skills/'.length).split('/');
      const skillDir = path.join(projectDir, INSTALLED_SKILLS_DIR, assertInstallSlug(skillSlug, t));
      plan.push({ destPath: installTarget(skillDir, parts.join('/'), t), content, dep: { type: 'skill', slug: skillSlug, path: skillDir } });
    } else if (relPath.startsWith('genomes/')) {
      const rest = relPath.slice('genomes/'.length);
      const destPath = installTarget(path.join(projectDir, GENOMES_DIR), rest, t);
      plan.push({ destPath, content, dep: { type: 'genome', slug: rest.replace(/\.(md|meta\.json)$/, ''), path: destPath } });
    } else if (relPath.startsWith('squad/') || relPath.startsWith('agents/')) {
      // squad/ or agents/ → .aioson/squads/{slug}/...
      const rest = relPath.startsWith('squad/') ? relPath.slice('squad/'.length) : relPath;
      plan.push({ destPath: installTarget(squadDir, rest, t), content, dep: null });
    }
  }
  const scan = scanPackage(stringFiles, 'squad');
  formatScanReport(scan, logger);
  if (!scan.ok) throw new Error(t('store.error_install_scan_failed', { slug }));

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

  // Handle existing squad
  if ((await exists(squadDir)) && !options.force) {
    const backupDir = path.join(projectDir, BACKUPS_DIR, `squads/${slug}`);
    logger.log(t('store.install_backing_up', { path: backupDir }));
    await fs.rm(backupDir, { recursive: true, force: true });
    await fs.cp(squadDir, backupDir, { recursive: true });
    await fs.rm(squadDir, { recursive: true, force: true });
  }

  // Write squad files
  logger.log(t('store.install_squad_writing'));
  // Skill/genome já instalados ficam como estão (sem --force), conferido uma vez
  // por dependência ANTES de gravar: conferido arquivo a arquivo, o 1º arquivo de
  // uma skill nova criava a pasta e os outros eram pulados.
  const installedDeps = new Set();
  if (!options.force) {
    const checked = new Set();
    for (const { dep } of plan) {
      if (!dep || checked.has(dep.path)) continue;
      checked.add(dep.path);
      if (await exists(dep.path)) {
        installedDeps.add(dep.path);
        logger.log(t('store.install_squad_dep_skip', { type: dep.type, slug: dep.slug }));
      }
    }
  }
  for (const { destPath, content, dep } of plan) {
    if (dep && installedDeps.has(dep.path)) continue;
    await ensureDir(path.dirname(destPath));
    await fs.writeFile(destPath, content, 'utf8');
  }

  logger.log(t('store.install_squad_done', { slug, path: squadDir }));
  return { ok: true, slug, path: squadDir, manifest: response.manifest };
}

// ── squad:grant ─────────────────────────────────────────────────────────────

async function runSquadGrant({ args, options, logger, t }) {
  const config = await readConfig();
  const token = requireToken(config, t);
  const baseUrl = resolveBaseUrl(config);

  const code = String(options.code || args[0] || '').trim();
  const email = String(options.email || args[1] || '').trim();

  if (!code) throw new Error(t('store.grant_error_missing_code'));
  if (!email) throw new Error(t('store.grant_error_missing_email'));

  logger.log(t('store.grant_sending', { email, code }));

  const response = await storePost(`${baseUrl}/api/store/grants`, {
    code,
    email
  }, token);

  logger.log(t('store.grant_ok', { email, code }));
  return { ok: true, code, email, response };
}

// ── squad:list ───────────────────────────────────────────────────────────────

async function runSquadList({ args, options, logger, t }) {
  // --remote: list squads published on aioson.com
  if (options.remote) {
    const config = await readConfig();
    const token = requireToken(config, t);
    const baseUrl = resolveBaseUrl(config);
    logger.log(t('store.list_remote_fetching', { type: 'squads' }));
    const response = await storeGet(`${baseUrl}/api/store/squads`, token);
    const squads = response.squads || [];
    if (squads.length === 0) {
      logger.log(t('store.list_remote_empty', { type: 'squads' }));
    } else {
      logger.log(t('store.list_remote_header', { count: squads.length, type: 'squads' }));
      for (const s of squads) {
        logger.log(t('store.list_remote_item', { slug: s.slug, name: s.name || s.slug, visibility: s.visibility || '?' }));
      }
    }
    return { ok: true, squads, remote: true };
  }

  // local: list squad dirs under .aioson/squads/
  const projectDir = await findProjectRoot(resolveTargetDir(args));
  const squadsDir = path.join(projectDir, SQUADS_DIR);

  if (!(await exists(squadsDir))) {
    logger.log(t('store.list_squad_empty'));
    return { ok: true, squads: [] };
  }

  const entries = await fs.readdir(squadsDir, { withFileTypes: true });
  const squads = entries
    .filter(e => e.isDirectory())
    .map(e => ({ slug: e.name }));

  if (squads.length === 0) {
    logger.log(t('store.list_squad_empty'));
  } else {
    logger.log(t('store.list_squad_header', { count: squads.length }));
    for (const s of squads) {
      logger.log(t('store.list_squad_item', { slug: s.slug, visibility: 'local' }));
    }
  }

  return { ok: true, squads };
}

module.exports = { runSquadPublish, runSquadInstall, runSquadGrant, runSquadList };
