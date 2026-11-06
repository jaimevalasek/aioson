'use strict';

/**
 * aioson dev:progress [path] --feature=<slug> [--json]
 *
 * Phases finished, the mean per phase and the projection for the rest, from the
 * stamps `dev:state:write` left in this run. Below two real intervals it says so
 * and gives no number. See src/lib/dev-progress.js.
 */

const { readFeatureArtifactSafe } = require('../preflight-engine');
const { resolveTargetDir } = require('../lib/project-root');
const { isValidSlug } = require('../dossier/schema');
const {
  formatMinutes,
  ledgerPath,
  planPhaseIds,
  projectProgress,
  readPhaseCheckpoints
} = require('../lib/dev-progress');

function statusLine(progress) {
  if (progress.status === 'complete') return 'Every planned phase has a checkpoint.';
  if (progress.status === 'measured') {
    const pace = `Mean per phase: ${formatMinutes(progress.mean_minutes)} (from ${formatMinutes(progress.min_minutes)} to ${formatMinutes(progress.max_minutes)}, ${progress.measured} phases measured).`;
    if (progress.projected_remaining_minutes === null) return `${pace} No plan was found, so the rest cannot be projected.`;
    return `${pace} At this pace the remaining ${progress.remaining} phase(s) take about ${formatMinutes(progress.projected_remaining_minutes)} of wall clock, pauses included.`;
  }
  return `No measure yet: ${progress.intervals} real interval(s) between checkpoints, at least ${progress.needed_to_measure} are needed, each of a minute or more. A forecast below that would be invented.`;
}

async function runDevProgress({ args = [], options = {}, logger } = {}) {
  const targetDir = resolveTargetDir(args);
  const slug = options.feature ? String(options.feature) : null;
  if (!slug || !isValidSlug(slug)) {
    if (!options.json && logger) logger.error('--feature=<slug> is required.');
    return { ok: false, reason: slug ? 'invalid_feature' : 'missing_feature' };
  }
  const plan = await readFeatureArtifactSafe(targetDir, slug, `implementation-plan-${slug}.md`);
  const entries = await readPhaseCheckpoints(targetDir, slug);
  const progress = projectProgress(entries, planPhaseIds(plan));
  const result = {
    ok: true,
    feature: slug,
    source: ledgerPath(targetDir, slug).slice(targetDir.length + 1).split(/[\\/]/).join('/'),
    checkpoints: entries.length,
    ...progress,
    summary: statusLine(progress)
  };
  if (options.json || !logger) return result;

  logger.log(`Progress of ${slug}, measured from this run's checkpoints`);
  logger.log(`  Finished: ${progress.finished}${progress.total === null ? '' : ` of ${progress.total}`} phase(s)`);
  if (progress.missing.length > 0) {
    logger.log(`  No checkpoint for phase(s) ${progress.missing.join(', ')}, already passed by a later one`);
  }
  if (progress.unplanned.length > 0) {
    logger.log(`  Not counted, because the plan has no such phase: ${progress.unplanned.join(', ')}`);
  }
  logger.log(`  ${result.summary}`);
  return result;
}

module.exports = { runDevProgress };
