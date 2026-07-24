'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { applyGenomeToExistingSquad } = require('../src/squads/apply-genome');
const {
  MANAGED_START,
  compileGenomeBinding,
  removeManagedBlock,
  materializeExecutorEffects
} = require('../src/squads/genome-compiler');

async function makeFixture() {
  const projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'aioson-genome-compiler-'));
  const squadSlug = 'premium-squad';
  const squadRoot = path.join(projectRoot, '.aioson', 'squads', squadSlug);
  const agentPath = path.join(squadRoot, 'agents', 'writer.md');
  const genomeRoot = path.join(projectRoot, '.aioson', 'genomes', 'evidence-writing');
  await fs.mkdir(path.join(genomeRoot, 'references'), { recursive: true });
  await fs.mkdir(path.dirname(agentPath), { recursive: true });
  await fs.writeFile(agentPath, '# Agent @writer\n\n## Mission\nWrite grounded recommendations.\n');
  await fs.writeFile(path.join(squadRoot, 'squad.manifest.json'), JSON.stringify({
    schemaVersion: '1.0.0',
    slug: squadSlug,
    name: 'Premium Squad',
    mode: 'content',
    mission: 'Write grounded recommendations',
    goal: 'Apply a real genome method',
    executors: [{
      slug: 'writer',
      role: 'Evidence writer',
      file: `.aioson/squads/${squadSlug}/agents/writer.md`
    }]
  }, null, 2));
  await fs.writeFile(path.join(genomeRoot, 'SKILL.md'), '# Evidence Writing Genome\n');
  await fs.writeFile(path.join(genomeRoot, 'manifest.json'), JSON.stringify({
    genome: 'evidence-writing',
    type: 'function',
    version: 2,
    track: '4.2',
    references: [
      { id: 'methodology', file: 'references/methodology.md', load_priority: 'high' },
      { id: 'heuristics', file: 'references/heuristics.md', load_priority: 'high' }
    ],
    dependencies: { genomes: [] }
  }, null, 2));
  await fs.writeFile(path.join(genomeRoot, 'references', 'methodology.md'), [
    '# Methodology',
    '1. Collect primary evidence before drafting.',
    '2. Map each material claim to a source.',
    '3. Structure the output as finding, evidence, limitation, and action.'
  ].join('\n'));
  await fs.writeFile(path.join(genomeRoot, 'references', 'heuristics.md'), [
    '# Heuristics',
    '- Never present an unsupported claim as verified.',
    '- Check that every material claim has a citation.',
    '- Output structure must expose limitations.'
  ].join('\n'));
  return { projectRoot, squadSlug, squadRoot, agentPath };
}

test('AC-premium-09 applying a modular genome materializes prompt checklist and compilation identity', async () => {
  const fixture = await makeFixture();
  const result = await applyGenomeToExistingSquad({
    projectRoot: fixture.projectRoot,
    squadSlug: fixture.squadSlug,
    executors: {
      writer: [{ slug: 'evidence-writing', version: '2', owner: 'writer' }]
    }
  });

  const manifest = JSON.parse(await fs.readFile(path.join(fixture.squadRoot, 'squad.manifest.json'), 'utf8'));
  const binding = manifest.genomeBindings.executors.writer[0];
  const prompt = await fs.readFile(fixture.agentPath, 'utf8');
  const checklist = await fs.readFile(path.join(fixture.squadRoot, 'checklists', 'genome-writer.md'), 'utf8');

  assert.equal(binding.status, 'compiled');
  assert.match(binding.compilationId, /^[a-f0-9]{64}$/);
  assert.match(binding.sourceHash, /^[a-f0-9]{64}$/);
  assert.match(prompt, new RegExp(MANAGED_START.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.match(prompt, /Collect primary evidence before drafting/);
  assert.match(prompt, /Never present an unsupported claim as verified/);
  assert.match(prompt, /Genome output contract/);
  assert.match(checklist, /every material claim has a citation/i);
  assert.equal(result.compilation[0].materialization.materialized, true);
});

test('AC-premium-10 missing source, stale version and declared conflict remain non-ready', async () => {
  const fixture = await makeFixture();
  const missing = await compileGenomeBinding({
    projectRoot: fixture.projectRoot,
    binding: { slug: 'missing-genome' },
    executorSlug: 'writer'
  });
  const stale = await compileGenomeBinding({
    projectRoot: fixture.projectRoot,
    binding: { slug: 'evidence-writing', version: '99' },
    executorSlug: 'writer'
  });
  const conflicted = await compileGenomeBinding({
    projectRoot: fixture.projectRoot,
    binding: { slug: 'evidence-writing', conflicts: ['other-method'] },
    executorSlug: 'writer'
  });

  assert.equal(missing.status, 'pending');
  assert.equal(stale.status, 'stale');
  assert.equal(conflicted.status, 'conflicted');
});

test('AC-premium-20 compiler refuses official agent paths', async () => {
  const fixture = await makeFixture();
  const compiled = await compileGenomeBinding({
    projectRoot: fixture.projectRoot,
    binding: { slug: 'evidence-writing' },
    executorSlug: 'writer'
  });
  await assert.rejects(
    materializeExecutorEffects({
      projectRoot: fixture.projectRoot,
      squadSlug: fixture.squadSlug,
      executor: { slug: 'writer', file: '.aioson/agents/dev.md' },
      compilations: [compiled]
    }),
    /refuses non-squad executor path/i
  );
});

test('AC-premium-10 removed or non-ready binding clears previously materialized prompt and checklist effects', async () => {
  const fixture = await makeFixture();
  await applyGenomeToExistingSquad({
    projectRoot: fixture.projectRoot,
    squadSlug: fixture.squadSlug,
    executors: {
      writer: [{ slug: 'evidence-writing', version: '2', owner: 'writer' }]
    }
  });
  const removed = await compileGenomeBinding({
    projectRoot: fixture.projectRoot,
    binding: { slug: 'evidence-writing', status: 'removed' },
    executorSlug: 'writer'
  });
  const result = await materializeExecutorEffects({
    projectRoot: fixture.projectRoot,
    squadSlug: fixture.squadSlug,
    executor: {
      slug: 'writer',
      file: `.aioson/squads/${fixture.squadSlug}/agents/writer.md`
    },
    compilations: [removed]
  });
  const prompt = await fs.readFile(fixture.agentPath, 'utf8');
  const checklist = await fs.readFile(
    path.join(fixture.squadRoot, 'checklists', 'genome-writer.md'),
    'utf8'
  );

  assert.equal(result.materialized, false);
  assert.equal(result.cleared, true);
  assert.equal(prompt.includes(MANAGED_START), false);
  assert.equal(prompt.includes('Collect primary evidence before drafting'), false);
  assert.match(checklist, /No active compiled genome effects/);
  assert.equal(removeManagedBlock(prompt), prompt);
});
