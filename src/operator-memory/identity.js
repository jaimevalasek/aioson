'use strict';

/**
 * operator-memory — identity resolution (Phase 1, v1.12.0).
 *
 * Pure helpers, no I/O side effects. Storage tree creation lives in storage.js.
 *
 * Resolution order (PMD-05 + architecture-operator-memory.md § Phase 1):
 *   1. process.env.AIOSON_OPERATOR_ID — if set + valid → use literal.
 *   2. git config --get user.email — sha256[0..16]; salt-rehash if reserved-prefix collision.
 *   3. fallback to reserved identity `_anonymous` with telemetry warning.
 */

const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');

const HASH_PREFIX_BYTES = 16;
const OVERRIDE_REGEX = /^[a-z0-9][a-z0-9-]{2,31}$/;
const SALT_V1 = 'aioson-v1';
const RESERVED_PREFIXES = ['_', 'aioson-'];

function isReservedPrefix(value) {
  return RESERVED_PREFIXES.some((prefix) => value.startsWith(prefix));
}

function validateOverride(value) {
  if (typeof value !== 'string' || value === '') {
    return { ok: false, reason: 'empty' };
  }
  // Check reserved-prefix BEFORE regex so the rejection reason matches the user's
  // mental model: `_admin` is "reserved-prefix" (even though regex would also reject
  // a leading `_`); `aioson-system` is "reserved-prefix" (regex passes but PMD-05 bans it).
  if (isReservedPrefix(value)) {
    return { ok: false, reason: 'reserved-prefix' };
  }
  if (!OVERRIDE_REGEX.test(value)) {
    return { ok: false, reason: 'regex' };
  }
  return { ok: true };
}

function hashEmail(email) {
  const normalized = String(email || '').trim();
  if (normalized === '') return null;
  const raw = crypto.createHash('sha256').update(normalized).digest('hex').slice(0, HASH_PREFIX_BYTES);
  if (isReservedPrefix(raw)) {
    return crypto.createHash('sha256').update(`${SALT_V1}:${normalized}`).digest('hex').slice(0, HASH_PREFIX_BYTES);
  }
  return raw;
}

function readGitEmail() {
  try {
    const out = execFileSync('git', ['config', '--get', 'user.email'], {
      stdio: ['ignore', 'pipe', 'ignore'],
      encoding: 'utf8',
      timeout: 2000
    });
    return out.trim();
  } catch {
    return '';
  }
}

function resolveIdentity({ env = process.env, emailReader = readGitEmail } = {}) {
  const override = env.AIOSON_OPERATOR_ID;
  if (override !== undefined && override !== null && override !== '') {
    const validation = validateOverride(override);
    if (validation.ok) {
      return {
        identity: override,
        source: 'override',
        warning: null
      };
    }
    const warning = `AIOSON_OPERATOR_ID '${override}' invalid (reason: ${validation.reason}; expected ${OVERRIDE_REGEX}, no reserved prefix). Falling back to git-email-hash.`;
    const hashFallback = hashEmail(emailReader());
    if (hashFallback) {
      return { identity: hashFallback, source: 'email-hash', warning };
    }
    return {
      identity: '_anonymous',
      source: 'anonymous-fallback',
      warning: `${warning} Git email unavailable; using '_anonymous' bucket.`
    };
  }

  const email = emailReader();
  const hash = hashEmail(email);
  if (hash) {
    return { identity: hash, source: 'email-hash', warning: null };
  }
  return {
    identity: '_anonymous',
    source: 'anonymous-fallback',
    warning: 'git config user.email unavailable; using `_anonymous` bucket. Set git config user.email or AIOSON_OPERATOR_ID to scope memory.'
  };
}

module.exports = {
  resolveIdentity,
  validateOverride,
  hashEmail,
  readGitEmail,
  HASH_PREFIX_BYTES,
  OVERRIDE_REGEX,
  SALT_V1,
  RESERVED_PREFIXES
};
