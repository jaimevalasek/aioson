'use strict';

// Lineage-at-birth review fixes (v1.74.0 wave review):
// - a briefing written with the tables exploration-and-artifacts.md prints is
//   what briefing:migrate-lineage calls canonical (it errored on `PROM`);
// - a plans/{slug}/ pack is checked before the PRD even without an inventory;
// - an approved briefing is only spared table-SHAPE findings, and the
//   migration is named only when it would rewrite something;
// - a pinned source git ignores (researchs/) is a warning, not a block;
// - an approval can be acknowledged (re-pin), unapprove respects an existing
//   PRD (--force overrides), and a pre-pin approval is reported, never blocked.

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const { runVerifyArtifact } = require('../src/commands/verify-artifact');
const { runBriefingApprove, runBriefingUnapprove } = require('../src/commands/briefing');
const { approvalHash, readBriefingRegistry, writeBriefingRegistry } = require('../src/lib/refiner/briefing-registry');
const { analyzeBriefingLineageMigration } = require('../src/lib/briefing-lineage-migration');

const BIN = path.join(__dirname, '..', 'bin', 'aioson.js');
const SLUG = 'due-dates';
// A temp project never inherits a repository above it (a versioned home dir).
process.env.GIT_CEILING_DIRECTORIES = require('node:fs').realpathSync(os.tmpdir());
const IDEA = '# Due dates\n\n1. A todo can carry a due date.\n2. Overdue todos are listed.\n';
const IDEA_SHA = crypto.createHash('sha256').update(IDEA).digest('hex');
const CAPTURE = '# Extract\n\nCompetitors badge overdue items.\n';
const CAPTURE_SHA = crypto.createHash('sha256').update(CAPTURE).digest('hex');

function quietLogger() {
  const lines = { log: [], error: [] };
  return { lines, log: (line) => lines.log.push(String(line)), error: (line) => lines.error.push(String(line)), warn() {} };
}

async function project(t, files) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'aioson-cycle-lineage-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const write = async (rel, content) => {
    await fs.mkdir(path.dirname(path.join(dir, rel)), { recursive: true });
    await fs.writeFile(path.join(dir, rel), content, 'utf8');
  };
  for (const [rel, content] of Object.entries(files)) await write(rel, content);
  return { dir, write };
}

async function register(dir, status, extra = {}) {
  await writeBriefingRegistry(dir, {
    updated_at: '2026-10-20',
    briefings: [{ slug: SLUG, status, source_plans: [`plans/${SLUG}/idea.md`], created_at: '2026-10-20', approved_at: status === 'approved' ? '2026-10-20' : null, prd_generated: null, ...extra }]
  });
}

function briefing({ frontmatter = `source_plans: [plans/${SLUG}/idea.md]\n`, sources }) {
  return `---\nslug: ${SLUG}\n${frontmatter}prototype: not_applicable\n---\n\n# Briefing — Due dates\n\n## Context\n\nA todo API.\n\n## Problem\n\nDeadlines are forgotten.\n\n## Proposed solution\n\nAn optional due date.\n\n## Themes\n\n1. Deadlines.\n\n## Risks\n\n- The server clock defines today.\n\n## Identified gaps\n\nTBD — not discussed in this session.\n\n## Sources\n\n${sources}\n\n## Open questions\n\n1. [out-of-scope] Email reminders.\n`;
}

const CANONICAL = `### Source Inventory

| Source | Path | Fingerprint | Purpose |
|---|---|---|---|
| SRC-001 | plans/${SLUG}/idea.md | sha256:${IDEA_SHA} | The owner's statement |

### Source Promise Map

| Promise | Source | Approved intent | State |
|---|---|---|---|
| PROM-001 | SRC-001 | A todo can carry a due date | required |`;

const PRD = `---\nfeature: ${SLUG}\nprototype: null\nprototype_status: none\n---\n\n# PRD\n\n## Feature Capability Map\n\n| CAP | Promised outcome | Actor / trigger | Scope decision | Rationale |\n|---|---|---|---|---|\n| CAP-due | A todo stores its due date | client / POST /todos | required | PROM-001 |\n\n## Acceptance Criteria\n\n| AC | CAP | Observable behavior | Evidence |\n|---|---|---|---|\n| AC-due-01 | CAP-due | POST with dueDate returns it | focused automated test |\n`;

const verify = (dir, kind = 'sources') => runVerifyArtifact({
  args: [dir],
  options: { kind, slug: SLUG, json: true, advisory: true, suppressExitCode: true },
  logger: quietLogger()
});

const checksOf = (lines) => lines.map((line) => (line.match(/^\[([a-z_]+)\]/) || [])[1]).filter(Boolean);

test('the tables exploration-and-artifacts.md prints verify clean and migrate-lineage calls them already canonical', async (t) => {
  const doc = await fs.readFile(path.join(__dirname, '..', 'template', '.aioson', 'docs', 'briefing', 'exploration-and-artifacts.md'), 'utf8');
  const block = doc.match(/```markdown\r?\n(### Source Inventory[\s\S]*?### Source Promise Map[\s\S]*?)```/);
  assert.ok(block, 'the doc lost its literal Source Inventory / Promise Map tables');
  const tables = block[1].replaceAll('{slug}', SLUG).replace('sha256:{fingerprint}', `sha256:${IDEA_SHA}`);
  const { dir } = await project(t, { [`plans/${SLUG}/idea.md`]: IDEA, [`.aioson/briefings/${SLUG}/briefings.md`]: briefing({ sources: tables }) });
  await register(dir, 'approved');

  const report = await verify(dir);
  assert.deepEqual(report.issues, [], report.issues.join(' | '));
  assert.equal((await analyzeBriefingLineageMigration({ projectDir: dir, slug: SLUG })).status, 'already_canonical');

  const cli = spawnSync(process.execPath, [BIN, 'briefing:migrate-lineage', dir, `--slug=${SLUG}`, '--json'], { encoding: 'utf8' });
  assert.equal(cli.status, 0, cli.stderr || cli.stdout);
  assert.equal(JSON.parse(cli.stdout).status, 'already_canonical');
});

test('any header set the validator reads is canonical for the migration too', async (t) => {
  const sources = `### Source Inventory

| SRC | File | SHA-256 | Use |
|---|---|---|---|
| SRC-001 | plans/${SLUG}/idea.md | ${IDEA_SHA} | The owner's statement |

### Source Promise Map

| ID | Source | Locator | Promise | State |
|---|---|---|---|---|
| PROM-001 | SRC-001 | item 1 | A todo can carry a due date | required |`;
  const { dir } = await project(t, { [`plans/${SLUG}/idea.md`]: IDEA, [`.aioson/briefings/${SLUG}/briefings.md`]: briefing({ sources }) });
  await register(dir, 'approved');
  assert.deepEqual((await verify(dir)).issues, []);
  assert.equal((await analyzeBriefingLineageMigration({ projectDir: dir, slug: SLUG })).status, 'already_canonical');
});

test('a plans/{slug}/ pack with no Source Inventory is checked before the PRD, with the findings the PRD would bring', async (t) => {
  const plain = briefing({ frontmatter: '', sources: `- plans/${SLUG}/idea.md` });
  const { dir, write } = await project(t, { [`plans/${SLUG}/idea.md`]: IDEA, [`.aioson/briefings/${SLUG}/briefings.md`]: plain });
  await register(dir, 'approved');

  const before = await verify(dir);
  assert.equal(before.ok, false, 'a pack without its inventory is no longer "pins no sources"');
  assert.ok(!before.warnings.some((w) => /pins no sources/.test(w)), before.warnings.join(' | '));
  const beforeChecks = checksOf(before.issues);
  for (const check of ['source_inventory_missing', 'source_plan_not_in_inventory']) assert.ok(beforeChecks.includes(check), `${check}: ${before.issues.join(' | ')}`);

  await write(`.aioson/context/prd-${SLUG}.md`, PRD);
  const after = await verify(dir);
  const afterChecks = checksOf(after.issues);
  for (const check of beforeChecks) assert.ok(afterChecks.includes(check), `${check} is found before and after the PRD`);
  assert.ok(afterChecks.includes('source_coverage_missing'), 'Source Coverage becomes due with the PRD');
});

test('an approved briefing keeps a content defect blocking and is told about the migration only when it would rewrite something', async (t) => {
  const defect = CANONICAL.replace('| PROM-001 | SRC-001 | A todo can carry a due date | required |', '| PROM-001 | SRC-001 | A todo can carry a due date | required |\n| PROM-002 | SRC-999 | Overdue todos are listed | required |');
  const { dir, write } = await project(t, { [`plans/${SLUG}/idea.md`]: IDEA, [`.aioson/briefings/${SLUG}/briefings.md`]: briefing({ sources: defect }) });
  await register(dir, 'approved');

  let report = await verify(dir);
  assert.ok(report.issues.some((i) => i.startsWith('[source_promise_source_unknown]')), report.issues.join(' | '));
  assert.ok(!report.warnings.some((w) => w.includes('briefing:migrate-lineage')), 'a canonical briefing is not sent to a no-op migration');

  // A row-level ID defect in canonical columns stays advisory (shape), but the
  // migration has nothing to rewrite: the fix named is a repair in place.
  await write(`.aioson/briefings/${SLUG}/briefings.md`, briefing({ sources: CANONICAL.replace('| SRC-001 | plans/', '| idea | plans/').replace('| PROM-001 | SRC-001 |', '| PROM-001 | conversation with the owner |') }));
  report = await verify(dir);
  assert.ok(report.warnings.some((w) => w.startsWith('[source_id_invalid]')), report.warnings.join(' | '));
  assert.ok(!report.issues.some((i) => i.startsWith('[source_id_invalid]')), report.issues.join(' | '));
  assert.ok(report.warnings.some((w) => w.includes('need a repair in place')), report.warnings.join(' | '));
  assert.ok(!report.warnings.some((w) => w.includes('briefing:migrate-lineage .')), report.warnings.join(' | '));
});

const RESEARCH = CANONICAL
  .replace(`| SRC-001 | plans/${SLUG}/idea.md | sha256:${IDEA_SHA} | The owner's statement |`, `| SRC-001 | plans/${SLUG}/idea.md | sha256:${IDEA_SHA} | The owner's statement |\n| SRC-002 | researchs/${SLUG}/extract.md | sha256:${CAPTURE_SHA} | Competitor research |`)
  .replace('| PROM-001 | SRC-001 | A todo can carry a due date | required |', '| PROM-001 | SRC-001 | A todo can carry a due date | required |\n| PROM-002 | SRC-002 | Overdue items carry a badge | required |');

test('a pinned research capture missing from a checkout (researchs/ is git-ignored) is a warning, never a block', async (t) => {
  const { dir } = await project(t, { [`plans/${SLUG}/idea.md`]: IDEA, [`.aioson/briefings/${SLUG}/briefings.md`]: briefing({ sources: RESEARCH }) });
  await register(dir, 'approved');
  const report = await verify(dir);
  assert.deepEqual(report.issues, [], report.issues.join(' | '));
  assert.equal(report.ok, true);
  const warning = report.warnings.find((w) => w.startsWith('source_file_unavailable'));
  assert.ok(warning, report.warnings.join(' | '));
  assert.match(warning, /SRC-002/);
  assert.match(warning, /web:save|web:extract/);
});

test('a missing source git would track still blocks', async (t) => {
  const { dir } = await project(t, { [`.aioson/briefings/${SLUG}/briefings.md`]: briefing({ sources: CANONICAL }) });
  await register(dir, 'approved');
  const report = await verify(dir);
  assert.ok(report.issues.some((i) => i.startsWith('[source_file_missing]')), report.issues.join(' | '));
});

test('inside a git repository, git check-ignore decides which missing source is unavailable', { skip: spawnSync('git', ['--version']).status !== 0 && 'git unavailable' }, async (t) => {
  const privatePack = CANONICAL.replace(`plans/${SLUG}/idea.md`, `plans/${SLUG}/private/notes.md`);
  const { dir } = await project(t, {
    '.gitignore': `plans/${SLUG}/private/\n`,
    [`.aioson/briefings/${SLUG}/briefings.md`]: briefing({ frontmatter: '', sources: privatePack })
  });
  assert.equal(spawnSync('git', ['init', '-q'], { cwd: dir }).status, 0);
  await register(dir, 'approved');
  let report = await verify(dir);
  assert.ok(!report.issues.some((i) => i.startsWith('[source_file_missing]')), report.issues.join(' | '));
  assert.ok(report.warnings.some((w) => w.startsWith('source_file_unavailable')), report.warnings.join(' | '));

  await fs.writeFile(path.join(dir, '.gitignore'), '', 'utf8');
  report = await verify(dir);
  assert.ok(report.issues.some((i) => i.startsWith('[source_file_missing]')), 'a source git does not ignore is missing, not unavailable');
});

test('briefing:approve on an approved slug re-pins the edited text, and the drift warning says so', async (t) => {
  const text = briefing({ sources: CANONICAL });
  const { dir, write } = await project(t, { [`plans/${SLUG}/idea.md`]: IDEA, [`.aioson/briefings/${SLUG}/briefings.md`]: text });
  await register(dir, 'draft');
  assert.equal((await runBriefingApprove({ args: [dir], options: { slug: SLUG }, logger: quietLogger() })).ok, true);

  const edited = text.replace('An optional due date.', 'An optional due date and time.');
  await write(`.aioson/briefings/${SLUG}/briefings.md`, edited);
  let report = await verify(dir);
  const drift = report.warnings.find((w) => w.startsWith('briefing_changed_after_approval'));
  assert.ok(drift, report.warnings.join(' | '));
  assert.ok(drift.includes(`aioson briefing:approve . --slug=${SLUG}`), drift);

  const repinned = await runBriefingApprove({ args: [dir], options: { slug: SLUG }, logger: quietLogger() });
  assert.deepEqual(repinned, { ok: true, approved: SLUG, repinned: true });
  const entry = (await readBriefingRegistry(dir)).briefings.find((item) => item.slug === SLUG);
  assert.equal(entry.status, 'approved');
  assert.equal(entry.approved_sha256, approvalHash(edited));
  report = await verify(dir);
  assert.ok(!report.warnings.some((w) => w.startsWith('briefing_changed_after_approval')), report.warnings.join(' | '));
  assert.equal(report.metrics.approval_drift, false);
});

test('briefing:unapprove refuses a briefing whose PRD exists unless --force, and says how to override', async (t) => {
  const { dir } = await project(t, { [`plans/${SLUG}/idea.md`]: IDEA, [`.aioson/briefings/${SLUG}/briefings.md`]: briefing({ sources: CANONICAL }), [`.aioson/context/prd-${SLUG}.md`]: PRD });
  await register(dir, 'approved', { approved_sha256: approvalHash(briefing({ sources: CANONICAL })) });

  const logger = quietLogger();
  const refused = await runBriefingUnapprove({ args: [dir], options: { slug: SLUG }, logger });
  assert.deepEqual(refused, { ok: false, error: 'prd_exists', slug: SLUG });
  assert.ok(logger.lines.error.some((line) => line.includes(`prd-${SLUG}.md`) && line.includes('--force')), logger.lines.error.join(' | '));
  assert.equal((await readBriefingRegistry(dir)).briefings[0].status, 'approved');

  const forced = await runBriefingUnapprove({ args: [dir], options: { slug: SLUG, force: true }, logger: quietLogger() });
  assert.deepEqual(forced, { ok: true, unapproved: [SLUG] });
  assert.equal((await readBriefingRegistry(dir)).briefings[0].status, 'draft');
});

test('a briefing approved before approvals were pinned is reported as info, never blocked', async (t) => {
  const { dir } = await project(t, { [`plans/${SLUG}/idea.md`]: IDEA, [`.aioson/briefings/${SLUG}/briefings.md`]: briefing({ sources: CANONICAL }) });
  await register(dir, 'approved');
  const report = await verify(dir);
  assert.equal(report.ok, true, report.issues.join(' | '));
  assert.ok(report.warnings.some((w) => w.startsWith('approval_pin_absent') && w.includes('never a block')), report.warnings.join(' | '));
  assert.equal(report.metrics.approval_drift, false);
});
