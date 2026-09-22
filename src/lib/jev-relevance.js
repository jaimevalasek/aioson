'use strict';

const { loadJevConfig } = require('./jev-config');
const { requestJev } = require('./jev-client');
const { validateAnswers } = require('./jev-judgment');

const JUDGE_CAP = 20;
const FILTER_TIMEOUT_MS = 45000;

const JUDGE_INSTRUCTION = 'Jev is not filtering this list. These candidates are keyword matches only. Judge each one yourself before collect. A shared word is not the subject.';
const FAILED_INSTRUCTION = 'Jev is configured but did not answer. These candidates are keyword matches only. Judge each one yourself before collect. A shared word is not the subject.';
const USED_INSTRUCTION = 'Jev confirmed these candidates are about the query. You can collect them.';

function keywordReport(status, extra = {}) {
  return {
    status,
    fallback: 'keyword',
    trust_candidates: false,
    agent_instruction: status === 'unavailable' || status === 'invalid'
      ? FAILED_INSTRUCTION
      : JUDGE_INSTRUCTION,
    ...extra
  };
}

function filterBody(model, query, items) {
  const questions = {};
  items.forEach((_, index) => {
    questions[`relevant_${index}`] = {
      type: 'noul',
      instructions: `Does \`passages[${index}]\` report the same subject as \`query\`? A shared word is not enough.`,
      criteria: {
        true: 'The title and description are about the subject of query.',
        false: 'The item is about something else, or it only shares a word with query.'
      }
    };
  });
  return {
    model,
    state: {
      query: String(query || '').slice(0, 500),
      passages: items.map((item) => ({
        title: item.title || '',
        description: item.description || '',
        url: item.url || ''
      }))
    },
    questions
  };
}

function keepRelevant(items, answers, minNoul) {
  const kept = [];
  let parsed = 0;
  items.forEach((item, index) => {
    const noul = answers?.[`relevant_${index}`]?.noul;
    if (typeof noul !== 'number' || Number.isNaN(noul)) return;
    parsed += 1;
    if (noul < minNoul) return;
    kept.push({
      ...item,
      relevance_noul: Math.round(noul * 1000) / 1000
    });
  });
  kept.sort((left, right) => {
    if (left.relevance_noul !== right.relevance_noul) return right.relevance_noul - left.relevance_noul;
    if (left.score !== right.score) return right.score - left.score;
    return String(left.url).localeCompare(String(right.url));
  });
  return { parsed, kept };
}

async function applyJevRelevance({
  projectDir = null,
  env = process.env,
  query,
  ranked = [],
  fetchImpl = globalThis.fetch,
  config = null
} = {}) {
  const resolved = config || (projectDir ? loadJevConfig(projectDir, env) : null);
  if (!resolved || resolved.status === 'unconfigured' || resolved.status === 'disabled') {
    return {
      candidates: ranked,
      report: keywordReport(resolved?.status || 'unconfigured')
    };
  }
  if (!resolved.enabled || resolved.status !== 'ready') {
    return {
      candidates: ranked,
      report: keywordReport('invalid', {
        route: resolved.route,
        reason: resolved.reason || 'invalid_config'
      })
    };
  }
  if (ranked.length === 0) {
    return {
      candidates: [],
      report: {
        status: 'unused',
        route: resolved.route,
        model: resolved.model,
        trust_candidates: true,
        agent_instruction: 'No keyword candidate to judge.'
      }
    };
  }

  const judged = ranked.slice(0, JUDGE_CAP);
  const filterRequest = filterBody(resolved.model, query, judged);
  const filtered = await requestJev({
    config: resolved,
    state: filterRequest.state,
    questions: filterRequest.questions,
    fetchImpl,
    timeoutMs: FILTER_TIMEOUT_MS,
    retries: 1
  });
  if (!filtered.ok) {
    return {
      candidates: ranked,
      report: keywordReport('unavailable', {
        route: resolved.route,
        model: resolved.model,
        reason: filtered.reason
      })
    };
  }

  const { parsed, kept } = keepRelevant(judged, filtered.answers, resolved.minNoul);
  if (parsed !== judged.length || validateAnswers(filterRequest.questions, filtered.answers).length > 0) {
    return {
      candidates: ranked,
      report: keywordReport('unavailable', {
        route: resolved.route,
        model: filtered.model,
        reason: 'invalid_response'
      })
    };
  }

  return {
    candidates: kept,
    report: {
      status: 'used',
      route: resolved.route,
      model: filtered.model || resolved.model,
      min_noul: resolved.minNoul,
      judged: judged.length,
      not_examined: Math.max(0, ranked.length - judged.length),
      rejected: judged.length - kept.length,
      usage: filtered.usage,
      duration_ms: filtered.duration_ms,
      kept: kept.length,
      trust_candidates: true,
      agent_instruction: USED_INSTRUCTION
    }
  };
}

module.exports = {
  JUDGE_CAP,
  applyJevRelevance
};
