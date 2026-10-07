'use strict';

// Edit-time enforcement: a rule that declares a deterministic checker
// (`enforcement:`) becomes salient to an edit when its checker FINDS a
// violation in what is being written — never because the edit happens to share
// the rule's vocabulary.
//
// Measured gap (2026-10-07): with `source-code-language-convention` installed,
// the planner wrote `servicoCliente.js` into a plan and the dev wrote that very
// file, and context:guard stayed silent both times — salience was keyword
// overlap with the rule's aliases. The checker that proves the violation
// already existed in `rules:check`; it simply never ran at the moment the
// violation was written.
//
// Only NEW violations count: the checker runs on the file before and after the
// pending edit, so touching a legacy file does not replay its old debt on every
// keystroke, and debt accepted in the rules baseline stays accepted.

const fs = require('node:fs');
const path = require('node:path');
const { appliesToAgent } = require('../preflight-engine');
const { parseListValue, pathMatchesPattern } = require('../context-selector');
const {
  ENFORCERS,
  SOURCE_EXTS,
  discoverGovernance,
  readBaseline,
  findingKey
} = require('../commands/rules-check');

const MAX_FINDINGS_PER_BLOCK = 5;

// ─── the pending text ─────────────────────────────────────────────────────────

// Harnesses match an edit anchor across line-ending styles: an `old_string`
// written with LF lands in a CRLF file on Windows. Comparing in LF space keeps
// the replay faithful; the checkers read lines, never terminators.
function lf(text) {
  return String(text).replace(/\r\n/g, '\n');
}

function replaceOnce(text, oldString, newString, replaceAll) {
  if (typeof oldString !== 'string' || oldString === '') return null;
  const anchor = lf(oldString);
  const replacement = lf(newString);
  if (!text.includes(anchor)) return null;
  return replaceAll ? text.split(anchor).join(replacement) : text.replace(anchor, () => replacement);
}

// Edits applied in order; one missing anchor makes the whole call unknowable.
function applyEdits(text, edits) {
  let current = text;
  for (const edit of edits) {
    current = edit ? replaceOnce(current, edit.old_string, String(edit.new_string ?? ''), edit.replace_all) : null;
    if (current === null) return null;
  }
  return current;
}

// The edits a tool call makes, or null when the tool rewrites the whole file.
function editsOf(toolName, toolInput) {
  if (toolName === 'Edit') return [toolInput];
  if (toolName === 'MultiEdit' && Array.isArray(toolInput.edits)) return toolInput.edits;
  return null;
}

/**
 * The whole file as it will read after the tool call (LF line endings), or
 * null when it cannot be known (an Edit whose anchor is missing fails in the
 * harness anyway).
 */
function textAfterEdit(before, toolName, toolInput = {}) {
  if (toolName === 'Write') return typeof toolInput.content === 'string' ? lf(toolInput.content) : null;
  const edits = editsOf(toolName, toolInput);
  if (before === null || edits === null) return null;
  return applyEdits(lf(before), edits);
}

function readCurrent(targetDir, rel) {
  try {
    return lf(fs.readFileSync(path.resolve(targetDir, rel), 'utf8'));
  } catch {
    return null;
  }
}

// ─── what a document names ────────────────────────────────────────────────────

const FENCE = /^\s*(`{3,}|~{3,})\s*([\w+#.-]*)/;
const INLINE_CODE = /`([^`\n]+)`/g;
const BARE_PATH = /(?:^|[\s|(])((?:[\w@.-]+\/)+[\w@.-]+\.[A-Za-z0-9]{1,6})(?=$|[\s|),;:])/g;
const IDENTIFIER = /^[A-Za-z_$][\w$]*(?:\(\))?$/;

// A fence language names the dialect its declarations are written in.
const FENCE_EXT = {
  js: '.js', javascript: '.js', jsx: '.jsx', ts: '.ts', typescript: '.ts', tsx: '.tsx',
  php: '.php', py: '.py', python: '.py', rb: '.rb', ruby: '.rb', go: '.go',
  java: '.java', kt: '.kt', kotlin: '.kt', cs: '.cs', csharp: '.cs', rs: '.rs', rust: '.rs',
  swift: '.swift', dart: '.dart', vue: '.vue', svelte: '.svelte', sql: '.sql'
};

function normalizeCitedPath(raw) {
  const text = String(raw).trim().replace(/\\/g, '/').replace(/^\.\//, '').replace(/:\d+(?::\d+)?$/, '');
  if (!text || /\s/.test(text) || text.includes('://') || text.startsWith('/')) return null;
  if (!SOURCE_EXTS.has(path.extname(text).toLowerCase())) return null;
  return text;
}

// A backticked word is an identifier the document asks someone to declare only
// when it has code shape: a call, a camelCase/PascalCase boundary, or snake_case.
function codeShapedIdentifier(raw) {
  const text = String(raw).trim();
  if (!IDENTIFIER.test(text)) return null;
  const name = text.replace(/\(\)$/, '');
  const shaped = text.endsWith('()') || /[a-z0-9][A-Z]/.test(name) || /[A-Za-z]_[A-Za-z]/.test(name);
  return shaped ? name : null;
}

/**
 * The code a Markdown artifact names: file paths it cites, identifiers it asks
 * for, and the lines of its fenced code blocks. A plan is ABOUT these files,
 * which is exactly where a naming decision is made before any code exists.
 */
function extractNamedCode(markdown) {
  const named = { paths: new Set(), identifiers: new Set(), snippets: new Map() };
  let fence = null;
  for (const line of String(markdown || '').split(/\r?\n/)) fence = readDocumentLine(line, fence, named);
  return { paths: [...named.paths], identifiers: [...named.identifiers], snippets: named.snippets };
}

// Inline `code` spans and bare paths on one prose line.
function collectReferences(line, named) {
  for (const match of line.matchAll(INLINE_CODE)) {
    const cited = normalizeCitedPath(match[1]);
    const name = cited ? null : codeShapedIdentifier(match[1]);
    if (cited) named.paths.add(cited);
    if (name) named.identifiers.add(name);
  }
  for (const match of line.replace(INLINE_CODE, ' ').matchAll(BARE_PATH)) {
    const cited = normalizeCitedPath(match[1]);
    if (cited) named.paths.add(cited);
  }
}

function closesFence(marker, fence) {
  return Boolean(marker) && marker[1][0] === fence.char && marker[1].length >= fence.size && !marker[2];
}

// One line of a document: inside a fence it is snippet code, a fence marker
// opens or closes one, anything else is prose. Returns the fence state after it.
function readDocumentLine(line, fence, named) {
  const marker = FENCE.exec(line);
  if (fence) {
    if (closesFence(marker, fence)) return null;
    if (!named.snippets.has(fence.ext)) named.snippets.set(fence.ext, []);
    named.snippets.get(fence.ext).push(line);
    return fence;
  }
  if (marker) return { char: marker[1][0], size: marker[1].length, ext: FENCE_EXT[marker[2].toLowerCase()] || '.js' };
  collectReferences(line, named);
  return null;
}

// `index.*` is a path the naming checker skips, so the synthetic carrier of a
// document's snippets never produces a finding about itself. A cited path that
// already exists is a reference, not a decision — the code-level check (and
// its baseline) owns that file.
function filesNamedBy(markdown, exists = () => false) {
  const named = extractNamedCode(markdown);
  const files = named.paths.filter((rel) => !exists(rel)).map((rel) => ({ rel, lines: [], cited: true }));
  const declarations = named.identifiers.map((name) => (/^[A-Z]/.test(name) ? `class ${name} {}` : `function ${name}() {}`));
  if (declarations.length > 0) {
    const existing = named.snippets.get('.js') || [];
    named.snippets.set('.js', [...existing, ...declarations]);
  }
  for (const [ext, lines] of named.snippets) files.push({ rel: `index${ext}`, lines, synthetic: true });
  return files;
}

// ─── running the checkers ─────────────────────────────────────────────────────

function inPathScope(frontmatter, rel) {
  const patterns = parseListValue(frontmatter.paths || frontmatter.globs);
  return patterns.length === 0 || patterns.some((pattern) => pathMatchesPattern(rel, pattern));
}

function diffKey(finding) {
  return [finding.category, finding.token || finding.snippet || finding.message, finding.scope || '', finding.file].join('|');
}

// A directory finding is one decision however many files sit under it — the
// same identity rules:check uses for its baseline.
function uniqueFindings(findings) {
  const seen = new Set();
  return findings.filter((finding) => {
    const key = String(finding.scope || '').startsWith('dir:') ? `${finding.category}|${finding.scope}` : diffKey(finding);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function runChecker(enforcer, targetDir, files, documents) {
  if (files.length === 0) return [];
  try {
    return enforcer.run({ targetDir, files, documents }) || [];
  } catch {
    return []; // a broken checker never blocks an edit
  }
}

/** Governance documents grouped by the file-level checker they declare. */
async function editTimeCheckers(targetDir) {
  const documents = await discoverGovernance(targetDir);
  const byChecker = new Map();
  for (const doc of documents) {
    for (const id of doc.enforcements || []) {
      const enforcer = ENFORCERS[id];
      if (!enforcer || enforcer.reads !== 'file') continue;
      if (!byChecker.has(id)) byChecker.set(id, []);
      byChecker.get(id).push(doc);
    }
  }
  return byChecker;
}

/**
 * New HIGH violations a pending edit introduces, attributed to the governance
 * document the active agent must hear from.
 *
 * @param {string} targetDir project root
 * @param {object} input
 * @param {string} input.agent active agent id
 * @param {string} input.rel project-relative path of the edited file (forward slashes)
 * @param {'code'|'markdown'} input.kind how to read the edited file
 * @param {string} input.toolName Write | Edit | MultiEdit
 * @param {object} input.toolInput the harness tool input
 * @returns {Promise<Array<{ checker, path, authority, findings, named_by_document }>>}
 */
async function detectEditViolations(targetDir, input) {
  if (!input.rel || (input.kind !== 'code' && input.kind !== 'markdown')) return [];
  const files = pendingFiles(targetDir, input);
  if (!files || files.postFiles.length === 0) return [];
  const checkers = await editTimeCheckers(targetDir);
  if (checkers.size === 0) return [];
  const ctx = { ...input, ...files, targetDir, baseline: await readBaseline(targetDir) };
  return [...checkers].map(([id, declaring]) => checkerViolations(id, declaring, ctx)).filter(Boolean);
}

function beforeText(targetDir, input) {
  // `before` may be supplied (a replay over history); otherwise it is the disk.
  if (!Object.prototype.hasOwnProperty.call(input, 'before')) return readCurrent(targetDir, input.rel);
  return input.before === null ? null : lf(input.before);
}

// What the checkers read before and after the pending edit, or null when the
// edit cannot be replayed.
function pendingFiles(targetDir, input) {
  const before = beforeText(targetDir, input);
  const after = textAfterEdit(before, input.toolName, input.toolInput);
  if (after === null) return null;
  // A re-check (guard outcomes) asks whether the document STILL names the
  // path, even once the file was created under that name.
  const exists = input.keepExistingCitations ? () => false : (cited) => fs.existsSync(path.resolve(targetDir, cited));
  const filesOf = (text) => {
    if (text === null) return [];
    return input.kind === 'markdown' ? filesNamedBy(text, exists) : [{ rel: input.rel, lines: text.split('\n') }];
  };
  return { preFiles: filesOf(before), postFiles: filesOf(after) };
}

// HIGH findings the edit introduces: absent before it, not accepted as debt.
// rules:check attributes a checker's findings to the first declaring document
// and keys its baseline the same way, so accepted debt matches here.
function freshFindings(enforcer, ctx, declaring, scoped) {
  const known = new Set(runChecker(enforcer, ctx.targetDir, ctx.preFiles, declaring).map(diffKey));
  const accepted = (finding) => Boolean(ctx.baseline && ctx.baseline.has(findingKey({ ...finding, rule: declaring[0].name })));
  return uniqueFindings(runChecker(enforcer, ctx.targetDir, scoped, declaring))
    .filter((finding) => finding.severity === 'HIGH' && !known.has(diffKey(finding)) && !accepted(finding));
}

function violationBlock(id, ctx, applicable, scoped, fresh) {
  const binding = applicable.find((doc) => doc.authority === 'binding');
  const synthetic = new Set(scoped.filter((file) => file.synthetic).map((file) => file.rel));
  // The injection shows a few; a re-check (guard outcomes) needs them all.
  const cap = ctx.uncapped ? fresh.length : MAX_FINDINGS_PER_BLOCK;
  return {
    checker: id,
    path: (binding || applicable[0]).path,
    authority: binding ? 'binding' : 'advisory',
    named_by_document: ctx.kind === 'markdown',
    findings: fresh.slice(0, cap).map((finding) => ({
      severity: finding.severity,
      message: finding.message,
      file: synthetic.has(finding.file) ? null : finding.file,
      key: diffKey(finding)
    })),
    more: Math.max(0, fresh.length - cap)
  };
}

// One checker: the documents that address this agent, the files they scope,
// and the violations the edit adds there.
function checkerViolations(id, declaring, ctx) {
  const applicable = declaring.filter((doc) => appliesToAgent(doc.frontmatter || {}, ctx.agent));
  const scoped = ctx.postFiles.filter((file) => applicable.some((doc) => inPathScope(doc.frontmatter || {}, file.rel)));
  if (scoped.length === 0) return null;
  const fresh = freshFindings(ENFORCERS[id], ctx, declaring, scoped);
  return fresh.length === 0 ? null : violationBlock(id, ctx, applicable, scoped, fresh);
}

/** A file the source checkers read line by line (rules:check's own extension set). */
function isSourceFile(rel) {
  return SOURCE_EXTS.has(path.extname(String(rel || '')).toLowerCase());
}

module.exports = {
  detectEditViolations,
  extractNamedCode,
  isSourceFile,
  textAfterEdit
};
