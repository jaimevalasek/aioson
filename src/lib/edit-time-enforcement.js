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

/**
 * The whole file as it will read after the tool call (LF line endings), or
 * null when it cannot be known (an Edit whose anchor is missing fails in the
 * harness anyway).
 */
function textAfterEdit(before, toolName, toolInput = {}) {
  if (toolName === 'Write') return typeof toolInput.content === 'string' ? lf(toolInput.content) : null;
  if (before === null) return null;
  const current = lf(before);
  if (toolName === 'Edit') {
    return replaceOnce(current, toolInput.old_string, String(toolInput.new_string ?? ''), toolInput.replace_all);
  }
  if (toolName === 'MultiEdit' && Array.isArray(toolInput.edits)) {
    let text = current;
    for (const edit of toolInput.edits) {
      text = edit ? replaceOnce(text, edit.old_string, String(edit.new_string ?? ''), edit.replace_all) : null;
      if (text === null) return null;
    }
    return text;
  }
  return null;
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
  const paths = new Set();
  const identifiers = new Set();
  const snippets = new Map();
  let fence = null;
  for (const line of String(markdown || '').split(/\r?\n/)) {
    const marker = FENCE.exec(line);
    if (fence) {
      if (marker && marker[1][0] === fence.char && marker[1].length >= fence.size && !marker[2]) {
        fence = null;
        continue;
      }
      if (!snippets.has(fence.ext)) snippets.set(fence.ext, []);
      snippets.get(fence.ext).push(line);
      continue;
    }
    if (marker) {
      fence = { char: marker[1][0], size: marker[1].length, ext: FENCE_EXT[marker[2].toLowerCase()] || '.js' };
      continue;
    }
    for (const match of line.matchAll(INLINE_CODE)) {
      const cited = normalizeCitedPath(match[1]);
      if (cited) {
        paths.add(cited);
        continue;
      }
      const name = codeShapedIdentifier(match[1]);
      if (name) identifiers.add(name);
    }
    for (const match of line.replace(INLINE_CODE, ' ').matchAll(BARE_PATH)) {
      const cited = normalizeCitedPath(match[1]);
      if (cited) paths.add(cited);
    }
  }
  return { paths: [...paths], identifiers: [...identifiers], snippets };
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
  const { agent, rel, kind, toolName, toolInput } = input;
  if (!rel || (kind !== 'code' && kind !== 'markdown')) return [];
  // `before` may be supplied (a replay over history); otherwise it is the disk.
  const before = Object.prototype.hasOwnProperty.call(input, 'before')
    ? (input.before === null ? null : lf(input.before))
    : readCurrent(targetDir, rel);
  const after = textAfterEdit(before, toolName, toolInput);
  if (after === null) return [];

  const exists = (cited) => fs.existsSync(path.resolve(targetDir, cited));
  const filesOf = (text) => {
    if (text === null) return [];
    if (kind === 'markdown') return filesNamedBy(text, exists);
    return [{ rel, lines: text.split('\n') }];
  };
  const preFiles = filesOf(before);
  const postFiles = filesOf(after);
  if (postFiles.length === 0) return [];

  const checkers = await editTimeCheckers(targetDir);
  if (checkers.size === 0) return [];
  const baseline = await readBaseline(targetDir);

  const blocks = [];
  for (const [id, declaring] of checkers) {
    const applicable = declaring.filter((doc) => appliesToAgent(doc.frontmatter || {}, agent));
    if (applicable.length === 0) continue;
    const scoped = postFiles.filter((file) => applicable.some((doc) => inPathScope(doc.frontmatter || {}, file.rel)));
    if (scoped.length === 0) continue;

    const enforcer = ENFORCERS[id];
    const known = new Set(runChecker(enforcer, targetDir, preFiles, declaring).map(diffKey));
    const fresh = uniqueFindings(runChecker(enforcer, targetDir, scoped, declaring))
      .filter((finding) => finding.severity === 'HIGH')
      .filter((finding) => !known.has(diffKey(finding)))
      // rules:check attributes a checker's findings to the first declaring
      // document; the baseline is keyed the same way, so accepted debt matches.
      .filter((finding) => !(baseline && baseline.has(findingKey({ ...finding, rule: declaring[0].name }))));
    if (fresh.length === 0) continue;

    const binding = applicable.find((doc) => doc.authority === 'binding');
    const owner = binding || applicable[0];
    const synthetic = new Set(scoped.filter((file) => file.synthetic).map((file) => file.rel));
    blocks.push({
      checker: id,
      path: owner.path,
      authority: binding ? 'binding' : 'advisory',
      named_by_document: kind === 'markdown',
      findings: fresh.slice(0, MAX_FINDINGS_PER_BLOCK).map((finding) => ({
        severity: finding.severity,
        message: finding.message,
        file: synthetic.has(finding.file) ? null : finding.file
      })),
      more: Math.max(0, fresh.length - MAX_FINDINGS_PER_BLOCK)
    });
  }
  return blocks;
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
