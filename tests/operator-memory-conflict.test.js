'use strict';

/**
 * Phase 4 — operator-memory conflict policy tests (v1.15.0).
 *
 * AC-P4-01..10 from .aioson/plans/operator-memory/plan-conflict-policy.md.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const TEST_HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'aioson-om-p4-'));
process.env.HOME = TEST_HOME;
process.env.USERPROFILE = TEST_HOME;
process.env.AIOSON_OPERATOR_ID = 'p4-test-bot';

const {
  detectConflicts,
  debounceConflicts,
  formatConflictWarning,
  parseRuleFrontmatter,
  readRule,
  scanProjectRules,
  keywordOverlap,
  loadConflictState,
  DEFAULT_KEYWORD_THRESHOLD,
  DEFAULT_DEBOUNCE_MS
} = require('../src/operator-memory/conflict');

const { ensureStorageTree } = require('../src/operator-memory/storage');
const { captureSignal } = require('../src/operator-memory/proposal');
const { promoteProposal } = require('../src/operator-memory/decision');
const { preflightLoad } = require('../src/operator-memory/loader');

const TEST_IDENTITY = 'p4-test-bot';
ensureStorageTree(TEST_IDENTITY);

function makeProjectRoot(rules) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aioson-om-p4-rules-'));
  const rulesDir = path.join(root, '.aioson', 'rules');
  fs.mkdirSync(rulesDir, { recursive: true });
  for (const [filename, content] of Object.entries(rules)) {
    fs.writeFileSync(path.join(rulesDir, filename), content, 'utf8');
  }
  return root;
}

function decisionFromText(slug, signalType, body) {
  return { slug, signal_type: signalType, body, category: 'autonomy' };
}

// ─── Rule frontmatter parsing ────────────────────────────────────────────────

test('AC-P4-04 parseRuleFrontmatter extracts conflicts_with_signal_types array literal', () => {
  const content = `---
name: no-autonomous-commit
agents: [dev, qa]
conflicts_with_signal_types: [authorization]
---
Rule body about commit and autonomy boundaries.`;
  const fm = parseRuleFrontmatter(content);
  assert.ok(fm);
  assert.deepEqual(fm.conflicts_with_signal_types, ['authorization']);
  assert.deepEqual(fm.agents, ['dev', 'qa']);
});

test('AC-P4-04 parseRuleFrontmatter with multi-line list format', () => {
  const content = `---
name: complex
conflicts_with_signal_types:
  - authorization
  - exclusion
priority: 10
---
body`;
  const fm = parseRuleFrontmatter(content);
  assert.ok(fm);
  assert.deepEqual(fm.conflicts_with_signal_types, ['authorization', 'exclusion']);
});

test('AC-P4-04 rule without conflicts_with_signal_types: no conflict candidate', () => {
  const content = `---
name: passive
agents: [dev]
---
Rule body mentions commit autonomy but does not opt in.`;
  const rules = [{ frontmatter: parseRuleFrontmatter(content), body: 'rule body', path: '/fake' }];
  const decisions = [decisionFromText('commit-autonomy', 'authorization', 'commit autonomy after slice')];
  const conflicts = detectConflicts(decisions, rules);
  assert.equal(conflicts.length, 0);
});

// ─── Detection — conflict and non-conflict cases ─────────────────────────────

test('AC-P4-01 detectConflicts catches authorization decision vs authorization-opted-in rule', () => {
  const rules = [{
    frontmatter: { conflicts_with_signal_types: ['authorization'] },
    body: 'No autonomous commit and push to main branch ever.',
    path: '/fake/no-autonomous-commit.md'
  }];
  const decisions = [decisionFromText('commit-autonomy', 'authorization', 'commit autonomous after slice approval')];
  const conflicts = detectConflicts(decisions, rules);
  assert.equal(conflicts.length, 1);
  assert.equal(conflicts[0].decision_slug, 'commit-autonomy');
  assert.ok(conflicts[0].overlap >= DEFAULT_KEYWORD_THRESHOLD);
});

test('AC-P4-01 detectConflicts signal-type mismatch → no conflict', () => {
  const rules = [{
    frontmatter: { conflicts_with_signal_types: ['exclusion'] },
    body: 'commit autonomous',
    path: '/fake/excl-only.md'
  }];
  const decisions = [decisionFromText('a', 'authorization', 'commit autonomous after slice')];
  assert.equal(detectConflicts(decisions, rules).length, 0);
});

test('AC-P4-06 keyword threshold tunable via options', () => {
  const rules = [{
    frontmatter: { conflicts_with_signal_types: ['authorization'] },
    body: 'commit branch single',
    path: '/fake/r.md'
  }];
  // Only one overlap with default threshold 2 → no conflict
  const decisions = [decisionFromText('a', 'authorization', 'commit different words')];
  assert.equal(detectConflicts(decisions, rules, { threshold: 2 }).length, 0);
  assert.equal(detectConflicts(decisions, rules, { threshold: 1 }).length, 1);
});

// ─── FP/FN corpus (AC-P4-07) ─────────────────────────────────────────────────

const CONFLICT_PAIRS = [
  ['authorization', 'commit autonomous after slice approval', ['authorization'], 'no autonomous commit to main branch'],
  ['authorization', 'npm publish without prompt is OK', ['authorization'], 'npm publish requires manual approval'],
  ['exclusion', 'never deploy production automatically', ['exclusion'], 'deploy production is always manual'],
  ['authorization', 'force push main is allowed', ['authorization'], 'never force push main branch'],
  ['authorization', 'auto merge pr without review', ['authorization'], 'merge requires explicit code review'],
  ['authorization', 'skip tests before release', ['authorization'], 'tests must run before any release'],
  ['authorization', 'delete production data freely', ['authorization'], 'production data delete needs approval'],
  ['correction', 'stop adding type annotations', ['correction'], 'type annotations are mandatory'],
  ['authorization', 'bypass linter on commit', ['authorization'], 'linter must run before commit'],
  ['exclusion', 'rebase main is automatic', ['exclusion'], 'rebase main needs explicit approval']
];

const NON_CONFLICT_PAIRS = [
  ['authorization', 'use docker compose for local services', ['authorization'], 'rule about commit branch protection'],
  ['authorization', 'prefer terse commit messages', ['authorization'], 'rule about ssh agent timeout configuration'],
  ['correction', 'do not write emojis in code', ['authorization'], 'rule about deploy production approval'],
  ['confirmation', 'use kebab-case for filenames', ['confirmation'], 'rule about timezone settings'],
  ['authorization', 'install eslint plugin', ['authorization'], 'unrelated topic about database connection pool'],
  ['authorization', 'use yarn for dependencies', ['authorization'], 'rule about logging configuration'],
  ['exclusion', 'docker compose run manually', ['exclusion'], 'rule about code review labels'],
  ['authorization', 'enable nextjs experimental features', ['authorization'], 'rule about commit message format'],
  ['correction', 'avoid console.log', ['correction'], 'rule about deployment pipeline'],
  ['authorization', 'use brave browser', ['authorization'], 'rule about service worker registration'],
  ['authorization', 'macos finder hide hidden files', ['authorization'], 'rule about commit branch protection'],
  ['confirmation', 'enable mfa on github', ['confirmation'], 'rule about npm registry config'],
  ['exclusion', 'disable browser autofill manually', ['exclusion'], 'rule about service mesh routing'],
  ['authorization', 'use 24h time format', ['authorization'], 'rule about commit signing'],
  ['authorization', 'install python 3.12', ['authorization'], 'rule about docker image tags']
];

test('AC-P4-07 corpus: 10 conflict pairs all flagged (FN=0 target)', () => {
  let detected = 0;
  for (const [sig, body, ruleSigs, ruleBody] of CONFLICT_PAIRS) {
    const rules = [{ frontmatter: { conflicts_with_signal_types: ruleSigs }, body: ruleBody, path: '/fake/r.md' }];
    const decisions = [decisionFromText('test', sig, body)];
    const conflicts = detectConflicts(decisions, rules);
    if (conflicts.length > 0) detected += 1;
  }
  const fnRate = (CONFLICT_PAIRS.length - detected) / CONFLICT_PAIRS.length;
  assert.equal(fnRate, 0, `false negative rate ${fnRate * 100}% (target: 0%, detected ${detected}/${CONFLICT_PAIRS.length})`);
});

test('AC-P4-07 corpus: 15 non-conflict pairs FP rate ≤ 20%', () => {
  let falsePositives = 0;
  for (const [sig, body, ruleSigs, ruleBody] of NON_CONFLICT_PAIRS) {
    const rules = [{ frontmatter: { conflicts_with_signal_types: ruleSigs }, body: ruleBody, path: '/fake/r.md' }];
    const decisions = [decisionFromText('test', sig, body)];
    const conflicts = detectConflicts(decisions, rules);
    if (conflicts.length > 0) falsePositives += 1;
  }
  const fpRate = falsePositives / NON_CONFLICT_PAIRS.length;
  assert.ok(fpRate <= 0.20, `false positive rate ${(fpRate * 100).toFixed(0)}% (target ≤ 20%, FP=${falsePositives}/${NON_CONFLICT_PAIRS.length})`);
});

// ─── Warning format (AC-P4-02) ────────────────────────────────────────────────

test('AC-P4-02 formatConflictWarning matches spec verbatim', () => {
  const warning = formatConflictWarning({
    decision_slug: 'commit-autonomy',
    rule_basename: 'no-autonomous-commit.md'
  });
  assert.equal(warning, "⚠ Operator memory 'commit-autonomy' conflicts with project rule 'no-autonomous-commit.md'. Project rule applies.");
});

// ─── Debounce (AC-P4-03) ──────────────────────────────────────────────────────

test('AC-P4-03 debounceConflicts: first warning emits, repeat within window suppressed', () => {
  const conflict = {
    decision_slug: 'debounce-test',
    rule_basename: 'rule-a.md',
    rule_path: '/fake/rule-a.md',
    overlap: 3,
    severity: 'warning',
    reason: 'test'
  };
  // First call should emit
  const first = debounceConflicts(TEST_IDENTITY, [conflict]);
  assert.equal(first.length, 1, 'first call should emit conflict');
  // Second immediate call should suppress (within 60s window)
  const second = debounceConflicts(TEST_IDENTITY, [conflict]);
  assert.equal(second.length, 0, 'second call within window should suppress');
});

test('AC-P4-03 debounceConflicts: window override allows short-debounce tests', () => {
  const conflict = {
    decision_slug: 'debounce-short',
    rule_basename: 'rule-b.md',
    rule_path: '/fake/rule-b.md',
    overlap: 3,
    severity: 'warning',
    reason: 'test'
  };
  const first = debounceConflicts(TEST_IDENTITY, [conflict], { debounceMs: 1 });
  assert.equal(first.length, 1);
  // Wait > debounce window
  const start = Date.now();
  while (Date.now() - start < 5) { /* spin */ }
  const second = debounceConflicts(TEST_IDENTITY, [conflict], { debounceMs: 1 });
  assert.equal(second.length, 1, 'second call after window should emit again');
});

test('AC-P4-03 _conflict_state.json contains last_warned_at per pair', () => {
  const conflict = {
    decision_slug: 'state-check',
    rule_basename: 'rule-c.md',
    rule_path: '/fake/rule-c.md',
    overlap: 3,
    severity: 'warning'
  };
  debounceConflicts(TEST_IDENTITY, [conflict]);
  const state = loadConflictState(TEST_IDENTITY);
  assert.ok(state['state-check::rule-c.md']);
});

// ─── scanProjectRules + readRule integration ─────────────────────────────────

test('scanProjectRules reads .aioson/rules/*.md, filters README.md', () => {
  const projectRoot = makeProjectRoot({
    'no-auto.md': `---
name: no-auto-commit
conflicts_with_signal_types: [authorization]
---
Body about commit autonomy.`,
    'noisy.md': `---
name: passive
---
This rule is just informational.`,
    'README.md': 'README content (should be skipped)'
  });
  const rules = scanProjectRules(projectRoot);
  assert.equal(rules.length, 2, `expected 2 rules (README.md filtered), got ${rules.length}`);
  const names = rules.map((r) => path.basename(r.path)).sort();
  assert.deepEqual(names, ['no-auto.md', 'noisy.md']);
});

test('AC-P4-05 operator decision not modified by conflict detection (read-only)', () => {
  // Seed decision via real CRUD pipeline
  const slug = `unchanged-${Date.now()}`;
  const cap = captureSignal({
    identity: TEST_IDENTITY,
    slug,
    signal_type: 'authorization',
    quote: 'q',
    proposal: 'commit autonomous test for unchanged path',
    source_agent: 'test'
  });
  promoteProposal({ identity: TEST_IDENTITY, proposal: { ...cap.proposal, detected_count: 2 } });

  const projectRoot = makeProjectRoot({
    'conflict-rule.md': `---
conflicts_with_signal_types: [authorization]
---
no autonomous commit ever allowed`
  });

  // Run preflightLoad with conflict detection
  const { conflicts } = preflightLoad(TEST_IDENTITY, 'commit task', {
    projectRoot,
    skipDebounce: true
  });
  assert.ok(conflicts.length > 0);

  // Verify decision file is unchanged
  const { readDecision } = require('../src/operator-memory/decision');
  const after = readDecision(TEST_IDENTITY, slug);
  assert.equal(after.signal_type, 'authorization');
  assert.equal(after.superseded_by, null, 'superseded_by must remain null after conflict warning');
});

// ─── Stopword + tokenize coverage ────────────────────────────────────────────

test('keywordOverlap ignores stopwords on both sides', () => {
  const overlap = keywordOverlap(
    'the rule is about commit and push to main branch',
    'commit and push are blocked on main branch'
  );
  // Real overlap: commit, push, main, branch (~4 — stopwords "the", "and", "is", "about", "to", "are", "on" excluded)
  assert.ok(overlap >= 4, `expected ≥ 4 overlap, got ${overlap}`);
});

test('keywordOverlap returns 0 on empty input', () => {
  assert.equal(keywordOverlap('', 'something'), 0);
  assert.equal(keywordOverlap('something', ''), 0);
});

test('preflightLoad with no projectRoot returns conflicts: []', () => {
  const { conflicts } = preflightLoad(TEST_IDENTITY, 'whatever');
  assert.deepEqual(conflicts, []);
});

test('preflightLoad survives malformed rule file gracefully (does not crash)', () => {
  const projectRoot = makeProjectRoot({
    'corrupt.md': 'this is not a rule file with no frontmatter or anything sensible'
  });
  const result = preflightLoad(TEST_IDENTITY, 'commit task', { projectRoot, skipDebounce: true });
  // Either returns empty conflicts (no opt-in field) OR detects nothing — either is acceptable
  assert.ok(Array.isArray(result.conflicts));
});
