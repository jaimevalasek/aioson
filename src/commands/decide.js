'use strict';

/**
 * aioson decide [path] --question="..." [--options="a|b"] [--evidence=...]
 *   [--agents=a,b] [--paths=glob] [--triggers=t,t] [--aliases=a,b]
 *   [--record --choice="..." [--why=...] [--by=@dev]] [--json]
 *
 * Asks the project before deciding: a recorded precedent answers without a
 * model; otherwise a configured JEV recommends among the options (or says a
 * human must decide); `--record` writes the choice as a routed decision doc,
 * proven at birth to reach the next agent who asks the same question.
 */

const { resolveTargetDir } = require('../lib/project-root');
const { findPrecedent, recommendChoice, recordDecision } = require('../lib/decision-precedent');
const { birthScenarios, proveBirth, recordBirthScenarios } = require('../lib/knowledge-birth');

function listOf(value, separator = ',') {
  return String(value || '').split(separator).map((item) => item.trim()).filter(Boolean);
}

function quoted(text) {
  return `"${String(text).replace(/"/g, '\\"')}"`;
}

async function record(targetDir, input, logger, json) {
  if (!input.choice) {
    const failure = { ok: false, status: 'choice_required', exitCode: 1 };
    if (!json) logger.error('decide --record needs --choice="<the option chosen>".');
    return failure;
  }
  const written = await recordDecision(targetDir, input);
  if (!written.ok) return { ok: false, status: 'record_failed', reason: written.reason, exitCode: 1 };
  const scenarios = birthScenarios({ relPath: written.path, frontmatter: written.frontmatter, examples: [input.question] });
  const file = await recordBirthScenarios(targetDir, written.name, scenarios);
  const birth = { file, ...(await proveBirth(targetDir, scenarios)) };
  const result = { ok: true, status: 'recorded', path: written.path, choice: input.choice, birth_evals: birth };
  if (json) return result;
  logger.log(`decide — recorded "${input.choice}" at ${written.path}.`);
  logger.log(`Birth evals: ${birth.passed}/${birth.passed + birth.failed} — the next agent asking this question ${birth.failed === 0 ? 'receives it' : 'may miss it; add --triggers with the words agents use'}.`);
  return result;
}

function logConsultation(logger, input, found, recommendation) {
  if (found.governing.length > 0) {
    logger.log('Governing knowledge — read before deciding:');
    for (const item of found.governing) logger.log(`- ${item.path} (${item.reason})`);
  }
  const recordHint = (choice) => `aioson decide . --question=${quoted(input.question)} --record --choice=${quoted(choice)} --why="<reason>"`;
  if (recommendation.status === 'used' && recommendation.recommended) {
    logger.log(`No precedent. JEV recommends: ${recommendation.recommended} (confidence ${recommendation.confidence}, p ${recommendation.probability}).`);
    logger.log(`Confirm it, then record it once: ${recordHint(recommendation.recommended)}`);
  } else if (recommendation.status === 'used') {
    logger.log(`No precedent, and JEV did not settle it${recommendation.proposed ? ` (leaned to ${recommendation.proposed}, confidence ${recommendation.confidence})` : ' (needs a human)'}.`);
    logger.log('This is a human decision: raise it with aioson decision:add (it blocks the feature until resolved), or decide and record it.');
  } else {
    logger.log('No precedent. Decide with the evidence and the governing knowledge, then record it so it is decided once:');
    logger.log(`  ${recordHint('<option>')}`);
  }
}

async function runDecide({ args, options = {}, logger }) {
  const targetDir = resolveTargetDir(args);
  const question = String(options.question || '').trim();
  if (!question) {
    if (!options.json) logger.error('decide needs --question="<the decision to make>".');
    return { ok: false, status: 'question_required', exitCode: 1 };
  }
  const input = {
    question,
    options: listOf(options.options, '|'),
    evidence: options.evidence ? String(options.evidence) : '',
    agents: listOf(options.agents),
    paths: listOf(options.paths),
    triggers: listOf(options.triggers),
    aliases: listOf(options.aliases),
    choice: options.choice ? String(options.choice).trim() : '',
    why: options.why ? String(options.why) : '',
    by: options.by ? String(options.by).trim() : ''
  };
  if (options.record) return record(targetDir, input, logger, Boolean(options.json));

  const found = await findPrecedent(targetDir, { question, agent: input.agents[0] || 'dev', paths: input.paths });
  if (found.decisions.length > 0) {
    const result = { ok: true, status: 'precedent', precedent: found.decisions, governing: found.governing };
    if (options.json) return result;
    logger.log('Already decided — follow it (a human changes it by editing or superseding the file):');
    for (const item of found.decisions) logger.log(`- ${item.decided} [${item.path}]`);
    return result;
  }

  const recommendation = await recommendChoice({ projectDir: targetDir, question, options: input.options, evidence: input.evidence, governing: found.governing });
  let status = 'undecided';
  if (recommendation.status === 'used') status = recommendation.recommended ? 'recommended' : 'needs_a_human';
  const result = { ok: true, status, governing: found.governing, jev: recommendation };
  if (options.json) return result;
  logConsultation(logger, input, found, recommendation);
  return result;
}

module.exports = { runDecide };
