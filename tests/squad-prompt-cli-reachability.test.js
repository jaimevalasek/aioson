'use strict';

// Every `aioson <command>` an @squad prompt surface tells the agent to run must
// be a command the CLI actually registers. For months the package contract and
// the create task said `squad:agent:create` while only `squad:agent-create`
// existed — the one documented door into the executor generator fell through
// to "unknown command", and no test noticed because docs and cli.js were
// never compared. This pins the comparison for the whole squad surface.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const TEMPLATE = path.join(ROOT, 'template', '.aioson');

function walk(dir) {
  let out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out = out.concat(walk(full));
    else if (entry.name.endsWith('.md')) out.push(full);
  }
  return out;
}

function squadSurfaces() {
  const files = [path.join(TEMPLATE, 'agents', 'squad.md')];
  for (const f of fs.readdirSync(path.join(TEMPLATE, 'tasks'))) if (/^squad-.*\.md$/.test(f)) files.push(path.join(TEMPLATE, 'tasks', f));
  files.push(...walk(path.join(TEMPLATE, 'docs', 'squad')));
  files.push(...walk(path.join(TEMPLATE, 'skills', 'squad')));
  return files;
}

function registeredCommands() {
  const cli = fs.readFileSync(path.join(ROOT, 'src', 'cli.js'), 'utf8');
  const set = new Set();
  for (const m of cli.matchAll(/command === '([a-z0-9:-]+)'/g)) set.add(m[1]);
  return set;
}

test('every aioson command named by a squad prompt surface is registered in the CLI', () => {
  const registered = registeredCommands();
  assert.ok(registered.has('squad:validate'));
  const unknown = [];
  for (const file of squadSurfaces()) {
    const text = fs.readFileSync(file, 'utf8');
    for (const m of text.matchAll(/\baioson\s+([a-z][a-z0-9]*(?::[a-z0-9-]+)+)/g)) {
      const cmd = m[1];
      if (!registered.has(cmd)) unknown.push(`${path.relative(ROOT, file)} → aioson ${cmd}`);
    }
  }
  assert.deepEqual([...new Set(unknown)], [], `commands documented but not registered:\n${unknown.join('\n')}`);
});

test('the executor generator answers to both spellings the docs ever used', () => {
  const registered = registeredCommands();
  assert.ok(registered.has('squad:agent-create'));
  assert.ok(registered.has('squad:agent:create'));
});
