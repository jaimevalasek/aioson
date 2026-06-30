'use strict';

// Tests for the artifact done-gate bridge (src/artifact-kinds.js): the map that
// makes `verify:artifact` AUTO-FIRE (advisory) at `agent:done` for the peripheral
// artifact-producing agents, instead of relying on each agent to run its own
// `## Done gate` line.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { resolveAgentArtifact, verifyAgentArtifact, AGENT_ARTIFACT_KIND } = require('../src/artifact-kinds');
const { availableKinds } = require('../src/commands/verify-artifact');

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'aioson-vag-'));
}

function writeBootstrap(root, { valid = true } = {}) {
  const dir = path.join(root, '.aioson', 'context', 'bootstrap');
  fs.mkdirSync(dir, { recursive: true });
  for (const f of ['what-is.md', 'what-it-does.md', 'how-it-works.md', 'current-state.md']) {
    const body = valid
      ? `---\ngenerated_by: discover\nconfidence: high\n---\n\nReal content for ${f}.\n`
      : `---\ngenerated_by: discover\nconfidence: high\n---\n\nTODO fill ${f}.\n`;
    fs.writeFileSync(path.join(dir, f), body, 'utf8');
  }
}

test('resolveAgentArtifact maps the periphery and ignores everyone else', () => {
  assert.deepEqual(resolveAgentArtifact('setup'), { kind: 'project-context', needs: 'none' });
  assert.deepEqual(resolveAgentArtifact('@discover'), { kind: 'bootstrap', needs: 'none' });
  assert.equal(resolveAgentArtifact('genome').needs, 'slug');
  assert.equal(resolveAgentArtifact('profiler-researcher').kind, 'research-report');
  assert.equal(resolveAgentArtifact('orache').needs, 'file');
  assert.equal(resolveAgentArtifact('site-forge').needs, 'dir');
  // workflow + non-artifact agents resolve to null (no auto-fire for them)
  for (const a of ['dev', 'qa', 'product', 'sheldon', 'orchestrator', 'squad', '', undefined]) {
    assert.equal(resolveAgentArtifact(a), null, `expected null for "${a}"`);
  }
});

test('every mapped kind exists in the verify:artifact registry', () => {
  const kinds = new Set(availableKinds());
  for (const [agent, m] of Object.entries(AGENT_ARTIFACT_KIND)) {
    assert.equal(kinds.has(m.kind), true, `${agent} -> kind "${m.kind}" not registered in verify:artifact`);
  }
});

test('verifyAgentArtifact returns null for an agent with no artifact', async () => {
  assert.equal(await verifyAgentArtifact({ targetDir: tmpDir(), agent: 'dev' }), null);
  assert.equal(await verifyAgentArtifact({ targetDir: tmpDir(), agent: '@product' }), null);
});

test('verifyAgentArtifact hints (skipped, never fails) when a locator-keyed kind has no locator', async () => {
  const genome = await verifyAgentArtifact({ targetDir: tmpDir(), agent: 'genome' });
  assert.equal(genome.skipped, true);
  assert.equal(genome.ok, true); // a hint must never fail the close
  assert.match(genome.reason, /--slug=<slug>/);
  assert.match(genome.reason, /aioson verify:artifact \. --kind=genome/);

  const orache = await verifyAgentArtifact({ targetDir: tmpDir(), agent: 'orache' });
  assert.equal(orache.skipped, true);
  assert.match(orache.reason, /--file=<path>/);

  const site = await verifyAgentArtifact({ targetDir: tmpDir(), agent: 'site-forge' });
  assert.equal(site.skipped, true);
  assert.match(site.reason, /--dir=<dir>/);
});

test('verifyAgentArtifact runs the real check for a self-resolving kind (discover/bootstrap)', async () => {
  const good = tmpDir();
  writeBootstrap(good, { valid: true });
  const okRes = await verifyAgentArtifact({ targetDir: good, agent: 'discover' });
  assert.equal(okRes.skipped, false);
  assert.equal(okRes.ok, true);
  assert.equal(okRes.kind, 'bootstrap');

  const bad = tmpDir();
  writeBootstrap(bad, { valid: false }); // TODO placeholder trips must_not_match
  const failRes = await verifyAgentArtifact({ targetDir: bad, agent: 'discover' });
  assert.equal(failRes.skipped, false);
  assert.equal(failRes.ok, false);
  assert.match(failRes.reason, /verify-artifact-bootstrap\.json/);

  const empty = tmpDir(); // no bootstrap files at all
  const missingRes = await verifyAgentArtifact({ targetDir: empty, agent: 'discover' });
  assert.equal(missingRes.ok, false);
});

test('verifyAgentArtifact flags a missing project.context.md for setup', async () => {
  const res = await verifyAgentArtifact({ targetDir: tmpDir(), agent: 'setup' });
  assert.equal(res.skipped, false);
  assert.equal(res.ok, false);
  assert.equal(res.kind, 'project-context');
  assert.ok(res.issues.length > 0);
});

test('verifyAgentArtifact persists the report json the same way the CLI does', async () => {
  const root = tmpDir();
  writeBootstrap(root, { valid: true });
  await verifyAgentArtifact({ targetDir: root, agent: 'discover' });
  const report = path.join(root, '.aioson', 'context', 'verify-artifact-bootstrap.json');
  assert.equal(fs.existsSync(report), true);
  const parsed = JSON.parse(fs.readFileSync(report, 'utf8'));
  assert.equal(parsed.kind, 'bootstrap');
  assert.equal(parsed.mode, 'advisory');
});
