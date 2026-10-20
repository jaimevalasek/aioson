'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { withIndex } = require('../context-search');
const { resolveTargetDir } = require('../lib/project-root');

async function runContextSearch({ args, options, logger }) {
  const { query, cwd } = resolveSearchTarget(args, options);
  const limit = Number(options.limit) || 10;

  if (!query) {
    logger.log('Usage: aioson context:search [path] --query="<text>" [--agent=dev] [--mode=executing] [--task="<text>"] [--paths=src/**] [--intent=memory|feature|rules] [--limit=10]');
    return { ok: false, error: 'missing_query' };
  }

  const result = await withIndex(async (idx) => {
    let index = null;
    if (!options['no-index']) {
      index = await idx.indexDirectory(cwd, {
        force: Boolean(options.force || options.refresh)
      });
    }
    const search = idx.searchPackage(query, {
      limit,
      projectDir: cwd,
      agent: options.agent,
      mode: options.mode,
      task: options.task || options.goal,
      paths: options.paths || options.path,
      intent: options.intent || options.intents,
      source: options.source || options.sourceType || options['source-type']
    });
    return { ...search, index };
  }, { projectDir: cwd });

  if (options.json) {
    return { ok: true, ...compactSearchJson(result) };
  }

  const results = result.results || [];
  if (results.length === 0) {
    logger.log(`No results for: ${query}`);
    return { ok: true, ...result };
  }

  logger.log(`\n  Context search for: "${query}"\n`);
  printBucket(logger, 'Must read', result.package.must_read);
  printBucket(logger, 'Should read', result.package.should_read);
  printBucket(logger, 'Maybe', result.package.maybe);

  return { ok: true, ...result };
}

async function runContextSearchIndex({ args, options, logger }) {
  const cwd = resolveTargetDir(args[0] || options.cwd);
  const force = Boolean(options.force);

  logger.log(`Indexing: ${cwd} ...`);

  const result = await withIndex(async (idx) => {
    const r = await idx.indexDirectory(cwd, { force });
    const stats = idx.stats();
    return { ...r, stats };
  }, { projectDir: cwd });

  if (options.json) {
    return { ok: true, ...result };
  }

  logger.log(`  Indexed: ${result.indexed} files`);
  logger.log(`  Skipped: ${result.skipped} files (already indexed)`);
  logger.log(`  Total in index: ${result.stats.totalDocs} docs`);

  return { ok: true, ...result };
}

function resolveSearchTarget(args, options = {}) {
  let cwd = resolveTargetDir(options.cwd);
  let query = String(options.query || options.q || '').trim();

  if (args.length > 0 && query) {
    cwd = path.resolve(process.cwd(), args[0]);
  } else if (args.length > 1 && pathExists(path.resolve(process.cwd(), args[0]))) {
    cwd = path.resolve(process.cwd(), args[0]);
    query = args.slice(1).join(' ').trim();
  } else if (!query) {
    query = args.join(' ').trim();
  }

  return { cwd, query };
}

function pathExists(targetPath) {
  try {
    fs.accessSync(targetPath);
    return true;
  } catch {
    return false;
  }
}

// An agent reads this JSON (@briefing and @refiner start with it): each hit
// repeated the absolute projectDir, carried relPath and path twice and empty
// metadata arrays, and the package buckets duplicated every result in full —
// 39.5 KB for ten hits, past a host's 30k tool-output cap. Buckets now list
// the relPaths of the results that carry the detail.
function compactSearchJson(result) {
  const results = (result.results || []).map(compactHit);
  const pkg = {};
  for (const [bucket, items] of Object.entries(result.package || {})) {
    pkg[bucket] = Array.isArray(items) ? items.map((item) => item.relPath || item.path) : items;
  }
  return { ...result, results, package: pkg };
}

function compactHit(item) {
  const { projectDir, path: hitPath, metadata, ...hit } = item;
  if (hitPath && hitPath !== hit.relPath) hit.path = hitPath;
  const kept = {};
  for (const [key, value] of Object.entries(metadata || {})) {
    if (value == null || value === '' || (Array.isArray(value) && value.length === 0)) continue;
    if (Object.prototype.hasOwnProperty.call(hit, key) && hit[key] === value) continue;
    kept[key] = value;
  }
  if (Object.keys(kept).length > 0) hit.metadata = kept;
  return hit;
}

function printBucket(logger, title, items) {
  if (!items || items.length === 0) return;
  logger.log(`  ${title}:`);
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    logger.log(`  ${i + 1}. ${item.title} (${item.source_type}, ${item.confidence})`);
    logger.log(`     ${item.relPath}`);
    if (item.reason) logger.log(`     reason: ${item.reason}`);
    if (item.snippet) logger.log(`     ${item.snippet.replace(/\n/g, ' ')}`);
    logger.log('');
  }
}

module.exports = { runContextSearch, runContextSearchIndex, resolveSearchTarget };
