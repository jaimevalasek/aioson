'use strict';

/**
 * High-confidence visual assurance probes shared by static telemetry and the
 * rendered verifier. These probes deliberately bind evidence to what is used:
 * a font must deliver the named family, an animation must reference the
 * keyframe it claims, and media must be loadable before it counts as proof.
 */

const DEFAULT_FONT_STACKS = new Set([
  'system-ui', '-apple-system', 'blinkmacsystemfont', 'ui-serif', 'ui-sans-serif',
  'ui-monospace', 'ui-rounded', 'segoe ui', 'segoe ui variable', 'roboto', 'arial',
  'helvetica', 'helvetica neue', 'georgia', 'times', 'times new roman', 'garamond',
  'palatino', 'palatino linotype', 'book antiqua', 'iowan old style', 'charter',
  'cambria', 'calibri', 'candara', 'constantia', 'corbel', 'optima', 'avenir',
  'avenir next', 'seravek', 'verdana', 'tahoma', 'trebuchet ms', 'gill sans',
  'courier', 'courier new', 'consolas', 'monaco', 'menlo', 'sfmono-regular',
  'sf mono', 'sf pro', 'sf pro text', 'sf pro display', 'lucida grande',
  'lucida sans', 'noto sans', 'noto serif', 'droid sans', 'cantarell', 'ubuntu',
  'liberation sans', 'liberation serif', 'dejavu sans', 'dejavu serif',
  'apple color emoji', 'segoe ui emoji', 'segoe ui symbol', 'noto color emoji',
  'serif', 'sans-serif', 'monospace', 'cursive', 'fantasy', 'math', 'emoji'
]);

const HOSTED_FONT_STYLESHEET = /(?:fonts\.googleapis\.com|fonts\.bunny\.net|api\.fontshare\.com|use\.typekit\.net|fonts\.cdnfonts\.com)/i;
const BACKDROP_PROPERTY = /(?:^|[;{\s])(?:background(?:-(?:position|image|size))?|filter|backdrop-filter|mask-position|mask-image|background-position-x|background-position-y)\s*:/i;
const SCROLL_REVEAL = /IntersectionObserver|view-timeline|scroll-timeline|animation-timeline|@starting-style/i;

function normalizeFamily(value) {
  return String(value || '')
    .trim()
    .replace(/^['"]|['"]$/g, '')
    .replace(/\+/g, ' ')
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function attribute(tag, name) {
  const match = String(tag || '').match(new RegExp(`\\b${escapeRegExp(name)}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i'));
  return match ? (match[1] ?? match[2] ?? match[3] ?? '') : null;
}

/** Extract balanced CSS blocks and retain their name and source range. */
function namedBlocks(source, opening) {
  const text = String(source || '');
  const out = [];
  const re = new RegExp(opening.source, opening.flags.includes('g') ? opening.flags : `${opening.flags}g`);
  let match;
  while ((match = re.exec(text))) {
    const open = text.indexOf('{', match.index);
    if (open < 0) break;
    let depth = 1;
    let cursor = open + 1;
    while (cursor < text.length && depth > 0) {
      if (text[cursor] === '{') depth += 1;
      else if (text[cursor] === '}') depth -= 1;
      cursor += 1;
    }
    if (depth !== 0) break;
    out.push({ name: match[1] || '', body: text.slice(open + 1, cursor - 1), start: match.index, end: cursor });
    re.lastIndex = cursor;
  }
  return out;
}

function withoutRanges(source, blocks) {
  if (blocks.length === 0) return String(source || '');
  const chars = String(source || '').split('');
  for (const block of blocks) {
    for (let index = block.start; index < block.end; index += 1) chars[index] = ' ';
  }
  return chars.join('');
}

function familyNamesFromUrl(rawUrl) {
  const families = new Set();
  const decoded = String(rawUrl || '').replace(/&amp;/gi, '&');
  let url;
  try {
    url = new URL(decoded, 'https://aioson.invalid');
  } catch {
    return families;
  }

  const addFamily = (raw) => {
    for (const item of String(raw || '').split('|')) {
      const family = normalizeFamily(item.split(/(?::(?:ital|wght|wdth|opsz)|@)/i)[0]);
      if (family) families.add(family);
    }
  };

  for (const value of url.searchParams.getAll('family')) addFamily(value);
  for (const value of url.searchParams.getAll('f[]')) addFamily(value);

  // cdnfonts exposes the family in the stylesheet path rather than a query.
  if (/fonts\.cdnfonts\.com$/i.test(url.hostname)) {
    const leaf = url.pathname.split('/').filter(Boolean).pop() || '';
    addFamily(leaf.replace(/\.css$/i, '').replace(/-/g, ' '));
  }
  return families;
}

function hostedStylesheets(markup, styleText) {
  const urls = [];
  for (const match of String(markup || '').matchAll(/<link\b[^>]*>/gi)) {
    const tag = match[0];
    const rel = String(attribute(tag, 'rel') || '').toLowerCase().split(/\s+/);
    const href = attribute(tag, 'href');
    if (href && rel.includes('stylesheet') && HOSTED_FONT_STYLESHEET.test(href)) urls.push(href);
  }
  for (const match of String(styleText || '').matchAll(/@import\s+(?:url\(\s*)?["']?([^"')\s;]+)["']?\s*\)?[^;]*;/gi)) {
    if (HOSTED_FONT_STYLESHEET.test(match[1])) urls.push(match[1]);
  }
  return urls;
}

function assessFontDelivery({ usedFamilies = [], markup = '', styleText = '', osDefaults = DEFAULT_FONT_STACKS } = {}) {
  const used = [...new Set([...usedFamilies].map(normalizeFamily).filter(Boolean))];
  const faceBlocks = namedBlocks(styleText, /@font-face\b()/gi);
  const faceFamilies = new Set();
  for (const block of faceBlocks) {
    const declaration = block.body.match(/(?:^|;)\s*font-family\s*:\s*([^;{}]+)/i);
    const family = declaration ? normalizeFamily(declaration[1]) : '';
    if (family) faceFamilies.add(family);
  }
  const cssOutsideFaces = withoutRanges(styleText, faceBlocks).toLowerCase();
  // `declarations()` sees the font-family inside @font-face too. A face that is
  // merely declared but never selected by a rule is supply, not usage.
  const customUsed = used.filter((family) =>
    !osDefaults.has(family) && (!faceFamilies.has(family) || cssOutsideFaces.includes(family))
  );

  const stylesheetUrls = hostedStylesheets(markup, styleText);
  const hostedFamilies = new Set();
  for (const url of stylesheetUrls) {
    for (const family of familyNamesFromUrl(url)) hostedFamilies.add(family);
  }
  const declared = new Set([...faceFamilies, ...hostedFamilies]);
  const deliveredFamilies = customUsed.filter((family) => declared.has(family));
  const undeliveredFamilies = customUsed.filter((family) => !declared.has(family));

  return {
    font_face_blocks: faceBlocks.length,
    webfont_linked: stylesheetUrls.length > 0,
    stylesheet_urls: stylesheetUrls,
    declared_families: [...declared].sort(),
    delivered_families: deliveredFamilies,
    undelivered_families: undeliveredFamilies,
    delivered: customUsed.length > 0 && undeliveredFamilies.length === 0
  };
}

function animationDeclarations(css) {
  const out = [];
  for (const match of String(css || '').matchAll(/(?:^|[;{])\s*(animation(?:-name)?)\s*:\s*([^;{}]+)/gi)) {
    out.push({ prop: match[1].toLowerCase(), value: match[2].trim() });
  }
  return out;
}

function reducedMotionBlocks(styleText) {
  const source = String(styleText || '');
  const blocks = [];
  const re = /@media\s*([^{}]*prefers-reduced-motion[^{}]*)\{/gi;
  let match;
  while ((match = re.exec(source))) {
    const open = source.indexOf('{', match.index);
    let depth = 1;
    let cursor = open + 1;
    while (cursor < source.length && depth > 0) {
      if (source[cursor] === '{') depth += 1;
      else if (source[cursor] === '}') depth -= 1;
      cursor += 1;
    }
    if (depth !== 0) break;
    blocks.push(source.slice(open + 1, cursor - 1));
    re.lastIndex = cursor;
  }
  return blocks;
}

function assessMotion({ markup = '', styleText = '' } = {}) {
  const keyframeBlocks = namedBlocks(styleText, /@(?:-webkit-)?keyframes\s+([\w-]+)\s*/gi);
  const keyframes = new Map(keyframeBlocks.map((block) => [block.name.toLowerCase(), block.body]));
  const authoredCss = withoutRanges(styleText, keyframeBlocks);
  const animationDecls = animationDeclarations(authoredCss);
  const applied = new Set();
  const ambient = new Set();

  for (const declaration of animationDecls) {
    for (const name of keyframes.keys()) {
      if (!new RegExp(`(?:^|[^\\w-])${escapeRegExp(name)}(?:$|[^\\w-])`, 'i').test(declaration.value)) continue;
      applied.add(name);
      if (/\binfinite\b/i.test(declaration.value)) ambient.add(name);
    }
  }

  const animatedBackdrop = [...ambient].some((name) => BACKDROP_PROPERTY.test(keyframes.get(name) || ''));
  const script = [...String(markup || '').matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)].map((match) => match[1]).join('\n');
  const hasCanvas = /<canvas\b/i.test(markup);
  const hasDrawingContext = /getContext\s*\(\s*['"](?:2d|webgl2?|webgpu)['"]|\bWebGL(?:2)?RenderingContext\b|\bTHREE\.|new\s+(?:p5|PIXI\.)/i.test(script);
  const hasFrameLoop = /requestAnimationFrame\s*\(|setAnimationLoop\s*\(|\.ticker\.add\s*\(|setInterval\s*\(/i.test(script);
  const hasPaintCall = /\.(?:fillRect|strokeRect|drawImage|fill|stroke|clearRect|putImageData|render)\s*\(|\.render\s*\(/i.test(script);
  const animatedCanvas = hasCanvas && hasDrawingContext && hasFrameLoop && hasPaintCall;
  const scrollDriven = /animation-timeline|scroll-timeline|view-timeline|\banimation\s*:[^;]*\bscroll\s*\(/i.test(styleText);
  const scrollReveal = SCROLL_REVEAL.test(`${markup}\n${styleText}`);
  const reducedBlocks = reducedMotionBlocks(styleText);
  const reducedMotionEffective = reducedBlocks.some((body) =>
    /animation(?:-name)?\s*:\s*none\b|animation-duration\s*:\s*(?:0(?:\.0+)?(?:ms|s)?|0?\.0+1m?s)\b|transition(?:-property)?\s*:\s*none\b|transition-duration\s*:\s*(?:0(?:\.0+)?(?:ms|s)?|0?\.0+1m?s)\b|scroll-behavior\s*:\s*auto\b/i.test(body)
  );
  const signatureKinds = [
    animatedCanvas && 'animated canvas/WebGL',
    animatedBackdrop && 'animated backdrop',
    scrollDriven && 'scroll-driven'
  ].filter(Boolean);
  const designed = (applied.size >= 3 && reducedMotionEffective) || scrollReveal || signatureKinds.length > 0;
  const transitions = (authoredCss.match(/(?:^|[;{])\s*transition(?:-property)?\s*:/gi) || []).length;

  return {
    designed,
    transition_only: !designed && transitions >= 12,
    transitions,
    keyframes: keyframes.size,
    keyframe_names: [...keyframes.keys()],
    applied_keyframes: applied.size,
    applied_keyframe_names: [...applied],
    unapplied_keyframes: [...keyframes.keys()].filter((name) => !applied.has(name)),
    animated_declarations: animationDecls.length,
    ambient_loops: ambient.size,
    signature: signatureKinds.length > 0,
    signature_kinds: signatureKinds,
    scroll_reveal: scrollReveal,
    reduced_motion_handled: reducedMotionEffective,
    reduced_motion_declared: reducedBlocks.length > 0,
    reduced_motion_effective: reducedMotionEffective
  };
}

const STATE_ORDER = ['loading', 'empty', 'error', 'disabled', 'focus'];
const STATE_PATTERNS = {
  loading: /(?:[.#](?:is-)?(?:loading|skeleton|spinner|carregando|carregamento)\b|\[aria-busy(?:\s*=|\])|\[data-state\s*=\s*["']?(?:loading|carregando)|\b(?:class|id|data-state)\s*=\s*["'][^"']*\b(?:is-loading|loading|skeleton|spinner|carregando|carregamento)\b|role\s*=\s*["'](?:status|progressbar)["']|<progress\b)/i,
  empty: /(?:[.#](?:is-)?(?:empty|empty-state|no-results|vazio|sem-resultados)\b|\[data-state\s*=\s*["']?(?:empty|vazio)|\b(?:class|id|data-state)\s*=\s*["'][^"']*\b(?:is-empty|empty-state|no-results|vazio|sem-resultados)\b)/i,
  error: /(?:[.#](?:is-|has-)?(?:error|error-state|erro|falha)\b|\[aria-invalid(?:\s*=|\])|\[data-state\s*=\s*["']?(?:error|erro|falha)|\b(?:class|id|data-state)\s*=\s*["'][^"']*\b(?:is-error|has-error|error-state|erro|falha)\b|\baria-invalid\s*=|\brole\s*=\s*["']alert["'])/i,
  disabled: /(?::disabled\b|\[aria-disabled(?:\s*=|\])|\bdisabled(?:\s*=|\s|>)|\baria-disabled\s*=)/i,
  focus: /(?::focus(?:-visible|-within)?\b|[.#]focus-ring\b|\bdata-focus-visible-added\b)/i
};

function assessStates({ markup = '', styleText = '', capabilities = null } = {}) {
  const rawMarkup = String(markup || '');
  const script = [...rawMarkup.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)].map((match) => match[1]).join('\n');
  const structuralMarkup = rawMarkup
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '');
  const structural = `${structuralMarkup}\n${styleText}`;
  const mutationEvidence = STATE_ORDER.reduce((out, state) => {
    const aliases = {
      loading: 'is-loading|loading|skeleton|spinner|carregando',
      empty: 'is-empty|empty-state|no-results|vazio|sem-resultados',
      error: 'is-error|has-error|error-state|erro|falha',
      disabled: 'disabled',
      focus: 'focus-ring'
    }[state];
    out[state] = new RegExp(`(?:classList\\.(?:add|toggle|replace)\\s*\\([^)]*["'](?:${aliases})["']|setAttribute\\s*\\(\\s*["'](?:data-state|aria-(?:busy|invalid|disabled))["']\\s*,\\s*["'](?:${aliases}|true)["'])`, 'i').test(script);
    return out;
  }, {});
  const present = STATE_ORDER.filter((state) => STATE_PATTERNS[state].test(structural) || mutationEvidence[state]);
  const resolvedCapabilities = capabilities || {
    focusable: /<button|<input|<select|<textarea|<a\s[^>]*href|tabindex\s*=|role\s*=\s*["'](?:button|link|tab|menuitem|switch|checkbox)["']/i.test(structuralMarkup),
    controls: /<button|<input|<select|<textarea|role\s*=\s*["'](?:button|switch|checkbox|menuitem)["']/i.test(structuralMarkup),
    data_entry: /<input|<select|<textarea|<form\b|contenteditable/i.test(structuralMarkup),
    async_work: /\bfetch\s*\(|XMLHttpRequest|\baxios\b|\$\.ajax|addEventListener\s*\(\s*['"]submit|\bon[Ss]ubmit\b|\.submit\s*\(|\buse(?:Query|Mutation|SWR)\b|sendBeacon/i.test(`${structuralMarkup}\n${script}`),
    collections: /<table\b|role\s*=\s*["'](?:grid|table|feed|listbox|treegrid)["']|aria-rowcount|\bdata-grid\b|\.map\s*\(|\bv-for\b|\{#each\b|\*ngFor\b/i.test(`${structuralMarkup}\n${script}`)
  };
  const owners = {
    loading: resolvedCapabilities.data_entry || resolvedCapabilities.async_work || resolvedCapabilities.collections,
    empty: resolvedCapabilities.collections,
    error: resolvedCapabilities.data_entry || resolvedCapabilities.async_work,
    disabled: resolvedCapabilities.data_entry || resolvedCapabilities.async_work,
    focus: resolvedCapabilities.focusable
  };
  const owed = STATE_ORDER.filter((state) => owners[state]);
  return {
    present,
    missing: STATE_ORDER.filter((state) => !present.includes(state)),
    owed,
    unmet: owed.filter((state) => !present.includes(state)),
    capabilities: resolvedCapabilities
  };
}

function meaningfulAlt(tag) {
  const alt = normalizeFamily(attribute(tag, 'alt'));
  if (!alt) return false;
  return !/^(?:logo|logotipo|icon|icone|ícone|avatar|placeholder|decorative|decora(?:tive|ção))\b/i.test(alt);
}

// The build contract's asset zone: images and media live in one trailing
// `<script type="application/json" data-aioson-assets>` keyed by name. Values
// are data URIs (a `url(...)` wrapper or a `{ src }` object is tolerated); a
// zone that does not parse hydrates nothing, so it proves nothing.
function assetZoneSources(markup) {
  const sources = new Map();
  for (const match of String(markup || '').matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
    if (!/data-aioson-assets/i.test(match[1])) continue;
    let parsed;
    try { parsed = JSON.parse(match[2]); } catch { continue; }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) continue;
    for (const [key, value] of Object.entries(parsed)) {
      const raw = typeof value === 'string' ? value : (value && typeof value.src === 'string' ? value.src : '');
      const source = raw.trim().replace(/^url\(\s*["']?([\s\S]*?)["']?\s*\)$/i, '$1');
      if (source) sources.set(key, source);
    }
  }
  return sources;
}

function assessMediaEvidence({ markup = '', styleText = '' } = {}) {
  const candidates = [];
  const push = (kind, source, verified, reason) => candidates.push({ kind, source, verified, reason });
  // The asset zone moves every embedded image out of `src` and every CSS
  // background out of `url(` — measured: a brand prototype built to the
  // contract lost the evidence lever and the media grade (70/100 inline,
  // 50/100 zoned) and the approve gate refused it. A named asset is judged by
  // the bytes its key resolves to, exactly like a `src`.
  const zone = assetZoneSources(markup);
  const declaredAssets = new Map();
  for (const match of String(styleText || '').matchAll(/(--asset-[\w-]+)\s*:\s*url\(\s*["']?([^"')]+)["']?\s*\)/gi)) {
    declaredAssets.set(match[1], match[2].trim());
  }
  // A grain texture is atmosphere, never evidence. A zone value is not bounded
  // by `url(...)`, so the scan may cross a `)` inside the SVG.
  const isNoise = (source) => /^data:image\/svg\+xml[^,]*,[\s\S]*feTurbulence/i.test(source);

  for (const match of String(markup || '').matchAll(/<(img|video|picture)\b[^>]*>/gi)) {
    const kind = match[1].toLowerCase();
    const tag = match[0];
    const direct = attribute(tag, 'src') || attribute(tag, 'poster') || attribute(tag, 'srcset');
    const key = direct ? null : attribute(tag, 'data-asset');
    if (!direct && !key) continue;
    if (kind === 'img' && !meaningfulAlt(tag)) continue;
    if (key && !zone.has(key)) {
      push(kind, `data-asset:${key}`, false, `asset key "${key}" not in the asset zone — hydrates nothing`);
      continue;
    }
    const source = direct || zone.get(key);
    const embedded = /^data:(?:image|video)\//i.test(source);
    push(kind, source.slice(0, 160), embedded, embedded ? (key ? 'embedded asset (asset zone)' : 'embedded asset') : 'requires rendered load verification');
  }

  for (const match of String(styleText || '').matchAll(/(?:background(?:-image)?|content)\s*:\s*[^;{}]*url\(\s*["']?([^"')]+)["']?\s*\)/gi)) {
    const source = match[1].trim();
    if (!source || isNoise(source)) continue;
    const embedded = /^data:image\//i.test(source);
    push('css-image', source.slice(0, 160), embedded, embedded ? 'embedded asset' : 'requires rendered load verification');
  }

  for (const match of String(styleText || '').matchAll(/(?:background(?:-image)?|content)\s*:\s*[^;{}]*var\(\s*(--asset-([\w-]+))/gi)) {
    const [, property, key] = match;
    const source = zone.get(key) || declaredAssets.get(property) || '';
    if (!source) {
      push('css-image', `var(${property})`, false, `asset key "${key}" not in the asset zone — hydrates nothing`);
      continue;
    }
    if (isNoise(source)) continue;
    const embedded = /^data:image\//i.test(source);
    push('css-image', source.slice(0, 160), embedded, embedded ? 'embedded asset (asset zone)' : 'requires rendered load verification');
  }

  const verified = candidates.filter((candidate) => candidate.verified);
  const unverified = candidates.filter((candidate) => !candidate.verified);
  return {
    status: verified.length > 0 ? 'verified' : unverified.length > 0 ? 'unverified' : 'absent',
    candidates: candidates.length,
    verified: verified.length,
    unverified: unverified.length,
    items: candidates
  };
}

const MODERN_CAPABILITY_PROBES = {
  architecture: [
    ['container queries', /@container\b|container-type\s*:/i],
    ['subgrid', /\bsubgrid\b/i],
    [':has()', /:has\(/i]
  ],
  responsive: [
    ['fluid clamp() type', /clamp\(/i],
    ['aspect-ratio', /aspect-ratio\s*:/i],
    ['logical properties', /\b(?:margin|padding|border)-(?:inline|block)(?:-start|-end)?\s*:/i]
  ],
  color: [
    ['oklch/color-mix', /oklch\(|oklab\(|color-mix\(/i],
    ['relative color', /\b(?:rgb|hsl|oklch)\(from\b/i]
  ],
  typography: [
    ['text-wrap balance', /text-wrap\s*:\s*(?:balance|pretty)/i],
    ['variable font axes', /font-variation-settings\s*:/i]
  ],
  interaction: [
    ['popover/dialog', /\bpopover\b|<dialog\b|::backdrop/i]
  ],
  motion: [
    ['scroll-driven reveals', SCROLL_REVEAL],
    ['individual transforms', /\b(?:translate|rotate|scale)\s*:/i]
  ],
  performance: [
    ['content-visibility', /content-visibility\s*:/i],
    ['containment', /(?:^|[;{])\s*contain\s*:/i]
  ]
};

function assessModernCss({ markup = '', styleText = '' } = {}) {
  const corpus = `${styleText}\n${markup}`;
  const capabilities = {};
  const features = [];
  for (const [capability, probes] of Object.entries(MODERN_CAPABILITY_PROBES)) {
    const present = probes.filter(([, re]) => re.test(corpus)).map(([name]) => name);
    capabilities[capability] = { present, count: present.length, active: present.length > 0 };
    for (const name of present) if (!features.includes(name)) features.push(name);
  }
  return {
    features,
    capabilities,
    active_capabilities: Object.values(capabilities).filter((value) => value.active).length,
    capability_count: Object.keys(capabilities).length
  };
}

module.exports = {
  DEFAULT_FONT_STACKS,
  assessFontDelivery,
  assessMediaEvidence,
  assessModernCss,
  assessMotion,
  assessStates,
  familyNamesFromUrl,
  namedBlocks,
  normalizeFamily
};
