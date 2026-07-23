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
