'use strict';

// The `briefing-refiner` → `refiner` rename contract: the canonical id is
// `refiner`, the legacy id resolves everywhere an agent id is compared, and
// `aioson update` removes the dead files the old name left in a project.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const {
  LEGACY_AGENT_IDS,
  canonicalAgentId,
  isSameAgent,
  getAgentDefinition
} = require('../src/agents');
const { appliesToAgent } = require('../src/preflight-engine');
const { resolveAgentArtifact } = require('../src/artifact-kinds');
const { getReviewProfile } = require('../src/review-intelligence/profiles');
const { migrateAgentRename, legacyAgentFiles } = require('../src/migrations/agent-rename');
const { AGENT_DEFINITIONS, MANAGED_FILES } = require('../src/constants');

const ROOT = path.resolve(__dirname, '..');
const BIN = path.join(ROOT, 'bin', 'aioson.js');

test('refiner is the canonical id; briefing-refiner is only a legacy id', () => {
  assert.equal(LEGACY_AGENT_IDS['briefing-refiner'], 'refiner');
  // Retired agents resolve to the agent that absorbed them.
  assert.equal(LEGACY_AGENT_IDS.pair, 'dev');
  assert.equal(LEGACY_AGENT_IDS.architect, 'planner');
  assert.equal(getAgentDefinition('briefing-refiner').id, 'refiner');
  assert.equal(getAgentDefinition('@Briefing-Refiner').id, 'refiner');
  assert.equal(AGENT_DEFINITIONS.some((a) => a.id === 'briefing-refiner'), false);
  assert.equal(MANAGED_FILES.includes('.aioson/agents/refiner.md'), true);
  assert.equal(MANAGED_FILES.includes('.aioson/agents/briefing-refiner.md'), false);
});

test('canonicalAgentId rewrites known aliases and leaves custom ids alone', () => {
  assert.equal(canonicalAgentId('briefing-refiner'), 'refiner');
  assert.equal(canonicalAgentId('@briefing-refiner'), 'refiner');
  assert.equal(canonicalAgentId('refiner'), 'refiner');
  assert.equal(canonicalAgentId('pair'), 'dev');
  assert.equal(canonicalAgentId('scope-check'), 'qa');
  assert.equal(canonicalAgentId('my-squad-specialist'), 'my-squad-specialist');
  assert.equal(canonicalAgentId(''), '');
  assert.equal(isSameAgent('briefing-refiner', '@refiner'), true);
  assert.equal(isSameAgent('dev', 'refiner'), false);
});

test('client-owned rules tagged with the legacy id still apply to @refiner', () => {
  // `.aioson/rules/` is the client's channel — `aioson update` never rewrites
  // it — so a rule written before the rename keeps its old frontmatter.
  assert.equal(appliesToAgent({ agents: '[briefing, briefing-refiner, product]' }, 'refiner'), true);
  assert.equal(appliesToAgent({ agents: '[briefing-refiner]' }, '@refiner'), true);
  assert.equal(appliesToAgent({ agents: '[refiner]' }, 'briefing-refiner'), true);
  assert.equal(appliesToAgent({ agents: '[dev, qa]' }, 'refiner'), false);
});

test('done-gate kind and review profile resolve through the alias', () => {
  const viaAlias = resolveAgentArtifact('briefing-refiner');
  const viaId = resolveAgentArtifact('refiner');
  assert.ok(viaId, 'refiner must keep its kind=review done gate');
  assert.deepEqual(viaAlias, viaId);
  assert.equal(getReviewProfile('briefing-refiner').agent, 'refiner');
  assert.equal(getReviewProfile('@refiner').profile, 'framing');
});

test('the template ships refiner.md and no briefing-refiner.md anywhere', async () => {
  const template = path.join(ROOT, 'template');
  await fs.access(path.join(template, '.aioson', 'agents', 'refiner.md'));
  await fs.access(path.join(template, '.claude', 'commands', 'aioson', 'agent', 'refiner.md'));
  await assert.rejects(fs.access(path.join(template, '.aioson', 'agents', 'briefing-refiner.md')));
  await assert.rejects(fs.access(path.join(template, '.claude', 'commands', 'aioson', 'agent', 'briefing-refiner.md')));
  const kernel = await fs.readFile(path.join(template, '.aioson', 'agents', 'refiner.md'), 'utf8');
  assert.match(kernel, /^# Agent @refiner/m);
  assert.equal(kernel.includes('briefing-refiner'), false);
});

test('migrateAgentRename removes stale legacy files only when the canonical ones exist', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'aioson-agent-rename-'));
  try {
    const legacyAgent = path.join(dir, '.aioson', 'agents', 'briefing-refiner.md');
    const legacyStub = path.join(dir, '.claude', 'commands', 'aioson', 'agent', 'briefing-refiner.md');
    const pairStub = path.join(dir, '.claude', 'commands', 'aioson', 'agent', 'pair.md');
    for (const f of [legacyAgent, legacyStub, pairStub]) {
      await fs.mkdir(path.dirname(f), { recursive: true });
      await fs.writeFile(f, '# legacy\n', 'utf8');
    }
    await fs.writeFile(path.join(dir, '.claude', 'commands', 'aioson', 'agent', 'deyvin.md'), '# deyvin\n', 'utf8');

    // Canonical agent file missing → nothing is removed (never strand the project).
    let result = await migrateAgentRename(dir);
    assert.deepEqual(result, { changed: false, removed: [] });
    await fs.access(legacyAgent);

    await fs.writeFile(path.join(dir, '.aioson', 'agents', 'refiner.md'), '# refiner\n', 'utf8');
    await fs.writeFile(path.join(dir, '.claude', 'commands', 'aioson', 'agent', 'refiner.md'), '# stub\n', 'utf8');
    result = await migrateAgentRename(dir);
    assert.equal(result.changed, true);
    assert.deepEqual(result.removed.sort(), [
      '.aioson/agents/briefing-refiner.md',
      '.claude/commands/aioson/agent/briefing-refiner.md'
    ]);
    await assert.rejects(fs.access(legacyAgent));
    await assert.rejects(fs.access(legacyStub));
    // `pair` is an alias the template still ships as a real stub → untouched.
    await fs.access(pairStub);

    // Idempotent.
    result = await migrateAgentRename(dir);
    assert.deepEqual(result, { changed: false, removed: [] });
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test('legacyAgentFiles covers every per-agent file location for every alias', () => {
  const rels = legacyAgentFiles().map((e) => e.legacyRel);
  assert.ok(rels.includes('.aioson/agents/briefing-refiner.md'));
  assert.ok(rels.includes('.claude/commands/aioson/agent/briefing-refiner.md'));
});

test('CLI accepts the legacy id and reports the canonical agent', () => {
  const run = spawnSync(process.execPath, [BIN, 'agent:help', 'briefing-refiner', '--json'], {
    cwd: ROOT, encoding: 'utf8'
  });
  assert.equal(run.status, 0, run.stderr || run.stdout);
  const payload = JSON.parse(run.stdout);
  assert.equal(payload.agent.id, 'refiner');
  assert.equal(payload.agent.command, '@refiner');
  assert.deepEqual(payload.agent.legacyIds, ['briefing-refiner']);
  assert.deepEqual(payload.agent.aliases, []);
});
