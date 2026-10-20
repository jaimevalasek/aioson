'use strict';

// workflow:next and workflow:status defaulted --tool to codex: in a Claude
// install the @qa activation said "Read AGENTS.md and execute @qa" and the
// status suggestion printed --tool=codex. Without --tool, the project's own
// install now decides: the installer's record, else the gateway file present.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

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

test('the gateway file the project installed decides the default tool', async () => {
  assert.equal(defaultProjectTool(await project({ 'CLAUDE.md': '# c', 'AGENTS.md': '# a', 'OPENCODE.md': '# o' })), 'claude');
  assert.equal(defaultProjectTool(await project({ 'AGENTS.md': '# a' })), 'codex');
  assert.equal(defaultProjectTool(await project({ 'OPENCODE.md': '# o' })), 'opencode');
  assert.equal(defaultProjectTool(await project({ 'CLAUDE.md': '# c', '.aioson/install.json': JSON.stringify({ install_profile: { tools: ['opencode'] } }) })), 'opencode', 'the installer record wins');
  assert.equal(defaultProjectTool(await project({})), 'codex', 'a project with no gateway keeps the legacy default');
});

test('workflow:status without --tool speaks to a Claude install as claude', async () => {
  const dir = await project({ 'CLAUDE.md': '# c', 'AGENTS.md': '# a', '.aioson/context/project.context.md': CONTEXT });
  const result = await runWorkflowStatus({ args: [dir], options: {}, logger: { log() {}, error() {} } });
  assert.equal(result.tool, 'claude');
  assert.match(result.suggestion.command, /--tool=claude/);
});
