'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const { extractAcIds, auditAcceptanceCriteriaTests, maskNonCode } = require('../src/lib/ac-test-audit');
const { runAcTestAudit } = require('../src/commands/ac-test-audit');
const { runHarnessCheck } = require('../src/commands/harness-check');

async function makeTmpDir() {
  return fs.mkdtemp(path.join(os.tmpdir(), 'aioson-ac-test-audit-'));
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

test('extractAcIds supports slugged and numeric AC ids', () => {
  assert.deepEqual(
    extractAcIds('AC-checkout-01 AC-SDLC-02 AC-03 AC-checkout-01'),
    ['AC-03', 'AC-SDLC-02', 'AC-checkout-01']
  );
});

test('ac:test-audit requires --feature', async () => {
  const dir = await makeTmpDir();
  const result = await runAcTestAudit({
    args: [dir],
    options: { json: true },
    logger: makeLogger()
  });

  assert.equal(result.ok, false);
  assert.equal(result.error, 'missing_feature');
});

test('ac:test-audit passes when no AC ids exist', async () => {
  const dir = await makeTmpDir();
  await writeFile(dir, '.aioson/context/requirements-checkout.md', '# Requirements\nNo explicit ids yet.');

  const result = await auditAcceptanceCriteriaTests(dir, 'checkout');

  assert.equal(result.ok, true);
  assert.equal(result.summary.acs_total, 0);
});

test('ac:test-audit enxerga o PRD arquivado em done/{slug} (A6 — repro do "0/0 covered")', async () => {
  const dir = await makeTmpDir();
  // feature fechada: artefatos movidos pelo feature:archive para done/{slug}/
  await writeFile(dir, '.aioson/context/done/checkout/prd-checkout.md',
    '# PRD\n\n| AC | CAP |\n|---|---|\n| AC-checkout-01 | CAP-checkout-01 |\n');
  await writeFile(dir, 'tests/checkout.test.js',
    "// AC-checkout-01\nconst assert = require('node:assert');\ntest('AC-checkout-01', () => { assert.equal(1, 1); });\n");

  const result = await auditAcceptanceCriteriaTests(dir, 'checkout', {
    requireCriteria: true,
    requireAssertions: true
  });

  assert.equal(result.summary.acs_total, 1, 'AC do PRD arquivado deve ser encontrado');
  assert.equal(result.ok, true, JSON.stringify(result.missing));
  assert.ok(result.items[0].sources.some((s) => s.file.includes('done/checkout/')));
});

test('ac:test-audit prefere o artefato vivo quando raiz e done/ coexistem', async () => {
  const dir = await makeTmpDir();
  await writeFile(dir, '.aioson/context/prd-checkout.md',
    '# PRD vivo\n| AC | CAP |\n|---|---|\n| AC-checkout-01 | CAP-x |\n');
  await writeFile(dir, '.aioson/context/done/checkout/prd-checkout.md',
    '# PRD velho\n| AC | CAP |\n|---|---|\n| AC-checkout-99 | CAP-x |\n');

  const result = await auditAcceptanceCriteriaTests(dir, 'checkout');
  const ids = result.items.map((i) => i.ac);
  assert.ok(ids.includes('AC-checkout-01'));
  assert.ok(!ids.includes('AC-checkout-99'), 'done/ não pode vazar quando o vivo existe');
});

test('ac:test-audit strict mode rejects zero acceptance criteria', async () => {
  const dir = await makeTmpDir();
  await writeFile(dir, '.aioson/context/requirements-checkout.md', '# Requirements\nNo explicit ids yet.');

  const result = await auditAcceptanceCriteriaTests(dir, 'checkout', {
    requireCriteria: true,
    requireAssertions: true
  });

  assert.equal(result.ok, false);
  assert.deepEqual(result.missing, ['<no acceptance criteria declared>']);
});

test('ac:test-audit covers AC ids referenced by test files', async () => {
  const dir = await makeTmpDir();
  await writeFile(dir, '.aioson/context/requirements-checkout.md', 'AC-checkout-01: user can pay.');
  await writeFile(dir, 'tests/checkout.test.js', "test('AC-checkout-01 payment flow', () => {});\n");

  const result = await auditAcceptanceCriteriaTests(dir, 'checkout');

  assert.equal(result.ok, true);
  assert.equal(result.summary.covered, 1);
  assert.equal(result.items[0].status, 'covered');
  assert.equal(result.items[0].evidence[0].file, 'tests/checkout.test.js');
});

test('ac:test-audit strict mode rejects an empty test that only names the AC', async () => {
  const dir = await makeTmpDir();
  await writeFile(dir, '.aioson/context/requirements-checkout.md', 'AC-checkout-01: user can pay.');
  await writeFile(dir, 'tests/checkout.test.js', "test('AC-checkout-01 payment flow', () => {});\n");

  const result = await auditAcceptanceCriteriaTests(dir, 'checkout', {
    requireCriteria: true,
    requireAssertions: true
  });

  assert.equal(result.ok, false);
  assert.equal(result.items[0].status, 'weak');
  assert.equal(result.items[0].weak_evidence[0].file, 'tests/checkout.test.js');
});

test('ac:test-audit strict mode accepts an AC-linked test with an assertion signal', async () => {
  const dir = await makeTmpDir();
  await writeFile(dir, '.aioson/context/requirements-checkout.md', 'AC-checkout-01: user can pay.');
  await writeFile(dir, 'tests/checkout.test.js', "test('AC-checkout-01 payment flow', () => { assert.equal(pay(), true); });\n");

  const result = await auditAcceptanceCriteriaTests(dir, 'checkout', {
    requireCriteria: true,
    requireAssertions: true
  });

  assert.equal(result.ok, true);
  assert.equal(result.items[0].status, 'covered');
});

async function scopedPlanFixture(files, ids = ['AC-001']) {
  const workspace = await makeTmpDir();
  const project = path.join(workspace, 'play');
  const backend = path.join(workspace, 'cloud');
  const cli = path.join(workspace, 'cli');
  for (const directory of [project, backend, cli]) await fs.mkdir(directory);
  await writeFile(project, '.aioson/context/prd-publishing.md', [
    '# Publishing', '## Feature Capability Map',
    '| CAP | Promised outcome | Actor / trigger | Scope decision | Rationale |',
    '|---|---|---|---|---|', '| CAP-publishing | Deliver the app | Author publishes | required | Core |',
    '## Acceptance Criteria', '| AC | CAP | Observable behavior | Evidence |', '|---|---|---|---|',
    ...ids.map(id => `| ${id} | CAP-publishing | App is delivered | Automated test |`)
  ].join('\n'));
  await writeFile(project, '.aioson/context/implementation-plan-publishing.md', [
    '# Plan', '## Capability Delivery Plan', '| CAP | Phase | Files | Verification |', '|---|---|---|---|',
    `| CAP-publishing | 1 | ${files} | node --test |`
  ].join('\n'));
  return { project, backend, cli };
}

test('ac:test-audit reads only exact planned tests in explicitly declared sibling repositories', async () => {
  const { project, backend, cli } = await scopedPlanFixture('tests/local.test.js, ../cloud/tests/runtime.test.ts, ../cli/tests/package.test.js', ['AC-001', 'AC-002', 'AC-003', 'AC-004']);
  await writeFile(project, '.aioson/repository-roots.json', JSON.stringify({ version: 1, roots: ['../cloud', '../cli'] }));
  await writeFile(project, 'tests/local.test.js', "test('AC-001', () => { assert.equal(1, 1); });");
  await writeFile(backend, 'tests/runtime.test.ts', "test('AC-002', () => { expect(2).toBe(2); });");
  await writeFile(cli, 'tests/package.test.js', "test('AC-003', () => { assert.equal(3, 3); });");
  await writeFile(backend, 'tests/unplanned.test.ts', "test('AC-004 belongs to another feature', () => { expect(4).toBe(4); });");
  const result = await auditAcceptanceCriteriaTests(project, 'publishing', { requireCriteria: true, requireAssertions: true });
  assert.deepEqual(result.items.map(item => item.status), ['covered', 'covered', 'covered', 'missing']);
  assert.equal(result.items[1].evidence[0].file, '../cloud/tests/runtime.test.ts');
  assert.equal(result.items[2].evidence[0].file, '../cli/tests/package.test.js');
  assert.equal(result.summary.test_files_scanned, 3);
  assert.equal(result.test_scope.kind, 'feature_plan');
});

test('ac:test-audit never reads an undeclared sibling even when the plan names its test', async (t) => {
  const { project, backend } = await scopedPlanFixture('tests/local.test.js, ../cloud/tests/private.test.ts', ['AC-001', 'AC-002']);
  await writeFile(project, 'tests/local.test.js', "test('AC-001', () => { assert.equal(1, 1); });");
  const external = path.join(backend, 'tests/private.test.ts');
  await writeFile(backend, 'tests/private.test.ts', "test('AC-002', () => { expect(2).toBe(2); });");
  const readFile = fs.readFile; const reads = [];
  t.mock.method(fs, 'readFile', async (file, ...args) => { reads.push(path.resolve(String(file))); return readFile(file, ...args); });
  const result = await auditAcceptanceCriteriaTests(project, 'publishing', { requireAssertions: true });
  assert.equal(result.items[1].status, 'missing');
  assert(!reads.includes(external), 'Unauthorized test content must never reach readText');
  const outside = path.join(path.dirname(project), 'outside');
  await writeFile(outside, 'private.test.ts', "test('AC-002', () => { expect(2).toBe(2); });");
  await writeFile(project, '.aioson/repository-roots.json', JSON.stringify({ version: 1, roots: ['../cloud'] }));
  await fs.symlink(outside, path.join(backend, 'escape'), process.platform === 'win32' ? 'junction' : 'dir');
  await writeFile(project, '.aioson/context/implementation-plan-publishing.md', '# Plan\n## Capability Delivery Plan\n| CAP | Phase | Files | Verification |\n|---|---|---|---|\n| CAP-publishing | 1 | tests/local.test.js, ../cloud/escape/private.test.ts | node --test |');
  const escaped = await auditAcceptanceCriteriaTests(project, 'publishing', { requireAssertions: true });
  assert.equal(escaped.items[1].status, 'missing');
  assert(!reads.includes(path.join(backend, 'escape/private.test.ts')) && !reads.includes(path.join(outside, 'private.test.ts')), 'A declared root cannot grant a link target outside itself');
});

test('ac:test-audit ignores both strong and weak unrelated AC collisions when the feature Files scope is complete', async () => {
  const { project } = await scopedPlanFixture('tests/publishing.test.js', ['AC-001', 'AC-002', 'AC-003']);
  await writeFile(project, 'tests/publishing.test.js', "test('AC-003 publishing', () => { assert.equal(delivered(), true); });");
  await writeFile(project, 'src/pages/Settings/__tests__/VoiceSettingsPage.test.tsx', "test('AC-001 installs the voice model', () => { expect(model).toBe('Kokoro'); });\ntest('AC-002 voice empty placeholder', () => {});");
  const result = await auditAcceptanceCriteriaTests(project, 'publishing', { requireCriteria: true, requireAssertions: true });
  assert.deepEqual(result.items.map(item => item.status), ['missing', 'missing', 'covered']);
  assert.deepEqual(result.items[0].evidence, []); assert.deepEqual(result.items[1].weak_evidence, []);
  assert.equal(result.summary.test_files_scanned, 1);
});

test('ac:test-audit deduplicates planned aliases by realpath before reading their contents', async (t) => {
  const { project, backend } = await scopedPlanFixture('../cloud/tests/runtime.test.ts, ../cloud/test-alias/runtime.test.ts');
  await writeFile(project, '.aioson/repository-roots.json', JSON.stringify({ version: 1, roots: ['../cloud'] }));
  await writeFile(backend, 'tests/runtime.test.ts', "test('AC-001', () => { expect(1).toBe(1); });");
  await fs.symlink(path.join(backend, 'tests'), path.join(backend, 'test-alias'), process.platform === 'win32' ? 'junction' : 'dir');
  const readFile = fs.readFile, reads = [];
  t.mock.method(fs, 'readFile', async (file, ...args) => { if (String(file).endsWith('runtime.test.ts')) reads.push(file); return readFile(file, ...args); });
  const result = await auditAcceptanceCriteriaTests(project, 'publishing', { requireAssertions: true });
  assert.equal(result.ok, true); assert.equal(result.summary.test_files_scanned, 1); assert.equal(reads.length, 1);
  assert.equal(result.items[0].evidence[0].file, '../cloud/tests/runtime.test.ts');
});

test('ac:test-audit cannot resurrect ignored cache tests through an explicit Files entry or a safe alias', async (t) => {
  const ignored = ['node_modules', '.git', 'dist', 'build', 'coverage', '.aioson/backups'];
  const { project } = await scopedPlanFixture(['tests/publishing.test.js', ...ignored.map(dir => `${dir}/borrowed.test.js`), 'cache-alias/borrowed.test.js'].join(', '), ['AC-001', 'AC-002']);
  await writeFile(project, 'tests/publishing.test.js', "test('AC-001', () => { assert.equal(1, 1); });");
  for (const directory of ignored) await writeFile(project, `${directory}/borrowed.test.js`, "test('AC-002', () => { assert.equal(2, 2); });");
  await fs.symlink(path.join(project, 'node_modules'), path.join(project, 'cache-alias'), process.platform === 'win32' ? 'junction' : 'dir');
  const readFile = fs.readFile, reads = [];
  t.mock.method(fs, 'readFile', async (file, ...args) => { if (String(file).endsWith('borrowed.test.js')) reads.push(file); return readFile(file, ...args); });
  const result = await auditAcceptanceCriteriaTests(project, 'publishing', { requireAssertions: true });
  assert.deepEqual(result.items.map(item => item.status), ['covered', 'missing']);
  assert.equal(reads.length, 0); assert.equal(result.summary.test_files_scanned, 1);
});

test('ac:test-audit keeps local repository discovery for no-plan and legacy lane plans without a complete Files contract', async () => {
  for (const plan of [null, '# Simple lane plan\n\n## Phase 1\nImplement checkout and test locally.']) {
    const project = await makeTmpDir();
    await writeFile(project, '.aioson/context/requirements-checkout.md', 'AC-001: checkout is saved.');
    await writeFile(project, 'tests/unlisted.test.js', "test('AC-001', () => { assert.equal(1, 1); });");
    if (plan) await writeFile(project, '.aioson/context/implementation-plan-checkout.md', plan);
    const result = await auditAcceptanceCriteriaTests(project, 'checkout', { requireAssertions: true });
    assert.equal(result.ok, true); assert.equal(result.items[0].evidence[0].file, 'tests/unlisted.test.js');
    assert.equal(result.test_scope.kind, 'repository');
  }
  const { project } = await scopedPlanFixture('tests/listed.test.js');
  await writeFile(project, 'tests/unlisted.test.js', "test('AC-001', () => { assert.equal(1, 1); });");
  const planFile = path.join(project, '.aioson/context/implementation-plan-publishing.md');
  await fs.writeFile(planFile, (await fs.readFile(planFile, 'utf8')).replace('| 1 |', '| TBD |'));
  const incomplete = await auditAcceptanceCriteriaTests(project, 'publishing', { requireAssertions: true });
  assert.equal(incomplete.ok, true); assert.equal(incomplete.test_scope.kind, 'repository', 'An unresolved phase is not a complete feature Files contract');
});

test('ac:test-audit fails closed on an invalid root declaration instead of silently scanning local tests', async () => {
  const { project } = await scopedPlanFixture('tests/local.test.js');
  await writeFile(project, '.aioson/repository-roots.json', JSON.stringify({ version: 1, roots: ['..'] }));
  await writeFile(project, 'tests/local.test.js', "test('AC-001', () => { assert.equal(1, 1); });");
  const result = await auditAcceptanceCriteriaTests(project, 'publishing', { requireAssertions: true });
  assert.equal(result.ok, false); assert.equal(result.summary.test_files_scanned, 0);
  assert.equal(result.test_scope.issues[0].check, 'repository_roots_invalid');
});

test('ac:test-audit reads PHPUnit and Laravel assertion methods', async () => {
  const dir = await makeTmpDir();
  await writeFile(dir, '.aioson/context/requirements-report.md', 'AC-report-01: same numbers. AC-report-02: export route. AC-report-03: command output.');
  await writeFile(dir, 'tests/Feature/ReportTest.php', `<?php

class ReportTest extends TestCase
{
    /**
     * AC-report-01: mesmos números.
     */
    public function test_same_numbers(): void
    {
        $this->assertSame($before, $after);
    }

    // AC-report-02: rota de exportação.
    public function test_export_route(): void
    {
        $this->get('/export')->assertOk()->assertHeader('content-type', 'text/csv');
    }

    /**
     * AC-report-03: saída do comando.
     */
    public function test_command_output(): void
    {
        $this->artisan('report:build')->expectsOutput('done');
    }
}
`);

  const result = await auditAcceptanceCriteriaTests(dir, 'report', {
    requireCriteria: true,
    requireAssertions: true
  });

  assert.equal(result.ok, true, JSON.stringify(result.items.map((item) => [item.ac, item.status])));
  assert.equal(result.summary.covered, 3);
});

test('ac:test-audit does not read an assertion name in a PHP comment as an assertion', async () => {
  const dir = await makeTmpDir();
  await writeFile(dir, '.aioson/context/requirements-report.md', 'AC-report-01: same numbers.');
  await writeFile(dir, 'tests/Feature/ReportTest.php', `<?php

class ReportTest extends TestCase
{
    // AC-report-01: TODO assertSame($before, $after)
    public function test_same_numbers(): void
    {
        $report = build();
    }
}
`);

  const result = await auditAcceptanceCriteriaTests(dir, 'report', {
    requireCriteria: true,
    requireAssertions: true
  });

  assert.equal(result.ok, false);
  assert.equal(result.items[0].status, 'weak');
});

test('ac:test-audit discovers Rust tests and assertion macros', async () => {
  const dir = await makeTmpDir();
  await writeFile(dir, '.aioson/context/prd-renderer.md', '# PRD\n\nAC-renderer-01\n');
  await writeFile(dir, 'src/renderer_test.rs', `
#[test]
fn renders_frame() {
    // AC-renderer-01
    assert_eq!(2 + 2, 4);
}
`);
  const result = await auditAcceptanceCriteriaTests(dir, 'renderer', {
    requireCriteria: true,
    requireAssertions: true
  });
  assert.equal(result.ok, true);
  assert.equal(result.summary.covered, 1);
});

test('ac:test-audit reads inline Rust tests of a nested crate (Tauri src-tauri/src) and the identifier form of the AC id', async () => {
  const dir = await makeTmpDir();
  await writeFile(dir, '.aioson/context/prd-sync.md', [
    '# PRD',
    '',
    '## Acceptance Criteria',
    '| AC | CAP | Observable behavior | Evidence |',
    '|---|---|---|---|',
    '| AC-sync-07 | CAP-sync-guide | The guide block is written | Rust test |',
    '| AC-sync-08 | CAP-sync-guide | Other bytes are preserved | Rust test |',
    ''
  ].join('\n'));
  await writeFile(dir, 'src-tauri/src/sync/guide.rs', `
pub fn write() {}

#[cfg(test)]
mod tests {
    #[test]
    fn ac_sync_07_guide_is_written() {
        assert!(true);
    }

    #[test]
    fn ac_sync_070_is_another_criterion() {
        assert!(true);
    }
}
`);
  const result = await auditAcceptanceCriteriaTests(dir, 'sync', { requireCriteria: true, requireAssertions: true });
  const byAc = Object.fromEntries(result.items.map((item) => [item.ac, item]));
  assert.equal(byAc['AC-sync-07'].status, 'covered', JSON.stringify(byAc['AC-sync-07']));
  assert.equal(byAc['AC-sync-07'].evidence[0].file, 'src-tauri/src/sync/guide.rs');
  assert.equal(byAc['AC-sync-08'].status, 'missing', 'ac_sync_070 never stands in for another id');
});

test('ac:test-audit takes a PRD\'s criteria from its Acceptance Criteria table, not from another feature\'s AC cited in prose', async () => {
  const dir = await makeTmpDir();
  await writeFile(dir, '.aioson/context/prd-sync.md', [
    '# PRD',
    '',
    'This continues AC-legacy-19 from the first stage.',
    '',
    '## Acceptance Criteria',
    '| AC | CAP | Observable behavior | Evidence |',
    '|---|---|---|---|',
    '| AC-sync-01 | CAP-sync-link | Link persists (continues AC-legacy-19) | unit test |',
    ''
  ].join('\n'));
  await writeFile(dir, 'tests/sync.test.js', "test('AC-sync-01', () => { expect(1).toBe(1); });\n");
  const result = await auditAcceptanceCriteriaTests(dir, 'sync', { requireCriteria: true, requireAssertions: true });
  assert.deepEqual(result.items.map((item) => item.ac), ['AC-sync-01']);
  assert.equal(result.ok, true, JSON.stringify(result.items));
});

test('ac:test-audit does not demand tests for criteria of a deferred or not_applicable CAP', async () => {
  const dir = await makeTmpDir();
  await writeFile(dir, '.aioson/context/prd-sync.md', [
    '# PRD',
    '',
    '## Feature Capability Map',
    '| CAP | Promised outcome | Actor / trigger | Scope decision | Rationale |',
    '|---|---|---|---|---|',
    '| CAP-sync-link | Link persists | User saves | required | Core promise |',
    '| CAP-sync-chat | Chat about the link | User asks | not_applicable | Owner removed the chat |',
    '| CAP-sync-live | Real provider proof | QA with account | deferred | Next feature owns it |',
    '',
    '## Acceptance Criteria',
    '| AC | CAP | Observable behavior | Evidence |',
    '|---|---|---|---|',
    '| AC-sync-01 | CAP-sync-link | Link persists | unit test |',
    '| AC-sync-02 | CAP-sync-chat | Chat answers | unit test |',
    '| AC-sync-03 | CAP-sync-live | Provider login works | e2e |',
    '| AC-sync-04 | CAP-sync-link | Link survives restart | unit test |',
    ''
  ].join('\n'));
  await writeFile(dir, 'tests/sync.test.js', "test('AC-sync-01', () => { expect(1).toBe(1); });\n");
  const result = await auditAcceptanceCriteriaTests(dir, 'sync', { requireCriteria: true, requireAssertions: true });
  const status = Object.fromEntries(result.items.map((item) => [item.ac, item.status]));
  assert.deepEqual(status, {
    'AC-sync-01': 'covered',
    'AC-sync-02': 'out_of_scope',
    'AC-sync-03': 'out_of_scope',
    'AC-sync-04': 'missing'
  });
  assert.deepEqual(result.missing, ['AC-sync-04']);
  assert.equal(result.summary.out_of_scope, 2);
});

test('ac:test-audit reads Rust assertions that follow a lifetime', async () => {
  const dir = await makeTmpDir();
  await writeFile(dir, '.aioson/context/prd-renderer.md', '# PRD\n\nAC-renderer-01\n');
  await writeFile(dir, 'tests/renderer.rs', `
fn machine_guard() -> std::sync::MutexGuard<'static, ()> {
    LOCK.lock().unwrap()
}

#[test]
fn renders_frame() {
    // AC-renderer-01
    assert_eq!(2 + 2, 4);
}
`);

  const result = await auditAcceptanceCriteriaTests(dir, 'renderer', {
    requireCriteria: true,
    requireAssertions: true
  });

  assert.equal(result.ok, true);
  assert.equal(result.summary.covered, 1);
});

test('maskNonCode treats a Rust lifetime as code and a char literal as a literal', () => {
  const source = "fn f<'a>(c: char) -> &'a str { assert_eq!(c, 'Z'); \"BODY\" }";
  const masked = maskNonCode(source, { file: 'crates/app/src/lib.rs' });

  assert.ok(masked.includes("<'a>"), 'the lifetime must stay in the masked code');
  assert.ok(masked.includes("&'a str"), 'the lifetime must not open a literal');
  assert.ok(masked.includes('assert_eq!('), 'the assertion must survive the mask');
  assert.ok(!masked.includes('Z'), 'the char literal must be blanked');
  assert.ok(!masked.includes('BODY'), 'the string literal must be blanked');
  assert.equal(masked.length, source.length, 'the mask must preserve offsets');
});

test('maskNonCode blanks a Rust raw string without inverting the rest of the file', () => {
  const source = [
    'const FIXTURE: &str = r#"{ "id": "x", "steps": [] }"#;',
    '',
    '#[test]',
    'fn covers() {',
    '    // AC-renderer-01',
    '    assert_eq!(load(FIXTURE).steps.len(), 0);',
    '}'
  ].join('\n');
  const masked = maskNonCode(source, { file: 'crates/app/src/lib.rs' });

  assert.ok(!masked.includes('"id"'), 'the raw string body must be blanked');
  assert.ok(masked.includes('assert_eq!('), 'code after the raw string must survive');
  assert.equal(masked.length, source.length, 'the mask must preserve offsets');
});

test('maskNonCode still blanks a single-quoted string outside Rust', () => {
  const source = "const note = 'static text with assert_eq!(1, 1) inside';";

  assert.ok(!maskNonCode(source, { file: 'tests/checkout.test.js' }).includes('assert_eq!'));
  assert.ok(!maskNonCode(source).includes('assert_eq!'));
});

for (const [variant, source] of Object.entries({
  skipped: "test.skip('AC-checkout-01 payment flow', () => { assert.equal(pay(), true); });\n",
  todo: "test.todo('AC-checkout-01 assert.equal(pay(), true)');\n",
  commented: "// test('AC-checkout-01 payment flow', () => { assert.equal(pay(), true); });\n",
  string_only: "test('unrelated', () => { const note = 'AC-checkout-01 assert.equal(pay(), true)'; });\n"
})) {
  test(`ac:test-audit strict mode rejects ${variant} pseudo-evidence`, async () => {
    const dir = await makeTmpDir();
    await writeFile(dir, '.aioson/context/requirements-checkout.md', 'AC-checkout-01: user can pay.');
    await writeFile(dir, 'tests/checkout.test.js', source);

    const result = await auditAcceptanceCriteriaTests(dir, 'checkout', {
      requireCriteria: true,
      requireAssertions: true
    });

    assert.equal(result.ok, false);
    assert.equal(result.items[0].status, 'weak');
  });
}

test('ac:test-audit strict mode does not borrow an assertion from a later unrelated test', async () => {
  const dir = await makeTmpDir();
  await writeFile(dir, '.aioson/context/requirements-checkout.md', 'AC-checkout-01: payment succeeds.\n');
  await writeFile(dir, 'tests/checkout.test.js', [
    "test('AC-checkout-01 payment flow', () => {});",
    "test('unrelated health check', () => { assert.equal(health(), true); });"
  ].join('\n'));

  const result = await auditAcceptanceCriteriaTests(dir, 'checkout', {
    requireCriteria: true,
    requireAssertions: true
  });

  assert.equal(result.ok, false);
  assert.equal(result.items[0].status, 'weak');
});

test('ac:test-audit covers AC ids referenced by executable harness criteria', async () => {
  const dir = await makeTmpDir();
  await writeFile(dir, '.aioson/context/requirements-checkout.md', 'AC-checkout-02: trial can start.');
  await writeFile(dir, '.aioson/plans/checkout/harness-contract.json', JSON.stringify({
    feature: 'checkout',
    governor: {},
    criteria: [
      {
        id: 'C1',
        description: 'AC-checkout-02 is verified',
        binary: true,
        verification: 'node -e "process.exit(0)"'
      }
    ]
  }));
  const harness = await runHarnessCheck({
    args: [dir],
    options: { slug: 'checkout', json: true, strict: true },
    logger: makeLogger(),
    t: () => undefined
  });
  assert.equal(harness.ok, true);

  const result = await auditAcceptanceCriteriaTests(dir, 'checkout');

  assert.equal(result.ok, true);
  assert.equal(result.items[0].status, 'covered');
  assert.equal(result.items[0].evidence[0].criterion, 'C1');
});

test('ac:test-audit does not trust an unexecuted harness declaration', async () => {
  const dir = await makeTmpDir();
  await writeFile(dir, '.aioson/context/requirements-checkout.md', 'AC-checkout-02: trial can start.');
  await writeFile(dir, '.aioson/plans/checkout/harness-contract.json', JSON.stringify({
    feature: 'checkout',
    governor: {},
    criteria: [{
      id: 'C1',
      description: 'AC-checkout-02 is verified',
      binary: true,
      verification: 'node -e "process.exit(0)"'
    }]
  }));

  const result = await auditAcceptanceCriteriaTests(dir, 'checkout', {
    requireCriteria: true,
    requireAssertions: true
  });

  assert.equal(result.ok, false);
  assert.equal(result.items[0].status, 'missing');
});

test('ac:test-audit does not let a longer AC id cover a shorter prefix id (substring collision)', async () => {
  const dir = await makeTmpDir();
  await writeFile(
    dir,
    '.aioson/context/requirements-checkout.md',
    'AC-1: user can log in.\nAC-2: user can log out.\nAC-10: admin can disable a user.'
  );
  // Only AC-10 is cited by a test. AC-1 must NOT be marked covered just because
  // "AC-10" contains the substring "AC-1".
  await writeFile(dir, 'tests/checkout.test.js', "test('admin disable', () => { /* AC-10 */ });\n");

  const result = await auditAcceptanceCriteriaTests(dir, 'checkout');

  const byId = Object.fromEntries(result.items.map((i) => [i.ac, i.status]));
  assert.equal(byId['AC-10'], 'covered');
  assert.equal(byId['AC-1'], 'missing');
  assert.equal(byId['AC-2'], 'missing');
  assert.equal(result.ok, false);
  assert.deepEqual(result.missing.sort(), ['AC-1', 'AC-2']);
});

test('ac:test-audit blocks when an AC has no test evidence', async () => {
  const dir = await makeTmpDir();
  await writeFile(dir, '.aioson/context/requirements-checkout.md', 'AC-checkout-03: subscription status is visible.');
  await writeFile(dir, 'tests/checkout.test.js', "test('unrelated test', () => {});\n");

  const result = await auditAcceptanceCriteriaTests(dir, 'checkout');

  assert.equal(result.ok, false);
  assert.deepEqual(result.missing, ['AC-checkout-03']);
});

test('ac:test-audit --json emits report', async () => {
  const dir = await makeTmpDir();
  await writeFile(dir, '.aioson/context/requirements-checkout.md', 'AC-checkout-04: cancel trial.');
  await writeFile(dir, 'tests/checkout.test.js', "test('AC-checkout-04 cancel', () => {});\n");
  const logger = makeLogger();

  const result = await runAcTestAudit({
    args: [dir],
    options: { feature: 'checkout', json: true },
    logger
  });

  assert.equal(result.ok, true);
  const parsed = JSON.parse(logger.lines.join('\n'));
  assert.equal(parsed.summary.covered, 1);
});

test('ac:test-audit --seed emits the deterministic matrix seed list (ACs + controls + open findings)', async () => {
  const dir = await makeTmpDir();
  await writeFile(dir, '.aioson/context/prd-seeded.md', [
    '---', 'feature: seeded', '---', '# Seeded',
    '## Feature Capability Map',
    '| CAP | Promised outcome | Actor / trigger | Scope decision | Rationale |',
    '|---|---|---|---|---|',
    '| CAP-1 | order saved | user clicks save | required | core |',
    '## Acceptance Criteria',
    '| AC | CAP | Observable behavior | Evidence |',
    '|---|---|---|---|',
    '| AC-1 | CAP-1 | order persists | save test |'
  ].join('\n'));
  await writeFile(dir, '.aioson/context/implementation-plan-seeded.md', [
    '---', 'feature: seeded', 'status: approved', '---', '# Plan',
    '## Capability Delivery Plan',
    '| CAP | Phase | Files | Verification |',
    '|---|---|---|---|',
    '| CAP-1 | 1 | src/save.js | node --test tests/save.test.js |',
    '## Engineering Controls',
    '| Concern | Evidence / trigger | Planned control | Verification | Recovery |',
    '|---|---|---|---|---|',
    '| double submit | save endpoint mutates state | idempotency key | node --test tests/idem.test.js | delete duplicate row |'
  ].join('\n'));
  await writeFile(dir, '.aioson/context/security-findings-seeded.json', JSON.stringify({
    review_contract: { run_id: 'r1' },
    findings: [
      { id: 'SEC-1', title: 'open redirect', status: 'needs_validation' },
      { id: 'SEC-2', title: 'fixed one', status: 'fixed' }
    ]
  }));

  const result = await runAcTestAudit({
    args: [dir],
    options: { feature: 'seeded', seed: true, json: true },
    logger: makeLogger()
  });

  assert.ok(Array.isArray(result.seeds), 'seeds[] missing');
  const bySource = (source) => result.seeds.filter((seed) => seed.source === source);
  assert.ok(bySource('ac').some((seed) => seed.id === 'AC-1'));
  assert.ok(bySource('engineering-control').some((seed) => seed.id === 'EC-1' && /double submit/.test(seed.label)));
  assert.ok(bySource('security-finding').some((seed) => seed.id === 'SEC-1'));
  // closed findings never seed the matrix
  assert.ok(!result.seeds.some((seed) => seed.id === 'SEC-2'));

  // without --seed the payload keeps its old shape
  const plain = await runAcTestAudit({ args: [dir], options: { feature: 'seeded', json: true }, logger: makeLogger() });
  assert.ok(!('seeds' in plain));
});

// ───────────── canal QA (close-time) gated por evidência declarada no PRD ─────────────
// Repro tinta-ouro: AC visual cuja evidência declarada é smoke/medição manual,
// verificada com PASS concreto pelo QA, não pode exigir arquivo de teste ritual.
// AC que PROMETEU teste automatizado continua devendo o teste.

function prdComEvidencia(slug, rows) {
  const body = rows.map((r) => `| ${r.ac} | CAP-${slug}-01 | ${r.behavior} | ${r.evidence} |`).join('\n');
  return `# PRD\n\n## Acceptance Criteria\n\n| AC | CAP | Observable behavior | Evidence |\n|---|---|---|---|\n${body}\n`;
}

function qaComTabela(slug, rows) {
  const body = rows.map((r) => `| CAP-${slug}-01 | ${r.ac} | ${r.result} | ${r.evidence} |`).join('\n');
  return `# QA Report\n\n## CAP/AC evidence table\n\n| CAP | AC | Result | Evidence |\n|---|---|---|---|\n${body}\n`;
}

test('ac:test-audit — AC com evidência declarada manual + QA PASS concreto cobre no modo acceptQaEvidence', async () => {
  const dir = await makeTmpDir();
  await writeFile(dir, '.aioson/context/prd-skin.md', prdComEvidencia('skin', [
    { ac: 'AC-skin-01', behavior: 'CTA na dobra em 1366x768', evidence: 'Smoke visual nos dois idiomas' }
  ]));
  await writeFile(dir, '.aioson/context/qa-report-skin.md', qaComTabela('skin', [
    { ac: 'AC-skin-01', result: 'PASS', evidence: 'CTA medido em 749px, dentro da dobra em 4 viewports' }
  ]));

  const strict = await auditAcceptanceCriteriaTests(dir, 'skin', {
    requireCriteria: true,
    requireAssertions: true
  });
  assert.equal(strict.ok, false, 'sem o canal QA o AC segue missing');

  const close = await auditAcceptanceCriteriaTests(dir, 'skin', {
    requireCriteria: true,
    requireAssertions: true,
    acceptQaEvidence: true
  });
  assert.equal(close.ok, true, JSON.stringify(close.missing));
  assert.ok(close.items[0].evidence.some((e) => /QA report records concrete PASS/.test(e.evidence)));
});

test('ac:test-audit — AC que declara teste automatizado continua devendo o teste mesmo com QA PASS', async () => {
  const dir = await makeTmpDir();
  await writeFile(dir, '.aioson/context/prd-skin.md', prdComEvidencia('skin', [
    { ac: 'AC-skin-02', behavior: 'redirects respondem 301', evidence: 'Teste focado do mapa de redirects + smoke HTTP' }
  ]));
  await writeFile(dir, '.aioson/context/qa-report-skin.md', qaComTabela('skin', [
    { ac: 'AC-skin-02', result: 'PASS', evidence: 'curl -I nas 12 rotas legadas, todas 301 para o destino correto' }
  ]));

  const close = await auditAcceptanceCriteriaTests(dir, 'skin', {
    requireCriteria: true,
    requireAssertions: true,
    acceptQaEvidence: true
  });
  assert.equal(close.ok, false, 'evidência declarada automatizada exige o teste prometido');
  assert.deepEqual(close.missing, ['AC-skin-02']);
});

test('ac:test-audit — evidência QA genérica ou FAIL não conta; qa-report arquivado em done/ conta', async () => {
  const dir = await makeTmpDir();
  await writeFile(dir, '.aioson/context/done/skin/prd-skin.md', prdComEvidencia('skin', [
    { ac: 'AC-skin-03', behavior: 'banda em 366px', evidence: 'Medicao visual' },
    { ac: 'AC-skin-04', behavior: 'contraste AA', evidence: 'Inspecao manual' }
  ]));
  await writeFile(dir, '.aioson/context/done/skin/qa-report-skin.md', qaComTabela('skin', [
    { ac: 'AC-skin-03', result: 'PASS', evidence: 'pass' },
    { ac: 'AC-skin-04', result: 'FAIL', evidence: 'contraste medido 3.9:1 abaixo do AA' }
  ]));

  const close = await auditAcceptanceCriteriaTests(dir, 'skin', {
    requireCriteria: true,
    requireAssertions: true,
    acceptQaEvidence: true
  });
  assert.equal(close.ok, false);
  assert.deepEqual(close.missing.sort(), ['AC-skin-03', 'AC-skin-04']);
});

test('ac:test-audit measures the oracle of AC-cited tests — a tautology and an expected-to-fail marker are counted and printed, the coverage verdict is unchanged', async () => {
  const dir = await makeTmpDir();
  await writeFile(dir, '.aioson/context/prd-cart.md',
    '# PRD\n\n## Acceptance Criteria\n\n| AC | Behavior |\n|---|---|\n| AC-cart-01 | total shows R$ 30,00 |\n| AC-cart-02 | coupon applies |\n');
  await writeFile(dir, 'tests/cart.test.js', [
    "test('AC-cart-01 total', () => { expect(cart.total).toBe(cart.total); });",
    "test.fail('AC-cart-02 coupon (known bug)', () => { expect(apply(cart).total).toBe(27); });",
    "test('unrelated', () => { expect(other()).toBe(other()); });"
  ].join('\n'));
  await writeFile(dir, 'tests/other.test.js', "test('no AC here', () => { expect(x).toBe(x); });");

  const result = await auditAcceptanceCriteriaTests(dir, 'cart', { requireCriteria: true, requireAssertions: true });
  assert.equal(result.ok, true, 'the oracle is measured; the coverage verdict is not changed by it');
  assert.equal(result.oracle.files_scanned, 1, 'only AC-cited files are read');
  assert.equal(result.oracle.tautological, 1, 'cart.total against itself');
  assert.equal(result.oracle.self_comparison_calls, 1, 'other() against other() is a determinism check, warning tier');
  assert.equal(result.oracle.expected_failure_markers, 1);
  assert.equal(result.summary.oracle_defects, 2);
  assert.ok(result.oracle.issues.some((issue) => /tests\/cart\.test\.js:1/.test(issue)), JSON.stringify(result.oracle.issues));
  assert.ok(result.oracle.warnings.some((warning) => /expected to fail/.test(warning)));

  const logger = makeLogger();
  await runAcTestAudit({ args: [dir], options: { feature: 'cart', strict: true }, logger });
  assert.ok(logger.lines.some((line) => /Oracle of AC-cited tests/.test(line)), logger.lines.join('\n'));
  assert.ok(logger.lines.some((line) => /tautological assertion/.test(line)));

  const silent = await auditAcceptanceCriteriaTests(dir, 'nothing-here', {});
  assert.equal(silent.oracle.files_scanned, 0, 'no criteria, no oracle scan');
});
