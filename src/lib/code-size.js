'use strict';

/**
 * Code-size measurement — logic lines per file and per function.
 *
 * The modularization floor the size doctrine describes (design-docs/file-size.md:
 * "< 300 ideal, 300–500 acceptable, > 500 alert", counted as pure logic) was
 * prose an agent read and a reviewer could not verify: nothing in the gates
 * counted a line. This module counts them, lexically and build-free, for every
 * language the rules gate scans, so a God object or a 200-line function is a
 * measured finding with a path and a number instead of a feeling.
 *
 * Counting contract (the doctrine's): a LOGIC line is a non-blank line that
 * is not a comment and is not made only of closing brackets. Strings are not
 * parsed for content; a multi-line string still counts its lines.
 *
 * Function detection is lexical and conservative — a named function opener
 * (declaration, method, assigned arrow, `fn`/`func`/`fun`/`def`) whose body is
 * a brace block (or an indented block for Python/Ruby). Anonymous callbacks
 * are not measured: a false negative there is cheaper than a false positive
 * that teaches everyone to ignore the gate.
 */

const path = require('node:path');

// Files the size doctrine exempts: tests and fixtures, generated files, locale
// dictionaries (a region-suffixed name such as pt-BR.ts — never `db.js`),
// configuration with many entries, migrations with timestamps.
const SIZE_EXEMPT_PATH = new RegExp([
  String.raw`(?:^|/)(?:__tests__|__mocks__|__fixtures__|__snapshots__|tests?|spec|e2e|cypress|fixtures|factories|migrations|locales?|i18n|lang|translations?|generated|vendor)/`,
  String.raw`\.(?:test|spec|stories|fixture|factory|d|min|generated|config)\.[^/]+$`,
  String.raw`(?:^|/)(?:messages|strings|translations?)\.[^/]+$`,
  String.raw`(?:^|/)[a-z]{2}[-_][A-Za-z]{2}\.(?:json|ya?ml|ts|js)$`,
  String.raw`_test\.go$|_spec\.rb$|_test\.py$|Test\.(?:java|kt|cs|php|swift)$`,
  String.raw`(?:^|/)routes\.[a-z]+$|(?:^|/)(?:routes|config)/`
].join('|'), 'i');

const BRACE_EXTS = new Set(['.js', '.jsx', '.mjs', '.cjs', '.ts', '.tsx', '.mts', '.cts', '.go', '.rs', '.java', '.kt', '.kts', '.cs', '.swift', '.php', '.c', '.h', '.cc', '.cpp', '.hpp', '.m', '.mm', '.dart', '.scala', '.vue', '.svelte', '.astro']);
const INDENT_EXTS = new Set(['.py', '.rb', '.ex', '.exs']);
const HASH_COMMENT_EXTS = new Set(['.py', '.rb', '.ex', '.exs', '.sh', '.bash', '.zsh', '.yml', '.yaml', '.toml']);

const LINE_COMMENT = /^\s*(?:\/\/|--\s|;;)/;
const CLOSING_ONLY = /^[\s})\]]*[;,]?\s*$/;

/**
 * Logic lines of a slice of source: not blank, not a comment, not closing
 * brackets alone. Block comments are tracked across lines.
 */
function countLogicLines(lines, { hashComments = false } = {}) {
  let inBlock = false;
  let count = 0;
  for (const raw of lines) {
    let line = String(raw).trim();
    if (!line) continue;
    if (inBlock) {
      const end = line.indexOf('*/');
      if (end === -1) continue;
      inBlock = false;
      line = line.slice(end + 2).trim();
      if (!line) continue;
    }
    if (line.startsWith('/*')) {
      const end = line.indexOf('*/', 2);
      if (end === -1) { inBlock = true; continue; }
      line = line.slice(end + 2).trim();
      if (!line) continue;
    }
    if (line.startsWith('*') && !line.startsWith('*=')) continue; // JSDoc body lines
    if (LINE_COMMENT.test(line)) continue;
    if (hashComments && line.startsWith('#') && !line.startsWith('#[')) continue;
    if (CLOSING_ONLY.test(line)) continue;
    count += 1;
  }
  return count;
}

// A literal this long is not one, and a blank run this long has nothing to say about
// the slash after it. The bounds keep a line of `(/[` or `/ / /` from reading the whole
// line once per slash.
const MAX_REGEX_LITERAL = 2000;

/** A slash starts a regex literal when the previous significant char cannot end an operand. */
function regexCanStart(out) {
  const stop = Math.max(0, out.length - MAX_REGEX_LITERAL);
  for (let j = out.length - 1; j >= stop; j -= 1) {
    const c = out[j];
    if (c === ' ' || c === '\t' || c === '\n') continue;
    if (/[\w$)\]]/.test(c)) {
      // `return /x/` and `typeof /x/` are regexes after a keyword
      const tail = out.slice(Math.max(0, j - 7), j + 1).join('');
      return /(?:^|[^\w$])(?:return|typeof|case|in|of|delete|void|throw)$/.test(tail);
    }
    return true;
  }
  return true;
}

// The offset of the slash closing the regex literal opened at `start`, on its line, or
// -1, honoring escapes and character classes, so `/[{}]/` never unbalances a brace.
function regexLiteralEnd(text, start) {
  const limit = Math.min(text.length, start + MAX_REGEX_LITERAL);
  let inClass = false;
  for (let k = start + 1; k < limit && text[k] !== '\n'; k += 1) {
    if (text[k] === '\\') k += 1;
    else if (inClass) inClass = text[k] !== ']';
    else if (text[k] === '[') inClass = true;
    else if (text[k] === '/') return k;
  }
  return -1;
}

/**
 * Neutralize strings, template literals, regex literals and comments so the
 * brace scanner sees structure only. Line count is preserved.
 */
function neutralizeBraceCode(text) {
  const out = [];
  let i = 0;
  let mode = null; // null | 'line' | 'block' | '"' | "'" | '`' | 'expr'
  let templateDepth = 0;
  while (i < text.length) {
    const ch = text[i];
    const next = text[i + 1];
    if (mode === 'line') {
      if (ch === '\n') { mode = null; out.push('\n'); } else out.push(' ');
      i += 1; continue;
    }
    if (mode === 'block') {
      if (ch === '*' && next === '/') { mode = null; out.push(' ', ' '); i += 2; continue; }
      out.push(ch === '\n' ? '\n' : ' ');
      i += 1; continue;
    }
    if (mode === '"' || mode === "'") {
      if (ch === '\\') { out.push(' ', ' '); i += 2; continue; }
      if (ch === mode || ch === '\n') { mode = null; out.push(ch === '\n' ? '\n' : ' '); i += 1; continue; }
      out.push(' '); i += 1; continue;
    }
    if (mode === '`') {
      if (ch === '\\') { out.push(' ', ' '); i += 2; continue; }
      if (ch === '`') { mode = null; out.push(' '); i += 1; continue; }
      if (ch === '$' && next === '{') { templateDepth = 1; out.push(' ', ' '); i += 2; mode = 'expr'; continue; }
      out.push(ch === '\n' ? '\n' : ' '); i += 1; continue;
    }
    if (mode === 'expr') {
      // inside ${ … } of a template literal: braces nest; a nested template
      // literal is rare enough to treat as plain text
      if (ch === '{') templateDepth += 1;
      else if (ch === '}') {
        templateDepth -= 1;
        if (templateDepth === 0) { mode = '`'; out.push(' '); i += 1; continue; }
      }
      out.push(ch === '\n' ? '\n' : ' '); i += 1; continue;
    }
    if (ch === '/' && next === '/') { mode = 'line'; out.push(' ', ' '); i += 2; continue; }
    if (ch === '/' && next === '*') { mode = 'block'; out.push(' ', ' '); i += 2; continue; }
    if (ch === '/' && regexCanStart(out)) {
      // a regex literal: skip to its closing slash on this line, honoring
      // escapes and character classes, so `/[{}]/` never unbalances a brace
      const k = regexLiteralEnd(text, i);
      if (k !== -1) {
        for (let b = i; b <= k; b += 1) out.push(' ');
        i = k + 1;
        continue;
      }
    }
    if (ch === '"' || ch === "'" || ch === '`') { mode = ch; out.push(' '); i += 1; continue; }
    out.push(ch);
    i += 1;
  }
  return out.join('');
}

const CONTROL_WORDS = new Set(['if', 'for', 'while', 'switch', 'catch', 'else', 'do', 'try', 'return', 'new', 'typeof', 'await', 'yield', 'with', 'using', 'foreach', 'elif', 'unless', 'until', 'case', 'when', 'match', 'loop', 'defer', 'go', 'select', 'throw', 'delete', 'void', 'in', 'of', 'import', 'export', 'require']);

// Named function openers, brace languages. Each yields the name in group 1.
const BRACE_OPENERS = [
  // function declarations / expressions: `function name(` — also `export default async function name(`
  /^\s*(?:export\s+)?(?:default\s+)?(?:async\s+)?function\s*\*?\s*([A-Za-z_$][\w$]*)\s*(?:<[^>]*>)?\s*\(/,
  // assigned arrow or function expression: `const name = async (a, b) => {` / `const name = function (`
  /^\s*(?:export\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*(?::[^=]+)?=\s*(?:async\s+)?(?:function\b|\([^)]*\)\s*(?::\s*[^=]+)?=>|[A-Za-z_$][\w$]*\s*=>)/,
  // Go: `func (r *T) name(` / `func name[T any](`
  /^\s*func\s+(?:\([^)]*\)\s*)?([A-Za-z_]\w*)\s*(?:\[[^\]]*\])?\s*\(/,
  // Rust: `pub async fn name(`
  /^\s*(?:pub(?:\([^)]*\))?\s+)?(?:async\s+)?(?:const\s+)?(?:unsafe\s+)?(?:extern\s+"[^"]*"\s+)?fn\s+([A-Za-z_]\w*)/,
  // Kotlin / Swift / PHP / Scala: `fun name(`, `func name(`, `function name(`, `def name(`
  /^\s*(?:(?:public|private|protected|internal|static|final|abstract|override|open|suspend|inline|operator|mutating|class|fileprivate|async)\s+)*(?:fun|func|function|def)\s+([A-Za-z_$][\w$]*)\s*(?:<[^>]*>)?\s*\(/,
  // methods and typed functions: `name(args) {`, `public static int name(args) throws X {`, `name(): Promise<void> {`
  /^\s*(?:(?:public|private|protected|internal|static|final|abstract|override|virtual|async|readonly|get|set|synchronized|native|inline|const|constexpr|unsafe|extern|export|default)\s+)*(?:[A-Za-z_$][\w$<>\[\],?.*&:]*\s+)?([A-Za-z_$][\w$]*)\s*(?:<[^>]*>)?\s*\([^()]*(?:\([^()]*\)[^()]*)*\)\s*(?:(?:const|override|final|noexcept|throws\s+[\w.,\s]+|->\s*[\w<>\[\]?.:&*]+|:\s*[\w<>\[\]?.|&\s]+|where\s+[^{]+)\s*)*\{\s*$/
];

// The last opener is the bare `name(args) {` shape, where a control-flow
// statement (`if (x) {`, `new Foo(a) {`) has the same silhouette — it is the
// only one filtered by CONTROL_WORDS. A name after an explicit keyword
// (`fn new(` in Rust, `def select(` in Python) is a function whatever it says.
const BARE_OPENER_INDEX = BRACE_OPENERS.length - 1;

function openerName(line) {
  for (let idx = 0; idx < BRACE_OPENERS.length; idx += 1) {
    const m = line.match(BRACE_OPENERS[idx]);
    if (!m) continue;
    const name = m[1];
    if (!name) continue;
    if (idx === BARE_OPENER_INDEX && CONTROL_WORDS.has(name)) continue;
    return name;
  }
  return null;
}

/**
 * Functions of a brace-language file: [{ name, start, end, logic }] with
 * 1-based inclusive lines. `lines` are the ORIGINAL lines (logic is counted on
 * them); the structure is read from the neutralized text.
 */
function braceFunctions(lines) {
  const neutral = neutralizeBraceCode(lines.join('\n')).split('\n');
  const out = [];
  for (let i = 0; i < neutral.length; i += 1) {
    const name = openerName(neutral[i]);
    if (!name) continue;
    // Find the body's opening brace: the first `{` at paren depth 0 within a
    // bounded window; a `;` without a brace first means no body (a signature).
    let paren = 0;
    let opened = -1;
    let openLine = -1;
    let abandoned = false;
    for (let j = i; j < Math.min(neutral.length, i + 24) && opened === -1 && !abandoned; j += 1) {
      const text = neutral[j];
      for (let k = 0; k < text.length; k += 1) {
        const ch = text[k];
        if (ch === '(') paren += 1;
        else if (ch === ')') paren -= 1;
        else if (ch === '{' && paren <= 0) { opened = k; openLine = j; break; }
        else if (ch === ';' && paren <= 0) { abandoned = true; break; }
      }
    }
    if (opened === -1) continue;
    let depth = 0;
    let endLine = -1;
    for (let j = openLine; j < neutral.length && endLine === -1; j += 1) {
      const text = neutral[j];
      for (let k = j === openLine ? opened : 0; k < text.length; k += 1) {
        const ch = text[k];
        if (ch === '{') depth += 1;
        else if (ch === '}') {
          depth -= 1;
          if (depth === 0) { endLine = j; break; }
        }
      }
    }
    if (endLine === -1) continue;
    out.push({ name, start: i + 1, end: endLine + 1, logic: countLogicLines(lines.slice(i, endLine + 1)) });
  }
  return out;
}

const INDENT_OPENER = /^(\s*)(?:async\s+)?def\s+([A-Za-z_]\w*)/;

/** Functions of an indentation-language file (Python, Ruby `def`). */
function indentFunctions(lines) {
  const out = [];
  for (let i = 0; i < lines.length; i += 1) {
    const m = lines[i].match(INDENT_OPENER);
    if (!m) continue;
    const indent = m[1].length;
    let end = i;
    for (let j = i + 1; j < lines.length; j += 1) {
      const line = lines[j];
      if (!line.trim()) continue;
      const lead = line.match(/^\s*/)[0].length;
      if (lead <= indent) {
        // Ruby closes with `end` at the opener's indentation — it belongs to the body.
        if (lead === indent && /^\s*end\b/.test(line)) end = j;
        break;
      }
      end = j;
    }
    out.push({ name: m[2], start: i + 1, end: end + 1, logic: countLogicLines(lines.slice(i, end + 1), { hashComments: true }) });
  }
  return out;
}

/**
 * Measure one file.
 * @param {string} rel repo-relative path
 * @param {string[]} lines
 * @returns {{ exempt: boolean, logic: number, functions: Array<{name: string, start: number, end: number, logic: number}> }}
 */
function measureFile(rel, lines) {
  const ext = path.extname(rel).toLowerCase();
  if (SIZE_EXEMPT_PATH.test(rel)) return { exempt: true, logic: 0, functions: [] };
  const logic = countLogicLines(lines, { hashComments: HASH_COMMENT_EXTS.has(ext) });
  let functions = [];
  if (BRACE_EXTS.has(ext)) functions = braceFunctions(lines);
  else if (INDENT_EXTS.has(ext)) functions = indentFunctions(lines);
  return { exempt: false, logic, functions };
}

module.exports = {
  SIZE_EXEMPT_PATH,
  countLogicLines,
  MAX_REGEX_LITERAL,
  neutralizeBraceCode,
  braceFunctions,
  indentFunctions,
  measureFile
};
