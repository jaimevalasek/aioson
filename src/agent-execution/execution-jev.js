'use strict';

/**
 * Typed Jev judgments for three engine decisions. Each one is opt-in in the
 * roles file (`execution.jev.review_depth | triage | review_order`), runs only
 * when the project's Jev configuration is ready, sends metadata only (unit id,
 * file paths, CAP/AC ids and the PRD's observable-behaviour text, a failure
 * reason — never file contents; `runJevJudgment` also redacts secrets), and
 * falls back to the configured, safer behaviour on any error or uncertainty:
 *
 *  - review depth: the review effort may drop to `high` for a unit whose
 *    defects would be visible and cheap; risky paths keep the configured
 *    effort without asking, and a judgment never raises it.
 *  - triage: a failure the judgment calls transient earns one automatic
 *    retry of the same stage; retrying is the only automatic effect.
 *  - review order: under `lane_gate: after_dev` the next unit is implemented
 *    while the previous review may still correct its predecessor; when the
 *    next unit builds on exact contracts of the previous one, its review
 *    waits for that review, so it tests against corrected code.
 */

const fs = require('node:fs/promises');
const path = require('node:path');
const { runJevJudgment } = require('../lib/jev-judgment');
const { loadJevConfig } = require('../lib/jev-config');
const { effortsForHost } = require('./schema');

const STANDARD_REVIEW_EFFORT = 'high';
const EFFORT_ORDER = ['low', 'medium', 'high', 'xhigh', 'max', 'ultra'];
// Defects here are silent, costly or hard to reverse: the configured review
// effort stays without consulting anyone.
const RISKY_PATH = /(^|\/)(prisma|migrations?|auth|security|secrets?|crypto|payments?|billing|systemd)(\/|$)|\.(sql|prisma)$|(^|\/)(install|uninstall)\.sh$|secret|token|password|credential/i;
// Outcome kinds that may be an environment failure rather than the work.
// Verdict failures (`failed`, `blocked`) are never triaged.
const TRIAGE_KINDS = new Set(['crashed', 'unavailable', 'capacity', 'timeout', 'stalled']);

function clip(value, max) {
  const text = String(value ?? '').trim();
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

/** `{ 'AC-x-01': 'observable behaviour' }` from the PRD's acceptance table rows. */
function acceptanceText(prd) {
  const texts = {};
  for (const line of String(prd || '').split(/\r?\n/)) {
    const cells = line.split('|').map((cell) => cell.trim());
    if (cells.length >= 5 && /^AC-[A-Za-z0-9-]+$/.test(cells[1])) texts[cells[1]] = clip(cells[3], 400);
  }
  return texts;
}

/**
 * `{ path: { action, change } }` from the plan's Implementation Delta rows
 * (`| CAP | Action | Existing evidence | Exact paths | Required change |`):
 * what each file is meant to gain, the strongest signal of how two units
 * depend on each other.
 */
function deltaChanges(plan, capabilities = []) {
  const changes = {};
  const selected = new Set(capabilities.map((cap) => String(cap).toLowerCase()));
  for (const line of String(plan || '').split(/\r?\n/)) {
    const cells = line.split('|').map((cell) => cell.trim());
    if (cells.length < 7 || !/^CAP-[A-Za-z0-9-]+$/.test(cells[1])) continue;
    if (selected.size > 0 && !selected.has(cells[1].toLowerCase())) continue;
    const action = cells[2].toLowerCase();
    if (!['create', 'modify', 'reuse', 'retire', 'delete'].includes(action)) continue;
    for (const file of cells[4].split(',').map((item) => item.trim().replace(/^`|`$/g, '')).filter(Boolean)) {
      if (!changes[file]) changes[file] = { action, change: clip(cells[5], 280) };
    }
  }
  return changes;
}

function unitEvidence(unit, context) {
  const { acs = {}, changes = {} } = context || {};
  const scopedChanges = typeof context?.planContent === 'string' ? deltaChanges(context.planContent, unit.caps || []) : changes;
  const files = (unit.files || []).slice(0, 40);
  return {
    id: unit.id,
    lane: unit.lane,
    scope: clip(unit.scope, 400),
    files,
    changes: files.filter((file) => scopedChanges[file]).slice(0, 20).map((file) => ({ path: file, ...scopedChanges[file] })),
    capabilities: (unit.caps || []).slice(0, 12),
    acceptance: (unit.acs || []).slice(0, 12).map((id) => ({ id, behaviour: acs[id] || null }))
  };
}

function reviewDepthSpec(unit, context) {
  return {
    version: 1,
    id: 'execution-review-depth',
    state: { unit: unitEvidence(unit, context) },
    questions: {
      review_depth: {
        type: 'choice',
        instructions: 'How deep must the independent code review of this implementation unit be? Judge from the files it writes and the acceptance criteria it carries.',
        criteria: {
          deep: 'A defect could be silent, costly or hard to reverse: data integrity or persistence, authentication or authorization, secrets, money, concurrency, scheduling or retries, process supervision, outbound network calls, installers or anything that runs unattended.',
          standard: 'A defect would be visible and cheap to fix: presentation, copy, formatting, static configuration, documentation, or tests around behaviour reviewed elsewhere.'
        }
      }
    },
    decision: { type: 'select', question: 'review_depth', min_confidence: 0.75, min_probability: 0.75, on_uncertain: 'deep' }
  };
}

function triageSpec(unit, stage, outcome) {
  return {
    version: 1,
    id: 'execution-failure-triage',
    state: {
      unit: unit.id,
      stage,
      failure: {
        kind: outcome.kind || null,
        reason: clip(outcome.reason, 200),
        error: clip(outcome.error, 800),
        detail: clip(outcome.detail, 800)
      }
    },
    questions: {
      failure_cause: {
        type: 'choice',
        instructions: 'What caused this orchestrated worker to stop? Judge only from the failure record.',
        criteria: {
          transient: 'The host or the environment failed (capacity, rate limit, network, a crash, a lock, a killed process) independently of the work; running the same stage again is likely to succeed.',
          defect: 'The work itself failed or cannot be done as specified (a test, build, verification or review problem, a missing input), or the record is not clear enough to tell.'
        }
      }
    },
    decision: { type: 'select', question: 'failure_cause', min_confidence: 0.8, min_probability: 0.8, on_uncertain: 'defect' }
  };
}

function reviewOrderSpec(previous, next, context) {
  return {
    version: 1,
    id: 'execution-review-order',
    state: { previous: unitEvidence(previous, context), next: unitEvidence(next, context) },
    questions: {
      coupling: {
        type: 'choice',
        instructions: 'The next unit was implemented while an independent review of the previous unit could still correct it. Could such a correction invalidate the next unit\'s work?',
        criteria: {
          independent: 'The next unit only needs the previous unit\'s work to exist: a different module, an additive extension, or use through a stable contract that a review correction would not change.',
          coupled: 'The next unit calls, imports, extends or tests exact functions, types, schemas, routes or behaviour the previous unit introduced, so a review correction could break it.'
        }
      }
    },
    decision: { type: 'select', question: 'coupling', min_confidence: 0.7, min_probability: 0.7, on_uncertain: 'coupled' }
  };
}

function startOrderSpec(earlier, later, context) {
  return {
    version: 1,
    id: 'execution-start-order',
    state: { earlier: unitEvidence(earlier, context), later: unitEvidence(later, context) },
    questions: {
      needs: {
        type: 'choice',
        instructions: 'The plan puts the earlier unit before the later one in the same lane, and the earlier one is not implemented yet. Can the later unit be implemented correctly now, before the earlier unit exists?',
        criteria: {
          depends: 'No: the later unit calls, imports, extends, migrates on top of, renders, wires or tests something the earlier unit creates (a function, type, table, column, migration, route, component, process or file), or follows a numbering the earlier unit starts.',
          independent: 'Yes: the later unit needs nothing the earlier unit creates; they only belong to the same feature or lane.'
        }
      }
    },
    decision: { type: 'select', question: 'needs', min_confidence: 0.8, min_probability: 0.8, on_uncertain: 'depends' }
  };
}

function lowerEffort(host, configured) {
  if (!configured) return null;
  const index = EFFORT_ORDER.indexOf(configured);
  const target = EFFORT_ORDER.indexOf(STANDARD_REVIEW_EFFORT);
  if (index <= target) return null;
  return effortsForHost(host).includes(STANDARD_REVIEW_EFFORT) ? STANDARD_REVIEW_EFFORT : null;
}

/**
 * `{ reviewDepth, triage, reviewOrder, startOrder }`. Every judgment
 * resolves — never throws — to `{ choice, source, ... }` where `source` is
 * `jev`, `floor` (decided by a fixed rule), or `fallback` (Jev unavailable,
 * failed or uncertain: the configured behaviour applies).
 */
function createExecutionJev({ projectDir, plan, env = process.env, judge = runJevJudgment, loadConfig = loadJevConfig, readFile = fs.readFile } = {}) {
  let configPromise = null;
  let contextPromise = null;
  const config = () => (configPromise ||= Promise.resolve().then(() => loadConfig(projectDir, env)).catch(() => ({ status: 'invalid' })));
  const source = (relative, parse) => (relative
    ? readFile(path.join(projectDir, relative), 'utf8').then(parse).catch(() => ({}))
    : Promise.resolve({}));
  // Read once per run: the PRD's acceptance text and the plan's per-file changes.
  const evidenceContext = () => (contextPromise ||= Promise.all([
    source(plan?.source?.prd, acceptanceText),
    source(plan?.source?.plan, (content) => content)
  ]).then(([acs, planContent]) => ({ acs, planContent })));

  const ask = async (spec, safeChoice) => {
    const resolved = await config();
    if (resolved.status !== 'ready') return { choice: safeChoice, source: 'fallback', reason: `jev_${resolved.status || 'unconfigured'}` };
    try {
      const result = await judge({ spec, config: resolved, projectDir });
      if (!result?.ok || !result.decision) return { choice: safeChoice, source: 'fallback', reason: result?.status || 'jev_failed' };
      const decision = result.decision;
      if (!decision.accepted) return { choice: safeChoice, source: 'fallback', reason: 'uncertain', proposed: decision.proposed, confidence: decision.confidence };
      return { choice: decision.selected, source: 'jev', confidence: decision.confidence, probability: decision.probability };
    } catch (error) {
      return { choice: safeChoice, source: 'fallback', reason: clip(error?.message || 'jev_error', 120) };
    }
  };

  return {
    /** The configured effort, or `high` when the unit is judged standard. */
    async reviewDepth(unit, role) {
      const lowered = lowerEffort(role?.host, role?.reasoning_effort);
      if (!lowered) return { choice: 'deep', effort: role?.reasoning_effort || null, source: 'floor', reason: 'already_at_or_below_standard' };
      const risky = (unit.files || []).find((file) => RISKY_PATH.test(file));
      if (risky) return { choice: 'deep', effort: role.reasoning_effort, source: 'floor', reason: `risky_path:${risky}` };
      const verdict = await ask(reviewDepthSpec(unit, await evidenceContext()), 'deep');
      return { ...verdict, effort: verdict.choice === 'standard' ? lowered : role.reasoning_effort };
    },
    /** `retry` only for a transient environment failure; otherwise `human`. */
    async triage(unit, stage, outcome) {
      if (!TRIAGE_KINDS.has(outcome?.kind)) return { choice: 'human', source: 'floor', reason: `kind_${outcome?.kind || 'unknown'}` };
      const verdict = await ask(triageSpec(unit, stage, outcome), 'defect');
      return { ...verdict, choice: verdict.choice === 'transient' ? 'retry' : 'human' };
    },
    /** `wait: false` only for a pair judged independent; its review may run alongside the previous one. */
    async reviewOrder(previous, next) {
      const verdict = await ask(reviewOrderSpec(previous, next, await evidenceContext()), 'coupled');
      return { ...verdict, wait: verdict.choice !== 'independent' };
    },
    /** `wait: false` only when the later unit needs nothing the earlier, unimplemented one creates. */
    async startOrder(earlier, later) {
      const verdict = await ask(startOrderSpec(earlier, later, await evidenceContext()), 'depends');
      return { ...verdict, wait: verdict.choice !== 'independent' };
    }
  };
}

module.exports = { createExecutionJev, acceptanceText, deltaChanges, lowerEffort, RISKY_PATH, TRIAGE_KINDS, STANDARD_REVIEW_EFFORT };
