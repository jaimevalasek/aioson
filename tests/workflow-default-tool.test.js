'use strict';

// workflow:next and workflow:status defaulted --tool to codex: in a Claude
// install the @qa activation said "Read AGENTS.md and execute @qa" and the
// status suggestion printed --tool=codex. Without --tool the default is now,
// first match wins: the harness named by AIOSON_RUNNER_TOOL / AIOSON_TOOL (the
// variables model-delegation's detectHost reads, in its order), the installer's
// record when it names exactly one tool, the gateway file present, codex.

const test = require('node:test');
const assert = require('node:assert/strict');
const fsSync = require('node:fs');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const TEST_HOME = fsSync.mkdtempSync(path.join(os.tmpdir(), 'aioson-default-tool-home-'));
process.env.HOME = TEST_HOME;
process.env.USERPROFILE = TEST_HOME;
// The in-process calls below read process.env: a harness variable inherited
// from the shell running the suite must not decide their default.
delete process.env.AIOSON_RUNNER_TOOL;
delete process.env.AIOSON_TOOL;

const { defaultProjectTool } = require('../src/lib/project-tool');
const { runWorkflowStatus } = require('../src/commands/workflow-status');

async function project(files) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'aioson-default-tool-'));
  for (const [rel, content] of Object.entries(files)) {
    await fs.mkdir(path.dirname(path.join(dir, rel)), { recursive: true });
    await fs.writeFile(path.join(dir, rel), content, 'utf8');
  }
  return dir;
}

const CONTEXT = '---\nproject_name: "demo"\nproject_type: "api"\nprofile: "developer"\nframework: "node"\nframework_installed: true\nclassification: "MICRO"\nconversation_language: "en"\naioson_version: "1.73.0"\n---\n\n# Context\n';
const GATEWAYS = { 'CLAUDE.md': '# c', 'AGENTS.md': '# a', 'OPENCODE.md': '# o' };
const installed = (tools) => ({ '.aioson/install.json': JSON.stringify({ install_profile: { tools } }) });

test('the gateway file the project installed decides the default tool', async () => {
  assert.equal(defaultProjectTool(await project(GATEWAYS)), 'claude');
  assert.equal(defaultProjectTool(await project({ 'AGENTS.md': '# a' })), 'codex');
  assert.equal(defaultProjectTool(await project({ 'OPENCODE.md': '# o' })), 'opencode');
  assert.equal(defaultProjectTool(await project({ 'CLAUDE.md': '# c', ...installed(['opencode']) })), 'opencode', 'the installer record wins');
  assert.equal(defaultProjectTool(await project({})), 'codex', 'a project with no gateway keeps the legacy default');
});

test('workflow:status without --tool speaks to a Claude install as claude', async () => {
  const dir = await project({ 'CLAUDE.md': '# c', 'AGENTS.md': '# a', '.aioson/context/project.context.md': CONTEXT });
  const result = await runWorkflowStatus({ args: [dir], options: {}, logger: { log() {}, error() {} } });
  assert.equal(result.tool, 'claude');
  assert.match(result.suggestion.command, /--tool=claude/);
});

test('the harness named in the env wins over an install made for every tool', async () => {
  // `aioson init --all` records all three tools and installs all three gateways.
  const dir = await project({ ...GATEWAYS, ...installed(['claude', 'codex', 'opencode']) });
  assert.equal(defaultProjectTool(dir, { AIOSON_TOOL: 'codex' }), 'codex');
  assert.equal(defaultProjectTool(dir, { AIOSON_RUNNER_TOOL: 'opencode', AIOSON_TOOL: 'codex' }), 'opencode', 'AIOSON_RUNNER_TOOL first, as detectHost reads them');
  assert.equal(defaultProjectTool(dir, { AIOSON_TOOL: ' Codex ' }), 'codex', 'trimmed and lowercased, as detectHost does');
  assert.equal(defaultProjectTool(dir, { AIOSON_TOOL: 'kimi' }), 'claude', 'a host that is no project tool falls through to the gateway file');
  assert.equal(defaultProjectTool(dir, {}), 'claude', 'several recorded tools name none: the gateway file decides');
});

test('a single recorded tool decides; several recorded tools do not', async () => {
  const both = { 'CLAUDE.md': '# c', 'AGENTS.md': '# a' };
  assert.equal(defaultProjectTool(await project({ ...both, ...installed(['codex']) }), {}), 'codex');
  assert.equal(defaultProjectTool(await project({ ...both, ...installed(['codex', 'codex']) }), {}), 'codex', 'a repeated tool is still one tool');
  assert.equal(defaultProjectTool(await project({ ...both, ...installed(['codex', 'cursor']) }), {}), 'codex', 'only project tools count');
  assert.equal(defaultProjectTool(await project({ ...both, ...installed(['codex', 'claude']) }), {}), 'claude', 'two recorded tools leave it to the gateway file');
});

test('workflow:status in a Codex session of an init --all project suggests codex', async (t) => {
  const dir = await project({ ...GATEWAYS, ...installed(['claude', 'codex', 'opencode']), '.aioson/context/project.context.md': CONTEXT });
  process.env.AIOSON_TOOL = 'codex';
  t.after(() => { delete process.env.AIOSON_TOOL; });
  const result = await runWorkflowStatus({ args: [dir], options: {}, logger: { log() {}, error() {} } });
  assert.equal(result.tool, 'codex');
  assert.match(result.suggestion.command, /--tool=codex/);
});
