'use strict';

/**
 * Duplicate declarations — the same top-level helper written twice.
 *
 * A fresh agent per phase does not know what the earlier phases created, so it
 * writes the helper again: one delivery ended with the same constant in five
 * files, and two QA rounds found the class by hand because nothing measured it.
 * This module measures it lexically and build-free.
 *
 * Two declarations repeat only when the LANGUAGE FAMILY, the NAME and the
 * NORMALIZED BODY all match: nobody can import a Python constant from TypeScript. A
 * same-name pair with different bodies is not reported, which is what keeps `GET`,
 * `Page` and a local `format` out of the report. It also means a near-copy goes
 * unreported, and that is the known limit of this check: one helper rewritten with
 * `useMemo` around the same expression, or `byName` written once to sort a list and
 * once as a comparator, are different bodies.
 *
 * For a function the body is the block, so a signature annotated differently
 * (`value: RawParam` and `value: string | string[]`) does not hide a copy. What the
 * block means still has to match: the order and defaults of the parameters it uses,
 * and the values of this file's own top-level names it reads. Normalization drops
 * comments, whitespace, semicolons and trailing commas, and unifies quotes and
 * numeric separators. A regex literal is one token, so `/\/\//` opens no comment.
 *
 * Declarations that repeat by convention never count: default exports, names a
 * framework reads from each file's exports (`dynamic`, `metadata`, `GET`…),
 * per-file instances (`const router = express.Router()`), module loads, aliases,
 * values that depend on the file itself (`__dirname`, `import.meta`, another
 * top-level binding of the same file), and lowercase scalars (`limit = 10`).
 *
 * Speed comes from two passes. The first reads declaration names with one regex
 * per line; only names seen in two files reach the second pass, which reads
 * bodies. Most names are unique, so most files are never parsed.
 */

const path = require('node:path');
const { neutralizeBraceCode } = require('./code-size');

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

// One family imports from itself: TS reads JS, and nothing else crosses.
function familyOf(rel) {
  const ext = path.extname(rel).toLowerCase();
  return JS_EXTS.has(ext) ? 'js' : ext;
}

function openersFor(ext) {
  if (JS_EXTS.has(ext)) return JS_OPENERS;
  return LANGUAGES[ext] ? LANGUAGES[ext].openers : null;
}

// Tests repeat fixtures on purpose and generated code has no author to tell.
const NOT_INDEXED = new RegExp([
  String.raw`(?:^|/)(?:__tests__|__mocks__|__fixtures__|__snapshots__|tests?|spec|specs|e2e|cypress|playwright|fixtures|factories|stories|storybook|generated|__generated__|vendor|migrations)/`,
  String.raw`\.(?:test|spec|stories|fixture|factory|d|min|bundle|generated|freezed|g|designer|pb|config)\.[^/]+$`,
  String.raw`_test\.go$|_spec\.rb$|_test\.py$|(?:^|/)test_[^/]+\.py$|_pb2\.py$|\.pb\.go$`
].join('|'), 'i');

function isIndexable(rel) {
  return Boolean(openersFor(path.extname(rel).toLowerCase())) && !NOT_INDEXED.test(rel);
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
  let inClass = false;
  for (let k = start + 1; k < source.length && source[k] !== '\n'; k += 1) {
    if (source[k] === '\\') k += 1;
    else if (inClass) inClass = source[k] !== ']';
    else if (source[k] === '[') inClass = true;
    else if (source[k] === '/') return k;
  }
  return -1;
}

/** The tokens two copies share whatever their layout. */
function tokenize(text, { hashComments = false } = {}) {
  const tokens = [];
  const source = String(text);
  const push = (token) => {
    if (token === ';') return;
    if (/^[)\]}]$/.test(token) && tokens[tokens.length - 1] === ',') tokens.pop();
    tokens.push(token);
  };
  let i = 0;
  while (i < source.length) {
    const ch = source[i];
    const next = source[i + 1];
    if (/\s/.test(ch)) { i += 1; continue; }
    if (hashComments && ch === '#') {
      while (i < source.length && source[i] !== '\n') i += 1;
      continue;
    }
    if (!hashComments && ch === '/') {
      // `http://` in JSX text is text, and `//` there would swallow the rest of the line.
      const inUrl = next === '/' && tokens[tokens.length - 1] === ':' && source[i - 1] === ':' && URL_SCHEMES.has(tokens[tokens.length - 2]);
      if (next === '/' && !inUrl) {
        while (i < source.length && source[i] !== '\n') i += 1;
        continue;
      }
      if (next === '*') {
        const end = source.indexOf('*/', i + 2);
        i = end === -1 ? source.length : end + 2;
        continue;
      }
      const close = !inUrl && regexCanOpen(tokens) ? regexEnd(source, i) : -1;
      if (close !== -1) {
        let end = close + 1;
        while (end < source.length && /[a-z]/i.test(source[end])) end += 1;
        push(source.slice(i, end));
        i = end;
        continue;
      }
    }
    if (ch === '"' || ch === "'" || ch === '`') {
      let k = i + 1;
      while (k < source.length && source[k] !== ch && (ch === '`' || source[k] !== '\n')) k += source[k] === '\\' ? 2 : 1;
      const content = source.slice(i + 1, k);
      push(ch === '`' && content.includes('${') ? `\`${content}\`` : `"${content}"`);
      i = k + 1;
      continue;
    }
    if (/[\w$]/.test(ch)) {
      let k = i + 1;
      while (k < source.length && /[\w$]/.test(source[k])) k += 1;
      const word = source.slice(i, k);
      push(/^\d/.test(word) ? word.replace(/_/g, '') : word);
      i = k;
      continue;
    }
    push(ch);
    i += 1;
  }
  return tokens;
}

/** Tokens joined by one space. */
function normalizeBody(text, options) {
  return tokenize(text, options).join(' ');
}

// What a body reads: not a string, a regex or a property, and a template only in its
// `${}`.
function namesIn(tokens) {
  const names = [];
  tokens.forEach((token, index) => {
    if (token[0] === '`') names.push(...(token.match(/\$\{[^}]*\}/g) || []).join(' ').match(/[A-Za-z_$][\w$]*/g) || []);
    else if (/^[A-Za-z_$]/.test(token) && tokens[index - 1] !== '.') names.push(token);
  });
  return names;
}

// ─── the scanners ─────────────────────────────────────────────────────────────

const OPEN = { '(': ')', '[': ']', '{': '}' };

/** Offset just past the bracket that closes the one at `start`, or -1. */
function skipBalanced(neutral, start) {
  const stack = [];
  for (let i = start; i < neutral.length; i += 1) {
    const ch = neutral[i];
    if (OPEN[ch]) stack.push(OPEN[ch]);
    else if (ch === ')' || ch === ']' || ch === '}') {
      if (stack.pop() !== ch) return -1;
      if (stack.length === 0) return i + 1;
    }
  }
  return -1;
}

function skipSpace(neutral, start) {
  let i = start;
  while (i < neutral.length && /\s/.test(neutral[i])) i += 1;
  return i;
}

// `<T extends { a: string }>`: an arrow inside a bound is not a closing angle.
function skipAngles(neutral, start) {
  let depth = 0;
  for (let i = start; i < neutral.length; i += 1) {
    const ch = neutral[i];
    if (ch === '<') depth += 1;
    else if (ch === '>' && neutral[i - 1] !== '=') {
      depth -= 1;
      if (depth === 0) return i + 1;
    } else if (ch === ';') return -1;
  }
  return -1;
}

/**
 * The block of a function whose name ends at `from`: past generics, parameters
 * and a return type. `null` for a bodiless signature (a TS overload, `declare`).
 */
function functionBlock(neutral, from) {
  let i = skipSpace(neutral, from);
  if (neutral[i] === '<') {
    i = skipAngles(neutral, i);
    if (i === -1) return null;
    i = skipSpace(neutral, i);
  }
  if (neutral[i] === '[') {
    i = skipBalanced(neutral, i);
    if (i === -1) return null;
    i = skipSpace(neutral, i);
  }
  if (neutral[i] !== '(') return null;
  const paramsStart = i + 1;
  i = skipBalanced(neutral, i);
  if (i === -1) return null;
  const paramsEnd = i - 1;
  i = skipSpace(neutral, i);
  // A return type that opens with a brace is an object type, not the block.
  if (neutral[i] === ':' && neutral[skipSpace(neutral, i + 1)] === '{') {
    i = skipBalanced(neutral, skipSpace(neutral, i + 1));
    if (i === -1) return null;
  }
  let nesting = 0;
  for (; i < neutral.length; i += 1) {
    const ch = neutral[i];
    if (ch === '(' || ch === '[' || ch === '<') nesting += 1;
    else if (ch === ')' || ch === ']' || (ch === '>' && neutral[i - 1] !== '=' && neutral[i - 1] !== '-')) nesting = Math.max(0, nesting - 1);
    else if (nesting === 0 && ch === ';') return null;
    else if (nesting === 0 && ch === '{') {
      const end = skipBalanced(neutral, i);
      return end === -1 ? null : { start: i, end, paramsStart, paramsEnd };
    }
  }
  return null;
}

/** Offset of the `=` of a binding, past a type annotation of any shape. */
function initializerStart(neutral, from) {
  let nesting = 0;
  for (let i = from; i < neutral.length; i += 1) {
    const ch = neutral[i];
    if (ch === '(' || ch === '[' || ch === '{' || ch === '<') nesting += 1;
    else if (ch === ')' || ch === ']' || ch === '}' || (ch === '>' && neutral[i - 1] !== '=')) nesting -= 1;
    else if (nesting === 0 && ch === ';') return -1;
    else if (nesting === 0 && ch === '=' && neutral[i + 1] !== '>' && neutral[i + 1] !== '=') return i + 1;
    // `let x` with no initializer: the next statement ends the search, or a file of
    // them would scan to its end once per line.
    else if (nesting === 0 && ch === '\n' && neutral[i + 1] !== undefined && !/\s/.test(neutral[i + 1]) && !startsContinuation(neutral[i + 1])) return -1;
    if (nesting < 0) return -1;
  }
  return -1;
}

// A line in column 0 ends a statement unless it continues the expression.
function startsContinuation(ch) {
  return /[.?:+\-*/%|&=<>,)\]}]/.test(ch);
}

/** End of the statement that starts at `from`: a `;` at depth 0, or the next statement. */
function statementEnd(neutral, from) {
  let depth = 0;
  for (let i = from; i < neutral.length; i += 1) {
    const ch = neutral[i];
    if (OPEN[ch]) depth += 1;
    else if (ch === ')' || ch === ']' || ch === '}') {
      depth -= 1;
      if (depth < 0) return i;
    } else if (depth === 0 && ch === ';') return i;
    else if (depth === 0 && ch === '\n') {
      const next = neutral[i + 1];
      if (next !== undefined && !/\s/.test(next) && !startsContinuation(next)) return i;
    }
  }
  return neutral.length;
}

// `(a: T): R =>` or `a =>`, past `async` and generics: its parameters and the offset
// after the arrow, or null.
function arrowShape(neutral, from) {
  let i = skipSpace(neutral, from);
  const asyncWord = /^async\b/.exec(neutral.slice(i, i + 6));
  if (asyncWord) i = skipSpace(neutral, i + 5);
  if (neutral[i] === '<') {
    i = skipAngles(neutral, i);
    if (i === -1) return null;
    i = skipSpace(neutral, i);
  }
  let paramsStart = i;
  let paramsEnd;
  if (neutral[i] === '(') {
    paramsStart = i + 1;
    i = skipBalanced(neutral, i);
    if (i === -1) return null;
    paramsEnd = i - 1;
  } else {
    const word = /^[A-Za-z_$][\w$]*/.exec(neutral.slice(i, i + 80));
    if (!word) return null;
    i += word[0].length;
    paramsEnd = i;
  }
  i = skipSpace(neutral, i);
  let nesting = 0;
  for (; i < neutral.length; i += 1) {
    const ch = neutral[i];
    if (nesting === 0 && ch === '=' && neutral[i + 1] === '>') return { body: i + 2, paramsStart, paramsEnd };
    if (ch === '(' || ch === '[' || ch === '{' || ch === '<') nesting += 1;
    else if (ch === ')' || ch === ']' || ch === '}' || ch === '>') nesting -= 1;
    else if (nesting === 0 && (ch === ';' || ch === '=' || ch === '\n')) return null;
    if (nesting < 0) return null;
  }
  return null;
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


function extractBrace(raw, openers) {
  const neutral = neutralizeBraceCode(raw);
  const found = [];
  let offset = 0;
  neutral.split('\n').forEach((text, index) => {
    const lineStart = offset;
    offset += text.length + 1;
    for (const opener of openers) {
      const match = text.match(opener.re);
      if (!match) continue;
      const name = match[1];
      const nameEnd = lineStart + match[0].length;
      if (opener.kind === 'function') {
        const block = functionBlock(neutral, nameEnd);
        if (block) found.push({ name, kind: 'function', line: index + 1, text: raw.slice(block.start, block.end), params: raw.slice(block.paramsStart, block.paramsEnd) });
      } else if (opener.kind === 'class') {
        const brace = neutral.indexOf('{', nameEnd);
        const end = brace === -1 ? -1 : skipBalanced(neutral, brace);
        if (end !== -1) found.push({ name, kind: 'class', line: index + 1, text: raw.slice(lineStart, end).replace(/^(?:export\s+)?(?:declare\s+)?/, '') });
      } else if (opener.kind === 'value') {
        const end = statementEnd(neutral, nameEnd);
        const text = raw.slice(nameEnd, end).trim();
        if (text) found.push({ name, kind: 'value', line: index + 1, text });
      } else {
        const start = initializerStart(neutral, nameEnd);
        if (start === -1) break;
        const end = statementEnd(neutral, start);
        const held = classifyBinding(name, neutral, raw, start, end);
        if (held) found.push({ name, line: index + 1, ...held });
      }
      break;
    }
  });
  return found;
}

function extractIndent(raw, openers) {
  const lines = raw.split('\n');
  const found = [];
  lines.forEach((text, index) => {
    for (const opener of openers) {
      const match = text.match(opener.re);
      if (!match) continue;
      let end = index + 1;
      if (opener.kind !== 'value') {
        while (end < lines.length && !(lines[end].trim() && /^\S/.test(lines[end]) && !/^[)\]}]/.test(lines[end]))) end += 1;
        // Ruby closes with `end` in column 0, inside the body.
        if (end < lines.length && /^end\b/.test(lines[end])) end += 1;
      }
      const body = opener.kind === 'value'
        ? text.slice(match[0].length)
        : lines.slice(opener.kind === 'class' ? index : index + 1, end).join('\n');
      const params = opener.kind === 'function' ? /\(([^)]*)\)/.exec(text) : null;
      found.push({ name: match[1], kind: opener.kind, line: index + 1, text: body, params: params ? params[1] : '' });
      break;
    }
  });
  return found;
}

function withoutBom(content) {
  return String(content).replace(/^\uFEFF/, '');
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
  const topLevel = declaredNames(rel, raw);
  const tokensOf = new Map(declared.map((item) => [item, tokenize(item.text, { hashComments })]));
  const bodies = new Map(declared.map((item) => [item.name, tokensOf.get(item).join(' ')]));
  const lines = raw.split('\n');
  const kept = [];
  for (const item of declared) {
    if (item.filtered) continue;
    if (CONVENTION_EXPORTS.has(item.name) && /^export\b/.test(lines[item.line - 1])) continue;
    const tokens = tokensOf.get(item);
    const body = tokens.join(' ');
    if (isEmptyBody(body)) continue;
    const reads = namesIn(tokens).filter((word) => word !== item.name);
    // The same text over this file's own bindings is a different value.
    if (item.kind === 'value' && reads.some((word) => topLevel.has(word))) continue;
    const signature = item.kind === 'function' ? paramSignature(ext, item.params || '', tokens) : '';
    const scope = item.kind === 'value' ? [] : [...new Set(reads)].filter((word) => bodies.has(word)).sort().map((word) => `${word}=${bodies.get(word)}`);
    kept.push({ name: item.name, kind: item.kind, line: item.line, body, signature, scope: scope.join('\n') });
  }
  return kept;
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

// A type vanishes at build but is still something a later phase would copy.
const TYPE_OPENER = /^export\s+(?:declare\s+)?(?:const\s+)?(?:type|interface|enum)\s+([A-Za-z_$][\w$]*)/;
const LOCAL_TYPE_OPENER = /^(?:declare\s+)?(?:const\s+)?(?:type|interface|enum)\s+([A-Za-z_$][\w$]*)/;

function isExported(ext, line, name) {
  if (JS_EXTS.has(ext)) return /^export\b/.test(line);
  if (ext === '.rs') return /^pub\b/.test(line);
  if (ext === '.go') return /^[A-Z]/.test(name);
  return !name.startsWith('_');
}

/**
 * `{ name, exported }` when one line of a file opens a top-level declaration.
 * Framework exports and default exports answer null: no later phase would import
 * a `GET` or a `Page`.
 */
function declarationOnLine(rel, line) {
  const ext = path.extname(rel).toLowerCase();
  const openers = openersFor(ext);
  if (!openers) return null;
  if (JS_EXTS.has(ext)) {
    const typed = line.match(TYPE_OPENER) || line.match(LOCAL_TYPE_OPENER);
    if (typed) return { name: typed[1], exported: /^export\b/.test(line) };
  }
  for (const opener of openers) {
    const match = line.match(opener.re);
    if (!match) continue;
    if (CONVENTION_EXPORTS.has(match[1]) && /^export\b/.test(line)) return null;
    return { name: match[1], exported: isExported(ext, line, match[1]) };
  }
  return null;
}

/**
 * The names a file really declares, read past its strings and comments. A diff is
 * read line by line and cannot tell `export const X` in code from the same text in
 * a template literal.
 */
function declarationsInCode(rel, content) {
  const ext = path.extname(rel).toLowerCase();
  const text = withoutBom(content).replace(/\r\n/g, '\n');
  const language = LANGUAGES[ext];
  const code = language && language.mode === 'indent' ? text : neutralizeBraceCode(text);
  const names = new Set();
  for (const line of code.split('\n')) {
    const declared = declarationOnLine(rel, line);
    if (declared) names.add(declared.name);
  }
  return names;
}

// `git` pathspecs of what the scanners read.
const SOURCE_GLOBS = [...JS_EXTS, ...Object.keys(LANGUAGES)].map((ext) => `*${ext}`);

const MAX_LOCATIONS = 4;

/**
 * Compare the declarations of `targets` with the rest of the tree.
 *
 * @param {Array<{ rel: string, lines: string[] }>} targets the files under check
 * @param {Array<string>} treePaths every source path of the tree, repo-relative
 * @param {(rel: string) => string|null} read reads a tree file
 * @returns findings in the rules:check shape, one per target file and name
 */
function findDuplicateDeclarations({ targets, treePaths, read }) {
  const targetFiles = new Map();
  const targetLines = new Map();
  for (const { rel, lines } of targets) {
    if (!isIndexable(rel)) continue;
    targetFiles.set(rel, lines.join('\n'));
    targetLines.set(rel, lines);
  }
  if (targetFiles.size === 0) return [];

  const contents = new Map(targetFiles);
  const holders = new Map();
  const note = (name, rel) => {
    if (!holders.has(name)) holders.set(name, new Set());
    holders.get(name).add(rel);
  };
  const targetNames = new Set();
  for (const [rel, content] of targetFiles) {
    for (const name of declaredNames(rel, content)) {
      note(name, rel);
      targetNames.add(name);
    }
  }
  for (const rel of treePaths) {
    if (targetFiles.has(rel) || !isIndexable(rel)) continue;
    const content = read(rel);
    if (content === null || content === undefined) continue;
    contents.set(rel, content);
    for (const name of declaredNames(rel, content)) if (targetNames.has(name)) note(name, rel);
  }

  const toParse = new Set();
  for (const [name, files] of holders) {
    if (files.size < 2 || !targetNames.has(name)) continue;
    for (const rel of files) toParse.add(rel);
  }

  const groups = new Map();
  for (const rel of toParse) {
    for (const item of extractDeclarations(rel, contents.get(rel))) {
      if (!targetNames.has(item.name) || holders.get(item.name).size < 2) continue;
      const key = [familyOf(rel), item.name, item.signature, item.body, item.scope].join('\u0000');
      if (!groups.has(key)) groups.set(key, []);
      // A file redeclaring its own name (overload, conditional) is still one copy.
      const group = groups.get(key);
      if (!group.some((entry) => entry.rel === rel)) group.push({ rel, line: item.line, name: item.name, kind: item.kind });
    }
  }

  const findings = [];
  for (const group of groups.values()) {
    if (group.length < 2) continue;
    for (const entry of group) {
      if (!targetFiles.has(entry.rel)) continue;
      const others = group.filter((other) => other.rel !== entry.rel).map((other) => `${other.rel}:${other.line}`).sort();
      const shown = others.slice(0, MAX_LOCATIONS).join(', ') + (others.length > MAX_LOCATIONS ? `, +${others.length - MAX_LOCATIONS} more` : '');
      findings.push({
        category: 'DUPLICATE_DECLARATION',
        severity: 'LOW',
        message: `\`${entry.name}\` has the same body in ${others.length} other file(s): ${shown} — import one of them instead of keeping another copy`,
        file: entry.rel,
        line: entry.line,
        token: entry.name,
        snippet: withoutBom(targetLines.get(entry.rel)[entry.line - 1] || '').trim().slice(0, 120)
      });
    }
  }
  return findings;
}

module.exports = {
  SOURCE_GLOBS,
  declarationOnLine,
  declarationsInCode,
  extractDeclarations,
  findDuplicateDeclarations,
  isIndexable,
  normalizeBody
};
