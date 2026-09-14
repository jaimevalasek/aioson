'use strict';

const { createAdapter } = require('./base');

// Qwen Code non-interactive contract. CLI-level approval mode still applies
// in safe mode, so plan is the read-only boundary; sandbox and safe mode also
// isolate execution from project customizations. sandbox_mode is translated
// by the registry (src/lib/tool-capabilities.js) through createAdapter:
// 'workspace-write' uses the registry's unattended flag (a lane worker edits
// files and runs tests).
// Piped text selects headless mode without putting the task into Windows argv.
module.exports = createAdapter('qwen', input => ({ args: [
  ...(input.model === 'configured-default' ? [] : ['--model', input.model]),
  ...(input.sandbox_args || []),
  '--output-format',
  'text'
], stdin: true }));
