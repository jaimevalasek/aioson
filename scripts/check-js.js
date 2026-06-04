'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const TARGET_DIRS = ['src', 'bin'];

function collectJsFiles(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...collectJsFiles(abs));
    } else if (entry.isFile() && entry.name.endsWith('.js')) {
      out.push(abs);
    }
  }
  return out;
}

const files = TARGET_DIRS
  .map((dir) => path.join(ROOT, dir))
  .filter((dir) => fs.existsSync(dir))
  .flatMap(collectJsFiles)
  .sort();

let failed = false;
for (const file of files) {
  const result = spawnSync(process.execPath, ['--check', file], { stdio: 'inherit' });
  if (result.status !== 0) failed = true;
}

if (failed) process.exit(1);
