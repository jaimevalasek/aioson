'use strict';

// The coverage gate runs the inventory in scripts/testing/quality-tests.js.
// tests/quality-bench.test.js never entered that hand-kept list, so
// quality:bench counted with no test and `npm run ci` failed for eight days.
// The inventory is read from disk now; this guard fails the day it is not.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const inventory = require('../scripts/testing/quality-tests');

test('every tests/quality-*.test.js is in the coverage inventory', () => {
  const onDisk = fs.readdirSync(__dirname).filter((name) => /^quality-.+\.test\.js$/.test(name)).map((name) => `tests/${name}`);
  assert.ok(onDisk.length > 0, 'no quality test found under tests/');
  const missing = onDisk.filter((file) => !inventory.includes(file));
  assert.deepEqual(missing, [], `add to scripts/testing/quality-tests.js: ${missing.join(', ')}`);
});

test('every inventory entry is an existing test file, listed once', () => {
  assert.equal(new Set(inventory).size, inventory.length, 'duplicate inventory entries');
  for (const file of inventory) {
    assert.match(file, /^tests\/.+\.test\.js$/, file);
    assert.ok(fs.existsSync(path.join(ROOT, file)), `${file} is listed but does not exist`);
  }
});
