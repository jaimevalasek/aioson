'use strict';

/**
 * should_load was where a brief's reading cost lived: whole 30-50k-char state
 * files and PRDs offered as bare paths (consumer runtime: ~24k chars must_load
 * vs ~200k should_load per brief). Large optional files now carry the H2/H3
 * sections matching the task as line ranges, or a heading outline when none
 * match; small files and must_load stay whole. Replay on six consumer
 * features: 1,197k → 425k chars (65% less), no item dropped.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const { focusFile, outlineMarkdown } = require('../src/lib/section-focus');
const { buildContextBrief } = require('../src/context-brief');
const { formatContextActivation } = require('../src/agent-context-activation');

function filler(label, size) {
  const sentence = `${label} background notes that pad the section without naming anything. `;
  return sentence.repeat(Math.ceil(size / sentence.length)).slice(0, size);
}

function largeState() {
  return [
    '---',
    'description: Current state of the system',
    'task_types: [state]',
    '---',
    '',
    '# Current state',
    '',
    '## Billing',
    '',
    filler('billing', 3000),
    '',
    '## Customer registry',
    '',
    'The customer listing and edit form share one validation module.',
    '',
    '```md',
    '## Not a heading inside a fence',
    '```',
    '',
    '## Deploy pipeline',
    '',
    filler('deploy', 3000),
    '',
    '### Registry sync job',
    '',
    'Nightly sync of the customer registry.',
    '',
    '## History',
    '',
    filler('history', 4000)
  ].join('\n');
}

test('outlineMarkdown splits H2/H3 outside fences with 1-based inclusive line ranges', () => {
  const sections = outlineMarkdown(largeState());
  const headings = sections.map((section) => section.heading);
  assert.deepEqual(headings, ['(preamble)', 'Billing', 'Customer registry', 'Deploy pipeline', 'Registry sync job', 'History']);
  const registry = sections.find((section) => section.heading === 'Customer registry');
  const lines = largeState().split('\n');
  assert.equal(lines[registry.start_line - 1], '## Customer registry');
  assert.equal(lines[registry.end_line], '## Deploy pipeline', 'the range stops right before the next heading');
});

test('focusFile names only matching sections of a large file, an outline when none match, nothing for a small one', () => {
  const content = largeState();
  const focused = focusFile(content, ['customer', 'registry', 'form']);
  assert.equal(focused.large, true);
  assert.deepEqual(focused.focus.map((entry) => entry.heading), ['Customer registry', 'Registry sync job']);
  assert.ok(focused.focus_chars < content.length / 10);

  const unmatched = focusFile(content, ['webhook', 'refund']);
  assert.deepEqual(unmatched.focus, []);
  assert.ok(unmatched.outline.some((entry) => /: Billing$/.test(entry)));

  const small = focusFile('# Tiny\n\n## Customer\n\nshort', ['customer']);
  assert.equal(small.large, false);
  assert.deepEqual(small.focus, []);
});

test('a single body mention of one term is not a reason to read a section', () => {
  const content = ['# Doc', '', '## Alpha', '', `${filler('alpha', 5000)} customer`, '', '## Beta', '', filler('beta', 5000)].join('\n');
  assert.deepEqual(focusFile(content, ['customer', 'invoice']).focus, []);
});

test('section focus matches word prefixes without reading unrelated infix hits', () => {
  const content = [
    '## Observers', 'stable observers notes '.repeat(500),
    '## Server tables', 'The server stores customer tables.'
  ].join('\n');
  assert.deepEqual(focusFile(content, ['server', 'table']).focus.map((entry) => entry.heading), ['Server tables']);
  assert.deepEqual(focusFile(content, ['customer']).focus, [], 'one body hit remains insufficient');
});

test('shorter fences and code with a fence prefix do not expose fake headings', () => {
  for (const marker of ['`', '~']) {
    const content = [
      '## Example', marker.repeat(4) + 'md', marker.repeat(3),
      '## Fake customer heading', marker.repeat(4) + 'still code',
      '## Another fake heading', marker.repeat(4), '## Real section'
    ].join('\n');
    assert.deepEqual(outlineMarkdown(content).map((entry) => entry.heading), ['Example', 'Real section']);
  }
});

test('the brief annotates large should_load items with line ranges and reports the load budget', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'aioson-section-focus-'));
  try {
    await fs.mkdir(path.join(dir, '.aioson', 'docs'), { recursive: true });
    await fs.writeFile(path.join(dir, '.aioson', 'docs', 'customer-state.md'), largeState().replace('task_types: [state]', 'task_types: [state]\ntriggers: [customer registry]'));
    const brief = await buildContextBrief(dir, {
      agent: 'dev', mode: 'executing', noSemantic: true,
      task: 'build the customer registry edit form', paths: 'src/customers/form.js'
    });
    const item = brief.should_load.find((entry) => entry.path === '.aioson/docs/customer-state.md');
    assert.ok(item, 'the doc is still offered — focus never drops an item');
    assert.equal(item.read, 'sections');
    assert.ok(item.focus.some((entry) => entry.heading === 'Customer registry'));
    assert.match(item.focus[0].lines, /^\d+-\d+$/);
    assert.ok(brief.load_budget.should_load_chars >= item.chars);
    assert.ok(brief.load_budget.should_load_focused_chars < brief.load_budget.should_load_chars);

    const activation = formatContextActivation({ ...brief, task: brief.task });
    assert.match(activation, /customer-state\.md.*\[read only lines \d+-\d+/);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});
