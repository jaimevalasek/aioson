'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const WORKSPACE = path.join(ROOT, '.aioson/agents/deyvin.md');
const TEMPLATE = path.join(ROOT, 'template/.aioson/agents/deyvin.md');
const KERNEL_BUDGET_BYTES = 15360;

function read(p) {
  return fs.readFileSync(p, 'utf8');
}

function countTableRows(section) {
  const lines = section.split('\n').filter((line) => line.startsWith('|'));
  return lines.filter((line, idx) => idx >= 2).length;
}

function extractSection(content, heading) {
  const lines = content.split('\n');
  const start = lines.findIndex((line) => line.trim() === heading);
  if (start === -1) return null;
  const next = lines.findIndex((line, idx) => idx > start && /^## /.test(line));
  return lines.slice(start, next === -1 ? lines.length : next).join('\n');
}

test('deyvin-density AC1: bootstrap gate is MANDATORY (not "if available")', () => {
  const content = read(WORKSPACE);
  assert.match(
    content,
    /Bootstrap gate \(Living Memory\) — MANDATORY first action/,
    'bootstrap gate must be marked MANDATORY'
  );
  assert.doesNotMatch(
    content,
    /run `aioson memory:status \.` if available/,
    'old "if available" wording must be replaced'
  );
});

test('deyvin-density AC2: bootstrap gate has explicit filesystem fallback', () => {
  const content = read(WORKSPACE);
  assert.match(
    content,
    /If `aioson` CLI is not available.*read `\.aioson\/context\/bootstrap\/\*\.md` directly/s,
    'filesystem fallback path must be documented for absent CLI'
  );
});

test('deyvin-density AC3: Memory awareness preflight section lists 9 memory layers', () => {
  const content = read(WORKSPACE);
  const section = extractSection(content, '## Memory awareness preflight');
  assert.ok(section, 'Memory awareness preflight section must exist');
  const rows = countTableRows(section);
  assert.strictEqual(rows, 9, `expected 9 memory layer rows, got ${rows}`);
});

test('deyvin-density AC4: Scope decision rubric section lists ≥ 7 symptom→action rows', () => {
  const content = read(WORKSPACE);
  const section = extractSection(content, '## Scope decision rubric');
  assert.ok(section, 'Scope decision rubric section must exist');
  const rows = countTableRows(section);
  assert.ok(rows >= 7, `expected ≥ 7 rubric rows, got ${rows}`);
});

test('deyvin-density AC5: template/.aioson/agents/deyvin.md matches workspace byte-for-byte', () => {
  const workspaceContent = read(WORKSPACE);
  const templateContent = read(TEMPLATE);
  assert.strictEqual(
    workspaceContent,
    templateContent,
    'template and workspace deyvin.md must be byte-identical'
  );
});

test('deyvin-density AC6: deyvin.md kernel stays under 15KB budget', () => {
  const sizeWorkspace = fs.statSync(WORKSPACE).size;
  const sizeTemplate = fs.statSync(TEMPLATE).size;
  assert.ok(
    sizeWorkspace <= KERNEL_BUDGET_BYTES,
    `workspace deyvin.md is ${sizeWorkspace}B, exceeds 15KB budget`
  );
  assert.ok(
    sizeTemplate <= KERNEL_BUDGET_BYTES,
    `template deyvin.md is ${sizeTemplate}B, exceeds 15KB budget`
  );
});

test('deyvin-density AC7: existing structural sections remain intact (no regression)', () => {
  const content = read(WORKSPACE);
  const requiredSections = [
    '## Mission',
    '## Position in the system',
    '## Immediate scope gate',
    '## Built-in deyvin modules',
    '## Deterministic preflight',
    '## Working kernel',
    '## Hard constraints',
    '## Memory reflection (post-session)',
    '## Observability'
  ];
  for (const section of requiredSections) {
    assert.ok(
      content.includes(section),
      `existing section missing after edits: ${section}`
    );
  }
});

test('deyvin-density: scope rubric includes the canonical handoff agents', () => {
  const content = read(WORKSPACE);
  const section = extractSection(content, '## Scope decision rubric');
  const required = ['/product', '/architect', '/analyst', '/sheldon', '/ux-ui', '/dev', '/qa'];
  for (const agent of required) {
    assert.ok(
      section.includes(agent),
      `scope rubric missing handoff target: ${agent}`
    );
  }
});

test('deyvin-density: memory preflight names all 9 canonical layers', () => {
  const content = read(WORKSPACE);
  const section = extractSection(content, '## Memory awareness preflight');
  const required = [
    'Bootstrap',
    'Project pulse',
    'Dev-state',
    'Feature dossier',
    'Brains',
    'Research cache',
    'Devlogs',
    'Git recent',
    'Auto-memory'
  ];
  for (const layer of required) {
    assert.ok(
      section.includes(layer),
      `memory preflight missing layer: ${layer}`
    );
  }
});
