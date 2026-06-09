'use strict';

/**
 * aioson feature:archive — move artefatos de uma feature done para .aioson/context/done/{slug}/
 *
 * Designed to be called by agents automatically (e.g. from feature:close --verdict=PASS)
 * so the end user never needs to type archive commands manually.
 *
 * Usage:
 *   aioson feature:archive . --feature=checkout
 *   aioson feature:archive . --feature=checkout --dry-run
 *   aioson feature:archive . --feature=checkout --restore
 *   aioson feature:archive . --feature=checkout --json
 *   aioson feature:archive . --feature=checkout --force          (skip features.md status guard)
 */

const fs = require('node:fs/promises');
const path = require('node:path');
const { contextDir, readFileSafe } = require('../preflight-engine');

const ARCHIVED_EXTENSIONS = ['md', 'yaml', 'yml', 'json'];

const GLOBAL_FILES = new Set([
  'project.context.md',
  'project-pulse.md',
  'project-map.md',
  'context-pack.md',
  'memory-index.md',
  'module-src.md',
  'features.md',
  'dev-state.md',
  'tasks.md',
  'discovery.md',
  'design-doc.md',
  'prd.md',
  'architecture.md',
  'spec.md',
  'spec.md.template',
  'test-plan.md',
  'test-inventory.md',
  'handoff-protocol.json',
  'last-handoff.json',
  'hardening-report.md',
  'qa-report-test-coverage.md',
  'sheldon-enrichment.md',
  'sheldon-validation.md'
]);

function escapeRegExp(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function buildSlugMatcher(slug) {
  const extsGroup = ARCHIVED_EXTENSIONS.join('|');
  // Accepts `<prefix>-<slug>.<ext>` and also `<prefix>-<slug>-<tail>.<ext>`
  // (e.g. qa-report-pentester-agent-hardening.md). Prefix collisions with other
  // slugs are filtered out via readOtherSlugs() before the matcher is applied.
  return new RegExp(`^[a-z][a-z0-9-]*-${escapeRegExp(slug)}(?:-[a-z0-9][a-z0-9-]*)?\\.(${extsGroup})$`, 'i');
}

async function readOtherSlugs(featuresPath, currentSlug) {
  const content = await readFileSafe(featuresPath);
  if (!content) return [];
  const slugs = new Set();
  const lines = content.split(/\r?\n/);
  for (const line of lines) {
    const m = line.match(/^\|\s*([a-z][a-z0-9-]*)\s*\|/i);
    if (!m) continue;
    const s = m[1].toLowerCase();
    if (s === 'slug' || s === currentSlug.toLowerCase()) continue;
    slugs.add(s);
  }
  return Array.from(slugs);
}

function belongsToOtherSlug(fileName, slug, otherSlugs) {
  // If another registered slug starts with `${slug}-` and the file suffix
  // matches that longer slug (possibly with an extra tail), the file belongs
  // to the longer-named feature, not to `slug`.
  const base = fileName.replace(/\.(md|yaml|yml|json)$/i, '');
  const slugLower = slug.toLowerCase();
  for (const other of otherSlugs) {
    if (!other.startsWith(`${slugLower}-`)) continue;
    const idx = base.toLowerCase().lastIndexOf(`-${other}`);
    if (idx === -1) continue;
    const afterMatch = base.slice(idx + 1 + other.length);
    if (afterMatch === '' || afterMatch.startsWith('-')) return true;
  }
  return false;
}

async function dirExists(dirPath) {
  try {
    const stat = await fs.stat(dirPath);
    return stat.isDirectory();
  } catch {
    return false;
  }
}

async function readDirSafe(dirPath) {
  try {
    return await fs.readdir(dirPath, { withFileTypes: true });
  } catch {
    return [];
  }
}

async function featureStatus(featuresPath, slug) {
  const content = await readFileSafe(featuresPath);
  if (!content) return { exists: false, status: null };
  const row = new RegExp(`\\|\\s*${escapeRegExp(slug)}\\s*\\|\\s*([a-z_]+)\\s*\\|`, 'i');
  const match = content.match(row);
  if (!match) return { exists: false, status: null };
  return { exists: true, status: match[1].toLowerCase() };
}

async function findSlugFiles(ctxDir, slug, otherSlugs = []) {
  const matcher = buildSlugMatcher(slug);
  const entries = await readDirSafe(ctxDir);
  return entries
    .filter((e) => e.isFile())
    .map((e) => e.name)
    .filter((name) => !GLOBAL_FILES.has(name))
    .filter((name) => matcher.test(name))
    .filter((name) => !belongsToOtherSlug(name, slug, otherSlugs));
}

async function findArchivedFiles(archiveDir) {
  const entries = await readDirSafe(archiveDir);
  return entries.filter((e) => e.isFile()).map((e) => e.name);
}

/**
 * Enumerate every artefact that belongs to a feature slug — the exact surface
 * `feature:archive` would move — but as a pure read-only discovery, for
 * non-destructive consumers (e.g. `feature:export`). Never mutates the tree.
 *
 * Reuses the slug-collision guard (readOtherSlugs/findSlugFiles) so a longer
 * sibling slug (`checkout-v2`) never leaks into `checkout`.
 *
 * @returns {{ rootFiles: string[], dirs: Array<{label:string, sourceDir:string}>, doneDir: string|null }}
 *   rootFiles are bare names under `.aioson/context/`; dirs/doneDir are absolute paths.
 */
async function collectFeatureArtifacts({ ctxDir, targetDir, slug, includeDone = true }) {
  const featuresPath = path.join(ctxDir, 'features.md');
  const otherSlugs = await readOtherSlugs(featuresPath, slug);
  const rootFiles = await findSlugFiles(ctxDir, slug, otherSlugs);

  const slugDirCandidates = [
    { label: 'dossier', sourceDir: path.join(ctxDir, 'features', slug) },
    { label: 'plans', sourceDir: path.join(targetDir, '.aioson', 'plans', slug) },
    { label: 'briefings', sourceDir: path.join(targetDir, '.aioson', 'briefings', slug) }
  ];
  const dirs = [];
  for (const d of slugDirCandidates) {
    // eslint-disable-next-line no-await-in-loop
    if (await dirExists(d.sourceDir)) dirs.push(d);
  }

  let doneDir = null;
  if (includeDone) {
    const candidate = path.join(ctxDir, 'done', slug);
    if (await dirExists(candidate)) doneDir = candidate;
  }

  return { rootFiles, dirs, doneDir };
}

async function extractSummary(prdPath) {
  const content = await readFileSafe(prdPath);
  if (!content) return null;
  const visionIdx = content.indexOf('## Vision');
  if (visionIdx === -1) return null;
  const after = content.slice(visionIdx + '## Vision'.length);
  const lines = after.split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (trimmed.startsWith('#')) break;
    if (trimmed.startsWith('[') && trimmed.endsWith(']')) continue;
    return trimmed.replace(/\s+/g, ' ').slice(0, 160);
  }
  return null;
}

async function readCompletedDate(featuresPath, slug) {
  const content = await readFileSafe(featuresPath);
  if (!content) return null;
  const re = new RegExp(`\\|\\s*${escapeRegExp(slug)}\\s*\\|[^|]*\\|[^|]*\\|\\s*([^|]+?)\\s*\\|`, 'i');
  const match = content.match(re);
  if (!match) return null;
  const raw = match[1].trim();
  if (!raw || raw === '—' || raw === '-' || raw.toLowerCase() === 'tbd') return null;
  const isoMatch = raw.match(/\d{4}-\d{2}-\d{2}/);
  return isoMatch ? isoMatch[0] : raw;
}

function manifestHeader() {
  return [
    '# Archived Features Manifest',
    '',
    '> Features whose artefacts were moved into `.aioson/context/done/{slug}/` after QA sign-off.',
    '> Agents that need historical awareness (@briefing, @neo, @discover, @sheldon) read this file instead of globbing archived PRDs.',
    '',
    '| slug | completed | files | summary |',
    '|------|-----------|-------|---------|',
    ''
  ].join('\n');
}

function parseManifest(content) {
  if (!content) return { header: manifestHeader(), rows: new Map() };
  const rows = new Map();
  const lines = content.split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('|')) continue;
    if (/^\|\s*-+\s*\|/.test(trimmed)) continue;
    if (/^\|\s*slug\s*\|/i.test(trimmed)) continue;
    const cols = trimmed.split('|').slice(1, -1).map((c) => c.trim());
    if (cols.length < 4) continue;
    const [slug, completed, files, summary] = cols;
    if (!slug) continue;
    rows.set(slug, { slug, completed, files, summary });
  }
  return { header: manifestHeader(), rows };
}

function renderManifest(rows) {
  const sorted = Array.from(rows.values()).sort((a, b) => {
    if (a.completed && b.completed) return b.completed.localeCompare(a.completed);
    if (a.completed) return -1;
    if (b.completed) return 1;
    return a.slug.localeCompare(b.slug);
  });
  const body = sorted
    .map((r) => `| ${r.slug} | ${r.completed || '—'} | ${r.files} | ${r.summary || '—'} |`)
    .join('\n');
  return manifestHeader() + body + (body ? '\n' : '');
}

async function updateManifest(manifestPath, entry, mode) {
  const existing = await readFileSafe(manifestPath);
  const { rows } = parseManifest(existing);
  if (mode === 'remove') {
    rows.delete(entry.slug);
  } else {
    rows.set(entry.slug, entry);
  }
  await fs.writeFile(manifestPath, renderManifest(rows), 'utf8');
}

async function runFeatureArchive({ args = [], options = {}, logger }) {
  const targetDir = path.resolve(process.cwd(), args[0] || '.');
  const slug = options.feature ? String(options.feature) : null;
  const dryRun = Boolean(options['dry-run'] || options.dryRun);
  const restore = Boolean(options.restore);
  const force = Boolean(options.force);
  const jsonOut = Boolean(options.json);

  const log = (msg) => { if (logger && !jsonOut) logger.log(msg); };

  if (!slug) {
    if (jsonOut) return { ok: false, reason: 'missing_feature' };
    log('--feature=<slug> is required.');
    return { ok: false };
  }

  if (!/^[a-z][a-z0-9-]*$/i.test(slug)) {
    if (jsonOut) return { ok: false, reason: 'invalid_slug' };
    log(`Invalid slug "${slug}" — use lowercase letters, digits and hyphens only.`);
    return { ok: false };
  }

  const ctxDir = contextDir(targetDir);
  const doneDir = path.join(ctxDir, 'done');
  const archiveDir = path.join(doneDir, slug);
  const manifestPath = path.join(doneDir, 'MANIFEST.md');
  const featuresPath = path.join(ctxDir, 'features.md');

  if (!(await dirExists(ctxDir))) {
    if (jsonOut) return { ok: false, reason: 'no_context_dir' };
    log(`.aioson/context/ not found at ${targetDir}. Run aioson setup first.`);
    return { ok: false };
  }

  if (restore) {
    return await runRestore({
      slug, ctxDir, archiveDir, manifestPath, dryRun, jsonOut, log
    });
  }

  const status = await featureStatus(featuresPath, slug);
  if (!status.exists && !force) {
    if (jsonOut) return { ok: false, reason: 'not_in_features', slug };
    log(`Feature "${slug}" is not registered in features.md. Use --force to archive anyway.`);
    return { ok: false };
  }
  if (status.exists && status.status !== 'done' && !force) {
    if (jsonOut) return { ok: false, reason: 'not_done', slug, status: status.status };
    log(`Feature "${slug}" has status "${status.status}" in features.md — only "done" features can be archived. Use --force to override.`);
    return { ok: false };
  }

  const otherSlugs = await readOtherSlugs(featuresPath, slug);
  const rootFiles = await findSlugFiles(ctxDir, slug, otherSlugs);
  const alreadyArchived = (await dirExists(archiveDir)) ? await findArchivedFiles(archiveDir) : [];

  const SLUG_DIRS = [
    { label: 'dossier', sourceBase: path.join(ctxDir, 'features'), archiveLabel: 'dossier' },
    { label: 'plans', sourceBase: path.join(targetDir, '.aioson', 'plans'), archiveLabel: 'plans' },
    { label: 'briefings', sourceBase: path.join(targetDir, '.aioson', 'briefings'), archiveLabel: 'briefings' }
  ];

  const dirPlans = [];
  for (const dir of SLUG_DIRS) {
    const sourceDir = path.join(dir.sourceBase, slug);
    const targetDirPath = path.join(archiveDir, dir.archiveLabel);
    const hasSource = await dirExists(sourceDir);
    const alreadyDone = await dirExists(targetDirPath);
    if (hasSource || alreadyDone) {
      dirPlans.push({
        label: dir.label,
        sourceDir,
        targetDir: targetDirPath,
        sourceBase: dir.sourceBase,
        action: hasSource
          ? (alreadyDone ? 'skip' : 'move')
          : (alreadyDone ? 'noop' : null),
        reason: alreadyDone ? 'already_archived' : null
      });
    }
  }

  const hasAnyDir = dirPlans.some((d) => d.action === 'move' || d.action === 'skip' || d.action === 'noop');

  if (
    rootFiles.length === 0 &&
    alreadyArchived.length === 0 &&
    !hasAnyDir
  ) {
    if (jsonOut) return { ok: true, slug, moved: [], skipped: [], alreadyArchived: [], noop: true };
    log(`No files matched "*-${slug}.{${ARCHIVED_EXTENSIONS.join(',')}}" in .aioson/context/ root and no slug directories found — nothing to archive.`);
    return { ok: true, noop: true };
  }

  const toMove = [];
  const toSkip = [];
  for (const name of rootFiles) {
    if (alreadyArchived.includes(name)) {
      toSkip.push({ name, reason: 'already_archived' });
    } else {
      toMove.push(name);
    }
  }

  const completed = await readCompletedDate(featuresPath, slug) || new Date().toISOString().slice(0, 10);
  const prdName = `prd-${slug}.md`;
  const prdPathInRoot = path.join(ctxDir, prdName);
  const prdPathInArchive = path.join(archiveDir, prdName);
  const summarySource = rootFiles.includes(prdName) ? prdPathInRoot
    : alreadyArchived.includes(prdName) ? prdPathInArchive
    : null;
  const summary = summarySource ? await extractSummary(summarySource) : null;

  if (dryRun) {
    const dirs = dirPlans
      .filter((d) => d.action)
      .map((d) => ({
        label: d.label,
        source: path.relative(targetDir, d.sourceDir),
        target: path.relative(targetDir, d.targetDir),
        action: d.action,
        reason: d.reason
      }));
    const result = {
      ok: true,
      dryRun: true,
      slug,
      targetDir: path.relative(targetDir, archiveDir),
      move: toMove,
      skip: toSkip,
      dirs,
      dossier: dirs.find((d) => d.label === 'dossier') || null,
      manifestEntry: {
        slug,
        completed,
        files: String(toMove.length + alreadyArchived.length),
        summary: summary || '—'
      }
    };
    if (jsonOut) return result;
    log(`[dry-run] feature:archive — ${slug}:`);
    log(`  target: ${path.relative(targetDir, archiveDir)}/`);
    log(`  would move: ${toMove.length} file(s)`);
    for (const f of toMove) log(`    • ${f}`);
    if (toSkip.length) {
      log(`  would skip: ${toSkip.length} file(s)`);
      for (const s of toSkip) log(`    • ${s.name} (${s.reason})`);
    }
    for (const d of dirPlans) {
      if (d.action === 'move') {
        log(`  would move ${d.label} dir: ${path.relative(targetDir, d.sourceDir)}/ → ${path.relative(targetDir, d.targetDir)}/`);
      } else if (d.action === 'skip') {
        log(`  would skip ${d.label} dir: already archived at ${path.relative(targetDir, d.targetDir)}/`);
      }
    }
    log(`  manifest entry: | ${slug} | ${completed} | ${toMove.length + alreadyArchived.length} | ${summary || '—'} |`);
    return result;
  }

  await fs.mkdir(archiveDir, { recursive: true });

  const moved = [];
  for (const name of toMove) {
    const from = path.join(ctxDir, name);
    const to = path.join(archiveDir, name);
    await fs.rename(from, to);
    moved.push(name);
  }

  const dirResults = [];
  for (const d of dirPlans) {
    if (d.action === 'move') {
      await fs.mkdir(path.dirname(d.targetDir), { recursive: true });
      await fs.rename(d.sourceDir, d.targetDir);
      dirResults.push({
        label: d.label,
        action: 'moved',
        source: path.relative(targetDir, d.sourceDir),
        target: path.relative(targetDir, d.targetDir)
      });
      try {
        const remaining = await fs.readdir(d.sourceBase);
        if (remaining.length === 0) await fs.rmdir(d.sourceBase);
      } catch { /* parent missing or non-empty */ }
    } else if (d.action === 'skip') {
      dirResults.push({
        label: d.label,
        action: 'skipped',
        reason: d.reason,
        target: path.relative(targetDir, d.targetDir)
      });
    }
  }

  const totalArchived = (await findArchivedFiles(archiveDir)).length;
  const entry = {
    slug,
    completed,
    files: String(totalArchived),
    summary: summary || '—'
  };
  await updateManifest(manifestPath, entry, 'upsert');

  const result = {
    ok: true,
    slug,
    completed,
    archiveDir: path.relative(targetDir, archiveDir),
    moved,
    skipped: toSkip,
    totalArchived,
    dirs: dirResults.length > 0 ? dirResults : undefined,
    dossier: dirResults.find((d) => d.label === 'dossier') || null,
    manifestEntry: entry
  };

  if (jsonOut) return result;
  log(`feature:archive — ${slug}:`);
  log(`  archive dir: ${path.relative(targetDir, archiveDir)}/`);
  log(`  moved: ${moved.length} file(s)`);
  for (const f of moved) log(`    • ${f}`);
  if (toSkip.length) {
    log(`  skipped: ${toSkip.length} file(s) already in archive`);
    for (const s of toSkip) log(`    • ${s.name}`);
  }
  for (const d of dirResults) {
    if (d.action === 'moved') {
      log(`  moved ${d.label} dir: ${d.source}/ → ${d.target}/`);
    } else if (d.action === 'skipped') {
      log(`  skipped ${d.label} dir: already archived at ${d.target}/`);
    }
  }
  log(`  manifest updated: .aioson/context/done/MANIFEST.md`);
  return result;
}

async function runRestore({ slug, ctxDir, archiveDir, manifestPath, dryRun, jsonOut, log }) {
  if (!(await dirExists(archiveDir))) {
    if (jsonOut) return { ok: false, reason: 'nothing_to_restore', slug };
    log(`No archive found at .aioson/context/done/${slug}/ — nothing to restore.`);
    return { ok: false };
  }

  const dossierTargetDir = path.join(archiveDir, 'dossier');
  const dossierSourceDir = path.join(ctxDir, 'features', slug);
  const hasDossierToRestore = await dirExists(dossierTargetDir);
  const dossierConflict = hasDossierToRestore && (await dirExists(dossierSourceDir));

  const archived = await findArchivedFiles(archiveDir);
  const conflicts = [];
  const toRestore = [];
  for (const name of archived) {
    const rootPath = path.join(ctxDir, name);
    try {
      await fs.access(rootPath);
      conflicts.push(name);
    } catch {
      toRestore.push(name);
    }
  }
  if (dossierConflict) conflicts.push(`features/${slug}/`);

  if (conflicts.length > 0) {
    if (jsonOut) return { ok: false, reason: 'restore_conflict', slug, conflicts };
    log(`Cannot restore "${slug}" — files already exist in .aioson/context/ root:`);
    for (const c of conflicts) log(`  • ${c}`);
    log(`Resolve manually before retrying --restore.`);
    return { ok: false };
  }

  if (dryRun) {
    const result = {
      ok: true,
      dryRun: true,
      slug,
      restore: toRestore,
      dossier: hasDossierToRestore ? { action: 'restore', target: path.relative(ctxDir, dossierSourceDir) } : null
    };
    if (jsonOut) return result;
    log(`[dry-run] feature:archive --restore — ${slug}:`);
    log(`  would restore: ${toRestore.length} file(s)`);
    for (const f of toRestore) log(`    • ${f}`);
    if (hasDossierToRestore) log(`  would restore dossier dir: ${path.relative(ctxDir, dossierTargetDir)}/ → features/${slug}/`);
    return result;
  }

  const restored = [];
  for (const name of toRestore) {
    const from = path.join(archiveDir, name);
    const to = path.join(ctxDir, name);
    await fs.rename(from, to);
    restored.push(name);
  }

  let dossierRestored = null;
  if (hasDossierToRestore) {
    await fs.mkdir(path.dirname(dossierSourceDir), { recursive: true });
    await fs.rename(dossierTargetDir, dossierSourceDir);
    dossierRestored = path.relative(ctxDir, dossierSourceDir);
  }

  try {
    await fs.rmdir(archiveDir);
  } catch {
    // Directory not empty (manual files) — leave it alone.
  }

  await updateManifest(manifestPath, { slug }, 'remove');

  const result = {
    ok: true,
    slug,
    restored,
    dossierRestored,
    archiveDir: path.relative(ctxDir, archiveDir)
  };
  if (jsonOut) return result;
  log(`feature:archive --restore — ${slug}:`);
  log(`  restored: ${restored.length} file(s)`);
  for (const f of restored) log(`    • ${f}`);
  if (dossierRestored) log(`  restored dossier dir: ${dossierRestored}/`);
  log(`  manifest updated: .aioson/context/done/MANIFEST.md`);
  return result;
}

async function listDoneFeatures(featuresPath) {
  const content = await readFileSafe(featuresPath);
  if (!content) return [];
  const results = [];
  const lines = content.split(/\r?\n/);
  for (const line of lines) {
    const m = line.match(/^\|\s*([a-z][a-z0-9-]*)\s*\|\s*done\s*\|/i);
    if (m) results.push(m[1].toLowerCase());
  }
  return results;
}

async function listArchivedSlugs(manifestPath) {
  const content = await readFileSafe(manifestPath);
  if (!content) return new Set();
  const slugs = new Set();
  const lines = content.split(/\r?\n/);
  for (const line of lines) {
    const m = line.match(/^\|\s*([a-z][a-z0-9-]+)\s*\|/i);
    if (m && m[1] !== 'slug') slugs.add(m[1].toLowerCase());
  }
  return slugs;
}

async function runFeatureSweep({ args = [], options = {}, logger }) {
  const targetDir = path.resolve(process.cwd(), args[0] || '.');
  const dryRun = Boolean(options['dry-run'] || options.dryRun);
  const jsonOut = Boolean(options.json);
  const log = (msg) => { if (logger && !jsonOut) logger.log(msg); };

  const ctxDir = contextDir(targetDir);
  if (!(await dirExists(ctxDir))) {
    if (jsonOut) return { ok: false, reason: 'no_context_dir' };
    log('.aioson/context/ not found. Run aioson setup first.');
    return { ok: false };
  }

  const featuresPath = path.join(ctxDir, 'features.md');
  const manifestPath = path.join(ctxDir, 'done', 'MANIFEST.md');

  const doneSlugs = await listDoneFeatures(featuresPath);
  const archivedSlugs = await listArchivedSlugs(manifestPath);
  const pending = doneSlugs.filter((s) => !archivedSlugs.has(s));

  if (pending.length === 0) {
    const result = { ok: true, pending: [], archived: [] };
    if (jsonOut) return result;
    log('All done features are already archived.');
    return result;
  }

  if (dryRun) {
    const result = { ok: true, dryRun: true, pending, archived: [] };
    if (jsonOut) return result;
    log(`[dry-run] ${pending.length} done feature(s) not yet archived:`);
    for (const s of pending) log(`  • ${s}`);
    return result;
  }

  const archived = [];
  const failed = [];
  for (const slug of pending) {
    try {
      const archiveResult = await runFeatureArchive({
        args: [targetDir],
        options: { feature: slug, json: true },
        logger: null
      });
      if (archiveResult && archiveResult.ok) {
        const movedCount = archiveResult.moved ? archiveResult.moved.length : 0;
        archived.push({ slug, moved: movedCount });
        log(`  ✓ ${slug} — ${movedCount} file(s) archived`);
      } else {
        failed.push({ slug, reason: archiveResult.reason || 'unknown' });
        log(`  ✗ ${slug} — ${archiveResult.reason || 'unknown'}`);
      }
    } catch (err) {
      failed.push({ slug, reason: err.message || String(err) });
      log(`  ✗ ${slug} — ${err.message || err}`);
    }
  }

  const result = { ok: true, pending, archived, failed: failed.length > 0 ? failed : undefined };
  if (jsonOut) return result;
  log(`\nSweep complete: ${archived.length} archived, ${failed.length} failed.`);
  return result;
}

module.exports = { runFeatureArchive, runFeatureSweep, collectFeatureArtifacts };
