'use strict';

/**
 * Duplicate declarations — the same top-level helper written twice.
 *
 * A fresh agent per phase does not know what the earlier phases created, so it
 * writes the helper again: one delivery ended with the same constant in five
 * files, and two QA rounds found the class by hand because nothing measured it.
 * This module measures it lexically and build-free.
 *
 * Two declarations repeat only when the NAME and the NORMALIZED BODY both match.
 * A same-name pair with different bodies is not reported, which is what keeps
 * `GET`, `Page` and a local `format` out of the report. For a function the body
 * is the block alone, so a signature annotated differently (`value: RawParam`
 * and `value: string | string[]`) does not hide a copy. Normalization drops
 * comments, whitespace, semicolons and trailing commas, and unifies quotes and
 * numeric separators.
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
      { kind: 'value', re: /^const\s+([A-Za-z_]\w*)\s*=(?!=)/ }
    ]
  }
};

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

/** Tokens joined by one space: the form two copies share whatever their layout. */
function normalizeBody(text, { hashComments = false } = {}) {
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
    if ((ch === '/' && next === '/') || (hashComments && ch === '#')) {
      while (i < source.length && source[i] !== '\n') i += 1;
      continue;
    }
    if (ch === '/' && next === '*') {
      const end = source.indexOf('*/', i + 2);
      i = end === -1 ? source.length : end + 2;
      continue;
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
  return tokens.join(' ');
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
  i = skipBalanced(neutral, i);
  if (i === -1) return null;
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
      return end === -1 ? null : { start: i, end };
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

// `(a: T): R =>` or `a =>`, past `async` and generics: the offset after the arrow.
function arrowBodyStart(neutral, from) {
  let i = skipSpace(neutral, from);
  const asyncWord = /^async\b/.exec(neutral.slice(i, i + 6));
  if (asyncWord) i = skipSpace(neutral, i + 5);
  if (neutral[i] === '<') {
    i = skipAngles(neutral, i);
    if (i === -1) return -1;
    i = skipSpace(neutral, i);
  }
  if (neutral[i] === '(') {
    i = skipBalanced(neutral, i);
    if (i === -1) return -1;
  } else {
    const word = /^[A-Za-z_$][\w$]*/.exec(neutral.slice(i, i + 80));
    if (!word) return -1;
    i += word[0].length;
  }
  i = skipSpace(neutral, i);
  let nesting = 0;
  for (; i < neutral.length; i += 1) {
    const ch = neutral[i];
    if (nesting === 0 && ch === '=' && neutral[i + 1] === '>') return i + 2;
    if (ch === '(' || ch === '[' || ch === '{' || ch === '<') nesting += 1;
    else if (ch === ')' || ch === ']' || ch === '}' || ch === '>') nesting -= 1;
    else if (nesting === 0 && (ch === ';' || ch === '=' || ch === '\n')) return -1;
    if (nesting < 0) return -1;
  }
  return -1;
}

const MODULE_LOAD = /^(?:await\s+)?(?:require|import)\s*\(/;
const LOCATION_BOUND = /\b__dirname\b|\b__filename\b|\bimport\.meta\b|\bprocess\.cwd\b/;
const ZERO_ARG_CALL = /^(?:new\s+|await\s+)?[A-Za-z_$][\w$.]*\s*\(\s*\)\s*$/;
const ALIAS = /^[A-Za-z_$][\w$.]*(?:\s+as\s+[^;]+)?$/;
const PLAIN_SCALAR = /^(?:true|false|null|undefined|-?[\d_.]+|"[^"]*"|'[^']*')$/;
const CONSTANT_NAME = /^[A-Z][A-Z0-9_]*$/;

/**
 * What a binding holds: a function (compared by its block), or a value compared
 * whole. `null` when it repeats by nature, not by copy.
 */
function classifyBinding(name, neutral, raw, start, end) {
  const init = raw.slice(start, end).trim().replace(/\s+(?:as\s+const|satisfies\s+[^;\n]+)\s*$/, '');
  if (!init || MODULE_LOAD.test(init) || LOCATION_BOUND.test(init) || ZERO_ARG_CALL.test(init) || ALIAS.test(init)) return null;
  // A lowercase `limit = 10` is a local setting, not a constant someone shares.
  if (PLAIN_SCALAR.test(init) && !CONSTANT_NAME.test(name)) return null;
  const head = start + (raw.slice(start, end).length - raw.slice(start, end).trimStart().length);
  const functionWord = /^(?:async\s+)?function\b\s*\*?\s*(?:[A-Za-z_$][\w$]*)?/.exec(init);
  if (functionWord) {
    const block = functionBlock(neutral, head + functionWord[0].length);
    if (block) return { kind: 'function', text: raw.slice(block.start, block.end) };
  }
  const arrow = arrowBodyStart(neutral, head);
  if (arrow !== -1 && arrow <= end) return { kind: 'function', text: raw.slice(arrow, end) };
  return { kind: 'value', text: init };
}

function isEmptyBody(normalized) {
  return normalized === '' || normalized === '{ }';
}

// The identifiers of a normalized body: plain strings hold none, a template
// holds those inside its `${}`.
function namesIn(body) {
  const code = body
    .replace(/"[^"]*"/g, ' ')
    .replace(/`[^`]*`/g, (template) => (template.match(/\$\{[^}]*\}/g) || []).join(' '));
  return code.match(/[A-Za-z_$][\w$]*/g) || [];
}

function extractBrace(rel, raw, openers) {
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
        if (block) found.push({ name, kind: 'function', line: index + 1, text: raw.slice(block.start, block.end) });
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
        : lines.slice(index + 1, end).join('\n');
      found.push({ name: match[1], kind: opener.kind, line: index + 1, text: body });
      break;
    }
  });
  return found;
}

/**
 * Every top-level declaration of a file that could be a copy:
 * `[{ name, kind, line, body }]`, body normalized.
 */
function extractDeclarations(rel, content) {
  const ext = path.extname(rel).toLowerCase();
  const openers = openersFor(ext);
  if (!openers) return [];
  const raw = String(content).replace(/\r\n/g, '\n');
  const language = LANGUAGES[ext];
  const hashComments = Boolean(language) && language.mode === 'indent';
  const declared = hashComments ? extractIndent(raw, openers) : extractBrace(rel, raw, openers);
  const topLevel = declaredNames(rel, raw);
  const lines = raw.split('\n');
  const kept = [];
  for (const item of declared) {
    if (CONVENTION_EXPORTS.has(item.name) && /^export\b/.test(lines[item.line - 1])) continue;
    const body = normalizeBody(item.text, { hashComments });
    if (isEmptyBody(body)) continue;
    // The same text over this file's own bindings is a different value.
    if (item.kind === 'value' && namesIn(body).some((word) => word !== item.name && topLevel.has(word))) continue;
    kept.push({ name: item.name, kind: item.kind, line: item.line, body });
  }
  return kept;
}

/** The declaration names of a file, read with one regex per line (first pass). */
function declaredNames(rel, content) {
  const openers = openersFor(path.extname(rel).toLowerCase());
  const names = new Set();
  if (!openers) return names;
  for (const line of String(content).split('\n')) {
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
  for (const { rel, lines } of targets) if (isIndexable(rel)) targetFiles.set(rel, lines.join('\n'));
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
      const key = `${item.name}\u0000${item.body}`;
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
        snippet: String(targetFiles.get(entry.rel).split('\n')[entry.line - 1] || '').trim().slice(0, 120)
      });
    }
  }
  return findings;
}

module.exports = {
  CONVENTION_EXPORTS,
  SOURCE_GLOBS,
  declarationOnLine,
  declaredNames,
  extractDeclarations,
  findDuplicateDeclarations,
  isIndexable,
  normalizeBody
};
