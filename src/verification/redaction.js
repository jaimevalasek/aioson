'use strict';

const SECRET_KEY_RE = /\b([A-Za-z0-9_.-]*(?:token|secret|password|passwd|pwd|api[_-]?key|private[_-]?key|access[_-]?key|client[_-]?secret|auth)[A-Za-z0-9_.-]*)(\s*[:=]\s*)(["']?)([^"'\s,;}]+)/gi;
const BEARER_RE = /\bBearer\s+[A-Za-z0-9._~+/=-]{12,}/g;
const COMMON_SECRET_RE = /\b(?:sk-[A-Za-z0-9_-]{12,}|sk_(?:live|test)_[A-Za-z0-9_-]{12,}|pk_[A-Za-z0-9_-]{12,}|ghp_[A-Za-z0-9_]{20,}|github_pat_[A-Za-z0-9_]{20,}|glpat-[A-Za-z0-9_-]{20,}|xox[baprs]-[A-Za-z0-9-]{10,}|AKIA[0-9A-Z]{16})\b/g;
const PEM_BLOCK_RE = /-----BEGIN [^-]+-----[\s\S]*?-----END [^-]+-----/g;
const BASIC_AUTH_URL_RE = /(https?:\/\/)([^/\s:@]+):([^/\s@]+)@/g;

function createCounter() {
  return {
    secret_assignments: 0,
    bearer_tokens: 0,
    common_tokens: 0,
    pem_blocks: 0,
    credential_urls: 0
  };
}

function redactText(input, counter = createCounter()) {
  let text = String(input || '');
  text = text.replace(PEM_BLOCK_RE, () => {
    counter.pem_blocks += 1;
    return '[REDACTED_PEM_BLOCK]';
  });
  text = text.replace(BASIC_AUTH_URL_RE, (_match, protocol) => {
    counter.credential_urls += 1;
    return `${protocol}[REDACTED_CREDENTIALS]@`;
  });
  text = text.replace(BEARER_RE, () => {
    counter.bearer_tokens += 1;
    return 'Bearer [REDACTED_SECRET]';
  });
  text = text.replace(SECRET_KEY_RE, (_match, key, sep, quote) => {
    counter.secret_assignments += 1;
    return `${key}${sep}${quote}[REDACTED_SECRET]`;
  });
  text = text.replace(COMMON_SECRET_RE, () => {
    counter.common_tokens += 1;
    return '[REDACTED_SECRET]';
  });
  return text;
}

function isSecretKey(key) {
  return /(?:token|secret|password|passwd|pwd|api[_-]?key|private[_-]?key|access[_-]?key|client[_-]?secret|auth)/i.test(String(key || ''));
}

function redactJson(value, counter = createCounter()) {
  if (Array.isArray(value)) {
    return value.map((item) => redactJson(item, counter));
  }
  if (value && typeof value === 'object') {
    const output = {};
    for (const [key, item] of Object.entries(value)) {
      if (isSecretKey(key)) {
        counter.secret_assignments += 1;
        output[key] = '[REDACTED_SECRET]';
      } else {
        output[key] = redactJson(item, counter);
      }
    }
    return output;
  }
  if (typeof value === 'string') return redactText(value, counter);
  return value;
}

function totalRedactions(counter) {
  return Object.values(counter || {}).reduce((sum, value) => sum + Number(value || 0), 0);
}

module.exports = {
  createCounter,
  redactText,
  redactJson,
  totalRedactions
};
