'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const { runStateSave } = require('../src/commands/state-save');

async function makeTmpDir() {
  return fs.mkdtemp(path.join(os.tmpdir(), 'aioson-state-save-'));
}

async function writeFile(dir, relPath, content) {
  const full = path.join(dir, relPath);
  await fs.mkdir(path.dirname(full), { recursive: true });
  await fs.writeFile(full, content, 'utf8');
}

function makeLogger() {
  const lines = [];
  const errors = [];
  return {
    log: (msg = '') => lines.push(String(msg)),
    error: (msg = '') => errors.push(String(msg)),
    lines,
    errors
  };
}

test('state:save: requires --feature', async () => {
  const tmpDir = await makeTmpDir();
  const result = await runStateSave({
    args: [tmpDir],
    options: { json: true, next: 'Do something' },
    logger: makeLogger()
  });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'missing_feature');
});

test('state:save: requires --next', async () => {
  const tmpDir = await makeTmpDir();
  const result = await runStateSave({
    args: [tmpDir],
    options: { json: true, feature: 'checkout' },
    logger: makeLogger()
  });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'missing_next');
});

test('state:save: creates dev-state.md with correct content', async () => {
  const tmpDir = await makeTmpDir();
  const result = await runStateSave({
    args: [tmpDir],
    options: {
      json: true,
      feature: 'checkout',
      phase: '3',
      next: 'Implement notification listeners',
      'spec-version': '4',
      status: 'in_progress'
    },
    logger: makeLogger()
  });
  assert.equal(result.ok, true);

  const statePath = path.join(tmpDir, '.aioson', 'context', 'dev-state.md');
  const content = await fs.readFile(statePath, 'utf8');
  assert.ok(content.includes('active_feature: checkout'));
  assert.ok(content.includes('active_phase: 3'));
  assert.ok(content.includes('Implement notification listeners'));
  assert.ok(content.includes('last_spec_version: 4'));
});

test('state:save: json returns correct fields', async () => {
  const tmpDir = await makeTmpDir();
  const result = await runStateSave({
    args: [tmpDir],
    options: {
      json: true,
      feature: 'cart',
      phase: '2',
      next: 'Write tests',
      status: 'in_progress'
    },
    logger: makeLogger()
  });
  assert.equal(result.active_feature, 'cart');
  assert.equal(result.active_phase, '2');
  assert.equal(result.next_step, 'Write tests');
});

test('state:save: auto-detect includes the canonical Planner plan instead of a legacy spec', async () => {
  const tmpDir = await makeTmpDir();
  await writeFile(tmpDir, '.aioson/context/implementation-plan-checkout.md', '---\nstatus: approved\n---');
  const result = await runStateSave({
    args: [tmpDir],
    options: { json: true, feature: 'checkout', next: 'Continue', status: 'in_progress' },
    logger: makeLogger()
  });
  assert.ok(result.context_package.some((p) => p.includes('implementation-plan-checkout.md')));
  assert.equal(result.context_package.some((p) => p.includes('spec-checkout.md')), false);
});

test('state:save: updates existing dev-state.md preserving history', async () => {
  const tmpDir = await makeTmpDir();
  await writeFile(tmpDir, '.aioson/context/dev-state.md',
    '---\nactive_feature: checkout\n---\n## History\n\n- 2026-01-01: phase 1 — first step\n');

  await runStateSave({
    args: [tmpDir],
    options: { json: true, feature: 'checkout', phase: '2', next: 'Second step', status: 'in_progress' },
    logger: makeLogger()
  });

  const content = await fs.readFile(path.join(tmpDir, '.aioson', 'context', 'dev-state.md'), 'utf8');
  assert.ok(content.includes('Second step'));
  assert.ok(content.includes('History'));
});

test('state:save: human output confirms save', async () => {
  const tmpDir = await makeTmpDir();
  const logger = makeLogger();
  await runStateSave({
    args: [tmpDir],
    options: { feature: 'feat', next: 'Next step', status: 'in_progress' },
    logger
  });
  assert.ok(logger.lines.some((l) => l.includes('active_feature') || l.includes('updated') || l.includes('next_step')));
});

// ─── resume state per feature (parallel-sessions, AC-parallel-sessions-25) ───
// Each feature has its own dev state, so the @dev of one never resumes from
// what the @dev of another wrote last. The project-level dev-state.md stays as
// a copy of the last write.

const { runStateReset } = require('../src/commands/state-save');

function historyLines(content) {
  return content.split(/\r?\n/).filter((line) => line.startsWith('- '));
}

async function readContext(dir, rel) {
  return fs.readFile(path.join(dir, '.aioson', 'context', rel), 'utf8');
}

test('AC-parallel-sessions-25 dev:state:write of two features do not overwrite each other', async () => {
  const dir = await makeTmpDir();
  try {
    const write = (options) => runStateSave({ args: [dir], options: { json: true, ...options }, logger: makeLogger() });

    const first = await write({ feature: 'checkout', phase: '2', next: 'Checkout phase 3: payment webhook' });
    assert.equal(first.feature_path.split(path.sep).join('/'), '.aioson/context/features/checkout/dev-state.md');
    assert.equal(first.path.split(path.sep).join('/'), '.aioson/context/dev-state.md');
    await write({ feature: 'billing', phase: '1', next: 'Billing phase 2: invoices' });

    const checkout = await readContext(dir, 'features/checkout/dev-state.md');
    assert.match(checkout, /^active_feature: checkout$/m);
    assert.match(checkout, /^active_phase: 2$/m);
    assert.match(checkout, /^next_step: "Checkout phase 3: payment webhook"$/m);
    assert.deepEqual(historyLines(checkout).length, 1);

    const billing = await readContext(dir, 'features/billing/dev-state.md');
    assert.match(billing, /^active_feature: billing$/m);
    assert.match(billing, /^active_phase: 1$/m);
    assert.doesNotMatch(billing, /Checkout/, 'the history of another feature is not inherited');

    // The project-level file is a copy of the last one written.
    assert.equal(await readContext(dir, 'dev-state.md'), billing);

    // Checkout goes on from its own phase and history, not from billing's.
    await write({ feature: 'checkout', next: 'Checkout phase 3: retries' });
    const checkoutAgain = await readContext(dir, 'features/checkout/dev-state.md');
    assert.match(checkoutAgain, /^active_phase: 2$/m, 'a write without --phase keeps the phase of this feature');
    assert.deepEqual(
      historyLines(checkoutAgain).map((line) => line.replace(/^- \d{4}-\d{2}-\d{2}: /, '')),
      ['phase 2 — Checkout phase 3: payment webhook', 'phase 2 — Checkout phase 3: retries']
    );
    assert.equal(await readContext(dir, 'dev-state.md'), checkoutAgain);
    assert.equal(await readContext(dir, 'features/billing/dev-state.md'), billing, 'billing is untouched');
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test('AC-parallel-sessions-25 a feature continues a project-level state that is its own, and a single feature writes what it always wrote', async () => {
  const dir = await makeTmpDir();
  try {
    // A state written before features had their own file.
    await writeFile(dir, '.aioson/context/dev-state.md', [
      '---', 'last_updated: 2026-01-01', 'active_feature: checkout', 'active_phase: 4', 'next_step: "old step"', 'status: in_progress', '---',
      '', '# Dev State', '', '## History', '', '- 2026-01-01: phase 4 — old step', ''
    ].join('\n'));

    const result = await runStateSave({ args: [dir], options: { feature: 'checkout', next: 'new step', json: true }, logger: makeLogger() });
    assert.equal(result.ok, true);
    const shared = await readContext(dir, 'dev-state.md');
    assert.match(shared, /^active_phase: 4$/m);
    assert.deepEqual(
      historyLines(shared).map((line) => line.replace(/^- \d{4}-\d{2}-\d{2}: /, '')),
      ['phase 4 — old step', 'phase 4 — new step']
    );
    assert.equal(await readContext(dir, 'features/checkout/dev-state.md'), shared);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test('AC-parallel-sessions-25 a --feature that cannot name a folder writes only the project-level state', async () => {
  const dir = await makeTmpDir();
  try {
    const result = await runStateSave({ args: [dir], options: { feature: '../escape', next: 'step', json: true }, logger: makeLogger() });
    assert.equal(result.ok, true);
    assert.equal(result.feature_path, null);
    assert.match(result.warnings.join('\n'), /cannot name a feature folder/);
    await fs.access(path.join(dir, '.aioson', 'context', 'dev-state.md'));
    assert.deepEqual(await fs.readdir(path.join(dir, '.aioson', 'context')), ['dev-state.md']);
    await assert.rejects(() => fs.access(path.join(dir, '.aioson', 'escape')));
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test('AC-parallel-sessions-25 state:reset --feature clears that feature and leaves the other one resumable', async () => {
  const dir = await makeTmpDir();
  try {
    const write = (options) => runStateSave({ args: [dir], options: { json: true, ...options }, logger: makeLogger() });
    await write({ feature: 'checkout', phase: '2', next: 'checkout next' });
    await write({ feature: 'billing', phase: '1', next: 'billing next' });

    // The project-level file names billing: resetting checkout leaves it.
    const reset = await runStateReset({ args: [dir], options: { feature: 'checkout', archive: true, json: true }, logger: makeLogger() });
    assert.deepEqual([reset.ok, reset.removed, reset.feature_state_removed], [true, true, true]);
    assert.match(reset.archived.split(path.sep).join('/'), /^\.aioson\/runtime\/devstate-history\/.+-checkout\.md$/);
    await assert.rejects(() => fs.access(path.join(dir, '.aioson/context/features/checkout/dev-state.md')));
    assert.match(await readContext(dir, 'dev-state.md'), /^active_feature: billing$/m);
    assert.match(await readContext(dir, 'features/billing/dev-state.md'), /^next_step: "billing next"$/m);

    const again = await runStateReset({ args: [dir], options: { feature: 'checkout', json: true }, logger: makeLogger() });
    assert.deepEqual([again.removed, again.reason, again.active_feature], [false, 'points_to_other', 'billing']);

    // Without --feature the pointer goes, and with it the own file of the feature it names.
    const all = await runStateReset({ args: [dir], options: { json: true }, logger: makeLogger() });
    assert.deepEqual([all.removed, all.feature_state_removed], [true, true]);
    await assert.rejects(() => fs.access(path.join(dir, '.aioson/context/dev-state.md')));
    await assert.rejects(() => fs.access(path.join(dir, '.aioson/context/features/billing/dev-state.md')));
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});
