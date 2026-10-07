'use strict';

/**
 * kind=visual over a framework app, and the evidence that survives the run.
 *
 * Replayed incident: a React app with hundreds of .tsx components measured as
 * 21 .css files. Every markup metric read 0 in silence (copy cadence, emoji,
 * card walls, interactivity), and the finish referenced from components —
 * `style={{ boxShadow: 'var(--accent-glow)' }}`, an inline `animation:` — was
 * reported as "declared finish never applied", a directive to delete live
 * finish. The measurement was also a mutation: a diagnostic run rewrote the
 * operator's fingerprint registry and the consumer's tracked report file, and
 * the report itself was a single slot nothing downstream ever read.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const fssync = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { runVerifyArtifact } = require('../src/commands/verify-artifact');
const { analyzeVisualSources, componentSources } = require('../src/lib/visual-telemetry');
const { visualEvidenceBlock, formatVisualEvidence, visualEvidencePath } = require('../src/lib/visual-evidence');
const { runFeatureTrace } = require('../src/commands/feature-trace');
const { runFeatureClose } = require('../src/commands/feature-close');

// Registry OFF by default (a path under a file: read and write fail silently).
process.env.AIOSON_DESIGN_REGISTRY = path.join(__filename, 'no-registry', 'design-fingerprints.json');

function makeLogger() {
  const lines = [];
  return { log: (m = '') => lines.push(String(m)), error: (m = '') => lines.push(String(m)), warn: () => {}, lines };
}

async function makeTmpDir(prefix = 'aioson-visual-corpus-') {
  return fs.mkdtemp(path.join(os.tmpdir(), prefix));
}

async function writeFile(dir, rel, content) {
  const full = path.join(dir, rel);
  await fs.mkdir(path.dirname(full), { recursive: true });
  await fs.writeFile(full, content, 'utf8');
}

async function withTempRegistry(fn) {
  const dir = await makeTmpDir('aioson-registry-');
  const file = path.join(dir, 'design-fingerprints.json');
  const previous = process.env.AIOSON_DESIGN_REGISTRY;
  process.env.AIOSON_DESIGN_REGISTRY = file;
  try {
    await fn(file);
  } finally {
    process.env.AIOSON_DESIGN_REGISTRY = previous;
    await fs.rm(dir, { recursive: true, force: true });
  }
}

// A full, craft-measured stylesheet (≥150 declarations) with a dark ground, a
// violet accent, a delivered webfont, and three finish declarations that NO
// rule in the stylesheet references — the components do.
function fullStylesheet() {
  const head = `
@import url('https://fonts.googleapis.com/css2?family=Fraunces:wght@600&family=Inter&display=swap');
:root {
  --bg: #0f0d0a; --fg: #f3ede4; --line: rgba(243,237,228,.12); --accent: #8b5cf6; --accent-ink: #ffffff;
  --s1: 4px; --s2: 8px; --s3: 12px; --s4: 16px; --s6: 24px; --s8: 32px;
  --r1: 8px; --r2: 12px;
  --shadow-1: 0 1px 2px rgba(0,0,0,.4), 0 8px 24px rgba(0,0,0,.35);
  --accent-glow: 0 0 24px rgba(139,92,246,.35);
  --sn-shadow-lift: 0 12px 32px rgba(0,0,0,.5);
  --wash: linear-gradient(180deg, rgba(139,92,246,.12), transparent 60%);
}
@keyframes spin { to { transform: rotate(1turn); } }
@keyframes rise { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }
@media (prefers-reduced-motion: reduce) { * { animation: none !important; transition: none !important; } }
html, body { background: var(--bg); color: var(--fg); font-family: 'Inter', system-ui, sans-serif; }
h1, .display { font-family: 'Fraunces', Georgia, serif; font-size: clamp(2.5rem, 6vw, 4.5rem); line-height: 1.02; }
.hero { padding: var(--s8); background: var(--wash); border-radius: var(--r2); box-shadow: var(--shadow-1); }
.card { padding: var(--s4); border: 1px solid var(--line); border-radius: var(--r1); background: color-mix(in oklch, var(--bg), white 4%); }
.btn { padding: var(--s2) var(--s4); background: var(--accent); color: var(--accent-ink); border-radius: var(--r1); transition: transform .2s ease, box-shadow .2s ease; }
.btn:hover { transform: translateY(-1px); box-shadow: var(--shadow-1); }
.btn:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.btn:disabled { opacity: .5; }
.is-loading { opacity: .6; } .empty-state { padding: var(--s6); } .error-state { color: #ffb4a8; }
.reveal { animation: rise .6s ease both; }
::selection { background: var(--accent); color: var(--accent-ink); }
img.evidence { border-radius: var(--r2); box-shadow: var(--shadow-1); }
`;
  const rules = [];
  for (let i = 0; i < 45; i += 1) {
    rules.push(`.row-${i} { padding: var(--s2) var(--s4); gap: var(--s2); margin-bottom: var(--s3); border-bottom: 1px solid var(--line); color: var(--fg); background: transparent; }`);
  }
  return `${head}\n${rules.join('\n')}\n`;
}

const APP_TSX = `import React from 'react';
import { Lift } from './Styled';

export function App() {
  return (
    <main className="hero reveal">
      <h1 className="display">Relatório — decisão</h1>
      <p>Primeiro — segundo — terceiro — quarto — quinto.</p>
      <img className="evidence" src="/shot.png" alt="" />
      <div className="card" style={{ boxShadow: 'var(--accent-glow)', animation: 'spin 1s linear infinite' }}>
        <button className="btn" onClick={() => undefined}>Continuar</button>
      </div>
      <Lift>ok</Lift>
    </main>
  );
}
`;

const STYLED_TS = `import styled from 'styled-components';
export const Lift = styled.div\`
  box-shadow: var(--sn-shadow-lift);
  padding: \${(p) => (p.big ? '24px' : '16px')};
\`;
`;

// Copy that must NEVER count: tests, stories, type declarations, test dirs.
const TEST_NOISE = `it('x — y — z — w — v — u — t — s — r — q', () => {});\n`;

async function tsxApp() {
  const dir = await makeTmpDir();
  await writeFile(dir, 'app/src/index.css', fullStylesheet());
  await writeFile(dir, 'app/src/theme.scss', '$x: 1;\n.theme { padding: var(--s2); margin: var(--s2); }\n');
  await writeFile(dir, 'app/src/App.tsx', APP_TSX);
  await writeFile(dir, 'app/src/Styled.ts', STYLED_TS);
  await writeFile(dir, 'app/src/App.test.tsx', TEST_NOISE);
  await writeFile(dir, 'app/src/Button.stories.tsx', TEST_NOISE);
  await writeFile(dir, 'app/src/types.d.ts', TEST_NOISE);
  await writeFile(dir, 'app/src/__tests__/deep.tsx', TEST_NOISE);
  await writeFile(dir, 'app/src/e2e/flow.ts', TEST_NOISE);
  await writeFile(dir, 'app/node_modules/pkg/index.css', '.vendor { padding: 7px; }');
  return dir;
}

test('componentSources lifts CSS-in-JS into stylesheet text and JSX into markup', () => {
  const src = `const A = styled.div\`color: \${(p) => p.theme.fg}; box-shadow: var(--glow);\`;
const k = keyframes\`from { opacity: 0 } to { opacity: 1 }\`;
const nested = css\`content: "\${\`inner \${1}\`}"; padding: 8px;\`;
export default () => <section className="hero"><button onClick={go}>Go</button></section>;`;
  const out = componentSources(src);
  assert.match(out.css, /box-shadow: var\(--glow\)/);
  assert.match(out.css, /from \{ opacity: 0 \}/);
  assert.match(out.css, /padding: 8px/, 'a nested template literal inside an interpolation must not end the outer literal');
  assert.doesNotMatch(out.css, /p\.theme\.fg/, 'interpolations are blanked, never parsed as CSS');
  assert.match(out.markup, /class="hero"/);
  assert.doesNotMatch(out.markup, /box-shadow/);
});

test('the replayed incident: finish referenced only from components is live, and component copy is counted', async () => {
  const dir = await tsxApp();
  const css = await fs.readFile(path.join(dir, 'app/src/index.css'), 'utf8');

  // The pre-fix shape — stylesheet alone — reports the component-applied finish as dead.
  const cssOnly = analyzeVisualSources({ css });
  assert.ok(cssOnly.metrics.craft.measured, 'fixture must be craft-measured (≥150 declarations)');
  assert.ok(
    cssOnly.metrics.craft.unapplied_effects.includes('--accent-glow') && cssOnly.metrics.craft.unapplied_effects.includes('@keyframes spin'),
    `the stylesheet-only read must see the component-applied finish as dead: ${cssOnly.metrics.craft.unapplied_effects.join(', ')}`
  );

  const report = await runVerifyArtifact({
    args: [dir],
    options: { kind: 'visual', dir: 'app/src', advisory: true, json: true, suppressExitCode: true },
    logger: makeLogger()
  });
  assert.equal(report.ok, true, report.issues.join('\n'));
  assert.deepEqual(report.metrics.corpus, { documents: 0, stylesheets: 2, components: 2, files_total: 4, truncated: 0 });
  assert.deepEqual(report.metrics.files, ['app/src/index.css', 'app/src/theme.scss', 'app/src/App.tsx', 'app/src/Styled.ts']);

  const unapplied = report.metrics.craft.unapplied_effects;
  for (const name of ['--accent-glow', '--sn-shadow-lift', '@keyframes spin']) {
    assert.equal(unapplied.includes(name), false, `${name} is applied from a component and must not read as dead finish`);
  }
  assert.equal(report.warnings.some((w) => /declared finish never applied/.test(w)), false, report.warnings.join('\n'));

  // Markup metrics come from the JSX now — and the test/story/type noise stays out.
  assert.equal(report.metrics.em_dash_prose, 5, 'five spaced em dashes in App.tsx; none from tests, stories or .d.ts');
  assert.equal(report.metrics.interactive_surface, true);
  assert.equal(report.metrics.media_elements, 1);
});

test('a directory walk is deterministic and a cut corpus is reported, never silent', async () => {
  const dir = await makeTmpDir();
  for (let i = 0; i < 405; i += 1) {
    await writeFile(dir, `many/s${String(i).padStart(4, '0')}.css`, `.a${i} { padding: 8px; margin: 8px; }\n`);
  }
  const report = await runVerifyArtifact({
    args: [dir],
    options: { kind: 'visual', dir: 'many', advisory: true, json: true, suppressExitCode: true },
    logger: makeLogger()
  });
  assert.equal(report.metrics.corpus.files_total, 400);
  assert.equal(report.metrics.corpus.truncated, 5);
  assert.equal(report.metrics.files.length, 60, 'the report lists a bounded sample of the files read');
  assert.equal(report.metrics.files[0], 'many/s0000.css');
  assert.match(report.warnings.join('\n'), /corpus truncated: 5 file\(s\) beyond the 400-file cap/);
});

test('--runtime with no HTML document is a reported state, and --url opens a served app', async () => {
  const dir = await tsxApp();
  let launched = false;
  const skipped = await runVerifyArtifact({
    args: [dir],
    options: { kind: 'visual', dir: 'app/src', runtime: true, advisory: true, json: true, suppressExitCode: true, browserLauncher: async () => { launched = true; } },
    logger: makeLogger()
  });
  assert.equal(launched, false);
  assert.equal(skipped.metrics.runtime.available, false);
  assert.match(skipped.metrics.runtime.reason, /runtime pass skipped/);
  assert.match(skipped.metrics.runtime.reason, /--url=<served app>/);
  assert.ok(skipped.warnings.some((w) => /runtime pass skipped/.test(w)));

  const visited = [];
  const launcher = async () => ({
    newContext: async () => ({
      newPage: async () => ({
        goto: async (url) => { visited.push(url); },
        evaluate: async () => ({ scroll_width: 360, viewport_width: 360, clipped: [], offscreen: [], small_targets: [], text_samples: [] })
      }),
      close: async () => {}
    }),
    close: async () => {}
  });
  const served = await runVerifyArtifact({
    args: [dir],
    options: { kind: 'visual', url: 'http://localhost:5173', runtime: true, advisory: true, json: true, suppressExitCode: true, browserLauncher: launcher },
    logger: makeLogger()
  });
  assert.equal(served.ok, false, 'layout-only runtime data cannot assert premium craft');
  assert.equal(served.verdict, 'unverified');
  assert.equal(served.blocking, false);
  assert.ok(served.unverified_reasons.some((reason) => /craft assurance/i.test(reason)));
  assert.ok(visited.length > 0 && visited.every((u) => u === 'http://localhost:5173'), `expected the served URL, got ${visited.join(', ')}`);
  assert.equal(served.metrics.runtime.available, true);
  assert.equal(served.metrics.runtime.entry, 'http://localhost:5173');
  assert.ok(served.warnings.some((w) => /not applicable/.test(w)), 'the static half says it had nothing to read');
});

test('--no-persist measures without writing: no report file, no fingerprint', async () => {
  await withTempRegistry(async (registryFile) => {
    const dir = await makeTmpDir();
    await writeFile(dir, 'page.html', `<!doctype html><html><head><style>${fullStylesheet()}</style></head><body><main class="hero"><h1>Surface</h1><button class="btn">Go</button></main></body></html>`);

    const quiet = await runVerifyArtifact({
      args: [dir],
      options: { kind: 'visual', file: 'page.html', 'no-persist': true, advisory: true, json: true, suppressExitCode: true },
      logger: makeLogger()
    });
    assert.equal(quiet.persisted, false);
    assert.ok(quiet.metrics.craft.measured);
    assert.equal(quiet.metrics.fingerprint_recorded, false);
    assert.equal(fssync.existsSync(path.join(dir, '.aioson', 'context', 'verify-artifact-visual.json')), false);
    assert.equal(fssync.existsSync(registryFile), false, 'a diagnostic run must not create the operator registry');

    const loud = await runVerifyArtifact({
      args: [dir],
      options: { kind: 'visual', file: 'page.html', advisory: true, json: true, suppressExitCode: true },
      logger: makeLogger()
    });
    assert.equal(loud.persisted, undefined);
    assert.equal(loud.metrics.fingerprint_recorded, true);
    assert.equal(fssync.existsSync(path.join(dir, '.aioson', 'context', 'verify-artifact-visual.json')), true);
    assert.equal(JSON.parse(await fs.readFile(registryFile, 'utf8')).entries.length, 1);
  });
});

const SLUG = 'catalog';

async function featureWithPrototype() {
  const dir = await makeTmpDir();
  await writeFile(dir, `.aioson/briefings/${SLUG}/prototype.html`, `<!doctype html><html><head><style>${fullStylesheet()}</style></head><body><main class="hero"><h1>Catalog</h1><button class="btn">Go</button></main></body></html>`);
  await writeFile(dir, `.aioson/briefings/${SLUG}/prototype-manifest.md`, `---\nfeature: ${SLUG}\nstatus: approved\nidentity: none\n---\n\n# Prototype manifest\n\n## Visual direction\n- register: editorial\n- thesis: one surface\n\n## Core interactions\n- \`go\` — continues\n`);
  return dir;
}

test('a feature-owned measurement lands in the feature evidence slot, where an ad-hoc run cannot overwrite it', async () => {
  const dir = await featureWithPrototype();
  const owned = await runVerifyArtifact({
    args: [dir],
    options: { kind: 'visual', slug: SLUG, advisory: true, json: true, suppressExitCode: true },
    logger: makeLogger()
  });
  assert.equal(owned.evidence, `.aioson/context/features/${SLUG}/visual-evidence.json`);
  const evidence = JSON.parse(await fs.readFile(visualEvidencePath(dir, SLUG), 'utf8'));
  assert.equal(evidence.kind, 'visual');
  assert.equal(evidence.slug, SLUG);
  assert.ok(evidence.measured_at);

  // An ad-hoc --dir run over the implementation overwrites the shared latest
  // slot, as audit:code does — the feature's evidence is untouched.
  await writeFile(dir, 'src/app.css', '.a { padding: 8px; margin: 8px; gap: 8px; color: #111; background: #fff; border: 1px solid #eee; border-radius: 8px; font-size: 14px; line-height: 1.5; fill: #111; }');
  const adHoc = await runVerifyArtifact({
    args: [dir],
    options: { kind: 'visual', dir: 'src', advisory: true, json: true, suppressExitCode: true },
    logger: makeLogger()
  });
  assert.equal(adHoc.evidence, undefined);
  const latest = JSON.parse(await fs.readFile(path.join(dir, '.aioson', 'context', 'verify-artifact-visual.json'), 'utf8'));
  assert.equal(latest.slug, null);
  const stillOwned = JSON.parse(await fs.readFile(visualEvidencePath(dir, SLUG), 'utf8'));
  assert.equal(stillOwned.slug, SLUG);

  const block = visualEvidenceBlock(dir, SLUG);
  assert.equal(block.measured, true);
  assert.equal(block.stale, false);
  assert.match(block.summary, /craft \d\/4 \| materials \d\/7 \| tells \d+ \| accent ~\d+° on dark/);
  assert.match(formatVisualEvidence(block), /^visual evidence: craft/);
});

test('the evidence block names an unmeasured prototype and a prototype edited after its measurement', async () => {
  const dir = await featureWithPrototype();
  const unmeasured = visualEvidenceBlock(dir, SLUG);
  assert.equal(unmeasured.measured, false);
  assert.match(unmeasured.reason, new RegExp(`--kind=visual --slug=${SLUG}`));
  assert.equal(visualEvidenceBlock(dir, 'no-such-feature'), null, 'no prototype, no block — absence is a state');

  await runVerifyArtifact({
    args: [dir],
    options: { kind: 'visual', slug: SLUG, advisory: true, json: true, suppressExitCode: true },
    logger: makeLogger()
  });
  const proto = path.join(dir, '.aioson', 'briefings', SLUG, 'prototype.html');
  await fs.appendFile(proto, '\n<!-- changed after measurement -->\n', 'utf8');
  const stale = visualEvidenceBlock(dir, SLUG);
  assert.equal(stale.measured, true);
  assert.equal(stale.stale, true);
  assert.deepEqual(stale.stale_files, [`.aioson/briefings/${SLUG}/prototype.html`]);
  assert.match(formatVisualEvidence(stale), /STALE: visual inputs changed after this measurement/);
});

test('content-addressed evidence follows local CSS assets, including root-relative urls', async () => {
  const dir = await featureWithPrototype();
  const owned = `.aioson/briefings/${SLUG}`;
  await writeFile(dir, `${owned}/assets/theme.css`, '.hero { background-image: url("/visual-assets/catalog-hero.svg"); }\n');
  await writeFile(dir, 'visual-assets/catalog-hero.svg', '<svg xmlns="http://www.w3.org/2000/svg"><rect width="10" height="10" fill="red"/></svg>\n');
  const prototype = path.join(dir, owned, 'prototype.html');
  await fs.appendFile(prototype, '\n<link rel="stylesheet" href="assets/theme.css">\n', 'utf8');

  await runVerifyArtifact({
    args: [dir],
    options: { kind: 'visual', slug: SLUG, advisory: true, json: true, suppressExitCode: true },
    logger: makeLogger()
  });
  await writeFile(dir, 'visual-assets/catalog-hero.svg', '<svg xmlns="http://www.w3.org/2000/svg"><circle cx="5" cy="5" r="5" fill="blue"/></svg>\n');

  const stale = visualEvidenceBlock(dir, SLUG);
  assert.equal(stale.stale, true);
  assert.ok(stale.stale_files.includes('visual-assets/catalog-hero.svg'), stale.stale_files.join(', '));
});

test('feature:trace carries the visual block to QA; feature:close records it at closure', async () => {
  const dir = await featureWithPrototype();
  await writeFile(dir, `.aioson/context/prd-${SLUG}.md`, `---\nfeature: ${SLUG}\nclassification: SMALL\n---\n# Catalog\n\n## Acceptance Criteria\n\n| AC | CAP | Behavior | Evidence |\n|---|---|---|---|\n| AC-01 | CAP-01 | opens | test |\n`);

  const before = await runFeatureTrace({ args: [dir], options: { feature: SLUG, json: true }, logger: makeLogger() });
  assert.equal(before.ok, true, JSON.stringify(before));
  assert.equal(before.visual.measured, false);
  assert.match(before.visual.reason, /never measured/);

  await runVerifyArtifact({
    args: [dir],
    options: { kind: 'visual', slug: SLUG, advisory: true, json: true, suppressExitCode: true },
    logger: makeLogger()
  });
  const after = await runFeatureTrace({ args: [dir], options: { feature: SLUG, json: true }, logger: makeLogger() });
  assert.equal(after.visual.measured, true);
  assert.match(after.visual.summary, /tells \d+/);

  const human = makeLogger();
  await runFeatureTrace({ args: [dir], options: { feature: SLUG }, logger: human });
  assert.ok(human.lines.some((l) => /visual evidence: craft/.test(l)), human.lines.join('\n'));

  // feature:close --preflight: the same line rides the closure report, advisory.
  const preflight = await runFeatureClose({
    args: [dir],
    options: { json: true, feature: SLUG, verdict: 'PASS', preflight: true },
    logger: makeLogger()
  });
  assert.ok(preflight.notes.some((n) => /^visual evidence: craft/.test(n)), JSON.stringify(preflight.notes));
  assert.equal(preflight.blockers.some((b) => /visual/i.test(b.gate)), false, 'visual evidence never blocks');
});

// ── the ambition the feature wrote down is a floor, not a mood ──────────────
// The craft floor is generic: it asks whether a surface carries motion at all,
// never whether it carries the motion THIS brief promised. A landing page whose
// recorded request was "premium animation and effects" — signature piece named,
// promise marked required — shipped with three keyframes and no ambient
// surface, and every gate stayed green because the generic floor was satisfied.

const HOVER_ONLY_PROTOTYPE = `<!doctype html><html><head><style>
:root { --s2: 8px; --s3: 12px; --fg: #f4efe7; --bg: #0d1017; --line: rgba(244,239,231,.12); --accent: #c8a24a; }
body { background: var(--bg); color: var(--fg); font-family: Georgia, serif; }
h1 { font-size: 4rem; }
.btn { padding: var(--s2); transition: opacity .2s ease; }
.btn:hover { opacity: .85; } .btn:focus-visible { outline: 2px solid var(--accent); }
${Array.from({ length: 40 }, (_, i) => `.f${i} { padding: var(--s2); margin: var(--s3); color: var(--fg); background: var(--bg); border-bottom: 1px solid var(--line); transition: color .2s ease; }`).join('\n')}
</style></head><body><main><h1>Assessoria</h1><button class="btn">Falar com um especialista</button></main></body></html>`;

const AMBIENT_PROTOTYPE = HOVER_ONLY_PROTOTYPE.replace('</style>', `
@keyframes drift { 0% { background-position: 0% 50%; } 100% { background-position: 100% 50%; } }
.aurora { background: linear-gradient(120deg, #12203a, #3a1240, #12203a); background-size: 300% 300%; animation: drift 20s ease-in-out infinite; }
@media (prefers-reduced-motion: reduce) { .aurora { animation: none; } }
</style>`).replace('<main>', '<main class="aurora">');

async function ambitionFixture(prototype, briefing) {
  const dir = await makeTmpDir('aioson-motion-ambition-');
  const slug = 'landing';
  await writeFile(dir, '.aioson/context/project.context.md', '---\nclassification: "SMALL"\n---\n# C\n');
  await writeFile(dir, `.aioson/briefings/${slug}/prototype.html`, prototype);
  await writeFile(dir, `.aioson/briefings/${slug}/prototype-manifest.md`, `---\nfeature: ${slug}\nstatus: approved\n---\n\n## Visual direction\n- register: editorial\n`);
  await writeFile(dir, `.aioson/briefings/${slug}/briefings.md`, briefing);
  const report = await runVerifyArtifact({
    args: [dir],
    options: { kind: 'visual', slug, advisory: true, json: true, suppressExitCode: true, 'no-persist': true, noPersist: true },
    logger: { log() {}, error() {} }
  });
  await fs.rm(dir, { recursive: true, force: true });
  return report;
}

const PREMIUM_BRIEF = `# Briefing\n\n> "quero uma landpage bem bonita e premium, com animação e com efeitos"\n\n`
  + `## Motion e efeitos\n\n- Uma peça-assinatura no hero: gradiente com grain animado em canvas.\n`
  + `- Micro-interações discretas, text reveals e uma animação de entrada por seção.\n`
  + `- prefers-reduced-motion desliga a animação sem esconder conteúdo.\n`;

test('a signature moving surface named in the sources and absent from the delivery is a named gap, not a green gate', async () => {
  await withTempRegistry(async () => {
    const report = await ambitionFixture(HOVER_ONLY_PROTOTYPE, PREMIUM_BRIEF);
    const ambition = report.metrics.motion_ambition;
    assert.ok(ambition, 'the sources ask for motion, so the comparison must run');
    assert.equal(ambition.signature_asked, true);
    assert.equal(ambition.met, false);
    assert.equal(ambition.delivered.signature, false);
    assert.ok(
      report.warnings.some((w) => /motion ambition unanswered: the recorded sources name a signature moving surface/.test(w)),
      report.warnings.join('\n')
    );
    // Advisory: a gap between two written-down things never refuses the stage.
    assert.equal(report.issues.some((i) => /motion/i.test(i)), false);
  });
});

test('the same brief answered by an ambient backdrop reports the ambition met and says nothing', async () => {
  await withTempRegistry(async () => {
    const report = await ambitionFixture(AMBIENT_PROTOTYPE, PREMIUM_BRIEF);
    assert.equal(report.metrics.motion_ambition.met, true);
    assert.deepEqual(report.metrics.motion_ambition.delivered.signature_kinds, ['animated backdrop']);
    assert.equal(report.warnings.some((w) => /motion ambition unanswered/.test(w)), false, report.warnings.join('\n'));
  });
});

test('a brief that never asks for motion is owed no motion — the check stays silent', async () => {
  await withTempRegistry(async () => {
    const quiet = '# Briefing\n\n## Escopo\n\nUma página institucional sóbria, com contato e prova social.\n';
    const report = await ambitionFixture(HOVER_ONLY_PROTOTYPE, quiet);
    assert.equal(report.metrics.motion_ambition, undefined, 'no ambition recorded, no comparison');
    assert.equal(report.warnings.some((w) => /motion ambition/.test(w)), false, report.warnings.join('\n'));
  });
});
