'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');

const { runRevisionOpen, runRevisionList, runRevisionResolve } = require('../../src/commands/revision');
const { runDossierInit } = require('../../src/commands/dossier');

let root;
let prevCwd;

function silentLogger() {
  return { log: () => {}, error: () => {}, warn: () => {} };
}

async function seedDossier(slug = 'feature-x') {
  await runDossierInit({
    args: ['.'],
    options: { slug, json: true, classification: 'MEDIUM' },
    logger: silentLogger()
  });
}

describe('revision:open', () => {
  beforeEach(async () => {
    prevCwd = process.cwd();
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'aioson-cmd-rev-'));
    await fs.mkdir(path.join(root, '.aioson', 'context'), { recursive: true });
    process.chdir(root);
  });
  afterEach(async () => {
    process.chdir(prevCwd);
    await fs.rm(root, { recursive: true, force: true });
  });

  it('AC1: creates revision with valid schema', async () => {
    await seedDossier();
    const result = await runRevisionOpen({
      args: ['.'],
      options: {
        slug: 'feature-x',
        'requested-by': 'analyst',
        target: 'product',
        'target-artifact': '.aioson/context/prd-feature-x.md',
        reason: 'PRD gap found',
        severity: 'blocking',
        json: true
      },
      logger: silentLogger()
    });
    assert.equal(result.ok, true);
    assert.equal(result.revision.id, 'rev-001');
    assert.equal(result.revision.status, 'pending');
    assert.equal(result.revision.severity, 'blocking');
  });

  it('rejects missing --slug', async () => {
    const result = await runRevisionOpen({
      args: ['.'], options: { json: true }, logger: silentLogger()
    });
    assert.equal(result.ok, false);
    assert.equal(result.reason, 'missing_slug');
  });

  it('rejects invalid target agent', async () => {
    await seedDossier();
    const result = await runRevisionOpen({
      args: ['.'],
      options: {
        slug: 'feature-x', 'requested-by': 'analyst', target: 'not-an-agent',
        'target-artifact': '.aioson/context/prd-feature-x.md',
        reason: 'x', severity: 'blocking', json: true
      },
      logger: silentLogger()
    });
    assert.equal(result.ok, false);
    assert.equal(result.reason, 'invalid_agent');
  });
});

describe('revision:list', () => {
  beforeEach(async () => {
    prevCwd = process.cwd();
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'aioson-cmd-rev-'));
    await fs.mkdir(path.join(root, '.aioson', 'context'), { recursive: true });
    process.chdir(root);
  });
  afterEach(async () => {
    process.chdir(prevCwd);
    await fs.rm(root, { recursive: true, force: true });
  });

  it('AC3: --status=pending returns only pending', async () => {
    await seedDossier();
    await runRevisionOpen({
      args: ['.'],
      options: {
        slug: 'feature-x', 'requested-by': 'analyst', target: 'product',
        'target-artifact': '.aioson/context/prd-feature-x.md',
        reason: 'Gap 1', severity: 'blocking', json: true
      },
      logger: silentLogger()
    });
    await runRevisionOpen({
      args: ['.'],
      options: {
        slug: 'feature-x', 'requested-by': 'dev', target: 'analyst',
        'target-artifact': '.aioson/context/requirements-feature-x.md',
        reason: 'Gap 2', severity: 'advisory', json: true
      },
      logger: silentLogger()
    });
    await runRevisionResolve({
      args: ['.'],
      options: { slug: 'feature-x', 'rev-id': 'rev-001', reject: true, json: true },
      logger: silentLogger()
    });

    const result = await runRevisionList({
      args: ['.'],
      options: { slug: 'feature-x', status: 'pending', json: true },
      logger: silentLogger()
    });

    assert.equal(result.ok, true);
    assert.equal(result.count, 1);
    assert.equal(result.revisions[0].id, 'rev-002');
  });

  it('returns empty list for feature with no revisions', async () => {
    await seedDossier();
    const result = await runRevisionList({
      args: ['.'], options: { slug: 'feature-x', json: true }, logger: silentLogger()
    });
    assert.equal(result.ok, true);
    assert.equal(result.count, 0);
  });
});

describe('revision:resolve', () => {
  beforeEach(async () => {
    prevCwd = process.cwd();
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'aioson-cmd-rev-'));
    await fs.mkdir(path.join(root, '.aioson', 'context'), { recursive: true });
    process.chdir(root);
  });
  afterEach(async () => {
    process.chdir(prevCwd);
    await fs.rm(root, { recursive: true, force: true });
  });

  async function openRevision(severity = 'blocking') {
    await seedDossier();
    return runRevisionOpen({
      args: ['.'],
      options: {
        slug: 'feature-x', 'requested-by': 'analyst', target: 'product',
        'target-artifact': '.aioson/context/prd-feature-x.md',
        reason: 'Gap', severity, json: true
      },
      logger: silentLogger()
    });
  }

  it('AC4: reject is terminal — second reject fails with not_pending', async () => {
    await openRevision();
    await runRevisionResolve({
      args: ['.'],
      options: { slug: 'feature-x', 'rev-id': 'rev-001', reject: true, json: true },
      logger: silentLogger()
    });
    const result = await runRevisionResolve({
      args: ['.'],
      options: { slug: 'feature-x', 'rev-id': 'rev-001', reject: true, json: true },
      logger: silentLogger()
    });
    assert.equal(result.ok, false);
    assert.equal(result.reason, 'not_pending');
  });

  it('approve succeeds for advisory revision', async () => {
    await openRevision('advisory');
    const result = await runRevisionResolve({
      args: ['.'],
      options: { slug: 'feature-x', 'rev-id': 'rev-001', approve: true, json: true },
      logger: silentLogger()
    });
    assert.equal(result.ok, true);
    assert.equal(result.revision.status, 'approved');
  });

  it('returns not_found for non-existent rev-id', async () => {
    await seedDossier();
    const result = await runRevisionResolve({
      args: ['.'],
      options: { slug: 'feature-x', 'rev-id': 'rev-999', reject: true, json: true },
      logger: silentLogger()
    });
    assert.equal(result.ok, false);
    assert.equal(result.reason, 'not_found');
  });

  it('returns missing_action when neither --approve nor --reject given', async () => {
    await seedDossier();
    const result = await runRevisionResolve({
      args: ['.'],
      options: { slug: 'feature-x', 'rev-id': 'rev-001', json: true },
      logger: silentLogger()
    });
    assert.equal(result.ok, false);
    assert.equal(result.reason, 'missing_action');
  });
});
