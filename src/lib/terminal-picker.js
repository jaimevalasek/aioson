'use strict';

/**
 * Terminal Picker — full-screen TUI for selecting from a (potentially large)
 * list with status grouping, risk annotations, filter, paginated viewport,
 * and quick-action keys.
 *
 * Why this exists: the older `terminal-checkbox.js` redraws via `\x1B[NA`
 * (cursor-up-N) which is bounded by the visible viewport. With more items
 * than terminal rows, parts of the previous render scroll off-screen, the
 * up-cursor command stops at viewport top, the "clear from cursor" only
 * touches what is still visible, and each redraw stacks new content below
 * the orphaned old lines — the "duplica tudo" bug.
 *
 * Fix: enter the alternate screen buffer (\x1B[?1049h) so the picker draws
 * on its own surface, then `\x1B[H\x1B[J` (cursor-home + clear-all) on each
 * frame. On exit, leave the alt buffer (\x1B[?1049l) and the user's
 * terminal/scrollback is restored exactly as it was. Same approach as vim,
 * less, k9s, lazygit.
 *
 * Pure-function helpers (filterItems, buildWindow, groupItems, formatRow)
 * are exported for unit testing without driving stdin/stdout.
 */

const readline = require('node:readline');

// ────────────────────────────────────────────────────────────────────────────
// Pure helpers — unit-testable

/**
 * Filters an item array by a search query. Empty query returns input as-is.
 * Match is case-insensitive substring against item.label.
 */
function filterItems(items, query) {
  const q = String(query || '').trim().toLowerCase();
  if (!q) return items.slice();
  return items.filter((item) => String(item.label || '').toLowerCase().includes(q));
}

/**
 * Groups items by item.group string, preserving the order in which groups
 * first appeared. Returns [{ group, items: [...] }, ...].
 * Items without a group land under '' (empty string).
 */
function groupItems(items) {
  const order = [];
  const map = new Map();
  for (const item of items) {
    const key = String(item.group || '');
    if (!map.has(key)) {
      map.set(key, []);
      order.push(key);
    }
    map.get(key).push(item);
  }
  return order.map((group) => ({ group, items: map.get(group) }));
}

/**
 * Computes the viewport window. Given the total flattened row count
 * (including group headers), the cursor row index, and the height available
 * for rows, returns { offset, end } such that the cursor is always inside
 * [offset, end). Tries to keep cursor at the same position as long as
 * possible, scrolling the offset only when the cursor moves outside the
 * window.
 */
function buildWindow(totalRows, cursorRow, height, prevOffset = 0) {
  if (height <= 0 || totalRows <= 0) return { offset: 0, end: 0 };
  if (totalRows <= height) return { offset: 0, end: totalRows };

  let offset = prevOffset;
  if (cursorRow < offset) offset = cursorRow;
  if (cursorRow >= offset + height) offset = cursorRow - height + 1;
  if (offset < 0) offset = 0;
  if (offset + height > totalRows) offset = totalRows - height;
  return { offset, end: offset + height };
}

/**
 * Truncates a string to a max width with an ellipsis. Used to keep rows
 * within terminal columns without wrapping.
 */
function truncateMiddle(text, maxWidth) {
  const s = String(text || '');
  if (s.length <= maxWidth) return s;
  if (maxWidth <= 3) return '…';
  const head = Math.ceil((maxWidth - 1) / 2);
  const tail = Math.floor((maxWidth - 1) / 2);
  return s.slice(0, head) + '…' + s.slice(s.length - tail);
}

/**
 * Renders a single item line. Item shape:
 *   { id, label, checked, locked?, badge?, hint?, group? }
 *
 * locked = true:    [!]  rendered, item cannot be checked
 * checked = true:   [x]  rendered
 * checked = false:  [ ]  rendered
 *
 * Output format:
 *   [cursor] [box] [label]   [hint right-aligned]
 *
 * cursor = '> ' for the focused row, '  ' otherwise
 * If cols is too narrow, hint is dropped first, then label is middle-truncated.
 */
function formatRow(item, isFocus, cols) {
  const cursor = isFocus ? '\x1B[36m>\x1B[0m ' : '  ';
  const box = item.locked
    ? '\x1B[31m[!]\x1B[0m'
    : item.checked
      ? '\x1B[32m[x]\x1B[0m'
      : '[ ]';
  const badge = item.badge ? ` \x1B[33m${item.badge}\x1B[0m` : '';
  const hint = item.hint ? `  \x1B[2m${item.hint}\x1B[0m` : '';
  const labelMaxRaw = Math.max(20, cols - (4 + 4 + visibleLength(badge) + visibleLength(hint) + 2));
  const label = truncateMiddle(item.label, labelMaxRaw);
  return `${cursor}${box}${badge} ${label}${hint}`;
}

/**
 * Strips ANSI escape sequences and returns visible character length. Used
 * to compute how many real columns a styled string occupies.
 */
function visibleLength(text) {
  return String(text || '').replace(/\x1B\[[0-9;]*m/g, '').length;
}

// ────────────────────────────────────────────────────────────────────────────
// Interactive picker

/**
 * Builds a flat row list with group headers interleaved. Returns:
 *   [{ kind: 'header'|'item', group?, item?, originalIndex? }, ...]
 *
 * originalIndex is the index into the un-grouped, unfiltered original list.
 * It is preserved through filtering so toggle operations always target the
 * correct underlying state entry.
 */
function flattenForRender(grouped) {
  const flat = [];
  for (const { group, items } of grouped) {
    if (group) flat.push({ kind: 'header', group, count: items.length });
    for (const item of items) flat.push({ kind: 'item', item });
  }
  return flat;
}

function findFirstItemRow(flat) {
  for (let i = 0; i < flat.length; i += 1) {
    if (flat[i].kind === 'item') return i;
  }
  return -1;
}

function moveCursor(flat, currentRow, delta) {
  if (flat.length === 0) return -1;
  let row = currentRow;
  const total = flat.length;
  for (let step = 0; step < total + 1; step += 1) {
    row = (row + delta + total) % total;
    if (flat[row].kind === 'item') return row;
  }
  return currentRow;
}

const HELP_LINES = [
  '',
  '  Picker keyboard reference',
  '',
  '  ↑ / ↓               navigate items',
  '  PgUp / PgDn         jump 10 rows',
  '  Home / End          first / last item',
  '  Space               toggle current item',
  '  a                   check all (skips locked)',
  '  n                   uncheck all',
  '  i                   invert selection (skips locked)',
  '  /                   filter by substring (Esc clears)',
  '  Enter               confirm selection',
  '  Esc / Ctrl-C        cancel',
  '  ?                   toggle this help',
  '',
  '  Locked rows (\x1B[31m[!]\x1B[0m) are blocked by git-guard policy.',
  '  Pressing Space on a locked row shows the block reason.',
  '',
  '  Press any key to return to the picker.'
];

/**
 * Interactive picker. Main API.
 *
 * @param {Array} items    Each: { id, label, checked, locked?, badge?, hint?, group?, blockReason? }
 * @param {Object} options
 *   title       string  Header text. Default 'Pick items'.
 *   subtitle    string  Optional second header line (status summary).
 *   summary     fn(state) → string  Footer summary line built per render.
 * @returns {Promise<Array<string>|null>}  ids of checked items, or null on cancel.
 */
function promptPicker(items, options = {}) {
  return new Promise((resolve) => {
    const stdin = process.stdin;
    const stdout = process.stdout;
    const title = options.title || 'Pick items';
    const subtitle = options.subtitle || '';
    const summaryFn = typeof options.summary === 'function' ? options.summary : null;

    // Working state — clone item objects so caller's array is not mutated.
    const state = items.map((it) => ({ ...it }));

    let filterQuery = '';
    let filterMode = false;
    let helpOpen = false;
    let cursorRow = 0;
    let scrollOffset = 0;
    let lastBlockNotice = '';

    let grouped = groupItems(state);
    let flat = flattenForRender(grouped);
    cursorRow = findFirstItemRow(flat);

    const wasRaw = stdin.isRaw;
    if (stdin.setRawMode) stdin.setRawMode(true);
    stdin.resume();
    readline.emitKeypressEvents(stdin);

    // Enter alternate screen buffer — picker draws on its own surface.
    stdout.write('\x1B[?1049h\x1B[?25l'); // alt screen + hide cursor

    function rebuild() {
      const filtered = filterItems(state, filterQuery);
      grouped = groupItems(filtered);
      flat = flattenForRender(grouped);
      if (flat.length === 0) {
        cursorRow = -1;
        return;
      }
      // Keep cursor on a valid item row after filter changes.
      if (cursorRow < 0 || cursorRow >= flat.length || flat[cursorRow].kind !== 'item') {
        const first = findFirstItemRow(flat);
        cursorRow = first;
      }
    }

    function checkedCount() {
      return state.filter((s) => s.checked && !s.locked).length;
    }
    function lockedCount() {
      return state.filter((s) => s.locked).length;
    }

    function draw() {
      const cols = stdout.columns || 80;
      const rows = stdout.rows || 24;
      stdout.write('\x1B[H\x1B[J'); // home + clear

      // Header
      stdout.write(`\x1B[1m${title}\x1B[0m\n`);
      if (subtitle) stdout.write(`\x1B[2m${subtitle}\x1B[0m\n`);
      stdout.write(`\x1B[2m${'─'.repeat(Math.min(cols, 78))}\x1B[0m\n`);

      if (helpOpen) {
        for (const line of HELP_LINES) stdout.write(line + '\n');
        return;
      }

      // Compute viewport for rows
      const headerHeight = subtitle ? 3 : 3; // title + (subtitle?) + separator
      const footerHeight = 4 + (filterMode ? 1 : 0) + (lastBlockNotice ? 1 : 0);
      const available = Math.max(5, rows - headerHeight - footerHeight - 2);

      const totalRows = flat.length;
      const win = buildWindow(totalRows, Math.max(0, cursorRow), available, scrollOffset);
      scrollOffset = win.offset;

      if (totalRows === 0) {
        stdout.write('  (no items match the filter)\n');
      } else {
        for (let i = win.offset; i < win.end; i += 1) {
          const row = flat[i];
          if (row.kind === 'header') {
            stdout.write(`  \x1B[1;34m${row.group}\x1B[0m \x1B[2m(${row.count})\x1B[0m\n`);
          } else {
            const isFocus = i === cursorRow;
            stdout.write(formatRow(row.item, isFocus, cols) + '\n');
          }
        }
        // Pad remaining lines so the footer position is stable.
        const drawn = win.end - win.offset;
        for (let i = drawn; i < available; i += 1) stdout.write('\n');
      }

      // Pagination indicator
      const pageInfo = totalRows > available
        ? `[${win.offset + 1}-${win.end} of ${totalRows}]`
        : `[${totalRows} item${totalRows === 1 ? '' : 's'}]`;
      stdout.write(`\x1B[2m${'─'.repeat(Math.min(cols, 78))}\x1B[0m\n`);
      const summary = summaryFn ? summaryFn({
        checkedCount: checkedCount(),
        totalCount: state.length,
        lockedCount: lockedCount(),
        filteredCount: flat.filter((r) => r.kind === 'item').length
      }) : `${checkedCount()} selected · ${lockedCount()} locked · ${state.length} total`;
      stdout.write(`\x1B[36m${pageInfo}\x1B[0m  \x1B[2m${summary}\x1B[0m\n`);

      if (filterMode) {
        stdout.write(`\x1B[33m/${filterQuery}\x1B[0m\x1B[2m  (Esc clears, Enter confirms filter)\x1B[0m\n`);
      }
      if (lastBlockNotice) {
        stdout.write(`\x1B[31m${lastBlockNotice}\x1B[0m\n`);
      }
      stdout.write('\x1B[2m↑/↓ · Space · / · a/n/i · ? help · Enter · Esc\x1B[0m\n');
    }

    function cleanup() {
      if (stdin.setRawMode) stdin.setRawMode(wasRaw);
      stdin.pause();
      stdin.removeListener('keypress', onKeypress);
      stdout.write('\x1B[?25h\x1B[?1049l'); // show cursor + leave alt buffer
    }

    function confirm() {
      cleanup();
      resolve(state.filter((s) => s.checked && !s.locked).map((s) => s.id));
    }

    function cancel() {
      cleanup();
      resolve(null);
    }

    function moveBy(delta) {
      cursorRow = moveCursor(flat, cursorRow, delta);
      lastBlockNotice = '';
    }

    function onKeypress(str, key) {
      if (!key) return;
      lastBlockNotice = '';

      if (helpOpen) {
        helpOpen = false;
        draw();
        return;
      }

      if (filterMode) {
        if (key.name === 'escape') {
          filterMode = false;
          filterQuery = '';
          rebuild();
          draw();
          return;
        }
        if (key.name === 'return' || key.name === 'enter') {
          filterMode = false;
          draw();
          return;
        }
        if (key.name === 'backspace') {
          filterQuery = filterQuery.slice(0, -1);
          rebuild();
          draw();
          return;
        }
        if (str && str.length === 1 && !key.ctrl && !key.meta) {
          filterQuery += str;
          rebuild();
          draw();
          return;
        }
        return;
      }

      if (key.ctrl && key.name === 'c') return cancel();
      if (key.name === 'escape') return cancel();
      if (key.name === 'return' || key.name === 'enter') return confirm();

      if (key.name === '?' || str === '?') {
        helpOpen = true;
        draw();
        return;
      }
      if (key.name === '/' || str === '/') {
        filterMode = true;
        draw();
        return;
      }
      if (key.name === 'up') { moveBy(-1); draw(); return; }
      if (key.name === 'down') { moveBy(1); draw(); return; }
      if (key.name === 'pageup') { moveBy(-10); draw(); return; }
      if (key.name === 'pagedown') { moveBy(10); draw(); return; }
      if (key.name === 'home') {
        cursorRow = findFirstItemRow(flat);
        draw();
        return;
      }
      if (key.name === 'end') {
        for (let i = flat.length - 1; i >= 0; i -= 1) {
          if (flat[i].kind === 'item') { cursorRow = i; break; }
        }
        draw();
        return;
      }

      if (key.name === 'space' || str === ' ') {
        if (cursorRow < 0 || flat[cursorRow]?.kind !== 'item') return;
        const item = flat[cursorRow].item;
        if (item.locked) {
          lastBlockNotice = `Locked: ${item.blockReason || 'blocked by git-guard policy'}`;
        } else {
          item.checked = !item.checked;
        }
        draw();
        return;
      }

      if (str === 'a' || str === 'A') {
        for (const it of state) if (!it.locked) it.checked = true;
        draw();
        return;
      }
      if (str === 'n' || str === 'N') {
        for (const it of state) it.checked = false;
        draw();
        return;
      }
      if (str === 'i' || str === 'I') {
        for (const it of state) if (!it.locked) it.checked = !it.checked;
        draw();
        return;
      }
    }

    stdin.on('keypress', onKeypress);
    draw();
  });
}

module.exports = {
  promptPicker,
  // Pure helpers exported for unit tests
  filterItems,
  groupItems,
  buildWindow,
  truncateMiddle,
  formatRow,
  visibleLength
};
