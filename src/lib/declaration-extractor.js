'use strict';

/**
 * The top-level declarations of a source file, read lexically and build-free: their
 * names, and their normalized bodies with what those bodies depend on. What counts as
 * a repeated declaration is `duplicate-declarations.js`.
 */

const path = require('node:path');
const { MAX_REGEX_LITERAL, neutralizeBraceCode } = require('./code-size');

const JS_EXTS = new Set(['.js', '.jsx', '.mjs', '.cjs', '.ts', '.tsx', '.mts', '.cts']);

const JS_OPENERS = [
  { kind: 'function', re: /^(?:export\s+)?(?:declare\s+)?(?:async\s+)?function\s*\*?\s*([A-Za-z_$][\w$]*)/ },
  { kind: 'binding', re: /^(?:export\s+)?(?:declare\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)/ },
  { kind: 'class', re: /^(?:export\s+)?(?:declare\s+)?(?:abstract\s+)?class\s+([A-Za-z_$][\w$]*)/ }
];

// One table per language outside the JS family: `brace` languages share the
// block scan, `indent` languages end a body at the next line in column 0.
const LANGUAGES = {
  '.py': {
    mode: 'indent',
    openers: [
      { kind: 'function', re: /^(?:async\s+)?def\s+([A-Za-z_]\w*)/ },
      { kind: 'class', re: /^class\s+([A-Za-z_]\w*)/ },
      { kind: 'value', re: /^([A-Z][A-Z0-9_]*)\s*(?::[^=]+)?=(?!=)/ }
    ]
  },
  '.rb': {
    mode: 'indent',
    openers: [
      { kind: 'function', re: /^def\s+([A-Za-z_]\w*[?!]?)/ },
      { kind: 'class', re: /^class\s+([A-Z]\w*)/ },
      { kind: 'value', re: /^([A-Z][A-Z0-9_]*)\s*=(?!=)/ }
    ]
  },
  '.go': {
    mode: 'brace',
    openers: [
      { kind: 'function', re: /^func\s+([A-Za-z_]\w*)/ },
      { kind: 'value', re: /^(?:const|var)\s+([A-Za-z_]\w*)\b[^=\n]*=(?!=)/ }
    ]
  },
  '.rs': {
    mode: 'brace',
    openers: [
      { kind: 'function', re: /^(?:pub(?:\([^)]*\))?\s+)?(?:async\s+)?(?:const\s+)?(?:unsafe\s+)?fn\s+([A-Za-z_]\w*)/ },
      { kind: 'value', re: /^(?:pub(?:\([^)]*\))?\s+)?(?:const|static)\s+([A-Z][A-Z0-9_]*)\b[^=\n]*=(?!=)/ }
    ]
  },
  '.php': {
    mode: 'brace',
    openers: [
      { kind: 'function', re: /^function\s+&?\s*([A-Za-z_]\w*)/ },
      { kind: 'class', re: /^(?:(?:final|abstract)\s+)?class\s+([A-Za-z_]\w*)/ },
      { kind: 'value', re: /^const\s+([A-Za-z_]\w*)\s*=(?!=)/ }
    ]
  }
};

function openersFor(ext) {
  if (JS_EXTS.has(ext)) return JS_OPENERS;
  return LANGUAGES[ext] ? LANGUAGES[ext].openers : null;
}

// Exports a framework reads from each file: the file convention forces the
// repetition, so a copy is not a helper someone could have imported.
const CONVENTION_EXPORTS = new Set([
  'GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS',
  'dynamic', 'dynamicParams', 'revalidate', 'fetchCache', 'runtime', 'preferredRegion', 'maxDuration', 'experimental_ppr',
  'metadata', 'viewport', 'generateMetadata', 'generateViewport', 'generateStaticParams', 'generateSitemaps', 'contentType', 'alt', 'size',
  'config', 'middleware', 'proxy', 'loader', 'action', 'meta', 'links', 'headers', 'handle', 'load', 'prerender', 'ssr', 'csr', 'trailingSlash', 'getServerSideProps', 'getStaticProps', 'getStaticPaths'
]);

// ─── normalization ────────────────────────────────────────────────────────────

const AFTER_THESE_A_SLASH_OPENS_A_REGEX = new Set(['return', 'typeof', 'case', 'in', 'of', 'delete', 'void', 'throw', 'new', 'else', 'do', 'yield', 'await']);
const URL_SCHEMES = new Set(['http', 'https', 'ftp', 'ws', 'wss', 'file']);

function regexCanOpen(tokens) {
  const previous = tokens[tokens.length - 1];
  if (previous === undefined) return true;
  if (/^[\w$]/.test(previous)) return AFTER_THESE_A_SLASH_OPENS_A_REGEX.has(previous);
  if (previous[0] === '"' || previous[0] === '`') return false;
  return previous !== ')' && previous !== ']' && previous !== '}';
}

// The offset of the slash that closes the regex opened at `start`, on its own line.
function regexEnd(source, start) {
  const limit = Math.min(source.length, start + MAX_REGEX_LITERAL);
  let inClass = false;
  for (let k = start + 1; k < limit && source[k] !== '\n'; k += 1) {
    if (source[k] === '\\') k += 1;
    else if (inClass) inClass = source[k] !== ']';
    else if (source[k] === '[') inClass = true;
    else if (source[k] === '/') return k;
  }
  return -1;
}

function pushToken(tokens, token) {
  if (token === ';') return;
  if (/^[)\]}]$/.test(token) && tokens[tokens.length - 1] === ',') tokens.pop();
  tokens.push(token);
}

function lineEnd(source, from) {
  const end = source.indexOf('\n', from);
  return end === -1 ? source.length : end;
}

// Where the comment or regex at this slash ends, or -1 when it is only a slash.
function readSlash({ source, tokens }, i) {
  const next = source[i + 1];
  // `http://` in JSX text is text, and `//` there would swallow the rest of the line.
  const inUrl = next === '/' && tokens[tokens.length - 1] === ':' && source[i - 1] === ':' && URL_SCHEMES.has(tokens[tokens.length - 2]);
  if (next === '/' && !inUrl) return lineEnd(source, i);
  if (next === '*') {
    const end = source.indexOf('*/', i + 2);
    return end === -1 ? source.length : end + 2;
  }
  const close = !inUrl && regexCanOpen(tokens) ? regexEnd(source, i) : -1;
  if (close === -1) return -1;
  let end = close + 1;
  while (end < source.length && /[a-z]/i.test(source[end])) end += 1;
  pushToken(tokens, source.slice(i, end));
  return end;
}

function readQuoted({ source, tokens }, i) {
  const quote = source[i];
  let k = i + 1;
  while (k < source.length && source[k] !== quote && (quote === '`' || source[k] !== '\n')) k += source[k] === '\\' ? 2 : 1;
  const content = source.slice(i + 1, k);
  pushToken(tokens, quote === '`' && content.includes('${') ? `\`${content}\`` : `"${content}"`);
  return k + 1;
}

function readWord({ source, tokens }, i) {
  let k = i + 1;
  while (k < source.length && /[\w$]/.test(source[k])) k += 1;
  const word = source.slice(i, k);
  pushToken(tokens, /^\d/.test(word) ? word.replace(/_/g, '') : word);
  return k;
}

function nextToken(state, i) {
  const { source, hashComments } = state;
  const ch = source[i];
  if (/\s/.test(ch)) return i + 1;
  if (hashComments && ch === '#') return lineEnd(source, i);
  const afterSlash = !hashComments && ch === '/' ? readSlash(state, i) : -1;
  if (afterSlash !== -1) return afterSlash;
  if (ch === '"' || ch === "'" || ch === '`') return readQuoted(state, i);
  if (/[\w$]/.test(ch)) return readWord(state, i);
  pushToken(state.tokens, ch);
  return i + 1;
}

/** The tokens two copies share whatever their layout. */
function tokenize(text, { hashComments = false } = {}) {
  const state = { source: String(text), tokens: [], hashComments };
  let i = 0;
  while (i < state.source.length) i = nextToken(state, i);
  return state.tokens;
}

/** Tokens joined by one space. */
function normalizeBody(text, options) {
  return tokenize(text, options).join(' ');
}

// What a template reads: only its `${}`. Read by offset, because a regex over a run of
// `${` with no `}` reads to the end once per opener.
function templateReads(token) {
  const names = [];
  let at = token.indexOf('${');
  while (at !== -1) {
    const end = token.indexOf('}', at);
    if (end === -1) break;
    names.push(...(token.slice(at + 2, end).match(/[A-Za-z_$][\w$]*/g) || []));
    at = token.indexOf('${', end);
  }
  return names;
}

// What a body reads: not a string, a regex or a property.
function namesIn(tokens) {
  const names = [];
  tokens.forEach((token, index) => {
    if (token[0] === '`') names.push(...templateReads(token));
    else if (/^[A-Za-z_$]/.test(token) && tokens[index - 1] !== '.') names.push(token);
  });
  return names;
}

// ─── the scanners ─────────────────────────────────────────────────────────────

const OPEN = { '(': ')', '[': ']', '{': '}' };

// How far the scanners have read. A file whose brackets never close makes every opener
// read to its end; `extractBrace` stops at a budget, so that cost stays linear.
let scanSteps = 0;

const isBracket = (ch) => ch === ')' || ch === ']' || ch === '}';

/** Offset just past the bracket that closes the one at `start`, or -1. */
function skipBalanced(neutral, start) {
  const stack = [];
  for (let i = start; i < neutral.length; i += 1) {
    scanSteps += 1;
    const ch = neutral[i];
    if (OPEN[ch]) stack.push(OPEN[ch]);
    else if (isBracket(ch)) {
      if (stack.pop() !== ch) return -1;
      if (stack.length === 0) return i + 1;
    }
  }
  return -1;
}

function skipSpace(neutral, start) {
  let i = start;
  while (i < neutral.length && /\s/.test(neutral[i])) i += 1;
  scanSteps += i - start;
  return i;
}

// `<T extends { a: string }>`: an arrow inside a bound is not a closing angle.
function skipAngles(neutral, start) {
  let depth = 0;
  for (let i = start; i < neutral.length; i += 1) {
    scanSteps += 1;
    const ch = neutral[i];
    if (ch === '<') depth += 1;
    else if (ch === '>' && neutral[i - 1] !== '=') {
      depth -= 1;
      if (depth === 0) return i + 1;
    } else if (ch === ';') return -1;
  }
  return -1;
}

// Past `<T>` and, in Go, `[T any]`, or -1.
function pastTypeParams(neutral, from) {
  let i = skipSpace(neutral, from);
  if (neutral[i] === '<') {
    i = skipAngles(neutral, i);
    if (i === -1) return -1;
    i = skipSpace(neutral, i);
  }
  if (neutral[i] !== '[') return i;
  i = skipBalanced(neutral, i);
  return i === -1 ? -1 : skipSpace(neutral, i);
}

// A return type that opens with a brace is an object type, not the block.
function pastObjectReturn(neutral, from) {
  const i = skipSpace(neutral, from);
  if (neutral[i] !== ':') return i;
  const type = skipSpace(neutral, i + 1);
  return neutral[type] === '{' ? skipBalanced(neutral, type) : i;
}

const closesType = (neutral, i) => {
  const ch = neutral[i];
  return ch === ')' || ch === ']' || (ch === '>' && neutral[i - 1] !== '=' && neutral[i - 1] !== '-');
};

// The brace that opens the block, past a return type of any other shape, or -1.
function blockBrace(neutral, from) {
  let nesting = 0;
  for (let i = from; i < neutral.length; i += 1) {
    scanSteps += 1;
    const ch = neutral[i];
    if (ch === '(' || ch === '[' || ch === '<') nesting += 1;
    else if (closesType(neutral, i)) nesting = Math.max(0, nesting - 1);
    else if (nesting === 0 && ch === ';') return -1;
    else if (nesting === 0 && ch === '{') return i;
  }
  return -1;
}

/**
 * The block of a function whose name ends at `from`: past generics, parameters
 * and a return type. `null` for a bodiless signature (a TS overload, `declare`).
 */
function functionBlock(neutral, from) {
  const open = pastTypeParams(neutral, from);
  if (open === -1 || neutral[open] !== '(') return null;
  const close = skipBalanced(neutral, open);
  if (close === -1) return null;
  const afterReturn = pastObjectReturn(neutral, close);
  if (afterReturn === -1) return null;
  const start = blockBrace(neutral, afterReturn);
  if (start === -1) return null;
  const end = skipBalanced(neutral, start);
  return end === -1 ? null : { start, end, paramsStart: open + 1, paramsEnd: close - 1 };
}

// A line in column 0 ends a statement unless it continues the expression.
function startsContinuation(ch) {
  return /[.?:+\-*/%|&=<>,)\]}]/.test(ch);
}

function startsNextStatement(neutral, i) {
  const next = neutral[i + 1];
  return neutral[i] === '\n' && next !== undefined && !/\s/.test(next) && !startsContinuation(next);
}

// At depth 0: past the `=` of an initializer, -1 when there is none, null to go on.
// `let x` with no initializer ends at the next statement, or a file of them would scan
// to its end once per line.
function initializerAt(neutral, i) {
  const ch = neutral[i];
  if (ch === ';' || startsNextStatement(neutral, i)) return -1;
  return ch === '=' && neutral[i + 1] !== '>' && neutral[i + 1] !== '=' ? i + 1 : null;
}

const opensAny = (ch) => ch === '(' || ch === '[' || ch === '{' || ch === '<';

/** Offset of the `=` of a binding, past a type annotation of any shape. */
function initializerStart(neutral, from) {
  let nesting = 0;
  for (let i = from; i < neutral.length; i += 1) {
    scanSteps += 1;
    const ch = neutral[i];
    if (opensAny(ch)) nesting += 1;
    else if (isBracket(ch) || (ch === '>' && neutral[i - 1] !== '=')) nesting -= 1;
    else if (nesting === 0) {
      const verdict = initializerAt(neutral, i);
      if (verdict !== null) return verdict;
    }
    if (nesting < 0) return -1;
  }
  return -1;
}

/** End of the statement that starts at `from`: a `;` at depth 0, or the next statement. */
function statementEnd(neutral, from) {
  let depth = 0;
  for (let i = from; i < neutral.length; i += 1) {
    scanSteps += 1;
    const ch = neutral[i];
    if (OPEN[ch]) depth += 1;
    else if (isBracket(ch)) depth -= 1;
    else if (depth === 0 && (ch === ';' || startsNextStatement(neutral, i))) return i;
    if (depth < 0) return i;
  }
  return neutral.length;
}

// `(a: T)` or `a`: where the parameters are and the offset after them, or null.
function arrowParams(neutral, i) {
  if (neutral[i] === '(') {
    const end = skipBalanced(neutral, i);
    return end === -1 ? null : { paramsStart: i + 1, paramsEnd: end - 1, after: end };
  }
  const word = /^[A-Za-z_$][\w$]*/.exec(neutral.slice(i, i + 80));
  return word ? { paramsStart: i, paramsEnd: i + word[0].length, after: i + word[0].length } : null;
}

// The offset after the arrow, past a return type, or -1.
function arrowEnd(neutral, from) {
  let nesting = 0;
  for (let i = from; i < neutral.length; i += 1) {
    scanSteps += 1;
    const ch = neutral[i];
    if (nesting === 0 && ch === '=' && neutral[i + 1] === '>') return i + 2;
    if (opensAny(ch)) nesting += 1;
    else if (isBracket(ch) || ch === '>') nesting -= 1;
    else if (nesting === 0 && (ch === ';' || ch === '=' || ch === '\n')) return -1;
    if (nesting < 0) return -1;
  }
  return -1;
}

// `(a: T): R =>` or `a =>`, past `async` and generics: its parameters and the offset
// after the arrow, or null.
function arrowShape(neutral, from) {
  let i = skipSpace(neutral, from);
  if (/^async\b/.test(neutral.slice(i, i + 6))) i = skipSpace(neutral, i + 5);
  if (neutral[i] === '<') {
    i = skipAngles(neutral, i);
    if (i === -1) return null;
    i = skipSpace(neutral, i);
  }
  const params = arrowParams(neutral, i);
  if (!params) return null;
  const body = arrowEnd(neutral, skipSpace(neutral, params.after));
  return body === -1 ? null : { body, paramsStart: params.paramsStart, paramsEnd: params.paramsEnd };
}

// Split at the commas of its own level, and at its own `:` or `=`.
function splitParams(text) {
  const parts = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if ('([{<'.includes(ch)) depth += 1;
    else if (')]}'.includes(ch) || (ch === '>' && text[i - 1] !== '=' && text[i - 1] !== '-')) depth -= 1;
    else if (ch === ',' && depth === 0) {
      parts.push(text.slice(start, i));
      start = i + 1;
    }
  }
  parts.push(text.slice(start));
  return parts.map((part) => part.trim()).filter(Boolean);
}

function splitDefault(param) {
  let depth = 0;
  let nameEnd = -1;
  for (let i = 0; i < param.length; i += 1) {
    const ch = param[i];
    if ('([{<'.includes(ch)) depth += 1;
    else if (')]}'.includes(ch) || (ch === '>' && param[i - 1] !== '=' && param[i - 1] !== '-')) depth -= 1;
    else if (depth === 0 && ch === ':' && nameEnd === -1) nameEnd = i;
    else if (depth === 0 && ch === '=' && param[i + 1] !== '>' && param[i + 1] !== '=') {
      return { head: param.slice(0, nameEnd === -1 ? i : nameEnd), fallback: param.slice(i + 1) };
    }
  }
  return { head: param.slice(0, nameEnd === -1 ? param.length : nameEnd), fallback: '' };
}

// The name a parameter binds, by the language's order of words: `a int` in Go,
// `mut x` in Rust, `int $x` in PHP, `...rest` and `*args` anywhere else.
function paramName(ext, head) {
  const text = head.replace(/\?\s*$/, '').trim();
  if (/^[{[]/.test(text)) return text;
  const variable = /\$\w+/.exec(text);
  if (variable) return variable[0];
  const words = text.match(/[A-Za-z_][\w]*/g) || [];
  if (words.length === 0) return text;
  return ext === '.go' ? words[0] : words[words.length - 1];
}

/**
 * The parameters as the block reads them, in order: a name and its default when the
 * block uses it, `_` when it does not. So `sub(a, b)` and `sub(b, a)` over `a - b`
 * differ, and `f(a)` and `f(b)` over `return 1` do not.
 */
function paramSignature(ext, text, tokens) {
  const used = new Set(namesIn(tokens));
  return splitParams(text).map((param) => {
    const { head, fallback } = splitDefault(param);
    const name = paramName(ext, head);
    const bound = name.match(/[A-Za-z_$][\w$]*/g) || [];
    if (!bound.some((word) => used.has(word))) return '_';
    return fallback ? `${normalizeBody(name)}=${normalizeBody(fallback)}` : normalizeBody(name);
  }).join(',');
}

function withoutTypeSuffix(init) {
  const text = init.trimEnd();
  if (/\sas\s+const$/.test(text.slice(-40))) return text.slice(0, text.lastIndexOf('as')).trimEnd();
  const at = text.lastIndexOf('satisfies');
  if (at > 0 && /\s/.test(text[at - 1]) && !/[;\n]/.test(text.slice(at))) return text.slice(0, at).trimEnd();
  return text;
}

const MODULE_LOAD = /^(?:await\s+)?(?:require|import)\s*\(/;
const LOCATION_BOUND = /\b__dirname\b|\b__filename\b|\bimport\.meta\b|\bprocess\.cwd\b/;
const ZERO_ARG_CALL = /^(?:new\s+|await\s+)?[A-Za-z_$][\w$.]*\s*\(\s*\)\s*$/;
const ALIAS = /^[A-Za-z_$][\w$.]*(?:\s+as\s+[^;]+)?$/;
const PLAIN_SCALAR = /^(?:true|false|null|undefined|-?[\d_.]+|"[^"]*"|'[^']*')$/;
const CONSTANT_NAME = /^[A-Z][A-Z0-9_]*$/;

/**
 * What a binding holds: a function (compared by its block), or a value compared
 * whole. `filtered` when it repeats by nature, not by copy: still read, because a
 * function of this file may depend on its value.
 */
function classifyBinding(name, neutral, raw, start, end) {
  const init = withoutTypeSuffix(raw.slice(start, end).trim());
  if (!init) return null;
  if (MODULE_LOAD.test(init) || LOCATION_BOUND.test(init) || ZERO_ARG_CALL.test(init) || ALIAS.test(init)) return { kind: 'value', text: init, filtered: true };
  // A lowercase `limit = 10` is a local setting, not a constant someone shares.
  if (PLAIN_SCALAR.test(init) && !CONSTANT_NAME.test(name)) return { kind: 'value', text: init, filtered: true };
  const head = start + (raw.slice(start, end).length - raw.slice(start, end).trimStart().length);
  const functionWord = /^(?:async\s+)?function\b\s*\*?\s*(?:[A-Za-z_$][\w$]*)?/.exec(init);
  if (functionWord) {
    const block = functionBlock(neutral, head + functionWord[0].length);
    if (block) return { kind: 'function', text: raw.slice(block.start, block.end), params: raw.slice(block.paramsStart, block.paramsEnd) };
  }
  const arrow = arrowShape(neutral, head);
  if (arrow && arrow.body <= end) return { kind: 'function', text: raw.slice(arrow.body, end), params: raw.slice(arrow.paramsStart, arrow.paramsEnd) };
  return { kind: 'value', text: init };
}

function isEmptyBody(normalized) {
  return normalized === '' || normalized === '{ }';
}


function firstOpener(text, openers) {
  for (const opener of openers) {
    const match = text.match(opener.re);
    if (match) return { opener, match };
  }
  return null;
}

// What each kind of opener holds, or null when it holds nothing to compare.
const BRACE_READERS = {
  function({ raw, neutral }, name, nameEnd) {
    const block = functionBlock(neutral, nameEnd);
    return block && { kind: 'function', text: raw.slice(block.start, block.end), params: raw.slice(block.paramsStart, block.paramsEnd) };
  },
  class({ raw, neutral }, name, nameEnd, lineStart) {
    const brace = neutral.indexOf('{', nameEnd);
    scanSteps += (brace === -1 ? neutral.length : brace) - nameEnd;
    const end = brace === -1 ? -1 : skipBalanced(neutral, brace);
    return end === -1 ? null : { kind: 'class', text: raw.slice(lineStart, end).replace(/^(?:export\s+)?(?:declare\s+)?/, '') };
  },
  value({ raw, neutral }, name, nameEnd) {
    const text = raw.slice(nameEnd, statementEnd(neutral, nameEnd)).trim();
    return text ? { kind: 'value', text } : null;
  },
  binding({ raw, neutral }, name, nameEnd) {
    const start = initializerStart(neutral, nameEnd);
    return start === -1 ? null : classifyBinding(name, neutral, raw, start, statementEnd(neutral, start));
  }
};

// Real code reads each declaration a few times at most. A file past this has brackets
// that never close: nobody imports from it, and what is left of it goes unread.
const SCAN_BUDGET = 16;

function extractBrace(raw, openers) {
  const neutral = neutralizeBraceCode(raw);
  const stopAt = scanSteps + neutral.length * SCAN_BUDGET;
  const found = [];
  let offset = 0;
  for (const [index, text] of neutral.split('\n').entries()) {
    const lineStart = offset;
    offset += text.length + 1;
    if (scanSteps > stopAt) break;
    const hit = firstOpener(text, openers);
    if (!hit) continue;
    const name = hit.match[1];
    const held = BRACE_READERS[hit.opener.kind]({ raw, neutral }, name, lineStart + hit.match[0].length, lineStart);
    if (held) found.push({ name, line: index + 1, ...held });
  }
  return found;
}

function indentBodyEnd(lines, index) {
  let end = index + 1;
  while (end < lines.length && !(lines[end].trim() && /^\S/.test(lines[end]) && !/^[)\]}]/.test(lines[end]))) end += 1;
  // Ruby closes with `end` in column 0, inside the body.
  return end < lines.length && /^end\b/.test(lines[end]) ? end + 1 : end;
}

// Read by offset: a regex over a line of `(` tries each one to the end of the line.
function paramsOnLine(text) {
  const open = text.indexOf('(');
  const close = open === -1 ? -1 : text.indexOf(')', open);
  return close === -1 ? '' : text.slice(open + 1, close);
}

function readIndented(lines, index, { kind }, match) {
  const text = lines[index];
  const body = kind === 'value'
    ? text.slice(match[0].length)
    : lines.slice(kind === 'class' ? index : index + 1, indentBodyEnd(lines, index)).join('\n');
  return { name: match[1], kind, line: index + 1, text: body, params: kind === 'function' ? paramsOnLine(text) : '' };
}

function extractIndent(raw, openers) {
  const lines = raw.split('\n');
  const found = [];
  lines.forEach((text, index) => {
    const hit = firstOpener(text, openers);
    if (hit) found.push(readIndented(lines, index, hit.opener, hit.match));
  });
  return found;
}

function withoutBom(content) {
  return String(content).replace(/^\uFEFF/, '');
}

// The declaration as it is compared, or null when it repeats by nature, not by copy.
function comparable(item, tokens, { ext, lines, topLevel, bodies }) {
  if (item.filtered) return null;
  if (CONVENTION_EXPORTS.has(item.name) && /^export\b/.test(lines[item.line - 1])) return null;
  const body = tokens.join(' ');
  if (isEmptyBody(body)) return null;
  const reads = namesIn(tokens).filter((word) => word !== item.name);
  const isValue = item.kind === 'value';
  // The same text over this file's own bindings is a different value.
  if (isValue && reads.some((word) => topLevel.has(word))) return null;
  const signature = item.kind === 'function' ? paramSignature(ext, item.params || '', tokens) : '';
  const scope = isValue ? [] : [...new Set(reads)].filter((word) => bodies.has(word)).sort().map((word) => `${word}=${bodies.get(word)}`);
  return { name: item.name, kind: item.kind, line: item.line, body, signature, scope: scope.join('\n') };
}

/**
 * Every top-level declaration of a file that could be a copy: `[{ name, kind, line,
 * body, signature, scope }]`, body normalized, with what else the body depends on.
 */
function extractDeclarations(rel, content) {
  const ext = path.extname(rel).toLowerCase();
  const openers = openersFor(ext);
  if (!openers) return [];
  const raw = withoutBom(content).replace(/\r\n/g, '\n');
  const language = LANGUAGES[ext];
  const hashComments = Boolean(language) && language.mode === 'indent';
  const declared = hashComments ? extractIndent(raw, openers) : extractBrace(raw, openers);
  const tokensOf = new Map(declared.map((item) => [item, tokenize(item.text, { hashComments })]));
  const context = {
    ext,
    lines: raw.split('\n'),
    topLevel: declaredNames(rel, raw),
    bodies: new Map(declared.map((item) => [item.name, tokensOf.get(item).join(' ')]))
  };
  return declared.map((item) => comparable(item, tokensOf.get(item), context)).filter(Boolean);
}

/** The declaration names of a file, read with one regex per line (first pass). */
function declaredNames(rel, content) {
  const openers = openersFor(path.extname(rel).toLowerCase());
  const names = new Set();
  if (!openers) return names;
  for (const line of withoutBom(content).split('\n')) {
    const first = line.charCodeAt(0);
    // Column 0 and a letter: everything else is cheap to skip.
    if (!((first >= 65 && first <= 90) || (first >= 97 && first <= 122))) continue;
    for (const opener of openers) {
      const match = line.match(opener.re);
      if (match) {
        names.add(match[1]);
        break;
      }
    }
  }
  return names;
}

module.exports = {
  CONVENTION_EXPORTS,
  JS_EXTS,
  LANGUAGES,
  declaredNames,
  extractDeclarations,
  normalizeBody,
  openersFor,
  withoutBom
};
