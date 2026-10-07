'use strict';

// JEV as the precision filter for optional context. Local retrieval keeps the
// recall; when it offers an agent more optional references than it should read
// (should_load + skills over the budget), a configured JEV judges each one
// against the task and drops what the work does not need. Only optional items
// are judged — `must_load` is the law and is never pruned. Unconfigured,
// disabled, failed or malformed answers leave the local selection untouched,
// and the report says which of those happened.

const { loadJevConfig } = require('./jev-config');
const { requestJev } = require('./jev-client');
const { validateAnswers } = require('./jev-judgment');

const OPTIONAL_BUDGET = 4;
const JUDGE_CAP = 12;
const TIMEOUT_MS = 8000;

function questionsFor(documents) {
  const questions = {};
  documents.forEach((_, index) => {
    questions[`needed_${index}`] = {
      type: 'noul',
      instructions: `Does the agent need \`documents[${index}]\` to do \`task\`? A shared word is not enough.`,
      criteria: {
        true: 'The document governs or guides the work the task describes, for this agent.',
        false: 'The document is about other work, or it only shares a word with the task.'
      }
    };
  });
  return questions;
}

function noulOf(answers, index) {
  const value = answers && answers[`needed_${index}`] && answers[`needed_${index}`].noul;
  return typeof value === 'number' && !Number.isNaN(value) ? value : null;
}

/**
 * @param {object} input
 * @param {string} input.projectDir
 * @param {string} input.task
 * @param {string} input.agent
 * @param {string} input.mode
 * @param {string[]} input.paths
 * @param {Array<{path: string, reason?: string}>} input.items optional context, in rank order
 * @param {(item: object) => string} input.describe what the document is about
 * @returns {Promise<{ items: object[], pruned: object[], report: object }>}
 */
async function pruneOptionalContext(input) {
  const { projectDir, env = process.env, task, agent, mode, paths = [], items, describe = () => '' } = input;
  const budget = input.budget ?? OPTIONAL_BUDGET;
  const unchanged = (report) => ({ items, pruned: [], report: { offered: items.length, budget, ...report } });
  if (items.length <= budget) return unchanged({ status: 'within_budget' });

  const config = input.config || loadJevConfig(projectDir, env);
  if (!config || config.status !== 'ready' || !config.enabled) {
    return unchanged({ status: config ? config.status : 'unconfigured', reason: config && config.reason });
  }

  const judged = items.slice(0, JUDGE_CAP);
  const questions = questionsFor(judged);
  const state = {
    task: String(task || '').slice(0, 500),
    agent,
    mode,
    paths: paths.slice(0, 10),
    documents: judged.map((item) => ({
      path: item.path,
      about: String(describe(item) || '').slice(0, 300),
      selected_because: String(item.reason || '').slice(0, 200)
    }))
  };
  const response = await requestJev({
    config,
    state,
    questions,
    fetchImpl: input.fetchImpl || globalThis.fetch,
    timeoutMs: input.timeoutMs || TIMEOUT_MS,
    retries: 0
  });
  if (!response.ok) return unchanged({ status: 'unavailable', reason: response.reason });
  const scores = judged.map((_, index) => noulOf(response.answers, index));
  if (scores.some((score) => score === null) || validateAnswers(questions, response.answers).length > 0) {
    return unchanged({ status: 'unavailable', reason: 'invalid_response' });
  }

  const minNoul = config.minNoul;
  const kept = judged.filter((_, index) => scores[index] >= minNoul);
  const pruned = judged
    .map((item, index) => ({ path: item.path, noul: Math.round(scores[index] * 1000) / 1000 }))
    .filter((item) => item.noul < minNoul);
  return {
    // Items past the judge cap were never examined; they keep their rank.
    items: [...kept, ...items.slice(JUDGE_CAP)],
    pruned,
    report: {
      status: 'used',
      offered: items.length,
      budget,
      judged: judged.length,
      kept: kept.length + Math.max(0, items.length - JUDGE_CAP),
      pruned: pruned.length,
      min_noul: minNoul,
      model: response.model || config.model,
      duration_ms: response.duration_ms
    }
  };
}

/**
 * The brief's adapter: should_load and skills are judged as one ranked list
 * (should_load first) and handed back in their own slots. Without a filter the
 * brief is returned as selected.
 */
async function judgeBriefOptional(projectDir, jevFilter, input) {
  const { shouldLoad, skills } = input;
  if (!jevFilter) return { shouldLoad, skills, report: null, pruned: [] };
  const tagged = [...shouldLoad.map((item) => ({ ...item, slot: 'should_load' })), ...skills.map((item) => ({ ...item, slot: 'skills' }))];
  const result = await pruneOptionalContext({
    projectDir,
    env: jevFilter.env,
    config: jevFilter.config,
    fetchImpl: jevFilter.fetchImpl,
    task: input.task,
    agent: input.agent,
    mode: input.mode,
    paths: input.paths,
    items: tagged,
    describe: input.describe
  });
  const untag = (slot) => result.items.filter((item) => item.slot === slot).map(({ slot: _slot, ...item }) => item);
  return { shouldLoad: untag('should_load'), skills: untag('skills'), report: result.report, pruned: result.pruned };
}

const GUARD_TIMEOUT_MS = 3000;

/**
 * Does each vocabulary-selected rule govern the write being made? Used by
 * context:guard for injections no checker backed: a rule that shares a word
 * with a file is the noise class ("cadastro" pulling the form rule into a CLI
 * reference). Returns, per rule path, whether to keep it — every rule is kept
 * when JEV is not ready or does not answer cleanly.
 *
 * @param {{ config?: object, projectDir?: string, env?: object, fetchImpl?: Function,
 *   file: string, excerpt: string, rules: Array<{ path: string, about: string, constraints: string[] }> }} input
 * @returns {Promise<{ keep: Map<string, boolean>, report: object }>}
 */
async function judgeGuardRules(input) {
  const keepAll = (report) => ({ keep: new Map(input.rules.map((rule) => [rule.path, true])), report });
  if (input.rules.length === 0) return keepAll({ status: 'nothing_to_judge' });
  const config = input.config || loadJevConfig(input.projectDir, input.env || process.env);
  if (!config || config.status !== 'ready' || !config.enabled) return keepAll({ status: config ? config.status : 'unconfigured' });

  const questions = {};
  input.rules.forEach((_, index) => {
    questions[`applies_${index}`] = {
      type: 'noul',
      instructions: `Does \`rules[${index}]\` govern the change being written to \`file\`? Sharing a word with the file is not enough.`,
      criteria: {
        true: 'The change builds or edits what the rule governs.',
        false: 'The file is about something else, or only mentions the rule\'s subject.'
      }
    };
  });
  const response = await requestJev({
    config,
    state: {
      file: input.file,
      excerpt: String(input.excerpt || '').slice(0, 1500),
      rules: input.rules.map((rule) => ({ path: rule.path, about: String(rule.about || '').slice(0, 300), says: rule.constraints.slice(0, 3) }))
    },
    questions,
    fetchImpl: input.fetchImpl || globalThis.fetch,
    timeoutMs: GUARD_TIMEOUT_MS,
    retries: 0
  });
  if (!response.ok) return keepAll({ status: 'unavailable', reason: response.reason });
  const scores = input.rules.map((_, index) => {
    const value = response.answers && response.answers[`applies_${index}`] && response.answers[`applies_${index}`].noul;
    return typeof value === 'number' && !Number.isNaN(value) ? value : null;
  });
  if (scores.some((score) => score === null) || validateAnswers(questions, response.answers).length > 0) {
    return keepAll({ status: 'unavailable', reason: 'invalid_response' });
  }
  const keep = new Map(input.rules.map((rule, index) => [rule.path, scores[index] >= config.minNoul]));
  return {
    keep,
    report: { status: 'used', judged: input.rules.length, dropped: [...keep.values()].filter((value) => !value).length, min_noul: config.minNoul }
  };
}

module.exports = {
  OPTIONAL_BUDGET,
  judgeBriefOptional,
  judgeGuardRules,
  pruneOptionalContext
};
