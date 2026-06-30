'use strict';

// aioson verify:artifact — build-free "done = proven, not asserted" gate for the
// non-code artifacts the peripheral agents produce. Routes a kind to an existing
// validator (project-context, genome) or a declarative SG-* ruleset.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const fssync = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  runVerifyArtifact,
  evaluateRuleset,
  availableKinds
} = require('../src/commands/verify-artifact');
const { parseArgv } = require('../src/parser');

async function tmp() {
  return fs.mkdtemp(path.join(os.tmpdir(), 'aioson-va-'));
}
async function write(dir, rel, content) {
  const full = path.join(dir, rel);
  await fs.mkdir(path.dirname(full), { recursive: true });
  await fs.writeFile(full, content, 'utf8');
}
function makeLogger() {
  const lines = [];
  return {
    log: (m = '') => lines.push(String(m)),
    error: (m = '') => lines.push(String(m)),
    warn: (m = '') => lines.push(String(m)),
    lines
  };
}

// ───────────────────────── ruleset engine ─────────────────────────

test('evaluateRuleset: passes when every criterion is satisfied', async () => {
  const dir = await tmp();
  await write(dir, 'a.md', 'generated_by: x\nconfidence: high\nreal body');
  const out = evaluateRuleset(
    [{ id: 'C1', files: ['a.md'], must_match: ['generated_by'], must_not_match: ['\\bTODO\\b'] }],
    dir
  );
  assert.equal(out.ok, true, JSON.stringify(out.issues));
  assert.equal(out.issues.length, 0);
});

test('evaluateRuleset: fails and lists the criterion id on a placeholder / missing pattern', async () => {
  const dir = await tmp();
  await write(dir, 'a.md', 'confidence: low // TODO finish this');
  const out = evaluateRuleset(
    [{ id: 'C1', files: ['a.md'], must_match: ['generated_by'], must_not_match: ['\\bTODO\\b'] }],
    dir
  );
  assert.equal(out.ok, false);
  assert.equal(out.issues.length, 1);
  assert.match(out.issues[0], /C1/);
});

// ───────────────────────── kind=bootstrap end-to-end ─────────────────────────

async function scaffoldBootstrap(dir, { omit = [], placeholder = false } = {}) {
  const files = ['what-is.md', 'what-it-does.md', 'how-it-works.md', 'current-state.md'];
  for (const f of files) {
    if (omit.includes(f)) continue;
    const body = placeholder && f === 'current-state.md' ? 'TODO: fill this in' : 'real discovered content';
    await write(
      dir,
      `.aioson/context/bootstrap/${f}`,
      `---\ngenerated_by: discover\ngenerated_at: 2026-01-01\nconfidence: high\n---\n${body}\n`
    );
  }
}

test('kind=bootstrap: all 4 files present with frontmatter → ok; report persisted', async () => {
  const dir = await tmp();
  await scaffoldBootstrap(dir);
  const report = await runVerifyArtifact({
    args: [dir],
    options: { kind: 'bootstrap', json: true, suppressExitCode: true },
    logger: makeLogger()
  });
  assert.equal(report.ok, true, JSON.stringify(report.issues));
  assert.equal(report.kind, 'bootstrap');
  const persisted = path.join(dir, '.aioson', 'context', 'verify-artifact-bootstrap.json');
  assert.ok(fssync.existsSync(persisted), 'report persisted to .aioson/context/verify-artifact-bootstrap.json');
  assert.equal(JSON.parse(fssync.readFileSync(persisted, 'utf8')).ok, true);
});

test('kind=bootstrap: a missing file fails the gate and names it', async () => {
  const dir = await tmp();
  await scaffoldBootstrap(dir, { omit: ['how-it-works.md'] });
  const report = await runVerifyArtifact({
    args: [dir],
    options: { kind: 'bootstrap', json: true, suppressExitCode: true },
    logger: makeLogger()
  });
  assert.equal(report.ok, false);
  assert.ok(report.issues.some((i) => /how-it-works/.test(i)), JSON.stringify(report.issues));
});

test('kind=bootstrap: placeholder text fails the gate', async () => {
  const dir = await tmp();
  await scaffoldBootstrap(dir, { placeholder: true });
  const report = await runVerifyArtifact({
    args: [dir],
    options: { kind: 'bootstrap', json: true, suppressExitCode: true },
    logger: makeLogger()
  });
  assert.equal(report.ok, false);
});

// ───────────────────────── advisory vs blocking + exit codes ─────────────────────────

test('--advisory: a failing kind reports not-ok but is non-blocking (exit stays 0)', async () => {
  const dir = await tmp();
  await scaffoldBootstrap(dir, { omit: ['what-is.md'] });
  const prev = process.exitCode;
  process.exitCode = 0;
  const report = await runVerifyArtifact({
    args: [dir],
    options: { kind: 'bootstrap', advisory: true, json: true },
    logger: makeLogger()
  });
  assert.equal(report.ok, false);
  assert.equal(report.blocking, false);
  assert.equal(report.mode, 'advisory');
  assert.equal(process.exitCode, 0, 'advisory must never set exit 1');
  process.exitCode = prev;
});

test('blocking mode sets exit 1 on failure; suppressExitCode honored', async () => {
  const dir = await tmp();
  await scaffoldBootstrap(dir, { omit: ['what-is.md'] });
  const prev = process.exitCode;

  process.exitCode = 0;
  await runVerifyArtifact({ args: [dir], options: { kind: 'bootstrap', json: true }, logger: makeLogger() });
  assert.equal(process.exitCode, 1, 'a blocking failure sets exit 1');

  process.exitCode = 0;
  await runVerifyArtifact({ args: [dir], options: { kind: 'bootstrap', json: true, suppressExitCode: true }, logger: makeLogger() });
  assert.equal(process.exitCode, 0, 'suppressExitCode must not mutate process.exitCode');

  process.exitCode = prev;
});

// ───────────────────────── project-context adapter (deterministic) ─────────────────────────

test('kind=project-context: missing file fails with a /setup hint', async () => {
  const dir = await tmp();
  const report = await runVerifyArtifact({
    args: [dir],
    options: { kind: 'project-context', json: true, suppressExitCode: true },
    logger: makeLogger()
  });
  assert.equal(report.ok, false);
  assert.ok(report.issues.some((i) => /not found|setup/i.test(i)), JSON.stringify(report.issues));
});

// ───────────────────────── genome adapter guards ─────────────────────────

test('kind=genome: missing --slug is a clear, actionable failure', async () => {
  const dir = await tmp();
  const report = await runVerifyArtifact({
    args: [dir],
    options: { kind: 'genome', json: true, suppressExitCode: true },
    logger: makeLogger()
  });
  assert.equal(report.ok, false);
  assert.ok(report.issues.some((i) => /--slug/.test(i)));
});

test('kind=genome: a slug with no genome on disk fails (not found)', async () => {
  const dir = await tmp();
  const report = await runVerifyArtifact({
    args: [dir],
    options: { kind: 'genome', slug: 'nobody-nowhere', json: true, suppressExitCode: true },
    logger: makeLogger()
  });
  assert.equal(report.ok, false);
  assert.ok(report.issues.some((i) => /not found/i.test(i)));
});

// ───────────────────────── unknown / missing kind ─────────────────────────

test('unknown kind → ok:false + the available-kinds list', async () => {
  const dir = await tmp();
  const report = await runVerifyArtifact({
    args: [dir],
    options: { kind: 'nonsense', json: true, suppressExitCode: true },
    logger: makeLogger()
  });
  assert.equal(report.ok, false);
  assert.equal(report.error, 'unknown_kind');
  assert.ok(Array.isArray(report.available) && report.available.includes('bootstrap'));
});

test('missing kind → ok:false missing_kind', async () => {
  const dir = await tmp();
  const report = await runVerifyArtifact({
    args: [dir],
    options: { json: true, suppressExitCode: true },
    logger: makeLogger()
  });
  assert.equal(report.ok, false);
  assert.equal(report.error, 'missing_kind');
});

// ───────────────────────── parser + registry ─────────────────────────

test('parser: --kind/--slug carry values; --advisory is boolean and keeps the path positional', () => {
  const r = parseArgv(['node', 'aioson', 'verify:artifact', '--kind=genome', '--slug=foo-bar', '--advisory', '.']);
  assert.equal(r.command, 'verify:artifact');
  assert.equal(r.options.kind, 'genome');
  assert.equal(r.options.slug, 'foo-bar');
  assert.equal(r.options.advisory, true);
  assert.deepEqual(r.args, ['.'], 'the "." path must remain a positional, not be swallowed by --advisory');
});

test('availableKinds lists adapters and rulesets', () => {
  const ks = availableKinds();
  assert.ok(ks.includes('project-context'));
  assert.ok(ks.includes('genome'));
  assert.ok(ks.includes('bootstrap'));
});
