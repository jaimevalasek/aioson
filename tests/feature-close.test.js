'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const { runFeatureClose } = require('../src/commands/feature-close');

async function makeTmpDir() {
  return fs.mkdtemp(path.join(os.tmpdir(), 'aioson-feature-close-'));
}

async function writeFile(dir, relPath, content) {
  const full = path.join(dir, relPath);
  await fs.mkdir(path.dirname(full), { recursive: true });
  await fs.writeFile(full, content, 'utf8');
}

function makeLogger() {
  const lines = [];
  const errors = [];
  return {
    log: (msg = '') => lines.push(String(msg)),
    error: (msg = '') => errors.push(String(msg)),
    lines,
    errors
  };
}

test('feature:close: requires --feature', async () => {
  const tmpDir = await makeTmpDir();
  const result = await runFeatureClose({
    args: [tmpDir],
    options: { json: true, verdict: 'PASS' },
    logger: makeLogger()
  });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'missing_feature');
});

test('feature:close: requires valid --verdict', async () => {
  const tmpDir = await makeTmpDir();
  const result = await runFeatureClose({
    args: [tmpDir],
    options: { json: true, feature: 'checkout', verdict: 'MAYBE' },
    logger: makeLogger()
  });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'invalid_verdict');
});

test('feature:close: PASS adds QA sign-off to spec file', async () => {
  const tmpDir = await makeTmpDir();
  await writeFile(tmpDir, '.aioson/context/spec-checkout.md',
    '---\nversion: 3\ngate_plan: approved\n---\n# Spec\n\n## Implementation\n\nDone.\n');

  const result = await runFeatureClose({
    args: [tmpDir],
    options: { json: true, feature: 'checkout', verdict: 'PASS' },
    logger: makeLogger()
  });
  assert.equal(result.ok, true);
  assert.equal(result.verdict, 'PASS');

  const specContent = await fs.readFile(
    path.join(tmpDir, '.aioson', 'context', 'spec-checkout.md'),
    'utf8'
  );
  assert.ok(specContent.includes('QA Sign-off'));
  assert.ok(specContent.includes('PASS'));
});

test('feature:close: FAIL records rejection in spec', async () => {
  const tmpDir = await makeTmpDir();
  await writeFile(tmpDir, '.aioson/context/spec-checkout.md',
    '---\nversion: 3\n---\n# Spec\n');

  const result = await runFeatureClose({
    args: [tmpDir],
    options: { json: true, feature: 'checkout', verdict: 'FAIL', notes: 'Auth edge case missing' },
    logger: makeLogger()
  });
  assert.equal(result.ok, true);
  assert.equal(result.verdict, 'FAIL');
  assert.equal(result.residual, 'Auth edge case missing');
});

test('feature:close: updates features.md when it exists', async () => {
  const tmpDir = await makeTmpDir();
  await writeFile(tmpDir, '.aioson/context/features.md',
    '| checkout | in_progress | 2026-01-01 | active |\n');

  await runFeatureClose({
    args: [tmpDir],
    options: { json: true, feature: 'checkout', verdict: 'PASS' },
    logger: makeLogger()
  });

  const content = await fs.readFile(
    path.join(tmpDir, '.aioson', 'context', 'features.md'),
    'utf8'
  );
  assert.ok(content.includes('done') || content.includes('checkout'));
});

test('feature:close: updates project-pulse.md when it exists', async () => {
  const tmpDir = await makeTmpDir();
  await writeFile(tmpDir, '.aioson/context/project-pulse.md',
    '---\nlast_agent: dev\nactive_feature: checkout\n---\n# Pulse\n');

  await runFeatureClose({
    args: [tmpDir],
    options: { json: true, feature: 'checkout', verdict: 'PASS' },
    logger: makeLogger()
  });

  const content = await fs.readFile(
    path.join(tmpDir, '.aioson', 'context', 'project-pulse.md'),
    'utf8'
  );
  assert.match(content, /^---\n/);
  assert.ok(content.includes('last_agent: qa'));
  assert.ok(content.includes('last_gate: Gate D: approved'));
  assert.ok(content.includes('active_feature: (none)'));
  assert.ok(content.includes('- **Active feature:** (none)'));
  assert.ok(content.includes('- **Next:** @product start the next feature'));
});

test('feature:close: rebuilds malformed stale project-pulse.md into canonical format', async () => {
  const tmpDir = await makeTmpDir();
  await writeFile(tmpDir, '.aioson/context/project-pulse.md', [
    'last_updated: 2026-04-29T09:08:00-03:00',
    'last_agent: dev',
    'last_gate: workflow-state reconciliation fix aplicado',
    'active_feature: secure-by-default',
    'active_work: "Engine agora reconcilia estados persistidos fora de ordem; falta re-review final"',
    'blockers: "nenhum"',
    'next_recommendation: "@qa validar a regressao"',
    '---',
    '',
    '# Project Pulse',
    '',
    '## Status',
    '',
    '- **Last agent:** @dev',
    '- **Last gate:** workflow-state reconciliation fix aplicado',
    '- **Active feature:** secure-by-default',
    '- **Active work:** Engine agora reconcilia estados persistidos fora de ordem; falta re-review final',
    '- **Next:** @qa validar a regressao',
    '',
    '## Recent Activity',
    '',
    '- 2026-04-29 @dev → secure-by-default: reconciled workflow state',
    ''
  ].join('\n'));

  await runFeatureClose({
    args: [tmpDir],
    options: { json: true, feature: 'secure-by-default', verdict: 'PASS', residual: 'none', 'no-archive': true },
    logger: makeLogger()
  });

  const content = await fs.readFile(
    path.join(tmpDir, '.aioson', 'context', 'project-pulse.md'),
    'utf8'
  );
  assert.match(content, /^---\n/);
  assert.ok(content.includes('last_agent: qa'));
  assert.ok(content.includes('active_feature: (none)'));
  assert.ok(content.includes('- **Active feature:** (none)'));
  assert.ok(content.includes('- **Active work:** none'));
  assert.ok(content.includes('- **Next:** @product start the next feature'));
  assert.doesNotMatch(content, /\*\*Active feature:\*\* secure-by-default/);
});

test('feature:close: idempotent rerun does not duplicate identical recent activity lines', async () => {
  const tmpDir = await makeTmpDir();
  await writeFile(tmpDir, '.aioson/context/project-pulse.md', [
    '---',
    'last_updated: 2026-04-29T05:01:29.056Z',
    'last_agent: qa',
    'last_gate: Gate D: approved',
    'active_feature: (none)',
    'active_work: ""',
    'blockers: "none"',
    'next_recommendation: "@product start the next feature"',
    '---',
    '',
    '# Project Pulse',
    '',
    '## Status',
    '',
    '- **Last agent:** @qa',
    '- **Last gate:** Gate D: approved',
    '- **Active feature:** (none)',
    '- **Active work:** none',
    '- **Blockers:** none',
    '- **Next:** @product start the next feature',
    '',
    '## Recent Activity',
    '',
    '- 2026-04-29 @qa → secure-by-default (Gate D: approved) VERDICT: PASS: none',
    '- 2026-04-29 @qa → secure-by-default (Gate D: approved) VERDICT: PASS: none',
    ''
  ].join('\n'));

  await runFeatureClose({
    args: [tmpDir],
    options: { json: true, feature: 'secure-by-default', verdict: 'PASS', residual: 'none', 'no-archive': true },
    logger: makeLogger()
  });

  const content = await fs.readFile(
    path.join(tmpDir, '.aioson', 'context', 'project-pulse.md'),
    'utf8'
  );
  const lines = content.split('\n').filter((line) =>
    line.includes('@qa → secure-by-default (Gate D: approved) VERDICT: PASS: none')
  );
  assert.equal(lines.length, 1);
});

test('feature:close: works when spec file missing (skips gracefully)', async () => {
  const tmpDir = await makeTmpDir();
  const result = await runFeatureClose({
    args: [tmpDir],
    options: { json: true, feature: 'missing', verdict: 'PASS' },
    logger: makeLogger()
  });
  assert.equal(result.ok, true);
  assert.ok(result.updates.some((u) => u.includes('skipped') || u.includes('not found')));
});

test('feature:close: human output shows closure summary', async () => {
  const tmpDir = await makeTmpDir();
  const logger = makeLogger();
  await runFeatureClose({
    args: [tmpDir],
    options: { feature: 'checkout', verdict: 'PASS' },
    logger
  });
  assert.ok(logger.lines.some((l) => l.includes('checkout') || l.includes('closure')));
});

test('feature:close: residual is included in spec sign-off', async () => {
  const tmpDir = await makeTmpDir();
  await writeFile(tmpDir, '.aioson/context/spec-feat.md', '---\nversion: 1\n---\n# Spec\n');

  await runFeatureClose({
    args: [tmpDir],
    options: { json: true, feature: 'feat', verdict: 'PASS', residual: 'Email not tested E2E' },
    logger: makeLogger()
  });

  const content = await fs.readFile(
    path.join(tmpDir, '.aioson', 'context', 'spec-feat.md'),
    'utf8'
  );
  assert.ok(content.includes('Email not tested E2E'));
});

test('feature:close PASS triggers auto-archive', async () => {
  const tmpDir = await makeTmpDir();
  await writeFile(tmpDir, '.aioson/context/spec-checkout.md', '---\nversion: 1\n---\n# Spec\n');
  await writeFile(tmpDir, '.aioson/context/features.md',
    '| checkout | done | 2026-01-01 | 2026-04-28 |\n');
  await writeFile(tmpDir, '.aioson/context/prd-checkout.md', '## Vision\nA thing.\n');

  const result = await runFeatureClose({
    args: [tmpDir],
    options: { json: true, feature: 'checkout', verdict: 'PASS' },
    logger: makeLogger()
  });

  assert.equal(result.ok, true);
  assert.ok(result.archive !== null, 'archive result should be present');
  assert.ok(
    result.updates.some(u => u.includes('archive:')),
    'updates should mention archive'
  );
});

test('feature:close --no-archive skips archive on PASS', async () => {
  const tmpDir = await makeTmpDir();
  await writeFile(tmpDir, '.aioson/context/spec-checkout.md', '---\nversion: 1\n---\n# Spec\n');
  await writeFile(tmpDir, '.aioson/context/features.md',
    '| checkout | done | 2026-01-01 | 2026-04-28 |\n');

  const result = await runFeatureClose({
    args: [tmpDir],
    options: { json: true, feature: 'checkout', verdict: 'PASS', 'no-archive': true },
    logger: makeLogger()
  });

  assert.equal(result.ok, true);
  assert.equal(result.archive, null);
  assert.ok(
    !result.updates.some(u => u.includes('archive:')),
    'updates should not mention archive'
  );
});

test('feature:close re-run replaces existing QA Sign-off', async () => {
  const tmpDir = await makeTmpDir();
  await writeFile(tmpDir, '.aioson/context/spec-feat.md', [
    '---',
    'version: 1',
    'gate_execution: approved',
    '---',
    '# Spec',
    '',
    '## QA Sign-off',
    '',
    '- **Date:** 2026-04-01',
    '- **Verdict:** PASS',
    '- **Gate D (execution):** approved',
    ''
  ].join('\n'));

  await runFeatureClose({
    args: [tmpDir],
    options: { json: true, feature: 'feat', verdict: 'FAIL', notes: 'Regression found' },
    logger: makeLogger()
  });

  const content = await fs.readFile(
    path.join(tmpDir, '.aioson', 'context', 'spec-feat.md'),
    'utf8'
  );
  // Should contain only one QA Sign-off block
  const matches = content.match(/## QA Sign-off/g);
  assert.equal(matches.length, 1, 'should have exactly one QA Sign-off block');
  assert.ok(content.includes('FAIL'));
  assert.ok(content.includes('Regression found'));
});

test('feature:close updates gate_execution frontmatter', async () => {
  const tmpDir = await makeTmpDir();
  await writeFile(tmpDir, '.aioson/context/spec-feat.md', '---\nversion: 1\ngate_execution: pending\n---\n# Spec\n');

  await runFeatureClose({
    args: [tmpDir],
    options: { json: true, feature: 'feat', verdict: 'PASS' },
    logger: makeLogger()
  });

  const content = await fs.readFile(
    path.join(tmpDir, '.aioson', 'context', 'spec-feat.md'),
    'utf8'
  );
  assert.ok(content.includes('gate_execution: approved'));
});

// ---------- Harness Done Gate (T5 / AC-HD-11 refined) ----------

async function setupHarnessFeature(tmpDir, slug, { ready_for_done_gate, last_error = null, circuit_state = 'CLOSED' }) {
  const planDir = path.join(tmpDir, '.aioson', 'plans', slug);
  await fs.mkdir(planDir, { recursive: true });
  await fs.writeFile(
    path.join(planDir, 'harness-contract.json'),
    JSON.stringify({
      feature: slug,
      contract_mode: 'BALANCED',
      governor: { max_steps: 50, error_streak_limit: 5 },
      criteria: [{ id: 'C1', description: 'x', assertion: 'y', binary: true }]
    }),
    'utf8'
  );
  await fs.writeFile(
    path.join(planDir, 'progress.json'),
    JSON.stringify({
      feature: slug,
      phase: 1,
      status: 'in_progress',
      completed_steps: [],
      last_error,
      session_count: 1,
      last_updated: new Date().toISOString(),
      circuit_state,
      iterations: 0,
      consecutive_errors: 0,
      ready_for_done_gate
    }),
    'utf8'
  );
}

test('feature:close (T5): without harness contract behaves exactly as before (regression)', async () => {
  const tmpDir = await makeTmpDir();
  // No contract created — just a regular feature
  await writeFile(tmpDir, '.aioson/context/spec-plain.md', '---\nversion: 1\n---\n# Spec\n');

  const result = await runFeatureClose({
    args: [tmpDir],
    options: { json: true, feature: 'plain', verdict: 'PASS' },
    logger: makeLogger()
  });

  assert.equal(result.ok, true);
  assert.equal(result.verdict, 'PASS');
});

test('feature:close (T5): with contract and ready_for_done_gate=true, PASS proceeds', async () => {
  const tmpDir = await makeTmpDir();
  await setupHarnessFeature(tmpDir, 'gate-pass', { ready_for_done_gate: true });
  await writeFile(tmpDir, '.aioson/context/spec-gate-pass.md', '---\nversion: 1\n---\n# Spec\n');

  const result = await runFeatureClose({
    args: [tmpDir],
    options: { json: true, feature: 'gate-pass', verdict: 'PASS' },
    logger: makeLogger()
  });

  assert.equal(result.ok, true);
  assert.equal(result.verdict, 'PASS');
  assert.ok(result.updates.some((u) => u.includes('harness done gate: PASSED')),
    'must record harness gate as PASSED in updates');
});

test('feature:close blocks detectable runtime feature when harness contract is missing', async () => {
  const tmpDir = await makeTmpDir();
  await writeFile(tmpDir, '.aioson/context/spec-runtime-no-contract.md', '---\nversion: 1\n---\n# Spec\n');
  await writeFile(tmpDir, '.aioson/briefings/runtime-no-contract/prototype-manifest.md', '# Core interactions\n');

  const result = await runFeatureClose({
    args: [tmpDir],
    options: { json: true, feature: 'runtime-no-contract', verdict: 'PASS' },
    logger: makeLogger()
  });

  assert.equal(result.ok, false);
  assert.equal(result.reason, 'harness_contract_gate_blocked');
  assert.ok(result.errors.some((err) => err.code === 'missing_runtime_contract'));
});

test('feature:close blocks runtime contract without RG-* even when progress says ready', async () => {
  const tmpDir = await makeTmpDir();
  await setupHarnessFeature(tmpDir, 'runtime-no-rg', { ready_for_done_gate: true });
  await writeFile(tmpDir, '.aioson/context/spec-runtime-no-rg.md', '---\nversion: 1\n---\n# Spec\n');
  await writeFile(tmpDir, '.aioson/briefings/runtime-no-rg/prototype-manifest.md', '# Core interactions\n');

  const result = await runFeatureClose({
    args: [tmpDir],
    options: { json: true, feature: 'runtime-no-rg', verdict: 'PASS' },
    logger: makeLogger()
  });

  assert.equal(result.ok, false);
  assert.equal(result.reason, 'harness_contract_gate_blocked');
  assert.match(result.error, /missing_runtime_gate/);
});

test('feature:close (T5): with contract and ready_for_done_gate=false, PASS is BLOCKED', async () => {
  const tmpDir = await makeTmpDir();
  await setupHarnessFeature(tmpDir, 'gate-block', {
    ready_for_done_gate: false,
    last_error: 'C2: Missing export in src/foo.js'
  });
  await writeFile(tmpDir, '.aioson/context/spec-gate-block.md', '---\nversion: 1\n---\n# Spec\n');

  const result = await runFeatureClose({
    args: [tmpDir],
    options: { json: true, feature: 'gate-block', verdict: 'PASS' },
    logger: makeLogger()
  });

  assert.equal(result.ok, false);
  assert.equal(result.reason, 'harness_done_gate_blocked');
  assert.equal(result.last_error, 'C2: Missing export in src/foo.js');
  assert.match(result.error, /Harness Done Gate BLOCKED/);
  assert.match(result.error, /C2: Missing export/, 'must include the pending criterion in the error');

  // Confirms NO write happened: features.md untouched (it didn't exist anyway, but spec also untouched)
  const specContent = await fs.readFile(path.join(tmpDir, '.aioson/context/spec-gate-block.md'), 'utf8');
  assert.doesNotMatch(specContent, /QA Sign-off/, 'spec must not be mutated when gate blocks');
});

test('feature:close (T5): --force bypasses the gate with explicit warning in updates', async () => {
  const tmpDir = await makeTmpDir();
  await setupHarnessFeature(tmpDir, 'gate-force', {
    ready_for_done_gate: false,
    last_error: 'C1: emergency override needed'
  });
  await writeFile(tmpDir, '.aioson/context/spec-gate-force.md', '---\nversion: 1\n---\n# Spec\n');

  const result = await runFeatureClose({
    args: [tmpDir],
    options: { json: true, feature: 'gate-force', verdict: 'PASS', force: true },
    logger: makeLogger()
  });

  assert.equal(result.ok, true);
  assert.equal(result.verdict, 'PASS');
  assert.ok(result.updates.some((u) => u.includes('harness done gate: BYPASSED')),
    'must record explicit BYPASS in updates');
  assert.ok(result.updates.some((u) => u.includes('C1: emergency override needed')),
    'BYPASS message must include the pending last_error for audit trail');
});

test('feature:close (T5): FAIL verdict skips gate (QA already rejected, gate is moot)', async () => {
  const tmpDir = await makeTmpDir();
  await setupHarnessFeature(tmpDir, 'gate-fail', {
    ready_for_done_gate: false,
    last_error: 'C1: still failing'
  });
  await writeFile(tmpDir, '.aioson/context/spec-gate-fail.md', '---\nversion: 1\n---\n# Spec\n');

  const result = await runFeatureClose({
    args: [tmpDir],
    options: { json: true, feature: 'gate-fail', verdict: 'FAIL', notes: 'Auth edge case missing' },
    logger: makeLogger()
  });

  assert.equal(result.ok, true);
  assert.equal(result.verdict, 'FAIL');
  // Gate should NOT have been evaluated on FAIL — no harness-related update lines
  assert.equal(
    result.updates.some((u) => u.startsWith('harness done gate:')),
    false,
    'harness done gate must not run on FAIL verdict'
  );
});

test('feature:close (T5): corrupted progress.json fails safe (warns and proceeds)', async () => {
  const tmpDir = await makeTmpDir();
  const planDir = path.join(tmpDir, '.aioson/plans', 'gate-corrupt');
  await fs.mkdir(planDir, { recursive: true });
  await fs.writeFile(path.join(planDir, 'harness-contract.json'),
    JSON.stringify({ feature: 'gate-corrupt', contract_mode: 'BALANCED', governor: {}, criteria: [] }),
    'utf8');
  await fs.writeFile(path.join(planDir, 'progress.json'), '{ this is not json', 'utf8');
  await writeFile(tmpDir, '.aioson/context/spec-gate-corrupt.md', '---\nversion: 1\n---\n# Spec\n');

  const result = await runFeatureClose({
    args: [tmpDir],
    options: { json: true, feature: 'gate-corrupt', verdict: 'PASS' },
    logger: makeLogger()
  });

  // Fail-safe: do NOT block on parse error; proceed with a warning in updates
  assert.equal(result.ok, true);
  assert.equal(result.verdict, 'PASS');
  assert.ok(result.updates.some((u) => u.includes('progress.json parse error')),
    'must record the parse error in updates');
});

const DEV_STATE = (slug) =>
  `---\nlast_updated: 2026-07-01\nactive_feature: ${slug}\nactive_phase: 5\n` +
  `next_step: "aioson feature:close"\nstatus: in_progress\n---\n\n# Dev State\n\n**Feature:** ${slug}\n`;

test('feature:close: PASS retires dev-state.md when it points at the closed feature', async () => {
  const tmpDir = await makeTmpDir();
  await writeFile(tmpDir, '.aioson/context/dev-state.md', DEV_STATE('checkout'));

  const result = await runFeatureClose({
    args: [tmpDir],
    options: { json: true, feature: 'checkout', verdict: 'PASS' },
    logger: makeLogger()
  });

  assert.equal(result.ok, true);
  // The stale cold-start pointer must be gone so a future @dev cold-starts clean.
  await assert.rejects(fs.access(path.join(tmpDir, '.aioson/context/dev-state.md')));
  assert.ok(result.updates.some((u) => u.includes('dev-state.md: retired')),
    'must record the dev-state retirement');
  // Archived for audit under runtime/devstate-history/.
  const histDir = path.join(tmpDir, '.aioson/runtime/devstate-history');
  const hist = await fs.readdir(histDir);
  assert.ok(hist.length >= 1, 'retired dev-state should be archived');
});

test('feature:close: PASS leaves dev-state.md intact when it points at a DIFFERENT active feature', async () => {
  const tmpDir = await makeTmpDir();
  await writeFile(tmpDir, '.aioson/context/dev-state.md', DEV_STATE('other-feature'));

  const result = await runFeatureClose({
    args: [tmpDir],
    options: { json: true, feature: 'checkout', verdict: 'PASS' },
    logger: makeLogger()
  });

  assert.equal(result.ok, true);
  // Another feature's in-progress pointer must survive.
  const content = await fs.readFile(path.join(tmpDir, '.aioson/context/dev-state.md'), 'utf8');
  assert.ok(content.includes('active_feature: other-feature'));
  assert.ok(result.updates.some((u) => u.includes('left intact')));
});

test('feature:close: FAIL keeps dev-state.md (the feature is still being worked)', async () => {
  const tmpDir = await makeTmpDir();
  await writeFile(tmpDir, '.aioson/context/dev-state.md', DEV_STATE('checkout'));

  await runFeatureClose({
    args: [tmpDir],
    options: { json: true, feature: 'checkout', verdict: 'FAIL', notes: 'blocker' },
    logger: makeLogger()
  });

  // FAIL means QA rejected — @dev resumes to fix, so the pointer stays.
  const content = await fs.readFile(path.join(tmpDir, '.aioson/context/dev-state.md'), 'utf8');
  assert.ok(content.includes('active_feature: checkout'));
});

test('feature:close: PASS retires workflow.state.json + workflow-execute.json for the closed feature', async () => {
  const tmpDir = await makeTmpDir();
  await writeFile(tmpDir, '.aioson/context/workflow.state.json',
    JSON.stringify({ version: 1, mode: 'feature', featureSlug: 'checkout', next: 'qa' }));
  await writeFile(tmpDir, '.aioson/context/workflow-execute.json',
    JSON.stringify({ version: 1, feature: 'checkout', agentic_policy: { enabled: true } }));

  const result = await runFeatureClose({
    args: [tmpDir],
    options: { json: true, feature: 'checkout', verdict: 'PASS' },
    logger: makeLogger()
  });

  assert.equal(result.ok, true);
  // Both stale runtime-state files must be gone so the NEXT feature seeds cleanly
  // and downstream agents don't autopilot on a closed feature's scheme.
  await assert.rejects(fs.access(path.join(tmpDir, '.aioson/context/workflow.state.json')));
  await assert.rejects(fs.access(path.join(tmpDir, '.aioson/context/workflow-execute.json')));
  assert.ok(result.updates.some((u) => u.includes('workflow state: retired')));
});

test('feature:close: PASS leaves workflow state for a DIFFERENT feature untouched', async () => {
  const tmpDir = await makeTmpDir();
  await writeFile(tmpDir, '.aioson/context/workflow.state.json',
    JSON.stringify({ version: 1, mode: 'feature', featureSlug: 'other-feature', next: 'dev' }));
  await writeFile(tmpDir, '.aioson/context/workflow-execute.json',
    JSON.stringify({ version: 1, feature: 'other-feature', agentic_policy: { enabled: true } }));

  await runFeatureClose({
    args: [tmpDir],
    options: { json: true, feature: 'checkout', verdict: 'PASS' },
    logger: makeLogger()
  });

  // Another feature's active workflow must survive.
  const st = JSON.parse(await fs.readFile(path.join(tmpDir, '.aioson/context/workflow.state.json'), 'utf8'));
  assert.equal(st.featureSlug, 'other-feature');
  const ex = JSON.parse(await fs.readFile(path.join(tmpDir, '.aioson/context/workflow-execute.json'), 'utf8'));
  assert.equal(ex.feature, 'other-feature');
});
