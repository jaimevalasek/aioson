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
 * `useMemo` around the same expression, or a sort helper written once to sort a list
 * and once as a comparator, are different bodies.
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
const { CONVENTION_EXPORTS, JS_EXTS, LANGUAGES, declaredNames, extractDeclarations, openersFor, withoutBom } = require('./declaration-extractor');

// One family imports from itself: TS reads JS, and nothing else crosses.
function familyOf(rel) {
  const ext = path.extname(rel).toLowerCase();
  return JS_EXTS.has(ext) ? 'js' : ext;
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

// Every file declaring a name a target declares, and the contents read on the way.
function collectHolders(targetFiles, treePaths, read) {
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
  return { contents, holders, targetNames };
}

// A file redeclaring its own name (overload, conditional) is still one copy.
function addCopy(groups, key, entry) {
  if (!groups.has(key)) groups.set(key, []);
  const group = groups.get(key);
  if (!group.some((other) => other.rel === entry.rel)) group.push(entry);
}

function groupCopies({ contents, holders, targetNames }) {
  const repeated = (name) => targetNames.has(name) && holders.get(name).size >= 2;
  const toParse = new Set([...holders].filter(([name]) => repeated(name)).flatMap(([, files]) => [...files]));
  const groups = new Map();
  for (const rel of toParse) {
    const items = extractDeclarations(rel, contents.get(rel)).filter((item) => repeated(item.name));
    for (const item of items) {
      const key = [familyOf(rel), item.name, item.signature, item.body, item.scope].join('\u0000');
      addCopy(groups, key, { rel, line: item.line, name: item.name, kind: item.kind });
    }
  }
  return [...groups.values()].filter((group) => group.length >= 2);
}

function copyFinding(entry, group, lines) {
  const others = group.filter((other) => other.rel !== entry.rel).map((other) => `${other.rel}:${other.line}`).sort();
  const shown = others.slice(0, MAX_LOCATIONS).join(', ') + (others.length > MAX_LOCATIONS ? `, +${others.length - MAX_LOCATIONS} more` : '');
  return {
    category: 'DUPLICATE_DECLARATION',
    severity: 'LOW',
    message: `\`${entry.name}\` has the same body in ${others.length} other file(s): ${shown} — import one of them instead of keeping another copy`,
    file: entry.rel,
    line: entry.line,
    token: entry.name,
    snippet: withoutBom(lines[entry.line - 1] || '').trim().slice(0, 120)
  };
}

/**
 * Compare the declarations of `targets` with the rest of the tree.
 *
 * @param {Array<{ rel: string, lines: string[] }>} targets the files under check
 * @param {Array<string>} treePaths every source path of the tree, repo-relative
 * @param {(rel: string) => string|null} read reads a tree file
 * @returns findings in the rules:check shape, one per target file and name
 */
function findDuplicateDeclarations({ targets, treePaths, read }) {
  const indexed = targets.filter(({ rel }) => isIndexable(rel));
  if (indexed.length === 0) return [];
  const targetFiles = new Map(indexed.map(({ rel, lines }) => [rel, lines.join('\n')]));
  const targetLines = new Map(indexed.map(({ rel, lines }) => [rel, lines]));
  const groups = groupCopies(collectHolders(targetFiles, treePaths, read));
  return groups.flatMap((group) => group
    .filter((entry) => targetFiles.has(entry.rel))
    .map((entry) => copyFinding(entry, group, targetLines.get(entry.rel))));
}

module.exports = {
  SOURCE_GLOBS,
  declarationOnLine,
  declarationsInCode,
  findDuplicateDeclarations,
  isIndexable
};
