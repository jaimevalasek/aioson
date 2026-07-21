'use strict';

const CONTENT_RULES = Object.freeze([
  {
    id: 'private_key_block',
    severity: 'error',
    confidence: 'high',
    reason: 'private key material detected',
    collectMatches: collectPrivateKeyMaterialMatches
  },
  {
    id: 'aws_access_key',
    severity: 'error',
    confidence: 'high',
    reason: 'AWS access key detected',
    pattern: /\bAKIA[0-9A-Z]{16}\b/
  },
  {
    id: 'github_token',
    severity: 'error',
    confidence: 'high',
    reason: 'GitHub token detected',
    pattern: /\b(?:github_pat_[A-Za-z0-9_]{20,}|ghp_[A-Za-z0-9]{20,}|gho_[A-Za-z0-9]{20,}|ghu_[A-Za-z0-9]{20,}|ghs_[A-Za-z0-9]{20,}|ghr_[A-Za-z0-9]{20,})\b/
  },
  {
    id: 'slack_token',
    severity: 'error',
    confidence: 'high',
    reason: 'Slack token detected',
    pattern: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/
  },
  {
    id: 'google_api_key',
    severity: 'error',
    confidence: 'high',
    reason: 'Google API key detected',
    pattern: /\bAIza[0-9A-Za-z\-_]{35}\b/
  },
  {
    id: 'stripe_secret',
    severity: 'error',
    confidence: 'high',
    reason: 'Stripe secret key detected',
    pattern: /\bsk_(?:live|test)_[0-9A-Za-z]{16,}\b/
  },
  {
    id: 'openai_secret',
    severity: 'error',
    confidence: 'high',
    reason: 'OpenAI/Anthropic-style secret detected',
    // Modern provider keys embed '-'/'_' in the body (sk-proj-..., sk-ant-api03-...).
    // The uppercase-or-digit lookahead keeps lowercase kebab-case lookalikes
    // (CSS classes, identifiers such as sk-this-is-not-a-key) out of the rule.
    pattern: /\bsk-(?=[A-Za-z0-9_-]{20,}\b)(?=[A-Za-z0-9_-]*[A-Z0-9])(?:proj-|ant-)?[A-Za-z0-9_-]{20,}\b/
  },
  {
    id: 'npm_token',
    severity: 'error',
    confidence: 'high',
    reason: 'npm token detected',
    pattern: /\bnpm_[A-Za-z0-9]{20,}\b/
  }
]);

// Quotes keep function calls out of scope. Compact values keep translated
// sentences under localization keys that mention tokens out of secret heuristics.
// The key may itself be quoted so JSON objects and Python dicts
// ({"password": "..."}) are covered, not only YAML/shell-style bare keys.
const GENERIC_SECRET_ASSIGNMENT = /(['"]?)\b([A-Z0-9_]*(?:SECRET|TOKEN|API_KEY|ACCESS_KEY|PRIVATE_KEY|PASSWORD|PASSWD|CLIENT_SECRET)[A-Z0-9_]*)\1\s*[:=]\s*(['"`])([^'"`\n\r]{8,})\3/gi;
// Unquoted shell/.env assignments (`export SECRET_TOKEN=xK9...`). The value
// charset excludes dots/parens/quotes/`$` (env lookups, member access, calls,
// interpolation) and the collector additionally requires a digit+letter mix,
// so identifier references and comparisons (`token === other1`) stay out.
const GENERIC_SECRET_ASSIGNMENT_BARE = /\b([A-Z0-9_]*(?:SECRET|TOKEN|API_KEY|ACCESS_KEY|PRIVATE_KEY|PASSWORD|PASSWD|CLIENT_SECRET)[A-Z0-9_]*)\b\s*[:=]\s*(?![\s'"`])([A-Za-z0-9][A-Za-z0-9+/=_-]{11,})/gi;
const PLACEHOLDER_VALUE = /^(?:example|sample|placeholder|dummy|changeme|change-me|replace[-_]?me|your[_-]?(?:value|token|key)|test|local|localhost|xxx+)$/i;
const PLACEHOLDER_FRAGMENT = /(?:example|sample|dummy|placeholder|changeme|replace[-_]?me|your[_-]?(?:value|token|key)|localhost|local[_-]?dev)/i;
const FIXTURE_VALUE_FRAGMENT = /(?:fake|dummy|mock|fixture|example|sample|placeholder|not[-_]?real|custom|test[-_](?:only|secret|token|key|credential))/i;
const FIXTURE_SENTINEL = /aioson-secret(?:-scan)?:\s*(?:fixture|allow)(?:\s|$)/i;
const PUBLIC_IDENTIFIER = /(?:public|publishable)/i;
const TEMPLATE_INTERPOLATION_VALUE = /^\$\{[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*\}$/;
// Line breaks accepted after the header and between payload lines: real CRLF/LF,
// plus the escaped forms used when a PEM is flattened into one line — `\n`
// (.env values, shell exports), `\r\n` (escaped CRLF) and `\\n` (JS/JSON source
// strings with a double backslash). `\\r?\\?n` covers all three.
const PRIVATE_KEY_HEADER = /-----BEGIN(?: [A-Z0-9]+)? PRIVATE KEY-----/g;
const PRIVATE_KEY_PAYLOAD_LINE = /^[ \t]*([A-Za-z0-9+/=]{16,})[ \t]*(?:(?:\r?\n)|\\r?\\?n|$)/;
const UUID_VALUE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function collectPrivateKeyMaterialMatches(text) {
  const matches = [];
  let header;

  PRIVATE_KEY_HEADER.lastIndex = 0;
  while ((header = PRIVATE_KEY_HEADER.exec(text)) !== null) {
    const afterHeader = text.slice(header.index + header[0].length);
    const lineBreak = afterHeader.match(/^[ \t]*(?:\r?\n|\\r?\\?n)/);
    if (!lineBreak) continue;

    let cursor = header.index + header[0].length + lineBreak[0].length;
    let payloadLength = 0;
    while (cursor < text.length) {
      const payloadLine = text.slice(cursor).match(PRIVATE_KEY_PAYLOAD_LINE);
      if (!payloadLine) break;
      payloadLength += payloadLine[1].length;
      cursor += payloadLine[0].length;
    }

    // A marker is public syntax, not a secret. Require enough plausible Base64
    // payload to distinguish actual (even truncated) PEM material from marker
    // lists, validation messages, and explicitly redacted test samples.
    if (payloadLength >= 64) {
      matches.push({
        index: header.index,
        value: text.slice(header.index, cursor)
      });
    }
  }

  return matches;
}

function normalizeRelPath(relPath) {
  return String(relPath || '').replace(/\\/g, '/').replace(/^\.\//, '');
}

function isTestSourcePath(relPath) {
  const normalized = normalizeRelPath(relPath);
  return /(^|\/)(?:tests?|__tests__)(\/|$)/i.test(normalized)
    || /\.(?:test|spec)\.[^/]+$/i.test(normalized);
}

function isFixturePath(relPath) {
  const normalized = normalizeRelPath(relPath);
  return isTestSourcePath(normalized)
    || /(^|\/)(?:fixtures?|mocks?)(\/|$)/i.test(normalized);
}

function isSyntheticUtilityPath(relPath) {
  const normalized = normalizeRelPath(relPath);
  return /(^|\/)(?:scripts?|tools?)\/.*(?:smoke|fixture|mock|seed)[^/]*$/i.test(normalized);
}

function isLocalizationPath(relPath) {
  const normalized = normalizeRelPath(relPath);
  return /(^|\/)(?:i18n|locales?|translations?)(\/|$)/i.test(normalized);
}

function lineNumberAt(text, index) {
  return text.slice(0, Math.max(0, index)).split('\n').length;
}

function lineContextAt(text, index) {
  const lineStart = text.lastIndexOf('\n', Math.max(0, index - 1)) + 1;
  const lineEndMatch = text.indexOf('\n', index);
  const lineEnd = lineEndMatch === -1 ? text.length : lineEndMatch;
  const previousEnd = Math.max(0, lineStart - 1);
  const previousStart = text.lastIndexOf('\n', Math.max(0, previousEnd - 1)) + 1;
  return {
    line: text.slice(lineStart, lineEnd),
    previousLine: lineStart > 0 ? text.slice(previousStart, previousEnd) : ''
  };
}

function isObviouslySyntheticSecret(value) {
  const raw = String(value || '');
  const normalized = String(value || '').replace(/[^A-Za-z0-9]/g, '');
  if (normalized.length < 12) return false;
  if (UUID_VALUE.test(raw)) {
    const zeroCount = (normalized.match(/0/g) || []).length;
    if (zeroCount >= 24 || new Set(normalized.toLowerCase()).size <= 4) return true;
  }
  if (/^(.)\1{11,}$/i.test(normalized)) return true;
  if (/(?:abcdefghijklmnopqrstuvwxyz|0123456789|1234567890|abcdefabcdef|abc123abc123)/i.test(normalized)) return true;
  return /(?:fake|dummy|mock|fixture|example|placeholder|notreal)/i.test(normalized);
}

function isSelfDescribingSyntheticValue(variableName, value) {
  const raw = String(value || '');
  if (raw !== raw.toLowerCase() || !/^[a-z0-9]+(?:[-_][a-z0-9]+)+$/.test(raw)) return false;

  const variableTerms = String(variableName || '')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
  const valueTerms = raw.split(/[-_]+/).filter(Boolean);
  return valueTerms.some((term) => variableTerms.includes(term));
}

function hasExplicitFixtureEvidence(relPath, context, matchedValue) {
  if (!isFixturePath(relPath)) return false;
  if (FIXTURE_SENTINEL.test(context.line) || FIXTURE_SENTINEL.test(context.previousLine)) return true;
  return isObviouslySyntheticSecret(matchedValue);
}

function createFinding(rule, relPath, text, index) {
  return {
    type: 'content',
    severity: rule.severity,
    confidence: rule.confidence,
    id: rule.id,
    path: relPath,
    reason: rule.reason,
    line: lineNumberAt(text, index)
  };
}

function createSuppressed(finding, reason) {
  return {
    ...finding,
    severity: 'notice',
    disposition: 'suppressed',
    suppressionReason: reason
  };
}

function collectHighConfidenceFindings(relPath, text) {
  const findings = [];
  const suppressed = [];

  for (const rule of CONTENT_RULES) {
    let ruleMatches;
    if (typeof rule.collectMatches === 'function') {
      ruleMatches = rule.collectMatches(text);
    } else {
      const flags = rule.pattern.flags.includes('g') ? rule.pattern.flags : `${rule.pattern.flags}g`;
      const pattern = new RegExp(rule.pattern.source, flags);
      ruleMatches = [...text.matchAll(pattern)].map((match) => ({
        index: match.index,
        value: match[0]
      }));
    }

    for (const match of ruleMatches) {
      const finding = createFinding(rule, relPath, text, match.index);
      const context = lineContextAt(text, match.index);
      if (hasExplicitFixtureEvidence(relPath, context, match.value)) {
        suppressed.push(createSuppressed(finding, 'explicit synthetic fixture evidence'));
      } else {
        findings.push(finding);
      }
    }
  }

  return { findings, suppressed };
}

function collectGenericAssignmentFindings(relPath, text) {
  const findings = [];
  const suppressed = [];

  const evaluateCandidate = (variableName, value, index) => {
    // Localization values commonly use keys such as `login_no_token`. Ignore
    // human-readable sentences there, but keep passphrase-style assignments
    // in runtime code under inspection.
    if (/\s/.test(value) && isLocalizationPath(relPath)) return;
    if (PUBLIC_IDENTIFIER.test(variableName)) return;
    if (PLACEHOLDER_VALUE.test(value) || PLACEHOLDER_FRAGMENT.test(value)) return;

    const finding = {
      type: 'content',
      severity: 'warning',
      confidence: 'medium',
      id: 'generic_secret_assignment',
      path: relPath,
      reason: `possible secret assignment detected for ${variableName}`,
      line: lineNumberAt(text, index)
    };
    const context = lineContextAt(text, index);
    const fixtureEvidence = (isFixturePath(relPath) || isSyntheticUtilityPath(relPath))
      && (FIXTURE_VALUE_FRAGMENT.test(value)
        || isObviouslySyntheticSecret(value)
        || isSelfDescribingSyntheticValue(variableName, value)
        || TEMPLATE_INTERPOLATION_VALUE.test(value)
        || FIXTURE_SENTINEL.test(context.line)
        || FIXTURE_SENTINEL.test(context.previousLine));

    if (fixtureEvidence) {
      suppressed.push(createSuppressed(finding, 'test or fixture value is explicitly synthetic'));
    } else {
      findings.push(finding);
    }
  };

  let match;
  GENERIC_SECRET_ASSIGNMENT.lastIndex = 0;
  while ((match = GENERIC_SECRET_ASSIGNMENT.exec(text)) !== null) {
    evaluateCandidate(String(match[2] || ''), String(match[4] || '').trim(), match.index);
  }

  GENERIC_SECRET_ASSIGNMENT_BARE.lastIndex = 0;
  while ((match = GENERIC_SECRET_ASSIGNMENT_BARE.exec(text)) !== null) {
    const value = String(match[2] || '');
    // Bare values carry no quote evidence, so require a credential shape:
    // letters AND digits. Pure identifier references (requireToken, readConfig)
    // and numeric config (RETRY_COUNT = 3000) do not match this mix.
    if (!/[A-Za-z]/.test(value) || !/[0-9]/.test(value)) continue;
    evaluateCandidate(String(match[1] || ''), value, match.index);
  }

  return { findings, suppressed };
}

function collectStagedSecretFindings(relPath, text) {
  const highConfidence = collectHighConfidenceFindings(relPath, text);
  const generic = collectGenericAssignmentFindings(relPath, text);
  return {
    findings: [...highConfidence.findings, ...generic.findings],
    suppressed: [...highConfidence.suppressed, ...generic.suppressed]
  };
}

module.exports = {
  CONTENT_RULES,
  collectStagedSecretFindings,
  isFixturePath,
  isTestSourcePath,
  isLocalizationPath,
  isObviouslySyntheticSecret,
  FIXTURE_SENTINEL
};
