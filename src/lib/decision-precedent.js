'use strict';

// A decision is taken once. `aioson decide` answers, in order:
//
//   1. precedent — the project already decided this: a routed decision doc
//      under .aioson/docs/decisions/ matches the question through a hard
//      signal. The answer comes from the file, no model involved;
//   2. recommendation — no precedent and JEV ready: a bounded Choice over the
//      given options plus "needs a human". JEV recommends; it never records;
//   3. record — `--record --choice=...` writes the decision as a routed doc
//      (the options become aliases, the question its birth example) and proves
//      at birth that the next agent asking the question receives it.
//
// Without JEV the command still finds precedents and records decisions: the
// memory is local and deterministic; the judge is optional.

const { selectContext } = require('../context-selector');
const { readFileSafe, parseFrontmatter } = require('../preflight-engine');
const { analyzeTaskVocabulary } = require('./task-vocabulary');
const { scaffoldKnowledge } = require('./rule-scaffold');
const { loadJevConfig } = require('./jev-config');
const { requestJev } = require('./jev-client');
const { validateAnswers } = require('./jev-judgment');
const path = require('node:path');

const DECISIONS_PREFIX = '.aioson/docs/decisions/';
const HARD_SIGNAL = /(?:triggers|aliases|task_types|entities|retrieval_intents|paths):/;
const NEEDS_A_HUMAN = 'needs_a_human';
const MIN_CONFIDENCE = 0.7;
const MIN_PROBABILITY = 0.6;
const JEV_TIMEOUT_MS = 15000;

function slugOf(question) {
  const slug = String(question || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
    .slice(0, 50).replace(/-+$/g, '');
  return slug ? `decision-${slug}` : `decision-${Date.now()}`;
}

/** Decisions already recorded for this question, and the rules/docs that govern it. */
async function findPrecedent(projectDir, { question, agent = 'dev', paths = [] }) {
  const selection = await selectContext(projectDir, { agent, mode: 'planning', task: question, paths: paths.join(',') });
  const hard = (selection.selected || []).filter((item) => HARD_SIGNAL.test(item.reason || ''));
  const decisions = [];
  for (const item of hard.filter((entry) => entry.path.startsWith(DECISIONS_PREFIX))) {
    const fm = parseFrontmatter((await readFileSafe(path.join(projectDir, item.path))) || '');
    decisions.push({ path: item.path, decided: String(fm.description || ''), reason: item.reason });
  }
  const governing = hard
    .filter((item) => !item.path.startsWith(DECISIONS_PREFIX) && item.load_tier !== 'always')
    .slice(0, 5)
    .map((item) => ({ path: item.path, reason: item.reason }));
  return { decisions, governing };
}

/** JEV's bounded recommendation; `recommended` is null unless it is confident. */
async function recommendChoice(input) {
  const options = input.options || [];
  if (options.length < 2) return { status: 'no_options' };
  const config = input.config || loadJevConfig(input.projectDir, input.env || process.env);
  if (!config || config.status !== 'ready' || !config.enabled) return { status: config ? config.status : 'unconfigured' };
  const criteria = {};
  options.forEach((option, index) => { criteria[`option_${index}`] = option; });
  criteria[NEEDS_A_HUMAN] = 'None of the options fits, or the evidence does not settle it — a human must decide.';
  const questions = {
    decide: {
      type: 'choice',
      instructions: 'Which option should the project adopt for `question`, given `evidence` and the `governing` project knowledge? Choose needs_a_human when the evidence does not settle it.',
      criteria
    }
  };
  const response = await requestJev({
    config,
    state: { question: input.question, options, evidence: String(input.evidence || '').slice(0, 1500), governing: input.governing || [] },
    questions,
    fetchImpl: input.fetchImpl || globalThis.fetch,
    timeoutMs: JEV_TIMEOUT_MS,
    retries: 0
  });
  if (!response.ok) return { status: 'unavailable', reason: response.reason };
  if (validateAnswers(questions, response.answers).length > 0) return { status: 'unavailable', reason: 'invalid_response' };
  const answer = response.answers.decide;
  const probability = answer.probabilities[answer.choice];
  const proposed = answer.choice === NEEDS_A_HUMAN ? null : criteria[answer.choice];
  const confident = Boolean(proposed) && answer.confidence >= MIN_CONFIDENCE && probability >= MIN_PROBABILITY;
  return {
    status: 'used',
    recommended: confident ? proposed : null,
    proposed,
    needs_a_human: answer.choice === NEEDS_A_HUMAN,
    confidence: answer.confidence,
    probability,
    model: response.model || config.model
  };
}

function decisionBody(input) {
  const today = new Date().toISOString().slice(0, 10);
  const considered = (input.options.length ? input.options : [input.choice])
    .map((option) => `- ${option}${option === input.choice ? ' (chosen)' : ''}`).join('\n');
  return () => `# Decision: ${input.question}

**${input.choice}** — decided ${today} by ${input.by || 'an unnamed author'}.

## Why

${input.why || 'Not recorded. Add the reason the next agent needs to apply this decision correctly.'}

## Options considered

${considered}

## Evidence

${input.evidence || 'None recorded.'}

## Changing it

Agents follow this decision when they meet the question. To change it, a human edits or supersedes this file; an agent that finds contrary evidence raises it with \`aioson decision:add\` instead of deciding again.
`;
}

/** Write the decision as a routed doc; triggers default to the question's own content words. */
async function recordDecision(projectDir, input) {
  const triggers = input.triggers && input.triggers.length
    ? input.triggers
    : analyzeTaskVocabulary(input.question).content_terms.slice(0, 4);
  const aliases = input.aliases && input.aliases.length ? input.aliases : input.options;
  return scaffoldKnowledge(projectDir, {
    name: slugOf(input.question),
    folder: 'decisions',
    description: `Decided: ${input.question} -> ${input.choice}`,
    agents: input.agents,
    triggers,
    aliases,
    paths: input.paths,
    force: true
  }, 'doc', { body: decisionBody(input) });
}

module.exports = {
  DECISIONS_PREFIX,
  findPrecedent,
  recommendChoice,
  recordDecision,
  slugOf
};
