'use strict';

// Tests for `aioson memory:trim` — P0 of the agent-loading-contract.
// Engine must move COLD entries out of the "## What the system already has"
// section without losing content or touching any other section; the command
// must be non-destructive under --dry-run and tier-2-safe.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  splitCurrentState,
  buildArchiveContent,
  parseActiveSlugs
} = require('../src/current-state-trim');
const { runMemoryTrim } = require('../src/commands/memory-trim');

function makeLogger() {
  const lines = [];
  return { lines, log(l = '') { lines.push(String(l)); }, error(l = '') { lines.push(String(l)); } };
}

// 8 entries, newest-first, two referencing active slugs (one of them old).
function fixture() {
  return [
    '---',
    'generated_at: "2026-05-28T00:00:00Z"',
    '---',
    '',
    '# Current State',
    '',
    '## What the system already has',
    '',
    'These capabilities were confirmed during this analysis:',
    '',
    '- entry-01 newest about gemini-phaseout shipped',
    '- entry-02 second',
    '- entry-03 third',
    '- entry-04 fourth',
    '- entry-05 fifth',
    '- entry-06 sixth',
    '- entry-07 old but mentions cross-tool-project-knowledge',
    '- entry-08 oldest',
    '',
    '## What the system does not have yet',
    '',
    '- gap-01 still missing',
    '',
    '## Practical resume point',
    '',
    'Resume here.',
    ''
  ].join('\n');
}

const ALL_ENTRIES = [
  '- entry-01 newest about gemini-phaseout shipped',
  '- entry-02 second',
  '- entry-03 third',
  '- entry-04 fourth',
  '- entry-05 fifth',
  '- entry-06 sixth',
  '- entry-07 old but mentions cross-tool-project-knowledge',
  '- entry-08 oldest'
];

test('splitCurrentState keeps newest N and archives the rest (round-trip, no loss)', () => {
  const res = splitCurrentState(fixture(), { keep: 3, activeSlugs: [] });
  assert.equal(res.ok, true);
  assert.equal(res.stats.total_entries, 8);
  assert.equal(res.stats.kept, 3);
  assert.equal(res.stats.archived, 5);

  // kept are the 3 newest, in order
  const keptInHot = ALL_ENTRIES.filter((e) => res.hotContent.includes(e));
  assert.deepEqual(keptInHot, ALL_ENTRIES.slice(0, 3));

  // round-trip: kept ∪ archived === every original entry, none lost/duplicated
  const reunion = [...ALL_ENTRIES.slice(0, 3), ...res.archivedEntries].sort();
  assert.deepEqual(reunion, [...ALL_ENTRIES].sort());
});

test('active-slug entries are preserved regardless of age', () => {
  const res = splitCurrentState(fixture(), {
    keep: 3,
    activeSlugs: ['cross-tool-project-knowledge', 'gemini-phaseout']
  });
  // entry-07 is old (index 6) but active → must stay HOT, not archived
  assert.ok(res.hotContent.includes('- entry-07 old but mentions cross-tool-project-knowledge'));
  assert.ok(!res.archivedEntries.includes('- entry-07 old but mentions cross-tool-project-knowledge'));
  // it was kept on top of the keep window
  assert.equal(res.stats.kept, 4);
  assert.equal(res.stats.archived, 4);
});

test('other sections and frontmatter are preserved byte-for-byte', () => {
  const res = splitCurrentState(fixture(), { keep: 2, activeSlugs: [] });
  assert.ok(res.hotContent.includes('## What the system does not have yet'));
  assert.ok(res.hotContent.includes('- gap-01 still missing'));
  assert.ok(res.hotContent.includes('## Practical resume point'));
  assert.ok(res.hotContent.includes('Resume here.'));
  assert.ok(res.hotContent.startsWith('---\ngenerated_at: "2026-05-28T00:00:00Z"\n---'));
  // archived entries removed from hot
  assert.ok(!res.hotContent.includes('- entry-08 oldest'));
});

test('section_not_found when the hot-log header is absent', () => {
  const res = splitCurrentState('---\nx: 1\n---\n# Other\n\n- thing\n', { keep: 1 });
  assert.equal(res.ok, false);
  assert.equal(res.reason, 'section_not_found');
});

test('parseActiveSlugs returns only in_progress slugs', () => {
  const md = [
    '| slug | status | started | completed |',
    '|------|--------|---------|-----------|',
    '| done-feature | done | 2026-01-01 | 2026-01-02 |',
    '| active-a | in_progress | 2026-05-01 | — |',
    '| active-b | in_progress | 2026-05-02 | — |'
  ].join('\n');
  assert.deepEqual(parseActiveSlugs(md), ['active-a', 'active-b']);
});

test('buildArchiveContent creates a fresh archive then prepends on the next run', () => {
  const first = buildArchiveContent('', ['- old-1', '- old-2'], '2026-05-28T10:00:00Z');
  assert.ok(first.includes('# Current State — Archive'));
  assert.ok(first.includes('## Archived capabilities'));
  assert.ok(first.includes('- old-1'));

  const second = buildArchiveContent(first, ['- older-3'], '2026-05-29T10:00:00Z');
  // new batch prepended right after the header, before the prior batch
  const idxNew = second.indexOf('- older-3');
  const idxPrev = second.indexOf('- old-1');
  assert.ok(idxNew !== -1 && idxNew < idxPrev, 'newest archived batch should come first');
  assert.ok(second.includes('updated_at: "2026-05-29T10:00:00Z"'), 'updated_at bumped');
});

test('command --dry-run mutates nothing and reports what would be archived', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aioson-trim-dry-'));
  try {
    const csPath = path.join(dir, '.aioson/context/bootstrap/current-state.md');
    fs.mkdirSync(path.dirname(csPath), { recursive: true });
    fs.writeFileSync(csPath, fixture(), 'utf8');
    const before = fs.readFileSync(csPath, 'utf8');

    const res = await runMemoryTrim({
      args: [dir],
      options: { keep: 3, 'dry-run': true, json: true },
      logger: makeLogger()
    });

    assert.equal(res.ok, true);
    assert.equal(res.dry_run, true);
    assert.equal(res.archived, 5);
    // file untouched, archive NOT created
    assert.equal(fs.readFileSync(csPath, 'utf8'), before);
    assert.equal(fs.existsSync(path.join(dir, '.aioson/context/bootstrap/current-state-archive.md')), false);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
});

test('command real run writes hot + archive and preserves all entries', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aioson-trim-real-'));
  try {
    const csPath = path.join(dir, '.aioson/context/bootstrap/current-state.md');
    const archPath = path.join(dir, '.aioson/context/bootstrap/current-state-archive.md');
    fs.mkdirSync(path.dirname(csPath), { recursive: true });
    fs.writeFileSync(csPath, fixture(), 'utf8');
    // active feature must survive
    fs.writeFileSync(path.join(dir, '.aioson/context/features.md'),
      '| slug | status | started | completed |\n|--|--|--|--|\n| cross-tool-project-knowledge | in_progress | 2026-05-23 | — |\n', 'utf8');

    const res = await runMemoryTrim({
      args: [dir],
      options: { keep: 3, json: true },
      logger: makeLogger()
    });

    assert.equal(res.ok, true);
    assert.equal(res.dry_run, false);

    const hot = fs.readFileSync(csPath, 'utf8');
    const archive = fs.readFileSync(archPath, 'utf8');

    // every original entry is in exactly one of the two files
    for (const e of ALL_ENTRIES) {
      const inHot = hot.includes(e);
      const inArch = archive.includes(e);
      assert.ok(inHot !== inArch, `${e} must be in exactly one file (hot=${inHot} arch=${inArch})`);
    }
    // active-slug entry stayed hot despite being old
    assert.ok(hot.includes('- entry-07 old but mentions cross-tool-project-knowledge'));
    // other section preserved
    assert.ok(hot.includes('## Practical resume point'));
    // hot is smaller than before
    assert.ok(Buffer.byteLength(hot) < Buffer.byteLength(fixture()));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
});

test('command refuses to run inside a runtime hook (tier-2)', async () => {
  const prev = process.env.AIOSON_RUNTIME_HOOK;
  process.env.AIOSON_RUNTIME_HOOK = '1';
  try {
    const res = await runMemoryTrim({ args: ['.'], options: { json: true }, logger: makeLogger() });
    assert.equal(res.ok, false);
    assert.equal(res.reason, 'hook_blocked');
  } finally {
    if (prev === undefined) delete process.env.AIOSON_RUNTIME_HOOK;
    else process.env.AIOSON_RUNTIME_HOOK = prev;
  }
});

test('command no-op when everything fits within keep window', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aioson-trim-noop-'));
  try {
    const csPath = path.join(dir, '.aioson/context/bootstrap/current-state.md');
    fs.mkdirSync(path.dirname(csPath), { recursive: true });
    fs.writeFileSync(csPath, fixture(), 'utf8');
    const res = await runMemoryTrim({ args: [dir], options: { keep: 50, json: true }, logger: makeLogger() });
    assert.equal(res.ok, true);
    assert.equal(res.archived, 0);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
});
