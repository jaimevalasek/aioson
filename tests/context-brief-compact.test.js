'use strict';

// The brief stays in the agent's conversation and is re-sent on every later
// call, so its default print is compact. These tests pin what compact may
// never lose: every must_load path (binding), the constraints the agent reads
// nowhere else, and the full form behind `--full`. Measured read-only on two
// real projects (six agent/task pairs): 7.4-8.8 KB -> 4.1-4.8 KB per brief,
// the observation fan (about 1.7 KB) unchanged.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { runContextBrief } = require('../src/commands/context-brief');
const { shortReason, compactBriefLines } = require('../src/lib/context-brief-format');

async function writeFile(dir, relPath, content) {
  const full = path.join(dir, relPath);
  await fs.mkdir(path.dirname(full), { recursive: true });
  await fs.writeFile(full, content, 'utf8');
}

function collector() {
  const lines = [];
  return { lines, log(value) { lines.push(String(value)); } };
}

async function templateRule(name) {
  return fs.readFile(path.join(__dirname, '..', 'template/.aioson/rules', name), 'utf8');
}

const LONG_DESCRIPTION = 'Checkout ledger guidance for refunds, partial captures, currency rounding, settlement windows, chargeback evidence and reconciliation reports across every payment provider the project integrates';

async function makeProject({ rules = 16 } = {}) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'aioson-brief-compact-'));
  await writeFile(dir, '.aioson/context/project.context.md', '---\nframework: Node\nproject_type: web-app\nconversation_language: en\n---\n# Project\n');
  await writeFile(dir, '.aioson/context/project-pulse.md', '---\nactive_feature: checkout\n---\n# Pulse\n');
  await writeFile(dir, '.aioson/rules/source-code-language-convention.md', await templateRule('source-code-language-convention.md'));
  // Sixteen always-tier rules by default: past the nominal 14, every one
  // stays binding.
  for (let index = 1; index <= rules; index += 1) {
    await writeFile(dir, `.aioson/rules/ledger-rule-${index}.md`, [
      '---',
      `name: ledger-rule-${index}`,
      `description: "${LONG_DESCRIPTION} (${index})"`,
      'agents: [dev]',
      'modes: [executing]',
      'load_tier: always',
      '---',
      `# Ledger rule ${index}`,
      '',
      '## Required behavior',
      `- Keep ledger entry ${index} append-only and reconcile it before settlement.`,
      `- Never rewrite a posted ledger entry ${index}; post a reversing entry.`,
      ''
    ].join('\n'));
  }
  // A hard-scoped doc that lands in should_load: its constraints are read
  // nowhere else, so the compact form must still print them.
  await writeFile(dir, '.aioson/docs/payments/refund-contract.md', [
    '---',
    `description: "${LONG_DESCRIPTION}"`,
    'constraint_scope: hard',
    'task_types: [implementation]',
    'triggers: [refund, refunds, checkout]',
    'load_tier: trigger',
    '---',
    '# Refund contract',
    '',
    '## Required behavior',
    '- Add an idempotency key to every refund request.',
    '',
    ...Array.from({ length: 60 }, (_, index) => `## Section ${index}\n\nRefund narrative paragraph ${index} about settlement windows and reconciliation reports.\n`)
  ].join('\n'));
  return dir;
}

const OPTIONS = { agent: 'dev', mode: 'executing', feature: 'checkout', task: 'implement checkout refunds with an idempotency key', paths: 'src/refunds.js', 'no-semantic': true, 'no-recall': true, 'no-jev': true };

test('the default brief lists every must_load path, with one short reason each, at well under the full size', async (t) => {
  const dir = await makeProject();
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const compact = collector();
  const result = await runContextBrief({ args: [dir], options: OPTIONS, logger: compact });
  const full = collector();
  await runContextBrief({ args: [dir], options: { ...OPTIONS, full: true }, logger: full });

  assert.ok(result.must_load.length >= 17, `fixture must exceed the nominal 14 (${result.must_load.length})`);
  const text = compact.lines.join('\n');
  const header = compact.lines.findIndex((line) => line.startsWith(`Must load (binding — read each in full before acting, ${result.must_load.length}):`));
  assert.ok(header >= 0, text);
  for (const item of result.must_load) {
    assert.ok(compact.lines.some((line) => line.startsWith(`- ${item.path} — `)), `${item.path} missing from the compact brief:\n${text}`);
  }
  assert.doesNotMatch(text, /description:/, 'a description never reaches the compact form');
  for (const line of compact.lines.filter((entry) => entry.startsWith('- .aioson/rules/'))) {
    assert.ok(line.length <= 160, `one short line per must_load item: ${line}`);
  }
  assert.ok(compact.lines.some((line) => /^- \.aioson\/docs\/payments\/refund-contract\.md \(\d/.test(line)), 'should_load keeps its size hint');

  const compactBytes = Buffer.byteLength(text);
  const fullBytes = Buffer.byteLength(full.lines.join('\n'));
  assert.ok(compactBytes * 2 < fullBytes, `compact ${compactBytes} B is not under half of full ${fullBytes} B`);
  assert.ok(full.lines.includes('Must load:'), 'the full form is the previous print');
  assert.ok(full.lines.some((line) => line.includes('description:Checkout ledger guidance')));
});

test('compact prints the constraints read nowhere else and omits the lines quoted from must_load files', async (t) => {
  const dir = await makeProject({ rules: 2 });
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const compact = collector();
  const result = await runContextBrief({ args: [dir], options: OPTIONS, logger: compact });
  const full = collector();
  await runContextBrief({ args: [dir], options: { ...OPTIONS, full: true }, logger: full });
  const text = compact.lines.join('\n');

  assert.ok(result.should_load.some((item) => item.path === '.aioson/docs/payments/refund-contract.md'));
  assert.ok(result.constraints.some((line) => /idempotency key to every refund/.test(line)));
  assert.match(text, /- Add an idempotency key to every refund request\./, 'a hard-scoped should_load doc still binds in the compact form');

  const quotedShown = result.constraints.slice(0, 8).filter((line) => /append-only and reconcile/.test(line));
  assert.ok(quotedShown.length > 0, 'the fixture puts must_load lines among the printed constraints');
  for (const line of quotedShown) {
    assert.ok(full.lines.includes(`- ${line}`), 'the full form prints the quoted line');
    assert.ok(!compact.lines.includes(`- ${line}`), 'the compact form leaves it to its own file');
  }
  assert.match(text, /\d+ constraint\/forbidden\/hint line\(s\) are quoted from must_load files and omitted; `--full` prints every reason, outline and line\./);
});

test('--json is the unchanged package: the quoted-line set never serializes', async (t) => {
  const dir = await makeProject();
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const out = collector();
  const result = await runContextBrief({ args: [dir], options: { ...OPTIONS, json: true }, logger: out });
  assert.deepEqual(out.lines, []);
  assert.ok(result.quotedFromMustLoad instanceof Set && result.quotedFromMustLoad.size > 0);
  assert.ok(!Object.keys(result).includes('quotedFromMustLoad'));
  assert.doesNotMatch(JSON.stringify(result), /quotedFromMustLoad/);
  assert.ok(result.constraints.some((line) => /append-only and reconcile/.test(line)), 'JSON keeps every constraint line');
});

test('a brief built elsewhere (no quoted set) prints every constraint line in compact form', () => {
  const lines = compactBriefLines({
    agent: 'qa', mode: 'executing', intent: { operation: 'quality-review', stack: '', concerns: [] }, confidence: 'high',
    must_load: [{ path: '.aioson/rules/a.md', surface: 'rules', reason: 'mode:executing; load_tier:always' }],
    should_load: [], skills: [], constraints: ['Keep a.'], forbidden_patterns: ['Never b.'], verification_hints: [], gaps: [], related: []
  });
  assert.deepEqual(lines.slice(0, 2), ['Context brief for @qa (executing) · quality-review · confidence: high', 'Must load (binding — read each in full before acting, 1):']);
  assert.ok(lines.includes('- .aioson/rules/a.md — always'));
  assert.ok(lines.includes('- Keep a.') && lines.includes('- Never b.'));
});

test('shortReason keeps why a file was chosen in one line', () => {
  assert.equal(shortReason('mode:executing; load_tier:always'), 'always');
  assert.equal(shortReason(`description:${LONG_DESCRIPTION}; semantic:refund,refunds,checkout,ledger,settlement`), 'semantic:refund,refunds,checkout,…');
  assert.equal(shortReason('paths:src/**; feature:checkout'), 'paths:src/**; feature:checkout');
  assert.equal(shortReason('mode:planning'), 'selected');
  assert.ok(shortReason(`triggers:${'x'.repeat(200)}`).length <= 80);
});
