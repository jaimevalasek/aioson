'use strict';

const { resolveProjectRoot } = require('../verification/path-policy');
const {
  prepareReview,
  checkReview,
  reviewStatus
} = require('../review-intelligence/engine');

function failure(operation, error, logger) {
  const reason = error && error.reason ? error.reason : 'review_operation_failed';
  const result = {
    ok: false,
    operation,
    exitCode: 2,
    reason,
    error: {
      code: reason,
      ...(error && error.details && Object.keys(error.details).length > 0 ? { details: error.details } : {})
    }
  };
  logger.error(`${operation} failed: ${reason}`);
  return result;
}

async function runReviewPrepare({ args, options = {}, logger }) {
  const rootDir = resolveProjectRoot(process.cwd(), args[0] || '.');
  try {
    const result = await prepareReview({
      rootDir,
      featureSlug: options.feature,
      agent: options.agent,
      artifactPath: options.artifact
    });
    logger.log(`review:prepare ${result.created ? 'created' : 'current'} — ${result.packet.agent}/${result.packet.profile}`);
    logger.log(`  packet: ${result.packet_path}`);
    logger.log(`  draft: ${result.draft_path}`);
    logger.log(`  next: ${result.next_command}`);
    return result;
  } catch (error) {
    return failure('review:prepare', error, logger);
  }
}

async function runReviewCheck({ args, options = {}, logger }) {
  const rootDir = resolveProjectRoot(process.cwd(), args[0] || '.');
  try {
    const result = await checkReview({
      rootDir,
      featureSlug: options.feature,
      agent: options.agent,
      reportPath: options.report
    });
    logger.log(`review:check ${result.review_status} — ${result.report.agent}/${result.report.profile}`);
    logger.log(`  report: ${result.report_path}`);
    if (result.requires_action) logger.log('  action required: inspect findings and owners before handoff.');
    return result;
  } catch (error) {
    return failure('review:check', error, logger);
  }
}

async function runReviewStatus({ args, options = {}, logger }) {
  const rootDir = resolveProjectRoot(process.cwd(), args[0] || '.');
  try {
    const result = await reviewStatus({ rootDir, featureSlug: options.feature });
    logger.log(`review:status ${result.overall_status} — ${result.feature_slug}`);
    for (const item of result.agents || []) {
      logger.log(`  ${item.agent}: ${item.review_status}`);
    }
    if (result.issues && result.issues.length > 0) {
      logger.log(`  issues: ${result.issues.length}`);
    }
    return result;
  } catch (error) {
    return failure('review:status', error, logger);
  }
}

module.exports = {
  runReviewPrepare,
  runReviewCheck,
  runReviewStatus
};
