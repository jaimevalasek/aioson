'use strict';

/**
 * The familiarity bar is a number, not a sentence.
 *
 * Measured incident: an operate prototype (dashboard shell, data table,
 * dense forms) passed with seventeen advisory warnings — a workhorse face
 * named and never delivered, token adherence 39%, 95 off-grid values, 13
 * kickers, 0/7 modern CSS — because the brand weight is not scored on
 * operate surfaces ("the premium axis is precision, not weight") and nothing
 * scored precision. Now `craft.precision` grades typeface, tokens, rhythm,
 * states, chrome, tells and dialect 0–2 each, holds the total to the same
 * 60 bar the brand weight uses, and `briefing:approve` refuses on it.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

process.env.AIOSON_DESIGN_REGISTRY = path.join(__filename, 'no-registry', 'design-fingerprints.json');

const { analyzeVisualSources } = require('../src/lib/visual-telemetry');
const { runVerifyArtifact } = require('../src/commands/verify-artifact');
const { runBriefingApprove } = require('../src/commands/briefing');
const { writeBriefingRegistry } = require('../src/lib/refiner/briefing-registry');
const { summarizeVisualEvidence } = require('../src/lib/visual-evidence');

function makeLogger() {
  const lines = [];
  return { log: (m = '') => lines.push(String(m)), error: (m = '') => lines.push(String(m)), warn: () => {}, lines };
}

async function tmp() { return fs.mkdtemp(path.join(os.tmpdir(), 'aioson-precision-')); }
async function write(dir, rel, body) {
  const file = path.join(dir, rel);
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, body, 'utf8');
}

// The incident shape: a named-but-undelivered mono face, literal values off
// the grid, an uppercase mono label above every heading, a colored side
// border, 10px text, stock browser chrome, the 2018 dialect.
function sloppyOperateSurface({ withForm = true } = {}) {
  const filler = Array.from({ length: 60 }, (_, i) => `.r${i} { padding: 7px; margin: 9px; color: #d0d0d0; background: #161616; }`).join('\n');
  return `<!doctype html><html><head><style>
  body { font-family: "JetBrains Mono", monospace; background: #111; color: #ddd; }
  .sidebar { width: 240px; padding: 13px; } .toolbar { display: flex; gap: 6px; } .table { border-collapse: collapse; }
  .overline { font-size: 10px; text-transform: uppercase; letter-spacing: .08em; color: #888; }
  h2 { font-size: 22px; margin: 0 0 6px; }
  .card { padding: 13px; margin: 6px; border-left: 3px solid #e50914; }
  .btn { padding: 7px 9px; transition: opacity .2s; }
  ${filler}
  </style></head><body>
  <aside class="sidebar"><nav><a href="#/">Painel</a></nav></aside>
  <main id="main"><div class="toolbar"><button class="btn">Novo</button></div>
  <section class="card"><span class="overline">Indicador</span><h2>Cobertura</h2></section>
  <section class="card"><span class="overline">Assuntos</span><h2>Temas</h2></section>
  ${withForm ? '<table class="table"><thead><tr><th>Assunto</th></tr></thead><tbody><tr><td>Linha</td></tr></tbody></table><form><input type="text" name="q"><button class="btn">Buscar</button></form>' : ''}
  </main></body></html>`;
}

// The same surface done with precision: delivered face, tokens, on-grid
// rhythm, focus ring + selection + caret + tabular numerals, no tells,
// the current dialect.
function preciseOperateSurface() {
  const filler = Array.from({ length: 60 }, (_, i) => `.r${i} { padding: var(--s2); margin: var(--s3); color: var(--fg); background: var(--bg); }`).join('\n');
  return `<!doctype html><html><head><style>
  @font-face { font-family: "Work Face"; src: url(data:font/woff2;base64,AAAA) format("woff2"); }
  :root { --s2: 8px; --s3: 12px; --fg: #e6e6e6; --bg: #141414; --accent: #7e4dc0; --radius-sm: 6px; }
  body { font-family: "Work Face", system-ui, sans-serif; background: var(--bg); color: var(--fg); caret-color: var(--accent); }
  ::selection { background: var(--accent); color: var(--bg); }
  .sidebar { width: 240px; padding: var(--s3); } .toolbar { display: flex; gap: var(--s2); }
  .table { border-collapse: collapse; font-variant-numeric: tabular-nums; }
  .table:has(tr:hover) { background: var(--bg); }
  h2 { font-size: clamp(18px, 2vw, 22px); margin: 0 0 var(--s2); }
  .card { padding: var(--s3); margin: var(--s2); aspect-ratio: auto; border-radius: var(--radius-sm); }
  .btn { padding: var(--s2) var(--s3); transition: opacity .2s; border-radius: var(--radius-sm); }
  .btn:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
  ${filler}
  </style></head><body>
  <aside class="sidebar"><nav><a href="#/">Painel</a></nav></aside>
  <main id="main"><div class="toolbar"><button class="btn">Novo</button></div>
  <section class="card"><h2>Cobertura</h2></section>
  </main></body></html>`;
}

test('an operate surface is scored for precision: the sloppy one sits under the bar with every thin axis named, the precise one clears it', () => {
  const sloppy = analyzeVisualSources({ html: sloppyOperateSurface(), surfaceMode: 'operate' });
  assert.equal(sloppy.metrics.craft.measured, true);
  assert.equal(sloppy.metrics.surface_mode.mode, 'operate');
  assert.equal(sloppy.metrics.craft.weight.scored, false, 'weight stays unscored on operate — precision is the axis');
  const precision = sloppy.metrics.craft.precision;
  assert.equal(precision.scored, true);
  assert.equal(precision.bar, 60);
  assert.ok(precision.score < 60, `sloppy operate precision ${precision.score}: ${JSON.stringify(precision.grades)}`);
  assert.deepEqual(Object.keys(precision.grades), ['typeface', 'tokens', 'rhythm', 'states', 'chrome', 'tells', 'dialect']);
  assert.equal(precision.grades.typeface, 0, 'named but never delivered');
  assert.equal(precision.grades.rhythm, 0, '7px/9px/13px everywhere');
  assert.equal(precision.grades.tells, 0, `kicker + side border + tiny text: ${JSON.stringify(sloppy.metrics.tells.present)}`);
  assert.equal(precision.grades.dialect, 0);
  const warning = sloppy.warnings.find((w) => /operate precision \d+\/100 below the bar \(60\)/.test(w));
  assert.ok(warning, sloppy.warnings.join('\n'));
  assert.match(warning, /typeface 0\/2/);
  assert.match(warning, /vq-026/);

  const precise = analyzeVisualSources({ html: preciseOperateSurface(), surfaceMode: 'operate' });
  const good = precise.metrics.craft.precision;
  assert.ok(good.score >= 60, `precise operate precision ${good.score}: ${JSON.stringify(good.grades)} chrome=${JSON.stringify(precise.metrics.craft.browser_surfaces)}`);
  assert.equal(good.grades.typeface, 2);
  assert.equal(good.grades.tokens, 2);
  assert.equal(good.grades.rhythm, 2);
  assert.equal(good.grades.chrome, 2, JSON.stringify(precise.metrics.craft.browser_surfaces));
  assert.equal(good.grades.tells, 2);
  assert.equal(precise.warnings.some((w) => /precision \d+\/100 below/.test(w)), false, precise.warnings.join('\n'));

  // A brand surface is never scored for precision — weight is its axis.
  const brand = analyzeVisualSources({ html: preciseOperateSurface(), surfaceMode: 'brand' });
  assert.equal(brand.metrics.craft.precision.scored, false);
  assert.match(brand.metrics.craft.precision.reason, /weight, not precision/);
  assert.equal(brand.metrics.craft.weight.scored, true);
});

test('the evidence summary line carries the graded bar: precision on operate, weight on brand', () => {
  const operate = analyzeVisualSources({ html: sloppyOperateSurface(), surfaceMode: 'operate' });
  assert.match(summarizeVisualEvidence({ metrics: operate.metrics, issues: [], warnings: operate.warnings }), /craft \d\/4 \| materials \d\/7 \| tells \d+ \|.*\| precision \d+\/100/);
  const brand = analyzeVisualSources({ html: preciseOperateSurface(), surfaceMode: 'brand' });
  assert.match(summarizeVisualEvidence({ metrics: brand.metrics, issues: [], warnings: brand.warnings }), /weight \d+\/100/);
  assert.doesNotMatch(summarizeVisualEvidence({ metrics: brand.metrics, issues: [], warnings: brand.warnings }), /precision/);
});

test('briefing:approve refuses an operate prototype under the precision bar with the numbers; --accept-craft records the decision', async () => {
  const dir = await tmp();
  const slug = 'painel';
  try {
    await write(dir, '.aioson/context/project.context.md', '---\nclassification: MICRO\ninteraction_language: en\n---\n');
    await write(dir, `.aioson/briefings/${slug}/briefings.md`, '# Painel\n\nAn operations dashboard for an editorial team.\n');
    await write(dir, `.aioson/briefings/${slug}/prototype.html`, sloppyOperateSurface({ withForm: false }));
    await writeBriefingRegistry(dir, {
      updated_at: '2026-09-01',
      briefings: [{ slug, status: 'draft', source_plans: [], created_at: '2026-09-01', approved_at: null, prd_generated: null }]
    });
    const manifest = (craft = 'CRAFT') => `---
feature: ${slug}
status: draft
approved_at: null
identity: none
references: declined
surface_mode: operate
---

# Prototype

## Visual direction
- register: technical
- thesis: the whole recording is the object and the data is the product; the interface takes the editor from the index to the cut.
- anti-goals: editorial-scale hero, uniform card wall.
- composition signature: a fixed monospace index gutter on every row, closed by a continuous rule.

## Runtime matrix
- entry: #main

## Quality evidence
- verdict: pass
- evidence: .aioson/context/features/${slug}/visual-evidence.json
- craft: ${craft}
- runtime: waived — owner explicitly accepted static-only evidence for this fixture
- routes: 0
`;
    await write(dir, `.aioson/briefings/${slug}/prototype-manifest.md`, manifest());
    const measured = await runVerifyArtifact({ args: [dir], options: { kind: 'visual', slug, advisory: true, json: true, suppressExitCode: true }, logger: makeLogger() });
    assert.equal(measured.verdict, 'pass', JSON.stringify(measured.issues));
    assert.equal(measured.metrics.surface_mode.mode, 'operate');
    assert.ok(measured.metrics.craft.precision.score < 60, `fixture must sit under the bar (${measured.metrics.craft.precision.score})`);
    const craft = `${measured.metrics.craft.active_levers}/${measured.metrics.craft.lever_count}`;
    await write(dir, `.aioson/briefings/${slug}/prototype-manifest.md`, manifest(craft));
    await runVerifyArtifact({ args: [dir], options: { kind: 'visual', slug, advisory: true, json: true, suppressExitCode: true }, logger: makeLogger() });

    const logger = makeLogger();
    const refused = await runBriefingApprove({ args: [dir], options: { slug }, logger });
    assert.equal(refused.ok, false);
    assert.equal(refused.error, 'prototype_visual_craft_below_bar');
    assert.match(logger.lines.join('\n'), /operate precision \d+\/100 below the bar \(60\) — thin: /);
    assert.match(logger.lines.join('\n'), /--accept-craft/);
    const still = await fs.readFile(path.join(dir, '.aioson', 'briefings', slug, 'prototype-manifest.md'), 'utf8');
    assert.match(still, /^status: draft$/m);

    const accepted = await runBriefingApprove({ args: [dir], options: { slug, 'accept-craft': true }, logger: makeLogger() });
    assert.deepEqual(accepted, { ok: true, approved: slug });
    const frozen = await fs.readFile(path.join(dir, '.aioson', 'briefings', slug, 'prototype-manifest.md'), 'utf8');
    assert.match(frozen, /^status: approved$/m);
    assert.match(frozen, /^craft_accepted: operate precision \d+\/100 below the bar \(60\)/m);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

// Measured fail-open: freshness is content-addressed only, so evidence
// recorded by v1.64.0 or earlier — before `craft.precision` existed — stayed
// "fresh" over an unchanged prototype, the precision bar had nothing to read,
// and a 7/100 operate prototype was approved. A measured static craft with no
// scored precision is evidence from before the bar: stale, re-measure.
test('operate evidence recorded before the precision bar is refused as stale, naming the re-measure — --accept-craft cannot accept a number never measured', async () => {
  const dir = await tmp();
  const slug = 'painel';
  try {
    await write(dir, '.aioson/context/project.context.md', '---\nclassification: MICRO\ninteraction_language: en\n---\n');
    await write(dir, `.aioson/briefings/${slug}/briefings.md`, '# Painel\n\nAn operations dashboard for an editorial team.\n');
    await write(dir, `.aioson/briefings/${slug}/prototype.html`, sloppyOperateSurface({ withForm: false }));
    await writeBriefingRegistry(dir, {
      updated_at: '2026-09-01',
      briefings: [{ slug, status: 'draft', source_plans: [], created_at: '2026-09-01', approved_at: null, prd_generated: null }]
    });
    const manifest = (craft) => `---\nfeature: ${slug}\nstatus: draft\napproved_at: null\nidentity: none\nreferences: declined\nsurface_mode: operate\n---\n\n# Prototype\n\n## Visual direction\n- register: technical\n- thesis: the whole recording is the object and the data is the product; the interface takes the editor from the index to the cut.\n- anti-goals: editorial-scale hero, uniform card wall.\n- composition signature: a fixed monospace index gutter on every row, closed by a continuous rule.\n\n## Runtime matrix\n- entry: #main\n\n## Quality evidence\n- verdict: pass\n- evidence: .aioson/context/features/${slug}/visual-evidence.json\n- craft: ${craft}\n- runtime: waived — owner explicitly accepted static-only evidence for this fixture\n- routes: 0\n`;
    const measure = () => runVerifyArtifact({ args: [dir], options: { kind: 'visual', slug, advisory: true, json: true, suppressExitCode: true, 'no-persist': true }, logger: makeLogger() });
    await write(dir, `.aioson/briefings/${slug}/prototype-manifest.md`, manifest('CRAFT'));
    const first = await measure();
    await write(dir, `.aioson/briefings/${slug}/prototype-manifest.md`, manifest(`${first.metrics.craft.active_levers}/${first.metrics.craft.lever_count}`));
    const report = JSON.parse(JSON.stringify(await measure()));
    assert.equal(report.metrics.craft.measured, true);
    assert.ok(report.metrics.craft.precision.score < 60, 'fixture: the surface sits under the bar');
    // The evidence a v1.64.0 run left behind: same bytes, no precision block.
    delete report.persisted;
    delete report.metrics.craft.precision;
    await write(dir, `.aioson/context/features/${slug}/visual-evidence.json`, JSON.stringify({ ...report, measured_at: new Date().toISOString() }, null, 2));

    const logger = makeLogger();
    const refused = await runBriefingApprove({ args: [dir], options: { slug }, logger });
    assert.equal(refused.ok, false, 'an operate surface with no scored precision was approved');
    assert.equal(refused.error, 'prototype_visual_evidence_stale');
    const out = logger.lines.join('\n');
    assert.match(out, /precision/);
    assert.match(out, /aioson verify:artifact \. --kind=visual --slug=painel/);

    const forced = await runBriefingApprove({ args: [dir], options: { slug, 'accept-craft': true }, logger: makeLogger() });
    assert.equal(forced.ok, false);
    assert.equal(forced.error, 'prototype_visual_evidence_stale');
    const still = await fs.readFile(path.join(dir, '.aioson', 'briefings', slug, 'prototype-manifest.md'), 'utf8');
    assert.match(still, /^status: draft$/m);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});
