'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const fsSync = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  runHarnessInit,
  runHarnessValidate,
  runHarnessApplyValidation,
  validateValidatorOutput,
  translateValidatorOutputToLastError
} = require('../src/commands/harness');

async function makeTmpDir() {
  return fs.mkdtemp(path.join(os.tmpdir(), 'aioson-harness-apply-test-'));
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

const mockT = (key, params) => {
  if (key === 'harness.init_success' && params && params.slug) return `Harness initialized for feature: ${params.slug}`;
  return key;
};

async function setupFeature(tmpDir, slug) {
  await runHarnessInit({
    args: [tmpDir],
    options: { slug },
    logger: makeLogger(),
    t: mockT
  });
  return path.join(tmpDir, '.aioson', 'plans', slug);
}

// ---------- validateValidatorOutput ----------

test('validateValidatorOutput accepts a valid output', () => {
  const valid = {
    phase: 1,
    validation_at: '2026-05-07T12:00:00Z',
    results: [{ id: 'C1', passed: true, reason: null }],
    overall_score: 1,
    ready_for_done_gate: true
  };
  assert.strictEqual(validateValidatorOutput(valid), null);
});

test('validateValidatorOutput rejects missing required fields', () => {
  assert.match(validateValidatorOutput({}), /phase must be a number/);
  assert.match(validateValidatorOutput({ phase: 1 }), /validation_at/);
  assert.match(
    validateValidatorOutput({ phase: 1, validation_at: '2026-05-07T12:00:00Z' }),
    /results must be an array/
  );
});

test('validateValidatorOutput rejects invalid overall_score', () => {
  const out = {
    phase: 1,
    validation_at: '2026-05-07T12:00:00Z',
    results: [],
    overall_score: 2,
    ready_for_done_gate: false
  };
  assert.match(validateValidatorOutput(out), /overall_score must be 0 or 1/);
});

test('validateValidatorOutput rejects malformed result entries', () => {
  const base = {
    phase: 1,
    validation_at: '2026-05-07T12:00:00Z',
    overall_score: 0,
    ready_for_done_gate: false
  };
  assert.match(
    validateValidatorOutput({ ...base, results: [{ id: 'C1' }] }),
    /results\[0\]\.passed must be boolean/
  );
  assert.match(
    validateValidatorOutput({ ...base, results: [{ id: 42, passed: true }] }),
    /results\[0\]\.id/
  );
});

// ---------- translateValidatorOutputToLastError ----------

test('translateValidatorOutputToLastError returns null when overall_score=1', () => {
  const out = {
    overall_score: 1,
    results: [{ id: 'C1', passed: true, reason: null }]
  };
  assert.strictEqual(translateValidatorOutputToLastError(out), null);
});

test('translateValidatorOutputToLastError formats first failure', () => {
  const out = {
    overall_score: 0,
    results: [
      { id: 'C1', passed: true, reason: null },
      { id: 'C2', passed: false, reason: 'Missing export in src/foo.js' },
      { id: 'C3', passed: false, reason: 'Lint error' }
    ]
  };
  assert.strictEqual(
    translateValidatorOutputToLastError(out),
    'C2: Missing export in src/foo.js'
  );
});

test('translateValidatorOutputToLastError handles failure with null reason', () => {
  const out = {
    overall_score: 0,
    results: [{ id: 'C1', passed: false, reason: null }]
  };
  assert.strictEqual(translateValidatorOutputToLastError(out), 'C1: no reason given');
});

test('translateValidatorOutputToLastError handles overall_score=0 with no failures listed', () => {
  const out = { overall_score: 0, results: [] };
  assert.match(translateValidatorOutputToLastError(out), /no failure detail/);
});

// ---------- runHarnessApplyValidation ----------

test('apply-validation: PASS with overall_score=1 records success and archives input', async () => {
  const tmpDir = await makeTmpDir();
  const slug = 'pass-feature';
  const planDir = await setupFeature(tmpDir, slug);

  const validatorOutput = {
    phase: 1,
    validation_at: '2026-05-07T12:00:00Z',
    results: [{ id: 'C1', passed: true, reason: null }],
    overall_score: 1,
    ready_for_done_gate: true
  };
  const inputPath = path.join(planDir, 'last-validator-output.json');
  await fs.writeFile(inputPath, JSON.stringify(validatorOutput), 'utf8');

  const logger = makeLogger();
  const result = await runHarnessApplyValidation({
    args: [tmpDir],
    options: { slug },
    logger,
    t: mockT
  });

  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.verdict, 'PASS');
  assert.strictEqual(result.ready_for_done_gate, true);

  const progress = JSON.parse(await fs.readFile(path.join(planDir, 'progress.json'), 'utf8'));
  assert.strictEqual(progress.ready_for_done_gate, true);
  assert.strictEqual(progress.consecutive_errors, 0);

  // Input is archived (moved out of last-validator-output.json)
  const inputStillExists = fsSync.existsSync(inputPath);
  assert.strictEqual(inputStillExists, false, 'input must be archived after PASS');
  const runs = await fs.readdir(path.join(planDir, 'validator-runs'));
  assert.strictEqual(runs.length, 1, 'archive must contain exactly 1 entry');
});

test('apply-validation: FAIL writes first failure reason as last_error and archives input', async () => {
  const tmpDir = await makeTmpDir();
  const slug = 'fail-feature';
  const planDir = await setupFeature(tmpDir, slug);

  const validatorOutput = {
    phase: 1,
    validation_at: '2026-05-07T12:00:00Z',
    results: [
      { id: 'C1', passed: true, reason: null },
      { id: 'C2', passed: false, reason: 'tests/foo.test.js failed assertion' },
      { id: 'C3', passed: false, reason: 'Lint clean assertion failed' }
    ],
    overall_score: 0,
    ready_for_done_gate: false
  };
  const inputPath = path.join(planDir, 'last-validator-output.json');
  await fs.writeFile(inputPath, JSON.stringify(validatorOutput), 'utf8');

  const result = await runHarnessApplyValidation({
    args: [tmpDir],
    options: { slug },
    logger: makeLogger(),
    t: mockT
  });

  assert.strictEqual(result.ok, false);
  assert.strictEqual(result.verdict, 'FAIL');
  assert.strictEqual(result.last_error, 'C2: tests/foo.test.js failed assertion');

  const progress = JSON.parse(await fs.readFile(path.join(planDir, 'progress.json'), 'utf8'));
  assert.strictEqual(progress.last_error, 'C2: tests/foo.test.js failed assertion');
  assert.strictEqual(progress.consecutive_errors, 1);
  assert.strictEqual(progress.ready_for_done_gate, false);
});

test('apply-validation: missing input file returns validator_output_not_found', async () => {
  const tmpDir = await makeTmpDir();
  const slug = 'missing-output-feature';
  await setupFeature(tmpDir, slug);

  const result = await runHarnessApplyValidation({
    args: [tmpDir],
    options: { slug },
    logger: makeLogger(),
    t: mockT
  });

  assert.strictEqual(result.ok, false);
  assert.strictEqual(result.error, 'validator_output_not_found');
});

test('apply-validation: malformed JSON returns invalid_json', async () => {
  const tmpDir = await makeTmpDir();
  const slug = 'bad-json-feature';
  const planDir = await setupFeature(tmpDir, slug);

  const inputPath = path.join(planDir, 'last-validator-output.json');
  await fs.writeFile(inputPath, '{ this is not json', 'utf8');

  const result = await runHarnessApplyValidation({
    args: [tmpDir],
    options: { slug },
    logger: makeLogger(),
    t: mockT
  });

  assert.strictEqual(result.ok, false);
  assert.strictEqual(result.error, 'invalid_json');
});

test('apply-validation: invalid schema returns invalid_schema with detail', async () => {
  const tmpDir = await makeTmpDir();
  const slug = 'bad-schema-feature';
  const planDir = await setupFeature(tmpDir, slug);

  const validatorOutput = { phase: 1, results: [] }; // missing required fields
  const inputPath = path.join(planDir, 'last-validator-output.json');
  await fs.writeFile(inputPath, JSON.stringify(validatorOutput), 'utf8');

  const result = await runHarnessApplyValidation({
    args: [tmpDir],
    options: { slug },
    logger: makeLogger(),
    t: mockT
  });

  assert.strictEqual(result.ok, false);
  assert.strictEqual(result.error, 'invalid_schema');
  assert.match(result.detail, /validation_at/);
});

test('apply-validation: --input override accepts JSON from arbitrary path', async () => {
  const tmpDir = await makeTmpDir();
  const slug = 'custom-input-feature';
  const planDir = await setupFeature(tmpDir, slug);

  const validatorOutput = {
    phase: 1,
    validation_at: '2026-05-07T12:00:00Z',
    results: [{ id: 'C1', passed: true, reason: null }],
    overall_score: 1,
    ready_for_done_gate: true
  };
  const customPath = path.join(tmpDir, 'ci-output', 'validator.json');
  await fs.mkdir(path.dirname(customPath), { recursive: true });
  await fs.writeFile(customPath, JSON.stringify(validatorOutput), 'utf8');

  const result = await runHarnessApplyValidation({
    args: [tmpDir],
    options: { slug, input: customPath, archive: false },
    logger: makeLogger(),
    t: mockT
  });

  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.verdict, 'PASS');
  // archive: false → file remains
  const stillExists = fsSync.existsSync(customPath);
  assert.strictEqual(stillExists, true);

  // Should NOT have archived under planDir/validator-runs/
  const runsDir = path.join(planDir, 'validator-runs');
  assert.strictEqual(fsSync.existsSync(runsDir), false);
});

// ---------- runHarnessValidate router ----------

test('harness:validate router: with no validator output, generates prompt headlessly', async () => {
  const tmpDir = await makeTmpDir();
  const slug = 'router-no-output-feature';
  const planDir = await setupFeature(tmpDir, slug);

  const logger = makeLogger();
  const result = await runHarnessValidate({
    args: [tmpDir],
    options: { slug },
    logger,
    t: mockT
  });

  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.status, 'awaiting_validation');
  assert.strictEqual(result.promptPath, path.join(planDir, 'validator-prompt.txt'));

  const promptExists = fsSync.existsSync(result.promptPath);
  assert.strictEqual(promptExists, true, 'prompt file must exist after validate');

  const promptContent = fsSync.readFileSync(result.promptPath, 'utf8');
  assert.match(promptContent, /validator/i, 'prompt content must reference @validator');

  // No progress mutation expected at this stage
  const progress = JSON.parse(await fs.readFile(path.join(planDir, 'progress.json'), 'utf8'));
  assert.strictEqual(progress.consecutive_errors, 0);
  assert.strictEqual(progress.iterations, 0);
});

// ---------- progress.status state machine (T2) ----------

test('harness:validate sets progress.status to waiting_validation when emitting prompt', async () => {
  const tmpDir = await makeTmpDir();
  const slug = 'status-set-feature';
  const planDir = await setupFeature(tmpDir, slug);

  const result = await runHarnessValidate({
    args: [tmpDir],
    options: { slug },
    logger: makeLogger(),
    t: mockT
  });

  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.status, 'awaiting_validation');

  const progress = JSON.parse(await fs.readFile(path.join(planDir, 'progress.json'), 'utf8'));
  assert.strictEqual(progress.status, 'waiting_validation');
});

test('harness:apply-validation resets waiting_validation to in_progress on PASS', async () => {
  const tmpDir = await makeTmpDir();
  const slug = 'status-clear-pass-feature';
  const planDir = await setupFeature(tmpDir, slug);

  // Simulate the validate step: status moves to waiting_validation
  await runHarnessValidate({
    args: [tmpDir],
    options: { slug },
    logger: makeLogger(),
    t: mockT
  });

  const validatorOutput = {
    phase: 1,
    validation_at: '2026-05-07T12:00:00Z',
    results: [{ id: 'C1', passed: true, reason: null }],
    overall_score: 1,
    ready_for_done_gate: true
  };
  await fs.writeFile(
    path.join(planDir, 'last-validator-output.json'),
    JSON.stringify(validatorOutput),
    'utf8'
  );

  await runHarnessApplyValidation({
    args: [tmpDir],
    options: { slug },
    logger: makeLogger(),
    t: mockT
  });

  const progress = JSON.parse(await fs.readFile(path.join(planDir, 'progress.json'), 'utf8'));
  assert.strictEqual(progress.status, 'in_progress', 'status must be reset after PASS');
});

test('harness:apply-validation resets waiting_validation to in_progress on FAIL (no circuit open)', async () => {
  const tmpDir = await makeTmpDir();
  const slug = 'status-clear-fail-feature';
  const planDir = await setupFeature(tmpDir, slug);

  await runHarnessValidate({
    args: [tmpDir],
    options: { slug },
    logger: makeLogger(),
    t: mockT
  });

  const validatorOutput = {
    phase: 1,
    validation_at: '2026-05-07T12:00:00Z',
    results: [{ id: 'C1', passed: false, reason: 'lint error' }],
    overall_score: 0,
    ready_for_done_gate: false
  };
  await fs.writeFile(
    path.join(planDir, 'last-validator-output.json'),
    JSON.stringify(validatorOutput),
    'utf8'
  );

  await runHarnessApplyValidation({
    args: [tmpDir],
    options: { slug },
    logger: makeLogger(),
    t: mockT
  });

  const progress = JSON.parse(await fs.readFile(path.join(planDir, 'progress.json'), 'utf8'));
  // After FAIL with no circuit open, status returns to in_progress so user can fix and re-run
  assert.strictEqual(progress.status, 'in_progress');
  assert.strictEqual(progress.last_error, 'C1: lint error');
});

test('harness:apply-validation preserves circuit_open status (does not overwrite)', async () => {
  const tmpDir = await makeTmpDir();
  const slug = 'circuit-open-feature';
  const planDir = await setupFeature(tmpDir, slug);

  // Force circuit-open precondition: error_streak_limit=1 contract + 0 prior errors
  const contractPath = path.join(planDir, 'harness-contract.json');
  const contract = JSON.parse(await fs.readFile(contractPath, 'utf8'));
  contract.governor.error_streak_limit = 1;
  await fs.writeFile(contractPath, JSON.stringify(contract), 'utf8');

  await runHarnessValidate({
    args: [tmpDir],
    options: { slug },
    logger: makeLogger(),
    t: mockT
  });

  const validatorOutput = {
    phase: 1,
    validation_at: '2026-05-07T12:00:00Z',
    results: [{ id: 'C1', passed: false, reason: 'first failure' }],
    overall_score: 0,
    ready_for_done_gate: false
  };
  await fs.writeFile(
    path.join(planDir, 'last-validator-output.json'),
    JSON.stringify(validatorOutput),
    'utf8'
  );

  await runHarnessApplyValidation({
    args: [tmpDir],
    options: { slug },
    logger: makeLogger(),
    t: mockT
  });

  const progress = JSON.parse(await fs.readFile(path.join(planDir, 'progress.json'), 'utf8'));
  // Circuit must be OPEN (error_streak_limit=1 reached on first error). Status must reflect that, NOT in_progress.
  assert.strictEqual(progress.circuit_state, 'OPEN');
  assert.strictEqual(progress.status, 'circuit_open', 'circuit_open must NOT be overwritten by waiting_validation reset');
});

test('harness:validate router: with validator output present, consumes it (PASS)', async () => {
  const tmpDir = await makeTmpDir();
  const slug = 'router-with-output-feature';
  const planDir = await setupFeature(tmpDir, slug);

  const validatorOutput = {
    phase: 1,
    validation_at: '2026-05-07T12:00:00Z',
    results: [{ id: 'C1', passed: true, reason: null }],
    overall_score: 1,
    ready_for_done_gate: true
  };
  const outputPath = path.join(planDir, 'last-validator-output.json');
  await fs.writeFile(outputPath, JSON.stringify(validatorOutput), 'utf8');

  const result = await runHarnessValidate({
    args: [tmpDir],
    options: { slug },
    logger: makeLogger(),
    t: mockT
  });

  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.verdict, 'PASS');
  assert.strictEqual(result.ready_for_done_gate, true);
});
