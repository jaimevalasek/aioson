'use strict';

/**
 * aioson op:profile — the operator's portfolio across this machine's projects.
 *
 * What a person usually chooses (project type, framework, language,
 * Autopilot, test runner, size, design), the defaults a new project would be
 * offered (operator-portfolio.js: clear majorities only), the projects behind
 * the CLI version, and the standing decisions proven in more than one project.
 * Read-only, except `--scan=<folder>`, which records the AIOSON projects found
 * under that folder (project-registry.js) before answering.
 *
 *   aioson op:profile [path] [--scan=<folder>] [--depth=<n>] [--json]
 */

const path = require('node:path');
const { positionalArgs, openCommand, commandFailure, projectTranslator } = require('../operator-memory/command-context');
const { recordProjects, scanForProjects, registryPath } = require('../lib/project-registry');
const { buildPortfolio, FIELDS } = require('../lib/operator-portfolio');

const HELP = 'op:profile [path] [--scan=<folder>] [--depth=<n>] [--json] — what you usually choose across the AIOSON projects this machine recorded (type, framework, language, Autopilot, tests, size, design), the defaults a new project is offered (clear majorities only), projects behind this CLI, and decisions standing in two or more projects. Every session records the project it opens; --scan imports the projects already under a folder (default depth 3).';

function cliVersion() {
  try { return require('../../package.json').version; } catch { return null; }
}

function identityFor(dir) {
  try {
    const { resolveIdentity, readGitEmail } = require('../operator-memory/identity');
    const resolved = resolveIdentity({ emailReader: () => readGitEmail(dir) });
    return resolved.source === 'anonymous-fallback' ? null : resolved.identity;
  } catch {
    return null;
  }
}

function scan(options, logger) {
  if (options.scan === undefined) return { scanned: null };
  if (typeof options.scan !== 'string' || !options.scan.trim()) {
    return { failure: commandFailure(options, logger, 'op:profile — --scan needs a folder: --scan=<folder>.') };
  }
  const depth = options.depth === undefined ? 3 : Number(options.depth);
  if (!Number.isInteger(depth) || depth < 0 || depth > 6) {
    return { failure: commandFailure(options, logger, 'op:profile — --depth must be a whole number from 0 to 6.') };
  }
  const root = path.resolve(options.scan);
  const found = scanForProjects(root, { depth });
  const recorded = recordProjects(found, { force: true });
  return { scanned: { root, found: found.length, added: recorded.added.length, skipped: recorded.skipped.length, ...(recorded.disabled ? { disabled: true } : {}) } };
}

function label(t, field, value) {
  if (field === 'auto_handoff') return t(`cli.op_profile.value_${value === 'true' ? 'on' : 'off'}`);
  return value;
}

function printProfile(logger, t, portfolio, scanned) {
  if (scanned) logger.log(t('cli.op_profile.scanned', scanned));
  if (portfolio.projects === 0) {
    logger.log(t('cli.op_profile.empty'));
    return;
  }
  const latest = portfolio.recent[0] ? `${portfolio.recent[0].name}, ${String(portfolio.recent[0].last_seen || '').slice(0, 10)}` : '-';
  logger.log(t('cli.op_profile.header', { count: portfolio.projects, latest }));
  for (const field of FIELDS) {
    const tally = portfolio.choices[field];
    if (!tally || tally.length === 0) continue;
    const line = tally.slice(0, 5).map((entry) => `${label(t, field, entry.value)} ${entry.count}`).join(' · ');
    logger.log(`  ${t(`cli.op_profile.label_${field}`)}: ${line}`);
  }
  const picks = Object.entries(portfolio.suggested).map(([field, pick]) => `${t(`cli.op_profile.label_${field}`)} ${label(t, field, pick.value)} (${pick.count}/${pick.of})`);
  logger.log(picks.length > 0 ? t('cli.op_profile.suggested', { list: picks.join(', ') }) : t('cli.op_profile.no_suggestion'));
  if (portfolio.habits.length > 0) {
    logger.log(t('cli.op_profile.habits_header'));
    for (const habit of portfolio.habits) logger.log(`  - ${habit.title} (${habit.slug})`);
  } else {
    logger.log(t('cli.op_profile.habits_none'));
  }
  if (portfolio.outdated && portfolio.outdated.count > 0) {
    const oldest = portfolio.outdated.oldest.map((entry) => `${entry.name} ${entry.version}`).join(', ');
    logger.log(t('cli.op_profile.outdated', { count: portfolio.outdated.count, total: portfolio.projects, current: portfolio.outdated.current, oldest }));
  }
}

async function runOpProfile({ args = [], options = {}, logger }) {
  if (options.help === true || args.includes('--help') || args.includes('-h')) {
    if (options.json) return { ok: true, help: true, usage: HELP };
    if (logger) logger.log(HELP);
    return { ok: true };
  }
  const where = openCommand('op:profile', positionalArgs(args)[0], options, logger);
  if (where.failure) return where.failure;
  const scanned = scan(options, logger);
  if (scanned.failure) return scanned.failure;

  const portfolio = buildPortfolio({ identity: identityFor(where.dir), cliVersion: cliVersion() });
  const result = { ok: true, registry: registryPath(), ...(scanned.scanned ? { scanned: scanned.scanned } : {}), ...portfolio };
  if (options.json) return result;
  if (logger) printProfile(logger, projectTranslator(where.dir, options), portfolio, scanned.scanned);
  return result;
}

module.exports = { runOpProfile, HELP };
