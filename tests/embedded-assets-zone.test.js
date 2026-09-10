'use strict';

/**
 * Embedded bytes never sit among authored code.
 *
 * Measured on consumer prototypes: a 1.8 MB document was 98% base64, its
 * 155 KB stylesheet 139 KB of WOFF2 — every surgical polish pass reread font
 * bytes to find a rule. The build contract quarantines embedded assets in one
 * trailing zone (`<style data-aioson-assets>` for fonts, a JSON
 * `<script data-aioson-assets>` for images/media); the telemetry measures how
 * much base64 still sits in the authored stylesheet and markup and names it.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

process.env.AIOSON_DESIGN_REGISTRY = path.join(__filename, 'no-registry', 'design-fingerprints.json');

const { analyzeVisualSources, embeddedAssetProfile, EMBEDDED_ASSET_ZONE_MIN_BYTES } = require('../src/lib/visual-telemetry');
const { assessMediaEvidence } = require('../src/lib/visual-assurance');

const BIG = 'A'.repeat(48 * 1024); // 48 KB of base64, over the 32 KB floor
const RULES = `
  :root { --s2: 8px; --fg: #1a1a1a; --bg: #fff; }
  body { font-family: "Face", serif; color: var(--fg); background: var(--bg); }
  h1 { font-size: 40px; margin: 0; }
  .card { padding: var(--s2); border: 1px solid #ddd; border-radius: 8px; }
  .btn { padding: var(--s2); transition: opacity .2s; }
  .btn:focus-visible { outline: 2px solid var(--fg); }
`;

function page({ fontZone = 'authored', imageZone = 'none' } = {}) {
  const fontFace = `@font-face { font-family: "Face"; src: url(data:font/woff2;base64,${BIG}) format("woff2"); }`;
  const authoredStyle = `<style>${fontZone === 'authored' ? fontFace : ''}${RULES}</style>`;
  const assetStyle = fontZone === 'zone' ? `<style data-aioson-assets>${fontFace}</style>` : '';
  const inlineImage = imageZone === 'markup' ? `<img src="data:image/webp;base64,${BIG}" alt="Prancha">` : (imageZone === 'zone' ? '<img data-asset="hero" alt="Prancha">' : '');
  const assetScript = imageZone === 'zone' ? `<script type="application/json" data-aioson-assets>{"hero":"data:image/webp;base64,${BIG}"}</script>` : '';
  return `<!doctype html><html><head>${authoredStyle}</head><body><main><h1>Estúdio</h1>${inlineImage}<div class="card"><button class="btn">Ok</button></div></main>${assetStyle}${assetScript}</body></html>`;
}

test('the profile splits base64 bytes by zone: authored stylesheet, markup, quarantined', () => {
  const authored = embeddedAssetProfile(page({ fontZone: 'authored', imageZone: 'markup' }));
  assert.ok(authored.authored_style_bytes > EMBEDDED_ASSET_ZONE_MIN_BYTES);
  assert.ok(authored.authored_style_share_pct >= 25, `share ${authored.authored_style_share_pct}`);
  assert.ok(authored.markup_bytes > EMBEDDED_ASSET_ZONE_MIN_BYTES);
  assert.equal(authored.quarantined_bytes, 0);
  assert.deepEqual(Object.keys(authored.kinds).sort(), ['font', 'image']);

  const zoned = embeddedAssetProfile(page({ fontZone: 'zone', imageZone: 'zone' }));
  assert.equal(zoned.authored_style_bytes, 0);
  assert.equal(zoned.markup_bytes, 0);
  assert.ok(zoned.quarantined_bytes > 2 * EMBEDDED_ASSET_ZONE_MIN_BYTES);
  assert.equal(zoned.bytes, authored.bytes, 'the same bytes, moved — nothing lost');

  assert.equal(embeddedAssetProfile('<style>.a{color:red}</style><p>x</p>').bytes, 0);
});

test('kind=visual names base64 sitting in the authored stylesheet or markup, and stays silent once quarantined', () => {
  const inline = analyzeVisualSources({ html: page({ fontZone: 'authored', imageZone: 'markup' }) });
  assert.equal(inline.applicable, true);
  assert.ok(inline.metrics.embedded_assets.authored_style_bytes > EMBEDDED_ASSET_ZONE_MIN_BYTES);
  const styleWarning = inline.warnings.find((w) => /embedded assets inside the authored stylesheet/.test(w));
  assert.ok(styleWarning, inline.warnings.join('\n'));
  assert.match(styleWarning, /data-aioson-assets/);
  const markupWarning = inline.warnings.find((w) => /embedded assets inside the markup/.test(w));
  assert.ok(markupWarning, inline.warnings.join('\n'));
  assert.match(markupWarning, /application\/json/);

  const zoned = analyzeVisualSources({ html: page({ fontZone: 'zone', imageZone: 'zone' }) });
  assert.equal(zoned.warnings.some((w) => /embedded assets inside/.test(w)), false, zoned.warnings.join('\n'));
  assert.ok(zoned.metrics.embedded_assets.quarantined_bytes > 0);
  // The delivered face is still delivered from the zone — quarantine costs no lever.
  assert.equal(zoned.metrics.craft.levers.typeface, inline.metrics.craft.levers.typeface);

  // A small inline asset (an icon, a tiny placeholder) is never charged.
  const small = analyzeVisualSources({ html: `<!doctype html><html><head><style>${RULES}</style></head><body><img src="data:image/png;base64,${'A'.repeat(2048)}" alt="ícone"></body></html>` });
  assert.equal(small.warnings.some((w) => /embedded assets inside/.test(w)), false);
});

// Measured regression: following this contract cost the surface its evidence.
// The zone moves images out of `src` into the JSON block, hydrated into
// `<img data-asset>` or `--asset-*` custom properties — and static media
// evidence skipped an <img> without `src` and a background without `url(`.
// The same brand prototype read 70/100 inline and 50/100 zoned (evidence
// lever off, media 0/2), and briefing:approve refused it under the bar.
const PNG = `data:image/png;base64,${'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='.repeat(3)}`;

function brandSurface({ zone }) {
  const filler = Array.from({ length: 70 }, (_, i) => `.f${i} { padding: var(--s2); margin: var(--s3); color: var(--fg); background: var(--bg); }`).join('\n');
  const img = (name, alt) => (zone ? `<img class="shot" data-asset="${name}" alt="${alt}">` : `<img class="shot" src="${PNG}" alt="${alt}">`);
  const assets = zone
    ? `<script type="application/json" data-aioson-assets>{"kitchen":"${PNG}","plate":"${PNG}","room":"${PNG}"}</script>
<script>const a=JSON.parse(document.querySelector('script[data-aioson-assets]').textContent);document.querySelectorAll('[data-asset]').forEach(e=>{e.src=a[e.dataset.asset]});</script>`
    : '';
  return `<!doctype html><html><head><style>
  @font-face { font-family: "Atlas Display"; src: url(data:font/woff2;base64,AAAA) format("woff2"); }
  :root { --s2: 8px; --s3: 12px; --fg: #1a1a1a; --bg: #ffffff; --accent: #c2185b; }
  body { font-family: system-ui, sans-serif; background: var(--bg); color: var(--fg); }
  h1 { font-family: "Atlas Display", serif; font-size: 112px; letter-spacing: -0.02em; }
  .kicker { text-transform: uppercase; letter-spacing: .2em; }
  .hero { position: relative; padding: 96px 0; background: linear-gradient(180deg, #fff, #f6f0f4); }
  .hero::before { content: ""; position: absolute; inset: 0; background: radial-gradient(circle at 20% 20%, var(--accent), transparent 40%); }
  .hero::after { content: ""; position: absolute; inset: 0; background: linear-gradient(90deg, rgba(0,0,0,.04), transparent); }
  .wash { position: absolute; filter: blur(48px); animation: drift 20s linear infinite; }
  @keyframes drift { from { transform: translateX(0); } to { transform: translateX(40px); } }
  @keyframes rise { from { opacity: 0; } to { opacity: 1; } }
  .reveal { animation: rise .6s ease-out both; }
  @media (prefers-reduced-motion: reduce) { .wash, .reveal { animation: none; } }
  .shot { width: 100%; aspect-ratio: 4/3; object-fit: cover; }
  .shot-wide { object-fit: cover; }
  .card { position: absolute; margin-top: -40px; clip-path: inset(0 round 12px); }
  .card:hover { transform: translateY(-4px); }
  .btn:hover { transform: scale(1.02); }
  .btn { padding: var(--s2); background: var(--accent); color: #fff; transition: transform .2s; }
  .btn:focus-visible { outline: 2px solid var(--accent); }
  .sticky { position: sticky; top: 0; }
  .overlap { position: absolute; margin-left: -24px; }
  ::selection { background: var(--accent); }
  a { color: var(--accent); }
  ${filler}
  </style></head><body>
  <section class="hero"><div class="wash"></div><p class="kicker">Casa</p><h1>Estúdio</h1><a class="btn" href="#c">Conversar</a></section>
  <section class="reveal">${img('kitchen', 'Chef plating a dish in the open kitchen')}${img('plate', 'Seasonal tasting menu plate')}${img('room', 'Dining room at dusk')}</section>
  ${assets}
  </body></html>`;
}

test('zoned media is still evidence: the build contract costs no lever and no media grade', () => {
  const inline = analyzeVisualSources({ html: brandSurface({ zone: false }), surfaceMode: 'brand' });
  const zoned = analyzeVisualSources({ html: brandSurface({ zone: true }), surfaceMode: 'brand' });
  assert.equal(inline.metrics.media_evidence.verified, 3, 'fixture: three embedded images inline');
  assert.equal(zoned.metrics.embedded_assets.markup_bytes, 0, 'fixture: the zoned build carries no base64 in the markup');
  assert.equal(zoned.metrics.media_evidence.status, 'verified');
  assert.equal(zoned.metrics.media_evidence.verified, inline.metrics.media_evidence.verified);
  assert.equal(zoned.metrics.craft.levers.evidence, true);
  assert.equal(zoned.metrics.craft.weight.grades.media, inline.metrics.craft.weight.grades.media);
  assert.equal(zoned.metrics.craft.weight.score, inline.metrics.craft.weight.score, `zoned ${zoned.metrics.craft.weight.score} vs inline ${inline.metrics.craft.weight.score}`);
  assert.equal(zoned.warnings.some((w) => /craft weight \d+\/100 below the brand bar/.test(w)), false, zoned.warnings.join('\n'));
});

test('a --asset-* background resolves against the zone; a key the zone lacks is never verified', () => {
  const zone = `<script type="application/json" data-aioson-assets>{"hero":"${PNG}","grain":"data:image/svg+xml,%3Csvg%3E%3Cg transform='scale(2)'%3E%3Cfilter%3E%3CfeTurbulence/%3E%3C/filter%3E%3C/g%3E%3C/svg%3E"}</script>`;
  const css = assessMediaEvidence({
    markup: `<section class="hero"></section>${zone}`,
    styleText: '.hero { background-image: var(--asset-hero); } .paper::after { background: var(--asset-grain); }'
  });
  assert.equal(css.status, 'verified');
  assert.equal(css.verified, 1, 'the hero plate is evidence; the grain texture never is');
  assert.equal(css.items[0].kind, 'css-image');

  const ghost = assessMediaEvidence({
    markup: `<img data-asset="ghost" alt="Chef plating a dish in the open kitchen"><div class="b"></div>${zone}`,
    styleText: '.b { background-image: var(--asset-missing); }'
  });
  assert.equal(ghost.verified, 0, 'a key the zone lacks hydrates nothing');
  assert.equal(ghost.status, 'unverified');
  assert.ok(ghost.items.every((item) => /not in the asset zone/.test(item.reason)), JSON.stringify(ghost.items));

  // Without any zone a bare data-asset still proves nothing.
  assert.equal(assessMediaEvidence({ markup: '<img data-asset="hero" alt="Chef plating a dish">' }).verified, 0);
});
