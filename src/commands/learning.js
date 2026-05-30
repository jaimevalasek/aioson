'use strict';

const path = require('node:path');
const {
  openRuntimeDb,
  listProjectLearnings,
  getProjectLearning,
  promoteProjectLearning,
  getProjectLearningStats
} = require('../runtime-store');
const {
  loadClaudeMemoryCandidates,
  parseSelection,
  isSelected
} = require('../learning-import-claude');
const { upsertProjectLearning } = require('./devlog-process');

/**
 * Subcommand: list [--status=active|stale|archived|promoted]
 * Lists project-level learnings.
 */
async function handleList(projectDir, statusFilter, { logger, t }) {
  const handle = await openRuntimeDb(projectDir, { mustExist: true });
  if (!handle) {
    logger.error(t('learning.no_runtime'));
    return { found: false };
  }
  const { db } = handle;
  try {
    const rows = listProjectLearnings(db, statusFilter || null);
    if (rows.length === 0) {
      logger.log(t('learning.no_learnings'));
      return { found: true, learnings: [] };
    }

    logger.log(`Project learnings (${rows.length})`);
    logger.log('');
    for (const row of rows) {
      const icon = row.status === 'active' ? '●' : row.status === 'promoted' ? '★' : row.status === 'stale' ? '○' : '▪';
      const scope = row.feature_slug ? `feature:${row.feature_slug}` : 'project';
      logger.log(`  ${icon} [${row.type}] ${row.title} (freq: ${row.frequency}, ${scope}) [${row.status}]`);
      logger.log(`    id: ${row.learning_id}`);
    }
    return { found: true, learnings: rows };
  } finally {
    db.close();
  }
}

/**
 * Subcommand: stats
 * Shows statistics for project learnings.
 */
async function handleStats(projectDir, { logger, t }) {
  const handle = await openRuntimeDb(projectDir, { mustExist: true });
  if (!handle) {
    logger.error(t('learning.no_runtime'));
    return { found: false };
  }
  const { db } = handle;
  try {
    const stats = getProjectLearningStats(db);
    if (stats.length === 0) {
      logger.log(t('learning.no_learnings'));
      return { found: true, stats: [] };
    }

    logger.log('Project learning stats');
    logger.log('');
    let total = 0;
    for (const row of stats) {
      logger.log(`  ${row.type} / ${row.status}: ${row.count}`);
      total += row.count;
    }
    logger.log('');
    logger.log(`  Total: ${total}`);
    return { found: true, stats, total };
  } finally {
    db.close();
  }
}

/**
 * Subcommand: promote <learning-id> --to=<rule-path>
 * Promotes a learning to a project rule.
 */
async function handlePromote(projectDir, learningId, promotedTo, { logger, t }) {
  if (!learningId) {
    logger.error(t('learning.promote_usage'));
    return { promoted: false };
  }

  const handle = await openRuntimeDb(projectDir, { mustExist: true });
  if (!handle) {
    logger.error(t('learning.no_runtime'));
    return { promoted: false };
  }
  const { db } = handle;
  try {
    const learning = getProjectLearning(db, learningId);
    if (!learning) {
      logger.error(t('learning.not_found', { id: learningId }));
      return { promoted: false };
    }

    const rulePath = promotedTo || path.join('.aioson', 'rules', `${learning.type}-${Date.now()}.md`);
    const updated = promoteProjectLearning(db, learningId, rulePath);
    if (updated) {
      logger.log(t('learning.promoted', { id: learningId, path: rulePath }));
    }
    return { promoted: updated, rulePath };
  } finally {
    db.close();
  }
}

/**
 * Subcommand: import-from-claude [--project-hash=<hash>] [--dry-run] [--select=1,2|all]
 * Imports technical Claude Code project memory into project_learnings.
 */
async function handleImportFromClaude(projectDir, options, { logger }) {
  let loaded;
  try {
    loaded = await loadClaudeMemoryCandidates({
      targetDir: projectDir,
      projectHash: options['project-hash'] || options.projectHash,
      claudeHome: options['claude-home'] || options.claudeHome
    });
  } catch (err) {
    logger.error(err.message);
    return { ok: false, error: err.code || 'import_failed', candidates: [], promoted: 0 };
  }

  const selection = parseSelection(options.select);
  const dryRun = Boolean(options['dry-run'] || options.dryRun);
  const candidates = loaded.candidates;

  logger.log(`Claude memory candidates (${candidates.length}) — ${loaded.hash}`);
  for (const candidate of candidates) {
    const marker = candidate.kind ? candidate.kind : candidate.classification;
    logger.log(`  [${candidate.index}] ${marker}: ${candidate.title} (${candidate.source})`);
  }

  if (dryRun || !selection) {
    if (!selection) logger.log('Run again with --select=<n[,n]|all> to import technical candidates.');
    return {
      ok: true,
      dryRun: true,
      requiresSelection: !selection,
      projectHash: loaded.hash,
      candidates,
      promoted: 0,
      skipped: 0
    };
  }

  const handle = await openRuntimeDb(projectDir);
  const { db } = handle;
  const promoted = [];
  const skipped = [];
  try {
    for (const candidate of candidates) {
      if (!isSelected(selection, candidate.index)) continue;
      if (!candidate.kind) {
        skipped.push({ index: candidate.index, title: candidate.title, reason: candidate.classification });
        continue;
      }
      const result = upsertProjectLearning(db, {
        title: candidate.title,
        type: 'quality',
        kind: candidate.kind,
        featureSlug: options.feature || null,
        evidence: candidate.evidence,
        sourceSession: `claude-memory:${loaded.hash}:${candidate.source}`
      });
      promoted.push({ ...result, index: candidate.index, title: candidate.title, kind: candidate.kind });
    }
  } finally {
    db.close();
  }

  logger.log(`Imported: ${promoted.length}`);
  if (skipped.length > 0) logger.log(`Skipped: ${skipped.length}`);
  return { ok: true, dryRun: false, projectHash: loaded.hash, candidates, promoted, skipped };
}

/**
 * Entry point for CLI integration.
 */
async function runLearning({ args = [], options = {}, logger = console, t = (k) => k } = {}) {
  const projectDir = path.resolve(process.cwd(), args[0] || '.');
  const sub = options.sub || args[1] || 'list';
  const context = { logger, t };

  if (sub === 'list') {
    return handleList(projectDir, options.status || null, context);
  }
  if (sub === 'stats') {
    return handleStats(projectDir, context);
  }
  if (sub === 'promote') {
    const learningId = args[2] || options.id;
    return handlePromote(projectDir, learningId, options.to || null, context);
  }
  if (sub === 'import-from-claude') {
    return handleImportFromClaude(projectDir, options, context);
  }

  logger.error(`Unknown subcommand: ${sub}. Available: list, stats, promote, import-from-claude`);
  return { error: true };
}

module.exports = { runLearning, handleList, handleStats, handlePromote, handleImportFromClaude };
