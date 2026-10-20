'use strict';

// The selector's project-learnings lane (`selection.memory`, surfaced by
// context:brief/context:select): a learning comes back for a task sentence
// that shares two different words with it, never for one shared word.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const { openRuntimeDb, insertProjectLearning } = require('../src/runtime-store');
const { selectContext } = require('../src/context-selector');

async function makeProject() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'aioson-memory-lane-'));
  await fs.mkdir(path.join(dir, '.aioson', 'context'), { recursive: true });
  await fs.writeFile(path.join(dir, '.aioson', 'config.md'), '# config\n');
  const { db } = await openRuntimeDb(dir);
  try {
    insertProjectLearning(db, {
      learningId: 'pl-stripe-idempotency',
      projectName: 'fixture',
      type: 'quality',
      title: 'Stripe webhook must check the Idempotency-Key before charging',
      evidence: 'duplicate charge in checkout webhook retries',
      status: 'active'
    });
  } finally {
    db.close();
  }
  return dir;
}

const memoryFor = async (dir, task) => (await selectContext(dir, { agent: 'dev', mode: 'executing', task })).memory || [];

test('a task sentence reaches the learning it shares words with, in English and pt-BR', async () => {
  const dir = await makeProject();
  for (const task of [
    'stripe webhook idempotency',
    'fix the stripe webhook retry that charges twice in checkout',
    'corrigir o webhook do stripe que cobra duas vezes no checkout'
  ]) {
    const memory = await memoryFor(dir, task);
    assert.deepEqual(memory.map((hit) => hit.target_id), ['pl-stripe-idempotency'], task);
    assert.match(memory[0].reason, /^memory_fts:/);
  }
});

test('one shared word, or a word and its singular, is not enough', async () => {
  const dir = await makeProject();
  assert.deepEqual(await memoryFor(dir, 'redesign the checkout dashboard widgets'), []);
  assert.deepEqual(await memoryFor(dir, 'charges'), [], '`charges` + `charge` is one word of the task');
});
