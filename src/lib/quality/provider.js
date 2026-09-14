'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const { classifyDesignDocSeedFile } = require('../design-doc-seed');
const { getChangedScope } = require('./scope');

const execFileAsync = promisify(execFile);

async function getChangedPaths(root, options = {}) { return (await getChangedScope(root, options)).paths; }

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

async function loadBaseline(targetDir, options = {}) {
  if (options.baseline && typeof options.baseline !== 'string') throw new Error('Use --baseline=<file>.');
  const baselinePath = options.baseline ? path.resolve(targetDir, String(options.baseline)) : null;
  if (!baselinePath) return null;
  const baseline = await readJsonFile(baselinePath);
  if (!baseline || typeof baseline !== 'object') throw new Error('Invalid baseline envelope.');
  return baseline;
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

  // A project-owned design record counts as a governance source; the retired
  // installer seed (the framework's own code layout) does not.
  const designDoc = path.join(targetDir, '.aioson', 'context', 'design-doc.md');
  if (await fileExists(designDoc) && (await classifyDesignDocSeedFile(designDoc)) !== 'verbatim') {
    sources.push(path.relative(targetDir, designDoc).replace(/\\/g, '/'));
  }

  return sources.sort();
}

async function runProvider(targetDir, options = {}) {
  try {
    if (options['provider-output']) {
      if (typeof options['provider-output'] !== 'string') throw new Error('Use --provider-output=<file>.');
      return { ok: true, status: 'pass', command: `read:${options['provider-output']}`,
        output: await readJsonFile(path.resolve(targetDir, options['provider-output'])) };
    }
    const packageDir = path.join(targetDir, 'node_modules', 'fallow');
    if (!(await fileExists(path.join(packageDir, 'package.json')))) {
      return { ok: false, status: 'not_run', reason: 'provider_missing',
        advisory: 'Provider `fallow` was not found locally. quality:audit does not auto-install providers.' };
    }
    const manifest = await readJsonFile(path.join(packageDir, 'package.json'));
    const bin = typeof manifest.bin === 'string' ? manifest.bin : manifest.bin?.fallow;
    if (typeof bin !== 'string' || !bin || path.isAbsolute(bin) || bin.split(/[\\/]/).includes('..')) {
      throw new Error('Invalid Fallow package entrypoint.');
    }
    const entry = path.resolve(packageDir, bin);
    const timeout = Number(options.timeout ?? 60000);
    if (!Number.isInteger(timeout) || timeout < 1 || timeout > 600000) throw new Error('Quality timeout must be 1..600000 milliseconds.');
    const args = [entry, '--format', 'json', '--threads', '1', '--no-cache'];
    const command = `node ${path.relative(targetDir, entry).replace(/\\/g, '/')} --format json --threads 1 --no-cache`;
    const processResult = await executeProvider(targetDir, args, timeout);
    return { ok: true, status: 'pass', version: manifest.version, command,
      exit_code: processResult.code || 0, output: JSON.parse(processResult.stdout) };
  } catch (err) {
    return { ok: false, status: 'error', reason: 'provider_runtime_uncertainty',
      advisory: `Provider fallow could not produce parseable JSON: ${err.message}` };
  }
}

async function executeProvider(targetDir, args, timeout) {
  let processResult;
  try { processResult = await execFileAsync(process.execPath, args, {
    cwd: targetDir,
    windowsHide: true,
    timeout,
    maxBuffer: 1024 * 1024 * 32
  }); } catch (error) {
    // Findings may exit 1; crashes and timeouts are never valid measurements.
    if (error.code !== 1 || error.killed) throw error;
    processResult = { stdout: error.stdout, code: 1 };
  }
  return processResult;
}

module.exports = {
  getChangedPaths,
  loadBaseline,
  collectGovernanceSources,
  runProvider
};
