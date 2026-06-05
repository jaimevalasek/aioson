'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');

function collectMarkdownFiles(dirPath, found = []) {
  for (const entry of fs.readdirSync(dirPath, { withFileTypes: true })) {
    const nextPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      collectMarkdownFiles(nextPath, found);
    } else if (entry.isFile() && entry.name.endsWith('.md')) {
      found.push(nextPath);
    }
  }
  return found;
}

function collectKnownCommands() {
  const cli = fs.readFileSync(path.join(ROOT, 'src/cli.js'), 'utf8');
  const known = new Set();

  for (const match of cli.matchAll(/command\s*={2,3}\s*'([^']+)'/g)) {
    known.add(match[1]);
  }
  for (const match of cli.matchAll(/'([a-z][a-z0-9-]*(?::[a-z0-9-]+)+)'/g)) {
    known.add(match[1]);
  }
  for (const match of cli.matchAll(/'([a-z][a-z0-9-]+-[a-z0-9-]+(?:-[a-z0-9-]+)*)'/g)) {
    known.add(match[1]);
  }

  return known;
}

function isKnownCommand(command, known) {
  return known.has(command) || known.has(command.replace(/:/g, '-'));
}

function collectAgentCommandReferences() {
  const refs = [];
  const commandRe = /(?:^|[\s`>])(?:npx\s+|\.\/node_modules\/\.bin\/)?aioson\s+([a-z][a-z0-9:-]*)/g;

  for (const filePath of collectMarkdownFiles(path.join(ROOT, 'template/.aioson/agents'))) {
    const relPath = path.relative(ROOT, filePath).replace(/\\/g, '/');
    const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/);
    for (let index = 0; index < lines.length; index += 1) {
      commandRe.lastIndex = 0;
      let match;
      while ((match = commandRe.exec(lines[index]))) {
        refs.push({
          command: match[1],
          path: relPath,
          line: index + 1,
          text: lines[index].trim()
        });
      }
    }
  }

  return refs;
}

test('canonical agent prompts only reference registered aioson commands', () => {
  const known = collectKnownCommands();
  const unknown = collectAgentCommandReferences()
    .filter((ref) => !isKnownCommand(ref.command, known))
    .map((ref) => `${ref.path}:${ref.line} ${ref.command} :: ${ref.text}`);

  assert.deepEqual(unknown, []);
});

test('workspace agent prompts match canonical template prompts semantically', () => {
  const templateDir = path.join(ROOT, 'template/.aioson/agents');
  const workspaceDir = path.join(ROOT, '.aioson/agents');
  const templateFiles = fs.readdirSync(templateDir).filter((name) => name.endsWith('.md')).sort();
  const workspaceFiles = fs.readdirSync(workspaceDir).filter((name) => name.endsWith('.md')).sort();

  assert.deepEqual(workspaceFiles, templateFiles);

  for (const file of templateFiles) {
    const canonical = fs.readFileSync(path.join(templateDir, file), 'utf8').replace(/\r\n/g, '\n');
    const workspace = fs.readFileSync(path.join(workspaceDir, file), 'utf8').replace(/\r\n/g, '\n');
    assert.equal(workspace, canonical, `${file} drifted from template`);
  }
});
