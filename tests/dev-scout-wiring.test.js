'use strict';

// The read-only sub-task scout belongs to @dev: its protocol lives in an
// on-demand dev doc reached from the debugging section, and the engine
// accepts `dev` as the scout's parent agent.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { PARENT_AGENT_V1 } = require('../src/sub-task-schemas');
const { MANAGED_FILES } = require('../src/constants');

const ROOT = path.resolve(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

test('dev is an accepted scout parent; legacy deyvin records still validate', () => {
  assert.ok(PARENT_AGENT_V1.includes('dev'));
  assert.ok(PARENT_AGENT_V1.includes('deyvin'), 'sub-task records written before the retirement stay valid');
});

test('the scout protocol ships as a managed dev doc, template and workspace identical', () => {
  assert.ok(MANAGED_FILES.includes('.aioson/docs/dev/scout.md'));
  assert.equal(read('.aioson/docs/dev/scout.md'), read('template/.aioson/docs/dev/scout.md'));
});

test('the scout doc carries the CLI path with dev as parent and the read-only tool whitelist', () => {
  const doc = read('template/.aioson/docs/dev/scout.md');
  assert.match(doc, /aioson scout:prep \. --json/);
  assert.match(doc, /--parent-agent=dev/);
  assert.match(doc, /scout:validate/);
  assert.match(doc, /scout:commit/);
  assert.match(doc, /Read.*Grep/);
  assert.match(doc, /no `Bash`, `Edit`, or `Write`/);
  assert.match(doc, /parent_session_excerpt/);
  assert.match(doc, /Claude Code/);
  assert.match(doc, /Codex/);
});

test('the scout doc carries the CLI-less contract and the caps', () => {
  const doc = read('template/.aioson/docs/dev/scout.md');
  assert.match(doc, /## CLI-less contract/);
  assert.match(doc, /Tools allowed: Read, Grep ONLY\. Tools forbidden: Bash, Edit, Write\./);
  assert.match(doc, /At most 3 scouts per parent session and 20 files per scope/);
});

test('dev reaches the scout from its debugging discipline', () => {
  const discipline = read('template/.aioson/docs/dev/execution-discipline.md');
  assert.match(discipline, /\.aioson\/docs\/dev\/scout\.md/);
});
