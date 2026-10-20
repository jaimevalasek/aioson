'use strict';

// The default-tool fix reached workflow:next/status only: `agent:prompt` (the
// entry external clients use) and `workflow:heal` still said "Read AGENTS.md"
// to a Claude-only install, and a profile-less install never recorded the
// `--tool` it was given, so a Codex project told `init --tool=codex` got the
// Claude prompt. The record names the tool and filters nothing: update, install
// and setup still see the profile-less install it was.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const { installTemplate, readInstallProfile } = require('../src/installer');
const { runWorkflowHeal } = require('../src/commands/workflow-heal');
const { runWorkflowStatus } = require('../src/commands/workflow-status');
const { createTranslator } = require('../src/i18n');

const ROOT = path.join(__dirname, '..');
const BIN = path.join(ROOT, 'bin', 'aioson.js');
const CONTEXT = '---\nproject_name: "demo"\nproject_type: "api"\nprofile: "developer"\nframework: "node"\nframework_installed: true\nclassification: "MICRO"\nconversation_language: "en"\naioson_version: "1.74.0"\n---\n\n# Context\n';
const quiet = { log() {}, error() {}, warn() {} };

// The harness-variable precedence of defaultProjectTool must not leak in here.
function cleanEnv(home) {
  const env = { ...process.env, HOME: home, USERPROFILE: home };
  delete env.AIOSON_RUNNER_TOOL;
  delete env.AIOSON_TOOL;
  return env;
}
for (const name of ['AIOSON_RUNNER_TOOL', 'AIOSON_TOOL']) delete process.env[name];

async function tmp(t, prefix) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  return dir;
}

async function claudeOnlyProject(t) {
  const dir = await tmp(t, 'aioson-cycle-tool-');
  await fs.cp(path.join(ROOT, 'template', '.aioson', 'agents'), path.join(dir, '.aioson', 'agents'), { recursive: true });
  await fs.copyFile(path.join(ROOT, 'template', 'CLAUDE.md'), path.join(dir, 'CLAUDE.md'));
  await fs.writeFile(path.join(dir, '.aioson', 'install.json'), JSON.stringify({ install_profile: { tools: ['claude'] } }), 'utf8');
  await fs.mkdir(path.join(dir, '.aioson', 'context'), { recursive: true });
  await fs.writeFile(path.join(dir, '.aioson', 'context', 'project.context.md'), CONTEXT, 'utf8');
  return dir;
}

test('agent:prompt without --tool speaks to a Claude-only install as claude', async (t) => {
  const dir = await claudeOnlyProject(t);
  const r = spawnSync(process.execPath, [BIN, 'agent:prompt', 'qa', dir, '--json'], { encoding: 'utf8', cwd: dir, env: cleanEnv(path.join(dir, '.home')) });
  assert.equal(r.status, 0, r.stderr || r.stdout);
  const result = JSON.parse(r.stdout.slice(r.stdout.indexOf('{')));
  assert.equal(result.tool, 'claude');
  assert.doesNotMatch(result.prompt, /Read AGENTS\.md/);
});

test('workflow:heal without --tool speaks to a Claude-only install as claude', async (t) => {
  const dir = await claudeOnlyProject(t);
  await fs.writeFile(path.join(dir, '.aioson', 'context', 'workflow.errors.jsonl'), `${JSON.stringify({ ts: new Date().toISOString(), stage: 'dev', gateType: 'technical', error: 'tsc failed' })}\n`, 'utf8');
  const result = await runWorkflowHeal({ args: [dir], options: { stage: 'dev' }, logger: quiet, t: createTranslator('en').t });
  assert.equal(result.ok, true, result.reason);
  assert.doesNotMatch(result.prompt, /Read AGENTS\.md/);
  assert.match(result.prompt, /^Read \.aioson\/agents\/dev\.md and execute @dev\./);
});

test('a profile-less install records the --tool it was given, and that record filters nothing', async (t) => {
  const dir = await tmp(t, 'aioson-cycle-install-');
  await installTemplate(dir, { overwrite: true, mode: 'init', installProfile: null, tool: 'codex' });
  const install = JSON.parse(await fs.readFile(path.join(dir, '.aioson', 'install.json'), 'utf8'));
  assert.deepEqual(install.install_profile.tools, ['codex']);
  assert.equal(await readInstallProfile(dir), null, 'update, install and setup still see a profile-less install');
  for (const gateway of ['CLAUDE.md', 'AGENTS.md', 'OPENCODE.md']) {
    await fs.access(path.join(dir, gateway));
  }

  await fs.writeFile(path.join(dir, '.aioson', 'context', 'project.context.md'), CONTEXT, 'utf8');
  const status = await runWorkflowStatus({ args: [dir], options: {}, logger: quiet });
  assert.equal(status.tool, 'codex');

  // An update (no --tool) keeps the record.
  await installTemplate(dir, { overwrite: true, mode: 'update', installProfile: await readInstallProfile(dir) });
  assert.deepEqual(JSON.parse(await fs.readFile(path.join(dir, '.aioson', 'install.json'), 'utf8')).install_profile.tools, ['codex']);
});

test('a real profile is recorded as given, and no --tool keeps a profile-less install profile-less', async (t) => {
  const all = { tools: ['claude', 'codex', 'opencode'], uses: ['development', 'squads'], design: 'all', locale: 'en' };
  const withProfile = await tmp(t, 'aioson-cycle-install-all-');
  await installTemplate(withProfile, { overwrite: true, mode: 'init', installProfile: all, tool: 'codex' });
  assert.deepEqual(await readInstallProfile(withProfile), all);

  const bare = await tmp(t, 'aioson-cycle-install-bare-');
  await installTemplate(bare, { overwrite: true, mode: 'init', installProfile: null });
  assert.equal(JSON.parse(await fs.readFile(path.join(bare, '.aioson', 'install.json'), 'utf8')).install_profile, null);
});

// Needs src/commands/init.js to hand `tool: options.tool` to installTemplate.
test('init --tool=codex --no-interactive records codex, and workflow:status then says codex', async (t) => {
  const parent = await tmp(t, 'aioson-cycle-init-');
  const env = cleanEnv(path.join(parent, '.home'));
  const init = spawnSync(process.execPath, [BIN, 'init', 'app', '--tool=codex', '--no-interactive', '--no-hooks'], { encoding: 'utf8', cwd: parent, env });
  assert.equal(init.status, 0, init.stderr || init.stdout);
  const dir = path.join(parent, 'app');
  const install = JSON.parse(await fs.readFile(path.join(dir, '.aioson', 'install.json'), 'utf8'));
  assert.deepEqual(install.install_profile && install.install_profile.tools, ['codex']);

  await fs.writeFile(path.join(dir, '.aioson', 'context', 'project.context.md'), CONTEXT, 'utf8');
  const status = spawnSync(process.execPath, [BIN, 'workflow:status', dir, '--json'], { encoding: 'utf8', cwd: dir, env });
  assert.equal(status.status, 0, status.stderr || status.stdout);
  assert.equal(JSON.parse(status.stdout.slice(status.stdout.indexOf('{'))).tool, 'codex');
});
