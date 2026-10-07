'use strict';

/**
 * Static visual telemetry — build-free, browser-free measurement of a produced
 * interface.
 *
 * Every other anti-slop surface in AIOSON is prose an agent may or may not
 * honor. This one is arithmetic: it reads the HTML/CSS text that was actually
 * written and reports numbers (token adherence, spacing rhythm, depth
 * strategies, motion coverage, state coverage) plus a small set of
 * high-confidence structural defects.
 *
 * Deliberately lexical, not a parser: pure RegExp over the source text, so it
 * costs milliseconds, needs no toolchain, and behaves identically on any host
 * or model. The trade is precision — every finding here is chosen because it
 * survives that trade with a near-zero false-positive rate. Heuristics that
 * would need a DOM, a rendered layout, or taste (hero evidence, card walls,
 * "is this generic") are deliberately NOT findings: they stay metrics, or they
 * stay with the reviewing agent. A gate that cries wolf gets ignored.
 *
 * Scope: self-contained prototypes and CSS-authored front-ends. A utility-class
 * codebase (Tailwind and friends) expresses tokens in markup, so the adherence
 * and rhythm metrics do not describe it — `analyzeVisualSources` reports
 * `applicable: false` rather than inventing a verdict.
 */

const { parseCssColor, rgbToHex } = require('./color-math');
const { scopeVisualCss, compositionFingerprint } = require('./visual-css-scope');
const {
  assessFontDelivery,
  assessMediaEvidence,
  assessModernCss,
  assessMotion,
  assessStates
} = require('./visual-assurance');

// Properties whose value should come from a design token, not a literal.
const TOKENIZABLE = new Set([
  'color', 'background', 'background-color', 'border-color', 'fill', 'stroke',
  'padding', 'padding-top', 'padding-right', 'padding-bottom', 'padding-left',
  'margin', 'margin-top', 'margin-right', 'margin-bottom', 'margin-left',
  'gap', 'row-gap', 'column-gap', 'border-radius', 'font-size', 'box-shadow'
]);

// Properties that carry the spacing rhythm. Off-grid values here are the
// single most reliable tell of hand-tuned, systemless spacing.
const SPACING_PROPS = new Set([
  'padding', 'padding-top', 'padding-right', 'padding-bottom', 'padding-left',
  'margin', 'margin-top', 'margin-right', 'margin-bottom', 'margin-left',
  'gap', 'row-gap', 'column-gap'
]);

const SPACING_GRID = 4;

const LITERAL_VALUE = /#[0-9a-fA-F]{3,8}\b|\b(?:rgba?|hsla?)\s*\(|(?:^|[\s(,:])-?\d*\.?\d+(?:px|rem|em)\b/;

// Elements that never open a container frame: void elements, plus the two that
// carry non-markup payloads.
const VOID_OR_OPAQUE = new Set([
  'script', 'style', 'br', 'img', 'input', 'hr', 'meta', 'link', 'source', 'track', 'area', 'col', 'embed', 'wbr'
]);

const INTERACTIVE = /<button|<input|<select|<textarea|<form|addEventListener|onclick=/i;

// ── interaction contracts (forms, confirmation, drag-and-drop, widgets) ──────
// Lexical mirrors of the .aioson/rules/ interaction contracts. Same trade as
// everything else in this file: the one near-zero-FP defect (a native browser
// dialog, contractually banned in prototypes) is an issue; the rest are
// presence/absence measurements a reviewer judges in context.

// Bare or window-qualified native dialog call. `(?<![\w$./])` rejects method
// calls on other objects (`modal.confirm(`), identifiers that merely end in
// the name (`showConfirm(`), and URL paths (`example.com/confirm(guide)`);
// Portuguese verbs (`confirmar(`) fail the `\s*\(`.
const NATIVE_DIALOG = /(?<![\w$./])(?:window\s*\.\s*)?(alert|confirm|prompt)\s*\(/g;

// Field-identity words that imply a structured format. Deliberately excludes
// bare `date`/`data` (the fix is type="date", and pt-BR "data" is too common).
const STRUCTURED_FIELD = /cpf|cnpj|\bcep\b|postal|zipcode|zip.?code|phone|telefone|celular|whatsapp|cart[aã]o|card.?number|nascimento|moeda|currency|pre[cç]o|price|valor/i;

// Input types that already carry semantics; a structured field using one of
// these is not a bare text input.
const SEMANTIC_INPUT_TYPES = new Set(['tel', 'email', 'number', 'date', 'time', 'datetime-local', 'month', 'week', 'url']);

const DESTRUCTIVE_CONTROL = /excluir|deletar|apagar|\bdelete\b|\bremove\b|remover|destroy|desativar|deactivate|arquivar|\barchive\b/i;
const DIALOG_MARKERS = /<dialog\b|role\s*=\s*["']dialog["']|aria-modal|\bmodal\b|\bconfirm(?:ation)?-dialog\b/i;

const KANBAN_MARKERS = /\bkanban\b|\bpipeline\b[\s\S]{0,600}\bstage\b|\bboard\b[\s\S]{0,600}\b(column|lane|coluna)\b/i;
const DND_MARKERS = /\bdraggable\s*=|dragstart|dragover|dragend|ondrop\b|\bsortable\b|\bdnd\b|pointerdown/i;

const MANAGEMENT_MARKERS = /\b(dashboard|cockpit|crm|erp|back.?office|painel|admin)\b/i;
const WIDGET_MARKERS = /\b(widget|kpi|chart|metric|m[eé]trica|indicador|sparkline|graph|gr[aá]fico)\b|<canvas\b/i;

/** Text of every `<script>` block plus inline `on*=` handler values. */
function extractScriptText(html) {
  const markup = String(html || '');
  const out = [];
  const scriptRe = /<script\b[^>]*>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = scriptRe.exec(markup))) out.push(m[1]);
  const handlerRe = /\bon\w+\s*=\s*("[^"]*"|'[^']*')/gi;
  while ((m = handlerRe.exec(markup))) out.push(m[1].slice(1, -1));
  return out.join('\n');
}

/** `<input …>` tags whose identity implies a structured format but whose attributes carry no input semantics. */
function bareStructuredInputs(html) {
  const out = [];
  const re = /<input\b([^>]*)>/gi;
  let m;
  while ((m = re.exec(String(html || '')))) {
    const attrs = m[1] || '';
    const attr = (name) => {
      const found = attrs.match(new RegExp(`\\b${name}\\s*=\\s*("[^"]*"|'[^']*')`, 'i'));
      return found ? found[1].slice(1, -1) : null;
    };
    const identity = [attr('name'), attr('id'), attr('placeholder'), attr('aria-label')].filter(Boolean).join(' ');
    if (!identity || !STRUCTURED_FIELD.test(identity)) continue;
    const type = (attr('type') || 'text').toLowerCase();
    const hasSemantics =
      SEMANTIC_INPUT_TYPES.has(type) ||
      /\binputmode\s*=|\bpattern\s*=|\bmaxlength\s*=|\bautocomplete\s*=/i.test(attrs) ||
      /mask/i.test(`${attr('class') || ''} ${attrs.match(/\bdata-[\w-]*mask[\w-]*/i) || ''}`);
    if (!hasSemantics) out.push(identity.trim().slice(0, 60));
  }
  return out;
}

const CARD_TAG = /^(div|section|article|li|aside)$/i;
const CARD_CLASS = /\b(card|panel|tile|widget)\b/i;

// Emoji standing in for icons. The range covers pictographs, symbols and
// dingbats; the allowlist removes the handful of dingbats UI text uses
// deliberately (checkmarks, crosses, stars), because those are typography,
// not icon-faking. Warning tier: emoji inside seeded mock CONTENT (a chat
// message, a reaction) is legitimate and only a reviewer can tell.
const EMOJI_GLYPH = /[\u{1F1E6}-\u{1F1FF}\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu;
const EMOJI_ALLOWED = new Set(['✓', '✔', '✕', '✖', '✗', '✘', '★', '☆']);

// Spaced em dashes in prose position — the most recognizable model-writing
// cadence. Scattered microcopy (toasts, placeholders, tour steps, seeded mock
// data) hides it from sentence-level review: each instance reads as one
// deliberate em dash while the corpus saturates, so the check counts the whole
// surface. Code punctuation never spaces an em dash, which keeps the lexical
// count near-zero false positive. Warning tier with a threshold: a couple of
// deliberate interruptions are legitimate typography.
const EM_DASH_PROSE = /\s—\s/g;
const EM_DASH_PROSE_THRESHOLD = 4;

// ── generation tells (the measured shape of "looks generated") ───────────────
// Category defaults every generative prior converges on: recognizable enough
// that a reader dates the surface on sight, cheap enough to detect lexically.
// All of them are warnings — a brief or a register can earn most of them back,
// and each warning names what replaces the reflex. The one exception in spirit
// is the kicker: no brief earns a label above a heading back.

// Faces so saturated in generated output that the reader cannot tell a
// deliberate choice from a default. Flagged only in the DISPLAY role (or as a
// surface's only family) — a workhorse UI face on a task surface is sanctioned.
const SATURATED_DISPLAY_FACES = new Set([
  'inter', 'roboto', 'open sans', 'lato', 'montserrat',
  'fraunces', 'instrument sans', 'instrument serif', 'geist', 'geist sans',
  'geist mono', 'mona sans', 'plus jakarta sans', 'space grotesk', 'space mono',
  'recoleta', 'playfair display', 'cormorant', 'cormorant garamond', 'lora',
  'crimson text', 'crimson pro', 'newsreader', 'syne', 'ibm plex sans',
  'ibm plex serif', 'ibm plex mono', 'dm sans', 'dm serif display',
  'dm serif text', 'outfit'
]);

// Selector contexts where a colored side border is state, not decoration.
const SIDE_BORDER_EXEMPT = /blockquote|\btab\b|active|selected|current|alert|toast|callout|status|notif|badge|\bnav\b/i;

// Kicker/eyebrow: a small tracked label sitting directly above a heading.
const KICKER_CLASS_NAME = /(eyebrow|kicker|overline|pre-?head(?:ing)?|pre-?title|suprat[ií]tulo)/i;
// Class names that mark a control or navigation item — the uppercase-tracked
// signature is conventional there and never reads as a kicker.
const CONTROL_CLASS_NAME = /(?:^|[-_])(?:btn|button|nav|link|menu|tab|tabs|badge|chip|tag|pill|cell|th|breadcrumbs?|crumb)(?:[-_]|$)/i;

// The universal generated feature-card template: icon tile, then heading.
const ICON_TILE_STACK = /<(?:div|span)\b[^>]*class\s*=\s*["'][^"']*\bicon[^"']*["'][^>]*>\s*<(?:svg|i|img)\b[\s\S]{0,300}?<\/(?:div|span)>\s*<h[1-6]\b/gi;

// Marketing filler in visible copy. Short on purpose: every entry is a word
// whose presence is the claim it is hiding.
// `última` opens with a non-word char, where \b never matches — it gets its
// own unanchored alternative.
const BUZZWORDS = /\b(?:streamlin(?:e|es|ed|ing)|empower(?:s|ed|ing)?|supercharg(?:e|es|ed|ing)|world-class|enterprise-grade|next-gen(?:eration)?|cutting-edge|game-chang(?:er|ers|ing)|best-in-class|revolucion(?:e|a|am|ária|ário|árias|ários)|potencialize)\b|[úu]ltima geração/gi;

// "Not just X. It's Y." — the strongest model-writing cadence there is.
const NEGATION_PIVOTS = [
  /\bnot\s+(?:just|only|merely)\s+[^.!?\n]{2,60}[.!?—:;]\s*(?:it'?s|it\s+is|this\s+is)\b/gi,
  // `\w` stops at accents ("relatório", "decisão") — letters are matched as
  // Unicode letters so the pt-BR cadence counts the same as the English one.
  // A sentence also starts right after a tag (`<p>Não um relatório.`) — the
  // corpus keeps its markup, so `>` is a sentence boundary too.
  /(?:^|[.!?]\s+|>\s*)(?:not|não)\s+(?:a|an|um|uma)\s+[\p{L}\p{M}\p{N}_]+(?:\s+[\p{L}\p{M}\p{N}_]+)?\.\s+(?:a|an|um|uma)\s+[\p{L}\p{M}\p{N}_]+/giu,
  // `é` is a non-word char, so \b never closes it — require whitespace instead.
  /\bnão\s+é\s+(?:só|apenas)\s+[^.!?\n]{2,60}[.!?—:;,]\s*é\s/gi
];

const TINY_TEXT_FLOOR_PX = 11; // functional text floor

// Browser-owned surfaces a built (not assembled) page themes from its palette:
// stock selection color, caret, scrollbars, focus ring, underline geometry and
// proportional digits in data are the cheapest tell that nobody looked.
const BROWSER_SURFACE_PROBES = [
  { name: '::selection', re: /::selection\b/ },
  { name: 'caret-color', re: /caret-color\s*:/i },
  { name: 'scrollbar', re: /scrollbar-(?:width|color|gutter)\s*:|::-webkit-scrollbar/i },
  { name: ':focus-visible', re: /:focus-visible\b/ },
  { name: 'underline tuning', re: /text-underline-offset\s*:|text-decoration-thickness\s*:/i },
  { name: 'tabular numerals', re: /font-variant-numeric\s*:|tabular-nums/i }
];

// Prototype affordance markers. `data-aioson-id` is the build contract's anchor
// attribute, so its presence identifies an AIOSON prototype; only then are the
// tour and primary-feature markers expected.
const PROTOTYPE_ANCHOR = /data-aioson-id\s*=/i;
const PRIMARY_MARKER = /data-aioson-primary\b/i;
const TOUR_MARKER = /data-aioson-tour\b/i;

// ── surface mode (vq-026) ────────────────────────────────────────────────────
// What did the visitor come here to do? The premium bar flips with the answer:
// an operate surface (dashboard, admin, editor, settings, recurring CRUD) earns
// familiarity — one workhorse family, fixed scale, restrained accent — and the
// craft floor is spent on precision, density and themed browser chrome, not on
// display type and atmosphere. Without this detector the telemetry pushed
// against its own node: an admin table was told its display face was saturated
// and its hero type too small. Measured from structure; a declared mode (the
// prototype manifest's `surface_mode`) outranks the detection.
const OPERATE_SIGNALS = [
  { name: 'management markers', weight: 2, test: (markup) => MANAGEMENT_MARKERS.test(markup) },
  { name: 'data table', weight: 2, test: (markup) => /<table\b/i.test(markup) && (markup.match(/<th\b/gi) || []).length >= 3 },
  { name: 'data grid', weight: 1, test: (markup) => /role\s*=\s*["'](?:grid|treegrid)["']|aria-rowcount|\bdata-grid\b|\bag-grid\b|\bdatagrid\b/i.test(markup) },
  { name: 'sidebar shell', weight: 1, test: (markup) => /<main\b/i.test(markup) && /<aside\b|class\s*=\s*["'][^"']*\b(?:sidebar|sidenav|side-nav|app-shell|workspace|topbar)\b/i.test(markup) },
  { name: 'dense forms', weight: 1, test: (markup) => (markup.match(/<(?:input|select|textarea)\b/gi) || []).length >= 6 },
  { name: 'board / drag-and-drop', weight: 1, test: (markup) => KANBAN_MARKERS.test(markup) || DND_MARKERS.test(markup) },
  { name: 'toolbar / tabs', weight: 1, test: (markup) => /role\s*=\s*["'](?:toolbar|tablist|menubar)["']|class\s*=\s*["'][^"']*\b(?:toolbar|tabs|tablist)\b/i.test(markup) }
];
const MARKETING_SECTION = /(?:class|id)\s*=\s*["'][^"']*\b(?:pricing|testimonials?|depoimentos?|faq|features?|beneficios|benefits|cta|newsletter|clientes|clients|logos|planos|plans|manifesto|showcase)\b/gi;
const BRAND_SIGNALS = [
  { name: 'display type', weight: 2, test: (markup, ctx) => ctx.maxFontPx >= DISPLAY_TYPE_FLOOR_PX },
  { name: 'hero section', weight: 2, test: (markup) => /class\s*=\s*["'][^"']*\bhero\b/i.test(markup) },
  { name: 'marketing sections', weight: 1, test: (markup) => (markup.match(MARKETING_SECTION) || []).length >= 2 },
  { name: 'section rhythm', weight: 1, test: (markup) => (markup.match(/<section\b/gi) || []).length >= 4 },
  { name: 'landing markers', weight: 1, test: (markup) => /<title[^>]*>[^<]*\b(?:landing|home|site|oficial|official)\b/i.test(markup) || /class\s*=\s*["'][^"']*\blanding\b/i.test(markup) }
];
const SURFACE_MODE_FLOOR = 3;
const DECLARED_MODES = new Map([
  ['operate', 'operate'], ['operar', 'operate'], ['admin', 'operate'], ['dashboard', 'operate'], ['tool', 'operate'], ['app', 'operate'],
  ['brand', 'brand'], ['persuade', 'brand'], ['persuadir', 'brand'], ['decide', 'brand'], ['decidir', 'brand'], ['landing', 'brand'], ['site', 'brand'], ['marketing', 'brand'], ['showcase', 'brand'], ['inhabit', 'brand'], ['habitar', 'brand'],
  ['read', 'read'], ['ler', 'read'], ['editorial', 'read'], ['docs', 'read'], ['documentation', 'read']
]);

/**
 * Surface mode of the corpus: 'operate' | 'brand' | 'read' | 'mixed' | 'unknown',
 * with the signals that decided it. `declared` (manifest) wins when valid.
 */
function detectSurfaceMode({ markup, maxFontPx, declared = null }) {
  const declaredMode = declared ? DECLARED_MODES.get(String(declared).trim().toLowerCase()) : null;
  const ctx = { maxFontPx };
  const operate = OPERATE_SIGNALS.filter((s) => s.test(markup, ctx));
  const brand = BRAND_SIGNALS.filter((s) => s.test(markup, ctx));
  const operateScore = operate.reduce((sum, s) => sum + s.weight, 0);
  const brandScore = brand.reduce((sum, s) => sum + s.weight, 0);
  // Mixed only when both bars are genuinely in play — a dashboard with one
  // `.hero` panel and a few sections is an operate surface, not a tie.
  let detected = 'unknown';
  const both = operateScore >= SURFACE_MODE_FLOOR && brandScore >= SURFACE_MODE_FLOOR;
  const close = Math.min(operateScore, brandScore) >= Math.max(operateScore, brandScore) * 0.6;
  if (both && close) detected = 'mixed';
  else if (operateScore >= SURFACE_MODE_FLOOR && operateScore >= brandScore) detected = 'operate';
  else if (brandScore >= SURFACE_MODE_FLOOR) detected = 'brand';
  return {
    mode: declaredMode || detected,
    source: declaredMode ? 'declared' : 'detected',
    detected,
    operate_score: operateScore,
    brand_score: brandScore,
    operate_signals: operate.map((s) => s.name),
    brand_signals: brand.map((s) => s.name)
  };
}

// Utility-class styling (Tailwind and friends) keeps its decisions in class
// attributes, not declarations: a corpus can carry 10–149 authored declarations
// and thousands of utility tokens. That is an app the static craft axis cannot
// read — a reported state, not a fragment to stay silent about.
const UTILITY_CLASS_TOKEN = /^(?:(?:sm|md|lg|xl|2xl|hover|focus|active|dark|group-hover|disabled|first|last|odd|even):)*(?:flex|grid|block|inline(?:-\w+)?|hidden|relative|absolute|fixed|sticky|container|truncate|sr-only|[pm][xytblr]?-\d+(?:\.\d+)?|-?[pm][xytblr]?-\d|gap(?:-[xy])?-\d+|w-(?:\d+|full|screen|auto|\[.+\])|h-(?:\d+|full|screen|auto|\[.+\])|min-[wh]-\w+|max-[wh]-\w+|text-(?:[a-z]+-\d{2,3}|xs|sm|base|lg|xl|\dxl|left|center|right|white|black)|bg-(?:[a-z]+-\d{2,3}|white|black|transparent)|border(?:-[a-z]+-\d{2,3}|-\d|-t|-b|-l|-r)?|rounded(?:-\w+)?|shadow(?:-\w+)?|font-(?:\w+)|leading-\w+|tracking-\w+|items-\w+|justify-\w+|self-\w+|space-[xy]-\d+|overflow-\w+|z-\d+|opacity-\d+|transition(?:-\w+)?|duration-\d+|ease-\w+|cursor-\w+|select-\w+|outline-\w+|ring(?:-\w+)?|divide-\w+|col-span-\d+|row-span-\d+|grid-cols-\d+|order-\d+|object-\w+|aspect-\w+|place-\w+|antialiased|uppercase|lowercase|capitalize|italic|underline|whitespace-\w+)$/;

/** Share of class tokens that read as utility classes, with the count. */
function utilityClassDensity(markup) {
  let tokens = 0;
  let utility = 0;
  for (const attr of String(markup || '').matchAll(/class\s*=\s*["']([^"']+)["']/gi)) {
    for (const token of attr[1].split(/\s+/).filter(Boolean)) {
      tokens += 1;
      if (UTILITY_CLASS_TOKEN.test(token)) utility += 1;
    }
  }
  return { tokens, utility, share: tokens ? Math.round((utility / tokens) * 100) / 100 : 0 };
}

// ── craft floor (the measured half of "premium") ─────────────────────────────
// Hygiene metrics prove discipline; none of them can see ambition. A surface
// with perfect tokens, perfect rhythm and OS-default typography reads as a
// default document — the measured shape of "cheap". The craft axis counts the
// levers that separate a designed surface from a hygienic one: a delivered
// typeface, display-scale type, material depth, motion choreography, and
// evidence imagery. Each lever is a fact provable from the text; only the
// aggregate is judgment, and it stays a warning.
//
// Small corpora (component demos, unit fixtures, fragments) are not surfaces —
// the craft axis only measures documents with a real amount of authored CSS.
const CRAFT_MIN_DECLARATIONS = 150;
const CRAFT_LEVER_FLOOR = 2; // warn at <= 2 of 5 active
const CRAFT_WEIGHT_BAR = 60; // brand surfaces: graded ambition out of 100
const CRAFT_PRECISION_BAR = 60; // operate/read surfaces: graded familiarity out of 100
const DISPLAY_TYPE_FLOOR_PX = 56; // 3.5rem — where display typography starts

const CSS_WIDE_KEYWORDS = new Set(['inherit', 'initial', 'unset', 'revert', 'revert-layer']);

/** Strip CSS comments so commented-out code never counts as a measurement. */
function stripComments(css) {
  return String(css || '').replace(/\/\*[\s\S]*?\*\//g, '');
}

/**
 * Strip HTML comments so commented-out markup never counts as a measurement.
 * A design-rationale header saying "not admin density" must not read as a
 * management surface, and a commented-out `<input name="cpf">` is not a bare
 * structured field.
 */
function stripHtmlComments(html) {
  return String(html || '').replace(/<!--[\s\S]*?-->/g, '');
}

/**
 * Strip JS comments before the native-dialog scan — a commented-out
 * `// confirm('...')` must never fire the blocking tier. Lexical like
 * everything here: `//` preceded by `:` survives so string URLs are safe;
 * a `//` inside another string may over-strip its line, which trades a rare
 * false negative for the tier's near-zero-false-positive promise.
 */
function stripJsComments(js) {
  return String(js || '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:\\])\/\/[^\n]*/gm, '$1');
}

// ── component sources (JSX/TSX, Vue/Svelte/Astro SFCs, CSS-in-JS) ──────────
// A framework app keeps its markup in components and its styles in three
// places: stylesheets, SFC <style> blocks, and tagged template literals. The
// measurement reads all of them or it measures a different product than the
// one shipped: reading only the .css files reported every token a component
// referenced from a style prop as dead finish (and the dev doctrine then told
// the agent to delete live finish), and counted zero copy in an app holding
// hundreds of user-facing strings.
const CSS_IN_JS_TAG = /\b(?:styled|css|keyframes|createGlobalStyle|injectGlobal)\b(?:\.[A-Za-z]\w*|\((?:[^()]|\([^()]*\))*\))?(?:\.attrs\((?:[^()]|\([^()]*\))*\))?\s*`/g;

/**
 * Index of the backtick that closes a template literal whose body starts at
 * `from`, honoring `\`` escapes and `${ … }` nesting (an expression may hold
 * another template literal). -1 when the literal never closes.
 */
function closingBacktick(src, from) {
  let depth = 0;
  for (let i = from; i < src.length; i += 1) {
    const ch = src[i];
    if (ch === '\\') { i += 1; continue; }
    if (depth === 0) {
      if (ch === '`') return i;
      if (ch === '$' && src[i + 1] === '{') { depth = 1; i += 1; }
      continue;
    }
    if (ch === '{') depth += 1;
    else if (ch === '}') depth -= 1;
    else if (ch === '`') {
      const end = closingBacktick(src, i + 1);
      if (end === -1) return -1;
      i = end;
    }
  }
  return -1;
}

/** A template-literal body with every `${ … }` interpolation blanked to a neutral `0`. */
function blankInterpolations(body) {
  let out = '';
  let i = 0;
  while (i < body.length) {
    if (body[i] === '$' && body[i + 1] === '{') {
      let depth = 1;
      let j = i + 2;
      while (j < body.length && depth > 0) {
        if (body[j] === '{') depth += 1;
        else if (body[j] === '}') depth -= 1;
        j += 1;
      }
      out += ' 0 ';
      i = j;
      continue;
    }
    out += body[i];
    i += 1;
  }
  return out;
}

/**
 * Split component source text into the markup the telemetry reads as HTML
 * and the CSS it reads as stylesheet: tagged template literals (styled-
 * components, Emotion, Linaria, `keyframes`) become CSS; the rest is markup
 * with `className=` normalized to `class=` so the HTML patterns see JSX. SFC
 * `<style>` blocks stay in the markup — `extractStyleBlocks` already lifts
 * them. JS comments go first so a commented-out `confirm()` never fires.
 *
 * @param {string} text Concatenated component sources.
 * @returns {{markup: string, css: string}}
 */
function componentSources(text) {
  const src = stripJsComments(String(text || ''));
  const css = [];
  let markup = '';
  let last = 0;
  let m;
  CSS_IN_JS_TAG.lastIndex = 0;
  while ((m = CSS_IN_JS_TAG.exec(src))) {
    const start = m.index + m[0].length;
    const end = closingBacktick(src, start);
    if (end === -1) break;
    css.push(blankInterpolations(src.slice(start, end)));
    markup += src.slice(last, m.index);
    last = end + 1;
    CSS_IN_JS_TAG.lastIndex = last;
  }
  markup += src.slice(last);
  return { markup: markup.replace(/\bclassName\s*=/g, 'class='), css: css.join('\n') };
}

/** Collect the text of every `<style>` block in an HTML document. */
// ─── embedded asset zones ──────────────────────────────────────────────────
// A data-URI font or image inflates the file the next polish pass has to
// read: measured on consumer prototypes, one 1.8 MB document was 98% base64
// and its 155 KB stylesheet was 139 KB of WOFF2 — every surgical pass reread
// font bytes to find a rule. The build contract quarantines embedded bytes in
// one trailing zone (`<style data-aioson-assets>` for fonts, a JSON
// `<script data-aioson-assets>` for images/media); this profile measures how
// much base64 still sits among authored CSS and markup.
const DATA_URI_RE = /data:([a-z0-9.+/-]+);base64,[A-Za-z0-9+/=]+/gi;
const EMBEDDED_ASSET_ZONE_MIN_BYTES = 32 * 1024;
const EMBEDDED_ASSET_ZONE_SHARE = 0.25;

function embeddedAssetProfile(html) {
  const source = String(html || '');
  const kinds = {};
  const count = (text) => {
    let bytes = 0;
    for (const match of text.matchAll(DATA_URI_RE)) {
      bytes += match[0].length;
      const kind = match[1].split('/')[0];
      kinds[kind] = (kinds[kind] || 0) + match[0].length;
    }
    return bytes;
  };
  let authoredStyle = 0;
  let authoredStyleLength = 0;
  let quarantined = 0;
  const zones = [];
  for (const match of source.matchAll(/<style\b([^>]*)>([\s\S]*?)<\/style>/gi)) {
    const bytes = count(match[2]);
    if (/data-aioson-assets/i.test(match[1])) quarantined += bytes;
    else { authoredStyle += bytes; authoredStyleLength += match[2].length; }
    zones.push(match[0]);
  }
  for (const match of source.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
    if (!/data-aioson-assets/i.test(match[1])) continue;
    quarantined += count(match[2]);
    zones.push(match[0]);
  }
  let markupRest = source;
  for (const zone of zones) markupRest = markupRest.replace(zone, '');
  const markupBytes = count(markupRest);
  return {
    bytes: authoredStyle + quarantined + markupBytes,
    authored_style_bytes: authoredStyle,
    authored_style_share_pct: authoredStyleLength ? Math.round((authoredStyle / authoredStyleLength) * 100) : 0,
    markup_bytes: markupBytes,
    markup_share_pct: markupRest.length ? Math.round((markupBytes / markupRest.length) * 100) : 0,
    quarantined_bytes: quarantined,
    kinds
  };
}

function extractStyleBlocks(html) {
  const out = [];
  const re = /<style\b[^>]*>([\s\S]*?)<\/style>/gi;
  let m;
  while ((m = re.exec(String(html || '')))) out.push(m[1]);
  return out.join('\n');
}

/** Flat (property, value) pairs from CSS text. At-rule preludes are skipped. */
function declarations(css) {
  const out = [];
  const re = /([-a-zA-Z]+)\s*:\s*([^;{}]+)/g;
  let m;
  while ((m = re.exec(css))) {
    out.push({ prop: m[1].toLowerCase(), value: m[2].trim() });
  }
  return out;
}

/** Flat rule blocks — `selector { body }`. Nested at-rules yield their inner blocks. */
function ruleBlocks(css) {
  const out = [];
  const re = /([^{}]+)\{([^{}]*)\}/g;
  let m;
  while ((m = re.exec(css))) {
    out.push({ selector: m[1].trim(), body: m[2] });
  }
  return out;
}

/** Split a CSS value on top-level commas — commas inside function calls stay put. */
function topLevelSplit(value) {
  const out = [];
  let depth = 0;
  let current = '';
  for (const ch of String(value || '')) {
    if (ch === '(') depth += 1;
    else if (ch === ')') depth -= 1;
    if (ch === ',' && depth === 0) {
      out.push(current);
      current = '';
      continue;
    }
    current += ch;
  }
  if (current.trim()) out.push(current);
  return out;
}

/** Map of `--custom-property` → raw value across the corpus. Last write wins. */
function customProperties(css) {
  const out = {};
  const re = /(--[\w-]+)\s*:\s*([^;{}]+)/g;
  let m;
  while ((m = re.exec(String(css || '')))) out[m[1]] = m[2].trim();
  return out;
}

/**
 * Resolve `var(--x, fallback)` chains against the corpus's own custom
 * properties, depth-limited. This is what lets typography metrics see through
 * a token system — `font-family: var(--font-display)` was invisible to the
 * measurement before, which is how a surface reported "fonts 0" while
 * rendering Georgia.
 */
function resolveCustomProps(value, props, depth = 0) {
  if (depth > 4 || !/var\(/.test(String(value || ''))) return String(value || '');
  const re = /var\(\s*(--[\w-]+)\s*(?:,\s*([^()]*(?:\([^()]*\)[^()]*)*))?\)/g;
  const replaced = String(value).replace(re, (all, name, fallback) => {
    if (props[name] != null) return resolveCustomProps(props[name], props, depth + 1);
    if (fallback != null) return resolveCustomProps(fallback, props, depth + 1);
    return all;
  });
  return replaced;
}

/**
 * A font-size value in px, or null. rem/em resolve against 16; `clamp()` reads
 * its maximum arm — fluid type is judged by where it is allowed to grow — and
 * `calc()` sums its absolute terms (`calc(1rem + 2px)` is 18, not the 2 of
 * its first px token; viewport terms are unknowable statically and ignored).
 */
function fontSizePx(value) {
  let v = String(value || '').trim();
  const clamp = v.match(/clamp\(([\s\S]*)\)/i);
  if (clamp) {
    const arms = topLevelSplit(clamp[1]);
    v = (arms[arms.length - 1] || v).trim();
  }
  if (/calc\(/i.test(v)) {
    // Signed sum of the absolute-length terms: `2rem - 2px` → 30.
    const signed = v.replace(/calc\(|\)/gi, ' ').replace(/\s-\s*(?=\d|\.)/g, ' + -');
    let total = 0;
    let found = false;
    for (const m of signed.matchAll(/(-?\d*\.?\d+)(px|rem|em)\b/g)) {
      found = true;
      total += m[2] === 'px' ? Number(m[1]) : Number(m[1]) * 16;
    }
    return found ? Math.abs(total) : null;
  }
  let m;
  if ((m = v.match(/(-?\d*\.?\d+)px\b/))) return Math.abs(Number(m[1]));
  if ((m = v.match(/(-?\d*\.?\d+)rem\b/))) return Math.abs(Number(m[1])) * 16;
  if ((m = v.match(/(-?\d*\.?\d+)em\b/))) return Math.abs(Number(m[1])) * 16;
  return null;
}

/** px values in a declaration value, as absolute numbers. */
function pxValues(value) {
  const out = [];
  const re = /(-?\d*\.?\d+)px\b/g;
  let m;
  while ((m = re.exec(value))) out.push(Math.abs(Number(m[1])));
  return out;
}

/**
 * Deepest simultaneous nesting of card-like containers.
 *
 * A tiny tag walker rather than a DOM: keep a stack of open frames and count how
 * many ancestors are card-like. Void and self-closing tags never open a frame.
 */
function maxCardNesting(html) {
  const re = /<(\/?)([a-zA-Z][a-zA-Z0-9-]*)\b([^>]*)>/g;
  const stack = [];
  let depth = 0;
  let max = 0;
  let m;
  while ((m = re.exec(String(html || '')))) {
    const closing = m[1] === '/';
    const tag = m[2].toLowerCase();
    const attrs = m[3] || '';
    if (VOID_OR_OPAQUE.has(tag)) continue;
    if (closing) {
      // Unwind to the matching open frame. Markup that never closes a wrapper
      // must not leave a card counted open forever.
      const idx = stack.map((frame) => frame.tag).lastIndexOf(tag);
      if (idx === -1) continue;
      while (stack.length > idx) {
        const frame = stack.pop();
        if (frame.isCard) depth -= 1;
      }
      continue;
    }
    if (/\/\s*$/.test(attrs)) continue;
    const classAttr = attrs.match(/\bclass\s*=\s*["']([^"']*)["']/i);
    const isCard = Boolean(CARD_TAG.test(tag) && classAttr && CARD_CLASS.test(classAttr[1]));
    if (isCard) {
      depth += 1;
      if (depth > max) max = depth;
    }
    stack.push({ tag, isCard });
  }
  return max;
}

/**
 * Longest run of consecutive sibling card-like elements sharing one class
 * attribute — the "uniform card wall" every generative default converges on.
 * Same lexical tag walker as `maxCardNesting`; a run is broken by any sibling
 * tag with a different (or no) card class. Restricted to card classes on
 * purpose: twenty `.row` siblings are a list, eight identical `.card` siblings
 * are the replaceability test failing in markup.
 *
 * @returns {{run: number, className: string|null}}
 */
function maxCardSiblingRun(html) {
  const re = /<(\/?)([a-zA-Z][a-zA-Z0-9-]*)\b([^>]*)>/g;
  const rootFrame = { tag: null, lastKey: null, run: 0 };
  const stack = [rootFrame];
  let best = { run: 0, className: null };
  let m;
  while ((m = re.exec(String(html || '')))) {
    const closing = m[1] === '/';
    const tag = m[2].toLowerCase();
    const attrs = m[3] || '';
    if (VOID_OR_OPAQUE.has(tag)) {
      // A void sibling (hr, img) still separates two cards visually.
      stack[stack.length - 1].lastKey = null;
      stack[stack.length - 1].run = 0;
      continue;
    }
    if (closing) {
      const idx = stack.map((frame) => frame.tag).lastIndexOf(tag);
      if (idx > 0) stack.length = idx; // unwind to (and drop) the matching frame
      continue;
    }
    const parent = stack[stack.length - 1];
    const classAttr = attrs.match(/\bclass\s*=\s*["']([^"']*)["']/i);
    const classValue = classAttr ? classAttr[1].trim().replace(/\s+/g, ' ') : '';
    const key = CARD_TAG.test(tag) && CARD_CLASS.test(classValue) ? `${tag}.${classValue}` : null;
    if (key && key === parent.lastKey) {
      parent.run += 1;
    } else {
      parent.lastKey = key;
      parent.run = key ? 1 : 0;
    }
    if (parent.run > best.run) best = { run: parent.run, className: classValue };
    if (!/\/\s*$/.test(attrs)) stack.push({ tag, lastKey: null, run: 0 });
  }
  return best;
}

/** Unique emoji glyphs in the corpus, minus the deliberate-typography allowlist. */
function emojiGlyphs(text) {
  const out = new Set();
  for (const hit of String(text || '').matchAll(EMOJI_GLYPH)) {
    if (!EMOJI_ALLOWED.has(hit[0])) out.add(hit[0]);
  }
  return [...out];
}

/**
 * The user-visible prose corpus: markup minus styles and comments. Script
 * string/template content stays in — that is where SPA copy and seed data
 * live — but script comments are stripped (commented-out text is not on the
 * surface). Shared by every copy-cadence measurement.
 */
function visibleProse(html) {
  const noComments = stripHtmlComments(html);
  const noStyles = noComments.replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '\n');
  return noStyles.replace(
    /(<script\b[^>]*>)([\s\S]*?)(<\/script>)/gi,
    (all, open, body, close) => `${open}${stripJsComments(body)}${close}`
  );
}

/**
 * Spaced em dashes across the visible corpus, with short context samples.
 */
function emDashProse(html) {
  const corpus = visibleProse(html);
  const count = (corpus.match(EM_DASH_PROSE) || []).length;
  const samples = [];
  const sampleRe = /([^\s—][^\n—]{0,21})?\s—\s(?:([^\n—]{0,21}[^\s—]))?/g;
  let m;
  while (samples.length < 3 && (m = sampleRe.exec(corpus))) {
    samples.push(`${m[1] || ''} — ${m[2] || ''}`.replace(/\s+/g, ' ').trim());
  }
  return { count, samples };
}

function escapeRegExp(text) {
  return String(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** First family of a font stack, unquoted and lowercased. */
function firstFamily(value) {
  const first = topLevelSplit(String(value || ''))[0];
  return first ? first.trim().replace(/^["']|["']$/g, '').toLowerCase() : '';
}

// A selector token that names the display role: h1/h2, or a class/id whose
// name STARTS with display|hero|title|headline (`.card-title` does not).
const DISPLAY_ROLE_SELECTOR = /(^|[\s,>+~])h[12]\b|(^|[\s,>+~.#])(?:display|hero|title|headline)\b/i;
const DISPLAY_SCALE_PX = 28;

/**
 * The family the display role renders, or null when the corpus names none.
 * Priority: a display-role token (`--font-display`, `--font-heading`), then
 * the font-family rule with the largest display-scale size, then a rule on a
 * display-role selector. The first declared family is deliberately NOT a
 * fallback — it is the body/UI face.
 */
function resolveDisplayFace({ styleText, props, families }) {
  const resolve = (value) => resolveCustomProps(value, props);
  const known = (face) => face && !CSS_WIDE_KEYWORDS.has(face) && !face.startsWith('var(') && families.has(face);
  for (const [name, value] of Object.entries(props)) {
    if (!/font/i.test(name) || !/(display|head|title|hero|h1)/i.test(name)) continue;
    const face = firstFamily(resolve(value));
    if (known(face)) return face;
  }
  let best = null;
  let bestScore = 0;
  for (const block of ruleBlocks(styleText)) {
    const familyDecl = block.body.match(/font-family\s*:\s*([^;{}]+)/i);
    if (!familyDecl) continue;
    const face = firstFamily(resolve(familyDecl[1]));
    if (!known(face)) continue;
    const sizeDecl = block.body.match(/font-size\s*:\s*([^;{}]+)/i);
    const sizePx = sizeDecl ? fontSizePx(resolve(sizeDecl[1])) : null;
    const roleSelector = DISPLAY_ROLE_SELECTOR.test(block.selector) && (sizePx === null || sizePx >= 20);
    const score = sizePx !== null && sizePx >= DISPLAY_SCALE_PX ? sizePx : (roleSelector ? DISPLAY_SCALE_PX : 0);
    if (score > bestScore) {
      best = face;
      bestScore = score;
    }
  }
  return best;
}

/**
 * Geometry of one box-shadow layer: offset-x, offset-y, blur — in px, with
 * function bodies (colors) blanked first so their numbers never read as
 * lengths. Unitless tokens only count as the literal 0 CSS allows.
 */
function shadowLayerGeometry(layer) {
  const blanked = String(layer).replace(/\([^()]*\)/g, '()');
  const lengths = [];
  for (const token of blanked.split(/\s+/)) {
    const m = token.match(/^(-?\d*\.?\d+)(px|rem|em)?$/);
    if (!m) continue;
    const n = Number(m[1]);
    if (!m[2] && n !== 0) continue;
    lengths.push(m[2] === 'rem' || m[2] === 'em' ? n * 16 : n);
  }
  return { x: lengths[0] ?? null, y: lengths[1] ?? null, blur: lengths[2] ?? 0 };
}

/** True when the (var-resolved) value carries a chromatic color literal. */
function hasChromaticColor(value, chromaFloor = 0.07) {
  const re = /#[0-9a-fA-F]{3,8}\b|(?:rgba?|hsla?|oklch)\([^()]*\)/g;
  let m;
  while ((m = re.exec(String(value || '')))) {
    const parsed = parseCssColor(m[0]);
    if (parsed && parsed.alpha >= 0.5 && parsed.oklch.c >= chromaFloor) return true;
  }
  return false;
}

/**
 * The generation-tell scan. Every heuristic here is a category default a
 * generative prior converges on; the exemptions are the contexts where the
 * same device is a deliberate design decision.
 */
function scanGenerationTells({ markup, styleText, decls, props, families, craftMeasured, operateMode = false }) {
  const resolve = (value) => resolveCustomProps(value, props);

  // gradient text — emphasis by paint instead of weight or size.
  let gradientText = 0;
  for (const { prop, value } of decls) {
    if (/^(?:-webkit-)?background-clip$/.test(prop) && /\btext\b/i.test(value)) gradientText += 1;
  }

  // block-level scans: colored side borders, chromatic zero-offset glows,
  // hard-offset block shadows, and kicker-signature classes.
  let sideBorders = 0;
  let chromaticGlow = 0;
  let blockShadow = 0;
  const kickerSignatureClasses = [];
  for (const block of ruleBlocks(styleText)) {
    const selector = String(block.selector || '');
    const body = block.body;
    const focusContext = /:focus(?:-visible|-within)?\b/.test(selector);

    if (!SIDE_BORDER_EXEMPT.test(selector)) {
      for (const side of ['left', 'right']) {
        const decl = [...body.matchAll(new RegExp(`border-${side}(?:-width)?\\s*:\\s*([^;{}]+)`, 'gi'))].pop();
        if (!decl) continue;
        const resolved = resolve(decl[1]);
        const width = Math.max(0, ...pxValues(resolved), 0);
        const colorSource = body.match(new RegExp(`border-${side}-color\\s*:\\s*([^;{}]+)`, 'i'));
        const chromatic = hasChromaticColor(resolved) || (colorSource && hasChromaticColor(resolve(colorSource[1])));
        const rounded = /border-radius\s*:\s*[^0;]/.test(body);
        if (chromatic && (width >= 3 || (rounded && width >= 2))) sideBorders += 1;
      }
    }

    for (const decl of body.matchAll(/box-shadow\s*:\s*([^;{}]+)/gi)) {
      const resolved = resolve(decl[1]);
      if (/^\s*none\b/i.test(resolved)) continue;
      for (const layer of topLevelSplit(resolved)) {
        const { x, y, blur } = shadowLayerGeometry(layer);
        if (x === null || y === null) continue;
        if (!focusContext && x === 0 && y === 0 && blur > 0 && hasChromaticColor(layer)) chromaticGlow += 1;
        if (Math.abs(x) >= 3 && Math.abs(y) >= 3 && blur === 0) blockShadow += 1;
      }
    }

    // Controls and navigation wear the same uppercase-tracked-small signature
    // by convention (nav links, buttons, badges, tabs); they are not labels
    // sitting above a heading, so their class never becomes a kicker class.
    const single = selector.match(/^\.([a-zA-Z][\w-]*)$/);
    if (single && !CONTROL_CLASS_NAME.test(single[1]) && /text-transform\s*:\s*uppercase/i.test(body)) {
      const tracking = body.match(/letter-spacing\s*:\s*([^;{}]+)/i);
      const em = tracking && tracking[1].match(/(-?\d*\.?\d+)em\b/);
      const px = tracking && tracking[1].match(/(-?\d*\.?\d+)px\b/);
      const tracked = (em && Number(em[1]) >= 0.08) || (px && Number(px[1]) >= 1.5);
      const sizeDecl = body.match(/font-size\s*:\s*([^;{}]+)/i);
      const sizePx = sizeDecl ? fontSizePx(resolve(sizeDecl[1])) : null;
      if (tracked && sizePx !== null && sizePx <= 14) kickerSignatureClasses.push(single[1]);
    }
  }

  // kicker above heading — named classes, plus the anonymous CSS signature.
  const namedKicker = markup.match(new RegExp(
    `<[a-z][a-z0-9-]*\\b[^>]*class\\s*=\\s*["'][^"']*${KICKER_CLASS_NAME.source}[^"']*["'][^>]*>[\\s\\S]{0,200}?<h[12]\\b`, 'gi'
  ));
  let kicker = namedKicker ? namedKicker.length : 0;
  for (const cls of kickerSignatureClasses) {
    if (KICKER_CLASS_NAME.test(cls)) continue; // already counted by name
    // The anonymous signature is weaker evidence than a name, so it needs the
    // kicker SHAPE: a non-interactive element that closes and is immediately
    // followed by the heading. Three uppercase nav links that happen to sit
    // within 200 chars of the hero h1, or a button ending the section before
    // the next h2, are not a label above a heading.
    const re = new RegExp(
      `<(?!a\\b|button\\b)([a-z][a-z0-9-]*)\\b[^>]*class\\s*=\\s*["'][^"']*\\b${escapeRegExp(cls)}\\b[^"']*["'][^>]*>` +
      `(?:[^<]|<(?!\\/?(?:h[1-6]|p|div|section|article|header|nav|ul|ol|li|a|button|table)\\b)[^>]*>){0,200}?` +
      `<\\/\\1>\\s*(?:<!--[\\s\\S]*?-->\\s*)*<h[12]\\b`,
      'gi'
    );
    kicker += (markup.match(re) || []).length;
  }

  ICON_TILE_STACK.lastIndex = 0;
  const iconTiles = (markup.match(ICON_TILE_STACK) || []).length;

  // saturated display faces — display-role tokens, display-scale rules, or a
  // measured surface wearing one of them as its only family.
  const saturatedFaces = new Set();
  for (const [name, value] of Object.entries(props)) {
    if (!/font/i.test(name) || !/(display|head|title|hero|h1)/i.test(name)) continue;
    const face = firstFamily(resolve(value));
    if (SATURATED_DISPLAY_FACES.has(face)) saturatedFaces.add(face);
  }
  for (const block of ruleBlocks(styleText)) {
    const familyDecl = block.body.match(/font-family\s*:\s*([^;{}]+)/i);
    if (!familyDecl) continue;
    const face = firstFamily(resolve(familyDecl[1]));
    if (!SATURATED_DISPLAY_FACES.has(face)) continue;
    const sizeDecl = block.body.match(/font-size\s*:\s*([^;{}]+)/i);
    const sizePx = sizeDecl ? fontSizePx(resolve(sizeDecl[1])) : null;
    // Display ROLE, not display substring: `.card-title`, `.subtitle` and
    // `.modal-title` are UI text — a workhorse face there is sanctioned. The
    // keyword has to start a selector token, and a rule that declares itself
    // small is UI text whatever it is called.
    const displaySelector = DISPLAY_ROLE_SELECTOR.test(block.selector) && (sizePx === null || sizePx >= 20);
    if ((sizePx !== null && sizePx >= DISPLAY_SCALE_PX) || displaySelector) saturatedFaces.add(face);
  }
  let saturatedOnlyFamily = false;
  if (craftMeasured && families.size === 1) {
    const only = [...families][0];
    if (SATURATED_DISPLAY_FACES.has(only)) {
      saturatedFaces.add(only);
      saturatedOnlyFamily = true;
    }
  }
  // An operate surface earns familiarity: a workhorse face in its display
  // role is the reason, not the default (vq-026). The faces are still
  // reported, as sanctioned, never as a tell.
  const sanctionedFaces = operateMode ? [...saturatedFaces] : [];
  if (operateMode) saturatedFaces.clear();

  // bounce/elastic easing — keywords or an overshooting cubic-bezier.
  let bounceEasing = 0;
  for (const { prop, value } of decls) {
    if (!/^(?:transition|animation)(?:-timing-function)?$/.test(prop)) continue;
    const resolved = resolve(value);
    if (/\b(bounce|elastic)\b/i.test(resolved)) { bounceEasing += 1; continue; }
    for (const bez of resolved.matchAll(/cubic-bezier\(\s*([^)]+)\)/gi)) {
      const nums = bez[1].split(',').map((n) => Number(n.trim()));
      if (nums.length === 4 && (nums[1] < -0.05 || nums[1] > 1.05 || nums[3] < -0.05 || nums[3] > 1.05)) bounceEasing += 1;
    }
  }

  // functional text under the floor.
  const tinySizes = [];
  for (const { prop, value } of decls) {
    if (prop !== 'font-size') continue;
    const px = fontSizePx(resolve(value));
    if (px !== null && px > 0 && px < TINY_TEXT_FLOOR_PX) tinySizes.push(`${px}px`);
  }

  // copy tells over the visible corpus.
  const prose = visibleProse(markup);
  BUZZWORDS.lastIndex = 0;
  const buzzHits = prose.match(BUZZWORDS) || [];
  let negationPivots = 0;
  for (const re of NEGATION_PIVOTS) {
    re.lastIndex = 0;
    negationPivots += (prose.match(re) || []).length;
  }

  const counts = {
    gradient_text: gradientText,
    colored_side_border: sideBorders,
    kicker_above_heading: kicker,
    icon_tile_stack: iconTiles,
    chromatic_glow: chromaticGlow,
    block_shadow: blockShadow,
    saturated_display_faces: [...saturatedFaces],
    bounce_easing: bounceEasing,
    tiny_text: tinySizes.length,
    buzzwords: buzzHits.length,
    negation_pivots: negationPivots
  };

  const active = [
    gradientText > 0 && 'gradient text',
    sideBorders > 0 && 'colored side border',
    kicker > 0 && 'kicker above heading',
    iconTiles >= 3 && 'icon tile stack',
    chromaticGlow > 0 && 'chromatic glow',
    blockShadow > 0 && 'block shadow',
    saturatedFaces.size > 0 && 'saturated display face',
    bounceEasing > 0 && 'bounce easing',
    tinySizes.length > 0 && 'tiny text',
    buzzHits.length >= 2 && 'marketing buzzwords',
    negationPivots >= 2 && 'negation pivot'
  ].filter(Boolean);

  const warnings = [];
  if (gradientText > 0) {
    warnings.push(`generation tell: ${gradientText} gradient-text declaration(s) (background-clip: text) — emphasis comes from weight, size, or the accent, not from painting the letters; keep gradients in the material layer`);
  }
  if (sideBorders > 0) {
    warnings.push(`generation tell: ${sideBorders} rule(s) ride a thick colored side border — the most recognizable generated-UI signature; carry the state in a background wash, an icon, or the tokened border system instead (status/tab/blockquote contexts are already exempt)`);
  }
  if (kicker > 0) {
    warnings.push(`generation tell: ${kicker} kicker/eyebrow label(s) directly above a heading — the heading carries its own weight; delete the label and let display scale argue. No brief earns this one back`);
  }
  if (iconTiles >= 3) {
    warnings.push(`generation tell: icon-tile-above-heading repeats ${iconTiles}× — the universal generated feature-card template; inline the icon with the heading, use a real figure, or let one row carry evidence instead of a grid of tiles`);
  }
  if (chromaticGlow > 0) {
    warnings.push(`generation tell: ${chromaticGlow} zero-offset chromatic glow shadow(s) — a halo with no offset is decoration, not depth; shadows take offset and soft blur from the shadow vocabulary, and glow is reserved for live/focus states that mean something`);
  }
  if (blockShadow > 0) {
    warnings.push(`generation tell: ${blockShadow} hard-offset block shadow(s) (x y 0) — outside a genuinely neobrutalist register the unblurred block shadow is a costume, not a depth system; commit to that register fully or return to the layered soft vocabulary`);
  }
  if (saturatedFaces.size > 0) {
    const list = [...saturatedFaces].join(', ');
    warnings.push(`generation tell: saturated display face in the display role (${list}${saturatedOnlyFamily ? ', as the only family' : ''}) — the faces every model reaches for by reflex, so the reader cannot tell a choice from a default; unless an extracted identity or a named brand reason pins this face, take the draw's pairing or another face with a point of view`);
  }
  counts.sanctioned_faces = sanctionedFaces;
  if (bounceEasing > 0) {
    warnings.push(`generation tell: ${bounceEasing} bounce/elastic easing(s) — real objects decelerate, they do not wobble; use ease-out and spend the personality on choreography, not physics cosplay`);
  }
  if (tinySizes.length > 0) {
    const sample = [...new Set(tinySizes)].slice(0, 4).join(', ');
    warnings.push(`generation tell: ${tinySizes.length} font-size declaration(s) under ${TINY_TEXT_FLOOR_PX}px (${sample}) — functional text floors at ${TINY_TEXT_FLOOR_PX}px; if it matters enough to render, it matters enough to read`);
  }
  if (buzzHits.length >= 2) {
    const sample = [...new Set(buzzHits.map((w) => w.toLowerCase()))].slice(0, 5).join(', ');
    warnings.push(`copy tell: ${buzzHits.length} marketing buzzword(s) in visible copy (${sample}) — replace each with the concrete claim it is hiding: a number, a named capability, or delete the sentence`);
  }
  if (negationPivots >= 2) {
    warnings.push(`copy tell: ${negationPivots} negation pivot(s) ("not just X. It's Y") — the strongest model-writing cadence there is; state what the thing IS in one clause and cut the strawman half`);
  }

  return { counts, active, warnings };
}

/**
 * Measure one interface corpus: HTML documents, stylesheets, and component
 * sources (JSX/TSX, SFCs, CSS-in-JS — see `componentSources`).
 *
 * @param {{html?: string, css?: string, components?: string}} sources
 * @returns {{applicable: boolean, metrics: object, issues: string[], warnings: string[]}}
 */
function analyzeVisualSources({ html = '', css = '', components = '', surfaceMode = null, register = null } = {}) {
  const component = componentSources(components);
  const markup = `${stripHtmlComments(html)}\n${component.markup}`;
  const authoredStyle = stripComments(`${extractStyleBlocks(markup)}\n${String(css || '')}\n${component.css}`);
  const authoredDeclarations = declarations(authoredStyle).length;
  const cssScope = scopeVisualCss(authoredStyle, markup);
  const styleText = cssScope.css;
  const decls = declarations(styleText);

  if (authoredDeclarations < 10) {
    return {
      applicable: false,
      reason: 'not enough authored CSS to measure (fewer than 10 declarations) — utility-class markup and framework-generated styles are out of scope for static telemetry; measure the rendered result instead: --file=<built index.html> --runtime, or --url=<served app> --runtime',
      metrics: { declarations: authoredDeclarations, scoped_declarations: decls.length, css_scope: cssScope.evidence },
      issues: [],
      warnings: []
    };
  }

  // ── token adherence ──────────────────────────────────────────────────────
  let tokenized = 0;
  let literal = 0;
  for (const { prop, value } of decls) {
    if (!TOKENIZABLE.has(prop)) continue;
    if (value.includes('var(--')) tokenized += 1;
    else if (LITERAL_VALUE.test(value)) literal += 1;
  }
  const tokenTotal = tokenized + literal;
  const adherence = tokenTotal === 0 ? null : Math.round((tokenized / tokenTotal) * 100);

  // ── spacing rhythm ───────────────────────────────────────────────────────
  let onGrid = 0;
  const offGrid = [];
  for (const { prop, value } of decls) {
    if (!SPACING_PROPS.has(prop)) continue;
    for (const px of pxValues(value)) {
      if (px === 0) continue;
      if (px % SPACING_GRID === 0) onGrid += 1;
      else offGrid.push(`${prop}: ${px}px`);
    }
  }

  // ── depth strategies ─────────────────────────────────────────────────────
  const depth = { borders: 0, shadows: 0, blur: 0 };
  for (const { prop, value } of decls) {
    if (/^border(-(top|right|bottom|left))?$|^border-(width|style)$/.test(prop) && !/^\s*(none|0)\b/.test(value)) depth.borders += 1;
    if (prop === 'box-shadow' && !/^\s*none\b/.test(value)) depth.shadows += 1;
    if (prop === 'backdrop-filter' || (prop === 'filter' && /blur\s*\(/.test(value))) depth.blur += 1;
  }
  const DEPTH_FLOOR = 3;
  const activeDepth = Object.entries(depth).filter(([, n]) => n >= DEPTH_FLOOR).map(([k]) => k);

  // ── typography ───────────────────────────────────────────────────────────
  // var()-resolved: `font-family: var(--font-display)` is a token, not an
  // invisible font. The first family of each stack is what actually renders.
  const props = customProperties(styleText);
  const families = new Set();
  for (const { prop, value } of decls) {
    if (prop !== 'font-family') continue;
    const resolved = resolveCustomProps(value, props);
    const first = topLevelSplit(resolved)[0];
    const name = first ? first.trim().replace(/^["']|["']$/g, '').toLowerCase() : '';
    if (name && !name.startsWith('var(') && !CSS_WIDE_KEYWORDS.has(name)) families.add(name);
  }

  // Delivery is bound to the family actually requested. An unrelated
  // @font-face or a preconnect hint is infrastructure, not rendered type.
  const fontDelivery = assessFontDelivery({ usedFamilies: families, markup, styleText });
  const fontFaceBlocks = fontDelivery.font_face_blocks;
  const webfontLinked = fontDelivery.webfont_linked;
  const fontDelivered = fontDelivery.delivered;
  const undeliveredFamilies = fontDelivery.undelivered_families;

  // Type scale: the largest resolved font-size is where display typography
  // lives (or does not). clamp() counts at its max arm.
  let maxFontPx = 0;
  const fontSizes = new Set();
  for (const { prop, value } of decls) {
    if (prop !== 'font-size') continue;
    const px = fontSizePx(resolveCustomProps(value, props));
    if (px === null) continue;
    fontSizes.add(px);
    if (px > maxFontPx) maxFontPx = px;
  }
  const fluidType = /font-size\s*:\s*[^;{}]*clamp\(/i.test(styleText) ||
    [...Object.values(props)].some((v) => /clamp\(/.test(v) && /rem|px/.test(v));

  // The display face is the family the DISPLAY ROLE wears — a display token,
  // or the family of the largest display-scale rule — never the first
  // font-family declared (that is body/UI, which pairs with many displays and
  // made two projects "share a display face" when they merely shared Inter).
  const displayFace = resolveDisplayFace({ styleText, props, families });

  // ── motion ───────────────────────────────────────────────────────────────
  const motionAssessment = assessMotion({ markup, styleText });
  const keyframes = motionAssessment.keyframes;
  const animated = motionAssessment.animated_declarations;
  const hasReducedMotion = motionAssessment.reduced_motion_effective;
  const ambientLoops = motionAssessment.ambient_loops;

  // ── states ───────────────────────────────────────────────────────────────
  const corpus = `${markup}\n${styleText}`;
  const interactive = INTERACTIVE.test(markup);
  // `states_missing` stays a plain measurement (which markers the corpus does
  // not carry). What is CHARGED is the intersection with what this surface can
  // actually reach.
  const stateEvidence = assessStates({ markup, styleText });
  const statesPresent = stateEvidence.present;
  const statesMissing = stateEvidence.missing;
  const surfaceCapabilities = stateEvidence.capabilities;
  const statesOwed = stateEvidence.owed;
  const statesUnmet = stateEvidence.unmet;

  // ── structure ────────────────────────────────────────────────────────────
  const cardNesting = maxCardNesting(markup);
  const mediaElements = (markup.match(/<(img|video|canvas|picture)\b/gi) || []).length;
  const mediaEvidence = assessMediaEvidence({ markup, styleText });
  const cardWall = maxCardSiblingRun(markup);
  const emoji = emojiGlyphs(markup);
  const emDash = emDashProse(markup);

  // ── prototype affordances ────────────────────────────────────────────────
  const isPrototype = PROTOTYPE_ANCHOR.test(markup);
  const hasPrimaryMarker = PRIMARY_MARKER.test(markup);
  const hasTourMarker = TOUR_MARKER.test(markup);

  // ── interaction contracts ────────────────────────────────────────────────
  const scriptText = stripJsComments(extractScriptText(markup));
  const nativeDialogs = [...new Set([...scriptText.matchAll(NATIVE_DIALOG)].map((hit) => hit[1]))];
  const unmaskedInputs = bareStructuredInputs(markup);
  const destructiveControls = (markup.match(/<button\b[^>]*>[^<]*<\/button>|<button\b[^>]*>/gi) || [])
    .filter((tag) => DESTRUCTIVE_CONTROL.test(tag)).length;
  const hasDialogMachinery = DIALOG_MARKERS.test(corpus);
  const kanbanSurface = KANBAN_MARKERS.test(markup);
  const hasDndMarkers = DND_MARKERS.test(corpus);
  const managementSurface = MANAGEMENT_MARKERS.test(markup);
  const hasWidgetMarkers = WIDGET_MARKERS.test(corpus);

  // Decorative blob: absolutely positioned, fully rounded, blurred. Three
  // co-occurring properties in one rule — a shape that exists to decorate and
  // nothing else. Any two of them alone is ordinary UI.
  //
  // "Fully rounded" means a circle/ellipse (50%) or the pill idiom (999px and
  // up). A modest radius does not qualify: an absolutely positioned, blurred
  // panel with `border-radius: 9px` is a soft glow behind a card, not a blob,
  // and this is the blocking tier — it has to stay near-zero false positive.
  const FULLY_ROUNDED = /border-radius\s*:\s*(?:50%|\d{3,}px|9{3,})/i;
  const blobs = ruleBlocks(styleText).filter((block) => {
    const body = block.body;
    return /position\s*:\s*(absolute|fixed)/i.test(body)
      && FULLY_ROUNDED.test(body)
      && /filter\s*:\s*[^;]*blur\s*\(/i.test(body);
  }).map((block) => block.selector);

  // ── craft levers (measured ambition) ─────────────────────────────────────
  // Applied context only: a gradient or grain living in an unreferenced token
  // decorates the stylesheet, not the product. Text presence is what a model
  // fakes for free; a declaration that actually paints is what the user sees.
  let gradientCount = 0;
  for (const { prop, value } of decls) {
    if (String(prop).startsWith('--')) continue;
    const resolved = resolveCustomProps(value, props);
    gradientCount += (resolved.match(/(?:linear|radial|conic)-gradient\(/gi) || []).length;
  }
  let layeredShadows = 0;
  for (const { prop, value } of decls) {
    if (prop !== 'box-shadow' && prop !== 'text-shadow') continue;
    const resolved = resolveCustomProps(value, props);
    if (/^\s*none\b/i.test(resolved)) continue;
    if (topLevelSplit(resolved).length >= 2) layeredShadows += 1;
  }
  const grainNoise = decls.some(({ prop, value }) => !String(prop).startsWith('--') && /feTurbulence/i.test(resolveCustomProps(value, props)))
    || (/feTurbulence/i.test(markup) && /filter\s*[:=]\s*["']?url\(#/i.test(markup));
  const blendModes = decls.filter((d) => d.prop === 'mix-blend-mode' || d.prop === 'background-blend-mode').length;
  const maskLayers = decls.filter((d) => d.prop === 'mask-image' || d.prop === '-webkit-mask-image').length;
  const modernColor = (styleText.match(/color-mix\(|oklch\(|oklab\(/gi) || []).length;
  const backgroundImages = decls.filter((d) => (d.prop === 'background' || d.prop === 'background-image') && /url\(/i.test(d.value)).length;
  const transitionCount = decls.filter((d) => d.prop === 'transition' || d.prop === 'transition-property').length;
  const scrollReveal = motionAssessment.scroll_reveal;

  const materialTechniques = [
    gradientCount >= 2 && 'gradients',
    layeredShadows >= 2 && 'layered shadows',
    depth.blur >= 1 && 'blur',
    grainNoise && 'grain',
    blendModes >= 1 && 'blend modes',
    maskLayers >= 1 && 'masks',
    modernColor >= 3 && 'modern color'
  ].filter(Boolean);

  // Finish depth counts only PHYSICAL finish — modern color notation is
  // hygiene, not material. A wash plus a blur satisfies the lever's presence
  // bar while the surface still reads flat; depth is what separates a palette
  // from a designed surface (a token-level shadow/texture system every route
  // inherits, not one hero moment).
  const materialDepth = [
    gradientCount >= 2 && 'gradients',
    layeredShadows >= 2 && 'layered shadows',
    depth.blur >= 1 && 'blur',
    grainNoise && 'grain',
    blendModes >= 1 && 'blend modes',
    maskLayers >= 1 && 'masks',
    backgroundImages >= 1 && 'image layers'
  ].filter(Boolean);

  // Declared-but-never-applied finish: effect tokens and keyframes no rule
  // references. They inflate every text-presence signal while the user sees
  // flat — the exact "cool effects in the CSS, applied nowhere" report shape.
  // References live wherever rules live — inline <style>, external .css files
  // (the --dir / --file=styles.css shapes) and style attributes — so the scan
  // reads the whole corpus. Reading only the HTML reported every token a
  // stylesheet defined AND used as dead, and the dev doctrine then told the
  // agent to delete live finish.
  const varRefs = new Set();
  for (const ref of corpus.matchAll(/var\(\s*(--[\w-]+)/g)) varRefs.add(ref[1].toLowerCase());
  const EFFECT_PROP = /shadow|grain|noise|glow|texture|gradient|wash|blur|halo/i;
  const EFFECT_VALUE = /(?:linear|radial|conic)-gradient\(|feTurbulence|blur\(/i;
  const unappliedEffectTokens = Object.entries(props)
    .filter(([name, value]) => (EFFECT_PROP.test(name) || EFFECT_VALUE.test(value)) && !varRefs.has(name.toLowerCase()))
    .map(([name]) => name);
  const keyframeNames = [...styleText.matchAll(/@keyframes\s+([\w-]+)/g)].map((k) => k[1]);
  const unappliedKeyframes = keyframeNames.filter(
    (name) => !new RegExp(`animation(?:-name)?\\s*:[^;{}]*\\b${escapeRegExp(name)}\\b`, 'i').test(corpus)
  );
  const unappliedFinish = [...unappliedEffectTokens, ...unappliedKeyframes.map((name) => `@keyframes ${name}`)];

  const modernCssAssessment = assessModernCss({ markup, styleText });
  const modernCss = modernCssAssessment.features;

  // ── palette fingerprint ──────────────────────────────────────────────────
  // Which hue family this surface actually ships, as arithmetic: every color
  // literal (var()-resolved) converted to OKLCH and weighted by use. The
  // fingerprint is what makes cross-PROJECT sameness machine-visible — each
  // surface can pass every gate alone while the operator's projects all land
  // on the model's favorite palette; comparing fingerprints is how that stops
  // being a feeling and starts being a measured delta.
  const COLOR_TOKEN = /#[0-9a-fA-F]{3,8}\b|(?:rgba?|hsla?|oklch)\([^()]*\)/g;
  const colorCounts = new Map(); // canonical hex → { count, oklch }
  const groundCounts = new Map(); // background-prop colors only
  for (const { prop, value } of decls) {
    const resolved = resolveCustomProps(value, props);
    let match;
    COLOR_TOKEN.lastIndex = 0;
    let first = true;
    while ((match = COLOR_TOKEN.exec(resolved))) {
      const parsed = parseCssColor(match[0]);
      if (!parsed || parsed.alpha < 0.5) { first = false; continue; }
      const key = rgbToHex(parsed);
      const record = colorCounts.get(key) || { count: 0, oklch: parsed.oklch };
      record.count += 1;
      colorCounts.set(key, record);
      if (first && parsed.alpha >= 0.9 && (prop === 'background' || prop === 'background-color')) {
        groundCounts.set(key, (groundCounts.get(key) || 0) + 1);
      }
      first = false;
    }
  }
  const CHROMATIC_FLOOR = 0.07; // OKLCH chroma below this reads as a tinted neutral
  let colorLiteralCount = 0;
  let chromaticCount = 0;
  const clusters = []; // { sin, cos, weight, maxChroma } — greedy ±20° hue clustering
  const sorted = [...colorCounts.values()].sort((a, b) => b.count - a.count);
  for (const { count, oklch } of sorted) {
    colorLiteralCount += count;
    if (oklch.c < CHROMATIC_FLOOR) continue;
    chromaticCount += count;
    const rad = (oklch.h * Math.PI) / 180;
    const home = clusters.find((cl) => {
      const rep = ((Math.atan2(cl.sin, cl.cos) * 180) / Math.PI + 360) % 360;
      const d = Math.abs(((oklch.h - rep) % 360 + 360) % 360);
      return Math.min(d, 360 - d) <= 20;
    });
    if (home) {
      home.sin += Math.sin(rad) * count;
      home.cos += Math.cos(rad) * count;
      home.weight += count;
      home.maxChroma = Math.max(home.maxChroma, oklch.c);
    } else {
      clusters.push({ sin: Math.sin(rad) * count, cos: Math.cos(rad) * count, weight: count, maxChroma: oklch.c });
    }
  }
  clusters.sort((a, b) => b.weight - a.weight);
  const accentCluster = clusters[0] || null;
  const accentHue = accentCluster
    ? Math.round(((Math.atan2(accentCluster.sin, accentCluster.cos) * 180) / Math.PI + 360) % 360)
    : null;
  // The page ground is what body/html paint. Frequency across background
  // declarations is only the fallback: chips, logos and buttons can outnumber
  // the page field by rule count while covering a fraction of its pixels —
  // that is how a green logo block once became "the ground" of a violet-dark
  // surface and poisoned the cross-project fingerprint.
  const PAGE_GROUND_SELECTOR = /(^|[\s>+~])(html|body)((\.|\[|::?)[^\s>+~]*)?$/i;
  // Resolve the page ground against the FIRST definition of each custom
  // property: the base theme. A [data-theme] override later in the sheet is
  // the toggle, not the shipped default, and last-write-wins resolution was
  // flipping dark defaults to their light-theme values here.
  const baseProps = {};
  {
    const re = /(--[\w-]+)\s*:\s*([^;{}]+)/g;
    let bp;
    while ((bp = re.exec(styleText))) { if (!(bp[1] in baseProps)) baseProps[bp[1]] = bp[2].trim(); }
  }
  // Among matching blocks, the LAST bare `body`/`html` rule wins (the CSS
  // cascade); a scoped variant (`[data-theme] body`, `body.light`) is a theme
  // override, never the default, and only serves as a fallback when no bare
  // rule paints.
  const BARE_PAGE_SELECTOR = /^(?:html|body)(?:\s+body)?$/i;
  let bareGround = null;
  let firstAnyGround = null;
  for (const block of ruleBlocks(styleText)) {
    const parts = String(block.selector || '').split(',').map((part) => part.trim());
    if (!parts.some((part) => PAGE_GROUND_SELECTOR.test(part))) continue;
    const bgDecls = [...block.body.matchAll(/(?:^|;)\s*background(?:-color)?\s*:\s*([^;{}]+)/gi)];
    let found = null;
    for (let i = bgDecls.length - 1; i >= 0 && !found; i -= 1) {
      const resolved = resolveCustomProps(bgDecls[i][1], baseProps);
      COLOR_TOKEN.lastIndex = 0;
      const token = COLOR_TOKEN.exec(resolved);
      const parsed = token ? parseCssColor(token[0]) : null;
      if (parsed && parsed.alpha >= 0.9) found = { hex: rgbToHex(parsed), oklch: parsed.oklch };
    }
    if (!found) continue;
    if (!firstAnyGround) firstAnyGround = found;
    if (parts.some((part) => BARE_PAGE_SELECTOR.test(part))) bareGround = found;
  }
  const pageGround = bareGround || firstAnyGround;
  let ground = null;
  const groundPick = pageGround || (groundCounts.size > 0
    ? (() => {
      const [hex] = [...groundCounts.entries()].sort((a, b) => b[1] - a[1])[0];
      return { hex, oklch: colorCounts.get(hex).oklch };
    })()
    : null);
  if (groundPick) {
    const g = groundPick.oklch;
    const pole = g.c >= 0.12 ? 'chromatic' : g.l >= 0.75 ? 'light' : g.l <= 0.45 ? 'dark' : 'mid';
    ground = { hex: groundPick.hex, l: Math.round(g.l * 100) / 100, c: Math.round(g.c * 1000) / 1000, h: Math.round(g.h), pole };
  }
  const palette = {
    color_literals: colorLiteralCount,
    chromatic_share_pct: colorLiteralCount ? Math.round((chromaticCount / colorLiteralCount) * 100) : null,
    hue_clusters: clusters.length,
    accent_hue: accentHue,
    accent_chroma: accentCluster ? Math.round(accentCluster.maxChroma * 1000) / 1000 : null,
    ground
  };

  const craftMeasured = authoredDeclarations >= CRAFT_MIN_DECLARATIONS;
  const designRegister = ['technical', 'quiet', 'editorial', 'material', 'constructed', 'cinematic'].includes(String(register || '').toLowerCase()) ? String(register).toLowerCase() : null;
  const restrainedRegister = ['technical', 'quiet', 'editorial'].includes(designRegister);
  const embeddedAssets = embeddedAssetProfile(html);
  const browserSurfaces = BROWSER_SURFACE_PROBES.filter((probe) => probe.re.test(styleText)).map((probe) => probe.name);
  const surface = detectSurfaceMode({ markup, maxFontPx, declared: surfaceMode });
  const operateMode = surface.mode === 'operate';
  const familiarityMode = operateMode || surface.mode === 'read';
  const tells = scanGenerationTells({ markup, styleText, decls, props, families, craftMeasured, operateMode });
  // The levers the premium bar is made of. On an operate surface display
  // scale and evidence imagery are not the axis — data is the evidence and
  // app chrome runs a fixed scale — so the floor is typeface, material,
  // motion, and themed browser chrome (vq-026).
  // Hover transitions are hygiene, not choreography: every hand-written page
  // carries a dozen, so `transitionCount >= 12` lit this lever on surfaces with
  // one keyframe and no motion anyone would notice — a page could score 5/5
  // craft while delivering none of the motion its brief asked for. The lever
  // now asks whether motion was DESIGNED: a keyframe system that respects
  // reduced-motion, a scroll-driven reveal, or an ambient signature surface.
  const signatureMotion = motionAssessment.signature;
  const motionDesigned = motionAssessment.designed;
  const motionTransitionOnly = motionAssessment.transition_only;

  const levers = familiarityMode
    ? {
      typeface: fontDelivered,
      material: materialTechniques.length >= 2,
      motion: motionDesigned,
      chrome: browserSurfaces.length >= 2
    }
    : restrainedRegister ? {
      typeface: fontDelivered,
      display_scale: fontSizes.size >= 2 && maxFontPx >= 32,
      material: adherence >= 60 && (depth.borders > 0 || materialTechniques.length >= 2 || /display\s*:\s*(?:grid|flex)/i.test(styleText)),
      evidence: mediaEvidence.status === 'verified'
    } : {
      typeface: fontDelivered,
      display_scale: maxFontPx >= DISPLAY_TYPE_FLOOR_PX,
      material: materialTechniques.length >= 2,
      motion: motionDesigned,
      evidence: mediaEvidence.status === 'verified'
    };
  const leverCount = Object.keys(levers).length;
  const activeLevers = Object.values(levers).filter(Boolean).length;
  const leverFloor = familiarityMode ? 1 : CRAFT_LEVER_FLOOR;
  const utility = utilityClassDensity(markup);
  const utilityStyled = !craftMeasured && utility.utility >= 40 && utility.share >= 0.5;

  // ── craft weight (graded ambition) ───────────────────────────────────────
  // The levers are booleans with low floors: one keyframe system, two
  // gradients and a 56px heading light all five while the surface still reads
  // thin, so a rich build and a minimal one both scored 5/5. The weight grades
  // each lever 0–2 from how much of the technique is actually on the page.
  // Static text cannot see emptiness — the runtime density probe owns that —
  // but it can see a hover system, layered atmosphere, tracked caps, image-led
  // media and composition that overlaps the grid.
  const blocks = ruleBlocks(styleText);
  const hoverTransforms = blocks.filter((block) => /:hover/.test(block.selector) && /(?:^|;)\s*(?:transform|scale|translate|rotate)\s*:/i.test(block.body)).length;
  const atmosphericLayers = blocks.filter((block) => /::?(?:before|after)\b/.test(block.selector) && /(?:linear|radial|conic)-gradient\(|blur\(|feTurbulence|url\(/i.test(resolveCustomProps(block.body, props))).length;
  let bigBlurs = 0;
  for (const { prop, value } of decls) {
    if (prop !== 'filter' && prop !== 'backdrop-filter' && prop !== '-webkit-backdrop-filter') continue;
    const match = resolveCustomProps(value, props).match(/blur\(\s*(\d+(?:\.\d+)?)px/i);
    if (match && Number(match[1]) >= 24) bigBlurs += 1;
  }
  const overlapSignals = decls.filter(({ prop, value }) =>
    (prop === 'position' && /\b(?:absolute|sticky)\b/i.test(value))
    || (/^margin(?:-(?:top|right|bottom|left|inline|block)(?:-(?:start|end))?)?$/.test(prop) && /(?:^|\s)-\d/.test(value))
    || prop === 'clip-path' || prop === 'mix-blend-mode' || prop === 'shape-outside').length;
  const mediaCover = decls.filter(({ prop, value }) => prop === 'object-fit' && /cover/i.test(value)).length;
  const trackedCaps = blocks.filter((block) => /text-transform\s*:\s*uppercase/i.test(block.body) && /letter-spacing\s*:/i.test(block.body)).length;
  const italicContrast = decls.some(({ prop, value }) => prop === 'font-style' && /italic|oblique/i.test(value));
  const weightSteps = new Set(decls.filter(({ prop }) => prop === 'font-weight').map(({ value }) => resolveCustomProps(value, props).trim())).size;
  const hasClipPath = decls.some(({ prop }) => prop === 'clip-path');
  const grades = {
    typography: !fontDelivered ? 0 : (maxFontPx >= 96 && (fluidType || trackedCaps > 0 || italicContrast || weightSteps >= 3) ? 2 : (maxFontPx >= DISPLAY_TYPE_FLOOR_PX ? 1 : 0)),
    atmosphere: materialDepth.length >= 3 && (atmosphericLayers >= 2 || bigBlurs >= 1 || grainNoise) ? 2 : (materialDepth.length >= 2 || atmosphericLayers >= 1 ? 1 : 0),
    motion: !motionDesigned ? 0 : ((motionAssessment.ambient_loops >= 1 || signatureMotion) && (hoverTransforms >= 2 || scrollReveal) && motionAssessment.applied_keyframes >= 2 ? 2 : 1),
    composition: overlapSignals >= 5 && (mediaCover >= 1 || blendModes >= 1 || hasClipPath) ? 2 : (overlapSignals >= 2 ? 1 : 0),
    media: mediaEvidence.verified >= 3 && mediaCover >= 2 ? 2 : (mediaEvidence.verified >= 1 ? 1 : 0)
  };
  // Registers with restraint as their premise earn their finish through type,
  // measure, rules and image treatment. Never demand blur, overlap or ambient
  // loops to compensate for a deliberately static composition.
  if (restrainedRegister) {
    const hierarchy = fontSizes.size >= 2 && maxFontPx >= 32;
    const controlledLayout = /(?:display\s*:\s*(?:grid|flex)|grid-template|columns\s*:)/i.test(styleText);
    const measure = /(?:max-width|inline-size|aspect-ratio)\s*:/i.test(styleText);
    grades.typography = fontDelivered ? (hierarchy ? 2 : 1) : 0;
    grades.composition = controlledLayout && measure ? 2 : (controlledLayout || measure ? 1 : 0);
    grades.atmosphere = adherence >= 60 && (depth.borders > 0 || controlledLayout || materialDepth.length > 0) ? 2 : (materialDepth.length > 0 ? 1 : 0);
    grades.media = mediaEvidence.verified > 0 ? 2 : 0;
  }
  const applicableAxes = Object.keys(grades).filter((axis) => !(restrainedRegister && axis === 'motion'));
  const weightScore = applicableAxes.reduce((sum, axis) => sum + grades[axis], 0);
  const craftWeight = familiarityMode
    ? { scored: false, reason: `${surface.mode} surface: the premium axis is precision, not weight` }
    : {
      scored: craftMeasured,
      score: Math.round((weightScore / (applicableAxes.length * 2)) * 100),
      bar: CRAFT_WEIGHT_BAR,
      register: designRegister,
      applicable_axes: applicableAxes,
      limitation: 'Technique coverage, not an aesthetic verdict. Inspect hierarchy, composition and domain fit in the browser.',
      grades,
      signals: { hover_transforms: hoverTransforms, atmospheric_layers: atmosphericLayers, big_blurs: bigBlurs, overlap_signals: overlapSignals, media_cover: mediaCover, tracked_caps: trackedCaps, italic_contrast: italicContrast, weight_steps: weightSteps }
    };

  // ── operate precision (the familiarity bar, measured) ────────────────────
  // "An operate surface earns familiarity — its premium axis is precision"
  // was a sentence: weight was not scored there, and nothing else was, so an
  // operate prototype with 17 advisory warnings, an undelivered face, 95
  // off-grid values and 13 kickers read `pass`. Precision is the same
  // signals the hygiene warnings already carry, graded 0–2 per axis and
  // held to the same bar the brand weight is — so the human gate can read it.
  const precisionGrades = familiarityMode
    ? {
      typeface: fontDelivered ? 2 : 0,
      tokens: adherence === null ? 0 : (adherence >= 75 ? 2 : (adherence >= 60 ? 1 : 0)),
      rhythm: offGrid.length < 5 ? 2 : (offGrid.length < 20 ? 1 : 0),
      states: statesUnmet.length === 0 ? 2 : (statesUnmet.length === 1 ? 1 : 0),
      chrome: browserSurfaces.length >= 3 || (browserSurfaces.length >= 2 && browserSurfaces.includes('tabular numerals')) ? 2 : (browserSurfaces.length >= 1 ? 1 : 0),
      tells: tells.active.length === 0 ? 2 : (tells.active.length === 1 ? 1 : 0),
      dialect: modernCssAssessment.active_capabilities >= 3 ? 2 : (modernCssAssessment.active_capabilities >= 1 ? 1 : 0)
    }
    : null;
  const precisionScore = precisionGrades ? Object.values(precisionGrades).reduce((sum, g) => sum + g, 0) : 0;
  const craftPrecision = familiarityMode
    ? {
      scored: craftMeasured,
      score: Math.round((precisionScore / (Object.keys(precisionGrades).length * 2)) * 100),
      bar: CRAFT_PRECISION_BAR,
      grades: precisionGrades
    }
    : { scored: false, reason: `${surface.mode} surface: the premium axis is weight, not precision` };

  const metrics = {
    declarations: authoredDeclarations,
    scoped_declarations: decls.length,
    css_scope: cssScope.evidence,
    composition_signature: compositionFingerprint(markup, styleText),
    token_adherence_pct: adherence,
    tokenized_values: tokenized,
    literal_values: literal,
    spacing_on_grid: onGrid,
    spacing_off_grid: offGrid.length,
    depth_strategies: activeDepth,
    depth_counts: depth,
    font_families: [...families],
    display_face: displayFace,
    font_delivery: fontDelivery,
    max_font_size_px: maxFontPx || null,
    font_size_count: fontSizes.size,
    fluid_type: fluidType,
    keyframes,
    animated_declarations: animated,
    reduced_motion_handled: hasReducedMotion,
    // The motion record, so "premium animation" stops being a matter of taste:
    // what runs on its own, what runs on scroll, and what only runs on hover.
    motion: motionAssessment,
    states_present: statesPresent,
    states_missing: statesMissing,
    interactive_surface: interactive,
    // What this surface can actually reach, and therefore owes.
    surface_capabilities: surfaceCapabilities,
    states_owed: statesOwed,
    states_unmet: statesUnmet,
    max_card_nesting: cardNesting,
    max_card_sibling_run: cardWall.run,
    card_sibling_class: cardWall.className,
    emoji_glyphs: emoji,
    em_dash_prose: emDash.count,
    prototype_anchors: isPrototype,
    primary_marker: hasPrimaryMarker,
    tour_marker: hasTourMarker,
    media_elements: mediaElements,
    media_evidence: mediaEvidence,
    native_dialog_calls: nativeDialogs,
    structured_inputs_without_semantics: unmaskedInputs,
    destructive_controls: destructiveControls,
    dialog_machinery: hasDialogMachinery,
    kanban_surface: kanbanSurface,
    dnd_markers: hasDndMarkers,
    management_surface: managementSurface,
    widget_markers: hasWidgetMarkers,
    palette,
    tells: {
      active: tells.active.length,
      present: tells.active,
      ...tells.counts
    },
    surface_mode: surface,
    utility_classes: utility,
    embedded_assets: embeddedAssets,
    craft: {
      measured: craftMeasured,
      ...(craftMeasured ? {} : { reason: utilityStyled
        ? `utility-class styling (${utility.utility} utility tokens, ${Math.round(utility.share * 100)}% of class tokens) keeps its decisions out of declarations — measure the rendered surface (--file=<built index.html> or --url=<served app>, with --runtime)`
        : `fewer than ${CRAFT_MIN_DECLARATIONS} authored declarations (${decls.length}) — fragments and fixtures are not measured for craft` }),
      mode: surface.mode,
      active_levers: activeLevers,
      lever_count: leverCount,
      levers,
      material_techniques: materialTechniques,
      material_depth: materialDepth.length,
      browser_surfaces: { count: browserSurfaces.length, present: browserSurfaces },
      weight: craftWeight,
      precision: craftPrecision,
      unapplied_effects: unappliedFinish,
      gradient_count: gradientCount,
      layered_shadow_declarations: layeredShadows,
      grain_noise: grainNoise,
      blend_modes: blendModes,
      mask_layers: maskLayers,
      modern_color_functions: modernColor,
      background_images: backgroundImages,
      transition_declarations: transitionCount,
      scroll_reveal: scrollReveal,
      modern_css: modernCss,
      modern_css_capabilities: modernCssAssessment
    }
  };

  // ── findings ─────────────────────────────────────────────────────────────
  // issues   = unambiguous defects, provable from the text alone
  // warnings = threshold measurements a reviewer should judge in context
  const issues = [];
  const warnings = [];

  for (const selector of blobs.slice(0, 5)) {
    issues.push(`decorative blob: \`${selector}\` is absolutely positioned, fully rounded and blurred — decoration standing in for product evidence`);
  }
  if (motionAssessment.applied_keyframes > 0 && !hasReducedMotion) {
    issues.push(`${motionAssessment.applied_keyframes} applied keyframe animation(s) and ${animated} animated declaration(s) with no effective \`prefers-reduced-motion\` override`);
  }
  if (cardNesting >= 3) {
    issues.push(`card containers nested ${cardNesting} deep — use rows, dividers, inset sections or a dialog instead of another card`);
  }
  if (nativeDialogs.length > 0) {
    issues.push(`native browser dialog call(s): ${nativeDialogs.map((name) => `${name}()`).join(', ')} — use the design system's modal/toast; native dialogs are contractually banned`);
  }

  if (adherence !== null && tokenTotal >= 10 && adherence < 60) {
    warnings.push(`token adherence ${adherence}% (${tokenized} tokenized vs ${literal} literal values) — hardcoded colors and sizes are how a design system drifts`);
  }
  if (offGrid.length >= 5) {
    const sample = [...new Set(offGrid)].slice(0, 4).join(', ');
    warnings.push(`${offGrid.length} spacing values off the ${SPACING_GRID}px grid (${sample}${offGrid.length > 4 ? ', …' : ''}) — systemless rhythm is the most visible amateur tell`);
  }
  if (activeDepth.length >= 3) {
    warnings.push(`${activeDepth.length} depth strategies in play (${activeDepth.join(' + ')}) — pick one and let the others stay exceptions`);
  }
  if (families.size > 3) {
    warnings.push(`${families.size} distinct font families (${[...families].slice(0, 4).join(', ')}) — a coherent system rarely needs more than two`);
  }
  if (statesUnmet.length > 0) {
    const why = [
      surfaceCapabilities.data_entry && 'data entry',
      surfaceCapabilities.async_work && 'async work',
      surfaceCapabilities.collections && 'a rendered collection',
      surfaceCapabilities.focusable && 'focusable controls'
    ].filter(Boolean).join(', ');
    warnings.push(`interactive surface with no marker for: ${statesUnmet.join(', ')} — this surface carries ${why}, so those states are reachable; visual polish cannot hide an unfinished workflow`);
  }
  if (unmaskedInputs.length > 0) {
    const sample = unmaskedInputs.slice(0, 3).join('; ');
    warnings.push(`${unmaskedInputs.length} structured field(s) with no input semantics (${sample}${unmaskedInputs.length > 3 ? ', …' : ''}) — a CPF/phone/currency field needs a mask, inputmode, pattern, maxlength or autocomplete (form-fields-masks-and-validation rule)`);
  }
  if (destructiveControls > 0 && !hasDialogMachinery) {
    warnings.push(`${destructiveControls} destructive control(s) with no dialog machinery in the corpus — status changes and deletions confirm through a design-system modal (status-change-confirmation rule)`);
  }
  if (kanbanSurface && !hasDndMarkers) {
    warnings.push('kanban/pipeline surface with no drag-and-drop markers — recurrent status flows move by drag-and-drop with an accessible fallback (status-flow-drag-and-drop rule)');
  }
  if (managementSurface && !hasWidgetMarkers) {
    warnings.push('management surface with no widget/KPI/chart markers — a management home opens with decision-driving widgets (management-home-widgets rule)');
  }
  if (emoji.length > 0) {
    const sample = emoji.slice(0, 6).join(' ');
    warnings.push(`${emoji.length} emoji glyph(s) in the UI corpus (${sample}${emoji.length > 6 ? ' …' : ''}) — emoji standing in for icons is a slop marker; use the icon set. Emoji inside seeded mock content is fine — judge in context`);
  }
  if (emDash.count >= EM_DASH_PROSE_THRESHOLD) {
    const sample = emDash.samples.map((s) => `"${s}"`).join(', ');
    warnings.push(`${emDash.count} spaced em dash(es) across UI copy and mock content (${sample}${emDash.count > emDash.samples.length ? ', …' : ''}) — repeated em-dash cadence is a model-writing tell; keep a deliberate few and rewrite the rest with periods, colons, or shorter sentences. Quotations stay verbatim — judge in context`);
  }
  if (cardWall.run >= 8) {
    warnings.push(`${cardWall.run} consecutive sibling cards share class "${cardWall.className}" — a uniform card wall is the replaceability test failing in markup; vary the composition or collapse to rows`);
  }
  if (isPrototype && !hasPrimaryMarker) {
    warnings.push('prototype has `data-aioson-id` anchors but no `data-aioson-primary` marker — mark the one region rendering the briefing\'s #1 differentiator so the runtime fold check can prove it is visible without scrolling');
  }
  if (isPrototype && !hasTourMarker) {
    warnings.push('prototype has no first-open explainer (`data-aioson-tour`) — a briefing prototype must explain itself to the owner: 3–5 lay steps from the briefing promises, reopenable via a persistent `?` control');
  }

  // ── craft warnings (full surfaces only) ──────────────────────────────────
  // Typography first: it is the single most visible "cheap default" tell, and
  // both failure shapes are provable from the text. A family named without any
  // delivery mechanism silently renders the OS fallback on most machines — the
  // chosen face never reaches the user.
  if (craftMeasured && !fontDelivered) {
    if (undeliveredFamilies.length > 0) {
      const sample = undeliveredFamilies.slice(0, 4).join(', ');
      warnings.push(`font families named but never delivered (${sample}) — no @font-face and no webfont link in the corpus, so most machines silently render the OS fallback instead of the chosen face; link the typeface (the build contract's font exception) or embed a WOFF2 @font-face, and keep a deliberate fallback stack`);
    } else if (families.size > 0) {
      const sample = [...families].slice(0, 4).join(', ');
      warnings.push(`typography never leaves the OS default stacks (${sample}) — the most visible "cheap default" tell there is; a premium surface delivers one real typeface (webfont link or embedded @font-face) with a credible fallback that preserves hierarchy`);
    }
  }
  if (utilityStyled) {
    warnings.push(`craft not measured statically: utility-class styling (${utility.utility} utility tokens across ${utility.tokens} class tokens) keeps typeface, material, finish and chrome out of the ${decls.length} authored declarations — this is an unmeasured surface, not a passed one; measure the rendered result with --file=<built index.html> or --url=<served app> and --runtime`);
  }
  if (craftMeasured && activeLevers <= leverFloor) {
    const missing = [];
    if (!levers.typeface) missing.push(`a delivered typeface (${fontFaceBlocks} @font-face, webfont link ${webfontLinked ? 'present' : 'absent'})`);
    if (!familiarityMode && !levers.display_scale) missing.push(restrainedRegister ? 'a legible, differentiated type hierarchy' : `display-scale type (largest font-size ${maxFontPx || 0}px, floor ${DISPLAY_TYPE_FLOOR_PX}px)`);
    if (!levers.material) missing.push(restrainedRegister ? 'consistent tokened rules, tones or image treatment' : `material depth (${gradientCount} gradients, ${layeredShadows} layered shadows, ${depth.blur} blur, grain ${grainNoise ? 'yes' : 'no'})`);
    if (Object.hasOwn(levers, 'motion') && !levers.motion) missing.push(`motion choreography (${keyframes} keyframes, ${animated} animated declarations, ${transitionCount} transitions, no scroll reveal, no signature surface)`);
    if (!familiarityMode && !levers.evidence) missing.push(`verified evidence imagery (${mediaEvidence.verified} verified, ${mediaEvidence.unverified} awaiting runtime verification)`);
    if (familiarityMode && !levers.chrome) missing.push(`themed browser chrome (${browserSurfaces.length}/6 of ::selection, caret, scrollbar, :focus-visible, underline tuning, tabular numerals)`);
    const bar = familiarityMode
      ? `A ${surface.mode} surface earns familiarity, not ornament — its premium axis is precision: a delivered workhorse face, a tokened finish on floating surfaces, 150–250ms state feedback, and browser chrome themed from its own palette (vq-026)`
      : 'Hygiene alone reads as a default document, not a designed product; each lever is optional, the floor is not (visual-effects.md owns the vocabulary, the register\'s premium bar owns the shape)';
    warnings.push(`craft floor: ${activeLevers}/${leverCount} premium levers active${familiarityMode ? ` (${surface.mode} surface)` : ''} — missing: ${missing.join('; ')}. ${bar}`);
  }
  // The motion lever used to light on hover transitions alone, so a page with
  // one keyframe scored the same as a choreographed one. Naming the state is
  // what makes "premium animation" arguable from numbers instead of taste.
  if (craftMeasured && motionTransitionOnly && !restrainedRegister && !familiarityMode) {
    warnings.push(`motion is hover-only: ${transitionCount} transitions, ${keyframes} @keyframes, ${animated} animated declarations, no scroll reveal and no signature surface — state feedback is hygiene, not choreography. A surface reads animated when something moves without being poked: an ambient backdrop, a scroll-driven reveal, or an entrance system with reduced-motion handled (visual-effects.md owns the vocabulary)`);
  }
  if (craftMeasured && levers.material && materialDepth.length <= 2 && !restrainedRegister) {
    warnings.push(`shallow material system: the material lever rests on ${materialDepth.join(' + ') || 'modern color alone'} (finish depth ${materialDepth.length}/7) — a drawn palette with no system-level finish is the measured shape of generic AI output even when every hue is right. Token the finish so every route inherits it: register-sanctioned depth (rules/tonal steps/overlap where shadows are forbidden; a shadow strategy only where allowed), tinted washes, texture or blend at the declared dosage. The signature material is the top note, never the whole system`);
  }
  // Every lever lit, every lever thin: the shape of a page that carries one of
  // each technique and still reads generic. Named after the floor, never with it.
  if (craftMeasured && ['brand', 'mixed'].includes(surface.mode) && craftWeight.scored && craftWeight.score < CRAFT_WEIGHT_BAR && activeLevers > leverFloor) {
    const thin = applicableAxes.filter((axis) => grades[axis] < 2).map((axis) => `${axis} ${grades[axis]}/2`);
    warnings.push(`craft weight ${craftWeight.score}/100 below the brand bar (${CRAFT_WEIGHT_BAR}): review ${thin.join(', ')} against the ${designRegister || 'recorded'} direction. This score measures technique coverage, not design quality: inspect hierarchy, composition, image treatment and the visitor's task; never add effects or overlap solely to raise the number`);
  }
  // The familiarity bar, held: restraint governs ornament, never finish.
  if (craftMeasured && familiarityMode && craftPrecision.scored && craftPrecision.score < CRAFT_PRECISION_BAR) {
    const thin = Object.entries(precisionGrades).filter(([, g]) => g < 2).map(([axis, g]) => `${axis} ${g}/2`);
    warnings.push(`${surface.mode} precision ${craftPrecision.score}/100 below the bar (${CRAFT_PRECISION_BAR}): the familiarity axis is thin — ${thin.join(', ')}. A ${surface.mode} surface earns familiarity through precision, not restraint: a delivered workhorse face, tokens over literals, spacing on the grid, every reachable state marked, browser chrome themed from the palette (tabular numerals where digits align), zero generation tells, and the current CSS dialect (vq-026)`);
  }
  if (craftMeasured && unappliedFinish.length > 0) {
    const sample = unappliedFinish.slice(0, 5).join(', ');
    warnings.push(`declared finish never applied: ${sample}${unappliedFinish.length > 5 ? ', …' : ''} — effects that exist only in the stylesheet decorate the code while the user sees flat; wire each one to a real surface or delete it. Dead declarations are not craft, and they read as leftovers in review`);
  }
  if (craftMeasured && modernCssAssessment.active_capabilities < 2) {
    warnings.push(`modern CSS breadth ${modernCssAssessment.active_capabilities}/${modernCssAssessment.capability_count} capabilities — one isolated feature cannot modernize a whole surface; look across architecture, responsive composition, color, typography, interaction, motion, and performance. A zero-width result is the pre-2020 dialect; adopt only the capabilities the product earns (visual-effects.md, Modern baseline)`);
  }

  // ── embedded asset zones (the bytes every polish pass rereads) ──────────
  const kb = (bytes) => Math.round(bytes / 1024);
  if (embeddedAssets.authored_style_bytes >= EMBEDDED_ASSET_ZONE_MIN_BYTES && embeddedAssets.authored_style_share_pct >= EMBEDDED_ASSET_ZONE_SHARE * 100) {
    warnings.push(`embedded assets inside the authored stylesheet: ${kb(embeddedAssets.authored_style_bytes)} KB of base64 font/image bytes sit among the CSS rules (${embeddedAssets.authored_style_share_pct}% of the stylesheet) — every surgical pass rereads them to find a rule; move the @font-face and url(data:) payloads into one trailing \`<style data-aioson-assets>\` zone so the authored CSS stays readable (build contract, asset zone)`);
  }
  if (embeddedAssets.markup_bytes >= EMBEDDED_ASSET_ZONE_MIN_BYTES && embeddedAssets.markup_share_pct >= EMBEDDED_ASSET_ZONE_SHARE * 100) {
    warnings.push(`embedded assets inside the markup: ${kb(embeddedAssets.markup_bytes)} KB of base64 image/media bytes sit inline in the document (${embeddedAssets.markup_share_pct}% of the markup) — move them into one trailing \`<script type="application/json" data-aioson-assets>\` zone keyed by name and hydrate \`[data-asset]\` on load, so the markup the next pass reads is the interface, not the bytes (build contract, asset zone)`);
  }

  // ── generation tells + browser chrome ────────────────────────────────────
  warnings.push(...tells.warnings);
  if (craftMeasured && browserSurfaces.length === 0) {
    warnings.push('browser chrome never themed: 0/6 of ::selection, caret-color, scrollbar, :focus-visible, underline tuning, tabular numerals — stock browser chrome on a finished surface is the cheapest tell that a page was assembled rather than built; theme the ones this surface owns from its own palette');
  }

  return { applicable: true, metrics, issues, warnings };
}

module.exports = {
  analyzeVisualSources,
  // exported for reuse / tests
  componentSources,
  topLevelSplit,
  customProperties,
  resolveCustomProps,
  fontSizePx,
  extractStyleBlocks,
  extractScriptText,
  bareStructuredInputs,
  declarations,
  ruleBlocks,
  maxCardNesting,
  maxCardSiblingRun,
  emojiGlyphs,
  emDashProse,
  visibleProse,
  scanGenerationTells,
  shadowLayerGeometry,
  embeddedAssetProfile,
  EMBEDDED_ASSET_ZONE_MIN_BYTES,
  SATURATED_DISPLAY_FACES,
  stripComments,
  stripHtmlComments,
  stripJsComments,
  SPACING_GRID
};
