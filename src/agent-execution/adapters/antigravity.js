'use strict';

const { createAdapter } = require('./base');

// AGY headless accepts long/programmatic prompts as NDJSON on a closed stdin
// pipe. Keep the prompt out of argv (Windows command-line limits), and let the
// shared adapter own process lifecycle and permission translation. Do not
// inherit agy's five-minute print timeout for longer AIOSON lanes; zero remains
// unlimited. Stream output also exposes provider usage when AGY reports it.
// Contract: https://antigravity.google/docs/cli/headless/
module.exports = createAdapter('antigravity', input => ({
  args: [
    '--input-format', 'stream-json', '--output-format', 'stream-json',
    '--print-timeout', `${input.timeout ?? 3600000}ms`,
    ...(input.sandbox_args || []),
    ...(input.model === 'configured-default' ? [] : ['--model', input.model]),
    ...(input.reasoning_effort ? ['--effort', input.reasoning_effort] : []),
    ...(input.writable_roots || []).flatMap(root => ['--add-dir', root])
  ],
  stdin: `${JSON.stringify({ event: 'user', message: { content: String(input.prompt_text || '') } })}\n`
}));
