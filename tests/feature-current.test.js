'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { runFeatureCurrent, resolveActiveFeature } = require('../src/commands/feature-current');

async function makeTmpDir() {
  return fs.mkdtemp(path.join(os.tmpdir(), 'aioson-feature-current-'));
}

async function writePulse(dir, activeFeature) {
  const full = path.join(dir, '.aioson/context/project-pulse.md');
  await fs.mkdir(path.dirname(full), { recursive: true });
  await fs.writeFile(full, [
    '---',
    `active_feature: ${activeFeature}`,
    'blockers: none',
    '---',
    '# Pulse'
  ].join('\n'), 'utf8');
}

async function writeFeatures(dir, rows) {
  const full = path.join(dir, '.aioson/context/features.md');
  await fs.mkdir(path.dirname(full), { recursive: true });
  const body = [
    '# Features',
    '',
    '| slug | status | started | completed |',
    '|------|--------|---------|-----------|',
    ...rows.map((r) => `| ${r.slug} | ${r.status} | ${r.started || '2026-06-01'} | ${r.completed || '—'} |`)
  ].join('\n');
  await fs.writeFile(full, body, 'utf8');
}

function logger() {
  const lines = [];
  return { lines, log(value) { lines.push(String(value)); } };
}

test('feature:current resolves the slug from project-pulse active_feature', async () => {
  const dir = await makeTmpDir();
  try {
    await writePulse(dir, 'checkout');
    await writeFeatures(dir, [{ slug: 'checkout', status: 'in_progress' }]);

    const resolved = await resolveActiveFeature(dir);
    assert.equal(resolved.slug, 'checkout');
    assert.equal(resolved.source, 'pulse');
    assert.equal(resolved.ambiguous, false);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test('feature:current falls back to the unique in_progress row when pulse is (none)', async () => {
  const dir = await makeTmpDir();
  try {
    await writePulse(dir, '(none)');
    await writeFeatures(dir, [
      { slug: 'old-feature', status: 'done', completed: '2026-05-01' },
      { slug: 'uploads', status: 'in_progress' }
    ]);

    const resolved = await resolveActiveFeature(dir);
    assert.equal(resolved.slug, 'uploads');
    assert.equal(resolved.source, 'features.md');
    assert.equal(resolved.ambiguous, false);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test('feature:current reports ambiguity when several features are in_progress', async () => {
  const dir = await makeTmpDir();
  try {
    await writePulse(dir, '(none)');
    await writeFeatures(dir, [
      { slug: 'feature-a', status: 'in_progress' },
      { slug: 'feature-b', status: 'in_progress' }
    ]);

    const resolved = await resolveActiveFeature(dir);
    assert.equal(resolved.slug, ''); // never guess
    assert.equal(resolved.ambiguous, true);
    assert.deepEqual(resolved.candidates.sort(), ['feature-a', 'feature-b']);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test('feature:current returns empty for genuine project-level work', async () => {
  const dir = await makeTmpDir();
  try {
    await writePulse(dir, '(none)');
    await writeFeatures(dir, [{ slug: 'shipped', status: 'done', completed: '2026-05-01' }]);

    const resolved = await resolveActiveFeature(dir);
    assert.equal(resolved.slug, '');
    assert.equal(resolved.source, 'none');
    assert.equal(resolved.ambiguous, false);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test('feature:current — pulse active_feature wins over a different in_progress row', async () => {
  const dir = await makeTmpDir();
  try {
    await writePulse(dir, 'pinned-feature');
    await writeFeatures(dir, [{ slug: 'other-open', status: 'in_progress' }]);

    const resolved = await resolveActiveFeature(dir);
    assert.equal(resolved.slug, 'pinned-feature');
    assert.equal(resolved.source, 'pulse');
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test('feature:current is robust to duplicate in_progress rows (registry dup)', async () => {
  const dir = await makeTmpDir();
  try {
    await writePulse(dir, '(none)');
    // The same feature accidentally registered twice — must collapse, not flag ambiguous.
    await writeFeatures(dir, [
      { slug: 'dup-feature', status: 'in_progress' },
      { slug: 'dup-feature', status: 'in_progress' }
    ]);

    const resolved = await resolveActiveFeature(dir);
    assert.equal(resolved.slug, 'dup-feature');
    assert.equal(resolved.ambiguous, false);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test('feature:current plain mode prints only the slug; ambiguous prints nothing', async () => {
  const dir = await makeTmpDir();
  try {
    await writePulse(dir, 'checkout');
    const out = logger();
    const payload = await runFeatureCurrent({ args: [dir], options: {}, logger: out });
    assert.equal(payload.slug, 'checkout');
    assert.deepEqual(out.lines, ['checkout']);

    await writePulse(dir, '(none)');
    await writeFeatures(dir, [
      { slug: 'a', status: 'in_progress' },
      { slug: 'b', status: 'in_progress' }
    ]);
    const out2 = logger();
    const payload2 = await runFeatureCurrent({ args: [dir], options: {}, logger: out2 });
    assert.equal(payload2.ambiguous, true);
    assert.deepEqual(out2.lines, []); // never emit a guessed slug to stdout
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

// ─── feature per live session (parallel-sessions, AC-parallel-sessions-25) ───
// Two sessions on one folder: each answers the feature it works on, whatever
// the other registers or advances. The pulse stays one per project and is
// what a reader outside any live session gets, as before.

const { spawnSync } = require('node:child_process');
const { createTranslator } = require('../src/i18n');
const { runLiveStart, runLiveClose } = require('../src/commands/live');
const { bindSessionFeature } = require('../src/lib/session-feature');

const CLI = path.join(__dirname, '..', 'bin', 'aioson.js');
const silent = { log() {}, error() {} };
const { t: tr } = createTranslator('en');

function sessionEnv(key) {
  return { AIOSON_LIVE_SESSION_KEY: key, AIOSON_LIVE_SESSION: key };
}

async function openSession(dir, key) {
  return runLiveStart({
    args: [dir],
    options: { tool: 'claude', 'tool-bin': process.execPath, 'no-launch': true, json: true, session: key, 'own-session': true, 'no-health-check': true, 'no-health': true },
    logger: silent,
    t: tr
  });
}

// A suite run inside a launched session inherits the variables live:start exports.
function cliEnv(extra = {}) {
  const env = { ...process.env, ...extra };
  for (const name of ['AIOSON_LIVE_SESSION_KEY', 'AIOSON_LIVE_SESSION', 'AIOSON_PLAY']) {
    if (!(name in extra)) delete env[name];
  }
  return env;
}

function cliJson(args, env) {
  const result = spawnSync(process.execPath, [CLI, ...args], { env: cliEnv(env), encoding: 'utf8' });
  return { status: result.status, json: result.stdout.trim().startsWith('{') ? JSON.parse(result.stdout) : null, stderr: result.stderr };
}

test('AC-parallel-sessions-25 two live sessions on different features each get their own from feature:current', async () => {
  const dir = await makeTmpDir();
  try {
    await writeFeatures(dir, [{ slug: 'checkout', status: 'in_progress' }, { slug: 'billing', status: 'in_progress' }]);
    await writePulse(dir, 'checkout');
    await openSession(dir, 'session-a-key');
    await openSession(dir, 'session-b-key');
    await bindSessionFeature(dir, 'checkout', { env: sessionEnv('session-a-key') });
    await bindSessionFeature(dir, 'billing', { env: sessionEnv('session-b-key') });
    // Session B advances its feature: the project's pulse moves to it.
    await writePulse(dir, 'billing');

    assert.deepEqual(
      await resolveActiveFeature(dir, { env: sessionEnv('session-a-key') }),
      { slug: 'checkout', source: 'session', ambiguous: false, candidates: [] }
    );
    assert.deepEqual(
      await resolveActiveFeature(dir, { env: sessionEnv('session-b-key') }),
      { slug: 'billing', source: 'session', ambiguous: false, candidates: [] }
    );
    // Outside a live session nothing changed: the pulse answers.
    assert.deepEqual(
      await resolveActiveFeature(dir, { env: {} }),
      { slug: 'billing', source: 'pulse', ambiguous: false, candidates: [] }
    );
  } finally {
    await fs.rm(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
});

test('AC-parallel-sessions-25 a session that named no feature gets ambiguous with two in progress, never the pulse of another session', async () => {
  const dir = await makeTmpDir();
  try {
    await writeFeatures(dir, [{ slug: 'checkout', status: 'in_progress' }, { slug: 'billing', status: 'in_progress' }]);
    await writePulse(dir, 'billing');
    await openSession(dir, 'session-a-key');

    assert.deepEqual(
      await resolveActiveFeature(dir, { env: sessionEnv('session-a-key') }),
      { slug: '', source: 'session', ambiguous: true, candidates: ['checkout', 'billing'] }
    );
  } finally {
    await fs.rm(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
});

test('AC-parallel-sessions-25 with a single feature in progress a session that named none answers as before', async () => {
  const dir = await makeTmpDir();
  try {
    await writeFeatures(dir, [{ slug: 'checkout', status: 'in_progress' }, { slug: 'billing', status: 'done' }]);
    await writePulse(dir, 'checkout');
    await openSession(dir, 'session-a-key');

    assert.deepEqual(
      await resolveActiveFeature(dir, { env: sessionEnv('session-a-key') }),
      { slug: 'checkout', source: 'pulse', ambiguous: false, candidates: [] }
    );
    await writePulse(dir, '(none)');
    assert.deepEqual(
      await resolveActiveFeature(dir, { env: sessionEnv('session-a-key') }),
      { slug: 'checkout', source: 'features.md', ambiguous: false, candidates: [] }
    );
  } finally {
    await fs.rm(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
});

test('AC-parallel-sessions-25 a session whose feature was closed, and a closed session, fall back to the project answer', async () => {
  const dir = await makeTmpDir();
  try {
    await writeFeatures(dir, [{ slug: 'checkout', status: 'in_progress' }, { slug: 'billing', status: 'in_progress' }]);
    await writePulse(dir, 'billing');
    await openSession(dir, 'session-a-key');
    await bindSessionFeature(dir, 'checkout', { env: sessionEnv('session-a-key') });

    // checkout is closed: the session is back to having no feature.
    await writeFeatures(dir, [{ slug: 'checkout', status: 'done' }, { slug: 'billing', status: 'in_progress' }]);
    assert.deepEqual(
      await resolveActiveFeature(dir, { env: sessionEnv('session-a-key') }),
      { slug: 'billing', source: 'pulse', ambiguous: false, candidates: [] }
    );

    // The key of a session that is no longer running counts for nothing.
    await writeFeatures(dir, [{ slug: 'checkout', status: 'in_progress' }, { slug: 'billing', status: 'in_progress' }]);
    await runLiveClose({ args: [dir], options: { session: 'session-a-key', json: true, 'no-health': true }, logger: silent, t: tr });
    assert.deepEqual(
      await resolveActiveFeature(dir, { env: sessionEnv('session-a-key') }),
      { slug: 'billing', source: 'pulse', ambiguous: false, candidates: [] }
    );
  } finally {
    await fs.rm(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
});

test('AC-parallel-sessions-25 the aioson command answers the session it runs in: feature:current --json through the CLI', async () => {
  const dir = await makeTmpDir();
  try {
    await writeFeatures(dir, [{ slug: 'checkout', status: 'in_progress' }, { slug: 'billing', status: 'in_progress' }]);
    await writePulse(dir, 'billing');
    await openSession(dir, 'session-a-key');
    await openSession(dir, 'session-b-key');
    await bindSessionFeature(dir, 'checkout', { env: sessionEnv('session-a-key') });

    const inA = cliJson(['feature:current', dir, '--json'], sessionEnv('session-a-key'));
    assert.deepEqual(inA.json, { ok: true, slug: 'checkout', source: 'session', ambiguous: false, candidates: [] }, inA.stderr);
    // codex strips the *_KEY variable from the commands it runs: the other name is enough.
    const inACodex = cliJson(['feature:current', dir, '--json'], { AIOSON_LIVE_SESSION: 'session-a-key' });
    assert.equal(inACodex.json.slug, 'checkout');

    const inB = cliJson(['feature:current', dir, '--json'], sessionEnv('session-b-key'));
    assert.deepEqual(inB.json, { ok: true, slug: '', source: 'session', ambiguous: true, candidates: ['checkout', 'billing'] }, inB.stderr);

    const outside = cliJson(['feature:current', dir, '--json']);
    assert.deepEqual(outside.json, { ok: true, slug: 'billing', source: 'pulse', ambiguous: false, candidates: [] });
  } finally {
    await fs.rm(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
});
