'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { ensureFixtureWorkspace } = require('../../scripts/smoke/genome-2.0-smoke');
const { applyGenomeToExistingSquad } = require('../../src/squads/apply-genome');
const { readGenome } = require('../../src/genome-files');

async function makeTempDir() {
  return fs.mkdtemp(path.join(os.tmpdir(), 'aioson-genome-contract-'));
}

test('AC-premium-19 genome binding contract stays readable across legacy and v2 persisted formats', async () => {
  const workspaceRoot = await makeTempDir();
  const projectRoot = await ensureFixtureWorkspace(workspaceRoot);

  const legacy = await readGenome(projectRoot, 'legacy-genome');
  const modern = await readGenome(projectRoot, 'genome-2.0');
  assert.equal(legacy.meta.compat.synthesizedFromLegacy, true);
  assert.equal(modern.meta.compat.synthesizedFromLegacy, false);

  const manifestPath = path.join(projectRoot, '.aioson', 'squads', 'squad-without-genome', 'squad.manifest.json');
  const before = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
  before.sourceDocs = ['docs/domain-brief.md'];
  before.investigation = {
    slug: 'domain-research',
    path: 'researchs/domain-research/summary.md',
    confidence: 0.9
  };
  before.genomes = [{ slug: 'legacy-genome', priority: 90 }];
  await fs.writeFile(manifestPath, JSON.stringify(before, null, 2));

  await applyGenomeToExistingSquad({
    projectRoot,
    squadSlug: 'squad-without-genome',
    squad: [{ slug: 'genome-2.0', priority: 115 }],
    executors: {
      writer: [{ slug: 'legacy-genome', priority: 125 }]
    }
  });

  const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
  const writer = manifest.executors.find((item) => item.slug === 'writer');

  assert.equal(Array.isArray(manifest.genomes.squad), true);
  assert.equal(Array.isArray(manifest.genomeBindings.squad), true);
  assert.equal(manifest.genomeBindings.squad[0].slug, 'genome-2-0');
  assert.equal(Array.isArray(manifest.genomeBindings.executors.writer), true);
  assert.equal(manifest.genomeBindings.executors.writer[0].slug, 'legacy-genome');
  assert.deepEqual(
    writer.genomes.map((item) => item.slug),
    ['legacy-genome', 'genome-2-0']
  );
  assert.deepEqual(manifest.sourceDocs, ['docs/domain-brief.md']);
  assert.equal(manifest.investigation.slug, 'domain-research');

  await fs.rm(workspaceRoot, { recursive: true, force: true });
});
