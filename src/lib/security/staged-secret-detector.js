'use strict';

const CONTENT_RULES = Object.freeze([
  {
    id: 'private_key_block',
    severity: 'error',
    confidence: 'high',
    reason: 'private key material detected',
    pattern: /-----BEGIN(?: [A-Z0-9]+)? PRIVATE KEY-----/m
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
    reason: 'OpenAI-style secret detected',
    pattern: /\bsk-[A-Za-z0-9]{20,}\b/
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
const GENERIC_SECRET_ASSIGNMENT = /\b([A-Z0-9_]*(?:SECRET|TOKEN|API_KEY|ACCESS_KEY|PRIVATE_KEY|PASSWORD|PASSWD|CLIENT_SECRET)[A-Z0-9_]*)\b\s*[:=]\s*(['"`])([^'"`\n\r]{8,})\2/gi;
const PLACEHOLDER_VALUE = /^(?:example|sample|placeholder|dummy|changeme|change-me|replace[-_]?me|your[_-]?(?:value|token|key)|test|local|localhost|xxx+)$/i;
const PLACEHOLDER_FRAGMENT = /(?:example|sample|dummy|placeholder|changeme|replace[-_]?me|your[_-]?(?:value|token|key)|localhost|local[_-]?dev)/i;
const FIXTURE_VALUE_FRAGMENT = /(?:fake|dummy|mock|fixture|example|sample|placeholder|not[-_]?real|custom|test[-_](?:only|secret|token|key|credential))/i;
const FIXTURE_SENTINEL = /aioson-secret(?:-scan)?:\s*(?:fixture|allow)(?:\s|$)/i;
const PUBLIC_IDENTIFIER = /(?:public|publishable)/i;
const TEMPLATE_INTERPOLATION_VALUE = /^\$\{[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*\}$/;

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
  const normalized = String(value || '').replace(/[^A-Za-z0-9]/g, '');
  if (normalized.length < 12) return false;
  if (/^(.)\1{11,}$/i.test(normalized)) return true;
  if (/(?:abcdefghijklmnopqrstuvwxyz|0123456789|1234567890|abcdefabcdef|abc123abc123)/i.test(normalized)) return true;
  return /(?:fake|dummy|mock|fixture|example|placeholder|notreal)/i.test(normalized);
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
    const flags = rule.pattern.flags.includes('g') ? rule.pattern.flags : `${rule.pattern.flags}g`;
    const pattern = new RegExp(rule.pattern.source, flags);
    let match;
    while ((match = pattern.exec(text)) !== null) {
      const finding = createFinding(rule, relPath, text, match.index);
      const context = lineContextAt(text, match.index);
      if (hasExplicitFixtureEvidence(relPath, context, match[0])) {
        suppressed.push(createSuppressed(finding, 'explicit synthetic fixture evidence'));
      } else {
        findings.push(finding);
      }
      if (match[0].length === 0) pattern.lastIndex += 1;
    }
  }

  return { findings, suppressed };
}

function collectGenericAssignmentFindings(relPath, text) {
  const findings = [];
  const suppressed = [];
  let match;

  GENERIC_SECRET_ASSIGNMENT.lastIndex = 0;
  while ((match = GENERIC_SECRET_ASSIGNMENT.exec(text)) !== null) {
    const variableName = String(match[1] || '');
    const value = String(match[3] || '').trim();

    // Localization values commonly use keys such as `login_no_token`. Ignore
    // human-readable sentences there, but keep passphrase-style assignments
    // in runtime code under inspection.
    if (/\s/.test(value) && isLocalizationPath(relPath)) continue;
    if (PUBLIC_IDENTIFIER.test(variableName)) continue;
    if (PLACEHOLDER_VALUE.test(value) || PLACEHOLDER_FRAGMENT.test(value)) continue;

    const finding = {
      type: 'content',
      severity: 'warning',
      confidence: 'medium',
      id: 'generic_secret_assignment',
      path: relPath,
      reason: `possible secret assignment detected for ${variableName}`,
      line: lineNumberAt(text, match.index)
    };
    const context = lineContextAt(text, match.index);
    const fixtureEvidence = isFixturePath(relPath)
      && (FIXTURE_VALUE_FRAGMENT.test(value)
        || isObviouslySyntheticSecret(value)
        || TEMPLATE_INTERPOLATION_VALUE.test(value)
        || FIXTURE_SENTINEL.test(context.line)
        || FIXTURE_SENTINEL.test(context.previousLine));

    if (fixtureEvidence) {
      suppressed.push(createSuppressed(finding, 'test or fixture value is explicitly synthetic'));
    } else {
      findings.push(finding);
    }
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
