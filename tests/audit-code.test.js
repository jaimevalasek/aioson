'use strict';

// aioson audit:code — deterministic, build-free code-quality scan (the
// non-security half of a categorized code-quality audit, pure Node).

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const fssync = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { runAuditCode, scanCodeQuality, parseCategories, ALL_CATEGORIES } = require('../src/commands/audit-code');
const { parseArgv } = require('../src/parser');

async function tmp() {
  return fs.mkdtemp(path.join(os.tmpdir(), 'aioson-ac-'));
}
async function write(dir, rel, content) {
  const full = path.join(dir, rel);
  await fs.mkdir(path.dirname(full), { recursive: true });
  await fs.writeFile(full, content, 'utf8');
}
function makeLogger() {
  const lines = [];
  return { log: (m = '') => lines.push(String(m)), error: (m = '') => lines.push(String(m)), lines };
}
const all = new Set(ALL_CATEGORIES);

test('parseCategories: default = all; filters to valid; invalid falls back to all', () => {
  assert.deepEqual([...parseCategories(null)].sort(), [...ALL_CATEGORIES].sort());
  assert.deepEqual([...parseCategories('todo,anti_pattern')].sort(), ['ANTI_PATTERN', 'TODO']);
  assert.deepEqual([...parseCategories('nonsense')].sort(), [...ALL_CATEGORIES].sort());
});

test('TODO: flags TODO/FIXME/placeholder/not-implemented', async () => {
  const dir = await tmp();
  await write(dir, 'src/a.ts', 'export const x = 1; // TODO wire this\nfunction f() { /* FIXME */ }\n');
  const { findings } = scanCodeQuality({ targetDir: dir, categories: all });
  const todos = findings.filter((f) => f.category === 'TODO');
  assert.ok(todos.length >= 2, `expected >=2 TODO findings, got ${todos.length}`);
});

test('ANTI_PATTERN: eval/innerHTML are HIGH; `: any` is MED with any-ok escape; console.log prod-only', async () => {
  const dir = await tmp();
  await write(dir, 'src/danger.ts', [
    'const r = eval("1+1");',
    'el.innerHTML = userInput;',
    'const a: any = 1;',
    'const b: any = 2; // any-ok escape hatch',
    'console.log("prod log");'
  ].join('\n'));
  await write(dir, 'tests/x.test.ts', 'console.log("test log is fine");\n');

  const { findings } = scanCodeQuality({ targetDir: dir, categories: all });
  const anti = findings.filter((f) => f.category === 'ANTI_PATTERN');
  assert.ok(anti.some((f) => f.severity === 'HIGH' && /eval/.test(f.message)));
  assert.ok(anti.some((f) => f.severity === 'HIGH' && /innerHTML/.test(f.message)));
  const anyHits = anti.filter((f) => /: any/.test(f.message));
  assert.equal(anyHits.length, 1, '`: any` flagged once; the // any-ok line is skipped');
  const consoleHits = anti.filter((f) => /console\.log/.test(f.message));
  assert.equal(consoleHits.length, 1, 'console.log flagged in prod file only, not in the .test.ts file');
});

test('DEAD_CODE: unused named import flagged; used + re-exported imports are not', async () => {
  const dir = await tmp();
  await write(dir, 'src/a.ts', 'import { Used, Unused } from "./m";\nexport function f() { return Used(); }\n');
  await write(dir, 'src/barrel.ts', 'import { ReExported } from "./m";\nexport { ReExported };\n');
  const { findings } = scanCodeQuality({ targetDir: dir, categories: all });
  const dead = findings.filter((f) => f.category === 'DEAD_CODE');
  assert.equal(dead.length, 1, `expected only Unused flagged, got ${JSON.stringify(dead.map((d) => d.message))}`);
  assert.match(dead[0].message, /Unused/);
});

test('DUPLICATION: literal repeated 3x across 2 files is flagged; 2x is not', async () => {
  const dir = await tmp();
  await write(dir, 'src/a.ts', 'const x = "shared-magic-string-value";\nconst y = "shared-magic-string-value";\n');
  await write(dir, 'src/b.ts', 'const z = "shared-magic-string-value";\nconst once = "only-here-string-x";\n');
  const { findings } = scanCodeQuality({ targetDir: dir, categories: all });
  const dup = findings.filter((f) => f.category === 'DUPLICATION');
  assert.equal(dup.length, 1);
  assert.match(dup[0].message, /shared-magic-string-value/);
});

test('category filter: --category=TODO scans only TODO', async () => {
  const dir = await tmp();
  await write(dir, 'src/a.ts', 'const r = eval("x"); // TODO remove\n');
  const { findings } = scanCodeQuality({ targetDir: dir, categories: new Set(['TODO']) });
  assert.ok(findings.every((f) => f.category === 'TODO'));
  assert.ok(findings.length >= 1);
});

test('runAuditCode: HIGH finding => ok:false + exit 1; persists audit-code.json; suppressExitCode honored', async () => {
  const dir = await tmp();
  await write(dir, 'src/a.ts', 'const r = eval("danger");\n');
  const logger = makeLogger();
  const prevExit = process.exitCode;
  process.exitCode = 0;
  const report = await runAuditCode({ args: [dir], options: { json: true, suppressExitCode: true }, logger });
  assert.equal(report.ok, false);
  assert.equal(report.by_severity.HIGH >= 1, true);
  assert.equal(process.exitCode, 0, 'suppressExitCode must not mutate process.exitCode');
  process.exitCode = prevExit;

  const persisted = path.join(dir, '.aioson', 'context', 'audit-code.json');
  assert.ok(fssync.existsSync(persisted), 'report persisted to .aioson/context/audit-code.json');
  const onDisk = JSON.parse(fssync.readFileSync(persisted, 'utf8'));
  assert.equal(onDisk.total, report.total);
});

test('runAuditCode: clean code => ok:true, no blocking findings', async () => {
  const dir = await tmp();
  await write(dir, 'src/clean.ts', 'export function add(a: number, b: number): number {\n  return a + b;\n}\n');
  const logger = makeLogger();
  const report = await runAuditCode({ args: [dir], options: { json: true, suppressExitCode: true }, logger });
  assert.equal(report.ok, true, JSON.stringify(report.findings));
  assert.equal(report.by_severity.HIGH, 0);
});

test('parser: --changed and --strict are boolean flags that do not swallow the path positional', () => {
  const r = parseArgv(['node', 'aioson', 'audit:code', '--changed', '.']);
  assert.equal(r.command, 'audit:code');
  assert.equal(r.options.changed, true);
  assert.deepEqual(r.args, ['.'], 'the "." path must remain a positional arg, not be consumed by --changed');

  const r2 = parseArgv(['node', 'aioson', 'audit:code', '--strict', '.']);
  assert.equal(r2.options.strict, true);
  assert.deepEqual(r2.args, ['.']);
});
