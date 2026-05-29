'use strict';

// Slice 2 of the agent-loading-contract P0:
//  - context:health now measures bootstrap/*.md (the per-activation layer) and
//    excludes the cold *-archive.md
//  - feature:close auto-rolls aged current-state.md entries into the archive
//    (best-effort, non-blocking, --no-trim opt-out)

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { runContextHealth } = require('../src/commands/context-health');
const { runFeatureClose } = require('../src/commands/feature-close');

function logger() {
  const lines = [];
  return { lines, log(l = '') { lines.push(String(l)); }, error(l = '') { lines.push(String(l)); } };
}

function writeBootstrap(dir, { entries }) {
  const bs = path.join(dir, '.aioson/context/bootstrap');
  fs.mkdirSync(bs, { recursive: true });
  const bullets = Array.from({ length: entries }, (_, i) => `- entry-${String(entries - i).padStart(2, '0')} capability shipped`);
  fs.writeFileSync(path.join(bs, 'current-state.md'),
    ['---', 'generated_at: "2026-05-28T00:00:00Z"', '---', '', '# Current State', '',
      '## What the system already has', '', 'These capabilities were confirmed:', '',
      ...bullets, '', '## Practical resume point', '', 'Resume here.', ''].join('\n'), 'utf8');
}

test('context:health includes bootstrap/*.md and excludes the cold archive', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aios-ch-bs-'));
  try {
    fs.mkdirSync(path.join(dir, '.aioson/context'), { recursive: true });
    fs.writeFileSync(path.join(dir, '.aioson/context/discovery.md'), '# Discovery\n', 'utf8');
    writeBootstrap(dir, { entries: 5 });
    // a cold archive that must NOT be counted
    fs.writeFileSync(path.join(dir, '.aioson/context/bootstrap/current-state-archive.md'),
      '---\n---\n# Archive\n\n## Archived capabilities\n\n- old stuff\n', 'utf8');

    const res = await runContextHealth({ args: [dir], options: { json: true }, logger: logger() });
    assert.equal(res.ok, true);
    const files = res.files.map((f) => f.file);
    assert.ok(files.includes('bootstrap/current-state.md'), 'hot bootstrap file is measured');
    assert.ok(files.includes('bootstrap/what-is.md') === false, 'only present files'); // not created here
    assert.ok(!files.includes('bootstrap/current-state-archive.md'), 'cold archive excluded');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
});

test('context:health hints memory:trim for a heavy current-state.md', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aios-ch-hint-'));
  try {
    fs.mkdirSync(path.join(dir, '.aioson/context'), { recursive: true });
    // ~6k tokens worth of entries to cross the HEAVY threshold (>5000)
    const big = path.join(dir, '.aioson/context/bootstrap');
    fs.mkdirSync(big, { recursive: true });
    const fat = Array.from({ length: 60 }, (_, i) => `- entry-${i} ` + 'x'.repeat(400));
    fs.writeFileSync(path.join(big, 'current-state.md'),
      ['---', '---', '# Current State', '', '## What the system already has', '', ...fat, ''].join('\n'), 'utf8');

    const lg = logger();
    await runContextHealth({ args: [dir], options: {}, logger: lg });
    const out = lg.lines.join('\n');
    assert.match(out, /bootstrap\/current-state\.md is heavy/);
    assert.match(out, /aioson memory:trim/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
});

function makeCloseFixture(slug) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aios-fc-trim-'));
  const ctx = path.join(dir, '.aioson/context');
  fs.mkdirSync(ctx, { recursive: true });
  fs.writeFileSync(path.join(ctx, `prd-${slug}.md`), `---\nclassification: MICRO\n---\n# PRD ${slug}\n`, 'utf8');
  fs.writeFileSync(path.join(ctx, `spec-${slug}.md`), `---\nfeature: ${slug}\nstatus: in_progress\n---\n# Spec\n`, 'utf8');
  fs.writeFileSync(path.join(ctx, 'features.md'),
    `# Features\n\n| slug | status | started | completed |\n|------|--------|---------|-----------|\n| ${slug} | in_progress | 2026-05-01 | — |\n`, 'utf8');
  fs.writeFileSync(path.join(ctx, 'project-pulse.md'), '# Project Pulse\n', 'utf8');
  writeBootstrap(dir, { entries: 40 }); // 40 > AUTO_CLOSE_KEEP (25) → some archived
  return dir;
}

test('feature:close auto-archives aged current-state entries on PASS', async () => {
  const slug = 'demo-feature';
  const dir = makeCloseFixture(slug);
  try {
    const res = await runFeatureClose({
      args: [dir],
      options: { feature: slug, verdict: 'PASS', 'no-archive': true, 'no-distill': true, json: true },
      logger: logger()
    });
    assert.equal(res.ok, true);
    assert.ok(res.updates.some((u) => /^trim: archived \d+ aged current-state/.test(u)), `expected a trim update, got: ${res.updates.join(' | ')}`);
    const archPath = path.join(dir, '.aioson/context/bootstrap/current-state-archive.md');
    assert.ok(fs.existsSync(archPath), 'archive created');
    // hot file now has <= 25 entries in the section
    const hot = fs.readFileSync(path.join(dir, '.aioson/context/bootstrap/current-state.md'), 'utf8');
    const hotEntries = hot.split(/\r?\n/).filter((l) => /^- entry-/.test(l)).length;
    assert.ok(hotEntries <= 25, `hot entries ${hotEntries} should be <= 25`);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
});

test('feature:close --no-trim skips the rollup', async () => {
  const slug = 'demo-feature';
  const dir = makeCloseFixture(slug);
  try {
    const res = await runFeatureClose({
      args: [dir],
      options: { feature: slug, verdict: 'PASS', 'no-archive': true, 'no-distill': true, 'no-trim': true, json: true },
      logger: logger()
    });
    assert.equal(res.ok, true);
    assert.ok(!res.updates.some((u) => u.startsWith('trim:')), 'no trim update with --no-trim');
    assert.ok(!fs.existsSync(path.join(dir, '.aioson/context/bootstrap/current-state-archive.md')), 'no archive created');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
});
