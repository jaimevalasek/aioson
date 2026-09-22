'use strict';

const path = require('node:path');
const { createAdapter } = require('./base');
const { capabilities } = require('../capabilities');

const RUNNER = path.join(__dirname, 'cursor-runner.mjs');

// Cursor runs through the bundled SDK runner shipped as `aioson-cursor-runner`.
// Permission mode is translated by the registry: read-only → sandbox;
// workspace-write → autoReview (classifier-backed auto-approve for local tool calls).
const adapter = createAdapter('cursor', (input) => ({
  args: [
    RUNNER,
    ...(input.sandbox_args || []),
    ...(input.model === 'configured-default' ? [] : ['--model', input.model]),
    ...(input.captureUsage ? ['--jsonl'] : ['--no-jsonl']),
    ...(input.writable_roots || []).flatMap((root) => ['--add-dir', root])
  ],
  stdin: true
}));

adapter.probe = () => ({ ...capabilities('cursor'), executable: process.execPath, source: 'cursor_runner' });

module.exports = adapter;
