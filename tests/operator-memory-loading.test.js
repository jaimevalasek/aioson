'use strict';

/**
 * Phase 3 — operator-memory loading + tier index + op:list/show tests (v1.14.0).
 *
 * AC-P3-01..12 from .aioson/plans/operator-memory/plan-universal-loading.md.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

// Isolate ~/.aioson into a tmp dir BEFORE requiring storage-dependent modules
const TEST_HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'aioson-om-p3-'));
process.env.HOME = TEST_HOME;
process.env.USERPROFILE = TEST_HOME;
process.env.AIOSON_OPERATOR_ID = 'p3-test-bot';

const { ensureStorageTree } = require('../src/operator-memory/storage');
const { captureSignal } = require('../src/operator-memory/proposal');
const { promoteProposal } = require('../src/operator-memory/decision');
const { loadMemoryIndex, regenerateIndex, parseIndexFrontmatter, parseIndexLinks, deriveLineForDecision, SCHEMA_VERSION } = require('../src/operator-memory/index-md');
const { preflightLoad, matchDecisions, tokenize } = require('../src/operator-memory/loader');
const { runOpList } = require('../src/commands/op-list');
const { runOpShow } = require('../src/commands/op-show');

const TEST_IDENTITY = 'p3-test-bot';
ensureStorageTree(TEST_IDENTITY);

function silentLogger() {
  const lines = []; const errs = [];
  return { lines, errs, log: (s) => lines.push(s), error: (s) => errs.push(s), warn: (s) => errs.push(s) };
}

function seedDecision(identity, slug, signalType, body) {
  const p = captureSignal({ identity, slug, signal_type: signalType, quote: 'q', proposal: body, source_agent: 'test' });
  return promoteProposal({ identity, proposal: { ...p.proposal, detected_count: 2 } });
}

test('AC-P3-05 regenerateIndex creates MEMORY.md with frontmatter + entries', () => {
  const slug = `idx-1-${Date.now()}`;
  seedDecision(TEST_IDENTITY, slug, 'authorization', 'commit autonomous publish');
  // regenerateIndex is auto-called by promoteProposal, so MEMORY.md should exist
  const indexFile = path.join(TEST_HOME, '.aioson', 'operators', TEST_IDENTITY, 'MEMORY.md');
  assert.ok(fs.existsSync(indexFile), 'MEMORY.md should exist after promote');
  const content = fs.readFileSync(indexFile, 'utf8');
  const fm = parseIndexFrontmatter(content);
  assert.equal(fm.schema_version, SCHEMA_VERSION);
  assert.ok(fm.decisions_count >= 1);
});

test('AC-P3-05 loadMemoryIndex returns entries parseable as link list', () => {
  // Use a fresh identity for isolation
  const altId = 'p3-load-test';
  ensureStorageTree(altId);
  seedDecision(altId, 'decision-one', 'authorization', 'memory load test alpha');
  seedDecision(altId, 'decision-two', 'exclusion', 'never publish alpha automatically');

  const index = loadMemoryIndex(altId, 'active');
  assert.ok(index, 'index should load');
  assert.equal(index.frontmatter.decisions_count, 2);
  assert.equal(index.entries.length, 2);
  // Entries sorted by last_reinforced DESC; both seeded at ~same time so order is stable
  const slugs = index.entries.map((e) => e.slug).sort();
  assert.deepEqual(slugs, ['decision-one', 'decision-two']);
});

test('AC-P3-05 loadMemoryIndex returns null when MEMORY.md does not exist', () => {
  const ghostId = 'p3-ghost';
  ensureStorageTree(ghostId);
  const index = loadMemoryIndex(ghostId, 'active');
  assert.equal(index, null);
});

test('AC-P3-09 matchDecisions returns top-N matched by keyword overlap', () => {
  const altId = 'p3-match-test';
  ensureStorageTree(altId);
  seedDecision(altId, 'commit-autonomy', 'authorization', 'commit autonomy after slice approval');
  seedDecision(altId, 'npm-manual', 'exclusion', 'npm publish stays manual always');
  seedDecision(altId, 'unrelated', 'correction', 'use typescript not javascript');

  const index = loadMemoryIndex(altId, 'active');
  const matches = matchDecisions(index, 'I want to commit and push to main');
  assert.ok(matches.length > 0, 'should match commit decision');
  // commit-autonomy should be matched (has "commit" overlap)
  assert.ok(matches.some((m) => m.slug === 'commit-autonomy'));
});

test('AC-P3-09 matchDecisions returns empty array when no overlap', () => {
  const altId = 'p3-no-match';
  ensureStorageTree(altId);
  seedDecision(altId, 'unrelated', 'correction', 'use typescript not javascript');
  const index = loadMemoryIndex(altId, 'active');
  const matches = matchDecisions(index, 'random task about cooking');
  assert.equal(matches.length, 0);
});

test('AC-P3-09 matchDecisions handles null index gracefully', () => {
  const matches = matchDecisions(null, 'whatever');
  assert.deepEqual(matches, []);
});

test('AC-P3-09 matchDecisions caps results at maxMatches', () => {
  const altId = 'p3-cap-test';
  ensureStorageTree(altId);
  for (let i = 0; i < 8; i += 1) {
    seedDecision(altId, `cap-${i}`, 'authorization', `commit related decision number ${i}`);
  }
  const index = loadMemoryIndex(altId, 'active');
  const matches = matchDecisions(index, 'commit', { maxMatches: 3 });
  assert.ok(matches.length <= 3);
});

test('preflightLoad: combined load + match', () => {
  const altId = 'p3-preflight';
  ensureStorageTree(altId);
  seedDecision(altId, 'preflight-test', 'authorization', 'commit auto preflight test');
  const { index, matches } = preflightLoad(altId, 'commit task');
  assert.ok(index);
  assert.ok(matches.length > 0);
});

test('tokenize: strips stopwords, lowercases, removes short tokens', () => {
  const tokens = tokenize('The quick brown fox jumps over the lazy dog');
  assert.equal(tokens.includes('the'), false, 'should drop stopword "the"');
  assert.equal(tokens.includes('quick'), true);
  assert.equal(tokens.includes('brown'), true);
});

test('deriveLineForDecision: produces canonical format', () => {
  const decision = {
    slug: 'foo-bar',
    signal_type: 'authorization',
    last_reinforced: '2026-05-21T12:00:00Z',
    body: '# Title here\n\nbody content'
  };
  const line = deriveLineForDecision(decision);
  assert.match(line, /^- \[.+\]\(decisions\/foo-bar\.md\) — authorization, reinforced 2026-05-21/);
});

test('parseIndexLinks: extracts entries from MEMORY.md body', () => {
  const content = `## Active decisions

- [Commit autonomy](decisions/commit-autonomy.md) — authorization, reinforced 2026-05-21
- [Manual publish](decisions/npm-manual.md) — exclusion, reinforced 2026-05-20
`;
  const links = parseIndexLinks(content);
  assert.equal(links.length, 2);
  assert.equal(links[0].slug, 'commit-autonomy');
  assert.equal(links[0].signal_type, 'authorization');
  assert.equal(links[1].slug, 'npm-manual');
  assert.equal(links[1].signal_type, 'exclusion');
});

test('AC-P3-03 runOpList shows active decisions in table format', async () => {
  // Seed one decision for the default-resolved identity (p3-test-bot via env)
  seedDecision(TEST_IDENTITY, `list-test-${Date.now()}`, 'authorization', 'commit list test decision');
  const logger = silentLogger();
  const result = await runOpList({ args: [], options: {}, logger });
  assert.equal(result.ok, true);
  assert.ok(result.count >= 1);
  assert.ok(logger.lines.some((l) => l.includes('decision(s) for')));
});

test('AC-P3-03 runOpList --format=json returns structured', async () => {
  const logger = silentLogger();
  const result = await runOpList({ args: [], options: { json: true }, logger });
  assert.equal(result.ok, true);
  assert.ok(Array.isArray(result.items));
  // --json should not log to stdout
  assert.equal(logger.lines.length, 0);
});

test('AC-P3-03 runOpList --proposals shows proposal queue', async () => {
  // Seed a proposal that's not yet promoted
  captureSignal({
    identity: TEST_IDENTITY,
    slug: `prop-test-${Date.now()}`,
    signal_type: 'correction',
    quote: 'q',
    proposal: 'pending proposal stays in queue',
    source_agent: 'test'
  });
  const result = await runOpList({ args: [], options: { proposals: true, json: true }, logger: silentLogger() });
  assert.equal(result.ok, true);
  assert.ok(result.items.length >= 1);
  assert.equal(result.tier, 'proposals');
});

test('AC-P3-04 runOpShow on existing decision: prints frontmatter + body', async () => {
  const slug = `show-test-${Date.now()}`;
  seedDecision(TEST_IDENTITY, slug, 'authorization', 'show test decision body');
  const logger = silentLogger();
  const result = await runOpShow({ args: [slug], options: {}, logger });
  assert.equal(result.ok, true);
  assert.equal(result.kind, 'decision');
  // raw decision file output includes frontmatter delimiters
  assert.ok(logger.lines.some((l) => l.includes('---')));
});

test('AC-P3-04 runOpShow --json returns structured', async () => {
  const slug = `show-json-${Date.now()}`;
  seedDecision(TEST_IDENTITY, slug, 'authorization', 'show json test');
  const result = await runOpShow({ args: [slug], options: { json: true }, logger: silentLogger() });
  assert.equal(result.ok, true);
  assert.equal(result.kind, 'decision');
  assert.equal(result.signal_type, 'authorization');
});

test('AC-P3-04 runOpShow on unknown slug: ok=false', async () => {
  const result = await runOpShow({ args: ['nonexistent-slug-xyz'], options: {}, logger: silentLogger() });
  assert.equal(result.ok, false);
});

test('AC-P3-04 runOpShow on proposal (not yet promoted): kind=proposal', async () => {
  const propSlug = `pending-${Date.now()}`;
  captureSignal({
    identity: TEST_IDENTITY,
    slug: propSlug,
    signal_type: 'authorization',
    quote: 'q',
    proposal: 'pending decision',
    source_agent: 'test'
  });
  const result = await runOpShow({ args: [propSlug], options: { json: true }, logger: silentLogger() });
  assert.equal(result.ok, true);
  assert.equal(result.kind, 'proposal');
});

test('AC-P3-08 backward compat: with flag unset, helpers still work but agent preflight no-ops', () => {
  // The directive is in template/CLAUDE.md and template/AGENTS.md guarded by
  // env var. Backward-compat means: when flag is OFF, no extra reads happen.
  // We verify this indirectly by checking that loadMemoryIndex/preflightLoad
  // are pure functions that don't crash on missing input.
  const result = preflightLoad('ghost-identity', 'whatever');
  assert.equal(result.index, null);
  assert.deepEqual(result.matches, []);
});

test('AC-P3-11 template/CLAUDE.md AND template/AGENTS.md both have ## Memory loading section', () => {
  const repoRoot = path.resolve(__dirname, '..');
  const claudeContent = fs.readFileSync(path.join(repoRoot, 'template', 'CLAUDE.md'), 'utf8');
  const agentsContent = fs.readFileSync(path.join(repoRoot, 'template', 'AGENTS.md'), 'utf8');
  assert.ok(claudeContent.includes('## Memory loading'), 'template/CLAUDE.md must contain ## Memory loading');
  assert.ok(claudeContent.includes('## Memory capture'), 'template/CLAUDE.md must contain ## Memory capture');
  assert.ok(agentsContent.includes('## Memory loading'), 'template/AGENTS.md must contain ## Memory loading');
  assert.ok(agentsContent.includes('## Memory capture'), 'template/AGENTS.md must contain ## Memory capture');
});

test('AC-P3-11 template/CLAUDE.md and template/AGENTS.md have parity on directive bodies (T5 reuse)', () => {
  const repoRoot = path.resolve(__dirname, '..');
  const extractSection = (content, header) => {
    const idx = content.indexOf(header);
    if (idx === -1) return '';
    const after = content.slice(idx);
    const nextH = after.slice(header.length).match(/\n## /);
    return nextH ? after.slice(0, nextH.index + header.length + 1) : after;
  };
  const claudeContent = fs.readFileSync(path.join(repoRoot, 'template', 'CLAUDE.md'), 'utf8');
  const agentsContent = fs.readFileSync(path.join(repoRoot, 'template', 'AGENTS.md'), 'utf8');

  const claudeLoading = extractSection(claudeContent, '## Memory loading');
  const agentsLoading = extractSection(agentsContent, '## Memory loading');
  // Same byte length — strict equality signal of intentional parity
  assert.equal(claudeLoading, agentsLoading, '## Memory loading sections should be byte-identical between CLAUDE.md and AGENTS.md');

  const claudeCapture = extractSection(claudeContent, '## Memory capture');
  const agentsCapture = extractSection(agentsContent, '## Memory capture');
  assert.equal(claudeCapture, agentsCapture, '## Memory capture sections should be byte-identical');
});

test('AC-P3-06 budget audit runs under fail threshold', () => {
  const { audit, TOTAL_FAIL_BYTES } = require('../scripts/memory-budget-audit');
  const report = audit();
  assert.equal(report.errors.length, 0, `budget errors: ${JSON.stringify(report.errors)}`);
  assert.ok(report.total < TOTAL_FAIL_BYTES, `total ${report.total} exceeds fail threshold ${TOTAL_FAIL_BYTES}`);
});

test('AC-P3-07 cross-harness format spec doc exists', () => {
  const repoRoot = path.resolve(__dirname, '..');
  const spec = path.join(repoRoot, '.aioson', 'docs', 'operator-memory', 'memory-md-format.md');
  assert.ok(fs.existsSync(spec), 'format spec doc must exist');
  const content = fs.readFileSync(spec, 'utf8');
  assert.ok(content.includes('V1 support matrix'));
  assert.ok(content.includes('Claude Code'));
  assert.ok(content.includes('Codex'));
  assert.ok(content.includes('Gemini'));
});
