'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const fsSync = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const REPO_ROOT = path.resolve(__dirname, '..');
const BIN = path.join(REPO_ROOT, 'bin', 'aioson.js');

function runCli(args, cwd) {
  const result = spawnSync(process.execPath, [BIN, ...args], {
    cwd: cwd || REPO_ROOT,
    encoding: 'utf8',
    env: { ...process.env, NO_COLOR: '1' }
  });
  return {
    code: result.status,
    stdout: result.stdout,
    stderr: result.stderr
  };
}

function parseStdoutJson(stdout) {
  // Commands print JSON via logger.log; parser is forgiving — find first { ... }.
  const match = stdout.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try { return JSON.parse(match[0]); } catch { return null; }
}

async function makeProject() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'aioson-scout-cli-'));
  // Seed a few files for scope resolution to find.
  await fs.mkdir(path.join(dir, 'src'), { recursive: true });
  await fs.writeFile(path.join(dir, 'src', 'one.js'), '// one\n', 'utf8');
  await fs.writeFile(path.join(dir, 'src', 'two.js'), '// two\n', 'utf8');
  return dir;
}

const validExcerpt = 'User asked why workflow:next inherits stale completion records when transitioning between features. Need file-level evidence on the persisted state read path.';

function prepArgs(overrides = {}) {
  const base = {
    '--question': '"Where does workflow-next.js read completion state?"',
    '--scope-paths': 'src/one.js,src/two.js',
    '--parent-agent': 'deyvin',
    '--parent-session-id': `sess-${Math.random().toString(16).slice(2, 8)}`,
    '--parent-session-excerpt': `"${validExcerpt}"`
  };
  Object.assign(base, overrides);
  // Convert to flat array of argv tokens with =value form.
  // --json triggers cli.js exit-code propagation (see cli.js:1401-1408).
  const flat = ['scout:prep', '.', '--json'];
  for (const [k, v] of Object.entries(base)) {
    if (v === null || v === undefined) continue;
    flat.push(`${k}=${stripQuotes(v)}`);
  }
  return flat;
}

function stripQuotes(s) {
  if (typeof s !== 'string') return s;
  return s.replace(/^"|"$/g, '');
}

// ---------------------------------------------------------------------------
// C1 — scout:prep contract
// ---------------------------------------------------------------------------

test('C1 — scout:prep returns valid JSON with required fields on stdout (exit 0)', async () => {
  const dir = await makeProject();
  const r = runCli(prepArgs(), dir);
  assert.equal(r.code, 0, `stderr: ${r.stderr}\nstdout: ${r.stdout}`);
  const parsed = parseStdoutJson(r.stdout);
  assert.ok(parsed, `failed to parse JSON from stdout: ${r.stdout}`);
  assert.ok(typeof parsed.id === 'string' && parsed.id.startsWith('scout-'));
  assert.ok(typeof parsed.prompt === 'string' && parsed.prompt.length > 200);
  assert.ok(typeof parsed.output_path === 'string' && parsed.output_path.includes('scouts/'));
  assert.equal(typeof parsed.cap_remaining, 'number');
});

test('C1 — scout:prep with missing --question returns exit 2 input_invalid', async () => {
  const dir = await makeProject();
  const args = prepArgs();
  // Remove the --question= entry
  const filtered = args.filter((t) => !t.startsWith('--question='));
  const r = runCli(filtered, dir);
  assert.equal(r.code, 2, `stderr: ${r.stderr}\nstdout: ${r.stdout}`);
  const parsed = parseStdoutJson(r.stdout);
  assert.ok(parsed && parsed.error, `expected {error}, got ${r.stdout}`);
  assert.equal(parsed.error.code, 'input_invalid');
});

// ---------------------------------------------------------------------------
// C2 — unknown parent_agent
// ---------------------------------------------------------------------------

test('C2 — scout:prep with parent_agent=qa rejected', async () => {
  const dir = await makeProject();
  const r = runCli(prepArgs({ '--parent-agent': 'qa' }), dir);
  assert.equal(r.code, 2);
  const parsed = parseStdoutJson(r.stdout);
  assert.equal(parsed.error.code, 'input_invalid');
  assert.ok(parsed.error.details.some((e) => e.field === 'parent_agent'));
});

// ---------------------------------------------------------------------------
// C3 — cap exceeded after 3 sequential preps
// ---------------------------------------------------------------------------

test('C3 — 4 sequential preps with same parent-session-id → 4th returns cap_exceeded', async () => {
  const dir = await makeProject();
  const sid = 'sess-cap-test';
  for (let i = 0; i < 3; i++) {
    const r = runCli(prepArgs({ '--parent-session-id': sid }), dir);
    assert.equal(r.code, 0, `prep #${i + 1} should succeed: ${r.stderr}`);
  }
  const r4 = runCli(prepArgs({ '--parent-session-id': sid }), dir);
  assert.equal(r4.code, 2);
  const parsed = parseStdoutJson(r4.stdout);
  assert.equal(parsed.error.code, 'cap_exceeded');
});

// ---------------------------------------------------------------------------
// C4 — scope_too_large with override unblock
// ---------------------------------------------------------------------------

test('C4 — scope > max_files_in_scope rejected; --max-files-in-scope override unblocks', async () => {
  const dir = await makeProject();
  // Create 25 files in src/ — will resolve via directory enumeration.
  for (let i = 0; i < 25; i++) {
    await fs.writeFile(path.join(dir, 'src', `f${i}.js`), `// ${i}\n`, 'utf8');
  }
  const r1 = runCli(prepArgs({ '--scope-paths': 'src' }), dir);
  assert.equal(r1.code, 2, `expected scope_too_large, got: ${r1.stdout}`);
  const p1 = parseStdoutJson(r1.stdout);
  assert.equal(p1.error.code, 'scope_too_large');

  const r2 = runCli(prepArgs({ '--scope-paths': 'src', '--max-files-in-scope': '50' }), dir);
  assert.equal(r2.code, 0, `expected success with override: ${r2.stderr}`);
});

// ---------------------------------------------------------------------------
// C5 — scout:validate happy path + missing required field
// ---------------------------------------------------------------------------

test('C5 — scout:validate on valid JSON exit 0; missing parent_session_excerpt exit 2', async () => {
  const dir = await makeProject();
  const validReport = {
    schema_version: 1,
    id: 'scout-2026-05-13-aaa111',
    parent_agent: 'deyvin',
    parent_session_id: 'sess-c5',
    parent_session_excerpt: validExcerpt,
    question: 'Where does X happen and why does Y break?',
    scope: { paths: ['src/one.js'], globs: [], exclude: [], files_resolved: ['src/one.js'] },
    completed_at: '2026-05-13T14:32:11.123Z',
    status: 'success',
    confidence: 'high',
    recommendation: 'Add a transition guard at the persisted-state read path to discard cross-feature state.',
    findings: [],
    files_inspected: ['src/one.js']
  };
  const validPath = path.join(dir, 'valid.json');
  await fs.writeFile(validPath, JSON.stringify(validReport), 'utf8');
  const r1 = runCli(['scout:validate', '.', '--json', `--input=${validPath}`], dir);
  assert.equal(r1.code, 0, `expected exit 0: ${r1.stdout} ${r1.stderr}`);

  const invalid = { ...validReport };
  delete invalid.parent_session_excerpt;
  const invalidPath = path.join(dir, 'invalid.json');
  await fs.writeFile(invalidPath, JSON.stringify(invalid), 'utf8');
  const r2 = runCli(['scout:validate', '.', '--json', `--input=${invalidPath}`], dir);
  assert.equal(r2.code, 2);
  const p2 = parseStdoutJson(r2.stdout);
  assert.equal(p2.error.code, 'schema_invalid');
  assert.ok(
    (p2.error.details || []).some((e) => e.field === 'parent_session_excerpt' && e.reason === 'required'),
    `expected parent_session_excerpt required: ${JSON.stringify(p2.error.details)}`
  );
});

// ---------------------------------------------------------------------------
// C6 — retry_exhausted after 2 validate failures (max_retries = 1 default)
// ---------------------------------------------------------------------------

test('C6 — 2nd validate failure for same scout id returns retry_exhausted', async () => {
  const dir = await makeProject();
  const invalid = {
    schema_version: 1,
    id: 'scout-2026-05-13-c6test',
    parent_agent: 'deyvin',
    parent_session_id: 'sess-c6',
    // parent_session_excerpt deliberately too short to fail validation
    parent_session_excerpt: 'too short',
    question: 'Where does X happen and why does Y break?',
    scope: { paths: ['src/one.js'], globs: [], exclude: [], files_resolved: ['src/one.js'] },
    completed_at: '2026-05-13T14:32:11.123Z',
    status: 'success',
    confidence: 'high',
    recommendation: 'Add a transition guard at the persisted-state read path to discard cross-feature state.',
    findings: [],
    files_inspected: ['src/one.js']
  };
  const p = path.join(dir, 'invalid.json');
  await fs.writeFile(p, JSON.stringify(invalid), 'utf8');

  const r1 = runCli(['scout:validate', '.', '--json', `--input=${p}`], dir);
  assert.equal(r1.code, 2);
  const p1 = parseStdoutJson(r1.stdout);
  assert.equal(p1.error.code, 'schema_invalid');

  const r2 = runCli(['scout:validate', '.', '--json', `--input=${p}`], dir);
  assert.equal(r2.code, 2);
  const p2 = parseStdoutJson(r2.stdout);
  assert.equal(p2.error.code, 'retry_exhausted', `expected retry_exhausted, got: ${JSON.stringify(p2)}`);
});

// ---------------------------------------------------------------------------
// C7 — scout:commit persists + telemetry + idempotent re-commit
// ---------------------------------------------------------------------------

test('C7 — scout:commit writes file, idempotent on re-commit', async () => {
  const dir = await makeProject();
  // Establish session with a prep so cap counter exists.
  const prepRes = runCli(prepArgs({ '--parent-session-id': 'sess-c7' }), dir);
  assert.equal(prepRes.code, 0);
  const prepParsed = parseStdoutJson(prepRes.stdout);
  const scoutId = prepParsed.id;

  const report = {
    schema_version: 1,
    id: scoutId,
    parent_agent: 'deyvin',
    parent_session_id: 'sess-c7',
    parent_session_excerpt: validExcerpt,
    question: 'Where does X happen and why does Y break?',
    scope: { paths: ['src/one.js'], globs: [], exclude: [], files_resolved: ['src/one.js'] },
    completed_at: '2026-05-13T14:32:11.123Z',
    status: 'success',
    confidence: 'high',
    recommendation: 'Add a transition guard at the persisted-state read path to discard cross-feature state.',
    findings: [],
    files_inspected: ['src/one.js']
  };
  const reportPath = path.join(dir, 'report.json');
  await fs.writeFile(reportPath, JSON.stringify(report), 'utf8');

  const r1 = runCli(['scout:commit', '.', '--json', `--input=${reportPath}`], dir);
  assert.equal(r1.code, 0, `expected exit 0: ${r1.stdout}\n${r1.stderr}`);
  const p1 = parseStdoutJson(r1.stdout);
  assert.equal(p1.committed, true);
  const persisted = path.join(dir, '.aioson', 'runtime', 'scouts', `${scoutId}.json`);
  assert.ok(fsSync.existsSync(persisted), `persisted file missing: ${persisted}`);

  const r2 = runCli(['scout:commit', '.', '--json', `--input=${reportPath}`], dir);
  assert.equal(r2.code, 0);
  const p2 = parseStdoutJson(r2.stdout);
  assert.equal(p2.committed, false);
  // C-01 fix: reason renamed from 'already_exists' (file-existence proxy) to
  // 'already_committed' (true id-tracking via state.committed_ids). The
  // first interpretation incorrectly fired on the documented happy path
  // where the sub-agent writes to output_path before scout:commit runs.
  assert.equal(p2.reason, 'already_committed');
});

// ---------------------------------------------------------------------------
// C8 — config override + unknown key rejection
// ---------------------------------------------------------------------------

test('C8 — config override raises cap; unknown key rejected', async () => {
  const dir = await makeProject();
  await fs.mkdir(path.join(dir, '.aioson', 'config'), { recursive: true });
  await fs.writeFile(
    path.join(dir, '.aioson', 'config', 'scout-engine.json'),
    JSON.stringify({ max_scouts_per_session: 5 }),
    'utf8'
  );
  const sid = 'sess-c8';
  for (let i = 0; i < 5; i++) {
    const r = runCli(prepArgs({ '--parent-session-id': sid }), dir);
    assert.equal(r.code, 0, `prep #${i + 1} should succeed under raised cap: ${r.stderr}`);
  }
  const r6 = runCli(prepArgs({ '--parent-session-id': sid }), dir);
  assert.equal(r6.code, 2);
  const p6 = parseStdoutJson(r6.stdout);
  assert.equal(p6.error.code, 'cap_exceeded');

  // Unknown-key rejection on a separate fixture.
  const dir2 = await makeProject();
  await fs.mkdir(path.join(dir2, '.aioson', 'config'), { recursive: true });
  await fs.writeFile(
    path.join(dir2, '.aioson', 'config', 'scout-engine.json'),
    JSON.stringify({ max_foo: 1 }),
    'utf8'
  );
  const rUnknown = runCli(prepArgs(), dir2);
  assert.equal(rUnknown.code, 2);
  const pUnknown = parseStdoutJson(rUnknown.stdout);
  assert.equal(pUnknown.error.code, 'config_invalid');
});

// ---------------------------------------------------------------------------
// V1 limitation — scope_globs deferred
// ---------------------------------------------------------------------------

test('scope_globs deferred V1 — non-empty --scope-globs returns globs_not_implemented_v1', async () => {
  const dir = await makeProject();
  const r = runCli(prepArgs({ '--scope-globs': 'src/**/*.js' }), dir);
  assert.equal(r.code, 2);
  const p = parseStdoutJson(r.stdout);
  assert.equal(p.error.code, 'globs_not_implemented_v1');
});
