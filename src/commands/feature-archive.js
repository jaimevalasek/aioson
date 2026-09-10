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
const { moveFileResilient, moveDirResilient } = require('../lib/fs-move');
const { resolveTargetDir } = require('../lib/project-root');
const { listDiagnosticDirs, dirStats, clearDir, formatBytes } = require('../lib/evidence-artifacts');

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

// Metadados do próprio archive (registro de force-bypass do feature:close) não
// contam como artefato da feature: ficam fora do manifest count e do --restore.
const ARCHIVE_METADATA_FILES = new Set(['force-bypass-findings.json']);

async function findArchivedFiles(archiveDir) {
  const entries = await readDirSafe(archiveDir);
  return entries
    .filter((e) => e.isFile())
    .map((e) => e.name)
    .filter((name) => !ARCHIVE_METADATA_FILES.has(name));
}

async function removeEmptyDirBestEffort(dir) {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      await fs.rmdir(dir);
      return;
    } catch (err) {
      if (!err || err.code === 'ENOENT' || err.code === 'ENOTEMPTY') return;
      if (attempt === 3) return;
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
  }
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
    { label: 'briefings', sourceDir: path.join(targetDir, '.aioson', 'briefings', slug) },
    { label: 'mappings', sourceDir: path.join(targetDir, '.aioson', 'mappings', slug) }
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

/**
 * O antigo `skip` congelava a sobra viva para sempre: um close interrompido
 * deixa `briefings/{slug}/` vazio, ou um dossiê recém-sintetizado, ao lado de
 * um arquivo morto já populado — e cada re-close pulava o diretório de novo.
 * Reconcilia sem nunca perder conteúdo: arquivo ausente no destino é movido;
 * cópia viva idêntica é removida (dedup); conteúdo divergente fica no lugar e
 * vira erro acionável — jamais sobrescrito em silêncio. Diretórios esvaziados
 * (inclusive a própria origem) são podados.
 */
async function mergeSkippedDir(sourceDir, archiveTargetDir) {
  const merged = [];
  const conflicts = [];
  const residues = [];

  async function walk(relBase) {
    const abs = relBase ? path.join(sourceDir, relBase) : sourceDir;
    let entries;
    try { entries = await fs.readdir(abs, { withFileTypes: true }); } catch { return; }
    for (const entry of entries) {
      const rel = relBase ? path.join(relBase, entry.name) : entry.name;
      if (entry.isDirectory()) { await walk(rel); continue; }
      if (!entry.isFile()) continue;
      const from = path.join(sourceDir, rel);
      const to = path.join(archiveTargetDir, rel);
      let existing = null;
      try { existing = await fs.readFile(to); } catch { /* absent in archive */ }
      if (existing === null) {
        await fs.mkdir(path.dirname(to), { recursive: true });
        const mv = await moveFileResilient(from, to);
        merged.push(rel);
        if (mv.sourceResidue) residues.push({ rel, detail: mv.residueError });
      } else {
        const live = await fs.readFile(from);
        if (existing.equals(live)) {
          try { await fs.rm(from, { force: true }); merged.push(rel); } catch (err) {
            residues.push({ rel, detail: (err && err.message) || String(err) });
          }
        } else {
          conflicts.push(rel);
        }
      }
    }
  }
  await walk('');

  async function prune(dirAbs) {
    let entries;
    try { entries = await fs.readdir(dirAbs, { withFileTypes: true }); } catch { return false; }
    for (const entry of entries) {
      if (entry.isDirectory()) await prune(path.join(dirAbs, entry.name));
    }
    try { entries = await fs.readdir(dirAbs); } catch { return false; }
    if (entries.length > 0) return false;
    try { await fs.rmdir(dirAbs); return true; } catch { return false; }
  }
  const sourceRemoved = await prune(sourceDir);

  return { merged, conflicts, residues, sourceRemoved };
}

async function runFeatureArchive({ args = [], options = {}, logger }) {
  const targetDir = resolveTargetDir(args);
  const slug = options.feature ? String(options.feature) : (options.slug ? String(options.slug) : null);
  const dryRun = Boolean(options['dry-run'] || options.dryRun);
  const restore = Boolean(options.restore);
  const force = Boolean(options.force);
  // Regenerable browser evidence (runtime captures, walkthrough snapshots) is
  // dropped instead of archived: the reports beside it travel, the binaries
  // that no report reads back do not. `--keep-diagnostics` carries them along.
  const keepDiagnostics = Boolean(options['keep-diagnostics'] || options.keepDiagnostics);
  const jsonOut = Boolean(options.json);

  const log = (msg) => { if (logger && !jsonOut) logger.log(msg); };

  if (!slug) {
    if (jsonOut) return { ok: false, reason: 'missing_feature' };
    log('--feature=<slug> is required (--slug is accepted as an alias).');
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
    { label: 'briefings', sourceBase: path.join(targetDir, '.aioson', 'briefings'), archiveLabel: 'briefings' },
    // continuity.md e afins: contexto temporário de sessão que vira peso morto
    // vivo depois do fechamento — arquiva junto para o tree ficar limpo.
    { label: 'mappings', sourceBase: path.join(targetDir, '.aioson', 'mappings'), archiveLabel: 'mappings' }
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

  // Both paths into done/ drop them: a folder moved whole, and a folder
  // reconciled with an archive that already exists (`skip`), whose merge
  // walked file by file and carried the captures and snapshots along.
  const diagnosticPlans = keepDiagnostics
    ? []
    : dirPlans
      .filter((d) => (d.action === 'move' || d.action === 'skip') && (d.label === 'dossier' || d.label === 'briefings'))
      .flatMap((d) => listDiagnosticDirs(d.sourceDir, { root: path.join(targetDir, '.aioson') }).map((entry) => ({
        owner: d.label,
        dir: entry.dir,
        kind: entry.kind,
        path: path.relative(targetDir, entry.dir).split(path.sep).join('/'),
        ...dirStats(entry.dir)
      })))
      .filter((entry) => entry.files > 0);
  const diagnosticBytes = diagnosticPlans.reduce((sum, entry) => sum + entry.bytes, 0);
  const diagnosticFiles = diagnosticPlans.reduce((sum, entry) => sum + entry.files, 0);

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
      diagnostics: diagnosticPlans.map(({ dir, ...rest }) => rest),
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
    if (diagnosticPlans.length > 0) {
      log(`  would drop ${diagnosticFiles} regenerable diagnostic file(s), ${formatBytes(diagnosticBytes)} (pass --keep-diagnostics to archive them):`);
      for (const entry of diagnosticPlans) log(`    • ${entry.path}/ (${entry.files} file(s), ${formatBytes(entry.bytes)})`);
    }
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
        log(`  would reconcile ${d.label} dir with the archive at ${path.relative(targetDir, d.targetDir)}/ (merge missing, dedup identical, flag divergent)`);
      }
    }
    log(`  manifest entry: | ${slug} | ${completed} | ${toMove.length + alreadyArchived.length} | ${summary || '—'} |`);
    return result;
  }

  await fs.mkdir(archiveDir, { recursive: true });

  // Cada unidade (arquivo ou diretório) move de forma resiliente — rename com
  // fallback copy+remove para EPERM/EXDEV (Windows com handle aberto). Uma
  // falha não aborta as demais: coleta em errors[] e o resultado sai ok:false,
  // nunca meio-movido silenciosamente reportado como sucesso (A2/A3).
  const moved = [];
  const errors = [];
  const residue = [];
  for (const name of toMove) {
    const from = path.join(ctxDir, name);
    const to = path.join(archiveDir, name);
    try {
      const mv = await moveFileResilient(from, to);
      moved.push(name);
      if (mv.sourceResidue) {
        residue.push({ item: path.relative(targetDir, from), kind: 'file', detail: mv.residueError });
      }
    } catch (err) {
      errors.push({
        item: path.relative(targetDir, from),
        kind: 'file',
        code: (err && err.code) || null,
        message: (err && err.message) || String(err)
      });
    }
  }

  // Diagnostics go before the directory moves: what is dropped never
  // travels, and a folder the OS refuses to delete is reported, not hidden.
  const diagnosticsDropped = [];
  for (const entry of diagnosticPlans) {
    const removed = clearDir(entry.dir);
    if (removed.error) {
      errors.push({ item: entry.path, kind: 'dir', code: removed.code || null, message: `could not drop regenerable diagnostics: ${removed.error}` });
    } else {
      diagnosticsDropped.push({ owner: entry.owner, kind: entry.kind, path: entry.path, files: removed.files, bytes: removed.bytes });
    }
  }

  const dirResults = [];
  for (const d of dirPlans) {
    if (d.action === 'move') {
      await fs.mkdir(path.dirname(d.targetDir), { recursive: true });
      try {
        const mv = await moveDirResilient(d.sourceDir, d.targetDir);
        dirResults.push({
          label: d.label,
          action: 'moved',
          method: mv.method,
          source: path.relative(targetDir, d.sourceDir),
          target: path.relative(targetDir, d.targetDir)
        });
        if (mv.sourceResidue) {
          residue.push({ item: path.relative(targetDir, d.sourceDir), kind: 'dir', detail: mv.residueError });
        }
        try {
          const remaining = await fs.readdir(d.sourceBase);
          if (remaining.length === 0) await fs.rmdir(d.sourceBase);
        } catch { /* parent missing or non-empty */ }
      } catch (err) {
        errors.push({
          item: path.relative(targetDir, d.sourceDir),
          kind: 'dir',
          label: d.label,
          code: (err && err.code) || null,
          message: (err && err.message) || String(err)
        });
        dirResults.push({
          label: d.label,
          action: 'failed',
          source: path.relative(targetDir, d.sourceDir),
          target: path.relative(targetDir, d.targetDir)
        });
      }
    } else if (d.action === 'skip') {
      const merge = await mergeSkippedDir(d.sourceDir, d.targetDir);
      for (const c of merge.conflicts) {
        errors.push({
          item: path.relative(targetDir, path.join(d.sourceDir, c)),
          kind: 'file',
          label: d.label,
          code: 'archive_merge_conflict',
          message: `live copy differs from archived ${path.relative(targetDir, path.join(d.targetDir, c))} — reconcile manually (never overwritten silently)`
        });
      }
      for (const r of merge.residues) {
        residue.push({
          item: path.relative(targetDir, path.join(d.sourceDir, r.rel)),
          kind: 'file',
          detail: r.detail
        });
      }
      dirResults.push({
        label: d.label,
        action: merge.conflicts.length > 0 ? 'merge_conflict'
          : merge.merged.length > 0 ? 'merged'
            : merge.sourceRemoved ? 'cleaned'
              : 'skipped',
        reason: d.reason,
        merged: merge.merged.length,
        conflicts: merge.conflicts.length,
        source_removed: merge.sourceRemoved,
        source: path.relative(targetDir, d.sourceDir),
        target: path.relative(targetDir, d.targetDir)
      });
    }
  }

  // Sobra de origem após cópia completa: o archive está íntegro, mas a cópia
  // antiga continua no lugar de origem e voltaria a divergir se editada.
  // Tratada como erro acionável (remoção manual), não como sucesso silencioso.
  for (const r of residue) {
    errors.push({
      item: r.item,
      kind: r.kind,
      code: 'source_residue',
      message: `archived copy is complete but the stale source could not be removed (${r.detail}) — delete ${r.item} manually`
    });
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
    ok: errors.length === 0,
    ...(errors.length > 0 ? { reason: 'archive_incomplete' } : {}),
    slug,
    completed,
    archiveDir: path.relative(targetDir, archiveDir),
    moved,
    skipped: toSkip,
    totalArchived,
    errors: errors.length > 0 ? errors : undefined,
    dirs: dirResults.length > 0 ? dirResults : undefined,
    dossier: dirResults.find((d) => d.label === 'dossier') || null,
    diagnostics_dropped: diagnosticsDropped.length > 0 ? diagnosticsDropped : undefined,
    manifestEntry: entry
  };

  if (jsonOut) return result;
  log(`feature:archive — ${slug}:`);
  log(`  archive dir: ${path.relative(targetDir, archiveDir)}/`);
  if (diagnosticsDropped.length > 0) {
    const droppedFiles = diagnosticsDropped.reduce((sum, d) => sum + d.files, 0);
    const droppedBytes = diagnosticsDropped.reduce((sum, d) => sum + d.bytes, 0);
    log(`  dropped ${droppedFiles} regenerable diagnostic file(s), ${formatBytes(droppedBytes)} (captures and walkthrough snapshots; the reports were archived)`);
    for (const d of diagnosticsDropped) log(`    • ${d.path}/`);
  }
  log(`  moved: ${moved.length} file(s)`);
  for (const f of moved) log(`    • ${f}`);
  if (toSkip.length) {
    log(`  skipped: ${toSkip.length} file(s) already in archive`);
    for (const s of toSkip) log(`    • ${s.name}`);
  }
  for (const d of dirResults) {
    if (d.action === 'moved') {
      log(`  moved ${d.label} dir: ${d.source}/ → ${d.target}/`);
    } else if (d.action === 'merged') {
      log(`  merged ${d.label} dir into ${d.target}/ (${d.merged} file(s)${d.source_removed ? ', empty source removed' : ''})`);
    } else if (d.action === 'cleaned') {
      log(`  cleaned ${d.label} dir: empty leftover removed (archive already at ${d.target}/)`);
    } else if (d.action === 'merge_conflict') {
      log(`  ✗ ${d.label} dir: ${d.conflicts} file(s) differ from the archive at ${d.target}/ — reconcile manually`);
    } else if (d.action === 'skipped') {
      log(`  skipped ${d.label} dir: already archived at ${d.target}/`);
    } else if (d.action === 'failed') {
      log(`  ✗ failed to move ${d.label} dir: ${d.source}/ → ${d.target}/`);
    }
  }
  if (errors.length > 0) {
    log(`  ✗ archive incomplete — ${errors.length} error(s):`);
    for (const e of errors) log(`    ✗ ${e.item}${e.code ? ` [${e.code}]` : ''}: ${e.message}`);
    log(`  Fix the cause (close editors/watchers holding the folder) and re-run: aioson feature:archive . --feature=${slug}`);
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
    await moveFileResilient(from, to);
    restored.push(name);
  }

  let dossierRestored = null;
  if (hasDossierToRestore) {
    await fs.mkdir(path.dirname(dossierSourceDir), { recursive: true });
    await moveDirResilient(dossierTargetDir, dossierSourceDir);
    dossierRestored = path.relative(ctxDir, dossierSourceDir);
  }

  await removeEmptyDirBestEffort(archiveDir);

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
  const targetDir = resolveTargetDir(args);
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
