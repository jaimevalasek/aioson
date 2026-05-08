'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  filterItems,
  groupItems,
  buildWindow,
  truncateMiddle,
  visibleLength,
  formatRow
} = require('../src/lib/terminal-picker');

// ────────────────────────────────────────────────────────────────────────────
// filterItems

test('filterItems returns input untouched when query is empty', () => {
  const items = [{ label: 'a' }, { label: 'b' }];
  assert.deepEqual(filterItems(items, ''), items);
  assert.deepEqual(filterItems(items, '   '), items);
  assert.deepEqual(filterItems(items, null), items);
});

test('filterItems matches case-insensitive substring on label', () => {
  const items = [
    { label: 'src/foo.js' },
    { label: 'tests/foo.test.js' },
    { label: 'README.md' }
  ];
  const result = filterItems(items, 'foo');
  assert.equal(result.length, 2);
  assert.deepEqual(result.map((i) => i.label), ['src/foo.js', 'tests/foo.test.js']);

  const upper = filterItems(items, 'README');
  assert.equal(upper.length, 1);

  const lower = filterItems(items, 'readme');
  assert.equal(lower.length, 1);
});

test('filterItems handles empty input list', () => {
  assert.deepEqual(filterItems([], 'foo'), []);
});

// ────────────────────────────────────────────────────────────────────────────
// groupItems

test('groupItems preserves first-seen order and keeps each group items intact', () => {
  const items = [
    { label: 'a', group: 'Modified' },
    { label: 'b', group: 'Untracked' },
    { label: 'c', group: 'Modified' },
    { label: 'd', group: 'Untracked' }
  ];
  const grouped = groupItems(items);
  assert.equal(grouped.length, 2);
  assert.equal(grouped[0].group, 'Modified');
  assert.equal(grouped[1].group, 'Untracked');
  assert.deepEqual(grouped[0].items.map((i) => i.label), ['a', 'c']);
  assert.deepEqual(grouped[1].items.map((i) => i.label), ['b', 'd']);
});

test('groupItems coerces missing/null group to empty string', () => {
  const grouped = groupItems([
    { label: 'a' },
    { label: 'b', group: null },
    { label: 'c', group: 'X' }
  ]);
  assert.equal(grouped.length, 2);
  assert.equal(grouped[0].group, '');
  assert.equal(grouped[0].items.length, 2);
  assert.equal(grouped[1].group, 'X');
});

// ────────────────────────────────────────────────────────────────────────────
// buildWindow

test('buildWindow: total fits within height returns full range', () => {
  const w = buildWindow(8, 0, 20, 0);
  assert.deepEqual(w, { offset: 0, end: 8 });
});

test('buildWindow: cursor inside window keeps offset stable', () => {
  // 100 items, window of 10, cursor at 25, prev offset 20 → keep
  const w = buildWindow(100, 25, 10, 20);
  assert.equal(w.offset, 20);
  assert.equal(w.end, 30);
});

test('buildWindow: cursor moves below window scrolls down', () => {
  // 100 items, window 10, cursor 50, prev offset 20 → scroll so cursor is last
  const w = buildWindow(100, 50, 10, 20);
  assert.equal(w.offset, 41);
  assert.equal(w.end, 51);
});

test('buildWindow: cursor moves above window scrolls up to cursor', () => {
  const w = buildWindow(100, 5, 10, 50);
  assert.equal(w.offset, 5);
  assert.equal(w.end, 15);
});

test('buildWindow: cursor near end clamps to last full window', () => {
  const w = buildWindow(100, 99, 10, 0);
  assert.equal(w.offset, 90);
  assert.equal(w.end, 100);
});

test('buildWindow: handles edge cases (zero/negative)', () => {
  assert.deepEqual(buildWindow(0, 0, 10, 0), { offset: 0, end: 0 });
  assert.deepEqual(buildWindow(10, 0, 0, 0), { offset: 0, end: 0 });
});

// ────────────────────────────────────────────────────────────────────────────
// truncateMiddle

test('truncateMiddle: short string returned unchanged', () => {
  assert.equal(truncateMiddle('abcdef', 10), 'abcdef');
  assert.equal(truncateMiddle('abcdef', 6), 'abcdef');
});

test('truncateMiddle: truncates with middle ellipsis preserving both ends', () => {
  const out = truncateMiddle('src/very/long/path/to/some/file.js', 20);
  assert.equal(out.length, 20);
  assert.ok(out.startsWith('src/very/'));
  assert.ok(out.endsWith('/file.js'));
  assert.ok(out.includes('…'));
});

test('truncateMiddle: extreme narrow returns ellipsis', () => {
  assert.equal(truncateMiddle('abcdef', 3), '…');
  assert.equal(truncateMiddle('abcdef', 1), '…');
});

// ────────────────────────────────────────────────────────────────────────────
// visibleLength + formatRow

test('visibleLength strips ANSI escape sequences', () => {
  assert.equal(visibleLength('hello'), 5);
  assert.equal(visibleLength('\x1B[36m>\x1B[0m hi'), 4);
  assert.equal(visibleLength('\x1B[1;31mERROR\x1B[0m'), 5);
});

test('formatRow: focused row gets cursor marker', () => {
  const row = formatRow({ label: 'foo.js', checked: false }, true, 80);
  assert.match(row, /^\x1B\[36m>\x1B\[0m /);
});

test('formatRow: unfocused row gets indent (no cursor)', () => {
  const row = formatRow({ label: 'foo.js', checked: false }, false, 80);
  assert.ok(row.startsWith('  '));
  assert.ok(!row.includes('>'));
});

test('formatRow: locked items render [!] in red', () => {
  const row = formatRow({ label: 'node_modules/x', locked: true }, false, 80);
  assert.match(row, /\x1B\[31m\[!\]\x1B\[0m/);
});

test('formatRow: checked items render [x] in green', () => {
  const row = formatRow({ label: 'foo.js', checked: true }, false, 80);
  assert.match(row, /\x1B\[32m\[x\]\x1B\[0m/);
});

test('formatRow: unchecked items render [ ]', () => {
  const row = formatRow({ label: 'foo.js', checked: false }, false, 80);
  assert.ok(row.includes('[ ]'));
});

test('formatRow: badge appears between checkbox and label', () => {
  const row = formatRow({ label: 'foo.bak', checked: true, badge: 'WARN' }, false, 80);
  // Visible content order: [x] WARN foo.bak (with ANSI escapes between).
  const stripped = row.replace(/\x1B\[[0-9;]*m/g, '');
  assert.match(stripped, /\[x\]\s*WARN\s+foo\.bak/);
});

test('formatRow: hint appears at end of row', () => {
  const row = formatRow({ label: 'foo.js', checked: true, hint: 'src/' }, false, 80);
  assert.ok(row.includes('src/'));
  // Hint must come AFTER the label
  const labelIdx = row.indexOf('foo.js');
  const hintIdx = row.indexOf('src/');
  assert.ok(hintIdx > labelIdx);
});

test('formatRow: long label is middle-truncated when row exceeds cols', () => {
  const longPath = 'src/very/very/very/long/path/to/some/deeply/nested/file.js';
  const row = formatRow({ label: longPath, checked: true }, false, 40);
  assert.ok(visibleLength(row) <= 40);
  assert.ok(row.includes('…'));
});
