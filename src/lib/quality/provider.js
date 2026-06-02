'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');

const execFileAsync = promisify(execFile);

async function readJsonFile(filePath) {
  const raw = await fs.readFile(filePath, 'utf8');
  return JSON.parse(raw);
}

async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

function splitCsv(value) {
  if (!value) return [];
  return String(value).split(',').map((item) => item.trim()).filter(Boolean);
}

async function getChangedPaths(targetDir, options = {}) {
  const explicit = splitCsv(options.changed || options.changedPaths);
  if (explicit.length > 0) return explicit.map((item) => item.replace(/\\/g, '/'));

  async function runGitNames(args) {
    try {
      const { stdout } = await execFileAsync('git', args, {
        cwd: targetDir,
        windowsHide: true,
        timeout: 5000
      });
      return stdout.split(/\r?\n/).map((item) => item.trim()).filter(Boolean);
    } catch {
      return [];
    }
  }

  const [tracked, untracked] = await Promise.all([
    runGitNames(['diff', '--name-only', 'HEAD']),
    runGitNames(['ls-files', '--others', '--exclude-standard'])
  ]);
  return [...new Set([...tracked, ...untracked])]
    .map((item) => item.replace(/\\/g, '/'));
}

async function loadBaseline(targetDir, options = {}) {
  const baselinePath = options.baseline ? path.resolve(targetDir, String(options.baseline)) : null;
  if (!baselinePath) return null;
  return readJsonFile(baselinePath);
}

async function collectGovernanceSources(targetDir) {
  const sources = [];
  const dirs = [
    path.join(targetDir, '.aioson', 'rules'),
    path.join(targetDir, '.aioson', 'design-docs')
  ];

  for (const dir of dirs) {
    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (entry.isFile() && entry.name.endsWith('.md')) {
        sources.push(path.relative(targetDir, path.join(dir, entry.name)).replace(/\\/g, '/'));
      }
    }
  }

  const designDoc = path.join(targetDir, '.aioson', 'context', 'design-doc.md');
  if (await fileExists(designDoc)) {
    sources.push(path.relative(targetDir, designDoc).replace(/\\/g, '/'));
  }

  return sources.sort();
}

async function runProvider(targetDir, options = {}) {
  if (options['provider-output']) {
    return {
      ok: true,
      command: `read:${options['provider-output']}`,
      output: await readJsonFile(path.resolve(targetDir, String(options['provider-output'])))
    };
  }

  const localBinary = process.platform === 'win32'
    ? path.join(targetDir, 'node_modules', '.bin', 'fallow.cmd')
    : path.join(targetDir, 'node_modules', '.bin', 'fallow');

  if (!(await fileExists(localBinary))) {
    return {
      ok: false,
      reason: 'provider_missing',
      advisory: 'Provider `fallow` was not found locally. quality:audit does not auto-install providers.'
    };
  }

  try {
    const { stdout } = await execFileAsync(localBinary, ['--json'], {
      cwd: targetDir,
      windowsHide: true,
      timeout: 30000,
      maxBuffer: 1024 * 1024 * 10
    });
    return { ok: true, command: `${path.relative(targetDir, localBinary).replace(/\\/g, '/')} --json`, output: JSON.parse(stdout) };
  } catch (err) {
    return {
      ok: false,
      reason: 'provider_runtime_uncertainty',
      advisory: `Provider fallow could not produce parseable JSON: ${err.message}`
    };
  }
}

module.exports = {
  getChangedPaths,
  loadBaseline,
  collectGovernanceSources,
  runProvider
};
