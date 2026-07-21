'use strict';

/**
 * operator-memory — slug validation at the filesystem boundary.
 *
 * Regression tests for the path-traversal finding: CLI-supplied slugs flowed
 * straight into path.join(storageRoot, 'decisions', slug + '.md'), letting
 * `op:reinforce`/`op:forget` read/rewrite/delete arbitrary .md files outside
 * the operator storage root. decisionPath/historyPath/proposalPath are now
 * fail-closed via isValidDecisionSlug (canonical deriveSlug alphabet).
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const TEST_HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'aioson-om-slug-'));
process.env.HOME = TEST_HOME;
process.env.USERPROFILE = TEST_HOME;
process.env.AIOSON_OPERATOR_ID = 'slug-test-bot';

const { ensureStorageTree, getStorageRoot } = require('../src/operator-memory/storage');
const { captureSignal, proposalPath } = require('../src/operator-memory/proposal');
const {
  promoteProposal,
  reinforceDecision,
  forgetEntry,
  decisionPath,
  historyPath,
  readDecision
} = require('../src/operator-memory/decision');
const { isValidDecisionSlug, deriveSlug } = require('../src/operator-memory/slug');
const { runOpReinforce } = require('../src/commands/op-reinforce');
const { runOpForget } = require('../src/commands/op-forget');

const TEST_IDENTITY = 'slug-test-bot';
ensureStorageTree(TEST_IDENTITY);

function silentLogger() {
  const lines = []; const errs = [];
  return { lines, errs, log: (s) => lines.push(s), error: (s) => errs.push(s), warn: (s) => errs.push(s) };
}

const INVALID_SLUGS = [
  '../../../../Windows/temp/pwn',
  '../../decoy',
  '..',
  '.',
  'a/b',
  'a\\b',
  'UPPERCASE',
  'has space',
  'dot.dot',
  'under_score',
  '',
  '-leading-dash'
];

test('isValidDecisionSlug accepts the canonical deriveSlug alphabet', () => {
  assert.equal(isValidDecisionSlug('valid-slug-123'), true);
  assert.equal(isValidDecisionSlug('untitled'), true);
  assert.equal(isValidDecisionSlug(deriveSlug('Never commit without explicit approval')), true);
  assert.equal(isValidDecisionSlug(`${'a'.repeat(40)}-99`), true); // base + collision suffix
});

test('isValidDecisionSlug rejects traversal and off-alphabet slugs', () => {
  for (const bad of INVALID_SLUGS) {
    assert.equal(isValidDecisionSlug(bad), false, JSON.stringify(bad));
  }
  assert.equal(isValidDecisionSlug(null), false);
  assert.equal(isValidDecisionSlug(undefined), false);
  assert.equal(isValidDecisionSlug(42), false);
});

test('decisionPath/historyPath/proposalPath are fail-closed on invalid slugs', () => {
  const now = new Date().toISOString();
  for (const bad of INVALID_SLUGS) {
    assert.throws(() => decisionPath(TEST_IDENTITY, bad), /invalid decision slug/, `decisionPath ${JSON.stringify(bad)}`);
    assert.throws(() => historyPath(TEST_IDENTITY, bad, now), /invalid decision slug/, `historyPath ${JSON.stringify(bad)}`);
    assert.throws(() => proposalPath(TEST_IDENTITY, bad), /invalid proposal slug/, `proposalPath ${JSON.stringify(bad)}`);
  }
});

test('valid slugs still resolve inside the storage root', () => {
  const root = getStorageRoot(TEST_IDENTITY);
  const dec = decisionPath(TEST_IDENTITY, 'valid-slug-123');
  assert.ok(dec.startsWith(path.join(root, 'decisions')));
  assert.ok(dec.endsWith('valid-slug-123.md'));
  const prop = proposalPath(TEST_IDENTITY, 'valid-slug-123');
  assert.ok(prop.startsWith(path.join(root, 'proposals')));
});

test('op:forget traversal slug cannot delete files outside the storage root', async () => {
  // Decoy .md outside the operator storage root — 4 levels up from decisions/.
  const decoyPath = path.join(TEST_HOME, 'decoy.md');
  fs.writeFileSync(decoyPath, '# do not delete me\n', 'utf8');

  await assert.rejects(
    () => runOpForget({ args: ['../../../../decoy'], options: { json: true }, logger: silentLogger() }),
    /invalid decision slug/
  );
  assert.equal(fs.existsSync(decoyPath), true, 'decoy file must survive the traversal attempt');
});

test('op:reinforce traversal slug cannot rewrite files outside the storage root', async () => {
  const decoyPath = path.join(TEST_HOME, 'decoy.md');
  const before = fs.readFileSync(decoyPath, 'utf8');

  await assert.rejects(
    () => runOpReinforce({ args: ['../../../../decoy'], options: { json: true }, logger: silentLogger() }),
    /invalid decision slug/
  );
  assert.equal(fs.readFileSync(decoyPath, 'utf8'), before, 'decoy content must be untouched');
});

test('library entry points reject traversal before any filesystem effect', () => {
  assert.throws(() => reinforceDecision(TEST_IDENTITY, '../../outside'), /invalid decision slug/);
  assert.throws(() => forgetEntry(TEST_IDENTITY, '../../outside'), /invalid decision slug/);
  assert.throws(() => readDecision(TEST_IDENTITY, '../../outside'), /invalid decision slug/);
  const leftovers = fs.readdirSync(TEST_HOME).filter((name) => name.endsWith('.tmp'));
  assert.deepEqual(leftovers, [], 'no tmp files leaked by rejected operations');
});

test('valid decision lifecycle still works after the guard (regression)', () => {
  const slug = 'guard-regression-roundtrip';
  const cap = captureSignal({
    identity: TEST_IDENTITY,
    slug,
    signal_type: 'authorization',
    quote: 'pode deletar',
    proposal: 'allow deletion without asking',
    source_agent: 'test'
  });
  promoteProposal({ identity: TEST_IDENTITY, proposal: { ...cap.proposal, detected_count: 2 } });

  const reinforced = reinforceDecision(TEST_IDENTITY, slug);
  assert.equal(reinforced.reinforcement_count, 1);

  const forgotten = forgetEntry(TEST_IDENTITY, slug);
  assert.equal(forgotten.mode, 'decision');
  assert.equal(fs.existsSync(decisionPath(TEST_IDENTITY, slug)), false);
  assert.ok(forgotten.archivedPath.startsWith(path.join(getStorageRoot(TEST_IDENTITY), 'history')));
});
