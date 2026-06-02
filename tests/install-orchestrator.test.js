'use strict';

/**
 * Orchestrator-level tests for runInstall.
 *
 * The unit tests for install-wizard and install-profile cover their pieces
 * in isolation, but they leave a gap at the seam:
 *   - install-wizard returns null in non-TTY / --no-interactive
 *   - install-profile treats `null` profile as "install everything"
 *   - runInstall is the orchestrator that decides what to do when the wizard
 *     can't run AND the user explicitly asked for `--reconfigure`, AND/OR a
 *     saved profile already exists on disk.
 *
 * Bug: in non-TTY (or `--no-interactive`) the wizard silently returns null,
 * runInstall feeds null to installTemplate, and installTemplate copies every
 * file in the template. The user asks "why isn't the picker showing?" and
 * the answer is "we silently fell through to install-all". These tests pin
 * the contract that prevents that silent fallback.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { createTranslator } = require('../src/i18n');
const { runInstall } = require('../src/commands/install');
const { installTemplate } = require('../src/installer');

async function makeTempDir() {
  return fs.mkdtemp(path.join(os.tmpdir(), 'aioson-install-orch-'));
}

async function fileExists(p) {
  try { await fs.access(p); return true; } catch { return false; }
}

function createCollectLogger() {
  const lines = [];
  return {
    lines,
    log(line)   { lines.push(String(line)); },
    error(line) { lines.push(String(line)); }
  };
}

// --- 1. --reconfigure cannot run silently in non-interactive ---

test('runInstall --reconfigure in non-interactive must reject (no silent install-all)', async () => {
  const dir = await makeTempDir();
  await installTemplate(dir, {
    mode: 'install',
    installProfile: { tools: ['claude'], uses: ['development'], design: 'none', locale: 'en' }
  });

  const { t } = createTranslator('en');
  const logger = createCollectLogger();

  await assert.rejects(
    () => runInstall({
      args: [dir],
      options: { reconfigure: true, 'no-interactive': true },
      logger,
      t
    }),
    /reconfigure/i,
    '--reconfigure without an interactive wizard must throw — not silently install everything'
  );

  // And the disk must not have been polluted with non-selected tool files
  assert.equal(await fileExists(path.join(dir, 'AGENTS.md')), false,
    'reconfigure rejection must short-circuit before any file copy');
});

// --- 2. Non-interactive with saved profile must honor that profile ---

test('runInstall non-interactive with saved profile honors it (no fallback to install-all)', async () => {
  const dir = await makeTempDir();
  // Saved profile: claude only — no AGENTS.md, no OPENCODE.md
  await installTemplate(dir, {
    mode: 'install',
    installProfile: { tools: ['claude'], uses: ['development'], design: 'none', locale: 'en' }
  });
  // Sanity: post-install state matches the profile
  assert.equal(await fileExists(path.join(dir, 'CLAUDE.md')), true);
  assert.equal(await fileExists(path.join(dir, 'AGENTS.md')), false);

  const { t } = createTranslator('en');
  const logger = createCollectLogger();

  await runInstall({
    args: [dir],
    options: { 'no-interactive': true },
    logger,
    t
  });

  // If the orchestrator silently fell back to null=install-all, AGENTS.md would
  // appear here (it doesn't exist yet so overwrite=false wouldn't skip it).
  assert.equal(await fileExists(path.join(dir, 'AGENTS.md')), false,
    'non-interactive install must use saved profile, not null=install-all');
  assert.equal(await fileExists(path.join(dir, 'OPENCODE.md')), false,
    'non-interactive install must use saved profile, not null=install-all');
});

// --- 3. Non-interactive without saved profile: fallback is allowed but must be loud ---

test('runInstall non-interactive without saved profile announces install-all fallback', async () => {
  const dir = await makeTempDir();
  const { t } = createTranslator('en');
  const logger = createCollectLogger();

  await runInstall({
    args: [dir],
    options: { 'no-interactive': true },
    logger,
    t
  });

  const all = logger.lines.join('\n');
  // Precise sentinels — the fix must log one of these phrases. Avoid generic words
  // like "install" because the tempdir prefix already contains them.
  assert.match(
    all,
    /no saved profile|fallback to install-all|wizard skipped/i,
    `non-interactive fresh install must announce the install-all fallback explicitly; logger output was:\n${all}`
  );
});
