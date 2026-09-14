'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');

const { MANAGED_FILES } = require('../src/constants');
const { buildBlock } = require('../src/gateway-pointer-merge');

const ROOT = path.resolve(__dirname, '..');
const TEMPLATE = path.join(ROOT, 'template');
const GATEWAY_DOCS = [
  '.aioson/docs/gateway/agent-routing.md',
  '.aioson/docs/gateway/workflow-runtime.md',
  '.aioson/docs/gateway/process-and-research.md',
  '.aioson/docs/gateway/legacy-agents-entrypoint.md',
  '.aioson/docs/gateway/legacy-claude-entrypoint.md'
];

async function read(relativePath) {
  return fs.readFile(path.join(ROOT, relativePath), 'utf8');
}

test('auto-loaded AIOSON gateways stay below the hard activation budget', async () => {
  for (const relativePath of ['AGENTS.md', 'CLAUDE.md', 'OPENCODE.md']) {
    const content = await read(relativePath);
    assert.ok(content.length < 4000, `${relativePath} is ${content.length} chars`);
  }
  for (const relativePath of ['template/AGENTS.md', 'template/CLAUDE.md', 'template/OPENCODE.md']) {
    const installed = buildBlock(await read(relativePath));
    assert.ok(installed.length < 4000, `installed ${relativePath} is ${installed.length} chars`);
  }
});

test('gateway kernels route progressively while preserving mandatory invariants', async () => {
  const [agents, claude] = await Promise.all([
    read('template/AGENTS.md'),
    read('template/CLAUDE.md')
  ]);

  for (const content of [agents, claude]) {
    for (const token of [
      '.aioson/context/project.context.md',
      '.aioson/config.md',
      '.aioson/docs/gateway/agent-routing.md',
      '.aioson/docs/gateway/workflow-runtime.md',
      '.aioson/docs/gateway/process-and-research.md',
      'Product → Sheldon → Planner → DEV → QA',
      'current activation explicitly includes `--auto`',
      'explicit `--step` disables Autopilot for that activation',
      'auto-closes only after final QA under an explicitly authorized'
    ]) {
      assert.ok(content.includes(token), `gateway missing ${token}`);
    }
  }

  assert.match(agents, /then exactly one matching reference/);
  assert.match(agents, /run the same review manually for at most two passes/);
  assert.equal((agents.match(/## Golden rule/g) || []).length, 1);
});

test('full legacy gateways remain available only as non-executable history', async () => {
  const [agentsLegacy, claudeLegacy] = await Promise.all([
    read('template/.aioson/docs/gateway/legacy-agents-entrypoint.md'),
    read('template/.aioson/docs/gateway/legacy-claude-entrypoint.md')
  ]);

  assert.ok(agentsLegacy.length > 23000, 'legacy AGENTS contract was not preserved');
  assert.ok(claudeLegacy.length > 13000, 'legacy CLAUDE contract was not preserved');
  assert.match(agentsLegacy, /NON-EXECUTABLE HISTORY/);
  assert.match(claudeLegacy, /NON-EXECUTABLE HISTORY/);
});

test('gateway modules are managed and mirrored byte-for-byte', async () => {
  for (const relativePath of GATEWAY_DOCS) {
    assert.equal(MANAGED_FILES.includes(relativePath), true, `missing managed file: ${relativePath}`);
    const [template, workspace] = await Promise.all([
      fs.readFile(path.join(TEMPLATE, relativePath), 'utf8'),
      fs.readFile(path.join(ROOT, relativePath), 'utf8')
    ]);
    assert.equal(workspace, template, `template/workspace drift: ${relativePath}`);
  }
});

test('routed modules retain lane budgets, workflow gates, skill evidence, and research boundaries', async () => {
  const [routing, workflow, process] = await Promise.all([
    read('template/.aioson/docs/gateway/agent-routing.md'),
    read('template/.aioson/docs/gateway/workflow-runtime.md'),
    read('template/.aioson/docs/gateway/process-and-research.md')
  ]);

  assert.match(routing, /5 behavior files, 8 total paths, and 2 existing modules/);
  assert.match(routing, /Persisted workflow state is evidence about prior work, not proof that the current request belongs to it/);
  assert.match(routing, /workflow:next --expect-feature=<active-slug>/);
  assert.match(routing, /unrelated bounded implementation[\s\S]*Dev Simple Plan without calling `workflow:next`/);
  assert.match(routing, /Deyvin may act directly only for existing known context/i);
  assert.match(workflow, /current request has been bound to the active feature/);
  assert.match(workflow, /workflow:next --expect-feature=<slug>/);
  assert.match(workflow, /Product → Sheldon → Planner → Dev → QA/);
  assert.match(workflow, /QA FAIL allows one bounded Dev correction and one final independent QA pass/);
  assert.match(workflow, /Runtime telemetry belongs to the gateway/);
  assert.match(process, /PROM → Product decision → CAP → current-system fit → AC → implementation delta/);
  assert.match(process, /skill:audit \. --reachability --usage/);
  assert.match(process, /Absence of observed telemetry is not by itself proof that a skill is abandoned/);
  assert.match(process, /Orache is the explicit domain-intelligence exception/);
});

test('every host gateway binds the current request before workflow state can own routing', async () => {
  for (const relativePath of [
    'template/AGENTS.md',
    'template/CLAUDE.md',
    'template/OPENCODE.md'
  ]) {
    const content = await read(relativePath);
    assert.match(content, /workflow:next` owns routing only after the current request is confirmed/);
    assert.match(content, /Preserve unrelated workflow state; Simple Plan goes directly to (?:Dev|DEV)/);
    assert.match(content, /--expect-feature=<slug>/);
  }
});
