'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { isValidSlug } = require('../dossier/schema');

async function runSquadExport({ args = [], options = {}, logger = console } = {}) {
  const projectDir = path.resolve(process.cwd(), args[0] || '.');
  const slug = options.squad || args[1];

  if (!slug) {
    logger.error('Usage: aioson squad:export [path] --squad=<slug>');
    return { ok: false, error: 'No slug provided' };
  }

  // SF-project-12: reject any slug that is not strict kebab-case before the
  // value reaches path.join / spawnSync. This is defense-in-depth on top of
  // the spawnSync-with-array-args change below; either alone closes the
  // shell-injection vector but together they also reject obvious typos early.
  if (!isValidSlug(slug)) {
    logger.error(`Invalid squad slug "${slug}" — must be kebab-case ([a-z][a-z0-9-]*)`);
    return { ok: false, error: 'Invalid slug' };
  }

  const squadDir = path.join(projectDir, '.aioson', 'squads', slug);
  const exportsDir = path.join(projectDir, '.aioson', 'squads', 'exports');
  const outputFile = path.join(exportsDir, `${slug}.aios-squad.tar.gz`);

  try {
    await fs.access(squadDir);
  } catch {
    logger.error(`Squad "${slug}" not found at ${squadDir}`);
    return { ok: false, error: `Squad "${slug}" not found` };
  }

  await fs.mkdir(exportsDir, { recursive: true });

  const relPath = path.relative(projectDir, squadDir).replace(/\\/g, '/');
  const relOutputPath = path.relative(projectDir, outputFile).replace(/\\/g, '/');
  const tarArgs = ['-czf', relOutputPath, relPath];

  // SF-project-12: spawnSync with array args bypasses the shell, so embedded
  // metacharacters in any argument become literal tar arguments instead of
  // shell-parsed tokens.
  const result = spawnSync('tar', tarArgs, {
    cwd: projectDir,
    stdio: 'pipe'
  });
  if (result.error || result.status !== 0) {
    const message = result.error
      ? result.error.message
      : (result.stderr ? result.stderr.toString().trim() : `tar exit status ${result.status}`);
    logger.error(`Export failed: ${message}`);
    return { ok: false, error: message };
  }

  const relOutput = path.relative(projectDir, outputFile);
  logger.log('');
  logger.log(`\u2705 Squad "${slug}" exported to: ${relOutput}`);
  logger.log('');

  return { ok: true, slug, outputFile: relOutput };
}

module.exports = { runSquadExport };
