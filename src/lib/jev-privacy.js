'use strict';

const SECRET_KEY = /^(?:.*[_-])?(?:api[_-]?key|access[_-]?token|refresh[_-]?token|token|secret|password|passwd|senha|authorization|private[_-]?key|client[_-]?secret)$/i;

function redact(value) {
  return String(value ?? '')
    .replace(/data:[^;\s"']+;base64,[A-Za-z0-9+/=]{64,}/gi, '[embedded asset removed]')
    .replace(/-----BEGIN [^-\r\n]*PRIVATE KEY-----[\s\S]*?-----END [^-\r\n]*PRIVATE KEY-----/gi, '[private key removed]')
    .replace(/\b(?:sk-[A-Za-z0-9_-]{12,}|or-[A-Za-z0-9_-]{12,}|ts_[A-Za-z0-9_-]{12,})\b/g, '[secret removed]')
    .replace(/(Bearer\s+)[A-Za-z0-9._~+/-]{12,}/gi, '$1[secret removed]')
    .replace(/((?:[\w-]*[_-])?(?:api[_-]?key|access[_-]?token|refresh[_-]?token|token|secret|password|passwd|senha|authorization|private[_-]?key)["']?\s*[:=]\s*)("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*')/gi, '$1"[secret removed]"')
    .replace(/((?:[\w-]*[_-])?(?:api[_-]?key|token|secret|password|passwd|senha|authorization)["']?\s*:\s*)[|>][-+]?[^\S\r\n]*\r?\n(?:[ \t]+[^\r\n]*(?:\r?\n|$))+/gi, '$1[secret removed]\n')
    .replace(/((?:[\w-]*[_-])?(?:api[_-]?key|token|secret|password|passwd|senha|authorization)["']?\s*[:=]\s*)(?!["'])[^\s,;}]+/gi, '$1[secret removed]')
    .replace(/(https?:\/\/)[^\s/@:]+:[^\s/@]+@/gi, '$1[credentials removed]@');
}

// Retain keys: question IDs/choice labels are part of the API contract.
function sanitize(value) {
  if (typeof value === 'string') return redact(value);
  if (Array.isArray(value)) return value.map(sanitize);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key,
    SECRET_KEY.test(key) ? '[secret removed]' : sanitize(item)]));
}

function sanitizeQuestions(questions) {
  return Object.fromEntries(Object.entries(questions || {}).map(([id, q]) => [id, {
    ...q, instructions: sanitize(q.instructions),
    ...(q.criteria == null ? {} : { criteria: Array.isArray(q.criteria) ? q.criteria.map(sanitize)
      : Object.fromEntries(Object.entries(q.criteria).map(([label, description]) => [label, sanitize(description)])) })
  }]));
}

module.exports = { redact, sanitize, sanitizeQuestions, SECRET_KEY };
