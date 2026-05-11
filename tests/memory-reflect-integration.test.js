'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');

const execFileAsync = promisify(execFile);

const { runAgentDone } = require('../src/commands/runtime');
const { BOOTSTRAP_FILES } = require('../src/memory-reflect-engine');

async function git(dir, args) {
  await execFileAsync('git', args, { cwd: dir });
}

function makeLogger() {
  const lines = [];
  return { lines, log(l = '') { lines.push(String(l)); }, error(l = '') { lines.push(String(l)); } };
}

async function makeProject() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'aioson-reflect-integ-'));
  await git(dir, ['init', '-q']);
  await git(dir, ['config', 'user.email', 'test@example.com']);
  await git(dir, ['config', 'user.name', 'test']);
  await git(dir, ['config', 'commit.gpgsign', 'false']);

  const bootstrapDir = path.join(dir, '.aioson', 'context', 'bootstrap');
  await fs.mkdir(bootstrapDir, { recursive: true });
  for (const name of BOOTSTRAP_FILES) {
    await fs.writeFile(
      path.join(bootstrapDir, name),
      `---\nname: ${name}\ngenerated_at: 2024-01-01T00:00:00Z\n---\n# ${name}\n\nSeed.\n`,
      'utf8'
    );
  }

  await fs.writeFile(path.join(dir, 'README.md'), '# project\n', 'utf8');
  await git(dir, ['add', '-A']);
  await git(dir, ['commit', '-q', '-m', 'seed']);
  return dir;
}

async function addAndCommit(dir, relativePath, content, message) {
  const abs = path.join(dir, relativePath);
  await fs.mkdir(path.dirname(abs), { recursive: true });
  await fs.writeFile(abs, content, 'utf8');
  await git(dir, ['add', '-A']);
  await git(dir, ['commit', '-q', '-m', message]);
}

test('agent:done writes reflect-prompt.json when diff is relevant', async () => {
  const dir = await makeProject();
  await addAndCommit(dir, 'src/routes/api.js', 'module.exports = {};\n', 'feat: api route');

  await runAgentDone({
    args: [dir],
    options: {
      agent: 'dev',
      summary: 'shipped api',
      json: true,
      'git-range': 'HEAD~1..HEAD' // not actually consumed; engine reads working tree or default range
    },
    logger: makeLogger(),
    t: (key) => key
  });

  // The hook calls reflect-prepare with default git range (HEAD~3..HEAD) — in this
  // small fixture only 2 commits exist, so the fallback to `git diff HEAD` (which
  // returns nothing — everything committed) may skip. To make the test deterministic
  // we leave an unstaged file change so the working-tree diff sees it.
  await fs.writeFile(path.join(dir, 'src/routes/api.js'), 'module.exports = {newer: true};\n', 'utf8');

  await runAgentDone({
    args: [dir],
    options: { agent: 'dev', summary: 'second update', json: true },
    logger: makeLogger(),
    t: (key) => key
  });

  const manifestPath = path.join(dir, '.aioson/runtime/reflect-prompt.json');
  const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
  assert.equal(manifest.heuristic_verdict, 'relevant');
  assert.ok(manifest.targets.length > 0);
  assert.ok(manifest.changed_files.includes('src/routes/api.js'));
});

test('agent:done does NOT write reflect-prompt.json when bootstrap missing', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'aioson-reflect-nobs-'));
  await git(dir, ['init', '-q']);
  await git(dir, ['config', 'user.email', 'test@example.com']);
  await git(dir, ['config', 'user.name', 'test']);
  await git(dir, ['config', 'commit.gpgsign', 'false']);
  await fs.writeFile(path.join(dir, 'README.md'), '# x\n', 'utf8');
  await git(dir, ['add', '-A']);
  await git(dir, ['commit', '-q', '-m', 'seed']);
  await fs.writeFile(path.join(dir, 'src.js'), 'console.log(1);\n', 'utf8');

  await runAgentDone({
    args: [dir],
    options: { agent: 'dev', summary: 'no bs', json: true },
    logger: makeLogger(),
    t: (key) => key
  });

  await assert.rejects(fs.access(path.join(dir, '.aioson/runtime/reflect-prompt.json')));
});
