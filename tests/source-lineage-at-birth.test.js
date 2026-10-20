'use strict';

// Source lineage is checked where it is born. Before a PRD existed,
// `verify:artifact --kind=sources|briefing` answered "not applicable: no
// briefing found" for a briefing that was on disk and pinned its sources, so a
// source edited after the snapshot passed @briefing, @refiner and Product's
// first check; the first real check fired after the owner approved, on table
// headers no doc spelled out, and nothing noticed the approved briefing being
// edited to repair them.

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const { runVerifyArtifact } = require('../src/commands/verify-artifact');
const { runBriefingApprove, runBriefingUnapprove } = require('../src/commands/briefing');
const { readBriefingRegistry, writeBriefingRegistry } = require('../src/lib/refiner/briefing-registry');

const SLUG = 'due-dates';
const SOURCE_TEXT = '# Due dates\n\n1. A todo can carry a due date.\n2. GET /todos?overdue=true lists open past-due todos.\n';
const SOURCE_SHA = crypto.createHash('sha256').update(SOURCE_TEXT).digest('hex');

const quiet = { log() {}, error() {}, warn() {} };

function briefing({ inventory, promiseMap, frontmatter = '' } = {}) {
  return `---
slug: ${SLUG}
source_plans: [plans/${SLUG}/idea.md]
${frontmatter}---

# Briefing — Due dates

## Sources

### Source Inventory

${inventory || `| Source | Path | Type | Role | Fingerprint | Usage | Purpose |
|---|---|---|---|---|---|---|
| SRC-001 | plans/${SLUG}/idea.md | documentation | intent | sha256:${SOURCE_SHA} | consulted | The owner's statement |`}

### Source Promise Map

${promiseMap || `| PROM | Source | Locator | Approved intent | State |
|---|---|---|---|---|
| PROM-001 | SRC-001 | item 1 | A todo can carry a due date | required |
| PROM-002 | SRC-001 | item 2 | The overdue view lists open past-due todos | required |`}
`;
}

const PRD = `---
feature: ${SLUG}
prototype: null
prototype_status: none
---

# PRD

## Source Coverage

| Promise | Decision | CAP / AC | Evidence / rationale |
|---|---|---|---|
| PROM-001 | required | CAP-due / AC-due-01 | preserved from SRC-001 item 1 |
| PROM-002 | required | CAP-overdue / AC-due-02 | preserved from SRC-001 item 2 |

## Feature Capability Map

| CAP | Promised outcome | Actor / trigger | Scope decision | Rationale |
|---|---|---|---|---|
| CAP-due | A todo stores its due date | client / POST /todos | required | PROM-001 |
| CAP-overdue | Overdue todos are listed | client / GET /todos?overdue=true | required | PROM-002 |

## Acceptance Criteria

| AC | CAP | Observable behavior | Evidence |
|---|---|---|---|
| AC-due-01 | CAP-due | POST with dueDate returns it in the body | focused automated test |
| AC-due-02 | CAP-overdue | GET overdue returns only open past-due todos | focused automated test |
`;

async function project({ briefingText = briefing(), prd = null, sourceText = SOURCE_TEXT } = {}) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'aioson-lineage-birth-'));
  const write = async (rel, content) => {
    await fs.mkdir(path.dirname(path.join(dir, rel)), { recursive: true });
    await fs.writeFile(path.join(dir, rel), content, 'utf8');
  };
  await write(`plans/${SLUG}/idea.md`, sourceText);
  await write(`.aioson/briefings/${SLUG}/briefings.md`, briefingText);
  if (prd) await write(`.aioson/context/prd-${SLUG}.md`, prd);
  return { dir, write };
}

const verify = (dir, kind) => runVerifyArtifact({
  args: [dir],
  options: { kind, slug: SLUG, json: true, advisory: true, suppressExitCode: true },
  logger: quiet
});

test('before any PRD, a source edited after the briefing snapshot is a stale fingerprint for kind=sources and kind=briefing', async () => {
  const { dir } = await project({ sourceText: `${SOURCE_TEXT}3. Priorities can be changed with PATCH.\n` });

  const sources = await verify(dir, 'sources');
  assert.equal(sources.metrics.applicable, true);
  assert.match(sources.issues.join('\n'), /source_fingerprint_stale.*SRC-001/);
  assert.ok(!sources.warnings.some((w) => /no briefing found/.test(w)), sources.warnings.join(' | '));

  const birth = await verify(dir, 'briefing');
  assert.match(birth.issues.join('\n'), /source_fingerprint_stale.*SRC-001/);
});

test('before any PRD, a coherent pinned briefing verifies clean and Source Coverage is not demanded yet', async () => {
  const { dir } = await project();
  const report = await verify(dir, 'sources');
  assert.deepEqual(report.issues, [], report.issues.join(' | '));
  assert.equal(report.metrics.promises_required, 2);
  assert.equal(report.metrics.coverage_checked, false);
});

test('a present briefing that pins nothing is never reported as missing', async () => {
  const { dir } = await project({ briefingText: `---\nslug: ${SLUG}\nsource_plans: [conversational]\n---\n\n# Briefing\n\n## Sources\n\nConversational.\n` });
  const report = await verify(dir, 'sources');
  assert.equal(report.ok, true);
  assert.match(report.warnings.join('\n'), /not applicable: the briefing pins no sources/);
  assert.ok(!report.warnings.some((w) => /no briefing found/.test(w)));
});

test('a `Promise` header over the promise text is the intent, and an `ID` header holds the ids', async () => {
  const { dir } = await project({
    prd: PRD,
    briefingText: briefing({
      inventory: `| ID | Path | Fingerprint | Purpose |
|---|---|---|---|
| SRC-001 | plans/${SLUG}/idea.md | sha256:${SOURCE_SHA} | The owner's statement |`,
      promiseMap: `| ID | Source | Locator | Promise | State |
|---|---|---|---|---|
| PROM-001 | SRC-001 | item 1 | A todo can carry a due date | required |
| PROM-002 | SRC-001 | item 2 | The overdue view lists open past-due todos | required |`
    })
  });
  const report = await verify(dir, 'sources');
  assert.deepEqual(report.issues, [], report.issues.join(' | '));
  assert.equal(report.metrics.promises_total, 2);
  assert.equal(report.metrics.coverage_rows, 2);
});

test('the tables exploration-and-artifacts.md prints are the tables the lineage parser reads', async () => {
  const doc = await fs.readFile(path.join(__dirname, '..', 'template', '.aioson', 'docs', 'briefing', 'exploration-and-artifacts.md'), 'utf8');
  const block = doc.match(/```markdown\r?\n(### Source Inventory[\s\S]*?### Source Promise Map[\s\S]*?)```/);
  assert.ok(block, 'exploration-and-artifacts.md lost its literal Source Inventory / Promise Map tables');
  const tables = block[1]
    .replaceAll('{slug}', SLUG)
    .replace('sha256:{fingerprint}', `sha256:${SOURCE_SHA}`);
  const { dir } = await project({ prd: PRD, briefingText: `---\nslug: ${SLUG}\nsource_plans: [plans/${SLUG}/idea.md]\n---\n\n# Briefing\n\n## Sources\n\n${tables}` });
  const report = await verify(dir, 'sources');
  assert.ok(!report.issues.some((i) => /_columns\]/.test(i)), report.issues.join(' | '));
  assert.equal(report.metrics.sources_present, 1);
  assert.equal(report.metrics.promises_total, 1);
});

// A briefing approved before lineage was checked at birth may use the old table
// shape briefing:migrate-lineage converts. It must never be newly blocked by
// that shape; only a changed source — or the same shape on a draft — blocks.
function fullBriefing(sources) {
  return `---
slug: ${SLUG}
created_at: 2026-07-26
updated_at: 2026-07-27
source_plans: [plans/${SLUG}/idea.md]
prototype: not_applicable
---

# Briefing — Due dates

## Context

A todo API stores todos in a JSON file.

## Problem

People forget deadlines and cannot ask what slipped.

## Proposed solution

An optional due date and an overdue view.

## Themes

1. Deadlines.

## Risks

- The server clock defines today.

## Identified gaps

TBD — not discussed in this session.

## Sources

${sources}

## Open questions

1. [out-of-scope] Email reminders.
`;
}

const LEGACY_SOURCES = `### Source Inventory

| ID | Fonte consultada | Finalidade |
|---|---|---|
| SRC-001 | \`plans/${SLUG}/idea.md\` | Material source pack |

### Source Promise Map

| ID | Promessa material preservada | Disposição |
|---|---|---|
| PROM-001 | A todo can carry a due date | required |`;

const CANONICAL_SOURCES = `### Source Inventory

| Source | Path | Fingerprint | Purpose |
|---|---|---|---|
| SRC-001 | plans/${SLUG}/idea.md | sha256:${SOURCE_SHA} | The owner's statement |

### Source Promise Map

| PROM | Source | Locator | Approved intent | State |
|---|---|---|---|---|
| PROM-001 | SRC-001 | item 1 | A todo can carry a due date | required |`;

async function registered(dir, status) {
  await writeBriefingRegistry(dir, {
    updated_at: '2026-07-27',
    briefings: [{ slug: SLUG, status, source_plans: [`plans/${SLUG}/idea.md`], created_at: '2026-07-26', approved_at: status === 'approved' ? '2026-07-27' : null, prd_generated: null }]
  });
}

test('an approved briefing in the old table shape, sources unchanged, is advised — never newly blocked', async () => {
  const { dir } = await project({ briefingText: fullBriefing(LEGACY_SOURCES) });
  await registered(dir, 'approved');

  for (const kind of ['briefing', 'sources']) {
    const report = await verify(dir, kind);
    assert.deepEqual(report.issues.filter((i) => i.startsWith('[source_')), [], `${kind}: ${report.issues.join(' | ')}`);
    assert.equal(report.ok, true, `${kind}: ${report.issues.join(' | ')}`);
    assert.ok(report.warnings.some((w) => w.includes(`aioson briefing:migrate-lineage . --slug=${SLUG} --write`)), `${kind}: ${report.warnings.join(' | ')}`);
    assert.ok(report.warnings.some((w) => w.startsWith('[source_inventory_columns]')), `${kind}: the shape finding stays visible`);
  }
});

test('the same old shape on a draft briefing still blocks at birth', async () => {
  const { dir } = await project({ briefingText: fullBriefing(LEGACY_SOURCES) });
  await registered(dir, 'draft');
  const report = await verify(dir, 'briefing');
  assert.ok(report.issues.some((i) => i.startsWith('[source_inventory_columns]')), report.issues.join(' | '));
});

test('an approved briefing whose source changed still blocks', async () => {
  const { dir } = await project({ briefingText: fullBriefing(CANONICAL_SOURCES), sourceText: `${SOURCE_TEXT}3. Priorities can be changed.\n` });
  await registered(dir, 'approved');
  for (const kind of ['briefing', 'sources']) {
    const report = await verify(dir, kind);
    assert.ok(report.issues.some((i) => i.startsWith('[source_fingerprint_stale]')), `${kind}: ${report.issues.join(' | ')}`);
  }
});

test('briefing:approve pins the approved text; an edit after approval warns, unapprove clears the pin', async () => {
  const { dir, write } = await project({ briefingText: briefing({ frontmatter: 'prototype: not_applicable\n' }) });
  await writeBriefingRegistry(dir, {
    updated_at: '2026-10-20',
    briefings: [{ slug: SLUG, status: 'draft', source_plans: [`plans/${SLUG}/idea.md`], created_at: '2026-10-20', approved_at: null, prd_generated: null }]
  });

  assert.equal((await runBriefingApprove({ args: [dir], options: { slug: SLUG }, logger: quiet })).ok, true);
  let entry = (await readBriefingRegistry(dir)).briefings.find((item) => item.slug === SLUG);
  assert.match(String(entry.approved_sha256), /^[a-f0-9]{64}$/);

  let report = await verify(dir, 'sources');
  assert.ok(!report.warnings.some((w) => w.startsWith('briefing_changed_after_approval')), 'an untouched approved briefing is not drift');

  await write(`.aioson/briefings/${SLUG}/briefings.md`, briefing({ frontmatter: 'prototype: not_applicable\n' }).replace('A todo can carry a due date', 'A todo can carry a due time'));
  report = await verify(dir, 'sources');
  assert.ok(report.warnings.some((w) => w.startsWith('briefing_changed_after_approval')), report.warnings.join(' | '));
  assert.equal(report.metrics.approval_drift, true);
  assert.ok((await verify(dir, 'briefing')).warnings.some((w) => w.startsWith('briefing_changed_after_approval')));

  assert.equal((await runBriefingUnapprove({ args: [dir], options: { slug: SLUG }, logger: quiet })).ok, true);
  entry = (await readBriefingRegistry(dir)).briefings.find((item) => item.slug === SLUG);
  assert.equal(entry.approved_sha256 || null, null);
});
