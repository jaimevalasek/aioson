'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { setTimeout: delay } = require('node:timers/promises');

const LOCK_NAME = '.features.lock';
// Windows refuses a readdir/rmdir/unlink for a moment while another process
// renames or scans the same lock directory. Never a reason to fail the lock.
const TRANSIENT = ['EPERM', 'EBUSY', 'EACCES'];
const OWNER_MARKER = /^(\d+)-[a-f0-9-]+\.owner$/;
// A holder reads and writes in milliseconds: a marker this old belongs to a
// process that died or hung, whatever its PID names now (Windows reuses PIDs
// within minutes; a process inside WSL is invisible from Windows).
const STALE_OWNER_MS = 30_000;
// Readers, antivirus and sync clients hold a file open for a moment on
// Windows: a refused replacement is retried for about 2 s, the pause doubling.
const RENAME_RETRY_MS = 2_000;

async function retryTransient(operation, attempts = 6) {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      if (!TRANSIENT.includes(error.code) || attempt >= attempts - 1) throw error;
      await delay(10 * (attempt + 1));
    }
  }
}

function isAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    // Only ESRCH proves the owner is gone. Permission failures are not death.
    return error.code !== 'ESRCH';
  }
}

async function removeOwner(directory, owner) {
  try {
    // A marker left behind would hold the lock for a live PID until timeout.
    await retryTransient(() => fs.unlink(path.join(directory, owner)));
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  await removeEmptyDirectory(directory);
}

async function removeEmptyDirectory(directory) {
  try {
    // Never recursively remove a lock: another owner may have acquired it.
    await fs.rmdir(directory);
  } catch (error) {
    // An ownerless directory left by a refused rmdir is reaped by the next contender.
    if (!['ENOENT', 'ENOTEMPTY', 'EEXIST', ...TRANSIENT].includes(error.code)) throw error;
  }
}

/** True when `entry` holds no live lock: a stray file, a dead owner, or a marker older than STALE_OWNER_MS. */
async function isStaleEntry(directory, entry) {
  const match = OWNER_MARKER.exec(entry);
  if (!match || !isAlive(Number(match[1]))) return true;
  try {
    return Date.now() - (await fs.stat(path.join(directory, entry))).mtimeMs > STALE_OWNER_MS;
  } catch (error) {
    if (TRANSIENT.includes(error.code)) return false;
    // Released between the listing and now: no live holder either.
    if (error.code === 'ENOENT') return true;
    throw error;
  }
}

async function removeEntry(entry) {
  try {
    await retryTransient(() => fs.unlink(entry));
  } catch (error) {
    // A stray folder: removed only when empty, like the lock itself.
    if (error.code !== 'ENOENT') await fs.rmdir(entry).catch(() => {});
  }
}

async function reapDeadOwner(directory) {
  let entries;
  try {
    entries = await fs.readdir(directory);
  } catch (error) {
    if (error.code === 'ENOENT' || TRANSIENT.includes(error.code)) return;
    throw error;
  }
  for (const entry of entries) {
    if (!(await isStaleEntry(directory, entry))) return; // a live holder keeps its lock
  }
  // A process may have died between unlinking its owner marker and rmdir, or a
  // tool dropped a file beside it (desktop.ini, Thumbs.db): each listed entry
  // goes one by one — never recursively — and then the empty folder.
  for (const entry of entries) await removeEntry(path.join(directory, entry));
  await removeEmptyDirectory(directory);
}

function lockTimeout(name, directory) {
  const label = name === LOCK_NAME ? 'feature registry' : name;
  const locked = new Error(`Timed out waiting for ${label} lock: ${directory} — another aioson command is writing; if none is running, delete that folder and retry`);
  locked.code = 'EFEATURELOCK';
  return locked;
}

/** A marker that waited for the lock is as fresh as the attempt, never as old as the wait. */
async function touch(file) {
  const now = new Date();
  await fs.utimes(file, now, now).catch(() => {});
}

/**
 * Serialize the entire read/mutate/write transaction across CLI processes.
 * `name` lets another single-writer store in the same directory take its own
 * lock (e.g. `.observations.lock`) without contending with features.md.
 */
async function withRegistryLock(ctxDir, action, { timeoutMs = 10_000, pollMs = 25, name = LOCK_NAME } = {}) {
  await fs.mkdir(ctxDir, { recursive: true });
  const directory = path.join(ctxDir, name);
  const owner = `${process.pid}-${randomUUID()}.owner`;
  const candidate = await fs.mkdtemp(path.join(ctxDir, `${name.replace(/\.lock$/, '')}-lock-`));
  let acquired = false;
  const deadline = Date.now() + timeoutMs;
  try {
    await fs.writeFile(path.join(candidate, owner), '', { flag: 'wx' });
    // Publish a populated directory atomically. A contender never sees an
    // ownerless acquisition, and an old reaper cannot rmdir a new owner's lock.
    while (!acquired) {
      try {
        await touch(path.join(candidate, owner));
        await fs.rename(candidate, directory);
        acquired = true;
      } catch (error) {
        if (!['EEXIST', 'ENOTEMPTY', ...TRANSIENT].includes(error.code)) throw error;
        await reapDeadOwner(directory);
        if (Date.now() >= deadline) throw lockTimeout(name, directory);
        await delay(pollMs);
      }
    }
    return await action();
  } finally {
    await removeOwner(acquired ? directory : candidate, owner);
  }
}

/** Replace `file` with `temp`, waiting out a reader that holds it open for up to RENAME_RETRY_MS. */
async function renameWithRetry(temp, file) {
  for (let attempt = 0, waited = 0; ; attempt += 1) {
    try {
      return await fs.rename(temp, file);
    } catch (error) {
      if (!TRANSIENT.includes(error.code) || waited >= RENAME_RETRY_MS) throw error;
      const pause = Math.min(25 * 2 ** attempt, 400, RENAME_RETRY_MS - waited);
      await delay(pause);
      waited += pause;
    }
  }
}

/** Readers see either complete version; a failed replacement keeps the old one. */
async function writeAtomically(file, content) {
  const temp = `${file}.${randomUUID()}.tmp`;
  try {
    await fs.writeFile(temp, content, { encoding: 'utf8', flag: 'wx' });
    await renameWithRetry(temp, file);
  } finally {
    await fs.rm(temp, { force: true });
  }
}

module.exports = { withRegistryLock, writeAtomically };
