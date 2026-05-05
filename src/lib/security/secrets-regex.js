'use strict';

const ALLOW_MARKERS = Object.freeze([
  'EXAMPLE',
  'example',
  'dummy',
  'DUMMY',
  'placeholder',
  'PLACEHOLDER',
  'your-key-here',
  'YOUR_KEY_HERE',
  'xxxxxxxx',
  'XXXXXXXX',
  '<replace',
  'REPLACE_ME',
  'changeme',
  'CHANGEME'
]);

const ALLOW_PATH_SUFFIXES = Object.freeze([
  '.env.example',
  '.env.sample',
  '.env.template'
]);

const PATTERNS = Object.freeze([
  {
    id: 'aws-access-key',
    name: 'AWS access key',
    pattern: /\bAKIA[0-9A-Z]{16}\b/g,
    severity: 'critical',
    control: 'SEC-SBD-05'
  },
  {
    id: 'stripe-live-key',
    name: 'Stripe live secret key',
    pattern: /\bsk_live_[A-Za-z0-9]{24,}\b/g,
    severity: 'critical',
    control: 'SEC-SBD-05'
  },
  {
    id: 'openai-api-key',
    name: 'OpenAI API key',
    pattern: /\bsk-[A-Za-z0-9]{20,}\b/g,
    severity: 'high',
    control: 'SEC-SBD-05'
  },
  {
    id: 'anthropic-api-key',
    name: 'Anthropic API key',
    pattern: /\bsk-ant-[A-Za-z0-9_-]{20,}\b/g,
    severity: 'high',
    control: 'SEC-SBD-05'
  },
  {
    id: 'rsa-private-key',
    name: 'RSA / SSH private key block',
    pattern: /-----BEGIN (?:RSA |OPENSSH |DSA |EC |PGP )?PRIVATE KEY-----/g,
    severity: 'critical',
    control: 'SEC-SBD-05'
  },
  {
    id: 'generic-password-assignment',
    name: 'Inline password assignment',
    pattern: /\b(?:password|passwd|pwd)\s*[:=]\s*['"][^'"\s]{8,}['"]/gi,
    severity: 'high',
    control: 'SEC-SBD-05'
  },
  {
    id: 'generic-token-assignment',
    name: 'Inline token / api_key assignment with long value',
    pattern: /\b(?:api[_-]?key|access[_-]?token|secret[_-]?token|auth[_-]?token)\s*[:=]\s*['"][A-Za-z0-9._-]{20,}['"]/gi,
    severity: 'high',
    control: 'SEC-SBD-05'
  }
]);

const FORBIDDEN_FILES = Object.freeze([
  '.env',
  '.env.local',
  '.env.production',
  '.env.staging',
  'id_rsa',
  'id_ed25519',
  'id_dsa',
  'id_ecdsa'
]);

function isAllowedByMarkers(line) {
  for (const marker of ALLOW_MARKERS) {
    if (line.indexOf(marker) !== -1) {
      return true;
    }
  }
  return false;
}

function isAllowedByPath(filePath) {
  const lower = filePath.toLowerCase();
  for (const suffix of ALLOW_PATH_SUFFIXES) {
    if (lower.endsWith(suffix)) {
      return true;
    }
  }
  return false;
}

module.exports = {
  PATTERNS,
  FORBIDDEN_FILES,
  ALLOW_MARKERS,
  ALLOW_PATH_SUFFIXES,
  isAllowedByMarkers,
  isAllowedByPath
};
