'use strict';

const crypto = require('node:crypto');
const fsSync = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const MAX_FINGERPRINT_FILE_BYTES = 16 * 1024 * 1024;
const MAX_FINGERPRINT_TOTAL_BYTES = 64 * 1024 * 1024;

// Bind the executed command and its enforcement policy to the same source snapshot.
function checkIdentity(check) {
  return [check.id, check.argv || check.command, check.stage || 'qa', check.required !== false, check.timeout_ms ?? null];
}

function computeImplementationFingerprint(targetDir, checks, limits = {}) {
  try {
    const normalizeLimit = (value, fallback) => {
      const parsed = Number(value);
      return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
    };
    const maxFileBytes = normalizeLimit(limits.maxFileBytes, MAX_FINGERPRINT_FILE_BYTES);
    const maxTotalBytes = normalizeLimit(limits.maxTotalBytes, MAX_FINGERPRINT_TOTAL_BYTES);
    const implementationPathspec = [
      '.',
      ':(exclude).aioson/runtime/**',
      ':(exclude).aioson/context/**'
    ];
    const repoRoot = String(execFileSync('git', ['rev-parse', '--show-toplevel'], {
      cwd: targetDir,
      encoding: 'utf8',
      timeout: 10000,
      stdio: ['ignore', 'pipe', 'ignore']
    })).trim();
    const head = execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd: targetDir,
      encoding: null,
      timeout: 10000,
      stdio: ['ignore', 'pipe', 'ignore']
    });
    const diff = execFileSync('git', ['diff', '--binary', '--no-ext-diff', 'HEAD', '--', ...implementationPathspec], {
      cwd: targetDir,
      encoding: null,
      maxBuffer: 64 * 1024 * 1024,
      timeout: 30000,
      stdio: ['ignore', 'pipe', 'ignore']
    });
    const untrackedRaw = execFileSync('git', ['ls-files', '--full-name', '--others', '--exclude-standard', '-z', '--', ...implementationPathspec], {
      cwd: targetDir,
      encoding: 'utf8',
      maxBuffer: 16 * 1024 * 1024,
      timeout: 30000,
      stdio: ['ignore', 'pipe', 'ignore']
    });
    const hash = crypto.createHash('sha256');
    const update = (part) => {
      hash.update(Buffer.isBuffer(part) ? part : Buffer.from(String(part)));
      hash.update('\0');
    };
    update(head);
    update(diff);
    update(JSON.stringify(checks.map(checkIdentity)));
    let totalBytes = 0;
    for (const relativePath of untrackedRaw.split('\0').filter(Boolean).sort()) {
      const absolute = path.resolve(repoRoot, relativePath);
      const insideRepo = path.relative(repoRoot, absolute);
      if (insideRepo.startsWith('..') || path.isAbsolute(insideRepo)) continue;
      update(relativePath);
      try {
        const stat = fsSync.lstatSync(absolute);
        if (stat.isSymbolicLink()) {
          update(`<symlink:${fsSync.readlinkSync(absolute)}>`);
          continue;
        }
        if (!stat.isFile()) {
          update('<non-regular>');
          continue;
        }
        if (stat.size > maxFileBytes || totalBytes + stat.size > maxTotalBytes) {
          return null;
        }
        totalBytes += stat.size;
        const handle = fsSync.openSync(absolute, 'r');
        try {
          const buffer = Buffer.allocUnsafe(Math.min(64 * 1024, Math.max(1, stat.size)));
          let bytesRead;
          do {
            bytesRead = fsSync.readSync(handle, buffer, 0, buffer.length, null);
            if (bytesRead > 0) hash.update(buffer.subarray(0, bytesRead));
          } while (bytesRead > 0);
          hash.update('\0');
        } finally {
          fsSync.closeSync(handle);
        }
      } catch {
        return null;
      }
    }
    return `sha256:${hash.digest('hex')}`;
  } catch {
    return null;
  }
}

// The fingerprint says THAT the tree moved under a running check, never WHICH
// file moved. Two chats on one folder do this to each other — the second edits
// any file, or commits, while the first one's tests run — and the gate answered
// with a bare `implementation_changed_during_checks`: nothing told the owner
// whether the check wrote the file, the other chat did, or HEAD moved. The
// snapshot is the cheap half of that answer: the dirty paths with size and
// mtime (one `git status`, no file read), taken beside the fingerprint and
// compared only when the two fingerprints differ.
const MAX_SNAPSHOT_PATHS = 20000;
const MAX_REPORTED_PATHS = 12;
const PARALLEL_SESSIONS_DOC = '.aioson/docs/dev/parallel-sessions.md';

function snapshotImplementationTree(targetDir) {
  try {
    const run = (args, maxBuffer = 16 * 1024 * 1024) => execFileSync('git', args, {
      cwd: targetDir,
      encoding: 'utf8',
      maxBuffer,
      timeout: 30000,
      stdio: ['ignore', 'pipe', 'ignore']
    });
    const repoRoot = run(['rev-parse', '--show-toplevel']).trim();
    const head = run(['rev-parse', 'HEAD']).trim();
    // --no-optional-locks: a plain `git status` refreshes the index under
    // index.lock, which is the lock the OTHER chat's git commands contend for.
    const raw = run([
      '--no-optional-locks', 'status', '--porcelain=v1', '-z', '--untracked-files=all', '--',
      '.', ':(exclude).aioson/runtime/**', ':(exclude).aioson/context/**'
    ]);
    const fields = raw.split('\0');
    const paths = new Map();
    for (let index = 0; index < fields.length; index += 1) {
      const entry = fields[index];
      if (entry.length < 4) continue;
      // `R  new\0old\0`: the field after a rename or copy is its source path.
      if (/[RC]/.test(entry.slice(0, 2))) index += 1;
      const relative = entry.slice(3);
      let identity = 'gone';
      try {
        const stat = fsSync.lstatSync(path.resolve(repoRoot, relative));
        identity = `${stat.size}:${Math.round(stat.mtimeMs)}`;
      } catch { /* deleted: the identity stays 'gone' */ }
      paths.set(relative, identity);
      if (paths.size > MAX_SNAPSHOT_PATHS) return null;
    }
    return { head, paths };
  } catch {
    return null;
  }
}

/**
 * What moved between two snapshots: the dirty paths that appeared, vanished or
 * changed size/mtime, and whether HEAD moved. `null` when either snapshot is
 * unavailable or nothing differs (then the fingerprints differed for a reason
 * the snapshot cannot see, and the caller keeps the bare reason).
 */
function describeTreeChange(before, after) {
  if (!before || !after) return null;
  const moved = new Set();
  for (const [relative, identity] of after.paths) {
    if (before.paths.get(relative) !== identity) moved.add(relative);
  }
  for (const relative of before.paths.keys()) {
    if (!after.paths.has(relative)) moved.add(relative);
  }
  const headMoved = before.head !== after.head;
  if (!moved.size && !headMoved) return null;
  const sorted = [...moved].sort();
  const paths = sorted.slice(0, MAX_REPORTED_PATHS);
  const more = sorted.length - paths.length;
  const what = [];
  if (paths.length) what.push(`${paths.join(', ')}${more > 0 ? ` (+${more} more)` : ''} changed`);
  if (headMoved) what.push('HEAD moved (a commit or a checkout)');
  return {
    paths,
    more,
    head_changed: headMoved,
    message: `${what.join('; ')} while the checks ran: the check itself, another session or another tool wrote to this tree. Two chats on one folder do this to each other — re-run when the other one settles, or give each chat its own worktree (${PARALLEL_SESSIONS_DOC}).`
  };
}

module.exports = {
  computeImplementationFingerprint,
  snapshotImplementationTree,
  describeTreeChange,
  checkIdentity,
  MAX_FINGERPRINT_FILE_BYTES,
  MAX_FINGERPRINT_TOTAL_BYTES,
  PARALLEL_SESSIONS_DOC
};
