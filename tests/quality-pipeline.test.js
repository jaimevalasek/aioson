'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { classifyMessages, fingerprint } = require('../scripts/testing/lint');

test('lint baseline tolerates line movement but rejects another occurrence', () => {
  const message = { ruleId: 'no-unused-vars', message: "'unused' is assigned a value but never used.", line: 1 };
  const key = fingerprint('src/a.js', message);
  const results = [{ filePath: path.resolve('src/a.js'), messages: [{ ...message, line: 2 }, { ...message, line: 9 }] }];
  const result = classifyMessages(results, { counts: { [key]: 1 } }, process.cwd());
  assert.equal(result.existing, 1);
  assert.equal(result.findings.length, 1);
  assert.equal(result.ok, false);
});

test('undefined identifiers and parse errors cannot hide in a lint baseline', () => {
  for (const message of [{ ruleId: 'no-undef', message: 'missing', line: 1 }, { fatal: true, message: 'parse error', line: 1 }]) {
    const key = fingerprint('src/a.js', message);
    const result = classifyMessages([{ filePath: path.resolve('src/a.js'), messages: [message] }], { counts: { [key]: 99 } }, process.cwd());
    assert.equal(result.ok, false);
  }
});
