'use strict';

/**
 * Tests for F3 — CLI pending-decisions guard (workflow-handoff-integrity v1.9.6).
 *
 * Covers AC-F3-01..07 from .aioson/plans/workflow-handoff-integrity/plan-f3-cli-gate-pending-decisions.md.
 * Targets the exported helper `assertManifestNotPending` directly.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const { assertManifestNotPending, PENDING_STATE_WHITELIST } = require('../src/commands/workflow-next');

async function makeTempProject(slug = 'demo-feature') {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'aioson-f3-'));
  await fs.mkdir(path.join(dir, '.aioson', 'plans', slug), { recursive: true });
  return dir;
}

async function writeManifest(dir, slug, frontmatter = {}, body = '') {
  const manifestPath = path.join(dir, '.aioson', 'plans', slug, 'manifest.md');
  const fmLines = Object.entries(frontmatter).map(([k, v]) => `${k}: ${v}`).join('\n');
  await fs.writeFile(manifestPath, `---\n${fmLines}\n---\n${body}`);
  return manifestPath;
}

test('AC-F3-01 hard error: pending-architect-decisions blocks with actionable message', async () => {
  const dir = await makeTempProject('demo-feature');
  await writeManifest(dir, 'demo-feature', { status: 'pending-architect-decisions' });
  await assert.rejects(
    () => assertManifestNotPending(dir, 'demo-feature', false),
    (err) => {
      assert.equal(err.code, 'WORKFLOW_NEXT_PENDING_DECISIONS');
      assert.equal(err.pendingState, 'architect');
      assert.equal(err.knownState, true);
      assert.match(err.message, /Gate blocked/);
      assert.match(err.message, /Próximo agente recomendado: @architect/);
      assert.match(err.message, /Use --force para override/);
      return true;
    }
  );
});

test('AC-F3-02 regex match: pending-product-decisions blocks', async () => {
  const dir = await makeTempProject();
  await writeManifest(dir, 'demo-feature', { status: 'pending-product-decisions' });
  await assert.rejects(
    () => assertManifestNotPending(dir, 'demo-feature', false),
    (err) => err.pendingState === 'product' && err.knownState === true
  );
});

test('AC-F3-02 regex match: pending-pm-decisions blocks', async () => {
  const dir = await makeTempProject();
  await writeManifest(dir, 'demo-feature', { status: 'pending-pm-decisions' });
  await assert.rejects(
    () => assertManifestNotPending(dir, 'demo-feature', false),
    (err) => err.pendingState === 'pm' && err.knownState === true
  );
});

test('AC-F3-02 unknown captured group: still blocks but flagged as unrecognized', async () => {
  const dir = await makeTempProject();
  await writeManifest(dir, 'demo-feature', { status: 'pending-pizza-decisions' });
  await assert.rejects(
    () => assertManifestNotPending(dir, 'demo-feature', false),
    (err) => {
      assert.equal(err.pendingState, 'pizza');
      assert.equal(err.knownState, false);
      assert.match(err.message, /Estado desconhecido 'pizza'/);
      assert.match(err.message, /whitelist atual: @architect, @product, @pm, @qa/);
      return true;
    }
  );
});

test('AC-F3-03 --force override: explicit force returns silently even with pending state', async () => {
  const dir = await makeTempProject();
  await writeManifest(dir, 'demo-feature', { status: 'pending-architect-decisions' });
  await assert.doesNotReject(() => assertManifestNotPending(dir, 'demo-feature', true));
});

test('AC-F3-04 no manifest: slug provided but file absent → silent skip (no over-block)', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'aioson-f3-no-manifest-'));
  await assert.doesNotReject(() => assertManifestNotPending(dir, 'nonexistent-slug', false));
});

test('AC-F3-04 no slug: project mode → silent skip', async () => {
  const dir = await makeTempProject();
  await assert.doesNotReject(() => assertManifestNotPending(dir, null, false));
  await assert.doesNotReject(() => assertManifestNotPending(dir, undefined, false));
  await assert.doesNotReject(() => assertManifestNotPending(dir, '', false));
});

test('AC-F3-02 status not matching pending-*-decisions pattern: silent skip', async () => {
  const dir = await makeTempProject();

  await writeManifest(dir, 'demo-feature', { status: 'ready' });
  await assert.doesNotReject(() => assertManifestNotPending(dir, 'demo-feature', false));

  await writeManifest(dir, 'demo-feature', { status: 'approved' });
  await assert.doesNotReject(() => assertManifestNotPending(dir, 'demo-feature', false));

  await writeManifest(dir, 'demo-feature', { status: 'draft' });
  await assert.doesNotReject(() => assertManifestNotPending(dir, 'demo-feature', false));

  // Edge case: pending-something (without -decisions suffix) does NOT match the pattern.
  await writeManifest(dir, 'demo-feature', { status: 'pending-review' });
  await assert.doesNotReject(() => assertManifestNotPending(dir, 'demo-feature', false));
});

test('manifest without status field: silent skip', async () => {
  const dir = await makeTempProject();
  await writeManifest(dir, 'demo-feature', { classification: 'MEDIUM' });
  await assert.doesNotReject(() => assertManifestNotPending(dir, 'demo-feature', false));
});

test('whitelist constant is exported and matches DD-02 canonical set', () => {
  assert.deepEqual([...PENDING_STATE_WHITELIST].sort(), ['architect', 'pm', 'product', 'qa']);
});
