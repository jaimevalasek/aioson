'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { PassThrough } = require('node:stream');
const { runInstallWizard, __test__ } = require('../src/install-wizard');

function createMockStdin() {
  const stdin = new PassThrough();
  stdin.isTTY = true;
  stdin.isRaw = false;
  stdin._paused = true;
  stdin.setRawModeCalls = [];
  stdin.resumeCalls = 0;
  stdin.pauseCalls = 0;
  stdin.setRawMode = (value) => { stdin.isRaw = value; stdin.setRawModeCalls.push(value); };
  stdin.resume = () => { stdin.resumeCalls += 1; stdin._paused = false; return stdin; };
  stdin.pause = () => { stdin.pauseCalls += 1; stdin._paused = true; return stdin; };
  stdin.isPaused = () => stdin._paused;
  return stdin;
}

function createMockStdout() {
  return {
    isTTY: true,
    columns: 120,
    output: '',
    write(chunk) { this.output += String(chunk); return true; }
  };
}

// --- non-TTY / flag guards ---

test('runInstallWizard returns null when stdin is not TTY', async () => {
  const stdin = createMockStdin();
  stdin.isTTY = false;
  const result = await runInstallWizard({}, { stdin, stdout: createMockStdout() });
  assert.equal(result, null);
});

test('runInstallWizard returns null when stdout is not TTY', async () => {
  const stdout = createMockStdout();
  stdout.isTTY = false;
  const result = await runInstallWizard({}, { stdin: createMockStdin(), stdout });
  assert.equal(result, null);
});

test('runInstallWizard returns null when noInteractive is true', async () => {
  const result = await runInstallWizard({ noInteractive: true }, { stdin: createMockStdin(), stdout: createMockStdout() });
  assert.equal(result, null);
});

// --- cancellation ---

test('q key during screen1 returns null', async () => {
  const stdin = createMockStdin();
  const p = runInstallWizard({}, { stdin, stdout: createMockStdout() });
  await new Promise(resolve => setImmediate(resolve));
  stdin.emit('keypress', 'q', { name: 'q', ctrl: false });
  assert.equal(await p, null);
});

test('ctrl+c during screen1 returns null', async () => {
  const stdin = createMockStdin();
  const p = runInstallWizard({}, { stdin, stdout: createMockStdout() });
  await new Promise(resolve => setImmediate(resolve));
  stdin.emit('keypress', null, { name: 'c', ctrl: true });
  assert.equal(await p, null);
});

// --- static data ---

test('TOOLS list has 3 entries', () => {
  assert.equal(__test__.TOOLS.length, 3);
  assert.deepEqual(__test__.TOOLS.map(t => t.id), ['claude', 'codex', 'opencode']);
});

test('USES list has development locked and squads unlocked', () => {
  const dev = __test__.USES.find(u => u.id === 'development');
  const squads = __test__.USES.find(u => u.id === 'squads');
  assert.equal(dev.locked, true);
  assert.equal(squads.locked, false);
});

test('the wizard offers no design catalog — the engine ships with every profile', () => {
  assert.equal(__test__.DESIGNS, undefined);
  assert.equal(__test__.promptDesignCheckbox, undefined);
});

test('LOCALES list has 4 entries', () => {
  assert.equal(__test__.LOCALES.length, 4);
  assert.deepEqual(__test__.LOCALES.map(l => l.id), ['en', 'pt-BR', 'es', 'fr']);
});

// --- render functions ---

test('getBanner returns simple text on narrow terminal', () => {
  const banner = __test__.getBanner('1.0.0', { isTTY: true, columns: 40 });
  assert.ok(banner.includes('AIOSON v1.0.0'));
  assert.equal(banner.includes('╭'), false);
});

test('getBanner returns ASCII art on wide terminal', t => {
  const saved = process.env.TERM;
  t.after(() => { if (saved === undefined) delete process.env.TERM; else process.env.TERM = saved; });
  process.env.TERM = 'xterm';
  const banner = __test__.getBanner('1.0.0', { isTTY: true, columns: 120 });
  assert.ok(banner.includes('╭'));
  assert.ok(banner.includes('AI Operating Framework'));
});

test('renderScreen1 shows all tools and wizard step (1/3)', () => {
  const stdout = createMockStdout();
  __test__.renderScreen1(0, new Set(['claude']), false, stdout);
  assert.ok(stdout.output.includes('1/3'));
  assert.ok(stdout.output.includes('Claude Code'));
  assert.ok(stdout.output.includes('Codex (OpenAI)'));
  assert.ok(stdout.output.includes('OpenCode'));
});

test('renderScreen1 shows warning when warn=true', () => {
  const stdout = createMockStdout();
  __test__.renderScreen1(0, new Set(), true, stdout);
  assert.ok(stdout.output.includes('Select at least one tool'));
});

test('renderScreen2 shows development as always on and step (2/3)', () => {
  const stdout = createMockStdout();
  __test__.renderScreen2(0, new Set(['development']), false, stdout);
  assert.ok(stdout.output.includes('2/3'));
  assert.ok(stdout.output.includes('always on'));
  assert.ok(stdout.output.includes('Squads'));
});

test('renderScreen2 shows warning when warn is true', () => {
  const stdout = createMockStdout();
  __test__.renderScreen2(0, new Set(), true, stdout);
  assert.ok(stdout.output.includes('Select at least one use'));
});

test('renderScreen3 shows locale options and step (3/3) — no design screen in between', () => {
  const stdout = createMockStdout();
  __test__.renderScreen3(0, stdout);
  assert.ok(stdout.output.includes('3/3'));
  assert.equal(stdout.output.includes('design system'), false);
  assert.ok(stdout.output.includes('English'));
  assert.ok(stdout.output.includes('Português (Brasil)'));
  assert.ok(stdout.output.includes('Español'));
  assert.ok(stdout.output.includes('Français'));
});

test('renderConfirm shows tools, mode, the engine as the design line, and locale', () => {
  const stdout = createMockStdout();
  const mockT = (key) => key;
  __test__.renderConfirm(['claude', 'codex'], ['development', 'squads'], 'pt-BR', null, mockT, stdout);
  assert.ok(stdout.output.includes('Claude Code'));
  assert.ok(stdout.output.includes('Codex'));
  assert.ok(stdout.output.includes('Development + Squads'));
  assert.ok(stdout.output.includes('Interface Design (engine'));
  assert.ok(stdout.output.includes('Português (Brasil)'));
});

test('renderConfirm shows English for defaults and never a preset name', () => {
  const stdout = createMockStdout();
  const mockT = (key) => key;
  __test__.renderConfirm(['claude'], ['development'], 'en', null, mockT, stdout);
  assert.ok(stdout.output.includes('English'));
  assert.equal(/Clean SaaS|Aurora Command/.test(stdout.output), false);
});
