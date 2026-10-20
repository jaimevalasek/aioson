'use strict';

/**
 * Telemetry redaction — the single choke point that keeps secrets out of the
 * runtime store.
 *
 * Every execution event (runtime:log, agent:done notes, context:brief
 * decisions, hook emissions) lands in `.aioson/runtime/aios.sqlite` through
 * `insertEvent` / `insertExecutionEvent`; run and task rows carry the same
 * free text in `title` / `summary` / `goal`; three best-effort emitters
 * (self-loop guard, chain audit, sub-task) write their own INSERT. All of
 * them pass through here. Until now only the orchestrated execution stream
 * sanitized its payloads; the general stream stored whatever an agent or hook
 * passed in — an API key pasted into a task summary, a bearer token echoed by
 * a failing command — verbatim, in a file that is backed up, ingested by
 * retros, and read by dashboards.
 *
 * The rules are the ones the commit guard already trusts (`secrets-regex`):
 * value-shaped secrets (cloud/provider keys, private-key blocks) are blanked
 * wherever they appear; assignment-shaped credentials keep their key and lose
 * their value — quoted or bare, env-prefixed (`AWS_SECRET_ACCESS_KEY=`),
 * pt-BR (`senha=`), URL credentials (`postgres://user:pass@host`) — in plain
 * text and inside JSON payloads alike. JSON is redacted on the DECODED values
 * and re-serialized, so an escaped quote inside a string can never break the
 * payload. Deterministic, build-free, and cheap enough to run on every write.
 */

const { PATTERNS } = require('./security/secrets-regex');

// Assignment-shaped detectors in secrets-regex match `password = '…'` including
// the key name; telemetry keeps the key and blanks only the value, so those
// are covered by the key-preserving regexes below and skipped here.
//
// Bare provider tokens the commit guard does not block on are blanked here
// only: a redacted look-alike costs one word of a log line, a blocked commit
// costs the owner's trust in the guard. Shapes are anchored on their fixed
// prefixes and full lengths, so `ghp_short`, `sk-proj-card` or a dotted
// identifier never match; a JWT needs both its header and payload as base64
// JSON (`eyJ`).
const TOKEN_PATTERNS = [
  { id: 'github-token', pattern: /\b(?:gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{22,})\b/g },
  { id: 'slack-token', pattern: /\bxox[abeoprs]-[A-Za-z0-9-]{10,}\b/g },
  { id: 'jwt', pattern: /\beyJ[A-Za-z0-9_-]{8,}\.eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g },
  { id: 'openai-api-key', pattern: /\bsk-(?:proj|svcacct|admin)-[A-Za-z0-9_-]{20,}/g }
];
const VALUE_PATTERNS = [...PATTERNS.filter((entry) => !String(entry.id).startsWith('generic-')), ...TOKEN_PATTERNS];

// A key block without its END marker (truncated by a log limit) still carries
// the key body: blank to the end of the text in that case.
const PRIVATE_KEY_BLOCK_RE = /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?(?:-----END [A-Z ]*PRIVATE KEY-----|$)/g;

// The bare credential words, and the env-style prefixes that wrap them
// (`AWS_SECRET_ACCESS_KEY`, `GH_TOKEN`, `DB_PASSWORD`, `NEXT_PUBLIC_API_KEY`).
const CREDENTIAL_WORD = '(?:authorization|api[_-]?key|apikey|access[_-]?key|secret[_-]?key|access[_-]?token|refresh[_-]?token|secret[_-]?token|auth[_-]?token|client[_-]?secret|private[_-]?key|password|passwd|pwd|senha|secret|token)';
const CREDENTIAL_KEY = `(?:[a-z0-9]+[_-])*${CREDENTIAL_WORD}`;

// `password: hunter22`, `token=abc…`, `TOKEN="…"`, `Authorization: Bearer eyJ…`.
// A quoted value is one unit (spaces and all); a bare value stops at
// whitespace or a separator.
const PLAIN_ASSIGNMENT_RE = new RegExp(`\\b(${CREDENTIAL_KEY})(\\s*[:=]\\s*(?:bearer\\s+)?)("[^"\\n]*"|'[^'\\n]*'|[^\\s,;"']+)`, 'gi');

// `scheme://user:password@host` — the password is the secret, the user stays.
const URL_CREDENTIAL_RE = /([a-z][a-z0-9+.-]*:\/\/[^\s:@/]+:)([^\s@/]+)(@)/gi;

const REDACTED = '[REDACTED]';

// Values that only look like an assignment: a short count (`token: 1200`), a
// path (`pwd: /c/dev/app`, `PASSWORD_FILE=./secrets/x`), a placeholder the
// docs use (`<token>`, `${TOKEN}`, `***`), or an already-redacted marker.
function isBenignValue(value) {
  const bare = value.replace(/^["']|["']$/g, '');
  if (bare.length === 0) return true;
  if (bare.startsWith('[REDACTED')) return true;
  if (/^\d{1,7}$/.test(bare)) return true;
  if (/^(?:[/\\.~]|[a-z]:[\\/])/i.test(bare)) return true;
  if (/^(?:<[^>]*>|\$\{?[A-Z_][A-Z0-9_]*\}?|\*+|x{3,}|null|none|undefined|true|false)$/i.test(bare)) return true;
  return false;
}

function redactValues(text) {
  let out = text.replace(PRIVATE_KEY_BLOCK_RE, '[REDACTED:private-key-block]');
  for (const entry of VALUE_PATTERNS) {
    out = out.replace(entry.pattern, `[REDACTED:${entry.id}]`);
  }
  return out;
}

function redactTelemetryText(text) {
  if (typeof text !== 'string' || text.length === 0) return text;
  return redactValues(text)
    .replace(URL_CREDENTIAL_RE, (match, prefix, password, at) => (
      isBenignValue(password) ? match : `${prefix}${REDACTED}${at}`
    ))
    .replace(PLAIN_ASSIGNMENT_RE, (match, key, sep, value) => (
      isBenignValue(value) ? match : `${key}${sep}${REDACTED}`
    ));
}

const CREDENTIAL_KEY_RE = new RegExp(`^${CREDENTIAL_KEY}$`, 'i');

// Walks a decoded JSON value: a string under a credential-named key is the
// secret itself (blanked whole); every other string gets the text pass.
function redactDecoded(value, keyName) {
  if (typeof value === 'string') {
    if (keyName && CREDENTIAL_KEY_RE.test(keyName) && !isBenignValue(value)) return REDACTED;
    return redactTelemetryText(value);
  }
  if (Array.isArray(value)) return value.map((item) => redactDecoded(item, null));
  if (value && typeof value === 'object') {
    const out = {};
    for (const [key, item] of Object.entries(value)) out[key] = redactDecoded(item, key);
    return out;
  }
  return value;
}

function redactTelemetryJson(json) {
  if (typeof json !== 'string' || json.length === 0) return json;
  let decoded;
  try {
    decoded = JSON.parse(json);
  } catch {
    // Not JSON after all (a free-text payload): the text pass is the best
    // available, and there is no structure to preserve.
    return redactTelemetryText(json);
  }
  const redacted = redactDecoded(decoded, null);
  const serialized = JSON.stringify(redacted);
  // Unchanged content keeps its original formatting byte for byte.
  return JSON.stringify(decoded) === serialized ? json : serialized;
}

// Applied to the row right before INSERT; only the free-text columns change.
function redactTelemetryRecord(record) {
  if (!record || typeof record !== 'object') return record;
  const out = { ...record };
  for (const field of ['message', 'title', 'summary', 'goal']) {
    if (typeof out[field] === 'string') out[field] = redactTelemetryText(out[field]);
  }
  if (typeof out.payload_json === 'string') out.payload_json = redactTelemetryJson(out.payload_json);
  return out;
}

module.exports = {
  redactTelemetryText,
  redactTelemetryJson,
  redactTelemetryRecord
};
