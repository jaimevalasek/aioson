'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');

// Leave ample room for executable, model and permission flags on Windows.
// This changes transport only: the complete task and report binding are retained.
const MAX_INLINE_PROMPT_CHARS = 16000;

function withPromptFile(adapter) {
  const execute = adapter.execute;
  adapter.execute = async function (input) {
    const prompt = String(input.prompt_text || '');
    if (prompt.length <= MAX_INLINE_PROMPT_CHARS || input.signal?.aborted) return execute.call(this, input);
    const root = path.resolve(input.cwd || process.cwd(), '.aioson/runtime/adapter-prompts');
    await fs.mkdir(root, { recursive: true });
    const dir = await fs.mkdtemp(path.join(root, `${adapter.host}-`));
    const file = path.join(dir, 'task.md');
    try {
      await fs.writeFile(file, prompt, { encoding: 'utf8', mode: 0o600 });
      return await execute.call(this, { ...input, runtime_prompt_file: file });
    } finally {
      await fs.unlink(file).catch(() => {});
      // Never recursively remove a directory a worker could have written into.
      await fs.rmdir(dir).catch(() => {});
    }
  };
  return adapter;
}

function promptFileInstruction(file) {
  return `Execute the approved AIOSON task in the UTF-8 file ${JSON.stringify(file)}. Read the entire file first: it contains your DEV/QA role, authorized scope, verification and the exact report contract for this attempt. Follow that contract and preserve existing work.`;
}

module.exports = { withPromptFile, promptFileInstruction, MAX_INLINE_PROMPT_CHARS };
