'use strict';

const path = require('node:path');
const { buildContextBrief, extractDocConstraints } = require('./context-brief');
const { parseFrontmatter, readFileSafe } = require('./preflight-engine');

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

// A guard rule that declares `paths` is a contract over those files. It may
// still surface in the brief via fuzzy trigger/description keyword overlap when
// an UNRELATED file is edited — but it must only inject when the edited path is
// actually in scope. This `paths:` reason is the proof the file matched.
const PATH_MATCH_SIGNAL = /\bpaths:/;

// Tunable relevance gate.
const GUARD_GATE = {
  minConfidence: 'medium', // 'low' briefs never inject
  maxConstraints: 10,
  maxForbidden: 6,
  maxContentChars: 4000
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

function ruleAllowsGuard(rule, frontmatter) {
  const reason = rule.reason || '';
  if (DOMAIN_SIGNAL.test(reason)) return true;
  if (!truthyFrontmatter(frontmatter.guard) || !HARD_SIGNAL.test(reason)) return false;
  // Path-scoped guard rule: inject only when the edited file is genuinely in its
  // declared path scope, never on fuzzy keyword spill from an unrelated file.
  if (ruleDeclaresPaths(frontmatter) && !PATH_MATCH_SIGNAL.test(reason)) return false;
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
async function buildRuleBlocks(targetDir, salient, gate) {
  const blocks = [];
  for (const rule of salient) {
    const content = await readFileSafe(path.join(targetDir, rule.path));
    if (!content) continue;
    const frontmatter = parseFrontmatter(content);
    if (!ruleAllowsGuard(rule, frontmatter)) continue;
    const extracted = extractDocConstraints(content);
    const constraints = dedupeStrings(extracted.constraints).slice(0, gate.maxConstraints);
    const constraintSet = new Set(constraints.map(normalizeRuleLine));
    const forbidden = dedupeStrings(extracted.forbidden_patterns)
      .filter((item) => !constraintSet.has(normalizeRuleLine(item)))
      .slice(0, gate.maxForbidden);
    if (constraints.length === 0 && forbidden.length === 0) continue;
    blocks.push({ path: rule.path, constraints, forbidden });
  }
  return blocks;
}

function formatInjectionText(filePath, ruleBlocks) {
  const target = filePath ? path.basename(String(filePath)) : 'this change';
  const lines = [`[AIOSON context:guard] Project rules apply to ${target}:`];
  for (const block of ruleBlocks) {
    lines.push(`Rule ${block.path}:`);
    for (const constraint of block.constraints) lines.push(`- ${constraint}`);
    for (const pattern of block.forbidden) lines.push(`- (forbidden) ${pattern}`);
  }
  return lines.join('\n');
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
  const toolName = event && event.tool_name;
  const toolInput = (event && event.tool_input) || {};
  if (!MUTATING_TOOLS.has(toolName)) return emptyResponse();

  const filePath = toolInput.file_path || toolInput.notebook_path || '';
  const content = extractEditedContent(toolInput);
  if (!filePath && !content) return emptyResponse();

  const query = deriveQuery(filePath, content, gate.maxContentChars);
  if (!query) return emptyResponse();

  const brief = await buildContextBrief(targetDir, {
    agent: options.agent || 'dev',
    mode: 'executing',
    task: query,
    paths: filePath
  });

  const ruled = matchedRules(brief);
  if (ruled.length === 0) return emptyResponse();
  if (!confidenceAllows(brief.confidence, gate)) return emptyResponse();

  const ruleBlocks = await buildRuleBlocks(targetDir, ruled, gate);
  if (ruleBlocks.length === 0) return emptyResponse();

  const additionalContext = formatInjectionText(filePath, ruleBlocks);
  const response = formatForTool(options.tool || 'claude', additionalContext);
  response._guard = {
    injected: true,
    rules: ruleBlocks.map((block) => block.path),
    confidence: brief.confidence
  };
  return response;
}

module.exports = {
  buildGuardResponse,
  deriveQuery,
  extractEditedContent,
  matchedRules,
  ruleAllowsGuard,
  MUTATING_TOOLS,
  GUARD_GATE
};
