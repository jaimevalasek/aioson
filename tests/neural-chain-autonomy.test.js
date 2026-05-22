'use strict';

// Neural Chain — Phase 1 Slice 6 autonomy + threshold acceptance tests.
// Covers readChainConfig (EC-NC-07 default fallback + valid frontmatter +
// invalid value coercion), classifyImpact (BR-NC-02 rules a + c, BR-NC-03
// mode semantics), serializeItem marker rendering, parseItems marker
// round-trip, and runChainHookOnAgentDone integration in standard +
// autonomous modes with mixed impact mixes.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const { openRuntimeDb } = require('../src/runtime-store');
const {
  readChainConfig,
  normalizeAutonomyMode,
  normalizeThreshold,
  VALID_AUTONOMY_MODES,
  DEFAULT_AUTONOMY_MODE,
  DEFAULT_CHAIN_AUTO_THRESHOLD
} = require('../src/neural-chain-config');
const {
  classifyImpact,
  isTestFileFor,
  runChainHookOnAgentDone
} = require('../src/neural-chain-agent-ingest');
const {
  writeNoiseFile,
  readNoiseFileAndRecompute,
  parseItems
} = require('../src/neural-chain-noise-file');

async function makeTempProject() {
  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'aioson-chain-autonomy-'));
  await fsp.mkdir(path.join(dir, '.aioson', 'runtime'), { recursive: true });
  return dir;
}

async function writeProjectConfig(dir, frontmatter) {
  const lines = ['---'];
  for (const [k, v] of Object.entries(frontmatter)) {
    lines.push(`${k}: ${v}`);
  }
  lines.push('---', '', '# AIOSON Config', '');
  await fsp.writeFile(path.join(dir, '.aioson', 'config.md'), lines.join('\n'), 'utf8');
}

// ─── readChainConfig (EC-NC-07) ───────────────────────────────────────────

test('readChainConfig returns defaults when targetDir is null/empty', () => {
  assert.deepEqual(readChainConfig({}), {
    autonomyMode: DEFAULT_AUTONOMY_MODE,
    chainAutoThreshold: DEFAULT_CHAIN_AUTO_THRESHOLD,
    source: 'defaults'
  });
  assert.deepEqual(readChainConfig({ targetDir: null }), {
    autonomyMode: DEFAULT_AUTONOMY_MODE,
    chainAutoThreshold: DEFAULT_CHAIN_AUTO_THRESHOLD,
    source: 'defaults'
  });
});

test('readChainConfig returns defaults when .aioson/config.md is missing (EC-NC-07)', async () => {
  const dir = await makeTempProject();
  const cfg = readChainConfig({ targetDir: dir });
  assert.equal(cfg.autonomyMode, 'guarded');
  assert.equal(cfg.chainAutoThreshold, 0.8);
  assert.equal(cfg.source, 'defaults');
});

test('readChainConfig returns defaults when config.md has no frontmatter', async () => {
  const dir = await makeTempProject();
  await fsp.writeFile(path.join(dir, '.aioson', 'config.md'), '# AIOSON Config\n\nPure markdown, no frontmatter.\n', 'utf8');
  const cfg = readChainConfig({ targetDir: dir });
  assert.equal(cfg.autonomyMode, 'guarded');
  assert.equal(cfg.chainAutoThreshold, 0.8);
  assert.equal(cfg.source, 'no_frontmatter');
});

test('readChainConfig reads valid frontmatter values', async () => {
  const dir = await makeTempProject();
  await writeProjectConfig(dir, {
    autonomy_mode: 'standard',
    chain_auto_threshold: '0.65'
  });
  const cfg = readChainConfig({ targetDir: dir });
  assert.equal(cfg.autonomyMode, 'standard');
  assert.equal(cfg.chainAutoThreshold, 0.65);
  assert.equal(cfg.source, 'config_md');
});

test('readChainConfig coerces invalid autonomy_mode to default', async () => {
  const dir = await makeTempProject();
  await writeProjectConfig(dir, { autonomy_mode: 'headless', chain_auto_threshold: '0.7' });
  const cfg = readChainConfig({ targetDir: dir });
  assert.equal(cfg.autonomyMode, 'guarded', 'unknown mode → default');
  assert.equal(cfg.chainAutoThreshold, 0.7, 'threshold preserved');
});

test('readChainConfig coerces out-of-range threshold to default', async () => {
  const dir = await makeTempProject();
  await writeProjectConfig(dir, { autonomy_mode: 'standard', chain_auto_threshold: '2.5' });
  const cfg = readChainConfig({ targetDir: dir });
  assert.equal(cfg.autonomyMode, 'standard');
  assert.equal(cfg.chainAutoThreshold, 0.8, 'out-of-range → default');
});

test('normalizeAutonomyMode rejects garbage; normalizeThreshold rejects negatives', () => {
  assert.equal(normalizeAutonomyMode('guarded'), 'guarded');
  assert.equal(normalizeAutonomyMode('Standard'), 'standard');
  assert.equal(normalizeAutonomyMode('headless'), null);
  assert.equal(normalizeAutonomyMode(123), null);
  assert.equal(normalizeThreshold(0.5), 0.5);
  assert.equal(normalizeThreshold('0.9'), 0.9);
  assert.equal(normalizeThreshold(1.5), null);
  assert.equal(normalizeThreshold(-0.1), null);
  assert.equal(normalizeThreshold('abc'), null);
  assert.deepEqual(VALID_AUTONOMY_MODES, ['guarded', 'standard', 'autonomous']);
});

// ─── isTestFileFor (BR-NC-02 rule a) ──────────────────────────────────────

test('isTestFileFor recognizes JS/TS/Python test naming patterns', () => {
  // *.test.js / *.spec.ts
  assert.equal(isTestFileFor('src/foo.test.js', 'src/foo.js'), true);
  assert.equal(isTestFileFor('src/foo.spec.ts', 'src/foo.ts'), true);
  assert.equal(isTestFileFor('tests/foo.test.js', 'src/foo.js'), true); // basename-only
  // test_*.py
  assert.equal(isTestFileFor('tests/test_user.py', 'src/user.py'), true);
  // *_test.go / *-test.rb
  assert.equal(isTestFileFor('pkg/auth_test.go', 'pkg/auth.go'), true);
  assert.equal(isTestFileFor('lib/cart-test.rb', 'lib/cart.rb'), true);
  // Non-matches
  assert.equal(isTestFileFor('src/bar.js', 'src/foo.js'), false);
  assert.equal(isTestFileFor('src/foobar.test.js', 'src/foo.js'), false);
  assert.equal(isTestFileFor('src/foo.test.js', 'src/foo'), false, 'source needs extension');
});

// ─── classifyImpact (BR-NC-02 + BR-NC-03) ─────────────────────────────────

test('classifyImpact: guarded mode always returns noise (no marker)', () => {
  const r = classifyImpact({
    impact: { target_path: 'src/foo.test.js', edge_type: 'agent_event', confidence: 0.95, hit_count: 10 },
    sourceFile: 'src/foo.js',
    autonomyMode: 'guarded',
    threshold: 0.8
  });
  assert.equal(r.marker, null);
  assert.equal(r.classification, 'noise');
});

test('classifyImpact: standard mode flags test pair as AUTO-FIXABLE (rule a)', () => {
  const r = classifyImpact({
    impact: { target_path: 'src/foo.test.js', edge_type: 'git_co_edit', confidence: 0.3, hit_count: 1 },
    sourceFile: 'src/foo.js',
    autonomyMode: 'standard',
    threshold: 0.8
  });
  assert.equal(r.marker, 'AUTO-FIXABLE');
  assert.equal(r.classification, 'auto_fixable');
});

test('classifyImpact: standard mode flags high-confidence agent_event with hit_count > 5 (rule c)', () => {
  const r = classifyImpact({
    impact: { target_path: 'src/dep.js', edge_type: 'agent_event', confidence: 0.85, hit_count: 6 },
    sourceFile: 'src/foo.js',
    autonomyMode: 'standard',
    threshold: 0.8
  });
  assert.equal(r.marker, 'AUTO-FIXABLE');
  assert.equal(r.classification, 'auto_fixable');
});

test('classifyImpact: standard mode does NOT flag rule (c) when hit_count <= 5', () => {
  const r = classifyImpact({
    impact: { target_path: 'src/dep.js', edge_type: 'agent_event', confidence: 0.95, hit_count: 5 },
    sourceFile: 'src/foo.js',
    autonomyMode: 'standard',
    threshold: 0.8
  });
  assert.equal(r.marker, null);
  assert.equal(r.classification, 'noise');
});

test('classifyImpact: standard mode does NOT flag rule (c) when edge_type != agent_event', () => {
  const r = classifyImpact({
    impact: { target_path: 'src/dep.js', edge_type: 'git_co_edit', confidence: 0.95, hit_count: 10 },
    sourceFile: 'src/foo.js',
    autonomyMode: 'standard',
    threshold: 0.8
  });
  assert.equal(r.marker, null);
  assert.equal(r.classification, 'noise');
});

test('classifyImpact: autonomous mode marks non-match as AUTO-FIXABLE-BEST-EFFORT', () => {
  const r = classifyImpact({
    impact: { target_path: 'src/dep.js', edge_type: 'git_co_edit', confidence: 0.4, hit_count: 1 },
    sourceFile: 'src/foo.js',
    autonomyMode: 'autonomous',
    threshold: 0.8
  });
  assert.equal(r.marker, 'AUTO-FIXABLE-BEST-EFFORT');
  assert.equal(r.classification, 'auto_fixable_best_effort');
});

test('classifyImpact: autonomous mode preserves AUTO-FIXABLE for match', () => {
  const r = classifyImpact({
    impact: { target_path: 'src/foo.test.js', edge_type: 'git_co_edit', confidence: 0.3, hit_count: 1 },
    sourceFile: 'src/foo.js',
    autonomyMode: 'autonomous',
    threshold: 0.8
  });
  assert.equal(r.marker, 'AUTO-FIXABLE');
  assert.equal(r.classification, 'auto_fixable');
});

// ─── writeNoiseFile + serializeItem (marker rendering) ────────────────────

test('writeNoiseFile renders [AUTO-FIXABLE] / [AUTO-FIXABLE-BEST-EFFORT] markers in body', async () => {
  const dir = await makeTempProject();
  const audits = [
    {
      source_file: 'src/foo.js',
      impacts: [
        { target_path: 'src/foo.test.js', edge_type: 'git_co_edit', confidence: 0.3, marker: 'AUTO-FIXABLE' },
        { target_path: 'src/dep.js', edge_type: 'agent_event', confidence: 0.4, marker: 'AUTO-FIXABLE-BEST-EFFORT' },
        { target_path: 'src/unrelated.js', edge_type: 'git_co_edit', confidence: 0.6, marker: null }
      ]
    }
  ];
  const result = writeNoiseFile({
    targetDir: dir,
    featureSlug: 'neural-chain',
    audits,
    autonomyMode: 'autonomous',
    now: new Date('2026-05-21T14:30:00Z')
  });
  const text = fs.readFileSync(result.path, 'utf8');
  assert.ok(text.includes('- [ ] [AUTO-FIXABLE] src/foo.test.js — git_co_edit 0.30'));
  assert.ok(text.includes('- [ ] [AUTO-FIXABLE-BEST-EFFORT] src/dep.js — agent_event 0.40'));
  assert.ok(text.includes('- [ ] src/unrelated.js — git_co_edit 0.60'));
  assert.ok(text.includes('autonomy_mode: autonomous'));
});

test('parseItems round-trips marker through write → read', async () => {
  const dir = await makeTempProject();
  const result = writeNoiseFile({
    targetDir: dir,
    featureSlug: 'neural-chain',
    audits: [
      {
        source_file: 'src/foo.js',
        impacts: [
          { target_path: 'src/foo.test.js', edge_type: 'git_co_edit', confidence: 0.3, marker: 'AUTO-FIXABLE' },
          { target_path: 'src/x.js', edge_type: 'agent_event', confidence: 0.5, marker: null }
        ]
      }
    ],
    autonomyMode: 'standard',
    now: new Date('2026-05-21T14:30:00Z')
  });
  const rr = readNoiseFileAndRecompute({ path: result.path });
  assert.equal(rr.items.length, 2);
  const fooTest = rr.items.find((i) => i.target_path === 'src/foo.test.js');
  const x = rr.items.find((i) => i.target_path === 'src/x.js');
  assert.equal(fooTest.marker, 'AUTO-FIXABLE');
  assert.equal(x.marker, null);
});

test('parseItems extracts known marker forms', () => {
  const body = [
    '- [ ] [AUTO-FIXABLE] src/foo.test.js — git_co_edit 0.30',
    '- [x] [AUTO-FIXABLE-BEST-EFFORT] src/bar.js — agent_event 0.40',
    '- [ ] src/plain.js — git_co_edit 0.20'
  ].join('\n');
  const items = parseItems(body);
  assert.equal(items.length, 3);
  assert.equal(items[0].marker, 'AUTO-FIXABLE');
  assert.equal(items[0].checked, false);
  assert.equal(items[1].marker, 'AUTO-FIXABLE-BEST-EFFORT');
  assert.equal(items[1].checked, true);
  assert.equal(items[2].marker, null);
});

// ─── runChainHookOnAgentDone integration with config + classifier ────────

test('runChainHookOnAgentDone auto-resolves autonomy + threshold from .aioson/config.md', async () => {
  const dir = await makeTempProject();
  await writeProjectConfig(dir, { autonomy_mode: 'autonomous', chain_auto_threshold: '0.6' });
  const { db } = await openRuntimeDb(dir);
  try {
    db.prepare(`
      INSERT INTO chain_edges (source_path, target_path, edge_type, confidence, start_at, last_seen_at, hit_count)
      VALUES ('src/foo.js', 'src/foo.test.js', 'git_co_edit', 0.4, ?, ?, 1)
    `).run('2026-05-20T00:00:00Z', '2026-05-20T00:00:00Z');

    const result = runChainHookOnAgentDone({
      db,
      targetDir: dir,
      // No autonomyMode / chainAutoThreshold passed → must read from config
      artifacts: ['src/foo.js', 'src/bar.js'],
      featureSlug: 'neural-chain',
      now: new Date('2026-05-21T14:30:00Z')
    });
    assert.equal(result.autonomy_mode, 'autonomous');
    assert.equal(result.chain_auto_threshold, 0.6);
    assert.ok(result.noise_file);

    const text = fs.readFileSync(result.noise_file, 'utf8');
    assert.ok(text.includes('autonomy_mode: autonomous'));
    // foo.js → foo.test.js is a test pair → AUTO-FIXABLE
    assert.ok(text.includes('[AUTO-FIXABLE] src/foo.test.js'));
  } finally {
    db.close();
  }
});

test('runChainHookOnAgentDone standard mode: test-pair impact gets [AUTO-FIXABLE], unrelated stays noise', async () => {
  const dir = await makeTempProject();
  const { db } = await openRuntimeDb(dir);
  try {
    db.prepare(`
      INSERT INTO chain_edges (source_path, target_path, edge_type, confidence, start_at, last_seen_at, hit_count)
      VALUES ('src/foo.js', 'src/foo.test.js', 'git_co_edit', 0.3, ?, ?, 1),
             ('src/foo.js', 'src/unrelated.js', 'git_co_edit', 0.95, ?, ?, 12)
    `).run(
      '2026-05-20T00:00:00Z', '2026-05-20T00:00:00Z',
      '2026-05-20T00:00:00Z', '2026-05-20T00:00:00Z'
    );

    const result = runChainHookOnAgentDone({
      db,
      targetDir: dir,
      autonomyMode: 'standard',
      chainAutoThreshold: 0.8,
      artifacts: ['src/foo.js', 'src/x.js'],
      featureSlug: 'neural-chain',
      now: new Date('2026-05-21T14:30:00Z')
    });
    assert.equal(result.autonomy_mode, 'standard');
    assert.ok(result.noise_file);
    // foo→foo.test.js classified auto_fixable; foo→unrelated.js stays noise
    // (high confidence but edge_type=git_co_edit fails rule c)
    assert.equal(result.auto_fixable_count, 1);

    const text = fs.readFileSync(result.noise_file, 'utf8');
    assert.ok(text.includes('[AUTO-FIXABLE] src/foo.test.js'));
    assert.ok(text.includes('- [ ] src/unrelated.js — git_co_edit'));
    assert.equal(text.includes('[AUTO-FIXABLE] src/unrelated.js'), false);
  } finally {
    db.close();
  }
});

test('runChainHookOnAgentDone autonomous mode: non-match impact gets BEST-EFFORT marker', async () => {
  const dir = await makeTempProject();
  const { db } = await openRuntimeDb(dir);
  try {
    db.prepare(`
      INSERT INTO chain_edges (source_path, target_path, edge_type, confidence, start_at, last_seen_at, hit_count)
      VALUES ('src/foo.js', 'src/unrelated.js', 'git_co_edit', 0.4, ?, ?, 1)
    `).run('2026-05-20T00:00:00Z', '2026-05-20T00:00:00Z');

    const result = runChainHookOnAgentDone({
      db,
      targetDir: dir,
      autonomyMode: 'autonomous',
      artifacts: ['src/foo.js', 'src/x.js'],
      featureSlug: 'neural-chain',
      now: new Date('2026-05-21T14:30:00Z')
    });
    assert.equal(result.autonomy_mode, 'autonomous');
    assert.ok(result.noise_file);
    const text = fs.readFileSync(result.noise_file, 'utf8');
    assert.ok(text.includes('[AUTO-FIXABLE-BEST-EFFORT] src/unrelated.js'));
  } finally {
    db.close();
  }
});

test('runChainHookOnAgentDone telemetry payload carries auto_fixable_count + autonomy_mode + threshold', async () => {
  const dir = await makeTempProject();
  const { db } = await openRuntimeDb(dir);
  try {
    db.prepare(`
      INSERT INTO chain_edges (source_path, target_path, edge_type, confidence, start_at, last_seen_at, hit_count)
      VALUES ('src/foo.js', 'src/foo.test.js', 'git_co_edit', 0.3, ?, ?, 1)
    `).run('2026-05-20T00:00:00Z', '2026-05-20T00:00:00Z');

    runChainHookOnAgentDone({
      db,
      targetDir: dir,
      autonomyMode: 'standard',
      chainAutoThreshold: 0.75,
      artifacts: ['src/foo.js', 'src/bar.js'],
      featureSlug: 'neural-chain',
      now: new Date('2026-05-21T14:30:00Z')
    });

    const events = db.prepare(
      "SELECT payload_json FROM execution_events WHERE event_type = 'chain_audit'"
    ).all();
    assert.equal(events.length, 2);
    for (const ev of events) {
      const p = JSON.parse(ev.payload_json);
      assert.equal(p.autonomy_mode, 'standard');
      assert.equal(p.chain_auto_threshold, 0.75);
      assert.equal(typeof p.auto_fixable_count, 'number');
    }
  } finally {
    db.close();
  }
});

test('runChainHookOnAgentDone backward-compat: guarded mode unchanged from Slice 4', async () => {
  const dir = await makeTempProject();
  const { db } = await openRuntimeDb(dir);
  try {
    db.prepare(`
      INSERT INTO chain_edges (source_path, target_path, edge_type, confidence, start_at, last_seen_at, hit_count)
      VALUES ('src/foo.js', 'src/foo.test.js', 'git_co_edit', 0.95, ?, ?, 15)
    `).run('2026-05-20T00:00:00Z', '2026-05-20T00:00:00Z');

    const result = runChainHookOnAgentDone({
      db,
      targetDir: dir,
      autonomyMode: 'guarded',
      artifacts: ['src/foo.js', 'src/bar.js'],
      featureSlug: 'neural-chain',
      now: new Date('2026-05-21T14:30:00Z')
    });
    assert.equal(result.auto_fixable_count, 0, 'guarded never auto-flags');
    const text = fs.readFileSync(result.noise_file, 'utf8');
    // Test-pair impact would have been [AUTO-FIXABLE] in standard/autonomous,
    // but guarded mode bypasses the classifier — no marker, plain noise.
    assert.equal(text.includes('[AUTO-FIXABLE]'), false, 'no marker in guarded');
    assert.ok(text.includes('- [ ] src/foo.test.js — git_co_edit 0.95'));
  } finally {
    db.close();
  }
});
