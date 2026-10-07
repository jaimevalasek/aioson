'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const { analyzeVisualSources, maxCardNesting, emDashProse } = require('../src/lib/visual-telemetry');
const { runVerifyArtifact, availableKinds } = require('../src/commands/verify-artifact');
const { runPrototypeCheck } = require('../src/commands/prototype-check');

// Full-surface fixtures below are craft-measured, the tier that records
// palette fingerprints. Nesting the registry path under a FILE makes both
// read and write fail silently (best-effort by design), so these tests never
// touch the operator's registry and never warn about each other's palettes.
process.env.AIOSON_DESIGN_REGISTRY = path.join(__filename, 'no-registry', 'design-fingerprints.json');

function makeLogger() {
  const lines = [];
  return { log: (m = '') => lines.push(String(m)), error: (m = '') => lines.push(String(m)), warn: () => {}, lines };
}

async function makeTmpDir() {
  return fs.mkdtemp(path.join(os.tmpdir(), 'aioson-visual-'));
}

async function writeFile(dir, relPath, content) {
  const full = path.join(dir, relPath);
  await fs.mkdir(path.dirname(full), { recursive: true });
  await fs.writeFile(full, content, 'utf8');
}

// A surface carrying every marker the telemetry is built to catch: a decorative
// blob, motion with no reduced-motion branch, cards three deep, zero tokens,
// off-grid rhythm, three depth strategies, four font families, no states.
const SLOP = `<!doctype html><html><head><style>
.blob { position: absolute; border-radius: 50%; filter: blur(80px); background: linear-gradient(135deg,#7c3aed,#4f46e5); }
.hero { padding: 37px; margin: 13px; background: #0b1015; color: #f3f7fb; font-family: Inter, sans-serif; }
.card { padding: 17px; border: 1px solid #222; box-shadow: 0 2px 9px rgba(0,0,0,.4); border-radius: 11px; }
.inner { padding: 9px; border: 1px solid #333; box-shadow: 0 1px 3px #000; }
.deep { padding: 6px; border: 1px solid #444; box-shadow: 0 1px 2px #111; }
.glass { backdrop-filter: blur(12px); border: 1px solid #555; box-shadow: 0 8px 30px #000; }
.g2 { backdrop-filter: blur(6px); } .g3 { filter: blur(2px); }
.t1 { font-family: Georgia, serif; } .t2 { font-family: "Space Mono", monospace; } .t3 { font-family: Manrope; }
.fade { animation: fadeIn .3s ease; } @keyframes fadeIn { to { opacity: 1; } }
</style></head><body>
<div class="blob"></div><div class="glass g2 g3"><p class="t1">One</p><p class="t2">Two</p><p class="t3 fade">Three</p></div>
<section class="hero"><h1>Transform your workflow</h1><button>Get started</button></section>
<div class="card"><div class="inner card"><div class="deep card">nested</div></div></div>
</body></html>`;

// The same surface built with a system: tokens, 4px rhythm, one depth strategy,
// one family, reduced-motion honored, every material state expressed.
const CLEAN = `<!doctype html><html><head><style>
:root { --space-2: 8px; --space-3: 12px; --radius: 8px; --fg: #101418; --border: rgba(0,0,0,.08); }
.shell { padding: var(--space-3); color: var(--fg); font-family: "IBM Plex Sans", system-ui; }
.row { gap: var(--space-2); padding: var(--space-2); border-bottom: 1px solid var(--border); }
.panel { padding: var(--space-3); border: 1px solid var(--border); border-radius: var(--radius); }
.btn { padding: var(--space-2); border-radius: var(--radius); background: var(--fg); color: #fff; }
.btn:disabled { opacity: .5; } .btn:focus-visible { outline: 2px solid var(--fg); }
.is-loading { opacity: .6; } .empty-state { padding: var(--space-3); } .error-state { color: #b00020; }
.fade { animation: rise .2s ease; } @keyframes rise { to { opacity: 1; } }
@media (prefers-reduced-motion: reduce) { .fade { animation: none; } }
</style></head><body>
<main class="shell panel fade"><p class="is-loading" hidden>Loading</p><p class="empty-state" hidden>No rows</p><p class="error-state" hidden>Error</p><div class="row"><button class="btn">Aprovar pedido</button></div>
<table><tr><td>PED-4471</td></tr></table></main>
</body></html>`;

test('the telemetry separates a systemless surface from a systematic one', () => {
  const slop = analyzeVisualSources({ html: SLOP });
  const clean = analyzeVisualSources({ html: CLEAN });

  assert.equal(slop.applicable, true);
  assert.equal(clean.applicable, true);

  // The whole value of the gate is this asymmetry. A clean surface must produce
  // nothing at all — a linter that also fires on good work gets switched off.
  assert.deepEqual(clean.issues, []);
  assert.deepEqual(clean.warnings, []);

  assert.equal(slop.issues.length, 3);
  assert.match(slop.issues.join('\n'), /decorative blob/);
  assert.match(slop.issues.join('\n'), /prefers-reduced-motion/);
  assert.match(slop.issues.join('\n'), /nested 3 deep/);
  assert.ok(slop.warnings.length >= 4);
});

test('token adherence and spacing rhythm are arithmetic, not opinion', () => {
  const slop = analyzeVisualSources({ html: SLOP }).metrics;
  const clean = analyzeVisualSources({ html: CLEAN }).metrics;

  assert.equal(slop.token_adherence_pct, 0);
  assert.equal(slop.tokenized_values, 0);
  assert.ok(slop.spacing_off_grid >= 5);
  assert.deepEqual(slop.depth_strategies, ['borders', 'shadows', 'blur']);
  assert.equal(slop.font_families.length, 4);
  assert.equal(slop.reduced_motion_handled, false);
  assert.deepEqual(slop.states_missing, ['loading', 'empty', 'error', 'disabled', 'focus']);

  assert.ok(clean.token_adherence_pct >= 80);
  assert.equal(clean.spacing_off_grid, 0);
  assert.deepEqual(clean.states_missing, []);
  assert.equal(clean.reduced_motion_handled, true);
});

test('a blob needs all three properties — a rounded avatar is not a finding', () => {
  const rounded = `<style>
  .avatar { border-radius: 50%; width: 40px; height: 40px; background: #ccc; }
  .sticky { position: absolute; top: 8px; right: 8px; padding: 4px; color: #333; }
  .soft { filter: blur(2px); opacity: .8; margin: 8px; border: 1px solid #eee; }
  .x { padding: 8px; } .y { gap: 8px; } .z { color: #111; }
  </style><div class="avatar"></div>`;
  const result = analyzeVisualSources({ html: rounded });
  assert.equal(result.applicable, true);
  assert.equal(result.issues.filter((i) => /decorative blob/.test(i)).length, 0);
});

test('a modest radius is a soft glow, not a blob — the blocking tier stays precise', () => {
  // All three blob properties co-occur, but the radius is 9px: this is a glow
  // panel behind a card, and flagging it would be a false positive in the tier
  // that is supposed to be provable from the text alone.
  const glow = `<style>
  .glow { position: absolute; border-radius: 9px; filter: blur(40px); background: #7c3aed; inset: 0; }
  .a { padding: 8px; } .b { gap: 16px; } .c { color: #111; } .d { margin: 4px; }
  .e { font-size: 14px; } .f { border-radius: 8px; } .g { background: #fff; }
  </style><div class="glow"></div>`;
  const result = analyzeVisualSources({ html: glow });
  assert.equal(result.applicable, true);
  assert.equal(result.issues.filter((i) => /decorative blob/.test(i)).length, 0);

  // The pill idiom and an explicit circle still are blobs.
  for (const radius of ['999px', '9999px', '50%']) {
    const blob = glow.replace('border-radius: 9px', `border-radius: ${radius}`);
    const flagged = analyzeVisualSources({ html: blob });
    assert.equal(
      flagged.issues.filter((i) => /decorative blob/.test(i)).length,
      1,
      `border-radius: ${radius} should still read as a decorative blob`
    );
  }
});

test('state markers are recognized in the authoring language, not only in English', () => {
  const ptBr = `<style>
  .carregando { opacity: .5; padding: 8px; }
  .vazio { color: #666; margin: 16px; }
  .erro { color: #b00; padding: 4px; }
  button:disabled { opacity: .4; }
  button:focus { outline: 2px solid #333; }
  .a { gap: 8px; } .b { font-size: 14px; } .c { background: #fff; }
  </style><form><button class="carregando">Salvar</button><p class="vazio" hidden>Sem dados</p><p class="erro" hidden>Falhou</p></form>`;
  const result = analyzeVisualSources({ html: ptBr });
  assert.equal(result.applicable, true);
  assert.equal(result.metrics.interactive_surface, true);
  assert.deepEqual(
    result.metrics.states_missing,
    [],
    'pt-BR markup must not report states as absent purely because they were not named in English'
  );
});

test('utility-class markup reports not-applicable instead of inventing a verdict', () => {
  const tailwindish = '<div class="flex items-center gap-4 rounded-xl bg-slate-900 p-6 text-sm">ok</div>';
  const result = analyzeVisualSources({ html: tailwindish });
  assert.equal(result.applicable, false);
  assert.match(result.reason, /out of scope/i);
  assert.deepEqual(result.issues, []);
});

// Every interaction contract violated at once: native dialogs, a bare CPF/phone
// field, a delete button with no dialog machinery, a click-only kanban, and a
// management shell with no widget in sight. Word "modal" must not appear.
const INTERACTION_SLOP = `<!doctype html><html><head><style>
:root { --s: 8px; --fg: #111; } .shell { padding: var(--s); color: var(--fg); }
.board { gap: var(--s); } .column { padding: var(--s); } .item { padding: var(--s); }
.field { margin: var(--s); } .btn { padding: var(--s); } .top { gap: var(--s); }
.a { font-size: 14px; } .b { background: #fff; } .c { border-radius: 8px; }
</style></head><body class="dashboard shell">
<form><input type="text" name="cpf" placeholder="CPF"><input type="text" id="telefone"></form>
<div class="kanban board"><div class="column">A Fazer</div><div class="column">Feito</div></div>
<button class="btn" onclick="if(confirm('Excluir?')) alert('ok')">Excluir cliente</button>
</body></html>`;

// The same surfaces honoring the contracts: semantic inputs, a <dialog> confirm,
// draggable kanban items, KPI widgets. A custom \`ui.confirm()\` is not native.
const INTERACTION_CLEAN = `<!doctype html><html><head><style>
:root { --s: 8px; --fg: #111; } .shell { padding: var(--s); color: var(--fg); }
.board { gap: var(--s); } .column { padding: var(--s); } .widget { padding: var(--s); }
.kpi { margin: var(--s); } .btn { padding: var(--s); } .top { gap: var(--s); }
.a { font-size: 14px; } .b { background: #fff; } .c { border-radius: 8px; }
</style></head><body class="dashboard shell">
<section class="widget kpi">Pedidos hoje: 12 (+8%)</section>
<form><input type="text" name="cpf" inputmode="numeric" maxlength="14" placeholder="CPF">
<input type="tel" id="telefone"></form>
<div class="kanban board"><div class="column"><div class="item" draggable="true">PED-1</div></div></div>
<button class="btn" data-action="excluir">Excluir cliente</button>
<dialog id="confirm-excluir"><p>Excluir cliente?</p></dialog>
<script>function abrir(){ ui.confirm('Excluir cliente?'); } document.addEventListener('dragstart', abrir);</script>
</body></html>`;

test('interaction contracts: every violation is measured, native dialogs are the blocking tier', () => {
  const result = analyzeVisualSources({ html: INTERACTION_SLOP });
  assert.equal(result.applicable, true);

  assert.deepEqual(result.metrics.native_dialog_calls.sort(), ['alert', 'confirm']);
  assert.match(result.issues.join('\n'), /native browser dialog call/);

  assert.equal(result.metrics.structured_inputs_without_semantics.length, 2);
  assert.match(result.warnings.join('\n'), /structured field\(s\) with no input semantics/);
  assert.match(result.warnings.join('\n'), /destructive control\(s\) with no dialog machinery/);
  assert.match(result.warnings.join('\n'), /kanban\/pipeline surface with no drag-and-drop markers/);
  assert.match(result.warnings.join('\n'), /management surface with no widget\/KPI\/chart markers/);
});

test('interaction contracts: a conforming surface and a custom confirm() method stay silent', () => {
  const result = analyzeVisualSources({ html: INTERACTION_CLEAN });
  assert.equal(result.applicable, true);

  // ui.confirm() is a design-system method, not window.confirm — the blocking
  // tier must not fire on it, and none of the four contract warnings apply.
  assert.deepEqual(result.metrics.native_dialog_calls, []);
  assert.deepEqual(result.issues, []);
  assert.deepEqual(
    result.warnings.filter((w) => /input semantics|dialog machinery|drag-and-drop markers|widget\/KPI/.test(w)),
    []
  );
});

test('HTML comments never count as measurement — a rationale header is not the surface', () => {
  // Real case: a prototype's design-rationale header said "not admin density"
  // and that lone word read as a management surface. Commented-out markup is
  // not the artifact — every lexical scan runs on comment-free markup.
  const commented = `<!--
    Design rationale: public-facing form, not admin density, no dashboard chrome.
    <button onclick="if(confirm('Excluir?')) alert('ok')">Excluir cliente</button>
    <input type="text" name="cpf" placeholder="CPF">
    kanban board with a column per stage
  -->
  <style>
  :root { --s: 8px; --fg: #111; } .shell { padding: var(--s); color: var(--fg); }
  .field { margin: var(--s); } .btn { padding: var(--s); } .top { gap: var(--s); }
  .a { font-size: 14px; } .b { background: #fff; } .c { border-radius: 8px; }
  .d { padding: var(--s); } .e { gap: var(--s); } .f { color: var(--fg); }
  </style>
  <form><input type="tel" id="telefone" maxlength="15"></form>`;
  const result = analyzeVisualSources({ html: commented });
  assert.equal(result.applicable, true);

  assert.equal(result.metrics.management_surface, false);
  assert.equal(result.metrics.kanban_surface, false);
  assert.equal(result.metrics.destructive_controls, 0);
  assert.deepEqual(result.metrics.native_dialog_calls, []);
  assert.deepEqual(result.metrics.structured_inputs_without_semantics, []);
  assert.deepEqual(result.issues, []);
  assert.deepEqual(
    result.warnings.filter((w) => /management surface|kanban|dialog machinery|input semantics|native/.test(w)),
    []
  );
});

test('commented-out JS never fires the native-dialog blocking tier', () => {
  // The blocking tier promises near-zero false positives: a commented-out
  // confirm()/alert() is not a call. Line comments, block comments, and the
  // URL edge (`https://` is not a comment) are all covered.
  const commentedJs = `<style>
  :root { --s: 8px; --fg: #111; } .shell { padding: var(--s); color: var(--fg); }
  .a { font-size: 14px; } .b { background: #fff; } .c { border-radius: 8px; }
  .d { margin: var(--s); } .e { gap: var(--s); } .f { color: var(--fg); }
  .g { padding: var(--s); } .h { gap: var(--s); }
  </style>
  <button id="go">Enviar</button>
  <script>
  // if (confirm('Excluir?')) alert('ok')
  /* prompt('nome?') */
  const docs = 'https://example.com/confirm(guide)';
  document.getElementById('go').addEventListener('click', () => ui.confirm('Enviar?'));
  </script>`;
  const result = analyzeVisualSources({ html: commentedJs });
  assert.equal(result.applicable, true);
  assert.deepEqual(result.metrics.native_dialog_calls, []);
  assert.deepEqual(result.issues, []);

  // A real call on a line that also carries a comment still fires.
  const realCall = commentedJs.replace(
    "// if (confirm('Excluir?')) alert('ok')",
    "window.confirm('Excluir?'); // pending design-system modal"
  );
  const flagged = analyzeVisualSources({ html: realCall });
  assert.deepEqual(flagged.metrics.native_dialog_calls, ['confirm']);
});

test('card nesting counts containers, not every wrapper div', () => {
  assert.equal(maxCardNesting('<div class="card"><div class="row"><div class="card">x</div></div></div>'), 2);
  assert.equal(maxCardNesting('<div class="card">a</div><div class="card">b</div>'), 1);
  assert.equal(maxCardNesting('<div class="wrapper"><section class="content">x</section></div>'), 0);
  // A self-closing or void element must never leave the stack unbalanced.
  assert.equal(maxCardNesting('<div class="card"><img src="a.png"><br/></div><div class="card">b</div>'), 1);
});

test('verify:artifact exposes kind=visual and measures a file locator', async () => {
  assert.ok(availableKinds().includes('visual'));

  const dir = await makeTmpDir();
  await writeFile(dir, 'ui/screen.html', SLOP);
  const report = await runVerifyArtifact({
    args: [dir],
    options: { kind: 'visual', file: 'ui/screen.html', json: true, advisory: true, suppressExitCode: true },
    logger: makeLogger()
  });

  assert.equal(report.kind, 'visual');
  assert.equal(report.ok, false);
  assert.equal(report.blocking, false, 'advisory must never block');
  assert.equal(report.issues.length, 3);
  assert.ok(report.metrics, 'the measurement must reach the caller');
  assert.equal(report.metrics.token_adherence_pct, 0);
  assert.deepEqual(report.metrics.files, ['ui/screen.html']);
});

const DIRECTION_MANIFEST = `---\nfeature: orders\nstatus: draft\n---\n\n## Visual direction\n\n- Register: Technical — the data is the composition.\n- Thesis: order exceptions form the spine of the workspace, with decisions attached in-place.\n- Anti-goals: uniform card grid, pill topbar.\n- Composition signature: one continuous exception rail cuts through the table and opens evidence in place.\n`;

test('kind=visual resolves the feature-owned prototype from --slug, and says so when it cannot', async () => {
  const dir = await makeTmpDir();
  await writeFile(dir, '.aioson/briefings/orders/prototype.html', CLEAN);
  await writeFile(dir, '.aioson/briefings/orders/prototype-manifest.md', DIRECTION_MANIFEST);

  const found = await runVerifyArtifact({
    args: [dir],
    options: { kind: 'visual', slug: 'orders', json: true, suppressExitCode: true },
    logger: makeLogger()
  });
  assert.equal(found.ok, true);
  assert.deepEqual(found.issues, []);
  assert.equal(found.metrics.files[0], '.aioson/briefings/orders/prototype.html');
  assert.equal(found.metrics.manifest_visual_direction, true);

  const missing = await runVerifyArtifact({
    args: [dir],
    options: { kind: 'visual', slug: 'nope', json: true, suppressExitCode: true },
    logger: makeLogger()
  });
  assert.equal(missing.ok, false);
  assert.match(missing.issues[0], /--file=<path>, --dir=<front-end root>, or --slug=/);
});

test('slug mode demands the manifest and its filled ## Visual direction — file/dir modes do not', async () => {
  const dir = await makeTmpDir();
  await writeFile(dir, '.aioson/briefings/orders/prototype.html', CLEAN);

  // No manifest at all: the pair is the artifact.
  const noManifest = await runVerifyArtifact({
    args: [dir],
    options: { kind: 'visual', slug: 'orders', json: true, advisory: true, suppressExitCode: true },
    logger: makeLogger()
  });
  assert.equal(noManifest.ok, false);
  assert.match(noManifest.issues.join('\n'), /prototype-manifest\.md not found/);

  // A manifest whose Visual direction is missing or empty: the composition was
  // never decided in writing — the identity re-skin gap.
  await writeFile(dir, '.aioson/briefings/orders/prototype-manifest.md', '---\nfeature: orders\n---\n\n## Visual direction\n\n## Quality evidence\n- ok\n');
  const emptyDirection = await runVerifyArtifact({
    args: [dir],
    options: { kind: 'visual', slug: 'orders', json: true, advisory: true, suppressExitCode: true },
    logger: makeLogger()
  });
  assert.equal(emptyDirection.ok, false);
  assert.match(emptyDirection.issues.join('\n'), /no filled `## Visual direction`/);

  // File mode points anywhere — no manifest expectation.
  const fileMode = await runVerifyArtifact({
    args: [dir],
    options: { kind: 'visual', file: '.aioson/briefings/orders/prototype.html', json: true, suppressExitCode: true },
    logger: makeLogger()
  });
  assert.deepEqual(fileMode.issues, []);
});

test('emoji-as-icon, uniform card walls, and prototype affordance markers are measured', () => {
  // Emoji standing in for icons — the classic tell no check used to see.
  const emojiUi = CLEAN.replace('Aprovar pedido', '📎 Anexar 👁 Ver');
  const emoji = analyzeVisualSources({ html: emojiUi });
  assert.deepEqual(emoji.metrics.emoji_glyphs.sort(), ['👁', '📎']);
  assert.match(emoji.warnings.join('\n'), /emoji glyph\(s\) in the UI corpus/);
  // Deliberate typography dingbats stay silent.
  const check = analyzeVisualSources({ html: CLEAN.replace('Aprovar pedido', '✓ Aprovado ★') });
  assert.deepEqual(check.metrics.emoji_glyphs, []);

  // Eight identical sibling cards are a wall; seven stay a metric.
  const cards = (n) => `<main>${Array.from({ length: n }, () => '<div class="card">x</div>').join('')}</main>`;
  const wall = analyzeVisualSources({ html: CLEAN.replace('<main class="shell panel fade">', `${cards(8)}<main class="shell panel fade">`) });
  assert.equal(wall.metrics.max_card_sibling_run, 8);
  assert.match(wall.warnings.join('\n'), /uniform card wall/);
  const short = analyzeVisualSources({ html: CLEAN.replace('<main class="shell panel fade">', `${cards(7)}<main class="shell panel fade">`) });
  assert.equal(short.metrics.max_card_sibling_run, 7);
  assert.doesNotMatch(short.warnings.join('\n'), /uniform card wall/);

  // Affordance markers are only expected of an AIOSON prototype (data-aioson-id).
  const bare = analyzeVisualSources({ html: CLEAN });
  assert.equal(bare.metrics.prototype_anchors, false);
  assert.doesNotMatch(bare.warnings.join('\n'), /data-aioson-primary|data-aioson-tour/);

  const prototype = analyzeVisualSources({ html: CLEAN.replace('<main class="shell panel fade">', '<main class="shell" data-aioson-id="shell">') });
  assert.equal(prototype.metrics.prototype_anchors, true);
  assert.match(prototype.warnings.join('\n'), /no `data-aioson-primary` marker/);
  assert.match(prototype.warnings.join('\n'), /no first-open explainer \(`data-aioson-tour`\)/);

  const complete = analyzeVisualSources({
    html: CLEAN.replace(
      '<main class="shell panel fade">',
      '<main class="shell" data-aioson-id="shell" data-aioson-primary><div data-aioson-tour="1">Passo 1</div>'
    )
  });
  assert.doesNotMatch(complete.warnings.join('\n'), /data-aioson-primary|data-aioson-tour/);
});

test('em-dash cadence: copy and seed strings are counted; CSS, comments, and code punctuation are not', () => {
  const html = `<!doctype html><html><head><style>
  /* Tokens — brand section */ .a { color: #fff; }
  </style></head><body>
  <!-- layout — rationale note -->
  <p>Deck vazio — sem resgates</p>
  <input placeholder="Ex.: Live #44 — Perguntas">
  <script>
  // comment — not copy
  const url = 'https://x.test/a—b';
  const seed = [{ t: 'Abertura — o que é' }, { n: 'Falar devagar — é o coração' }];
  </script></body></html>`;
  const { count, samples } = emDashProse(html);
  assert.equal(count, 4, 'two markup instances plus two seed strings; CSS/HTML/JS comments and the unspaced URL stay out');
  assert.equal(samples.length, 3);
  assert.match(samples[0], /Deck vazio — sem resgates/);
});

test('em-dash cadence: the corpus threshold warns on saturation and stays silent on deliberate use', () => {
  const withCopy = (copy) => CLEAN.replace('Aprovar pedido', copy);

  // Three spaced em dashes: legitimate typographic territory — no warning.
  const deliberate = analyzeVisualSources({ html: withCopy('a — b</button><p>c — d</p><p>e — f</p><button>ok') });
  assert.equal(deliberate.metrics.em_dash_prose, 3);
  assert.doesNotMatch(deliberate.warnings.join('\n'), /em dash/);

  // Four and up: the scattered-microcopy saturation the sentence-level rule
  // can never see, reported with samples so the rewrite is directed.
  const saturated = analyzeVisualSources({ html: withCopy('a — b</button><p>c — d</p><p>e — f</p><p>g — h</p><button>ok') });
  assert.equal(saturated.metrics.em_dash_prose, 4);
  assert.match(saturated.warnings.join('\n'), /4 spaced em dash\(es\) across UI copy and mock content/);
  assert.match(saturated.warnings.join('\n'), /model-writing tell/);
});

test('kind=visual scans a front-end directory and skips vendored trees', async () => {
  const dir = await makeTmpDir();
  await writeFile(dir, 'site/index.html', CLEAN);
  await writeFile(dir, 'site/node_modules/pkg/evil.css', '.x { padding: 7px; margin: 3px; }');

  const report = await runVerifyArtifact({
    args: [dir],
    options: { kind: 'visual', dir: 'site', json: true, suppressExitCode: true },
    logger: makeLogger()
  });

  assert.equal(report.ok, true);
  assert.deepEqual(report.metrics.files, ['site/index.html']);
});

// ─── prototype:check integration ─────────────────────────────────────────────

const SLUG = 'kanban';
const PRD = `---
feature: ${SLUG}
prototype: .aioson/briefings/${SLUG}/prototype.html
prototype_status: current
prototype_feature: ${SLUG}
---

# Kanban

## Prototype reference
- status: current
- feature: ${SLUG}
- prototype: .aioson/briefings/${SLUG}/prototype.html
- manifest: .aioson/briefings/${SLUG}/prototype-manifest.md

## Acceptance Criteria
AC-01: add card persists and re-renders.
`;
const MANIFEST = `---\nfeature: ${SLUG}\nstatus: approved\n---\n\n# Prototype manifest\n\n## Core interactions\n- \`add card\` — adds a card to a list\n`;

async function protoProject(prototypeHtml) {
  const dir = await makeTmpDir();
  await writeFile(dir, `.aioson/context/prd-${SLUG}.md`, PRD);
  await writeFile(dir, `.aioson/briefings/${SLUG}/prototype.html`, prototypeHtml);
  await writeFile(dir, `.aioson/briefings/${SLUG}/prototype-manifest.md`, MANIFEST);
  return dir;
}

test('prototype:check reports visual telemetry without touching its verdict', async () => {
  const slopDir = await protoProject(SLOP);
  const cleanDir = await protoProject(CLEAN);

  const slop = await runPrototypeCheck({ args: [slopDir], options: { json: true, feature: SLUG }, logger: makeLogger() });
  const clean = await runPrototypeCheck({ args: [cleanDir], options: { json: true, feature: SLUG }, logger: makeLogger() });

  // Same binding, same coverage, same verdict — the telemetry is advisory.
  assert.equal(slop.ok, true);
  assert.equal(slop.status, 'ok');
  assert.equal(clean.ok, true);
  assert.equal(clean.status, 'ok');

  assert.ok(slop.visual, 'telemetry must ride along with the resolved prototype');
  assert.equal(slop.visual.applicable, true);
  assert.equal(slop.visual.file, `.aioson/briefings/${SLUG}/prototype.html`);
  assert.equal(slop.visual.issues.length, 3);
  assert.deepEqual(clean.visual.issues, []);
});

test('prototype:check prints the telemetry line in human output', async () => {
  const dir = await protoProject(SLOP);
  const logger = makeLogger();
  await runPrototypeCheck({ args: [dir], options: { feature: SLUG }, logger });

  const out = logger.lines.join('\n');
  assert.match(out, /Visual telemetry \(advisory\)/);
  assert.match(out, /tokens 0%/);
  assert.match(out, /decorative blob/);
});

test('the telemetry is reachable from both ends of the visual lifecycle', async () => {
  const ROOT = path.resolve(__dirname, '..');
  // Routed docs, not agent kernels: both kernels are at their density budget, and
  // a non-visual feature must never pay context for a gate it will not run.
  const surfaces = [
    '.aioson/docs/briefing/prototype-and-delegation.md', // measurable the moment the prototype exists
    '.aioson/docs/dev/visual-implementation.md'          // and again over the implemented front-end
  ];

  for (const relativePath of surfaces) {
    const [template, workspace] = await Promise.all([
      fs.readFile(path.join(ROOT, 'template', relativePath), 'utf8'),
      fs.readFile(path.join(ROOT, relativePath), 'utf8')
    ]);
    assert.equal(workspace, template, `template/workspace drift: ${relativePath}`);
    assert.match(template, /verify:artifact \. --kind=visual/, `${relativePath} never runs the measurement`);
    assert.match(template, /--advisory/, `${relativePath} must not turn telemetry into a hard gate`);
  }
});

test('a strict binding failure still runs without telemetry when no prototype resolves', async () => {
  const dir = await makeTmpDir();
  await writeFile(dir, `.aioson/context/prd-${SLUG}.md`, `---\nfeature: ${SLUG}\nprototype: null\nprototype_status: none\nprototype_feature: null\n---\n\n# Kanban\n`);
  const r = await runPrototypeCheck({ args: [dir], options: { json: true, feature: SLUG }, logger: makeLogger() });

  assert.equal(r.ok, true);
  assert.equal(r.status, 'not_applicable');
  assert.equal(r.visual, undefined);
});

// ─── craft floor (measured ambition) ─────────────────────────────────────────

const { fontSizePx, resolveCustomProps, customProperties } = require('../src/lib/visual-telemetry');

// A full surface (>= 150 declarations) with PERFECT hygiene and ZERO ambition:
// tokenized values, on-grid rhythm, every state marked — and OS-default
// typography, small type, no material, no motion, no imagery. This is the
// measured shape of the "default document" that used to pass with (no issues).
function flatHygienicSurface({ fontTokens = '', headStyles = '', extraHead = '', body = '' } = {}) {
  const filler = Array.from({ length: 40 }, (_, i) =>
    `.f${i} { padding: var(--s2); margin: var(--s3); color: var(--fg); background: var(--bg); }`
  ).join('\n');
  return `<!doctype html><html><head>${extraHead}<style>
  :root { --s2: 8px; --s3: 12px; --fg: #1a1a1a; --bg: #ffffff; --border: rgba(0,0,0,.1); ${fontTokens} }
  body { font-family: Georgia, serif; font-size: 16px; color: var(--fg); background: var(--bg); }
  h1 { font-size: 32px; }
  .btn { padding: var(--s2); transition: opacity .2s; }
  .btn:disabled { opacity: .5; } .btn:focus-visible { outline: 2px solid var(--fg); }
  .carregando { opacity: .6; } .vazio { color: var(--fg); } .erro { color: #b00020; }
  ${headStyles}
  ${filler}
  </style></head><body>
  <main class="hero"><h1>Consultório</h1><button class="btn">Agendar conversa</button>${body}</main>
  </body></html>`;
}

test('a full hygienic surface with zero ambition fires the craft floor and the typography ceiling', () => {
  const result = analyzeVisualSources({ html: flatHygienicSurface() });
  assert.equal(result.applicable, true);
  assert.deepEqual(result.issues, []);

  const m = result.metrics;
  assert.ok(m.declarations >= 150, `fixture must be a full surface (got ${m.declarations})`);
  assert.equal(m.craft.measured, true);
  assert.equal(m.font_delivery.delivered, false);
  assert.deepEqual(m.font_families, ['georgia']);
  assert.equal(m.max_font_size_px, 32);
  assert.equal(m.craft.active_levers, 0);

  const text = result.warnings.join('\n');
  assert.match(text, /typography never leaves the OS default stacks \(georgia\)/);
  assert.match(text, /craft floor: 0\/5 premium levers active/);
  assert.match(text, /display-scale type \(largest font-size 32px, floor 56px\)/);
  assert.match(text, /verified evidence imagery \(0 verified, 0 awaiting runtime verification\)/);

  // The dated-dialect tell: flexbox/grid/custom-properties only, none of the
  // current platform vocabulary anywhere in a full surface.
  assert.deepEqual(m.craft.modern_css, []);
  assert.match(text, /modern CSS breadth 0\/7 capabilities/);
});

test('a family named without any delivery mechanism is its own finding, resolved through var()', () => {
  const result = analyzeVisualSources({
    html: flatHygienicSurface({
      fontTokens: '--font-display: "Marlow Display", Georgia, serif;',
      headStyles: 'h1 { font-family: var(--font-display); }'
    })
  });
  // var() resolution is what makes the metric see the token system at all —
  // this exact shape used to report font_families: [].
  assert.ok(result.metrics.font_families.includes('marlow display'));
  assert.deepEqual(result.metrics.font_delivery.undelivered_families, ['marlow display']);
  const text = result.warnings.join('\n');
  assert.match(text, /font families named but never delivered \(marlow display\)/);
  assert.doesNotMatch(text, /never leaves the OS default stacks/);
});

test('an ambitious surface activates the levers and stays silent — the gate must not cry wolf', () => {
  const html = flatHygienicSurface({
    extraHead: '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Fictional+Display:wght@400;700&display=swap">',
    fontTokens: '--font-display: "Fictional Display", Georgia, serif;',
    headStyles: `
      h1 { font-family: var(--font-display); font-size: clamp(2.5rem, 8vw, 6rem); }
      .hero { background: radial-gradient(circle at 20% 0%, rgba(20,40,80,.4), transparent), linear-gradient(180deg, #0b0d12, #141821); }
      .hero::after { content: ''; background-image: url("data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg'><filter id='n'><feTurbulence baseFrequency='0.8'/></filter></svg>"); opacity: .05; }
    `,
    body: `<img src="data:image/svg+xml,%3Csvg%3E%3C/svg%3E" alt="Vitrine do produto" width="800" height="500">
      <script>const io = new IntersectionObserver(() => {}); io.observe(document.body);</script>`
  });
  const result = analyzeVisualSources({ html });
  assert.deepEqual(result.issues, []);

  const m = result.metrics;
  assert.equal(m.font_delivery.delivered, true);
  assert.equal(m.font_delivery.webfont_linked, true);
  assert.equal(m.max_font_size_px, 96, 'clamp() is judged at its max arm (6rem)');
  assert.equal(m.craft.active_levers, 5);
  assert.deepEqual(m.craft.levers, { typeface: true, display_scale: true, material: true, motion: true, evidence: true });

  const text = result.warnings.join('\n');
  assert.doesNotMatch(text, /craft floor|never delivered|OS default stacks/);

  // clamp() and the scroll-reveal idiom put it in the current dialect — the
  // dated-vocabulary warning must stay out.
  assert.ok(m.craft.modern_css.includes('fluid clamp() type'));
  assert.ok(m.craft.modern_css.includes('scroll-driven reveals'));
  assert.doesNotMatch(text, /pre-2020 CSS/);
});

test('the page ground is what body paints in the base theme — not the most-frequent component background, not a theme override', () => {
  // A green logo/chip family outnumbers the body rule by declaration count,
  // and a [data-theme] block later in the sheet redefines the ground tokens.
  // Both used to poison the fingerprint: frequency picked the chip color,
  // last-write-wins resolution picked the toggle theme.
  const chips = Array.from({ length: 12 }, (_, i) => `.chip-${i} { background: #297d1a; color: #ffffff; }`).join('\n');
  const html = `<!doctype html><html><head><style>
  :root { --bg: oklch(18.5% 0.028 315); --fg: #eeeaf2; }
  [data-theme="light"] { --bg: oklch(96.5% 0.008 315); --fg: #1d1626; }
  .logo { background: #297d1a; }
  ${chips}
  body { background: var(--bg); color: var(--fg); }
  </style></head><body><main><h1>Painel</h1><span class="logo">Logo</span>${Array.from({ length: 12 }, (_, i) => `<span class="chip-${i}">State</span>`).join('')}</main></body></html>`;
  const m = analyzeVisualSources({ html }).metrics;
  assert.equal(m.palette.ground.pole, 'dark');
  assert.equal(m.palette.ground.h, 315);
  assert.ok(Math.abs(m.palette.accent_hue - 141) <= 3, `accent stays the chip green family (got ${m.palette.accent_hue})`);
});

test('a full surface whose material rests on gradients and blur alone draws the shallow-material warning; a layered system stays silent', () => {
  const shallow = analyzeVisualSources({ html: flatHygienicSurface({
    headStyles: `
      .hero { background: linear-gradient(180deg, #0b0d12, #141821), radial-gradient(circle at 20% 0%, #1a1e2a, transparent); }
      .top { backdrop-filter: blur(12px); }
    `, body: '<div class="top">Navigation</div>'
  }) });
  assert.equal(shallow.metrics.craft.levers.material, true);
  assert.equal(shallow.metrics.craft.material_depth, 2);
  assert.match(shallow.warnings.join('\n'), /shallow material system: .*finish depth 2\/7/);

  const deep = analyzeVisualSources({ html: flatHygienicSurface({
    headStyles: `
      .hero { background: linear-gradient(180deg, #0b0d12, #141821), radial-gradient(circle at 20% 0%, #1a1e2a, transparent); }
      .card { box-shadow: 0 1px 0 rgba(255,255,255,.7) inset, 0 8px 24px -14px rgba(0,0,0,.3); }
      .pop { box-shadow: 0 4px 10px -2px rgba(0,0,0,.12), 0 22px 48px -24px rgba(0,0,0,.45); }
      .veil::after { content: ''; background-image: url("data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg'><filter id='n'><feTurbulence baseFrequency='0.8'/></filter></svg>"); }
    `, body: '<div class="card">Card</div><div class="pop">Panel</div><div class="veil">Material</div>'
  }) });
  assert.ok(deep.metrics.craft.material_depth >= 4, `deep fixture depth (got ${deep.metrics.craft.material_depth})`);
  assert.doesNotMatch(deep.warnings.join('\n'), /shallow material system/);
});

test('effect tokens and keyframes that no rule applies are named — decorating the stylesheet is not craft', () => {
  const result = analyzeVisualSources({ html: flatHygienicSurface({
    headStyles: `
      :root { --glow-wash: radial-gradient(circle, #223344, transparent); --shadow-lift: 0 4px 10px rgba(0,0,0,.2), 0 22px 48px rgba(0,0,0,.4); }
      @keyframes float-up { from { transform: translateY(8px); } to { transform: none; } }
    `
  }) });
  assert.deepEqual(result.metrics.craft.unapplied_effects, ['--glow-wash', '--shadow-lift', '@keyframes float-up']);
  assert.match(result.warnings.join('\n'), /declared finish never applied: --glow-wash, --shadow-lift, @keyframes float-up/);

  const wired = analyzeVisualSources({ html: flatHygienicSurface({
    headStyles: `
      :root { --glow-wash: radial-gradient(circle, #223344, transparent); }
      .hero { background: var(--glow-wash); animation: float-up 6s ease infinite; }
      @keyframes float-up { from { transform: translateY(8px); } to { transform: none; } }
    `
  }) });
  assert.deepEqual(wired.metrics.craft.unapplied_effects, []);
  assert.doesNotMatch(wired.warnings.join('\n'), /declared finish never applied/);
});

test('the craft axis only measures full surfaces — fixtures and fragments stay silent', () => {
  const clean = analyzeVisualSources({ html: CLEAN });
  assert.equal(clean.metrics.craft.measured, false);
  // CLEAN names "IBM Plex Sans" with no delivery; on a fragment that is not a
  // finding, which is exactly why the floor is gated on corpus size.
  assert.deepEqual(clean.warnings, []);
});

test('the palette fingerprint reads the shipped hue family through var()', () => {
  // Dark teal ground painted by the last bare body rule (the cascade: a later
  // unscoped body wins over the fixture's white base), one coral accent family.
  const dark = analyzeVisualSources({
    html: flatHygienicSurface({
      headStyles: `
        body { background: #0e2a2e; color: #eef4f2; }
        .cta { background: #ff6b4a; color: #ffffff; }
        .cta:hover { background: #e85f41; }
        .link { color: #ff6b4a; }
        .badge { border-color: #ff6b4a; color: #ff6b4a; }
      `, body: '<a class="cta link" href="#contact">Contact</a><span class="badge">Open</span>'
    })
  });
  const palette = dark.metrics.palette;
  assert.equal(palette.ground.pole, 'dark', `ground ${JSON.stringify(palette.ground)}`);
  assert.equal(palette.ground.hex, '#0e2a2e');
  assert.ok(palette.accent_hue >= 20 && palette.accent_hue <= 50, `coral accent family, got ${palette.accent_hue}°`);
  assert.ok(palette.color_literals > 8, 'live var()-resolved uses are counted, not just literal sites');
  assert.ok(palette.hue_clusters >= 1);

  // The default fixture ships a white ground — pole flips with the surface.
  const light = analyzeVisualSources({ html: flatHygienicSurface() });
  assert.equal(light.metrics.palette.ground.pole, 'light');
});

test('font-size and custom-property resolution helpers are arithmetic', () => {
  assert.equal(fontSizePx('clamp(1rem, 2vw + 1rem, 4.5rem)'), 72);
  assert.equal(fontSizePx('2.25rem'), 36);
  assert.equal(fontSizePx('18px'), 18);
  assert.equal(fontSizePx('inherit'), null);
  const props = customProperties(':root { --a: var(--b); --b: 24px; }');
  assert.equal(resolveCustomProps('var(--a)', props), '24px');
  assert.equal(resolveCustomProps('var(--missing, 8px)', props), '8px');
});

test('kind=visual warns when the manifest Quality evidence is a placeholder', async () => {
  const dir = await makeTmpDir();
  await writeFile(dir, '.aioson/briefings/orders/prototype.html', CLEAN);
  const manifest = (evidence) => `---\nfeature: orders\nstatus: draft\n---\n\n## Visual direction\n\n- Register: Technical — the data is the composition.\n- Thesis: order exceptions form the spine of the workspace and keep decisions close to evidence.\n- Anti-goals: uniform card grid, generic gradient hero.\n- Composition signature: one continuous exception rail cuts through the data and opens evidence in place.\n\n## Quality evidence\n\n${evidence}\n`;

  await writeFile(dir, '.aioson/briefings/orders/prototype-manifest.md', manifest('_(preenchido após a medição)_'));
  const placeholder = await runVerifyArtifact({
    args: [dir],
    options: { kind: 'visual', slug: 'orders', json: true, advisory: true, suppressExitCode: true },
    logger: makeLogger()
  });
  assert.equal(placeholder.ok, true, 'placeholder evidence is a warning, not a blocker');
  assert.match(placeholder.warnings.join('\n'), /`## Quality evidence` is empty or a placeholder/);

  await writeFile(dir, '.aioson/briefings/orders/prototype-manifest.md', manifest(
    '- verdict: pass\n- evidence: .aioson/context/features/orders/visual-evidence.json\n- craft: 4/5\n- runtime: measured in desktop and mobile\n- routes: 0'
  ));
  const filled = await runVerifyArtifact({
    args: [dir],
    options: { kind: 'visual', slug: 'orders', json: true, advisory: true, suppressExitCode: true },
    logger: makeLogger()
  });
  assert.doesNotMatch(filled.warnings.join('\n'), /Quality evidence/);
  assert.equal(filled.metrics.manifest_quality_evidence, true);
});

test('an intent-first build that misses the craft floor is pointed at the identity route', async () => {
  const dir = await makeTmpDir();
  const manifest = (identity) => `---\nfeature: orders\nstatus: draft\nidentity: ${identity}\n---\n\n## Visual direction\n\n- Register: Editorial — plates and figure numbers carry the argument.\n\n## Quality evidence\n\n- kind=visual measured, findings recorded below with their numbers and dispositions\n`;

  // Full flat surface (craft floor fires) + identity: none → the gate names
  // the reference-identity-extract route instead of letting the next round
  // re-roll intent-first origination or a preset menu.
  await writeFile(dir, '.aioson/briefings/orders/prototype.html', flatHygienicSurface());
  await writeFile(dir, '.aioson/briefings/orders/prototype-manifest.md', manifest('none'));
  const intentFirst = await runVerifyArtifact({
    args: [dir],
    options: { kind: 'visual', slug: 'orders', json: true, advisory: true, suppressExitCode: true },
    logger: makeLogger()
  });
  assert.match(intentFirst.warnings.join('\n'), /reference-identity-extract/);
  assert.equal(intentFirst.metrics.manifest_identity, 'none');

  // Same miss but an identity record was consumed → the route pointer stays
  // out; the craft warnings themselves still stand on their own.
  await writeFile(dir, '.aioson/briefings/orders/prototype-manifest.md', manifest('.aioson/briefings/orders/identity.md'));
  const withIdentity = await runVerifyArtifact({
    args: [dir],
    options: { kind: 'visual', slug: 'orders', json: true, advisory: true, suppressExitCode: true },
    logger: makeLogger()
  });
  assert.doesNotMatch(withIdentity.warnings.join('\n'), /reference-identity-extract/);
  assert.match(withIdentity.warnings.join('\n'), /craft floor/);
});

// ── generation tells ─────────────────────────────────────────────────────────

test('the generation tells fire on the saturated defaults, each with its counter-move', () => {
  const html = `<!doctype html><html><head><style>
  :root { --font-display: 'Playfair Display', serif; --accent: #7c3aed; }
  h1 { font-family: var(--font-display); font-size: 64px; background: linear-gradient(90deg, #7c3aed, #22d3ee); -webkit-background-clip: text; }
  .eyebrow { text-transform: uppercase; letter-spacing: .14em; font-size: 12px; color: var(--accent); }
  .card { border-left: 4px solid var(--accent); padding: 16px; }
  .halo { box-shadow: 0 0 24px #22d3ee; }
  .brutal { box-shadow: 6px 6px 0 #111111; }
  .springy { transition: transform .4s cubic-bezier(.5, 1.8, .4, .9); }
  .legal { font-size: 10px; color: #777777; }
  </style></head><body>
  <p class="eyebrow">Nossa plataforma</p><h1>Streamline seu fluxo</h1><div class="card halo brutal springy"><p class="legal">Terms</p></div>
  <p>Enterprise-grade por design. It's not just a tool. It's a platform.</p>
  <p>Não é só um painel. É seu copiloto.</p>
  <div class="icon"><svg></svg></div><h3>Rápido</h3>
  <div class="icon"><svg></svg></div><h3>Seguro</h3>
  <div class="icon"><svg></svg></div><h3>Escalável</h3>
  </body></html>`;
  const result = analyzeVisualSources({ html });
  const t = result.metrics.tells;
  assert.equal(t.gradient_text, 1);
  assert.equal(t.colored_side_border, 1);
  assert.equal(t.kicker_above_heading, 1);
  assert.equal(t.icon_tile_stack, 3);
  assert.equal(t.chromatic_glow, 1);
  assert.equal(t.block_shadow, 1);
  assert.deepEqual(t.saturated_display_faces, ['playfair display']);
  assert.equal(t.bounce_easing, 1);
  assert.equal(t.tiny_text, 1);
  assert.ok(t.buzzwords >= 2, `buzzwords ${t.buzzwords}`);
  assert.ok(t.negation_pivots >= 2, `negation pivots ${t.negation_pivots}`);
  assert.equal(t.active, 11);

  const text = result.warnings.join('\n');
  assert.match(text, /generation tell: .*gradient-text/);
  assert.match(text, /generation tell: .*colored side border/);
  assert.match(text, /No brief earns this one back/);
  assert.match(text, /universal generated feature-card template/);
  assert.match(text, /zero-offset chromatic glow/);
  assert.match(text, /hard-offset block shadow/);
  assert.match(text, /saturated display face in the display role \(playfair display\)/);
  assert.match(text, /bounce\/elastic easing/);
  assert.match(text, /under 11px/);
  assert.match(text, /copy tell: .*marketing buzzword/);
  assert.match(text, /copy tell: .*negation pivot/);
});

test('the same devices used deliberately stay silent — exemptions are the design contexts', () => {
  const html = `<!doctype html><html><head><style>
  blockquote { border-left: 3px solid #7c3aed; padding-left: 16px; }
  .tab.active { border-left: 3px solid #7c3aed; }
  .card { box-shadow: 0 8px 24px rgba(0,0,0,.35); }
  .btn:focus-visible { box-shadow: 0 0 12px #7c3aed; }
  .reveal { transition: transform .3s cubic-bezier(.2, .8, .2, 1); }
  .meta { font-size: 12px; letter-spacing: .05em; }
  h1 { font-family: 'Boska', serif; font-size: 72px; }
  .note { padding: 8px; } .row { gap: 8px; } .x { margin: 4px; }
  </style></head><body>
  <h1>Atelier</h1><blockquote>Uma citação real do cliente.</blockquote>
  <p>O painel aprova pedidos em duas etapas e nomeia cada erro.</p>
  </body></html>`;
  const result = analyzeVisualSources({ html });
  const t = result.metrics.tells;
  assert.equal(t.active, 0, `expected zero tells, got ${JSON.stringify(t)}`);
  assert.doesNotMatch(result.warnings.join('\n'), /generation tell|copy tell/);
});

test('an untouched browser chrome is named on full surfaces; one themed surface clears it', () => {
  // flatHygienicSurface ships :focus-visible, so build a bare full surface.
  const filler = Array.from({ length: 40 }, (_, i) =>
    `.g${i} { padding: 8px; margin: 12px; color: #1a1a1a; background: #ffffff; }`
  ).join('\n');
  const bare = `<!doctype html><html><head><style>
  body { font-family: Georgia, serif; font-size: 16px; }
  ${filler}
  </style></head><body><main><h1>Painel</h1></main></body></html>`;
  const untouched = analyzeVisualSources({ html: bare });
  assert.equal(untouched.metrics.craft.measured, true);
  assert.equal(untouched.metrics.craft.browser_surfaces.count, 0);
  assert.match(untouched.warnings.join('\n'), /browser chrome never themed/);

  const themed = analyzeVisualSources({ html: bare.replace('</style>', `
  ::selection { background: #1a1a1a; color: #ffffff; }
  h1 { font-variant-numeric: tabular-nums; }
  </style>`) });
  assert.equal(themed.metrics.craft.browser_surfaces.count, 2);
  assert.deepEqual(themed.metrics.craft.browser_surfaces.present, ['::selection', 'tabular numerals']);
  assert.doesNotMatch(themed.warnings.join('\n'), /browser chrome never themed/);

  // Fragments are never held to it.
  const fragment = analyzeVisualSources({ html: CLEAN });
  assert.doesNotMatch(fragment.warnings.join('\n'), /browser chrome/);
});

test('the tells count reaches the verdict line', async () => {
  const dir = await makeTmpDir();
  const html = `<style>
  .hero h1 { font-family: 'Space Grotesk', sans-serif; font-size: 56px; }
  .k { text-transform: uppercase; letter-spacing: .12em; font-size: 11px; }
  .a { padding: 8px; } .b { margin: 4px; } .c { color: #111; } .d { gap: 8px; }
  .e { padding: 12px; } .f { margin: 8px; } .g { color: #222; } .h { gap: 4px; }
  </style><div class="hero"><p class="k">Plataforma</p><h1>Título</h1></div>`;
  await writeFile(dir, 'page.html', html);
  const logger = makeLogger();
  await runVerifyArtifact({
    args: [dir],
    options: { kind: 'visual', file: path.join(dir, 'page.html'), advisory: true, suppressExitCode: true },
    logger
  });
  const out = logger.lines.join('\n');
  assert.match(out, /\| tells 2\b/, `verdict line missing tells count:\n${out}`);
});

// ── regressions caught by the post-wave audit ────────────────────────────────

test('finish declared and applied in an EXTERNAL stylesheet is live, not dead — the --dir shape', () => {
  // HTML only links the sheet; every token, keyframe and scroll-driven reveal
  // lives in styles.css. Reading the markup alone reported all of it unapplied
  // and the dev doctrine then said "wire it or delete it" about live finish.
  const html = `<!doctype html><html><head><link rel="stylesheet" href="styles.css"></head>
  <body><main><h1>Consultório</h1><section class="card">Agenda</section></main></body></html>`;
  const filler = Array.from({ length: 60 }, (_, i) => `.f${i} { padding: var(--s2); margin: var(--s3); color: var(--fg); background: var(--bg); }`).join('\n');
  const css = `
    :root { --s2: 8px; --s3: 12px; --fg: #1a1a1a; --bg: #ffffff; --shadow-card: 0 4px 10px rgba(0,0,0,.2), 0 22px 48px rgba(0,0,0,.4); --wash-accent: radial-gradient(circle, #223344, transparent); }
    @keyframes rise { from { transform: translateY(8px); } to { transform: none; } }
    body { font-family: Georgia, serif; background: var(--bg); color: var(--fg); }
    .card { box-shadow: var(--shadow-card); background: var(--wash-accent); animation: rise .6s ease-out; animation-timeline: view(); }
    ${filler}`;
  const external = analyzeVisualSources({ html, css });
  assert.equal(external.metrics.craft.measured, true, 'fixture must be a full surface');
  assert.deepEqual(external.metrics.craft.unapplied_effects, []);
  assert.doesNotMatch(external.warnings.join('\n'), /declared finish never applied/);
  assert.ok(external.metrics.craft.modern_css.includes('scroll-driven reveals'), `scroll reveal in external CSS lights the lever: ${external.metrics.craft.modern_css}`);

  // The identical corpus inlined measures the same — the locator shape is not a variable.
  const inline = analyzeVisualSources({ html: html.replace('<link rel="stylesheet" href="styles.css">', `<style>${css}</style>`) });
  assert.deepEqual(inline.metrics.craft.unapplied_effects, external.metrics.craft.unapplied_effects);
});

test('font-size arithmetic evaluates calc() instead of reading its first px addend', () => {
  assert.equal(fontSizePx('calc(1rem + 2px)'), 18);
  assert.equal(fontSizePx('calc(0.875rem + 1px)'), 15);
  assert.equal(fontSizePx('calc(2rem - 2px)'), 30);
  assert.equal(fontSizePx('clamp(2rem, 1rem + 4vw, calc(3rem + 8px))'), 56);

  // Two ordinary sizes written as calc() are not "tiny text", and a calc()
  // display size reaches the display-scale lever.
  const result = analyzeVisualSources({ html: flatHygienicSurface({
    headStyles: `.lede { font-size: calc(1rem + 2px); } .small { font-size: calc(0.875rem + 1px); } h1 { font-size: calc(3.5rem + 4px); }`
  }) });
  assert.equal(result.metrics.tells.tiny_text, 0, JSON.stringify(result.metrics.tells));
  assert.equal(result.metrics.max_font_size_px, 60);
});

test('uppercase-tracked nav links and buttons near a heading are not kickers; a label that closes right before it is', () => {
  const controls = `<!doctype html><html><head><style>
  .nav-link { text-transform: uppercase; letter-spacing: .12em; font-size: 12px; }
  .btn { text-transform: uppercase; letter-spacing: .1em; font-size: 13px; }
  .cat { text-transform: uppercase; letter-spacing: .14em; font-size: 12px; }
  h1 { font-family: 'Boska', serif; font-size: 72px; }
  </style></head><body>
  <nav><a class="nav-link" href="#">Início</a><a class="nav-link" href="#">Agenda</a><a class="nav-link" href="#">Contato</a></nav>
  <header><h1>Atelier</h1></header>
  <section><p>Texto.</p><button class="btn">Agendar</button></section>
  <section><h2>Serviços</h2></section>
  </body></html>`;
  assert.equal(analyzeVisualSources({ html: controls }).metrics.tells.kicker_above_heading, 0);

  const label = controls.replace('<section><h2>Serviços</h2>', '<section><p class="cat">Nossos serviços</p>\n<h2>Serviços</h2>');
  assert.equal(analyzeVisualSources({ html: label }).metrics.tells.kicker_above_heading, 1);
});

test('a workhorse UI face on `.card-title` is sanctioned; the same face on the display role is the tell', () => {
  const base = (titleRule) => `<!doctype html><html><head><style>
  :root { --font-display: 'Young Serif', serif; --font-ui: Inter, system-ui, sans-serif; }
  body { font-family: var(--font-ui); }
  h1 { font-family: var(--font-display); font-size: 64px; }
  ${titleRule}
  .p1 { margin: 4px; } .p2 { margin: 8px; } .p3 { padding: 4px; } .p4 { padding: 8px; } .p5 { gap: 4px; } .p6 { gap: 8px; } .p7 { color: #222222; } .p8 { color: #333333; } .p9 { opacity: .9; } .p10 { opacity: .8; }
  </style></head><body><h1>Painel</h1><div class="card"><p class="card-title">Pedidos</p><p class="subtitle">Hoje</p></div></body></html>`;
  const sanctioned = analyzeVisualSources({ html: base('.card-title { font-family: var(--font-ui); font-size: 14px; } .subtitle { font-family: var(--font-ui); }') });
  assert.deepEqual(sanctioned.metrics.tells.saturated_display_faces, []);
  assert.equal(sanctioned.metrics.display_face, 'young serif');

  const display = analyzeVisualSources({ html: base('.hero-title { font-family: var(--font-ui); }').replace('<h1>Painel', '<h1 class="hero-title">Painel') });
  assert.deepEqual(display.metrics.tells.saturated_display_faces, ['inter']);
});

test('display_face is the face of the display role, never the first family declared', () => {
  // Body declares the UI face first; the display face arrives on h1 through
  // the largest rule. The fingerprint registry keys same_face on this value.
  const byScale = analyzeVisualSources({ html: `<!doctype html><html><head><style>
    body { font-family: 'Switzer', sans-serif; font-size: 16px; }
    h1 { font-family: 'Gambetta', serif; font-size: 56px; }
    .p1 { margin: 4px; } .p2 { margin: 8px; } .p3 { padding: 4px; } .p4 { padding: 8px; } .p5 { gap: 4px; } .p6 { gap: 8px; } .p7 { color: #222222; } .p8 { color: #333333; } .p9 { opacity: .9; } .p10 { opacity: .8; }
    </style></head><body><h1>Atelier</h1></body></html>` });
  assert.deepEqual(byScale.metrics.font_families, ['switzer', 'gambetta']);
  assert.equal(byScale.metrics.display_face, 'gambetta');

  const byToken = analyzeVisualSources({ html: `<!doctype html><html><head><style>
    :root { --font-ui: 'Switzer', sans-serif; --font-display: 'Gambetta', serif; }
    body { font-family: var(--font-ui); }
    .title { font-family: var(--font-display); }
    .p1 { margin: 4px; } .p2 { margin: 8px; } .p3 { padding: 4px; } .p4 { padding: 8px; } .p5 { gap: 4px; } .p6 { gap: 8px; } .p7 { color: #222222; } .p8 { color: #333333; } .p9 { opacity: .9; } .p10 { opacity: .8; }
    </style></head><body><h1 class="title">Atelier</h1></body></html>` });
  assert.equal(byToken.metrics.display_face, 'gambetta');

  const single = analyzeVisualSources({ html: `<!doctype html><html><head><style>
    body { font-family: Georgia, serif; } h1 { font-size: 48px; }
    .p1 { margin: 4px; } .p2 { margin: 8px; } .p3 { padding: 4px; } .p4 { padding: 8px; } .p5 { gap: 4px; } .p6 { gap: 8px; } .p7 { color: #222222; } .p8 { color: #333333; } .p9 { opacity: .9; } .p10 { opacity: .8; }
    </style></head><body><h1>Atelier</h1></body></html>` });
  assert.equal(single.metrics.display_face, null, 'a body-only family is not promoted to display');
});

test('the negation-pivot cadence counts accented pt-BR words', () => {
  const result = analyzeVisualSources({ html: `<!doctype html><html><head><style>.a { color: #111; } .p1 { margin: 4px; } .p2 { margin: 8px; } .p3 { padding: 4px; } .p4 { padding: 8px; } .p5 { gap: 4px; } .p6 { gap: 8px; } .p7 { color: #222222; } .p8 { color: #333333; } .p9 { opacity: .9; } .p10 { opacity: .8; }</style></head><body>
    <p>Não um relatório. Uma decisão.</p><p>Não uma lista. Uma rotina.</p></body></html>` });
  assert.equal(result.metrics.tells.negation_pivots, 2);
});

// ── motion: choreography, not hover ─────────────────────────────────────────
// The lever read `(keyframes >= 3 && reducedMotion) || scrollReveal ||
// transitionCount >= 12`. Every hand-written page carries a dozen hover
// transitions, so the third arm lit the lever on surfaces where nothing moved
// unless poked — a page scored full craft while delivering none of the motion
// its brief asked for. Motion is now a measured block, and a "signature"
// surface is one that moves paint on its own.

function hoverOnlySurface(extra = '', body = '') {
  const filler = Array.from({ length: 40 }, (_, i) =>
    `.h${i} { padding: var(--s2); color: var(--fg); background: var(--bg); transition: color .2s ease; }`
  ).join('\n');
  return `<!doctype html><html><head><style>
  :root { --s2: 8px; --fg: #111; --bg: #fff; }
  body { font-family: Georgia, serif; color: var(--fg); background: var(--bg); }
  ${extra}
  ${filler}
  </style></head><body><main><h1>Painel</h1>${Array.from({ length: 40 }, (_, i) => `<p class="h${i}">Row ${i}</p>`).join('')}${body}</main></body></html>`;
}

test('motion: a wall of hover transitions is state feedback, never choreography', () => {
  const m = analyzeVisualSources({ html: hoverOnlySurface() }).metrics;
  assert.ok(m.motion.transitions >= 12, `the fixture must carry the old threshold: ${m.motion.transitions}`);
  assert.equal(m.motion.keyframes, 0);
  assert.equal(m.motion.designed, false, 'transitions alone must not light the lever');
  assert.equal(m.motion.transition_only, true);
  assert.equal(m.craft.levers.motion, false);
  const text = analyzeVisualSources({ html: hoverOnlySurface() }).warnings.join('\n');
  assert.match(text, /motion is hover-only: \d+ transitions, 0 @keyframes/);
});

test('motion: an entrance system with reduced-motion is designed motion, and one badge pulse is not a signature', () => {
  const entrance = analyzeVisualSources({
    html: hoverOnlySurface(`
      @keyframes rise { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }
      @keyframes fade { from { opacity: 0; } to { opacity: 1; } }
      @keyframes slide { from { transform: translateX(-8px); } to { transform: none; } }
      .a { animation: rise .5s ease both; } .b { animation: fade .4s ease both; } .c { animation: slide .4s ease both; }
      @media (prefers-reduced-motion: reduce) { * { animation: none !important; } }
    `, '<div class="a">A</div><div class="b">B</div><div class="c">C</div>')
  }).metrics;
  assert.equal(entrance.motion.designed, true);
  assert.equal(entrance.motion.transition_only, false);
  assert.equal(entrance.motion.signature, false, 'entrance choreography is not an ambient surface');

  // One infinite pulse on a badge: `infinite` alone was never the point — the
  // keyframe has to move paint.
  const pulse = analyzeVisualSources({
    html: hoverOnlySurface(`
      @keyframes pulse { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.05); } }
      .badge { animation: pulse 2s ease-in-out infinite; }
    `, '<span class="badge">Live</span>')
  }).metrics;
  assert.equal(pulse.motion.ambient_loops, 1);
  assert.equal(pulse.motion.signature, false, 'a transform-only loop is a badge, not a backdrop');
  assert.deepEqual(pulse.motion.signature_kinds, []);
});

test('motion: an ambient backdrop, a painted surface and a scroll-driven timeline each read as a signature', () => {
  const backdrop = analyzeVisualSources({
    html: hoverOnlySurface(`
      @keyframes drift { 0% { background-position: 0% 50%; } 100% { background-position: 100% 50%; } }
      .aurora { background: linear-gradient(120deg, #12203a, #3a1240, #12203a); background-size: 300% 300%; animation: drift 18s ease-in-out infinite; }
    `, '<div class="aurora">Scene</div>')
  }).metrics;
  assert.equal(backdrop.motion.signature, true);
  assert.deepEqual(backdrop.motion.signature_kinds, ['animated backdrop']);
  assert.equal(backdrop.craft.levers.motion, true);

  const painted = analyzeVisualSources({
    html: hoverOnlySurface().replace(
      '</main>',
      `<canvas id="grain" width="800" height="600"></canvas></main><script>
        const canvas = document.querySelector('#grain');
        const context = canvas.getContext('2d');
        function paint() { context.fillRect(0, 0, 2, 2); requestAnimationFrame(paint); }
        requestAnimationFrame(paint);
      <\/script>`
    )
  }).metrics;
  assert.equal(painted.motion.signature, true);
  assert.deepEqual(painted.motion.signature_kinds, ['animated canvas/WebGL']);

  const scrolled = analyzeVisualSources({
    html: hoverOnlySurface('.reveal { animation: fade linear both; animation-timeline: view(); } @keyframes fade { from { opacity: 0; } to { opacity: 1; } }', '<section class="reveal">Next</section>')
  }).metrics;
  assert.equal(scrolled.motion.signature, true);
  assert.ok(scrolled.motion.signature_kinds.includes('scroll-driven'));
});

// ── the states a surface OWES ───────────────────────────────────────────────
// `interactive` was `<button|<input|…|addEventListener|onclick=`, all-or-
// nothing: one button made a page owe loading, empty, error and disabled. A
// marketing landing whose only controls were a motion toggle and a guided tour
// was charged for all four — no form, no request, no list, none of those states
// reachable. A gate that charges every page for states it cannot have is a gate
// people learn to scroll past.

function statesFixture(body, script = '') {
  return `<!doctype html><html><head><style>
  :root { --s: 8px; --fg: #111; --bg: #fff; }
  body { background: var(--bg); color: var(--fg); font-family: Georgia, serif; }
  :focus-visible { outline: 2px solid var(--fg); }
  ${Array.from({ length: 40 }, (_, i) => `.f${i} { padding: var(--s); color: var(--fg); background: var(--bg); }`).join('\n')}
  </style></head><body>${body}<script>${script}<\/script></body></html>`;
}

const statesWarning = (result) => result.warnings.find((w) => /no marker for/.test(w)) || null;

test('states: a surface with controls and nothing else owes a focus ring, not a workflow', () => {
  const result = analyzeVisualSources({ html: statesFixture('<main><h1>Marca</h1><button type="button">Alternar movimento</button></main>') });
  const m = result.metrics;
  assert.deepEqual(m.surface_capabilities, { focusable: true, controls: true, data_entry: false, async_work: false, collections: false });
  assert.deepEqual(m.states_owed, ['focus'], 'no form, no request, no list — none of those states exist here');
  assert.deepEqual(m.states_unmet, []);
  assert.equal(statesWarning(result), null, 'a landing page must not be charged for states it cannot reach');

  // The raw measurement is untouched: it still reports which markers are absent.
  assert.deepEqual(m.states_missing, ['loading', 'empty', 'error', 'disabled']);
  assert.equal(m.interactive_surface, true);
});

test('states: data entry and async work each make loading, error and disabled reachable', () => {
  const form = analyzeVisualSources({ html: statesFixture('<main><form><input name="email" type="email"><button type="submit">Enviar</button></form></main>') });
  assert.deepEqual(form.metrics.states_owed, ['loading', 'error', 'disabled', 'focus']);
  assert.deepEqual(form.metrics.states_unmet, ['loading', 'error', 'disabled']);
  assert.match(statesWarning(form), /no marker for: loading, error, disabled — this surface carries data entry/);

  const fetched = analyzeVisualSources({
    html: statesFixture('<main><button id="go">Carregar</button></main>', "document.querySelector('#go').addEventListener('click', () => fetch('/api'));")
  });
  assert.equal(fetched.metrics.surface_capabilities.async_work, true);
  assert.match(statesWarning(fetched), /carries async work/);
});

test('states: a rendered collection owes empty; a static nav list does not', () => {
  const table = analyzeVisualSources({ html: statesFixture('<main><table><thead><tr><th>A</th><th>B</th><th>C</th></tr></thead><tbody><tr><td>1</td></tr></tbody></table></main>') });
  assert.equal(table.metrics.surface_capabilities.collections, true);
  assert.deepEqual(table.metrics.states_owed, ['loading', 'empty']);
  assert.match(statesWarning(table), /no marker for: loading, empty — this surface carries a rendered collection/);

  // The tag alone can never be the test: every page has a nav list.
  const nav = analyzeVisualSources({ html: statesFixture('<nav><ul><li><a href="#a">Sobre</a></li><li><a href="#b">Contato</a></li></ul></nav><main><h1>Marca</h1></main>') });
  assert.equal(nav.metrics.surface_capabilities.collections, false);
  assert.deepEqual(nav.metrics.states_owed, ['focus']);
  assert.equal(statesWarning(nav), null);
});

test('states: a surface that answers everything it owes stays silent', () => {
  const complete = analyzeVisualSources({
    html: statesFixture(`<main><form><input name="q"><button type="submit" disabled>Buscar</button></form>
      <p class="is-loading">carregando</p><p class="empty-state">nenhum resultado</p><p class="error-state">falha</p></main>`)
  });
  assert.deepEqual(complete.metrics.states_unmet, []);
  assert.equal(statesWarning(complete), null);
});
