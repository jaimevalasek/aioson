'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { notesRelative, readNotes, continuityPrompt, MAX_BYTES } = require('../src/agent-execution/execution-notes');

test('continuity isolates role/run notes, bounds file reads and treats missing notes as unknown', async t => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'execution-notes-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const relative = notesRelative('feature', 'run1', 'unit1', 'dev');
  await fs.mkdir(path.dirname(path.join(dir, relative)), { recursive: true });
  await fs.writeFile(path.join(dir, relative), 'Implemented parser; tests pending.');
  const args = { projectDir: dir, feature: 'feature', runId: 'run1', unit: { id: 'unit1' }, stage: 'dev' };
  assert.match(await continuityPrompt(args), /Implemented parser; tests pending/);
  assert.doesNotMatch(await continuityPrompt({ ...args, stage: 'qa' }), /Implemented parser/);
  assert.doesNotMatch(await continuityPrompt({ ...args, runId: 'run2' }), /Implemented parser/);
  assert.equal(await readNotes(dir, '../outside.md'), '');
  await fs.writeFile(path.join(dir, relative), 'Initial contract\n' + 'ç🧩'.repeat(MAX_BYTES) + '\nLatest repair passed; runner=session-42; log=checks.log; exit=0');
  const bounded = await readNotes(dir, relative);
  assert.ok(Buffer.byteLength(bounded) <= MAX_BYTES);
  assert.match(bounded, /^Initial contract/);
  assert.match(bounded, /middle omitted/);
  assert.match(bounded, /Latest repair passed; runner=session-42/);
  assert.match(await continuityPrompt(args), /Latest repair passed/);
  assert.match(await continuityPrompt(args), /Poll that same execution/);
});
