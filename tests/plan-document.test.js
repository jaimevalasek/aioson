'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { handleShow, handleStale, handleBind } = require('../src/commands/implementation-plan');
const logger = { log() {}, error() {} };
const context = { logger, t: key => key };
async function fixture(t, text) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'aioson-plan-document-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const dir = path.join(root, '.aioson/context');
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, 'implementation-plan-demo.md'), text);
  return { root, dir };
}
test('canonical and legacy phases support CRLF, ignoring fenced examples and notes', async t => {
  const { root } = await fixture(t, ['---', 'status: approved', '---', '## Phase 1 — Saved result', 'Do work.', '### Phase 1 notes', 'Not another phase.', '```md', '## Phase 99 — Example', '```', '### Fase 2: Entrega', 'Done'].join('\r\n'));
  const result = await handleShow(root, 'demo', context);
  assert.equal(result.phases, 2);
  assert.equal(result.meta.status, 'approved');
});
test('missing baseline is unknown and feature-specific PRD timestamp is inspected', async t => {
  const { root, dir } = await fixture(t, '---\nstatus: approved\n---\n## Phase 1 — Deliver\n');
  assert.equal((await handleStale(root, 'demo', context)).freshness, 'unknown');
  await fs.writeFile(path.join(dir, 'implementation-plan-demo.md'), '---\ncreated: 2025-01-01\n---\n');
  await fs.writeFile(path.join(dir, 'prd-demo.md'), '# Changed promise');
  assert.equal((await handleStale(root, 'demo', context)).stale, true);
});
test('binding uses PRD bytes, ignores unrelated PRD and notices changed bytes with preserved mtime', async t => {
  const { root, dir } = await fixture(t, '---\nstatus: approved\nsource_prd: .aioson/context/prd-demo.md\n---\n## Phase 1 — Deliver\n');
  const prd = path.join(dir, 'prd-demo.md');
  await fs.writeFile(prd, '# Original promise');
  assert.equal((await handleBind(root, 'demo', context)).ok, true);
  await fs.writeFile(path.join(dir, 'prd-other.md'), '# unrelated');
  assert.equal((await handleStale(root, 'demo', context)).stale, false);
  const stat = await fs.stat(prd);
  await fs.writeFile(prd, '# Changed promise');
  await fs.utimes(prd, stat.atime, stat.mtime);
  assert.equal((await handleStale(root, 'demo', context)).stale, true);
});
test('binding rejects a foreign feature PRD and traversal', async t => {
  const { root, dir } = await fixture(t, '---\nsource_prd: .aioson/context/prd-other.md\n---\n');
  await fs.writeFile(path.join(dir, 'prd-other.md'), '# Other');
  assert.equal((await handleBind(root, 'demo', context)).ok, false);
  await fs.writeFile(path.join(dir, 'implementation-plan-demo.md'), '---\nsource_prd: ../../outside.md\n---\n');
  assert.equal((await handleBind(root, 'demo', context)).ok, false);
});


test('canonical plan binding wins over a legacy manifest and registered phases retain checkpoints', async t => {
  const { root, dir } = await fixture(t, '---\nfeature: demo\nstatus: approved\n---\n## Phase 1 — Save result\n- Verify saved result.\n');
  await fs.writeFile(path.join(dir, 'prd-demo.md'), '# Product');
  const legacy = path.join(root, '.aioson/plans/demo/manifest.md');
  await fs.mkdir(path.dirname(legacy), { recursive: true });
  await fs.writeFile(legacy, '# Historical harness manifest');
  assert.equal((await handleBind(root, 'demo', context)).ok, true);
  assert.equal(await fs.readFile(legacy, 'utf8'), '# Historical harness manifest');
  const { handleRegister, handleCheckpoint, handleStatus } = require('../src/commands/implementation-plan');
  const registered = await handleRegister(root, 'demo', context);
  assert.equal(registered.registered, true);
  assert.equal((await handleCheckpoint(root, 'demo', '1', context)).updated, true);
  const repeated = await handleRegister(root, 'demo', context);
  assert.equal(repeated.planId, registered.planId);
  const status = await handleStatus(root, 'demo', context);
  assert.equal(status.phases.length, 1);
  assert.equal(status.plan.phases_completed, 1);
});
