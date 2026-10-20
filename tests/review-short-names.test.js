'use strict';

// Review file names embedded two whole sha256 digests: a promoted report sat at
// 185 chars + slug below the project root, so on Windows (Git's 260-char path
// limit, core.longpaths off by default) `git add` refused the whole feature
// once root + slug reached ~74 chars. Names now carry 16-hex prefixes; the
// pre-1.74 full-digest files a project already holds keep being read.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const { prepareReview, checkReview, reviewStatus } = require('../src/review-intelligence/engine');
const { packetRelativePath, reportRelativePath } = require('../src/review-intelligence/storage');

// A 40-char slug: the long names failed with any root over ~34 chars.
const SLUG = 'customer-portal-invoice-dispute-workflow';

async function makeProject(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'aioson-review-names-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  for (const [rel, content] of Object.entries({
    '.aioson/context/project.context.md': '# Project\n',
    [`.aioson/context/prd-${SLUG}.md`]: '# PRD\n',
    [`.aioson/context/implementation-plan-${SLUG}.md`]: '# Plan\n'
  })) {
    await fs.mkdir(path.dirname(path.join(root, rel)), { recursive: true });
    await fs.writeFile(path.join(root, rel), content, 'utf8');
  }
  return root;
}

const input = (root) => ({ rootDir: root, featureSlug: SLUG, agent: 'planner' });

async function promote(root, prepared, draftPath = prepared.draft_path) {
  const report = { ...prepared.report_template, review_status: 'pass', summary: 'All scoped claims are backed by current evidence.', findings: [], completed_at: '2026-10-20T12:00:00.000Z' };
  await fs.mkdir(path.dirname(path.join(root, draftPath)), { recursive: true });
  await fs.writeFile(path.join(root, draftPath), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  return checkReview({ ...input(root), reportPath: draftPath });
}

test('packet, draft and report names stay short enough for git on a Windows root', async (t) => {
  const root = await makeProject(t);
  const prepared = await prepareReview(input(root));
  const checked = await promote(root, prepared);
  for (const rel of [prepared.packet_path, prepared.draft_path, checked.report_path]) {
    assert.ok(rel.length <= 130, `${rel.length} chars: ${rel}`);
    assert.doesNotMatch(rel, /[a-f0-9]{64}/, rel);
  }
  // 260 = Git for Windows' path limit: a 100-char project root still fits.
  assert.ok(100 + 1 + checked.report_path.length < 260);
});

test('a project holding the pre-1.74 full-digest names keeps reading them', async (t) => {
  const root = await makeProject(t);
  const prepared = await prepareReview(input(root));
  const checked = await promote(root, prepared);
  const packetId = prepared.packet.packet_id;

  // Rename what 1.73 would have written: full-digest packet and report names.
  const legacyPacket = packetRelativePath(SLUG, 'planner', packetId, { legacy: true });
  const legacyReport = reportRelativePath(SLUG, 'planner', packetId, checked.report_hash, { legacy: true });
  await fs.rename(path.join(root, prepared.packet_path), path.join(root, legacyPacket));
  await fs.rename(path.join(root, checked.report_path), path.join(root, legacyReport));

  const again = await prepareReview(input(root));
  assert.equal(again.packet_path, legacyPacket, 'prepare reuses the legacy packet instead of duplicating it');
  assert.equal(again.created, false);
  assert.equal(again.terminal, true, 'the legacy PASS report still terminates the review');
  assert.equal(again.terminal_report_path, legacyReport);

  const status = await reviewStatus({ rootDir: root, featureSlug: SLUG });
  assert.deepEqual(status.issues || [], [], JSON.stringify(status.issues));
  assert.ok(JSON.stringify(status).includes('"pass"'), JSON.stringify(status));
});
