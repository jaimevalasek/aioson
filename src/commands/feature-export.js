'use strict';

/**
 * aioson feature:export — copy every artefact of a feature into a clean output
 * directory, leaving the source tree untouched.
 *
 * Sibling of feature:archive, but COPY (not move) to an arbitrary --out. Turns
 * AIOSON's markdown output into a portable deliverable: read/analyse the specs
 * outside the project, hand them to a client, or use AIOSON purely as a spec
 * generator. Works for both active features (artefacts in context/ root + slug
 * dirs) and already-archived ones (context/done/{slug}).
 *
 * Usage:
 *   aioson feature:export . --feature=checkout
 *   aioson feature:export . --feature=checkout --out=../checkout-specs
 *   aioson feature:export . --feature=checkout --flatten
 *   aioson feature:export . --feature=checkout --no-index
 *   aioson feature:export . --feature=checkout --dry-run --json
 */

const fs = require('node:fs/promises');
const path = require('node:path');
const { contextDir } = require('../preflight-engine');
const { collectFeatureArtifacts } = require('./feature-archive');

async function dirExists(dirPath) {
  try {
    return (await fs.stat(dirPath)).isDirectory();
  } catch {
    return false;
  }
}

/**
 * Recursively list every file under `dir`, returning paths relative to `base`.
 */
async function walkFiles(dir, base = dir) {
  const out = [];
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      // eslint-disable-next-line no-await-in-loop
      out.push(...await walkFiles(abs, base));
    } else if (entry.isFile()) {
      out.push(path.relative(base, abs));
    }
  }
  return out;
}

function toPosix(p) {
  return p.split(path.sep).join('/');
}

/**
 * Build the flat list of {srcAbs, relDest, group} to copy. relDest is the path
 * relative to the output dir (mirrored structure). Caller may flatten later.
 */
async function buildEntries({ ctxDir, rootFiles, dirs, doneDir }) {
  const entries = [];

  for (const name of rootFiles) {
    entries.push({ srcAbs: path.join(ctxDir, name), relDest: name, group: 'context' });
  }

  for (const d of dirs) {
    // eslint-disable-next-line no-await-in-loop
    const files = await walkFiles(d.sourceDir);
    for (const rel of files) {
      entries.push({
        srcAbs: path.join(d.sourceDir, rel),
        relDest: path.join(d.label, rel),
        group: d.label
      });
    }
  }

  if (doneDir) {
    const files = await walkFiles(doneDir);
    for (const rel of files) {
      entries.push({
        srcAbs: path.join(doneDir, rel),
        relDest: path.join('done', rel),
        group: 'done'
      });
    }
  }

  return entries;
}

function applyFlatten(entries) {
  // Collapse subdir structure into a single level. Root files (no separator)
  // keep their name; nested files become `label-...-file.ext`, which is
  // collision-free by construction since it encodes the full source path.
  for (const e of entries) {
    e.relDest = e.relDest.split(/[/\\]/).join('-');
  }
  return entries;
}

function renderIndex({ slug, entries, targetDir, exportedAt }) {
  const lines = [
    `# Feature Export — ${slug}`,
    '',
    `> ${entries.length} file(s) copied from AIOSON on ${exportedAt}.`,
    '> Non-destructive snapshot — the original artefacts were left untouched.',
    '',
    '| group | file | source |',
    '|-------|------|--------|'
  ];
  const sorted = [...entries].sort((a, b) => {
    if (a.group !== b.group) return a.group.localeCompare(b.group);
    return a.relDest.localeCompare(b.relDest);
  });
  for (const e of sorted) {
    const source = toPosix(path.relative(targetDir, e.srcAbs));
    lines.push(`| ${e.group} | ${toPosix(e.relDest)} | ${source} |`);
  }
  lines.push('');
  return lines.join('\n');
}

async function runFeatureExport({ args = [], options = {}, logger }) {
  const targetDir = path.resolve(process.cwd(), args[0] || '.');
  const slug = options.feature ? String(options.feature) : null;
  const flatten = Boolean(options.flatten);
  const noIndex = Boolean(options['no-index'] || options.noIndex);
  const dryRun = Boolean(options['dry-run'] || options.dryRun);
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
  if (!(await dirExists(ctxDir))) {
    if (jsonOut) return { ok: false, reason: 'no_context_dir' };
    log(`.aioson/context/ not found at ${targetDir}. Run aioson setup first.`);
    return { ok: false };
  }

  const outDir = options.out
    ? path.resolve(process.cwd(), String(options.out))
    : path.join(targetDir, `${slug}-export`);

  const { rootFiles, dirs, doneDir } = await collectFeatureArtifacts({
    ctxDir, targetDir, slug, includeDone: true
  });

  let entries = await buildEntries({ ctxDir, rootFiles, dirs, doneDir });
  if (flatten) entries = applyFlatten(entries);

  if (entries.length === 0) {
    if (jsonOut) return { ok: true, slug, exported: [], noop: true };
    log(`No artefacts matched "*-${slug}.{md,yaml,yml,json}" in .aioson/context/, no slug directories (features/plans/briefings), and nothing under context/done/${slug}/ — nothing to export.`);
    return { ok: true, slug, noop: true };
  }

  const relOut = toPosix(path.relative(targetDir, outDir)) || outDir;

  if (dryRun) {
    const result = {
      ok: true,
      dryRun: true,
      slug,
      outDir: relOut,
      flatten,
      index: !noIndex,
      count: entries.length,
      files: entries.map((e) => toPosix(e.relDest))
    };
    if (jsonOut) return result;
    log(`[dry-run] feature:export — ${slug}:`);
    log(`  out: ${relOut}/  (${flatten ? 'flattened' : 'mirrored'})`);
    log(`  would copy: ${entries.length} file(s)`);
    for (const e of [...entries].sort((a, b) => a.relDest.localeCompare(b.relDest))) {
      log(`    • ${toPosix(e.relDest)}`);
    }
    if (!noIndex) log('  would write: INDEX.md');
    return result;
  }

  await fs.mkdir(outDir, { recursive: true });
  const copied = [];
  for (const e of entries) {
    const dest = path.join(outDir, e.relDest);
    // eslint-disable-next-line no-await-in-loop
    await fs.mkdir(path.dirname(dest), { recursive: true });
    // eslint-disable-next-line no-await-in-loop
    await fs.copyFile(e.srcAbs, dest);
    copied.push(toPosix(e.relDest));
  }

  let indexWritten = false;
  if (!noIndex) {
    const exportedAt = new Date().toISOString().slice(0, 10);
    await fs.writeFile(
      path.join(outDir, 'INDEX.md'),
      renderIndex({ slug, entries, targetDir, exportedAt }),
      'utf8'
    );
    indexWritten = true;
  }

  const result = {
    ok: true,
    slug,
    outDir: relOut,
    flatten,
    count: copied.length,
    copied,
    index: indexWritten
  };

  if (jsonOut) return result;
  log(`feature:export — ${slug}:`);
  log(`  out: ${relOut}/  (${flatten ? 'flattened' : 'mirrored'})`);
  log(`  copied: ${copied.length} file(s)`);
  for (const f of [...copied].sort()) log(`    • ${f}`);
  if (indexWritten) log(`  index: ${relOut}/INDEX.md`);
  log('  source tree untouched (non-destructive copy).');
  return result;
}

module.exports = { runFeatureExport };
