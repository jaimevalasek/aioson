'use strict';

const { spawnSync } = require('node:child_process');
const path = require('node:path');
const result = spawnSync(process.execPath, ['--require', './tests/setup/windows-fs-retries.js', '--test', '--test-concurrency=1', ...require('./quality-tests')], {
  cwd: path.resolve(__dirname, '../..'), stdio: 'inherit', windowsHide: true
});
process.exitCode = result.status ?? 2;
