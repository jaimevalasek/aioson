'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const { analyzeVisualSources } = require('../src/lib/visual-telemetry');
const { runVerifyArtifact } = require('../src/commands/verify-artifact');

function fullSurface({ head = '', styles = '', body = '<main><h1>Atlas</h1></main>', script = '' } = {}) {
  const filler = Array.from({ length: 42 }, (_, index) =>
    `.f${index} { padding: var(--s2); margin: var(--s3); color: var(--fg); background: var(--bg); }`
  ).join('\n');
  return `<!doctype html><html><head>${head}<style>
  :root { --s2: 8px; --s3: 12px; --fg: #111; --bg: #fff; }
  body { color: var(--fg); background: var(--bg); }
  ${styles}
  ${filler}
  </style></head><body>${body}<script>${script}<\/script></body></html>`;
}

function logger() {
  return { log() {}, error() {}, warn() {} };
}

test('font delivery is family-bound: an unrelated @font-face and a preconnect never deliver the requested face', () => {
  const unrelated = analyzeVisualSources({
    html: fullSurface({
      styles: `
        @font-face { font-family: 'Unrelated Face'; src: url('./unrelated.woff2') format('woff2'); }
        body { font-family: 'Missing Brand', sans-serif; }
      `
    })
  });
  assert.equal(unrelated.metrics.font_delivery.delivered, false);
  assert.deepEqual(unrelated.metrics.font_delivery.delivered_families, []);
  assert.deepEqual(unrelated.metrics.font_delivery.undelivered_families, ['missing brand']);
  assert.equal(unrelated.metrics.craft.levers.typeface, false);

  const preconnect = analyzeVisualSources({
    html: fullSurface({
      head: '<link rel="preconnect" href="https://fonts.googleapis.com">',
      styles: "body { font-family: 'Missing Brand', sans-serif; }"
    })
  });
  assert.equal(preconnect.metrics.font_delivery.delivered, false);
  assert.equal(preconnect.metrics.font_delivery.webfont_linked, false);
});

test('font delivery accepts an exact @font-face or an exact hosted stylesheet family', () => {
  const local = analyzeVisualSources({
    html: fullSurface({
      styles: `
        @font-face { font-family: 'Atlas Display'; src: url('./atlas.woff2') format('woff2'); }
        body { font-family: 'Atlas Display', sans-serif; }
      `
    })
  });
  assert.equal(local.metrics.font_delivery.delivered, true);
  assert.deepEqual(local.metrics.font_delivery.delivered_families, ['atlas display']);

  const hosted = analyzeVisualSources({
    html: fullSurface({
      head: '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Fictional+Display:wght@400;700&display=swap">',
      styles: "body { font-family: 'Fictional Display', sans-serif; }"
    })
  });
  assert.equal(hosted.metrics.font_delivery.delivered, true);
  assert.deepEqual(hosted.metrics.font_delivery.delivered_families, ['fictional display']);
});

test('motion is application-bound: static canvas, unused keyframes and cross-wired loops stay unverified', () => {
  const staticCanvas = analyzeVisualSources({
    html: fullSurface({ body: '<main><canvas id="scene" width="800" height="600"></canvas></main>' })
  });
  assert.equal(staticCanvas.metrics.motion.signature, false);
  assert.equal(staticCanvas.metrics.motion.designed, false);
  assert.equal(staticCanvas.metrics.craft.levers.motion, false);

  const unused = analyzeVisualSources({
    html: fullSurface({
      styles: `
        @keyframes one { from { opacity: 0; } to { opacity: 1; } }
        @keyframes two { from { transform: translateX(0); } to { transform: translateX(2px); } }
        @keyframes three { from { color: red; } to { color: blue; } }
        @media (prefers-reduced-motion: reduce) {}
      `
    })
  });
  assert.equal(unused.metrics.motion.designed, false);
  assert.equal(unused.metrics.motion.applied_keyframes, 0);
  assert.equal(unused.metrics.motion.reduced_motion_effective, false);

  const crossWired = analyzeVisualSources({
    html: fullSurface({
      styles: `
        @keyframes drift { from { background-position: 0 0; } to { background-position: 100% 0; } }
        @keyframes pulse { from { transform: scale(1); } to { transform: scale(1.05); } }
        .badge { animation: pulse 2s linear infinite; }
      `, body: '<main><span class="badge">Live</span></main>'
    })
  });
  assert.equal(crossWired.metrics.motion.ambient_loops, 1);
  assert.equal(crossWired.metrics.motion.signature, false);
  assert.deepEqual(crossWired.metrics.motion.signature_kinds, []);
});

test('a painted canvas is a motion signature only when an actual frame loop updates it', () => {
  const animated = analyzeVisualSources({
    html: fullSurface({
      body: '<main><canvas id="scene" width="800" height="600"></canvas></main>',
      script: `
        const canvas = document.querySelector('#scene');
        const context = canvas.getContext('2d');
        function drawFrame() { context.fillRect(0, 0, 4, 4); requestAnimationFrame(drawFrame); }
        requestAnimationFrame(drawFrame);
      `
    })
  });
  assert.equal(animated.metrics.motion.signature, true);
  assert.deepEqual(animated.metrics.motion.signature_kinds, ['animated canvas/WebGL']);
});

test('state evidence is structural: lazy loading and catch(error) do not render loading or error UI', () => {
  const result = analyzeVisualSources({
    html: fullSurface({
      body: '<main><form><input name="email"><button type="submit">Send</button><img loading="lazy" src="/shot.png" alt="Product view"></form></main>',
      script: "fetch('/api').catch((error) => console.warn(error));"
    })
  });
  assert.ok(result.metrics.states_owed.includes('loading'));
  assert.ok(result.metrics.states_owed.includes('error'));
  assert.ok(result.metrics.states_unmet.includes('loading'));
  assert.ok(result.metrics.states_unmet.includes('error'));
  assert.equal(result.metrics.states_present.includes('loading'), false);
  assert.equal(result.metrics.states_present.includes('error'), false);
});

test('read surfaces use the familiarity bar instead of brand display and evidence levers', () => {
  const result = analyzeVisualSources({
    html: fullSurface({ styles: "body { font-family: Georgia, serif; } article { max-width: 68ch; line-height: 1.7; }" }),
    surfaceMode: 'read'
  });
  assert.equal(result.metrics.surface_mode.mode, 'read');
  assert.equal(result.metrics.craft.mode, 'read');
  assert.deepEqual(Object.keys(result.metrics.craft.levers), ['typeface', 'material', 'motion', 'chrome']);
  assert.equal(result.metrics.craft.lever_count, 4);
});

test('media evidence distinguishes embedded proof from external assets that need runtime verification', () => {
  const external = analyzeVisualSources({
    html: fullSurface({ body: '<main><img src="/missing-shot.png" alt="Product workflow" width="800" height="600"></main>' })
  });
  assert.equal(external.metrics.media_evidence.status, 'unverified');
  assert.equal(external.metrics.craft.levers.evidence, false);

  const embedded = analyzeVisualSources({
    html: fullSurface({ body: '<main><img src="data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22/%3E" alt="Product workflow" width="800" height="600"></main>' })
  });
  assert.equal(embedded.metrics.media_evidence.status, 'verified');
  assert.equal(embedded.metrics.craft.levers.evidence, true);
});

test('a URL-only runtime without craft assurance is UNVERIFIED, never OK', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'aioson-visual-unverified-'));
  const launcher = async () => ({
    newContext: async ({ viewport }) => ({
      newPage: async () => ({
        goto: async () => {},
        evaluate: async () => ({
          scroll_width: viewport.width,
          viewport_width: viewport.width,
          viewport_height: viewport.height,
          clipped: [],
          offscreen: [],
          small_targets: [],
          text_samples: [],
          primary: []
        })
      }),
      close: async () => {}
    }),
    close: async () => {}
  });
  const report = await runVerifyArtifact({
    args: [dir],
    options: {
      kind: 'visual',
      url: 'http://127.0.0.1:4173',
      runtime: true,
      browserLauncher: launcher,
      json: true,
      suppressExitCode: true,
      'no-persist': true
    },
    logger: logger()
  });
  assert.equal(report.verdict, 'unverified');
  assert.equal(report.ok, false);
  assert.equal(report.blocking, false, 'advisory policy controls blocking, not truth');
  assert.ok(report.unverified_reasons.some((reason) => /craft/i.test(reason)));
});
