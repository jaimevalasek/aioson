'use strict';

// One shared inventory for local checks, coverage, CI smokes and mutation
// probes. Every tests/quality-*.test.js is read from disk, so a new quality
// test can never stay out of the coverage gate again (tests/quality-bench.test.js
// did, and `npm run ci` failed on every run from 2026-10-12 to 2026-10-20).
// EXTRA_TESTS holds any test of the quality modules named otherwise.
const fs = require('node:fs');
const path = require('node:path');

const EXTRA_TESTS = [];

const discovered = fs.readdirSync(path.join(__dirname, '..', '..', 'tests'))
  .filter((name) => /^quality-.+\.test\.js$/.test(name))
  .sort()
  .map((name) => `tests/${name}`);

module.exports = [...new Set([...discovered, ...EXTRA_TESTS])];
