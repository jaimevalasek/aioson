'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');

const { runDossierInit, runDossierAddFinding } = require('../../src/commands/dossier');

let root;
let prevCwd;

function silentLogger() {
  return { log: () => {}, error: () => {}, warn: () => {} };
}

describe('dossier:add-finding', () => {
  beforeEach(async () => {
    prevCwd = process.cwd();
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'aioson-cmd-finding-'));
    await fs.mkdir(path.join(root, '.aioson', 'context'), { recursive: true });
    process.chdir(root);
  });
  afterEach(async () => {
    process.chdir(prevCwd);
    await fs.rm(root, { recursive: true, force: true });
  });

  async function seedDossier(slug = 'feature-x') {
    await runDossierInit({
      args: ['.'], options: { slug, json: true, classification: 'MEDIUM' }, logger: silentLogger()
    });
  }

  it('adds finding to Agent Trail section', async () => {
    await seedDossier();
    const result = await runDossierAddFinding({
      args: ['.'],
      options: {
        slug: 'feature-x', agent: 'analyst',
        section: 'Agent Trail', content: 'Module X uses event-driven pattern.',
        json: true
      },
      logger: silentLogger()
    });
    assert.equal(result.ok, true);
    assert.equal(result.added, true);

    const dossier = await fs.readFile(
      path.join(root, '.aioson', 'context', 'features', 'feature-x', 'dossier.md'),
      'utf8'
    );
    assert.match(dossier, /Module X uses event-driven pattern\./);
    assert.match(dossier, /@analyst/);
    assert.match(dossier, /sha256:/);
  });

  it('AC9: idempotent — same content twice returns added:false', async () => {
    await seedDossier();
    const opts = {
      args: ['.'],
      options: { slug: 'feature-x', agent: 'dev', section: 'Code Map', content: 'Finds A', json: true },
      logger: silentLogger()
    };
    const first = await runDossierAddFinding(opts);
    const second = await runDossierAddFinding(opts);

    assert.equal(first.added, true);
    assert.equal(second.added, false);
    assert.equal(first.hash, second.hash);

    const dossier = await fs.readFile(
      path.join(root, '.aioson', 'context', 'features', 'feature-x', 'dossier.md'),
      'utf8'
    );
    // Content should appear only once
    const count = (dossier.match(/Finds A/g) || []).length;
    assert.equal(count, 1);
  });

  it('returns not_found when dossier does not exist', async () => {
    const result = await runDossierAddFinding({
      args: ['.'],
      options: { slug: 'no-dossier', agent: 'dev', section: 'Code Map', content: 'x', json: true },
      logger: silentLogger()
    });
    assert.equal(result.ok, false);
    assert.equal(result.reason, 'not_found');
  });

  it('rejects missing --content', async () => {
    await seedDossier();
    const result = await runDossierAddFinding({
      args: ['.'],
      options: { slug: 'feature-x', agent: 'dev', section: 'Code Map', json: true },
      logger: silentLogger()
    });
    assert.equal(result.ok, false);
    assert.equal(result.reason, 'missing_content');
  });

  it('rejects invalid agent', async () => {
    await seedDossier();
    const result = await runDossierAddFinding({
      args: ['.'],
      options: { slug: 'feature-x', agent: 'not-an-agent', section: 'Code Map', content: 'x', json: true },
      logger: silentLogger()
    });
    assert.equal(result.ok, false);
    assert.equal(result.reason, 'invalid_agent');
  });
});
