'use strict';

// Guards the shared code-health-analysis lens: the playbook exists in template +
// workspace (byte-identical), covers its six facets, and every agent that opted in
// references it on demand.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const DOC_REL = '.aioson/docs/quality/code-health-analysis.md';
const WIRED_AGENTS = ['planner', 'dev', 'qa', 'architect', 'tester', 'pentester', 'deyvin'];

test('code-health-analysis doc exists in template and workspace, byte-identical', () => {
  const tpl = fs.readFileSync(path.join(ROOT, 'template', DOC_REL), 'utf8');
  const ws = fs.readFileSync(path.join(ROOT, DOC_REL), 'utf8');
  assert.ok(tpl.length > 0);
  assert.equal(tpl, ws, 'template and workspace copies must match (inception parity)');
});

test('doc covers the six facets and the operate→adjust loop', () => {
  const doc = fs.readFileSync(path.join(ROOT, 'template', DOC_REL), 'utf8');
  for (const facet of ['Coverage gaps', 'Test sufficiency', 'Regression need', 'Execution chain', 'Performance hotspots', 'Componentization']) {
    assert.match(doc, new RegExp(facet), `missing facet: ${facet}`);
  }
  for (const step of ['Plan', 'Investigate', 'Refine', 'Operate', 'Test', 'Adjust']) {
    assert.match(doc, new RegExp(`### \\d\\. ${step}`), `missing loop step: ${step}`);
  }
});

test('every opted-in agent references the shared lens on demand', () => {
  for (const agent of WIRED_AGENTS) {
    for (const base of ['template/.aioson/agents', '.aioson/agents']) {
      const content = fs.readFileSync(path.join(ROOT, base, `${agent}.md`), 'utf8');
      assert.ok(
        content.includes('.aioson/docs/quality/code-health-analysis.md'),
        `${base}/${agent}.md must reference the code-health lens`
      );
    }
  }
});
