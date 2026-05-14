'use strict';

// QA Gate D findings — bugs discovered during hands-on wiring audit.
// These tests EXPOSE the bugs (initially RED). They must turn GREEN after
// the corrections plan is applied. See:
// `.aioson/plans/deyvin-subtask-scout/corrections-2026-05-13.md`
//
// All three bugs share a root cause family: the documented happy path
// (sub-agent writes to output_path returned by scout:prep, then parent runs
// scout:commit) does not actually wire end-to-end through the implementation.

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
  return { code: result.status, stdout: result.stdout, stderr: result.stderr };
}

function parseStdoutJson(stdout) {
  const match = stdout.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try { return JSON.parse(match[0]); } catch { return null; }
}

async function makeProject() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'aioson-qa-findings-'));
  await fs.mkdir(path.join(dir, 'src'), { recursive: true });
  await fs.writeFile(path.join(dir, 'src', 'one.js'), '// one\n', 'utf8');
  await fs.writeFile(path.join(dir, 'src', 'two.js'), '// two\n', 'utf8');
  return dir;
}

const validExcerpt = 'QA wiring audit verifying that scout:prep, scout:commit, and feature:close archival actually wire end-to-end through the implementation.';

function prepArgs(overrides = {}) {
  const base = {
    '--question': 'Where does scout state get persisted?',
    '--scope-paths': 'src/one.js,src/two.js',
    '--parent-agent': 'deyvin',
    '--parent-session-id': overrides['--parent-session-id'] || `sess-${Math.random().toString(16).slice(2, 8)}`,
    '--parent-session-excerpt': validExcerpt
  };
  Object.assign(base, overrides);
  const flat = ['scout:prep', '.', '--json'];
  for (const [k, v] of Object.entries(base)) {
    if (v == null) continue;
    flat.push(`${k}=${v}`);
  }
  return flat;
}

function makeReport(id, sessionId, slug) {
  return {
    schema_version: 1,
    id,
    parent_agent: 'deyvin',
    parent_session_id: sessionId,
    parent_session_excerpt: validExcerpt,
    feature_slug: slug,
    question: 'Where does scout state get persisted?',
    scope: { paths: ['src/one.js'], globs: [], exclude: [], files_resolved: ['src/one.js'] },
    completed_at: '2026-05-14T10:00:00.000Z',
    status: 'success',
    confidence: 'high',
    recommendation: 'Scout state persists at .aioson/runtime/scouts/.state.json with PID+ISO file lock from sub-task-state.js.',
    findings: [],
    files_inspected: ['src/one.js']
  };
}

// ---------------------------------------------------------------------------
// FINDING C-01 — scout:commit short-circuits when sub-agent wrote to
// output_path (the documented happy path), so cap counter never decrements
// and `action=committed` telemetry never fires.
//
// The deyvin.md invocation block tells the sub-agent: "Write the JSON to:
// {output_path}" where output_path == .aioson/runtime/scouts/{id}.json (the
// final commit destination). When scout:commit then runs, fs.existsSync()
// returns true and the command returns {committed:false, reason:'already_exists'}
// WITHOUT decrementing the cap or emitting telemetry.
//
// Result: in real usage, cap_exceeded after 3 scouts even though the user
// "committed" all of them.
// ---------------------------------------------------------------------------

test('C-01 — scout:commit must succeed (committed:true) when sub-agent wrote to output_path', async () => {
  const dir = await makeProject();
  const sid = 'sess-c01';
  const prepRes = runCli(prepArgs({ '--parent-session-id': sid }), dir);
  assert.equal(prepRes.code, 0, `prep failed: ${prepRes.stderr || prepRes.stdout}`);
  const prep = parseStdoutJson(prepRes.stdout);

  // Simulate sub-agent writing the report to output_path (the documented flow)
  const targetPath = path.join(dir, prep.output_path);
  await fs.mkdir(path.dirname(targetPath), { recursive: true });
  await fs.writeFile(targetPath, JSON.stringify(makeReport(prep.id, sid, 'foo')), 'utf8');

  // Commit with input == output_path (the documented call)
  const commitRes = runCli(['scout:commit', '.', '--json', `--input=${targetPath}`], dir);
  const commit = parseStdoutJson(commitRes.stdout);
  assert.equal(commit.committed, true, `expected committed:true on first commit (sub-agent already wrote at output_path); got ${JSON.stringify(commit)}`);
});

test('C-01 — cap counter must decrement after commit, allowing the next prep to succeed', async () => {
  const dir = await makeProject();
  const sid = 'sess-c01-cap';
  // Run 3 prep+commit cycles. Cap default = 3. With proper decrement, a 4th
  // prep should succeed (because each commit freed the slot). With the bug,
  // the 4th hits cap_exceeded.
  for (let i = 0; i < 3; i++) {
    const prepRes = runCli(prepArgs({ '--parent-session-id': sid }), dir);
    assert.equal(prepRes.code, 0, `prep ${i + 1} failed`);
    const prep = parseStdoutJson(prepRes.stdout);
    const targetPath = path.join(dir, prep.output_path);
    await fs.mkdir(path.dirname(targetPath), { recursive: true });
    await fs.writeFile(targetPath, JSON.stringify(makeReport(prep.id, sid, 'foo')), 'utf8');
    const commitRes = runCli(['scout:commit', '.', '--json', `--input=${targetPath}`], dir);
    assert.equal(commitRes.code, 0, `commit ${i + 1} returned non-zero`);
  }
  // Fourth prep should succeed if commit decrements properly
  const r4 = runCli(prepArgs({ '--parent-session-id': sid }), dir);
  assert.equal(r4.code, 0, `4th prep should succeed after 3 successful commits, but got cap_exceeded: ${r4.stdout}`);
});

// ---------------------------------------------------------------------------
// FINDING C-02 — scout telemetry events land in agent_events with
// `event_type='start'` (not `'sub_task'`) and `payload_json=null` because
// `logAgentEvent` is a session-lifecycle helper that creates a fresh run
// for each first-time agent invocation.
//
// `collectScoutSummary` queries `WHERE event_type='sub_task'` and reads
// `payload_json.action` — both conditions fail, so the count is always 0.
//
// Result: `aioson memory:summary` always shows "Scouts dispatched: 0" even
// after legitimate scout activity. The cold-load comprehension promise
// (memory:summary surfaces scout layer to future agents) is broken.
// ---------------------------------------------------------------------------

test('C-02 — memory:summary must show Scouts dispatched > 0 after a successful scout commit', async () => {
  const dir = await makeProject();
  const sid = 'sess-c02';
  const prepRes = runCli(prepArgs({ '--parent-session-id': sid }), dir);
  const prep = parseStdoutJson(prepRes.stdout);
  const targetPath = path.join(dir, prep.output_path);
  await fs.mkdir(path.dirname(targetPath), { recursive: true });
  await fs.writeFile(targetPath, JSON.stringify(makeReport(prep.id, sid, 'foo')), 'utf8');
  // Use a different input path so commit's idempotency check doesn't short-circuit
  // (workaround for C-01 in this isolated test of C-02). Once C-01 is fixed,
  // this workaround becomes unnecessary but the test still validates C-02.
  const altInputPath = path.join(dir, 'report-copy.json');
  await fs.copyFile(targetPath, altInputPath);
  await fs.unlink(targetPath); // ensure commit actually writes
  const commitRes = runCli(['scout:commit', '.', '--json', `--input=${altInputPath}`], dir);
  assert.equal(commitRes.code, 0, `commit failed: ${commitRes.stdout}`);
  const commit = parseStdoutJson(commitRes.stdout);
  assert.equal(commit.committed, true, 'commit should have written the file');

  const summaryRes = runCli(['memory:summary', '.'], dir);
  assert.match(
    summaryRes.stdout,
    /Scouts dispatched: 1/,
    `expected "Scouts dispatched: 1" after one committed scout; got summary:\n${summaryRes.stdout}`
  );
});

// ---------------------------------------------------------------------------
// FINDING L-01 — Path traversal in --scope-paths
//
// `resolveScope` calls `path.resolve(rootDir, p)` without verifying the
// result stays under rootDir. A malicious or careless caller can pass
// `--scope-paths="../../etc/passwd"` and the sub-agent prompt will include
// an absolute path pointing outside the project. Severity is LOW because
// the scout dispatcher runs locally with the developer's permissions (no
// privilege escalation), but it violates the principle of least surprise
// and could leak unintended files into the sub-agent's context.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// FINDING M-01 — feature-close archival event lands as event_type='start'
// (corrected by emitSubTaskEvent helper bypassing logAgentEvent's session
// lifecycle for one-shot agents)
// ---------------------------------------------------------------------------

test('M-01 — feature:close emits archived_on_close as event_type=sub_task (countable by memory:summary)', async () => {
  const dir = await makeProject();
  const sid = 'sess-m01';
  // Prep + write report + commit so we have an archivable scout
  const prepRes = runCli(prepArgs({ '--parent-session-id': sid, '--feature-slug': 'm01-feature' }), dir);
  const prep = parseStdoutJson(prepRes.stdout);
  const targetPath = path.join(dir, prep.output_path);
  await fs.mkdir(path.dirname(targetPath), { recursive: true });
  const report = makeReport(prep.id, sid, 'm01-feature');
  await fs.writeFile(targetPath, JSON.stringify(report), 'utf8');
  const commitRes = runCli(['scout:commit', '.', '--json', `--input=${targetPath}`], dir);
  assert.equal(commitRes.code, 0, `commit failed: ${commitRes.stderr || commitRes.stdout}`);

  // Setup feature artifacts so feature:close has something to act on
  await fs.mkdir(path.join(dir, '.aioson', 'context'), { recursive: true });
  await fs.writeFile(path.join(dir, '.aioson', 'context', 'features.md'),
    '# Features\n\n| slug | status | started | completed |\n|------|--------|---------|-----------|\n| m01-feature | in_progress | 2026-05-13 | — |\n', 'utf8');
  await fs.writeFile(path.join(dir, '.aioson', 'context', 'spec-m01-feature.md'),
    '---\nfeature: m01-feature\nstatus: in_progress\n---\n# Spec\n', 'utf8');
  await fs.writeFile(path.join(dir, '.aioson', 'context', 'prd-m01-feature.md'),
    '---\nslug: m01-feature\n---\n# PRD\n', 'utf8');

  // Pre-close memory:summary count (commit already fired sub_task)
  const summaryBefore = runCli(['memory:summary', '.'], dir);
  const beforeMatch = summaryBefore.stdout.match(/Scouts dispatched: (\d+)/);
  assert.ok(beforeMatch, `pre-close summary missing scouts row: ${summaryBefore.stdout}`);
  const beforeCount = Number(beforeMatch[1]);

  const closeRes = runCli(['feature:close', '.', '--json', '--feature=m01-feature', '--verdict=PASS', '--no-archive'], dir);
  assert.equal(closeRes.code, 0, `feature:close failed: ${closeRes.stderr || closeRes.stdout}`);
  const close = parseStdoutJson(closeRes.stdout);
  assert.ok(close.scoutArchive && close.scoutArchive.archived.length === 1,
    `expected 1 archived scout, got: ${JSON.stringify(close.scoutArchive)}`);

  // Post-close memory:summary count must have grown by 1 (the archived_on_close event)
  const summaryAfter = runCli(['memory:summary', '.'], dir);
  const afterMatch = summaryAfter.stdout.match(/Scouts dispatched: (\d+)/);
  assert.ok(afterMatch, `post-close summary missing scouts row`);
  const afterCount = Number(afterMatch[1]);
  assert.equal(
    afterCount,
    beforeCount + 1,
    `archival did not contribute to memory:summary count (before=${beforeCount}, after=${afterCount}). ` +
    `Indicates feature-close archival event still lands as event_type='start' instead of 'sub_task'.`
  );
});

test('L-01 — scout:prep with --scope-paths containing ../ should reject (path traversal)', async () => {
  const dir = await makeProject();
  // Create a sentinel file outside the project
  const outsideDir = await fs.mkdtemp(path.join(os.tmpdir(), 'aioson-outside-'));
  await fs.writeFile(path.join(outsideDir, 'leak.txt'), 'should not appear', 'utf8');
  const relativeEscape = path.relative(dir, path.join(outsideDir, 'leak.txt')).replace(/\\/g, '/');
  const r = runCli(prepArgs({ '--scope-paths': relativeEscape }), dir);
  // Current behavior: succeeds and includes the outside file in scope.
  // Expected behavior: rejects with input_invalid + path_outside_root or scope_too_large after sandbox check.
  // This test will fail with current code; documents the gap for the corrections plan.
  if (r.code === 0) {
    const out = parseStdoutJson(r.stdout);
    const hasEscape = (out.files_resolved || []).some((p) => p.includes('..') || path.isAbsolute(p));
    if (hasEscape) {
      assert.fail(`scout:prep accepted a path-traversal scope and resolved files outside the project root: ${JSON.stringify(out.files_resolved)}`);
    }
    // If the resolved set is empty (because file doesn't actually exist relative to project), that's fine.
    return;
  }
  // Acceptable: rejected with a meaningful error code
  const parsed = parseStdoutJson(r.stdout);
  assert.ok(
    parsed && parsed.error && /path|traversal|outside|invalid/.test(parsed.error.code),
    `expected path-traversal rejection, got: ${JSON.stringify(parsed)}`
  );
});
