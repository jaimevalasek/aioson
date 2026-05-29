'use strict';

// @tester — coverage-gap tests for THIS session's new implementations
// (agent-loading-contract P0 + i18n cli.-prefix fix). Targets the uncovered
// error/edge paths the initial suites missed, found via
// `node --test --experimental-test-coverage`.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { runMemoryTrim } = require('../src/commands/memory-trim');
const { runFeatureClose } = require('../src/commands/feature-close');
const { buildArchiveContent } = require('../src/current-state-trim');
const { createTranslator } = require('../src/i18n');
const enMessages = require('../src/i18n/messages/en');

function makeLogger() {
  const lines = [];
  return { lines, log(l = '') { lines.push(String(l)); }, error(l = '') { lines.push(String(l)); } };
}

function tmp(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}
function rm(dir) {
  fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
}

// ── memory:trim error / edge paths ─────────────────────────────────────────

test('memory:trim returns no_current_state when bootstrap/current-state.md is absent', async () => {
  const dir = tmp('aios-trim-nocs-');
  try {
    const res = await runMemoryTrim({ args: [dir], options: { json: true }, logger: makeLogger() });
    assert.equal(res.ok, false);
    assert.equal(res.reason, 'no_current_state');
  } finally { rm(dir); }
});

test('memory:trim returns section_not_found when the hot-log header is missing', async () => {
  const dir = tmp('aios-trim-nosec-');
  try {
    const cs = path.join(dir, '.aioson/context/bootstrap/current-state.md');
    fs.mkdirSync(path.dirname(cs), { recursive: true });
    fs.writeFileSync(cs, '---\n---\n# Current State\n\n## Something else\n\n- x\n', 'utf8');
    const res = await runMemoryTrim({ args: [dir], options: { json: true }, logger: makeLogger() });
    assert.equal(res.ok, false);
    assert.equal(res.reason, 'section_not_found');
  } finally { rm(dir); }
});

test('memory:trim honors a custom --archive path', async () => {
  const dir = tmp('aios-trim-arch-');
  try {
    const cs = path.join(dir, '.aioson/context/bootstrap/current-state.md');
    fs.mkdirSync(path.dirname(cs), { recursive: true });
    const bullets = Array.from({ length: 10 }, (_, i) => `- entry-${10 - i}`);
    fs.writeFileSync(cs, ['---', '---', '# Current State', '', '## What the system already has', '', ...bullets, ''].join('\n'), 'utf8');
    const customArchive = path.join(dir, 'my-archive.md');
    const res = await runMemoryTrim({ args: [dir], options: { keep: 3, archive: customArchive, json: true }, logger: makeLogger() });
    assert.equal(res.ok, true);
    assert.ok(res.archived > 0);
    assert.ok(fs.existsSync(customArchive), 'archive written to the custom path');
    assert.equal(fs.existsSync(path.join(dir, '.aioson/context/bootstrap/current-state-archive.md')), false, 'default archive not used');
  } finally { rm(dir); }
});

// ── current-state-trim engine edge ──────────────────────────────────────────

test('buildArchiveContent appends to an existing archive that lacks the header', () => {
  const existing = '---\nupdated_at: "2026-01-01T00:00:00Z"\n---\n\n# Current State — Archive\n\nsome freeform text, no header\n';
  const out = buildArchiveContent(existing, ['- moved-entry'], '2026-05-28T00:00:00Z');
  assert.ok(out.includes('- moved-entry'), 'new entry appended even without the ## Archived capabilities header');
  assert.ok(out.includes('updated_at: "2026-05-28T00:00:00Z"'), 'updated_at bumped');
  assert.ok(out.includes('some freeform text'), 'existing content preserved');
});

test('buildArchiveContent is a no-op when there are no new entries', () => {
  assert.equal(buildArchiveContent('existing', [], '2026-05-28T00:00:00Z'), 'existing');
  assert.equal(buildArchiveContent('', [], '2026-05-28T00:00:00Z'), '');
});

// ── feature:close trim hook — skip path must not crash ──────────────────────

test('feature:close (PASS) does not crash when current-state.md is absent (hook skips)', async () => {
  const slug = 'no-bootstrap-feature';
  const dir = tmp('aios-fc-nobs-');
  try {
    const ctx = path.join(dir, '.aioson/context');
    fs.mkdirSync(ctx, { recursive: true });
    fs.writeFileSync(path.join(ctx, `prd-${slug}.md`), `---\nclassification: MICRO\n---\n# PRD\n`, 'utf8');
    fs.writeFileSync(path.join(ctx, `spec-${slug}.md`), `---\nfeature: ${slug}\nstatus: in_progress\n---\n# Spec\n`, 'utf8');
    fs.writeFileSync(path.join(ctx, 'features.md'), `# Features\n\n| slug | status | started | completed |\n|--|--|--|--|\n| ${slug} | in_progress | 2026-05-01 | — |\n`, 'utf8');
    fs.writeFileSync(path.join(ctx, 'project-pulse.md'), '# Project Pulse\n', 'utf8');
    // no bootstrap/ dir at all

    const res = await runFeatureClose({
      args: [dir],
      options: { feature: slug, verdict: 'PASS', 'no-archive': true, 'no-distill': true, json: true },
      logger: makeLogger()
    });
    assert.equal(res.ok, true);
    assert.ok(!res.updates.some((u) => u.startsWith('trim:')), 'no trim update when there is no current-state.md');
  } finally { rm(dir); }
});

// ── i18n cli.-prefix fix — every key (not just id_required) must resolve ─────

test('all cli.memory_{archive,restore,search} keys resolve (no raw-key leak)', () => {
  const { t } = createTranslator('pt-BR');
  for (const block of ['memory_archive', 'memory_restore', 'memory_search']) {
    const keys = Object.keys(enMessages.cli[block]);
    assert.ok(keys.length > 0, `${block} has keys`);
    for (const k of keys) {
      const full = `cli.${block}.${k}`;
      assert.notEqual(t(full), full, `${full} must resolve, not echo the key`);
    }
  }
});
