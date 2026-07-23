'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { validateHandoffContract } = require('../src/handoff-contract');

async function write(root, rel, content) {
  const file = path.join(root, rel);
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, content, 'utf8');
}

function state(slug = 'tiny-fix') {
  return {
    mode: 'feature',
    featureSlug: slug,
    classification: 'MICRO',
    sequence: ['product', 'planner', 'dev', 'qa']
  };
}

const prd = `---
classification: MICRO
product_scope: approved
prd_ready: approved
---
# Tiny fix

## Feature Capability Map
| CAP | Promised outcome | Actor / trigger | Scope decision | Rationale |
|---|---|---|---|---|
| CAP-tiny-01 | User sees the result | User triggers action | required | Core outcome |

## Acceptance Criteria
| AC | CAP | Observable behavior | Evidence |
|---|---|---|---|
| AC-tiny-01 | CAP-tiny-01 | Result appears in the normal app | focused test |
`;

const plan = `---
status: approved
---
# Plan

## Capability Delivery Plan
| CAP | Phase | Files | Verification |
|---|---|---|---|
| CAP-tiny-01 | 1 | src/tiny.js, tests/tiny.test.js | node --test |
`;

describe('handoff-contract — MICRO uses the same compact feature contract', () => {
  let root;

  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'handoff-micro-'));
    await write(root, '.aioson/context/project.context.md', '---\nclassification: MEDIUM\n---\n# Project\n');
    await write(root, '.aioson/context/project-pulse.md', '# Pulse\n');
    await write(root, '.aioson/context/dev-state.md', '# Dev State\n');
    await write(root, '.aioson/context/prd-tiny-fix.md', prd);
  });

  afterEach(async () => fs.rm(root, { recursive: true, force: true }));

  it('blocks Dev when the compact Planner artifact is missing', async () => {
    const result = await validateHandoffContract(root, state(), 'dev');
    assert.equal(result.ok, false);
    assert.ok(result.missing.some((item) => /gate C|implementation-plan/i.test(item)));
    assert.equal(result.missing.some((item) => /requirements|spec-|architecture|readiness/i.test(item)), false);
  });

  it('passes Dev with Product-ready PRD, compact plan, real paths, and focused AC evidence', async () => {
    await write(root, '.aioson/context/implementation-plan-tiny-fix.md', plan);
    await write(root, 'src/tiny.js', 'module.exports = true;\n');
    await write(root, 'tests/tiny.test.js', "const test=require('node:test'); const assert=require('node:assert/strict'); test('AC-tiny-01',()=>assert.ok(true));\n");
    const result = await validateHandoffContract(root, state(), 'dev');
    assert.equal(result.ok, true, JSON.stringify(result.missing));
  });

  it('requires the same independent QA verdict, without classification-driven security paperwork', async () => {
    await write(root, '.aioson/context/implementation-plan-tiny-fix.md', plan);
    await write(root, 'src/tiny.js', 'module.exports = true;\n');
    await write(root, 'tests/tiny.test.js', "const test=require('node:test'); const assert=require('node:assert/strict'); test('AC-tiny-01',()=>assert.ok(true));\n");
    await write(root, '.aioson/context/qa-report-tiny-fix.md', '---\nverdict: PASS\n---\n# QA\n');
    const result = await validateHandoffContract(root, state(), 'qa');
    assert.equal(result.ok, true, JSON.stringify(result.missing));
    assert.equal(result.missing.some((item) => /security-findings/i.test(item)), false);
  });

  it('does not require Sheldon in the MICRO canonical sequence', async () => {
    await write(root, '.aioson/context/implementation-plan-tiny-fix.md', plan);
    const result = await validateHandoffContract(root, state(), 'planner', { structuralOnly: true });
    assert.equal(result.ok, true, JSON.stringify(result.missing));
  });
});
