'use strict';

// Authoring parity: every frontmatter shape the docs teach (or YAML allows for
// a plain list) must route exactly like its inline equivalent. A block list
// used to parse as empty — an empty `agents:` means EVERY agent — and a
// trailing comment copied from the rules README used to stay inside the
// values, silently excluding the rule from the agents it named.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { parseFrontmatter, parseFlowList, appliesToAgent } = require('../src/preflight-engine');
const { selectContext } = require('../src/context-selector');
const { runRulesLint } = require('../src/commands/rules-lint');
const { formatContextActivation } = require('../src/agent-context-activation');

const README = path.join(__dirname, '..', 'template', '.aioson', 'rules', 'README.md');

function fm(lines) {
  return parseFrontmatter(['---', ...lines, '---', '# Doc'].join('\n'));
}

async function makeTmpDir() {
  return fs.mkdtemp(path.join(os.tmpdir(), 'aioson-authoring-parity-'));
}

async function writeFile(dir, relPath, content) {
  const full = path.join(dir, relPath);
  await fs.mkdir(path.dirname(full), { recursive: true });
  await fs.writeFile(full, content, 'utf8');
}

async function writeProject(dir) {
  await writeFile(dir, '.aioson/context/project.context.md', '---\nframework: Node.js\n---\n# Project');
  await writeFile(dir, '.aioson/context/project-pulse.md', '---\nactive_feature: (none)\n---\n# Pulse');
}

function selectedPaths(selection) {
  return (selection.selected || []).map((item) => item.path);
}

test('a block list reads as the same list as its inline form', () => {
  const inline = fm(['agents: [dev, planner]']);
  const indented = fm(['agents:', '  - dev', '  - planner']);
  const flush = fm(['agents:', '- dev', '- planner']);
  assert.deepEqual(parseFlowList(indented.agents), parseFlowList(inline.agents));
  assert.deepEqual(parseFlowList(flush.agents), ['dev', 'planner']);
  assert.equal(appliesToAgent(indented, 'dev'), true);
  assert.equal(appliesToAgent(indented, 'qa'), false, 'a block list must not fail open to every agent');
});

test('a block list tolerates blank lines, comment lines, quoted items, and trailing comments', () => {
  const parsed = fm([
    'triggers:',
    '  # routing phrases',
    '  - criar pastas',
    '',
    '  - "nomes de arquivos, pastas"   # one phrase, comma included',
    "  - 'módulos'",
    'modes: [planning]'
  ]);
  assert.deepEqual(parseFlowList(parsed.triggers), ['criar pastas', 'nomes de arquivos, pastas', 'módulos']);
  assert.equal(parsed.modes, '[planning]', 'the key after the block still parses');
});

test('an unquoted block item holding a comma stays one item', () => {
  const parsed = fm(['triggers:', '  - criar pastas, subpastas', '  - modules']);
  assert.deepEqual(parseFlowList(parsed.triggers), ['criar pastas, subpastas', 'modules']);
});

test('trailing YAML comments never leak into list or scalar values', () => {
  const parsed = fm([
    'agents: [planner, dev]   # only these two',
    'priority: 10             # optional: higher = loaded first (default: 0)',
    'load_tier: trigger       # trigger (default) | always | justified',
    'status: resolved   # open | in_progress | resolved'
  ]);
  assert.deepEqual(parseFlowList(parsed.agents), ['planner', 'dev']);
  assert.equal(parsed.priority, '10');
  assert.equal(parsed.load_tier, 'trigger');
  assert.equal(parsed.status, 'resolved');
});

test('a # that does not open a comment stays in the value', () => {
  const parsed = fm([
    'description: "Use #fff tokens for the surface"',
    'stack: C# and F# services',
    "title: 'It''s #1'",
    'triggers: ["issue #42", c#]'
  ]);
  assert.equal(parsed.description, 'Use #fff tokens for the surface');
  assert.equal(parsed.stack, 'C# and F# services');
  assert.equal(parsed.title, "It's #1");
  assert.deepEqual(parseFlowList(parsed.triggers), ['issue #42', 'c#']);
});

test('a quoted comma inside a flow list is part of its item', () => {
  const parsed = fm(['triggers: ["criar pastas, subpastas", modules]']);
  assert.deepEqual(parseFlowList(parsed.triggers), ['criar pastas, subpastas', 'modules']);
});

test('shapes the parser does not model keep their previous reading', () => {
  const mapping = fm(['verify:', '  - layout: src/modules/*', 'name: x']);
  assert.equal(mapping.verify, '', 'a block list of mappings is not guessed at');
  assert.equal(mapping.name, 'x');
  const folded = fm(['description: >-', '  Use #fff tokens', '  on every surface', 'name: y']);
  assert.equal(folded.description, 'Use #fff tokens on every surface', 'block scalar content is never comment-stripped');
  const commentLine = fm(['# note: not a key', 'name: z']);
  assert.equal(Object.prototype.hasOwnProperty.call(commentLine, '# note'), false);
  assert.equal(commentLine.name, 'z');
});

test('the rules README example, copied verbatim, routes to exactly the agents it names', async () => {
  const readme = await fs.readFile(README, 'utf8');
  const example = /## Frontmatter Format\s+```yaml\r?\n([\s\S]*?)```/.exec(readme);
  assert.ok(example, 'the README keeps its frontmatter example');
  const dir = await makeTmpDir();
  try {
    await writeProject(dir);
    await writeFile(dir, '.aioson/rules/rule-name.md', `${example[1].trim()}\n\n# Billing rule\n\nPrices are integer cents.\n`);
    const task = 'checkout pricing for the billing module';
    const paths = 'src/billing/invoice.js';
    const forDev = await selectContext(dir, { agent: 'dev', mode: 'executing', task, paths, semantic: false });
    const forPlanner = await selectContext(dir, { agent: 'planner', mode: 'planning', task, paths, semantic: false });
    const forQa = await selectContext(dir, { agent: 'qa', mode: 'executing', task, paths, semantic: false });
    assert.ok(selectedPaths(forDev).includes('.aioson/rules/rule-name.md'), JSON.stringify(forDev.excluded || {}));
    assert.ok(selectedPaths(forPlanner).includes('.aioson/rules/rule-name.md'));
    assert.equal(selectedPaths(forQa).includes('.aioson/rules/rule-name.md'), false);

    const lint = await runRulesLint({ args: [dir], options: { json: true }, logger: console });
    const linted = lint.rules.find((rule) => rule.path === '.aioson/rules/rule-name.md');
    assert.deepEqual(linted.warnings, [], 'the documented example lints clean');
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test('a block-list rule for planner and dev reaches both and stays out of qa', async () => {
  const dir = await makeTmpDir();
  try {
    await writeProject(dir);
    await writeFile(dir, '.aioson/rules/module-layout.md', [
      '---',
      'name: module-layout',
      'description: Where module files and subfolders are created',
      'agents:',
      '  - planner',
      '  - dev',
      'modes: [planning, executing]',
      'triggers:',
      '  - folder structure',
      '  - criar pastas',
      'load_tier: trigger',
      '---',
      '# Module layout',
      ''
    ].join('\n'));
    const task = 'define the folder structure for the customers module';
    const forPlanner = await selectContext(dir, { agent: 'planner', mode: 'planning', task, semantic: false });
    const forDev = await selectContext(dir, { agent: 'dev', mode: 'executing', task, semantic: false });
    const forQa = await selectContext(dir, { agent: 'qa', mode: 'executing', task, semantic: false });
    assert.ok(selectedPaths(forPlanner).includes('.aioson/rules/module-layout.md'));
    assert.ok(selectedPaths(forDev).includes('.aioson/rules/module-layout.md'));
    assert.equal(selectedPaths(forQa).includes('.aioson/rules/module-layout.md'), false);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test('rules:lint names the scope declarations that silently change who receives a document', async () => {
  const dir = await makeTmpDir();
  try {
    const rule = (name, extra) => ['---', `name: ${name}`, `description: ${name}`, 'triggers: [x]', ...extra, '---', `# ${name}`].join('\n');
    await writeFile(dir, '.aioson/rules/bare-agents.md', rule('bare-agents', ['agents:']));
    await writeFile(dir, '.aioson/rules/typo-agent.md', rule('typo-agent', ['agents: [plannner, dev]']));
    await writeFile(dir, '.aioson/rules/bad-mode.md', rule('bad-mode', ['modes: [plan]']));
    await writeFile(dir, '.aioson/rules/bad-tier.md', rule('bad-tier', ['load_tier: on-demand']));
    await writeFile(dir, '.aioson/rules/all-agents.md', rule('all-agents', ['agents: []']));
    await writeFile(dir, '.aioson/rules/custom-agent.md', rule('custom-agent', ['agents: [billing-auditor, squad-copy-lead]']));

    const lint = await runRulesLint({ args: [dir], options: { json: true }, logger: console });
    const warningsFor = (name) => lint.rules.find((item) => item.path === `.aioson/rules/${name}.md`).warnings.join('\n');
    assert.match(warningsFor('bare-agents'), /reaches EVERY agent/);
    assert.match(warningsFor('typo-agent'), /"plannner" is not an agent id \(did you mean "planner"\?\)/);
    assert.match(warningsFor('bad-mode'), /"plan" is not a selector mode/);
    assert.match(warningsFor('bad-tier'), /"on-demand" is not one of always, trigger, justified, archive/);
    assert.equal(warningsFor('all-agents'), '', 'agents: [] is the documented every-agent form');
    assert.equal(warningsFor('custom-agent'), '', 'custom and squad agent ids are legitimate');
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test('the agent activation carries the skills the brief matched', () => {
  const activation = formatContextActivation({
    task: 'add login with session tokens',
    must_load: [{ path: '.aioson/rules/security-baseline.md', reason: 'triggers:login' }],
    should_load: [],
    skills: [{ path: '.aioson/skills/process/secure-tdd/SKILL.md', reason: 'triggers:auth,login' }]
  });
  assert.match(activation, /Skills matching this task/);
  assert.match(activation, /\.aioson\/skills\/process\/secure-tdd\/SKILL\.md — triggers:auth,login/);
  const without = formatContextActivation({ task: 'x', must_load: [], should_load: [], skills: [] });
  assert.doesNotMatch(without, /Skills matching this task/);
});
