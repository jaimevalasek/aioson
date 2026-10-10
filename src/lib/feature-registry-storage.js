'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { setTimeout: delay } = require('node:timers/promises');

const LOCK_NAME = '.features.lock';

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
    await fs.unlink(path.join(directory, owner));
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
    if (!['ENOENT', 'ENOTEMPTY', 'EEXIST'].includes(error.code)) throw error;
  }
}

async function reapDeadOwner(directory) {
  let entries;
  try {
    entries = await fs.readdir(directory);
  } catch (error) {
    if (error.code === 'ENOENT') return;
    throw error;
  }
  // A process may have died between unlinking its owner marker and rmdir.
  if (entries.length === 0) return removeEmptyDirectory(directory);
  if (entries.length !== 1) return;
  const match = /^(\d+)-[a-f0-9-]+\.owner$/.exec(entries[0]);
  if (match && !isAlive(Number(match[1]))) await removeOwner(directory, entries[0]);
}

/** Serialize the entire read/mutate/write transaction across CLI processes. */
async function withRegistryLock(ctxDir, action, { timeoutMs = 10_000, pollMs = 25 } = {}) {
  await fs.mkdir(ctxDir, { recursive: true });
  const directory = path.join(ctxDir, LOCK_NAME);
  const owner = `${process.pid}-${randomUUID()}.owner`;
  const candidate = await fs.mkdtemp(path.join(ctxDir, '.features-lock-'));
  let acquired = false;
  const deadline = Date.now() + timeoutMs;
  try {
    await fs.writeFile(path.join(candidate, owner), '', { flag: 'wx' });
    // Publish a populated directory atomically. A contender never sees an
    // ownerless acquisition, and an old reaper cannot rmdir a new owner's lock.
    while (!acquired) {
      try {
        await fs.rename(candidate, directory);
        acquired = true;
      } catch (error) {
        if (!['EEXIST', 'ENOTEMPTY', 'EPERM', 'EACCES'].includes(error.code)) throw error;
        await reapDeadOwner(directory);
        if (Date.now() >= deadline) {
          const locked = new Error(`Timed out waiting for feature registry lock: ${directory}`);
          locked.code = 'EFEATURELOCK';
          throw locked;
        }
        await delay(pollMs);
      }
    }
    return await action();
  } finally {
    await removeOwner(acquired ? directory : candidate, owner);
  }
}

/** Readers see either complete version; a failed replacement keeps the old one. */
async function writeAtomically(file, content) {
  const temp = `${file}.${randomUUID()}.tmp`;
  try {
    await fs.writeFile(temp, content, { encoding: 'utf8', flag: 'wx' });
    for (let attempt = 0; ; attempt += 1) {
      try {
        await fs.rename(temp, file);
        return;
      } catch (error) {
        // Windows readers/antivirus can briefly refuse replacement.
        if (!['EPERM', 'EACCES', 'EBUSY'].includes(error.code) || attempt >= 5) throw error;
        await delay(25 * (attempt + 1));
      }
    }
  } finally {
    await fs.rm(temp, { force: true });
  }
}

module.exports = { withRegistryLock, writeAtomically };
