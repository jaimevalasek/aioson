'use strict';

const { createAdapter } = require('./base');
const { withPromptFile, promptFileInstruction } = require('./prompt-file');

// Official Kimi Code non-interactive contract:
// kimi [-m <model>] -p <prompt> --output-format text [--add-dir <dir> ...]
// sandbox_mode is translated by the registry (src/lib/tool-capabilities.js)
// through createAdapter: 'read-only' → plan; 'workspace-write' → the
// registry's unattended flag (a lane worker edits files and runs tests
// non-interactively).
// Current kimi-code has no documented text-stdin print flag. Large tasks use
// an explicit read-first task file instead of the incompatible legacy --print.
module.exports = withPromptFile(createAdapter('kimi', (input) => [
  ...(input.sandbox_args || []),
  ...(input.model === 'configured-default' ? [] : ['--model', input.model]),
  ...(input.writable_roots || []).flatMap((root) => ['--add-dir', root]),
  '--prompt',
  input.runtime_prompt_file ? promptFileInstruction(input.runtime_prompt_file) : input.prompt_text,
  '--output-format',
  'text'
]));
