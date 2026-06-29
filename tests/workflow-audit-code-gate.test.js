'use strict';

// Deterministic audit:code step in the TRACKED workflow:next @dev/@qa done-gate.
// Policy lives in verification.json `audit_code`:
//   advisory (default) — records a summary on the finalize result + a guard event,
//                        never blocks (audit:code is a heuristic, not the contract).
//   block              — a HIGH finding in the changed files is a hard gate.
//   off                — skip the step.
// Scope is the git diff (--changed). The scaffold mirrors workflow-runtime-gate-once
// so finalize reaches the done-gate; the difference is a source file we control.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const { finalizeCurrentStage, readWorkflowConfig } = require('../src/commands/workflow-next');

async function wf(dir, rel, content) {
  const full = path.join(dir, rel);
  await fs.mkdir(path.dirname(full), { recursive: true });
  await fs.writeFile(full, content, 'utf8');
}

async function scaffold(slug, { code }) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'aioson-acg-'));
  execFileSync('git', ['init', '-q'], { cwd: dir });
  execFileSync('git', ['config', 'user.email', 'a@b.c'], { cwd: dir });
  execFileSync('git', ['config', 'user.name', 'a'], { cwd: dir });
  await wf(dir, '.aioson/context/project.context.md', '---\nclassification: "SMALL"\n---\n# C\n');
  await wf(dir, `.aioson/context/prd-${slug}.md`, '---\nclassification: SMALL\n---\n# PRD\n');
  await wf(dir, `.aioson/context/spec-${slug}.md`,
    '---\nclassification: SMALL\ngate_requirements: approved\ngate_design: approved\ngate_plan: approved\n---\n# Spec\nNotes.\n');
  await wf(dir, `.aioson/context/readiness-${slug}.md`, '---\nreadiness: ready\n---\n# Readiness\n');
  await wf(dir, '.aioson/context/project-pulse.md', '# Pulse\n');
  await wf(dir, '.aioson/context/dev-state.md', `---\nactive_feature: ${slug}\nstatus: in_progress\n---\n# Dev State\n`);
  const contract = {
    feature: slug,
    governor: {},
    criteria: [
      { id: 'RG-1', description: 'runtime gate', assertion: 'app boots', binary: true, verification: 'node -e "process.exit(0)"' }
    ]
  };
  await wf(dir, `.aioson/plans/${slug}/harness-contract.json`, JSON.stringify(contract, null, 2));
  await wf(dir, `.aioson/plans/${slug}/progress.json`, JSON.stringify({
    feature: slug, phase: 1, status: 'in_progress', ready_for_done_gate: true,
    completed_steps: [], circuit_state: 'CLOSED'
  }, null, 2));
  // The source file we control — an untracked .ts, so it shows up in --changed.
  await wf(dir, 'src/feature.ts', code);
  return dir;
}

const HIGH_CODE = 'export const run = () => eval("1+1");\n';
const CLEAN_CODE = 'export const add = (a: number, b: number): number => a + b;\n';

function devState(slug) {
  return {
    version: 1, mode: 'feature', featureSlug: slug, classification: 'SMALL',
    sequence: ['product', 'dev', 'qa'], completed: ['product'], skipped: [],
    current: 'dev', next: 'qa', detour: null
  };
}

test('advisory (default): a HIGH anti-pattern in the diff does NOT block @dev-done; auditCode summary rides the result', async () => {
  const slug = 'adv';
  const dir = await scaffold(slug, { code: HIGH_CODE });
  const { config } = await readWorkflowConfig(dir);
  const result = await finalizeCurrentStage(dir, config, devState(slug), 'dev');
  assert.equal(result.completedStage, 'dev', 'advisory mode must not block the stage');
  assert.ok(result.auditCode, 'expected an auditCode summary on the finalize result');
  assert.equal(result.auditCode.gate, 'advisory');
  assert.ok(result.auditCode.high >= 1, 'the eval() HIGH must be counted');
  assert.ok(result.auditCode.categories.includes('ANTI_PATTERN'));
});

test('block: a HIGH anti-pattern in the diff blocks @dev-done', async () => {
  const slug = 'blk';
  const dir = await scaffold(slug, { code: HIGH_CODE });
  await wf(dir, '.aioson/config/verification.json', JSON.stringify({ audit_code: { tracked_gate: 'block', scope: 'changed' } }));
  const { config } = await readWorkflowConfig(dir);
  await assert.rejects(
    () => finalizeCurrentStage(dir, config, devState(slug), 'dev'),
    /Code-Quality Gate/
  );
});

test('off: the audit:code step is skipped entirely (no auditCode summary)', async () => {
  const slug = 'off';
  const dir = await scaffold(slug, { code: HIGH_CODE });
  await wf(dir, '.aioson/config/verification.json', JSON.stringify({ audit_code: { tracked_gate: 'off' } }));
  const { config } = await readWorkflowConfig(dir);
  const result = await finalizeCurrentStage(dir, config, devState(slug), 'dev');
  assert.equal(result.completedStage, 'dev');
  assert.equal(result.auditCode, undefined);
});

test('advisory + clean diff: no block, auditCode summary reports zero HIGH', async () => {
  const slug = 'clean';
  const dir = await scaffold(slug, { code: CLEAN_CODE });
  const { config } = await readWorkflowConfig(dir);
  const result = await finalizeCurrentStage(dir, config, devState(slug), 'dev');
  assert.equal(result.completedStage, 'dev');
  assert.ok(result.auditCode);
  assert.equal(result.auditCode.high, 0);
});
