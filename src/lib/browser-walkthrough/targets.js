'use strict';

/**
 * Targets and boundaries: one string -> one Playwright locator; one string ->
 * the request an action must produce.
 */

// ---------------------------------------------------------------------------
// Targets — one string → one Playwright locator
// ---------------------------------------------------------------------------

function unquote(value) {
  const v = String(value || '').trim();
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith('\'') && v.endsWith('\''))) return v.slice(1, -1);
  return v;
}

function asMatcher(value) {
  const v = String(value || '');
  const regex = v.match(/^\/(.+)\/([a-z]*)$/);
  if (regex) {
    try { return new RegExp(regex[1], regex[2]); } catch { return v; }
  }
  return unquote(v);
}

/**
 * `role=button[name="Save"][exact]>>nth=1` → { kind, value, options, nth }
 */
function parseTarget(input) {
  const text = String(input || '').trim();
  if (!text) return null;
  let body = text;
  let nth = null;
  const chain = body.split('>>');
  if (chain.length > 1) {
    body = chain[0].trim();
    for (const mod of chain.slice(1)) {
      const m = mod.trim();
      if (m === 'first') nth = 0;
      else if (m === 'last') nth = -1;
      else if (/^nth=\d+$/.test(m)) nth = Number(m.slice(4));
    }
  }
  const prefixed = body.match(/^(role|text|label|placeholder|testid|title|alt|css|xpath)=([\s\S]*)$/i);
  if (!prefixed) return { kind: 'css', value: body, options: {}, nth, raw: text };
  const kind = prefixed[1].toLowerCase();
  let rest = prefixed[2];
  // A css/xpath selector is passed to Playwright whole: its trailing
  // `[name="status"]` is an attribute filter, not a locator option.
  if (kind === 'css' || kind === 'xpath') return { kind, value: rest.trim(), options: {}, nth, raw: text };
  const options = {};
  const attrs = [];
  // trailing [key=value] / [flag] groups
  for (;;) {
    const m = rest.match(/\[([a-z]+)(?:=((?:"[^"]*")|(?:'[^']*')|(?:\/[^/]+\/[a-z]*)|[^\]]*))?\]\s*$/i);
    if (!m) break;
    attrs.unshift([m[1].toLowerCase(), m[2]]);
    rest = rest.slice(0, m.index);
  }
  for (const [key, value] of attrs) {
    if (key === 'exact') options.exact = value === undefined ? true : unquote(value) !== 'false';
    else if (key === 'name') options.name = asMatcher(value);
    else if (key === 'level') options.level = Number(unquote(value));
    else if (key === 'checked') options.checked = unquote(value) !== 'false';
    else if (key === 'pressed') options.pressed = unquote(value) !== 'false';
    else if (key === 'expanded') options.expanded = unquote(value) !== 'false';
    else if (key === 'selected') options.selected = unquote(value) !== 'false';
    else if (key === 'disabled') options.disabled = unquote(value) !== 'false';
    else if (key === 'hidden') options.includeHidden = unquote(value) !== 'false';
  }
  return { kind, value: kind === 'role' ? unquote(rest).toLowerCase() : asMatcher(rest), options, nth, raw: text };
}

function locatorFor(page, target) {
  const parsed = typeof target === 'string' ? parseTarget(target) : target;
  if (!parsed) throw new Error('empty target');
  let locator;
  const opt = parsed.options || {};
  switch (parsed.kind) {
    case 'role': locator = page.getByRole(parsed.value, opt); break;
    case 'text': locator = page.getByText(parsed.value, { exact: Boolean(opt.exact) }); break;
    case 'label': locator = page.getByLabel(parsed.value, { exact: Boolean(opt.exact) }); break;
    case 'placeholder': locator = page.getByPlaceholder(parsed.value, { exact: Boolean(opt.exact) }); break;
    case 'testid': locator = page.getByTestId(parsed.value); break;
    case 'title': locator = page.getByTitle(parsed.value, { exact: Boolean(opt.exact) }); break;
    case 'alt': locator = page.getByAltText(parsed.value, { exact: Boolean(opt.exact) }); break;
    case 'xpath': locator = page.locator(`xpath=${parsed.value}`); break;
    default: locator = page.locator(parsed.value);
  }
  if (parsed.nth === -1) locator = locator.last();
  else if (Number.isInteger(parsed.nth) && parsed.nth >= 0) locator = locator.nth(parsed.nth);
  return locator;
}

// ---------------------------------------------------------------------------
// Boundaries — the real request an action must produce
// ---------------------------------------------------------------------------

function parseBoundary(value) {
  if (!value) return null;
  if (typeof value === 'object') {
    return {
      method: String(value.method || '*').toUpperCase(),
      url: String(value.url || value.path || ''),
      status: value.status === undefined ? null : Number(value.status),
      raw: `${String(value.method || '*').toUpperCase()} ${String(value.url || value.path || '')}${value.status !== undefined ? ` → ${value.status}` : ''}`
    };
  }
  const text = String(value).trim();
  const m = text.match(/^([A-Z]+|\*)\s+(\S+)(?:\s*(?:→|->|=>)\s*(\d{3}))?$/i);
  if (!m) return { method: '*', url: text, status: null, raw: text };
  return { method: m[1].toUpperCase(), url: m[2], status: m[3] ? Number(m[3]) : null, raw: text };
}

function urlMatches(pattern, url) {
  if (!pattern) return true;
  const regex = pattern.match(/^\/(.+)\/([a-z]*)$/);
  if (regex && /[.*+?^${}()|[\]\\]/.test(regex[1])) {
    try { return new RegExp(regex[1], regex[2]).test(url); } catch { /* fall through */ }
  }
  let parsed = null;
  try { parsed = new URL(url); } catch { /* opaque */ }
  if (pattern.startsWith('/') && parsed) {
    return parsed.pathname === pattern || parsed.pathname.startsWith(pattern.endsWith('/') ? pattern : `${pattern}/`) || parsed.pathname.startsWith(pattern);
  }
  return url.includes(pattern);
}

function boundaryHit(boundary, row) {
  if (!boundary) return false;
  if (boundary.method !== '*' && boundary.method !== row.method) return false;
  return urlMatches(boundary.url, row.url);
}

module.exports = {
  unquote,
  asMatcher,
  parseTarget,
  locatorFor,
  parseBoundary,
  urlMatches,
  boundaryHit
};
