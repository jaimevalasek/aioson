'use strict';

/**
 * Squad executor reflection module
 *
 * Before marking a task DONE, an executor runs a self-critique pass
 * against its output. If the output fails the quality checklist, the
 * executor iterates (up to max_iterations) before escalating to the
 * coordinator or marking as DONE_WITH_CONCERNS.
 *
 * Reflection is triggered automatically when:
 *   - A worker calls reflect() before returning its result
 *   - The task-decomposer runs a plan step with reflection enabled
 *   - The squad:autorun command is invoked with --reflect
 *
 * Checklist sources (in priority order):
 *   1. squad.manifest.json → executor.reflection.checklist (squad.json legacy)
 *   2. checklists/quality.md (quality.md legacy)
 *   3. Built-in generic quality criteria (fallback)
 *
 * Verdict:
 *   DONE              — passed all checks, no issues
 *   DONE_WITH_CONCERNS — passed minimally but has minor issues (flagged)
 *   NEEDS_ITERATION   — failed critical checks, should retry
 *   ESCALATE          — exhausted iterations, coordinator must decide
 *   UNVERIFIED        — required evaluation is unavailable or inconclusive
 */

const fs = require('node:fs/promises');
const path = require('node:path');
const { checkMustHaves } = require('./verify-gate');

// ─── Built-in quality criteria (generic fallback) ────────────────────────────

const GENERIC_CHECKLIST = [
  { id: 'non_empty',     label: 'Output is not empty',                  critical: true  },
  { id: 'output_length', label: 'Output has at least 50 characters (lint only)', critical: true },
  { id: 'no_truncation', label: 'Output is not abruptly cut off',       critical: true  },
  { id: 'no_filler',     label: 'Output has no generic filler content', critical: false },
  { id: 'word_count',    label: 'Output has at least 10 words (lint only)', critical: false }
];

// ─── Checklist loading ────────────────────────────────────────────────────────

async function loadSquadJson(projectDir, squadSlug) {
  for (const name of ['squad.manifest.json', 'squad.json']) {
    try {
      const value = JSON.parse(await fs.readFile(path.join(projectDir, '.aioson', 'squads', squadSlug, name), 'utf8'));
      if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`Invalid reflection manifest: ${name}`);
      return value;
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }
  return null;
}

async function loadQualityFile(projectDir, squadSlug) {
  for (const name of ['checklists/quality.md', 'quality.md']) {
    try {
      const raw = await fs.readFile(path.join(projectDir, '.aioson', 'squads', squadSlug, name), 'utf8');
      const criteria = parseQualityMarkdown(raw);
      if (!criteria) throw new Error(`No evaluable checklist entries in ${name}`);
      return criteria;
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }
  return null;
}

function parseQualityMarkdown(content) {
  const criteria = [];
  const lines = content.split(/\r?\n/);
  let id = 0;

  for (const line of lines) {
    // Support: "- [critical] Label" or "- Label" or "* Label"
    const match = line.match(/^\s*[-*]\s+(?:\[([\w ]*)\]\s+)?(.+)$/);
    if (!match) continue;

    const tag = (match[1] || '').toLowerCase();
    const label = match[2].trim();
    if (!label) continue;

    criteria.push({
      id: `custom_${++id}`,
      label,
      critical: tag === 'critical'
    });
  }

  return criteria.length > 0 ? criteria : null;
}

function executorConfig(manifest, slug) {
  return Array.isArray(manifest?.executors)
    ? manifest.executors.find((executor) => executor.slug === slug)
    : manifest?.executors?.[slug];
}

async function loadChecklist(projectDir, squadSlug, executorSlug, fallback = GENERIC_CHECKLIST) {
  // 1. Canonical manifest executor checklist, with explicit legacy fallback
  const squadJson = await loadSquadJson(projectDir, squadSlug);
  if (squadJson) {
    const config = executorConfig(squadJson, executorSlug);
    const checklist = config?.reflection?.checklist;
    if (checklist !== undefined && (!Array.isArray(checklist) || !checklist.length)) throw new Error('Invalid reflection checklist');
    if (Array.isArray(checklist) && checklist.length > 0) {
      return checklist.map((item, i) => {
        if (typeof item === 'string') {
          return { id: `exec_${i}`, label: item, critical: false };
        }
        return { id: item.id || `exec_${i}`, label: item.label || item, critical: !!item.critical };
      });
    }
  }

  // 2. Canonical checklist file, with explicit legacy fallback
  const fromFile = await loadQualityFile(projectDir, squadSlug);
  if (fromFile) return fromFile;

  // 3. Generic fallback
  return fallback;
}

function loadMaxIterations(squadJson, executorSlug) {
  const config = executorConfig(squadJson, executorSlug);
  const val = config && config.reflection && config.reflection.max_iterations;
  return Number.isFinite(val) && val > 0 ? Math.max(1, Math.min(Math.floor(val), 5)) : 2;
}

// ─── Deterministic checks ────────────────────────────────────────────────────

const FILLER_PATTERNS = [
  /\bi will\b/i,
  /\bof course\b/i,
  /\bcertainly\b/i,
  /\bsure,?\s+here\b/i,
  /\bas an ai\b/i,
  /\bgreat question\b/i,
  /\bhappy to help\b/i,
  /\bI'?d be happy\b/i
];

function runBuiltinCheck(id, output) {
  const text = String(output || '').trim();
  switch (id) {
    case 'non_empty':
      return text.length > 0;
    case 'output_length':
      // heuristic: output has at least 50 chars and is not just whitespace
      return text.length >= 50;
    case 'no_truncation':
      // heuristic: doesn't end mid-sentence (no trailing comma or open paren)
      return !/[,(\[{]$/.test(text.replace(/\s+$/, ''));
    case 'no_filler':
      return !FILLER_PATTERNS.some((re) => re.test(text));
    case 'word_count':
      // heuristic: contains at least one noun or verb indicator
      return text.split(/\s+/).length >= 10;
    default:
      // Custom criteria without a built-in check — mark as needs-llm-review
      return null;
  }
}

// ─── Core reflection ─────────────────────────────────────────────────────────

/**
 * Run a reflection pass on an executor's output.
 *
 * @param {string}  output       — The text output to evaluate
 * @param {object}  context      — { projectDir, squadSlug, executorSlug, taskTitle?, iteration?, task? }
 *                                  task: the full task object (optional) — enables must_haves verification
 * @param {object}  [options]    — { checklist?, verbose? }
 * @returns {Promise<ReflectionResult>}
 *
 * ReflectionResult:
 *   {
 *     verdict: 'DONE' | 'DONE_WITH_CONCERNS' | 'NEEDS_ITERATION' | 'ESCALATE' | 'UNVERIFIED',
 *     passed: boolean,
 *     score: number | null,   // deterministic checks only; null when none evaluated
 *     iteration: number,      // current iteration number
 *     max_iterations: number,
 *     issues: string[],       // failed criteria labels
 *     critical_failures: string[],
 *     needs_llm_review: string[],  // criteria that couldn't be checked deterministically
 *     summary: string,        // one-line human-readable result
 *     checklist: object[]     // full results per criterion
 *   }
 */
async function reflect(output, context, options = {}) {
  const { projectDir, squadSlug, executorSlug, taskTitle = 'task', iteration = 1, task } = context;

  const squadJson = await loadSquadJson(projectDir, squadSlug);
  const maxIterations = loadMaxIterations(squadJson, executorSlug);

  const checklist = options.checklist
    ? options.checklist.map((item, i) => (
        typeof item === 'string'
          ? { id: `opt_${i}`, label: item, critical: false }
          : item
      ))
    : await loadChecklist(projectDir, squadSlug, executorSlug, options.fallbackChecklist);

  const results = [];
  const issues = [];
  const criticalFailures = [];
  const needsLlmReview = [];
  const unverifiedCritical = [];

  for (const criterion of checklist) {
    const checkResult = runBuiltinCheck(criterion.id, output);

    if (checkResult === null) {
      needsLlmReview.push(criterion.label);
      issues.push(`Not evaluated: ${criterion.label}`);
      if (criterion.critical) unverifiedCritical.push(criterion.label);
      results.push({ ...criterion, result: 'needs_review', passed: null });
      continue;
    }

    results.push({ ...criterion, result: checkResult ? 'pass' : 'fail', passed: checkResult });

    if (!checkResult) {
      issues.push(criterion.label);
      if (criterion.critical) criticalFailures.push(criterion.label);
    }
  }

  // ── must_haves verification (4-tier gate) ─────────────────────────────────
  let mustHavesResult = null;
  if (task && task.must_haves) {
    try {
      mustHavesResult = await checkMustHaves(task.must_haves, output, projectDir);
    } catch (error) {
      unverifiedCritical.push(`must_haves verification error: ${error.message}`);
    }

    if (mustHavesResult) {
      // Artifact failures are critical (file must exist and be substantive)
      for (const failure of mustHavesResult.failures) {
        criticalFailures.push(`[must_have] ${failure}`);
        issues.push(`[must_have] ${failure}`);
      }
      // Warnings are non-critical (truths, key_links)
      for (const warning of mustHavesResult.warnings) {
        issues.push(`[must_have] ${warning}`);
      }
      // Keyword mentions cannot prove a promised behavior. Missing evaluators
      // and skipped wiring checks must not become acceptance evidence.
      for (const detail of mustHavesResult.details) {
        if (detail.type === 'truth' || detail.skipped) {
          unverifiedCritical.push(`[must_have] Not verified: ${detail.statement || detail.descriptor}`);
        } else if (detail.passed === false && ['key_link', 'artifact_wired'].includes(detail.type)) {
          criticalFailures.push(`[must_have] ${detail.reason || detail.descriptor}`);
        }
      }
    }
  }

  const evaluated = results.filter((r) => r.passed !== null);
  const passedCount = evaluated.filter((r) => r.passed).length;
  const score = evaluated.length > 0 ? passedCount / evaluated.length : null;
  const passed = criticalFailures.length === 0 && unverifiedCritical.length === 0 && evaluated.length > 0;

  let verdict;
  if (unverifiedCritical.length > 0 || evaluated.length === 0) {
    verdict = 'UNVERIFIED';
  } else if (criticalFailures.length > 0 && iteration < maxIterations) {
    verdict = 'NEEDS_ITERATION';
  } else if (criticalFailures.length > 0 && iteration >= maxIterations) {
    verdict = 'ESCALATE';
  } else if (issues.length > 0) {
    verdict = 'DONE_WITH_CONCERNS';
  } else {
    verdict = 'DONE';
  }

  const summary = buildSummary(verdict, score, issues, criticalFailures, taskTitle, iteration, maxIterations);

  return {
    verdict,
    passed,
    score: score === null ? null : Math.round(score * 100) / 100,
    score_scope: 'deterministic_checks_only',
    iteration,
    max_iterations: maxIterations,
    issues,
    critical_failures: criticalFailures,
    needs_llm_review: needsLlmReview,
    unverified_critical: unverifiedCritical,
    must_haves_result: mustHavesResult,
    summary,
    checklist: results
  };
}

function buildSummary(verdict, score, issues, criticalFailures, taskTitle, iteration, maxIterations) {
  const scoreStr = `${Math.round(score * 100)}%`;
  switch (verdict) {
    case 'UNVERIFIED':
      return `[UNVERIFIED] "${taskTitle}" requires evaluation before acceptance`;
    case 'DONE':
      return `[DONE] "${taskTitle}" passed all checks (${scoreStr})`;
    case 'DONE_WITH_CONCERNS':
      return `[DONE_WITH_CONCERNS] "${taskTitle}" passed (${scoreStr}) with ${issues.length} minor issue(s): ${issues.slice(0, 2).join(', ')}`;
    case 'NEEDS_ITERATION':
      return `[NEEDS_ITERATION] "${taskTitle}" failed ${criticalFailures.length} critical check(s) — iteration ${iteration}/${maxIterations}: ${criticalFailures.slice(0, 2).join(', ')}`;
    case 'ESCALATE':
      return `[ESCALATE] "${taskTitle}" exhausted ${maxIterations} iterations — coordinator must decide. Failed: ${criticalFailures.join(', ')}`;
    default:
      return `[${verdict}] ${scoreStr}`;
  }
}

/**
 * Decide whether to iterate based on a reflection result.
 * Returns true if another attempt is warranted.
 */
function shouldIterate(reflectionResult) {
  return reflectionResult.verdict === 'NEEDS_ITERATION';
}

/**
 * Run a full reflection loop: reflect → iterate if needed → return final result.
 *
 * @param {function}  executeFn   — async function that produces output: async () => string
 * @param {object}    context     — same as reflect()
 * @param {object}    [options]   — { checklist?, onIteration?, verbose? }
 * @returns {Promise<{ output: string, reflection: ReflectionResult, iterations: number }>}
 */
async function reflectLoop(executeFn, context, options = {}) {
  const { projectDir, squadSlug, executorSlug } = context;
  const squadJson = await loadSquadJson(projectDir, squadSlug);
  const maxIterations = loadMaxIterations(squadJson, executorSlug);

  let lastOutput = null;
  let lastReflection = null;
  let iteration = 1;

  while (iteration <= maxIterations) {
    lastOutput = await executeFn(iteration, lastReflection);

    lastReflection = await reflect(lastOutput, { ...context, iteration }, options);

    if (options.onIteration) {
      try { await options.onIteration(iteration, lastOutput, lastReflection); } catch { /* ignore */ }
    }

    if (!shouldIterate(lastReflection)) break;
    iteration++;
  }

  return {
    output: lastOutput,
    reflection: lastReflection,
    iterations: iteration
  };
}

/**
 * Format a reflection result as a markdown report.
 * Useful for the bus (posting reflection results as feedback messages).
 */
function formatReport(result, executorSlug) {
  const lines = [
    `## Reflection: ${result.verdict}`,
    `Executor: ${executorSlug || 'unknown'}`,
    `Deterministic checks: ${result.score === null ? 'not evaluated' : `${Math.round(result.score * 100)}%`}  |  Iteration: ${result.iteration}/${result.max_iterations}`,
    '',
    `**Summary:** ${result.summary}`
  ];

  if (result.critical_failures.length > 0) {
    lines.push('', '**Critical failures:**');
    for (const f of result.critical_failures) lines.push(`- ❌ ${f}`);
  }

  if (result.issues.length > result.critical_failures.length) {
    lines.push('', '**Minor issues:**');
    for (const issue of result.issues) {
      if (!result.critical_failures.includes(issue)) lines.push(`- ⚠ ${issue}`);
    }
  }

  if (result.needs_llm_review.length > 0) {
    lines.push('', '**Needs LLM review (could not evaluate deterministically):**');
    for (const c of result.needs_llm_review) lines.push(`- 🔍 ${c}`);
  }

  return lines.join('\n');
}

module.exports = {
  reflect,
  reflectLoop,
  shouldIterate,
  formatReport,
  loadChecklist,
  GENERIC_CHECKLIST
};
