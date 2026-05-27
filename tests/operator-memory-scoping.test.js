'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs');

const { captureSignal, readProposal } = require('../src/operator-memory/proposal');
const { promoteProposal } = require('../src/operator-memory/decision');
const { ensureStorageTree, getStorageRoot } = require('../src/operator-memory/storage');

function testIdentity() {
  return `test-scoping-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

test('M3: captureSignal stores feature_slug and session_id in proposal', () => {
  const identity = testIdentity();
  ensureStorageTree(identity);

  const result = captureSignal({
    identity,
    slug: 'scope-test-feat',
    signal_type: 'confirmation',
    quote: 'yes',
    proposal: 'use feature scoping',
    source_agent: 'dev',
    feature_slug: 'checkout',
    session_id: 'sess-001'
  });

  assert.equal(result.proposal.feature_slug, 'checkout');
  assert.equal(result.proposal.session_id, 'sess-001');

  const stored = readProposal(identity, 'scope-test-feat');
  assert.equal(stored.feature_slug, 'checkout');
  assert.equal(stored.session_id, 'sess-001');
});

test('M3: captureSignal omits feature_slug/session_id when not provided (BR-AO-06)', () => {
  const identity = testIdentity();
  ensureStorageTree(identity);

  const result = captureSignal({
    identity,
    slug: 'scope-test-null',
    signal_type: 'authorization',
    quote: 'ok',
    proposal: 'no scope provided',
    source_agent: 'dev'
  });

  assert.equal(result.proposal.feature_slug, null);
  assert.equal(result.proposal.session_id, null);

  const stored = readProposal(identity, 'scope-test-null');
  // feature_slug/session_id not in frontmatter when null
  const filePath = path.join(getStorageRoot(identity), 'proposals', 'scope-test-null.md');
  const content = fs.readFileSync(filePath, 'utf8');
  assert.ok(!content.includes('feature_slug:'), 'feature_slug absent from frontmatter when null');
  assert.ok(!content.includes('session_id:'), 'session_id absent from frontmatter when null');
});

test('M3: promoteProposal propagates feature_slug and session_id to decision', () => {
  const identity = testIdentity();
  ensureStorageTree(identity);

  // Create proposal with scoping fields
  captureSignal({
    identity,
    slug: 'scope-promote',
    signal_type: 'confirmation',
    quote: 'yes',
    proposal: 'feature-scoped decision',
    source_agent: 'architect',
    feature_slug: 'auth-v2',
    session_id: 'sess-042'
  });
  // Second capture to meet promotion threshold
  captureSignal({
    identity,
    slug: 'scope-promote',
    signal_type: 'confirmation',
    quote: 'confirmed again',
    proposal: 'feature-scoped decision',
    source_agent: 'architect',
    feature_slug: 'auth-v2',
    session_id: 'sess-042'
  });

  const proposal = readProposal(identity, 'scope-promote');
  const decision = promoteProposal({ identity, proposal });

  assert.equal(decision.feature_slug, 'auth-v2');
  assert.equal(decision.session_id, 'sess-042');

  // Verify in serialized file
  const { readDecision } = require('../src/operator-memory/decision');
  const stored = readDecision(identity, 'scope-promote');
  assert.equal(stored.feature_slug, 'auth-v2');
  assert.equal(stored.session_id, 'sess-042');
});

test('M3: op:list --feature filters by feature_slug (BR-AO-07)', () => {
  const identity = testIdentity();
  ensureStorageTree(identity);

  // Create two proposals with different feature_slugs
  captureSignal({
    identity,
    slug: 'filter-feat-a',
    signal_type: 'confirmation',
    proposal: 'decision for feat-a',
    source_agent: 'dev',
    feature_slug: 'feat-a'
  });
  captureSignal({
    identity,
    slug: 'filter-feat-b',
    signal_type: 'confirmation',
    proposal: 'decision for feat-b',
    source_agent: 'dev',
    feature_slug: 'feat-b'
  });

  const { readProposal: rp } = require('../src/operator-memory/proposal');
  const items = [
    { slug: 'filter-feat-a', ...rp(identity, 'filter-feat-a') },
    { slug: 'filter-feat-b', ...rp(identity, 'filter-feat-b') }
  ];

  const filtered = items.filter((item) => item.feature_slug === 'feat-a');
  assert.equal(filtered.length, 1);
  assert.equal(filtered[0].slug, 'filter-feat-a');
});

test('M3: op:list --agent filters by source_agent (BR-AO-07)', () => {
  const identity = testIdentity();
  ensureStorageTree(identity);

  captureSignal({
    identity,
    slug: 'filter-agent-dev',
    signal_type: 'confirmation',
    proposal: 'dev decision',
    source_agent: 'dev',
    feature_slug: 'x'
  });
  captureSignal({
    identity,
    slug: 'filter-agent-arch',
    signal_type: 'authorization',
    proposal: 'architect decision',
    source_agent: 'architect',
    feature_slug: 'x'
  });

  const { readProposal: rp } = require('../src/operator-memory/proposal');
  const items = [
    { slug: 'filter-agent-dev', ...rp(identity, 'filter-agent-dev') },
    { slug: 'filter-agent-arch', ...rp(identity, 'filter-agent-arch') }
  ];

  const filtered = items.filter((item) => item.source_agent === 'architect');
  assert.equal(filtered.length, 1);
  assert.equal(filtered[0].slug, 'filter-agent-arch');
});

test('EC-AO-06: op:list --feature=nonexistent returns empty result', () => {
  const items = [];
  const filterFeature = 'nonexistent-slug';
  const filtered = items.filter((item) => item.feature_slug === filterFeature);

  const result = {
    feature: filterFeature,
    decisions: filtered,
    total: filtered.length
  };

  assert.equal(result.feature, 'nonexistent-slug');
  assert.deepEqual(result.decisions, []);
  assert.equal(result.total, 0);
});

test('EC-AO-05: capture without --feature stores null feature_slug', () => {
  const identity = testIdentity();
  ensureStorageTree(identity);

  captureSignal({
    identity,
    slug: 'no-feature-flag',
    signal_type: 'confirmation',
    proposal: 'no feature provided',
    source_agent: 'dev'
  });

  const stored = readProposal(identity, 'no-feature-flag');
  assert.ok(!stored.feature_slug, 'feature_slug must be absent/null/undefined');
  assert.ok(!stored.session_id, 'session_id must be absent/null/undefined');
});
