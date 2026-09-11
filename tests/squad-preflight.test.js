'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const {
  resolveSquadPreflight,
  measurePreflight,
  OPERATIONS,
  PACKAGE_DIGEST
} = require('../src/lib/squad-preflight');
const { runSquadPreflight } = require('../src/commands/squad-preflight');

const ROOT = path.join(__dirname, '..');
const quiet = { log() {}, error() {} };
const files = (r) => r.modules.map((m) => path.basename(m.file));

test('default-create on the standard lane loads the create chain, the eval gate and the genome pass', () => {
  const r = resolveSquadPreflight({ operation: 'default-create', lane: 'standard', mode: 'software' });
  assert.equal(r.ok, true);
  assert.deepEqual(r.tasks, ['.aioson/tasks/squad-design.md', '.aioson/tasks/squad-create.md', '.aioson/tasks/squad-validate.md']);
  for (const doc of ['package-contract.md', 'creation-flow.md', 'domain-classification.md', 'domain-breadth.md', 'research-loop.md', 'quality-lens.md', 'eval-gate.md', 'pilot-gate.md', 'persona-grounding.md', 'workflow-quality.md', 'genome-bindings.md']) {
    assert.ok(files(r).includes(doc), `${doc} missing`);
  }
  assert.equal(r.skillRouter, '.aioson/skills/squad/SKILL.md');
  assert.ok(r.doneGate.some((c) => c.includes('squad:validate . --squad=<slug> --strict')));
  assert.ok(r.doneGate.some((c) => c.includes('squad:eval')));
  assert.ok(r.doneGate.some((c) => c.includes('--kind=squad-pilot')));
  assert.ok(r.doneGate.some((c) => c.includes('--kind=squad-package')));
});

test('the quick lane drops research, persona grounding and the eval run; content mode drops the pilot', () => {
  const r = resolveSquadPreflight({ operation: 'create', lane: 'quick', mode: 'content' });
  assert.ok(!files(r).includes('research-loop.md'));
  assert.ok(!files(r).includes('persona-grounding.md'));
  assert.ok(!files(r).includes('eval-gate.md'));
  assert.ok(!files(r).includes('pilot-gate.md'));
  assert.ok(r.doneGate.some((c) => /deferReason/.test(c)));
  assert.ok(!r.doneGate.some((c) => c.includes('--kind=squad-pilot')));
});

test('export loads only its task file; session-run loads session operations and no task', () => {
  const exp = resolveSquadPreflight({ operation: 'export' });
  assert.deepEqual(exp.modules, []);
  assert.deepEqual(exp.tasks, ['.aioson/tasks/squad-export.md']);
  assert.equal(exp.skillRouter, null);
  const run = resolveSquadPreflight({ operation: 'session-run', mode: 'content', signals: 'content' });
  assert.deepEqual(run.tasks, []);
  assert.deepEqual(files(run).sort(), ['content-output.md', 'session-operations.md']);
});

test('signals pull the matching module: a refusing squad loads domain breadth, regulated loads classification', () => {
  const analyze = resolveSquadPreflight({ operation: 'analyze', signals: ['refusal', 'regulated'] });
  assert.ok(files(analyze).includes('domain-breadth.md'));
  assert.ok(files(analyze).includes('domain-classification.md'));
  assert.deepEqual(analyze.signals, ['regulated', 'refusal']);
});

test('an unknown operation is refused with the list of valid ones', () => {
  const r = resolveSquadPreflight({ operation: 'launch' });
  assert.equal(r.ok, false);
  assert.equal(r.error, 'invalid_operation');
  assert.deepEqual(r.operations, OPERATIONS);
});

test('every task file the map points at exists in the template', () => {
  for (const op of OPERATIONS) {
    const r = resolveSquadPreflight({ operation: op });
    for (const task of r.tasks) {
      assert.ok(fs.existsSync(path.join(ROOT, 'template', task)), `${op} → ${task} missing`);
    }
    for (const mod of r.modules) {
      assert.ok(fs.existsSync(path.join(ROOT, 'template', mod.file)), `${op} → ${mod.file} missing`);
    }
  }
});

test('the package digest matches the package contract doc', () => {
  const contract = fs.readFileSync(path.join(ROOT, 'template', '.aioson', 'docs', 'squad', 'package-contract.md'), 'utf8');
  for (const file of PACKAGE_DIGEST.requiredFiles) assert.ok(contract.includes(file), `${file} not in package-contract.md`);
  for (const section of PACKAGE_DIGEST.executorSections) assert.ok(contract.includes(`## ${section}`), `## ${section} not in package-contract.md`);
});

test('measurePreflight attaches byte counts and a token estimate from the workspace', () => {
  const r = measurePreflight(ROOT, resolveSquadPreflight({ operation: 'validate', lane: 'standard' }));
  assert.ok(r.load[0].file.endsWith('agents/squad.md'));
  assert.ok(r.load.every((f) => typeof f.bytes === 'number'), r.missing.join(', '));
  assert.ok(r.totalBytes > 10000);
  assert.equal(r.estimatedTokens, Math.round(r.totalBytes / 4));
});

test('squad:preflight is a JSON CLI command and refuses a missing operation', async () => {
  const missing = await runSquadPreflight({ args: ['.'], options: {}, logger: quiet });
  assert.equal(missing.ok, false);
  assert.equal(missing.error, 'missing_operation');
  const res = spawnSync(process.execPath, [path.join(ROOT, 'bin', 'aioson.js'), 'squad:preflight', ROOT, '--operation=eval', '--json'], { encoding: 'utf8' });
  assert.equal(res.status, 0, res.stderr);
  const parsed = JSON.parse(res.stdout);
  assert.equal(parsed.operation, 'eval');
  assert.ok(parsed.modules.some((m) => m.file.endsWith('eval-gate.md')));
});
