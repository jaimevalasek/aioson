'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { parseArgv } = require('../src/parser');
const { MANAGED_FILES } = require('../src/constants');
const { validateJudgmentSpec } = require('../src/lib/jev-judgment');
const {
  PROFILES,
  analyzeSourcePatterns,
  buildReviewSpec,
  redactText
} = require('../src/lib/jev-review');
const { detectInterfaceTarget, runJevReview } = require('../src/commands/jev-review');

async function fixture({ broken = false } = {}) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'aioson-jev-review-'));
  await fs.mkdir(path.join(dir, 'src'), { recursive: true });
  await fs.writeFile(path.join(dir, 'index.html'), `<!doctype html>
<html lang="en"><head><link rel="stylesheet" href="src/style.css"></head>
<body><header><nav><a href="#main">Home</a></nav></header><main id="main"><h1>Private atelier</h1><button>Request access</button></main><footer>Studio</footer><script src="src/app.js"></script>${broken ? '<script>alert("done")</script>' : ''}</body></html>`);
  await fs.writeFile(path.join(dir, 'src/style.css'), `
:root { --ink:#171512; --paper:#f5efe6; --space:8px; }
body { color:var(--ink); background:var(--paper); margin:0; font-family:serif; }
main { display:grid; min-height:100vh; place-items:center; padding:calc(var(--space) * 4); }
h1 { font-size:clamp(3rem, 8vw, 7rem); line-height:.9; }
button { padding:var(--space); border:1px solid currentColor; background:transparent; }
button:hover { transform:translateY(-1px); }
button:focus-visible { outline:2px solid currentColor; }
@media (max-width: 48rem) { main { padding:calc(var(--space) * 2); } }
@media (prefers-reduced-motion: reduce) { * { animation:none !important; } }
`);
  await fs.writeFile(path.join(dir, 'src/app.js'), broken
    ? 'document.querySelector("button").addEventListener("click", () => alert("done"));'
    : 'document.querySelector("button").addEventListener("click", async () => { await fetch("/request"); });');
  await fs.writeFile(path.join(dir, 'aioson-models.json'), JSON.stringify({
    providers: { openrouter: { api_key: 'YOUR_OPENROUTER_API_KEY' } },
    jev: { enabled: true, route: 'openrouter' }
  }));
  return dir;
}

function response(answers) {
  return {
    ok: true,
    status: 200,
    headers: { get: () => null },
    json: async () => ({
      id: 'review-1',
      model: 'typesafe/jev-1.13',
      provider: 'TypeSafe',
      usage: { input_tokens: 100, output_tokens: 20 },
      answers
    })
  };
}

test('source analyzer identifies HTML, CSS, layout, and JavaScript signals without sharing source by default', () => {
  const sources = {
    html: '<html lang="en"><main><h1>Title</h1><img src="x"><button style="color:red">Go</button></main></html>',
    css: ':root{--space:8px}.grid{display:grid;padding:var(--space)}@media(max-width: 800px){.grid{display:flex}}',
    components: 'document.querySelector("button").addEventListener("click", () => fetch("/api"));',
    files: ['index.html', 'style.css', 'app.js'],
    entry: 'index.html',
    corpus: { documents: 1, stylesheets: 1, components: 1, files_total: 3, truncated: 0 }
  };
  const out = analyzeSourcePatterns(sources);
  assert.equal(out.html.landmarks.main, 1);
  assert.equal(out.html.images_without_alt_signal, 1);
  assert.equal(out.css.grid_declarations, 1);
  assert.equal(out.css.media_queries, 1);
  assert.equal(out.javascript.event_listeners, 1);
  assert.equal(out.javascript.network_calls, 1);
  assert.equal(out.source_policy.raw_source_included, false);
  assert.equal(out.excerpts, undefined);
});

test('source excerpts require explicit inclusion and redact common secret shapes', () => {
  const syntheticSecret = ['sk-', 'super-secret-value-123456'].join('');
  const value = `const api_key = "${syntheticSecret}"; Authorization: Bearer abcdefghijklmnopqrstuvwxyz`;
  const redacted = redactText(value);
  assert.equal(redacted.includes('sk-super-secret'), false);
  assert.equal(redacted.includes('abcdefghijklmnopqrstuvwxyz'), false);
  const out = analyzeSourcePatterns({ html: '', css: '', components: value, corpus: {}, files: [] }, { includeSource: true });
  assert.equal(out.source_policy.raw_source_included, true);
  assert.match(out.excerpts.javascript, /secret removed/);
});

test('every review profile builds a valid Jev judgment contract', () => {
  for (const profile of PROFILES) {
    const spec = buildReviewSpec({ profile, intent: 'A complete interface', evidence: { deterministic: {}, patterns: {} } });
    const validation = validateJudgmentSpec(spec);
    assert.equal(validation.ok, true, `${profile}: ${validation.errors.join('; ')}`);
  }
});

test('score questions honor the TypeSafe limit of ten ordered levels', () => {
  const result = validateJudgmentSpec({
    state: 'x',
    questions: { too_many: { type: 'score', instructions: 'rate', criteria: Array.from({ length: 11 }, (_, index) => `level-${index}`) } }
  });
  assert.equal(result.ok, false);
  assert.match(result.errors.join('\n'), /2 to 10 ordered levels/);
});

test('review command auto-detects an interface and can collect evidence without an API key', async () => {
  const dir = await fixture();
  assert.deepEqual(detectInterfaceTarget(dir), { file: null, dir: '.', detected: true });
  const result = await runJevReview({
    args: [dir],
    options: { profile: 'premium', 'evidence-only': true, json: true, out: 'review.json' },
    logger: { log() {}, error() {} },
    env: {}
  });
  assert.equal(result.ok, true);
  assert.equal(result.status, 'evidence');
  assert.equal(result.evidence.patterns.html.headings.h1, 1);
  assert.equal(result.evidence.patterns.css.grid_declarations, 1);
  assert.equal(result.evidence.patterns.javascript.event_listeners, 1);
  assert.equal(result.evidence.patterns.source_policy.raw_source_included, false);
  assert.equal(JSON.parse(await fs.readFile(path.join(dir, 'review.json'), 'utf8')).profile, 'premium');
});

test('review dry-run validates the generated request without calling Jev', async () => {
  const dir = await fixture();
  let called = false;
  const result = await runJevReview({
    args: [dir],
    options: { profile: 'qa', file: 'index.html', 'dry-run': true, json: true },
    logger: { log() {}, error() {} },
    env: {},
    fetchImpl: async () => { called = true; }
  });
  assert.equal(result.ok, true);
  assert.equal(result.status, 'dry_run');
  assert.equal(result.config_status, 'invalid');
  assert.equal(called, false);
  assert.equal(validateJudgmentSpec(result.spec).ok, true);
});

test('review combines deterministic evidence with Jev instead of allowing semantic pass to erase defects', async () => {
  const dir = await fixture({ broken: true });
  const result = await runJevReview({
    args: [dir],
    options: { profile: 'qa', dir: '.', 'require-pass': true, json: true },
    logger: { log() {}, error() {} },
    env: { OPENROUTER_API_KEY: 'runtime-secret' },
    fetchImpl: async () => response({
      implementation_ready: { type: 'noul', noul: 0.95 },
      delivered_quality: { type: 'score', score: 2.8, confidence: 0.9, probabilities: { 0: 0, 1: 0.05, 2: 0.1, 3: 0.85 } }
    })
  });
  assert.equal(result.ok, true);
  assert.equal(result.semantic.passed, true);
  assert.equal(result.deterministic.verdict, 'fail');
  assert.equal(result.passed, false);
  assert.equal(result.action, 'fix_deterministic_findings');
  assert.equal(result.exitCode, 2);
  assert.equal(JSON.stringify(result).includes('runtime-secret'), false);
});

test('parser keeps review privacy and evidence flags from swallowing the project path', () => {
  const parsed = parseArgv(['node', 'aioson', 'jev:review', '--include-source', '--evidence-only', '.']);
  assert.equal(parsed.options['include-source'], true);
  assert.equal(parsed.options['evidence-only'], true);
  assert.deepEqual(parsed.args, ['.']);
});

test('the routed QA/Refiner protocol ships as a managed project document', async () => {
  const rel = '.aioson/docs/jev-review.md';
  assert.equal(MANAGED_FILES.includes(rel), true);
  const workspace = await fs.readFile(path.resolve(rel), 'utf8');
  const template = await fs.readFile(path.resolve('template', rel), 'utf8');
  assert.equal(workspace, template);
  assert.match(workspace, /## QA route/);
  assert.match(workspace, /## Refiner route/);
});
