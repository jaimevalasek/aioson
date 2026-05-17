'use strict';

// lay-user-agent-mode — Phase 3 (jargon_leak_detection) acceptance tests.
// Covers AC-LUM-07..11 + EC-LUM-05/08/10/11 + word-boundary semantics.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const { openRuntimeDb } = require('../src/runtime-store');
const {
  MVP_AGENTS,
  MAX_SAMPLES,
  extractTermKeys,
  loadJargonTerms,
  readProjectProfile,
  normalizeEffectiveProfile,
  escapeRegex,
  buildJargonRegex,
  findLeaks,
  detectJargonInEvents,
  assessJargonLeak
} = require('../src/jargon-leak-doctor');
const { runDoctor } = require('../src/doctor');

// ─── Fixture helpers ────────────────────────────────────────────────────────

async function makeProject({ profile = 'creator', classification = 'SMALL', withJargonMap = true } = {}) {
  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'aios-jargon-'));
  fs.mkdirSync(path.join(dir, '.aioson', 'context'), { recursive: true });
  fs.mkdirSync(path.join(dir, '.aioson', 'context', 'bootstrap'), { recursive: true });
  const ctx = [
    '---',
    'project_name: "jargon-fixture"',
    `profile: "${profile}"`,
    `classification: "${classification}"`,
    'conversation_language: "en"',
    '---',
    '# Project Context'
  ].join('\n');
  fs.writeFileSync(path.join(dir, '.aioson', 'context', 'project.context.md'), ctx);
  // Minimal features.md so doctor doesn't fail elsewhere
  fs.writeFileSync(
    path.join(dir, '.aioson', 'context', 'features.md'),
    '# Features\n\n| slug | status | started | completed |\n|------|--------|---------|-----------|\n'
  );
  if (withJargonMap) {
    const yamlDir = path.join(dir, '.aioson', 'skills', 'process', 'decision-presentation', 'references');
    fs.mkdirSync(yamlDir, { recursive: true });
    const yaml = [
      'version: 1',
      'language: en',
      'terms:',
      '  MICRO:',
      '    translation: "quick"',
      '    context: "Small feature"',
      '  SMALL:',
      '    translation: "standard"',
      '    context: "Medium feature"',
      '  "Gate D":',
      '    translation: "final review"',
      '    context: "Last QA check"',
      '  harness-contract:',
      '    translation: "agent runtime agreement"',
      '    context: "Feature contract"',
      ''
    ].join('\n');
    fs.writeFileSync(path.join(yamlDir, 'jargon-map.en.yaml'), yaml);
  }
  return dir;
}

function insertAgentRun(db, { runKey, agentName, ts }) {
  db.prepare(`
    INSERT INTO agent_runs (run_key, agent_name, status, started_at, updated_at, finished_at)
    VALUES (?, ?, 'completed', ?, ?, ?)
  `).run(runKey, agentName, ts, ts, ts);
}

function insertAgentEvent(db, { runKey, message, payload = null, ts = '2026-05-17T00:00:00.000Z', eventType = 'agent_done' }) {
  db.prepare(`
    INSERT INTO agent_events (run_key, event_type, message, payload_json, created_at)
    VALUES (?, ?, ?, ?, ?)
  `).run(runKey, eventType, message, payload, ts);
}

// ─── Pure helpers ───────────────────────────────────────────────────────────

test('extractTermKeys parses bare and quoted YAML keys', () => {
  const yaml = [
    'version: 1',
    'terms:',
    '  MICRO:',
    '    translation: "quick"',
    '  "Gate D":',
    '    translation: "final"',
    '  harness-contract:',
    '    translation: "x"'
  ].join('\n');
  const keys = extractTermKeys(yaml);
  assert.ok(keys.includes('MICRO'));
  assert.ok(keys.includes('Gate D'));
  assert.ok(keys.includes('harness-contract'));
  // Value lines (4-space indent) MUST NOT be picked up as keys.
  assert.ok(!keys.some((k) => k.includes('translation')));
});

test('extractTermKeys returns [] on missing terms block', () => {
  assert.deepEqual(extractTermKeys('version: 1\nlanguage: en\n'), []);
  assert.deepEqual(extractTermKeys(''), []);
  assert.deepEqual(extractTermKeys(null), []);
});

test('normalizeEffectiveProfile defaults absent/auto/empty to creator', () => {
  assert.equal(normalizeEffectiveProfile(null), 'creator');
  assert.equal(normalizeEffectiveProfile(''), 'creator');
  assert.equal(normalizeEffectiveProfile('auto'), 'creator');
  assert.equal(normalizeEffectiveProfile('beginner'), 'creator'); // legacy shim
  assert.equal(normalizeEffectiveProfile('creator'), 'creator');
  assert.equal(normalizeEffectiveProfile('developer'), 'developer');
  assert.equal(normalizeEffectiveProfile('team'), 'team');
});

test('escapeRegex escapes regex metacharacters', () => {
  assert.equal(escapeRegex('a.b*c?'), 'a\\.b\\*c\\?');
  assert.equal(escapeRegex('plain'), 'plain');
});

test('buildJargonRegex returns null for empty term list', () => {
  assert.equal(buildJargonRegex([]), null);
  assert.equal(buildJargonRegex(null), null);
});

// ─── Word-boundary semantics (AC-LUM-11) ────────────────────────────────────

test('findLeaks matches whole-word terms at boundaries', () => {
  const re = buildJargonRegex(['MICRO', 'SMALL', 'Gate D']);
  assert.deepEqual(findLeaks('feature MICRO ready', re), ['MICRO']);
  assert.deepEqual(findLeaks('classification: SMALL', re), ['SMALL']);
  assert.deepEqual(findLeaks('Gate D pending review', re), ['Gate D']);
});

test('findLeaks does NOT match terms inside other words (substring blocked)', () => {
  const re = buildJargonRegex(['MICRO']);
  // AC-LUM-11: "MICROserviços" must NOT trigger "MICRO" match.
  assert.deepEqual(findLeaks('MICROserviços', re), []);
  assert.deepEqual(findLeaks('subMICRO', re), []);
  assert.deepEqual(findLeaks('MICRO_X', re), []);
});

test('findLeaks treats hyphen as a word boundary char so harness-contract stays atomic', () => {
  const re = buildJargonRegex(['harness-contract']);
  assert.deepEqual(findLeaks('the harness-contract.json file', re), ['harness-contract']);
  // Should NOT match "harness" alone or "contract" alone:
  const reTwo = buildJargonRegex(['contract']);
  assert.deepEqual(findLeaks('harness-contract', reTwo), []);
});

test('findLeaks is case-sensitive', () => {
  const re = buildJargonRegex(['MICRO']);
  assert.deepEqual(findLeaks('micro', re), []);
  assert.deepEqual(findLeaks('Micro', re), []);
  assert.deepEqual(findLeaks('MICRO', re), ['MICRO']);
});

// ─── detectJargonInEvents (pure) ────────────────────────────────────────────

test('detectJargonInEvents counts hits and truncates samples to MAX_SAMPLES', () => {
  const terms = ['MICRO'];
  const events = Array.from({ length: 50 }, (_, i) => ({
    message: `event ${i}: feature MICRO ready`,
    payload_json: null,
    agent_name: 'product',
    created_at: `2026-05-17T00:00:${String(i).padStart(2, '0')}.000Z`
  }));
  const result = detectJargonInEvents(events, terms);
  assert.equal(result.count, 50);
  assert.equal(result.samples.length, MAX_SAMPLES); // EC-LUM-10
});

test('detectJargonInEvents EC-LUM-11: jargon_intentional payload skips the event', () => {
  const terms = ['MICRO'];
  const events = [
    {
      message: 'quoting source code: MICRO',
      payload_json: JSON.stringify({ jargon_intentional: true }),
      agent_name: 'dev',
      created_at: '2026-05-17T00:00:00.000Z'
    },
    {
      message: 'classification: MICRO',
      payload_json: null,
      agent_name: 'product',
      created_at: '2026-05-17T00:00:01.000Z'
    }
  ];
  const result = detectJargonInEvents(events, terms);
  assert.equal(result.count, 1);
  assert.equal(result.samples[0].agent, 'product');
});

// ─── assessJargonLeak (integration with DB + FS) ────────────────────────────

test('assessJargonLeak AC-LUM-08: profile=developer skips check (ok=true)', async () => {
  const dir = await makeProject({ profile: 'developer' });
  const result = await assessJargonLeak({ db: null, targetDir: dir });
  assert.equal(result.ok, true);
  assert.equal(result.skipped, true);
  assert.equal(result.profile, 'developer');
});

test('assessJargonLeak profile=team also skips (jargon permitted)', async () => {
  const dir = await makeProject({ profile: 'team' });
  const result = await assessJargonLeak({ db: null, targetDir: dir });
  assert.equal(result.ok, true);
  assert.equal(result.skipped, true);
});

test('assessJargonLeak EC-LUM-05: no DB + profile=creator returns ok=true count=0', async () => {
  const dir = await makeProject({ profile: 'creator' });
  const result = await assessJargonLeak({ db: null, targetDir: dir });
  assert.equal(result.ok, true);
  assert.equal(result.count, 0);
  assert.equal(result.profile, 'creator');
});

test('assessJargonLeak AC-LUM-09: empty agent_events from MVP agents returns ok=true', async () => {
  const dir = await makeProject({ profile: 'creator' });
  const { db } = await openRuntimeDb(dir);
  try {
    const result = await assessJargonLeak({ db, targetDir: dir });
    assert.equal(result.ok, true);
    assert.equal(result.count, 0);
  } finally {
    db.close();
  }
});

test('assessJargonLeak AC-LUM-10: event with jargon from MVP agent returns ok=false', async () => {
  const dir = await makeProject({ profile: 'creator' });
  const { db } = await openRuntimeDb(dir);
  try {
    insertAgentRun(db, { runKey: 'run-1', agentName: 'product', ts: '2026-05-17T00:00:00.000Z' });
    insertAgentEvent(db, {
      runKey: 'run-1',
      message: 'PRD done, classification: SMALL — Gate D pending review',
      ts: '2026-05-17T00:00:01.000Z'
    });
    const result = await assessJargonLeak({ db, targetDir: dir });
    assert.equal(result.ok, false);
    assert.ok(result.count >= 2); // SMALL + Gate D
    assert.equal(result.samples[0].agent, 'product');
  } finally {
    db.close();
  }
});

test('assessJargonLeak BR-LUM-04: events from NON-MVP agents are ignored (scope filter)', async () => {
  const dir = await makeProject({ profile: 'creator' });
  const { db } = await openRuntimeDb(dir);
  try {
    // @qa is NOT in MVP_AGENTS scope — its jargon must not flag the project.
    insertAgentRun(db, { runKey: 'run-qa', agentName: 'qa', ts: '2026-05-17T00:00:00.000Z' });
    insertAgentEvent(db, {
      runKey: 'run-qa',
      message: 'classification: MEDIUM Gate D approved',
      ts: '2026-05-17T00:00:01.000Z'
    });
    const result = await assessJargonLeak({ db, targetDir: dir });
    assert.equal(result.ok, true);
    assert.equal(result.count, 0);
  } finally {
    db.close();
  }
});

test('assessJargonLeak AC-LUM-11: substring match blocked (MICROserviços ≠ MICRO)', async () => {
  const dir = await makeProject({ profile: 'creator' });
  const { db } = await openRuntimeDb(dir);
  try {
    insertAgentRun(db, { runKey: 'run-substr', agentName: 'dev', ts: '2026-05-17T00:00:00.000Z' });
    insertAgentEvent(db, {
      runKey: 'run-substr',
      message: 'we use MICROserviços architecture',
      ts: '2026-05-17T00:00:01.000Z'
    });
    const result = await assessJargonLeak({ db, targetDir: dir });
    assert.equal(result.ok, true);
    assert.equal(result.count, 0);
  } finally {
    db.close();
  }
});

test('assessJargonLeak profile=auto and profile absent both default to creator behavior', async () => {
  const dirAuto = await makeProject({ profile: 'auto' });
  const dirAbsent = await fsp.mkdtemp(path.join(os.tmpdir(), 'aios-jargon-noprof-'));
  fs.mkdirSync(path.join(dirAbsent, '.aioson', 'context'), { recursive: true });
  fs.writeFileSync(
    path.join(dirAbsent, '.aioson', 'context', 'project.context.md'),
    '---\nproject_name: "x"\nclassification: "MICRO"\n---\n'
  );

  for (const dir of [dirAuto, dirAbsent]) {
    const result = await assessJargonLeak({ db: null, targetDir: dir });
    assert.equal(result.profile, 'creator');
    assert.equal(result.skipped, undefined);
  }
});

test('assessJargonLeak EC-LUM-08: jargon-map missing → ok=true with jargonMapMissing=true', async () => {
  const dir = await makeProject({ profile: 'creator', withJargonMap: false });
  const { db } = await openRuntimeDb(dir);
  try {
    insertAgentRun(db, { runKey: 'run-no-map', agentName: 'product', ts: '2026-05-17T00:00:00.000Z' });
    insertAgentEvent(db, {
      runKey: 'run-no-map',
      message: 'classification: MICRO — Gate D pending',
      ts: '2026-05-17T00:00:01.000Z'
    });
    const result = await assessJargonLeak({ db, targetDir: dir });
    assert.equal(result.ok, true);
    assert.equal(result.jargonMapMissing, true);
  } finally {
    db.close();
  }
});

// ─── runDoctor integration (AC-LUM-07) ──────────────────────────────────────

test('AC-LUM-07: runDoctor report includes jargon_leak_detection check id', async () => {
  const dir = await makeProject({ profile: 'creator' });
  const report = await runDoctor(dir);
  const ids = (report.checks || []).map((c) => c.id);
  assert.ok(ids.includes('jargon_leak_detection'), `expected jargon_leak_detection in: ${ids.join(', ')}`);
});

test('runDoctor with profile=developer emits jargon_leak_detection as ok=true (skipped)', async () => {
  const dir = await makeProject({ profile: 'developer' });
  const report = await runDoctor(dir);
  const check = (report.checks || []).find((c) => c.id === 'jargon_leak_detection');
  assert.ok(check);
  assert.equal(check.ok, true);
  assert.equal(check.severity, 'warning');
});

test('runDoctor with profile=creator and no agent_events emits jargon_leak_detection ok=true count=0', async () => {
  const dir = await makeProject({ profile: 'creator' });
  const report = await runDoctor(dir);
  const check = (report.checks || []).find((c) => c.id === 'jargon_leak_detection');
  assert.ok(check);
  assert.equal(check.ok, true);
  assert.equal(check.params && check.params.count, 0);
});
