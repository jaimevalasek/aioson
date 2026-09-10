'use strict';

/**
 * design-seed — deterministic palette, pairing, and composition draws for
 * cold-start origination, diversified against the operator's recent projects.
 *
 * The problem it solves is measured, not hypothetical: left to its prior, a
 * generative model lands unrelated projects on the same favorite palette and
 * the same hero shapes. Quality gates cannot see that — each surface passes
 * alone. This module gives the engine an entropy source it must build FROM:
 *
 *   - a seeded PRNG (project slug → hash) draws hue, pole, scheme, pairing,
 *     and composition posture — same project, same draw; different project,
 *     different draw;
 *   - palette construction is contrast-solved in OKLCH, so every candidate is
 *     validated raw material, never a random pretty accident;
 *   - an operator-level fingerprint registry (written by verify:artifact from
 *     MEASURED surfaces) lets the draw steer away from hue families the
 *     operator's recent projects already shipped.
 *
 * The model keeps the judgment half: it picks ONE candidate and refines it.
 * The draw only decides where in the space the work starts — which is exactly
 * the decision the prior was silently making the same way every time.
 */

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const {
  clampChroma,
  oklchToRgb,
  oklchToHex,
  oklchCss,
  contrastRatio,
  hueDeltaDeg
} = require('./color-math');
const { validateFeatureSlug, isInsideRoot } = require('../verification/path-policy');

// ─── deterministic randomness ───────────────────────────────────────────────

function fnv1a(text) {
  let hash = 0x811c9dc5;
  for (const ch of String(text)) {
    hash ^= ch.codePointAt(0);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function projectFingerprintId(targetDir) {
  const normalized = path.resolve(String(targetDir || '.')).replace(/\\/g, '/').toLowerCase();
  return crypto.createHash('sha256').update(normalized).digest('hex').slice(0, 16);
}

function pickWeighted(rng, pairs) {
  const total = pairs.reduce((sum, [, w]) => sum + w, 0);
  let roll = rng() * total;
  for (const [value, weight] of pairs) {
    roll -= weight;
    if (roll <= 0) return value;
  }
  return pairs[pairs.length - 1][0];
}

function pickFrom(rng, list) {
  return list[Math.floor(rng() * list.length) % list.length];
}

function between(rng, lo, hi) {
  return lo + rng() * (hi - lo);
}

const {
  REGISTERS,
  POLES,
  SCHEMES,
  TYPEFACE_BANK,
  COMPOSITION_BANK,
  REGISTER_MATERIALS,
  MATERIALS,
  RHYTHMS,
  TECHNICAL_RHYTHMS,
  POLE_WEIGHTS,
  SCHEME_WEIGHTS
} = require('./design-seed-banks');

// ─── palette construction (contrast-solved) ─────────────────────────────────

const INK_BODY_TARGET = 7; // aim AAA body copy
const INK_FLOOR = 4.5; // never ship below AA
const MUTED_TARGET = 4.5;
const ACCENT_TARGET = 3; // large text / UI components

function role(l, c, h) {
  const fitted = { l, c: clampChroma(l, c, h), h };
  return { ...fitted, hex: oklchToHex(fitted), css: oklchCss(fitted) };
}

/**
 * Scan lightness from `from` toward `to` until the color reaches `target`
 * contrast against `againstRgb`; returns the best found (last scanned) when
 * the target is unreachable at this chroma/hue.
 */
function fitLightness({ c, h }, againstRgb, target, from, to) {
  const step = from <= to ? 0.01 : -0.01;
  let best = null;
  for (let l = from; step > 0 ? l <= to : l >= to; l += step) {
    const candidate = { l: Math.round(l * 1000) / 1000, c: clampChroma(l, c, h), h };
    const ratio = contrastRatio(oklchToRgb(candidate), againstRgb);
    if (!best || ratio > best.ratio) best = { color: candidate, ratio };
    if (ratio >= target) return { color: candidate, ratio };
  }
  return best;
}

/** Chromatic grounds sit where the hue is naturally comfortable in sRGB. */
function chromaticGroundLightness(rng, hue) {
  if (hue >= 60 && hue < 165) return between(rng, 0.78, 0.88); // yellows/greens carry high L
  if (hue >= 165 && hue < 225) return between(rng, 0.62, 0.75); // cyans/teals
  if (hue >= 225 && hue < 330) return between(rng, 0.42, 0.54); // blues/violets stay deep
  return between(rng, 0.55, 0.66); // reds/oranges
}

function accentHueFor(scheme, baseHue, rng) {
  switch (scheme) {
    case 'mono': return (baseHue + between(rng, -8, 8) + 360) % 360;
    case 'analogous': return (baseHue + (rng() < 0.5 ? 1 : -1) * between(rng, 26, 42) + 360) % 360;
    case 'complementary': return (baseHue + 180 + between(rng, -12, 12)) % 360;
    case 'split-complementary': return (baseHue + (rng() < 0.5 ? 150 : 210) + between(rng, -8, 8)) % 360;
    case 'triadic': return (baseHue + (rng() < 0.5 ? 120 : 240) + between(rng, -8, 8)) % 360;
    case 'duo-accent': return (baseHue + between(rng, 150, 210)) % 360;
    case 'color-block': return baseHue;
    default: return baseHue;
  }
}

function buildPalette(rng, { baseHue, pole, scheme }) {
  // ground — a tinted field, never flat gray; chromatic pole is a color field.
  let ground;
  if (pole === 'light') ground = role(between(rng, 0.955, 0.985), between(rng, 0.008, 0.03), baseHue);
  else if (pole === 'dark') ground = role(between(rng, 0.15, 0.24), between(rng, 0.01, 0.04), baseHue);
  else ground = role(chromaticGroundLightness(rng, baseHue), between(rng, 0.14, 0.2), baseHue);
  const groundRgb = oklchToRgb(ground);

  // ink — same family, lightness solved for AAA-leaning body contrast.
  const inkChroma = between(rng, 0.015, 0.04);
  const darkInk = contrastRatio({ r: 0, g: 0, b: 0 }, groundRgb) >= contrastRatio({ r: 255, g: 255, b: 255 }, groundRgb);
  let inkFit = darkInk
    ? fitLightness({ c: inkChroma, h: baseHue }, groundRgb, INK_BODY_TARGET, 0.32, 0.08)
    : fitLightness({ c: inkChroma, h: baseHue }, groundRgb, INK_BODY_TARGET, 0.82, 0.99);
  if (inkFit.ratio < INK_FLOOR) {
    // saturated field fighting the ink: drop the tint and take the extreme.
    inkFit = darkInk
      ? fitLightness({ c: 0.01, h: baseHue }, groundRgb, INK_FLOOR, 0.2, 0.03)
      : fitLightness({ c: 0.01, h: baseHue }, groundRgb, INK_FLOOR, 0.9, 1);
  }
  const ink = role(inkFit.color.l, inkFit.color.c, baseHue);

  // muted — secondary text, still readable.
  const mutedFit = darkInk
    ? fitLightness({ c: inkChroma, h: baseHue }, groundRgb, MUTED_TARGET, 0.52, 0.2)
    : fitLightness({ c: inkChroma, h: baseHue }, groundRgb, MUTED_TARGET, 0.62, 0.92);
  const muted = role(mutedFit.color.l, mutedFit.color.c, baseHue);

  // surface — one quiet layer above the ground.
  const surfaceL = pole === 'light' ? ground.l - 0.025 : pole === 'dark' ? ground.l + 0.035 : ground.l + (darkInk ? 0.05 : -0.05);
  const surface = role(surfaceL, ground.c, baseHue);

  // accent — the one color with a job, solved for UI contrast on the ground.
  const accentHue = accentHueFor(scheme, baseHue, rng);
  const accentChroma = between(rng, 0.16, 0.24);
  const accentFit = pole === 'dark'
    ? fitLightness({ c: accentChroma, h: accentHue }, groundRgb, ACCENT_TARGET, between(rng, 0.68, 0.78), 0.9)
    : pole === 'light'
      ? fitLightness({ c: accentChroma, h: accentHue }, groundRgb, ACCENT_TARGET, between(rng, 0.52, 0.62), 0.3)
      : fitLightness({ c: accentChroma, h: accentHue }, groundRgb, ACCENT_TARGET, darkInk ? 0.4 : 0.78, darkInk ? 0.2 : 0.92);
  const accent = role(accentFit.color.l, accentFit.color.c, accentHue);
  const accentRgb = oklchToRgb(accent);

  const accentInkWhite = contrastRatio({ r: 255, g: 255, b: 255 }, accentRgb) >= contrastRatio({ r: 0, g: 0, b: 0 }, accentRgb);
  const accentInkFit = accentInkWhite
    ? fitLightness({ c: 0.02, h: accentHue }, accentRgb, INK_FLOOR, 0.96, 1)
    : fitLightness({ c: 0.03, h: accentHue }, accentRgb, INK_FLOOR, 0.22, 0.05);
  const accentInk = role(accentInkFit.color.l, accentInkFit.color.c, accentHue);

  // wash — a tinted section variant of the ground at the accent hue.
  const wash = role(
    pole === 'light' ? ground.l - 0.02 : pole === 'dark' ? ground.l + 0.05 : ground.l,
    Math.min(0.055, between(rng, 0.03, 0.055)),
    accentHue
  );

  const roles = { ground, surface, ink, muted, accent, accent_ink: accentInk, wash };

  if (scheme === 'duo-accent') {
    const hue2 = (accentHue + between(rng, 150, 210)) % 360;
    const fit2 = pole === 'dark'
      ? fitLightness({ c: accentChroma, h: hue2 }, groundRgb, ACCENT_TARGET, 0.74, 0.9)
      : fitLightness({ c: accentChroma, h: hue2 }, groundRgb, ACCENT_TARGET, 0.56, 0.3);
    roles.accent_2 = role(fit2.color.l, fit2.color.c, hue2);
  }

  let blocks;
  if (scheme === 'color-block') {
    blocks = [0, between(rng, 110, 130), between(rng, 230, 250)].map((offset) => {
      const hue = (baseHue + offset) % 360;
      const l = chromaticGroundLightness(rng, hue);
      const block = role(l, between(rng, 0.15, 0.2), hue);
      const blockRgb = oklchToRgb(block);
      const whiteInk = contrastRatio({ r: 255, g: 255, b: 255 }, blockRgb) >= contrastRatio({ r: 0, g: 0, b: 0 }, blockRgb);
      return { ...block, ink: whiteInk ? '#ffffff' : '#101010' };
    });
  }

  return {
    roles,
    blocks,
    contrast: {
      ink_on_ground: round2(contrastRatio(oklchToRgb(ink), groundRgb)),
      muted_on_ground: round2(contrastRatio(oklchToRgb(muted), groundRgb)),
      accent_on_ground: round2(contrastRatio(accentRgb, groundRgb)),
      accent_ink_on_accent: round2(contrastRatio(oklchToRgb(accentInk), accentRgb))
    }
  };
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

// ─── candidate generation ───────────────────────────────────────────────────

const GOLDEN_ANGLE = 137.508;
const REPETITION_DELTA_DEG = 24;
const REPETITION_TIGHT_DELTA_DEG = 18;
const CANDIDATE_ACCENT_SEPARATION = 28;
// The label names the BASE hue (`analogous-322`), so alternatives keep their
// bases apart too — 1.2.0's rule, lost when 1.3.0 checked accents only.
const CANDIDATE_BASE_SEPARATION = 28;
const PALETTE_SEARCH_LIMIT = 36;

// Rank constraints first; randomness only breaks equally suitable choices.
// Repeated draws with replacement used to miss free entries in small banks.
function pickLeastUsed(rng, pool, key, used, history = []) {
  const normalize = (value) => String(value || '').trim().toLowerCase();
  const usage = pool.map((entry) => used.get(normalize(key(entry))) || 0);
  const minimum = Math.min(...usage);
  const available = pool.filter((entry, i) => usage[i] === minimum);
  const recent = available.map((entry) => history.filter((value) => normalize(value) === normalize(key(entry))).length);
  const leastRecent = Math.min(...recent);
  const selected = pickFrom(rng, available.filter((entry, i) => recent[i] === leastRecent));
  used.set(normalize(key(selected)), minimum + 1);
  return { value: selected, priorUses: minimum, recentUses: leastRecent };
}

function paletteDiversity({ baseHue, accentHue }, pole, taken, avoid) {
  const candidateDistances = taken.map((prior) => hueDeltaDeg(accentHue, prior.accent));
  const baseDistances = taken.map((prior) => hueDeltaDeg(baseHue, prior.base));
  const recentDistances = avoid.filter((entry) => entry && Number.isFinite(entry.accent_hue))
    .map((entry) => ({ delta: hueDeltaDeg(accentHue, entry.accent_hue), samePole: entry.ground_pole === pole }));
  const candidateMatches = candidateDistances.filter((delta) => delta < CANDIDATE_ACCENT_SEPARATION).length;
  const baseMatches = baseDistances.filter((delta) => delta < CANDIDATE_BASE_SEPARATION).length;
  const recentMatches = recentDistances.filter(({ delta, samePole }) => fingerprintMatchReason(delta, samePole)).length;
  const clearance = Math.min(180, ...candidateDistances.map((delta) => delta - CANDIDATE_ACCENT_SEPARATION),
    ...baseDistances.map((delta) => delta - CANDIDATE_BASE_SEPARATION),
    ...recentDistances.map(({ delta, samePole }) => delta - (samePole ? REPETITION_DELTA_DEG : REPETITION_TIGHT_DELTA_DEG)));
  return {
    candidateMatches,
    baseMatches,
    recentMatches,
    clearance,
    separation: candidateDistances.length ? Math.min(...candidateDistances) : null,
    baseSeparation: baseDistances.length ? Math.round(Math.min(...baseDistances)) : null
  };
}

// Conflicts rank in order: an accent another alternative already wears (what
// the eye compares), a base hue another alternative already names (what the
// label names), a recent project's fingerprint; clearance breaks ties.
function betterDraw(next, best) {
  for (const key of ['candidateMatches', 'baseMatches', 'recentMatches']) {
    if (next[key] !== best[key]) return next[key] < best[key];
  }
  return next.clearance > best.clearance;
}

function drawPalette(rng, { baseHue, stride = 1, pole, scheme, taken, avoid }) {
  let best = null;
  let trials = 0;
  for (; trials < PALETTE_SEARCH_LIMIT; trials += 1) {
    // Each candidate walks its own rungs of the golden-angle ladder (every
    // `stride`-th): with a stride of one, trial k of candidate i WAS trial 0
    // of candidate i+k, and two alternatives landed on one base hue.
    const hue = (baseHue + trials * stride * GOLDEN_ANGLE) % 360;
    const palette = buildPalette(rng, { baseHue: hue, pole, scheme });
    const accentHue = Math.round(palette.roles.accent.h) % 360;
    const diversity = paletteDiversity({ baseHue: hue, accentHue }, pole, taken, avoid);
    if (!best || betterDraw(diversity, best.diversity)) {
      best = { hue, accentHue, palette, diversity };
    }
    if (!diversity.candidateMatches && !diversity.baseMatches && !diversity.recentMatches) { trials += 1; break; }
  }
  return { ...best, trials };
}

function candidateWarnings(candidate) {
  const d = candidate.diversity;
  const warnings = [];
  if (d.recent_palette_matches) warnings.push(`${candidate.label}: palette overlaps ${d.recent_palette_matches} recent fingerprint(s) after ${d.palette_trials} trials; least-conflicting sampled palette used, chosen pole preserved`);
  if (d.accent_separation_deg !== null && d.accent_separation_deg < CANDIDATE_ACCENT_SEPARATION) warnings.push(`${candidate.label}: palette alternatives are only ${d.accent_separation_deg} degrees apart; draw diversity is limited`);
  if (d.base_separation_deg !== null && d.base_separation_deg < CANDIDATE_BASE_SEPARATION) warnings.push(`${candidate.label}: base hue only ${d.base_separation_deg} degrees from another alternative; draw diversity is limited`);
  if (d.display_uses) warnings.push(`${candidate.label}: display reused after exhausting the compatible typeface bank`);
  if (d.hero_uses) warnings.push(`${candidate.label}: hero reused after exhausting the compatible composition bank`);
  return warnings;
}

/**
 * Two fingerprints read as "the same project again" when the accent hue
 * family repeats on the same ground pole — or repeats tightly regardless of
 * pole: espresso-ground-rust-accent and cream-ground-rust-accent are the same
 * wardrobe with the polarity flipped, and the eye reads them as one brand.
 */
function fingerprintMatchReason(delta, samePole) {
  if (samePole && delta <= REPETITION_DELTA_DEG) return 'same hue family on the same ground pole';
  if (delta <= REPETITION_TIGHT_DELTA_DEG) return 'same accent family with the ground polarity flipped';
  return null;
}

/**
 * Deterministic candidates for one project. `avoid` carries fingerprints of
 * OTHER recent projects ({ accent_hue, ground_pole }): a draw landing in an
 * already-shipped hue family rotates away by the golden angle. A bounded
 * search ranks residual conflicts and reports them when no free trial exists.
 */
function generateSeedCandidates({ project = null, slug, register = null, count = 3, seed = 0, avoid = [], pole = null } = {}) {
  const normalizedRegister = register && REGISTERS.includes(String(register).toLowerCase())
    ? String(register).toLowerCase()
    : null;
  // A fixed pole is the owner's ground (an extracted identity's theme, or a
  // stated preference): the draw diversifies hue and pairing around it and
  // never flips it — the registry's job is to stop projects from looking the
  // same, not to overrule what the owner showed.
  const fixedPole = pole && POLES.includes(String(pole).toLowerCase()) ? String(pole).toLowerCase() : null;
  const basis = `${String(project || 'project')}|${String(slug || 'surface')}|${normalizedRegister || ''}|${Number(seed) || 0}${fixedPole ? `|pole:${fixedPole}` : ''}`;
  const hash = fnv1a(basis);
  const rng = mulberry32(hash);

  const baseHue0 = rng() * 360;
  const candidates = [];
  const taken = [];
  const usedDisplays = new Map();
  const usedHeroes = new Map();
  const usedMaterials = new Map();
  const total = Math.max(1, Math.min(6, count));

  for (let i = 0; i < total; i += 1) {
    const candidateRegister = normalizedRegister || pickFrom(rng, REGISTERS);
    const pole = fixedPole || pickWeighted(rng, POLE_WEIGHTS[candidateRegister] || POLE_WEIGHTS.default);
    const scheme = pickWeighted(rng, SCHEME_WEIGHTS[candidateRegister] || SCHEME_WEIGHTS.default);

    // Compare final accents AND bases inside this draw, accents against
    // measured history; each candidate searches its own rungs of the ladder.
    const drawn = drawPalette(rng, { baseHue: (baseHue0 + i * GOLDEN_ANGLE) % 360, stride: total, pole, scheme, taken, avoid });
    const { hue, palette } = drawn;
    taken.push({ base: hue, accent: drawn.accentHue });

    const pairingPool = TYPEFACE_BANK.filter((p) => p.registers.includes(candidateRegister));
    const chosenPairing = pickLeastUsed(rng, pairingPool, (p) => p.display, usedDisplays, avoid.map((entry) => entry && entry.display_face));
    const pairing = chosenPairing.value;
    const compositionPool = COMPOSITION_BANK.filter((c) => c.registers.includes(candidateRegister));
    const chosenComposition = pickLeastUsed(rng, compositionPool, (c) => c.hero, usedHeroes);
    const composition = chosenComposition.value;
    const material = pickLeastUsed(rng, REGISTER_MATERIALS[candidateRegister], (value) => value, usedMaterials).value;

    candidates.push({
      label: `${scheme}-${Math.round(hue) % 360}`,
      register: candidateRegister,
      pole,
      scheme,
      base_hue: Math.round(hue) % 360,
      accent_hue: drawn.accentHue,
      roles: Object.fromEntries(Object.entries(palette.roles).map(([name, value]) => [name, { hex: value.hex, oklch: value.css }])),
      ...(palette.blocks ? { blocks: palette.blocks.map((b) => ({ hex: b.hex, oklch: b.css, ink: b.ink })) } : {}),
      contrast: palette.contrast,
      pairing: { display: pairing.display, ui: pairing.ui, host: pairing.host, vibe: pairing.vibe },
      composition: {
        hero: composition.hero,
        note: composition.note,
        rhythm: pickFrom(rng, candidateRegister === 'technical' ? TECHNICAL_RHYTHMS : RHYTHMS),
        material,
        finishing: finishingFloor(candidateRegister, pole)
      },
      diversity: {
        accent_separation_deg: drawn.diversity.separation,
        base_separation_deg: drawn.diversity.baseSeparation,
        recent_palette_matches: drawn.diversity.recentMatches,
        palette_trials: drawn.trials,
        display_uses: chosenPairing.priorUses,
        recent_display_uses: chosenPairing.recentUses,
        hero_uses: chosenComposition.priorUses
      }
    });
  }

  return { basis, hash, register: normalizedRegister, pole: fixedPole, candidates, warnings: candidates.flatMap(candidateWarnings) };
}

// The drawn material is the SIGNATURE, never the whole system. Every candidate
// ships with the finish floor its palette must wear — tokened so every route
// inherits it — because a legitimate draw applied without finishing is exactly
// how a premium palette ships looking like generic output.
const FINISHING_FLOOR = {
  technical: 'token a rule hierarchy, tonal elevation steps, tabular numerals, and restrained status washes; borders carry depth and shadows stay absent — the drawn material sits on top of this system, never replaces it',
  quiet: 'token tonal elevation and one continuous ground atmosphere, with a single soft grounding treatment only when an object truly floats; silence remains finished without a universal shadow layer',
  editorial: 'token ink/rule weights, plate borders, paper-tone steps, and caption/figure treatments; hierarchy comes from type and rules, never generic floating-card elevation',
  material: 'token exactly one physical depth strategy across the surface (stacked-paper shadow OR bordered panels, never both), plus pigment washes and static texture at low opacity',
  constructed: 'token overlap, outline weights, hard color planes, and grid-snapped layer order; scale and collision create depth, with shadows prohibited unless the brief explicitly earns an exception',
  cinematic: 'token image-derived scrims, ambient-light washes, legibility gradients, and scene elevation; light from the media replaces generic panel shadows'
};

function finishingFloor(register, pole) {
  const base = FINISHING_FLOOR[register] || FINISHING_FLOOR.technical;
  return `${base} Ground calibration: ${pole}.`;
}

// ─── operator fingerprint registry ──────────────────────────────────────────
// Written by verify:artifact from MEASURED surfaces (ground truth, auto-fires
// through the existing gate chain); read here to steer new draws away. Local
// to the operator's machine, best-effort, never blocking.

const REGISTRY_VERSION = 1;
// The registry is the operator's memory of DISTINCT projects. Keyed by
// project+slug, one product with six features used to fill a quarter of the
// slots and evict the sites the draw most needed to remember — so each
// project keeps only its latest few surfaces, and the cap counts projects.
const REGISTRY_CAP = 32;
const REGISTRY_PER_PROJECT_CAP = 2;

function registryPath() {
  return process.env.AIOSON_DESIGN_REGISTRY
    || path.join(os.homedir(), '.aioson', 'design-fingerprints.json');
}

/**
 * A project living under the OS temp root is a fixture, a sandbox, or a
 * test — never one of the operator's projects. Its fingerprint must not
 * enter the default registry (it did: six `mkdtemp` fixtures once outranked
 * every real site as the "closest recent project"). An explicit
 * `AIOSON_DESIGN_REGISTRY` names a registry the caller owns, so temp
 * projects may record there.
 */
function isEphemeralProjectDir(dir) {
  // Spellings are not paths: a Windows runner spells the temp root in 8.3 form
  // (`C:\Users\RUNNER~1\…`) while the project path is long-form, and macOS's
  // tmpdir is `/var/…` where realpath says `/private/var/…`. Comparing the
  // strings let such a fixture record into the operator's default registry,
  // so both sides are compared by their real path too (a path that cannot be
  // resolved keeps its spelling).
  const spellings = (value) => {
    const resolved = path.resolve(String(value));
    const out = [resolved];
    try { out.push(fs.realpathSync.native(resolved)); } catch { /* absent or unreadable */ }
    return [...new Set(out.map((p) => p.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase()))];
  };
  const dirs = spellings(dir || '.');
  const roots = [os.tmpdir(), process.env.TMPDIR, process.env.TEMP, process.env.TMP]
    .filter((root) => typeof root === 'string' && root.trim().length > 0)
    .flatMap(spellings);
  return dirs.some((resolved) => roots.some((root) => resolved === root || resolved.startsWith(`${root}/`)));
}

function readRegistry() {
  try {
    const parsed = JSON.parse(fs.readFileSync(registryPath(), 'utf8'));
    if (parsed && Array.isArray(parsed.entries)) return { version: parsed.version || REGISTRY_VERSION, entries: parsed.entries };
  } catch { /* absent or unreadable — empty registry */ }
  return { version: REGISTRY_VERSION, entries: [] };
}

function recordFingerprint(entry, { projectDir = null } = {}) {
  if (!entry || !entry.project || !Number.isFinite(entry.accent_hue)) return false;
  if (projectDir && !process.env.AIOSON_DESIGN_REGISTRY && isEphemeralProjectDir(projectDir)) return false;
  try {
    const registry = readRegistry();
    const projectKey = (e) => String(e.project_id || e.project);
    const key = (e) => `${projectKey(e)}::${e.slug || ''}`;
    const entries = registry.entries.filter((e) => e && key(e) !== key(entry));
    entries.unshift({ ...entry, at: new Date().toISOString() });
    // Newest first, so the per-project cap keeps each project's latest surfaces.
    const perProject = new Map();
    const kept = entries.filter((e) => {
      const seen = (perProject.get(projectKey(e)) || 0) + 1;
      perProject.set(projectKey(e), seen);
      return seen <= REGISTRY_PER_PROJECT_CAP;
    });
    const file = registryPath();
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, `${JSON.stringify({ version: REGISTRY_VERSION, entries: kept.slice(0, REGISTRY_CAP) }, null, 2)}\n`);
    return true;
  } catch {
    return false;
  }
}

/** Where each recent project's palette came from — the honest portfolio stat. */
function originCounts(entries) {
  const counts = { seed: 0, identity: 0, prior: 0, unrecorded: 0 };
  const seenProjects = new Set();
  for (const entry of entries || []) {
    if (!entry) continue;
    const key = String(entry.project_id || entry.project);
    if (seenProjects.has(key)) continue;
    seenProjects.add(key);
    const origin = String(entry.origin || '').toLowerCase();
    if (origin === 'seed' || origin === 'identity' || origin === 'prior') counts[origin] += 1;
    else counts.unrecorded += 1;
  }
  return counts;
}

// ─── recorded draws and palette provenance ──────────────────────────────────
// The draw used to be a sentence in a skill: the model ran it, or did not,
// and nothing could tell. Now `design:seed` records what it drew next to the
// feature, and `verify:artifact --kind=visual` reads the record back to say
// where the BUILT palette came from: the draw, an identity, or the prior.

const SEED_RECORD_VERSION = 1;
const SEED_CONSUMED_DELTA_DEG = 30;
const SEED_LABEL_RE = /\b(mono|analogous|complementary|split-complementary|triadic|duo-accent|color-block)-(\d{1,3})\b/gi;

function seedRecordPath(targetDir, slug = null) {
  const root = path.resolve(String(targetDir || '.'));
  return slug
    ? path.join(root, '.aioson', 'context', 'features', String(slug), 'design-seed.json')
    : path.join(root, '.aioson', 'context', 'design-seed.json');
}

function readSeedRecord(targetDir, slug = null) {
  const candidates = slug ? [seedRecordPath(targetDir, slug), seedRecordPath(targetDir)] : [seedRecordPath(targetDir)];
  for (const file of candidates) {
    try {
      const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (parsed && Array.isArray(parsed.candidates)) return { ...parsed, path: file };
    } catch { /* absent or unreadable */ }
  }
  return null;
}

/**
 * Persist a draw next to the feature (or at project scope). A re-draw
 * replaces the record and keeps the previous labels as history, so a rebuild
 * that rolled `--seed=N+1` stays traceable.
 */
function writeSeedRecord(targetDir, slug, payload) {
  const root = path.resolve(String(targetDir || '.'));
  // The slug is a path segment: a `../` slug wrote design-seed.json outside
  // the project. Canonical feature-slug rule, then containment, before any
  // byte is written — for every caller, not only the CLI.
  if (slug && !validateFeatureSlug(slug).ok) {
    const error = new Error(`design-seed: ${JSON.stringify(slug)} is not a feature slug`);
    error.code = 'invalid_slug';
    throw error;
  }
  if (!fs.existsSync(path.join(root, '.aioson'))) return null;
  const file = seedRecordPath(root, slug);
  if (!isInsideRoot(path.join(root, '.aioson', 'context'), file)) {
    const error = new Error(`design-seed: record path escapes the project (${file})`);
    error.code = 'path_outside_root';
    throw error;
  }
  const previous = (() => {
    try {
      const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
      return parsed && Array.isArray(parsed.candidates) ? parsed : null;
    } catch { return null; }
  })();
  const history = [
    ...(previous ? [{ basis: previous.basis, seed: previous.seed, drawn_at: previous.drawn_at, labels: previous.candidates.map((c) => c.label) }] : []),
    ...((previous && Array.isArray(previous.history)) ? previous.history : [])
  ].slice(0, 6);
  const record = {
    version: SEED_RECORD_VERSION,
    generator: payload.generator,
    project: payload.project,
    project_id: payload.project_id,
    slug: slug || null,
    register: payload.register || null,
    pole: payload.pole || null,
    seed: payload.seed,
    basis: payload.basis,
    identity: payload.identity ? payload.identity.path : null,
    drawn_at: new Date().toISOString(),
    candidates: payload.candidates.map((c) => ({
      label: c.label,
      register: c.register,
      pole: c.pole,
      scheme: c.scheme,
      base_hue: c.base_hue,
      accent_hue: c.accent_hue,
      display: c.pairing && c.pairing.display,
      ui: c.pairing && c.pairing.ui,
      hero: c.composition && c.composition.hero,
      material: c.composition && c.composition.material,
      ...(c.diversity ? { diversity: c.diversity } : {})
    })),
    warnings: payload.warnings || [],
    history
  };
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(record, null, 2)}\n`);
  return file;
}

/** Seed labels a manifest names in prose (`analogous-336`) — the legacy record. */
function seedLabelsFromText(text) {
  const labels = [];
  for (const match of String(text || '').matchAll(SEED_LABEL_RE)) {
    const label = `${match[1].toLowerCase()}-${Number(match[2]) % 360}`;
    if (!labels.includes(label)) labels.push(label);
  }
  return labels;
}

/**
 * The accent hue windows a labelled draw can legitimately produce — the same
 * arithmetic `accentHueFor` uses, widened by a refinement tolerance. A label
 * names the BASE hue; the accent the eye sees depends on the scheme.
 */
function accentWindowsForLabel(label, tolerance = 12) {
  const match = /^(mono|analogous|complementary|split-complementary|triadic|duo-accent|color-block)-(\d{1,3})$/i.exec(String(label || '').trim());
  if (!match) return [];
  const base = Number(match[2]) % 360;
  const span = (lo, hi) => [lo - tolerance, hi + tolerance];
  switch (match[1].toLowerCase()) {
    case 'mono': return [span(base - 8, base + 8)];
    case 'analogous': return [span(base + 26, base + 42), span(base - 42, base - 26)];
    case 'complementary': return [span(base + 168, base + 192)];
    case 'split-complementary': return [span(base + 142, base + 158), span(base + 202, base + 218)];
    case 'triadic': return [span(base + 112, base + 128), span(base + 232, base + 248)];
    case 'duo-accent': return [span(base + 150, base + 210)];
    case 'color-block': return [span(base, base)];
    default: return [];
  }
}

function hueInWindow(hue, [lo, hi]) {
  const norm = (value) => ((value % 360) + 360) % 360;
  const h = norm(hue);
  const start = norm(lo);
  const width = hi - lo;
  return width >= 360 || norm(h - start) <= width;
}

/**
 * Where did the built palette come from? `identity` when an identity record
 * governs the surface; `seed` when the measured accent sits inside a drawn
 * candidate (a recorded draw's accent within 30°, or the hue window a
 * manifest-named label allows); `prior` otherwise — with `reason`
 * `no_draw` (nothing was ever drawn) or `draw_ignored` (drawn, then reverted).
 */
function classifyPaletteOrigin({ accentHue, groundPole = null, identity = false, seed = null } = {}) {
  if (identity) return { origin: 'identity', candidate: null, delta_deg: null, reason: 'identity_record' };
  const candidates = seed && Array.isArray(seed.candidates) ? seed.candidates.filter(Boolean) : [];
  if (candidates.length === 0 || !Number.isFinite(accentHue)) {
    return { origin: 'prior', candidate: null, delta_deg: null, reason: 'no_draw' };
  }
  let best = null;
  for (const candidate of candidates) {
    let delta = null;
    let consumed = false;
    if (Number.isFinite(candidate.accent_hue)) {
      delta = Math.round(hueDeltaDeg(accentHue, candidate.accent_hue));
      consumed = delta <= SEED_CONSUMED_DELTA_DEG;
    } else if (candidate.label) {
      const windows = accentWindowsForLabel(candidate.label);
      consumed = windows.some((window) => hueInWindow(accentHue, window));
      delta = consumed ? 0 : null;
    }
    const entry = {
      candidate: candidate.label || null,
      delta_deg: delta,
      pole_match: groundPole && candidate.pole ? candidate.pole === groundPole : null
    };
    if (consumed) return { origin: 'seed', reason: 'draw_consumed', ...entry };
    if (!best || (delta !== null && (best.delta_deg === null || delta < best.delta_deg))) best = entry;
  }
  return { origin: 'prior', reason: 'draw_ignored', ...(best || { candidate: null, delta_deg: null, pole_match: null }) };
}

/**
 * The closest recent fingerprint from a DIFFERENT project sharing this
 * surface's hue family and ground pole — the measured shape of "the second
 * project came out looking like the first".
 */
function findRepetition(current, entries) {
  if (!current || !Number.isFinite(current.accent_hue)) return null;
  let hit = null;
  for (const entry of entries || []) {
    if (!entry || !Number.isFinite(entry.accent_hue)) continue;
    const sameProject = current.project_id && entry.project_id
      ? current.project_id === entry.project_id
      : entry.project === current.project;
    if (sameProject) continue;
    const delta = hueDeltaDeg(entry.accent_hue, current.accent_hue);
    const hueReason = fingerprintMatchReason(delta, entry.ground_pole === current.ground_pole);
    const sameFace = Boolean(current.display_face && entry.display_face && current.display_face === entry.display_face);
    const sameMode = Boolean(current.surface_mode && entry.surface_mode && current.surface_mode === entry.surface_mode);
    const sameMaterial = Boolean(current.material_signature && entry.material_signature && current.material_signature === entry.material_signature);
    const sameMotion = Boolean(current.motion_signature && entry.motion_signature && current.motion_signature === entry.motion_signature);
    const structuralReason = sameFace && sameMode && (sameMaterial || sameMotion)
      ? 'same type, surface mode, and finish/motion signature'
      : null;
    const reason = hueReason || structuralReason;
    if (!reason) continue;
    if (!hit || delta < hit.delta) {
      hit = {
        entry,
        delta: Math.round(delta),
        reason,
        same_face: sameFace,
        same_material: sameMaterial,
        same_motion: sameMotion
      };
    }
  }
  return hit;
}

module.exports = {
  generateSeedCandidates,
  buildPalette,
  registryPath,
  readRegistry,
  recordFingerprint,
  findRepetition,
  fingerprintMatchReason,
  isEphemeralProjectDir,
  originCounts,
  seedRecordPath,
  readSeedRecord,
  writeSeedRecord,
  seedLabelsFromText,
  accentWindowsForLabel,
  classifyPaletteOrigin,
  REGISTRY_CAP,
  REGISTRY_PER_PROJECT_CAP,
  SEED_CONSUMED_DELTA_DEG,
  fnv1a,
  mulberry32,
  projectFingerprintId,
  finishingFloor,
  FINISHING_FLOOR,
  REGISTERS,
  POLES,
  SCHEMES,
  TYPEFACE_BANK,
  COMPOSITION_BANK,
  MATERIALS,
  REPETITION_DELTA_DEG
};
