'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const {
  SHIPPED_SCHEMA_PATH,
  isContainedPath,
  resolveManifestSchemaPath,
  validateSquadManifest,
  validatePremiumManifest
} = require('../src/squad/manifest-validator');

async function makeTempDir() {
  return fs.mkdtemp(path.join(os.tmpdir(), 'aioson-manifest-validator-'));
}

test('AC-premium-14 loads the shipped Draft-07 schema when a workspace copy is absent', async () => {
  const projectDir = await makeTempDir();
  const schemaPath = await resolveManifestSchemaPath(projectDir);
  assert.equal(schemaPath, SHIPPED_SCHEMA_PATH);

  const result = await validateSquadManifest(projectDir, {
    schemaVersion: '1.0.0',
    slug: 'premium-squad',
    name: 'Premium Squad',
    mode: 'research',
    mission: 'Research safely',
    goal: 'Produce grounded output'
  });

  assert.equal(result.valid, true);
  assert.equal(result.errors.length, 0);
});

test('AC-premium-14 returns normalized errors for full canonical schema violations', async () => {
  const projectDir = await makeTempDir();
  const result = await validateSquadManifest(projectDir, {
    schemaVersion: '1.0.0',
    slug: 'premium-squad',
    name: 'Premium Squad',
    mode: 'unsupported-mode',
    mission: 'Research safely'
  });

  assert.equal(result.valid, false);
  assert.ok(result.errors.some((error) => error.code === 'schema.required'));
  assert.ok(result.errors.some((error) => error.code === 'schema.enum'));
});

test('schema path containment rejects sibling and prefix-confusion paths', () => {
  const root = path.resolve('C:\\project');
  assert.equal(isContainedPath(root, path.join(root, '.aioson', 'schema.json')), true);
  assert.equal(isContainedPath(root, path.resolve('C:\\project-evil\\schema.json')), false);
});

test('AC-premium-04 strict live-required readiness enforces 6h freshness, policy identity and grounded claims', async () => {
  const projectDir = await makeTempDir();
  const slug = 'freshness-squad';
  const squadDir = path.join(projectDir, '.aioson', 'squads', slug);
  const evidenceDir = path.join(squadDir, 'sessions', 'session-1', 'evidence');
  await fs.mkdir(evidenceDir, { recursive: true });
  const manifest = {
    researchPolicy: {
      policy: 'live-required',
      maxAgeHours: 72,
      evidencePackRequired: true
    },
    composition: { persistent_core: ['owner', 'reviewer'] },
    executors: [
      {
        slug: 'owner',
        type: 'agent',
        persistent: true,
        contribution: 'Integrate evidence',
        decisionRights: ['final integration'],
        file: `.aioson/squads/${slug}/agents/owner.md`
      },
      {
        slug: 'reviewer',
        type: 'reviewer',
        persistent: true,
        contribution: 'Review evidence',
        decisionRights: ['quality veto'],
        file: `.aioson/squads/${slug}/agents/reviewer.md`
      }
    ],
    evaluation: {
      contractVersion: '1.0.0',
      criteria: [{ id: 'c1' }],
      heldOutCases: [{ id: 'h1' }]
    }
  };
  const pack = {
    schemaVersion: '1.0.0',
    topic: 'freshness',
    squad: slug,
    policy: { type: 'live-required' },
    status: 'pass',
    provider: { available: true, source: 'fixture' },
    collected_at: new Date(Date.now() - 7 * 3_600_000).toISOString(),
    sources: [{
      id: 'source-1',
      url: 'https://example.test/source',
      content_hash: 'a'.repeat(64)
    }],
    claims: [{
      id: 'claim-1',
      text: 'Current fact',
      status: 'supported',
      source_ids: ['source-1'],
      citations: ['https://example.test/source']
    }]
  };
  const packPath = path.join(evidenceDir, 'freshness.json');
  await fs.writeFile(packPath, JSON.stringify(pack));
  const stale = await validatePremiumManifest(projectDir, slug, manifest, { skipEval: true });
  assert.ok(stale.errors.some((error) => error.includes('older than 6 hour')));

  pack.collected_at = new Date().toISOString();
  pack.policy.type = 'live-check';
  await fs.writeFile(packPath, JSON.stringify(pack));
  const wrongPolicy = await validatePremiumManifest(projectDir, slug, manifest, { skipEval: true });
  assert.ok(wrongPolicy.errors.some((error) => error.includes('no Evidence Pack found')));

  pack.policy.type = 'live-required';
  pack.claims = [];
  await fs.writeFile(packPath, JSON.stringify(pack));
  const ungrounded = await validatePremiumManifest(projectDir, slug, manifest, { skipEval: true });
  assert.ok(ungrounded.errors.some((error) => error.includes('not live/verified')));

  pack.claims = [{
    id: 'claim-1',
    text: 'Current fact',
    status: 'supported',
    source_ids: ['source-1'],
    citations: ['https://example.test/source']
  }];
  await fs.writeFile(packPath, JSON.stringify(pack));
  const ready = await validatePremiumManifest(projectDir, slug, manifest, { skipEval: true });
  assert.equal(
    ready.errors.some((error) => error.includes('research evidence') || error.includes('Evidence Pack')),
    false,
    ready.errors.join('\n')
  );
});
