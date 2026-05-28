'use strict';

// Tests for gemini-phaseout Phase 1 (v1.21.0 — deprecation warnings).
// Covers BR-GP-03 (zero false positives), EC-GP-01, EC-GP-04, BR-GP-09 (4 locales),
// the permissions.toml header (M1c), and the install-wizard marker (M1a).

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const { runDoctor } = require('../src/doctor');
const { buildGeminiToml } = require('../src/permissions-generator');
const { __test__ } = require('../src/install-wizard');

const LOCALES = ['en', 'pt-BR', 'es', 'fr'];

async function tmp() {
  return fs.mkdtemp(path.join(os.tmpdir(), 'aioson-gemini-phaseout-'));
}

function findCheck(report, id) {
  return report.checks.find((c) => c.id === id);
}

// ── M1b doctor check ───────────────────────────────────────────────────────

test('doctor: harness:gemini_deprecation fires when .gemini/permissions.toml exists', async () => {
  const dir = await tmp();
  await fs.mkdir(path.join(dir, '.gemini'), { recursive: true });
  await fs.writeFile(path.join(dir, '.gemini/permissions.toml'), '\n', 'utf8');

  const report = await runDoctor(dir);
  const check = findCheck(report, 'harness:gemini_deprecation');

  assert.ok(check, 'check should be present when .gemini/permissions.toml exists');
  assert.equal(check.severity, 'warning');
  assert.equal(check.ok, false);
  assert.equal(check.key, 'doctor.gemini_deprecation');
  assert.equal(check.hintKey, 'doctor.gemini_deprecation_hint');
});

test('doctor: harness:gemini_deprecation fires when only .gemini/GEMINI.md exists (EC-GP-04 OR)', async () => {
  const dir = await tmp();
  await fs.mkdir(path.join(dir, '.gemini'), { recursive: true });
  await fs.writeFile(path.join(dir, '.gemini/GEMINI.md'), '# gemini\n', 'utf8');

  const report = await runDoctor(dir);
  assert.ok(findCheck(report, 'harness:gemini_deprecation'), 'check should fire on GEMINI.md alone');
});

test('doctor: harness:gemini_deprecation is SILENT on greenfield without .gemini/ (BR-GP-03 / EC-GP-01)', async () => {
  const dir = await tmp();
  const report = await runDoctor(dir);
  assert.equal(findCheck(report, 'harness:gemini_deprecation'), undefined,
    'no .gemini/ → zero false positive');
});

test('doctor: gemini deprecation is advisory only — does not break report.ok', async () => {
  const dirWith = await tmp();
  await fs.mkdir(path.join(dirWith, '.gemini'), { recursive: true });
  await fs.writeFile(path.join(dirWith, '.gemini/permissions.toml'), '\n', 'utf8');
  const dirWithout = await tmp();

  const a = await runDoctor(dirWith);
  const b = await runDoctor(dirWithout);
  // Adding the warning check must not change report.ok versus the same project
  // without .gemini/ (warning severity is excluded from the ok gate).
  assert.equal(a.ok, b.ok, 'gemini warning must not flip report.ok');
});

// ── M1c permissions-generator header ────────────────────────────────────────

test('permissions-generator: buildGeminiToml emits the deprecation header', () => {
  const toml = buildGeminiToml(
    { shellPatterns: ['git status'], aiosonCommands: ['preflight'] },
    { mode: 'guarded', requires_tty: true }
  );
  assert.match(toml, /WARNING: Gemini CLI free tier ends 2026-06-18/);
  assert.match(toml, /enterprise users \(Code Assist Standard\/Enterprise\)/);
  assert.match(toml, /CHANGELOG v1\.21\.x/);
  // header must not break the functional TOML body
  assert.match(toml, /version = "1\.1"/);
  assert.match(toml, /aioson_allowed = \[\s+"preflight",\s+\]/);
});

// ── M1a install-wizard marker ───────────────────────────────────────────────

test('install-wizard: Gemini tool entry is flagged deprecated', () => {
  const gemini = __test__.TOOLS.find((tl) => tl.id === 'gemini');
  assert.ok(gemini, 'gemini tool entry exists');
  assert.equal(gemini.deprecated, true);
});

test('install-wizard: renderScreen1 shows [DEPRECATED] next to Gemini', () => {
  let out = '';
  const stdout = { write(chunk) { out += String(chunk); return true; } };
  __test__.renderScreen1(0, new Set(), false, stdout);
  assert.match(out, /Gemini CLI/);
  assert.match(out, /\[DEPRECATED\] free tier ends 2026-06-18/);
  // non-deprecated tools must not carry the marker
  const claudeLine = out.split('\n').find((l) => l.includes('Claude Code'));
  assert.ok(claudeLine && !claudeLine.includes('[DEPRECATED]'), 'only deprecated tools get the marker');
});

// ── BR-GP-09 i18n coverage (4 locales) ──────────────────────────────────────

for (const loc of LOCALES) {
  test(`i18n: ${loc} has gemini deprecation keys (BR-GP-09)`, () => {
    const m = require(`../src/i18n/messages/${loc}.js`);
    assert.ok(m.doctor.gemini_deprecation, `${loc} doctor.gemini_deprecation`);
    assert.ok(m.doctor.gemini_deprecation_hint, `${loc} doctor.gemini_deprecation_hint`);
    assert.ok(m.install.gemini_deprecation_notice, `${loc} install.gemini_deprecation_notice`);
  });
}
