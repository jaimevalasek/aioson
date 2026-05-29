'use strict';

// Regression tests for the two @pentester findings on the agent-loading-contract
// code:
//   TS-LC-01 — memory:trim --archive must stay contained in the project root.
//   TS-LC-02 — feature:close's auto-trim hook must not fire in a hook context.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { runMemoryTrim } = require('../src/commands/memory-trim');
const { runFeatureClose } = require('../src/commands/feature-close');

function makeLogger() {
  const lines = [];
  return { lines, log(l = '') { lines.push(String(l)); }, error(l = '') { lines.push(String(l)); } };
}
const tmp = (p) => fs.mkdtempSync(path.join(os.tmpdir(), p));
const rm = (d) => fs.rmSync(d, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });

function seedCurrentState(dir, n) {
  const cs = path.join(dir, '.aioson/context/bootstrap/current-state.md');
  fs.mkdirSync(path.dirname(cs), { recursive: true });
  const bullets = Array.from({ length: n }, (_, i) => `- entry-${n - i}`);
  fs.writeFileSync(cs, ['---', '---', '# Current State', '', '## What the system already has', '', ...bullets, ''].join('\n'), 'utf8');
  return cs;
}

// ── TS-LC-01 ────────────────────────────────────────────────────────────────

test('TS-LC-01: --archive with .. traversal is rejected, nothing written outside', async () => {
  const dir = tmp('aios-trimsec-rel-');
  try {
    const cs = seedCurrentState(dir, 10);
    const before = fs.readFileSync(cs, 'utf8');
    const escapeTarget = path.resolve(dir, '../escape.md');

    const res = await runMemoryTrim({ args: [dir], options: { keep: 3, archive: '../escape.md', json: true }, logger: makeLogger() });

    assert.equal(res.ok, false);
    assert.equal(res.reason, 'archive_path_escape');
    assert.equal(fs.existsSync(escapeTarget), false, 'must not write outside the project');
    assert.equal(fs.readFileSync(cs, 'utf8'), before, 'current-state untouched on rejection');
  } finally { rm(dir); }
});

test('TS-LC-01: an absolute --archive outside the project is rejected', async () => {
  const dir = tmp('aios-trimsec-abs-');
  const outside = path.join(os.tmpdir(), `aios-outside-${process.pid}.md`);
  try {
    seedCurrentState(dir, 10);
    const res = await runMemoryTrim({ args: [dir], options: { keep: 3, archive: outside, json: true }, logger: makeLogger() });
    assert.equal(res.ok, false);
    assert.equal(res.reason, 'archive_path_escape');
    assert.equal(fs.existsSync(outside), false);
  } finally { rm(dir); try { fs.unlinkSync(outside); } catch { /* not created — good */ } }
});

test('TS-LC-01: a custom --archive INSIDE the project is still allowed', async () => {
  const dir = tmp('aios-trimsec-ok-');
  try {
    seedCurrentState(dir, 10);
    const res = await runMemoryTrim({ args: [dir], options: { keep: 3, archive: 'sub/archive.md', json: true }, logger: makeLogger() });
    assert.equal(res.ok, true);
    assert.ok(res.archived > 0);
    assert.ok(fs.existsSync(path.join(dir, 'sub/archive.md')), 'contained custom archive is written');
  } finally { rm(dir); }
});

// ── TS-LC-02 ────────────────────────────────────────────────────────────────

function seedCloseFixture(slug) {
  const dir = tmp('aios-trimsec-hook-');
  const ctx = path.join(dir, '.aioson/context');
  fs.mkdirSync(ctx, { recursive: true });
  fs.writeFileSync(path.join(ctx, `prd-${slug}.md`), `---\nclassification: MICRO\n---\n# PRD\n`, 'utf8');
  fs.writeFileSync(path.join(ctx, `spec-${slug}.md`), `---\nfeature: ${slug}\nstatus: in_progress\n---\n# Spec\n`, 'utf8');
  fs.writeFileSync(path.join(ctx, 'features.md'), `# Features\n\n| slug | status | started | completed |\n|--|--|--|--|\n| ${slug} | in_progress | 2026-05-01 | — |\n`, 'utf8');
  fs.writeFileSync(path.join(ctx, 'project-pulse.md'), '# Project Pulse\n', 'utf8');
  seedCurrentState(dir, 40); // > AUTO_CLOSE_KEEP (25) → would normally trim
  return dir;
}

test('TS-LC-02: feature:close auto-trim is skipped under AIOSON_RUNTIME_HOOK', async () => {
  const slug = 'hook-ctx-feature';
  const dir = seedCloseFixture(slug);
  const prev = process.env.AIOSON_RUNTIME_HOOK;
  process.env.AIOSON_RUNTIME_HOOK = '1';
  try {
    const res = await runFeatureClose({
      args: [dir],
      options: { feature: slug, verdict: 'PASS', 'no-archive': true, 'no-distill': true, json: true },
      logger: makeLogger()
    });
    assert.equal(res.ok, true);
    assert.ok(!res.updates.some((u) => u.startsWith('trim:')), 'no trim in hook context');
    assert.equal(fs.existsSync(path.join(dir, '.aioson/context/bootstrap/current-state-archive.md')), false, 'no archive written in hook context');
  } finally {
    if (prev === undefined) delete process.env.AIOSON_RUNTIME_HOOK; else process.env.AIOSON_RUNTIME_HOOK = prev;
    rm(dir);
  }
});
