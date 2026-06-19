'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const { readNoiseFileAndRecompute } = require('../neural-chain-noise-file');
const { contextDir, readFileSafe } = require('../preflight-engine');
const { runFeatureArchive, runFeatureSweep } = require('./feature-archive');

const REVIEW_PREFIXES = new Set(['qa-report', 'security-findings']);
const GLOBAL_REVIEW_SLUGS = new Set(['project', 'test-coverage']);
const COMPLETE_DEV_STATUSES = new Set([
  'complete',
  'completed',
  'dev_complete',
  'done',
  'qa_complete'
]);

const ARTIFACT_PREFIXES = [
  'implementation-plan',
  'security-findings',
  'sheldon-enrichment',
  'test-inventory',
  'requirements',
  'conformance',
  'scope-check',
  'design-doc',
  'qa-report',
  'readiness',
  'test-plan',
  'spec',
  'prd'
];

const ARTIFACT_EXT_RE = /\.(md|json|ya?ml)$/i;

function parseFrontmatter(content) {
  const match = String(content || '').match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) return {};
  const values = {};
  for (const line of match[1].split(/\r?\n/)) {
    const idx = line.indexOf(':');
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    const value = line.slice(idx + 1).trim().replace(/^["']|["']$/g, '');
    if (key) values[key] = value;
  }
  return values;
}

async function dirExists(dirPath) {
  try {
    return (await fs.stat(dirPath)).isDirectory();
  } catch {
    return false;
  }
}

async function readJsonSafe(filePath) {
  try {
    return JSON.parse(await fs.readFile(filePath, 'utf8'));
  } catch {
    return null;
  }
}

async function readFeatureRegistry(ctxDir) {
  const content = await readFileSafe(path.join(ctxDir, 'features.md'));
  const bySlug = new Map();
  if (!content) return bySlug;

  for (const line of content.split(/\r?\n/)) {
    const match = line.match(/^\|\s*([a-z][a-z0-9-]*)\s*\|\s*([a-z_ -]+)\s*\|/i);
    if (!match) continue;
    const slug = match[1].trim().toLowerCase();
    if (slug === 'slug') continue;
    bySlug.set(slug, { slug, status: match[2].trim().toLowerCase() });
  }
  return bySlug;
}

async function readArchivedSlugs(ctxDir) {
  const content = await readFileSafe(path.join(ctxDir, 'done', 'MANIFEST.md'));
  const slugs = new Set();
  if (!content) return slugs;

  for (const line of content.split(/\r?\n/)) {
    const match = line.match(/^\|\s*([a-z][a-z0-9-]*)\s*\|/i);
    if (!match) continue;
    const slug = match[1].trim().toLowerCase();
    if (slug !== 'slug') slugs.add(slug);
  }
  return slugs;
}

function classifyArtifactName(fileName) {
  if (!ARTIFACT_EXT_RE.test(fileName)) return null;
  const base = fileName.replace(ARTIFACT_EXT_RE, '');
  for (const prefix of ARTIFACT_PREFIXES) {
    const marker = `${prefix}-`;
    if (!base.startsWith(marker)) continue;
    const slug = base.slice(marker.length).toLowerCase();
    if (!/^[a-z][a-z0-9-]*$/.test(slug)) return null;
    return {
      fileName,
      prefix,
      slug,
      kind: prefix.replace(/-/g, '_')
    };
  }
  return null;
}

async function summarizeArchivePlan(targetDir, slug) {
  try {
    const result = await runFeatureArchive({
      args: [targetDir],
      options: { feature: slug, 'dry-run': true, json: true },
      logger: null
    });
    if (!result || !result.ok) return { move_count: 0, dir_count: 0 };
    const moveCount = Array.isArray(result.move) ? result.move.length : 0;
    const dirCount = Array.isArray(result.dirs)
      ? result.dirs.filter((d) => d.action === 'move').length
      : 0;
    return { move_count: moveCount, dir_count: dirCount };
  } catch {
    return { move_count: 0, dir_count: 0 };
  }
}

async function scanDoneFeaturesPendingArchive(targetDir) {
  const sweep = await runFeatureSweep({
    args: [targetDir],
    options: { 'dry-run': true, json: true },
    logger: null
  });
  if (!sweep || !sweep.ok || !Array.isArray(sweep.pending)) return [];

  const items = [];
  for (const slug of sweep.pending) {
    // eslint-disable-next-line no-await-in-loop
    const plan = await summarizeArchivePlan(targetDir, slug);
    items.push({
      slug,
      path: '.aioson/context/features.md',
      reason: 'feature is done but missing from .aioson/context/done/MANIFEST.md',
      suggested_command: `aioson feature:archive . --feature=${slug}`,
      ...plan
    });
  }
  return items;
}

async function scanStaleDevState(ctxDir, featureRegistry) {
  const relPath = '.aioson/context/dev-state.md';
  const content = await readFileSafe(path.join(ctxDir, 'dev-state.md'));
  if (!content) return [];

  const fm = parseFrontmatter(content);
  const activeFeature = String(fm.active_feature || '').trim().toLowerCase();
  const devStatus = String(fm.status || '').trim().toLowerCase();
  if (!activeFeature) return [];

  const registered = featureRegistry.get(activeFeature);
  const issues = [];
  if (COMPLETE_DEV_STATUSES.has(devStatus)) {
    issues.push({
      path: relPath,
      active_feature: activeFeature,
      status: devStatus,
      reason: 'dev-state points to a completed implementation state',
      suggested_action: 'clear or rewrite dev-state before the next @dev activation'
    });
  } else if (registered && registered.status !== 'in_progress' && registered.status !== 'paused') {
    issues.push({
      path: relPath,
      active_feature: activeFeature,
      status: devStatus || '(none)',
      feature_status: registered.status,
      reason: `features.md marks ${activeFeature} as ${registered.status}`,
      suggested_action: 'clear or rewrite dev-state so @dev does not resume a closed feature'
    });
  }

  return issues;
}

async function scanPendingChainNoises(ctxDir) {
  const noisesDir = path.join(ctxDir, 'noises');
  const entries = await fs.readdir(noisesDir, { withFileTypes: true }).catch(() => []);
  const items = [];

  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith('.md')) continue;
    const fullPath = path.join(noisesDir, entry.name);
    let noise;
    try {
      noise = readNoiseFileAndRecompute({ path: fullPath });
    } catch (err) {
      items.push({
        path: `.aioson/context/noises/${entry.name}`,
        slug: entry.name.replace(/\.md$/i, ''),
        pending_count: 0,
        resolved_count: 0,
        total_count: 0,
        frontmatter_ok: false,
        reason: `noise file could not be parsed: ${err && err.code ? err.code : 'read_error'}`,
        suggested_action: 'inspect this noise file manually before routing with @neo',
        items: []
      });
      continue;
    }
    if (!noise.exists || noise.pendingCount === 0) continue;

    const frontmatter = noise.frontmatter || {};
    items.push({
      path: `.aioson/context/noises/${entry.name}`,
      slug: String(frontmatter.slug || entry.name.replace(/-\d{8}-\d{4}\.md$/i, '').replace(/\.md$/i, '')),
      pending_count: noise.pendingCount,
      resolved_count: noise.resolvedCount,
      total_count: noise.items.length,
      frontmatter_ok: noise.frontmatterOk,
      reason: 'neural chain impact audit has unchecked items',
      suggested_action: 'verify or fix each pending item, mark it - [x], then let the noise lifecycle delete it',
      items: noise.items
        .filter((item) => !item.checked)
        .slice(0, 20)
        .map((item) => ({
          target_path: item.target_path,
          marker: item.marker,
          reason: item.motivo
        }))
    });
  }

  return items;
}

function summarizeSecurityFindings(data) {
  if (!data || typeof data !== 'object') {
    return {
      status: 'invalid',
      findings: 0,
      open: 0,
      blockers: []
    };
  }
  const findings = Array.isArray(data && data.findings) ? data.findings : [];
  const open = findings.filter((f) => f.status === 'open' || f.status === 'needs_validation');
  const blockers = open.filter(
    (f) =>
      f.recommended_gate_status === 'block' &&
      (f.severity === 'high' || f.severity === 'critical')
  );
  let status = 'resolved';
  if (blockers.length > 0) status = 'blocking';
  else if (open.length > 0) status = 'needs_review';
  return {
    status,
    findings: findings.length,
    open: open.length,
    blockers: blockers.map((f) => f.id || f.finding_id || 'unknown-finding')
  };
}

async function scanReviewArtifacts(ctxDir, artifact, featureRegistry) {
  if (!REVIEW_PREFIXES.has(artifact.prefix)) return null;
  if (featureRegistry.has(artifact.slug) || GLOBAL_REVIEW_SLUGS.has(artifact.slug)) return null;

  const relPath = `.aioson/context/${artifact.fileName}`;
  const fullPath = path.join(ctxDir, artifact.fileName);
  if (artifact.prefix === 'security-findings') {
    const summary = summarizeSecurityFindings(await readJsonSafe(fullPath));
    return {
      path: relPath,
      slug: artifact.slug,
      kind: artifact.kind,
      reason: 'review artifact is not attached to a registered feature',
      suggested_action: summary.status === 'blocking'
        ? 'route to @dev/@pentester before any archival decision'
        : summary.status === 'invalid'
          ? 'repair or discard the malformed artifact after user review'
          : 'ask the user whether to keep as active evidence or archive as historical context',
      ...summary
    };
  }

  const content = await readFileSafe(fullPath);
  const fm = parseFrontmatter(content);
  return {
    path: relPath,
    slug: artifact.slug,
    kind: artifact.kind,
    status: String(fm.verdict || 'unknown').toLowerCase(),
    reason: 'review artifact is not attached to a registered feature',
    suggested_action: 'ask the user whether to keep as active evidence or archive as historical context'
  };
}

function classifyOrphanArtifact(artifact, featureRegistry, archivedSlugs, pendingArchiveSlugs) {
  if (REVIEW_PREFIXES.has(artifact.prefix)) return null;
  if (pendingArchiveSlugs.has(artifact.slug)) return null;

  const registered = featureRegistry.get(artifact.slug);
  if (!registered) {
    return {
      path: `.aioson/context/${artifact.fileName}`,
      slug: artifact.slug,
      kind: artifact.kind,
      reason: 'slug artifact has no row in features.md',
      suggested_action: 'review ownership; register the feature, archive manually, or keep as project-level context'
    };
  }

  if (registered.status === 'done' && archivedSlugs.has(artifact.slug)) {
    return {
      path: `.aioson/context/${artifact.fileName}`,
      slug: artifact.slug,
      kind: artifact.kind,
      reason: 'feature is already archived but root artifact still exists',
      suggested_action: `run a targeted review before moving this artifact into .aioson/context/done/${artifact.slug}/`
    };
  }

  return null;
}

async function scanRootArtifacts(ctxDir, featureRegistry, archivedSlugs, pendingArchiveSlugs) {
  const entries = await fs.readdir(ctxDir, { withFileTypes: true }).catch(() => []);
  const reviewArtifacts = [];
  const orphanSlugArtifacts = [];

  for (const entry of entries) {
    if (!entry.isFile()) continue;
    const artifact = classifyArtifactName(entry.name);
    if (!artifact) continue;

    // eslint-disable-next-line no-await-in-loop
    const review = await scanReviewArtifacts(ctxDir, artifact, featureRegistry);
    if (review) {
      reviewArtifacts.push(review);
      continue;
    }

    const orphan = classifyOrphanArtifact(artifact, featureRegistry, archivedSlugs, pendingArchiveSlugs);
    if (orphan) orphanSlugArtifacts.push(orphan);
  }

  return { reviewArtifacts, orphanSlugArtifacts };
}

function buildSummary(buckets) {
  const counts = {};
  let total = 0;
  for (const [key, items] of Object.entries(buckets)) {
    counts[key] = items.length;
    total += items.length;
  }
  return {
    status: total === 0 ? 'clean' : 'attention',
    total,
    counts
  };
}

async function runHygieneScan({ args = [], options = {}, logger }) {
  const targetDir = path.resolve(process.cwd(), args[0] || '.');
  const jsonOut = Boolean(options.json);
  const ctxDir = contextDir(targetDir);

  if (!(await dirExists(ctxDir))) {
    const out = { ok: false, reason: 'no_context_dir' };
    if (!jsonOut && logger) logger.log('.aioson/context/ not found. Run aioson setup first.');
    return out;
  }

  const featureRegistry = await readFeatureRegistry(ctxDir);
  const archivedSlugs = await readArchivedSlugs(ctxDir);
  const doneFeaturesPendingArchive = await scanDoneFeaturesPendingArchive(targetDir);
  const pendingArchiveSlugs = new Set(doneFeaturesPendingArchive.map((item) => item.slug));
  const staleStateFiles = await scanStaleDevState(ctxDir, featureRegistry);
  const pendingChainNoises = await scanPendingChainNoises(ctxDir);
  const { reviewArtifacts, orphanSlugArtifacts } = await scanRootArtifacts(
    ctxDir,
    featureRegistry,
    archivedSlugs,
    pendingArchiveSlugs
  );

  const buckets = {
    pending_chain_noises: pendingChainNoises,
    done_features_pending_archive: doneFeaturesPendingArchive,
    stale_state_files: staleStateFiles,
    on_demand_review_artifacts: reviewArtifacts,
    orphan_slug_artifacts: orphanSlugArtifacts
  };
  const result = {
    ok: true,
    readonly: true,
    targetDir,
    summary: buildSummary(buckets),
    buckets
  };

  if (!jsonOut && logger) {
    logger.log(`hygiene:scan — ${result.summary.status} (${result.summary.total} item(s))`);
    for (const [bucket, items] of Object.entries(buckets)) {
      if (items.length === 0) continue;
      logger.log(`  ${bucket}: ${items.length}`);
      for (const item of items.slice(0, 10)) {
        logger.log(`    - ${item.path || item.slug}: ${item.reason}`);
      }
    }
  }

  return result;
}

module.exports = {
  classifyArtifactName,
  runHygieneScan
};
