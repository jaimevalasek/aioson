'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { analyzeVisualSources } = require('../src/lib/visual-telemetry');
const { generateSeedCandidates, findRepetition } = require('../src/lib/design-seed');
const { scopeVisualCss } = require('../src/lib/visual-css-scope');
const { summarizeRuntime } = require('../src/lib/visual-runtime');

function surface(extra = '') {
  return `<!doctype html><html><head><style>
    @font-face { font-family: "Sample Display"; src: url('./sample.woff2'); }
    :root { --ink: #181818; --ground: #fff; --space: 16px; }
    body { font-family: "Sample Display", serif; background: var(--ground); color: var(--ink); }
    h1 { font-size: 72px; line-height: 1.1; font-weight: 600; }
    main { display: grid; grid-template-columns: 1fr 1fr; gap: var(--space); max-width: 1200px; }
    p { font-size: 16px; line-height: 1.6; max-width: 60ch; }
    img { width: 100%; height: auto; object-fit: cover; }
    ${Array.from({ length: 40 }, () => 'main { padding: var(--space); margin: var(--space); color: var(--ink); background: var(--ground); }').join('\n')}
    ${extra}
    </style></head><body><main><h1>Archive</h1><p>Objects, their makers and their stories.</p>
    <img src="data:image/png;base64,AAAA" alt="An archival plate" width="800" height="600">
    </main></body></html>`;
}

test('absent selectors cannot buy craft points, font scale, material or motion', () => {
  const before = analyzeVisualSources({ html: surface(), surfaceMode: 'brand' });
  const after = analyzeVisualSources({ html: surface(`
    .unused-a { position: absolute; filter: blur(80px); mix-blend-mode: screen; clip-path: inset(1px); font-size: 180px; }
    .unused-b { position: sticky; margin-left: -4px; mask-image: linear-gradient(black, transparent); }
    .unused-a::before { position: absolute; background: radial-gradient(red, transparent), linear-gradient(black, white); }
    .unused-b::before { position: absolute; background: radial-gradient(blue, transparent); }
    .unused-a { animation: drift 20s linear infinite; }
    @keyframes drift { from { background-position: 0% 0%; } to { background-position: 100% 0%; } }
  `), surfaceMode: 'brand' });
  assert.equal(after.metrics.craft.weight.score, before.metrics.craft.weight.score);
  assert.equal(after.metrics.max_font_size_px, before.metrics.max_font_size_px);
  assert.deepEqual(after.metrics.craft.material_techniques, before.metrics.craft.material_techniques);
  assert.equal(after.metrics.motion.signature, false);
  assert.ok(after.metrics.css_scope.excluded_selectors.includes('.unused-a'));
});

test('quiet and editorial profiles do not require spectacle to establish craft', () => {
  for (const register of ['quiet', 'editorial', 'technical']) {
    const result = analyzeVisualSources({ html: surface(), surfaceMode: 'brand', register });
    assert.equal(result.metrics.craft.weight.register, register);
    assert.ok(!result.metrics.craft.weight.applicable_axes.includes('motion'));
    assert.ok(result.metrics.craft.weight.score >= 60, JSON.stringify(result.metrics.craft.weight));
    assert.doesNotMatch(result.warnings.join('\n'), /96px\+|radial wash \+ grain|motion is hover-only/);
  }
});

test('dynamic state classes retain source evidence without making unrelated CSS live', () => {
  const result = scopeVisualCss('.panel.active { opacity: 1; } .unused { font-size: 180px; }',
    '<div class="panel"></div><script>document.querySelector(".panel").classList.add("active");</script>');
  assert.match(result.css, /\.panel\.active/);
  assert.doesNotMatch(result.css, /\.unused/);
  assert.deepEqual(result.evidence.uncertain_selectors, ['.panel.active']);
  const unresolved = scopeVisualCss('.unknown { font-size: 180px; }', '<main></main><script>main.innerHTML = data;</script>');
  assert.doesNotMatch(unresolved.css, /180px/);
  assert.equal(unresolved.evidence.dynamic_markup, true);
});

test('a restrained surface below the weight bar is never asked to fix an unscored motion axis', () => {
  const html = surface().replace(/<img\b[^>]*>/, '')
    .replace('display: grid; grid-template-columns: 1fr 1fr; gap: var(--space); max-width: 1200px;', 'border: 1px solid var(--ink);')
    .replace('max-width: 60ch;', '');
  const result = analyzeVisualSources({ html, surfaceMode: 'brand', register: 'quiet' });
  const warning = result.warnings.find((line) => line.startsWith('craft weight'));
  assert.ok(warning, result.warnings.join('\n'));
  assert.doesNotMatch(warning, /motion \d\/2/);
});

test('negative space is recorded for restrained registers while overflow remains a defect', () => {
  const runs = [{ viewport: { name: 'desktop', width: 1280, height: 800 }, raw: {
    viewport_width: 1280, viewport_height: 800, scroll_width: 1500,
    occupancy: [{ occupancy_pct: 18 }], clipped: [], offscreen: [], small_targets: [], text_samples: [], primary: []
  } }];
  for (const register of ['quiet', 'editorial', 'technical']) {
    const result = summarizeRuntime(runs, { surfaceMode: 'brand', register });
    assert.equal(result.metrics.assurance.density.first_fold_occupancy_pct, 18);
    assert.equal(result.metrics.assurance.density.enforced, false);
    assert.ok(result.issues.some((issue) => /horizontal scroll/i.test(issue)), result.issues.join('\n'));
    assert.doesNotMatch(result.warnings.join('\n'), /first fold is/);
  }
  assert.equal(summarizeRuntime(runs, { surfaceMode: 'brand', register: 'cinematic' }).metrics.assurance.density.enforced, true);
});

test('a draw uses recent composition and material history, not just color and type', () => {
  const options = { project: 'audit', slug: 'museum', register: 'quiet', count: 1 };
  const first = generateSeedCandidates(options).candidates[0];
  const next = generateSeedCandidates({ ...options, avoid: [{
    composition_family: first.composition.hero,
    material_family: first.composition.material,
    motion_family: first.composition.motion
  }] }).candidates[0];
  assert.notEqual(next.composition.hero, first.composition.hero);
  assert.notEqual(next.composition.material, first.composition.material);
  assert.notEqual(next.composition.motion, first.composition.motion);
});

test('a measured composition and finish can repeat after a palette and face change', () => {
  const first = { project: 'one', accent_hue: 10, ground_pole: 'light', display_face: 'face one',
    surface_mode: 'brand', composition_signature: 'grid:split|media:leading|sections:4',
    material_signature: 'gradients+grain', motion_signature: 'animated backdrop' };
  const next = { ...first, project: 'two', accent_hue: 180, display_face: 'face two' };
  assert.match(findRepetition(next, [first]).reason, /composition/);
  assert.equal(findRepetition({ ...next, composition_signature: 'flow:text|media:none|sections:1' }, [first]), null);
  assert.match(findRepetition({ ...next, accent_hue: null }, [{ ...first, accent_hue: null }]).reason, /composition/);
});

test('verification persists declared families and the next draw uses them, including an achromatic surface', async (t) => {
  const fs = require('node:fs/promises');
  const os = require('node:os');
  const path = require('node:path');
  const { runVerifyArtifact } = require('../src/commands/verify-artifact');
  const { runDesignSeed } = require('../src/commands/design-seed');
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'aioson-design-quality-'));
  const previous = process.env.AIOSON_DESIGN_REGISTRY;
  process.env.AIOSON_DESIGN_REGISTRY = path.join(dir, 'registry.json');
  t.after(async () => {
    if (previous === undefined) delete process.env.AIOSON_DESIGN_REGISTRY;
    else process.env.AIOSON_DESIGN_REGISTRY = previous;
    await fs.rm(dir, { recursive: true, force: true });
  });
  const project = path.join(dir, 'archive');
  const owned = path.join(project, '.aioson', 'briefings', 'gallery');
  await fs.mkdir(owned, { recursive: true });
  const logger = { log() {}, error() {}, warn() {} };
  const first = generateSeedCandidates({ project: 'archive', slug: 'gallery', register: 'quiet', count: 1 }).candidates[0];
  await fs.writeFile(path.join(owned, 'prototype.html'), surface().replace('<main>', '<header><nav>Archive</nav></header><main>'));
  await fs.writeFile(path.join(owned, 'prototype-manifest.md'), `---\nfeature: gallery\nsurface_mode: brand\n---\n## Visual direction\n- Register: Quiet\n- Thesis: let archival objects carry the argument.\n- Anti-goals: decorative glow, fabricated claims.\n- Composition signature: an index leads to the object plate.\n- Composition family: ${first.composition.hero}\n- Material family: ${first.composition.material}\n- Motion family: ${first.composition.motion}\n`);
  const report = await runVerifyArtifact({ args: [project], options: { kind: 'visual', slug: 'gallery', json: true, advisory: true, suppressExitCode: true }, logger });
  assert.equal(report.metrics.craft.weight.register, 'quiet');
  assert.equal(report.metrics.fingerprint_recorded, true);
  const registry = JSON.parse(await fs.readFile(process.env.AIOSON_DESIGN_REGISTRY, 'utf8'));
  assert.equal(registry.entries[0].composition_family, first.composition.hero);
  assert.equal(registry.entries[0].material_family, first.composition.material);
  assert.equal(registry.entries[0].motion_family, first.composition.motion);
  assert.equal(registry.entries[0].choices_source, 'manifest');
  assert.ok(registry.entries[0].composition_signature);
  assert.equal(registry.entries[0].accent_hue, null);
  const nextProject = path.join(dir, 'new-archive');
  await fs.mkdir(nextProject);
  const next = await runDesignSeed({ args: [nextProject], options: { register: 'quiet', slug: 'gallery', count: 1, json: true, 'no-persist': true }, logger });
  assert.notEqual(next.candidates[0].composition.hero, first.composition.hero);
  assert.notEqual(next.candidates[0].composition.material, first.composition.material);
  assert.notEqual(next.candidates[0].composition.motion, first.composition.motion);
  const conformance = await runVerifyArtifact({ args: [project], options: { kind: 'visual', file: path.relative(project, path.join(owned, 'prototype.html')), conformance: 'gallery', json: true, advisory: true, suppressExitCode: true, 'no-persist': true }, logger });
  assert.equal(conformance.metrics.craft.weight.register, 'quiet');
  const changedProfile = await runVerifyArtifact({ args: [project], options: { kind: 'visual', file: path.relative(project, path.join(owned, 'prototype.html')), conformance: 'gallery', register: 'cinematic', json: true, advisory: true, suppressExitCode: true, 'no-persist': true }, logger });
  assert.ok(changedProfile.metrics.conformance.not_compared.includes('craft'));
  assert.ok(changedProfile.metrics.conformance.not_compared.includes('weight'));
  assert.ok(!changedProfile.metrics.conformance.regressed.some((finding) => /^craft |^weight /.test(finding)));
});
