'use strict';

const EXIT_CODES = Object.freeze({
  PASS: 0,
  BLOCKING: 10,
  INCONCLUSIVE: 11,
  BAD_INPUT: 12,
  CONTRACT_VIOLATION: 13
});

const SEVERITY_RANK = Object.freeze({
  critical: 5,
  high: 4,
  medium: 3,
  low: 2,
  info: 1,
  advisory: 0,
  inconclusive: -1
});

function isBlockingSeverity(severity) {
  return severity === 'critical' || severity === 'high';
}

function resolveExitCode({ classification, findings, hasInconclusive, strict }) {
  const cls = String(classification || 'MICRO').toUpperCase();
  const blocking = findings.some(
    (f) => f.status === 'open' && isBlockingSeverity(f.severity)
  );

  if (strict && findings.some((f) => f.status === 'open')) {
    return EXIT_CODES.BLOCKING;
  }

  if (cls === 'MEDIUM' && blocking) {
    return EXIT_CODES.BLOCKING;
  }

  if (hasInconclusive) {
    return EXIT_CODES.INCONCLUSIVE;
  }

  return EXIT_CODES.PASS;
}

module.exports = {
  EXIT_CODES,
  SEVERITY_RANK,
  isBlockingSeverity,
  resolveExitCode
};
