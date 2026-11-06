'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs/promises');
const fsSync = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { planSections, parsePlanPhases } = require('../src/lib/plan-document');
const { buildPhaseCapsule, citedIdsOf, citedPrdRows, phasesInCell, scopeSection, createdSince } = require('../src/lib/phase-capsule');
const { declarationOnLine } = require('../src/lib/duplicate-declarations');
const { runDevResumeData } = require('../src/commands/dev-resume');
const { addObservation } = require('../src/lib/observations');

const silent = { log() {}, error() {} };
const SLUG = 'orders';

const PLAN = `---
feature: orders
status: approved
---

# Implementation Plan — orders

## Objective

Orders appear on screen.

## Execution rules

Run the focused check after each phase.

\`\`\`bash
## Phase 9 — not a heading, an example
\`\`\`

## Implementation Delta

| CAP | Action | Existing evidence | Exact paths | Required change |
|---|---|---|---|---|
| CAP-orders-list | create | none | src/list.ts | Add |
| CAP-orders-save | create | none | src/save.ts | Add |

## Capability Delivery Plan

| CAP | Phase | Files | Verification |
|---|---|---|---|
| CAP-orders-list | 1 | src/list.ts | node --test |
| CAP-orders-save | 2, 3 | src/save.ts | node --test |

## Phase 1 — List orders

- CAP/AC: CAP-orders-list (AC-orders-01)
- Verification: node --test
- Done when: the list shows on screen.

## Phase 2 — Save orders

- CAP/AC: CAP-orders-save (AC-orders-02, AC-orders-03)
- Rule: BR-orders-01 applies. AC-orders-99 was dropped.
- Example:

\`\`\`js
## Phase 8 — still an example
const inFence = true;
\`\`\`

- Done when: the saved order shows on screen.

## Handoff

Next agent: @dev
`;

const PRD = `---
classification: SMALL
---
# Orders

## Business Rules

| Rule | Text | ACs |
|---|---|---|
| BR-orders-01 | An order needs a customer | AC-orders-02 |
| BR-orders-02 | Unrelated rule | AC-orders-01 |

## Acceptance Criteria

| AC | CAP | Observable behavior | Evidence |
|---|---|---|---|
| AC-orders-01 | CAP-orders-list | The list shows | test |
| AC-orders-02 | CAP-orders-save | Saving shows the order | test |
| AC-orders-03 | CAP-orders-save | An empty customer is refused | test |
`;

async function project(t, { git = false, plan = PLAN, prd = PRD } = {}) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'aioson-capsule-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  await fs.mkdir(path.join(root, '.aioson/context'), { recursive: true });
  await fs.writeFile(path.join(root, '.aioson/context/project.context.md'), '---\nproject_name: "demo"\n---\n');
  if (plan) await fs.writeFile(path.join(root, `.aioson/context/implementation-plan-${SLUG}.md`), plan);
  if (prd) await fs.writeFile(path.join(root, `.aioson/context/prd-${SLUG}.md`), prd);
  if (git) {
    run(root, 'init', '-q', '-b', 'main');
    run(root, 'config', 'user.email', 'test@example.com');
    run(root, 'config', 'user.name', 'Test');
    run(root, 'config', 'core.autocrlf', 'false');
    await write(root, 'src/existing.ts', 'export const OLD_HELPER = 1;\n');
    run(root, 'add', '.');
    run(root, 'commit', '-q', '-m', 'base');
  }
  return root;
}
function run(root, ...args) {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
}
async function write(root, rel, body) {
  await fs.mkdir(path.dirname(path.join(root, rel)), { recursive: true });
  await fs.writeFile(path.join(root, rel), body);
}
const capsule = (root, options = {}) => runDevResumeData({ args: [root], options: { capsule: true, feature: SLUG, phase: '2', json: true, ...options }, logger: silent });

test('planSections splits by heading outside fences and keeps the fences in the text', () => {
  const { phases, sections } = planSections(PLAN);
  assert.deepEqual(phases.map((phase) => phase.id), ['1', '2']);
  assert.deepEqual(parsePlanPhases(PLAN).map((phase) => phase.id), ['1', '2'], 'the same phases parsePlanPhases reads');
  assert.match(phases[1].text, /const inFence = true;/);
  assert.equal(phases[1].title, 'Save orders');
  assert.deepEqual(sections.map((section) => section.title), ['Objective', 'Execution rules', 'Implementation Delta', 'Capability Delivery Plan', 'Handoff']);
  assert.match(sections[1].text, /## Phase 9 — not a heading/);

  const nested = planSections('# P\n\n## Phases\n\nIntro.\n\n### Phase 1 — A\n\nBody A.\n\n### Phase 2 — B\n\nBody B.\n\n## After\n\nEnd.\n');
  assert.deepEqual(nested.phases.map((phase) => phase.text.split('\n')[0]), ['### Phase 1 — A', '### Phase 2 — B']);
  assert.deepEqual(nested.sections.map((section) => section.title), ['Phases', 'After']);
  assert.doesNotMatch(nested.sections[0].text, /Body A/);
  assert.match(planSections('---\na: 1\n---\n\r\n## One\r\n\r\ntext\r\n').sections[0].text, /^## One\n\ntext/);
});

test('a shared table keeps what this phase needs', () => {
  assert.deepEqual([...phasesInCell('2, 3')], ['2', '3']);
  assert.deepEqual([...phasesInCell('3 a 5')].sort(), ['3', '4', '5']);
  assert.deepEqual([...phasesInCell('1-backend')], ['1']);
  assert.deepEqual([...phasesInCell('Phase 7')], ['7']);

  const delivery = '## Delivery\n\n| CAP | Phase | Files |\n|---|---|---|\n| A | 1 | a.ts |\n| B | 2, 3 | b.ts |\n';
  assert.match(scopeSection(delivery, '2', new Set()), /\| B \| 2, 3 \| b\.ts \|/);
  assert.doesNotMatch(scopeSection(delivery, '2', new Set()), /a\.ts/);
  assert.equal(scopeSection(delivery, '9', new Set()), '', 'a section with nothing left goes away');

  const delta = '## Delta\n\nIntro.\n\n| CAP | Paths |\n|---|---|\n| CAP-a | a.ts |\n| CAP-b | b.ts |\n';
  const scoped = scopeSection(delta, '1', new Set(['CAP-a']));
  assert.match(scoped, /Intro\./);
  assert.match(scoped, /CAP-a/);
  assert.doesNotMatch(scoped, /CAP-b/);

  const controls = '## Controls\n\n| Concern | Control |\n|---|---|\n| auth | check |\n';
  assert.match(scopeSection(controls, '5', new Set()), /auth/, 'a table with no phase or CAP column stays whole');
});

test('PRD rows are found by the id in their first cell, under their own header', () => {
  const { groups, found } = citedPrdRows(PRD.replace(/\n/g, '\r\n'), new Set(['AC-orders-02', 'BR-orders-01', 'AC-orders-99']));
  assert.deepEqual([...found].sort(), ['AC-orders-02', 'BR-orders-01']);
  assert.deepEqual(groups.map((group) => group.section), ['Business Rules', 'Acceptance Criteria']);
  assert.equal(groups[1].header, '| AC | CAP | Observable behavior | Evidence |');
  assert.equal(groups[1].rows.length, 1);
  assert.equal(citedPrdRows(PRD, new Set(['AC-orders-01'])).groups[0].rows[0].includes('AC-orders-01'), true);
  assert.deepEqual(citedPrdRows('', new Set(['AC-1'])).groups, []);
});

test('a line opens a declaration by the rules of its language', () => {
  assert.deepEqual(declarationOnLine('a.ts', 'export function run() {'), { name: 'run', exported: true });
  assert.deepEqual(declarationOnLine('a.ts', 'const LOCAL = 1;'), { name: 'LOCAL', exported: false });
  assert.deepEqual(declarationOnLine('a.ts', 'export type Row = {'), { name: 'Row', exported: true });
  assert.deepEqual(declarationOnLine('a.ts', 'interface Props {'), { name: 'Props', exported: false });
  assert.equal(declarationOnLine('a.ts', 'export async function GET() {'), null, 'nobody imports a route handler');
  assert.equal(declarationOnLine('a.ts', 'export default function Page() {'), null);
  assert.equal(declarationOnLine('a.ts', '  const nested = 1;'), null);
  assert.deepEqual(declarationOnLine('a.rs', 'pub fn run() {'), { name: 'run', exported: true });
  assert.deepEqual(declarationOnLine('a.rs', 'fn hidden() {'), { name: 'hidden', exported: false });
  assert.deepEqual(declarationOnLine('a.go', 'func Run() {'), { name: 'Run', exported: true });
  assert.deepEqual(declarationOnLine('a.go', 'func run() {'), { name: 'run', exported: false });
  assert.deepEqual(declarationOnLine('a.py', 'def _hidden():'), { name: '_hidden', exported: false });
  assert.equal(declarationOnLine('a.css', '.x {'), null);
});

test('the capsule carries the phase, its PRD rows and the scoped plan, and measures itself', async (t) => {
  const root = await project(t);
  const result = await capsule(root);
  assert.equal(result.ok, true);
  assert.equal(result.phase, '2');

  const text = result.capsule;
  assert.match(text, /^# Phase 2 capsule: orders\n/);
  assert.match(text, /## Phase 2 — Save orders/);
  assert.match(text, /const inFence = true;/, 'a fence in the phase survives');
  assert.doesNotMatch(text, /## Phase 1 — List orders/, 'another phase stays out');

  assert.match(text, /\| AC-orders-02 \| CAP-orders-save \| Saving shows the order/);
  assert.match(text, /\| AC-orders-03 \|/);
  assert.match(text, /\| BR-orders-01 \| An order needs a customer/, 'a cited rule comes with the criteria');
  assert.doesNotMatch(text, /AC-orders-01 \| CAP-orders-list \| The list shows/);
  assert.doesNotMatch(text, /BR-orders-02/);
  assert.deepEqual(result.acs.cited, ['AC-orders-02', 'AC-orders-03', 'AC-orders-99']);
  assert.deepEqual(result.acs.missing, ['AC-orders-99']);

  assert.match(text, /## Objective/);
  assert.match(text, /## Execution rules/);
  assert.match(text, /\| CAP-orders-save \| create \| none \| src\/save\.ts/);
  assert.doesNotMatch(text, /src\/list\.ts/, 'a delivery row of another phase stays out');
  assert.doesNotMatch(text, /## Handoff/);
  assert.doesNotMatch(text, /^feature: orders/m, 'frontmatter is not a section');

  assert.equal(result.bytes.capsule, Buffer.byteLength(text, 'utf8'));
  assert.equal(result.bytes.plan, Buffer.byteLength(PLAN, 'utf8'));
  assert.equal(result.bytes.prd, Buffer.byteLength(PRD, 'utf8'));
  assert.equal(result.bytes.plan_and_prd, result.bytes.plan + result.bytes.prd);
  assert.ok(result.bytes.percent_of_sources > 0);
});

test('what was already created comes from git since the base, tests and old code excluded', async (t) => {
  const root = await project(t, { git: true });
  const base = run(root, 'rev-parse', 'HEAD');
  run(root, 'checkout', '-q', '-b', 'feature/orders');
  await write(root, 'src/helpers.ts', 'export const PLAN_HREF = "/plan";\nconst DAY_MS = 86400000;\nexport function firstValue(v: string) {\n  return v;\n}\n');
  await write(root, 'src/existing.ts', 'export const OLD_HELPER = 1;\nexport const NEW_IN_OLD_FILE = 2;\n');
  await write(root, 'tests/helpers.test.ts', 'export const FIXTURE_ONLY = 1;\n');
  run(root, 'add', '.');
  run(root, 'commit', '-q', '-m', 'phase 1');
  await write(root, 'src/uncommitted.ts', 'export const NOT_COMMITTED_YET = 1;\n');
  await write(root, 'src/staged.ts', 'export const STAGED_TOO = 1;\n');
  run(root, 'add', 'src/staged.ts');

  const result = await capsule(root);
  assert.equal(result.created.status, 'ok');
  assert.equal(result.created.base, base);
  assert.equal(result.created.base_ref, 'merge-base with main');
  assert.deepEqual(result.created.files, [
    { path: 'src/existing.ts', exports: ['NEW_IN_OLD_FILE'], local: [] },
    { path: 'src/helpers.ts', exports: ['PLAN_HREF', 'firstValue'], local: ['DAY_MS'] },
    { path: 'src/staged.ts', exports: ['STAGED_TOO'], local: [] },
    { path: 'src/uncommitted.ts', exports: ['NOT_COMMITTED_YET'], local: [] }
  ]);
  assert.match(result.capsule, new RegExp(`## Already created since ${base.slice(0, 7)} \\(merge-base with main\\)`));
  assert.match(result.capsule, /- src\/helpers\.ts: exports PLAN_HREF, firstValue; local DAY_MS/);
  assert.doesNotMatch(result.capsule, /OLD_HELPER|FIXTURE_ONLY/);

  // --base wins over the merge-base.
  const later = run(root, 'rev-parse', 'HEAD');
  const narrowed = await capsule(root, { base: later });
  assert.deepEqual(narrowed.created.files.map((file) => file.path), ['src/staged.ts', 'src/uncommitted.ts']);
  assert.equal((await capsule(root, { base: 'not-a-commit' })).created.reason, 'base_not_found');
  assert.equal((await capsule(root, { base: '--output=x' })).created.reason, 'base_not_found', 'a flag is never a revision');

  // An origin/HEAD that points at this branch gives way to the real default.
  run(root, 'update-ref', 'refs/remotes/origin/feature/orders', 'HEAD');
  run(root, 'symbolic-ref', 'refs/remotes/origin/HEAD', 'refs/remotes/origin/feature/orders');
  assert.equal((await capsule(root)).created.base, base);
});

test('on the default branch it says only uncommitted work shows; outside git the section is empty with the reason', async (t) => {
  const onMain = await project(t, { git: true });
  await write(onMain, 'src/wip.ts', 'export const WORK_IN_PROGRESS = 1;\n');
  const result = await capsule(onMain);
  assert.deepEqual(result.created.files.map((file) => file.path), ['src/wip.ts']);
  assert.match(result.created.note, /HEAD is on main, so only uncommitted work shows\. Pass --base=<commit>/);
  assert.match(result.capsule, /HEAD is on main/);

  const noBranch = await project(t, { git: true });
  run(noBranch, 'branch', '-m', 'trunk');
  assert.equal(createdSince(noBranch, '').reason, 'default_branch_not_found');

  const plain = await project(t);
  const outside = await capsule(plain);
  assert.equal(outside.ok, true);
  assert.deepEqual(outside.created, { status: 'unavailable', reason: 'not_a_git_repository', files: [] });
  assert.match(outside.capsule, /## Already created\n\nNot available: this project is not a git repository\./);
});

test('the open process and risk observations of this feature travel with it', async (t) => {
  const root = await project(t);
  await addObservation(root, { kind: 'process', summary: 'The seed needs a restart after prisma generate', feature: SLUG, agent: 'dev' });
  await addObservation(root, { kind: 'risk', summary: 'Stale header until the next load on the plan page', feature: SLUG, agent: 'dev' });
  await addObservation(root, { kind: 'idea', summary: 'An idea that is not for this phase', feature: SLUG, agent: 'dev' });
  await addObservation(root, { kind: 'process', summary: 'Friction in some other area of the project entirely', feature: 'billing', agent: 'dev' });
  const result = await capsule(root);
  assert.deepEqual(result.observations.map((item) => item.kind).sort(), ['process', 'risk']);
  assert.match(result.capsule, /## Open process and risk observations\n\n- OBS-\w+ \((?:process|risk)\):/);
  assert.doesNotMatch(result.capsule, /An idea that is not|some other area/);
});

test('it writes nothing to the project unless --out names a file', async (t) => {
  const root = await project(t);
  const before = fsSync.readdirSync(path.join(root, '.aioson/context')).sort();
  const lines = [];
  const printed = await runDevResumeData({ args: [root], options: { capsule: true, feature: SLUG, phase: '2' }, logger: { log: (line) => lines.push(String(line)), error() {} } });
  assert.equal(printed.ok, true);
  assert.equal(printed.out, null);
  assert.equal(lines[0], printed.capsule, 'the capsule goes to the standard output');
  assert.match(lines[1], new RegExp(`^Capsule: ${printed.bytes.capsule} bytes, against ${printed.bytes.plan_and_prd} bytes of plan plus PRD`));
  assert.deepEqual(fsSync.readdirSync(path.join(root, '.aioson/context')).sort(), before);
  assert.deepEqual(fsSync.readdirSync(root).sort(), ['.aioson']);

  const written = await capsule(root, { out: 'tmp/capsule.md' });
  assert.equal(written.out, 'tmp/capsule.md');
  assert.equal(await fs.readFile(path.join(root, 'tmp/capsule.md'), 'utf8'), written.capsule);
});

test('a bad request names what is missing, and the plain resume data is untouched', async (t) => {
  const root = await project(t);
  assert.equal((await capsule(root, { feature: undefined })).reason, 'missing_feature');
  assert.equal((await capsule(root, { feature: '../x' })).reason, 'invalid_feature');
  assert.equal((await capsule(root, { phase: undefined })).reason, 'missing_phase');
  assert.equal((await capsule(root, { phase: 'one' })).reason, 'missing_phase');
  const absent = await capsule(root, { phase: '7' });
  assert.equal(absent.reason, 'phase_not_found');
  assert.deepEqual(absent.phases, ['1', '2']);
  const noPlan = await project(t, { plan: null });
  assert.equal((await capsule(noPlan)).reason, 'plan_not_found');
  const noPrd = await project(t, { prd: null });
  const planOnly = await capsule(noPrd);
  assert.equal(planOnly.ok, true);
  assert.deepEqual(planOnly.acs.found, []);
  assert.equal(planOnly.bytes.prd, 0);

  assert.deepEqual(await runDevResumeData({ args: [root], options: { json: true }, logger: silent }), { ok: true, data: null });
});

test('the phase loop tells a fresh Dev to compile the capsule', async () => {
  const root = path.resolve(__dirname, '..');
  for (const rel of ['template/.aioson/docs/dev/phase-loop.md', '.aioson/docs/dev/phase-loop.md']) {
    assert.match(await fs.readFile(path.join(root, rel), 'utf8'), /aioson dev:resume-data \. --feature=\{slug\} --phase=\{n\} --capsule/);
  }
  for (const rel of ['template/.aioson/docs/dev/continuity-recovery.md', '.aioson/docs/dev/continuity-recovery.md']) {
    assert.match(await fs.readFile(path.join(root, rel), 'utf8'), /--capsule/);
  }
});

test('phase 1 is not 10 or 11, in the phases, the PRD rows and the tables', async (t) => {
  const root = await project(t, { plan: null, prd: null });
  const phaseText = (n) => `## Phase ${n} — Step ${n}\n\n- CAP/AC: CAP-${n} (AC-${n})\n- Done when: step ${n} shows.\n`;
  // Out of order on purpose: a prefix match would land on the first it meets.
  const plan = [
    '# Plan',
    '## Capability Delivery Plan',
    '',
    '| CAP | Phase | Files | Verification |',
    '|---|---|---|---|',
    '| CAP-1 | 1 | src/one.js | t |',
    '| CAP-10 | 10 | src/ten.js | t |',
    '| CAP-11 | 11 | src/eleven.js | t |',
    '| CAP-both | 1, 10 | src/both.js | t |',
    '| CAP-range | 2-11 | src/range.js | t |',
    '',
    phaseText(10),
    phaseText(11),
    phaseText(1),
    phaseText(2)
  ].join('\n');
  const prd = ['# PRD', '## Acceptance Criteria', '', '| AC | CAP | Observable behavior |', '|---|---|---|', ...[1, 2, 10, 11, 100].map((n) => `| AC-${n} | CAP-${n} | behavior ${n} |`), ''].join('\n');

  const one = buildPhaseCapsule({ targetDir: root, slug: SLUG, phaseId: '1', plan, prd });
  assert.match(one.capsule, /^## Phase 1 — Step 1$/m, 'the phase asked for');
  assert.doesNotMatch(one.capsule, /^## Phase 1[01] /m);
  assert.deepEqual(one.acs.cited, ['AC-1']);
  assert.match(one.capsule, /\| AC-1 \| CAP-1 \| behavior 1 \|/);
  assert.doesNotMatch(one.capsule, /behavior 1[01]|behavior 100/, 'AC-1 is not AC-10');
  assert.match(one.capsule, /src\/one\.js/);
  assert.match(one.capsule, /src\/both\.js/, 'a row that lists the phase');
  assert.doesNotMatch(one.capsule, /src\/ten\.js|src\/eleven\.js|src\/range\.js/, 'a cell with 10 or 11 is not phase 1');

  const ten = buildPhaseCapsule({ targetDir: root, slug: SLUG, phaseId: '10', plan, prd });
  assert.match(ten.capsule, /^## Phase 10 — Step 10$/m);
  assert.match(ten.capsule, /behavior 10 \|/);
  assert.doesNotMatch(ten.capsule, /behavior 1 \|/);
  assert.match(ten.capsule, /src\/ten\.js/);
  assert.match(ten.capsule, /src\/both\.js/);
  assert.match(ten.capsule, /src\/range\.js/, 'inside a range');
});

test('a range counts in full, and a phase that names only its capability still gets the criteria', async (t) => {
  assert.deepEqual([...citedIdsOf('ACs: AC-1 a AC-3')].sort(), ['AC-1', 'AC-2', 'AC-3']);
  assert.deepEqual([...citedIdsOf('ACs: AC-1 to AC-3')].sort(), ['AC-1', 'AC-2', 'AC-3']);
  assert.deepEqual([...citedIdsOf('ACs: AC-1..AC-3')].sort(), ['AC-1', 'AC-2', 'AC-3']);
  assert.deepEqual([...citedIdsOf('ACs: AC-1-AC-3')].sort(), ['AC-1', 'AC-2', 'AC-3']);
  assert.deepEqual([...citedIdsOf('ACs: AC-x-08 até AC-x-10')].sort(), ['AC-x-08', 'AC-x-09', 'AC-x-10']);
  assert.deepEqual([...citedIdsOf('AC-3 a AC-1')].sort(), ['AC-1', 'AC-3'], 'backwards is no range');
  assert.deepEqual([...citedIdsOf('CAP-a a AC-3')].sort(), ['AC-3', 'CAP-a'], 'two different things');

  const root = await project(t, { plan: null, prd: null });
  const prd = ['# PRD', '## Acceptance Criteria', '', '| AC | CAP | Behavior |', '|---|---|---|', '| AC-1 | CAP-one | first |', '| AC-2 | CAP-one | second |', '| AC-3 | CAP-other | third |', ''].join('\n');
  const capOnly = buildPhaseCapsule({ targetDir: root, slug: SLUG, phaseId: '1', plan: '## Phase 1 — x\n\n- CAP: CAP-one\n', prd });
  assert.deepEqual(capOnly.acs.cited, ['AC-1', 'AC-2']);
  assert.equal(capOnly.acs.via_capability, true);
  assert.match(capOnly.capsule, /\| AC-2 \| CAP-one \| second \|/);
  assert.doesNotMatch(capOnly.capsule, /third/);
  const named = buildPhaseCapsule({ targetDir: root, slug: SLUG, phaseId: '1', plan: '## Phase 1 — x\n\n- CAP/AC: CAP-one (AC-1)\n', prd });
  assert.deepEqual(named.acs.cited, ['AC-1'], 'a phase that names its criteria keeps its list');
  assert.equal(named.acs.via_capability, false);
});

test('the created list survives a space, a user\'s diff prefixes, and text that only looks like code', async (t) => {
  const root = await project(t, { git: true });
  run(root, 'checkout', '-q', '-b', 'feature/orders');
  await write(root, 'src/new file.ts', 'export const WITH_SPACE = 2;\n');
  await write(root, 'src/(group)/[id]/page.tsx', 'export default function Page() { return null; }\nexport const metadata = { a: 1 };\nexport function pageHelper() { return 1; }\n');
  await write(root, 'src/template.ts', 'const body = `\nexport const INSIDE_TEMPLATE = 1;\n`;\n/*\nexport const INSIDE_COMMENT = 1;\n*/\nexport const REAL_ONE = body;\n');
  await write(root, 'src/only-a-comment.ts', '/*\nexport const NOTHING_REAL = 1;\n*/\n');
  run(root, 'add', '.');
  run(root, 'commit', '-q', '-m', 'phase');
  const paths = async () => (await capsule(root)).created.files;
  const expected = [
    { path: 'src/(group)/[id]/page.tsx', exports: ['pageHelper'], local: [] },
    { path: 'src/new file.ts', exports: ['WITH_SPACE'], local: [] },
    { path: 'src/template.ts', exports: ['REAL_ONE'], local: ['body'] }
  ];
  assert.deepEqual(await paths(), expected);
  run(root, 'config', 'diff.mnemonicPrefix', 'true');
  assert.deepEqual(await paths(), expected, 'mnemonic prefixes');
  run(root, 'config', '--unset', 'diff.mnemonicPrefix');
  run(root, 'config', 'diff.noprefix', 'true');
  assert.deepEqual(await paths(), expected, 'no prefixes');
});

test('--out never writes among the plan and the PRD it reads', async (t) => {
  const root = await project(t);
  for (const out of [`.aioson/context/implementation-plan-${SLUG}.md`, `.aioson/context/prd-${SLUG}.md`, '.aioson/context/capsule.md', '.aioson/briefings/orders/capsule.md']) {
    const refused = await capsule(root, { out });
    assert.equal(refused.ok, false, out);
    assert.equal(refused.reason, 'out_inside_sources', out);
  }
  assert.equal(await fs.readFile(path.join(root, `.aioson/context/implementation-plan-${SLUG}.md`), 'utf8'), PLAN, 'the plan is intact');
  assert.equal((await capsule(root, { out: '.aioson/runtime/capsule.md' })).ok, true);
});
