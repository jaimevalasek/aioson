'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');

const {
  MAX_CANONICAL_FILES,
  MAX_REPORT_BYTES,
  MAX_SOURCE_BYTES
} = require('./contracts');
const {
  validateFeatureSlug,
  resolveProjectRoot,
  toPosixPath
} = require('../verification/path-policy');

class ReviewStorageError extends Error {
  constructor(reason, details = {}) {
    super(reason);
    this.name = 'ReviewStorageError';
    this.reason = reason;
    this.details = details;
  }
}

function storageError(reason, details) {
  return new ReviewStorageError(reason, details);
}

function createOperations(overrides = {}) {
  return {
    lstat: overrides.lstat || fs.lstat,
    stat: overrides.stat || fs.stat,
    realpath: overrides.realpath || fs.realpath,
    mkdir: overrides.mkdir || fs.mkdir,
    open: overrides.open || fs.open,
    rename: overrides.rename || fs.rename,
    link: overrides.link || fs.link,
    unlink: overrides.unlink || fs.unlink,
    readdir: overrides.readdir || fs.readdir
  };
}

function isInside(rootPath, candidatePath) {
  const relative = path.relative(rootPath, candidatePath);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function sameFilesystemPath(left, right) {
  const normalize = (value) => {
    const resolved = path.resolve(value);
    return process.platform === 'win32' ? resolved.toLowerCase() : resolved;
  };
  return normalize(left) === normalize(right);
}

function sameFileIdentity(left, right) {
  const comparableInode = (stat) => stat && Number.isSafeInteger(stat.ino) && stat.ino > 0;
  if (!comparableInode(left) || !comparableInode(right)) return true;
  if (left.ino !== right.ino) return false;
  const comparableDevice = Number.isSafeInteger(left.dev) && left.dev !== 0 && Number.isSafeInteger(right.dev) && right.dev !== 0;
  return !comparableDevice || left.dev === right.dev;
}

function hasTraversal(value) {
  return String(value).split(/[\\/]+/).includes('..');
}

function isForeignAbsolute(value) {
  const anyAbsolute = path.isAbsolute(value) || path.win32.isAbsolute(value) || path.posix.isAbsolute(value);
  return anyAbsolute && !path.isAbsolute(value);
}

function normalizePathInput(rootDir, inputPath, { relativeOnly = false } = {}) {
  if (typeof inputPath !== 'string' || inputPath.trim() === '') throw storageError('missing_path');
  if (inputPath.includes('\0')) throw storageError('path_contains_nul');
  if (hasTraversal(inputPath)) throw storageError('path_traversal', { path: inputPath });
  if (isForeignAbsolute(inputPath)) throw storageError('path_outside_root', { path: inputPath });
  if (relativeOnly && path.isAbsolute(inputPath)) throw storageError('path_must_be_relative', { path: inputPath });

  const rootPath = path.resolve(rootDir);
  const absolutePath = path.resolve(rootPath, inputPath);
  if (!isInside(rootPath, absolutePath)) throw storageError('path_outside_root', { path: inputPath });
  return {
    root_path: rootPath,
    absolute_path: absolutePath,
    relative_path: toPosixPath(path.relative(rootPath, absolutePath))
  };
}

async function resolveRoot(rootDir, operations) {
  const rootPath = resolveProjectRoot(process.cwd(), rootDir);
  let rootReal;
  try {
    rootReal = await operations.realpath(rootPath);
  } catch (error) {
    if (error && error.code === 'ENOENT') throw storageError('project_root_missing');
    throw storageError('project_root_unavailable');
  }
  const stat = await operations.stat(rootReal);
  if (!stat.isDirectory()) throw storageError('project_root_not_directory');
  return { root_path: rootPath, root_real_path: rootReal };
}

async function resolveSecureFile(rootDir, inputPath, options = {}) {
  const operations = createOperations(options.operations);
  const maxBytes = options.maxBytes === undefined ? MAX_SOURCE_BYTES : options.maxBytes;
  const root = await resolveRoot(rootDir, operations);
  const lexical = normalizePathInput(root.root_path, inputPath);

  try {
    await operations.lstat(lexical.absolute_path);
  } catch (error) {
    if (error && error.code === 'ENOENT') throw storageError('file_not_found', { path: lexical.relative_path || inputPath });
    throw storageError('file_unavailable', { path: lexical.relative_path || inputPath });
  }

  let realPath;
  try {
    realPath = await operations.realpath(lexical.absolute_path);
  } catch {
    throw storageError('file_unavailable', { path: lexical.relative_path || inputPath });
  }
  if (!isInside(root.root_real_path, realPath)) {
    throw storageError('path_outside_root', { path: lexical.relative_path || inputPath });
  }

  const stat = await operations.stat(realPath);
  if (!stat.isFile()) throw storageError('path_not_regular_file', { path: lexical.relative_path || inputPath });
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 0) throw storageError('invalid_size_limit');
  if (stat.size > maxBytes) {
    throw storageError('file_too_large', { path: lexical.relative_path || inputPath, bytes: stat.size, max_bytes: maxBytes });
  }
  return {
    path: lexical.absolute_path,
    real_path: realPath,
    root_real_path: root.root_real_path,
    relative_path: lexical.relative_path,
    bytes: stat.size,
    stat
  };
}

async function assertOpenedFileStillSecure(rootDir, resolved, openedStat, operations, maxBytes) {
  const current = await resolveSecureFile(rootDir, resolved.relative_path, { maxBytes, operations });
  if (!sameFilesystemPath(current.real_path, resolved.real_path) || !sameFileIdentity(current.stat, openedStat)) {
    throw storageError('file_changed_before_open', { path: resolved.relative_path });
  }
}

async function consumeSecureFile(rootDir, inputPath, options = {}) {
  const operations = createOperations(options.operations);
  const maxBytes = options.maxBytes === undefined ? MAX_SOURCE_BYTES : options.maxBytes;
  const collect = Boolean(options.collect);
  const resolved = await resolveSecureFile(rootDir, inputPath, { maxBytes, operations });
  const handle = await operations.open(resolved.real_path, 'r');
  const hash = crypto.createHash('sha256');
  const chunks = [];
  let bytes = 0;
  let before;
  try {
    before = await handle.stat();
    if (!before.isFile()) throw storageError('path_not_regular_file', { path: resolved.relative_path });
    if (before.size > maxBytes) {
      throw storageError('file_too_large', { path: resolved.relative_path, bytes: before.size, max_bytes: maxBytes });
    }
    await assertOpenedFileStillSecure(rootDir, resolved, before, operations, maxBytes);
    const stream = handle.createReadStream({ autoClose: false });
    for await (const chunk of stream) {
      bytes += chunk.length;
      if (bytes > maxBytes) {
        stream.destroy();
        throw storageError('file_too_large', { path: resolved.relative_path, bytes, max_bytes: maxBytes });
      }
      hash.update(chunk);
      if (collect) chunks.push(chunk);
    }
    const after = await handle.stat();
    if (after.size !== before.size || after.mtimeMs !== before.mtimeMs || bytes !== before.size) {
      throw storageError('file_changed_during_read', { path: resolved.relative_path });
    }
  } finally {
    await handle.close();
  }
  return {
    path: resolved.relative_path,
    real_path: resolved.real_path,
    sha256: hash.digest('hex'),
    bytes,
    modified_at_ms: before.mtimeMs,
    ...(collect ? { buffer: Buffer.concat(chunks, bytes) } : {})
  };
}

async function hashSecureFile(rootDir, inputPath, options = {}) {
  return consumeSecureFile(rootDir, inputPath, { ...options, collect: false });
}

async function readSecureFile(rootDir, inputPath, options = {}) {
  return consumeSecureFile(rootDir, inputPath, { ...options, collect: true });
}

async function readSecureJson(rootDir, inputPath, options = {}) {
  const result = await readSecureFile(rootDir, inputPath, {
    ...options,
    maxBytes: options.maxBytes === undefined ? MAX_REPORT_BYTES : options.maxBytes
  });
  try {
    return { ...result, value: JSON.parse(result.buffer.toString('utf8')) };
  } catch {
    throw storageError('invalid_json', { path: result.path });
  }
}

async function nearestExistingAncestor(candidatePath, operations) {
  let current = candidatePath;
  while (true) {
    try {
      await operations.lstat(current);
      return current;
    } catch (error) {
      if (!error || error.code !== 'ENOENT') throw storageError('path_unavailable');
      const parent = path.dirname(current);
      if (parent === current) throw storageError('path_unavailable');
      current = parent;
    }
  }
}

async function ensureSecureDirectory(rootDir, relativeDir, options = {}) {
  const operations = createOperations(options.operations);
  const root = await resolveRoot(rootDir, operations);
  const lexical = normalizePathInput(root.root_path, relativeDir, { relativeOnly: true });
  const ancestor = await nearestExistingAncestor(lexical.absolute_path, operations);
  const ancestorReal = await operations.realpath(ancestor);
  if (!isInside(root.root_real_path, ancestorReal)) {
    throw storageError('path_outside_root', { path: lexical.relative_path });
  }

  await operations.mkdir(lexical.absolute_path, { recursive: true });
  const realPath = await operations.realpath(lexical.absolute_path);
  if (!isInside(root.root_real_path, realPath)) {
    throw storageError('path_outside_root', { path: lexical.relative_path });
  }
  const stat = await operations.stat(realPath);
  if (!stat.isDirectory()) throw storageError('path_not_directory', { path: lexical.relative_path });
  return { ...lexical, real_path: realPath, root_real_path: root.root_real_path, stat, operations };
}

async function resolveSecureWriteTarget(rootDir, relativePath, options = {}) {
  const operations = createOperations(options.operations);
  const rootPath = path.resolve(rootDir);
  const lexical = normalizePathInput(rootPath, relativePath, { relativeOnly: true });
  const directory = await ensureSecureDirectory(rootPath, path.relative(rootPath, path.dirname(lexical.absolute_path)), { operations });

  let exists = false;
  try {
    const stat = await operations.lstat(lexical.absolute_path);
    exists = true;
    if (!stat.isFile() || stat.isSymbolicLink()) {
      throw storageError('immutable_target_invalid', { path: lexical.relative_path });
    }
    const realPath = await operations.realpath(lexical.absolute_path);
    const rootReal = await operations.realpath(rootPath);
    if (!isInside(rootReal, realPath)) throw storageError('path_outside_root', { path: lexical.relative_path });
  } catch (error) {
    if (error instanceof ReviewStorageError) throw error;
    if (!error || error.code !== 'ENOENT') throw storageError('target_unavailable', { path: lexical.relative_path });
  }
  return {
    ...lexical,
    exists,
    operations,
    root_real_path: directory.root_real_path,
    directory_relative_path: directory.relative_path,
    directory_real_path: directory.real_path,
    directory_stat: directory.stat
  };
}

async function assertSecureWriteDirectory(target) {
  const directory = await resolveSecureDirectory(target.root_path, target.directory_relative_path, target.operations);
  if (!directory || !sameFilesystemPath(directory.root_real_path, target.root_real_path)) {
    throw storageError('project_root_changed');
  }
  if (!sameFilesystemPath(directory.real_path, target.directory_real_path) || !sameFileIdentity(directory.stat, target.directory_stat)) {
    throw storageError('write_directory_changed', { path: target.directory_relative_path });
  }
  return directory;
}

async function assertOpenedTempStillSecure(target, tempPath, handle) {
  await assertSecureWriteDirectory(target);
  const opened = await handle.stat();
  const relativePath = toPosixPath(path.relative(target.root_path, tempPath));
  const current = await resolveSecureFile(target.root_path, relativePath, {
    maxBytes: MAX_REPORT_BYTES,
    operations: target.operations
  });
  if (!sameFileIdentity(current.stat, opened)) {
    throw storageError('file_changed_before_open', { path: relativePath });
  }
}

async function existingContentMatches(rootDir, target, payload, operations) {
  const resolved = await resolveSecureFile(rootDir, target.relative_path, {
    maxBytes: Math.max(payload.length, 1),
    operations
  }).catch((error) => {
    if (error instanceof ReviewStorageError && error.reason === 'file_too_large') return null;
    throw error;
  });
  if (!resolved || resolved.bytes !== payload.length) return false;
  const current = await hashSecureFile(rootDir, target.relative_path, {
    maxBytes: Math.max(payload.length, 1),
    operations
  });
  const expected = crypto.createHash('sha256').update(payload).digest('hex');
  return current.sha256 === expected;
}

async function safeUnlink(filePath, operations, rootRealPath) {
  if (!filePath) return;
  try {
    if (rootRealPath && !isInside(rootRealPath, await operations.realpath(filePath))) return;
    await operations.unlink(filePath);
  } catch (error) {
    if (!error || error.code !== 'ENOENT') return;
  }
}

async function syncDirectoryBestEffort(directoryPath, operations) {
  let handle;
  try {
    handle = await operations.open(directoryPath, 'r');
    await handle.sync();
  } catch {
    // Directory fsync is not supported consistently on Windows.
  } finally {
    if (handle) await handle.close().catch(() => {});
  }
}

async function atomicWriteImmutable(rootDir, relativePath, content, options = {}) {
  const payload = Buffer.isBuffer(content) ? content : Buffer.from(String(content), 'utf8');
  const maxBytes = options.maxBytes === undefined ? MAX_REPORT_BYTES : options.maxBytes;
  if (payload.length > maxBytes) throw storageError('content_too_large', { bytes: payload.length, max_bytes: maxBytes });

  const target = await resolveSecureWriteTarget(rootDir, relativePath, options);
  const operations = target.operations;
  if (target.exists) {
    if (await existingContentMatches(rootDir, target, payload, operations)) {
      return { created: false, path: target.relative_path, bytes: payload.length };
    }
    throw storageError('immutable_conflict', { path: target.relative_path });
  }

  const nonce = options.nonce || `${process.pid}-${crypto.randomUUID()}`;
  let tempPath = `${target.absolute_path}.${nonce}.tmp`;
  let readyPath = `${target.absolute_path}.${nonce}.ready`;
  let handle;
  try {
    handle = await operations.open(tempPath, 'wx', 0o600);
    await assertOpenedTempStillSecure(target, tempPath, handle);
    await handle.writeFile(payload);
    await handle.sync();
    await handle.close();
    handle = null;

    await assertSecureWriteDirectory(target);
    await operations.rename(tempPath, readyPath);
    tempPath = null;
    try {
      await assertSecureWriteDirectory(target);
      await operations.link(readyPath, target.absolute_path);
    } catch (error) {
      if (!error || error.code !== 'EEXIST') throw error;
      if (await existingContentMatches(rootDir, target, payload, operations)) {
        return { created: false, path: target.relative_path, bytes: payload.length };
      }
      throw storageError('immutable_conflict', { path: target.relative_path });
    }
    await assertSecureWriteDirectory(target);
    if (!(await existingContentMatches(rootDir, target, payload, operations))) {
      throw storageError('atomic_write_verification_failed', { path: target.relative_path });
    }
    await syncDirectoryBestEffort(target.directory_real_path, operations);
    return { created: true, path: target.relative_path, bytes: payload.length };
  } catch (error) {
    if (error instanceof ReviewStorageError) throw error;
    throw storageError('atomic_write_failed', { path: target.relative_path });
  } finally {
    if (handle) await handle.close().catch(() => {});
    await safeUnlink(tempPath, operations, target.root_real_path);
    await safeUnlink(readyPath, operations, target.root_real_path);
  }
}

async function resolveSecureDirectory(rootDir, relativeDir, operations) {
  const root = await resolveRoot(rootDir, operations);
  const lexical = normalizePathInput(root.root_path, relativeDir, { relativeOnly: true });
  let realPath;
  try {
    realPath = await operations.realpath(lexical.absolute_path);
  } catch (error) {
    if (error && error.code === 'ENOENT') return null;
    throw storageError('directory_unavailable', { path: lexical.relative_path });
  }
  if (!isInside(root.root_real_path, realPath)) throw storageError('path_outside_root', { path: lexical.relative_path });
  const stat = await operations.stat(realPath);
  if (!stat.isDirectory()) throw storageError('path_not_directory', { path: lexical.relative_path });
  return { ...lexical, real_path: realPath, root_real_path: root.root_real_path, stat };
}

async function listCanonicalJsonFiles(rootDir, relativeDir, options = {}) {
  const operations = createOperations(options.operations);
  const maxFiles = options.maxFiles === undefined ? MAX_CANONICAL_FILES : options.maxFiles;
  const directory = await resolveSecureDirectory(rootDir, relativeDir, operations);
  if (!directory) return [];
  const entries = await operations.readdir(directory.real_path, { withFileTypes: true });
  const jsonEntries = entries.filter((entry) => entry.name.endsWith('.json'));
  if (jsonEntries.length > maxFiles) {
    throw storageError('canonical_file_limit_exceeded', { path: directory.relative_path, count: jsonEntries.length, max_files: maxFiles });
  }
  for (const entry of jsonEntries) {
    if (!entry.isFile()) throw storageError('canonical_entry_not_regular', { path: toPosixPath(path.join(directory.relative_path, entry.name)) });
  }
  return jsonEntries
    .map((entry) => toPosixPath(path.join(directory.relative_path, entry.name)))
    .sort();
}

function validateCanonicalSegment(value, field) {
  const text = String(value || '');
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(text)) throw storageError(`invalid_${field}`);
  return text;
}

function normalizeDigest(value, field) {
  const digest = String(value || '').replace(/^sha256:/, '');
  if (!/^[a-f0-9]{64}$/.test(digest)) throw storageError(`invalid_${field}`);
  return digest;
}

function reviewStorageDirectories(featureSlug) {
  const checked = validateFeatureSlug(featureSlug);
  if (!checked.ok) throw storageError(checked.reason);
  const base = `.aioson/context/features/${checked.feature_slug}/reviews`;
  return {
    base,
    packets: `${base}/packets`,
    drafts: `${base}/drafts`,
    reports: `${base}/reports`
  };
}

function packetRelativePath(featureSlug, agent, packetId) {
  const dirs = reviewStorageDirectories(featureSlug);
  return `${dirs.packets}/${validateCanonicalSegment(agent, 'agent')}-${normalizeDigest(packetId, 'packet_id')}.json`;
}

function draftRelativePath(featureSlug, agent, packetId) {
  const dirs = reviewStorageDirectories(featureSlug);
  return `${dirs.drafts}/${validateCanonicalSegment(agent, 'agent')}-${normalizeDigest(packetId, 'packet_id')}.report.json`;
}

function reportRelativePath(featureSlug, agent, packetId, reportHash) {
  const dirs = reviewStorageDirectories(featureSlug);
  return `${dirs.reports}/${validateCanonicalSegment(agent, 'agent')}-${normalizeDigest(packetId, 'packet_id')}-${normalizeDigest(reportHash, 'report_hash')}.json`;
}

module.exports = {
  ReviewStorageError,
  resolveSecureFile,
  readSecureFile,
  readSecureJson,
  hashSecureFile,
  atomicWriteImmutable,
  listCanonicalJsonFiles,
  reviewStorageDirectories,
  packetRelativePath,
  draftRelativePath,
  reportRelativePath,
  normalizePathInput,
  isInside
};
