'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const { extractDeclarations, normalizeBody } = require('../src/lib/declaration-extractor');
const { findDuplicateDeclarations, isIndexable } = require('../src/lib/duplicate-declarations');
const { runRulesCheck, discoverGovernance } = require('../src/commands/rules-check');
const { MANAGED_FILES } = require('../src/constants');
const { runAgentEpilogue } = require('../src/commands/agent-epilogue');
const { createTranslator } = require('../src/i18n');

const silent = { log() {}, error() {} };
const names = (rel, text) => extractDeclarations(rel, text).map((item) => item.name);

function scan(files, targets = Object.keys(files)) {
  return findDuplicateDeclarations({
    targets: targets.map((rel) => ({ rel, lines: files[rel].split('\n') })),
    treePaths: Object.keys(files),
    read: (rel) => files[rel]
  });
}
const flagged = (files, targets) => [...new Set(scan(files, targets).map((finding) => finding.token))].sort();

test('normalization removes what a copy may change and keeps what it may not', () => {
  assert.equal(normalizeBody(`{ return 'a'; }`), normalizeBody(`{\n  // why\n  return "a"\n}`));
  assert.equal(normalizeBody('[1, 2,]'), normalizeBody('[1,2]'));
  assert.equal(normalizeBody('86_400_000'), normalizeBody('86400000'));
  assert.equal(normalizeBody('/* note */ x'), normalizeBody('x'));
  assert.equal(normalizeBody('`plain`'), normalizeBody('"plain"'));
  assert.notEqual(normalizeBody('"a b"'), normalizeBody('"a  b"'), 'whitespace inside a string is content');
  assert.notEqual(normalizeBody('{ return 1; }'), normalizeBody('{ return 2; }'));
  assert.notEqual(normalizeBody('`a${x}`'), normalizeBody('`a${y}`'));
  assert.equal(normalizeBody('x # note\n', { hashComments: true }), 'x');
});

test('the shapes a top-level declaration takes in JS and TS', () => {
  const source = [
    'export function a(x: string): string { return x; }',
    'async function b<T extends { id: string }>(rows: T[]): Promise<T[]> { return rows; }',
    'function c(): { ok: boolean } { return { ok: true }; }',
    'function overload(a: string): string;',
    'function overload(a: unknown) { return a; }',
    'export const D = "/path";',
    'const E: Record<string, number> = { one: 1 };',
    'const f = async (x: number): Promise<number> => { return x; };',
    'const g = (x) => x + 1',
    'const H = [1, 2] as const;',
    'export class I { run() { return 1; } }',
    'const j = function (x) { return x; };',
    'const t = `',
    'function insideTemplate() { return 1; }',
    '`;',
    'function outer() {',
    '  function inner() { return 1; }',
    '  return inner;',
    '}',
    'export default function Page() { return 1; }'
  ].join('\n');
  const found = extractDeclarations('src/a.ts', source);
  assert.deepEqual(found.map((item) => item.name), ['a', 'b', 'c', 'overload', 'D', 'E', 'f', 'g', 'H', 'I', 'j', 't', 'outer']);
  assert.equal(found.find((item) => item.name === 'c').body, normalizeBody('{ return { ok: true }; }'), 'an object return type is not the block');
  assert.equal(found.find((item) => item.name === 'overload').body, normalizeBody('{ return a; }'), 'a signature has no body');
  assert.equal(found.find((item) => item.name === 'H').body, normalizeBody('[1, 2]'), 'as const describes the value');
  assert.equal(found.find((item) => item.name === 'f').kind, 'function');
  assert.equal(found.find((item) => item.name === 'D').kind, 'value');
});

test('declarations that repeat by nature are never candidates', () => {
  for (const line of [
    `const fs = require('node:fs');`,
    `const mod = await import('./x.js');`,
    `const router = express.Router();`,
    `const app = express();`,
    `const client = new Client();`,
    `const db = prisma as Client;`,
    `const other = db;`,
    `const limit = 10;`,
    `const label = "x";`,
    `const here = path.dirname(fileURLToPath(import.meta.url));`,
    `const ROOT = path.resolve(__dirname, '..');`,
    `const cwd = path.join(process.cwd(), 'x');`,
    `function noop() {}`,
    `const nothing = () => {};`
  ]) assert.deepEqual(names('src/a.js', line), [], line);

  // An exported framework convention repeats on purpose; the same name, private, is a helper.
  assert.deepEqual(names('app/a/route.ts', 'export async function GET() { return ok(); }'), []);
  assert.deepEqual(names('app/a/page.ts', 'export const dynamic = "force-dynamic";'), []);
  assert.deepEqual(names('src/a.ts', 'function config() { return 1; }'), ['config']);

  // A value over the file's own bindings is a different value in each file.
  const local = 'const port = 4000;\nconst BASE = `http://127.0.0.1:${port}`;\nconst scriptDir = path.dirname(fileURLToPath(import.meta.url));\nconst ROOT = path.resolve(scriptDir, "..");\nconst PORT_NAME = "port";';
  assert.deepEqual(names('scripts/a.mjs', local), ['PORT_NAME'], 'a word inside a plain string is not a reference');
});

test('tests, fixtures and generated files are outside the index', () => {
  for (const rel of ['tests/a.ts', 'src/a.test.ts', 'src/a.spec.tsx', 'src/__tests__/a.js', 'e2e/a.ts', 'src/a.d.ts', 'src/a.generated.ts', 'src/a.stories.tsx', 'vite.config.ts', 'pkg/a_test.go', 'app/a_test.py', 'test_a.py', 'spec/a_spec.rb', 'prisma/migrations/a.ts', 'src/a.css']) {
    assert.equal(isIndexable(rel), false, rel);
  }
  for (const rel of ['src/a.ts', 'app/page.tsx', 'lib/a.mjs', 'scripts/a.js', 'a.py', 'pkg/a.go', 'src/a.rs', 'a.php', 'a.rb']) {
    assert.equal(isIndexable(rel), true, rel);
  }
  assert.deepEqual(flagged({ 'src/a.ts': 'const LIMIT_MS = 1000;', 'tests/a.ts': 'const LIMIT_MS = 1000;' }), []);
});

test('a copy needs both the name and the normalized body', () => {
  // The constant copied into five files.
  assert.deepEqual(flagged({
    'lib/a.ts': 'const PLAN_HREF = "/plan";',
    'app/b.tsx': "export const PLAN_HREF = '/plan'",
    'app/c.tsx': 'const PLAN_HREF = "/plan";\n'
  }), ['PLAN_HREF']);

  // The same helper with a differently annotated signature.
  assert.deepEqual(flagged({
    'app/a.tsx': 'function firstValue(value: string | string[] | undefined): string {\n  return (Array.isArray(value) ? value[0] : value) ?? "";\n}\n',
    'lib/b.ts': 'function firstValue(value: RawParam): string {\n  return (Array.isArray(value) ? value[0] : value) ?? "";\n}\n'
  }), ['firstValue']);

  assert.deepEqual(flagged({
    'src/a.js': 'const twice = (x) => { return x * 2; };',
    'src/b.js': 'function twice(x) {\n  return x * 2;\n}'
  }), ['twice'], 'an arrow and a function with one block');

  assert.deepEqual(flagged({
    'src/a.js': 'const DAY_MS = 86_400_000;',
    'src/b.js': 'const DAY_MS = 86400000; // a day'
  }), ['DAY_MS']);

  // Same name, other body: no finding, in the shapes the checker must stay quiet on.
  assert.deepEqual(flagged({
    'src/a.ts': 'function byName<T extends { name: string }>(rows: T[]): T[] {\n  return [...rows].sort((l, r) => l.name.localeCompare(r.name));\n}',
    'src/b.ts': 'function byName(l: Row, r: Row) {\n  return l.name.localeCompare(r.name);\n}'
  }), []);
  assert.deepEqual(flagged({
    'app/a/route.ts': 'export async function GET() { return one(); }',
    'app/b/route.ts': 'export async function GET() { return one(); }'
  }), []);
  assert.deepEqual(flagged({ 'src/a.js': 'const DAY_MS = 86400000;', 'src/b.js': 'const DAY_MS = 24 * 60 * 60 * 1000;' }), []);
  assert.deepEqual(flagged({ 'src/a.js': 'const UNIQUE_A = 1;', 'src/b.js': 'const UNIQUE_B = 1;' }), []);
});

test('line endings are not a difference', () => {
  assert.deepEqual(flagged({
    'src/a.js': 'function sum(a, b) {\r\n  return a + b;\r\n}\r\n',
    'src/b.js': 'function sum(a, b) {\n  return a + b;\n}\n'
  }), ['sum']);
});

test('only the files under check are charged, and the index is the rest of the tree', () => {
  const files = {
    'src/new.ts': 'const LIMIT_MS = 1000;\nconst ONLY_HERE = 2;\n',
    'src/old.ts': 'const LIMIT_MS = 1000;\n',
    'src/old-too.ts': 'const LIMIT_MS = 1000;\n',
    'src/legacy-a.ts': 'const LEGACY_COPY = 3;\n',
    'src/legacy-b.ts': 'const LEGACY_COPY = 3;\n'
  };
  const findings = scan(files, ['src/new.ts']);
  assert.deepEqual(findings.map((finding) => [finding.file, finding.token, finding.line]), [['src/new.ts', 'LIMIT_MS', 1]], 'old copies between other files are not this change');
  assert.equal(findings[0].severity, 'LOW');
  assert.equal(findings[0].category, 'DUPLICATE_DECLARATION');
  assert.match(findings[0].message, /`LIMIT_MS` has the same body in 2 other file\(s\): src\/old-too\.ts:1, src\/old\.ts:1 — import one/);
  assert.equal(findings[0].snippet, 'const LIMIT_MS = 1000;');

  assert.equal(scan(files, ['src/new.ts', 'src/old.ts']).length, 2, 'each changed file answers for its own copy');
  assert.equal(scan(files).length, 5, 'a full scan charges every copy');
  assert.deepEqual(scan(files, ['tests/skip.test.ts'].filter((rel) => files[rel])), []);
  assert.deepEqual(findDuplicateDeclarations({ targets: [{ rel: 'tests/a.test.ts', lines: ['const LIMIT_MS = 1000;'] }], treePaths: ['src/old.ts'], read: (rel) => files[rel] }), [], 'a changed test charges nothing');

  const many = {};
  for (let i = 0; i < 6; i += 1) many[`src/f${i}.js`] = 'const SHARED_VALUE = 1;';
  assert.match(scan(many, ['src/f0.js'])[0].message, /in 5 other file\(s\): src\/f1\.js:1, src\/f2\.js:1, src\/f3\.js:1, src\/f4\.js:1, \+1 more/);
});

test('the other languages read their own top level', () => {
  assert.deepEqual(flagged({
    'a.py': 'import os\n\nLIMIT = 10\n\ndef double(x):\n    # why\n    return x * 2\n\nclass Box:\n    size = 1\n',
    'b.py': 'LIMIT = 10  # same\n\n\ndef double(x):\n    return x * 2\n\n\nclass Box:\n    size = 1\n\nprint(1)\n'
  }), ['Box', 'LIMIT', 'double']);
  assert.deepEqual(flagged({ 'a.py': 'def f(x):\n    return 1\n', 'b.py': 'def f(x):\n    return 2\n' }), []);
  assert.deepEqual(flagged({
    'a.go': 'package a\n\nconst Limit = 10\n\nfunc Double(x int) int {\n\treturn x * 2\n}\n\nfunc (s *S) Method() int { return 1 }\n',
    'b.go': 'package b\n\nconst Limit = 10\n\nfunc Double(x int) (int) {\n\treturn x * 2\n}\n\nfunc (t *T) Method() int { return 1 }\n'
  }), ['Double', 'Limit'], 'a method is not a top-level function');
  assert.deepEqual(flagged({
    'a.rs': 'pub const LIMIT: u32 = 10;\n\npub fn double(x: u32) -> u32 {\n    x * 2\n}\n',
    'b.rs': 'const LIMIT: u32 = 10;\n\nfn double(x: u32) -> u32 {\n    x * 2\n}\n'
  }), ['LIMIT', 'double']);
  assert.deepEqual(flagged({
    'a.php': '<?php\nfunction double($x) {\n    return $x * 2;\n}\n',
    'b.php': '<?php\nfunction double($x) {\n    return $x * 2;\n}\n'
  }), ['double']);
  assert.deepEqual(flagged({
    'a.rb': 'LIMIT = 10\n\ndef double(x)\n  x * 2\nend\n',
    'b.rb': 'LIMIT = 10\n\ndef double(x)\n  x * 2\nend\n\nputs 1\n'
  }), ['LIMIT', 'double']);
});

async function project(t, files) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'aioson-duplicates-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  for (const [rel, body] of Object.entries(files)) {
    await fs.mkdir(path.dirname(path.join(root, rel)), { recursive: true });
    await fs.writeFile(path.join(root, rel), body, 'utf8');
  }
  return root;
}
const DOC = '---\nname: duplicate-declarations\nenforcement: [duplicate-declaration]\n---\n# Doc\n';
const COPIES = { 'src/a.ts': 'const LIMIT_MS = 1000;\n', 'src/b.ts': 'const LIMIT_MS = 1000;\n', 'src/gone.ts': 'const OTHER = 2;\n' };

test('rules:check reports the checker only when a document declares it, and it never blocks', async (t) => {
  const undeclared = await project(t, COPIES);
  assert.equal((await runRulesCheck({ args: [undeclared], options: { json: true, suppressExitCode: true }, logger: silent })).total, 0);

  const root = await project(t, { ...COPIES, '.aioson/docs/quality/duplicate-declarations.md': DOC });
  const report = await runRulesCheck({ args: [root], options: { json: true, suppressExitCode: true }, logger: silent });
  assert.equal(report.ok, true);
  assert.equal(report.by_severity.LOW, 2);
  assert.equal(report.by_severity.HIGH, 0);
  assert.equal(report.by_severity.MED, 0);
  assert.equal(report.findings[0].checker, 'duplicate-declaration');
  assert.equal(report.findings[0].authority, 'advisory');

  const strict = await runRulesCheck({ args: [root], options: { json: true, strict: true, suppressExitCode: true }, logger: silent });
  assert.equal(strict.ok, true, 'a LOW does not block, not even under --strict');

  const lines = [];
  await runRulesCheck({ args: [root], options: { suppressExitCode: true }, logger: { log: (line) => lines.push(String(line)), error() {} } });
  assert.ok(lines.some((line) => /\[LOW\] src\/a\.ts:1 — `LIMIT_MS` has the same body/.test(line)), lines.join('\n'));
  assert.ok(lines.some((line) => /RULES=OK \(no rule broken; advisory findings/.test(line)), lines.join('\n'));

  // Bound by a rule it stays advisory in effect: a copy is never law by itself.
  const ruled = await project(t, { ...COPIES, '.aioson/rules/no-copies.md': DOC.replace('duplicate-declarations', 'no-copies') });
  const bound = await runRulesCheck({ args: [ruled], options: { json: true, strict: true, suppressExitCode: true }, logger: silent });
  assert.equal(bound.ok, true);
  assert.equal(bound.by_severity.LOW, 2);

  // --paths scopes the targets while the whole tree stays the index.
  const scoped = await runRulesCheck({ args: [root], options: { json: true, paths: 'src/a.ts', suppressExitCode: true }, logger: silent });
  assert.deepEqual(scoped.findings.map((finding) => finding.file), ['src/a.ts']);

  // Accepted debt is keyed per file and name.
  await runRulesCheck({ args: [root], options: { json: true, baseline: true, suppressExitCode: true }, logger: silent });
  const after = await runRulesCheck({ args: [root], options: { json: true, suppressExitCode: true }, logger: silent });
  assert.equal(after.total, 0);
  assert.equal(after.accepted_debt, 2);
});

test('the framework ships the declaring doc: template, mirror and managed list agree', async () => {
  const root = path.resolve(__dirname, '..');
  const rel = '.aioson/docs/quality/duplicate-declarations.md';
  const docs = await discoverGovernance(path.join(root, 'template'));
  const doc = docs.find((item) => item.path === rel);
  assert.ok(doc, 'the template doc must exist and be discovered');
  assert.deepEqual(doc.enforcements, ['duplicate-declaration']);
  assert.equal(doc.authority, 'advisory');
  assert.equal(MANAGED_FILES.includes(rel), true);
  assert.equal(await fs.readFile(path.join(root, rel), 'utf8'), await fs.readFile(path.join(root, 'template', rel), 'utf8'));
  for (const file of ['template/.aioson/docs/dev/phase-loop.md', '.aioson/docs/dev/phase-loop.md']) {
    assert.match(await fs.readFile(path.join(root, file), 'utf8'), /duplicate-declaration/);
  }
});

test('a copy stays inside its language family', () => {
  assert.deepEqual(flagged({ 'a.py': 'MAX_RETRIES = 3\n', 'b.js': 'const MAX_RETRIES = 3;\n' }), [], 'nobody imports a Python constant from JS');
  assert.deepEqual(flagged({ 'a.rs': 'pub const MAX_SIZE: u32 = 1024;\n', 'b.ts': 'export const MAX_SIZE = 1024;\n' }), []);
  assert.deepEqual(flagged({ 'a.go': 'const MaxSize = 10\n', 'b.php': '<?php\nconst MaxSize = 10;\n' }), []);
  assert.deepEqual(flagged({ 'a.ts': 'export const MAX_SIZE = 1024;\n', 'b.mjs': 'const MAX_SIZE = 1024;\n', 'c.jsx': 'const MAX_SIZE = 1024;\n' }), ['MAX_SIZE'], 'TS reads JS');
});

test('exact means exact: a regex is one token, and a floor division is no comment', () => {
  const pair = (a, b) => flagged({ 'a.js': a, 'b.js': b });
  assert.deepEqual(pair('function f(s){return s.replace(/\\/\\//, "a")}\n', 'function f(s){return s.replace(/\\/\\//, "b")}\n'), [], '// inside a regex');
  assert.deepEqual(pair('function f(s){const r=s.replace(/\\/*/g,"");return r+1}\n', 'function f(s){const r=s.replace(/\\/*/g,"");return r+2}\n'), [], '/* inside a regex');
  assert.deepEqual(pair('function f(s){\n  const r=s.replace(/\\/*/g,"");\n  return r+1;\n}\n', 'function f(s){\n  const r=s.replace(/\\/*/g,"");\n  return r+2;\n}\n'), [], 'across lines');
  assert.deepEqual(pair('function f(s){return /^https?:\\/\\//.test(s) ? 1 : 2}\n', 'function f(s){return /^https?:\\/\\//.test(s) ? 1 : 3}\n'), []);
  assert.deepEqual(pair('function f(s){return /a/.test(s)}\n', 'function f(s){return /b/.test(s)}\n'), [], 'two regexes differ');
  assert.deepEqual(pair('function f(s){return /a  b/.test(s)}\n', 'function f(s){return /a b/.test(s)}\n'), [], 'spaces in a regex are content');
  assert.deepEqual(pair('function f(s){return /[/]x/.test(s) ? 1 : 2}\n', 'function f(s){return /[/]x/.test(s) ? 1 : 3}\n'), [], 'a slash in a class closes nothing');
  assert.deepEqual(pair('function f(s){return /a/g.test(s) ? 1 : 2}\n', 'function f(s) {\n  // a note\n  return /a/g.test(s) ? 1 : 2;\n}\n'), ['f'], 'an equal regex still matches');
  assert.deepEqual(pair('function half(a, b) { return a / b / 2; }\n', 'function half(a, b) { return a / b / 3; }\n'), [], 'division is not a regex');
  assert.equal(normalizeBody('a / b / c'), normalizeBody('a/b/c'));

  // Text with a URL in JSX, on its own line.
  const jsx = (host) => `export function Nav() {\n  return (\n    <a>\n      see http://${host}.test now\n    </a>\n  );\n}\n`;
  assert.deepEqual(flagged({ 'a.tsx': jsx('a'), 'b.tsx': jsx('b') }), []);
  assert.deepEqual(flagged({ 'a.tsx': jsx('a'), 'b.tsx': jsx('a') }), ['Nav']);
  assert.equal(normalizeBody('x // a comment\ny'), normalizeBody('x y'));
  assert.equal(normalizeBody('{ a: // note\n 1 }'), normalizeBody('{ a: 1 }'));

  assert.deepEqual(flagged({ 'a.py': 'def f(a):\n    return a // 2\n', 'b.py': 'def f(a):\n    return a // 3\n' }), [], 'a floor division in Python');
});

test('a byte order mark does not hide the first line', () => {
  assert.deepEqual(flagged({ 'a.js': '\uFEFFconst TABLE = [1, 2, 3];\n', 'b.js': 'const TABLE = [1, 2, 3];\n' }), ['TABLE']);
  assert.deepEqual(flagged({ 'a.js': '\uFEFFfunction f(a){return a}\n', 'b.js': '\uFEFFfunction f(a){return a}\n' }), ['f']);
  const [finding] = scan({ 'a.js': '\uFEFFconst TABLE = [1, 2, 3];\n', 'b.js': 'const TABLE = [1, 2, 3];\n' }, ['a.js']);
  assert.equal(finding.snippet, 'const TABLE = [1, 2, 3];');
});

test('what the block means has to match: parameters and the file\'s own names', () => {
  const pair = (a, b) => flagged({ 'a.js': a, 'b.js': b });
  assert.deepEqual(pair('function sub(a,b){return a-b}\n', 'function sub(b,a){return a-b}\n'), [], 'parameters swapped');
  assert.deepEqual(pair('function f(a){return 1}\n', 'function f(b){return 1}\n'), ['f'], 'an unused parameter is not part of it');
  assert.deepEqual(pair('function f(a, s = 200){return s}\n', 'function f(a, s = 400){return s}\n'), [], 'another default');
  assert.deepEqual(pair('function f(a, s = 200){return s}\n', 'function f(b, s = 200){return s;}\n'), ['f']);
  assert.deepEqual(pair('const f = (a, b) => a - b;\n', 'const f = (b, a) => a - b;\n'), [], 'an arrow too');
  assert.deepEqual(pair('const f = a => a + 1;\n', 'function f(a) { return a + 1; }\n'), [], 'an expression is not a block');
  assert.deepEqual(flagged({ 'a.ts': 'function f(a: string, b: number): string { return a + b; }\n', 'b.ts': 'function f(a: unknown, b: Map<string, number>) { return a + b; }\n' }), ['f'], 'annotations of any shape');
  assert.deepEqual(flagged({ 'a.ts': 'function f({ a, b }: Props) { return a + b; }\n', 'b.ts': 'function f({ a, b }: Other) { return a + b; }\n' }), ['f'], 'a destructured parameter');
  assert.deepEqual(flagged({ 'a.go': 'package a\n\nfunc Sub(a int, b int) int {\n\treturn a - b\n}\n', 'b.go': 'package b\n\nfunc Sub(b int, a int) int {\n\treturn a - b\n}\n' }), []);
  assert.deepEqual(flagged({ 'a.php': '<?php\nfunction sub(int $a, int $b) {\n    return $a - $b;\n}\n', 'b.php': '<?php\nfunction sub(int $b, int $a) {\n    return $a - $b;\n}\n' }), []);
  assert.deepEqual(flagged({ 'a.py': 'def sub(a, b):\n    return a - b\n', 'b.py': 'def sub(b, a):\n    return a - b\n' }), []);

  // A function over a constant of its own file: the value decides.
  assert.deepEqual(pair('const LIMIT = 1;\nfunction f(){return LIMIT}\n', 'const LIMIT = 2;\nfunction f(){return LIMIT}\n'), [], 'another value, another function');
  assert.deepEqual(pair('const limit = 1;\nfunction f(){return limit}\n', 'const limit = 2;\nfunction f(){return limit}\n'), [], 'a scalar that is not a candidate still counts as a value');
  assert.deepEqual(pair('const LIMIT = 1;\nfunction f(){return LIMIT}\n', 'const LIMIT = 1;\nfunction f(){return LIMIT}\n').sort(), ['LIMIT', 'f'], 'the same value, two copies');
  assert.deepEqual(pair('function g(){return 1}\nfunction f(){return g()}\n', 'function g(){return 2}\nfunction f(){return g()}\n'), [], 'a helper of its own');
  // A word that is not a read: a regex flag, a property, a string.
  assert.deepEqual(pair('function f(s){return s.replace(/a/g,"")}\nfunction g(){return 1}\n', 'function f(s){return s.replace(/a/g,"")}\nfunction g(){return 2}\n'), ['f'], 'a regex flag');
  assert.deepEqual(pair('function f(s){return s.g}\nfunction g(){return 1}\n', 'function f(s){return s.g}\nfunction g(){return 2}\n'), ['f'], 'a property');
  assert.deepEqual(pair('function f(){return "g"}\nfunction g(){return 1}\n', 'function f(){return "g"}\nfunction g(){return 2}\n'), ['f'], 'a string');
  assert.deepEqual(pair('const P = 1;\nfunction f(){return `v${P}`}\n', 'const P = 2;\nfunction f(){return `v${P}`}\n'), [], 'a template does read');
  assert.deepEqual(pair('function f(){return imported()}\n', 'function f(){return imported()}\n'), ['f'], 'a name from elsewhere is not the file\'s own');
});

test('classes are read where the doc says they are', () => {
  assert.deepEqual(flagged({ 'a.rb': 'class Box\n  def x; 1; end\nend\n', 'b.rb': 'class Box\n  def x; 1; end\nend\n' }), ['Box']);
  assert.deepEqual(flagged({ 'a.rb': 'class Box < A\n  def x; 1; end\nend\n', 'b.rb': 'class Box < B\n  def x; 1; end\nend\n' }), [], 'another parent');
  assert.deepEqual(flagged({ 'a.php': '<?php\nclass Box { public $x = 1; }\n', 'b.php': '<?php\nclass Box { public $x = 1; }\n' }), ['Box']);
  assert.deepEqual(flagged({ 'a.php': '<?php\nfinal class Box { public $x = 1; }\n', 'b.php': '<?php\nfinal class Box { public $x = 1; }\n' }), ['Box']);
  assert.deepEqual(flagged({ 'a.php': '<?php\nclass A {\n  function f() { return 1; }\n}\n', 'b.php': '<?php\nclass B {\n  function f() { return 1; }\n}\n' }), [], 'a method is not top level');
  assert.deepEqual(flagged({ 'a.py': 'class Box(A):\n    size = 1\n', 'b.py': 'class Box(B):\n    size = 1\n' }), []);
});

test('what used to take quadratic time stays linear', () => {
  const timed = (a, b = a) => {
    const started = Date.now();
    const found = scan({ 'a.js': a, 'b.js': b });
    return { found, ms: Date.now() - started };
  };
  const lines = (n, make) => Array.from({ length: n }, (_, i) => make(i)).join('\n');
  // Each of these took tens of seconds or more.
  const budget = 8000;
  const noInit = timed(lines(20000, (i) => `let v_${i}`));
  assert.ok(noInit.ms < budget, `let with no initializer: ${noInit.ms} ms`);
  assert.equal(noInit.found.length, 0);
  const manyFindings = timed(lines(15000, (i) => `export const NAME_${i} = [${i}];`));
  assert.ok(manyFindings.ms < budget, `one split per finding: ${manyFindings.ms} ms`);
  assert.equal(manyFindings.found.length, 30000);
  const spaces = timed(`const DATA = "a"${' '.repeat(200000)}+ "b";`);
  assert.ok(spaces.ms < budget, `a whitespace run: ${spaces.ms} ms`);
  assert.equal(spaces.found.length, 2);
  const suffix = extractDeclarations('a.ts', 'const A = [1] as const;\nconst B = { a: 1 } satisfies Thing;\n');
  assert.equal(suffix[0].body, normalizeBody('[1]'));
  assert.equal(suffix[1].body, normalizeBody('{ a: 1 }'));
});

test('the known limit is written where a reader meets it', async () => {
  const repo = path.resolve(__dirname, '..');
  // Same name, other body: the two the incident's QA found by hand, and this check does not.
  assert.deepEqual(flagged({
    'a.ts': 'function useLicenseDate() {\n  const locale = useLocale();\n  const format = useMemo(() => new Intl.DateTimeFormat(locale), [locale]);\n  return (iso: string) => format.format(new Date(iso));\n}\n',
    'b.ts': 'function useLicenseDate() {\n  const locale = useLocale();\n  const format = new Intl.DateTimeFormat(locale);\n  return (iso: string) => format.format(new Date(iso));\n}\n'
  }), []);
  for (const rel of ['template/.aioson/docs/quality/duplicate-declarations.md', '.aioson/docs/quality/duplicate-declarations.md', '.aioson/learnings/gotchas/large-plan-ran-without-a-measure.md']) {
    const text = await fs.readFile(path.join(repo, rel), 'utf8');
    assert.match(text, /useLicenseDate/, rel);
    assert.match(text, /byName/, rel);
  }
});

test('agent:epilogue tells the Dev about a LOW copy, and does not fail for it', async (t) => {
  const root = await project(t, { ...COPIES, '.aioson/docs/quality/duplicate-declarations.md': DOC });
  const result = await runAgentEpilogue({
    args: [root],
    options: { json: true, agent: 'dev', summary: 'Phase done', 'no-dossier': true },
    logger: silent,
    t: createTranslator('en').t
  });
  const step = result.steps.find((item) => item.name === 'rules:check');
  assert.ok(step, JSON.stringify(result.steps.map((item) => item.name)));
  assert.equal(step.ok, true);
  assert.match(step.reason, /2 LOW worth a second look/);
});

test('a line or a file built to backtrack stays linear, and real code is read whole', () => {
  const rep = (text, size = 400000) => text.repeat(Math.ceil(size / text.length));
  const inputs = {
    'a.js': [`const A = ${rep('(/[')};\n`, `const A = ${rep('/ ')};\n`, `function a() { return \`${rep('${')}\`; }\n`, rep('function a(\n'), rep('function a<\n'), rep('const A = {\n'), rep('class A\n'), `const A =${rep(' ')}1;\n`],
    'a.py': [`def a(${rep('(')}\n`, rep('def a(\n'), `A = ${rep('[')}\n`]
  };
  for (const [rel, cases] of Object.entries(inputs)) {
    for (const text of cases) {
      const started = Date.now();
      extractDeclarations(rel, text);
      assert.ok(Date.now() - started < 4000, `${rel} ${JSON.stringify(text.slice(0, 16))} took ${Date.now() - started} ms`);
    }
  }
  const count = 5000;
  const real = Array.from({ length: count }, (_, i) => `export function f${i}(a: string): string {\n  return a + ${i};\n}\n\nexport const C${i} = { a: ${i} };\n`).join('\n');
  assert.equal(extractDeclarations('a.ts', real).length, count * 2, 'the budget never touches a balanced file');
});

test('a template reads what is inside its ${}, and not the $ of the opener', () => {
  const copies = (one, two) => findDuplicateDeclarations({
    targets: [{ rel: 'src/a.js', lines: one.split('\n') }],
    treePaths: ['src/a.js', 'src/b.js'],
    read: () => two
  }).length;
  const helper = 'const $ = (id) => document.getElementById(id);';
  const body = 'function label(x) {\n  return `${x}!`;\n}';
  assert.equal(copies(`${helper}\n${body}`, body), 1);
  const reads = 'const prefix = compute();\nfunction label(x) {\n  return `${prefix}${x}`;\n}';
  assert.equal(copies(reads, 'const prefix = other();\nfunction label(x) {\n  return `${prefix}${x}`;\n}'), 0);
});
