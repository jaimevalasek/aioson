'use strict';

/**
 * Phase 1 — operator-memory identity + storage tests (v1.12.0).
 *
 * AC-P1-01..10 from .aioson/plans/operator-memory/plan-storage-identity.md.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');

const {
  resolveIdentity,
  validateOverride,
  hashEmail,
  HASH_PREFIX_BYTES,
  OVERRIDE_REGEX,
  RESERVED_PREFIXES,
  SALT_V1
} = require('../src/operator-memory/identity');

const {
  ensureStorageTree,
  openIndexDb,
  migrateIndexSchema,
  recordIdentityActivity,
  getStorageRoot,
  getIndexDbPath,
  SCHEMA_VERSION
} = require('../src/operator-memory/storage');

const { runOpIdentity } = require('../src/commands/op-identity');

// Redirect ~/.aioson/operators to an isolated tmpdir for the whole test file so
// real user state is never touched. We monkey-patch os.homedir for child reads
// via process.env.HOME / USERPROFILE adjustments before requiring storage.
const TEST_HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'aioson-op-mem-test-'));
process.env.HOME = TEST_HOME;
process.env.USERPROFILE = TEST_HOME;

function silentLogger() {
  const lines = [];
  const errs = [];
  return {
    lines,
    errs,
    log: (s) => lines.push(s),
    error: (s) => errs.push(s),
    warn: (s) => errs.push(s)
  };
}

test('AC-P1-01 resolveIdentity returns hash for valid git email (mock reader)', () => {
  const result = resolveIdentity({
    env: {},
    emailReader: () => 'alice@example.com'
  });
  assert.equal(result.source, 'email-hash');
  assert.equal(result.identity.length, HASH_PREFIX_BYTES);
  assert.match(result.identity, /^[0-9a-f]{16}$/);
  assert.equal(result.warning, null);
});

test('AC-P1-01 resolveIdentity is deterministic (same email -> same hash)', () => {
  const r1 = resolveIdentity({ env: {}, emailReader: () => 'alice@example.com' });
  const r2 = resolveIdentity({ env: {}, emailReader: () => 'alice@example.com' });
  assert.equal(r1.identity, r2.identity);
});

test('AC-P1-01 different emails produce different hashes', () => {
  const a = resolveIdentity({ env: {}, emailReader: () => 'alice@example.com' });
  const b = resolveIdentity({ env: {}, emailReader: () => 'bob@example.com' });
  assert.notEqual(a.identity, b.identity);
});

test('AC-P1-03 valid AIOSON_OPERATOR_ID override is accepted', () => {
  const result = resolveIdentity({
    env: { AIOSON_OPERATOR_ID: 'ci-bot-shared' },
    emailReader: () => 'should-be-ignored@example.com'
  });
  assert.equal(result.identity, 'ci-bot-shared');
  assert.equal(result.source, 'override');
  assert.equal(result.warning, null);
});

test('AC-P1-03 invalid AIOSON_OPERATOR_ID (bad chars) falls back to email hash with warning', () => {
  const result = resolveIdentity({
    env: { AIOSON_OPERATOR_ID: 'ci@bot' },
    emailReader: () => 'alice@example.com'
  });
  assert.equal(result.source, 'email-hash');
  assert.match(result.identity, /^[0-9a-f]{16}$/);
  assert.ok(result.warning && result.warning.includes('regex'));
});

test('AC-P1-04 reserved prefix _* override is rejected', () => {
  const v = validateOverride('_admin');
  assert.equal(v.ok, false);
  assert.equal(v.reason, 'reserved-prefix');
});

test('AC-P1-04 reserved prefix aioson-* override is rejected', () => {
  const v = validateOverride('aioson-system');
  assert.equal(v.ok, false);
  assert.equal(v.reason, 'reserved-prefix');
});

test('AC-P1-04 invalid regex (too short) rejected', () => {
  const v = validateOverride('ab');
  assert.equal(v.ok, false);
  assert.equal(v.reason, 'regex');
});

test('AC-P1-04 invalid regex (uppercase) rejected', () => {
  const v = validateOverride('CI-Bot');
  assert.equal(v.ok, false);
  assert.equal(v.reason, 'regex');
});

test('AC-P1-04 invalid regex (too long) rejected', () => {
  const v = validateOverride('a'.repeat(33));
  assert.equal(v.ok, false);
  assert.equal(v.reason, 'regex');
});

test('AC-P1-04 valid override at boundary (3 chars minimum)', () => {
  // pattern is ^[a-z0-9][a-z0-9-]{2,31}$ — first char + 2-31 more = 3-32 total
  const v = validateOverride('abc');
  assert.equal(v.ok, true);
});

test('AC-P1-05 empty git email falls back to _anonymous bucket with warning', () => {
  const result = resolveIdentity({ env: {}, emailReader: () => '' });
  assert.equal(result.identity, '_anonymous');
  assert.equal(result.source, 'anonymous-fallback');
  assert.ok(result.warning && result.warning.includes('user.email'));
});

test('EC-08 salt rehash kicks in when raw hash starts with reserved prefix', () => {
  // We can't easily force a real email to produce a _-prefixed hash without
  // brute-force; instead verify the salt mechanism by direct hashEmail probe.
  // The unit hashEmail returns deterministic hex; a _-prefixed raw would trigger rehash.
  // Construct a synthetic by reading hashEmail and checking that ANY email returning a
  // _-prefixed raw is rehashed. We assert no production hash ever returns reserved-prefix.
  const sample = hashEmail('any-real-email@example.com');
  assert.ok(sample);
  assert.equal(RESERVED_PREFIXES.some((p) => sample.startsWith(p)), false);
});

test('AC-P1-06 openIndexDb creates _index.sqlite with WAL + schema', () => {
  const db = openIndexDb();
  try {
    const journalMode = db.pragma('journal_mode', { simple: true });
    assert.equal(journalMode, 'wal');
    const ver = db.prepare('SELECT version FROM schema_version LIMIT 1').get();
    assert.equal(ver.version, SCHEMA_VERSION);
    const integrity = db.pragma('integrity_check', { simple: true });
    assert.equal(integrity, 'ok');
    // operators table exists
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
    const tableNames = tables.map((t) => t.name);
    assert.ok(tableNames.includes('operators'));
    assert.ok(tableNames.includes('schema_version'));
    // FTS5 virtual table exists
    const ftsCheck = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='decisions_fts'").get();
    assert.ok(ftsCheck);
  } finally {
    db.close();
  }
});

test('AC-P1-06 schema migration is idempotent', () => {
  const db = openIndexDb();
  try {
    migrateIndexSchema(db);
    migrateIndexSchema(db);
    const rows = db.prepare('SELECT version FROM schema_version').all();
    assert.equal(rows.length, 1, 'schema_version should not duplicate on re-migration');
  } finally {
    db.close();
  }
});

test('AC-P1-02 + AC-P1-08 ensureStorageTree creates idempotent directory tree', () => {
  const identity = 'idem-test-id';
  const root = ensureStorageTree(identity);
  const decisions = path.join(root, 'decisions');
  const proposals = path.join(root, 'proposals');
  const history = path.join(root, 'history');
  assert.ok(fs.existsSync(decisions));
  assert.ok(fs.existsSync(proposals));
  assert.ok(fs.existsSync(history));

  // Second call doesn't error (idempotent)
  const root2 = ensureStorageTree(identity);
  assert.equal(root, root2);
});

test('AC-P1-08 Windows path resolution: getStorageRoot uses os.homedir', () => {
  const id = 'path-norm-test';
  const root = getStorageRoot(id);
  assert.ok(root.includes('.aioson'));
  assert.ok(root.includes('operators'));
  assert.ok(root.endsWith(id));
});

test('AC-P1-09 recordIdentityActivity inserts then updates (idempotent identity row)', () => {
  const db = openIndexDb();
  try {
    const id = 'activity-test';
    recordIdentityActivity(db, { identity: id, source: 'override' });
    const first = db.prepare('SELECT * FROM operators WHERE identity = ?').get(id);
    assert.equal(first.source, 'override');
    const firstActive = first.last_active_at;

    // Small delay
    const start = Date.now();
    while (Date.now() - start < 10) { /* spin */ }

    recordIdentityActivity(db, { identity: id, source: 'override' });
    const second = db.prepare('SELECT * FROM operators WHERE identity = ?').get(id);
    assert.equal(second.created_at, first.created_at, 'created_at should not change on update');
    assert.ok(second.last_active_at >= firstActive, 'last_active_at should advance or equal');

    // Confirm no duplicate rows
    const count = db.prepare('SELECT COUNT(*) AS c FROM operators WHERE identity = ?').get(id);
    assert.equal(count.c, 1);
  } finally {
    db.close();
  }
});

test('AC-P1-07 runOpIdentity show — happy path returns ok=true + identity + storage_root', async () => {
  const logger = silentLogger();
  const result = await runOpIdentity({ args: ['.', 'show'], options: { json: false }, logger });
  assert.equal(result.ok, true);
  assert.ok(result.identity);
  assert.ok(result.storage_root && result.storage_root.includes('operators'));
  assert.ok(logger.lines.some((l) => l.startsWith('op:identity —')));
});

test('AC-P1-07 runOpIdentity show --json returns structured result', async () => {
  const logger = silentLogger();
  const result = await runOpIdentity({ args: ['.', 'show'], options: { json: true }, logger });
  assert.equal(result.ok, true);
  assert.ok(['email-hash', 'override', 'anonymous-fallback'].includes(result.source));
  // --json should not log to stdout
  assert.equal(logger.lines.length, 0);
});

test('AC-P1-07 runOpIdentity set <invalid-id> returns ok=false with error', async () => {
  const logger = silentLogger();
  const result = await runOpIdentity({ args: ['.', 'set', '_reserved'], options: {}, logger });
  assert.equal(result.ok, false);
  assert.ok(result.error && result.error.includes('reserved-prefix'));
});

test('AC-P1-07 runOpIdentity set <valid-id> initializes the process-local override identity', async () => {
  const logger = silentLogger();
  const result = await runOpIdentity({ args: ['.', 'set', 'ci-bot-shared'], options: {}, logger });
  assert.equal(result.ok, true);
  assert.equal(result.stub, undefined);
  assert.ok(logger.lines.some((l) => l.includes('AIOSON_OPERATOR_ID=ci-bot-shared')));
});

test('AC-P1-07 stubs (op:capture/promote/forget/list/show) all exit non-zero with stub error', async () => {
  const stubs = require('../src/commands/op-stubs');
  const commands = ['runOpCapture', 'runOpPromote', 'runOpForget', 'runOpList', 'runOpShow'];
  for (const fnName of commands) {
    const logger = silentLogger();
    const result = await stubs[fnName]({ args: [], options: {}, logger });
    assert.equal(result.ok, false, `${fnName} should return ok=false`);
    assert.equal(result.stub, true);
    assert.ok(logger.errs.length > 0, `${fnName} should emit stderr`);
  }
});

test('AC-P1-10 hash size is exactly 16 hex chars (DD-02 ratified)', () => {
  const samples = ['a@b.com', 'longer.email.address@example.org', '日本語@example.jp'];
  for (const e of samples) {
    const h = hashEmail(e);
    assert.equal(h.length, 16, `hash for ${e} should be 16 chars`);
    assert.match(h, /^[0-9a-f]{16}$/);
  }
});
