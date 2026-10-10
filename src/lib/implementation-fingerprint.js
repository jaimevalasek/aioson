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

module.exports = { computeImplementationFingerprint, checkIdentity, MAX_FINGERPRINT_FILE_BYTES, MAX_FINGERPRINT_TOTAL_BYTES };
