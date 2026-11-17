'use strict';

/**
 * aioson setup:detect — read-only surface over the framework detector.
 *
 * `src/detector.js` (detectFramework + isMonorepoDetection) has always powered
 * `setup:context`, but had no standalone read surface — so the @setup prompt
 * carried its own file-sniffing list and the LLM walked the workspace by hand.
 * One call returns the detected framework, its evidence, confidence, every
 * secondary match, and the monorepo signal. Detection is evidence, not a
 * decision: @setup still confirms the result with the user, and an undetected
 * stack is recorded as the user describes it.
 *
 * `portfolio` is what the operator chose in the other projects this machine
 * recorded (operator-portfolio.js), clear majorities only: the default @setup
 * offers for whatever this workspace's evidence leaves open — workspace
 * evidence always wins. Absent below three projects or without a majority.
 */

const { detectFramework, isMonorepoDetection } = require('../detector');
const { resolveTargetDir } = require('../lib/project-root');

// The setup:context flag each suggested field is persisted with, once confirmed.
const SETUP_FLAGS = {
  project_type: 'project-type',
  framework: 'framework',
  interaction_language: 'language',
  auto_handoff: 'auto-handoff',
  test_runner: 'test-runner'
};

function flagFor(field, value) {
  const text = String(value);
  return `--${SETUP_FLAGS[field]}=${/[\s"]/.test(text) ? JSON.stringify(text) : text}`;
}

function portfolioFor(targetDir) {
  try {
    const { buildPortfolio, SUGGEST_MIN_PROJECTS } = require('../lib/operator-portfolio');
    const portfolio = buildPortfolio({ exclude: targetDir });
    if (portfolio.projects < SUGGEST_MIN_PROJECTS || Object.keys(portfolio.suggested).length === 0) return null;
    const flags = Object.entries(portfolio.suggested).filter(([field]) => SETUP_FLAGS[field]).map(([field, pick]) => flagFor(field, pick.value));
    return { from: portfolio.projects, suggested: portfolio.suggested, flags: flags.join(' ') };
  } catch {
    return null;
  }
}

async function runSetupDetect({ args, options = {}, logger }) {
  const targetDir = resolveTargetDir(args);
  let detection;
  try {
    detection = await detectFramework(targetDir);
  } catch (error) {
    const failure = { ok: false, reason: 'detection_failed', error: error.message };
    if (options.json) return failure;
    logger.error(`setup:detect failed: ${error.message}`);
    return { ...failure, exitCode: 1 };
  }

  const result = {
    ok: true,
    framework: detection.framework,
    installed: detection.installed,
    evidence: detection.evidence,
    confidence: detection.confidence,
    monorepo: isMonorepoDetection(detection),
    matches: detection.matches
  };
  const portfolio = portfolioFor(targetDir);
  if (portfolio) result.portfolio = portfolio;
  if (options.json) return result;

  if (!detection.framework) {
    logger.log('setup:detect — no framework detected at the project root; record the user-described stack as-is.');
  } else {
    logger.log(`setup:detect — ${detection.framework} (${detection.confidence}; evidence: ${detection.evidence})${result.monorepo ? ' — monorepo signals present' : ''}`);
    for (const match of detection.matches.slice(1)) {
      logger.log(`  also detected: ${match.framework} (${match.confidence}; ${match.evidence})`);
    }
  }
  if (portfolio) {
    const picks = Object.entries(portfolio.suggested).map(([field, pick]) => `${field}=${pick.value} (${pick.count}/${pick.of})`);
    logger.log(`  your other ${portfolio.from} projects usually: ${picks.join(', ')} — the default to offer where this workspace proves nothing`);
  }
  return result;
}

module.exports = { runSetupDetect };
