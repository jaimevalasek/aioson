'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const {
  analyzeBriefingLineageMigration,
  applyBriefingLineageMigration
} = require('../src/lib/briefing-lineage-migration');

const BIN = path.join(__dirname, '..', 'bin', 'aioson.js');
const SLUG = 'legacy-lineage';

function hash(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

async function writeFile(root, relativePath, content) {
  const target = path.join(root, relativePath);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, content, 'utf8');
  return target;
}

async function readFile(root, relativePath) {
  return fs.readFile(path.join(root, relativePath), 'utf8');
}

function registry({ status = 'approved', prdGenerated = `prd-${SLUG}.md` } = {}) {
  return `---
updated_at: 2026-07-27
briefings:
  - slug: ${SLUG}
    status: ${status}
    source_plans: ["plans/legacy-source.md", "conversational"]
    created_at: "2026-07-26"
    approved_at: ${status === 'draft' ? 'null' : '"2026-07-27"'}
    prd_generated: ${prdGenerated ? `"${prdGenerated}"` : 'null'}
---

# Briefings Registry
`;
}

function legacyBriefing() {
  return `---
slug: ${SLUG}
created_at: 2026-07-26
updated_at: 2026-07-27
source_plans: ["plans/legacy-source.md", "conversational"]
---

# Briefing — Legacy lineage

## Context

Context remains byte-identical.

## Problem

Problem remains byte-identical.

## Proposed solution

Solution remains byte-identical.

## Themes

Themes remain byte-identical.

## Risks

Risks remain byte-identical.

## Identified gaps

Gaps remain byte-identical.

## Sources

### Source Inventory

| ID | Fonte consultada | Finalidade |
|---|---|---|
| SRC-LEGACY-001 | \`plans/legacy-source.md\` | Material source pack |
| EVID-LEGACY-002 | \`researchs/summary.md\` | Complementary research |
| EVID-LEGACY-003 | \`https://example.test/reference\` | URL preserved as text |

### Source Promise Map

| ID | Promessa material preservada | Disposição |
|---|---|---|
| PROM-LEGACY-001 | Preserve the explicit SRC-LEGACY-001 source promise | required |
| PROM-LEGACY-002 | Preserve the operator conversation | not applicable |

## Open questions

No open questions.
`;
}

function prd() {
  return `# PRD

## Source Coverage

| Promise | Product decision | CAP / AC | Evidence / rationale |
|---|---|---|---|
| PROM-LEGACY-001 | required | CAP-lineage / AC-lineage-001 | Preserved |
| PROM-LEGACY-002 | not_applicable | — | Approved by the user |
`;
}

async function makeProject(t, options = {}) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'aioson-lineage-migration-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  await writeFile(root, '.aioson/briefings/config.md', registry(options));
  await writeFile(root, `.aioson/briefings/${SLUG}/briefings.md`, legacyBriefing());
  await writeFile(root, 'plans/legacy-source.md', 'approved raw source\n');
  await writeFile(root, 'researchs/summary.md', 'research evidence\n');
  if (options.prdGenerated !== null && options.status !== 'draft') {
    await writeFile(root, `.aioson/context/prd-${SLUG}.md`, prd());
  }
  return root;
}

function runCli(root, args) {
  return spawnSync(process.execPath, [BIN, 'briefing:migrate-lineage', root, ...args], {
    cwd: path.join(__dirname, '..'),
    encoding: 'utf8',
    env: { ...process.env, NO_COLOR: '1' }
  });
}

// AC-lineage-001 AC-lineage-002 AC-lineage-003 AC-lineage-015
test('normal CLI defaults to a byte-stable dry-run and --write is idempotent', async (t) => {
  const root = await makeProject(t);
  const briefingPath = `.aioson/briefings/${SLUG}/briefings.md`;
  const preservedPaths = [
    '.aioson/briefings/config.md',
    `.aioson/context/prd-${SLUG}.md`
  ];
  const beforeBriefing = await readFile(root, briefingPath);
  const preservedBefore = await Promise.all(preservedPaths.map((item) => readFile(root, item)));

  const preview = runCli(root, [`--slug=${SLUG}`, '--json']);
  assert.equal(preview.status, 0, preview.stderr);
  const previewResult = JSON.parse(preview.stdout);
  assert.equal(previewResult.ok, true);
  assert.equal(previewResult.mode, 'dry-run');
  assert.equal(previewResult.status, 'migration_planned');
  assert.equal(await readFile(root, briefingPath), beforeBriefing);

  const written = runCli(root, [`--slug=${SLUG}`, '--write', '--json']);
  assert.equal(written.status, 0, written.stderr);
  const writtenResult = JSON.parse(written.stdout);
  assert.equal(writtenResult.status, 'migrated');
  assert.equal(writtenResult.before_sha256, hash(beforeBriefing));
  assert.match(writtenResult.backup_path, /lineage-migration\/backups\/[a-f0-9]{64}\.md$/);
  // Digest prefixes, not two whole sha256s: the full hashes live inside the report.
  assert.match(writtenResult.report_path, /lineage-migration\/reports\/[a-f0-9]{16}-[a-f0-9]{16}\.json$/);

  const migrated = await readFile(root, briefingPath);
  assert.match(migrated, /\| Source \| Path \| Fingerprint \| Purpose \|/);
  assert.match(migrated, /### Complementary lineage evidence \(non-canonical\)/);
  assert.match(migrated, /\| PROM-LEGACY-001 \| SRC-LEGACY-001 \| Preserve the explicit SRC-LEGACY-001 source promise \| required \|/);
  assert.match(migrated, /\| PROM-LEGACY-002 \| Legacy conversational source \| Preserve the operator conversation \| not_applicable \|/);
  assert.equal(migrated.includes('Context remains byte-identical.'), true);
  assert.deepEqual(
    await Promise.all(preservedPaths.map((item) => readFile(root, item))),
    preservedBefore
  );

  const migrationRoot = path.join(root, `.aioson/briefings/${SLUG}/lineage-migration`);
  const beforeEntries = (await fs.readdir(path.join(migrationRoot, 'reports'))).sort();
  const repeated = runCli(root, [`--slug=${SLUG}`, '--write', '--json']);
  assert.equal(repeated.status, 0, repeated.stderr);
  assert.equal(JSON.parse(repeated.stdout).status, 'already_canonical');
  assert.equal(await readFile(root, briefingPath), migrated);
  assert.deepEqual((await fs.readdir(path.join(migrationRoot, 'reports'))).sort(), beforeEntries);
});

// AC-lineage-012
test('migration reports only briefing-bound review packets and preserves review history byte-for-byte', async (t) => {
  const root = await makeProject(t);
  const briefingPath = `.aioson/briefings/${SLUG}/briefings.md`;
  const reviewRoot = `.aioson/context/features/${SLUG}/reviews`;
  const matchingPacket = `${reviewRoot}/packets/sheldon-briefing.json`;
  const unrelatedPacket = `${reviewRoot}/packets/product-prd.json`;
  const historicalReport = `${reviewRoot}/reports/sheldon-briefing.json`;
  await writeFile(root, matchingPacket, `${JSON.stringify({
    agent: 'sheldon',
    packet_id: 'packet-briefing-bound',
    artifact: { path: `.aioson/context/prd-${SLUG}.md` },
    authorities: [{ path: briefingPath }]
  }, null, 2)}\n`);
  await writeFile(root, unrelatedPacket, `${JSON.stringify({
    agent: 'product',
    packet_id: 'packet-prd-bound',
    artifact: { path: `.aioson/context/prd-${SLUG}.md` },
    authorities: [{ path: `.aioson/context/prd-${SLUG}.md` }]
  }, null, 2)}\n`);
  await writeFile(root, historicalReport, '{"review_status":"pass","historical":true}\n');
  const reviewHistory = await Promise.all(
    [matchingPacket, unrelatedPacket, historicalReport].map((item) => readFile(root, item))
  );

  const preview = runCli(root, [`--slug=${SLUG}`, '--json']);
  assert.equal(preview.status, 0, preview.stderr);
  assert.deepEqual(JSON.parse(preview.stdout).affected_reviews, [{
    agent: 'sheldon',
    packet_id: 'packet-briefing-bound',
    packet_path: `${reviewRoot}/packets/sheldon-briefing.json`
  }]);

  const written = runCli(root, [`--slug=${SLUG}`, '--write', '--json']);
  assert.equal(written.status, 0, written.stderr);
  assert.equal(JSON.parse(written.stdout).next_action, 'reprepare affected reviews');
  assert.deepEqual(
    await Promise.all([matchingPacket, unrelatedPacket, historicalReport].map((item) => readFile(root, item))),
    reviewHistory
  );
});

// AC-lineage-019
test('Cockpit-shaped fixture preserves all 18 source promises through the normal migration command', async (t) => {
  const root = await makeProject(t);
  const promiseRows = Array.from({ length: 18 }, (_, index) => {
    const id = String(index + 1).padStart(2, '0');
    return `| PROM-COCKPIT-${id} | Preserve SRC-LEGACY-001 promise ${id} | required |`;
  }).join('\n');
  const coverageRows = Array.from({ length: 18 }, (_, index) => {
    const id = String(index + 1).padStart(2, '0');
    return `| PROM-COCKPIT-${id} | required | CAP-lineage / AC-lineage-${id} | Preserved |`;
  }).join('\n');
  const migratedFixture = legacyBriefing().replace(
    '| PROM-LEGACY-001 | Preserve the explicit SRC-LEGACY-001 source promise | required |\n| PROM-LEGACY-002 | Preserve the operator conversation | not applicable |',
    promiseRows
  );
  await writeFile(root, `.aioson/briefings/${SLUG}/briefings.md`, migratedFixture);
  await writeFile(root, `.aioson/context/prd-${SLUG}.md`, `# PRD\n\n## Source Coverage\n\n| Promise | Product decision | CAP / AC | Evidence / rationale |\n|---|---|---|---|\n${coverageRows}\n`);

  const preview = runCli(root, [`--slug=${SLUG}`, '--json']);
  assert.equal(preview.status, 0, preview.stderr);
  assert.equal(JSON.parse(preview.stdout).promise_rows_migrated, 18);

  const written = runCli(root, [`--slug=${SLUG}`, '--write', '--json']);
  assert.equal(written.status, 0, written.stderr);
  assert.equal(JSON.parse(written.stdout).status, 'migrated');
  const canonical = await readFile(root, `.aioson/briefings/${SLUG}/briefings.md`);
  assert.equal((canonical.match(/PROM-COCKPIT-/g) || []).length, 18);

  const repeated = runCli(root, [`--slug=${SLUG}`, '--write', '--json']);
  assert.equal(repeated.status, 0, repeated.stderr);
  assert.equal(JSON.parse(repeated.stdout).status, 'already_canonical');
});

// AC-lineage-001
test('legacy draft and approved pre-PRD briefings are supported without changing lifecycle', async (t) => {
  for (const status of ['draft', 'approved']) {
    await t.test(status, async (t) => {
      const root = await makeProject(t, { status, prdGenerated: null });
      const registryBefore = await readFile(root, '.aioson/briefings/config.md');
      const result = runCli(root, [`--slug=${SLUG}`, '--write', '--json']);
      assert.equal(result.status, 0, result.stderr);
      assert.equal(JSON.parse(result.stdout).status, 'migrated');
      assert.equal(await readFile(root, '.aioson/briefings/config.md'), registryBefore);
    });
  }
});

test('existing complementary lineage evidence is merged without duplicate headings', async (t) => {
  const root = await makeProject(t);
  const briefingPath = `.aioson/briefings/${SLUG}/briefings.md`;
  const withExistingEvidence = legacyBriefing().replace(
    '\n### Source Promise Map',
    `
### Complementary lineage evidence (non-canonical)

| ID | Evidence | Purpose | Availability |
|---|---|---|---|
| EVID-LEGACY-004 | \`notes/operator-decision.md\` | Preserved operator decision | preserved |

### Source Promise Map`
  );
  await writeFile(root, briefingPath, withExistingEvidence);

  const result = runCli(root, [`--slug=${SLUG}`, '--write', '--json']);
  assert.equal(result.status, 0, result.stderr);
  const migrated = await readFile(root, briefingPath);
  assert.equal(
    (migrated.match(/### Complementary lineage evidence \(non-canonical\)/g) || []).length,
    1
  );
  assert.match(
    migrated,
    /\| EVID-LEGACY-004 \| `notes\/operator-decision\.md` \| Preserved operator decision \| preserved \|/
  );
  assert.match(migrated, /\| EVID-LEGACY-002 \| `researchs\/summary\.md` \| Complementary research \| preserved \|/);
});

// AC-lineage-004
test('compare-and-swap rejects a concurrent briefing edit and post-commit failure restores it', async (t) => {
  const root = await makeProject(t);
  const briefingPath = `.aioson/briefings/${SLUG}/briefings.md`;
  const planned = await analyzeBriefingLineageMigration({ projectDir: root, slug: SLUG });
  const concurrent = `${await readFile(root, briefingPath)}\nConcurrent operator edit.\n`;
  await writeFile(root, briefingPath, concurrent);

  await assert.rejects(
    applyBriefingLineageMigration(planned),
    (error) => error.code === 'briefing_changed_concurrently'
  );
  assert.equal(await readFile(root, briefingPath), concurrent);

  await writeFile(root, briefingPath, legacyBriefing());
  const retry = await analyzeBriefingLineageMigration({ projectDir: root, slug: SLUG });
  await assert.rejects(
    applyBriefingLineageMigration(retry, {
      hooks: {
        afterBriefingCommit() {
          const error = new Error('injected failure');
          error.code = 'injected_failure';
          throw error;
        }
      }
    }),
    (error) => error.code === 'injected_failure'
  );
  assert.equal(await readFile(root, briefingPath), legacyBriefing());
});

// AC-lineage-005 AC-lineage-006 AC-lineage-007 AC-lineage-008 AC-lineage-020
test('migration rejects invalid input and real-path escapes without touching outside files', async (t) => {
  const root = await makeProject(t);
  const outside = await fs.mkdtemp(path.join(os.tmpdir(), 'aioson-lineage-outside-'));
  t.after(() => fs.rm(outside, { recursive: true, force: true }));
  const sentinel = await writeFile(outside, 'sentinel.md', 'outside sentinel\n');

  for (const slug of ['', '../escape', 'UPPER', `a${'b'.repeat(128)}`, 'missing-slug']) {
    const result = runCli(root, [`--slug=${slug}`, '--write', '--json']);
    assert.notEqual(result.status, 0, slug);
    assert.equal(JSON.parse(result.stdout).ok, false, slug);
  }
  assert.equal(await fs.readFile(sentinel, 'utf8'), 'outside sentinel\n');

  const linkPath = path.join(root, 'plans', 'escape.md');
  try {
    await fs.symlink(sentinel, linkPath, 'file');
  } catch (error) {
    if (['EPERM', 'EACCES', 'ENOTSUP'].includes(error.code)) {
      t.skip(`symlink unavailable: ${error.code}`);
      return;
    }
    throw error;
  }
  const escapedBriefing = legacyBriefing().replace(/plans\/legacy-source\.md/g, 'plans/escape.md');
  await writeFile(root, `.aioson/briefings/${SLUG}/briefings.md`, escapedBriefing);
  await writeFile(root, '.aioson/briefings/config.md', registry().replace(/plans\/legacy-source\.md/g, 'plans/escape.md'));
  const result = runCli(root, [`--slug=${SLUG}`, '--write', '--json']);
  assert.notEqual(result.status, 0);
  assert.equal(JSON.parse(result.stdout).error.code, 'source_path_unsafe');
  assert.equal(await fs.readFile(sentinel, 'utf8'), 'outside sentinel\n');
});

test('--dry-run and --write conflict before mutation', async (t) => {
  const root = await makeProject(t);
  const briefingPath = `.aioson/briefings/${SLUG}/briefings.md`;
  const before = await readFile(root, briefingPath);
  const result = runCli(root, [`--slug=${SLUG}`, '--dry-run', '--write', '--json']);
  assert.notEqual(result.status, 0);
  assert.equal(JSON.parse(result.stdout).error.code, 'conflicting_write_options');
  assert.equal(await readFile(root, briefingPath), before);
});

// Two whole sha256s put a report at 179 chars + slug below the root, past Git
// for Windows' 260-char limit on a modest root. A report a pre-1.74 run wrote
// under the full-digest name is still the one used, never duplicated.
test('a report already held under the full-digest name is reused, not duplicated', async (t) => {
  const root = await makeProject(t);
  const briefingPath = `.aioson/briefings/${SLUG}/briefings.md`;
  const reportsDir = path.join(root, `.aioson/briefings/${SLUG}/lineage-migration/reports`);
  const before = await readFile(root, briefingPath);

  const first = await applyBriefingLineageMigration(await analyzeBriefingLineageMigration({ projectDir: root, slug: SLUG }));
  const legacyName = `${first.before_sha256}-${first.after_sha256}.json`;
  await fs.rename(path.join(root, first.report_path), path.join(reportsDir, legacyName));
  await writeFile(root, briefingPath, before);

  const again = await applyBriefingLineageMigration(await analyzeBriefingLineageMigration({ projectDir: root, slug: SLUG }));
  assert.equal(again.report_path, `.aioson/briefings/${SLUG}/lineage-migration/reports/${legacyName}`);
  assert.deepEqual(await fs.readdir(reportsDir), [legacyName]);
});

test('an approval pinned by briefing:approve follows the migrated text', async (t) => {
  const { approvalHash, readBriefingRegistry } = require('../src/lib/refiner/briefing-registry');
  const root = await makeProject(t, { prdGenerated: null });
  const briefingPath = `.aioson/briefings/${SLUG}/briefings.md`;
  const pinned = approvalHash(await readFile(root, briefingPath));
  await writeFile(root, '.aioson/briefings/config.md', registry({ prdGenerated: null }).replace('    prd_generated: null', `    prd_generated: null\n    approved_sha256: "${pinned}"`));

  await applyBriefingLineageMigration(await analyzeBriefingLineageMigration({ projectDir: root, slug: SLUG }));
  const entry = (await readBriefingRegistry(root)).briefings.find((item) => item.slug === SLUG);
  assert.equal(entry.approved_sha256, approvalHash(await readFile(root, briefingPath)));
});
