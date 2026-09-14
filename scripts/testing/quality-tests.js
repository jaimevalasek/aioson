'use strict';

// One shared inventory for local checks, coverage, CI smokes and mutation probes.
module.exports = [
  'tests/quality-audit.test.js',
  'tests/quality-audit-regressions.test.js',
  'tests/quality-pipeline.test.js',
  'tests/quality-evals.test.js',
  'tests/quality-agent.test.js'
];
