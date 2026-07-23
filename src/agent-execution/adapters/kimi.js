'use strict';

const { createAdapter } = require('./base');

// Official Kimi Code non-interactive contract:
// kimi [-m <model>] -p <prompt> --output-format text [--add-dir <dir> ...]
module.exports = createAdapter('kimi', (input) => [
  ...(input.model === 'configured-default' ? [] : ['--model', input.model]),
  ...(input.writable_roots || []).flatMap((root) => ['--add-dir', root]),
  '--prompt',
  input.prompt_text,
  '--output-format',
  'text'
]);
