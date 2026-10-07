'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { buildContextBrief, extractDocConstraints, rankForStack } = require('./context-brief');
const { parseFrontmatter, readFileSafe } = require('./preflight-engine');
const { parseListValue, pathMatchesPattern } = require('./context-selector');
const { detectEditViolations, isSourceFile } = require('./lib/edit-time-enforcement');
const { judgeGuardRules } = require('./lib/jev-context-filter');

// Harness-agnostic core for `context:guard`.
//
// Operational retrieval loop: a harness extension point (e.g. a Claude Code
// PreToolUse hook) feeds the pending tool event in, and the guard derives a
// query from the artifact itself — never from a model-emitted keyword list —
// runs the proven context:brief engine, and returns an injection payload when a
// project rule is genuinely salient to the change about to be written.

// File-mutating tools whose payload is worth checking against project rules.
const MUTATING_TOOLS = new Set(['Write', 'Edit', 'MultiEdit', 'NotebookEdit']);

// A rule only counts when context:brief routed it through a hard signal, never
// through a foundation always-load or a pure semantic guess.
const HARD_SIGNAL = /(?:triggers|paths|entities|aliases|task_types):/;

// Salience gate: a rule opts into guard injection by declaring `entities` or
// `aliases`, or by explicitly setting `guard: true` in frontmatter. The explicit
// opt-in is for project contracts that are path/task-bound but not domain-entity
// rules (e.g. agent prompt structure). Generic baseline rules remain silent.
const DOMAIN_SIGNAL = /(?:entities|aliases):/;

// A rule that declares `paths` is a contract over those files. It may still
// surface in the brief via fuzzy trigger/description keyword overlap when an
// UNRELATED file is edited — so the guard verifies the scope itself against
// the edited path (the brief's reason string does not reliably carry a
// `paths:` marker even for in-scope files).
function guardPathCandidates(targetDir, filePath) {
  const raw = String(filePath || '');
  if (!raw) return [];
  const candidates = [raw];
  try {
    const rel = path.relative(targetDir, path.resolve(targetDir, raw));
    if (rel && !rel.startsWith('..')) candidates.push(rel);
  } catch { /* keep the raw candidate */ }
  return candidates;
}

function ruleInPathScope(frontmatter, pathCandidates) {
  const patterns = parseListValue(frontmatter.paths || frontmatter.globs);
  if (patterns.length === 0) return true;
  return pathCandidates.some((candidate) =>
    patterns.some((pattern) => pathMatchesPattern(candidate, pattern)));
}

// `guard_surfaces:` lets a rule bind its injection to a kind of artifact.
// Today the only kind is `ui`: markup/style files, product docs, and scripts
// that visibly touch the DOM. A universal interaction rule (forms, kanban,
// confirmation modals) is noise inside CLI sources, JSON data, or a Node
// harness even when their content mentions its keywords — files ABOUT forms
// are not forms.
const UI_FILE_EXTENSIONS = new Set([
  '.html', '.htm', '.css', '.scss', '.sass', '.less',
  '.jsx', '.tsx', '.vue', '.svelte', '.astro'
]);
const DOC_FILE_EXTENSIONS = new Set(['.md', '.mdx']);
const SCRIPT_FILE_EXTENSIONS = new Set(['.js', '.mjs', '.cjs', '.ts', '.mts', '.cts']);
// A tag is markup when it closes, self-closes, names an HTML element, or is a
// custom element (the spec requires a hyphen in its name) assigning an
// attribute. A bare `<id>`, a `<kebab-name>` or multi-word `<the option
// chosen>` help placeholder, or a TypeScript generic `<T extends object>` is
// notation, not the DOM — an unknown tag followed by any word used to count,
// and turned CLI sources and plain .ts modules into UI surfaces.
const HTML_ELEMENT = 'div|span|form|input|button|label|select|option|textarea|table|thead|tbody|tr|td|th|ul|ol|li|p|h[1-6]|section|header|nav|main|footer|aside|article|a|img|svg|dialog|template|slot|canvas|video|audio|iframe|body|html|head';
const DOM_MARKERS = new RegExp([
  'document\\s*\\.\\s*(?:getElementById|querySelector|querySelectorAll|createElement|addEventListener|body)',
  'classList\\s*\\.',
  'innerHTML',
  '<\\/[a-z][a-z0-9-]*>',
  '<[a-z][a-z0-9]*-[a-z0-9-]*\\s+[a-z:@-][a-z0-9:@.-]*\\s*=',
  '<[a-z][a-z0-9-]*\\s*\\/>',
  `<(?:${HTML_ELEMENT})\\b[^>]*>`,
  'className\\s*=',
  'useState\\s*\\(',
  'createRoot\\s*\\('
].join('|'), 'i');
// Repository housekeeping files are never a product surface, whatever they mention.
const NON_PRODUCT_DOC = /^(?:changelog|changes|history|readme|license|licence|contributing|code_of_conduct|security|authors|notice|todo|roadmap)(?:[._-].*)?$/i;
// A test file is ABOUT a surface, never the surface: fixture markup inside a
// test turns a Node test file DOM-flavored, but product interaction rules are
// noise there — the same "files about forms are not forms" doctrine.
const TEST_PATH_SEGMENT = /(?:^|[\\/])(?:tests?|__tests__|spec)[\\/]/i;
const TEST_BASENAME = /\.(?:test|spec)\.[a-z]+$/i;

function isTestArtifact(filePath) {
  const text = String(filePath || '');
  return TEST_PATH_SEGMENT.test(text) || TEST_BASENAME.test(path.basename(text));
}

// Research captures and planning notes are ABOUT the product too: a note that
// weighs "status" and "confirmation" is not a status control. AIOSON's own
// product plans live under `.aioson/plans/`, so that tree stays a surface.
const NOTE_PATH_SEGMENT = /(?:^|[\\/])(?:plans|research|researchs)[\\/]/i;
const AIOSON_PLANS_SEGMENT = /(?:^|[\\/])\.aioson[\\/]plans[\\/]/i;

function isNoteArtifact(filePath) {
  const text = String(filePath || '');
  return NOTE_PATH_SEGMENT.test(text.replace(AIOSON_PLANS_SEGMENT, '/'));
}

// The project's own governance/knowledge tree is ABOUT the product, never the
// product: a skill description that says "boards, cards, forms" is authoring
// the law, not building a board — injecting the kanban rule there is the same
// "files about forms are not forms" noise the test doctrine already names.
// Briefings, explorations, and context artifacts stay injectable (a prototype
// under .aioson/briefings IS a product surface). A rule that explicitly
// declares `paths` over these trees still injects — that is deliberate law
// over governance files, gated in ruleAllowsGuard.
const GOVERNANCE_PATH_SEGMENT = /(?:^|[\\/])\.aioson[\\/](?:(?:rules|docs|design-docs|skills|installed-skills|agents|my-agents|squads|advisors|genomes|templates|tasks|brains|evals|learnings|config|schemas|mcp)(?:[\\/]|$)|(?:config|constitution)\.md$|git-guard\.json$)/i;

function isGovernanceArtifact(filePath) {
  return GOVERNANCE_PATH_SEGMENT.test(String(filePath || ''));
}

function detectSurfaceKinds(filePath, content) {
  const kinds = new Set();
  if (isTestArtifact(filePath)) return kinds;
  const name = path.basename(String(filePath || ''));
  const ext = path.extname(name).toLowerCase();
  const stem = name.slice(0, name.length - ext.length);
  if (UI_FILE_EXTENSIONS.has(ext)) kinds.add('ui');
  // Product/spec docs carry interaction contracts (briefings, manifests, PRDs).
  else if (DOC_FILE_EXTENSIONS.has(ext) && !NON_PRODUCT_DOC.test(stem) && !isNoteArtifact(filePath)) kinds.add('ui');
  else if (SCRIPT_FILE_EXTENSIONS.has(ext) && DOM_MARKERS.test(String(content || ''))) kinds.add('ui');
  return kinds;
}

/** An absolute path outside the project owns none of its rules. */
function outsideProject(targetDir, filePath) {
  const text = String(filePath || '');
  if (!text || !path.isAbsolute(text)) return false;
  const rel = path.relative(path.resolve(targetDir), path.resolve(text));
  return rel === '' ? false : (rel.startsWith('..') || path.isAbsolute(rel));
}

// Tunable relevance gate.
const GUARD_GATE = {
  minConfidence: 'medium', // 'low' briefs never inject
  maxConstraints: 10,
  maxForbidden: 6,
  maxContentChars: 4000,
  maxViolationConstraints: 2 // the finding is the message; the rule only frames it
};

const CONFIDENCE_RANK = { low: 0, medium: 1, high: 2 };

function emptyResponse() {
  return {};
}

function extractEditedContent(toolInput = {}) {
  const parts = [];
  if (typeof toolInput.content === 'string') parts.push(toolInput.content);
  if (typeof toolInput.new_string === 'string') parts.push(toolInput.new_string);
  if (typeof toolInput.old_string === 'string') parts.push(toolInput.old_string);
  if (typeof toolInput.new_source === 'string') parts.push(toolInput.new_source);
  if (Array.isArray(toolInput.edits)) {
    for (const edit of toolInput.edits) {
      if (edit && typeof edit.new_string === 'string') parts.push(edit.new_string);
    }
  }
  return parts.join('\n');
}

function deriveQuery(filePath, content, limit = GUARD_GATE.maxContentChars) {
  const base = filePath
    ? path.basename(String(filePath)).replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ')
    : '';
  const body = String(content || '').slice(0, limit);
  return `${base} ${body}`.trim();
}

function matchedRules(brief) {
  return (brief.must_load || []).filter((item) => (
    item.surface === 'rules' && HARD_SIGNAL.test(item.reason || '')
  ));
}

function truthyFrontmatter(value) {
  return ['1', 'true', 'yes', 'on'].includes(String(value || '').trim().toLowerCase());
}

function ruleDeclaresPaths(frontmatter) {
  return Boolean(frontmatter && (frontmatter.paths || frontmatter.globs));
}

function ruleAllowsGuard(rule, frontmatter, surfaceKinds = null, pathCandidates = null, governanceArtifact = false) {
  const reason = rule.reason || '';
  // Path scope is a contract for EVERY guard injection, domain signal or not:
  // a rule that declares `paths` must never inject on fuzzy keyword spill from
  // a file outside them.
  if (ruleDeclaresPaths(frontmatter) && pathCandidates && !ruleInPathScope(frontmatter, pathCandidates)) {
    return false;
  }
  // A governance file accepts only rules that named it in `paths` — entity
  // and alias spill from the file's own subject matter never injects there.
  if (governanceArtifact && !(ruleDeclaresPaths(frontmatter) && pathCandidates && ruleInPathScope(frontmatter, pathCandidates))) {
    return false;
  }
  // Surface scope: a rule that declares `guard_surfaces` only injects when the
  // edited artifact is one of those kinds.
  if (surfaceKinds) {
    const surfaces = parseListValue(frontmatter.guard_surfaces)
      .map((kind) => String(kind).trim().toLowerCase());
    if (surfaces.length > 0 && !surfaces.some((kind) => surfaceKinds.has(kind))) return false;
  }
  if (DOMAIN_SIGNAL.test(reason)) return true;
  if (!truthyFrontmatter(frontmatter.guard) || !HARD_SIGNAL.test(reason)) return false;
  return true;
}

function confidenceAllows(confidence, gate) {
  const have = CONFIDENCE_RANK[confidence] ?? 0;
  const need = CONFIDENCE_RANK[gate.minConfidence] ?? 1;
  return have >= need;
}

function dedupeStrings(items) {
  const seen = new Set();
  const out = [];
  for (const item of items || []) {
    const text = String(item || '').trim();
    if (!text || seen.has(text)) continue;
    seen.add(text);
    out.push(text);
  }
  return out;
}

function normalizeRuleLine(value) {
  return String(value || '').trim().toLowerCase();
}

// Read each salient rule file and extract ITS OWN constraints — so the
// injection is attributed per rule and never carries the generic concern-based
// constraints the brief aggregates from the whole selection.
async function buildRuleBlocks(targetDir, salient, gate, surfaceKinds = null, pathCandidates = null, stack = '', governanceArtifact = false) {
  const blocks = [];
  for (const rule of salient) {
    const content = await readFileSafe(path.join(targetDir, rule.path));
    if (!content) continue;
    const frontmatter = parseFrontmatter(content);
    if (!ruleAllowsGuard(rule, frontmatter, surfaceKinds, pathCandidates, governanceArtifact)) continue;
    const extracted = extractDocConstraints(content);
    // An injection is even tighter than a brief — a handful of lines in front of
    // an edit — so a bullet written for another framework is not just noise
    // here, it displaces the one that applies.
    const constraints = dedupeStrings(rankForStack(extracted.constraints, stack)).slice(0, gate.maxConstraints);
    const constraintSet = new Set(constraints.map(normalizeRuleLine));
    const forbidden = dedupeStrings(extracted.forbidden_patterns)
      .filter((item) => !constraintSet.has(normalizeRuleLine(item)))
      .slice(0, gate.maxForbidden);
    if (constraints.length === 0 && forbidden.length === 0) continue;
    blocks.push({ path: rule.path, constraints, forbidden });
  }
  return blocks;
}

// What the violation checkers read: source files by their lines, and the
// Markdown that DECIDES code — plans, specs, architecture and design docs,
// execution manifests under `.aioson/` — by the code it names. Reports, PRDs,
// dossiers, archives, docs and notes describe or quote code; measured on 60
// commits of a real consumer, judging them flagged QA reports for quoting the
// identifiers they were reporting on.
const AIOSON_ARTIFACT = /^\.aioson\//;
const ARCHIVED_ARTIFACT = /^\.aioson\/context\/(?:done|abandoned)\//;
const DECISION_DOC = /(?:^|[-_.])(?:implementation-plan|plan|spec|architecture|design-doc|manifest|tasks?)(?:[-_.]|$)/i;
const PLANS_TREE = /\/(?:simple-)?plans\//;
const DESCRIPTIVE_DOC = /report|dossier|evidence|audit|retro|review/i;

function isDecisionArtifact(relPath) {
  if (!AIOSON_ARTIFACT.test(relPath) || ARCHIVED_ARTIFACT.test(relPath)) return false;
  const stem = path.basename(relPath).replace(/\.mdx?$/i, '');
  if (DESCRIPTIVE_DOC.test(stem)) return false;
  return DECISION_DOC.test(stem) || PLANS_TREE.test(relPath);
}

function editedFileKind(relPath) {
  if (isSourceFile(relPath)) return 'code';
  const ext = path.extname(relPath).toLowerCase();
  if (!DOC_FILE_EXTENSIONS.has(ext) || !isDecisionArtifact(relPath)) return null;
  return 'markdown';
}

// A measured violation leads the injection: it names the exact line to change.
// The rule it breaks contributes a few of its constraints when the vocabulary
// pass had not already selected it.
async function withViolations(targetDir, blocks, violations, gate, stack) {
  const merged = blocks.map((block) => ({ ...block, findings: [], more: 0 }));
  for (const violation of violations) {
    let block = merged.find((item) => item.path === violation.path);
    if (!block) {
      const content = await readFileSafe(path.join(targetDir, violation.path));
      if (!content) continue;
      const constraints = dedupeStrings(rankForStack(extractDocConstraints(content).constraints, stack))
        .slice(0, gate.maxViolationConstraints);
      block = { path: violation.path, constraints, forbidden: [], findings: [], more: 0 };
      merged.push(block);
    }
    block.authority = violation.authority;
    block.named_by_document = violation.named_by_document;
    block.findings.push(...violation.findings);
    block.more += violation.more;
  }
  return merged.sort((a, b) => Number(b.findings.length > 0) - Number(a.findings.length > 0));
}

function findingLines(block) {
  if (!block.findings || block.findings.length === 0) return [];
  const lines = [block.named_by_document
    ? 'Detected in the code this document names — rename before it is built:'
    : 'Detected in this change — fix it in this edit:'];
  for (const finding of block.findings) {
    // The block header already names the rule; the finding keeps its reason.
    const message = String(finding.message).replace(/\s*—\s*see \S+\.md/, '');
    lines.push(`- ${finding.severity} ${message}${finding.file ? ` [${finding.file}]` : ''}`);
  }
  if (block.more > 0) lines.push(`- … ${block.more} more (aioson rules:check . --changed)`);
  return lines;
}

function blockLines(block) {
  return [
    `${block.authority === 'advisory' ? 'Guidance' : 'Rule'} ${block.path}:`,
    ...block.constraints.map((constraint) => `- ${constraint}`),
    ...block.forbidden.map((pattern) => `- (forbidden) ${pattern}`),
    ...findingLines(block)
  ];
}

function formatInjectionText(filePath, ruleBlocks) {
  const target = filePath ? path.basename(String(filePath)) : 'this change';
  return [`[AIOSON context:guard] Project rules apply to ${target}:`, ...ruleBlocks.flatMap(blockLines)].join('\n');
}

// Two installed copies of the hook (user-level and project-level settings)
// receive the SAME tool event and used to inject the same rules twice. The
// first process to claim the event answers; the other stays silent. An event
// without a session identity (a manual run, a test) is never deduplicated.
const CLAIM_DIR = path.join(os.tmpdir(), 'aioson-guard-claims');
const CLAIM_TTL_MS = 10 * 60 * 1000;

function eventIdentity(event) {
  if (!event) return '';
  const session = event.session_id || '';
  const toolUse = event.tool_use_id || '';
  if (!session && !toolUse) return '';
  return crypto.createHash('sha256')
    .update(JSON.stringify([session, toolUse, event.tool_name || '', event.tool_input || {}]))
    .digest('hex')
    .slice(0, 32);
}

function pruneClaims(dir, now = Date.now()) {
  let names;
  try {
    names = fs.readdirSync(dir);
  } catch {
    return;
  }
  for (const name of names) {
    const file = path.join(dir, name);
    try {
      if (now - fs.statSync(file).mtimeMs > CLAIM_TTL_MS) fs.unlinkSync(file);
    } catch { /* a concurrent guard already pruned it */ }
  }
}

// A JEV verdict on (rule, file) holds for the session: the same rule is not
// re-judged on every edit of the same file. Same directory and TTL as the
// event claims, so one prune serves both.
function verdictKey(event, rulePath, relPath) {
  const session = event && event.session_id;
  if (!session) return '';
  return `v-${crypto.createHash('sha256').update(JSON.stringify([session, rulePath, relPath])).digest('hex').slice(0, 32)}`;
}

function readVerdict(claimDir, key, now = Date.now()) {
  if (!key) return null;
  try {
    const file = path.join(claimDir, key);
    if (now - fs.statSync(file).mtimeMs > CLAIM_TTL_MS) return null;
    return fs.readFileSync(file, 'utf8') === 'keep';
  } catch {
    return null;
  }
}

function writeVerdict(claimDir, key, keep) {
  if (!key) return;
  try {
    fs.mkdirSync(claimDir, { recursive: true });
    fs.writeFileSync(path.join(claimDir, key), keep ? 'keep' : 'drop');
  } catch { /* an unwritable temp dir only costs a re-judgment */ }
}

/**
 * With JEV ready, a rule injected only by vocabulary (no checker backed it)
 * must also be judged to govern this write; a measured violation needs no
 * judge. Every failure keeps the injection — the guard never goes quieter
 * because the judge is down.
 */
async function judgeVocabularyBlocks(targetDir, event, blocks, violations, input) {
  if (!input.jevFilter || blocks.length === 0) return { blocks, report: null };
  const claimDir = input.claimDir || CLAIM_DIR;
  const keyOf = (rulePath) => verdictKey(event, rulePath, input.relPath);
  const { toJudge, remembered } = partitionByVerdict(blocks, violations, (rulePath) => readVerdict(claimDir, keyOf(rulePath)));
  let report = null;
  if (toJudge.length > 0) {
    const judged = await judgeGuardRules({
      ...input.jevFilter, projectDir: targetDir, file: input.relPath, excerpt: input.content, rules: await rulesForJudge(targetDir, toJudge)
    });
    report = judged.report;
    for (const [rulePath, keep] of judged.keep) {
      remembered.set(rulePath, keep);
      if (report.status === 'used') writeVerdict(claimDir, keyOf(rulePath), keep);
    }
  }
  return { blocks: blocks.filter((block) => remembered.get(block.path) !== false), report };
}

// Violation-backed rules need no judge; a remembered verdict needs no request.
function partitionByVerdict(blocks, violations, lookup) {
  const proven = new Set(violations.map((violation) => violation.path));
  const remembered = new Map();
  const toJudge = [];
  for (const block of blocks.filter((entry) => !proven.has(entry.path))) {
    const verdict = lookup(block.path);
    if (verdict === null) toJudge.push(block);
    else remembered.set(block.path, verdict);
  }
  return { toJudge, remembered };
}

async function rulesForJudge(targetDir, blocks) {
  const rules = [];
  for (const block of blocks) {
    const content = await readFileSafe(path.join(targetDir, block.path));
    rules.push({ path: block.path, about: String(parseFrontmatter(content || '').description || ''), constraints: block.constraints });
  }
  return rules;
}

function claimGuardEvent(event, claimDir = CLAIM_DIR) {
  const identity = eventIdentity(event);
  if (!identity) return true;
  try {
    fs.mkdirSync(claimDir, { recursive: true });
    fs.closeSync(fs.openSync(path.join(claimDir, identity), 'wx'));
  } catch (error) {
    // An unwritable temp dir must never silence the guard; only a claim
    // another process already holds does.
    return !(error && error.code === 'EEXIST');
  }
  if (identity.startsWith('0')) pruneClaims(claimDir);
  return true;
}

function formatForTool(tool, additionalContext) {
  // Only the Claude Code adapter exists today; other harnesses default to it
  // until their own extension point is wired.
  switch (tool) {
    case 'claude':
    default:
      return {
        hookSpecificOutput: {
          hookEventName: 'PreToolUse',
          additionalContext
        }
      };
  }
}

async function buildGuardResponse(event, targetDir, options = {}) {
  const gate = { ...GUARD_GATE, ...(options.gate || {}) };
  const target = guardTarget(event, targetDir, options, gate);
  if (!target) return emptyResponse();

  const agent = options.agent || 'dev';
  const brief = await buildContextBrief(targetDir, { agent, mode: 'executing', task: target.query, paths: target.filePath });
  const vocabulary = await vocabularyBlocksFor(targetDir, brief, target, gate);
  const found = await violationsFor(targetDir, target, agent);
  const judged = await judgeVocabularyBlocks(targetDir, event, vocabulary, found.violations, {
    jevFilter: options.jevFilter, claimDir: options.claimDir, relPath: target.relPath, content: target.content
  });
  const ruleBlocks = await withViolations(targetDir, judged.blocks, found.violations, gate, brief.intent && brief.intent.stack);
  if (ruleBlocks.length === 0) return emptyResponse();

  const response = formatForTool(options.tool || 'claude', formatInjectionText(target.filePath, ruleBlocks));
  response._guard = guardRecord({ ruleBlocks, brief, agent, target, found, judged });
  return response;
}

// The pending write the guard judges, or null for a call it lets pass.
function guardTarget(event, targetDir, options, gate) {
  const toolName = event && event.tool_name;
  const toolInput = (event && event.tool_input) || {};
  if (!MUTATING_TOOLS.has(toolName)) return null;
  const filePath = toolInput.file_path || toolInput.notebook_path || '';
  const content = extractEditedContent(toolInput);
  // A session edits more than the project (operator memory, scratch files):
  // the project's rules apply to the project's files only.
  if ((!filePath && !content) || outsideProject(targetDir, filePath)) return null;
  if (!claimGuardEvent(event, options.claimDir)) return null;
  const query = deriveQuery(filePath, content, gate.maxContentChars);
  if (!query) return null;
  const pathCandidates = guardPathCandidates(targetDir, filePath);
  // Classify by the project-relative path: the folders above the project root
  // (a checkout under `.../research/` or `.../tests/`) say nothing about the file.
  const relPath = String(pathCandidates[pathCandidates.length - 1] || filePath).replace(/\\/g, '/');
  return { toolName, toolInput, filePath, content, query, pathCandidates, relPath };
}

// Vocabulary salience: the brief routed a rule through a hard signal.
async function vocabularyBlocksFor(targetDir, brief, target, gate) {
  const ruled = matchedRules(brief);
  if (ruled.length === 0 || !confidenceAllows(brief.confidence, gate)) return [];
  const surfaceKinds = detectSurfaceKinds(target.relPath, target.content);
  const stack = brief.intent && brief.intent.stack;
  return buildRuleBlocks(targetDir, ruled, gate, surfaceKinds, target.pathCandidates, stack, isGovernanceArtifact(target.filePath));
}

// Violation salience: a rule's own checker finds a NEW violation in what is
// being written — the naming rule speaks when `servicoCliente.js` is written,
// whether or not the text says "naming". Governance files author the law and
// quote its counter-examples, so they are never judged by it.
async function violationsFor(targetDir, target, agent) {
  const kind = isGovernanceArtifact(target.filePath) ? null : editedFileKind(target.relPath);
  if (!kind) return { kind, violations: [] };
  const violations = await detectEditViolations(targetDir, {
    agent, rel: target.relPath, kind, toolName: target.toolName, toolInput: target.toolInput
  });
  return { kind, violations };
}

// What the outcome reader (lib/guard-outcomes.js) re-checks later: was the
// measured violation fixed, or did it land and stay?
function guardRecord({ ruleBlocks, brief, agent, target, found, judged }) {
  return {
    injected: true,
    rules: ruleBlocks.map((block) => block.path),
    confidence: brief.confidence,
    violations: found.violations.reduce((sum, block) => sum + block.findings.length + block.more, 0),
    agent,
    file: target.relPath,
    violation_keys: found.violations.map((block) => ({
      rule: block.path,
      checker: block.checker,
      kind: found.kind,
      keys: block.findings.map((finding) => finding.key)
    })),
    ...(judged.report ? { jev: judged.report } : {})
  };
}

module.exports = {
  buildGuardResponse,
  claimGuardEvent,
  deriveQuery,
  detectSurfaceKinds,
  isGovernanceArtifact,
  outsideProject,
  extractEditedContent,
  matchedRules,
  ruleAllowsGuard,
  MUTATING_TOOLS,
  GUARD_GATE
};
