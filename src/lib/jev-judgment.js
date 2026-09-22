'use strict';

const { requestJev } = require('./jev-client');
const { sanitize, sanitizeQuestions } = require('./jev-privacy');
const { cacheKey, cacheEnabled, readCache, writeCache, recordEvent } = require('./jev-cache');

const MAX_SPEC_BYTES = 512 * 1024;
const MAX_QUESTIONS = 255;
const QUESTION_ID = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,79}$/;
const OPS = new Set(['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'in', 'not_in']);

function isStructured(value) {
  return typeof value === 'string' || Array.isArray(value) || (value && typeof value === 'object');
}

function validateQuestion(id, question) {
  const errors = [];
  if (!QUESTION_ID.test(id)) errors.push(`questions.${id}: invalid question id`);
  if (!question || typeof question !== 'object' || Array.isArray(question)) {
    return [...errors, `questions.${id}: expected an object`];
  }
  if (!['noul', 'choice', 'score'].includes(question.type)) {
    errors.push(`questions.${id}.type: expected noul, choice, or score`);
  }
  if (!isStructured(question.instructions)) errors.push(`questions.${id}.instructions: required`);

  if (question.type === 'choice') {
    const criteria = question.criteria;
    if (!criteria || typeof criteria !== 'object' || Array.isArray(criteria)) {
      errors.push(`questions.${id}.criteria: choice requires an option map`);
    } else {
      const options = Object.keys(criteria);
      if (options.length < 2 || options.length > 255) {
        errors.push(`questions.${id}.criteria: choice requires 2 to 255 options`);
      }
      if (Object.values(criteria).some((value) => value !== null && !isStructured(value))) errors.push(`questions.${id}.criteria: invalid option description`);
    }
  }
  if (question.type === 'score') {
    if (!Array.isArray(question.criteria) || question.criteria.length < 2 || question.criteria.length > 10) {
      errors.push(`questions.${id}.criteria: score requires 2 to 10 ordered levels`);
    }
    else if (question.criteria.some((value) => !isStructured(value))) errors.push(`questions.${id}.criteria: invalid level description`);
  }
  if (question.type === 'noul' && question.criteria != null) {
    const criteria = question.criteria;
    if (!criteria || typeof criteria !== 'object' || Array.isArray(criteria)
      || !Object.hasOwn(criteria, 'true') || !Object.hasOwn(criteria, 'false')) {
      errors.push(`questions.${id}.criteria: noul criteria must define true and false`);
    }
  }
  return errors;
}

function primaryMetric(question) {
  if (question.type === 'noul') return 'noul';
  if (question.type === 'choice') return 'choice';
  return 'score';
}

function validateDecision(decision, questions) {
  if (decision == null) return [];
  if (!decision || typeof decision !== 'object' || Array.isArray(decision)) return ['decision: expected an object'];
  const errors = [];
  const type = decision.type || 'raw';
  if (!['raw', 'gate', 'select', 'rank'].includes(type)) {
    return ['decision.type: expected raw, gate, select, or rank'];
  }
  if (type === 'gate') {
    if (!['all', 'any'].includes(decision.mode || 'all')) errors.push('decision.mode: expected all or any');
    if (!Array.isArray(decision.rules) || decision.rules.length === 0) {
      errors.push('decision.rules: gate requires at least one rule');
    } else {
      decision.rules.forEach((rule, index) => {
        const prefix = `decision.rules[${index}]`;
        const question = Object.hasOwn(questions, rule?.question) ? questions[rule.question] : null;
        if (!question) errors.push(`${prefix}.question: unknown question`);
        const metric = rule?.metric || (question ? primaryMetric(question) : null);
        if (!['noul', 'choice', 'score', 'confidence', 'probability'].includes(metric)) {
          errors.push(`${prefix}.metric: unsupported metric`);
        }
        if (metric === 'confidence' && question?.type === 'noul') errors.push(`${prefix}.metric: noul has no confidence`);
        if (question && ![question.type, ...(question.type === 'noul' ? [] : ['confidence', 'probability'])].includes(metric)) errors.push(`${prefix}.metric: incompatible question type`);
        if (metric === 'probability') {
          if (rule?.option == null) errors.push(`${prefix}.option: required for probability`);
          if (question?.type === 'noul') errors.push(`${prefix}.metric: noul has no probability map`);
          if (question?.type === 'choice' && rule?.option != null && !Object.hasOwn(question.criteria || {}, String(rule.option))) {
            errors.push(`${prefix}.option: unknown choice option`);
          }
          if (question?.type === 'score' && !Array.from(question.criteria || [], (_, i) => String(i)).includes(String(rule?.option))) errors.push(`${prefix}.option: unknown score level`);
        }
        const op = rule?.op || 'gte';
        if (!OPS.has(op)) errors.push(`${prefix}.op: unsupported operator`);
        if (metric === 'choice' && !['eq', 'neq', 'in', 'not_in'].includes(op)) errors.push(`${prefix}.op: choice requires a categorical operator`);
        if (!Object.hasOwn(rule || {}, 'value')) errors.push(`${prefix}.value: required`);
        else if (['gt', 'gte', 'lt', 'lte'].includes(op) && !Number.isFinite(rule.value)) errors.push(`${prefix}.value: numeric operator requires a finite number`);
        else if (['in', 'not_in'].includes(op) && !Array.isArray(rule.value)) errors.push(`${prefix}.value: ${op} requires an array`);
      });
    }
  }
  if (type === 'select') {
    const question = questions[decision.question];
    if (!question) errors.push('decision.question: unknown question');
    else if (question.type !== 'choice') errors.push('decision.question: select requires a choice question');
    for (const field of ['min_confidence', 'min_probability']) {
      if (decision[field] != null && !(typeof decision[field] === 'number' && decision[field] >= 0 && decision[field] <= 1)) {
        errors.push(`decision.${field}: expected number from 0 to 1`);
      }
    }
  }
  if (type === 'rank') {
    const ids = decision.questions || Object.keys(questions);
    const metric = decision.metric || 'score';
    if (!Array.isArray(ids) || ids.length === 0) errors.push('decision.questions: rank requires question ids');
    else ids.forEach((id) => {
      if (!questions[id]) errors.push(`decision.questions: unknown question ${id}`);
      else if (metric === 'score' && questions[id].type !== 'score') errors.push(`decision.questions: ${id} is not a score question`);
      else if (metric === 'noul' && questions[id].type !== 'noul') errors.push(`decision.questions: ${id} is not a noul question`);
      else if (metric === 'confidence' && questions[id].type === 'noul') errors.push(`decision.questions: ${id} has no confidence`);
    });
    if (!['score', 'noul', 'confidence'].includes(metric)) {
      errors.push('decision.metric: rank supports score, noul, or confidence');
    }
    if (!['asc', 'desc'].includes(decision.direction || 'desc')) errors.push('decision.direction: expected asc or desc');
  }
  return errors;
}

function validateJudgmentSpec(spec) {
  const errors = [];
  if (!spec || typeof spec !== 'object' || Array.isArray(spec)) {
    return { ok: false, errors: ['spec: expected a JSON object'] };
  }
  if (spec.version != null && spec.version !== 1) errors.push('version: only version 1 is supported');
  if (!Object.hasOwn(spec, 'state') || !isStructured(spec.state)) errors.push('state: required string, object, or array');
  const questions = spec.questions;
  if (!questions || typeof questions !== 'object' || Array.isArray(questions)) {
    errors.push('questions: required question map');
  } else {
    const ids = Object.keys(questions);
    if (ids.length === 0 || ids.length > MAX_QUESTIONS) errors.push(`questions: requires 1 to ${MAX_QUESTIONS} entries`);
    ids.forEach((id) => errors.push(...validateQuestion(id, questions[id])));
    errors.push(...validateDecision(spec.decision, questions));
  }
  let bytes = 0;
  try {
    bytes = Buffer.byteLength(JSON.stringify(spec));
  } catch {
    errors.push('spec: must be JSON serializable');
  }
  if (bytes > MAX_SPEC_BYTES) errors.push(`spec: exceeds ${MAX_SPEC_BYTES} bytes`);
  if (!errors.length) {
    // UTF-8 bytes are a conservative token upper bound; do not silently
    // advertise a character limit as a tokenizer measurement.
    const stateBytes = Buffer.byteLength(JSON.stringify(sanitize(spec.state)));
    const questionBytes = Object.values(sanitizeQuestions(questions)).map((q) => Buffer.byteLength(JSON.stringify(q)));
    if (stateBytes + Math.max(...questionBytes) > 32000 || stateBytes + questionBytes.reduce((a, b) => a + b, 0) > 64000) errors.push('spec: conservative_context_budget_exceeded; select smaller evidence spans');
  }
  return { ok: errors.length === 0, errors, bytes };
}

function validateAnswers(questions, answers) {
  const errors = [];
  if (!answers || typeof answers !== 'object' || Array.isArray(answers)) return ['answers: expected a map'];
  for (const [id, question] of Object.entries(questions)) {
    const answer = answers[id];
    if (!Object.hasOwn(answers, id) || !answer || typeof answer !== 'object' || Array.isArray(answer)) {
      errors.push(`answers.${id}: missing`);
      continue;
    }
    if (answer.type !== question.type) errors.push(`answers.${id}.type: expected ${question.type}`);
    if (question.type === 'noul' && !(typeof answer.noul === 'number' && answer.noul >= 0 && answer.noul <= 1)) {
      errors.push(`answers.${id}.noul: expected number from 0 to 1`);
    }
    if (question.type === 'choice') {
      if (!Object.hasOwn(question.criteria, answer.choice)) errors.push(`answers.${id}.choice: unknown option`);
      if (!(typeof answer.confidence === 'number' && answer.confidence >= 0 && answer.confidence <= 1)) {
        errors.push(`answers.${id}.confidence: expected number from 0 to 1`);
      }
    }
    if (question.type === 'score') {
      if (!(typeof answer.score === 'number' && Number.isFinite(answer.score) && answer.score >= 0 && answer.score <= question.criteria.length - 1)) errors.push(`answers.${id}.score: outside rubric levels`);
      if (!(typeof answer.confidence === 'number' && answer.confidence >= 0 && answer.confidence <= 1)) {
        errors.push(`answers.${id}.confidence: expected number from 0 to 1`);
      }
    }
    if (question.type === 'choice' || question.type === 'score') {
      const keys = question.type === 'choice' ? Object.keys(question.criteria) : question.criteria.map((_, i) => String(i));
      const probabilities = answer.probabilities;
      if (!probabilities || typeof probabilities !== 'object' || Array.isArray(probabilities)
        || Object.keys(probabilities).length !== keys.length
        || keys.some((key) => !Object.hasOwn(probabilities, key) || typeof probabilities[key] !== 'number' || !Number.isFinite(probabilities[key]) || probabilities[key] < 0 || probabilities[key] > 1)
        || Math.abs(Object.values(probabilities).reduce((sum, p) => sum + p, 0) - 1) > 0.001) {
        errors.push(`answers.${id}.probabilities: expected complete normalized distribution`);
      }
    }
  }
  return errors;
}

function metricValue(answer, rule) {
  const metric = rule.metric || answer.type;
  if (metric === 'probability') return answer.probabilities?.[String(rule.option)];
  return answer[metric];
}

function compare(actual, op, expected) {
  if (actual == null || (typeof actual === 'number' && !Number.isFinite(actual))) return false;
  if (op === 'eq') return actual === expected;
  if (op === 'neq') return actual !== expected;
  if (op === 'gt') return typeof actual === 'number' && actual > expected;
  if (op === 'gte') return typeof actual === 'number' && actual >= expected;
  if (op === 'lt') return typeof actual === 'number' && actual < expected;
  if (op === 'lte') return typeof actual === 'number' && actual <= expected;
  if (op === 'in') return Array.isArray(expected) && expected.includes(actual);
  if (op === 'not_in') return Array.isArray(expected) && !expected.includes(actual);
  return false;
}

function applyDecision(spec, answers) {
  const decision = spec.decision || { type: 'raw' };
  const type = decision.type || 'raw';
  if (type === 'raw') return { type: 'raw', action: decision.action || 'observe' };

  if (type === 'gate') {
    const evaluations = decision.rules.map((rule) => {
      const actual = metricValue(answers[rule.question], rule);
      const op = rule.op || 'gte';
      return { question: rule.question, metric: rule.metric || answers[rule.question].type, option: rule.option, op, expected: rule.value, actual, passed: compare(actual, op, rule.value) };
    });
    const passed = (decision.mode || 'all') === 'any'
      ? evaluations.some((item) => item.passed)
      : evaluations.every((item) => item.passed);
    return {
      type,
      mode: decision.mode || 'all',
      passed,
      action: passed ? (decision.on_pass || 'accept') : (decision.on_fail || 'review'),
      evaluations
    };
  }

  if (type === 'select') {
    const answer = answers[decision.question];
    const probability = answer.probabilities?.[answer.choice] ?? null;
    const minConfidence = Number(decision.min_confidence || 0);
    const minProbability = Number(decision.min_probability || 0);
    const accepted = Number.isFinite(answer.confidence) && Number.isFinite(probability) && answer.confidence >= minConfidence && probability >= minProbability;
    return {
      type,
      question: decision.question,
      selected: accepted ? answer.choice : null,
      proposed: answer.choice,
      probability,
      confidence: answer.confidence,
      accepted,
      action: accepted ? answer.choice : (decision.on_uncertain || 'review')
    };
  }

  const metric = decision.metric || 'score';
  const direction = decision.direction || 'desc';
  const ids = decision.questions || Object.keys(spec.questions);
  const ranking = ids.map((question) => ({
    question,
    value: answers[question]?.[metric]
  })).sort((left, right) => {
    const a = typeof left.value === 'number' ? left.value : (direction === 'desc' ? -Infinity : Infinity);
    const b = typeof right.value === 'number' ? right.value : (direction === 'desc' ? -Infinity : Infinity);
    if (a === b) return left.question.localeCompare(right.question);
    return direction === 'desc' ? b - a : a - b;
  });
  return { type, metric, direction, winner: ranking[0]?.question || null, action: ranking[0]?.question || 'review', ranking };
}

async function runJevJudgment({ spec, config, projectDir, fetchImpl, dryRun = false, timeoutMs, retries, sleepImpl } = {}) {
  const validation = validateJudgmentSpec(spec);
  if (!validation.ok) return { ok: false, status: 'invalid_spec', errors: validation.errors };
  if (dryRun) {
    return {
      ok: true,
      status: 'dry_run',
      valid: true,
      bytes: validation.bytes,
      config_status: config?.status || 'unconfigured',
      config_reason: config?.reason || null,
      route: config?.route || spec.route || null,
      model: config?.model || null,
      request: { model: config?.model || null, state: spec.state, questions: spec.questions }
    };
  }

  const request = { state: sanitize(spec.state), questions: sanitizeQuestions(spec.questions) };
  const key = cacheKey(request, config || {});
  const enabled = cacheEnabled(projectDir, config || {});
  let response = enabled ? await readCache(projectDir, key, config.cacheTtlMs || 86400000) : null;
  if (response && validateAnswers(spec.questions, response.answers).length) response = null;
  const hit = Boolean(response);
  if (!hit) await recordEvent(projectDir, { status: 'requested', key, model: config?.model, route: config?.route });
  response = response || await requestJev({
    config,
    state: request.state,
    questions: request.questions,
    fetchImpl,
    timeoutMs,
    retries,
    sleepImpl
  });
  if (!response.ok) {
    await recordEvent(projectDir, { status: response.status, key, route: config?.route });
    return response;
  }
  const answerErrors = validateAnswers(spec.questions, response.answers);
  if (answerErrors.length > 0) {
    await recordEvent(projectDir, { status: 'invalid_response', key, model: response.model });
    return { ok: false, status: 'invalid_response', reason: 'answer_contract_failed', errors: answerErrors, route: response.route, model: response.model };
  }
  if (enabled && !hit) await writeCache(projectDir, key, response);
  await recordEvent(projectDir, { status: hit ? 'cache_hit' : 'used', key, model: response.model, route: response.route, usage: hit ? null : response.usage, duration_ms: hit ? 0 : response.duration_ms });
  return {
    ...response,
    cache: { status: hit ? 'hit' : enabled ? 'miss' : 'disabled', key },
    ...(hit ? { usage: null, attempts: 0, duration_ms: 0 } : {}),
    judgment_id: spec.id || null,
    decision: applyDecision(spec, response.answers)
  };
}

module.exports = {
  MAX_QUESTIONS,
  MAX_SPEC_BYTES,
  applyDecision,
  runJevJudgment,
  validateAnswers,
  validateJudgmentSpec
};
