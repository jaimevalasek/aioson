'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '..');
const WORKSPACE = path.join(REPO_ROOT, '.aioson', 'agents', 'deyvin.md');
const TEMPLATE = path.join(REPO_ROOT, 'template', '.aioson', 'agents', 'deyvin.md');

// AC W1 + W2 + kernel size budget
test('deyvin.md — workspace + template byte-identical (sheldon-001 q=5)', () => {
  const ws = fs.readFileSync(WORKSPACE);
  const tp = fs.readFileSync(TEMPLATE);
  assert.equal(ws.length, tp.length, `size mismatch: workspace=${ws.length} template=${tp.length}`);
  assert.ok(ws.equals(tp), 'workspace and template must be byte-identical');
});

test('deyvin.md — kernel size ≤ 15872 bytes (deyvin-density AC-06 budget)', () => {
  // 15360 -> 15872 on 2026-07-01: --help token pointer (see deyvin-density.test.js).
  const size = fs.statSync(WORKSPACE).size;
  assert.ok(size <= 15872, `kernel ${size}B exceeds 15872B budget`);
});

test('deyvin.md — rubric line no longer says "deferred to deyvin-subtask-scout"', () => {
  const content = fs.readFileSync(WORKSPACE, 'utf8');
  assert.ok(!content.includes('(deferred to `deyvin-subtask-scout`'), 'old deferred parenthetical still present');
  assert.ok(!content.includes('until shipped: pause and ask the user'), 'old "until shipped" text still present');
});

test('deyvin.md — rubric line references aioson scout:prep', () => {
  const content = fs.readFileSync(WORKSPACE, 'utf8');
  // The rubric row should mention the new invocation path.
  const rubricMatch = content.match(/Diagnosis ambiguous;[^\n]+/);
  assert.ok(rubricMatch, 'rubric line for ambiguous diagnosis not found');
  assert.ok(/aioson scout:prep/.test(rubricMatch[0]), `rubric line missing aioson scout:prep reference: ${rubricMatch[0]}`);
});

test('deyvin.md — has Sub-task scout invocation section with CLI + CLI-less subsections', () => {
  const content = fs.readFileSync(WORKSPACE, 'utf8');
  assert.ok(content.includes('## Sub-task scout invocation'), 'missing top-level invocation section');
  assert.ok(/CLI path/i.test(content), 'missing CLI path subsection');
  assert.ok(/CLI-less fallback/i.test(content), 'missing CLI-less fallback subsection');
  assert.ok(content.includes('aioson scout:prep'), 'missing CLI prep reference');
  assert.ok(content.includes('aioson scout:validate'), 'missing CLI validate reference');
  assert.ok(content.includes('aioson scout:commit'), 'missing CLI commit reference');
});

test('deyvin.md — invocation section enforces Nautilus tool whitelist', () => {
  const content = fs.readFileSync(WORKSPACE, 'utf8');
  assert.ok(content.includes('Tools allowed: Read, Grep ONLY.'));
  assert.ok(content.includes('Tools forbidden: Bash, Edit, Write'));
});

test('deyvin.md — invocation section mentions parent_session_excerpt mandatory cold-load value', () => {
  const content = fs.readFileSync(WORKSPACE, 'utf8');
  assert.ok(content.includes('parent_session_excerpt'));
  // 50-1000 chars range documented
  assert.ok(/50-1000/.test(content), 'expected explicit 50-1000 chars range for excerpt');
});

test('deyvin.md — documents per-harness invocation (Claude Code + Codex)', () => {
  const content = fs.readFileSync(WORKSPACE, 'utf8');
  assert.ok(/Claude Code.*Agent tool/i.test(content), 'missing Claude Code Agent tool reference');
  assert.ok(/Codex.*MultiAgentV2/i.test(content), 'missing Codex MultiAgentV2 reference');
});
