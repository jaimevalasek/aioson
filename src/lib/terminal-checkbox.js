'use strict';

/**
 * Lightweight terminal checkbox UI using raw mode and keypress events.
 * No external dependencies.
 *
 * Bug history: the previous implementation used `\x1B[NA` (cursor up N) +
 * `\x1B[J` (clear from cursor) to redraw in place. That sequence is bounded
 * by the visible viewport — when the rendered list overflows past the
 * terminal's row count, content scrolls out of reach of the cursor-up move,
 * "clear from cursor" only touches the visible portion, and each subsequent
 * draw stacks new content below the orphaned old lines (the "duplica tudo"
 * regression in commit:prepare with many files).
 *
 * Fix: enter the alternate screen buffer on start (\x1B[?1049h) and clear
 * the whole screen with `\x1B[H\x1B[J` (cursor home + clear) on each draw.
 * On exit, leave the alt buffer (\x1B[?1049l) so the user's terminal and
 * scrollback are restored exactly as before — same TUI pattern as vim/less.
 *
 * For richer pickers (filtering, grouping, pagination, risk annotations),
 * see `terminal-picker.js`. This module stays small and API-stable for
 * existing callers (install-wizard, briefing).
 */

const readline = require('node:readline');

function render(items, selectedIndex, hint) {
  const lines = items.map((item, index) => {
    const marker = item.checked ? '[x]' : '[ ]';
    const prefix = index === selectedIndex ? '> ' : '  ';
    return `${prefix}${marker} ${item.label}`;
  });
  lines.push('');
  lines.push(hint);
  return lines.join('\n');
}

function promptCheckbox(items, hint = '↑/↓ navegar | Espaço selecionar | Enter confirmar | Esc cancelar | a=todos | n=limpar') {
  return new Promise((resolve) => {
    const state = items.map((label) => ({ label, checked: true }));
    let selectedIndex = 0;

    const stdin = process.stdin;
    const stdout = process.stdout;

    const wasRaw = stdin.isRaw;
    if (stdin.setRawMode) {
      stdin.setRawMode(true);
    }
    stdin.resume();
    readline.emitKeypressEvents(stdin);

    // Enter alternate screen buffer + hide cursor.
    stdout.write('\x1B[?1049h\x1B[?25l');

    function draw() {
      stdout.write('\x1B[H\x1B[J'); // cursor home + clear screen
      stdout.write(render(state, selectedIndex, hint) + '\n');
    }

    function cleanup() {
      if (stdin.setRawMode) {
        stdin.setRawMode(wasRaw);
      }
      stdin.pause();
      stdin.removeListener('keypress', onKeypress);
      // Show cursor + leave alt buffer — terminal restored to prior state.
      stdout.write('\x1B[?25h\x1B[?1049l');
    }

    function confirm() {
      cleanup();
      resolve(state.filter((s) => s.checked).map((s) => s.label));
    }

    function cancel() {
      cleanup();
      resolve(null);
    }

    function onKeypress(str, key) {
      if (!key) return;

      if (key.name === 'c' && key.ctrl) {
        cancel();
        return;
      }

      if (key.name === 'escape') {
        cancel();
        return;
      }

      if (key.name === 'return' || key.name === 'enter') {
        confirm();
        return;
      }

      if (key.name === 'up') {
        selectedIndex = selectedIndex > 0 ? selectedIndex - 1 : state.length - 1;
        draw();
        return;
      }

      if (key.name === 'down') {
        selectedIndex = selectedIndex < state.length - 1 ? selectedIndex + 1 : 0;
        draw();
        return;
      }

      if (key.name === 'space') {
        state[selectedIndex].checked = !state[selectedIndex].checked;
        draw();
        return;
      }

      if (str === 'a' || str === 'A') {
        state.forEach((s) => { s.checked = true; });
        draw();
        return;
      }

      if (str === 'n' || str === 'N') {
        state.forEach((s) => { s.checked = false; });
        draw();
        return;
      }
    }

    stdin.on('keypress', onKeypress);
    draw();
  });
}

module.exports = { promptCheckbox };
