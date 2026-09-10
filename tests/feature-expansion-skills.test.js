'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { MANAGED_FILES } = require('../src/constants');

const ROOT = path.resolve(__dirname, '..');

async function read(relativePath) {
  return fs.readFile(path.join(ROOT, relativePath), 'utf8');
}

async function assertFile(relativePath) {
  await assert.doesNotReject(() => fs.access(path.join(ROOT, relativePath)), `missing file: ${relativePath}`);
}

test('feature expansion taxonomy and skills ship through managed template files', async () => {
  const workspaceFiles = [
    '.aioson/docs/feature-expansion-taxonomy.md'
  ];

  const managedFiles = [
    '.aioson/docs/feature-expansion-taxonomy.md',
    '.aioson/skills/process/briefing-expansion-scout/SKILL.md',
    '.aioson/skills/process/product-scope-expansion/SKILL.md',
    '.aioson/skills/process/sheldon-expansion-audit/SKILL.md'
  ];

  for (const file of workspaceFiles) {
    await assertFile(file);
  }

  for (const file of managedFiles) {
    await assertFile(path.join('template', file));
    assert.equal(MANAGED_FILES.includes(file), true, `managed file missing: ${file}`);
  }
});

test('feature expansion taxonomy keeps routing metadata and shared buckets', async () => {
  const taxonomy = await read('template/.aioson/docs/feature-expansion-taxonomy.md');

  const tokens = [
    'name: feature-expansion-taxonomy',
    'agents: [briefing, refiner, product, sheldon]',
    'task_types: [feature-expansion, product-discovery, prd-enrichment, briefing-refinement]',
    'Core',
    'Recommended MVP',
    'Optional V1',
    'Delight',
    'V2 / Later',
    'Cut List',
    'Implementation leverage'
  ];

  assert.match(taxonomy, /^---\r?\n/);
  for (const token of tokens) {
    assert.equal(taxonomy.includes(token), true, `missing taxonomy token: ${token}`);
  }
});

test('feature expansion skills have frontmatter and role-specific output contracts', async () => {
  const checks = [
    [
      '.aioson/skills/process/briefing-expansion-scout/SKILL.md',
      ['name: briefing-expansion-scout', 'feature-expansion-taxonomy.md', '.aioson/briefings/{slug}/expansion-scout.md']
    ],
    [
      '.aioson/skills/process/product-scope-expansion/SKILL.md',
      ['name: product-scope-expansion', 'feature-expansion-taxonomy.md', '.aioson/context/features/{slug}/scope-expansion.md']
    ],
    [
      '.aioson/skills/process/sheldon-expansion-audit/SKILL.md',
      ['name: sheldon-expansion-audit', 'feature-expansion-taxonomy.md', '.aioson/context/features/{slug}/expansion-audit.md']
    ]
  ];

  for (const [file, tokens] of checks) {
    const content = await read(`template/${file}`);
    assert.match(content, /^---\r?\n/);
    assert.match(content, /^description:/m, `${file} must describe when to load`);
    for (const token of tokens) {
      assert.equal(content.includes(token), true, `missing ${file} token: ${token}`);
    }
  }
});

// The three expansion skills read one taxonomy. When the taxonomy stopped
// treating category resemblance as scope (2026-09-08), the Briefing scout kept
// "assume ... relevant" and "a Core object without add/edit/list/archive is a
// blocking gap", so a read-only report feature got invented CRUD gaps that
// Product and Sheldon then received as review context. Every reader of the
// taxonomy must carry its two scope limits.
test('every feature expansion skill keeps the taxonomy scope limits — no invented CRUD, resemblance is not scope', async () => {
  const taxonomy = await read('template/.aioson/docs/feature-expansion-taxonomy.md');
  const limits = ['need no invented local CRUD', 'category resemblance alone does not make them required'];
  for (const limit of limits) assert.equal(taxonomy.includes(limit), true, `taxonomy lost: ${limit}`);
  const scout = await read('template/.aioson/skills/process/briefing-expansion-scout/SKILL.md');
  for (const limit of limits) assert.equal(scout.includes(limit), true, `briefing-expansion-scout drifted from the taxonomy: ${limit}`);
  assert.doesNotMatch(scout, /relevant unless evidence says otherwise/);
});

test('briefing, product, and sheldon agents wire feature expansion skills on demand', async () => {
  const gateway = await read('template/AGENTS.md');
  const briefing = await read('template/.aioson/agents/briefing.md');
  const briefingRefiner = await read('template/.aioson/agents/refiner.md');
  const product = await read('template/.aioson/agents/product.md');
  const sheldon = await read('template/.aioson/agents/sheldon.md');

  const checks = [
    [gateway, 'Process skills: feature expansion'],
    [gateway, '.aioson/docs/feature-expansion-taxonomy.md'],
    [briefing, 'briefing-expansion-scout/SKILL.md'],
    [briefing, '.aioson/briefings/{slug}/expansion-scout.md'],
    [briefingRefiner, 'briefing-expansion-scout/SKILL.md'],
    [briefingRefiner, '.aioson/briefings/{slug}/expansion-scout.md'],
    [product, 'product-scope-expansion/SKILL.md'],
    [product, '.aioson/context/features/{slug}/scope-expansion.md'],
    [sheldon, 'sheldon-expansion-audit/SKILL.md'],
    [sheldon, '.aioson/context/features/{slug}/expansion-audit.md']
  ];

  for (const [content, token] of checks) {
    assert.equal(content.includes(token), true, `missing agent expansion token: ${token}`);
  }
});
