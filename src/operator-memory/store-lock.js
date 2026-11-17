'use strict';

/**
 * operator-memory — one writer at a time per operator store.
 *
 * Every write path reads before it writes: op:capture looks the signal up
 * (exact slug, then meaning), counts the repeat, then promotes, reinforces or
 * widens; the daily sweep judges a proposal's age, then archives it. Two
 * processes interleaving those steps lost a repeat (two identical
 * confirmations ended at detected_count 1), split one decision into two slugs,
 * or archived a proposal another capture had just renewed. Atomic file writes
 * protect a file, never a read-modify-write cycle: the whole cycle holds this
 * lock, taken in the store's own folder so two operators never wait on each
 * other. Same cross-process lock as features.md and the observations hub.
 */

const { getStorageRoot } = require('./storage');
const { withRegistryLock } = require('../lib/feature-registry-storage');

const STORE_LOCK = '.store.lock';

/** True for the rejection of a lock that never came free; any other error is the action's own. */
function isLockTimeout(error) {
  return Boolean(error && error.code === 'EFEATURELOCK');
}

/** Run `action` holding the store lock of `identity`; rejects after `timeoutMs` (default 10 s). */
function withStoreLock(identity, action, options = {}) {
  return withRegistryLock(getStorageRoot(identity), action, { name: STORE_LOCK, ...options });
}

module.exports = { withStoreLock, isLockTimeout, STORE_LOCK };
