'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { runSquadEval } = require('../src/commands/squad-eval');
const { runSquadValidate } = require('../src/commands/squad-validate');

const quiet = { log() {}, error() {} };

async function writeWorker(squadDir, slug, script) {
  const workerDir = path.join(squadDir, 'workers', slug);
  await fs.mkdir(workerDir, { recursive: true });
  await fs.writeFile(path.join(workerDir, 'worker.json'), JSON.stringify({
    slug,
    type: 'manual',
    inputs: {},
    outputs: {},
    timeout_ms: 5000,
    retry: { attempts: 1 }
  }));
  await fs.writeFile(path.join(workerDir, 'run.js'), script);
}

async function createFixture(overrides = {}) {
  const projectDir = await fs.mkdtemp(path.join(os.tmpdir(), 'aioson-squad-eval-'));
  const slug = 'premium-fixture';
  const squadDir = path.join(projectDir, '.aioson', 'squads', slug);
  await fs.mkdir(path.join(squadDir, 'agents'), { recursive: true });
  await fs.mkdir(path.join(projectDir, 'output', slug), { recursive: true });
  await fs.writeFile(path.join(squadDir, 'agents', 'agents.md'), '# Premium Fixture\n');
  await fs.writeFile(path.join(squadDir, 'agents', 'orquestrador.md'), [
    '# Agent @orquestrador',
    'Own final integration and hand off evidence checks to reviewer.',
    'Never accept unsupported claims.'
  ].join('\n'));
  await fs.writeFile(path.join(squadDir, 'agents', 'reviewer.md'), [
    '# Agent @reviewer',
    'Independently verify every source-grounded claim.',
    'Veto unsupported claims.'
  ].join('\n'));

  const manifest = {
    schemaVersion: '1.0.0',
    packageVersion: '1.0.0',
    slug,
    name: 'Premium Fixture',
    mode: 'research',
    mission: 'Produce current source-grounded decisions',
    goal: 'Prove deterministic premium evaluation',
    researchPolicy: {
      policy: 'closed-world',
      reason: 'Deterministic local evaluation fixture'
    },
    composition: {
      persistent_core: ['orquestrador', 'reviewer'],
      ephemeral_specialists: []
    },
    executors: [
      {
        slug: 'orquestrador',
        role: 'Integration owner',
        type: 'agent',
        persistent: true,
        contribution: 'Own final integration',
        decisionRights: ['final integration'],
        file: `.aioson/squads/${slug}/agents/orquestrador.md`,
        skills: []
      },
      {
        slug: 'reviewer',
        role: 'Independent reviewer',
        type: 'reviewer',
        persistent: true,
        contribution: 'Veto unsupported claims',
        decisionRights: ['quality veto'],
        file: `.aioson/squads/${slug}/agents/reviewer.md`,
        skills: []
      }
    ],
    workflows: [{
      slug: 'deliver',
      title: 'Deliver grounded recommendation',
      phases: [
        {
          id: 'produce',
          title: 'Produce and review',
          executor: 'orquestrador',
          review: { reviewer: 'reviewer', onReject: 'produce' },
          vetoConditions: [{
            condition: 'unsupported claim',
            action: 'reject'
          }]
        }
      ]
    }],
    evaluation: {
      contractVersion: '1.0.0',
      maxAgeDays: 30,
      criteria: [
        {
          id: 'grounding-1',
          kind: 'grounding',
          statement: 'The owner requires grounded claims',
          source: 'manifest.goal',
          executor: 'orquestrador',
          expectedTerms: ['unsupported claims']
        },
        {
          id: 'review-1',
          kind: 'handoff',
          statement: 'The reviewer can independently veto',
          source: 'manifest.workflows[0]',
          executor: 'reviewer',
          expectedTerms: ['veto unsupported claims']
        }
      ],
      heldOutCases: [{
        id: 'held-out-1',
        task: 'Evaluate an unseen grounded recommendation',
        worker: 'candidate-eval',
        dimensions: {
          grounding: { threshold: 0.8, critical: true },
          completeness: { threshold: 0.8 }
        }
      }]
    },
    ...overrides
  };
  await fs.writeFile(
    path.join(squadDir, 'squad.manifest.json'),
    `${JSON.stringify(manifest, null, 2)}\n`
  );
  await writeWorker(
    squadDir,
    'candidate-eval',
    "'use strict';\nprocess.stdout.write(JSON.stringify({ dimensions: { grounding: 0.95, completeness: 0.9 } }));\n"
  );
  return { projectDir, slug, squadDir, manifest };
}

test('AC-premium-15 eval persists a schema-valid reproducible PASS report', async () => {
  const fixture = await createFixture();
  const result = await runSquadEval({
    args: [fixture.projectDir],
    options: { squad: fixture.slug, json: true },
    logger: quiet
  });
  assert.equal(result.ok, true);
  assert.equal(result.verdict, 'PASS');
  const report = JSON.parse(await fs.readFile(path.join(fixture.projectDir, result.latest), 'utf8'));
  assert.equal(report.precheck.status, 'pass');
  assert.equal(report.held_out.status, 'pass');
  assert.equal(report.source_rubric.status, 'pass');
  assert.equal(report.genome_comparison.status, 'not-applicable');
  assert.match(report.inputs.manifest_hash, /^[a-f0-9]{64}$/);

  const strict = await runSquadValidate({
    args: [fixture.projectDir],
    options: { squad: fixture.slug, strict: true, json: true },
    logger: quiet
  });
  assert.equal(strict.valid, true, strict.errors.join('\n'));
});

test('AC-premium-11 A/B regression remains a critical dimension failure', async () => {
  const fixture = await createFixture({
    genomeBindings: {
      squad: [{
        slug: 'evidence-genome',
        status: 'compiled',
        compilationId: 'a'.repeat(64),
        sourceHash: 'b'.repeat(64)
      }],
      executors: {}
    },
    evaluation: {
      contractVersion: '1.0.0',
      criteria: [{
        id: 'grounding-1',
        kind: 'grounding',
        statement: 'Require grounded claims',
        source: 'manifest.goal',
        executor: 'orquestrador',
        expectedTerms: ['unsupported claims']
      }],
      heldOutCases: [{
        id: 'regression',
        task: 'Compare the compiled genome',
        baselineRun: { worker: 'ab-regression' },
        candidateRun: { worker: 'ab-regression' },
        criticalDimensions: ['grounding'],
        dimensions: {
          grounding: { threshold: 0.8, critical: true },
          style: { threshold: 0.8 }
        }
      }]
    }
  });
  await writeWorker(fixture.squadDir, 'ab-regression', [
    "'use strict';",
    'const input = JSON.parse(process.argv[2]);',
    'const dimensions = input._aioson_eval.genome_enabled',
    '  ? { grounding: 0.7, style: 0.95 }',
    '  : { grounding: 0.9, style: 0.7 };',
    'process.stdout.write(JSON.stringify({ dimensions }));'
  ].join('\n'));
  const result = await runSquadEval({
    args: [fixture.projectDir],
    options: { squad: fixture.slug, json: true },
    logger: quiet
  });
  assert.equal(result.ok, false);
  assert.equal(result.verdict, 'FAIL');
  assert.equal(result.genomeComparison.status, 'fail');
  assert.equal(result.dimensions.grounding.critical_failures, 1);
  assert.equal(result.dimensions.style.pass > 0, true);
});

test('AC-premium-11 held-out A/B can execute real baseline and compiled-candidate workers', async () => {
  const fixture = await createFixture({
    genomeBindings: {
      squad: [{
        slug: 'evidence-genome',
        status: 'compiled',
        compilationId: 'c'.repeat(64),
        sourceHash: 'd'.repeat(64)
      }],
      executors: {}
    },
    evaluation: {
      contractVersion: '1.0.0',
      criteria: [{
        id: 'grounding-1',
        kind: 'grounding',
        statement: 'Require grounded claims',
        source: 'manifest.goal',
        executor: 'orquestrador',
        expectedTerms: ['unsupported claims']
      }],
      heldOutCases: [{
        id: 'executed-ab',
        task: 'Run the same unseen task without and with the compiled genome',
        baselineRun: { worker: 'controlled-ab' },
        candidateRun: { worker: 'controlled-ab' },
        criticalDimensions: ['grounding']
      }]
    }
  });
  await writeWorker(fixture.squadDir, 'controlled-ab', [
    "'use strict';",
    'const input = JSON.parse(process.argv[2]);',
    'const dimensions = input._aioson_eval.genome_enabled',
    '  ? { grounding: 0.93, completeness: 0.9 }',
    '  : { grounding: 0.6, completeness: 0.82 };',
    'process.stdout.write(JSON.stringify({ dimensions, control: input._aioson_eval }));'
  ].join('\n'));

  const result = await runSquadEval({
    args: [fixture.projectDir],
    options: { squad: fixture.slug, json: true },
    logger: quiet
  });
  assert.equal(result.ok, true);
  assert.equal(result.genomeComparison.status, 'pass');
  const report = JSON.parse(await fs.readFile(path.join(fixture.projectDir, result.latest), 'utf8'));
  const heldOut = report.held_out.cases[0];
  assert.equal(heldOut.executions.length, 2);
  assert.equal(heldOut.executions.every((execution) => execution.ok), true);
  assert.equal(heldOut.ab_controlled, true);
  assert.equal(heldOut.executions[0].worker, heldOut.executions[1].worker);
  assert.equal(heldOut.executions[0].genome_enabled, false);
  assert.equal(heldOut.executions[1].genome_enabled, true);
  assert.equal(heldOut.dimensions.find((dimension) => dimension.name === 'grounding').delta, 0.33);
});

test('AC-premium-16 manifest-authored static scores cannot self-certify held-out PASS', async () => {
  const fixture = await createFixture({
    evaluation: {
      contractVersion: '1.0.0',
      criteria: [{
        id: 'grounding-1',
        kind: 'grounding',
        statement: 'Require grounded claims',
        source: 'manifest.goal',
        executor: 'orquestrador',
        expectedTerms: ['unsupported claims']
      }],
      heldOutCases: [{
        id: 'static-only',
        task: 'Attempt to pass without executing a worker',
        dimensions: {
          grounding: { baseline: 0.1, candidate: 1, threshold: 0.8, critical: true }
        }
      }]
    }
  });
  const result = await runSquadEval({
    args: [fixture.projectDir],
    options: { squad: fixture.slug, json: true },
    logger: quiet
  });
  assert.equal(result.ok, false);
  assert.equal(result.verdict, 'UNVERIFIED');
});

test('AC-premium-11 genome A/B rejects different worker inputs as an uncontrolled comparison', async () => {
  const fixture = await createFixture({
    genomeBindings: {
      squad: [{
        slug: 'evidence-genome',
        status: 'compiled',
        compilationId: 'e'.repeat(64),
        sourceHash: 'f'.repeat(64)
      }],
      executors: {}
    },
    evaluation: {
      contractVersion: '1.0.0',
      criteria: [{
        id: 'grounding-1',
        kind: 'grounding',
        statement: 'Require grounded claims',
        source: 'manifest.goal',
        executor: 'orquestrador',
        expectedTerms: ['unsupported claims']
      }],
      heldOutCases: [{
        id: 'uncontrolled-ab',
        task: 'Keep every A/B input equal',
        baselineRun: { worker: 'uncontrolled-ab', input: { prompt: 'short' } },
        candidateRun: { worker: 'uncontrolled-ab', input: { prompt: 'different' } }
      }]
    }
  });
  await writeWorker(
    fixture.squadDir,
    'uncontrolled-ab',
    "'use strict';\nprocess.stdout.write(JSON.stringify({ dimensions: { grounding: 0.9 } }));\n"
  );
  const result = await runSquadEval({
    args: [fixture.projectDir],
    options: { squad: fixture.slug, json: true },
    logger: quiet
  });
  assert.equal(result.ok, false);
  assert.equal(result.verdict, 'FAIL');
  assert.equal(result.genomeComparison.status, 'unverified');
  assert.equal(result.dimensions['genome-ab-control'].critical_failures, 1);
});

test('AC-premium-16 missing held-out proof is UNVERIFIED/FAIL and never passes', async () => {
  const fixture = await createFixture({
    evaluation: {
      contractVersion: '1.0.0',
      criteria: [{
        id: 'grounding-1',
        kind: 'grounding',
        statement: 'Require grounded claims',
        source: 'manifest.goal',
        executor: 'orquestrador',
        expectedTerms: ['unsupported claims']
      }],
      heldOutCases: []
    }
  });
  const result = await runSquadEval({
    args: [fixture.projectDir],
    options: { squad: fixture.slug, json: true },
    logger: quiet
  });
  assert.equal(result.ok, false);
  assert.notEqual(result.verdict, 'PASS');
});

function runCli(args, cwd) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [path.join(process.cwd(), 'bin', 'aioson.js'), ...args], { cwd });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += String(chunk); });
    child.stderr.on('data', (chunk) => { stderr += String(chunk); });
    child.on('close', (code) => resolve({ code, stdout, stderr }));
  });
}

test('AC-premium-15 squad:eval is an executable JSON CLI command', async () => {
  const fixture = await createFixture();
  const result = await runCli(
    ['squad:eval', fixture.projectDir, `--squad=${fixture.slug}`, '--json'],
    process.cwd()
  );
  assert.equal(result.code, 0, result.stderr || result.stdout);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.ok, true);
  assert.equal(payload.verdict, 'PASS');
});

test('AC-premium-20 eval and validation reject traversal slugs before filesystem resolution', async () => {
  const projectDir = await fs.mkdtemp(path.join(os.tmpdir(), 'aioson-squad-eval-slug-'));
  const evaluated = await runSquadEval({
    args: [projectDir],
    options: { squad: '../outside', json: true },
    logger: quiet
  });
  const validated = await runSquadValidate({
    args: [projectDir],
    options: { squad: '../outside', strict: true, json: true },
    logger: quiet
  });
  assert.equal(evaluated.error, 'invalid_slug');
  assert.equal(validated.valid, false);
  assert.ok(validated.errors.includes('Invalid squad slug'));
});
