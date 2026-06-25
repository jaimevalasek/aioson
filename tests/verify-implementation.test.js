'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync, execFileSync } = require('node:child_process');
const { EventEmitter } = require('node:events');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { PassThrough } = require('node:stream');

const { runVerifyImplementation } = require('../src/commands/verify-implementation');
const { openRuntimeDb } = require('../src/runtime-store');
const {
  validateImplementationLedger,
  validateVerificationReport
} = require('../src/verification/schema');
const { createCounter, redactText } = require('../src/verification/redaction');

const BIN = path.join(__dirname, '..', 'bin', 'aioson.js');
const SLUG = 'kanban';

async function makeTmpDir() {
  return fs.mkdtemp(path.join(os.tmpdir(), 'aioson-verify-impl-'));
}

async function writeFile(dir, relPath, content) {
  const full = path.join(dir, relPath);
  await fs.mkdir(path.dirname(full), { recursive: true });
  await fs.writeFile(full, content, 'utf8');
}

async function readFile(dir, relPath) {
  return fs.readFile(path.join(dir, relPath), 'utf8');
}

async function readJsonFixture(name) {
  const content = await fs.readFile(path.join(__dirname, 'fixtures', 'verification', name), 'utf8');
  return JSON.parse(content);
}

function makeLogger() {
  const lines = [];
  return { log: (message = '') => lines.push(String(message)), error: () => {}, lines };
}

async function run(dir, options, extra = {}) {
  return runVerifyImplementation({
    args: [dir],
    options: { json: true, feature: SLUG, ...options },
    logger: makeLogger(),
    ...extra
  });
}

async function readVerificationEvents(dir) {
  const { db } = await openRuntimeDb(dir, { mustExist: true });
  try {
    return db.prepare(`
      SELECT event_type, source, phase, status, tool_name, verdict, payload_json
      FROM execution_events
      WHERE source = 'verify_implementation'
      ORDER BY id
    `).all();
  } finally {
    db.close();
  }
}

function fakeSpawn(handler) {
  return (command, args, options) => {
    const child = new EventEmitter();
    child.stdout = new PassThrough();
    child.stderr = new PassThrough();
    child.stdin = new PassThrough();
    child.kill = (signal) => {
      setImmediate(() => child.emit('close', null, signal));
      return true;
    };
    setImmediate(() => handler({ command, args, options, child }));
    return child;
  };
}

function closeFakeChild(child, { stdout = '', stderr = '', code = 0, signal = null } = {}) {
  child.stdout.end(stdout);
  child.stderr.end(stderr);
  setImmediate(() => child.emit('close', code, signal));
}

function initGit(dir) {
  execFileSync('git', ['init'], { cwd: dir, stdio: 'ignore' });
  execFileSync('git', ['config', 'user.email', 'test@example.com'], { cwd: dir, stdio: 'ignore' });
  execFileSync('git', ['config', 'user.name', 'Test User'], { cwd: dir, stdio: 'ignore' });
}

function validMachineLedger(overrides = {}) {
  return {
    schema_version: 'implementation-ledger/v1',
    feature_slug: SLUG,
    source_artifacts: [
      { type: 'prd', path: `.aioson/context/prd-${SLUG}.md`, role: 'product_authority' }
    ],
    claims: [
      {
        id: 'CLAIM-001',
        kind: 'required_behavior',
        summary: 'Add card persists and re-renders in the active list.',
        owner: 'dev',
        status: 'implemented',
        evidence: [
          { type: 'file', path: 'src/cards.js', lines: '1-20' },
          { type: 'test', command: 'node --test tests/cards.test.js', status: 'passed' }
        ]
      }
    ],
    known_gaps: [],
    verification_commands: [
      { command: 'npm test', required: true, last_status: 'passed' },
      { command: 'node --test tests/cards.test.js', required: true, last_status: 'passed' }
    ],
    ...overrides
  };
}

function ledgerMarkdown(machineLedger = validMachineLedger()) {
  const machineBlock = typeof machineLedger === 'string'
    ? machineLedger
    : JSON.stringify(machineLedger, null, 2);
  return `# Implementation Ledger - ${SLUG}

## Source Of Truth
PRD.

## Intended Behavior Claims
CLAIM-001.

## Implementation Evidence
src/cards.js.

## Verification Commands
node --test tests/cards.test.js

## Known Gaps
None.

## Handoff Notes
Ready for clean audit.

## Machine Ledger

\`\`\`json
${machineBlock}
\`\`\`
`;
}

function reportMarkdown(machineReport, proseVerdict = machineReport.verdict) {
  return `# Verification Report - ${SLUG}

## Verdict
${proseVerdict}

## Commands Run
npm test.

## Findings
See machine block.

## Before And Now
Before missing, now checked.

## Residual Risk
None.

## Recommended Route
${machineReport.recommended_route}

## Machine Report

\`\`\`json
${JSON.stringify(machineReport, null, 2)}
\`\`\`
`;
}

function machineReport(overrides = {}) {
  return {
    schema_version: 'verification-report/v1',
    feature_slug: SLUG,
    policy: 'strict',
    verdict: 'PASS',
    summary: 'All required claims confirm.',
    commands_run: [
      { command: 'npm test', status: 'passed', evidence: 'passed' }
    ],
    findings: [],
    recommended_route: 'qa',
    blocking_findings_count: 0,
    ...overrides
  };
}

async function setupRunnerProject(dir) {
  initGit(dir);
  await writeFile(dir, 'package.json', '{"scripts":{"test":"node --test"}}\n');
  await writeFile(dir, 'src/cards.js', 'module.exports = {};\n');
  await writeFile(dir, `.aioson/context/prd-${SLUG}.md`, '# PRD\n');
  await writeFile(dir, `.aioson/context/features/${SLUG}/implementation-ledger.md`, ledgerMarkdown());
}

test('verify:implementation CLI dispatch creates ledger JSON', async () => {
  const dir = await makeTmpDir();
  const result = spawnSync(process.execPath, [
    BIN,
    'verify:implementation',
    dir,
    `--feature=${SLUG}`,
    '--prepare-ledger',
    '--json'
  ], { encoding: 'utf8' });

  assert.equal(result.status, 0, result.stderr || result.stdout);
  const parsed = JSON.parse(result.stdout);
  assert.equal(parsed.ok, true);
  assert.equal(parsed.mode, 'prepare-ledger');
  assert.equal(parsed.created, true);
});

test('prepare-ledger creates safe feature artifact and does not overwrite', async () => {
  const dir = await makeTmpDir();
  await writeFile(dir, `.aioson/context/prd-${SLUG}.md`, '# PRD\n');

  const first = await run(dir, { 'prepare-ledger': true });
  assert.equal(first.ok, true);
  assert.equal(first.created, true);
  assert.equal(first.source_artifacts_found, true);

  const ledgerPath = first.ledger_path;
  await writeFile(dir, ledgerPath, 'custom ledger');
  const second = await run(dir, { 'prepare-ledger': true });
  assert.equal(second.ok, true);
  assert.equal(second.created, false);
  assert.equal(await readFile(dir, ledgerPath), 'custom ledger');
});

test('verify:implementation rejects path traversal slug variants', async () => {
  const dir = await makeTmpDir();
  const dotdot = await runVerifyImplementation({
    args: [dir],
    options: { json: true, feature: '../secret', 'prepare-ledger': true },
    logger: makeLogger()
  });
  const windows = await runVerifyImplementation({
    args: [dir],
    options: { json: true, feature: '..\\secret', 'prepare-ledger': true },
    logger: makeLogger()
  });
  assert.equal(dotdot.ok, false);
  assert.equal(dotdot.reason, 'invalid_feature_slug');
  assert.equal(windows.ok, false);
  assert.equal(windows.reason, 'invalid_feature_slug');
});

test('check-ledger reports missing sections and malformed machine JSON', async () => {
  const dir = await makeTmpDir();
  await writeFile(dir, `.aioson/context/features/${SLUG}/implementation-ledger.md`, `# Implementation Ledger - ${SLUG}\n`);
  const missing = await run(dir, { 'check-ledger': true });
  assert.equal(missing.ok, false);
  assert.equal(missing.reason, 'missing_ledger_sections');
  assert.ok(missing.missing_sections.includes('source_of_truth'));

  await writeFile(dir, `.aioson/context/features/${SLUG}/implementation-ledger.md`, ledgerMarkdown('{ not json'));
  const invalid = await run(dir, { 'check-ledger': true });
  assert.equal(invalid.ok, false);
  assert.equal(invalid.reason, 'invalid_machine_ledger_json');
});

test('check-ledger rejects claim without required machine fields', async () => {
  const dir = await makeTmpDir();
  const bad = validMachineLedger({
    claims: [
      {
        kind: 'required_behavior',
        summary: 'Missing id.',
        owner: 'dev',
        status: 'implemented',
        evidence: []
      }
    ]
  });
  await writeFile(dir, `.aioson/context/features/${SLUG}/implementation-ledger.md`, ledgerMarkdown(bad));
  const result = await run(dir, { 'check-ledger': true });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'invalid_machine_ledger');
  assert.ok(result.errors.some((error) => error.field === 'claims[0].id'));
});

test('schema helpers validate ledger fixtures and reject invalid owner', async () => {
  const dir = await makeTmpDir();
  await writeFile(dir, `.aioson/context/prd-${SLUG}.md`, '# PRD\n');
  await writeFile(dir, 'src/cards.js', 'module.exports = {};\n');

  const valid = await readJsonFixture('valid-ledger.json');
  const invalidOwner = await readJsonFixture('invalid-ledger-owner.json');

  assert.deepEqual(validateImplementationLedger(valid, { rootDir: dir, slug: SLUG }), []);
  const errors = validateImplementationLedger(invalidOwner, { rootDir: dir, slug: SLUG });
  assert.ok(errors.some((error) => error.field === 'claims[0].owner' && error.reason === 'invalid'));
});

test('schema helpers validate report fixtures and reject invalid verdict', async () => {
  const valid = await readJsonFixture('valid-report.json');
  const invalidVerdict = await readJsonFixture('invalid-report-verdict.json');

  assert.deepEqual(validateVerificationReport(valid, { slug: SLUG, requestedPolicy: 'strict' }), []);
  const errors = validateVerificationReport(invalidVerdict, { slug: SLUG, requestedPolicy: 'strict' });
  assert.ok(errors.some((error) => error.field === 'verdict' && error.reason === 'invalid'));
});

test('redaction preserves skill paths while masking secret-like values', () => {
  const counter = createCounter();
  const input = [
    'template/.aioson/skills/process/prototype-forge/SKILL.md',
    'OPENAI_API_KEY=sk-1234567890abcdefghijklmnopqrst',
    'github_pat_1234567890abcdefghijklmnopqrst'
  ].join('\n');

  const output = redactText(input, counter);

  assert.match(output, /template\/\.aioson\/skills\/process\/prototype-forge\/SKILL\.md/);
  assert.match(output, /\[REDACTED_SECRET\]/);
  assert.doesNotMatch(output, /sk-1234567890abcdefghijklmnopqrst/);
  assert.doesNotMatch(output, /github_pat_1234567890abcdefghijklmnopqrst/);
  assert.equal(counter.secret_assignments, 1);
  assert.equal(counter.common_tokens, 1);
});

test('build-prompt includes bounded evidence and excludes unrelated feature dossiers', async () => {
  const dir = await makeTmpDir();
  initGit(dir);
  await writeFile(dir, `.aioson/context/prd-${SLUG}.md`, '# PRD\n');
  await writeFile(dir, 'package.json', '{"scripts":{"test":"node --test"}}\n');
  await writeFile(dir, 'src/cards.js', 'module.exports = {};\n');
  await writeFile(dir, `.aioson/context/features/${SLUG}/implementation-ledger.md`, ledgerMarkdown());
  await writeFile(dir, '.aioson/context/features/other-feature/dossier.md', '# Other\n');

  const result = await run(dir, { 'build-prompt': true, policy: 'strict' });
  assert.equal(result.ok, true);
  assert.equal(result.mode, 'build-prompt');
  const prompt = await readFile(dir, result.prompt_path);
  assert.match(prompt, /Machine Report/);
  assert.match(prompt, /Add card persists/);
  assert.match(prompt, /git/i);
  assert.ok(result.verification_commands.some((command) => (
    command.command === 'npm test' &&
    command.required === true &&
    command.source.includes('ledger')
  )));
  assert.ok(result.verification_commands.some((command) => (
    command.command === `aioson prototype:check . --feature=${SLUG} --strict` &&
    command.source === 'prototype_contract'
  )));
  assert.doesNotMatch(prompt, /other-feature\/dossier/);
});

test('build-prompt hardens prompt package with redaction, budget, dirty state, and richer artifacts', async () => {
  const dir = await makeTmpDir();
  initGit(dir);
  await writeFile(dir, 'package.json', '{"scripts":{"test":"node --test"}}\n');
  await writeFile(dir, 'src/cards.js', 'module.exports = {};\n');
  await writeFile(dir, `.aioson/context/prd-${SLUG}.md`, '# PRD\n');
  await writeFile(dir, `.aioson/context/requirements-${SLUG}.md`, '# Requirements\n');
  await writeFile(dir, `.aioson/context/spec-${SLUG}.md`, '# Spec\n');
  await writeFile(dir, `.aioson/context/implementation-plan-${SLUG}.md`, '# Plan\n');
  await writeFile(dir, `.aioson/context/simple-plans/${SLUG}.md`, '# Simple Plan\n');
  await writeFile(dir, `.aioson/context/scope-check-${SLUG}.md`, [
    '# Scope Check',
    'OPENAI_API_KEY=sk-1234567890abcdefghijklmnopqrst',
    'Verdict: patched'
  ].join('\n'));
  await writeFile(dir, `.aioson/context/qa-report-${SLUG}.md`, '# QA Report\nPASS\n');
  await writeFile(dir, `.aioson/context/security-findings-${SLUG}.json`, '{"findings":[]}\n');
  await writeFile(dir, `.aioson/plans/${SLUG}/harness-contract.json`, '{"criteria":[]}\n');
  await writeFile(dir, `.aioson/briefings/${SLUG}/prototype.html`, '<button>Add card</button>\n');
  await writeFile(dir, `.aioson/context/features/${SLUG}/implementation-ledger.md`, ledgerMarkdown());
  await writeFile(dir, 'src/dirty.js', 'module.exports = 1;\n');

  const result = await run(dir, { 'build-prompt': true, policy: 'strict' });
  assert.equal(result.ok, true);
  assert.equal(result.prompt_budget.over_budget, false);
  assert.ok(result.prompt_chars <= result.prompt_budget.max_chars);
  assert.ok(result.redactions.total > 0);
  assert.ok(result.command_plan.some((command) => command.command === 'npm test' && command.required === true));

  const artifactTypes = new Set(result.source_artifacts.map((artifact) => artifact.type));
  for (const type of ['scope_check', 'qa_report', 'security_findings', 'simple_plan', 'harness', 'prototype']) {
    assert.equal(artifactTypes.has(type), true, `missing artifact type: ${type}`);
  }

  const prompt = await readFile(dir, result.prompt_path);
  assert.match(prompt, /PASS Criteria/);
  assert.match(prompt, /Owner Routing/);
  assert.match(prompt, /Required Verification Command Plan/);
  assert.match(prompt, /dirty_worktree/);
  assert.match(prompt, /\[REDACTED_SECRET\]/);
  assert.doesNotMatch(prompt, /sk-1234567890abcdefghijklmnopqrst/);
});

test('build-prompt keeps large ledgers within the prompt budget', async () => {
  const dir = await makeTmpDir();
  initGit(dir);
  await writeFile(dir, 'package.json', '{"scripts":{"test":"node --test"}}\n');
  await writeFile(dir, 'src/cards.js', 'module.exports = {};\n');
  await writeFile(dir, `.aioson/context/prd-${SLUG}.md`, '# PRD\n');

  const claims = Array.from({ length: 90 }, (_, index) => ({
    id: `CLAIM-${String(index + 1).padStart(3, '0')}`,
    kind: index % 5 === 0 ? 'scope_constraint' : 'required_behavior',
    summary: `Large claim ${index + 1}: the implementation must preserve all planned behavior, routing, evidence, and workflow ownership without relying on prose-only self-certification.`,
    owner: index % 7 === 0 ? 'qa' : 'dev',
    status: 'implemented',
    evidence: [
      { type: 'file', path: 'src/cards.js', lines: '1-20' }
    ]
  }));
  const verificationCommands = Array.from({ length: 35 }, (_, index) => ({
    command: `node --test tests/generated-${index + 1}.test.js --test-name-pattern="long verification command ${index + 1}"`,
    required: true,
    last_status: 'passed'
  }));

  await writeFile(dir, `.aioson/context/features/${SLUG}/implementation-ledger.md`, ledgerMarkdown(validMachineLedger({
    source_artifacts: Array.from({ length: 45 }, (_, index) => ({
      type: 'source_plan',
      path: `.aioson/context/source-${index + 1}.md`,
      role: 'budget_fixture'
    })),
    claims,
    known_gaps: Array.from({ length: 16 }, (_, index) => ({
      id: `GAP-${index + 1}`,
      gap: 'Known non-blocking gap with enough prose to pressure the prompt budget and force minimal fallback.',
      owner: 'dev',
      blocks: false
    })),
    verification_commands: verificationCommands
  })));

  const result = await run(dir, { 'build-prompt': true, policy: 'strict' });

  assert.equal(result.ok, true);
  assert.equal(result.prompt_budget.over_budget, false);
  assert.ok(result.prompt_chars <= result.prompt_budget.max_chars);
  assert.match(result.prompt_budget.artifact_summary_mode, /^minimal_/);
});

test('run-tool rejects unsupported tool and unsafe model before ledger work', async () => {
  const dir = await makeTmpDir();

  const unsupported = await run(dir, { tool: 'gemini', policy: 'strict' });
  assert.equal(unsupported.ok, false);
  assert.equal(unsupported.reason, 'unsupported_tool');
  assert.equal(unsupported.verdict, 'INCONCLUSIVE');
  assert.ok(unsupported.supported_tools.includes('opencode'));
  assert.equal(unsupported.supported_tools.includes('gemini'), false);

  const invalidModel = await run(dir, { tool: 'opencode', model: 'bad model;rm', policy: 'strict' });
  assert.equal(invalidModel.ok, false);
  assert.equal(invalidModel.reason, 'invalid_model');
  assert.equal(invalidModel.tool, 'opencode');
});

test('run-tool executes opencode adapter, writes raw/latest reports, and sanitizes model path segments', async () => {
  const dir = await makeTmpDir();
  await setupRunnerProject(dir);
  let runnerCommand = null;
  const spawnImpl = fakeSpawn(({ command, args, child }) => {
    if (args.includes('--version')) {
      closeFakeChild(child, { stdout: 'opencode 1.0.0\n' });
      return;
    }
    runnerCommand = { command, args };
    closeFakeChild(child, { stdout: reportMarkdown(machineReport()) });
  });

  const result = await run(
    dir,
    { tool: 'opencode', model: 'provider/model', policy: 'strict' },
    { spawnImpl }
  );

  assert.equal(result.ok, true);
  assert.equal(result.mode, 'run-tool');
  assert.equal(result.tool, 'opencode');
  assert.equal(result.model, 'provider/model');
  assert.equal(result.verdict, 'PASS');
  assert.equal(result.report_path, `.aioson/context/features/${SLUG}/verification-report.md`);
  assert.match(result.raw_report_path, /opencode-provider-model-raw\.md$/);
  assert.doesNotMatch(result.raw_report_path, /provider\/model/);
  assert.ok(result.report_json_path.endsWith('opencode-provider-model-report.json'));
  assert.equal(result.runner.destructive_commands_allowed, false);
  assert.equal(runnerCommand.command, 'opencode');
  assert.ok(runnerCommand.args.includes('--pure'));
  assert.equal(runnerCommand.args.includes('--dangerously-skip-permissions'), false);

  const latest = await readFile(dir, result.report_path);
  assert.match(latest, /Machine Report/);
  const raw = await readFile(dir, result.raw_report_path);
  assert.match(raw, /All required claims confirm/);
});

test('run-tool turns malformed auditor output into durable INCONCLUSIVE report', async () => {
  const dir = await makeTmpDir();
  await setupRunnerProject(dir);
  const spawnImpl = fakeSpawn(({ args, child }) => {
    if (args.includes('--version')) {
      closeFakeChild(child, { stdout: 'opencode 1.0.0\n' });
      return;
    }
    closeFakeChild(child, { stdout: 'not a verification report' });
  });

  const result = await run(dir, { tool: 'opencode', policy: 'strict' }, { spawnImpl });

  assert.equal(result.ok, false);
  assert.equal(result.reason, 'invalid_runner_report');
  assert.equal(result.verdict, 'INCONCLUSIVE');
  assert.equal(result.recommended_route, 'qa');
  assert.equal(result.parse_error.reason, 'missing_report_sections');
  assert.match(result.raw_report_path, /opencode-configured-default-raw\.md$/);
  assert.match(result.run_report_path, /opencode-configured-default-system-report\.md$/);

  const latest = await readFile(dir, result.report_path);
  assert.match(latest, /INCONCLUSIVE/);
  assert.match(latest, /Machine Report/);
  assert.match(await readFile(dir, result.raw_report_path), /not a verification report/);
});

test('run-tool failed runner keeps stderr out of latest consolidated report', async () => {
  const dir = await makeTmpDir();
  await setupRunnerProject(dir);
  const spawnImpl = fakeSpawn(({ args, child }) => {
    if (args.includes('--version')) {
      closeFakeChild(child, { stdout: 'opencode 1.0.0\n' });
      return;
    }
    closeFakeChild(child, {
      stderr: 'SECRET-STDERR-SHOULD-NOT-LEAK',
      code: 1
    });
  });

  const result = await run(dir, { tool: 'opencode', policy: 'strict' }, { spawnImpl });

  assert.equal(result.ok, false);
  assert.equal(result.reason, 'runner_failed');
  assert.equal(result.verdict, 'INCONCLUSIVE');
  assert.match(result.stderr_path, /opencode-configured-default-stderr\.txt$/);

  const latest = await readFile(dir, result.report_path);
  assert.match(latest, /Runner stderr was stored separately/);
  assert.doesNotMatch(latest, /SECRET-STDERR-SHOULD-NOT-LEAK/);
  const stderr = await readFile(dir, result.stderr_path);
  assert.match(stderr, /SECRET-STDERR-SHOULD-NOT-LEAK/);
});

test('run-tool timeout returns INCONCLUSIVE and keeps runner output bounded', async () => {
  const dir = await makeTmpDir();
  await setupRunnerProject(dir);
  const spawnImpl = fakeSpawn(({ args, child }) => {
    if (args.includes('--version')) {
      closeFakeChild(child, { stdout: 'opencode 1.0.0\n' });
    }
  });

  const result = await run(
    dir,
    { tool: 'opencode', policy: 'strict', 'timeout-ms': 100, 'max-output-bytes': 1024 },
    { spawnImpl }
  );

  assert.equal(result.ok, false);
  assert.equal(result.reason, 'runner_timeout');
  assert.equal(result.verdict, 'INCONCLUSIVE');
  assert.equal(result.runner.status, 'timeout');
  assert.equal(result.runner.timeout_ms, 100);
  assert.equal(result.runner.max_output_bytes, 1024);
  assert.equal(result.runner.destructive_commands_allowed, false);
  assert.match(await readFile(dir, result.report_path), /runner_timeout/);
});

test('run-tool output limit returns INCONCLUSIVE with truncated raw output', async () => {
  const dir = await makeTmpDir();
  await setupRunnerProject(dir);
  const spawnImpl = fakeSpawn(({ args, child }) => {
    if (args.includes('--version')) {
      closeFakeChild(child, { stdout: 'opencode 1.0.0\n' });
      return;
    }
    child.stdout.write('x'.repeat(2048));
  });

  const result = await run(
    dir,
    { tool: 'opencode', policy: 'strict', 'max-output-bytes': 1024 },
    { spawnImpl }
  );

  assert.equal(result.ok, false);
  assert.equal(result.reason, 'runner_output_limit');
  assert.equal(result.verdict, 'INCONCLUSIVE');
  assert.equal(result.runner.status, 'output_limit');
  assert.equal(result.runner.output_truncated, true);
  assert.ok((await readFile(dir, result.raw_report_path)).length <= 1024);
});

test('check-report rejects outside-root path and invalid report JSON', async () => {
  const dir = await makeTmpDir();
  const outside = path.join(os.tmpdir(), `aioson-outside-${Date.now()}.md`);
  await fs.writeFile(outside, 'outside', 'utf8');
  const outsideResult = await run(dir, { 'check-report': outside, policy: 'strict' });
  assert.equal(outsideResult.ok, false);
  assert.equal(outsideResult.reason, 'path_outside_root');
  assert.equal(outsideResult.verdict, 'INCONCLUSIVE');

  await writeFile(dir, 'bad-report.md', `# Verification Report - ${SLUG}

## Verdict
PASS

## Commands Run
none

## Findings
none

## Before And Now
none

## Residual Risk
none

## Recommended Route
qa

## Machine Report

\`\`\`json
{ nope
\`\`\`
`);
  const invalidJson = await run(dir, { 'check-report': 'bad-report.md', policy: 'strict' });
  assert.equal(invalidJson.ok, false);
  assert.equal(invalidJson.reason, 'invalid_machine_report_json');
});

test('check-report rejects prose and machine verdict conflicts', async () => {
  const dir = await makeTmpDir();
  await writeFile(dir, 'report.md', reportMarkdown(machineReport({ verdict: 'PASS' }), 'NEEDS_DEV_FIX'));
  const result = await run(dir, { 'check-report': 'report.md', policy: 'strict' });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'report_conflict');
  assert.equal(result.verdict, 'INCONCLUSIVE');
});

test('check-report does not flag a conflict when prose negates one verdict but names the machine verdict', async () => {
  const dir = await makeTmpDir();
  await writeFile(dir, 'report.md', reportMarkdown(machineReport({
    verdict: 'NEEDS_DEV_FIX',
    findings: [
      {
        id: 'FIND-001',
        claim_id: 'CLAIM-001',
        kind: 'required_behavior',
        status: 'DOES_NOT_CONFIRM',
        severity: 'blocking',
        owner: 'dev',
        file: 'src/cards.js',
        line: 1,
        evidence: 'No re-render call.',
        recommended_route: 'dev'
      }
    ],
    recommended_route: 'dev',
    blocking_findings_count: 1
  }), 'This is not a PASS — the verdict is NEEDS_DEV_FIX.'));
  const result = await run(dir, { 'check-report': 'report.md', policy: 'strict' });
  assert.notEqual(result.reason, 'report_conflict');
  assert.equal(result.verdict, 'NEEDS_DEV_FIX');
  assert.equal(result.recommended_route, 'dev');
});

test('strict policy routes required behavior miss to dev', async () => {
  const dir = await makeTmpDir();
  await writeFile(dir, 'report.md', reportMarkdown(machineReport({
    verdict: 'NEEDS_DEV_FIX',
    findings: [
      {
        id: 'FIND-001',
        claim_id: 'CLAIM-001',
        kind: 'required_behavior',
        status: 'DOES_NOT_CONFIRM',
        severity: 'blocking',
        owner: 'dev',
        file: 'src/cards.js',
        line: 1,
        evidence: 'No re-render call.',
        recommended_route: 'dev'
      }
    ],
    recommended_route: 'dev',
    blocking_findings_count: 1
  })));
  const result = await run(dir, { 'check-report': 'report.md', policy: 'strict' });
  assert.equal(result.ok, false);
  assert.equal(result.verdict, 'NEEDS_DEV_FIX');
  assert.equal(result.recommended_route, 'dev');
});

test('check-report emits safe runtime telemetry without report evidence', async () => {
  const dir = await makeTmpDir();
  await writeFile(dir, 'report.md', reportMarkdown(machineReport({
    summary: 'Do not put this report summary in telemetry.',
    commands_run: [
      { command: 'npm test', status: 'passed', evidence: 'SECRET-EVIDENCE-SHOULD-NOT-LEAK' }
    ]
  })));

  const result = await run(dir, { 'check-report': 'report.md', policy: 'strict' });
  assert.equal(result.ok, true);
  assert.equal(result.telemetry.emitted, true);

  const rows = await readVerificationEvents(dir);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].event_type, 'implementation_verification_completed');
  assert.equal(rows[0].source, 'verify_implementation');
  assert.equal(rows[0].phase, 'implementation_verification');
  assert.equal(rows[0].status, 'completed');
  assert.equal(rows[0].verdict, 'PASS');

  const payload = JSON.parse(rows[0].payload_json);
  assert.equal(payload.feature_slug, SLUG);
  assert.equal(payload.mode, 'check-report');
  assert.equal(payload.policy, 'strict');
  assert.equal(payload.report_path, 'report.md');
  assert.equal(payload.raw_output_stored, false);
  assert.equal(payload.stderr_stored, false);
  assert.equal(Object.prototype.hasOwnProperty.call(payload, 'report'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(payload, 'raw_report_path'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(payload, 'stderr_path'), false);
  assert.doesNotMatch(JSON.stringify(payload), /SECRET-EVIDENCE-SHOULD-NOT-LEAK/);
  assert.doesNotMatch(JSON.stringify(payload), /Do not put this report summary/);
});

test('run-tool telemetry stores runner summary but not raw auditor output paths or text', async () => {
  const dir = await makeTmpDir();
  await setupRunnerProject(dir);
  const spawnImpl = fakeSpawn(({ args, child }) => {
    if (args.includes('--version')) {
      closeFakeChild(child, { stdout: 'opencode 1.0.0\n' });
      return;
    }
    closeFakeChild(child, { stdout: `${reportMarkdown(machineReport())}\nRAW-OUTPUT-SECRET` });
  });

  const result = await run(dir, { tool: 'opencode', policy: 'strict' }, { spawnImpl });
  assert.equal(result.ok, true);
  assert.equal(result.telemetry.emitted, true);

  const rows = await readVerificationEvents(dir);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].tool_name, 'opencode');
  assert.equal(rows[0].verdict, 'PASS');

  const payload = JSON.parse(rows[0].payload_json);
  assert.equal(payload.mode, 'run-tool');
  assert.equal(payload.tool, 'opencode');
  assert.equal(payload.raw_output_stored, true);
  assert.equal(payload.stderr_stored, false);
  assert.equal(payload.runner.status, 'completed');
  assert.equal(Object.prototype.hasOwnProperty.call(payload.runner, 'command'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(payload, 'raw_report_path'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(payload, 'stderr_path'), false);
  assert.doesNotMatch(JSON.stringify(payload), /RAW-OUTPUT-SECRET/);
  assert.doesNotMatch(JSON.stringify(payload), /All required claims confirm/);
});

test('policy routes scope drift to product/sheldon and stale test coverage to qa', async () => {
  const dir = await makeTmpDir();
  await writeFile(dir, 'scope-report.md', reportMarkdown(machineReport({
    verdict: 'NEEDS_SCOPE_DECISION',
    findings: [
      {
        id: 'FIND-001',
        kind: 'scope_constraint',
        status: 'DOES_NOT_CONFIRM',
        severity: 'blocking',
        owner: 'product',
        evidence: 'Behavior changed approved product scope.',
        recommended_route: 'product'
      }
    ],
    recommended_route: 'product',
    blocking_findings_count: 1
  })));
  const scope = await run(dir, { 'check-report': 'scope-report.md', policy: 'strict' });
  assert.equal(scope.verdict, 'NEEDS_SCOPE_DECISION');
  assert.equal(scope.recommended_route, 'product');

  await writeFile(dir, 'sheldon-report.md', reportMarkdown(machineReport({
    verdict: 'NEEDS_SCOPE_DECISION',
    findings: [
      {
        id: 'FIND-SHELDON',
        kind: 'scope_constraint',
        status: 'DOES_NOT_CONFIRM',
        severity: 'blocking',
        owner: 'sheldon',
        evidence: 'Approved scope needs Sheldon enrichment decision.'
      }
    ],
    blocking_findings_count: 1
  })));
  const sheldon = await run(dir, { 'check-report': 'sheldon-report.md', policy: 'strict' });
  assert.equal(sheldon.verdict, 'NEEDS_SCOPE_DECISION');
  assert.equal(sheldon.recommended_route, 'sheldon');

  await writeFile(dir, 'qa-report.md', reportMarkdown(machineReport({
    verdict: 'NEEDS_QA_RECHECK',
    findings: [
      {
        id: 'FIND-002',
        kind: 'test_coverage',
        status: 'NOT_VERIFIED',
        severity: 'blocking',
        owner: 'qa',
        evidence: 'Tests were not rerun after fix.',
        recommended_route: 'qa'
      }
    ],
    recommended_route: 'qa',
    blocking_findings_count: 1
  })));
  const qa = await run(dir, { 'check-report': 'qa-report.md', policy: 'strict' });
  assert.equal(qa.verdict, 'NEEDS_QA_RECHECK');
  assert.equal(qa.recommended_route, 'qa');
});
