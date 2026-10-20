'use strict';

// Short review names, upgrade leftovers: a review prepared before 1.74 had its
// draft written under the full-digest name, and prepare pointed the agent at a
// short draft that did not exist; re-checking a report already promoted under
// the full-digest name wrote a second copy. Prepare now hands back the legacy
// draft when it is the only one, and check reuses the identical legacy report.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const { prepareReview, checkReview, reviewStatus } = require('../src/review-intelligence/engine');
const { packetRelativePath, draftRelativePath, reportRelativePath } = require('../src/review-intelligence/storage');

const SLUG = 'invoice-dispute';
const input = (root) => ({ rootDir: root, featureSlug: SLUG, agent: 'planner' });

async function makeProject(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'aioson-cycle-review-'));
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

async function writeDraft(root, draftPath, prepared) {
  const report = { ...prepared.report_template, review_status: 'pass', summary: 'All scoped claims are backed by current evidence.', findings: [], completed_at: '2026-10-20T12:00:00.000Z' };
  await fs.mkdir(path.dirname(path.join(root, draftPath)), { recursive: true });
  await fs.writeFile(path.join(root, draftPath), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
}

// What a 1.73 run left: the packet and the draft under their full-digest names.
async function legacyReview(root) {
  const prepared = await prepareReview(input(root));
  const packetId = prepared.packet.packet_id;
  await fs.rename(path.join(root, prepared.packet_path), path.join(root, packetRelativePath(SLUG, 'planner', packetId, { legacy: true })));
  const legacyDraft = draftRelativePath(SLUG, 'planner', packetId, { legacy: true });
  await writeDraft(root, legacyDraft, prepared);
  return { packetId, legacyDraft };
}

test('prepare after the upgrade hands back the draft the agent already wrote under the legacy name', async (t) => {
  const root = await makeProject(t);
  const { legacyDraft } = await legacyReview(root);
  const again = await prepareReview(input(root));
  assert.equal(again.draft_path, legacyDraft);
  assert.ok(again.next_command.includes(legacyDraft), again.next_command);

  // Once a short draft exists, it is the one.
  const shortDraft = draftRelativePath(SLUG, 'planner', again.packet.packet_id);
  await writeDraft(root, shortDraft, again);
  assert.equal((await prepareReview(input(root))).draft_path, shortDraft);
});

test('re-checking a report already promoted under the legacy name reuses it instead of writing a second copy', async (t) => {
  const root = await makeProject(t);
  const { packetId, legacyDraft } = await legacyReview(root);
  const first = await checkReview({ ...input(root), reportPath: legacyDraft });
  const legacyReport = reportRelativePath(SLUG, 'planner', packetId, first.report_hash, { legacy: true });
  await fs.rename(path.join(root, first.report_path), path.join(root, legacyReport));

  const second = await checkReview({ ...input(root), reportPath: legacyDraft });
  assert.equal(second.created, false);
  assert.equal(second.report_path, legacyReport);
  const reports = await fs.readdir(path.join(root, `.aioson/context/features/${SLUG}/reviews/reports`));
  assert.equal(reports.length, 1, reports.join(', '));
  const status = await reviewStatus({ rootDir: root, featureSlug: SLUG });
  assert.deepEqual(status.issues || [], []);
});
