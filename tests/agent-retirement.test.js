'use strict';

// Eight agents were retired into the main cycle (briefing → refiner → product
// → sheldon → planner → dev → qa → tester → pentester). Their ids keep
// resolving to the agent that absorbed their work, their files are gone from
// the template, and `aioson update` removes the copies a project still has.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const { AGENT_DEFINITIONS, MANAGED_FILES, REQUIRED_FILES } = require('../src/constants');
const { canonicalAgentId, getAgentDefinition, isRetiredAgentId, RETIRED_AGENT_IDS } = require('../src/agents');
const { migrateAgentRename, RETIRED_FILES } = require('../src/migrations/agent-rename');

const ROOT = path.resolve(__dirname, '..');
const RETIRED = {
  deyvin: 'dev',
  pair: 'dev',
  architect: 'planner',
  'discovery-design-doc': 'planner',
  pm: 'planner',
  analyst: 'product',
  'ux-ui': 'product',
  'scope-check': 'qa'
};

test('every retired id resolves to the agent that absorbed its work', () => {
  assert.deepEqual({ ...RETIRED_AGENT_IDS }, RETIRED);
  for (const [id, owner] of Object.entries(RETIRED)) {
    assert.equal(canonicalAgentId(id), owner, id);
    assert.equal(canonicalAgentId(`@${id}`), owner, id);
    assert.equal(getAgentDefinition(id).id, owner, id);
    assert.equal(isRetiredAgentId(id), true, id);
  }
  assert.equal(isRetiredAgentId('dev'), false);
  assert.equal(isRetiredAgentId('briefing-refiner'), false, 'a rename is not a retirement');
});

test('no retired agent is defined, shipped, or required', () => {
  for (const id of Object.keys(RETIRED)) {
    assert.equal(AGENT_DEFINITIONS.some((agent) => agent.id === id), false, id);
    assert.equal(MANAGED_FILES.includes(`.aioson/agents/${id}.md`), false, id);
    assert.equal(REQUIRED_FILES.includes(`.aioson/agents/${id}.md`), false, id);
    for (const rel of [
      `template/.aioson/agents/${id}.md`,
      `template/.aioson/agents/manifests/${id}.manifest.json`,
      `template/.claude/commands/aioson/agent/${id}.md`,
      `.aioson/agents/${id}.md`
    ]) {
      assert.equal(fs.existsSync(path.join(ROOT, rel)), false, rel);
    }
  }
  for (const rel of RETIRED_FILES) {
    assert.equal(fs.existsSync(path.join(ROOT, 'template', rel)), false, rel);
  }
});

test('the docs worth keeping moved to their new owners and ship', () => {
  for (const rel of [
    '.aioson/docs/dev/continuity-recovery.md',
    '.aioson/docs/dev/runtime-handoffs.md',
    '.aioson/docs/dev/site-delivery.md',
    '.aioson/docs/qa/accessibility-audit.md',
    '.aioson/docs/qa/scope-drift.md'
  ]) {
    assert.ok(MANAGED_FILES.includes(rel), rel);
    assert.ok(fs.existsSync(path.join(ROOT, 'template', rel)), rel);
  }
});

test('the entry kernels no longer alias a retired agent', () => {
  for (const rel of ['template/CLAUDE.md', 'template/AGENTS.md', 'template/OPENCODE.md']) {
    const kernel = fs.readFileSync(path.join(ROOT, rel), 'utf8');
    assert.doesNotMatch(kernel, /deyvin/i, rel);
  }
});

test('update removes a retired agent\'s files and docs from an existing project', async (t) => {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), 'aioson-retire-'));
  t.after(() => fsp.rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }));
  const write = async (rel, body = 'x') => {
    await fsp.mkdir(path.dirname(path.join(root, rel)), { recursive: true });
    await fsp.writeFile(path.join(root, rel), body);
  };
  await write('.aioson/agents/dev.md');
  await write('.aioson/agents/planner.md');
  await write('.aioson/agents/deyvin.md');
  await write('.aioson/agents/pair.md');
  await write('.aioson/agents/architect.md');
  await write('.aioson/agents/manifests/deyvin.manifest.json', '{}');
  await write('.claude/commands/aioson/agent/dev.md');
  await write('.claude/commands/aioson/agent/deyvin.md');
  await write('.aioson/docs/deyvin/pair-execution.md');
  await write('.aioson/docs/ux-ui/design-gate.md');
  await write('.aioson/docs/dev/scout.md');

  const result = await migrateAgentRename(root);
  assert.equal(result.changed, true);
  for (const rel of [
    '.aioson/agents/deyvin.md',
    '.aioson/agents/pair.md',
    '.aioson/agents/architect.md',
    '.aioson/agents/manifests/deyvin.manifest.json',
    '.claude/commands/aioson/agent/deyvin.md',
    '.aioson/docs/deyvin/pair-execution.md',
    '.aioson/docs/ux-ui/design-gate.md'
  ]) {
    assert.equal(fs.existsSync(path.join(root, rel)), false, rel);
  }
  assert.equal(fs.existsSync(path.join(root, '.aioson/docs/deyvin')), false, 'the empty folder goes too');
  for (const rel of ['.aioson/agents/dev.md', '.aioson/agents/planner.md', '.aioson/docs/dev/scout.md']) {
    assert.equal(fs.existsSync(path.join(root, rel)), true, rel);
  }
  assert.equal((await migrateAgentRename(root)).changed, false, 'idempotent');
});

test('a retired agent file stays when its absorber is not installed', async (t) => {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), 'aioson-retire-guard-'));
  t.after(() => fsp.rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }));
  await fsp.mkdir(path.join(root, '.aioson/agents'), { recursive: true });
  await fsp.writeFile(path.join(root, '.aioson/agents/architect.md'), 'x');
  await migrateAgentRename(root);
  assert.equal(fs.existsSync(path.join(root, '.aioson/agents/architect.md')), true);
});
