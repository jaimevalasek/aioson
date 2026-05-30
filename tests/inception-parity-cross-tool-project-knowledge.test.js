'use strict';

/**
 * Cross-tool Project Knowledge - M6 inception parity test (AC-CTPK-06).
 *
 * Validates that a greenfield `aioson setup .` install exposes the disk-first
 * learnings folders, cross-harness loading directive, and import command wiring.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const { installTemplate } = require('../src/installer');

const PROJECT_KNOWLEDGE_DIRECTIVE = [
  '## Project knowledge',
  '',
  'Read `.aioson/learnings/INDEX.md` if it exists. Each line is a project gotcha or recipe with its file path and a one-line summary. Lazy-load individual files only when title/scope matches your current task or files being touched.'
].join('\n');

test('AC-CTPK-06: greenfield install ships project-learnings placeholders', async () => {
  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'aioson-ctpk-parity-'));
  await installTemplate(dir, { overwrite: true, mode: 'install' });

  for (const category of ['gotchas', 'recipes']) {
    const placeholder = path.join(dir, '.aioson', 'learnings', category, '.gitkeep');
    assert.ok(
      fs.existsSync(placeholder),
      `placeholder missing: .aioson/learnings/${category}/.gitkeep`
    );
  }
});

test('AC-CTPK-06: greenfield install ships the universal directive only to supported harness entrypoints', async () => {
  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'aioson-ctpk-parity-'));
  await installTemplate(dir, { overwrite: true, mode: 'install' });

  for (const rel of ['AGENTS.md', 'CLAUDE.md', 'OPENCODE.md']) {
    const content = fs.readFileSync(path.join(dir, rel), 'utf8');
    assert.ok(
      content.includes(PROJECT_KNOWLEDGE_DIRECTIVE),
      `${rel} missing canonical Project knowledge directive`
    );
  }

  const geminiPath = path.join(dir, '.gemini', 'GEMINI.md');
  if (fs.existsSync(geminiPath)) {
    const content = fs.readFileSync(geminiPath, 'utf8');
    assert.equal(content.includes('## Project knowledge'), false);
    assert.equal(content.includes('.aioson/learnings/INDEX.md'), false);
  }
});

test('AC-CTPK-06: template mirrors project-learnings placeholders and directive', () => {
  for (const category of ['gotchas', 'recipes']) {
    const placeholder = path.join(
      'template',
      '.aioson',
      'learnings',
      category,
      '.gitkeep'
    );
    assert.ok(
      fs.existsSync(placeholder),
      `template placeholder missing: template/.aioson/learnings/${category}/.gitkeep`
    );
  }

  for (const rel of ['AGENTS.md', 'CLAUDE.md', 'OPENCODE.md']) {
    const content = fs.readFileSync(path.join('template', rel), 'utf8');
    assert.ok(
      content.includes(PROJECT_KNOWLEDGE_DIRECTIVE),
      `template/${rel} missing canonical Project knowledge directive`
    );
  }

  const geminiTemplatePath = path.join('template', '.gemini', 'GEMINI.md');
  if (fs.existsSync(geminiTemplatePath)) {
    const content = fs.readFileSync(geminiTemplatePath, 'utf8');
    assert.equal(content.includes('## Project knowledge'), false);
    assert.equal(content.includes('.aioson/learnings/INDEX.md'), false);
  }
});

test('AC-CTPK-06: CLI exposes learning --sub=import-from-claude wiring', () => {
  const cliSource = fs.readFileSync(path.join('src', 'cli.js'), 'utf8');
  assert.ok(cliSource.includes("'learning'"), 'src/cli.js does not register learning command');
  assert.ok(cliSource.includes('options.sub'), 'src/cli.js does not dispatch learning --sub');

  const learningSource = fs.readFileSync(path.join('src', 'commands', 'learning.js'), 'utf8');
  assert.ok(
    learningSource.includes('import-from-claude'),
    'learning command does not expose import-from-claude'
  );
  assert.ok(
    learningSource.includes('handleImportFromClaude'),
    'learning command does not wire handleImportFromClaude'
  );
});
