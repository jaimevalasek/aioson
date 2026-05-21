'use strict';

/**
 * Phase 5 — operator-memory TTL decay + prune + reinforce + migrate (v1.16.0).
 *
 * AC-P5-01..14 from .aioson/plans/operator-memory/plan-ttl-migration.md.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const TEST_HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'aioson-om-p5-'));
process.env.HOME = TEST_HOME;
process.env.USERPROFILE = TEST_HOME;
process.env.AIOSON_OPERATOR_ID = 'p5-test-bot';

const { ensureStorageTree, getStorageRoot } = require('../src/operator-memory/storage');
const { captureSignal } = require('../src/operator-memory/proposal');
const { promoteProposal, readDecision, decisionPath, serializeDecision } = require('../src/operator-memory/decision');
const {
  findStaleDecisions,
  markDecayPromptShown,
  formatDecayPrompt,
  cleanupHistory,
  halfLifeForCategory,
  daysSinceReinforced,
  loadDecayState,
  HALF_LIFE_DAYS_DEFAULT,
  DAY_MS
} = require('../src/operator-memory/decay');
const { enforceCap, countDecisions, pickPruneCandidates, getMaxDecisions } = require('../src/operator-memory/prune');
const { runOpReinforce } = require('../src/commands/op-reinforce');
const { runOpMigrate, KNOWN_FIELDS } = require('../src/commands/op-migrate');
const { runOpIdentity } = require('../src/commands/op-identity');

const TEST_IDENTITY = 'p5-test-bot';
ensureStorageTree(TEST_IDENTITY);

function silentLogger() {
  const lines = []; const errs = [];
  return { lines, errs, log: (s) => lines.push(s), error: (s) => errs.push(s), warn: (s) => errs.push(s) };
}

function seedDecision(identity, slug, signalType, body, category) {
  const cap = captureSignal({ identity, slug, signal_type: signalType, quote: 'q', proposal: body, source_agent: 'test' });
  const decision = promoteProposal({ identity, proposal: { ...cap.proposal, detected_count: 2 } });
  if (category && category !== decision.category) {
    // Override category for tests (rewrite frontmatter directly)
    const fp = decisionPath(identity, slug);
    const content = serializeDecision({ ...decision, category, body, title: slug });
    fs.writeFileSync(fp, content, 'utf8');
  }
  return decision;
}

function backdateDecision(identity, slug, daysAgo) {
  // Rewrite last_reinforced to be N days ago. Read, edit frontmatter, write.
  const fp = decisionPath(identity, slug);
  const content = fs.readFileSync(fp, 'utf8');
  const past = new Date(Date.now() - daysAgo * DAY_MS).toISOString();
  const updated = content
    .replace(/last_reinforced:.*/, `last_reinforced: ${past}`)
    .replace(/promoted_at:.*/, `promoted_at: ${past}`);
  fs.writeFileSync(fp, updated, 'utf8');
}

// ─── Decay engine ────────────────────────────────────────────────────────────

test('AC-P5-01 halfLifeForCategory returns PMD-03 defaults', () => {
  assert.equal(halfLifeForCategory('identity'), 365);
  assert.equal(halfLifeForCategory('autonomy'), 180);
  assert.equal(halfLifeForCategory('tooling'), 90);
  assert.equal(halfLifeForCategory('default'), 90);
});

test('AC-P5-01 halfLifeForCategory respects env override', () => {
  const prev = process.env.AIOSON_OPERATOR_DECAY_IDENTITY_DAYS;
  process.env.AIOSON_OPERATOR_DECAY_IDENTITY_DAYS = '730';
  assert.equal(halfLifeForCategory('identity'), 730);
  if (prev === undefined) delete process.env.AIOSON_OPERATOR_DECAY_IDENTITY_DAYS;
  else process.env.AIOSON_OPERATOR_DECAY_IDENTITY_DAYS = prev;
});

test('AC-P5-01 unknown category falls back to default half-life (90d)', () => {
  assert.equal(halfLifeForCategory('not-a-category'), 90);
});

test('daysSinceReinforced computes days from last_reinforced', () => {
  const decision = { last_reinforced: new Date(Date.now() - 50 * DAY_MS).toISOString() };
  const days = daysSinceReinforced(decision);
  assert.ok(days >= 49 && days <= 51, `expected ~50 days, got ${days}`);
});

test('AC-P5-03 findStaleDecisions returns only past-half-life entries', () => {
  const altId = 'p5-decay-find';
  ensureStorageTree(altId);
  // Fresh decision (today) — not stale
  seedDecision(altId, 'fresh-decision', 'authorization', 'commit autonomous fresh', 'autonomy');
  // Stale decision: autonomy category, half-life 180d; backdate 200d
  seedDecision(altId, 'stale-decision', 'authorization', 'commit autonomous stale', 'autonomy');
  backdateDecision(altId, 'stale-decision', 200);

  const stale = findStaleDecisions(altId);
  assert.equal(stale.length, 1);
  assert.equal(stale[0].slug, 'stale-decision');
  assert.ok(stale[0].days_stale >= 200);
});

test('AC-P5-03 findStaleDecisions debounces within window', () => {
  const altId = 'p5-decay-debounce';
  ensureStorageTree(altId);
  seedDecision(altId, 'stale-d', 'authorization', 'stale decision body', 'tooling');
  backdateDecision(altId, 'stale-d', 95); // tooling half-life is 90d

  let stale = findStaleDecisions(altId);
  assert.equal(stale.length, 1, 'first sweep should find the stale entry');

  // Mark prompt shown
  markDecayPromptShown(altId, 'stale-d');

  stale = findStaleDecisions(altId);
  assert.equal(stale.length, 0, 'second sweep within 30d window should suppress');

  // Override debounce to 0 days → should re-surface
  stale = findStaleDecisions(altId, { debounceDays: 0 });
  assert.equal(stale.length, 1, 'with 0d debounce, stale entry resurfaces');
});

test('formatDecayPrompt matches spec', () => {
  const prompt = formatDecayPrompt({ slug: 'foo', category: 'autonomy', days_stale: 200, half_life: 180 });
  assert.match(prompt, /⏱ Memory 'foo' is 200d stale \(autonomy, half-life=180d\)/);
  assert.match(prompt, /aioson op:reinforce foo \| op:forget foo/);
});

test('loadDecayState returns empty object on absent state file', () => {
  const state = loadDecayState('p5-decay-ghost-id');
  assert.deepEqual(state, {});
});

// ─── op:reinforce ────────────────────────────────────────────────────────────

test('AC-P5-04 runOpReinforce refreshes last_reinforced + increments count', async () => {
  const altId = 'p5-reinforce';
  ensureStorageTree(altId);
  const prev = process.env.AIOSON_OPERATOR_ID;
  process.env.AIOSON_OPERATOR_ID = altId;
  try {
    seedDecision(altId, 'reinforce-target', 'authorization', 'reinforce target body', 'autonomy');
    backdateDecision(altId, 'reinforce-target', 200);
    const before = readDecision(altId, 'reinforce-target');
    const result = await runOpReinforce({ args: ['reinforce-target'], options: { json: true }, logger: silentLogger() });
    assert.equal(result.ok, true);
    const after = readDecision(altId, 'reinforce-target');
    assert.notEqual(after.last_reinforced, before.last_reinforced);
    assert.equal(Number(after.reinforcement_count), Number(before.reinforcement_count || 0) + 1);
  } finally {
    process.env.AIOSON_OPERATOR_ID = prev;
  }
});

test('AC-P5-04 runOpReinforce on unknown slug returns ok=false', async () => {
  const result = await runOpReinforce({ args: ['nonexistent'], options: { json: true }, logger: silentLogger() });
  assert.equal(result.ok, false);
});

// ─── op:migrate ──────────────────────────────────────────────────────────────

test('AC-P5-05 runOpMigrate consumes user-profile.md, creates decisions, marks deprecated', async () => {
  // Create a fake project dir with user-profile.md
  const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aioson-p5-migrate-'));
  fs.mkdirSync(path.join(projectDir, '.aioson', 'context'), { recursive: true });
  const profilePath = path.join(projectDir, '.aioson', 'context', 'user-profile.md');
  fs.writeFileSync(profilePath, `---
autonomy_preference: high
communication_style: terse
unknown_field: keep-this
---

# User Profile
`, 'utf8');

  const prev = process.cwd();
  const altId = 'p5-migrate-bot';
  ensureStorageTree(altId);
  process.env.AIOSON_OPERATOR_ID = altId;
  process.chdir(projectDir);

  try {
    const result = await runOpMigrate({ args: [], options: { json: true }, logger: silentLogger() });
    assert.equal(result.ok, true);
    assert.equal(result.migrated, 2, `expected 2 migrated, got ${result.migrated}`);
    // Verify decisions exist
    assert.ok(readDecision(altId, 'autonomy-preference-high'));
    assert.ok(readDecision(altId, 'communication-style-terse'));
    // Verify deprecation marker
    const updated = fs.readFileSync(profilePath, 'utf8');
    assert.ok(updated.includes('deprecated_by: operator-memory'));
    assert.ok(updated.includes('deprecated_at:'));
  } finally {
    process.chdir(prev);
    process.env.AIOSON_OPERATOR_ID = TEST_IDENTITY;
  }
});

test('AC-P5-05 runOpMigrate is idempotent (already-deprecated user-profile.md skipped)', async () => {
  const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aioson-p5-idemp-'));
  fs.mkdirSync(path.join(projectDir, '.aioson', 'context'), { recursive: true });
  const profilePath = path.join(projectDir, '.aioson', 'context', 'user-profile.md');
  fs.writeFileSync(profilePath, `---
autonomy_preference: high
deprecated_by: operator-memory
deprecated_at: 2026-05-01T00:00:00Z
---
`, 'utf8');

  const prev = process.cwd();
  process.chdir(projectDir);
  try {
    const result = await runOpMigrate({ args: [], options: { json: true }, logger: silentLogger() });
    assert.equal(result.ok, true);
    assert.equal(result.migrated, 0);
    assert.ok(result.idempotent || result.reason === 'already_deprecated');
  } finally {
    process.chdir(prev);
  }
});

test('AC-P5-05 runOpMigrate skips when no user-profile.md exists', async () => {
  const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aioson-p5-noprofile-'));
  const prev = process.cwd();
  process.chdir(projectDir);
  try {
    const result = await runOpMigrate({ args: [], options: { json: true }, logger: silentLogger() });
    assert.equal(result.ok, true);
    assert.equal(result.migrated, 0);
  } finally {
    process.chdir(prev);
  }
});

test('KNOWN_FIELDS map covers 8 documented user-profile.md dimensions', () => {
  const expected = ['autonomy_preference', 'communication_style', 'feedback_density', 'correction_tolerance', 'tool_authorization', 'workflow_strictness', 'ui_style', 'verbosity'];
  for (const f of expected) {
    assert.ok(KNOWN_FIELDS[f], `expected KNOWN_FIELDS to include '${f}'`);
  }
});

// ─── Hard cap enforcement ────────────────────────────────────────────────────

test('AC-P5-07 enforceCap returns empty when count < cap', () => {
  const altId = 'p5-cap-under';
  ensureStorageTree(altId);
  seedDecision(altId, 'only-one', 'authorization', 'just one decision', 'default');
  const pruned = enforceCap(altId, { cap: 10 });
  assert.deepEqual(pruned, []);
});

test('AC-P5-07 enforceCap prunes oldest non-identity when count >= cap', () => {
  const altId = 'p5-cap-over';
  ensureStorageTree(altId);

  // Seed 3 decisions: 1 identity (newest), 2 default (older + oldest)
  seedDecision(altId, 'd-oldest', 'authorization', 'body for oldest non-id', 'default');
  backdateDecision(altId, 'd-oldest', 200);

  seedDecision(altId, 'd-older', 'authorization', 'body for older non-id', 'default');
  backdateDecision(altId, 'd-older', 100);

  seedDecision(altId, 'd-identity', 'authorization', 'body for identity decision', 'identity');
  // Identity is fresh — should NEVER be pruned per PMD-04

  const pruned = enforceCap(altId, { cap: 2 });
  assert.equal(pruned.length, 2); // cap=2, count=3, need=3-2+1=2 to make room for incoming
  assert.ok(pruned.includes('d-oldest'));
  assert.ok(pruned.includes('d-older'));
  // Identity decision is preserved
  assert.ok(readDecision(altId, 'd-identity'));
});

test('AC-P5-07 enforceCap never prunes identity category', () => {
  const altId = 'p5-cap-id-protected';
  ensureStorageTree(altId);
  seedDecision(altId, 'id-1', 'authorization', 'identity decision a', 'identity');
  seedDecision(altId, 'id-2', 'authorization', 'identity decision b', 'identity');
  seedDecision(altId, 'id-3', 'authorization', 'identity decision c', 'identity');
  // All identity — even at cap=1, prune should fail to find candidates
  const pruned = enforceCap(altId, { cap: 1 });
  assert.equal(pruned.length, 0, 'no identity candidates to prune');
  assert.equal(countDecisions(altId), 3);
});

test('pickPruneCandidates returns oldest non-identity entries first', () => {
  const altId = 'p5-pick';
  ensureStorageTree(altId);
  seedDecision(altId, 'pick-old', 'authorization', 'pick old body', 'default');
  backdateDecision(altId, 'pick-old', 200);
  seedDecision(altId, 'pick-new', 'authorization', 'pick new body', 'default');
  seedDecision(altId, 'pick-id', 'authorization', 'pick id body', 'identity');

  const candidates = pickPruneCandidates(altId, 2);
  assert.equal(candidates.length, 2);
  // Identity should NOT be a candidate
  assert.equal(candidates.some((c) => c.slug === 'pick-id'), false);
  // Oldest should be first
  assert.equal(candidates[0].slug, 'pick-old');
});

test('getMaxDecisions respects AIOSON_OPERATOR_MAX_DECISIONS env override', () => {
  const prev = process.env.AIOSON_OPERATOR_MAX_DECISIONS;
  process.env.AIOSON_OPERATOR_MAX_DECISIONS = '5';
  assert.equal(getMaxDecisions(), 5);
  if (prev === undefined) delete process.env.AIOSON_OPERATOR_MAX_DECISIONS;
  else process.env.AIOSON_OPERATOR_MAX_DECISIONS = prev;
});

// ─── History cleanup ────────────────────────────────────────────────────────

test('AC-P5-08 cleanupHistory removes entries older than maxAgeDays', () => {
  const altId = 'p5-history-cleanup';
  ensureStorageTree(altId);
  const historyDir = path.join(getStorageRoot(altId), 'history');
  fs.mkdirSync(historyDir, { recursive: true });

  const oldFile = path.join(historyDir, '2024-01-01-old-decision.md');
  const newFile = path.join(historyDir, '2026-05-21-fresh.md');
  fs.writeFileSync(oldFile, 'content', 'utf8');
  fs.writeFileSync(newFile, 'content', 'utf8');

  // Force mtime for the "old" file to 400 days ago
  const oldTime = new Date(Date.now() - 400 * DAY_MS);
  fs.utimesSync(oldFile, oldTime, oldTime);

  const removed = cleanupHistory(altId, { maxAgeDays: 365 });
  assert.equal(removed.length, 1);
  assert.equal(fs.existsSync(oldFile), false);
  assert.equal(fs.existsSync(newFile), true);
});

test('AC-P5-08 cleanupHistory returns [] when history/ dir absent', () => {
  const removed = cleanupHistory('p5-no-history-id-xyz');
  assert.deepEqual(removed, []);
});

// ─── op:identity set (Phase 5 full impl) ─────────────────────────────────────

test('AC-P5-09 runOpIdentity set <valid-id> exports env + creates storage', async () => {
  const result = await runOpIdentity({ args: ['set', 'set-test-bot'], options: { json: true }, logger: silentLogger() });
  assert.equal(result.ok, true);
  assert.equal(result.identity, 'set-test-bot');
  assert.equal(result.source, 'override');
  assert.equal(process.env.AIOSON_OPERATOR_ID, 'set-test-bot');
  assert.ok(result.shell_export.includes('AIOSON_OPERATOR_ID=set-test-bot'));
  // Restore for other tests
  process.env.AIOSON_OPERATOR_ID = TEST_IDENTITY;
});

test('AC-P5-09 runOpIdentity set <invalid-id> returns ok=false (validation)', async () => {
  const result = await runOpIdentity({ args: ['set', '_reserved'], options: { json: true }, logger: silentLogger() });
  assert.equal(result.ok, false);
  assert.ok(result.error && result.error.includes('reserved-prefix'));
});
