'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

async function makeTempDir() {
  return fs.mkdtemp(path.join(os.tmpdir(), 'aioson-protocol-'));
}

// ─── SF-project-19 — artifact_uris path safety ───────────────────────────────

test('SF-19: coerceArtifactUri refuses absolute paths', () => {
  const { coerceArtifactUri } = loadCoerce();
  const result = coerceArtifactUri({ path: '/etc/passwd', kind: 'spec' }, 'dev');
  assert.equal(result, null);
});

test('SF-19: coerceArtifactUri refuses paths containing ..', () => {
  const { coerceArtifactUri } = loadCoerce();
  const result = coerceArtifactUri({ path: '../../etc/passwd', kind: 'spec' }, 'dev');
  assert.equal(result, null);
});

test('SF-19: coerceArtifactUri refuses string-form absolute paths', () => {
  const { coerceArtifactUri } = loadCoerce();
  const result = coerceArtifactUri('/tmp/whatever', 'dev');
  assert.equal(result, null);
});

test('SF-19: coerceArtifactUri accepts safe project-relative paths', () => {
  const { coerceArtifactUri } = loadCoerce();
  const result = coerceArtifactUri({ path: '.aioson/context/spec-foo.md', kind: 'spec' }, 'dev');
  assert.ok(result);
  assert.equal(result.path, '.aioson/context/spec-foo.md');
  assert.equal(result.kind, 'spec');
});

function loadCoerce() {
  return require('../src/session-handoff');
}

// ─── SF-project-18 — workflow.state.json telemetry cross-check ────────────────

test('SF-18: detectUnsubstantiatedCompletions returns empty when telemetry DB is absent', async () => {
  const { detectUnsubstantiatedCompletions } = require('../src/commands/workflow-next');
  const dir = await makeTempDir();
  const result = await detectUnsubstantiatedCompletions(dir, ['product', 'analyst', 'dev'], null);
  assert.deepEqual(result, [], 'no DB → silent skip, return empty');
});

test('SF-18: flags a completed stage missing telemetry when sibling stages emit it', async () => {
  const { detectUnsubstantiatedCompletions } = require('../src/commands/workflow-next');
  const { openRuntimeDb, startRun, appendRunEvent } = require('../src/runtime-store');
  const dir = await makeTempDir();

  const { db } = await openRuntimeDb(dir);
  for (const stage of ['product', 'analyst']) {
    const runKey = startRun(db, { agentName: stage, source: 'workflow', workflowStage: stage });
    appendRunEvent(db, { runKey, eventType: 'agent_done', message: 'done' });
  }
  db.close();

  const warnings = [];
  const logger = { warn: (m) => warnings.push(m) };
  const result = await detectUnsubstantiatedCompletions(dir, ['product', 'analyst', 'dev'], logger);
  assert.deepEqual(result, ['dev'], 'dev has no agent_done telemetry while siblings do');
  assert.equal(warnings.length, 1);
  assert.equal(warnings[0].includes('dev'), true);
});

test('SF-18: stays silent when no completed stage has per-stage telemetry (no false positives)', async () => {
  const { detectUnsubstantiatedCompletions } = require('../src/commands/workflow-next');
  const { openRuntimeDb, startRun } = require('../src/runtime-store');
  const dir = await makeTempDir();

  // DB exists with a run, but no agent_done event for any completed stage.
  const { db } = await openRuntimeDb(dir);
  startRun(db, { agentName: 'unrelated', source: 'direct' });
  db.close();

  const warnings = [];
  const logger = { warn: (m) => warnings.push(m) };
  const result = await detectUnsubstantiatedCompletions(dir, ['product', 'analyst', 'dev'], logger);
  assert.deepEqual(result, [], 'no per-stage telemetry → best-effort skip');
  assert.equal(warnings.length, 0);
});
