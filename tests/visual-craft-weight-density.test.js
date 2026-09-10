'use strict';

/**
 * Two premium builds scored the same 5/5 craft: a dark, image-led, seven-
 * keyframe landing and a pale page that floated one heading and a faint ring
 * over three viewports of ground. Presence is not weight, and a stylesheet
 * cannot see emptiness — so the craft levers are graded (weight) and the
 * rendered folds are photographed and counted (density). The owner's answer
 * about references is a manifest fact the gate reads, and the seed honors the
 * identity's ground instead of re-rolling it away.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

process.env.AIOSON_DESIGN_REGISTRY = path.join(__filename, 'no-registry', 'design-fingerprints.json');

const { analyzeVisualSources } = require('../src/lib/visual-telemetry');
const { summarizeRuntime, collectRuntimeMeasurements, RUNTIME_PROBE_VERSION } = require('../src/lib/visual-runtime');
const { decodePng, contentShare, encodePngRgb } = require('../src/lib/png-stats');
const { runVerifyArtifact } = require('../src/commands/verify-artifact');
const { generateSeedCandidates, POLES } = require('../src/lib/design-seed');
const { runDesignSeed, resolveIdentity } = require('../src/commands/design-seed');

function makeLogger() {
  const lines = [];
  return { log: (m = '') => lines.push(String(m)), error: (m = '') => lines.push(String(m)), warn: () => {}, lines };
}

async function tmp() { return fs.mkdtemp(path.join(os.tmpdir(), 'aioson-craft-weight-')); }
async function write(dir, rel, body) {
  const file = path.join(dir, rel);
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, body, 'utf8');
}

// A full brand surface with every lever lit once: delivered face, one 64px
// heading, two gradients + a blur, one applied keyframe with reduced motion +
// a scroll reveal, one verified image. Lit, thin.
function thinBrandSurface(extraCss = '', extraBody = '') {
  const filler = Array.from({ length: 60 }, (_, i) => `.f${i} { padding: var(--s2); margin: var(--s3); color: var(--fg); background: var(--bg); }`).join('\n');
  return `<!doctype html><html><head><style>
  @font-face { font-family: "Atlas Display"; src: url(data:font/woff2;base64,AAAA) format("woff2"); }
  :root { --s2: 8px; --s3: 12px; --fg: #1a1a1a; --bg: #ffffff; --accent: #c42d65; }
  body { font-family: system-ui, sans-serif; background: var(--bg); color: var(--fg); }
  h1 { font-family: "Atlas Display", serif; font-size: 64px; }
  .hero { padding: 96px 0; background: linear-gradient(180deg, #fff, #f6f0f4); }
  .wash { background: radial-gradient(circle at 20% 20%, #fbe7ef, transparent 40%); background-size: 200% 200%; filter: blur(12px); animation: drift 20s linear infinite; }
  @keyframes drift { from { background-position: 0% 50%; } to { background-position: 100% 50%; } }
  @media (prefers-reduced-motion: reduce) { .wash { animation: none; } }
  .btn { padding: var(--s2); transition: opacity .2s; }
  .btn:focus-visible { outline: 2px solid var(--fg); }
  ${extraCss}
  ${filler}
  </style></head><body>
  <section class="hero"><div class="wash"></div><h1>Estúdio de design</h1><p>Sites autorais.</p><a class="btn" href="#contato">Conversar</a></section>
  <section class="work"><img src="data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD" alt="Estudo de luz numa rotunda"></section>
  <section class="method"><h2>Método</h2></section>
  <section class="contact"><h2>Contato</h2></section>
  ${extraBody}
  </body></html>`;
}

// The same page carrying its weight: type at 120px with tracked caps and an
// italic voice, atmosphere on three layers, an ambient loop plus a hover
// system that moves, absolute and sticky composition with clip-path and
// blend, three cover images.
const RICH_CSS = `
  h1 { font-size: clamp(64px, 10vw, 120px); font-style: italic; font-weight: 500; }
  .kicker { text-transform: uppercase; letter-spacing: .18em; font-weight: 600; }
  .lede { font-weight: 300; }
  .hero::before { content: ""; position: absolute; inset: 0; background: radial-gradient(circle at 10% 40%, #ffb27a, transparent 45%); filter: blur(80px); opacity: .6; }
  .hero::after { content: ""; position: absolute; inset: 0; background: conic-gradient(from 90deg, #0b0a08, #3a1240, #0b0a08); mix-blend-mode: screen; }
  .grain { background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence baseFrequency='.8'/%3E%3C/filter%3E%3C/svg%3E"); }
  .orb { animation: float 18s ease-in-out infinite; position: absolute; }
  @keyframes float { 0% { transform: translate3d(0,0,0); } 100% { transform: translate3d(40px,-20px,0); } }
  .plate:hover { transform: translateY(-6px); }
  .plate img { object-fit: cover; }
  .hero img { object-fit: cover; }
  .row:hover { transform: scale(1.02); }
  .rail { position: sticky; top: 0; }
  .bleed { margin-left: -64px; margin-right: -64px; clip-path: polygon(0 0, 100% 0, 100% 90%, 0 100%); }
  .stage { position: absolute; }
`;
const RICH_BODY = `
  <div class="grain"></div><div class="orb"></div>
  <section class="plates"><div class="plate"><img src="data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD" alt="Prancha um"></div>
  <div class="plate"><img src="data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD" alt="Prancha dois"></div>
  <div class="plate"><img src="data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD" alt="Prancha três"></div></section>
`;

test('craft weight grades each lever 0–2: the thin page warns, the rich one scores the bar, familiarity surfaces are not scored', () => {
  const thin = analyzeVisualSources({ html: thinBrandSurface() });
  assert.equal(thin.metrics.craft.measured, true);
  assert.equal(thin.metrics.craft.active_levers, 5, JSON.stringify(thin.metrics.craft.levers));
  const weight = thin.metrics.craft.weight;
  assert.equal(weight.scored, true);
  assert.equal(weight.bar, 60);
  assert.ok(weight.score < 60, `thin page weight ${weight.score}: ${JSON.stringify(weight.grades)}`);
  assert.match(thin.warnings.join('\n'), /craft weight \d+\/100 below the brand bar \(60\): the levers are lit but thin/);
  assert.doesNotMatch(thin.warnings.join('\n'), /craft floor/);

  const rich = analyzeVisualSources({ html: thinBrandSurface(RICH_CSS, RICH_BODY) });
  const richWeight = rich.metrics.craft.weight;
  assert.ok(richWeight.score >= 60, `rich page weight ${richWeight.score}: ${JSON.stringify(richWeight.grades)} ${JSON.stringify(richWeight.signals)}`);
  assert.deepEqual(richWeight.grades, { typography: 2, atmosphere: 2, motion: 2, composition: 2, media: 2 });
  assert.doesNotMatch(rich.warnings.join('\n'), /craft weight/);

  const operate = analyzeVisualSources({ html: thinBrandSurface(), surfaceMode: 'operate' });
  assert.equal(operate.metrics.craft.weight.scored, false);
  assert.match(operate.metrics.craft.weight.reason, /precision, not weight/);
  assert.doesNotMatch(operate.warnings.join('\n'), /craft weight/);
});

// ─── pixels ───────────────────────────────────────────────────────────

function png({ width = 200, height = 100, ground = [250, 239, 247], boxes = [] } = {}) {
  const rgb = Buffer.alloc(width * height * 3);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = (y * width + x) * 3;
      const box = boxes.find((b) => x >= b.x && x < b.x + b.w && y >= b.y && y < b.y + b.h);
      const color = box ? box.color : ground;
      rgb[i] = color[0]; rgb[i + 1] = color[1]; rgb[i + 2] = color[2];
    }
  }
  return encodePngRgb({ width, height, rgb });
}

test('png-stats decodes a screenshot and counts the pixels that leave the page color', () => {
  const empty = decodePng(png());
  assert.equal(empty.width, 200);
  assert.equal(empty.channels, 3);
  assert.equal(contentShare(empty, { step: 1 }).content_pct, 0);
  // A faint ring on the same hue is not content; a photograph and black type are.
  const faint = decodePng(png({ boxes: [{ x: 40, y: 20, w: 120, h: 60, color: [242, 231, 239] }] }));
  assert.equal(contentShare(faint, { step: 1 }).content_pct, 0);
  const filled = decodePng(png({ boxes: [{ x: 0, y: 0, w: 60, h: 100, color: [20, 24, 28] }, { x: 120, y: 10, w: 60, h: 80, color: [180, 90, 40] }] }));
  const share = contentShare(filled, { step: 1 });
  assert.ok(share.content_pct >= 54 && share.content_pct <= 56, `flat boxes count by distance (${share.content_pct})`);
  assert.match(share.ground, /^#[0-9a-f]{6}$/);
  // When content covers more than the ground, the mode IS content and the
  // share reads from there — still well past any floor, which is the point.
  const dominant = decodePng(png({ boxes: [{ x: 0, y: 0, w: 140, h: 100, color: [20, 24, 28] }] }));
  const dominantShare = contentShare(dominant, { step: 1 }).content_pct;
  assert.ok(dominantShare >= 30 && dominantShare <= 32, `mode is content (${dominantShare})`);
  // Low-key imagery: a dark photograph on a dark ground never leaves the
  // ground by distance, but its texture is content. Noise ±20 per channel on
  // half the image → that half counts.
  const rgb = Buffer.alloc(200 * 100 * 3);
  let seed = 7;
  const rand = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  for (let y = 0; y < 100; y += 1) {
    for (let x = 0; x < 200; x += 1) {
      const i = (y * 200 + x) * 3;
      const noisy = x >= 100;
      const jitter = noisy ? Math.round((rand() - 0.5) * 40) : 0;
      rgb[i] = Math.max(0, 10 + jitter); rgb[i + 1] = Math.max(0, 10 + jitter); rgb[i + 2] = Math.max(0, 8 + jitter);
    }
  }
  const lowKey = contentShare(decodePng(encodePngRgb({ width: 200, height: 100, rgb })), { step: 1 });
  assert.ok(lowKey.content_pct >= 40 && lowKey.content_pct <= 52, `textured half reads as content (${lowKey.content_pct})`);
  // …while a smooth near-ground gradient stays ground.
  const smooth = Buffer.alloc(200 * 100 * 3);
  for (let y = 0; y < 100; y += 1) for (let x = 0; x < 200; x += 1) { const i = (y * 200 + x) * 3; const v = 10 + Math.round(x / 20); smooth[i] = v; smooth[i + 1] = v; smooth[i + 2] = v; }
  assert.equal(contentShare(decodePng(encodePngRgb({ width: 200, height: 100, rgb: smooth })), { step: 1 }).content_pct, 0);
  // Dark ground works the same way: the mode is the ground, whatever its lightness.
  const dark = decodePng(png({ ground: [11, 10, 8], boxes: [{ x: 0, y: 0, w: 200, h: 50, color: [232, 186, 82] }] }));
  const darkShare = contentShare(dark, { step: 1 }).content_pct;
  assert.ok(darkShare >= 50 && darkShare <= 52, `dark ground, gold band (${darkShare})`);
  assert.throws(() => decodePng(Buffer.from('not a png')), /not a PNG/);
});

test('fold density: an empty entry fold, a gap fold or a stretched sequence on desktop is named with its numbers; state routes, phone columns and operate surfaces stay silent', () => {
  const desktop = { name: 'desktop', width: 1280, height: 800 };
  const mobile = { name: 'mobile', width: 360, height: 740 };
  const base = { scroll_width: 1280, viewport_width: 1280, viewport_height: 800, clipped: [], offscreen: [], small_targets: [], text_samples: [], primary: [] };
  const occupancy = (...pcts) => pcts.map((pct, index) => ({ fold: index + 1, occupancy_pct: pct }));
  const pixels = [{ fold: 1, top: 0, content_pct: 21, ground: '#f8e8f8' }, { fold: 2, top: 800, content_pct: 36, ground: '#f8e8f8' }, { fold: 3, top: 1600, content_pct: 53, ground: '#f8e8f8' }];

  const empty = summarizeRuntime([{ viewport: desktop, raw: { ...base, occupancy: occupancy(18, 4, 6), pixel_density: pixels } }]);
  assert.match(empty.warnings.join('\n'), /desktop: the first fold is 82% empty \(a visual subject — loaded media, display type, a contrasting panel or a photographic ground — covers 18% of it\)/);
  assert.deepEqual(empty.metrics.assurance.density, { folds: 3, first_fold_occupancy_pct: 18, folds_occupancy_pct: [18, 4, 6], folds_avg_occupancy_pct: 9, folds_pixels_pct: [21, 36, 53], ground: '#f8e8f8', scope: 'desktop', floor: 35 });
  assert.deepEqual(empty.metrics.viewports[0].density.folds_occupancy_pct, [18, 4, 6]);

  // The measured incident shape: a filled opening, then a viewport of page
  // color with a faint ring, then plates again.
  const gap = summarizeRuntime([{ viewport: desktop, raw: { ...base, occupancy: occupancy(100, 9, 82) } }]);
  assert.match(gap.warnings.join('\n'), /desktop: fold 2 is 91% empty \(per fold: 100%, 9%, 82%\) — a whole viewport of page color between sections is not rhythm, it is a gap/);
  assert.doesNotMatch(gap.warnings.join('\n'), /the first fold is/);

  const stretched = summarizeRuntime([{ viewport: desktop, raw: { ...base, occupancy: occupancy(36, 25, 23) } }]);
  assert.match(stretched.warnings.join('\n'), /72% of the first 3 folds is empty on average \(per fold: 36%, 25%, 23%\)/);
  assert.doesNotMatch(stretched.warnings.join('\n'), /is not rhythm/);

  const full = summarizeRuntime([{ viewport: desktop, raw: { ...base, occupancy: occupancy(100, 100, 46) } }]);
  assert.deepEqual(full.warnings, []);
  assert.equal(full.metrics.assurance.density.first_fold_occupancy_pct, 100);
  assert.equal(full.metrics.assurance.density.folds_pixels_pct, undefined, 'no screenshot, no pixel record');

  const phone = summarizeRuntime([{ viewport: mobile, raw: { ...base, viewport_width: 360, scroll_width: 360, occupancy: occupancy(18, 4, 6) } }]);
  assert.deepEqual(phone.warnings, []);
  assert.equal(phone.metrics.assurance.density, undefined);
  assert.equal(phone.metrics.viewports[0].density.first_fold_occupancy_pct, 18, 'recorded, never charged');

  const state = summarizeRuntime([{ viewport: desktop, route: { name: 'empty', route: '#/empty', state: 'empty' }, raw: { ...base, occupancy: occupancy(18, 4, 6) } }]);
  assert.deepEqual(state.warnings, []);

  const operate = summarizeRuntime([{ viewport: desktop, raw: { ...base, occupancy: occupancy(18, 4, 6) } }], { surfaceMode: 'operate' });
  assert.deepEqual(operate.warnings, []);
  assert.equal(operate.metrics.assurance.density.first_fold_occupancy_pct, 18, 'still measured on an operate surface');

  const none = summarizeRuntime([{ viewport: desktop, raw: { ...base } }]);
  assert.deepEqual(none.warnings, []);
});

test('the collector photographs the first folds of the entry route and skips state routes and pages that cannot be photographed', async () => {
  const shots = [];
  const scrolls = [];
  const makePage = ({ withScreenshot }) => ({
    goto: async () => {},
    waitForTimeout: async () => {},
    evaluate: async (fn, arg) => {
      if (fn.name === 'pageProbe') {
        return { scroll_width: 1280, viewport_width: 1280, viewport_height: 800, scroll_height: 2000, clipped: [], offscreen: [], small_targets: [], text_samples: [], primary: [], occupancy: [{ fold: 1, occupancy_pct: 62 }, { fold: 2, occupancy_pct: 5 }, { fold: 3, occupancy_pct: 40 }], assurance: { probe_version: RUNTIME_PROBE_VERSION, fonts: { custom_used: [], undelivered_families: [] }, media: { loaded: 0, broken: [] }, material: { techniques: [] }, motion: { active: 0, ambient: 0 }, states: { present: [], visible: [] } } };
      }
      scrolls.push(arg === undefined ? 0 : arg);
      return null;
    },
    ...(withScreenshot ? {
      screenshot: async ({ fullPage }) => {
        shots.push(fullPage);
        // fold 1 half filled, folds 2–3 empty
        return shots.length === 1
          ? png({ boxes: [{ x: 0, y: 0, w: 100, h: 100, color: [20, 24, 28] }] })
          : png();
      }
    } : {})
  });
  const launcher = (withScreenshot) => async () => ({
    newContext: async () => ({ newPage: async () => makePage({ withScreenshot }), close: async () => {} }),
    close: async () => {}
  });

  const measured = await collectRuntimeMeasurements({ fileUrl: 'file:///proto.html', viewports: [{ name: 'desktop', width: 1280, height: 800 }], launcher: launcher(true) });
  assert.equal(measured.available, true);
  const folds = measured.runs[0].raw.pixel_density;
  assert.equal(folds.length, 3, '2000px page at 800px folds → three folds');
  assert.deepEqual(folds.map((f) => f.top), [0, 800, 1600]);
  assert.ok(folds[0].content_pct >= 50 && folds[0].content_pct <= 52, `half-filled first fold (${folds[0].content_pct})`);
  assert.equal(folds[1].content_pct, 0);
  assert.deepEqual(scrolls, [0, 800, 1600, 0], 'scrolls fold by fold and back to the top');
  assert.deepEqual(shots, [false, false, false], 'viewport screenshots, never full-page');
  const summary = summarizeRuntime(measured.runs);
  assert.match(summary.warnings.join('\n'), /fold 2 is 95% empty \(per fold: 62%, 5%, 40%\)/);
  assert.deepEqual(summary.metrics.assurance.density.folds_pixels_pct.slice(1), [0, 0], 'the pixel record travels beside the verdict');

  const stateRun = await collectRuntimeMeasurements({ fileUrl: 'file:///proto.html', viewports: [{ name: 'desktop', width: 1280, height: 800 }], launcher: launcher(true), routes: [{ name: 'empty', route: '#/empty', state: 'empty' }] });
  assert.equal(stateRun.runs[0].raw.pixel_density, undefined, 'a state route is not the argument');

  const blind = await collectRuntimeMeasurements({ fileUrl: 'file:///proto.html', viewports: [{ name: 'desktop', width: 1280, height: 800 }], launcher: launcher(false) });
  assert.equal(blind.runs[0].raw.pixel_density, undefined);
  const blindSummary = summarizeRuntime(blind.runs);
  assert.match(blindSummary.warnings.join('\n'), /fold 2 is 95% empty/, 'occupancy is read from the DOM: no screenshot, same verdict');
  assert.equal(blindSummary.metrics.assurance.density.folds_pixels_pct, undefined, 'no screenshot, no pixel record');
});

// ─── the owner's answer about references ───────────────────────────────

test('a brand-surface prototype built intent-first with no recorded answer about references is named; a recorded answer or an operate surface is silent', async () => {
  const dir = await tmp();
  const manifest = (front) => `---\nfeature: agencia\nstatus: draft\n${front}\n---\n\n## Visual direction\n\n- Register: Editorial — plates and figure numbers\n- Thesis: the page behaves like a gallery dossier\n- Anti-goals: no dark dashboard with neon; no uniform card wall\n- Composition signature: didone headline crossing the grid seam\n`;
  await write(dir, '.aioson/briefings/agencia/prototype.html', thinBrandSurface());
  await write(dir, '.aioson/briefings/agencia/prototype-manifest.md', manifest('identity: none\nsurface_mode: brand'));
  const unasked = await runVerifyArtifact({ args: [dir], options: { kind: 'visual', slug: 'agencia', json: true, advisory: true, suppressExitCode: true }, logger: makeLogger() });
  assert.match(unasked.warnings.join('\n'), /references_unasked: intent-first build \(`identity: none`\) on a brand surface with no record of the owner's answer about references/);
  assert.equal(unasked.metrics.manifest_references, null);
  assert.match(unasked.warnings.join('\n'), /ask the owner for visual references/, 'the thin build also points at the identity route');

  await write(dir, '.aioson/briefings/agencia/prototype-manifest.md', manifest('identity: none\nsurface_mode: brand\nreferences: declined'));
  const declined = await runVerifyArtifact({ args: [dir], options: { kind: 'visual', slug: 'agencia', json: true, advisory: true, suppressExitCode: true }, logger: makeLogger() });
  assert.doesNotMatch(declined.warnings.join('\n'), /references_unasked/);
  assert.equal(declined.metrics.manifest_references, 'declined');

  await write(dir, '.aioson/briefings/agencia/prototype-manifest.md', manifest('identity: none\nsurface_mode: operate'));
  const operate = await runVerifyArtifact({ args: [dir], options: { kind: 'visual', slug: 'agencia', json: true, advisory: true, suppressExitCode: true }, logger: makeLogger() });
  assert.doesNotMatch(operate.warnings.join('\n'), /references_unasked/);

  await write(dir, '.aioson/briefings/agencia/identity.md', '---\nkind: identity\nscope: briefing\ntheme: dark\n---\n');
  await write(dir, '.aioson/briefings/agencia/prototype-manifest.md', manifest('identity: .aioson/briefings/agencia/identity.md\nsurface_mode: brand'));
  const extracted = await runVerifyArtifact({ args: [dir], options: { kind: 'visual', slug: 'agencia', json: true, advisory: true, suppressExitCode: true }, logger: makeLogger() });
  assert.doesNotMatch(extracted.warnings.join('\n'), /references_unasked/);
});

// ─── the seed honors the owner's ground ────────────────────────────────

test('design:seed: a fixed pole holds across every candidate, the identity fixes it, and an explicit flag states a preference', async () => {
  for (const pole of POLES) {
    const { candidates, pole: fixed } = generateSeedCandidates({ slug: 'agencia', register: 'editorial', count: 3, pole });
    assert.equal(fixed, pole);
    assert.ok(candidates.every((c) => c.pole === pole), pole);
  }
  const free = generateSeedCandidates({ slug: 'agencia', register: 'editorial', count: 3 });
  assert.equal(free.pole, null);
  assert.equal(generateSeedCandidates({ slug: 'agencia', register: 'editorial', count: 3, pole: 'sideways' }).pole, null, 'an unknown pole is ignored, never guessed');
  const again = generateSeedCandidates({ slug: 'agencia', register: 'editorial', count: 3, pole: 'dark' });
  assert.deepEqual(again.candidates.map((c) => c.label), generateSeedCandidates({ slug: 'agencia', register: 'editorial', count: 3, pole: 'dark' }).candidates.map((c) => c.label), 'same inputs, same draw');

  const dir = await tmp();
  const previous = process.env.AIOSON_DESIGN_REGISTRY;
  process.env.AIOSON_DESIGN_REGISTRY = path.join(dir, 'registry.json');
  try {
    await write(dir, '.aioson/context/project.context.md', '---\nclassification: MICRO\n---\n');
    await write(dir, '.aioson/briefings/agencia/identity.md', '---\nkind: identity\nscope: briefing\nslug: agencia\nsource: references\ngenerated_by: reference-identity-extract\ntheme: dark\nregister: cinematic\n---\n\n## Design pillars\n');
    assert.deepEqual(resolveIdentity(dir, { slug: 'agencia' }), { path: '.aioson/briefings/agencia/identity.md', scope: 'briefing', theme: 'dark', pole: 'dark', register: 'cinematic' });
    assert.equal(resolveIdentity(dir, { slug: 'other' }), null);

    const seeded = await runDesignSeed({ args: [dir], options: { slug: 'agencia', json: true }, logger: makeLogger() });
    assert.equal(seeded.ok, true);
    assert.equal(seeded.pole, 'dark');
    assert.equal(seeded.register, 'cinematic');
    assert.deepEqual(seeded.identity.applied, { pole: true, register: true });
    assert.ok(seeded.candidates.every((c) => c.pole === 'dark' && c.register === 'cinematic'));

    const overridden = await runDesignSeed({ args: [dir], options: { slug: 'agencia', pole: 'light', json: true }, logger: makeLogger() });
    assert.equal(overridden.pole, 'light');
    assert.deepEqual(overridden.identity.applied, { pole: false, register: true });

    const human = makeLogger();
    await runDesignSeed({ args: [dir], options: { slug: 'agencia' }, logger: human });
    assert.match(human.lines.join('\n'), /identity \.aioson\/briefings\/agencia\/identity\.md \(theme dark\) — dark ground, cinematic register: the owner's record outranks the draw/);

    const unknown = await runDesignSeed({ args: [dir], options: { slug: 'agencia', pole: 'sideways', json: true }, logger: makeLogger() });
    assert.equal(unknown.ok, false);
    assert.equal(unknown.error, 'unknown_pole');
    process.exitCode = 0;
    const missing = await runDesignSeed({ args: [dir], options: { slug: 'agencia', identity: 'nope.md', json: true }, logger: makeLogger() });
    assert.equal(missing.error, 'identity_not_found');
    process.exitCode = 0;
  } finally {
    if (previous === undefined) delete process.env.AIOSON_DESIGN_REGISTRY;
    else process.env.AIOSON_DESIGN_REGISTRY = previous;
  }
});

// ─── the one human gate reads the number ───────────────────────────────

const { runBriefingApprove } = require('../src/commands/briefing');
const { writeBriefingRegistry } = require('../src/lib/refiner/briefing-registry');

test('briefing:approve refuses a brand-surface prototype under the premium bar with the numbers; --accept-craft records the decision in the manifest', async () => {
  const dir = await tmp();
  const slug = 'agencia';
  await write(dir, '.aioson/context/project.context.md', '---\nclassification: MICRO\ninteraction_language: en\n---\n');
  await write(dir, `.aioson/briefings/${slug}/briefings.md`, '# Agência\n\nA landing page for a design studio.\n');
  await write(dir, `.aioson/briefings/${slug}/prototype.html`, thinBrandSurface('', '<main id="main"><button>Conversar</button></main>'));
  await writeBriefingRegistry(dir, {
    updated_at: '2026-08-26',
    briefings: [{ slug, status: 'draft', source_plans: [], created_at: '2026-08-26', approved_at: null, prd_generated: null }]
  });
  const manifest = (extra = '') => `---
feature: ${slug}
status: draft
approved_at: null
identity: none
references: declined
surface_mode: brand
${extra}---

# Prototype

## Visual direction
- register: editorial
- thesis: the page behaves like a gallery dossier where every plate proves the studio's craft.
- anti-goals: generic card dashboard, decorative gradient hero.
- composition signature: a didone headline crossing the grid seam while the hero plate bleeds off the margin.

## Runtime matrix
- entry: #main

## Quality evidence
- verdict: pass
- evidence: .aioson/context/features/${slug}/visual-evidence.json
- craft: CRAFT
- runtime: waived — owner explicitly accepted static-only evidence for this fixture
- routes: 0
`;
  await write(dir, `.aioson/briefings/${slug}/prototype-manifest.md`, manifest());
  const measured = await runVerifyArtifact({ args: [dir], options: { kind: 'visual', slug, advisory: true, json: true, suppressExitCode: true }, logger: makeLogger() });
  assert.equal(measured.verdict, 'pass');
  assert.ok(measured.metrics.craft.weight.score < 60, `fixture must sit under the bar (${measured.metrics.craft.weight.score})`);
  const craft = `${measured.metrics.craft.active_levers}/${measured.metrics.craft.lever_count}`;
  await write(dir, `.aioson/briefings/${slug}/prototype-manifest.md`, manifest().replace('CRAFT', craft));
  // Re-measure so the persisted evidence binds the final manifest bytes.
  await runVerifyArtifact({ args: [dir], options: { kind: 'visual', slug, advisory: true, json: true, suppressExitCode: true }, logger: makeLogger() });

  const logger = makeLogger();
  const refused = await runBriefingApprove({ args: [dir], options: { slug }, logger });
  assert.equal(refused.ok, false);
  assert.equal(refused.error, 'prototype_visual_craft_below_bar');
  assert.match(logger.lines.join('\n'), /measures below the premium bar \(prototype_visual_craft_below_bar\)/);
  assert.match(logger.lines.join('\n'), /craft weight \d+\/100 below the brand bar \(60\) — thin: /);
  assert.match(logger.lines.join('\n'), /--accept-craft/);
  const still = await fs.readFile(path.join(dir, '.aioson', 'briefings', slug, 'prototype-manifest.md'), 'utf8');
  assert.match(still, /^status: draft$/m);

  const accepted = await runBriefingApprove({ args: [dir], options: { slug, 'accept-craft': true }, logger: makeLogger() });
  assert.deepEqual(accepted, { ok: true, approved: slug });
  const frozen = await fs.readFile(path.join(dir, '.aioson', 'briefings', slug, 'prototype-manifest.md'), 'utf8');
  assert.match(frozen, /^status: approved$/m);
  assert.match(frozen, /^craft_accepted: craft weight \d+\/100 below the brand bar \(60\)/m);
});

test('the density refusal reads the floor embedded in the measurement, never a second copy of it', async () => {
  const dir = await tmp();
  const slug = 'atelier';
  await write(dir, '.aioson/context/project.context.md', '---\nclassification: MICRO\ninteraction_language: en\n---\n');
  await write(dir, `.aioson/briefings/${slug}/briefings.md`, '# Atelier\n\nA landing page for a design studio.\n');
  await write(dir, `.aioson/briefings/${slug}/prototype.html`, thinBrandSurface('', '<main id="main"><button>Conversar</button></main>'));
  await writeBriefingRegistry(dir, {
    updated_at: '2026-08-26',
    briefings: [{ slug, status: 'draft', source_plans: [], created_at: '2026-08-26', approved_at: null, prd_generated: null }]
  });
  const manifest = (craft) => `---
feature: ${slug}
status: draft
approved_at: null
identity: none
references: declined
surface_mode: brand
---

# Prototype

## Visual direction
- register: editorial
- thesis: the page behaves like a gallery dossier where every plate proves the studio's craft.
- anti-goals: generic card dashboard, decorative gradient hero.
- composition signature: a didone headline crossing the grid seam while the hero plate bleeds off the margin.

## Runtime matrix
- entry: #main

## Quality evidence
- verdict: pass
- evidence: .aioson/context/features/${slug}/visual-evidence.json
- craft: ${craft}
- runtime: measured — walkthrough density injected by this fixture
- routes: 1
`;
  await write(dir, `.aioson/briefings/${slug}/prototype-manifest.md`, manifest('CRAFT'));
  const measured = await runVerifyArtifact({ args: [dir], options: { kind: 'visual', slug, advisory: true, json: true, suppressExitCode: true }, logger: makeLogger() });
  await write(dir, `.aioson/briefings/${slug}/prototype-manifest.md`, manifest(`${measured.metrics.craft.active_levers}/${measured.metrics.craft.lever_count}`));
  await runVerifyArtifact({ args: [dir], options: { kind: 'visual', slug, advisory: true, json: true, suppressExitCode: true }, logger: makeLogger() });

  const evidencePath = path.join(dir, '.aioson', 'context', 'features', slug, 'visual-evidence.json');
  const approveWithDensity = async (density) => {
    const report = JSON.parse(await fs.readFile(evidencePath, 'utf8'));
    report.metrics.runtime = { available: true, assurance: { routes_verified: ['entry'], states_verified: [], density } };
    await fs.writeFile(evidencePath, JSON.stringify(report, null, 2));
    const logger = makeLogger();
    const result = await runBriefingApprove({ args: [dir], options: { slug }, logger });
    return { result, output: logger.lines.join('\n') };
  };

  // 32% sits under the legacy literal (35) but over the measured floor (30):
  // no density line — the measurement rules, the literal is dead.
  const overFloor = await approveWithDensity({ first_fold_occupancy_pct: 32, scope: 'desktop', floor: 30 });
  assert.equal(overFloor.result.ok, false);
  assert.equal(overFloor.result.error, 'prototype_visual_craft_below_bar');
  assert.doesNotMatch(overFloor.output, /first fold/);

  const underFloor = await approveWithDensity({ first_fold_occupancy_pct: 20, scope: 'desktop', floor: 30 });
  assert.equal(underFloor.result.error, 'prototype_visual_craft_below_bar');
  assert.match(underFloor.output, /first fold 80% empty at desktop \(a visual subject covers 20%\)/);

  // Evidence recorded by a probe that predates the embedded floor: 35 covers it.
  const legacy = await approveWithDensity({ first_fold_occupancy_pct: 34, scope: 'desktop' });
  assert.equal(legacy.result.error, 'prototype_visual_craft_below_bar');
  assert.match(legacy.output, /first fold 66% empty/);

  // A brand report from before the weight existed (v1.62.0 and earlier) over
  // unchanged bytes stays content-fresh but carries no bar to read: stale,
  // never a silent pass — not even with --accept-craft.
  const report = JSON.parse(await fs.readFile(evidencePath, 'utf8'));
  delete report.metrics.craft.weight;
  report.metrics.runtime = { available: true, assurance: { routes_verified: ['entry'], states_verified: [] } };
  await fs.writeFile(evidencePath, JSON.stringify(report, null, 2));
  for (const options of [{ slug }, { slug, 'accept-craft': true }]) {
    const logger = makeLogger();
    const stale = await runBriefingApprove({ args: [dir], options, logger });
    assert.equal(stale.error, 'prototype_visual_evidence_stale', logger.lines.join('\n'));
    assert.match(logger.lines.join('\n'), /brand weight bar[\s\S]*aioson verify:artifact \. --kind=visual --slug=atelier/);
  }
});
