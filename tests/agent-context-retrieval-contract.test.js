'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', 'template', '.aioson', 'agents');

// deyvin, analyst, architect, ux-ui, pm and scope-check were retired into the
// main cycle (dev, product, planner, qa); their absorbers carry the gate.
const REQUIRED_AGENTS = [
  'briefing',
  'refiner',
  'product',
  'sheldon',
  'planner',
  'orchestrator',
  'dev',
  'qa',
  'tester',
  'pentester',
  'genome',
  'neo',
  'setup'
];

test('primary and explicitly rule-aware agents declare a strict context retrieval gate', async () => {
  for (const agent of REQUIRED_AGENTS) {
    const content = await fs.readFile(path.join(ROOT, `${agent}.md`), 'utf8');
    assert.match(
      content,
      /context:(?:brief|select)/,
      `@${agent} has no strict context:brief/context:select contract`
    );
  }
});

test('Genome and Setup rerun strict retrieval before writes while Neo remains planning-only', async () => {
  const [genome, setup, neo] = await Promise.all([
    fs.readFile(path.join(ROOT, 'genome.md'), 'utf8'),
    fs.readFile(path.join(ROOT, 'setup.md'), 'utf8'),
    fs.readFile(path.join(ROOT, 'neo.md'), 'utf8')
  ]);

  assert.match(genome, /context:brief --mode=executing.*exact output paths/i);
  assert.match(setup, /rerun with `--mode=executing`.*exact artifact path/i);
  assert.match(neo, /do not switch to executing mode.*read-only/i);
});
