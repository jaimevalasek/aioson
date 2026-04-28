'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');

const revStore = require('../../src/dossier/revision-store');
const dossierStore = require('../../src/dossier/store');

const FIXED_NOW = () => new Date('2026-04-28T10:00:00Z');

let root;
let contextDir;

async function seedDossier(slug = 'feature-x') {
  await dossierStore.init({ slug, contextDir, classification: 'MEDIUM', now: FIXED_NOW });
}

describe('revision-store — open', () => {
  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'aioson-rev-store-'));
    contextDir = path.join(root, '.aioson', 'context');
    await fs.mkdir(contextDir, { recursive: true });
  });
  afterEach(async () => {
    await fs.rm(root, { recursive: true, force: true });
  });

  it('AC1: creates revision in revisions.json with unique id and valid schema', async () => {
    await seedDossier();
    const rev = await revStore.open({
      slug: 'feature-x',
      contextDir,
      requestedBy: 'analyst',
      target: 'product',
      targetArtifact: '.aioson/context/prd-feature-x.md',
      reason: 'PRD assumes sync but module is async',
      severity: 'blocking',
      now: FIXED_NOW
    });

    assert.equal(rev.id, 'rev-001');
    assert.equal(rev.status, 'pending');
    assert.equal(rev.requested_by, 'analyst');
    assert.equal(rev.target, 'product');
    assert.equal(rev.severity, 'blocking');
    assert.equal(rev.created_at, '2026-04-28T10:00:00.000Z');
    assert.equal(rev.resolved_at, null);

    const revisions = await revStore.readRevisions({ slug: 'feature-x', contextDir });
    assert.equal(revisions.length, 1);
    assert.equal(revisions[0].id, 'rev-001');
  });

  it('AC2: updates ## Revision Requests section in dossier.md', async () => {
    await seedDossier();
    await revStore.open({
      slug: 'feature-x',
      contextDir,
      requestedBy: 'analyst',
      target: 'product',
      targetArtifact: '.aioson/context/prd-feature-x.md',
      reason: 'Async gap',
      severity: 'blocking',
      now: FIXED_NOW
    });

    const dp = path.join(contextDir, 'features', 'feature-x', 'dossier.md');
    const raw = await fs.readFile(dp, 'utf8');
    assert.match(raw, /## Revision Requests/);
    assert.match(raw, /rev-001/);
    assert.match(raw, /blocking/);
  });

  it('generates sequential IDs rev-001, rev-002', async () => {
    await seedDossier();
    const openArgs = {
      slug: 'feature-x', contextDir,
      requestedBy: 'dev', target: 'analyst',
      targetArtifact: '.aioson/context/requirements-feature-x.md',
      reason: 'Gap found', severity: 'advisory', now: FIXED_NOW
    };
    const r1 = await revStore.open(openArgs);
    const r2 = await revStore.open({ ...openArgs, reason: 'Another gap' });
    assert.equal(r1.id, 'rev-001');
    assert.equal(r2.id, 'rev-002');
  });

  it('rejects invalid severity', async () => {
    await seedDossier();
    await assert.rejects(
      revStore.open({
        slug: 'feature-x', contextDir,
        requestedBy: 'analyst', target: 'product',
        targetArtifact: '.aioson/context/prd-feature-x.md',
        reason: 'x', severity: 'critical', now: FIXED_NOW
      }),
      (err) => err.code === 'EREVSCHEMA'
    );
  });

  it('rejects invalid target agent', async () => {
    await seedDossier();
    await assert.rejects(
      revStore.open({
        slug: 'feature-x', contextDir,
        requestedBy: 'analyst', target: 'unknown-agent',
        targetArtifact: '.aioson/context/prd-feature-x.md',
        reason: 'x', severity: 'blocking', now: FIXED_NOW
      }),
      (err) => err.code === 'EREVAGENT'
    );
  });
});

describe('revision-store — list', () => {
  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'aioson-rev-store-'));
    contextDir = path.join(root, '.aioson', 'context');
    await fs.mkdir(contextDir, { recursive: true });
  });
  afterEach(async () => {
    await fs.rm(root, { recursive: true, force: true });
  });

  it('AC3: --status=pending returns only pending revisions', async () => {
    await seedDossier();
    const base = {
      slug: 'feature-x', contextDir,
      requestedBy: 'analyst', target: 'product',
      targetArtifact: '.aioson/context/prd-feature-x.md',
      severity: 'blocking', now: FIXED_NOW
    };
    await revStore.open({ ...base, reason: 'Gap 1' });
    await revStore.open({ ...base, reason: 'Gap 2' });
    await revStore.resolve({ slug: 'feature-x', contextDir, revId: 'rev-001', action: 'reject', now: FIXED_NOW });

    const pending = await revStore.list({ slug: 'feature-x', contextDir, status: 'pending' });
    assert.equal(pending.length, 1);
    assert.equal(pending[0].id, 'rev-002');
  });

  it('returns all revisions when no status filter', async () => {
    await seedDossier();
    const base = {
      slug: 'feature-x', contextDir,
      requestedBy: 'dev', target: 'analyst',
      targetArtifact: '.aioson/context/requirements-feature-x.md',
      severity: 'advisory', now: FIXED_NOW
    };
    await revStore.open({ ...base, reason: 'Gap A' });
    await revStore.open({ ...base, reason: 'Gap B' });

    const all = await revStore.list({ slug: 'feature-x', contextDir });
    assert.equal(all.length, 2);
  });

  it('returns empty array for feature with no revisions', async () => {
    await seedDossier();
    const revisions = await revStore.list({ slug: 'feature-x', contextDir });
    assert.deepEqual(revisions, []);
  });
});

describe('revision-store — resolve', () => {
  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'aioson-rev-store-'));
    contextDir = path.join(root, '.aioson', 'context');
    await fs.mkdir(contextDir, { recursive: true });
  });
  afterEach(async () => {
    await fs.rm(root, { recursive: true, force: true });
  });

  async function openOne(severity = 'blocking') {
    await seedDossier();
    return revStore.open({
      slug: 'feature-x', contextDir,
      requestedBy: 'analyst', target: 'product',
      targetArtifact: '.aioson/context/prd-feature-x.md',
      reason: 'PRD gap', severity, now: FIXED_NOW
    });
  }

  it('AC4: reject is terminal — revision cannot be re-opened', async () => {
    await openOne();
    await revStore.resolve({ slug: 'feature-x', contextDir, revId: 'rev-001', action: 'reject', now: FIXED_NOW });

    await assert.rejects(
      revStore.resolve({ slug: 'feature-x', contextDir, revId: 'rev-001', action: 'reject', now: FIXED_NOW }),
      (err) => err.code === 'EREVNOTPENDING'
    );
  });

  it('approve marks revision as approved', async () => {
    await openOne('advisory');
    // Need workflow.state.json for gate increment — not present here, so gate increment is skipped
    const { revision } = await revStore.resolve({ slug: 'feature-x', contextDir, revId: 'rev-001', action: 'approve', now: FIXED_NOW });
    assert.equal(revision.status, 'approved');
    assert.equal(revision.resolved_at, '2026-04-28T10:00:00.000Z');
  });

  it('reject marks revision as rejected', async () => {
    await openOne();
    const { revision } = await revStore.resolve({ slug: 'feature-x', contextDir, revId: 'rev-001', action: 'reject', now: FIXED_NOW });
    assert.equal(revision.status, 'rejected');
  });

  it('AC5/getBlockingRevisions: resolved revisions do not block', async () => {
    await openOne('blocking');
    let blockers = await revStore.getBlockingRevisions({ slug: 'feature-x', contextDir });
    assert.equal(blockers.length, 1);

    await revStore.resolve({ slug: 'feature-x', contextDir, revId: 'rev-001', action: 'reject', now: FIXED_NOW });
    blockers = await revStore.getBlockingRevisions({ slug: 'feature-x', contextDir });
    assert.equal(blockers.length, 0);
  });

  it('not_found when rev-id does not exist', async () => {
    await seedDossier();
    await assert.rejects(
      revStore.resolve({ slug: 'feature-x', contextDir, revId: 'rev-999', action: 'reject', now: FIXED_NOW }),
      (err) => err.code === 'EREVNOTFOUND'
    );
  });

  it('AC6: approve increments gate_revision_rounds when workflow.state.json exists', async () => {
    await seedDossier();
    // Seed a minimal workflow.state.json
    const statePath = path.join(contextDir, 'workflow.state.json');
    await fs.writeFile(statePath, JSON.stringify({
      featureSlug: 'feature-x',
      gate_revision_rounds: { requirements: 0 }
    }), 'utf8');

    await revStore.open({
      slug: 'feature-x', contextDir,
      requestedBy: 'analyst', target: 'product',
      targetArtifact: '.aioson/context/prd-feature-x.md',
      reason: 'Gap', severity: 'advisory', now: FIXED_NOW
    });

    const { gateIncremented } = await revStore.resolve({
      slug: 'feature-x', contextDir, revId: 'rev-001', action: 'approve', now: FIXED_NOW
    });

    assert.equal(gateIncremented.gate, 'requirements');
    assert.equal(gateIncremented.rounds, 1);

    const state = JSON.parse(await fs.readFile(statePath, 'utf8'));
    assert.equal(state.gate_revision_rounds.requirements, 1);
  });

  it('AC7: 4th approve on same gate requires --force-revision', async () => {
    await seedDossier();
    const statePath = path.join(contextDir, 'workflow.state.json');
    await fs.writeFile(statePath, JSON.stringify({
      featureSlug: 'feature-x',
      gate_revision_rounds: { requirements: 3 }
    }), 'utf8');

    await revStore.open({
      slug: 'feature-x', contextDir,
      requestedBy: 'dev', target: 'product',
      targetArtifact: '.aioson/context/prd-feature-x.md',
      reason: 'Fourth gap', severity: 'advisory', now: FIXED_NOW
    });

    await assert.rejects(
      revStore.resolve({ slug: 'feature-x', contextDir, revId: 'rev-001', action: 'approve', forceRevision: false, now: FIXED_NOW }),
      (err) => err.code === 'EREVLOOP'
    );

    // With --force-revision it should succeed
    const { revision } = await revStore.resolve({ slug: 'feature-x', contextDir, revId: 'rev-001', action: 'approve', forceRevision: true, now: FIXED_NOW });
    assert.equal(revision.status, 'approved');
  });
});

describe('revision-store — resolve auto-compact (O-01)', () => {
  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'aioson-rev-store-'));
    contextDir = path.join(root, '.aioson', 'context');
    await fs.mkdir(contextDir, { recursive: true });
  });
  afterEach(async () => {
    await fs.rm(root, { recursive: true, force: true });
  });

  async function makeLargeDossier(slug) {
    // Create a dossier large enough to trigger compaction (> 15KB)
    const { MAX_ACTIVE_SIZE } = require('../../src/dossier/dossier-compact');
    await dossierStore.init({ slug, contextDir, classification: 'MEDIUM', now: FIXED_NOW,
      whyText: 'x'.repeat(MAX_ACTIVE_SIZE + 3000) });
  }

  it('auto-compacts dossier after reject when size > 15KB', async () => {
    const { MAX_ACTIVE_SIZE } = require('../../src/dossier/dossier-compact');
    await makeLargeDossier('feature-x');
    await revStore.open({
      slug: 'feature-x', contextDir,
      requestedBy: 'analyst', target: 'product',
      targetArtifact: '.aioson/context/prd-feature-x.md',
      reason: 'Gap', severity: 'advisory', now: FIXED_NOW
    });

    await revStore.resolve({ slug: 'feature-x', contextDir, revId: 'rev-001', action: 'reject', now: FIXED_NOW });

    const dp = path.join(contextDir, 'features', 'feature-x', 'dossier.md');
    const stat = await fs.stat(dp);
    assert.ok(stat.size <= MAX_ACTIVE_SIZE, `dossier should be compacted after reject (got ${stat.size} bytes)`);
  });

  it('auto-compacts dossier after approve when size > 15KB', async () => {
    const { MAX_ACTIVE_SIZE } = require('../../src/dossier/dossier-compact');
    await makeLargeDossier('feature-x');
    await revStore.open({
      slug: 'feature-x', contextDir,
      requestedBy: 'dev', target: 'analyst',
      targetArtifact: '.aioson/context/requirements-feature-x.md',
      reason: 'Gap', severity: 'advisory', now: FIXED_NOW
    });

    await revStore.resolve({ slug: 'feature-x', contextDir, revId: 'rev-001', action: 'approve', now: FIXED_NOW });

    const dp = path.join(contextDir, 'features', 'feature-x', 'dossier.md');
    const stat = await fs.stat(dp);
    assert.ok(stat.size <= MAX_ACTIVE_SIZE, `dossier should be compacted after approve (got ${stat.size} bytes)`);
  });

  it('does NOT compact when dossier is small', async () => {
    await seedDossier();
    await revStore.open({
      slug: 'feature-x', contextDir,
      requestedBy: 'analyst', target: 'product',
      targetArtifact: '.aioson/context/prd-feature-x.md',
      reason: 'Gap', severity: 'advisory', now: FIXED_NOW
    });

    const dpBefore = path.join(contextDir, 'features', 'feature-x', 'dossier.md');
    const rawBefore = await fs.readFile(dpBefore, 'utf8');
    await revStore.resolve({ slug: 'feature-x', contextDir, revId: 'rev-001', action: 'reject', now: FIXED_NOW });
    const rawAfter = await fs.readFile(dpBefore, 'utf8');

    // History file should NOT have been created (no compaction)
    const histPath = path.join(contextDir, 'features', 'feature-x', 'dossier-history.md');
    let histExists = false;
    try { await fs.access(histPath); histExists = true; } catch { /* absent */ }
    assert.equal(histExists, false, 'dossier-history.md should not exist when size is ok');
  });
});

describe('revision-store — getBlockingRevisions', () => {
  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'aioson-rev-store-'));
    contextDir = path.join(root, '.aioson', 'context');
    await fs.mkdir(contextDir, { recursive: true });
  });
  afterEach(async () => {
    await fs.rm(root, { recursive: true, force: true });
  });

  it('returns empty array for feature with no revisions file', async () => {
    const blockers = await revStore.getBlockingRevisions({ slug: 'new-feature', contextDir });
    assert.deepEqual(blockers, []);
  });

  it('returns only pending blocking revisions', async () => {
    await seedDossier();
    await revStore.open({
      slug: 'feature-x', contextDir,
      requestedBy: 'analyst', target: 'product',
      targetArtifact: '.aioson/context/prd-feature-x.md',
      reason: 'Blocking gap', severity: 'blocking', now: FIXED_NOW
    });
    await revStore.open({
      slug: 'feature-x', contextDir,
      requestedBy: 'dev', target: 'analyst',
      targetArtifact: '.aioson/context/requirements-feature-x.md',
      reason: 'Advisory gap', severity: 'advisory', now: FIXED_NOW
    });

    const blockers = await revStore.getBlockingRevisions({ slug: 'feature-x', contextDir });
    assert.equal(blockers.length, 1);
    assert.equal(blockers[0].id, 'rev-001');
    assert.equal(blockers[0].severity, 'blocking');
  });
});
