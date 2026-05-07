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
