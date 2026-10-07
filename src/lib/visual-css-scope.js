'use strict';

// Credit selectors supported by the supplied markup and literal state classes.
// This is source reachability, not CSS cascade/layout evaluation. Computed class
// names may be missed; functional selectors and CSS-in-JS need browser evidence.
function scopeVisualCss(css, markup) {
  const source = String(css || '');
  const clean = String(markup || '').replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, '').replace(/<!--[\s\S]*?-->/g, '');
  const nodes = [...clean.matchAll(/<([a-z][\w-]*)\b((?:"[^"]*"|'[^']*'|[^'">])*)>/gi)].map((m) => {
    const attrs = {};
    for (const a of m[2].matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g)) attrs[a[1].toLowerCase()] = a[2] ?? a[3] ?? a[4];
    return { tag: m[1].toLowerCase(), id: attrs.id, classes: new Set(String(attrs.class || '').split(/\s+/)) };
  });
  const excluded = [];
  const uncertain = [];
  const dynamic = /\bclass(?:Name)?\s*=\s*\{|\b(?:classList|className|innerHTML|createElement)\b/.test(markup);
  const dynamicClasses = new Set();
  // A script somewhere in the page does not make every unused selector live.
  // Only literal class assignments are source evidence; computed names require
  // the runtime probe. These rules remain marked uncertain, not DOM-verified.
  for (const match of String(markup || '').matchAll(/(?:classList\.(?:add|toggle|replace)\s*\(([^)]*)\)|className\s*=\s*(["'`][^"'`]*["'`])|class(?:Name)?\s*=\s*\{([^}]*))/g)) {
    for (const literal of (match[1] || match[2] || match[3] || '').matchAll(/["'`]([^"'`]+)["'`]/g)) {
      for (const token of literal[1].split(/\s+/)) if (/^[\w-]+$/.test(token)) dynamicClasses.add(token);
    }
  }
  const scoped = nodes.length > 0;
  const possible = (selector) => {
    // Do not pretend a lexical scan can expand these selector grammars.
    if (/[\\&[\]()]/.test(selector)) return null;
    const parts = selector.replace(/::?[\w-]+/g, '').trim().split(/[\s>+~]+/).filter(Boolean);
    let dynamicMatch = false;
    const matched = parts.every((part) => {
      const tag = part.match(/^[a-z][\w-]*/i)?.[0].toLowerCase();
      const id = part.match(/#([\w-]+)/)?.[1];
      const classes = [...part.matchAll(/\.([\w-]+)/g)].map((m) => m[1]);
      if (!tag && !id && !classes.length) return true;
      const found = nodes.some((node) => (!tag || tag === node.tag) && (!id || id === node.id) && classes.every((c) => node.classes.has(c)));
      if (found || (!id && !classes.length && ['html', 'head', 'body'].includes(tag))) return true;
      const state = classes.length > 0 && nodes.some((node) => (!tag || tag === node.tag) && (!id || id === node.id) && classes.every((c) => node.classes.has(c) || dynamicClasses.has(c)));
      if (state) dynamicMatch = true;
      return state;
    });
    return matched ? (dynamicMatch ? null : true) : false;
  };
  const text = !scoped ? source : source.replace(/([^{}]+)\{([^{}]*)\}/g, (rule, head) => {
    const selector = head.trim();
    if (selector.startsWith('@') || /^(?:from|to|[\d.]+%)(?:\s*,|$)/i.test(selector)) return rule;
    const alternatives = selector.split(',').map((s) => s.trim());
    const outcomes = alternatives.map(possible);
    if (outcomes.every((result) => result === false)) {
      excluded.push(...alternatives);
      return '';
    }
    if (outcomes.some((result) => result === null)) uncertain.push(selector);
    return rule;
  });
  return {
    css: text,
    evidence: {
      scoped,
      excluded_selectors: [...new Set(excluded)],
      uncertain_selectors: [...new Set(uncertain)],
      dynamic_markup: dynamic,
      limitation: 'Source reachability only; cascade, visibility, selector relationships and runtime states require browser inspection.'
    }
  };
}

// Color/type independent, measured structure for cross-project recall. Keep
// sequence and layout relationships; this is a similarity hint, never proof
// that two rendered compositions are identical.
function compositionFingerprint(markup, css) {
  const clean = String(markup || '').replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, '');
  const regions = [...clean.matchAll(/<(header|nav|main|section|article|aside|figure|table|form|footer)\b/gi)].map((m) => m[1].toLowerCase()).slice(0, 24);
  if (regions.length < 3) return null;
  const layouts = [...String(css || '').matchAll(/(?:grid-template-columns|flex-direction|grid-template-areas)\s*:\s*([^;{}]+)/g)]
    .map((m) => m[0].replace(/\s+/g, ' ').trim()).slice(0, 12);
  const media = [...clean.matchAll(/<(img|video|canvas|svg)\b/gi)].map((m) => m[1].toLowerCase()).slice(0, 12);
  return JSON.stringify({ regions, layouts: [...new Set(layouts)], media });
}

module.exports = { scopeVisualCss, compositionFingerprint };
