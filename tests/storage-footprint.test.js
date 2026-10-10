'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const { backupAiosonDocs } = require('../src/backup-local');
const {
  SNAPSHOT_KEEP,
  ROLLBACK_KEEP,
  LOG_CAP_BYTES,
  HEAVY_PATH_BYTES,
  measureStorage,
  projectSnapshotsDir,
  stampedDirs
} = require('../src/lib/storage-footprint');
const { runStorageTriage } = require('../src/commands/storage-triage');
const { runHygieneScan } = require('../src/commands/hygiene-scan');
const { runDoctor } = require('../src/doctor');
const { installTemplate } = require('../src/installer');
const { withIndex } = require('../src/context-search');

const MB = 1024 * 1024;
const RM = { recursive: true, force: true, maxRetries: 10, retryDelay: 50 };
const OLD = new Date(Date.now() - 3 * 86400000);

let scratch;
let previousBackups;

test.beforeEach(() => {
  scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'aioson-storage-'));
  previousBackups = process.env.AIOSON_BACKUPS_DIR;
  // A store this test owns: the default would be the developer's ~/.aioson.
  process.env.AIOSON_BACKUPS_DIR = path.join(scratch, 'home-backups');
});

test.afterEach(() => {
  if (previousBackups === undefined) delete process.env.AIOSON_BACKUPS_DIR;
  else process.env.AIOSON_BACKUPS_DIR = previousBackups;
  fs.rmSync(scratch, RM);
});

function write(root, rel, content = 'x') {
  const file = path.join(root, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
  return file;
}

// A file of `bytes` logical size without writing them (sparse where the filesystem allows).
function sized(root, rel, bytes, { old = true } = {}) {
  const file = write(root, rel, '');
  fs.truncateSync(file, bytes);
  if (old) fs.utimesSync(file, OLD, OLD);
  return file;
}

function stamp(i) {
  return `2026-0${1 + Math.floor(i / 28)}-${String(1 + (i % 28)).padStart(2, '0')}T10-00-00`;
}

function project(name = 'proj') {
  const dir = path.join(scratch, name);
  write(dir, '.aioson/context/project.context.md', '---\nproject_name: proj\n---\n');
  return dir;
}

function seedSnapshots(dir, count) {
  const root = projectSnapshotsDir(dir);
  for (let i = 0; i < count; i += 1) write(root, `${stamp(i)}/context/prd.md`, `old ${i}`);
  return root;
}

function seedRollback(dir, count) {
  for (let i = 0; i < count; i += 1) write(dir, `.aioson/backups/${stamp(i)}.000Z/.aioson/agents/dev.md`, `v${i}`);
}

// Every kind the measurement knows, at real sizes. `db: false` leaves out the
// stand-in runtime database (zeros, which commands that open it reject).
function fullFixture({ db = true } = {}) {
  const dir = project();
  seedSnapshots(dir, SNAPSHOT_KEEP + 2);
  seedRollback(dir, ROLLBACK_KEEP + 2);
  write(dir, '.aioson/backups/features-registry/features-1.md', 'registry backup');
  sized(dir, '.aioson/backups/manual-copy/chrome.dll', HEAVY_PATH_BYTES + MB);
  sized(dir, '.aioson/runtime/scratch-db/data.bin', HEAVY_PATH_BYTES + MB);
  sized(dir, '.aioson/runtime/live/session-1/events.bin', HEAVY_PATH_BYTES + MB);
  if (db) sized(dir, '.aioson/runtime/aios.sqlite', HEAVY_PATH_BYTES + MB);
  sized(dir, 'researchs/raw-spike/weights.bin', HEAVY_PATH_BYTES + MB);
  sized(dir, '.aioson/runtime/still-writing.log', LOG_CAP_BYTES + MB, { old: false });
  const log = sized(dir, '.aioson/context/execution-checkpoints/f/run/verify-attempt2.log', LOG_CAP_BYTES + MB, { old: false });
  const fd = fs.openSync(log, 'r+');
  fs.writeSync(fd, 'HEAD-LINE what ran\n', 0);
  const tail = '\nTAIL-LINE how it ended\nFINAL_EXIT_CODE=1\n';
  fs.writeSync(fd, tail, LOG_CAP_BYTES + MB - Buffer.byteLength(tail));
  fs.closeSync(fd);
  fs.utimesSync(log, OLD, OLD);
  return { dir, log };
}

function byKind(report, kind) {
  return report.findings.filter((item) => item.kind === kind);
}

test('a doc snapshot leaves closed-feature archives out, skips an unchanged tree, and keeps the newest ones', async () => {
  const dir = project();
  write(dir, '.aioson/context/prd-checkout.md', '# PRD');
  write(dir, '.aioson/context/features/checkout/requirements.md', '# Req');
  write(dir, '.aioson/context/done/old-feature/prd-old-feature.md', '# archived');
  write(dir, '.aioson/context/abandoned/dropped/prd-dropped.md', '# abandoned');
  write(dir, '.aioson/plans/checkout/plan.md', '# plan');
  const root = seedSnapshots(dir, SNAPSHOT_KEEP + 2);
  write(root, 'not-a-snapshot/keep.md', 'foreign');

  const first = await backupAiosonDocs(dir);
  assert.equal(first.ok, true);
  assert.equal(first.count, 4, 'context + features + plans; done/ and abandoned/ are archives');
  assert.equal(fs.existsSync(path.join(first.backupPath, 'context', 'done')), false);
  assert.equal(fs.existsSync(path.join(first.backupPath, 'context', 'abandoned')), false);
  assert.equal(fs.existsSync(path.join(first.backupPath, 'context', 'features', 'checkout', 'requirements.md')), true);
  assert.equal(stampedDirs(root).length, SNAPSHOT_KEEP, 'older snapshots are removed past the retention');
  assert.equal(stampedDirs(root)[0], path.basename(first.backupPath), 'the new snapshot is the newest kept');
  assert.equal(first.pruned, 3);
  assert.equal(fs.existsSync(path.join(root, 'not-a-snapshot', 'keep.md')), true, 'a folder that is not a timestamp is never touched');

  const second = await backupAiosonDocs(dir);
  assert.equal(second.unchanged, true, 'nothing changed since the last snapshot');
  assert.equal(second.count, 0);
  assert.equal(stampedDirs(root).length, SNAPSHOT_KEEP);
});

test('a project under the OS temp folder is never snapshotted into the default ~/.aioson store', () => {
  const fakeHome = path.join(scratch, 'fake-home');
  const tempRoot = path.join(scratch, 'fake-temp');
  const dir = path.join(tempRoot, 'fixture-project');
  write(dir, '.aioson/context/prd.md', '# PRD');
  const env = { ...process.env, USERPROFILE: fakeHome, HOME: fakeHome, TEMP: tempRoot, TMP: tempRoot, TMPDIR: tempRoot };
  delete env.AIOSON_BACKUPS_DIR;
  const script = `require(${JSON.stringify(path.resolve(__dirname, '..', 'src', 'backup-local.js'))}).backupAiosonDocs(${JSON.stringify(dir)}).then((r) => process.stdout.write(JSON.stringify(r)))`;
  const run = spawnSync(process.execPath, ['-e', script], { env, encoding: 'utf8' });
  assert.equal(run.status, 0, run.stderr);
  assert.equal(JSON.parse(run.stdout).skipped, 'ephemeral_project');
  assert.equal(fs.existsSync(path.join(fakeHome, '.aioson', 'backups')), false);
});

test('the measurement classifies every kind and decides who acts', () => {
  const { dir } = fullFixture();
  const report = measureStorage(dir);

  const [snapshots] = byKind(report, 'doc_snapshots');
  assert.equal(snapshots.decides, 'auto');
  assert.equal(snapshots.count, 2);
  assert.ok(snapshots.bytes > 0);
  const [rollback] = byKind(report, 'rollback_backups');
  assert.equal(rollback.decides, 'auto');
  assert.equal(rollback.count, 2);
  assert.equal(rollback.path, '.aioson/backups');

  const logs = byKind(report, 'oversized_log');
  assert.deepEqual(logs.map((item) => item.path), ['.aioson/context/execution-checkpoints/f/run/verify-attempt2.log'], 'a log still being written is left alone');

  const heavy = byKind(report, 'heavy_path');
  assert.deepEqual(heavy.map((item) => item.path).sort(), [
    '.aioson/backups/manual-copy',
    '.aioson/runtime/scratch-db',
    'researchs/raw-spike'
  ], 'live sessions and the runtime database belong to their own procedures');
  assert.ok(heavy.every((item) => item.decides === 'owner'));
  assert.match(heavy.find((item) => item.path === 'researchs/raw-spike').command, /storage:triage \. --remove=researchs\/raw-spike$/);
  assert.equal(report.summary.auto, 3);
  assert.equal(report.summary.owner, 3);
  assert.equal(report.summary.status, 'attention');
  assert.ok(report.footprint.runtime_db_bytes > HEAVY_PATH_BYTES);
});

test('storage:triage reads by default and refuses a path its report did not list', async () => {
  const { dir } = fullFixture();
  const snapshotsBefore = stampedDirs(projectSnapshotsDir(dir)).length;

  const report = await runStorageTriage({ args: [dir], options: { json: true } });
  assert.equal(report.readonly, true);
  assert.equal(stampedDirs(projectSnapshotsDir(dir)).length, snapshotsBefore);

  const refused = await runStorageTriage({ args: [dir], options: { json: true, apply: true, remove: '.aioson/runtime/scratch-db,.aioson/context' } });
  assert.equal(refused.ok, false);
  assert.equal(refused.exitCode, 1);
  assert.equal(refused.refusals.length, 1);
  assert.equal(stampedDirs(projectSnapshotsDir(dir)).length, snapshotsBefore, 'one refusal and nothing changes');
  assert.equal(fs.existsSync(path.join(dir, '.aioson', 'runtime', 'scratch-db')), true);

  const preview = await runStorageTriage({ args: [dir], options: { json: true, apply: true, 'dry-run': true } });
  assert.equal(preview.dryRun, true);
  assert.equal(preview.plan.apply.length, 3);
  assert.equal(stampedDirs(projectSnapshotsDir(dir)).length, snapshotsBefore);
});

test('storage:triage --apply enforces retention and trims logs; owner paths go only when named', async () => {
  const { dir, log } = fullFixture();
  const outside = write(scratch, 'outside/keep.txt', 'never reached through a link');
  // A junction named like the oldest rollback folder, pointing outside the project.
  fs.symlinkSync(path.dirname(outside), path.join(dir, '.aioson', 'backups', '2020-01-01T00-00-00.000Z'), 'junction');

  const applied = await runStorageTriage({ args: [dir], options: { json: true, apply: true } });
  assert.equal(applied.ok, true, JSON.stringify(applied.steps));
  assert.equal(stampedDirs(projectSnapshotsDir(dir)).length, SNAPSHOT_KEEP);
  const rollbackLeft = fs.readdirSync(path.join(dir, '.aioson', 'backups')).filter((name) => /^\d{4}-/.test(name) && name !== '2020-01-01T00-00-00.000Z');
  assert.equal(rollbackLeft.length, ROLLBACK_KEEP);
  assert.equal(fs.existsSync(outside), true, 'a link is never followed');
  assert.equal(fs.existsSync(path.join(dir, '.aioson', 'backups', 'features-registry', 'features-1.md')), true);

  const trimmed = fs.readFileSync(log, 'utf8');
  assert.ok(Buffer.byteLength(trimmed) < 400 * 1024, `trimmed to ${Buffer.byteLength(trimmed)} bytes`);
  assert.match(trimmed, /^HEAD-LINE what ran\n/);
  assert.match(trimmed, /cut from the middle of this log; head and tail kept/);
  assert.match(trimmed, /TAIL-LINE how it ended\nFINAL_EXIT_CODE=1\n$/);
  assert.ok(applied.freed_bytes > LOG_CAP_BYTES);

  for (const kept of ['.aioson/backups/manual-copy', '.aioson/runtime/scratch-db', 'researchs/raw-spike']) {
    assert.equal(fs.existsSync(path.join(dir, kept)), true, `${kept} is the owner's call`);
  }
  const removed = await runStorageTriage({ args: [dir], options: { json: true, remove: '.aioson/runtime/scratch-db' } });
  assert.equal(removed.ok, true);
  assert.equal(fs.existsSync(path.join(dir, '.aioson', 'runtime', 'scratch-db')), false);
  assert.equal(fs.existsSync(path.join(dir, 'researchs', 'raw-spike')), true);
  assert.equal(removed.after.auto, 0);
  assert.equal(removed.after.owner, 2);
});

test('hygiene:scan lists the disk footprint and drops a heavy path the owner retained', async () => {
  const { dir } = fullFixture({ db: false });
  const before = await runHygieneScan({ args: [dir], options: { json: true } });
  const paths = before.buckets.disk_footprint.map((item) => item.path);
  assert.ok(paths.includes('researchs/raw-spike'));
  assert.ok(paths.includes('.aioson/backups'));
  assert.ok(before.buckets.disk_footprint.every((item) => /storage:triage .* --dry-run$/.test(item.suggested_command)));

  write(dir, '.aioson/context/hygiene-retention.md', [
    '| path | disposition | reason | reviewed |',
    '|------|-------------|--------|----------|',
    '| researchs/raw-spike | retained | still comparing the raw captures | 2026-10-09 |',
    ''
  ].join('\n'));
  const after = await runHygieneScan({ args: [dir], options: { json: true } });
  assert.equal(after.buckets.disk_footprint.some((item) => item.path === 'researchs/raw-spike'), false);
  assert.ok(after.buckets.disk_footprint.some((item) => item.path === '.aioson/backups'), 'retention never hides mechanical work');
});

test('doctor warns when retention is past due and stays silent on a clean project', async () => {
  const clean = project('clean');
  const quiet = await runDoctor(clean);
  assert.equal(quiet.checks.some((check) => check.id === 'runtime:disk_footprint'), false);

  const dir = project('busy');
  seedSnapshots(dir, SNAPSHOT_KEEP + 4);
  seedRollback(dir, ROLLBACK_KEEP + 1);
  const report = await runDoctor(dir);
  const check = report.checks.find((item) => item.id === 'runtime:disk_footprint');
  assert.ok(check, 'disk footprint advisory present');
  assert.equal(check.severity, 'warning');
  assert.deepEqual(check.params, { snapshots: 4, rollback: 1, logs: 0 });
});

test('an update keeps only the newest rollback folders', async () => {
  const dir = project('updated');
  seedRollback(dir, ROLLBACK_KEEP + 3);
  await installTemplate(dir, { mode: 'update' });
  const left = stampedDirs(path.join(dir, '.aioson', 'backups'));
  assert.ok(left.length <= ROLLBACK_KEEP, `${left.length} rollback folders left`);
  assert.equal(left.includes(`${stamp(0)}.000Z`), false, 'the oldest go first');
});

test('a suite run keeps fixtures and machine-wide stores inside its own temp root', { skip: !process.env.AIOSON_TEST_TMP_ROOT && 'run through npm test' }, () => {
  const root = process.env.AIOSON_TEST_TMP_ROOT;
  assert.match(path.basename(root), /^aioson-t-\d+$/);
  assert.ok(scratch.startsWith(root), `${scratch} lives inside ${root}`);
  assert.ok(process.env.AIOSON_SEARCH_DIR.startsWith(root), 'the old shared recall folder a run may retire is its own');
});

test('a project\'s own recall index counts as runtime data, never as a heavy path', () => {
  const dir = project('recall');
  sized(dir, '.aioson/runtime/context-search.sqlite', HEAVY_PATH_BYTES + MB);
  sized(dir, '.aioson/runtime/context-search.sqlite-wal', MB);
  const report = measureStorage(dir);
  assert.equal(byKind(report, 'heavy_path').length, 0);
  assert.equal(report.footprint.recall_index_bytes, HEAVY_PATH_BYTES + 2 * MB);
});

function withSearchDir(dir, fn) {
  const previous = process.env.AIOSON_SEARCH_DIR;
  process.env.AIOSON_SEARCH_DIR = dir;
  return Promise.resolve().then(fn).finally(() => {
    if (previous === undefined) delete process.env.AIOSON_SEARCH_DIR;
    else process.env.AIOSON_SEARCH_DIR = previous;
  });
}

function seedLegacyRecall(dir) {
  sized(dir, 'context-search.sqlite', 3 * MB);
  sized(dir, 'context-search.sqlite-wal', MB);
  sized(dir, 'context-search.sqlite.bak-2026-01-01', HEAVY_PATH_BYTES + MB);
}

test('storage:triage --global retires the old shared recall index; a file beside it stays the owner\'s call', async () => {
  const dir = project('global');
  const legacy = path.join(scratch, 'old-search');
  seedLegacyRecall(legacy);
  await withSearchDir(legacy, async () => {
    const report = measureStorage(dir, { global: true });
    const [index] = byKind(report, 'legacy_recall_index');
    assert.equal(index.decides, 'auto');
    assert.equal(index.files, 2);
    assert.equal(index.bytes, 4 * MB);
    assert.match(index.command, /storage:triage \. --global --apply$/);
    const strays = byKind(report, 'heavy_path').filter((item) => item.origin === 'recall');
    assert.deepEqual(strays.map((item) => path.basename(item.path)), ['context-search.sqlite.bak-2026-01-01']);
    assert.equal(byKind(measureStorage(dir), 'legacy_recall_index').length, 0, 'a project measurement stays in the project');

    const applied = await runStorageTriage({ args: [dir], options: { json: true, global: true, apply: true } });
    assert.equal(applied.ok, true, JSON.stringify(applied.steps));
  });
  assert.deepEqual(fs.readdirSync(legacy), ['context-search.sqlite.bak-2026-01-01'], 'only the owner removes what aioson did not write');
});

test('opening a project\'s recall index retires the old shared one; a fixture never reaches the default store', async () => {
  const legacy = path.join(scratch, 'old-search');
  seedLegacyRecall(legacy);
  const dir = project('recall-owner');
  await withSearchDir(legacy, () => withIndex((idx) => idx.indexDirectory(dir), { projectDir: dir }));
  assert.deepEqual(fs.readdirSync(legacy), ['context-search.sqlite.bak-2026-01-01']);
  assert.equal(fs.existsSync(path.join(dir, '.aioson', 'runtime', 'context-search.sqlite')), true);

  const fakeHome = path.join(scratch, 'fake-home');
  const tempRoot = path.join(scratch, 'fake-temp');
  const fixture = path.join(tempRoot, 'fixture-project');
  write(fixture, '.aioson/context/project.context.md', '---\nproject_name: fixture\n---\n');
  write(fakeHome, '.aioson/search/context-search.sqlite', 'the operator store');
  const env = { ...process.env, USERPROFILE: fakeHome, HOME: fakeHome, TEMP: tempRoot, TMP: tempRoot, TMPDIR: tempRoot };
  delete env.AIOSON_SEARCH_DIR;
  const modulePath = JSON.stringify(path.resolve(__dirname, '..', 'src', 'context-search.js'));
  const script = `require(${modulePath}).withIndex((idx) => idx.indexDirectory(${JSON.stringify(fixture)}), { projectDir: ${JSON.stringify(fixture)} }).then(() => process.stdout.write('done'))`;
  const run = spawnSync(process.execPath, ['-e', script], { env, encoding: 'utf8' });
  assert.equal(run.status, 0, run.stderr);
  assert.equal(fs.existsSync(path.join(fakeHome, '.aioson', 'search', 'context-search.sqlite')), true);
});
