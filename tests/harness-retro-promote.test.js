'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const fsSync = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { runHarnessRetro } = require('../src/commands/harness-retro');
const { runHarnessRetroPromote } = require('../src/commands/harness-retro-promote');
const { openRuntimeDb } = require('../src/runtime-store');

const SLUG = 'feat';

async function makeTmp() {
  return fs.mkdtemp(path.join(os.tmpdir(), 'aioson-retro-promote-'));
}

function makeLogger() {
  const lines = [];
  const errors = [];
  return { log: (m = '') => lines.push(String(m)), error: (m = '') => errors.push(String(m)), lines, errors };
}

async function writeFile(root, rel, body) {
  const full = path.join(root, rel);
  await fs.mkdir(path.dirname(full), { recursive: true });
  await fs.writeFile(full, body, 'utf8');
}

async function readFile(root, rel) {
  return fs.readFile(path.join(root, rel), 'utf8');
}

function verificationReport({ slug = SLUG } = {}) {
  const report = {
    schema_version: 'verification-report/v1',
    feature_slug: slug,
    policy: 'strict',
    verdict: 'NEEDS_DEV_FIX',
    summary: 'Structured issue.',
    commands_run: [
      { command: 'npm test', status: 'passed', evidence: 'COMMAND-EVIDENCE-SECRET' }
    ],
    findings: [
      {
        id: 'FIND-001',
        claim_id: 'CLAIM-001',
        kind: 'required_behavior',
        status: 'DOES_NOT_CONFIRM',
        severity: 'blocking',
        owner: 'dev',
        file: 'src/cards.js',
        line: 42,
        evidence: 'RAW-AUDITOR-EVIDENCE-SHOULD-NOT-LEAK',
        recommended_route: 'dev'
      }
    ],
    recommended_route: 'dev',
    blocking_findings_count: 1
  };

  return `# Verification Report - ${slug}

## Verdict
NEEDS_DEV_FIX

## Commands Run
npm test.

## Findings
See machine block.

## Before And Now
Before missing, now checked.

## Residual Risk
Structured report only.

## Recommended Route
dev

## Machine Report

\`\`\`json
${JSON.stringify(report, null, 2)}
\`\`\`
`;
}

async function setupRetroCandidate() {
  const root = await makeTmp();
  await writeFile(
    root,
    `.aioson/context/features/${SLUG}/verification-runs/20260624T010203Z-manual-report.md`,
    verificationReport()
  );

  const retro = await runHarnessRetro({
    args: [root],
    options: { feature: SLUG, json: true },
    logger: makeLogger()
  });
  assert.equal(retro.ok, true);
  assert.equal(retro.candidates, 1);
  assert.equal(retro.output, `.aioson/context/retro/${SLUG}.md`);

  return root;
}

async function runPromote(root, options = {}) {
  return runHarnessRetroPromote({
    args: [root],
    options: { feature: SLUG, json: true, ...options },
    logger: makeLogger()
  });
}

test('harness:retro-promote previews candidates by default and writes nothing', async () => {
  const root = await setupRetroCandidate();

  const result = await runPromote(root);

  assert.equal(result.ok, true);
  assert.equal(result.dry_run, true);
  assert.equal(result.target, 'learnings');
  assert.equal(result.candidates, 1);
  assert.equal(result.selected, 1);
  assert.equal(result.items.length, 1);
  assert.match(result.items[0].target_path, /^\.aioson\/learnings\/gotchas\//);
  assert.equal(fsSync.existsSync(path.join(root, result.items[0].target_path)), false);
  assert.equal(fsSync.existsSync(path.join(root, '.aioson/rules')), false);
});

test('harness:retro-promote apply requires explicit selection', async () => {
  const root = await setupRetroCandidate();

  const result = await runPromote(root, { apply: true });

  assert.equal(result.ok, false);
  assert.equal(result.reason, 'selection_required');
  process.exitCode = 0;
  assert.equal(fsSync.existsSync(path.join(root, '.aioson/learnings/gotchas')), false);
  assert.equal(fsSync.existsSync(path.join(root, '.aioson/rules')), false);
});

test('harness:retro-promote applies selected candidate to project learnings', async () => {
  const root = await setupRetroCandidate();

  const result = await runPromote(root, { apply: true, select: 'all', to: 'learnings' });

  assert.equal(result.ok, true);
  assert.equal(result.applied, true);
  assert.equal(result.written.length, 1);
  assert.equal(result.runtime.length, 1);

  const item = result.items[0];
  const content = await readFile(root, item.target_path);
  assert.match(content, /Retro Candidate/);
  assert.match(content, /20260624T010203Z-manual-report\.md/);
  assert.doesNotMatch(content, /RAW-AUDITOR-EVIDENCE-SHOULD-NOT-LEAK/);
  assert.doesNotMatch(content, /COMMAND-EVIDENCE-SECRET/);

  const index = await readFile(root, '.aioson/learnings/INDEX.md');
  assert.match(index, /retro candidate feat::FIND-001/);
  assert.match(index, /gotchas\//);

  const { db } = await openRuntimeDb(root, { mustExist: true });
  try {
    const row = db.prepare('SELECT feature_slug, type, kind, status, evidence FROM project_learnings LIMIT 1').get();
    assert.equal(row.feature_slug, SLUG);
    assert.equal(row.type, 'quality');
    assert.equal(row.kind, 'gotcha');
    assert.equal(row.status, 'active');
    assert.match(row.evidence, /key=feat::FIND-001/);
    assert.doesNotMatch(row.evidence, /RAW-AUDITOR-EVIDENCE/);
  } finally {
    db.close();
  }
});

test('harness:retro-promote applies selected candidate to rules and marks learning promoted', async () => {
  const root = await setupRetroCandidate();

  const result = await runPromote(root, { apply: true, select: 'all', to: 'rules' });

  assert.equal(result.ok, true);
  assert.equal(result.applied, true);
  assert.equal(result.written.length, 1);
  assert.match(result.items[0].target_path, /^\.aioson\/rules\/retro-/);

  const rule = await readFile(root, result.items[0].target_path);
  assert.match(rule, /agents: \[dev, deyvin, scope-check, qa\]/);
  assert.match(rule, /load_tier: trigger/);
  assert.match(rule, /Bounded Evidence/);
  assert.doesNotMatch(rule, /RAW-AUDITOR-EVIDENCE-SHOULD-NOT-LEAK/);
  assert.doesNotMatch(rule, /COMMAND-EVIDENCE-SECRET/);

  const { db } = await openRuntimeDb(root, { mustExist: true });
  try {
    const row = db.prepare('SELECT status, promoted_to FROM project_learnings LIMIT 1').get();
    assert.equal(row.status, 'promoted');
    assert.equal(row.promoted_to, result.items[0].target_path);
  } finally {
    db.close();
  }
});

test('harness:retro-promote refuses promotion before dossier exists', async () => {
  const root = await makeTmp();
  await writeFile(
    root,
    `.aioson/context/features/${SLUG}/verification-runs/20260624T010203Z-manual-report.md`,
    verificationReport()
  );

  const result = await runPromote(root, { apply: true, select: 'all' });

  assert.equal(result.ok, false);
  assert.equal(result.reason, 'dossier_missing');
  process.exitCode = 0;
});
