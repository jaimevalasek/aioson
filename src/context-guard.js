'use strict';

const path = require('node:path');
const { buildContextBrief } = require('./context-brief');

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

// Salience gate: fire only when at least one rule matched a domain signal
// (trigger/entity/alias/task_type), not merely a broad path glob like `src/**`.
// This is the "salient event, not every turn" guard against injection fatigue.
const DOMAIN_SIGNAL = /(?:triggers|entities|aliases|task_types):/;

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

function salientRules(rules) {
  return rules.filter((item) => DOMAIN_SIGNAL.test(item.reason || ''));
}

function confidenceAllows(confidence, gate) {
  const have = CONFIDENCE_RANK[confidence] ?? 0;
  const need = CONFIDENCE_RANK[gate.minConfidence] ?? 1;
  return have >= need;
}

function formatInjectionText(filePath, rules, brief, gate) {
  const target = filePath ? path.basename(String(filePath)) : 'this change';
  const lines = [`[AIOSON context:guard] Project rules apply to ${target}:`];
  lines.push(`Sources: ${rules.map((rule) => rule.path).join(', ')}`);

  const constraints = (brief.constraints || []).slice(0, gate.maxConstraints);
  if (constraints.length > 0) {
    lines.push('Constraints:');
    for (const constraint of constraints) lines.push(`- ${constraint}`);
  }

  const forbidden = (brief.forbidden_patterns || []).slice(0, gate.maxForbidden);
  if (forbidden.length > 0) {
    lines.push('Forbidden:');
    for (const pattern of forbidden) lines.push(`- ${pattern}`);
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
  const salient = salientRules(ruled);
  if (salient.length === 0) return emptyResponse();
  if (!confidenceAllows(brief.confidence, gate)) return emptyResponse();

  const additionalContext = formatInjectionText(filePath, salient, brief, gate);
  const response = formatForTool(options.tool || 'claude', additionalContext);
  response._guard = {
    injected: true,
    rules: salient.map((rule) => rule.path),
    confidence: brief.confidence
  };
  return response;
}

module.exports = {
  buildGuardResponse,
  deriveQuery,
  extractEditedContent,
  matchedRules,
  salientRules,
  MUTATING_TOOLS,
  GUARD_GATE
};
