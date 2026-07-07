'use strict';

/**
 * Phase 2 — operator-memory capture + promotion tests (v1.13.0).
 *
 * AC-P2-01..12 from .aioson/plans/operator-memory/plan-capture-promotion.md.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

// Isolate ~/.aioson into a tmp dir BEFORE requiring storage-dependent modules
const TEST_HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'aioson-om-p2-'));
process.env.HOME = TEST_HOME;
process.env.USERPROFILE = TEST_HOME;
// Force resolveIdentity to return our test identity for CLI command tests.
process.env.AIOSON_OPERATOR_ID = 'p2-test-bot';

const { deriveSlug, fingerprintProposal, normalize } = require('../src/operator-memory/slug');
const { captureSignal, readProposal, deleteProposal, MAX_QUOTES, VALID_SIGNAL_TYPES } = require('../src/operator-memory/proposal');
const { promoteProposal, forgetEntry, readDecision, inferCategory, SCHEMA_VERSION, MAX_BODY_CHARS } = require('../src/operator-memory/decision');
const { ensureStorageTree, openIndexDb } = require('../src/operator-memory/storage');
const { runOpCapture } = require('../src/commands/op-capture');
const { runOpPromote } = require('../src/commands/op-promote');
const { runOpForget } = require('../src/commands/op-forget');

function silentLogger() {
  const lines = []; const errs = [];
  return { lines, errs, log: (s) => lines.push(s), error: (s) => errs.push(s), warn: (s) => errs.push(s) };
}

const TEST_IDENTITY = 'p2-test-bot';

// Pre-create identity storage for every test (isolated under TEST_HOME)
ensureStorageTree(TEST_IDENTITY);

test('AC-P2-02 deriveSlug is deterministic for same proposal text', () => {
  const a = deriveSlug('commit autônomo após approval de slice');
  const b = deriveSlug('commit autônomo após approval de slice');
  assert.equal(a, b);
});

test('AC-P2-02 deriveSlug produces different slugs for different proposals', () => {
  const a = deriveSlug('commit autônomo após approval');
  const b = deriveSlug('npm publish manual');
  assert.notEqual(a, b);
});

test('AC-P2-02 deriveSlug filters stopwords (de, em, com)', () => {
  const slug = deriveSlug('commit de autonomo em slice');
  assert.equal(slug.includes('-de-'), false);
  assert.equal(slug.includes('-em-'), false);
});

test('AC-P2-02 deriveSlug truncates to MAX_SLUG_LENGTH at word boundary', () => {
  const long = 'a '.repeat(50) + 'very long proposal text that exceeds the maximum slug length on purpose';
  const slug = deriveSlug(long);
  assert.ok(slug.length <= 40, `slug length ${slug.length} > 40`);
});

test('AC-P2-02 deriveSlug collision: same slug different proposal → appends counter', () => {
  const existing = { 'foo-bar': fingerprintProposal('original text foo bar') };
  const existsCheck = (slug) => existing[slug] || null;
  const newSlug = deriveSlug('foo bar', existsCheck);
  assert.equal(newSlug, 'foo-bar-2');
});

test('AC-P2-02 deriveSlug idempotent: same proposal at same slug → reuse', () => {
  const fp = fingerprintProposal('original text');
  const existsCheck = (slug) => slug === 'original-text' ? fp : null;
  const slug = deriveSlug('original text', existsCheck);
  assert.equal(slug, 'original-text');
});

test('AC-P2-01 captureSignal writes proposal on first detection', () => {
  const slug = `cap-1-${Date.now()}`;
  const r = captureSignal({
    identity: TEST_IDENTITY,
    slug,
    signal_type: 'authorization',
    quote: 'verbatim quote',
    proposal: 'paraphrase here',
    source_agent: 'dev'
  });
  assert.equal(r.isNew, true);
  assert.equal(r.proposal.detected_count, 1);
  const stored = readProposal(TEST_IDENTITY, slug);
  assert.ok(stored);
  assert.equal(stored.signal_type, 'authorization');
  assert.deepEqual(stored.quotes, ['verbatim quote']);
});

test('AC-P2-01 captureSignal second detection increments count, appends quote', () => {
  const slug = `cap-2-${Date.now()}`;
  captureSignal({ identity: TEST_IDENTITY, slug, signal_type: 'authorization', quote: 'first', proposal: 'p', source_agent: 'dev' });
  const r2 = captureSignal({ identity: TEST_IDENTITY, slug, signal_type: 'authorization', quote: 'second', proposal: 'p', source_agent: 'dev' });
  assert.equal(r2.isNew, false);
  assert.equal(r2.proposal.detected_count, 2);
  assert.deepEqual(r2.proposal.quotes, ['first', 'second']);
});

test('AC-P2-07 captureSignal rejects invalid signal_type', () => {
  assert.throws(() => {
    captureSignal({ identity: TEST_IDENTITY, slug: 'bad', signal_type: 'not-a-signal', quote: 'q', proposal: 'p', source_agent: 'dev' });
  }, /Invalid signal_type/);
});

test('AC-P2-07 VALID_SIGNAL_TYPES enumerates exactly 4 signals', () => {
  assert.deepEqual(VALID_SIGNAL_TYPES.sort(), ['authorization', 'confirmation', 'correction', 'exclusion']);
});

test('AC-P2-01 captureSignal caps quotes at MAX_QUOTES (5)', () => {
  const slug = `cap-quotes-${Date.now()}`;
  for (let i = 0; i < 7; i += 1) {
    captureSignal({ identity: TEST_IDENTITY, slug, signal_type: 'authorization', quote: `q${i}`, proposal: 'p', source_agent: 'dev' });
  }
  const stored = readProposal(TEST_IDENTITY, slug);
  assert.equal(stored.quotes.length, MAX_QUOTES);
  // Should retain the 5 most recent (q2..q6)
  assert.deepEqual(stored.quotes, ['q2', 'q3', 'q4', 'q5', 'q6']);
});

test('AC-P2-03 promoteProposal atomic: proposal deleted + decision written + FTS5 row inserted', () => {
  const slug = `promote-${Date.now()}`;
  const p = captureSignal({ identity: TEST_IDENTITY, slug, signal_type: 'authorization', quote: 'q', proposal: 'commit autonomo deploy publish', source_agent: 'dev' });
  const decision = promoteProposal({ identity: TEST_IDENTITY, proposal: p.proposal });

  assert.equal(readProposal(TEST_IDENTITY, slug), null, 'proposal should be removed');
  const readBack = readDecision(TEST_IDENTITY, slug);
  assert.ok(readBack, 'decision should exist');
  assert.equal(readBack.signal_type, 'authorization');
  assert.equal(readBack.category, 'autonomy');
  assert.equal(readBack.version_schema, SCHEMA_VERSION);

  const db = openIndexDb();
  try {
    const fts = db.prepare("SELECT slug, category FROM decisions_fts WHERE identity = ? AND slug = ?").get(TEST_IDENTITY, slug);
    assert.ok(fts, 'FTS5 row should exist');
    assert.equal(fts.category, 'autonomy');
  } finally {
    db.close();
  }
});

test('AC-P2-09 FTS5 mirror searchable by body keyword', () => {
  const slug = `fts-${Date.now()}`;
  const p = captureSignal({ identity: TEST_IDENTITY, slug, signal_type: 'authorization', quote: 'q', proposal: 'use docker compose for local services', source_agent: 'dev' });
  promoteProposal({ identity: TEST_IDENTITY, proposal: p.proposal });

  const db = openIndexDb();
  try {
    const row = db.prepare("SELECT slug FROM decisions_fts WHERE identity = ? AND decisions_fts MATCH 'docker'").get(TEST_IDENTITY);
    assert.ok(row, 'FTS5 should find the row by keyword "docker"');
    assert.equal(row.slug, slug);
  } finally {
    db.close();
  }
});

test('inferCategory: authorization+commit → autonomy', () => {
  assert.equal(inferCategory('authorization', 'commit autonomo'), 'autonomy');
  assert.equal(inferCategory('authorization', 'npm publish'), 'autonomy');
  assert.equal(inferCategory('authorization', 'preferencia de estilo'), 'identity');
  assert.equal(inferCategory('authorization', 'use kubectl'), 'tooling');
  assert.equal(inferCategory('exclusion', 'whatever'), 'default');
  assert.equal(inferCategory('authorization', 'random text'), 'default');
});

test('AC-P2-06 forgetEntry on decision → moves to history, removes FTS5 row', () => {
  const slug = `forget-d-${Date.now()}`;
  const p = captureSignal({ identity: TEST_IDENTITY, slug, signal_type: 'authorization', quote: 'q', proposal: 'something autonomy', source_agent: 'dev' });
  promoteProposal({ identity: TEST_IDENTITY, proposal: p.proposal });

  const result = forgetEntry(TEST_IDENTITY, slug);
  assert.equal(result.mode, 'decision');
  assert.ok(result.archivedPath && fs.existsSync(result.archivedPath));
  assert.equal(readDecision(TEST_IDENTITY, slug), null);

  const db = openIndexDb();
  try {
    const fts = db.prepare("SELECT slug FROM decisions_fts WHERE identity = ? AND slug = ?").get(TEST_IDENTITY, slug);
    assert.equal(fts, undefined, 'FTS5 row should be removed');
  } finally {
    db.close();
  }
});

test('AC-P2-06 forgetEntry idempotent: second call on absent slug → noop', () => {
  const slug = `forget-noop-${Date.now()}`;
  forgetEntry(TEST_IDENTITY, slug);
  const result = forgetEntry(TEST_IDENTITY, slug);
  assert.equal(result.mode, 'noop');
});

test('AC-P2-06 forgetEntry on proposal (not yet promoted) → archives proposal', () => {
  const slug = `forget-p-${Date.now()}`;
  captureSignal({ identity: TEST_IDENTITY, slug, signal_type: 'authorization', quote: 'q', proposal: 'pending', source_agent: 'dev' });
  const result = forgetEntry(TEST_IDENTITY, slug);
  assert.equal(result.mode, 'proposal');
  assert.equal(readProposal(TEST_IDENTITY, slug), null);
});

test('AC-P2-04 runOpCapture: first detection silent (no audit line)', async () => {
  const logger = silentLogger();
  const result = await runOpCapture({
    args: [],
    options: { signal: 'confirmation', quote: 'q1', proposal: `unique-first-${Date.now()}`, 'source-agent': 'dev' },
    logger
  });
  assert.equal(result.ok, true);
  assert.equal(result.promoted, false);
  assert.equal(logger.lines.length, 0, 'first detection should not emit audit line');
});

test('AC-P2-04 runOpCapture: second detection promotes + emits 1-liner audit', async () => {
  const proposalText = `unique-promote-${Date.now()}`;
  const logger1 = silentLogger();
  await runOpCapture({ args: [], options: { signal: 'confirmation', quote: 'q1', proposal: proposalText, 'source-agent': 'dev' }, logger: logger1 });

  const logger2 = silentLogger();
  const result = await runOpCapture({ args: [], options: { signal: 'confirmation', quote: 'q2', proposal: proposalText, 'source-agent': 'dev' }, logger: logger2 });

  assert.equal(result.ok, true);
  assert.equal(result.promoted, true);
  assert.ok(logger2.lines.some((l) => l.includes('✔ Memory:')), 'should emit audit line on promotion');
  assert.ok(logger2.lines.some((l) => l.includes('aioson op:forget')), 'audit should mention forget action');
});

test('AC-P2-04 runOpCapture --json returns structured result', async () => {
  const proposalText = `json-test-${Date.now()}`;
  const result = await runOpCapture({
    args: [],
    options: { signal: 'confirmation', quote: 'q', proposal: proposalText, json: true },
    logger: silentLogger()
  });
  assert.equal(result.ok, true);
  assert.ok(result.slug);
  assert.equal(result.promoted, false);
});

test('AC-P2-04 runOpCapture missing --signal returns ok=false', async () => {
  const result = await runOpCapture({ args: [], options: { proposal: 'p' }, logger: silentLogger() });
  assert.equal(result.ok, false);
});

test('AC-P2-05 runOpPromote: works on existing proposal (skip threshold)', async () => {
  const proposalText = `manual-promote-${Date.now()}`;
  await runOpCapture({ args: [], options: { signal: 'confirmation', quote: 'q', proposal: proposalText, 'source-agent': 'dev' }, logger: silentLogger() });
  // Confirmation stays a proposal on 1st detection (detected_count=1). Manual promote skips threshold.
  const slug = require('../src/operator-memory/slug').deriveSlug(proposalText);
  const result = await runOpPromote({ args: [slug], options: {}, logger: silentLogger() });
  assert.equal(result.ok, true);
  assert.ok(readDecision(TEST_IDENTITY, slug));
});

test('AC-P2-05 runOpPromote on unknown slug → ok=false', async () => {
  const result = await runOpPromote({ args: ['non-existent-slug-xyz'], options: {}, logger: silentLogger() });
  assert.equal(result.ok, false);
});

test('AC-P2-08 telemetry event fires (no crash on capture)', async () => {
  // We cannot easily intercept dossierTelemetry from here, but we can verify
  // that capture+promote complete without throwing — the telemetry is best-effort.
  const result = await runOpCapture({
    args: [],
    options: { signal: 'confirmation', quote: 'q', proposal: `telemetry-${Date.now()}` },
    logger: silentLogger()
  });
  assert.equal(result.ok, true);
});

test('AC-P2-11 decision body capped at MAX_BODY_CHARS (500)', () => {
  const slug = `body-cap-${Date.now()}`;
  const longProposal = 'a '.repeat(600);
  const p = captureSignal({ identity: TEST_IDENTITY, slug, signal_type: 'authorization', quote: 'q', proposal: longProposal, source_agent: 'dev' });
  const d = promoteProposal({ identity: TEST_IDENTITY, proposal: p.proposal });
  assert.ok(d.body.length <= MAX_BODY_CHARS);
});

test('AC-P2-12 capture pipeline does not crash when storage path is fresh (cold start)', async () => {
  // Spawn a sub-identity scope and ensure first-ever capture works
  const altId = `cold-${Date.now()}`;
  ensureStorageTree(altId);
  // captureSignal directly to alt identity (CLI would use AIOSON_OPERATOR_ID env)
  const result = captureSignal({ identity: altId, slug: 'first', signal_type: 'authorization', quote: 'q', proposal: 'cold-start-test', source_agent: 'dev' });
  assert.equal(result.isNew, true);
});

test('threshold: authorization/exclusion/correction promote on FIRST detection (1x)', async () => {
  for (const sig of ['authorization', 'exclusion', 'correction']) {
    const proposalText = `firstshot-${sig}-${Date.now()}`;
    const logger = silentLogger();
    const result = await runOpCapture({
      args: [], options: { signal: sig, quote: 'q', proposal: proposalText, 'source-agent': 'dev' }, logger
    });
    assert.equal(result.ok, true);
    assert.equal(result.promoted, true, `${sig} should promote on first detection`);
    const slug = deriveSlug(proposalText);
    assert.ok(readDecision(TEST_IDENTITY, slug), `${sig} decision should exist`);
    assert.equal(readProposal(TEST_IDENTITY, slug), null, `${sig} proposal should be consumed`);
    assert.ok(logger.lines.some((l) => l.includes('✔ Memory:')), `${sig} should emit promote audit`);
  }
});

test('threshold: confirmation still requires 2x (1st stays a proposal, 2nd promotes)', async () => {
  const proposalText = `conf2x-${Date.now()}`;
  const r1 = await runOpCapture({ args: [], options: { signal: 'confirmation', quote: 'q1', proposal: proposalText, 'source-agent': 'dev' }, logger: silentLogger() });
  assert.equal(r1.promoted, false, 'confirmation 1st detection does not promote');
  const slug = deriveSlug(proposalText);
  assert.ok(readProposal(TEST_IDENTITY, slug), 'confirmation 1st detection stays a proposal');
  const r2 = await runOpCapture({ args: [], options: { signal: 'confirmation', quote: 'q2', proposal: proposalText, 'source-agent': 'dev' }, logger: silentLogger() });
  assert.equal(r2.promoted, true, 'confirmation promotes on 2nd detection');
});

test('idempotency: re-detecting a promoted decision reinforces (single FTS row, bumps count)', async () => {
  const proposalText = `reinforce-redetect-${Date.now()}`;
  await runOpCapture({ args: [], options: { signal: 'correction', quote: 'q1', proposal: proposalText, 'source-agent': 'dev' }, logger: silentLogger() });
  const slug = deriveSlug(proposalText);

  const r2 = await runOpCapture({ args: [], options: { signal: 'correction', quote: 'q2', proposal: proposalText, 'source-agent': 'dev' }, logger: silentLogger() });
  assert.equal(r2.promoted, false, 're-detection does not re-promote');
  assert.equal(r2.reinforced, true, 're-detection reinforces');
  assert.equal(readProposal(TEST_IDENTITY, slug), null, 'no stray proposal left behind');

  const dec = readDecision(TEST_IDENTITY, slug);
  assert.ok(dec, 'decision still exists after reinforce');
  assert.equal(Number(dec.reinforcement_count), 1, 'reinforcement_count bumped to 1');

  const db = openIndexDb();
  try {
    const row = db.prepare('SELECT COUNT(*) AS n FROM decisions_fts WHERE identity = ? AND slug = ?').get(TEST_IDENTITY, slug);
    assert.equal(row.n, 1, 'exactly one FTS row (no duplication)');
  } finally {
    db.close();
  }
});

test('promotionThresholdFor: confirmation=2, other signals=1', () => {
  const { promotionThresholdFor } = require('../src/commands/op-capture');
  assert.equal(promotionThresholdFor('confirmation'), 2);
  assert.equal(promotionThresholdFor('authorization'), 1);
  assert.equal(promotionThresholdFor('exclusion'), 1);
  assert.equal(promotionThresholdFor('correction'), 1);
});
