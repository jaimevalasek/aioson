'use strict';

/**
 * Tests for F1 — stale dev-state interactive detection (workflow-handoff-integrity v1.9.7).
 *
 * Covers AC-F1-01..08 from .aioson/plans/workflow-handoff-integrity/plan-f1-stale-devstate-interactive.md.
 * Targets exported helpers:
 *   - readDevState (parseError flag — AC-F1-08)
 *   - detectStaleDevState (sync baseline with parseError handling)
 *   - detectStaleDevStateRich (async features-aware + TTL)
 *   - runStateReset (state:reset command)
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const {
  readDevState,
  detectStaleDevState,
  detectStaleDevStateRich,
  parseFeaturesMap
} = require('../src/preflight-engine');
const { runStateReset } = require('../src/commands/state-save');

async function makeTempProject() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'aioson-f1-'));
  await fs.mkdir(path.join(dir, '.aioson', 'context'), { recursive: true });
  return dir;
}

async function writeDevState(dir, frontmatter, body = '# Dev State\n') {
  const filePath = path.join(dir, '.aioson', 'context', 'dev-state.md');
  const fmLines = Object.entries(frontmatter).map(([k, v]) => `${k}: ${v}`).join('\n');
  await fs.writeFile(filePath, `---\n${fmLines}\n---\n${body}`);
  return filePath;
}

async function writeFeaturesMd(dir, rows) {
  const lines = [
    '# Features',
    '',
    '| slug | status | started | completed |',
    '|------|--------|---------|-----------|',
    ...rows.map(({ slug, status, started = '2026-01-01', completed = '—' }) => `| ${slug} | ${status} | ${started} | ${completed} |`)
  ];
  const filePath = path.join(dir, '.aioson', 'context', 'features.md');
  await fs.writeFile(filePath, lines.join('\n') + '\n');
}

function makeLogger() {
  const logs = [];
  return { log: (msg) => logs.push(msg), logs };
}

// ─── readDevState ────────────────────────────────────────────────────────────

test('AC-F1-08 readDevState flags parseError when content has no frontmatter markers', async () => {
  const dir = await makeTempProject();
  const filePath = path.join(dir, '.aioson', 'context', 'dev-state.md');
  await fs.writeFile(filePath, 'just plain text with no frontmatter\n');
  const devState = await readDevState(dir);
  assert.equal(devState.exists, true);
  assert.equal(devState.parseError, true);
});

test('AC-F1-08 readDevState flags parseError when content has empty frontmatter', async () => {
  const dir = await makeTempProject();
  const filePath = path.join(dir, '.aioson', 'context', 'dev-state.md');
  await fs.writeFile(filePath, '---\n---\n# body only\n');
  const devState = await readDevState(dir);
  assert.equal(devState.exists, true);
  assert.equal(devState.parseError, true);
});

test('readDevState does not flag parseError when frontmatter is valid', async () => {
  const dir = await makeTempProject();
  await writeDevState(dir, { active_feature: 'demo', status: 'in_progress' });
  const devState = await readDevState(dir);
  assert.equal(devState.parseError, false);
  assert.equal(devState.active_feature, 'demo');
});

test('readDevState returns exists:false when file is absent', async () => {
  const dir = await makeTempProject();
  const devState = await readDevState(dir);
  assert.equal(devState.exists, false);
});

// ─── detectStaleDevState (sync baseline) ─────────────────────────────────────

test('AC-F1-08 detectStaleDevState returns warning when parseError is set', () => {
  const warning = detectStaleDevState({ exists: true, parseError: true }, null);
  assert.ok(warning);
  assert.match(warning, /corrupt/);
  assert.match(warning, /aioson state:reset/);
});

test('detectStaleDevState returns warning when status=done', () => {
  const warning = detectStaleDevState({ exists: true, parseError: false, status: 'done', active_feature: 'old' }, null);
  assert.match(warning, /marked done/);
});

test('detectStaleDevState returns warning when active_feature differs from slug', () => {
  const warning = detectStaleDevState(
    { exists: true, parseError: false, active_feature: 'old', status: 'in_progress' },
    'new'
  );
  assert.match(warning, /belongs to feature "old", not "new"/);
});

test('detectStaleDevState returns null when state is current', () => {
  const warning = detectStaleDevState(
    { exists: true, parseError: false, active_feature: 'demo', status: 'in_progress' },
    'demo'
  );
  assert.equal(warning, null);
});

// ─── detectStaleDevStateRich (features.md + TTL) ─────────────────────────────

test('AC-F1-05 (a) rich detection: feature marked done in features.md → stale + command suggestion', async () => {
  const dir = await makeTempProject();
  await writeDevState(dir, {
    active_feature: 'shipped-feature',
    status: 'in_progress',
    last_updated: new Date().toISOString().slice(0, 10)
  });
  await writeFeaturesMd(dir, [
    { slug: 'shipped-feature', status: 'done', completed: '2026-05-15' },
    { slug: 'current-feature', status: 'in_progress' }
  ]);
  const devState = await readDevState(dir);
  const warning = await detectStaleDevStateRich(devState, 'shipped-feature', dir);
  assert.ok(warning);
  assert.match(warning, /already marked `done`/);
  assert.match(warning, /aioson state:reset/);
});

test('AC-F1-05 (a) rich detection: feature marked abandoned in features.md → stale', async () => {
  const dir = await makeTempProject();
  await writeDevState(dir, { active_feature: 'killed', status: 'in_progress' });
  await writeFeaturesMd(dir, [{ slug: 'killed', status: 'abandoned' }]);
  const devState = await readDevState(dir);
  const warning = await detectStaleDevStateRich(devState, 'killed', dir);
  assert.match(warning, /already marked `abandoned`/);
});

test('AC-F1-05 (b) rich detection: feature absent from features.md → orphan warning', async () => {
  const dir = await makeTempProject();
  await writeDevState(dir, { active_feature: 'orphan-feature', status: 'in_progress' });
  await writeFeaturesMd(dir, [
    { slug: 'real-feature', status: 'in_progress' }
  ]);
  const devState = await readDevState(dir);
  const warning = await detectStaleDevStateRich(devState, null, dir);
  assert.ok(warning);
  assert.match(warning, /not present in features\.md/);
  assert.match(warning, /orphan/);
});

test('AC-F1-05 (c) rich detection: last_updated > 30 days → TTL warning', async () => {
  const dir = await makeTempProject();
  const sixtyDaysAgo = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  await writeDevState(dir, {
    active_feature: 'demo',
    status: 'in_progress',
    last_updated: sixtyDaysAgo
  });
  await writeFeaturesMd(dir, [{ slug: 'demo', status: 'in_progress' }]);
  const devState = await readDevState(dir);
  const warning = await detectStaleDevStateRich(devState, 'demo', dir);
  assert.ok(warning);
  assert.match(warning, /days old/);
});

test('rich detection: current state + within 30d + active in features.md → no warning', async () => {
  const dir = await makeTempProject();
  await writeDevState(dir, {
    active_feature: 'demo',
    status: 'in_progress',
    last_updated: new Date().toISOString().slice(0, 10)
  });
  await writeFeaturesMd(dir, [{ slug: 'demo', status: 'in_progress' }]);
  const devState = await readDevState(dir);
  const warning = await detectStaleDevStateRich(devState, 'demo', dir);
  assert.equal(warning, null);
});

test('rich detection: features.md absent → falls back to sync baseline only (no orphan false-positive)', async () => {
  const dir = await makeTempProject();
  await writeDevState(dir, { active_feature: 'demo', status: 'in_progress' });
  const devState = await readDevState(dir);
  const warning = await detectStaleDevStateRich(devState, 'demo', dir);
  assert.equal(warning, null);
});

// ─── parseFeaturesMap ────────────────────────────────────────────────────────

test('parseFeaturesMap extracts slug→status from table rows', () => {
  const content = `# Features

| slug | status | started | completed |
|------|--------|---------|-----------|
| feat-a | done | 2026-01-01 | 2026-01-10 |
| feat-b | in_progress | 2026-02-01 | — |
| feat-c | abandoned | 2026-03-01 | — |
`;
  const map = parseFeaturesMap(content);
  assert.equal(map.size, 3);
  assert.equal(map.get('feat-a'), 'done');
  assert.equal(map.get('feat-b'), 'in_progress');
  assert.equal(map.get('feat-c'), 'abandoned');
});

test('parseFeaturesMap skips header and separator rows', () => {
  const content = `| slug | status | started | completed |
|------|--------|---------|-----------|
| feat | done | x | y |
`;
  const map = parseFeaturesMap(content);
  assert.equal(map.size, 1);
  assert.ok(map.has('feat'));
  assert.ok(!map.has('slug'));
});

// ─── runStateReset ───────────────────────────────────────────────────────────

test('AC-F1-03 state:reset removes dev-state.md', async () => {
  const dir = await makeTempProject();
  await writeDevState(dir, { active_feature: 'demo', status: 'in_progress' });
  const logger = makeLogger();
  const result = await runStateReset({ args: [dir], options: {}, logger });
  assert.equal(result.ok, true);
  assert.equal(result.removed, true);
  assert.equal(result.archived, null);
  await assert.rejects(() => fs.access(path.join(dir, '.aioson', 'context', 'dev-state.md')));
});

test('AC-F1-03 state:reset idempotent: no-op when file absent', async () => {
  const dir = await makeTempProject();
  const logger = makeLogger();
  const result = await runStateReset({ args: [dir], options: {}, logger });
  assert.equal(result.ok, true);
  assert.equal(result.removed, false);
  assert.equal(result.reason, 'no_state_file');
});

test('state:reset --archive moves file to runtime/devstate-history/', async () => {
  const dir = await makeTempProject();
  await writeDevState(dir, { active_feature: 'demo', status: 'in_progress' });
  const result = await runStateReset({ args: [dir], options: { archive: true }, logger: makeLogger() });
  assert.equal(result.ok, true);
  assert.equal(result.removed, true);
  assert.ok(result.archived);
  assert.match(result.archived, /devstate-history/);
  await assert.rejects(() => fs.access(path.join(dir, '.aioson', 'context', 'dev-state.md')));
  await fs.access(path.join(dir, result.archived));
});

test('state:reset --json returns structured result without prose', async () => {
  const dir = await makeTempProject();
  await writeDevState(dir, { active_feature: 'demo', status: 'in_progress' });
  const logger = makeLogger();
  const result = await runStateReset({ args: [dir], options: { json: true }, logger });
  assert.equal(result.ok, true);
  assert.equal(logger.logs.length, 0, 'json mode suppresses prose');
});
