'use strict';

/**
 * The shipped front-end was the one surface nothing measured: the prototype
 * auto-fired (it had an owner and a path), the implementation had neither.
 * Now the implementers' `agent:done` resolves the interface root from the
 * feature's delivered change set, measures it, and holds it to the
 * prototype's recorded evidence — a regression is a number in the session
 * end, and `feature:trace` carries both halves.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const { resolveInterfaceDir, commonDir } = require('../src/lib/interface-root');
const { verifyAgentArtifact, AGENT_ARTIFACT_KIND } = require('../src/artifact-kinds');
const { runVerifyArtifact } = require('../src/commands/verify-artifact');
const { visualEvidenceBlock, formatVisualEvidence, readVisualImplementation } = require('../src/lib/visual-evidence');
const { shouldIncludeForProfile, DEFAULT_PROFILE, DESIGN_ENGINE_ID } = require('../src/install-profile');

process.env.AIOSON_DESIGN_REGISTRY = path.join(__filename, 'no-registry', 'design-fingerprints.json');

async function write(root, rel, body) {
  const file = path.join(root, rel);
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, body, 'utf8');
}

function git(dir, args) {
  return execFileSync('git', args, { cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

const SLUG = 'catalog';

// An ambitious prototype: delivered webfont, display type, layered material, motion, imagery.
function prototypeHtml() {
  const rules = Array.from({ length: 45 }, (_, i) => `.row-${i} { padding: var(--s2) var(--s4); gap: var(--s2); margin-bottom: var(--s3); border-bottom: 1px solid var(--line); color: var(--fg); background: transparent; }`).join('\n');
  return `<!doctype html><html><head><style>
@import url('https://fonts.googleapis.com/css2?family=Fraunces:wght@600&family=Inter&display=swap');
:root { --bg: #0f0d0a; --fg: #f3ede4; --line: rgba(243,237,228,.12); --accent: #8b5cf6; --accent-ink: #fff; --s2: 8px; --s3: 12px; --s4: 16px; --s8: 32px; --r1: 8px; --r2: 12px;
  --shadow-1: 0 1px 2px rgba(0,0,0,.4), 0 8px 24px rgba(0,0,0,.35); --wash: linear-gradient(180deg, rgba(139,92,246,.12), transparent 60%); }
@keyframes rise { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }
@media (prefers-reduced-motion: reduce) { * { animation: none !important; transition: none !important; } }
html, body { background: var(--bg); color: var(--fg); font-family: 'Inter', system-ui, sans-serif; }
h1 { font-family: 'Fraunces', Georgia, serif; font-size: clamp(2.5rem, 6vw, 4.5rem); line-height: 1.02; }
  .hero { padding: var(--s8); background: var(--wash), radial-gradient(circle at 85% 10%, rgba(139,92,246,.18), transparent 32%); border-radius: var(--r2); box-shadow: var(--shadow-1); }
.card { padding: var(--s4); border: 1px solid var(--line); border-radius: var(--r1); background: color-mix(in oklch, var(--bg), white 4%); }
.btn { padding: var(--s2) var(--s4); background: var(--accent); color: var(--accent-ink); border-radius: var(--r1); transition: transform .2s ease, box-shadow .2s ease; }
.btn:hover { transform: translateY(-1px); box-shadow: var(--shadow-1); } .btn:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; } .btn:disabled { opacity: .5; }
.is-loading { opacity: .6; } .empty-state { padding: var(--s4); } .error-state { color: #ffb4a8; } .reveal { animation: rise .6s ease both; }
::selection { background: var(--accent); color: var(--accent-ink); } img.evidence { border-radius: var(--r2); box-shadow: var(--shadow-1); }
${rules}
</style></head><body><main class="hero reveal"><h1>Catalog</h1><img class="evidence" src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='640' height='360'%3E%3Crect width='640' height='360' fill='%238b5cf6'/%3E%3C/svg%3E" alt="Editorial catalog evidence"><button class="btn">Go</button></main></body></html>`;
}

// A flat implementation: same hygiene, no delivered face, no display scale, no material, no motion.
function flatCss() {
  const rules = Array.from({ length: 50 }, (_, i) => `.row-${i} { padding: var(--s2) var(--s4); gap: var(--s2); margin-bottom: var(--s3); border-bottom: 1px solid var(--line); color: var(--fg); background: var(--bg); }`).join('\n');
  return `:root { --bg: #0f0d0a; --fg: #f3ede4; --line: rgba(243,237,228,.12); --accent: #8b5cf6; --s2: 8px; --s3: 12px; --s4: 16px; --r1: 8px; }
body { background: var(--bg); color: var(--fg); font-family: system-ui, sans-serif; }
h1 { font-size: 1.5rem; } .btn { padding: var(--s2) var(--s4); background: var(--accent); color: #fff; border-radius: var(--r1); }
.btn:focus-visible { outline: 2px solid var(--accent); } .btn:disabled { opacity: .5; } .is-loading { opacity: .6; } .empty-state { padding: var(--s4); } .error-state { color: #ffb4a8; }
${rules}`;
}

async function featureRepo() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'aioson-impl-visual-'));
  git(dir, ['init', '-q']);
  git(dir, ['config', 'user.email', 'a@b.c']);
  git(dir, ['config', 'user.name', 'a']);
  await write(dir, 'README.md', '# app\n');
  git(dir, ['add', '-A']);
  git(dir, ['commit', '-q', '-m', 'baseline']);
  await write(dir, '.aioson/context/project.context.md', '---\nclassification: "SMALL"\n---\n# C\n');
  await write(dir, '.aioson/context/project-pulse.md', `---\nactive_feature: ${SLUG}\n---\n# Pulse\n`);
  await write(dir, `.aioson/briefings/${SLUG}/prototype.html`, prototypeHtml());
  await write(dir, `.aioson/briefings/${SLUG}/prototype-manifest.md`, `---\nfeature: ${SLUG}\nstatus: approved\nidentity: none\n---\n\n## Visual direction\n- register: editorial\n`);
  git(dir, ['add', '-A']);
  git(dir, ['commit', '-q', '-m', `feat(${SLUG}): artifacts`]);
  return dir;
}

test('commonDir and the interface root: strong interface files decide, a .ts-only change never does', async () => {
  assert.equal(commonDir(['src/ui/App.tsx', 'src/ui/app.css']), 'src/ui');
  assert.equal(commonDir(['src/a.css', 'public/index.html']), '');
  assert.equal(commonDir(['app/page.tsx']), 'app');

  const dir = await featureRepo();
  const none = resolveInterfaceDir(dir, { slug: SLUG });
  assert.equal(none.dir, null);
  assert.match(none.reason, /no interface sources/);

  await write(dir, 'src/services/catalog.ts', 'export const x = 1;\n');
  const backendOnly = resolveInterfaceDir(dir, { slug: SLUG });
  assert.equal(backendOnly.dir, null, 'a .ts change alone is not an interface change');

  await write(dir, 'src/ui/App.tsx', 'export const App = () => <main className="hero" />;\n');
  await write(dir, 'src/ui/app.css', flatCss());
  await write(dir, 'src/ui/App.test.tsx', 'test("x", () => {});\n');
  const resolved = resolveInterfaceDir(dir, { slug: SLUG });
  assert.equal(resolved.dir, 'src/ui');
  assert.deepEqual(resolved.files.sort(), ['src/ui/App.tsx', 'src/ui/app.css']);
  assert.match(resolved.base_source, /parent of first feature commit/);
});

test('the implementers measure the shipped front-end at agent:done and hold it to the prototype floor', async () => {
  const dir = await featureRepo();

  // Backend-only feature: the done-gate skips with a state, not a finding.
  await write(dir, 'src/services/catalog.ts', 'export const x = 1;\n');
  const skipped = await verifyAgentArtifact({ targetDir: dir, agent: 'dev', options: {} });
  assert.equal(skipped.kind, 'visual');
  assert.equal(skipped.skipped, true);
  assert.match(skipped.reason, /no interface sources/);

  // The prototype was measured (its evidence recorded) — the refiner's auto-fire.
  const proto = await runVerifyArtifact({ args: [dir], options: { kind: 'visual', slug: SLUG, advisory: true, json: true, suppressExitCode: true }, logger: { log() {}, error() {} } });
  assert.ok(proto.metrics.craft.measured && proto.metrics.craft.active_levers >= 3, `prototype must be ambitious: ${JSON.stringify(proto.metrics.craft.levers)}`);

  // The implementation ships flat. No --feature on the agent:done line: the
  // active feature resolves from the pulse.
  await write(dir, 'src/ui/App.tsx', 'export const App = () => <main className="hero"><h1>Catalog</h1><button className="btn">Go</button></main>;\n');
  await write(dir, 'src/ui/app.css', flatCss());
  const done = await verifyAgentArtifact({ targetDir: dir, agent: 'dev', options: {} });
  assert.equal(done.kind, 'visual');
  assert.equal(done.skipped, false);
  assert.equal(done.dir, 'src/ui');
  assert.equal(done.interface_files, 2);
  assert.ok(Array.isArray(done.regressed) && done.regressed.length >= 3, `expected regressions, got ${JSON.stringify(done.regressed)}`);
  assert.ok(done.regressed.some((r) => /^craft /.test(r)) && done.regressed.some((r) => /^materials /.test(r)) && done.regressed.some((r) => /typeface delivered/.test(r)), done.regressed.join(' | '));
  assert.match(done.reason, /src\/ui: craft \d\/5 \| materials \d\/7 \| tells \d+ \| REGRESSED vs prototype/);

  const implementation = readVisualImplementation(dir, SLUG);
  assert.ok(implementation, 'visual-implementation.json must be persisted next to the prototype evidence');
  assert.ok(implementation.warnings.some((w) => /visual conformance: the implementation regressed/.test(w)));

  const block = visualEvidenceBlock(dir, SLUG);
  assert.equal(block.measured, true);
  assert.ok(block.implementation.regressed.length >= 3);
  assert.match(formatVisualEvidence(block), /\| implementation: craft \d\/5 .* — REGRESSED vs prototype: craft/);

  // QA's session end measures the same surface the same way.
  const qa = await verifyAgentArtifact({ targetDir: dir, agent: 'qa', options: {} });
  assert.equal(qa.kind, 'visual');
  assert.equal(qa.dir, 'src/ui');
});

test('an implementation that holds the floor reports it, and a feature without prototype evidence is compared with nothing', async () => {
  const dir = await featureRepo();
  await write(dir, 'src/ui/index.html', prototypeHtml());
  const noEvidence = await verifyAgentArtifact({ targetDir: dir, agent: 'deyvin', options: {} });
  assert.equal(noEvidence.skipped, false);
  assert.equal(noEvidence.regressed, undefined);
  assert.match(noEvidence.reason, /craft \d\/5/);
  const report = readVisualImplementation(dir, SLUG);
  assert.match(report.metrics.conformance.reason, /no recorded prototype evidence/);

  // The record says the comparison was impossible; the one-line verdict must
  // not say the opposite.
  assert.equal(report.metrics.conformance.state, 'not-compared');
  assert.deepEqual(report.metrics.conformance.compared, []);
  assert.match(noEvidence.reason, /NOT compared to a prototype floor/);
  assert.doesNotMatch(noEvidence.reason, /holds the prototype floor/);
  assert.match(formatVisualEvidence(visualEvidenceBlock(dir, SLUG)), /NOT compared to a prototype floor/);

  await runVerifyArtifact({ args: [dir], options: { kind: 'visual', slug: SLUG, advisory: true, json: true, suppressExitCode: true }, logger: { log() {}, error() {} } });
  const holds = await verifyAgentArtifact({ targetDir: dir, agent: 'dev', options: {} });
  assert.equal(holds.regressed, undefined);
  assert.match(holds.reason, /holds the prototype floor/);
  // …and that one IS earned: every axis was compared.
  assert.equal(readVisualImplementation(dir, SLUG).metrics.conformance.state, 'compared');
});

// A hand-authored surface too thin for a craft SCORE (under 150 declarations)
// still declares its typeface, its display size and its dialect. Bailing out of
// every axis because one of them was unavailable left `regressed: []` on a
// comparison that never ran — which the session-end line read as a pass.
function thinCss() {
  return `:root { --bg: #ffffff; --fg: #111827; --accent: #4f46e5; --line: #e5e7eb; --r1: 10px; --s2: 8px; --s4: 16px; }
body { margin: 0; background: var(--bg); color: var(--fg); font-family: system-ui, sans-serif; line-height: 1.5; }
h1 { font-size: 2rem; margin: 0 0 var(--s2); }
.item { display: flex; justify-content: space-between; padding: var(--s2) 0; border-bottom: 1px solid var(--line); }
.btn { background: var(--accent); color: #fff; border: 0; border-radius: var(--r1); padding: var(--s4); font-weight: 600; }
.btn:focus-visible { outline: 2px solid var(--accent); }
.btn:disabled { opacity: .5; }
.is-loading { opacity: .6; }
.empty-state { padding: var(--s4); }
.error-state { color: #b91c1c; }`;
}

// A utility-class build keeps typeface, scale and dialect in class attributes,
// where static telemetry cannot read them — comparing those axes would invent
// regressions, so they must stay NOT COMPARED rather than fail.
function utilityBuildHtml() {
  const rows = Array.from({ length: 14 }, (_, i) => `<div class="flex items-center justify-between gap-4 px-4 py-2"><span class="text-sm font-medium">Row ${i}</span></div>`).join('');
  return `<!doctype html><html><head><style>
:root { --bg: #0f0d0a; --fg: #f3ede4; --accent: #8b5cf6; --line: rgba(243,237,228,.12); }
body { background: var(--bg); color: var(--fg); margin: 0; padding: 0; }
.prose a { color: var(--accent); text-decoration: underline; }
h1 { font-size: 1.5rem; line-height: 1.2; }
.sr-help { position: absolute; clip: rect(0,0,0,0); }
</style></head><body><main class="mx-auto max-w-4xl px-4 py-8"><h1 class="text-lg font-bold">Catalog</h1>${rows}</main></body></html>`;
}

test('a craft score it cannot compute never becomes a pass: the readable axes are still held to the prototype', async () => {
  const dir = await featureRepo();
  await runVerifyArtifact({ args: [dir], options: { kind: 'visual', slug: SLUG, advisory: true, json: true, suppressExitCode: true }, logger: { log() {}, error() {} } });

  await write(dir, 'src/ui/index.html', '<!doctype html><html><head><link rel="stylesheet" href="./app.css"><title>Catalog</title></head><body><main><h1>Catalog</h1><button class="btn">Go</button></main></body></html>\n');
  await write(dir, 'src/ui/app.css', thinCss());
  const done = await verifyAgentArtifact({ targetDir: dir, agent: 'dev', options: {} });

  const conformance = readVisualImplementation(dir, SLUG).metrics.conformance;
  assert.equal(conformance.state, 'partial', JSON.stringify(conformance));
  assert.deepEqual(conformance.not_compared, ['craft', 'materials', 'weight']);
  assert.deepEqual(conformance.compared, ['tells', 'typeface', 'display type', 'modern CSS']);
  assert.ok(
    conformance.regressed.some((row) => /^display type \d+px → \d+px$/.test(row)),
    `the display-type drop is measurable without a craft score: ${JSON.stringify(conformance.regressed)}`
  );
  assert.match(done.reason, /REGRESSED vs prototype/);
  assert.doesNotMatch(done.reason, /holds the prototype floor/);
});

test('a utility-class build names the axes nothing could read, and invents no regression on them', async () => {
  const dir = await featureRepo();
  await runVerifyArtifact({ args: [dir], options: { kind: 'visual', slug: SLUG, advisory: true, json: true, suppressExitCode: true }, logger: { log() {}, error() {} } });

  await write(dir, 'src/ui/index.html', utilityBuildHtml());
  const done = await verifyAgentArtifact({ targetDir: dir, agent: 'dev', options: {} });

  const conformance = readVisualImplementation(dir, SLUG).metrics.conformance;
  assert.equal(conformance.state, 'not-compared', JSON.stringify(conformance));
  assert.deepEqual(conformance.regressed, [], 'a surface nothing could read must not be charged with regressions');
  assert.match(conformance.reason, /utility-class styling/);
  assert.match(done.reason, /NOT compared to a prototype floor/);
  assert.doesNotMatch(done.reason, /holds the prototype floor/);
});

test('implementation conformance carries the graded prototype floor and names an unavailable or incompatible axis', async (t) => {
  const dir = await featureRepo();
  t.after(() => fs.rm(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }));
  await write(dir, 'src/ui/index.html', prototypeHtml());
  const evidencePath = `.aioson/context/features/${SLUG}/visual-evidence.json`;
  const measure = (options) => runVerifyArtifact({
    args: [dir],
    options: { kind: 'visual', advisory: true, json: true, suppressExitCode: true, ...options },
    logger: { log() {}, error() {} }
  });
  for (const [mode, axis] of [['brand', 'weight'], ['operate', 'precision'], ['read', 'precision']]) {
    const baseline = await measure({ slug: SLUG, 'surface-mode': mode });
    assert.equal(baseline.metrics.craft[axis].scored, true);
    assert.ok(baseline.metrics.craft[axis].score < 100);
    // Isolate the new graded axis: every older floor measurement is identical.
    baseline.metrics.craft[axis].score = 100;
    await write(dir, evidencePath, JSON.stringify(baseline));
    const measured = await measure({ dir: 'src/ui', conformance: SLUG, 'surface-mode': mode });
    const comparison = measured.metrics.conformance;
    assert.ok(comparison.compared.includes(axis), JSON.stringify(comparison));
    assert.deepEqual(comparison.regressed, [`${axis} 100/100 → ${measured.metrics.craft[axis].score}/100`]);
    assert.ok(measured.warnings.some((warning) => warning.includes(`visual conformance: the implementation regressed`) && warning.includes(axis)));
    assert.ok(readVisualImplementation(dir, SLUG).metrics.conformance.regressed[0].startsWith(axis));

    const switched = await measure({ dir: 'src/ui', conformance: SLUG, 'surface-mode': mode === 'brand' ? 'operate' : 'brand' });
    assert.equal(switched.metrics.conformance.state, 'partial');
    assert.ok(switched.metrics.conformance.not_compared.includes(axis));
    assert.ok(!switched.metrics.conformance.regressed.some((row) => row.startsWith(axis)));
    assert.match(switched.metrics.conformance.reason, /unavailable|surface mode/);

    baseline.metrics.craft[axis] = { scored: false };
    await write(dir, evidencePath, JSON.stringify(baseline));
    const legacy = await measure({ dir: 'src/ui', conformance: SLUG, 'surface-mode': mode });
    assert.ok(!legacy.metrics.conformance.compared.includes(axis), 'an unscored prototype must not invent a numeric floor');
  }
});

test('site-forge carries the visual rider over its deliverable, and the engine installs under every profile', () => {
  assert.deepEqual(AGENT_ARTIFACT_KIND['site-forge'].also, [{ kind: 'visual', needs: 'dir' }]);
  for (const agent of ['dev', 'qa']) {
    const m = AGENT_ARTIFACT_KIND[agent];
    assert.equal(m.kind, 'visual');
    assert.equal(m.interfaceDir, true);
    assert.equal(m.conformance, true);
    assert.equal(m.featureSlugged, true);
  }
  // deyvin was retired into dev: its done-gate entry is gone with it.
  assert.equal(Object.prototype.hasOwnProperty.call(AGENT_ARTIFACT_KIND, 'deyvin'), false);
  assert.equal(DESIGN_ENGINE_ID, 'interface-design');
  assert.equal(shouldIncludeForProfile('.aioson/skills/design/interface-design/SKILL.md', DEFAULT_PROFILE), true, 'the engine is not a preset');
  assert.equal(shouldIncludeForProfile('.aioson/skills/design/interface-design/references/aesthetic-registers.md', { ...DEFAULT_PROFILE, design: 'none' }), true);
  assert.equal(shouldIncludeForProfile('.aioson/skills/design/some-forged-ui/SKILL.md', DEFAULT_PROFILE), false, 'non-engine skills stay profile-gated');
  assert.equal(shouldIncludeForProfile('.aioson/skills/design/some-forged-ui/SKILL.md', { ...DEFAULT_PROFILE, design: 'all' }), true);
});

test('the active feature resolves for a featureSlugged done-gate when no --feature was threaded', async () => {
  const dir = await featureRepo();
  const refiner = await verifyAgentArtifact({ targetDir: dir, agent: 'refiner', options: {} });
  // The primary kind=review has no report for this feature (not ok, advisory);
  // what matters: the slug resolved, so it was not the "needs --slug" hint.
  assert.equal(refiner.kind, 'review');
  assert.equal(refiner.skipped, false);
  const rider = (refiner.also || []).find((r) => r.kind === 'visual');
  assert.ok(rider, 'the visual rider must run for the resolved feature');
  assert.equal(rider.skipped, false);
});
