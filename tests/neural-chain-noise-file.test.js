'use strict';

// Neural Chain — Phase 1 Slice 4 noise file lifecycle acceptance tests.
// Covers writeNoiseFile (format + multi-audit aggregation + fallback path),
// readNoiseFileAndRecompute (lazy resolved_items recompute + EC-NC-09
// corrupted frontmatter), maybeDeleteNoiseFile (deletion-on-close trigger +
// EC-NC-10 idempotent unlink), and the runChainHookOnAgentDone integration
// in guarded vs non-guarded autonomy modes.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const { openRuntimeDb } = require('../src/runtime-store');
const {
  writeNoiseFile,
  readNoiseFileAndRecompute,
  maybeDeleteNoiseFile,
  buildNoiseFilePath,
  sanitizeSlug,
  formatTimestamp,
  parseFrontmatter,
  NOISE_DIR_REL
} = require('../src/neural-chain-noise-file');
const { runChainHookOnAgentDone } = require('../src/neural-chain-agent-ingest');

async function makeTempProject() {
  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'aioson-noise-file-'));
  await fsp.mkdir(path.join(dir, '.aioson', 'runtime'), { recursive: true });
  return dir;
}

function sampleAudits() {
  return [
    {
      source_file: 'src/foo.js',
      impacts_found: 2,
      impacts: [
        { target_path: 'src/dep1.js', edge_type: 'git_co_edit', confidence: 0.8 },
        { target_path: 'src/dep2.js', edge_type: 'agent_event', confidence: 0.5 }
      ]
    },
    {
      source_file: 'src/bar.js',
      impacts_found: 1,
      impacts: [
        { target_path: 'src/dep1.js', edge_type: 'agent_event', confidence: 0.7 }
      ]
    }
  ];
}

test('formatTimestamp pads to YYYYMMDD-HHMM UTC', () => {
  const d = new Date('2026-05-21T04:09:00Z');
  assert.equal(formatTimestamp(d), '20260521-0409');
});

test('sanitizeSlug fallback returns "unspecified" for null / empty', () => {
  assert.equal(sanitizeSlug(null), 'unspecified');
  assert.equal(sanitizeSlug(undefined), 'unspecified');
  assert.equal(sanitizeSlug(''), 'unspecified');
  assert.equal(sanitizeSlug('  '), 'unspecified');
  assert.equal(sanitizeSlug('Neural Chain!'), 'neural-chain');
  assert.equal(sanitizeSlug('neural-chain'), 'neural-chain');
});

test('buildNoiseFilePath resolves expected path with slug + timestamp', () => {
  const p = buildNoiseFilePath({
    targetDir: '/tmp/proj',
    featureSlug: 'neural-chain',
    now: new Date('2026-05-21T14:30:00Z')
  });
  assert.equal(p, path.join('/tmp/proj', NOISE_DIR_REL, 'neural-chain-20260521-1430.md'));
});

test('writeNoiseFile emits frontmatter + checkbox body shape (BR-NC-06 + BR-NC-09)', async () => {
  const dir = await makeTempProject();
  const result = writeNoiseFile({
    targetDir: dir,
    featureSlug: 'neural-chain',
    audits: sampleAudits(),
    autonomyMode: 'guarded',
    now: new Date('2026-05-21T14:30:00Z')
  });

  assert.equal(result.total_items, 3); // 2 impacts (foo) + 1 impact (bar)
  assert.deepEqual(result.source_files.sort(), ['src/bar.js', 'src/foo.js']);
  assert.ok(result.path.endsWith(path.join('noises', 'neural-chain-20260521-1430.md')));

  const text = fs.readFileSync(result.path, 'utf8');
  assert.ok(text.startsWith('---\n'));
  assert.ok(text.includes('slug: neural-chain'));
  assert.ok(text.includes('edit_at: 2026-05-21T14:30:00.000Z'));
  assert.ok(text.includes('autonomy_mode: guarded'));
  assert.ok(text.includes('total_items: 3'));
  assert.ok(text.includes('resolved_items: 0'));
  assert.ok(text.includes('source_files: ["src/foo.js","src/bar.js"]'));

  // Body: all items must use unchecked `- [ ]` (BR-NC-09 file-level only).
  assert.ok(text.includes('- [ ] src/dep1.js — git_co_edit 0.80 (source: src/foo.js)'));
  assert.ok(text.includes('- [ ] src/dep2.js — agent_event 0.50 (source: src/foo.js)'));
  assert.ok(text.includes('- [ ] src/dep1.js — agent_event 0.70 (source: src/bar.js)'));
  // M1 forbids :symbol suffix on items
  assert.equal(/^- \[ \] [^\n]*:[A-Za-z_]+\b/m.test(text), false, 'no :symbol granularity allowed in M1');
});

test('writeNoiseFile aggregates multiple audits into a single session file', async () => {
  const dir = await makeTempProject();
  const result = writeNoiseFile({
    targetDir: dir,
    featureSlug: 'neural-chain',
    audits: sampleAudits(),
    now: new Date('2026-05-21T14:30:00Z')
  });

  const text = fs.readFileSync(result.path, 'utf8');
  // 3 checkbox lines total — both source files contribute to the same file.
  const checkboxLines = text.split('\n').filter((l) => /^- \[/.test(l));
  assert.equal(checkboxLines.length, 3);
});

test('writeNoiseFile fallback path uses "unspecified-{ts}" when featureSlug is null', async () => {
  const dir = await makeTempProject();
  const result = writeNoiseFile({
    targetDir: dir,
    featureSlug: null,
    audits: [
      {
        source_file: 'src/x.js',
        impacts_found: 1,
        impacts: [{ target_path: 'src/y.js', edge_type: 'git_co_edit', confidence: 0.9 }]
      }
    ],
    now: new Date('2026-05-21T14:30:00Z')
  });
  assert.ok(result.path.endsWith(path.join('noises', 'unspecified-20260521-1430.md')));
  const text = fs.readFileSync(result.path, 'utf8');
  assert.ok(text.includes('slug: unspecified'));
});

test('readNoiseFileAndRecompute lazily counts "- [x]" after manual edits', async () => {
  const dir = await makeTempProject();
  const result = writeNoiseFile({
    targetDir: dir,
    featureSlug: 'neural-chain',
    audits: sampleAudits(),
    now: new Date('2026-05-21T14:30:00Z')
  });

  // Initial — all items pending.
  const r0 = readNoiseFileAndRecompute({ path: result.path });
  assert.equal(r0.exists, true);
  assert.equal(r0.frontmatterOk, true);
  assert.equal(r0.items.length, 3);
  assert.equal(r0.resolvedCount, 0);
  assert.equal(r0.pendingCount, 3);
  assert.equal(r0.allResolved, false);
  // Frontmatter still says resolved_items: 0; recompute mirrors that.
  assert.equal(r0.frontmatter.resolved_items, 0);

  // Manually mark 2 items as resolved — simulate user/agent editing the file.
  const original = fs.readFileSync(result.path, 'utf8');
  const mutated = original
    .replace('- [ ] src/dep1.js — git_co_edit 0.80', '- [x] src/dep1.js — git_co_edit 0.80')
    .replace('- [ ] src/dep2.js — agent_event 0.50', '- [x] src/dep2.js — agent_event 0.50');
  fs.writeFileSync(result.path, mutated, 'utf8');

  const r1 = readNoiseFileAndRecompute({ path: result.path });
  assert.equal(r1.resolvedCount, 2);
  assert.equal(r1.pendingCount, 1);
  assert.equal(r1.allResolved, false);
  // Recompute overrides stale frontmatter resolved_items=0 in the returned object.
  assert.equal(r1.frontmatter.resolved_items, 2, 'recompute reflects live "- [x]" count');
});

test('maybeDeleteNoiseFile deletes file once every item is checked', async () => {
  const dir = await makeTempProject();
  const result = writeNoiseFile({
    targetDir: dir,
    featureSlug: 'neural-chain',
    audits: sampleAudits(),
    now: new Date('2026-05-21T14:30:00Z')
  });

  // Pending → no delete.
  const r0 = maybeDeleteNoiseFile({ path: result.path });
  assert.equal(r0.deleted, false);
  assert.equal(r0.reason, 'pending_items');
  assert.equal(fs.existsSync(result.path), true);

  // Check all items → file should be unlinked next call.
  const original = fs.readFileSync(result.path, 'utf8');
  const mutated = original.replace(/- \[ \]/g, '- [x]');
  fs.writeFileSync(result.path, mutated, 'utf8');

  const r1 = maybeDeleteNoiseFile({ path: result.path });
  assert.equal(r1.deleted, true);
  assert.equal(r1.reason, 'all_resolved');
  assert.equal(fs.existsSync(result.path), false);
});

test('EC-NC-09: readNoiseFileAndRecompute preserves body items when frontmatter is corrupted', async () => {
  const dir = await makeTempProject();
  const filePath = path.join(dir, NOISE_DIR_REL, 'neural-chain-20260521-1430.md');
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  // Corrupted frontmatter: no closing `---`.
  const corruptContent = [
    '---',
    'slug: neural-chain',
    'edit_at: 2026-05-21T14:30:00.000Z',
    '# missing closing ---',
    '',
    '- [ ] src/dep1.js — git_co_edit 0.80',
    '- [x] src/dep2.js — agent_event 0.50'
  ].join('\n');
  fs.writeFileSync(filePath, corruptContent, 'utf8');

  const r = readNoiseFileAndRecompute({ path: filePath });
  assert.equal(r.exists, true);
  assert.equal(r.frontmatterOk, false, 'corrupted frontmatter flagged');
  assert.equal(r.frontmatterReason, 'unclosed_frontmatter');
  assert.equal(r.items.length, 2, 'body items still parseable');
  assert.equal(r.resolvedCount, 1);
  assert.equal(r.pendingCount, 1);
  assert.equal(r.frontmatter, null);

  // A subsequent writeNoiseFile rebuilds a clean file from current audits.
  const rewriteAudits = [
    {
      source_file: 'src/foo.js',
      impacts: [{ target_path: 'src/dep1.js', edge_type: 'git_co_edit', confidence: 0.8 }]
    }
  ];
  const rewrite = writeNoiseFile({
    targetDir: dir,
    featureSlug: 'neural-chain',
    audits: rewriteAudits,
    now: new Date('2026-05-21T14:30:00Z')
  });
  assert.equal(rewrite.path, filePath, 'same path → overwritten');
  const rewriteFm = parseFrontmatter(fs.readFileSync(rewrite.path, 'utf8'));
  assert.equal(rewriteFm.ok, true, 'frontmatter clean after rewrite');
});

test('EC-NC-10: maybeDeleteNoiseFile is idempotent across race-deleted files', async () => {
  const dir = await makeTempProject();
  const result = writeNoiseFile({
    targetDir: dir,
    featureSlug: 'neural-chain',
    audits: sampleAudits(),
    now: new Date('2026-05-21T14:30:00Z')
  });
  // External delete (simulates concurrent cleanup) BEFORE maybeDeleteNoiseFile runs.
  fs.unlinkSync(result.path);

  const r = maybeDeleteNoiseFile({ path: result.path });
  assert.equal(r.deleted, false);
  assert.equal(r.reason, 'not_found', 'race-deleted file → not_found, no throw');

  // Calling again on a never-existed path also does not throw.
  const r2 = maybeDeleteNoiseFile({ path: path.join(dir, 'noises', 'ghost.md') });
  assert.equal(r2.deleted, false);
  assert.equal(r2.reason, 'not_found');
});

// ─── runChainHookOnAgentDone integration with noise file lifecycle ─────────

test('runChainHookOnAgentDone (guarded + impacts) writes noise file', async () => {
  const dir = await makeTempProject();
  const { db } = await openRuntimeDb(dir);
  try {
    // Seed pre-existing edge so the audit reports impacts.
    db.prepare(`
      INSERT INTO chain_edges (source_path, target_path, edge_type, confidence, start_at, last_seen_at, hit_count)
      VALUES ('src/foo.js', 'src/dep1.js', 'git_co_edit', 0.9, ?, ?, 9)
    `).run('2026-05-20T00:00:00Z', '2026-05-20T00:00:00Z');

    const result = runChainHookOnAgentDone({
      db,
      targetDir: dir,
      artifacts: ['src/foo.js', 'src/bar.js'],
      agentName: '@dev',
      featureSlug: 'neural-chain',
      autonomyMode: 'guarded',
      now: new Date('2026-05-21T14:30:00Z')
    });

    assert.equal(result.ok, true);
    assert.ok(result.noise_file, 'noise_file path returned');
    assert.ok(result.noise_file.endsWith(path.join('noises', 'neural-chain-20260521-1430.md')));
    assert.equal(fs.existsSync(result.noise_file), true);

    // chain_audit telemetry events should carry noise_file payload.
    const events = db.prepare(
      "SELECT payload_json FROM execution_events WHERE event_type = 'chain_audit'"
    ).all();
    assert.equal(events.length, 2);
    for (const ev of events) {
      const p = JSON.parse(ev.payload_json);
      assert.equal(p.noise_file, result.noise_file);
      assert.equal(p.autonomy_mode, 'guarded');
    }
  } finally {
    db.close();
  }
});

test('runChainHookOnAgentDone (standard/autonomous mode) skips noise file write', async () => {
  const dir = await makeTempProject();
  const { db } = await openRuntimeDb(dir);
  try {
    db.prepare(`
      INSERT INTO chain_edges (source_path, target_path, edge_type, confidence, start_at, last_seen_at, hit_count)
      VALUES ('src/foo.js', 'src/dep1.js', 'git_co_edit', 0.9, ?, ?, 9)
    `).run('2026-05-20T00:00:00Z', '2026-05-20T00:00:00Z');

    for (const mode of ['standard', 'autonomous']) {
      const result = runChainHookOnAgentDone({
        db,
        targetDir: dir,
        artifacts: ['src/foo.js', 'src/bar.js'],
        autonomyMode: mode,
        featureSlug: 'neural-chain',
        now: new Date('2026-05-21T14:30:00Z')
      });
      assert.equal(result.ok, true);
      assert.equal(result.noise_file, null, `${mode} mode must not write noise file (deferred to Slice 6)`);
    }

    const noisesDir = path.join(dir, NOISE_DIR_REL);
    const exists = fs.existsSync(noisesDir);
    if (exists) {
      const files = fs.readdirSync(noisesDir);
      assert.equal(files.length, 0, 'no files materialized under noises/ for non-guarded modes');
    }
  } finally {
    db.close();
  }
});

test('runChainHookOnAgentDone (guarded + zero impacts across all artifacts) skips noise file', async () => {
  const dir = await makeTempProject();
  const { db } = await openRuntimeDb(dir);
  try {
    // Single artifact → deriveSessionPairs yields 0 pairs → no ingest, no
    // existing edges, no audit impacts. Noise file must NOT be written.
    const result = runChainHookOnAgentDone({
      db,
      targetDir: dir,
      artifacts: ['src/lonely.js'],
      autonomyMode: 'guarded',
      featureSlug: 'neural-chain',
      now: new Date('2026-05-21T14:30:00Z')
    });
    assert.equal(result.ok, true);
    assert.equal(result.noise_file, null, 'no impacts → no noise file even in guarded mode');

    const noisesDir = path.join(dir, NOISE_DIR_REL);
    assert.equal(
      fs.existsSync(noisesDir) && fs.readdirSync(noisesDir).length > 0,
      false,
      'no noise files materialized'
    );
  } finally {
    db.close();
  }
});
