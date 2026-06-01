'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { runContextHealth } = require('../src/commands/context-health');
const { cleanupTmpDir } = require('./helpers/sqlite-cleanup');

const mockLogger = { log: () => {}, error: () => {}, warn: () => {} };

describe('context-health.js — runContextHealth', () => {
  let tmpDir;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'context-health-test-'));
    await fs.mkdir(path.join(tmpDir, '.aioson', 'context'), { recursive: true });
    // Create a minimal runtime DB so openRuntimeDb does not return null
    const runtimeDir = path.join(tmpDir, '.aioson', 'runtime');
    await fs.mkdir(runtimeDir, { recursive: true });
    const Database = require('better-sqlite3');
    const db = new Database(path.join(runtimeDir, 'aios.sqlite'));
    db.exec('CREATE TABLE IF NOT EXISTS execution_events (id INTEGER PRIMARY KEY, event_type TEXT, created_at TEXT);');
    db.close();
  });

  afterEach(async () => {
    // bug-found-004: helper handles any residual EBUSY from WAL/SHM lingering
    // on Windows. The matching production fix in context-health.js truncates
    // the WAL before closing, so retries should rarely fire in practice.
    await cleanupTmpDir(tmpDir);
  });

  it('returns no_context_dir when context directory missing', async () => {
    const emptyDir = await fs.mkdtemp(path.join(os.tmpdir(), 'context-health-empty-'));
    try {
      const result = await runContextHealth({
        args: [emptyDir],
        options: { json: true },
        logger: mockLogger
      });
      assert.equal(result.ok, false);
      assert.equal(result.reason, 'no_context_dir');
    } finally {
      await fs.rm(emptyDir, { recursive: true, force: true });
    }
  });

  it('reports empty context directory', async () => {
    const result = await runContextHealth({
      args: [tmpDir],
      options: { json: true },
      logger: mockLogger
    });
    assert.equal(result.ok, true);
    assert.equal(result.totalTokens, 0);
    assert.equal(result.files.length, 0);
    assert.equal(result.staleSpecs.length, 0);
    assert.deepEqual(result.driftWarnings, []);
    assert.equal(result.skeletonPresent, false);
  });

  it('estimates tokens for markdown files', async () => {
    const content = 'A'.repeat(400); // 400 chars = ~100 tokens
    await fs.writeFile(path.join(tmpDir, '.aioson', 'context', 'spec.md'), content);

    const result = await runContextHealth({
      args: [tmpDir],
      options: { json: true },
      logger: mockLogger
    });
    assert.equal(result.ok, true);
    assert.equal(result.files.length, 1);
    assert.equal(result.files[0].file, 'spec.md');
    assert.equal(result.files[0].sizeBytes, 400);
    assert.equal(result.files[0].tokens, 100);
    assert.equal(result.files[0].heavy, false);
    assert.equal(result.files[0].critical, false);
  });

  it('flags heavy and critical files by token count', async () => {
    const heavyContent = 'B'.repeat(20004); // ~5001 tokens = heavy
    const criticalContent = 'C'.repeat(50004); // ~12501 tokens = critical
    await fs.writeFile(path.join(tmpDir, '.aioson', 'context', 'heavy.md'), heavyContent);
    await fs.writeFile(path.join(tmpDir, '.aioson', 'context', 'critical.md'), criticalContent);

    const result = await runContextHealth({
      args: [tmpDir],
      options: { json: true },
      logger: mockLogger
    });
    assert.equal(result.files.length, 2);
    const heavy = result.files.find((f) => f.file === 'heavy.md');
    const critical = result.files.find((f) => f.file === 'critical.md');
    assert.ok(heavy.heavy);
    assert.ok(!heavy.critical);
    assert.ok(critical.heavy);
    assert.ok(critical.critical);
  });

  it('detects stale specs from features.md', async () => {
    await fs.writeFile(
      path.join(tmpDir, '.aioson', 'context', 'features.md'),
      '| slug | status |\n|------|--------|\n| auth | done |\n'
    );
    await fs.writeFile(path.join(tmpDir, '.aioson', 'context', 'spec-auth.md'), '# Auth Spec\n');
    await fs.writeFile(path.join(tmpDir, '.aioson', 'context', 'spec-active.md'), '# Active Spec\n');

    const result = await runContextHealth({
      args: [tmpDir],
      options: { json: true },
      logger: mockLogger
    });
    assert.equal(result.staleSpecs.length, 1);
    assert.ok(result.staleSpecs.includes('spec-auth.md'));
    assert.ok(!result.staleSpecs.includes('spec-active.md'));
  });

  it('detects skeleton-system.md presence', async () => {
    await fs.writeFile(path.join(tmpDir, '.aioson', 'context', 'skeleton-system.md'), '# Skeleton\n');
    const result = await runContextHealth({
      args: [tmpDir],
      options: { json: true },
      logger: mockLogger
    });
    assert.equal(result.skeletonPresent, true);
  });

  it('sorts files by token count descending', async () => {
    await fs.writeFile(path.join(tmpDir, '.aioson', 'context', 'small.md'), 'S');
    await fs.writeFile(path.join(tmpDir, '.aioson', 'context', 'large.md'), 'L'.repeat(1000));

    const result = await runContextHealth({
      args: [tmpDir],
      options: { json: true },
      logger: mockLogger
    });
    assert.equal(result.files[0].file, 'large.md');
    assert.equal(result.files[1].file, 'small.md');
  });

  it('warns when project and active workflow classifications differ', async () => {
    await fs.writeFile(
      path.join(tmpDir, '.aioson', 'context', 'project.context.md'),
      '---\nclassification: "MEDIUM"\n---\n\n# Context\n'
    );
    await fs.writeFile(
      path.join(tmpDir, '.aioson', 'context', 'workflow.state.json'),
      JSON.stringify({ mode: 'feature', classification: 'SMALL', featureSlug: 'cost-context-optimization' })
    );

    const result = await runContextHealth({
      args: [tmpDir],
      options: { json: true },
      logger: mockLogger
    });

    assert.equal(result.ok, true);
    assert.ok(result.driftWarnings.some((warning) => warning.id === 'classification_drift'));
    const warning = result.driftWarnings.find((item) => item.id === 'classification_drift');
    assert.match(warning.message, /MEDIUM/);
    assert.match(warning.message, /SMALL/);
  });

  it('warns when features.md active feature differs from project-pulse.md', async () => {
    await fs.writeFile(
      path.join(tmpDir, '.aioson', 'context', 'features.md'),
      '| slug | status | started | completed |\n|------|--------|---------|-----------|\n| cost-context-optimization | in_progress | 2026-06-01 | - |\n'
    );
    await fs.writeFile(
      path.join(tmpDir, '.aioson', 'context', 'project-pulse.md'),
      '---\nactive_feature: project\n---\n\n# Pulse\n'
    );

    const result = await runContextHealth({
      args: [tmpDir],
      options: { json: true },
      logger: mockLogger
    });

    assert.equal(result.ok, true);
    assert.ok(result.driftWarnings.some((warning) => warning.id === 'active_state_drift'));
  });
});
