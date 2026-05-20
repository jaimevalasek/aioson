'use strict';

/**
 * Tests for T5 — semantic sync preflight (workflow-handoff-integrity v1.9.8).
 *
 * Covers AC-T5-01..08 from .aioson/plans/workflow-handoff-integrity/plan-t5-semantic-sync-preflight.md.
 * Targets:
 *   - Helpers in src/lib/agent-semantic-diff.js
 *   - checkSemanticParity in src/commands/sync-agents-preflight.js
 *   - Mode detection via AIOSON_PREPUBLISH env var
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const {
  extractFrontmatter,
  extractHeaders,
  extractSections,
  diffFrontmatter,
  diffHeaders,
  diffSectionContent,
  diffAgentFile,
  normalizeBody
} = require('../src/lib/agent-semantic-diff');

const { checkSemanticParity } = require('../src/commands/sync-agents-preflight');

async function makeTempProject() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'aioson-t5-'));
  await fs.mkdir(path.join(dir, '.aioson', 'agents'), { recursive: true });
  await fs.mkdir(path.join(dir, 'template', '.aioson', 'agents'), { recursive: true });
  return dir;
}

async function writeAgentPair(dir, agent, workspaceContent, templateContent) {
  if (workspaceContent !== null) {
    await fs.writeFile(path.join(dir, '.aioson', 'agents', `${agent}.md`), workspaceContent);
  }
  if (templateContent !== null) {
    await fs.writeFile(path.join(dir, 'template', '.aioson', 'agents', `${agent}.md`), templateContent);
  }
}

// ─── extractFrontmatter ──────────────────────────────────────────────────────

test('extractFrontmatter parses simple YAML-ish frontmatter', () => {
  const fm = extractFrontmatter('---\nname: foo\nversion: 1\n---\nbody');
  assert.deepEqual(fm, { name: 'foo', version: '1' });
});

test('extractFrontmatter returns null when no frontmatter present', () => {
  assert.equal(extractFrontmatter('no frontmatter here'), null);
});

// ─── extractHeaders ──────────────────────────────────────────────────────────

test('extractHeaders captures ## and ### in document order', () => {
  const content = `# Title
## Section A
Body
### Sub A
## Section B
`;
  assert.deepEqual(extractHeaders(content), ['Section A', 'Sub A', 'Section B']);
});

test('extractHeaders ignores headers inside fenced code blocks', () => {
  const content = `## Real
\`\`\`
## Fake inside fence
\`\`\`
## Real Too`;
  assert.deepEqual(extractHeaders(content), ['Real', 'Real Too']);
});

// ─── diffHeaders ─────────────────────────────────────────────────────────────

test('diffHeaders returns null when identical', () => {
  const ws = '## A\n## B';
  const tpl = '## A\n## B';
  assert.equal(diffHeaders(ws, tpl), null);
});

test('AC-T5-01 diffHeaders detects sections missing in template (981a8fd pattern)', () => {
  const ws = '## Mission\n## MEDIUM implementation plan (mandatory output for MEDIUM)\n## Hard constraints';
  const tpl = '## Mission\n## Hard constraints';
  const diff = diffHeaders(ws, tpl);
  assert.ok(diff);
  assert.deepEqual(diff.missingInTemplate, ['MEDIUM implementation plan (mandatory output for MEDIUM)']);
  assert.deepEqual(diff.missingInWorkspace, []);
});

test('diffHeaders detects sections missing in workspace', () => {
  const ws = '## A';
  const tpl = '## A\n## B';
  const diff = diffHeaders(ws, tpl);
  assert.deepEqual(diff.missingInWorkspace, ['B']);
});

test('diffHeaders detects reorder when same headers in different sequence', () => {
  const ws = '## A\n## B\n## C';
  const tpl = '## C\n## B\n## A';
  const diff = diffHeaders(ws, tpl);
  assert.ok(diff);
  assert.equal(diff.reordered, true);
});

// ─── diffSectionContent ──────────────────────────────────────────────────────

test('AC-T5-01 diffSectionContent catches body drift even when headers match', () => {
  const ws = '## Mission\nDo X with new contract MUST produce Y.\n';
  const tpl = '## Mission\nDo not silently create Y.\n';
  const diverged = diffSectionContent(ws, tpl);
  assert.ok(diverged);
  assert.equal(diverged.length, 1);
  assert.equal(diverged[0].header, 'Mission');
});

test('diffSectionContent ignores cosmetic whitespace differences', () => {
  const ws = '## A\n  Some text\n   with whitespace   \n';
  const tpl = '## A\nSome text\nwith whitespace\n';
  const diverged = diffSectionContent(ws, tpl);
  assert.equal(diverged, null);
});

// ─── diffFrontmatter ─────────────────────────────────────────────────────────

test('diffFrontmatter detects field added in workspace not in template', () => {
  const ws = '---\nname: x\nfeature: y\n---\nbody';
  const tpl = '---\nname: x\n---\nbody';
  const diff = diffFrontmatter(ws, tpl);
  assert.deepEqual(diff.missingInTemplate, ['feature']);
});

test('diffFrontmatter detects value changes', () => {
  const ws = '---\nversion: 2\n---';
  const tpl = '---\nversion: 1\n---';
  const diff = diffFrontmatter(ws, tpl);
  assert.equal(diff.valueChanged.length, 1);
  assert.equal(diff.valueChanged[0].key, 'version');
  assert.equal(diff.valueChanged[0].workspace, '2');
  assert.equal(diff.valueChanged[0].template, '1');
});

// ─── diffAgentFile aggregate ─────────────────────────────────────────────────

test('AC-T5-08 diffAgentFile reports missing file on either side', () => {
  const d1 = diffAgentFile('## A', null);
  assert.equal(d1.missingFile, 'template');
  const d2 = diffAgentFile(null, '## A');
  assert.equal(d2.missingFile, 'workspace');
  const d3 = diffAgentFile(null, null);
  assert.equal(d3, null);
});

// ─── checkSemanticParity (integration) ───────────────────────────────────────

test('AC-T5-06 regression guard: 981a8fd-style diff (header + content) is caught', async () => {
  const dir = await makeTempProject();
  const workspacePm = `## Mission
PM owns implementation-plan for MEDIUM.

## MEDIUM implementation plan (mandatory output for MEDIUM)
For MEDIUM features, @pm MUST produce implementation-plan-{slug}.md
`;
  const templatePm = `## Mission
PM does not silently produce plans.
`;
  await writeAgentPair(dir, 'pm', workspacePm, templatePm);
  const issues = checkSemanticParity(dir);
  // Pre-publish off → severity should be 'warning'
  assert.ok(issues.length > 0);
  assert.ok(issues.every((i) => i.severity === 'warning'));
  // Specifically: missing section in template + diverged section content
  const kinds = new Set(issues.map((i) => i.kind));
  assert.ok(kinds.has('sections_missing_in_template'));
  assert.ok(kinds.has('section_content_diverged'));
});

test('AC-T5-02 mode detection: AIOSON_PREPUBLISH=true → severity becomes error', async () => {
  const dir = await makeTempProject();
  await writeAgentPair(dir, 'pm', '## A\ndifferent', '## A\nsame');
  const before = process.env.AIOSON_PREPUBLISH;
  process.env.AIOSON_PREPUBLISH = 'true';
  try {
    const issues = checkSemanticParity(dir);
    assert.ok(issues.length > 0);
    assert.ok(issues.every((i) => i.severity === 'error'));
  } finally {
    if (before === undefined) delete process.env.AIOSON_PREPUBLISH;
    else process.env.AIOSON_PREPUBLISH = before;
  }
});

test('AC-T5-08 missing template file detection: workspace exists, template absent', async () => {
  const dir = await makeTempProject();
  await writeAgentPair(dir, 'pm', '## Mission\nwhatever', null);
  const issues = checkSemanticParity(dir);
  const missing = issues.find((i) => i.kind === 'missing_file');
  assert.ok(missing);
  assert.equal(missing.side, 'template');
  assert.match(missing.hint, /unpropagated/);
});

test('checkSemanticParity returns empty array when workspace and template are identical', async () => {
  const dir = await makeTempProject();
  const content = '## Mission\nSame.\n## Hard constraints\nAlso same.';
  await writeAgentPair(dir, 'pm', content, content);
  const issues = checkSemanticParity(dir);
  assert.deepEqual(issues, []);
});

test('checkSemanticParity returns empty when both sides absent for an agent', async () => {
  const dir = await makeTempProject();
  // pm.md does not exist in either side — should be skipped, not reported
  const issues = checkSemanticParity(dir);
  // Other CHAIN_AGENTS files also missing, but the helper returns [] when both sides absent.
  // So overall length should be 0 here.
  assert.deepEqual(issues, []);
});

test('AC-T5-05 frontmatter field-level diff reports value changes', async () => {
  const dir = await makeTempProject();
  const ws = '---\nname: dev\nversion: 2\n---\n## Mission';
  const tpl = '---\nname: dev\nversion: 1\n---\n## Mission';
  await writeAgentPair(dir, 'dev', ws, tpl);
  const issues = checkSemanticParity(dir);
  const fmIssue = issues.find((i) => i.kind === 'frontmatter_value_changed');
  assert.ok(fmIssue);
  assert.equal(fmIssue.changes[0].key, 'version');
});

test('normalizeBody collapses whitespace deterministically', () => {
  assert.equal(normalizeBody('  hello   world  \n\n  '), 'hello world');
  assert.equal(normalizeBody('a\n\n\nb'), 'a\nb');
});
