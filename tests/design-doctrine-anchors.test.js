'use strict';

/**
 * The engine's own doctrine must not prescribe what the telemetry punishes.
 *
 * Measured incident: the tokens reference told the model to set a "section
 * eyebrow — 0.68rem uppercase mono, tracking 0.28em" above card titles, and
 * a consumer's operate prototype shipped 16 `.overline` labels that the tells
 * scan counted as 13 kickers. The same file used Geist and IBM Plex Sans as
 * checkpoint examples — both in the saturated-face set — and the directions
 * printed `accent=blue-600` / `orange-500` / fixed graphite hexes that a
 * model reads as the answer. The bank test already keeps `TYPEFACE_BANK`
 * disjoint from the saturated set; this test holds the prose to the same law.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');

const { SATURATED_DISPLAY_FACES } = require('../src/lib/visual-telemetry');

const ROOT = path.resolve(__dirname, '..', 'template', '.aioson');
const ENGINE = path.join(ROOT, 'skills', 'design', 'interface-design');

const AUXILIARY = [
  'skills/static/static-html-patterns.md',
  'skills/static/static-html-patterns/structure.md',
  'skills/static/static-html-patterns/css-tokens.md',
  'skills/static/static-html-patterns/premium.md',
  'skills/static/static-html-patterns/motion.md',
  'skills/static/static-html-patterns/checklists.md',
  'skills/static/react-motion-patterns.md',
  'skills/static/landing-page-forge.md'
];

// Every prose surface an agent loads while deciding or building a visual system.
const DOCTRINE = [
  ...AUXILIARY,
  'skills/design/interface-design/SKILL.md',
  'skills/design/interface-design/references/aesthetic-registers.md',
  'skills/design/interface-design/references/components-and-states.md',
  'skills/design/interface-design/references/design-directions.md',
  'skills/design/interface-design/references/handoff-and-quality.md',
  'skills/design/interface-design/references/intent-and-domain.md',
  'skills/design/interface-design/references/tokens-and-depth.md',
  'docs/design/visual-effects.md',
  'docs/dev/visual-implementation.md',
  'docs/reference-identity.md',
  'skills/process/prototype-forge/SKILL.md',
  'skills/process/prototype-forge/references/build-contract.md',
  'skills/process/prototype-forge/references/quality-and-manifest.md',
  'skills/process/reference-identity-extract/SKILL.md',
  'docs/briefing/visual-exploration.md',
  'docs/briefing/prototype-and-delegation.md',
  'docs/ux-ui/design-gate.md',
  'docs/ux-ui/site-delivery.md',
  'docs/ux-ui/token-contract.md',
  'docs/ux-ui/design-execution.md',
  'agents/site-forge.md',
  'agents/refiner.md',
  'agents/ux-ui.md',
  'agents/dev.md'
];

// The two references that carry token math — the place a printed value
// becomes every project's value.
const TOKEN_MATH = [
  'skills/design/interface-design/references/design-directions.md',
  'skills/design/interface-design/references/tokens-and-depth.md',
  'skills/static/static-html-patterns/css-tokens.md'
];

async function readDoctrine(rel) {
  try {
    return await fs.readFile(path.join(ROOT, rel), 'utf8');
  } catch {
    return null;
  }
}

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

test('no doctrine surface names a saturated display face as an example or a default', async () => {
  const faces = [...SATURATED_DISPLAY_FACES];
  assert.ok(faces.length >= 20, 'the saturated set is the telemetry\'s own list');
  const offenders = [];
  for (const rel of DOCTRINE) {
    const text = await readDoctrine(rel);
    if (text === null) continue;
    const lower = text.toLowerCase();
    for (const face of faces) {
      const re = new RegExp(`(^|[^a-z])${escapeRe(face)}([^a-z]|$)`);
      if (!re.test(lower)) continue;
      // A face may be NAMED as the thing to avoid — the line has to say so.
      const lines = lower.split(/\r?\n/).filter((line) => re.test(line));
      const allNegative = lines.every((line) => /\b(never|avoid|not|saturated|flag|tell|instead)\b/.test(line));
      if (!allNegative) offenders.push(`${rel}: ${face}`);
    }
  }
  assert.deepEqual(offenders, [], `saturated faces printed as examples — the model reads an example as the answer:\n${offenders.join('\n')}`);
});

test('the token-math references print no hue anchors: no named accent, no fixed hex, no color-scale token', async () => {
  for (const rel of TOKEN_MATH) {
    const text = await readDoctrine(rel);
    assert.ok(text, `${rel} exists`);
    assert.doesNotMatch(text, /accent\s*=\s*[a-z]+-\d{2,3}\b/i, `${rel}: an accent printed as a color-scale token is the default every project inherits`);
    assert.doesNotMatch(text, /accent\s*=\s*(?:desaturated |muted )?(?:blue|orange|teal|green|red|violet|purple|indigo|amber|pink)\b/i, `${rel}: an accent named by hue is a printed default`);
    assert.doesNotMatch(text, /#[0-9a-f]{6}\b/i, `${rel}: a fixed hex is a fixed identity — surfaces come from the drawn ground or the identity record`);
    assert.doesNotMatch(text, /\b(?:slate|stone|zinc|gray|neutral|sky|blue|indigo|violet|orange|amber|emerald|teal|rose)-\d{2,3}\b/, `${rel}: a Tailwind color-scale token is a printed palette`);
  }
});

test('the tokens reference never instructs a measured generation tell: no eyebrow/kicker, no sub-11px, no utility-class literals', async () => {
  const text = await readDoctrine('skills/design/interface-design/references/tokens-and-depth.md');
  assert.ok(text);
  assert.doesNotMatch(text, /Section eyebrow/i);
  for (const line of text.split(/\r?\n/)) {
    if (/\b(eyebrow|kicker)\b/i.test(line)) {
      assert.match(line, /\b(no|never|delete|tell)\b/i, `a line naming the kicker must be telling the model NOT to draw it: "${line.trim()}"`);
    }
  }
  // Tailwind arbitrary-value literals are one product's classes, not token math.
  assert.doesNotMatch(text, /(?:text|rounded|px|py|p|gap)-\[[^\]]+\]/, 'a Tailwind arbitrary-value class is a fixed product look');
  assert.doesNotMatch(text, /\b(?:text-xs|text-sm|text-base|text-xl|text-2xl|rounded-xl|bg-black\/\d+|backdrop-blur-sm)\b/, 'utility-class literals bake one stack\'s scale into every project');
  // Text sizes stay on or above the measured 11px floor (`tiny text` tell).
  for (const match of text.matchAll(/(\d+(?:\.\d+)?)px text\b|font-size:\s*(\d+(?:\.\d+)?)px/g)) {
    const px = Number(match[1] || match[2]);
    assert.ok(px >= 11, `a text size under the 11px floor is prescribed: "${match[0]}"`);
  }
  for (const match of text.matchAll(/(\d+(?:\.\d+)?)rem\b/g)) {
    const before = text.slice(Math.max(0, match.index - 40), match.index);
    if (/font|text|size|label/i.test(before)) {
      assert.ok(Number(match[1]) * 16 >= 11, `a text size under the 11px floor is prescribed: "${match[0]}"`);
    }
  }
});

test('the doctrine says where hues and faces come from — the draw or the identity — where it prints token math', async () => {
  const directions = await readDoctrine('skills/design/interface-design/references/design-directions.md');
  const tokens = await readDoctrine('skills/design/interface-design/references/tokens-and-depth.md');
  assert.match(directions, /design:seed/);
  assert.match(directions, /drawn or identity accent/i);
  assert.match(tokens, /drawn candidate or the identity record/i);
  assert.match(tokens, /kicker above heading/, 'the tell is named by its telemetry id so the reader can find the measurement');
});

test('the workspace mirrors of the tracked doctrine docs match the template', async () => {
  const workspace = path.resolve(__dirname, '..', '.aioson');
  for (const rel of DOCTRINE) {
    const [t, w] = await Promise.all([readDoctrine(rel), fs.readFile(path.join(workspace, rel), 'utf8').catch(() => null)]);
    if (t === null || w === null) continue;
    assert.equal(w, t, `template/workspace drift: ${rel}`);
  }
});

test('reachable production recipes defer to art direction and do not reintroduce fixed aesthetic bundles', async () => {
  for (const rel of AUXILIARY) {
    const text = await readDoctrine(rel);
    assert.ok(text, `${rel} is reachable`);
    assert.match(text, /visual direction|interface-design|approved prototype/i, rel);
    assert.doesNotMatch(text, /Hero law|THE HERO LAW|mandatory trio|All three required|Every landing page follows/i, rel);
    assert.doesNotMatch(text, /hsla?\(\s*(?:265|190|310)\s*,|rgba?\(99,\s*102,\s*241/, `${rel}: a literal effect palette overrides the chosen identity`);
  }
  const components = await readDoctrine('skills/design/interface-design/references/components-and-states.md');
  assert.doesNotMatch(components, /text-\[0\.65rem\]|max-w-448px|Modal, not inline/);
  const intent = await readDoctrine('skills/design/interface-design/references/intent-and-domain.md');
  assert.match(intent, /composition family/);
  assert.match(intent, /material family/);
  assert.match(intent, /motion family/);
  assert.match(intent, /at least two structural axes/);
});
