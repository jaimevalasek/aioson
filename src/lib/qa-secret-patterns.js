'use strict';

// Stripe publishable pk_* keys are designed for client use; only sk/rk
// credentials are secret. Patterns are shared by both browser QA commands and
// by the Pentester report redactor: one list decides what a secret looks like.
//
// The in-page scans only ever test JSON.stringify(window.ENV), where a quote
// sits between every key and its colon; the generic pattern wanted the colon
// right after the key and matched none of {"DATABASE_PASSWORD":"…"},
// {"API_SECRET":"…"}, {"AUTH_TOKEN":"…"}, nor any key minted since the list
// was written (sk-proj-, sk-ant-, github_pat_, whsec_).
// Group 1, when a pattern has one, is an assignment's key and separator:
// redaction keeps it so a report still says WHAT leaked.
const SECRET_PATTERNS = Object.freeze([
  // Modern OpenAI keys embed '-'/'_' after a scope (sk-proj-, sk-svcacct-).
  // The upper-or-digit lookahead keeps kebab-case lookalikes (CSS classes
  // such as sk-this-is-not-a-key) out, as git:guard does; bounding it keeps a
  // run of "sk-sk-sk-" linear.
  { name: 'OpenAI key', regex: /\bsk-(?!ant-)(?=[A-Za-z0-9_-]{0,63}[A-Z0-9])[A-Za-z0-9_-]{20,}/ },
  { name: 'Anthropic key', regex: /\bsk-ant-(?:api|admin)\d{2}-[A-Za-z0-9_-]{20,}/ },
  { name: 'Stripe live secret key', regex: /\bsk_live_[a-zA-Z0-9]{20,}/ },
  { name: 'Stripe test secret key', regex: /\bsk_test_[a-zA-Z0-9]{20,}/ },
  { name: 'Stripe live restricted key', regex: /\brk_live_[a-zA-Z0-9]{20,}/ },
  { name: 'Stripe test restricted key', regex: /\brk_test_[a-zA-Z0-9]{20,}/ },
  { name: 'Stripe webhook secret', regex: /\bwhsec_[a-zA-Z0-9]{24,}/ },
  { name: 'AWS access key', regex: /AKIA[A-Z0-9]{16}/ },
  { name: 'AWS secret access key', regex: /(aws_?secret_?access_?key["']?\s*[:=]\s*["']?)[A-Za-z0-9/+=]{40}/i },
  { name: 'Google API key', regex: /AIzaSy[a-zA-Z0-9_-]{33}/ },
  { name: 'GitHub token', regex: /\b(?:gh[pousr]_[a-zA-Z0-9]{36}|github_pat_[a-zA-Z0-9_]{22,})/ },
  { name: 'Slack token', regex: /xox[bpa]-[a-zA-Z0-9-]+/ },
  // An anti-forgery TOKEN is page data by design; a CSRF_SECRET that signs
  // them is not, so the exclusion binds to the token alone.
  { name: 'Generic secret', regex: /((?:SECRET(?:_?KEY)?|(?<!(?:csrf|xsrf)[_-]?)TOKEN|PASSWORD|PRIVATE_KEY)["']?\s*[:=]\s*['"]?)(?!pk_(?:live|test)_)[a-zA-Z0-9_/+=-]{16,}/i }
]);

const browserSecretPatterns = () => SECRET_PATTERNS.map(({ name, regex }) => ({ name, regex: regex.source, flags: regex.flags }));

function stripPublicStripeConfig(body) {
  // Remove only a public key and its assignment, never the rest of the line:
  // a neighboring password/secret must still reach the sensitive-file heuristic.
  // The key starts at a run boundary and is bounded: tried from every offset
  // of an unbounded run it backtracked quadratically, and 80K word characters
  // held the event loop 16 s on every sensitive-file body.
  return body.replace(/(?:(?<![\w.-])["']?[\w.-]{1,128}["']?\s*[:=]\s*["']?)?\bpk_(?:live|test)_[a-zA-Z0-9]{20,}(?![a-zA-Z0-9_])["']?/g, '');
}

// Report text gets the same shapes blanked: a secret this list can detect
// must never be printed verbatim by a report that describes it.
function redactSecrets(text) {
  let out = String(text ?? '');
  for (const { regex } of SECRET_PATTERNS) {
    const all = new RegExp(regex.source, `${regex.flags}g`);
    out = out.replace(all, (match, key) => (typeof key === 'string' ? `${key}[REDACTED]` : '[REDACTED-KEY]'));
  }
  return out;
}

module.exports = { SECRET_PATTERNS, browserSecretPatterns, stripPublicStripeConfig, redactSecrets };
