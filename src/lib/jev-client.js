'use strict';
const { sanitize, sanitizeQuestions } = require('./jev-privacy');

const RETRYABLE_STATUS = new Set([429, 502, 503, 524, 529]);
const DEFAULT_TIMEOUT_MS = 45000;
const DEFAULT_RETRIES = 2;

function publicReason(reason, apiKey) {
  let text = String(reason || 'jev_failed').replace(/\s+/g, ' ').trim();
  if (apiKey && apiKey.length >= 6 && text.includes(apiKey)) {
    text = text.split(apiKey).join('[redacted]');
  }
  return sanitize(text).slice(0, 300) || 'jev_failed';
}

function errorMessage(status, data) {
  const raw = data?.error?.message || data?.detail || data?.error || `HTTP ${status}`;
  if (typeof raw === 'string') return raw;
  try {
    return JSON.stringify(raw);
  } catch {
    return `HTTP ${status}`;
  }
}

function retryDelayMs(response, attempt) {
  const raw = response?.headers?.get?.('retry-after');
  if (raw != null && String(raw).trim() !== '') {
    const seconds = Number(raw);
    if (Number.isFinite(seconds) && seconds >= 0) return Math.min(seconds * 1000, 30000);
    const date = Date.parse(raw);
    if (Number.isFinite(date)) return Math.min(Math.max(0, date - Date.now()), 30000);
  }
  return Math.min(250 * (2 ** attempt) + Math.floor(Math.random() * 100), 4000);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function requestJev({
  config,
  state,
  questions,
  fetchImpl = globalThis.fetch,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  retries = DEFAULT_RETRIES,
  sleepImpl = sleep
} = {}) {
  if (!config || config.status !== 'ready' || !config.enabled) {
    return {
      ok: false,
      status: config?.status || 'unconfigured',
      reason: config?.reason || 'jev_not_ready',
      route: config?.route || null
    };
  }
  if (typeof fetchImpl !== 'function') {
    return { ok: false, status: 'unavailable', reason: 'fetch_unavailable', route: config.route };
  }

  const body = { model: config.model, state: sanitize(state), questions: sanitizeQuestions(questions) };
  const started = Date.now();
  const deadline = started + timeoutMs;
  const maxAttempts = Math.max(1, Math.min(Number(retries) + 1 || 1, 5));
  let last = null;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const remaining = deadline - Date.now();
    if (remaining <= 0) return last || { ok: false, status: 'unavailable', reason: 'deadline_exceeded', route: config.route };
    let response;
    try {
      response = await fetchImpl(config.endpoint, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${config.apiKey}`,
          'content-type': 'application/json',
          accept: 'application/json'
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(Math.max(1, remaining))
      });
    } catch (error) {
      last = {
        ok: false,
        status: 'unavailable',
        reason: publicReason(error.message || error, config.apiKey),
        route: config.route,
        attempts: attempt + 1
      };
      if (attempt + 1 < maxAttempts) {
        await sleepImpl(Math.min(250 * (2 ** attempt), 4000, Math.max(0, deadline - Date.now())));
        continue;
      }
      return last;
    }

    let data;
    try {
      data = await response.json();
    } catch {
      // A non-JSON error body is reported through the HTTP status below.
    }

    if (!response.ok) {
      last = {
        ok: false,
        status: 'unavailable',
        reason: publicReason(errorMessage(response.status, data), config.apiKey),
        http_status: response.status,
        route: config.route,
        attempts: attempt + 1
      };
      if (RETRYABLE_STATUS.has(response.status) && attempt + 1 < maxAttempts) {
        await sleepImpl(Math.min(retryDelayMs(response, attempt), Math.max(0, deadline - Date.now())));
        continue;
      }
      return last;
    }

    if (!data || typeof data.answers !== 'object' || data.answers == null || Array.isArray(data.answers)) {
      return {
        ok: false,
        status: 'invalid_response',
        reason: 'invalid_response',
        route: config.route,
        attempts: attempt + 1
      };
    }

    return {
      ok: true,
      status: 'used',
      route: config.route,
      model: data.model || config.model,
      provider: data.provider || config.provider || null,
      answers: data.answers,
      usage: data.usage || null,
      request_id: data.id || null,
      attempts: attempt + 1,
      duration_ms: Date.now() - started
    };
  }

  return last || { ok: false, status: 'unavailable', reason: 'jev_failed', route: config.route };
}

module.exports = {
  DEFAULT_RETRIES,
  DEFAULT_TIMEOUT_MS,
  RETRYABLE_STATUS,
  publicReason,
  requestJev
};
