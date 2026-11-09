'use strict';

// template/ is the source of truth and the repository tracks the workspace
// copies of its docs and agents. A commit that edits one tree and forgets the
// other leaves this repository running an older procedure than the one it
// ships: a routed doc stayed one release behind until a byte scan found it.
// Every workspace copy that exists must equal its template, whichever doc it is.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { ROOT } = require('./helpers/workspace-mirror');

const MIRRORED = ['.aioson/docs', '.aioson/agents'];

function filesUnder(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? filesUnder(full) : [full];
  });
}

const text = (file) => fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n');

test('every workspace copy of a template doc or agent equals its template', () => {
  const stale = [];
  let compared = 0;
  for (const tree of MIRRORED) {
    const templateTree = path.join(ROOT, 'template', tree);
    for (const file of filesUnder(templateTree)) {
      const relative = path.join(tree, path.relative(templateTree, file));
      const copy = path.join(ROOT, relative);
      if (!fs.existsSync(copy)) continue;
      compared += 1;
      if (text(copy) !== text(file)) stale.push(relative.split(path.sep).join('/'));
    }
  }
  assert.ok(compared > 100, `the scan found the mirrored trees (${compared} files compared)`);
  assert.deepEqual(stale, [], 'copy the template over each of these (template/ first, then the workspace copy)');
});
