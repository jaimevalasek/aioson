'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { renderRevealAnimation, renderProgress, renderInstallSummary } = require('../src/install-animation');

function createMockStdout(options = {}) {
  return {
    isTTY: options.isTTY !== undefined ? options.isTTY : true,
    columns: options.columns || 120,
    output: '',
    write(chunk) {
      this.output += String(chunk);
      return true;
    }
  };
}

// renderRevealAnimation — non-TTY
test('renderRevealAnimation does not write anything on non-TTY', async () => {
  const stdout = createMockStdout({ isTTY: false });
  await renderRevealAnimation('1.0.0', stdout);
  assert.equal(stdout.output, '');
});

// renderRevealAnimation — dumb terminal (via TERM env)
test('renderRevealAnimation skips on TERM=dumb', async t => {
  const saved = process.env.TERM;
  t.after(() => { if (saved === undefined) delete process.env.TERM; else process.env.TERM = saved; });
  process.env.TERM = 'dumb';
  const stdout = createMockStdout({ isTTY: true });
  await renderRevealAnimation('1.0.0', stdout);
  assert.equal(stdout.output, '');
});

// renderRevealAnimation — narrow terminal
test('renderRevealAnimation skips on narrow terminal (< 50 columns)', async () => {
  const stdout = createMockStdout({ isTTY: true, columns: 40 });
  await renderRevealAnimation('1.0.0', stdout);
  assert.equal(stdout.output, '');
});

// renderRevealAnimation — NO_COLOR
test('renderRevealAnimation with NO_COLOR omits ANSI color codes', async t => {
  const saved = { TERM: process.env.TERM, NO_COLOR: process.env.NO_COLOR };
  t.after(() => { for (const [key, value] of Object.entries(saved)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; } });
  process.env.TERM = 'xterm';
  process.env.NO_COLOR = '1';
  const stdout = createMockStdout({ isTTY: true, columns: 120 });
  await renderRevealAnimation('1.0.0', stdout);
  // Should not contain color escape sequences
  assert.equal(/\x1b\[[\d;]*m/.test(stdout.output), false);
  // But should still have ASCII art content
  assert.ok(stdout.output.length > 0);
});

// renderProgress — non-TTY
test('renderProgress does not write on non-TTY', () => {
  const stdout = createMockStdout({ isTTY: false });
  renderProgress({ copied: 5, total: 10, file: 'foo.md' }, stdout);
  assert.equal(stdout.output, '');
});

// renderProgress — TTY writes something
test('renderProgress writes progress line on TTY', () => {
  const stdout = createMockStdout({ isTTY: true });
  renderProgress({ copied: 5, total: 10, file: 'foo.md' }, stdout);
  assert.ok(stdout.output.includes('5/10'));
});

// renderProgress — long file name gets truncated
test('renderProgress truncates long file names', () => {
  const stdout = createMockStdout({ isTTY: true });
  const longFile = '.aioson/agents/' + 'x'.repeat(40) + '.md';
  renderProgress({ copied: 1, total: 10, file: longFile }, stdout);
  assert.ok(stdout.output.includes('...'));
});

// renderInstallSummary — non-TTY
test('renderInstallSummary outputs plain text on non-TTY', () => {
  const stdout = createMockStdout({ isTTY: false });
  const result = { copied: ['a.md', 'b.md'], skipped: [{ path: 'c.md', reason: 'already-exists' }] };
  renderInstallSummary({ result, installProfile: null, stdout });
  assert.ok(stdout.output.includes('installed 2 files'));
  assert.ok(stdout.output.includes('1 already exist'));
  assert.ok(stdout.output.includes('run /setup'));
});

// renderInstallSummary — null profile shows "All"
test('renderInstallSummary with null profile shows "All" for tools', () => {
  const stdout = createMockStdout({ isTTY: false });
  const result = { copied: [], skipped: [] };
  renderInstallSummary({ result, installProfile: null, stdout });
  assert.ok(stdout.output.includes('tools=all'));
});

// renderInstallSummary — with profile shows tool names
test('renderInstallSummary with profile shows formatted tool names on TTY', () => {
  const stdout = createMockStdout({ isTTY: true });
  const result = {
    copied: new Array(62).fill('x'),
    skipped: Array.from({ length: 18 }, () => ({ path: 'x', reason: 'not-in-profile' }))
  };
  const profile = { tools: ['claude', 'codex'], uses: ['development', 'squads'] };
  renderInstallSummary({ result, installProfile: profile, stdout });
  assert.ok(stdout.output.includes('Claude Code'));
  assert.ok(stdout.output.includes('Codex'));
  assert.ok(stdout.output.includes('Development + Squads'));
});

// renderInstallSummary — shows "(not in profile)" for profile-skipped files
test('renderInstallSummary shows "(not in profile)" for profile-skipped files', () => {
  const stdout = createMockStdout({ isTTY: true });
  const result = { copied: [], skipped: [{ path: 'AGENTS.md', reason: 'not-in-profile' }] };
  const profile = { tools: ['claude'], uses: ['development'] };
  renderInstallSummary({ result, installProfile: profile, stdout });
  assert.ok(stdout.output.includes('not in profile'));
});

// renderInstallSummary — shows "already up to date" for existing files
test('renderInstallSummary shows "already up to date" for already-exists files', () => {
  const stdout = createMockStdout({ isTTY: true });
  const result = { copied: [], skipped: [{ path: 'CLAUDE.md', reason: 'already-exists' }] };
  renderInstallSummary({ result, installProfile: null, stdout });
  assert.ok(stdout.output.includes('already up to date'));
});

// renderInstallSummary — mixed skip reasons show both
test('renderInstallSummary shows both skip reasons when mixed', () => {
  const stdout = createMockStdout({ isTTY: true });
  const result = {
    copied: ['a.md'],
    skipped: [
      { path: 'CLAUDE.md', reason: 'already-exists' },
      { path: 'AGENTS.md', reason: 'not-in-profile' }
    ]
  };
  const profile = { tools: ['claude'], uses: ['development'] };
  renderInstallSummary({ result, installProfile: profile, stdout });
  assert.ok(stdout.output.includes('already up to date'));
  assert.ok(stdout.output.includes('not in profile'));
});

// renderInstallSummary — Development only (no squads)
test('renderInstallSummary shows "Development" mode without squads', () => {
  const stdout = createMockStdout({ isTTY: true });
  const result = { copied: [], skipped: [] };
  const profile = { tools: ['claude'], uses: ['development'] };
  renderInstallSummary({ result, installProfile: profile, stdout });
  assert.ok(stdout.output.includes('Development'));
  assert.equal(stdout.output.includes('Squads'), false);
});
