'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { MAX_INLINE_PROMPT_CHARS } = require('../src/agent-execution/adapters/prompt-file');

for (const host of ['kimi', 'grok']) {
  for (const exit of [0, 7]) test(`${host}: a large task survives argv limits and its file is removed after exit ${exit}`, async t => {
    const cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'aioson-prompt-file-'));
    t.after(() => fs.rm(cwd, { recursive: true, force: true }));
    const adapter = require(`../src/agent-execution/adapters/${host}`);
    const child = Object.create(adapter);
    const prompt = 'DEV/QA contract — recuperação\n'.repeat(MAX_INLINE_PROMPT_CHARS);
    let file;
    const received = [];
    child.build = input => {
      file = input.runtime_prompt_file;
      assert.ok(file.startsWith(path.join(cwd, '.aioson', 'runtime', 'adapter-prompts') + path.sep));
      const built = adapter.build(input);
      assert.equal(built.ok, true);
      assert.equal(built.args.includes(prompt), false);
      assert.ok(built.args.join(' ').length < MAX_INLINE_PROMPT_CHARS);
      if (host === 'grok') assert.deepEqual(built.args.slice(-2), ['--prompt-file', file]);
      else {
        const instruction = built.args[built.args.indexOf('--prompt') + 1];
        assert.ok(instruction.includes(JSON.stringify(file)));
        assert.match(instruction, /Read the entire file first/);
      }
      return { ...built, executable: process.execPath, args: ['-e', `process.stdout.write(require('node:fs').readFileSync(process.argv[1]));process.exitCode=${exit}`, file] };
    };
    const result = await child.execute({ mode: 'external', model: 'configured-default', cwd, prompt_text: prompt, onStdout: chunk => { received.push(chunk); } });
    assert.equal(result.ok, exit === 0);
    assert.equal(Buffer.concat(received).toString('utf8'), prompt);
    await assert.rejects(fs.access(file), { code: 'ENOENT' });
    assert.deepEqual(await fs.readdir(path.join(cwd, '.aioson/runtime/adapter-prompts')), []);
  });
}

test('aborted large tasks create no prompt file and do not spawn', async t => {
  const cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'aioson-prompt-abort-'));
  t.after(() => fs.rm(cwd, { recursive: true, force: true }));
  const controller = new AbortController(); controller.abort();
  const adapter = require('../src/agent-execution/adapters/kimi');
  const result = await adapter.execute({ mode: 'external', model: 'configured-default', cwd, prompt_text: 'x'.repeat(MAX_INLINE_PROMPT_CHARS + 1), signal: controller.signal, onSpawn: () => assert.fail('must not spawn') });
  assert.equal(result.reason, 'aborted');
  await assert.rejects(fs.access(path.join(cwd, '.aioson')), { code: 'ENOENT' });
});

test('a timed-out file-backed attempt removes its private task file', async t => {
  const cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'aioson-prompt-timeout-'));
  t.after(() => fs.rm(cwd, { recursive: true, force: true }));
  const adapter = require('../src/agent-execution/adapters/grok');
  const child = Object.create(adapter);
  let file;
  child.build = input => {
    file = input.runtime_prompt_file;
    return { ...adapter.build(input), executable: process.execPath, args: ['-e', 'setTimeout(()=>{},60000)'] };
  };
  const result = await child.execute({ mode: 'external', model: 'configured-default', cwd, prompt_text: 'x'.repeat(MAX_INLINE_PROMPT_CHARS + 1), timeout: 100 });
  assert.equal(result.reason, 'timeout');
  await assert.rejects(fs.access(file), { code: 'ENOENT' });
  assert.deepEqual(await fs.readdir(path.join(cwd, '.aioson/runtime/adapter-prompts')), []);
});
