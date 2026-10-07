'use strict';

// ─── banks ──────────────────────────────────────────────────────────────────
// Curated raw material, not a decision surface: the seed draws FROM these, the
// engine composes WITH the draw. Every family is deliverable from its host
// (Google Fonts / Fontshare) per the build contract's typeface exception.
//
// The bank deliberately avoids the training-saturated faces the telemetry
// flags (SATURATED_DISPLAY_FACES in visual-telemetry.js): a face every model
// reaches for by reflex reads as a default even when a fair draw picked it,
// so a dice that can roll the monoculture defeats its own purpose. A test
// keeps the two lists disjoint.

const REGISTERS = ['technical', 'quiet', 'editorial', 'material', 'constructed', 'cinematic'];
const POLES = ['light', 'dark', 'chromatic'];

const TYPEFACE_BANK = [
  { display: 'Young Serif', ui: 'Figtree', host: 'google', registers: ['editorial', 'material'], vibe: 'warm chunky oldstyle' },
  { display: 'Gambetta', ui: 'Switzer', host: 'fontshare', registers: ['editorial', 'quiet', 'material'], vibe: 'calligraphic contemporary serif' },
  { display: 'Petrona', ui: 'Archivo', host: 'google', registers: ['editorial'], vibe: 'upright latin serif with bite' },
  { display: 'Italiana', ui: 'Karla', host: 'google', registers: ['quiet', 'editorial'], vibe: 'hairline display roman' },
  { display: 'Abril Fatface', ui: 'Mulish', host: 'google', registers: ['material', 'editorial'], vibe: 'poster didone' },
  { display: 'Gloock', ui: 'Hanken Grotesk', host: 'google', registers: ['editorial', 'cinematic'], vibe: 'heavy didone display' },
  { display: 'Bodoni Moda', ui: 'Public Sans', host: 'google', registers: ['editorial'], vibe: 'true italian didone' },
  { display: 'Spectral', ui: 'Work Sans', host: 'google', registers: ['quiet', 'editorial'], vibe: 'cool text serif' },
  { display: 'Marcellus', ui: 'Mulish', host: 'google', registers: ['quiet', 'cinematic'], vibe: 'inscriptional capitals' },
  { display: 'Schibsted Grotesk', ui: 'Archivo', host: 'google', registers: ['technical', 'constructed'], vibe: 'newsroom grotesque' },
  { display: 'Sora', ui: 'Hanken Grotesk', host: 'google', registers: ['technical'], vibe: 'geometric future sans' },
  { display: 'Unbounded', ui: 'Manrope', host: 'google', registers: ['constructed', 'cinematic'], vibe: 'expanded display sans' },
  { display: 'Panchang', ui: 'General Sans', host: 'fontshare', registers: ['constructed'], vibe: 'squared wide display' },
  { display: 'Anton', ui: 'Archivo', host: 'google', registers: ['constructed'], vibe: 'compressed poster sans' },
  { display: 'Bricolage Grotesque', ui: 'Public Sans', host: 'google', registers: ['constructed', 'editorial'], vibe: 'characterful grotesque' },
  { display: 'Familjen Grotesk', ui: 'Karla', host: 'google', registers: ['quiet', 'technical', 'material'], vibe: 'warm grotesque' },
  { display: 'Fragment Mono', ui: 'Archivo', host: 'google', registers: ['technical'], vibe: 'monospace display' },
  { display: 'Clash Display', ui: 'Satoshi', host: 'fontshare', registers: ['constructed', 'cinematic'], vibe: 'angular display grotesque' },
  { display: 'Cabinet Grotesk', ui: 'General Sans', host: 'fontshare', registers: ['editorial', 'constructed'], vibe: 'retro grotesque' },
  { display: 'Zodiak', ui: 'Switzer', host: 'fontshare', registers: ['editorial', 'material'], vibe: 'fat-face serif' },
  { display: 'Sentient', ui: 'General Sans', host: 'fontshare', registers: ['quiet', 'editorial'], vibe: 'gentle transitional serif' },
  { display: 'Boska', ui: 'Switzer', host: 'fontshare', registers: ['cinematic', 'editorial'], vibe: 'sharp fashion serif' },
  { display: 'Erode', ui: 'Satoshi', host: 'fontshare', registers: ['editorial', 'quiet'], vibe: 'ink-trap text serif' }
];

const COMPOSITION_BANK = [
  { hero: 'split-editorial', note: 'text column against a full-bleed media column, baselines locked across the seam', registers: ['editorial', 'quiet', 'material'] },
  { hero: 'type-as-image', note: 'display type leads the composition — scale and line breaks follow the actual proposition and viewport, with supporting media or none', registers: ['editorial', 'constructed', 'cinematic'] },
  { hero: 'full-bleed-stage', note: 'media or product fills the viewport under a legibility scrim, one action, UI out of the frame', registers: ['cinematic', 'material'] },
  { hero: 'offset-grid', note: 'asymmetric 12-col grid with one element overlapping the seam and one bleeding off-canvas', registers: ['editorial', 'constructed'] },
  { hero: 'centered-object', note: 'one subject in a generous field, grounded through crop, proportion or tonal separation, with nothing competing', registers: ['quiet', 'material'] },
  { hero: 'working-surface', note: 'the real working surface leads, with a compact context rail and the primary action beside the relevant data', registers: ['technical'] },
  { hero: 'signal-and-detail', note: 'one meaningful signal anchors the view, aligned with its trend, units, and a directly inspectable detail region', registers: ['technical'] },
  { hero: 'process-sequence', note: 'a precise process or product sequence leads into its active step and supporting evidence, with rules joining the regions', registers: ['technical'] },
  { hero: 'stacked-manifesto', note: 'oversized stacked display lines with one word swapped for media or color, marquee optional', registers: ['constructed', 'editorial'] },
  { hero: 'framed-plate', note: 'media in a drawn frame with hairline rules and small caps captions — a plate, not a card', registers: ['editorial', 'quiet'] },
  { hero: 'index-and-feature', note: 'a scannable list of real items beside one featured object or story; selection leads the opening instead of a generic hero', registers: ['quiet', 'editorial', 'technical'] },
  { hero: 'typographic-introduction', note: 'a compact proposition, deliberate line breaks and useful content immediately below; hierarchy comes from measure, weight and spacing', registers: ['quiet', 'editorial'] },
  { hero: 'collage-layers', note: 'overlapping color panels and cutout media at slight rotations — composed chaos with a strict palette', registers: ['constructed', 'material'] },
  { hero: 'horizontal-rail', note: 'edge-to-edge horizontal scroll rail with snap and a visible overflow cue as the first move', registers: ['cinematic', 'constructed'] },
  { hero: 'diagonal-axis', note: 'content set on one tilted axis or clipped section seams — the angle is the signature, used once', registers: ['constructed', 'cinematic'] }
];

// Names echo the visual-effects.md vocabulary — the doc owns the execution.
const REGISTER_MATERIALS = {
  technical: ['rule hierarchy', 'tonal steps', 'restrained status wash'],
  quiet: ['tonal steps', 'image-led ground', 'radial wash', 'grain and noise'],
  editorial: ['rule hierarchy', 'tonal steps', 'image-led ground', 'grain and noise'],
  material: ['grain and noise', 'dither and halftone', 'image-led ground', 'tonal steps'],
  constructed: ['dither and halftone', 'conic ring', 'tonal steps'],
  cinematic: ['radial wash', 'grain and noise', 'ambient drift', 'image-led ground']
};
const MATERIALS = [...new Set(Object.values(REGISTER_MATERIALS).flat())];
// Proposals, not obligations: the brief and existing interaction system win.
const REGISTER_MOTIONS = {
  technical: ['state feedback', 'static'],
  quiet: ['static', 'entrance reveal', 'state feedback'],
  editorial: ['static', 'state feedback', 'entrance reveal'],
  material: ['state feedback', 'entrance reveal', 'static'],
  constructed: ['static', 'entrance reveal', 'scroll-driven'],
  cinematic: ['entrance reveal', 'scroll-driven', 'animated backdrop']
};

const RHYTHMS = ['96/128px desktop, 48/64px mobile', '112/160px desktop, 56/72px mobile', '80/120px desktop, 48/64px mobile'];
const TECHNICAL_RHYTHMS = ['24/32px desktop, 16/24px mobile', '32/48px desktop, 16/24px mobile'];

const SCHEMES = ['mono', 'analogous', 'complementary', 'split-complementary', 'triadic', 'duo-accent', 'color-block'];

// Pole = where the ground sits. 'chromatic' is a saturated color field —
// the register shapes how far each posture reaches for it.
const POLE_WEIGHTS = {
  technical: [['light', 0.45], ['dark', 0.45], ['chromatic', 0.1]],
  quiet: [['light', 0.6], ['dark', 0.3], ['chromatic', 0.1]],
  editorial: [['light', 0.55], ['dark', 0.3], ['chromatic', 0.15]],
  material: [['light', 0.4], ['dark', 0.4], ['chromatic', 0.2]],
  constructed: [['light', 0.3], ['dark', 0.3], ['chromatic', 0.4]],
  cinematic: [['dark', 0.7], ['light', 0.15], ['chromatic', 0.15]],
  default: [['light', 0.4], ['dark', 0.35], ['chromatic', 0.25]]
};

const SCHEME_WEIGHTS = {
  technical: [['mono', 0.35], ['duo-accent', 0.25], ['analogous', 0.2], ['complementary', 0.2]],
  quiet: [['mono', 0.45], ['analogous', 0.35], ['complementary', 0.2]],
  editorial: [['mono', 0.3], ['complementary', 0.25], ['analogous', 0.25], ['split-complementary', 0.2]],
  material: [['analogous', 0.35], ['complementary', 0.3], ['mono', 0.2], ['duo-accent', 0.15]],
  constructed: [['color-block', 0.3], ['triadic', 0.25], ['complementary', 0.25], ['duo-accent', 0.2]],
  cinematic: [['mono', 0.35], ['duo-accent', 0.3], ['complementary', 0.2], ['analogous', 0.15]],
  default: [['mono', 0.2], ['analogous', 0.2], ['complementary', 0.2], ['split-complementary', 0.1], ['triadic', 0.1], ['duo-accent', 0.1], ['color-block', 0.1]]
};

module.exports = { REGISTERS, POLES, SCHEMES, TYPEFACE_BANK, COMPOSITION_BANK, REGISTER_MATERIALS, REGISTER_MOTIONS, MATERIALS, RHYTHMS, TECHNICAL_RHYTHMS, POLE_WEIGHTS, SCHEME_WEIGHTS };
