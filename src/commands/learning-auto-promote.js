'use strict';

/**
 * aioson learning:auto-promote — auto-promote frequent learnings to rules files.
 *
 * Scans project_learnings with frequency >= threshold and promotes eligible ones
 * to .aioson/rules/. Domain learnings (not promotable to universal rules) are noted
 * but not written. No LLM calls.
 *
 * Usage:
 *   aioson learning:auto-promote .
 *   aioson learning:auto-promote . --threshold=3
 *   aioson learning:auto-promote . --threshold=2 --dry-run
 *   aioson learning:auto-promote . --json
 */

const fs = require('node:fs/promises');
const path = require('node:path');
const { openRuntimeDb, listProjectLearnings } = require('../runtime-store');

const DEFAULT_THRESHOLD = 3;
const RULES_DIR = '.aioson/rules';
const BAR = '━'.repeat(30);

// Only 'process' and 'quality' type learnings become universal rules.
// 'domain' learnings are project-specific and should not become global rules.
// 'preference' learnings go to project.context.md (handled by learning:evolve).
const PROMOTABLE_TYPES = new Set(['process', 'quality']);

function slugify(title) {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50);
}

function buildRuleContent(learning) {
  const confidence = learning.confidence === 'high' ? ' (high confidence)' : learning.confidence === 'low' ? ' (low confidence)' : '';
  const lines = [
    '---',
    `title: ${learning.title}`,
    `type: ${learning.type}`,
    `frequency: ${learning.frequency}`,
    `source: auto-promoted`,
    'agents: all',
    '---',
    '',
    `# ${learning.title}${confidence}`,
    ''
  ];

  if (learning.evidence) {
    lines.push(`> ${learning.evidence}`, '');
  }

  if (learning.type === 'process') {
    lines.push('**When:** During any implementation or workflow session.');
    lines.push(`**Rule:** ${learning.title}`);
  } else if (learning.type === 'quality') {
    lines.push('**When:** Before committing or delivering a deliverable.');
    lines.push(`**Rule:** ${learning.title}`);
  }

  lines.push('');
  return lines.join('\n');
}

async function runLearningAutoPromote({ args, options = {}, logger }) {
  const targetDir = path.resolve(process.cwd(), args[0] || '.');
  const threshold = options.threshold ? parseInt(options.threshold) : DEFAULT_THRESHOLD;
  const dryRun = Boolean(options['dry-run'] || options.dry);

  if (isNaN(threshold) || threshold < 1) {
    if (options.json) return { ok: false, reason: 'invalid_threshold' };
    logger.log('--threshold must be a positive integer (default: 3)');
    return { ok: false };
  }

  const handle = await openRuntimeDb(targetDir, { mustExist: true });
  if (!handle) {
    if (options.json) return { ok: false, reason: 'no_runtime', message: 'No runtime database found. Run aioson runtime:init first.' };
    logger.log('No runtime database found. Run aioson runtime:init first.');
    return { ok: false };
  }

  let learnings;
  try {
    learnings = listProjectLearnings(handle.db, 'active');
  } finally {
    handle.db.close();
  }

  // Filter by threshold
  const eligible = learnings.filter((l) => Number(l.frequency || 1) >= threshold);

  if (!options.json) {
    logger.log('');
    logger.log('Learning Auto-Promotion');
    logger.log(BAR);
    logger.log(`Scanning project_learnings (frequency ≥ ${threshold}):`);
    logger.log('');
  }

  const promoted = [];
  const noted = [];
  const skipped = [];

  for (const learning of eligible) {
    if (!PROMOTABLE_TYPES.has(learning.type)) {
      noted.push({
        title: learning.title,
        type: learning.type,
        frequency: learning.frequency,
        reason: `${learning.type} learning — not promotable to universal rule`
      });
      continue;
    }

    const slug = slugify(learning.title);
    const fileName = `process-${slug}.md`;
    const filePath = path.join(targetDir, RULES_DIR, fileName);

    // Check if already exists
    let alreadyExists = false;
    try {
      await fs.access(filePath);
      alreadyExists = true;
    } catch { /* ok */ }

    if (alreadyExists) {
      skipped.push({ title: learning.title, file: fileName, reason: 'already exists' });
      continue;
    }

    const content = buildRuleContent(learning);

    if (!dryRun) {
      await fs.mkdir(path.join(targetDir, RULES_DIR), { recursive: true });
      await fs.writeFile(filePath, content, 'utf8');
    }

    promoted.push({
      learning_id: learning.learning_id,
      title: learning.title,
      type: learning.type,
      frequency: learning.frequency,
      // Forward-slash for cross-platform JSON/CLI consistency — the field is
      // logged, returned via --json, and consumed by downstream automation.
      file: path.join(RULES_DIR, fileName).replace(/\\/g, '/')
    });
  }

  const result = {
    ok: true,
    threshold,
    dry_run: dryRun,
    eligible: eligible.length,
    promoted: promoted.length,
    noted: noted.length,
    skipped: skipped.length,
    promoted_items: promoted,
    noted_items: noted,
    skipped_items: skipped
  };

  if (options.json) return result;

  // Human output
  for (const p of promoted) {
    const dryStr = dryRun ? ' (dry-run)' : '';
    logger.log(`  ✓ "${p.title}" (freq: ${p.frequency}) → promoted to ${p.file}${dryStr}`);
  }

  for (const n of noted) {
    logger.log(`  ○ "${n.title}" (freq: ${n.frequency}) → ${n.reason}`);
  }

  for (const s of skipped) {
    logger.log(`  — "${s.title}" → ${s.reason}`);
  }

  logger.log('');
  if (promoted.length > 0) {
    logger.log(`${promoted.length} rule${promoted.length !== 1 ? 's' : ''} ${dryRun ? 'would be' : ''} created.`);
    if (!dryRun) logger.log('Run: aioson learning:evolve to apply to agent genomes.');
  } else if (eligible.length === 0) {
    logger.log(`No learnings with frequency ≥ ${threshold} found.`);
  } else {
    logger.log('No new rules to create.');
  }
  logger.log('');

  return result;
}

module.exports = { runLearningAutoPromote };
