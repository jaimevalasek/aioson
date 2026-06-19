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
