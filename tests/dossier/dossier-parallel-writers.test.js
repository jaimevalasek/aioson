'use strict';

/**
 * Past its size budget every add-finding rewrites the dossier and the trail
 * archive. Lanes and a retried phase:next write the same dossier at once: the
 * writers are separate processes, and a writer that read a half-written file
 * used to write it back, dropping entries recorded long before. Every entry —
 * the old ones and each writer's own — must be in exactly one of the two files.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');

const storePath = require.resolve('../../src/dossier/store');
const store = require(storePath);
const { acquireLock } = require('../../src/dossier/lock');
const { trailArchivePath, dossierPath, MAX_ACTIVE_SIZE } = require('../../src/dossier/dossier-compact');

const SLUG = 'billing-export';
const OLD = 30;
const WRITERS = 8;
const pad = 'evidence '.repeat(40).trim();

function writer(contextDir, id) {
  const code = `require(${JSON.stringify(storePath)}).addFinding(${JSON.stringify({ slug: SLUG, contextDir, agent: 'dev', section: 'Agent Trail', content: `NEW-${id}: ${pad}` })})`
    + '.then((r) => process.stdout.write(JSON.stringify(r)), (e) => process.stdout.write(`ERR ${e.message}`));';
  return new Promise((resolve) => {
    const child = spawn(process.execPath, ['-e', code]);
    let out = '';
    child.stdout.on('data', (chunk) => { out += chunk; });
    child.on('close', () => resolve(out));
  });
}

const count = (text, needle) => text.split(needle).length - 1;

describe('dossier — parallel writers', () => {
  it('keeps every entry, once, when processes add findings to a dossier past its budget', async (t) => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'aioson-dossier-parallel-'));
    t.after(() => fs.rm(root, { recursive: true, force: true }));
    const contextDir = path.join(root, '.aioson', 'context');
    await store.init({ slug: SLUG, contextDir, whyText: 'Billing needs exports.', whatText: 'CSV export of invoices.' });
    for (let i = 0; i < OLD; i += 1) {
      await store.addFinding({ slug: SLUG, contextDir, agent: 'dev', section: 'Agent Trail', content: `OLD-${i}: ${pad}` });
    }

    const outs = await Promise.all(Array.from({ length: WRITERS }, (_, id) => writer(contextDir, id)));
    for (const out of outs) assert.match(out, /"added":true/, out);

    const dossier = await fs.readFile(dossierPath(contextDir, SLUG), 'utf8');
    const archive = await fs.readFile(trailArchivePath(contextDir, SLUG), 'utf8');
    const both = `${dossier}\n${archive}`;
    for (let i = 0; i < OLD; i += 1) assert.equal(count(both, `OLD-${i}:`), 1, `OLD-${i}`);
    for (let id = 0; id < WRITERS; id += 1) assert.equal(count(both, `NEW-${id}:`), 1, `NEW-${id}`);
    assert.ok(Buffer.byteLength(dossier, 'utf8') <= MAX_ACTIVE_SIZE, 'the dossier is back under its budget');
    await assert.rejects(fs.access(path.join(contextDir, 'features', SLUG, '.dossier.lock')), 'no lockfile is left behind');
  });

  it('add-finding, the archive pass and compact wait for whoever holds the dossier lock', async (t) => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'aioson-dossier-held-'));
    t.after(() => fs.rm(root, { recursive: true, force: true }));
    const contextDir = path.join(root, '.aioson', 'context');
    await store.init({ slug: SLUG, contextDir, whyText: 'Billing needs exports.', whatText: 'CSV export of invoices.' });
    const { archiveTrail, compact } = require('../../src/dossier/dossier-compact');

    const release = await acquireLock(path.join(contextDir, 'features', SLUG), 'test-holder');
    const settled = [];
    const pending = [
      store.addFinding({ slug: SLUG, contextDir, agent: 'dev', section: 'Agent Trail', content: 'held back' }).then(() => settled.push('add')),
      archiveTrail({ slug: SLUG, contextDir, force: true }).then(() => settled.push('archive')),
      compact({ slug: SLUG, contextDir, force: true }).then(() => settled.push('compact'))
    ];
    await new Promise((resolve) => setTimeout(resolve, 150));
    assert.deepEqual(settled, [], 'nothing writes while the lock is held');
    assert.doesNotMatch(await fs.readFile(dossierPath(contextDir, SLUG), 'utf8'), /held back/);

    await release();
    await Promise.all(pending);
    assert.deepEqual([...settled].sort(), ['add', 'archive', 'compact']);
    assert.match(await fs.readFile(dossierPath(contextDir, SLUG), 'utf8'), /held back/);
  });

  it('a missing dossier is refused before any lock creates its folder', async (t) => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'aioson-dossier-missing-'));
    t.after(() => fs.rm(root, { recursive: true, force: true }));
    const contextDir = path.join(root, '.aioson', 'context');
    await assert.rejects(store.addFinding({ slug: SLUG, contextDir, agent: 'dev', section: 'Agent Trail', content: 'x' }), { code: 'EDOSSIERMISSING' });
    await assert.rejects(fs.access(path.join(contextDir, 'features', SLUG)));
  });
});
