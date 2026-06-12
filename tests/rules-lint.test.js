'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { runRulesLint } = require('../src/commands/rules-lint');

async function makeTmpDir() {
  return fs.mkdtemp(path.join(os.tmpdir(), 'aioson-rules-lint-'));
}

async function writeFile(dir, relPath, content) {
  const full = path.join(dir, relPath);
  await fs.mkdir(path.dirname(full), { recursive: true });
  await fs.writeFile(full, content, 'utf8');
  return full;
}

function logger() {
  const lines = [];
  return {
    lines,
    log(value) { lines.push(String(value)); },
    error(value) { lines.push(String(value)); }
  };
}

test('rules:lint flags selector-invisible rules and passes routed rules', async () => {
  const dir = await makeTmpDir();
  try {
    await writeFile(dir, '.aioson/rules/routed.md', [
      '---',
      'name: routed-rule',
      'description: "Routed rule"',
      'agents: [dev]',
      'task_types: [payment]',
      'triggers: [money, billing]',
      '---',
      '# Routed'
    ].join('\n'));
    await writeFile(dir, '.aioson/rules/invisible.md', [
      '---',
      'name: invisible-rule',
      'description: "Only description"',
      'agents: [dev, qa]',
      '---',
      '# Invisible'
    ].join('\n'));
    await writeFile(dir, '.aioson/rules/always.md', [
      '---',
      'name: always-rule',
      'description: "Global style rule"',
      'load_tier: always',
      '---',
      '# Always'
    ].join('\n'));
    await writeFile(dir, '.aioson/rules/README.md', '# Skipped');

    const result = await runRulesLint({ args: [dir], options: { json: true }, logger: logger() });

    assert.equal(result.ok, true);
    assert.equal(result.total, 3);

    const byName = new Map(result.rules.map((rule) => [rule.name, rule]));
    assert.equal(byName.get('routed-rule').ok, true);
    assert.deepEqual(byName.get('routed-rule').routing, ['task_types', 'triggers']);

    const invisible = byName.get('invisible-rule');
    assert.equal(invisible.ok, false);
    assert.ok(invisible.warnings.some((warning) => warning.includes('selector-invisible')));

    const always = byName.get('always-rule');
    assert.ok(always.warnings.every((warning) => !warning.includes('selector-invisible')));
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test('rules:lint strict mode fails when warnings exist and reports missing fields', async () => {
  const dir = await makeTmpDir();
  try {
    await writeFile(dir, '.aioson/rules/broken.md', [
      '---',
      'agents: [dev]',
      '---',
      '# No name or description'
    ].join('\n'));

    const result = await runRulesLint({ args: [dir], options: { json: true, strict: true }, logger: logger() });

    assert.equal(result.ok, false);
    assert.equal(result.exitCode, 1);
    const broken = result.rules[0];
    assert.ok(broken.warnings.some((warning) => warning.includes('missing required field: name')));
    assert.ok(broken.warnings.some((warning) => warning.includes('missing required field: description')));
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test('rules:lint handles missing rules directory and prints human summary', async () => {
  const dir = await makeTmpDir();
  try {
    const emptyLog = logger();
    const empty = await runRulesLint({ args: [dir], options: {}, logger: emptyLog });
    assert.equal(empty.ok, true);
    assert.equal(empty.total, 0);
    assert.ok(emptyLog.lines.some((line) => line.includes('nothing to lint')));

    await writeFile(dir, '.aioson/rules/routed.md', [
      '---',
      'name: routed-rule',
      'description: "Routed rule"',
      'triggers: [money]',
      '---',
      '# Routed'
    ].join('\n'));

    const humanLog = logger();
    await runRulesLint({ args: [dir], options: {}, logger: humanLog });
    assert.ok(humanLog.lines.some((line) => line.startsWith('OK   routed-rule')));
    assert.ok(humanLog.lines.some((line) => line.startsWith('Summary: 1/1 ok')));
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test('template rules are all selector-visible', async () => {
  const templateRoot = path.resolve(__dirname, '..', 'template');
  const result = await runRulesLint({ args: [templateRoot], options: { json: true, strict: true }, logger: logger() });

  assert.ok(result.total > 0, 'template should ship rules');
  for (const rule of result.rules) {
    assert.deepEqual(
      rule.warnings.filter((warning) => warning.includes('selector-invisible')),
      [],
      `template rule must be selector-visible: ${rule.path}`
    );
  }
});
