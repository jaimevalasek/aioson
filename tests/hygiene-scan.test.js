'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const { classifyArtifactName, runHygieneScan } = require('../src/commands/hygiene-scan');

const RM = { recursive: true, force: true, maxRetries: 5, retryDelay: 50 };

async function makeProject() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'aioson-hygiene-'));
  await fs.mkdir(path.join(dir, '.aioson', 'context'), { recursive: true });
  return dir;
}

async function write(dir, relPath, content) {
  const full = path.join(dir, relPath);
  await fs.mkdir(path.dirname(full), { recursive: true });
  await fs.writeFile(full, content, 'utf8');
}

function silentLogger() {
  const lines = [];
  return { lines, log: (line = '') => lines.push(String(line)), error: (line = '') => lines.push(String(line)) };
}

test('hygiene:scan reports done features missing archive manifest entries', async () => {
  const dir = await makeProject();
  try {
    await write(dir, '.aioson/context/features.md', [
      '# Features',
      '',
      '| slug | status | started | completed |',
      '|------|--------|---------|-----------|',
      '| checkout | done | 2026-06-01 | 2026-06-02 |',
      ''
    ].join('\n'));
    await write(dir, '.aioson/context/prd-checkout.md', '## Vision\nCheckout.\n');
    await write(dir, '.aioson/context/spec-checkout.md', '# Spec\n');

    const result = await runHygieneScan({
      args: [dir],
      options: { json: true },
      logger: silentLogger()
    });

    assert.equal(result.ok, true);
    assert.equal(result.readonly, true);
    assert.equal(result.buckets.done_features_pending_archive.length, 1);
    assert.equal(result.buckets.done_features_pending_archive[0].slug, 'checkout');
    assert.equal(
      result.buckets.done_features_pending_archive[0].suggested_command,
      'aioson feature:archive . --feature=checkout'
    );

    await fs.access(path.join(dir, '.aioson/context/prd-checkout.md'));
  } finally {
    await fs.rm(dir, RM);
  }
});

test('hygiene:scan reports stale dev-state when implementation is complete', async () => {
  const dir = await makeProject();
  try {
    await write(dir, '.aioson/context/features.md', [
      '| slug | status | started | completed |',
      '| stale-feature | done | 2026-06-01 | 2026-06-02 |',
      ''
    ].join('\n'));
    await write(dir, '.aioson/context/dev-state.md', [
      '---',
      'active_feature: stale-feature',
      'status: dev_complete',
      '---',
      '',
      '# Dev State',
      ''
    ].join('\n'));

    const result = await runHygieneScan({
      args: [dir],
      options: { json: true },
      logger: silentLogger()
    });

    assert.equal(result.buckets.stale_state_files.length, 1);
    assert.equal(result.buckets.stale_state_files[0].path, '.aioson/context/dev-state.md');
    assert.equal(result.buckets.stale_state_files[0].active_feature, 'stale-feature');
  } finally {
    await fs.rm(dir, RM);
  }
});

test('hygiene:scan reports pending neural-chain noise files', async () => {
  const dir = await makeProject();
  try {
    await write(dir, '.aioson/context/features.md', '| slug | status | started | completed |\n');
    await write(dir, '.aioson/context/noises/checkout-20260619-2145.md', [
      '---',
      'slug: checkout',
      'edit_at: 2026-06-19T21:45:00.000Z',
      'autonomy_mode: guarded',
      'source_files: ["src/cli.js"]',
      'total_items: 2',
      'resolved_items: 1',
      '---',
      '',
      '# Neural Chain - Impact Audit',
      '',
      '- [ ] src/cli.js — agent_event 0.60 (source: src/commands/hygiene-scan.js)',
      '- [x] tests/hygiene-scan.test.js — agent_event 0.60 (source: src/commands/hygiene-scan.js)',
      ''
    ].join('\n'));

    const result = await runHygieneScan({
      args: [dir],
      options: { json: true },
      logger: silentLogger()
    });

    assert.equal(result.buckets.pending_chain_noises.length, 1);
    const noise = result.buckets.pending_chain_noises[0];
    assert.equal(noise.path, '.aioson/context/noises/checkout-20260619-2145.md');
    assert.equal(noise.pending_count, 1);
    assert.equal(noise.resolved_count, 1);
    assert.equal(noise.items[0].target_path, 'src/cli.js');
  } finally {
    await fs.rm(dir, RM);
  }
});

test('hygiene:scan classifies resolved on-demand security findings outside feature registry', async () => {
  const dir = await makeProject();
  try {
    await write(dir, '.aioson/context/features.md', [
      '| slug | status | started | completed |',
      '| registered | in_progress | 2026-06-01 | — |',
      ''
    ].join('\n'));
    await write(dir, '.aioson/context/security-findings-context-intelligence.json', JSON.stringify({
      review_contract: {
        scope_mode: 'on_demand',
        evidence_policy: 'safe-proof-only',
        findings_artifact_path: '.aioson/context/security-findings-context-intelligence.json'
      },
      findings: [
        {
          id: 'SF-01',
          severity: 'high',
          recommended_gate_status: 'block',
          status: 'fixed'
        }
      ]
    }, null, 2));

    const result = await runHygieneScan({
      args: [dir],
      options: { json: true },
      logger: silentLogger()
    });

    assert.equal(result.buckets.on_demand_review_artifacts.length, 1);
    const artifact = result.buckets.on_demand_review_artifacts[0];
    assert.equal(artifact.path, '.aioson/context/security-findings-context-intelligence.json');
    assert.equal(artifact.status, 'resolved');
    assert.deepEqual(artifact.blockers, []);
  } finally {
    await fs.rm(dir, RM);
  }
});

test('hygiene:scan reports non-review slug artifacts with no features.md owner', async () => {
  const dir = await makeProject();
  try {
    await write(dir, '.aioson/context/features.md', [
      '| slug | status | started | completed |',
      '| registered | in_progress | 2026-06-01 | — |',
      ''
    ].join('\n'));
    await write(dir, '.aioson/context/spec-orphan-work.md', '# Spec orphan\n');

    const result = await runHygieneScan({
      args: [dir],
      options: { json: true },
      logger: silentLogger()
    });

    assert.equal(result.buckets.orphan_slug_artifacts.length, 1);
    assert.equal(result.buckets.orphan_slug_artifacts[0].path, '.aioson/context/spec-orphan-work.md');
    assert.equal(result.buckets.orphan_slug_artifacts[0].slug, 'orphan-work');
  } finally {
    await fs.rm(dir, RM);
  }
});

test('hygiene:scan marks malformed security findings as invalid, not resolved', async () => {
  const dir = await makeProject();
  try {
    await write(dir, '.aioson/context/features.md', '| slug | status | started | completed |\n');
    await write(dir, '.aioson/context/security-findings-malformed-review.json', '{ not json');

    const result = await runHygieneScan({
      args: [dir],
      options: { json: true },
      logger: silentLogger()
    });

    assert.equal(result.buckets.on_demand_review_artifacts.length, 1);
    assert.equal(result.buckets.on_demand_review_artifacts[0].status, 'invalid');
  } finally {
    await fs.rm(dir, RM);
  }
});

test('classifyArtifactName extracts stable artifact kinds and slugs', () => {
  assert.deepEqual(
    classifyArtifactName('security-findings-context-intelligence.json'),
    {
      fileName: 'security-findings-context-intelligence.json',
      prefix: 'security-findings',
      slug: 'context-intelligence',
      kind: 'security_findings'
    }
  );
  assert.equal(classifyArtifactName('project.context.md'), null);
});

test('CLI exposes hygiene:scan with JSON output', async () => {
  const dir = await makeProject();
  try {
    await write(dir, '.aioson/context/features.md', [
      '| slug | status | started | completed |',
      '| checkout | done | 2026-06-01 | 2026-06-02 |',
      ''
    ].join('\n'));

    const cli = spawnSync(
      process.execPath,
      [path.join(__dirname, '..', 'bin', 'aioson.js'), 'hygiene:scan', dir, '--json'],
      { encoding: 'utf8' }
    );

    assert.equal(cli.status, 0, cli.stderr);
    const payload = JSON.parse(cli.stdout);
    assert.equal(payload.ok, true);
    assert.equal(payload.readonly, true);
    assert.equal(payload.buckets.done_features_pending_archive.length, 1);
  } finally {
    await fs.rm(dir, RM);
  }
});
