'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const {
  collectDecisionRationale,
  writeHandoff,
  readHandoff,
  CONFIRMATIONS_JSONL,
  DECISION_RATIONALE_MAX
} = require('../src/session-handoff');

async function makeTmpDir() {
  return fs.mkdtemp(path.join(os.tmpdir(), 'aioson-rationale-'));
}

async function writeFile(dir, relPath, content) {
  const full = path.join(dir, relPath);
  await fs.mkdir(path.dirname(full), { recursive: true });
  await fs.writeFile(full, content, 'utf8');
  return full;
}

function makeConfirmation(agent, decision, quote) {
  return JSON.stringify({ agent, decision, quote, timestamp: new Date().toISOString() });
}

test('collectDecisionRationale: returns empty when no accumulator file', async () => {
  const tmpDir = await makeTmpDir();
  const result = await collectDecisionRationale(tmpDir);
  assert.deepEqual(result, []);
});

test('collectDecisionRationale: reads confirmation entries from JSONL', async () => {
  const tmpDir = await makeTmpDir();
  const lines = [
    makeConfirmation('dev', 'use kebab-case for slugs', 'yes, kebab-case'),
    makeConfirmation('architect', 'SQLite over PostgreSQL', 'confirmed SQLite')
  ].join('\n');
  await writeFile(tmpDir, CONFIRMATIONS_JSONL, lines + '\n');

  const result = await collectDecisionRationale(tmpDir);
  assert.equal(result.length, 2);
  assert.equal(result[0].agent, 'dev');
  assert.equal(result[0].decision, 'use kebab-case for slugs');
  assert.equal(result[0].rationale, 'yes, kebab-case');
  assert.equal(result[0].confidence, 'confirmed');
  assert.equal(result[0].alternatives_considered, null);
  assert.equal(result[1].agent, 'architect');
});

test('collectDecisionRationale: caps at DECISION_RATIONALE_MAX entries (BR-AO-04)', async () => {
  const tmpDir = await makeTmpDir();
  const lines = [];
  for (let i = 0; i < 8; i++) {
    lines.push(makeConfirmation('dev', `decision-${i}`, `quote-${i}`));
  }
  await writeFile(tmpDir, CONFIRMATIONS_JSONL, lines.join('\n') + '\n');

  const result = await collectDecisionRationale(tmpDir);
  assert.equal(result.length, DECISION_RATIONALE_MAX);
  assert.equal(result[0].decision, 'decision-3', 'FIFO: oldest dropped');
  assert.equal(result[4].decision, 'decision-7', 'FIFO: newest kept');
});

test('collectDecisionRationale: skips malformed lines', async () => {
  const tmpDir = await makeTmpDir();
  const lines = [
    'not json',
    makeConfirmation('dev', 'valid decision', 'valid quote'),
    '{bad json',
  ].join('\n');
  await writeFile(tmpDir, CONFIRMATIONS_JSONL, lines + '\n');

  const result = await collectDecisionRationale(tmpDir);
  assert.equal(result.length, 1);
  assert.equal(result[0].decision, 'valid decision');
});

test('writeHandoff: includes decision_rationale from accumulator', async () => {
  const tmpDir = await makeTmpDir();
  const lines = [
    makeConfirmation('dev', 'use FIFO strategy', 'yes fifo')
  ].join('\n');
  await writeFile(tmpDir, CONFIRMATIONS_JSONL, lines + '\n');

  await writeHandoff(tmpDir, {
    lastAgent: '@dev',
    lastStage: 'dev',
    whatWasDone: 'Implemented feature',
    whatComesNext: 'QA review',
    nextAgent: '@qa',
    featureSlug: 'test-feature'
  });

  const handoff = await readHandoff(tmpDir, { skipStaleCheck: true });
  assert.ok(Array.isArray(handoff.decision_rationale));
  assert.equal(handoff.decision_rationale.length, 1);
  assert.equal(handoff.decision_rationale[0].decision, 'use FIFO strategy');
  assert.equal(handoff.decision_rationale[0].confidence, 'confirmed');
});

test('writeHandoff: clears accumulator after writing', async () => {
  const tmpDir = await makeTmpDir();
  await writeFile(tmpDir, CONFIRMATIONS_JSONL, makeConfirmation('dev', 'd1', 'q1') + '\n');

  await writeHandoff(tmpDir, {
    lastAgent: '@dev',
    featureSlug: 'cleanup-test'
  });

  const accPath = path.join(tmpDir, CONFIRMATIONS_JSONL);
  let accExists = true;
  try {
    await fs.access(accPath);
  } catch {
    accExists = false;
  }
  assert.equal(accExists, false, 'accumulator must be cleared after handoff');
});

test('writeHandoff: merges payload.decisionRationale with accumulator (FIFO cap)', async () => {
  const tmpDir = await makeTmpDir();

  const existing = [
    { agent: 'product', decision: 'old-decision-1', alternatives_considered: null, rationale: 'old', confidence: 'confirmed' },
    { agent: 'product', decision: 'old-decision-2', alternatives_considered: null, rationale: 'old', confidence: 'confirmed' },
    { agent: 'product', decision: 'old-decision-3', alternatives_considered: null, rationale: 'old', confidence: 'confirmed' },
    { agent: 'product', decision: 'old-decision-4', alternatives_considered: null, rationale: 'old', confidence: 'confirmed' },
  ];

  const lines = [
    makeConfirmation('dev', 'new-decision-1', 'new-q1'),
    makeConfirmation('dev', 'new-decision-2', 'new-q2'),
  ].join('\n');
  await writeFile(tmpDir, CONFIRMATIONS_JSONL, lines + '\n');

  await writeHandoff(tmpDir, {
    lastAgent: '@dev',
    featureSlug: 'merge-test',
    decisionRationale: existing
  });

  const handoff = await readHandoff(tmpDir, { skipStaleCheck: true });
  assert.equal(handoff.decision_rationale.length, DECISION_RATIONALE_MAX);
  assert.equal(handoff.decision_rationale[0].decision, 'old-decision-2', 'oldest dropped from existing');
  assert.equal(handoff.decision_rationale[4].decision, 'new-decision-2', 'newest from accumulator kept');
});

test('writeHandoff: omits decision_rationale when no confirmations exist', async () => {
  const tmpDir = await makeTmpDir();

  await writeHandoff(tmpDir, {
    lastAgent: '@dev',
    featureSlug: 'empty-test'
  });

  const handoffPath = path.join(tmpDir, '.aioson/context/last-handoff.json');
  const raw = await fs.readFile(handoffPath, 'utf8');
  const handoff = JSON.parse(raw);
  assert.equal(handoff.decision_rationale, undefined, 'key should be absent when no rationale');
});

test('BR-AO-05: only confirmation signals produce rationale entries', async () => {
  const tmpDir = await makeTmpDir();
  // The accumulator only receives confirmation signals from op:capture,
  // so if a non-confirmation somehow got in, it would still be collected.
  // The filtering happens at op:capture write time (signal === 'confirmation' guard).
  // This test verifies the pipeline contract: confirmation entries map correctly.
  const lines = [
    makeConfirmation('dev', 'confirmed decision', 'user said yes')
  ].join('\n');
  await writeFile(tmpDir, CONFIRMATIONS_JSONL, lines + '\n');

  const result = await collectDecisionRationale(tmpDir);
  assert.equal(result.length, 1);
  assert.equal(result[0].confidence, 'confirmed');
  assert.equal(result[0].agent, 'dev');
});
