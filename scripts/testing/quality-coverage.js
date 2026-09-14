'use strict';

const path = require('node:path');
const { spawnSync } = require('node:child_process');
const files = require('./quality-tests');
const root = path.resolve(__dirname, '..', '..');
const args = [
  require.resolve('c8/bin/c8.js'), '--all', '--include=src/lib/quality/**', '--include=src/commands/quality-*.js',
  '--include=src/commands/quality.js',
  '--exclude-after-remap', '--reporter=text', '--reporter=json-summary', '--reporter=lcov',
  '--check-coverage', '--lines=90', '--statements=90', '--functions=90', '--branches=80',
  '--reports-dir=.aioson/runtime/quality/coverage',
  '--temp-directory=.aioson/runtime/quality/coverage/tmp',
  process.execPath, '--require', './tests/setup/windows-fs-retries.js', '--test', '--test-concurrency=1', ...files
];
const result = spawnSync(process.execPath, args, { cwd: root, stdio: 'inherit', windowsHide: true });
if (result.error) process.stderr.write(`${result.error.message}\n`);
process.exitCode = result.status ?? 2;
