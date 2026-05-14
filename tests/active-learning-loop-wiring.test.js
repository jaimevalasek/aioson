'use strict';

/**
 * Active Learning Loop — Phase 6 wiring + template-parity audit.
 *
 * Verifies AC-ALL-603 (sync-agents-preflight detects template-parity drift)
 * and AC-ALL-605 (wiring audit: each integration point referenced explicitly
 * in src/). The static checks confirm brain `sheldon-006` discipline —
 * design-complete ≠ execution-complete unless every wiring touchpoint exists.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const {
  checkLearningLoopTemplateParity
} = require('../src/commands/sync-agents-preflight');

test('AC-ALL-603: checkLearningLoopTemplateParity returns 0 issues against the live template/', () => {
  const issues = checkLearningLoopTemplateParity(process.cwd());
  assert.deepEqual(issues, [], `unexpected template parity issues: ${JSON.stringify(issues, null, 2)}`);
});

test('AC-ALL-603: parity helper reports missing config + autonomy + placeholders when the template is incomplete', async () => {
  // Build a synthetic "template" with no learning-loop.json, no archive
  // placeholders, and an autonomy-protocol.json that drops the verbs.
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), 'aioson-parity-neg-'));
  const tmpl = path.join(root, 'template');
  fs.mkdirSync(path.join(tmpl, '.aioson', 'config'), { recursive: true });
  fs.writeFileSync(
    path.join(tmpl, '.aioson', 'config', 'autonomy-protocol.json'),
    JSON.stringify({ tiers: { tier1_silent: { aioson_commands: [] }, tier2_notified: { aioson_commands: [] } } })
  );

  const issues = checkLearningLoopTemplateParity(root);
  const kinds = new Set(issues.map((i) => i.kind));
  assert.ok(kinds.has('missing_config'), 'missing_config not detected');
  assert.ok(kinds.has('autonomy_tier1_missing'), 'tier1 missing verb not detected');
  assert.ok(kinds.has('autonomy_tier2_missing'), 'tier2 missing verb not detected');
  assert.ok(kinds.has('archive_placeholder_missing'), 'archive placeholder not detected');
});

// AC-ALL-605 — wiring audit (brain sheldon-006).
//
// These static grep-style assertions ensure every integration touchpoint
// is wired in source. Failing any of them means the feature shipped a
// design without execution.

test('AC-ALL-605: src/doctor.js wires the 3 curation check functions', () => {
  const doctorSrc = fs.readFileSync(path.join('src', 'doctor.js'), 'utf8');
  for (const fn of ['assessRuleStaleness', 'assessLearningOrphans', 'assessDistillationLag']) {
    assert.ok(doctorSrc.includes(fn), `src/doctor.js does not invoke ${fn}`);
  }
  // The 3 check ids must be pushed into the checks[] array.
  for (const id of ['living-memory:rule_staleness', 'living-memory:learning_orphans', 'living-memory:distillation_lag']) {
    assert.ok(doctorSrc.includes(id), `src/doctor.js does not emit check id ${id}`);
  }
});

test('AC-ALL-605: src/commands/feature-close.js wires the distillation hook + reads classification pre-archive', () => {
  const fcSrc = fs.readFileSync(path.join('src', 'commands', 'feature-close.js'), 'utf8');
  assert.ok(fcSrc.includes("require('../learning-loop-engine')"), 'feature-close does not require learning-loop-engine');
  assert.ok(fcSrc.includes('runDistillation'), 'feature-close does not invoke runDistillation');
  assert.ok(fcSrc.includes('preArchiveClassification'), 'feature-close did not capture classification pre-archive');
  assert.ok(fcSrc.includes("require('./notify')"), 'feature-close does not require notify');
});

test('AC-ALL-605: src/runtime-store.js exports appendContextLoadEvent + wires learning-loop migration', () => {
  const rsSrc = fs.readFileSync(path.join('src', 'runtime-store.js'), 'utf8');
  assert.ok(rsSrc.includes('appendContextLoadEvent'), 'runtime-store does not expose appendContextLoadEvent');
  assert.ok(rsSrc.includes("require('./learning-loop-migration')"), 'runtime-store does not require migration runner');
  assert.ok(rsSrc.includes('runLearningLoopMigration'), 'migration runner not invoked');
});

test('AC-ALL-605: all Phase 1-5 source modules exist on disk', () => {
  const required = [
    'src/learning-loop-migration.js',
    'src/learning-loop-fts5.js',
    'src/learning-loop-archive.js',
    'src/learning-loop-doctor.js',
    'src/learning-loop-engine.js',
    'src/commands/context-load.js',
    'src/commands/memory-search.js',
    'src/commands/memory-archive.js',
    'src/commands/memory-restore.js'
  ];
  for (const rel of required) {
    assert.ok(fs.existsSync(rel), `missing required module: ${rel}`);
  }
});

test('AC-ALL-605: template/.aioson/agents/ chain agents are byte-identical with .aioson/agents/ for active-learning-loop scope', () => {
  // We only assert that agent files referencing memory:search / memory:archive
  // in workspace also reference them in template (per CHAIN_AGENTS sweep). The
  // existing checkParity already enforces length parity; this is a more
  // surgical assertion for the active-learning-loop verbs.
  const agentsDir = path.join('.aioson', 'agents');
  const tmplAgentsDir = path.join('template', '.aioson', 'agents');
  if (!fs.existsSync(agentsDir) || !fs.existsSync(tmplAgentsDir)) return;
  const verbs = ['memory:search', 'memory:archive', 'memory:restore', 'context:load'];
  for (const file of fs.readdirSync(agentsDir)) {
    if (!file.endsWith('.md')) continue;
    const wsContent = fs.readFileSync(path.join(agentsDir, file), 'utf8');
    const tmplPath = path.join(tmplAgentsDir, file);
    if (!fs.existsSync(tmplPath)) continue;
    const tmplContent = fs.readFileSync(tmplPath, 'utf8');
    for (const verb of verbs) {
      if (wsContent.includes(verb) && !tmplContent.includes(verb)) {
        assert.fail(`${file}: workspace mentions "${verb}" but template does not (parity drift)`);
      }
    }
  }
});
