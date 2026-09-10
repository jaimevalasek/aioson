'use strict';

/**
 * The draw is a fact the gate reads back, not a sentence the model remembers.
 *
 * Measured incident: six seed-driven sites spread their accents across six
 * hue bands, while four product UIs built by dev on bare repositories landed
 * in one 75° band (green on dark) with every gate green — the draw only ran
 * on the refiner route, and nothing could tell whether it ran at all. Now
 * `design:seed` records the draw next to the feature, `kind=visual` classifies
 * the built palette's origin (`seed` / `identity` / `prior`), and the two ways
 * the prior wins (`no_draw`, `draw_ignored`) are named. The registry stops
 * recording fixtures (six `mkdtemp` projects once outranked every real site)
 * and keeps distinct projects instead of one project's feature list.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const fsSync = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  isEphemeralProjectDir,
  recordFingerprint,
  readRegistry,
  originCounts,
  seedRecordPath,
  readSeedRecord,
  writeSeedRecord,
  seedLabelsFromText,
  accentWindowsForLabel,
  classifyPaletteOrigin,
  REGISTRY_CAP,
  REGISTRY_PER_PROJECT_CAP
} = require('../src/lib/design-seed');
const { runDesignSeed } = require('../src/commands/design-seed');
const { runVerifyArtifact } = require('../src/commands/verify-artifact');

function makeLogger() {
  const lines = [];
  return { log: (m = '') => lines.push(String(m)), error: (m = '') => lines.push(String(m)), warn: () => {}, lines };
}

async function makeTmpDir(prefix = 'aioson-provenance-') {
  return fs.mkdtemp(path.join(os.tmpdir(), prefix));
}

async function withTempRegistry(fn) {
  const dir = await makeTmpDir('aioson-provenance-registry-');
  const file = path.join(dir, 'design-fingerprints.json');
  const previous = process.env.AIOSON_DESIGN_REGISTRY;
  process.env.AIOSON_DESIGN_REGISTRY = file;
  try {
    return await fn(file);
  } finally {
    if (previous === undefined) delete process.env.AIOSON_DESIGN_REGISTRY;
    else process.env.AIOSON_DESIGN_REGISTRY = previous;
    await fs.rm(dir, { recursive: true, force: true });
  }
}

// A craft-measured surface (≥150 declarations) whose accent hue is the one
// thing the test varies. Delivered face, keyframe with reduced motion, two
// gradients — enough to be measured, nothing that trips a blocking finding.
function measuredSurface(accent) {
  const filler = Array.from({ length: 70 }, (_, i) => `.f${i} { padding: var(--s2); margin: var(--s3); color: var(--fg); background: var(--bg); }`).join('\n');
  return `<!doctype html><html><head><style>
  @font-face { font-family: "Atlas Display"; src: url(data:font/woff2;base64,AAAA) format("woff2"); }
  :root { --s2: 8px; --s3: 12px; --fg: #1a1a1a; --bg: #ffffff; --accent: ${accent}; }
  body { font-family: system-ui, sans-serif; background: var(--bg); color: var(--fg); }
  h1 { font-family: "Atlas Display", serif; font-size: 64px; }
  .hero { padding: 96px 0; background: linear-gradient(180deg, #fff, #f6f0f4); }
  .wash { background: radial-gradient(circle at 20% 20%, var(--accent), transparent 40%); animation: drift 20s linear infinite; }
  @keyframes drift { from { background-position: 0% 50%; } to { background-position: 100% 50%; } }
  @media (prefers-reduced-motion: reduce) { .wash { animation: none; } }
  .btn { padding: var(--s2); background: var(--accent); color: #fff; transition: opacity .2s; }
  .btn:focus-visible { outline: 2px solid var(--accent); }
  a { color: var(--accent); }
  ${filler}
  </style></head><body>
  <section class="hero"><div class="wash"></div><h1>Estúdio</h1><a class="btn" href="#c">Conversar</a></section>
  </body></html>`;
}

// ─── ephemeral projects never pollute the default registry ──────────────────

test('a project under the OS temp root is ephemeral; a real path is not', () => {
  assert.equal(isEphemeralProjectDir(path.join(os.tmpdir(), 'aioson-craft-weight-abc123')), true);
  assert.equal(isEphemeralProjectDir(os.tmpdir()), true);
  assert.equal(isEphemeralProjectDir(path.join(__dirname, '..')), false);
});

// Measured bypass: the guard compared path spellings. A Windows runner spells
// the temp root in 8.3 form (`C:\Users\RUNNER~1\…`) while the project path is
// long-form; macOS's tmpdir is `/var/…` where realpath says `/private/var/…`.
// The spellings never matched and a fixture recorded into the operator's
// default registry. A junction/symlink alias replays the same two spellings.
test('the fixture guard compares real paths: a temp root spelled another way is still the temp root', async () => {
  const real = await makeTmpDir('aioson-ephemeral-real-');
  const alias = `${real}-alias`;
  await fs.symlink(real, alias, 'junction');
  await fs.mkdir(path.join(real, 'project'));
  const home = await makeTmpDir('aioson-ephemeral-home-');
  const keys = ['TEMP', 'TMP', 'TMPDIR', 'AIOSON_DESIGN_REGISTRY', 'HOME', 'USERPROFILE'];
  const saved = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  const tempRoot = (root) => { process.env.TEMP = root; process.env.TMP = root; process.env.TMPDIR = root; };
  try {
    for (const [root, project] of [[alias, path.join(real, 'project')], [real, path.join(alias, 'project')]]) {
      tempRoot(root);
      assert.equal(isEphemeralProjectDir(project), true, `${project} is under the temp root ${root}`);
    }
    tempRoot(alias);
    delete process.env.AIOSON_DESIGN_REGISTRY;
    process.env.HOME = home;
    process.env.USERPROFILE = home;
    const entry = { project: 'fixture', slug: 's', accent_hue: 4, ground_pole: 'light' };
    assert.equal(recordFingerprint(entry, { projectDir: path.join(real, 'project') }), false);
    assert.equal(fsSync.existsSync(path.join(home, '.aioson', 'design-fingerprints.json')), false, 'a fixture reached the default registry');
  } finally {
    for (const key of keys) {
      if (saved[key] === undefined) delete process.env[key]; else process.env[key] = saved[key];
    }
    await fs.unlink(alias);
    await fs.rm(real, { recursive: true, force: true });
    await fs.rm(home, { recursive: true, force: true });
  }
});

test('recordFingerprint refuses an ephemeral project when the registry is the operator default', async () => {
  const home = await makeTmpDir('aioson-provenance-home-');
  const project = await makeTmpDir('aioson-craft-weight-');
  const saved = { registry: process.env.AIOSON_DESIGN_REGISTRY, home: process.env.HOME, profile: process.env.USERPROFILE };
  try {
    delete process.env.AIOSON_DESIGN_REGISTRY;
    process.env.HOME = home;
    process.env.USERPROFILE = home;
    const entry = { project: path.basename(project), slug: 'agencia', accent_hue: 4, ground_pole: 'light' };
    assert.equal(recordFingerprint(entry, { projectDir: project }), false);
    assert.equal(fsSync.existsSync(path.join(home, '.aioson', 'design-fingerprints.json')), false, 'nothing may be written for a fixture');
    // Without the project dir the guard cannot judge — the caller passes it.
    assert.equal(recordFingerprint({ ...entry, project: 'real-site' }, { projectDir: path.join(__dirname, '..') }), true);
    assert.equal(readRegistry().entries.length, 1);
  } finally {
    if (saved.registry === undefined) delete process.env.AIOSON_DESIGN_REGISTRY; else process.env.AIOSON_DESIGN_REGISTRY = saved.registry;
    if (saved.home === undefined) delete process.env.HOME; else process.env.HOME = saved.home;
    if (saved.profile === undefined) delete process.env.USERPROFILE; else process.env.USERPROFILE = saved.profile;
    await fs.rm(home, { recursive: true, force: true });
    await fs.rm(project, { recursive: true, force: true });
  }
});

test('an explicitly named registry accepts ephemeral projects (tests own it)', async () => {
  await withTempRegistry(async () => {
    const project = await makeTmpDir('aioson-owned-');
    try {
      assert.equal(recordFingerprint({ project: 'owned', slug: 's', accent_hue: 10, ground_pole: 'dark' }, { projectDir: project }), true);
    } finally {
      await fs.rm(project, { recursive: true, force: true });
    }
  });
});

test('the registry keeps distinct projects: at most two surfaces per project, newest first', async () => {
  await withTempRegistry(async () => {
    for (const slug of ['s1', 's2', 's3']) {
      assert.ok(recordFingerprint({ project: 'busy', project_id: 'busy-id', slug, accent_hue: 100, ground_pole: 'dark' }));
    }
    assert.ok(recordFingerprint({ project: 'other', project_id: 'other-id', slug: 'x', accent_hue: 200, ground_pole: 'light' }));
    const { entries } = readRegistry();
    const busy = entries.filter((e) => e.project === 'busy').map((e) => e.slug);
    assert.deepEqual(busy, ['s3', 's2'], 'the latest surfaces survive, the oldest is evicted');
    assert.equal(entries.length, 3);
    assert.equal(REGISTRY_PER_PROJECT_CAP, 2);
    assert.ok(REGISTRY_CAP >= 32);
  });
});

test('originCounts reads one origin per distinct project', () => {
  const counts = originCounts([
    { project_id: 'a', origin: 'seed' },
    { project_id: 'a', origin: 'prior' },
    { project_id: 'b', origin: 'identity' },
    { project_id: 'c', origin: 'prior' },
    { project_id: 'd' }
  ]);
  assert.deepEqual(counts, { seed: 1, identity: 1, prior: 1, unrecorded: 1 });
});

// ─── palette origin classification ──────────────────────────────────────────

test('seed labels are read from manifest prose and map to the accent windows their scheme allows', () => {
  assert.deepEqual(seedLabelsFromText('Seed consumido: `analogous-336`, registro editorial; antes `complementary-164`.'), ['analogous-336', 'complementary-164']);
  assert.deepEqual(seedLabelsFromText('no seed here'), []);
  // The measured consumer shapes: label → built accent.
  const consumed = [
    ['analogous-336', 4], ['complementary-164', 342], ['analogous-286', 249],
    ['mono-206', 206], ['complementary-301', 127], ['complementary-205', 29], ['duo-accent-44', 226], ['color-block-12', 12]
  ];
  for (const [label, accent] of consumed) {
    const origin = classifyPaletteOrigin({ accentHue: accent, groundPole: 'light', seed: { candidates: [{ label }] } });
    assert.equal(origin.origin, 'seed', `${label} should allow accent ${accent}: ${JSON.stringify(accentWindowsForLabel(label))}`);
  }
  const ignored = classifyPaletteOrigin({ accentHue: 156, groundPole: 'dark', seed: { candidates: [{ label: 'complementary-301' }] } });
  assert.equal(ignored.origin, 'prior');
  assert.equal(ignored.reason, 'draw_ignored');
});

test('classifyPaletteOrigin: identity outranks the draw, a recorded draw is consumed within 30°, nothing drawn is the prior', () => {
  assert.equal(classifyPaletteOrigin({ accentHue: 156, identity: true }).origin, 'identity');
  const none = classifyPaletteOrigin({ accentHue: 156, groundPole: 'dark' });
  assert.equal(none.origin, 'prior');
  assert.equal(none.reason, 'no_draw');
  const record = { candidates: [{ label: 'mono-300', accent_hue: 301, pole: 'dark' }, { label: 'duo-accent-44', accent_hue: 226, pole: 'dark' }] };
  const kept = classifyPaletteOrigin({ accentHue: 318, groundPole: 'dark', seed: record });
  assert.equal(kept.origin, 'seed');
  assert.equal(kept.candidate, 'mono-300');
  assert.equal(kept.delta_deg, 17);
  const reverted = classifyPaletteOrigin({ accentHue: 156, groundPole: 'dark', seed: record });
  assert.equal(reverted.origin, 'prior');
  assert.equal(reverted.reason, 'draw_ignored');
  assert.equal(reverted.candidate, 'duo-accent-44', 'the closest candidate is named');
  assert.equal(reverted.delta_deg, 70);
});

// ─── the command records, the gate reads back ───────────────────────────────

test('design:seed records the draw next to the feature, keeps history on a re-draw, and --no-persist writes nothing', async () => {
  await withTempRegistry(async () => {
    const project = await makeTmpDir('aioson-seed-record-');
    try {
      await fs.mkdir(path.join(project, '.aioson', 'context'), { recursive: true });
      const first = await runDesignSeed({ args: [project], options: { register: 'technical', slug: 'painel', json: true }, logger: makeLogger() });
      assert.equal(first.recorded, '.aioson/context/features/painel/design-seed.json');
      const record = readSeedRecord(project, 'painel');
      assert.ok(record, 'the record is readable by slug');
      assert.equal(record.candidates.length, first.candidates.length);
      assert.deepEqual(record.candidates.map((c) => c.label), first.candidates.map((c) => c.label));
      assert.ok(record.candidates.every((c) => Number.isFinite(c.accent_hue) && c.display && c.hero));
      assert.deepEqual(record.history, []);

      const second = await runDesignSeed({ args: [project], options: { register: 'technical', slug: 'painel', seed: 1, json: true }, logger: makeLogger() });
      const redrawn = readSeedRecord(project, 'painel');
      assert.equal(redrawn.seed, 1);
      assert.equal(redrawn.history.length, 1);
      assert.deepEqual(redrawn.history[0].labels, first.candidates.map((c) => c.label));
      assert.notDeepEqual(second.candidates.map((c) => c.label), first.candidates.map((c) => c.label));

      const probe = await runDesignSeed({ args: [project], options: { register: 'quiet', slug: 'sonda', json: true, 'no-persist': true }, logger: makeLogger() });
      assert.equal(probe.recorded, null);
      assert.equal(fsSync.existsSync(seedRecordPath(project, 'sonda')), false);

      // Project scope when no slug is given.
      const scoped = await runDesignSeed({ args: [project], options: { json: true }, logger: makeLogger() });
      assert.equal(scoped.recorded, '.aioson/context/design-seed.json');
      // A slug with no record of its own falls back to the project record.
      assert.equal(readSeedRecord(project, 'outra').path, seedRecordPath(project));

      // The human output says where it went and reports the portfolio origins.
      const logger = makeLogger();
      await runDesignSeed({ args: [project], options: { register: 'technical', slug: 'painel' }, logger });
      assert.match(logger.lines.join('\n'), /recorded at \.aioson\/context\/features\/painel\/design-seed\.json/);
    } finally {
      await fs.rm(project, { recursive: true, force: true });
    }
  });
});

// Measured: `--slug` was joined under features/ unvalidated, so
// `--slug=../../../../outside` wrote design-seed.json outside the project (and
// the identity lookup read briefings/<slug>/ wherever it pointed). The slug is
// refused with a named reason before any path is built.
test('design:seed refuses a slug that is not a feature slug, before any path is built', async () => {
  await withTempRegistry(async () => {
    const outer = await makeTmpDir('aioson-seed-slug-');
    const project = path.join(outer, 'project');
    try {
      await fs.mkdir(path.join(project, '.aioson', 'context'), { recursive: true });
      for (const slug of ['../../../../outside', '..', 'painel/../../..', 'a/b', 'Painel', '-painel']) {
        const result = await runDesignSeed({ args: [project], options: { slug, json: true }, logger: makeLogger() });
        assert.equal(result.ok, false, `slug ${slug} was accepted`);
        assert.equal(result.error, 'invalid_slug', slug);
        assert.equal(result.reason, 'invalid_feature_slug', slug);
        process.exitCode = 0;
      }
      assert.equal(fsSync.existsSync(path.join(outer, 'outside', 'design-seed.json')), false, 'a draw was written outside the project');
      assert.equal(fsSync.existsSync(path.join(project, '.aioson', 'context', 'features')), false, 'nothing is recorded for a refused slug');

      const logger = makeLogger();
      const human = await runDesignSeed({ args: [project], options: { slug: '../x' }, logger });
      process.exitCode = 0;
      assert.equal(human.ok, false);
      assert.match(logger.lines.join('\n'), /--slug="\.\.\/x" is not a feature slug/);

      // The write side refuses on its own, for any caller.
      const payload = { generator: 'test', project: 'p', project_id: 'pid', seed: 0, basis: 'b', candidates: [] };
      assert.throws(() => writeSeedRecord(project, '../../../../outside', payload), (error) => error.code === 'invalid_slug');
      assert.equal(fsSync.existsSync(path.join(outer, 'outside', 'design-seed.json')), false);

      // A canonical slug still records.
      const ok = await runDesignSeed({ args: [project], options: { slug: 'painel-2', json: true }, logger: makeLogger() });
      assert.equal(ok.recorded, '.aioson/context/features/painel-2/design-seed.json');
    } finally {
      await fs.rm(outer, { recursive: true, force: true });
    }
  });
});

test('design:seed carries constrained-diversity diagnostics through JSON, text, and the recorded draw', async () => {
  await withTempRegistry(async (file) => {
    const project = await makeTmpDir('aioson-seed-diversity-');
    try {
      await fs.mkdir(path.join(project, '.aioson', 'context'), { recursive: true });
      const entries = Array.from({ length: 24 }, (_, i) => ({
        project: `recent-${i}`, accent_hue: i * 15, ground_pole: 'light'
      }));
      await fs.writeFile(file, JSON.stringify({ version: 1, entries }));
      const options = { register: 'technical', pole: 'light', count: 6, slug: 'diversity' };
      const result = await runDesignSeed({ args: [project], options: { ...options, json: true }, logger: makeLogger() });
      assert.equal(result.ok, true);
      assert.ok(result.warnings.some((warning) => /palette overlaps/.test(warning)));
      assert.ok(result.warnings.some((warning) => /hero reused/.test(warning)));
      const record = readSeedRecord(project, options.slug);
      assert.deepEqual(record.warnings, result.warnings);
      assert.deepEqual(record.candidates.map((c) => c.diversity), result.candidates.map((c) => c.diversity));

      const logger = makeLogger();
      const human = await runDesignSeed({ args: [project], options: { ...options, 'no-persist': true }, logger });
      assert.deepEqual(human.candidates, result.candidates);
      for (const warning of result.warnings) assert.ok(logger.lines.includes(`  diversity warning: ${warning}`));
      assert.equal(human.recorded, null);
      assert.deepEqual(readSeedRecord(project, options.slug), record, 'diagnostic rerun cannot replace the persisted draw');
      assert.deepEqual(JSON.parse(await fs.readFile(file, 'utf8')).entries, entries, 'drawing is not measured design evidence');
    } finally {
      await fs.rm(project, { recursive: true, force: true });
    }
  });
});

test('design:seed outside a project (no .aioson/) draws without recording', async () => {
  await withTempRegistry(async () => {
    const dir = await makeTmpDir('aioson-seed-bare-');
    try {
      const result = await runDesignSeed({ args: [dir], options: { register: 'editorial', slug: 'x', json: true }, logger: makeLogger() });
      assert.equal(result.ok, true);
      assert.equal(result.recorded, null);
      assert.equal(fsSync.existsSync(path.join(dir, '.aioson')), false);
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });
});

test('kind=visual reports palette.origin and names origination without a draw on a cold start', async () => {
  await withTempRegistry(async () => {
    const project = await makeTmpDir('aioson-origin-');
    try {
      await fs.mkdir(path.join(project, '.aioson', 'context'), { recursive: true });
      const page = path.join(project, 'index.html');
      await fs.writeFile(page, measuredSurface('#22c55e')); // the green the prior loves

      const cold = await runVerifyArtifact({ args: [project], options: { kind: 'visual', file: page, slug: 'painel', advisory: true, json: true, suppressExitCode: true }, logger: makeLogger() });
      assert.equal(cold.metrics.craft.measured, true);
      assert.equal(cold.metrics.palette.origin, 'prior');
      assert.equal(cold.metrics.palette.provenance.reason, 'no_draw');
      const warning = cold.warnings.find((w) => /origination without a draw/.test(w));
      assert.ok(warning, `expected the cold-start warning, got: ${cold.warnings.join(' | ')}`);
      assert.match(warning, /design-seed\.json absent/);
      assert.match(warning, /aioson design:seed/);

      // Draw, then build FROM a candidate: origin flips to seed and the warning goes.
      const draw = await runDesignSeed({ args: [project], options: { register: 'technical', slug: 'painel', json: true }, logger: makeLogger() });
      const chosen = draw.candidates[0];
      await fs.writeFile(page, measuredSurface(chosen.roles.accent.hex));
      const consumed = await runVerifyArtifact({ args: [project], options: { kind: 'visual', file: page, slug: 'painel', advisory: true, json: true, suppressExitCode: true }, logger: makeLogger() });
      assert.equal(consumed.metrics.palette.origin, 'seed', JSON.stringify(consumed.metrics.palette.provenance));
      assert.equal(consumed.metrics.palette.provenance.draw.source, 'record');
      assert.equal(consumed.metrics.palette.provenance.closest_candidate, chosen.label);
      assert.equal(consumed.warnings.some((w) => /origination without a draw|draw ignored/.test(w)), false);
      // The registry entry carries the origin.
      const entry = readRegistry().entries.find((e) => e.slug === 'painel');
      assert.ok(entry, 'a persisted run records the fingerprint (explicit registry, temp project)');
      assert.equal(entry.origin, 'seed');

      // Draw ignored: a far hue after a recorded draw names the closest candidate.
      await fs.writeFile(page, measuredSurface('#22c55e'));
      const far = draw.candidates.every((c) => Math.abs(((c.accent_hue - 145) % 360 + 540) % 360 - 180) > 30);
      if (far) {
        const reverted = await runVerifyArtifact({ args: [project], options: { kind: 'visual', file: page, slug: 'painel', advisory: true, json: true, suppressExitCode: true }, logger: makeLogger() });
        assert.equal(reverted.metrics.palette.origin, 'prior');
        assert.equal(reverted.metrics.palette.provenance.reason, 'draw_ignored');
        assert.ok(reverted.warnings.some((w) => /draw ignored/.test(w)), reverted.warnings.join(' | '));
      }

      // An identity record outranks everything: no draw needed, no warning.
      await fs.writeFile(path.join(project, '.aioson', 'context', 'identity.md'), '---\nkind: identity\nscope: brand\nsource: intent\n---\n# Identity\n');
      const owned = await runVerifyArtifact({ args: [project], options: { kind: 'visual', file: page, slug: 'painel', advisory: true, json: true, suppressExitCode: true }, logger: makeLogger() });
      assert.equal(owned.metrics.palette.origin, 'identity');
      assert.equal(owned.warnings.some((w) => /origination without a draw|draw ignored/.test(w)), false);
    } finally {
      await fs.rm(project, { recursive: true, force: true });
    }
  });
});

test('a dir/file run on a project the registry already knows is not a cold start; a conformance run never nags', async () => {
  await withTempRegistry(async () => {
    const project = await makeTmpDir('aioson-known-');
    try {
      await fs.mkdir(path.join(project, '.aioson', 'context'), { recursive: true });
      const page = path.join(project, 'index.html');
      await fs.writeFile(page, measuredSurface('#22c55e'));
      // First measured surface: the cold start is named (no slug — project scope).
      const first = await runVerifyArtifact({ args: [project], options: { kind: 'visual', file: page, advisory: true, json: true, suppressExitCode: true }, logger: makeLogger() });
      assert.ok(first.warnings.some((w) => /origination without a draw/.test(w)));
      assert.match(first.warnings.find((w) => /origination without a draw/.test(w)), /\.aioson\/context\/design-seed\.json absent/);
      // The project is now in the registry: a later feature's dir run reports the origin but does not nag.
      const later = await runVerifyArtifact({ args: [project], options: { kind: 'visual', file: page, advisory: true, json: true, suppressExitCode: true }, logger: makeLogger() });
      assert.equal(later.metrics.palette.origin, 'prior');
      assert.equal(later.warnings.some((w) => /origination without a draw/.test(w)), false);
      // Conformance transfers an approved prototype: never a cold start.
      const conformance = await runVerifyArtifact({ args: [project], options: { kind: 'visual', file: page, slug: 'feature-x', conformance: 'feature-x', advisory: true, json: true, suppressExitCode: true }, logger: makeLogger() });
      assert.equal(conformance.warnings.some((w) => /origination without a draw|draw ignored/.test(w)), false);
    } finally {
      await fs.rm(project, { recursive: true, force: true });
    }
  });
});

test('the write-side record survives a missing history and a re-draw with an identity', async () => {
  const project = await makeTmpDir('aioson-seed-write-');
  try {
    await fs.mkdir(path.join(project, '.aioson'), { recursive: true });
    const payload = { generator: 'test', project: 'p', project_id: 'pid', register: 'quiet', pole: 'dark', seed: 0, basis: 'b', identity: { path: '.aioson/context/identity.md' }, candidates: [{ label: 'mono-10', register: 'quiet', pole: 'dark', scheme: 'mono', base_hue: 10, accent_hue: 12, pairing: { display: 'Italiana', ui: 'Karla' }, composition: { hero: 'centered-object', material: 'glass' } }] };
    const file = writeSeedRecord(project, 'f', payload);
    assert.equal(file, seedRecordPath(project, 'f'));
    const record = readSeedRecord(project, 'f');
    assert.equal(record.identity, '.aioson/context/identity.md');
    assert.equal(record.candidates[0].display, 'Italiana');
    assert.equal(writeSeedRecord(path.join(project, 'nowhere'), 'f', payload), null, 'no .aioson/ → nothing written');
  } finally {
    await fs.rm(project, { recursive: true, force: true });
  }
});
