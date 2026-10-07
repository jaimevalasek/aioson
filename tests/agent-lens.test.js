'use strict';

// One document, one lens per agent: sections addressed to other agents are
// skipped; shared text and the agent's own sections are read.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { lensOf } = require('../src/lib/agent-lens');
const { buildContextBrief } = require('../src/context-brief');
const { formatContextActivation } = require('../src/agent-context-activation');
const { scaffoldRule } = require('../src/lib/rule-scaffold');

const MODULE_RULE = [
  '---',
  'name: module-layout',
  'description: Where module files and subfolders are created',
  'agents: [planner, dev, qa]',
  'modes: [planning, executing]',
  'triggers: [folder structure, module layout]',
  'load_tier: trigger',
  '---',
  '# Module layout',
  '',
  'Reuse the existing module structure before introducing a new one.',
  '',
  '## Convention',
  '',
  '- One folder per module; subfolders only for a concrete responsibility.',
  '',
  '## Planning <!-- agents: planner -->',
  '',
  '- Name every file the phase creates and the responsibility of each folder.',
  '',
  '### Planning checklist',
  '',
  '- Paths are listed in the plan table.',
  '',
  '## Implementation',
  '<!-- agents: dev -->',
  '',
  '- Follow the paths in the plan; adjust only with evidence.',
  '',
  '## Evidence <!-- agents: qa, dev -->',
  '',
  '- The tree matches the plan table.',
  ''
].join('\n');

test('each agent reads the shared text and its own sections, never the others\'', () => {
  const planner = lensOf(MODULE_RULE, 'planner');
  assert.deepEqual(planner.skipped, ['Implementation', 'Evidence']);
  const dev = lensOf(MODULE_RULE, 'dev');
  assert.deepEqual(dev.skipped, ['Planning', 'Planning checklist'], 'an H3 inherits its H2 audience');
  const qa = lensOf(MODULE_RULE, 'qa');
  assert.deepEqual(qa.skipped, ['Planning', 'Planning checklist', 'Implementation']);
  assert.ok(planner.focus_chars < planner.chars);
  assert.equal(planner.focus[0].lines.startsWith('1-'), true, 'the preamble and shared convention come first');
});

test('a document that addresses nobody — or skips nothing for this agent — is read whole', () => {
  assert.equal(lensOf('---\nname: x\n---\n# X\n\n## Rules\n\n- a\n', 'dev'), null);
  assert.equal(lensOf('# X\n\n## Dev notes <!-- agents: dev -->\n\n- a\n', 'dev'), null);
});

test('the brief and the activation hand each agent its lens of a shared rule', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'aioson-lens-'));
  try {
    await fs.mkdir(path.join(dir, '.aioson', 'context'), { recursive: true });
    await fs.mkdir(path.join(dir, '.aioson', 'rules'), { recursive: true });
    await fs.writeFile(path.join(dir, '.aioson', 'context', 'project.context.md'), '---\nframework: Node.js\n---\n# Project', 'utf8');
    await fs.writeFile(path.join(dir, '.aioson', 'rules', 'module-layout.md'), MODULE_RULE, 'utf8');

    const brief = await buildContextBrief(dir, { agent: 'planner', mode: 'planning', task: 'define the folder structure of the customers module', recall: false });
    const item = [...brief.must_load, ...brief.should_load].find((entry) => entry.path === '.aioson/rules/module-layout.md');
    assert.ok(item, 'the rule is selected');
    assert.equal(item.read, 'lens');
    assert.deepEqual(item.skipped_sections, ['Implementation', 'Evidence']);
    assert.match(formatContextActivation(brief), /module-layout\.md .*\[your lens: read lines /);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test('rule:new with two or more agents scaffolds a section addressed to each', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'aioson-lens-scaffold-'));
  try {
    await fs.mkdir(path.join(dir, '.aioson'), { recursive: true });
    const result = await scaffoldRule(dir, { name: 'module-layout', agents: 'planner,dev', triggers: 'folder structure' });
    const content = await fs.readFile(path.join(dir, result.path), 'utf8');
    assert.match(content, /^## For @planner <!-- agents: planner -->$/m);
    assert.match(content, /^## For @dev <!-- agents: dev -->$/m);
    assert.deepEqual(lensOf(content, 'planner').skipped, ['For @dev']);
    const single = await scaffoldRule(dir, { name: 'solo-rule', agents: 'dev', triggers: 'x' });
    assert.doesNotMatch(await fs.readFile(path.join(dir, single.path), 'utf8'), /<!-- agents:/, 'one agent needs no lens');
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});
