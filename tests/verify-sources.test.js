'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const { runVerifyArtifact, availableKinds } = require('../src/commands/verify-artifact');

function makeLogger() {
  const lines = [];
  return { log: (m = '') => lines.push(String(m)), error: (m = '') => lines.push(String(m)), warn: () => {}, lines };
}

async function makeTmpDir() {
  return fs.mkdtemp(path.join(os.tmpdir(), 'aioson-verify-sources-'));
}

async function writeFile(dir, relPath, content) {
  const full = path.join(dir, relPath);
  await fs.mkdir(path.dirname(full), { recursive: true });
  await fs.writeFile(full, content, 'utf8');
  return full;
}

const SOURCE_TEXT = 'Approved raw source: users record and cancel orders.\n';
const SOURCE_SHA = crypto.createHash('sha256').update(SOURCE_TEXT).digest('hex');

function briefingText(sha) {
  return `---
slug: orders
source_plans: ["plans/orders-source.md"]
---

# Briefing — Orders

### Source Inventory

| SRC | Path | SHA-256 | Purpose |
|---|---|---|---|
| SRC-001 | plans/orders-source.md | ${sha} | Approved raw source for the order lifecycle |

### Source Promise Map

| Promise | Source | Approved intent | State |
|---|---|---|---|
| PROM-001 | SRC-001 | Users record an order from the entry point | required |
| PROM-002 | SRC-001 | Users cancel an order with confirmation | required |
`;
}

const PRD_TEXT = `---
feature: orders
prototype: null
prototype_status: none
---

# PRD — Orders

## Source Coverage

| Promise | Decision | CAP / AC | Evidence / rationale |
|---|---|---|---|
| PROM-001 | required | CAP-orders-create / AC-orders-01 | Order recording is the core promise of the approved source |
| PROM-002 | required | CAP-orders-cancel / AC-orders-02 | Cancellation flow confirmed in the approved source |

## Feature Capability Map

| CAP | Promised outcome | Actor / trigger | Scope decision | Rationale |
|---|---|---|---|---|
| CAP-orders-create | User records an order and sees it listed | User submits the order form | required | Core promise |
| CAP-orders-cancel | User cancels an order with confirmation | User clicks cancel | required | Approved lifecycle |

## Acceptance Criteria

| AC | CAP | Observable behavior | Evidence |
|---|---|---|---|
| AC-orders-01 | CAP-orders-create | Submitting a valid order shows it in the list with its total | focused automated test + production-path smoke |
| AC-orders-02 | CAP-orders-cancel | Cancelling asks for confirmation and the order leaves the active list | integration test with fixture orders |
`;

async function makeProject({ sha = SOURCE_SHA, sourceText = SOURCE_TEXT, prd = PRD_TEXT } = {}) {
  const dir = await makeTmpDir();
  await writeFile(dir, 'plans/orders-source.md', sourceText);
  await writeFile(dir, '.aioson/briefings/orders/briefings.md', briefingText(sha));
  await writeFile(dir, '.aioson/context/prd-orders.md', prd);
  return dir;
}

test('kind=sources verifies a coherent source pack clean, with the inventory measured', async () => {
  assert.ok(availableKinds().includes('sources'));
  const dir = await makeProject();

  const report = await runVerifyArtifact({
    args: [dir],
    options: { kind: 'sources', slug: 'orders', json: true, suppressExitCode: true },
    logger: makeLogger()
  });

  assert.equal(report.kind, 'sources');
  assert.deepEqual(report.issues, [], `expected clean, got: ${report.issues.join(' | ')}`);
  assert.equal(report.ok, true);
  assert.equal(report.metrics.sources_total, 1);
  assert.equal(report.metrics.sources_present, 1);
  assert.equal(report.metrics.promises_required, 2);
  assert.equal(report.metrics.coverage_rows, 2);
});

test('a source edited after the briefing snapshot is a stale fingerprint issue', async () => {
  const dir = await makeProject({ sourceText: SOURCE_TEXT + 'tampered after approval\n' });

  const report = await runVerifyArtifact({
    args: [dir],
    options: { kind: 'sources', slug: 'orders', json: true, suppressExitCode: true },
    logger: makeLogger()
  });

  assert.equal(report.ok, false);
  assert.match(report.issues.join('\n'), /source_fingerprint_stale.*SRC-001/);
});

test('a promise dropped from Source Coverage is caught by the machine, not the model', async () => {
  const prdMissingProm = PRD_TEXT.replace(/\| PROM-002 \|.*\n/, '');
  const dir = await makeProject({ prd: prdMissingProm });

  const report = await runVerifyArtifact({
    args: [dir],
    options: { kind: 'sources', slug: 'orders', json: true, suppressExitCode: true },
    logger: makeLogger()
  });

  assert.equal(report.ok, false);
  assert.match(report.issues.join('\n'), /source_promise_dropped.*PROM-002/);
});

test('a feature with no briefing reports not-applicable instead of failing', async () => {
  const dir = await makeTmpDir();
  await writeFile(dir, '.aioson/context/prd-orders.md', PRD_TEXT);

  const report = await runVerifyArtifact({
    args: [dir],
    options: { kind: 'sources', slug: 'orders', json: true, suppressExitCode: true },
    logger: makeLogger()
  });

  assert.equal(report.ok, true);
  assert.deepEqual(report.issues, []);
  assert.match(report.warnings.join('\n'), /not applicable/);
});

// prd-contract.md is the "exact shape" Product copies. When it printed a
// header the parser did not know (`Evidence or rationale`, 2026-09-08), every
// PRD built from it passed Product's own check and blocked Sheldon's first
// command and Gates A/B. The doc's table must parse — and PRDs already
// written with that header must keep parsing.
test('the Source Coverage table prd-contract.md prescribes is the table kind=sources accepts', async () => {
  const contract = await fs.readFile(path.join(__dirname, '..', 'template', '.aioson', 'docs', 'product', 'prd-contract.md'), 'utf8');
  const block = contract.match(/Source coverage:\s*```markdown\r?\n([^\r\n]+)/);
  assert.ok(block, 'prd-contract.md lost its Source coverage example');
  const PRD_HEADER = '| Promise | Decision | CAP / AC | Evidence / rationale |';
  for (const header of [block[1].trim(), '| Promise | Product decision | CAP / AC | Evidence or rationale |']) {
    const dir = await makeProject({ prd: PRD_TEXT.replace(PRD_HEADER, header) });
    const report = await runVerifyArtifact({
      args: [dir],
      options: { kind: 'sources', slug: 'orders', json: true, suppressExitCode: true },
      logger: makeLogger()
    });
    assert.deepEqual(report.issues, [], `${header}: ${report.issues.join(' | ')}`);
  }
});

test('kind=sources without --slug fails with the standard message', async () => {
  const dir = await makeTmpDir();
  const report = await runVerifyArtifact({
    args: [dir],
    options: { kind: 'sources', json: true, suppressExitCode: true },
    logger: makeLogger()
  });
  assert.equal(report.ok, false);
  assert.match((report.issues || []).join('\n'), /requires --slug/);
});

// ─── research captures are sources too: pinned under researchs/, unpinned ones measured ───

const RESEARCH_TEXT = '---\nextracted_at: 2026-08-26\ntrust: untrusted\n---\n# Design extract: Neon\n- Title: Neon\n';
const RESEARCH_SHA = crypto.createHash('sha256').update(RESEARCH_TEXT).digest('hex');

function researchBriefing({ pinned = true, sha = RESEARCH_SHA } = {}) {
  return `---
slug: orders
source_plans: ["plans/orders-source.md"${pinned ? ', "researchs/neon/extract.md"' : ''}]
---

# Briefing — Orders

### Source Inventory

| SRC | Path | SHA-256 | Purpose |
|---|---|---|---|
| SRC-001 | plans/orders-source.md | ${SOURCE_SHA} | Approved raw source for the order lifecycle |
${pinned ? `| SRC-002 | researchs/neon/extract.md | ${sha} | Reference site extract for the orders screen motion |\n` : ''}
### Source Promise Map

| Promise | Source | Approved intent | State |
|---|---|---|---|
| PROM-001 | SRC-001 | Users record an order from the entry point | required |
| PROM-002 | ${pinned ? 'SRC-002' : 'web research (reference site)'} | Users cancel an order with confirmation | required |
`;
}

test('a web capture under researchs/ is a pinned source: fingerprinted like plans/, stale when it drifts, refused outside the roots', async () => {
  const dir = await makeTmpDir();
  await writeFile(dir, 'plans/orders-source.md', SOURCE_TEXT);
  await writeFile(dir, 'researchs/neon/extract.md', RESEARCH_TEXT);
  await writeFile(dir, '.aioson/briefings/orders/briefings.md', researchBriefing());
  await writeFile(dir, '.aioson/context/prd-orders.md', PRD_TEXT);
  let report = await runVerifyArtifact({ args: [dir], options: { kind: 'sources', slug: 'orders', json: true, suppressExitCode: true }, logger: makeLogger() });
  assert.deepEqual(report.issues, [], report.issues.join(' | '));
  assert.equal(report.ok, true);
  assert.equal(report.metrics.sources_total, 2);
  assert.equal(report.metrics.sources_present, 2);
  assert.equal(report.metrics.promises_research_unpinned, 0);
  assert.deepEqual(report.warnings, []);

  await writeFile(dir, 'researchs/neon/extract.md', `${RESEARCH_TEXT}- Re-extracted after approval\n`);
  report = await runVerifyArtifact({ args: [dir], options: { kind: 'sources', slug: 'orders', json: true, suppressExitCode: true }, logger: makeLogger() });
  assert.equal(report.ok, false);
  assert.match(report.issues.join('\n'), /source_fingerprint_stale.*SRC-002/);

  await writeFile(dir, '.aioson/briefings/orders/briefings.md', researchBriefing().replaceAll('researchs/neon/extract.md','researchs/../../outside/secret.md'));
  report = await runVerifyArtifact({ args: [dir], options: { kind: 'sources', slug: 'orders', json: true, suppressExitCode: true }, logger: makeLogger() });
  assert.equal(report.ok, false);
  assert.match(report.issues.join('\n'), /source_path_unsafe.*SRC-002/);
  await writeFile(dir, '.aioson/briefings/orders/briefings.md', researchBriefing().replaceAll('researchs/neon/extract.md','notes/neon.md'));
  report = await runVerifyArtifact({ args: [dir], options: { kind: 'sources', slug: 'orders', json: true, suppressExitCode: true }, logger: makeLogger() });
  assert.match(report.issues.join('\n'), /source_path_invalid.*SRC-002 must point inside root plans\/ or researchs\//);
});

test('a promise that cites web research without a SRC-* row stays accepted — and is counted and warned, never refused', async () => {
  const dir = await makeTmpDir();
  await writeFile(dir, 'plans/orders-source.md', SOURCE_TEXT);
  await writeFile(dir, '.aioson/briefings/orders/briefings.md', researchBriefing({ pinned: false }));
  await writeFile(dir, '.aioson/context/prd-orders.md', PRD_TEXT);
  const report = await runVerifyArtifact({ args: [dir], options: { kind: 'sources', slug: 'orders', json: true, suppressExitCode: true }, logger: makeLogger() });
  assert.deepEqual(report.issues, [], report.issues.join(' | '));
  assert.equal(report.ok, true, 'the free-text research citation is still accepted');
  assert.equal(report.metrics.promises_research_unpinned, 1);
  assert.equal(report.warnings.length, 1);
  assert.match(report.warnings[0], /^research_source_unpinned: PROM-002 cite web research without a SRC-\* row/);
});

test('research_unpinned matches whole words only — webhooks, websites and researchers cite no web research', async () => {
  const dir = await makeTmpDir();
  await writeFile(dir, 'plans/orders-source.md', SOURCE_TEXT);
  await writeFile(dir, '.aioson/context/prd-orders.md', PRD_TEXT);
  const run = async (sourceCell) => {
    await writeFile(dir, '.aioson/briefings/orders/briefings.md', researchBriefing({ pinned: false }).replace('web research (reference site)', sourceCell));
    const report = await runVerifyArtifact({ args: [dir], options: { kind: 'sources', slug: 'orders', json: true, suppressExitCode: true }, logger: makeLogger() });
    return report.metrics.promises_research_unpinned;
  };
  for (const clean of ['our webhook integration docs', 'confirmed against the website copy deck', 'per the researcher on the UX team', 'Site.com/webinar-2026 recording']) {
    assert.equal(await run(clean), 0, clean);
  }
  for (const cited of ['levantado em pesquisas de mercado', 'confirmado por pesquisa.', 'notes from web, uncaptured']) {
    assert.equal(await run(cited), 1, cited);
  }
});
