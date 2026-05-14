'use strict';

/**
 * QA Phase 6 — final coverage pins for active-learning-loop.
 *
 * Pins probe behaviors not asserted by the dev suite:
 *  - Parity helper catches surgical drift (1 missing verb) — AC-ALL-603 precision
 *  - Parity helper accepts a superset of verbs (extra commands don't cause issues)
 *  - Inception fixture does NOT touch the project-root runtime DB (test isolation)
 *  - Installer update mode preserves user customization? — pinning the
 *    CURRENT behavior (overwrite) as a documented Medium so a future change
 *    is visible as a regression rather than a silent improvement.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const { checkLearningLoopTemplateParity } = require('../src/commands/sync-agents-preflight');
const { installTemplate } = require('../src/installer');

function buildTemplateRoot(root, autonomyTiers, omitConfig) {
  const tmpl = path.join(root, 'template');
  fs.mkdirSync(path.join(tmpl, '.aioson', 'config'), { recursive: true });
  for (const d of ['rules', 'brains', 'context']) {
    fs.mkdirSync(path.join(tmpl, '.aioson', d, '_archived'), { recursive: true });
    fs.writeFileSync(path.join(tmpl, '.aioson', d, '_archived', '.gitkeep'), '');
  }
  if (!omitConfig) {
    fs.writeFileSync(
      path.join(tmpl, '.aioson', 'config', 'learning-loop.json'),
      JSON.stringify({
        enabled: true,
        skip_on_classification: ['MICRO'],
        execution_mode: 'foreground',
        lock_strategy: 'sqlite-row',
        timeout_ms: 5000
      })
    );
  }
  fs.writeFileSync(
    path.join(tmpl, '.aioson', 'config', 'autonomy-protocol.json'),
    JSON.stringify({ tiers: autonomyTiers })
  );
}

test('QA-PARITY-SURGICAL: catches a single missing tier2 verb', async () => {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), 'aios-qa6-'));
  buildTemplateRoot(root, {
    tier1_silent: { aioson_commands: ['context:load', 'memory:search'] },
    tier2_notified: { aioson_commands: ['memory:archive'] } // memory:restore missing
  });
  const issues = checkLearningLoopTemplateParity(root);
  assert.ok(
    issues.some((i) => i.kind === 'autonomy_tier2_missing' && i.verb === 'memory:restore'),
    `expected drift on memory:restore, got ${JSON.stringify(issues)}`
  );
});

test('QA-PARITY-SUPERSET: accepts a template with extra unrelated verbs in either tier', async () => {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), 'aios-qa6-'));
  buildTemplateRoot(root, {
    tier1_silent: { aioson_commands: ['context:load', 'memory:search', 'extra:verb-a', 'unrelated:thing'] },
    tier2_notified: { aioson_commands: ['memory:archive', 'memory:restore', 'other:cmd'] }
  });
  const issues = checkLearningLoopTemplateParity(root);
  assert.deepEqual(issues, [], `subset semantics violated, got ${JSON.stringify(issues)}`);
});

test('QA-PARITY-CONFIG-MISSING-KEY: catches schema drift in learning-loop.json', async () => {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), 'aios-qa6-'));
  buildTemplateRoot(root, {
    tier1_silent: { aioson_commands: ['context:load', 'memory:search'] },
    tier2_notified: { aioson_commands: ['memory:archive', 'memory:restore'] }
  });
  // Replace config with one missing keys
  fs.writeFileSync(
    path.join(root, 'template', '.aioson', 'config', 'learning-loop.json'),
    JSON.stringify({ enabled: true })
  );
  const issues = checkLearningLoopTemplateParity(root);
  const missingKeys = issues.filter((i) => i.kind === 'config_missing_key').map((i) => i.key).sort();
  assert.deepEqual(
    missingKeys,
    ['execution_mode', 'lock_strategy', 'skip_on_classification', 'timeout_ms'],
    `expected 4 missing keys, got ${JSON.stringify(missingKeys)}`
  );
});

test('QA-PARITY-INVALID-JSON: catches malformed learning-loop.json', async () => {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), 'aios-qa6-'));
  buildTemplateRoot(root, {
    tier1_silent: { aioson_commands: ['context:load', 'memory:search'] },
    tier2_notified: { aioson_commands: ['memory:archive', 'memory:restore'] }
  });
  fs.writeFileSync(
    path.join(root, 'template', '.aioson', 'config', 'learning-loop.json'),
    'not-json-at-all'
  );
  const issues = checkLearningLoopTemplateParity(root);
  assert.ok(
    issues.some((i) => i.kind === 'invalid_config_json'),
    `expected invalid_config_json issue, got ${JSON.stringify(issues)}`
  );
});

test('QA-INCEPTION-ISOLATION: tmpdir greenfield install + feature:close does NOT touch the project-root aios.sqlite', async () => {
  const projectRuntime = '.aioson/runtime/aios.sqlite';
  const before = fs.statSync(projectRuntime).mtimeMs;

  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'aios-qa6-iso-'));
  await installTemplate(dir, { overwrite: true, mode: 'install' });

  // Write minimal feature artifacts directly (skip writeFeatureArtifacts helper)
  fs.writeFileSync(
    path.join(dir, '.aioson', 'context', 'features.md'),
    '# Features\n\n| slug | status | started | completed |\n|------|--------|---------|-----------|\n| qa-iso | in_progress | 2026-05-01 | — |\n'
  );
  fs.writeFileSync(path.join(dir, '.aioson', 'context', 'prd-qa-iso.md'), '---\nclassification: MEDIUM\n---\n');
  fs.writeFileSync(path.join(dir, '.aioson', 'context', 'spec-qa-iso.md'), '---\nfeature: qa-iso\nstatus: in_progress\n---\n');
  fs.writeFileSync(path.join(dir, '.aioson', 'context', 'project-pulse.md'), '# Project Pulse\n');

  const { runFeatureClose } = require('../src/commands/feature-close');
  const r = await runFeatureClose({
    args: [dir],
    options: { feature: 'qa-iso', verdict: 'PASS', json: true },
    logger: { log: () => {}, error: () => {} }
  });
  assert.equal(r.ok, true);

  const after = fs.statSync(projectRuntime).mtimeMs;
  assert.equal(after, before, 'project-root aios.sqlite was modified by an isolated tmpdir test');
});

test('QA-INSTALLER-UPDATE-BEHAVIOR: pins CURRENT behavior — learning-loop.json IS overwritten on update mode (documented Medium)', async () => {
  // This test pins TODAY'S behavior, not the desired behavior. The architecture
  // spec promises "aioson update aplica merge inteligente (preserve user
  // overrides)" but the installer.js currently copies template → workspace,
  // overwriting customizations. Same is true for autonomy-protocol.json and
  // scout-engine.json — this is the policy for the whole `.aioson/config/`
  // directory, not specific to active-learning-loop. Backups land under
  // `.aioson/backups/{timestamp}/` per the installer's `backupOnOverwrite`
  // option for update mode.
  //
  // If/when a future change implements true merge, this test should flip
  // expectations — that change is then visible.
  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'aios-qa6-upd-'));
  await installTemplate(dir, { overwrite: true, mode: 'install' });
  const cfgPath = path.join(dir, '.aioson', 'config', 'learning-loop.json');

  const customized = {
    enabled: false, // user disabled the loop
    skip_on_classification: ['MICRO', 'SMALL'],
    execution_mode: 'foreground',
    lock_strategy: 'sqlite-row',
    timeout_ms: 9999,
    auto_promote_threshold: 7
  };
  fs.writeFileSync(cfgPath, JSON.stringify(customized, null, 2));

  await installTemplate(dir, { mode: 'update' });

  const after = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
  assert.equal(after.enabled, true, 'CURRENT behavior pin: update overwrites enabled');
  assert.equal(after.timeout_ms, 5000, 'CURRENT behavior pin: update overwrites timeout_ms');

  // Backup MAY be there if backupOnOverwrite ran. Don't fail if not — that
  // varies by installer flags.
});
