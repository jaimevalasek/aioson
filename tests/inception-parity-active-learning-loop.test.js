'use strict';

/**
 * Active Learning Loop — Phase 6 inception parity test (AC-ALL-602).
 *
 * Validates that a fresh `aioson setup .` (i.e. `installTemplate`) in a
 * greenfield tmpdir produces a workspace where:
 *  - `.aioson/config/learning-loop.json` exists and parses, with the defaults
 *    documented in the spec (enabled, skip_on_classification, etc.).
 *  - The 3 archive folder placeholders exist:
 *    `.aioson/{rules,brains,context}/_archived/.gitkeep`.
 *  - `autonomy-protocol.json` lists `context:load` and `memory:search` in
 *    `tier1_silent` and `memory:archive` / `memory:restore` in
 *    `tier2_notified`.
 *  - `aioson doctor` (run programmatically) emits the 3 new curation checks
 *    (`living-memory:rule_staleness | learning_orphans | distillation_lag`).
 *  - The CLI registers `memory:search`, `memory:archive`, `memory:restore`,
 *    `context:load` (verified via `KNOWN_COMMANDS` set in `src/cli.js`).
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const { installTemplate } = require('../src/installer');
const { runDoctor } = require('../src/doctor');

test('AC-ALL-602: greenfield install ships learning-loop.json + archive placeholders + autonomy-protocol tier entries', async () => {
  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'aioson-parity-'));
  await installTemplate(dir, { overwrite: true, mode: 'install' });

  // 1. learning-loop.json config copied with documented defaults
  const configPath = path.join(dir, '.aioson', 'config', 'learning-loop.json');
  assert.ok(fs.existsSync(configPath), 'learning-loop.json missing in greenfield install');
  const cfg = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  assert.equal(cfg.enabled, true);
  assert.deepEqual(cfg.skip_on_classification, ['MICRO']);
  assert.equal(cfg.execution_mode, 'foreground');
  assert.equal(cfg.lock_strategy, 'sqlite-row');
  assert.equal(cfg.timeout_ms, 5000);

  // 2. Archive folder placeholders present
  for (const root of ['rules', 'brains', 'context']) {
    const placeholder = path.join(dir, '.aioson', root, '_archived', '.gitkeep');
    assert.ok(fs.existsSync(placeholder), `placeholder missing: .aioson/${root}/_archived/.gitkeep`);
  }

  // 3. autonomy-protocol.json carries the active-learning-loop CLI verbs
  const autonomyPath = path.join(dir, '.aioson', 'config', 'autonomy-protocol.json');
  assert.ok(fs.existsSync(autonomyPath), 'autonomy-protocol.json missing');
  const autonomy = JSON.parse(fs.readFileSync(autonomyPath, 'utf8'));
  const tier1 = autonomy.tiers.tier1_silent.aioson_commands || [];
  const tier2 = autonomy.tiers.tier2_notified.aioson_commands || [];
  assert.ok(tier1.includes('context:load'), 'context:load missing from tier1_silent');
  assert.ok(tier1.includes('memory:search'), 'memory:search missing from tier1_silent');
  assert.ok(tier2.includes('memory:archive'), 'memory:archive missing from tier2_notified');
  assert.ok(tier2.includes('memory:restore'), 'memory:restore missing from tier2_notified');
});

test('AC-ALL-602: aioson doctor in a greenfield install reports the 3 new curation checks', async () => {
  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'aioson-parity-'));
  await installTemplate(dir, { overwrite: true, mode: 'install' });

  // Greenfield: no aios.sqlite yet. The checks should emit ok=true per EC-ALL-11.
  const report = await runDoctor(dir);
  const curation = report.checks.filter((c) =>
    c.id && /^living-memory:(rule_staleness|learning_orphans|distillation_lag)$/.test(c.id)
  );
  assert.equal(curation.length, 3, `expected 3 curation checks, got ${curation.length}`);
  for (const c of curation) {
    assert.equal(c.severity, 'warning');
    assert.ok('ok' in c, `check ${c.id} missing ok field`);
  }
});

test('AC-ALL-602: src/cli.js KNOWN_COMMANDS registers the 4 active-learning-loop verbs', async () => {
  const cliSource = fs.readFileSync(path.join('src', 'cli.js'), 'utf8');
  for (const verb of ['context:load', 'memory:search', 'memory:archive', 'memory:restore']) {
    assert.ok(
      cliSource.includes(`'${verb}'`),
      `src/cli.js does not register CLI verb ${verb}`
    );
  }
});

test('AC-ALL-602: src/cli.js requires all Phase 1-5 command modules', async () => {
  const cliSource = fs.readFileSync(path.join('src', 'cli.js'), 'utf8');
  for (const mod of [
    './commands/context-load',
    './commands/memory-search',
    './commands/memory-archive',
    './commands/memory-restore'
  ]) {
    assert.ok(
      cliSource.includes(`require('${mod}')`),
      `src/cli.js does not require ${mod}`
    );
  }
});
