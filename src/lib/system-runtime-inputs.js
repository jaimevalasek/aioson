'use strict';

const fs = require('node:fs/promises');
const { createReadStream } = require('node:fs');
const { createHash } = require('node:crypto');
const path = require('node:path');
const os = require('node:os');
const ignore = require('ignore');

const SKIP = new Set(['node_modules', '.git', 'uploads', 'logs', 'data', 'output', '.cache']);
const STANDARD_OUTPUT_DIRS = new Set(['dist', 'build', 'out', '.next']);

// Same exemptions as collectSystemFiles: build output (a standard folder name at
// any depth, or a folder the manifest declares) and the .aioson runtime folders
// travel even when gitignored; anything else ignored is local state.
// An env file is the one ignored input the author's build reads (bundlers inline
// its values), so it reaches the snapshot; collectSystemFiles keeps it out of
// the package.
const BUILD_ENV_FILE = /^\.env(\..+)?$/;

async function ignoredInputFilter(dir, options) {
  const rules = ignore();
  try { rules.add(await fs.readFile(path.join(dir, '.gitignore'), 'utf8')); } catch { /* no .gitignore, nothing to filter */ }
  const declared = [...(options.outputDirs ?? [])];
  const exempt = (relative, isDirectory) => {
    const folders = relative.split('/');
    if (!isDirectory && BUILD_ENV_FILE.test(folders.pop())) return true;
    if (folders[0] === '.aioson' || folders.some(name => STANDARD_OUTPUT_DIRS.has(name))) return true;
    return declared.some(item => relative === item || relative.startsWith(`${item}/`) || item.startsWith(`${relative}/`));
  };
  return (relative, isDirectory) => !exempt(relative, isDirectory) && rules.ignores(isDirectory ? `${relative}/` : relative);
}

async function inputFiles(dir, options) {
  const result = [];
  let total = 0;
  const isIgnored = await ignoredInputFilter(dir, options);
  const walk = async (directory, prefix = '') => {
    for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
      const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (SKIP.has(entry.name)) {
        options.excluded?.push({ path: relative, reason: 'local state or build tooling' });
        continue;
      }
      if (isIgnored(relative, entry.isDirectory())) {
        options.excluded?.push({ path: relative, reason: 'gitignore' });
        continue;
      }
      if (relative.startsWith('.aioson/')) {
        const inner = relative.slice('.aioson/'.length);
        if (inner !== 'build-options.json' && !options.aiosonIncludes.some(item => inner === item || inner.startsWith(`${item}/`) || item.startsWith(`${inner}/`))) continue;
      }
      if (entry.isSymbolicLink()) throw new Error('Runtime inputs do not allow nested source links.');
      if (entry.isDirectory()) await walk(path.join(directory, entry.name), relative);
      else if (entry.isFile()) {
        total += (await fs.stat(path.join(directory, entry.name))).size;
        if (total > 1024 * 1024 * 1024 || result.length >= 20000) throw new Error('Runtime source inventory exceeds the review limit.');
        result.push(relative);
      }
    }
  };
  await walk(dir);
  return result.sort((a, b) => Buffer.compare(Buffer.from(a), Buffer.from(b)));
}

async function fingerprint(dir, files) {
  const entries = [];
  for (const relative of files) {
    const hash = createHash('sha256');
    for await (const chunk of createReadStream(path.join(dir, relative))) hash.update(chunk);
    entries.push([relative, hash.digest('hex')]);
  }
  return createHash('sha256').update(JSON.stringify(entries)).digest('hex');
}

async function sourceFingerprint(dir, options) {
  return fingerprint(dir, await inputFiles(dir, options));
}

async function captureInputs(dir, options) {
  const snapshot = await fs.mkdtemp(path.join(os.tmpdir(), 'aioson-runtime-inputs-'));
  try {
    const excluded = [];
    const files = await inputFiles(dir, { ...options, excluded });
    for (const relative of files) {
      const target = path.join(snapshot, relative);
      await fs.mkdir(path.dirname(target), { recursive: true });
      await fs.copyFile(path.join(dir, relative), target);
    }
    const captured = await fingerprint(snapshot, files);
    if (captured !== await sourceFingerprint(dir, options)) throw inputsChanged();
    // Dependencies are tooling/cache, never copied into the deliverable. The
    // isolated build resolves the author's already-installed toolchain normally.
    const dependencies = path.join(dir, 'node_modules');
    if (await fs.stat(dependencies).then(stat => stat.isDirectory(), () => false)) {
      await fs.symlink(await fs.realpath(dependencies), path.join(snapshot, 'node_modules'), process.platform === 'win32' ? 'junction' : 'dir');
    }
    return { directory: snapshot, sourceFingerprint: captured, excluded, dispose: () => removeSnapshot(snapshot) };
  } catch (error) { await removeSnapshot(snapshot); throw error; }
}

function inputsChanged() {
  const error = new Error('Runtime inputs changed during preparation. Build and review again.');
  error.runtimeDiagnostic = { code: 'runtime_inputs_changed', files: [] };
  return error;
}

async function removeSnapshot(snapshot) {
  const resolved = path.resolve(snapshot);
  if (path.dirname(resolved) !== path.resolve(os.tmpdir()) || !path.basename(resolved).startsWith('aioson-runtime-inputs-')) throw new Error('Invalid runtime snapshot cleanup path.');
  await fs.rm(resolved, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
}

module.exports = { captureInputs, sourceFingerprint, inputsChanged };
