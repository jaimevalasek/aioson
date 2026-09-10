'use strict';

// Evidence artifacts on disk — the regenerable by-products of the visual and
// browser gates. A consumer's prototype round left 37 stale failure pairs
// (22 MB) under a walkthrough report that read PASS 102/102, beside 34
// full-page captures (31 MB) no report referenced, all whitelisted into git.
// These tests hold the lifecycle: weighed, pruned, dropped at archive, ignored.

const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fsSync = require('node:fs');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const {
  scanEvidenceArtifacts,
  pruneEvidenceArtifacts,
  heavyEvidenceArtifacts,
  listDiagnosticDirs,
  dirStats,
  clearDir,
  formatBytes,
  HEAVY_BYTES
} = require('../src/lib/evidence-artifacts');
const { runEvidencePrune } = require('../src/commands/evidence-prune');
const { runHygieneScan } = require('../src/commands/hygiene-scan');
const { runFeatureArchive } = require('../src/commands/feature-archive');
const { policyRuleToRegExp, ensureProjectGitignorePolicy } = require('../src/installer');

const ROOT = path.resolve(__dirname, '..');
const BIN = path.join(ROOT, 'bin', 'aioson.js');

async function write(dir, rel, content) {
  const full = path.join(dir, rel);
  await fs.mkdir(path.dirname(full), { recursive: true });
  await fs.writeFile(full, content);
}

function silentLogger() {
  const lines = [];
  return { lines, log: (line = '') => lines.push(String(line)), error: (line = '') => lines.push(String(line)), warn: (line = '') => lines.push(String(line)) };
}

/** A project with one feature and one briefing, each carrying a referenced file and an orphan. */
async function seededProject() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'aioson-evidence-'));
  await fs.mkdir(path.join(dir, '.aioson', 'context'), { recursive: true });
  // Runtime captures: the evidence references a.png only.
  await write(dir, '.aioson/context/features/orders/visual-screenshots/a.png', 'aaaa');
  await write(dir, '.aioson/context/features/orders/visual-screenshots/b.png', 'bbbbbbbb');
  await write(dir, '.aioson/context/features/orders/visual-evidence.json', JSON.stringify({
    kind: 'visual',
    slug: 'orders',
    metrics: { runtime: { available: true, screenshots: ['.aioson/context/features/orders/visual-screenshots/a.png'] } }
  }));
  // Walkthrough artifacts: the report references the snapshot only; the
  // failure pair is from an earlier run.
  await write(dir, '.aioson/briefings/orders/browser/proto/proto-step-02-snapshot.aria.txt', '- main');
  await write(dir, '.aioson/briefings/orders/browser/proto/proto-step-01-failed.png', 'stale-png');
  await write(dir, '.aioson/briefings/orders/browser/proto/proto-step-01-failed.aria.txt', 'stale-aria');
  await write(dir, '.aioson/briefings/orders/browser/proto.json', JSON.stringify({
    schema: 1,
    name: 'proto',
    steps: [{ index: 2, artifacts: ['.aioson/briefings/orders/browser/proto/proto-step-02-snapshot.aria.txt'] }]
  }));
  await write(dir, '.aioson/briefings/orders/browser/proto.md', '# Browser walkthrough — proto\n');
  return dir;
}

test('the scan weighs every artifact folder and tells referenced files from orphans', async () => {
  const dir = await seededProject();
  const entries = scanEvidenceArtifacts(dir);
  assert.deepEqual(entries.map((e) => [e.owner, e.kind, e.path, e.files, e.referenced, e.orphans]), [
    ['feature:orders', 'runtime_screenshots', '.aioson/context/features/orders/visual-screenshots', 2, 1, 1],
    ['briefing:orders', 'walkthrough_artifacts', '.aioson/briefings/orders/browser/proto', 3, 1, 2]
  ]);
  assert.equal(entries[0].report, '.aioson/context/features/orders/visual-evidence.json');
  assert.equal(entries[1].report, '.aioson/briefings/orders/browser/proto.json');
  assert.equal(entries[0].bytes, 12);

  // A folder without any report is all orphans.
  await write(dir, '.aioson/context/features/pay/browser/smoke/smoke-step-01-failed.png', 'x');
  const noReport = scanEvidenceArtifacts(dir).find((e) => e.path.endsWith('browser/smoke'));
  assert.equal(noReport.report, null);
  assert.equal(noReport.orphans, 1);

  // Archived features are scanned too (done/{slug}/dossier and briefings).
  await write(dir, '.aioson/context/done/old/dossier/visual-screenshots/entry-desktop.png', 'z');
  await write(dir, '.aioson/context/done/old/briefings/browser/tour/tour-step-01-failed.png', 'z');
  const owners = scanEvidenceArtifacts(dir).map((e) => e.owner);
  assert.ok(owners.includes('done:old'));
  assert.equal(owners.filter((o) => o === 'done:old').length, 2);

  assert.deepEqual(dirStats(path.join(dir, 'nope')), { files: 0, bytes: 0 });
  assert.equal(formatBytes(HEAVY_BYTES), '1.0 MB');
  assert.equal(formatBytes(2048), '2 KB');
});

test('prune removes orphans by default, everything with --all, never a report; dry-run deletes nothing', async () => {
  const dir = await seededProject();

  const preview = pruneEvidenceArtifacts(dir, { dryRun: true });
  assert.equal(preview.total.files, 3);
  assert.equal(preview.total.bytes, 8 + 9 + 10);
  assert.ok(await fs.stat(path.join(dir, '.aioson/context/features/orders/visual-screenshots/b.png')), 'dry-run keeps the orphan');

  const slugOnly = pruneEvidenceArtifacts(dir, { slug: 'nobody', dryRun: true });
  assert.deepEqual(slugOnly.entries, []);

  const pruned = pruneEvidenceArtifacts(dir, {});
  assert.equal(pruned.total.files, 3);
  assert.deepEqual(pruned.entries.map((e) => [e.path, e.removed_files, e.kept_files]), [
    ['.aioson/context/features/orders/visual-screenshots', 1, 1],
    ['.aioson/briefings/orders/browser/proto', 2, 1]
  ]);
  assert.deepEqual((await fs.readdir(path.join(dir, '.aioson/context/features/orders/visual-screenshots'))).sort(), ['a.png']);
  assert.deepEqual((await fs.readdir(path.join(dir, '.aioson/briefings/orders/browser/proto'))).sort(), ['proto-step-02-snapshot.aria.txt']);

  const all = pruneEvidenceArtifacts(dir, { all: true });
  assert.equal(all.total.files, 2);
  await assert.rejects(fs.stat(path.join(dir, '.aioson/context/features/orders/visual-screenshots')), 'an emptied folder is removed');
  await assert.rejects(fs.stat(path.join(dir, '.aioson/briefings/orders/browser/proto')));
  assert.ok(await fs.stat(path.join(dir, '.aioson/briefings/orders/browser/proto.json')), 'the report survives --all');
  assert.ok(await fs.stat(path.join(dir, '.aioson/briefings/orders/browser/proto.md')));
  assert.ok(await fs.stat(path.join(dir, '.aioson/context/features/orders/visual-evidence.json')));
  assert.deepEqual(pruneEvidenceArtifacts(dir, {}).entries, [], 'nothing left to scan');
});

test('evidence:prune is an advisory command with a JSON contract and an exit code of 0 through the binary', async () => {
  const dir = await seededProject();
  const logger = silentLogger();
  const dry = await runEvidencePrune({ args: [dir], options: { 'dry-run': true }, logger });
  assert.equal(dry.ok, true);
  assert.equal(dry.exitCode, 0);
  assert.equal(dry.dryRun, true);
  assert.equal(dry.total.files, 3);
  assert.match(logger.lines[0], /^evidence:prune — would remove 3 file\(s\), 27 B \(orphans only\)$/);
  assert.match(logger.lines.join('\n'), /visual-screenshots: would remove 1\/2 file\(s\)/);
  assert.match(logger.lines.join('\n'), /kept: the files the latest report still references/);

  const cli = spawnSync(process.execPath, [BIN, 'evidence:prune', dir, '--slug=orders', '--json'], { encoding: 'utf8' });
  assert.equal(cli.status, 0, cli.stderr);
  const payload = JSON.parse(cli.stdout);
  assert.equal(payload.ok, true);
  assert.equal(payload.total.files, 3);
  assert.equal(payload.slug, 'orders');
  assert.ok(payload.hint.includes('Replay'));
  assert.deepEqual((await fs.readdir(path.join(dir, '.aioson/context/features/orders/visual-screenshots'))).sort(), ['a.png']);

  const help = spawnSync(process.execPath, [BIN, 'evidence:prune', dir, '--help', '--json'], { encoding: 'utf8' });
  assert.equal(help.status, 0, help.stderr);
  assert.match(JSON.parse(help.stdout).usage, /^aioson evidence:prune/);
});

test('hygiene:scan lists orphaned or heavy artifact folders with the prune as the suggested command', async () => {
  const dir = await seededProject();
  await write(dir, '.aioson/context/features.md', '# Features\n\n| slug | status | started | completed |\n|------|--------|---------|-----------|\n');
  const before = await runHygieneScan({ args: [dir], options: { json: true }, logger: silentLogger() });
  assert.equal(before.buckets.heavy_evidence_artifacts.length, 2);
  const [captures, walkthrough] = before.buckets.heavy_evidence_artifacts;
  assert.equal(captures.path, '.aioson/context/features/orders/visual-screenshots');
  assert.match(captures.reason, /1 of 2 file\(s\) are not referenced by the latest report/);
  assert.equal(captures.suggested_command, 'aioson evidence:prune . --dry-run --slug=orders');
  assert.match(walkthrough.reason, /2 of 3 file\(s\)/);
  assert.equal(before.summary.counts.heavy_evidence_artifacts, 2);

  pruneEvidenceArtifacts(dir, {});
  const after = await runHygieneScan({ args: [dir], options: { json: true }, logger: silentLogger() });
  assert.deepEqual(after.buckets.heavy_evidence_artifacts, [], 'referenced, light folders are not noise');

  // Weight alone earns a line even when every file is referenced.
  await write(dir, '.aioson/context/features/orders/visual-screenshots/a.png', Buffer.alloc(HEAVY_BYTES, 1));
  const heavy = heavyEvidenceArtifacts(dir);
  assert.equal(heavy.length, 1);
  assert.match(heavy[0].reason, /^1\.0 MB of regenerable captures$/);
});

test('feature:archive drops the regenerable diagnostics and archives the reports; --keep-diagnostics carries them', async () => {
  for (const keep of [false, true]) {
    const dir = await seededProject();
    await write(dir, '.aioson/context/features.md', [
      '# Features', '',
      '| slug | status | started | completed |',
      '|------|--------|---------|-----------|',
      '| orders | done | 2026-06-01 | 2026-06-02 |', ''
    ].join('\n'));
    await write(dir, '.aioson/context/prd-orders.md', '## Vision\nOrders.\n');
    await write(dir, '.aioson/briefings/orders/briefings.md', '# Briefing\n');

    const dry = await runFeatureArchive({ args: [dir], options: { feature: 'orders', 'dry-run': true, json: true, ...(keep ? { 'keep-diagnostics': true } : {}) }, logger: silentLogger() });
    assert.equal(dry.ok, true);
    assert.deepEqual(dry.diagnostics.map((d) => [d.owner, d.kind, d.files]), keep ? [] : [
      ['dossier', 'runtime_screenshots', 2],
      ['briefings', 'walkthrough_artifacts', 3]
    ]);
    assert.ok(await fs.stat(path.join(dir, '.aioson/briefings/orders/browser/proto/proto-step-01-failed.png')), 'dry-run drops nothing');

    const logger = silentLogger();
    const result = await runFeatureArchive({ args: [dir], options: { feature: 'orders', ...(keep ? { 'keep-diagnostics': true } : {}) }, logger });
    assert.equal(result.ok, true, JSON.stringify(result.errors));
    const archive = path.join(dir, '.aioson/context/done/orders');
    assert.ok(await fs.stat(path.join(archive, 'dossier', 'visual-evidence.json')), 'the evidence report is archived');
    assert.ok(await fs.stat(path.join(archive, 'briefings', 'browser', 'proto.json')), 'the walkthrough report is archived');
    const shots = await fs.stat(path.join(archive, 'dossier', 'visual-screenshots')).then(() => true, () => false);
    const walk = await fs.stat(path.join(archive, 'briefings', 'browser', 'proto')).then(() => true, () => false);
    if (keep) {
      assert.equal(shots && walk, true, '--keep-diagnostics archives the binaries');
      assert.equal(result.diagnostics_dropped, undefined);
    } else {
      assert.equal(shots || walk, false, 'the binaries never reach done/');
      assert.deepEqual(result.diagnostics_dropped.map((d) => [d.owner, d.files]), [['dossier', 2], ['briefings', 3]]);
      assert.match(logger.lines.join('\n'), /dropped 5 regenerable diagnostic file\(s\)/);
    }
  }
});

// Every path the producers write (ignored) beside the paths a slug literally
// named `browser` or `visual-screenshots` owns (tracked). A mid-path `**`
// rule ignored `.aioson/context/done/browser/dossier/prd.md` whole.
const IGNORED_EVIDENCE = [
  '.aioson/context/features/orders/visual-screenshots/a.png',
  '.aioson/context/visual-screenshots/a.png',
  '.aioson/context/done/old/dossier/visual-screenshots/entry-desktop.png',
  '.aioson/context/done/old/briefings/visual-screenshots/entry-desktop.png',
  '.aioson/briefings/orders/visual-screenshots/a.png',
  '.aioson/context/browser/smoke/smoke-step-01-failed.png',
  '.aioson/context/features/orders/browser/smoke/smoke-step-01-failed.aria.txt',
  '.aioson/context/done/old/dossier/browser/proto/proto-step-01-failed.png',
  '.aioson/context/done/old/briefings/browser/tour/tour-step-01-failed.png',
  '.aioson/briefings/orders/browser/proto/proto-step-01-failed.png',
  '.aioson/context/features/browser/browser/tour/tour-step-01-failed.png'
];
const TRACKED_PROJECT_FILES = [
  '.aioson/briefings/orders/browser/proto.json',
  '.aioson/context/features/orders/visual-evidence.json',
  '.aioson/briefings/orders/prototype.html',
  '.aioson/context/done/browser/dossier/prd.md',
  '.aioson/context/features/browser/decisions/adr-1.md',
  '.aioson/context/features/browser/browser/tour.json',
  '.aioson/briefings/browser/sources/notes.md',
  '.aioson/context/features/visual-screenshots/prd.md',
  '.aioson/context/done/visual-screenshots/dossier/prd.md'
];

test('the installer gitignore policy keeps the binaries out and the reports in, in git itself when available', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'aioson-evidence-git-'));
  await ensureProjectGitignorePolicy(dir);
  const written = (await fs.readFile(path.join(dir, '.gitignore'), 'utf8')).split('\n');
  const evidenceRules = written.filter((line) => /visual-screenshots\/|browser\/\*\//.test(line) && !line.startsWith('#'));
  // The tracked-but-ignored remedy reads the same rules through the regex.
  const byRegex = (rel) => evidenceRules.some((rule) => policyRuleToRegExp(rule).test(rel));
  for (const rel of TRACKED_PROJECT_FILES) assert.equal(byRegex(rel), false, `regex keeps ${rel}`);
  for (const rel of IGNORED_EVIDENCE) assert.equal(byRegex(rel), true, `regex ignores ${rel}`);
  assert.equal(evidenceRules.length, 10);
  assert.equal(evidenceRules.some((rule) => rule.includes('**')), false, 'no evidence rule spans any depth');

  const git = spawnSync('git', ['--version'], { encoding: 'utf8' });
  if (git.status !== 0) return; // no git on this machine — the regex half is the proof
  assert.equal(spawnSync('git', ['init', '-q'], { cwd: dir, encoding: 'utf8' }).status, 0);
  const check = (rel) => spawnSync('git', ['check-ignore', '-q', rel], { cwd: dir, encoding: 'utf8' }).status;
  for (const rel of IGNORED_EVIDENCE) assert.equal(check(rel), 0, `git ignores ${rel}`);
  assert.equal(check('aios-qa-screenshots/H-01.png'), 0);
  for (const rel of TRACKED_PROJECT_FILES) assert.equal(check(rel), 1, `git keeps ${rel}`);
});

test('an update swaps the retired 1.65.0 evidence lines for the anchored rules in place, once', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'aioson-evidence-retire-'));
  // A consumer .gitignore as 1.65.0 wrote it: the whole policy block with
  // the three broad evidence lines, saved with CRLF, between project rules.
  await ensureProjectGitignorePolicy(dir);
  const policy = (await fs.readFile(path.join(dir, '.gitignore'), 'utf8')).split('\n').filter(Boolean);
  const isEvidenceRule = (line) => /visual-screenshots\/|browser\/\*\//.test(line) && !line.startsWith('#');
  policy.splice(policy.findIndex(isEvidenceRule), policy.filter(isEvidenceRule).length,
    '.aioson/context/**/visual-screenshots/', '.aioson/context/**/browser/*/', '.aioson/briefings/**/browser/*/');
  const legacy = ['node_modules/', ...policy, 'my-project-rule/', ''].join('\r\n');
  await fs.writeFile(path.join(dir, '.gitignore'), legacy, 'utf8');
  const written = await ensureProjectGitignorePolicy(dir);
  const lines = (await fs.readFile(path.join(dir, '.gitignore'), 'utf8')).split('\n').map((line) => line.replace(/\r$/, ''));
  assert.equal(lines.some((line) => line.includes('**/')), false, 'the broad lines are gone');
  assert.ok(written >= 10, `the anchored rules count as written (${written})`);
  const header = lines.indexOf('# AIOSON — regenerable browser evidence (captures and walkthrough snapshots; the reports beside them stay tracked)');
  assert.equal(lines[header + 1], '.aioson/context/visual-screenshots/', 'the replacement sits where the retired lines stood');
  assert.equal(lines[header + 11], 'aios-qa-screenshots/');
  assert.equal(lines.indexOf('my-project-rule/') > header, true, 'the project\'s own lines keep their place');
  assert.equal(lines.filter((line) => line === '.aioson/context/features/*/browser/*/').length, 1);
  assert.equal(await ensureProjectGitignorePolicy(dir), 0, 'a second update writes nothing');

  const git = spawnSync('git', ['--version'], { encoding: 'utf8' });
  if (git.status !== 0) return;
  assert.equal(spawnSync('git', ['init', '-q'], { cwd: dir, encoding: 'utf8' }).status, 0);
  const check = (rel) => spawnSync('git', ['check-ignore', '-q', rel], { cwd: dir, encoding: 'utf8' }).status;
  assert.equal(check('.aioson/context/done/browser/dossier/prd.md'), 1, 'a slug named browser is tracked again after the update');
  assert.equal(check('.aioson/context/features/orders/browser/smoke/smoke-step-01-failed.png'), 0);
});

test('prune never deletes a report: a folder under browser/ is an artifact folder only beside its report', async () => {
  const dir = await seededProject();
  // A walkthrough persisted with --out inside browser/: its own reports.
  await write(dir, '.aioson/context/features/orders/browser/round-2/tour.json', '{"schema":1,"name":"tour","steps":[]}');
  await write(dir, '.aioson/context/features/orders/browser/round-2/tour.md', '# Browser walkthrough — tour\n');
  await write(dir, '.aioson/context/features/orders/browser/round-2/tour/tour-step-01-failed.png', 'png');
  // A run that died before its report still leaves a prunable folder.
  await write(dir, '.aioson/context/features/orders/browser/crashed/crashed-step-01-failed.png', 'png');
  const paths = scanEvidenceArtifacts(dir).map((entry) => entry.path);
  assert.equal(paths.includes('.aioson/context/features/orders/browser/round-2'), false);
  assert.equal(paths.includes('.aioson/context/features/orders/browser/crashed'), true);
  assert.equal(listDiagnosticDirs(path.join(dir, '.aioson/context/features/orders')).some((d) => d.dir.endsWith('round-2')), false, 'feature:archive never drops it either');

  pruneEvidenceArtifacts(dir, {});
  pruneEvidenceArtifacts(dir, { all: true });
  for (const rel of ['tour.json', 'tour.md', 'tour/tour-step-01-failed.png']) {
    assert.ok(await fs.stat(path.join(dir, '.aioson/context/features/orders/browser/round-2', rel)), `${rel} survives`);
  }
  await assert.rejects(fs.stat(path.join(dir, '.aioson/context/features/orders/browser/crashed')));
});

test('prune never follows a link: a junction to a folder outside the project is not an artifact folder', async () => {
  const dir = await seededProject();
  const outside = await fs.mkdtemp(path.join(os.tmpdir(), 'aioson-evidence-outside-'));
  await write(outside, 'keep.png', 'mine');
  const shots = path.join(dir, '.aioson/context/features/orders/visual-screenshots');
  await fs.rm(shots, { recursive: true, force: true });
  fsSync.symlinkSync(outside, shots, 'junction');
  // An owner tree reached through a link: `.aioson/briefings` itself.
  const sharedBriefings = await fs.mkdtemp(path.join(os.tmpdir(), 'aioson-evidence-briefings-'));
  await write(sharedBriefings, 'orders/browser/tour/tour-step-01-failed.png', 'theirs');
  await write(sharedBriefings, 'orders/browser/tour.json', '{"schema":1,"name":"tour","steps":[]}');
  await fs.rm(path.join(dir, '.aioson/briefings'), { recursive: true, force: true });
  fsSync.symlinkSync(sharedBriefings, path.join(dir, '.aioson/briefings'), 'junction');

  assert.deepEqual(scanEvidenceArtifacts(dir), [], 'nothing reached through a link is scanned');
  pruneEvidenceArtifacts(dir, { all: true });
  assert.equal(await fs.readFile(path.join(outside, 'keep.png'), 'utf8'), 'mine');
  assert.equal(await fs.readFile(path.join(sharedBriefings, 'orders/browser/tour/tour-step-01-failed.png'), 'utf8'), 'theirs');
});

test('feature:archive drops the diagnostics on the reconcile path too, and the dry run lists them', async () => {
  const dir = await seededProject();
  await write(dir, '.aioson/context/features.md', [
    '# Features', '',
    '| slug | status | started | completed |',
    '|------|--------|---------|-----------|',
    '| orders | done | 2026-06-01 | 2026-06-02 |', ''
  ].join('\n'));
  await write(dir, '.aioson/context/prd-orders.md', '## Vision\nOrders.\n');
  await write(dir, '.aioson/briefings/orders/briefings.md', '# Briefing\n');
  // An earlier close already archived part of the feature: both folders
  // are reconciled file by file instead of moved whole.
  await write(dir, '.aioson/context/done/orders/dossier/decisions.md', '# Decisions\n');
  await write(dir, '.aioson/context/done/orders/briefings/briefings.md', '# Briefing\n');

  const dry = await runFeatureArchive({ args: [dir], options: { feature: 'orders', 'dry-run': true, json: true }, logger: silentLogger() });
  assert.deepEqual(dry.dirs.filter((d) => d.label === 'dossier' || d.label === 'briefings').map((d) => d.action), ['skip', 'skip']);
  assert.deepEqual(dry.diagnostics.map((d) => [d.owner, d.kind, d.files]), [
    ['dossier', 'runtime_screenshots', 2],
    ['briefings', 'walkthrough_artifacts', 3]
  ], 'the preview names what the reconcile drops');

  const result = await runFeatureArchive({ args: [dir], options: { feature: 'orders' }, logger: silentLogger() });
  assert.equal(result.ok, true, JSON.stringify(result.errors));
  const archive = path.join(dir, '.aioson/context/done/orders');
  assert.ok(await fs.stat(path.join(archive, 'dossier', 'visual-evidence.json')), 'the evidence report is merged');
  assert.ok(await fs.stat(path.join(archive, 'briefings', 'browser', 'proto.json')), 'the walkthrough report is merged');
  await assert.rejects(fs.stat(path.join(archive, 'dossier', 'visual-screenshots')), 'the captures never reach done/');
  await assert.rejects(fs.stat(path.join(archive, 'briefings', 'browser', 'proto')), 'the snapshots never reach done/');
  assert.deepEqual(result.diagnostics_dropped.map((d) => [d.owner, d.files]), [['dossier', 2], ['briefings', 3]]);
});

test('listDiagnosticDirs and clearDir are the producers\' primitives', async () => {
  const dir = await seededProject();
  const owned = path.join(dir, '.aioson', 'briefings', 'orders');
  const dirs = listDiagnosticDirs(owned);
  assert.deepEqual(dirs.map((d) => [d.kind, path.basename(d.dir)]), [['walkthrough_artifacts', 'proto']]);
  const removed = clearDir(dirs[0].dir);
  assert.deepEqual(removed, { files: 3, bytes: 25 });
  await assert.rejects(fs.stat(dirs[0].dir));
  assert.deepEqual(clearDir(dirs[0].dir), { files: 0, bytes: 0 }, 'clearing a missing folder is a no-op');
});

test('clearDir never throws: a file the OS refuses to delete comes back as what stayed', async (t) => {
  const dir = await seededProject();
  const shots = path.join(dir, '.aioson/context/features/orders/visual-screenshots');
  const realRm = fsSync.rmSync;
  t.mock.method(fsSync, 'rmSync', (target, options) => {
    const error = new Error(`EPERM: operation not permitted, unlink '${target}'`);
    error.code = 'EPERM';
    if (path.resolve(String(target)).startsWith(shots)) throw error;
    return realRm(target, options);
  });
  const result = clearDir(shots);
  assert.deepEqual(result, { files: 0, bytes: 0, kept: 2, code: 'EPERM', error: `EPERM: operation not permitted, unlink '${shots}'` });
});
