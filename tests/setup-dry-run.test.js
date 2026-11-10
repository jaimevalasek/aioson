'use strict';

// `aioson setup` end to end, without a terminal: --dry-run writes nothing and
// says what would change, the saved install profile is honored, and the
// closing hint names the tool the project was installed for.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const fsSync = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createTranslator } = require('../src/i18n');
const { runSetup } = require('../src/commands/setup');
const { installTemplate } = require('../src/installer');

const { t } = createTranslator('en');
const DEV_PROFILE = { tools: ['claude'], uses: ['development'], design: 'none', locale: 'en' };

async function makeTempDir() {
  return fs.mkdtemp(path.join(os.tmpdir(), 'aioson-setup-dry-run-'));
}

function collectLogger() {
  const lines = [];
  return { lines, log: (line) => lines.push(String(line)), error: (line) => lines.push(String(line)) };
}

function backupFolders(dir) {
  try {
    return fsSync.readdirSync(path.join(dir, '.aioson', 'backups'));
  } catch {
    return [];
  }
}

// The closing hint falls back to the harness variables first; a test run
// launched from inside a harness must not leak its own tool into the answer.
async function withoutHarnessTool(fn) {
  const saved = { runner: process.env.AIOSON_RUNNER_TOOL, tool: process.env.AIOSON_TOOL };
  delete process.env.AIOSON_RUNNER_TOOL;
  delete process.env.AIOSON_TOOL;
  try {
    return await fn();
  } finally {
    if (saved.runner !== undefined) process.env.AIOSON_RUNNER_TOOL = saved.runner;
    if (saved.tool !== undefined) process.env.AIOSON_TOOL = saved.tool;
  }
}

test('setup --dry-run keeps the context file and agent prompts and reports what would change', async () => {
  const dir = await makeTempDir();
  await runSetup({ args: [dir], options: { defaults: true, 'project-name': 'orig' }, logger: collectLogger(), t });

  const devPath = path.join(dir, '.aioson', 'agents', 'dev.md');
  const contextPath = path.join(dir, '.aioson', 'context', 'project.context.md');
  await fs.appendFile(devPath, '\n## MARKER-AGENT\n');
  await fs.appendFile(contextPath, '\n## MARKER-CONTEXT\n');
  const devBefore = await fs.readFile(devPath, 'utf8');
  const contextBefore = await fs.readFile(contextPath, 'utf8');
  const foldersBefore = backupFolders(dir);

  const logger = collectLogger();
  const result = await runSetup({
    args: [dir],
    options: { defaults: true, 'dry-run': true, 'project-name': 'outro' },
    logger,
    t
  });

  assert.equal(await fs.readFile(devPath, 'utf8'), devBefore, 'agent prompt untouched');
  assert.equal(await fs.readFile(contextPath, 'utf8'), contextBefore, 'context file untouched');
  assert.deepEqual(backupFolders(dir), foldersBefore, 'no backup folder created');

  assert.equal(result.dryRun, true);
  assert.equal(result.contextResult.contextWrite.action, 'updated');
  assert.equal(result.contextResult.data.projectName, 'outro');
  assert.deepEqual(result.contextResult.localeApplyResult.written.map((entry) => entry.target), ['.aioson/agents/dev.md']);

  const output = logger.lines.join('\n');
  assert.match(output, /\[dry-run\] Context file would be written:/);
  assert.match(output, /project_name: "orig" -> "outro"/);
  assert.match(output, /Its body text would change too/);
  assert.match(output, /\[dry-run\] 1 edited agent prompt\(s\) would be backed up to \.aioson\/backups\/[^ ]+\/\.aioson\/agents first: dev/);
  assert.match(output, /\[dry-run\] Nothing was written to /);
  assert.equal(output.includes('Setup complete.'), false);
});

test('setup without a terminal honors the saved install profile', async () => {
  const dir = await makeTempDir();
  await fs.mkdir(path.join(dir, '.aioson'), { recursive: true });
  await fs.writeFile(
    path.join(dir, '.aioson', 'install.json'),
    `${JSON.stringify({ install_profile: DEV_PROFILE }, null, 2)}\n`,
    'utf8'
  );

  const result = await runSetup({ args: [dir], options: { defaults: true }, logger: collectLogger(), t });

  assert.deepEqual(result.installProfile, DEV_PROFILE);
  for (const rel of ['AGENTS.md', 'OPENCODE.md', '.aioson/agents/squad.md', '.aioson/agents/orache.md', '.aioson/docs/squad']) {
    assert.equal(fsSync.existsSync(path.join(dir, rel)), false, `${rel} is outside the saved profile`);
  }
  assert.equal(fsSync.existsSync(path.join(dir, 'CLAUDE.md')), true);
  assert.equal(fsSync.existsSync(path.join(dir, '.aioson/agents/dev.md')), true);
  const skippedAgents = result.contextResult.localeApplyResult.skipped
    .filter((entry) => entry.reason === 'not-in-profile')
    .map((entry) => entry.target);
  assert.ok(skippedAgents.includes('.aioson/agents/squad.md'));
});

test('setup suggests the agent prompt for the tool the project was installed with', async () => {
  const dir = await makeTempDir();
  await installTemplate(dir, { mode: 'install', tool: 'claude' });

  const logger = collectLogger();
  await withoutHarnessTool(() => runSetup({ args: [dir], options: { defaults: true }, logger, t }));

  const hint = logger.lines.find((line) => line.includes('agent:prompt setup'));
  assert.ok(hint, 'closing hint printed');
  assert.match(hint, /--tool=claude/);
});
