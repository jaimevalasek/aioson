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

module.exports = {
  OPTIONAL_BUDGET,
  pruneOptionalContext
};
