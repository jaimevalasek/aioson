'use strict';

// SG-* static criteria — build-independent must_match / must_not_match + parse-check.
// must_match is OR-across-files; must_not_match is absent-in-all.
// Pure fs + RegExp + node --check, cross-platform.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const {
  isStaticCriterion,
  patternTester,
  parseCheckFile,
  evaluateStaticCriterion,
  evaluateStaticCriteria
} = require('../src/harness/static-criteria');
const { validateContract } = require('../src/harness/contract-schema');
const { evaluateContractIntegrityGate } = require('../src/harness/contract-integrity-gate');
const { runHarnessCheck } = require('../src/commands/harness-check');

async function tmp() {
  return fs.mkdtemp(path.join(os.tmpdir(), 'aioson-sg-'));
}
async function write(dir, rel, content) {
  const full = path.join(dir, rel);
  await fs.mkdir(path.dirname(full), { recursive: true });
  await fs.writeFile(full, content, 'utf8');
  return full;
}
function makeLogger() {
  const lines = [];
  const errors = [];
  return { log: (m = '') => lines.push(String(m)), error: (m = '') => errors.push(String(m)), lines, errors };
}

// ───────────────────────── pure helpers ─────────────────────────

test('isStaticCriterion: true only when must_match/must_not_match present', () => {
  assert.ok(isStaticCriterion({ id: 'SG-1', must_match: ['x'], files: ['a.ts'] }));
  assert.ok(isStaticCriterion({ id: 'SG-2', must_not_match: ['y'], files: ['a.ts'] }));
  assert.ok(!isStaticCriterion({ id: 'C1', verification: 'npm test' }));
  assert.ok(!isStaticCriterion({ id: 'C2', must_match: [] })); // empty doesn't count
  assert.ok(!isStaticCriterion(null));
});

test('patternTester: valid regex tests as regex; invalid regex falls back to literal substring', () => {
  assert.ok(patternTester('requireAuth\\(')('app.use(requireAuth())'));
  assert.ok(!patternTester('requireAuth\\(')('app.use(other())'));
  // "foo(" is an invalid regex (unterminated group) → literal substring test
  const lit = patternTester('foo(');
  assert.ok(lit('const x = foo(1)'));
  assert.ok(!lit('const x = bar(1)'));
});

test('parseCheckFile: JSON / JS valid + invalid; .ts skipped', async () => {
  const dir = await tmp();
  const okJson = await write(dir, 'a.json', '{"a":1}');
  const badJson = await write(dir, 'b.json', '{ not json ');
  const okJs = await write(dir, 'c.js', 'module.exports = () => 1;\n');
  const badJs = await write(dir, 'd.js', 'const = ;\n'); // syntax error
  const ts = await write(dir, 'e.ts', 'const x: number = 1;');

  assert.equal(parseCheckFile(okJson).ok, true);
  assert.equal(parseCheckFile(badJson).ok, false);
  assert.equal(parseCheckFile(okJs).ok, true);
  assert.equal(parseCheckFile(badJs).ok, false);
  const tsCheck = parseCheckFile(ts);
  assert.equal(tsCheck.checked, false, '.ts has no stdlib parser — skipped, not failed');
  assert.equal(tsCheck.ok, true);
});

// ───────────────────────── must_match OR-across-files ─────────────────────────

test('must_match passes when each pattern appears in at least one file (OR-across-files)', async () => {
  const dir = await tmp();
  await write(dir, 'routes/auth.ts', 'export const authRouter = Router();\napp.use(requireAuth());');
  await write(dir, 'routes/util.ts', 'export function helper() {}');
  const res = evaluateStaticCriterion(
    { id: 'SG-1', files: ['routes/auth.ts', 'routes/util.ts'], must_match: ['requireAuth\\(', 'helper'] },
    dir
  );
  assert.equal(res.ok, true, res.detail || '');
  assert.equal(res.must_match_misses.length, 0);
});

test('must_match fails and lists the missing pattern', async () => {
  const dir = await tmp();
  await write(dir, 'routes/auth.ts', 'export const authRouter = Router();');
  const res = evaluateStaticCriterion(
    { id: 'SG-1', files: ['routes/auth.ts'], must_match: ['requireAuth\\('] },
    dir
  );
  assert.equal(res.ok, false);
  assert.deepEqual(res.must_match_misses, ['requireAuth\\(']);
  assert.match(res.detail, /must_match not found/);
});

// ───────────────────────── must_not_match absent-in-all ─────────────────────────

test('must_not_match passes when no forbidden pattern is present', async () => {
  const dir = await tmp();
  await write(dir, 'svc.ts', 'export const x: number = 1;');
  const res = evaluateStaticCriterion(
    { id: 'SG-2', files: ['svc.ts'], must_not_match: ['as any', 'TODO', 'not implemented'] },
    dir
  );
  assert.equal(res.ok, true, res.detail || '');
});

test('must_not_match fails and points at the offending file', async () => {
  const dir = await tmp();
  await write(dir, 'svc.ts', 'const y = z as any; // TODO later');
  const res = evaluateStaticCriterion(
    { id: 'SG-2', files: ['svc.ts'], must_not_match: ['as any', 'TODO'] },
    dir
  );
  assert.equal(res.ok, false);
  assert.equal(res.must_not_match_hits.length, 2);
  assert.ok(res.must_not_match_hits.every((h) => h.file === 'svc.ts'));
});

// ───────────────────────── missing files + parse-check ─────────────────────────

test('missing declared file is a failure', async () => {
  const dir = await tmp();
  const res = evaluateStaticCriterion(
    { id: 'SG-3', files: ['nope.ts'], must_match: ['x'] },
    dir
  );
  assert.equal(res.ok, false);
  assert.deepEqual(res.missing_files, ['nope.ts']);
});

test('parse-check failure (truncated JSON) fails the criterion even when patterns match', async () => {
  const dir = await tmp();
  await write(dir, 'data.json', '{ "a": 1, "b":'); // truncated mid-write
  const res = evaluateStaticCriterion(
    { id: 'SG-4', files: ['data.json'], must_match: ['"a"'] },
    dir
  );
  assert.equal(res.ok, false);
  assert.equal(res.parse_failures.length, 1);
  assert.match(res.detail, /invalid JSON/);
});

test('evaluateStaticCriteria ignores runtime (verification) criteria, aggregates static ones', async () => {
  const dir = await tmp();
  await write(dir, 'a.ts', 'export const ok = true;');
  const out = evaluateStaticCriteria({
    criteria: [
      { id: 'RG-build', binary: true, verification: 'npm run build' },
      { id: 'SG-1', files: ['a.ts'], must_match: ['export const ok'] },
      { id: 'SG-2', files: ['a.ts'], must_not_match: ['as any'] }
    ],
    cwd: dir
  });
  assert.equal(out.total, 2, 'only the two SG-* criteria counted');
  assert.equal(out.ok, true);
  assert.equal(out.failed, 0);
});

// ───────────────────────── schema validation ─────────────────────────

test('schema: valid static criterion passes with NO binary verification-debt warning', () => {
  const r = validateContract({
    feature: 'x',
    governor: {},
    criteria: [{ id: 'SG-1', binary: true, files: ['a.ts'], must_match: ['foo'], must_not_match: ['TODO'] }]
  });
  assert.equal(r.ok, true, JSON.stringify(r.errors));
  assert.equal(r.warnings.length, 0, 'a static binary criterion is deterministically checkable — not verification debt');
});

test('schema: static criterion without files[] is an error', () => {
  const r = validateContract({
    feature: 'x', governor: {},
    criteria: [{ id: 'SG-1', must_match: ['foo'] }]
  });
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => e.field === 'criteria[0].files'));
});

test('schema: a criterion cannot be both runtime (verification) and static (patterns)', () => {
  const r = validateContract({
    feature: 'x', governor: {},
    criteria: [{ id: 'SG-1', files: ['a.ts'], must_match: ['foo'], verification: 'npm test' }]
  });
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => e.field === 'criteria[0].verification' && /either runtime .* or static/.test(e.reason)));
});

test('schema: must_match must be an array of non-empty strings', () => {
  const r = validateContract({
    feature: 'x', governor: {},
    criteria: [{ id: 'SG-1', files: ['a.ts'], must_match: ['ok', ''] }]
  });
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => e.field === 'criteria[0].must_match[1]'));
});

// ───────────────────── contract-integrity gate integration ─────────────────────

async function scaffoldContract(dir, slug, criteria) {
  const planDir = path.join(dir, '.aioson', 'plans', slug);
  await fs.mkdir(planDir, { recursive: true });
  await fs.writeFile(
    path.join(planDir, 'harness-contract.json'),
    JSON.stringify({ feature: slug, governor: {}, criteria }, null, 2),
    'utf8'
  );
  return planDir;
}

test('gate (runChecks:false) BLOCKS on a failing static criterion — build-independent', async () => {
  const dir = await tmp();
  await write(dir, 'src/auth.ts', 'export const authRouter = Router(); // TODO wire middleware');
  await scaffoldContract(dir, 'feat', [
    { id: 'SG-1', files: ['src/auth.ts'], must_match: ['requireAuth\\('], must_not_match: ['TODO'] }
  ]);
  const res = await evaluateContractIntegrityGate(dir, 'feat', { runChecks: false, changedFiles: [] });
  assert.equal(res.ok, false);
  assert.ok(res.errors.some((e) => e.code === 'static_criteria_failed'));
});

test('gate (runChecks:false) PASSES when the static criterion is satisfied', async () => {
  const dir = await tmp();
  await write(dir, 'src/auth.ts', 'export const authRouter = Router();\napp.use(requireAuth());');
  await scaffoldContract(dir, 'feat', [
    { id: 'SG-1', files: ['src/auth.ts'], must_match: ['requireAuth\\('], must_not_match: ['TODO'] }
  ]);
  const res = await evaluateContractIntegrityGate(dir, 'feat', { runChecks: false, changedFiles: [] });
  assert.equal(res.ok, true, JSON.stringify(res.errors));
});

// ───────────────────────── harness:check report ─────────────────────────

test('harness:check report includes static_* counts and gates report.ok on SG-* failure', async () => {
  const dir = await tmp();
  await write(dir, 'src/auth.ts', 'export const authRouter = Router(); // as any leak');
  await scaffoldContract(dir, 'feat', [
    { id: 'SG-1', files: ['src/auth.ts'], must_not_match: ['as any'] }
  ]);
  const logger = makeLogger();
  const report = await runHarnessCheck({
    args: [dir],
    options: { slug: 'feat', json: true },
    logger,
    t: () => undefined
  });
  assert.equal(report.static_total, 1);
  assert.equal(report.static_failed, 1);
  assert.equal(report.ok, false);
  assert.ok(Array.isArray(report.static_checks));
  assert.equal(report.skipped_no_verification, 0, 'a static criterion is not counted as unverified');
});
