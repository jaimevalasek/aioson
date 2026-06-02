'use strict';

/**
 * aioson squad:review [projectDir] --squad=<slug> --output=<file>
 *                    [--criteria=<text,...>] [--synthesize-to=<path>]
 *                    [--include-current] [--timeout=<seconds>]
 *
 * Cross-AI adversarial review of a squad output.
 *
 * Detects available AI CLIs (excluding the current runtime), sends the same
 * review prompt to each, and synthesizes results into REVIEWS.md.
 *
 * Usage:
 *   aioson squad:review . --squad=content-team --output=outputs/ep3.md
 *   aioson squad:review . --squad=content-team --output=outputs/ep3.md \
 *     --criteria="Check factual accuracy,Check tone consistency"
 *   aioson squad:review . --squad=content-team --output=outputs/ep3.md \
 *     --synthesize-to=outputs/ep3-reviews.md
 */

const path = require('node:path');
const { runCrossAIReview, detectAvailableCLIs } = require('../squad/cross-ai-synthesizer');

async function runSquadReview({ args, options = {}, logger }) {
  const projectDir = path.resolve(process.cwd(), args[0] || '.');
  const squadSlug = String(options.squad || '').trim();
  const outputFile = String(options.output || '').trim();

  if (!squadSlug) {
    logger.error('Error: --squad is required');
    return { ok: false, error: 'missing_squad' };
  }

  if (!outputFile) {
    logger.error('Error: --output <file-to-review> is required');
    return { ok: false, error: 'missing_output' };
  }

  const outputPath = path.isAbsolute(outputFile)
    ? outputFile
    : path.join(projectDir, outputFile);

  // Parse criteria
  const rawCriteria = String(options.criteria || '').trim();
  const reviewCriteria = rawCriteria
    ? rawCriteria.split(',').map((c) => c.trim()).filter(Boolean)
    : [];

  const excludeCurrent = options['include-current'] !== true && options['include-current'] !== 'true';
  const timeoutMs = (Number(options.timeout || 60)) * 1000;

  const synthesizeTo = options['synthesize-to']
    ? path.resolve(projectDir, String(options['synthesize-to']))
    : null;

  // Show what CLIs will be queried
  const clis = detectAvailableCLIs({ excludeCurrent });
  if (clis.length === 0) {
    logger.error('No AI CLIs detected. Install claude or codex in PATH.');
    logger.log('You can override with --include-current to include the current runtime.');
    return { ok: false, error: 'no_clis_detected' };
  }

  logger.log(`Squad Review — ${squadSlug}`);
  logger.log(`Output file: ${path.relative(projectDir, outputPath)}`);
  logger.log(`Reviewers:   ${clis.join(', ')}`);
  if (reviewCriteria.length > 0) {
    logger.log(`Criteria:    ${reviewCriteria.join('; ')}`);
  }
  logger.log('');
  logger.log('Querying reviewers...');

  const result = await runCrossAIReview({
    projectDir,
    outputFile: outputPath,
    reviewCriteria,
    squadSlug,
    excludeCurrent,
    synthesizeTo,
    timeoutMs
  });

  if (!result.ok) {
    logger.error(`✗ Review failed: ${result.error}`);
    return result;
  }

  logger.log('');
  logger.log(`✓ Reviews complete`);
  logger.log(`  Reviewers: ${result.reviewers.join(', ')}`);
  logger.log(`  Successful: ${result.successCount}/${result.reviewers.length}`);
  logger.log(`  Written to: ${path.relative(projectDir, result.reviewsPath)}`);

  if (result.failCount > 0) {
    const failed = result.reviews.filter((r) => !r.ok);
    logger.log('');
    logger.log(`  ⚠ Failed reviewers:`);
    for (const f of failed) {
      logger.log(`    ${f.cli}: ${f.error}`);
    }
  }

  return result;
}

module.exports = { runSquadReview };
