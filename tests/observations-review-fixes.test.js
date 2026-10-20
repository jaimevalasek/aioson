'use strict';

/**
 * Observations, third pass — what the v1.74.0 review measured:
 *  - an item bound to a slug no live registry row owns (a typo, `project`,
 *    `completed`/`shipped`, a folder only under done/) reached no agent's fan
 *    and was never carried by any close;
 *  - a plan or promotion recorded against a path stayed settled forever,
 *    even after the plan was carried out and its file was gone;
 *  - `observe --reopen --detail=<new evidence>` dropped the evidence;
 *  - `--paths` given from a subfolder were stored as if given at the root;
 *  - the lock never expired for a holder whose PID was alive again, a stray
 *    file in the lock folder wedged it, and a reader holding the store open
 *    for ~400 ms made a write fail.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const fsSync = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');

const obs = require('../src/lib/observations');
const { withRegistryLock } = require('../src/lib/feature-registry-storage');
const { runObserve, runObservationList, runObservationResolve } = require('../src/commands/observe');

const LOCK = '.observations.lock';

function logger() {
  const lines = [];
  return { lines, log(value) { lines.push(String(value)); }, error(value) { lines.push(`ERR ${value}`); } };
}

async function write(dir, rel, body) {
  const full = path.join(dir, rel);
  await fs.mkdir(path.dirname(full), { recursive: true });
  await fs.writeFile(full, body, 'utf8');
}

async function makeProject(rows = ['| checkout | in_progress | 2026-10-01 | — |']) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'aioson-observations-review-'));
  await write(dir, '.aioson/config.md', '# project\n');
  await write(dir, '.aioson/context/project.context.md', '---\nproject_name: "demo"\nclassification: "SMALL"\n---\n\n# Context\n');
  await write(dir, '.aioson/context/project-pulse.md', '---\nlast_updated: 2026-10-20\nactive_feature: checkout\n---\n');
  await write(dir, '.aioson/context/features.md', `# Features\n\n| slug | status | started | completed |\n|------|--------|---------|-----------|\n${rows.join('\n')}\n`);
  return dir;
}

function cleanup(dir) {
  return fs.rm(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
}

function deadPid() {
  return Number(spawnSync(process.execPath, ['-e', 'process.stdout.write(String(process.pid))'], { encoding: 'utf8' }).stdout);
}

async function plantLock(dir, entries, { ageMs = 0 } = {}) {
  const lock = path.join(dir, '.aioson', 'context', LOCK);
  await fs.mkdir(lock, { recursive: true });
  for (const entry of entries) {
    const file = path.join(lock, entry);
    await fs.writeFile(file, '');
    if (ageMs) {
      const then = new Date(Date.now() - ageMs);
      await fs.utimes(file, then, then);
    }
  }
  return lock;
}

const marker = (pid) => `${pid}-${crypto.randomUUID()}.owner`;

// ── reach: a binding counts while its feature is live ───────────────────────

test('an item bound to a slug no live registry row owns ranks as project-wide in every fan and in --feature=project', async (t2) => {
  const dir = await makeProject([
    '| checkout | in_progress | 2026-10-01 | — |',
    '| facade | in_progress | 2026-10-05 | — |',
    '| legacy | completed | 2026-08-01 | 2026-09-01 |',
    '| shipped-one | shipped | 2026-08-01 | 2026-09-01 |'
  ]);
  t2.after(() => cleanup(dir));
  await write(dir, '.aioson/context/done/archived-only/README.md', '# archived\n');
  const projectWide = [];
  for (const [feature, kind] of [['chekout', 'defect'], ['project', 'risk'], ['legacy', 'defect'], ['shipped-one', 'risk'], ['archived-only', 'question']]) {
    projectWide.push((await obs.addObservation(dir, { kind, summary: `Bound to ${feature}, noticed beside the hall work`, feature })).item.id);
  }
  const live = await obs.addObservation(dir, { kind: 'defect', summary: 'The facade lights flicker at dusk', feature: 'facade' });

  const fan = await obs.fanFor(dir, 'dev', { feature: 'checkout', limit: 10 });
  assert.deepEqual(fan.items.map((item) => item.id).sort(), projectWide.slice().sort(), 'every non-live binding reaches the agent');
  assert.ok(!fan.items.some((item) => item.id === live.item.id), 'a live feature keeps its own items');
  assert.equal((await obs.fanFor(dir, 'quality', { limit: 10 })).total, 4, 'a brief with no feature hears them too');

  const listed = await obs.listObservations(dir, { status: 'open', feature: 'project' });
  assert.deepEqual(listed.items.map((item) => item.id).sort(), projectWide.slice().sort());
  assert.deepEqual((await obs.listObservations(dir, { status: 'open', feature: 'chekout' })).items.map((item) => item.feature), ['chekout'], 'the binding itself is kept');
});

test('observe with an explicit --feature that is not live records it and says once that it counts as project-wide', async (t2) => {
  const dir = await makeProject(['| checkout | in_progress | 2026-10-01 | — |', '| facade | in_progress | 2026-10-05 | — |']);
  t2.after(() => cleanup(dir));
  const out = logger();
  const typo = await runObserve({ args: [dir], options: { kind: 'defect', summary: 'Login button overlaps the footer on mobile', feature: 'chekout', agent: 'qa' }, logger: out });
  assert.equal(typo.ok, true);
  assert.equal(typo.feature, 'chekout');
  assert.equal(typeof typo.note, 'string');
  assert.ok(typo.note.length > 0);
  // The key reads as its own text until the locale files carry it.
  if (typo.note !== 'observe.feature_not_live') assert.match(typo.note, /chekout/);
  assert.equal(out.lines[1], `  ${typo.note}`, out.lines.join('\n'));

  const json = await runObserve({ args: [dir], options: { kind: 'risk', summary: 'The north scaffold has no toe boards', feature: 'project', json: true }, logger: logger() });
  assert.ok(json.note, 'the --json payload carries the note');

  for (const options of [{ feature: 'facade' }, {}]) {
    const quiet = logger();
    const recorded = await runObserve({ args: [dir], options: { kind: 'idea', summary: `A wooden handrail for ${options.feature || 'the active feature'}`, ...options }, logger: quiet });
    assert.equal(recorded.note, null, JSON.stringify(options));
    assert.match(quiet.lines[1], /^ {2}next:/);
  }
});

// ── settled outcomes ────────────────────────────────────────────────────────

test('a plan or promotion recorded against a path holds while the path exists and reopens once it is gone', async (t2) => {
  const dir = await makeProject();
  t2.after(() => cleanup(dir));
  await write(dir, 'plans/simple-plan-avatar.md', '# Simple plan — avatar upload\n');
  const summary = 'Avatar upload fails after the storage change';
  const { item } = await obs.addObservation(dir, { kind: 'defect', summary });
  await obs.resolveObservation(dir, { id: item.id, as: 'planned', ref: 'plans/simple-plan-avatar.md' });

  const during = await obs.addObservation(dir, { kind: 'defect', summary });
  assert.equal(during.reopened, false, 'the plan is still there');
  assert.equal(during.settled, true);

  await fs.rm(path.join(dir, 'plans', 'simple-plan-avatar.md'));
  const after = await obs.addObservation(dir, { kind: 'defect', summary });
  assert.equal(after.reopened, true, 'the plan was carried out and the defect is still seen');
  assert.equal(after.item.history.at(-1).as, 'planned');

  await write(dir, '.aioson/rules/cement.md', '# rule\n');
  const process_ = await obs.addObservation(dir, { kind: 'process', summary: 'Deliver the cement next to the mixer next time' });
  await obs.resolveObservation(dir, { id: process_.item.id, as: 'promoted', ref: '.aioson/rules/cement.md' });
  assert.equal((await obs.addObservation(dir, { kind: 'process', summary: 'Deliver the cement next to the mixer next time' })).reopened, false);
  await fs.rm(path.join(dir, '.aioson', 'rules', 'cement.md'));
  assert.equal((await obs.addObservation(dir, { kind: 'process', summary: 'Deliver the cement next to the mixer next time' })).reopened, true);
});

test('--reopen with new evidence keeps the earlier detail, appends the new one and records it in the history', async (t2) => {
  const dir = await makeProject();
  t2.after(() => cleanup(dir));
  const summary = 'Tile in the hall cracked after the floor was laid';
  const { item } = await obs.addObservation(dir, { kind: 'defect', summary, detail: 'a hairline crack near the door' });
  await obs.resolveObservation(dir, { id: item.id, as: 'dismissed', why: 'cosmetic' });

  const reopened = await runObserve({ args: [dir], options: { kind: 'defect', summary, detail: 'it now trips people', reopen: true }, logger: logger() });
  assert.equal(reopened.reopened, true);
  const stored = (await obs.readStore(dir)).store.items.find((entry) => entry.id === item.id);
  assert.equal(stored.detail, 'a hairline crack near the door · it now trips people');
  assert.equal(stored.history.at(-1).as, 'dismissed');
  assert.equal(stored.history.at(-1).detail, 'it now trips people');

  // A long earlier detail gives way: the new evidence is kept whole.
  await obs.resolveObservation(dir, { id: item.id, as: 'fixed' });
  const evidence = Array(5).fill('the crack reopened along the grout line').join(' ');
  await write(dir, obs.RELATIVE_PATH, JSON.stringify({
    schema_version: obs.SCHEMA_VERSION,
    items: [{ ...stored, status: 'resolved', resolution: { as: 'fixed', by: 'owner', at: new Date().toISOString() }, detail: 'y'.repeat(1190) }]
  }));
  const back = await obs.addObservation(dir, { kind: 'defect', summary, detail: evidence });
  assert.equal(back.reopened, true);
  assert.ok(back.item.detail.length <= 1200, String(back.item.detail.length));
  assert.ok(back.item.detail.endsWith(evidence));
  assert.match(back.item.detail, /^y+… · /);
});

// ── paths ───────────────────────────────────────────────────────────────────

test('relative --paths given from a subfolder are anchored there before the store makes them root-relative', async (t2) => {
  const dir = await makeProject();
  t2.after(() => cleanup(dir));
  await write(dir, 'web/src/app.js', 'module.exports = 1;\n');
  const recorded = await runObserve({ args: [path.join(dir, 'web')], options: { kind: 'defect', summary: 'The web app boots without its env file', paths: 'src/app.js, ../src/hall.js' }, logger: logger() });
  assert.equal(recorded.ok, true);
  assert.equal(recorded.path, obs.RELATIVE_PATH, 'the store stays at the project root');
  const stored = (await obs.readStore(dir)).store.items.find((entry) => entry.id === recorded.id);
  assert.deepEqual(stored.paths, ['web/src/app.js', 'src/hall.js']);
  const atRoot = await runObserve({ args: [dir], options: { kind: 'risk', summary: 'The hall script has no tests at all', paths: 'src/hall.js' }, logger: logger() });
  assert.deepEqual((await obs.readStore(dir)).store.items.find((entry) => entry.id === atRoot.id).paths, ['src/hall.js'], 'from the root nothing changes');
});

test('observation:resolve --ref given from a subfolder is read there; a bare feature slug stays a slug', async (t2) => {
  const dir = await makeProject(['| checkout | in_progress | 2026-10-01 | — |', '| checkout-v2.0 | in_progress | 2026-10-02 | — |']);
  t2.after(() => cleanup(dir));
  await write(dir, 'web/plans/simple-plan-env.md', '# plan\n');
  await write(dir, 'web/NOTES.md', '# notes\n');
  const web = path.join(dir, 'web');
  const settle = async (summary, options, args = [web]) => {
    const { item } = await obs.addObservation(dir, { kind: 'defect', summary });
    return runObservationResolve({ args, options: { id: item.id, ...options }, logger: logger() });
  };

  const planned = await settle('The web app boots without its env file', { as: 'planned', ref: 'plans/simple-plan-env.md' });
  assert.equal(planned.ok, true, planned.error);
  assert.equal(planned.resolution.ref, 'web/plans/simple-plan-env.md', 'stored relative to the root');
  assert.equal((await settle('The web notes are grouped by nothing', { as: 'promoted', ref: 'NOTES.md' })).resolution.ref, 'web/NOTES.md', 'a bare name that is a file here is that file');
  assert.equal((await settle('The cart badge shows a stale count', { as: 'promoted', ref: 'checkout-v2.0' })).resolution.ref, 'checkout-v2.0', 'a feature slug is never anchored');
  const outside = await settle('The hall script has no tests at all', { as: 'planned', ref: '../../elsewhere/plan.md' });
  assert.equal(outside.ok, false);
  assert.match(outside.error, /outside the project/);

  await write(dir, 'plans/root-plan.md', '# plan\n');
  assert.equal((await settle('Avatar upload fails after the storage change', { as: 'planned', ref: 'plans/root-plan.md' }, [dir])).resolution.ref, 'plans/root-plan.md', 'from the root nothing changes');
});

test('observation:list shows how often a settled item was seen again, in text and in --json', async (t2) => {
  const dir = await makeProject();
  t2.after(() => cleanup(dir));
  const summary = 'Tile in the hall cracked after the floor was laid';
  const { item } = await obs.addObservation(dir, { kind: 'defect', summary });
  await obs.resolveObservation(dir, { id: item.id, as: 'dismissed', why: 'cosmetic' });
  await obs.addObservation(dir, { kind: 'defect', summary });
  await obs.addObservation(dir, { kind: 'defect', summary });
  const once = await obs.addObservation(dir, { kind: 'idea', summary: 'A wooden handrail on the stairs' });
  await obs.resolveObservation(dir, { id: once.item.id, as: 'dismissed', why: 'out of budget' });

  const out = logger();
  await runObservationList({ args: [dir], options: { resolved: true }, logger: out });
  const line = out.lines.find((entry) => entry.includes(item.id));
  assert.match(line, /^ {2}◼ OBS-[0-9a-f]+ .* → dismissed — cosmetic \(owner, \d{4}-\d{2}-\d{2}\) · seen 3×$/, out.lines.join('\n'));
  assert.ok(!out.lines.find((entry) => entry.includes(once.item.id)).includes('seen'), 'seen once says nothing');

  const json = await runObservationList({ args: [dir], options: { all: true, json: true }, logger: logger() });
  assert.equal(json.items.find((entry) => entry.id === item.id).seen, 3);
  assert.equal(json.items.find((entry) => entry.id === once.item.id).seen, 1);
});

test('observation:resolve --help says which outcomes stay settled when the item is seen again', async () => {
  const out = logger();
  await runObservationResolve({ args: [], options: { help: true }, logger: out });
  const text = out.lines.join('\n');
  assert.doesNotMatch(text, /A settled item that is observed again reopens/);
  assert.match(text, /a dismissed or answered one stays settled in any feature/);
  assert.match(text, /plan path is gone or its feature has closed/);
});

// ── the lock and the write ──────────────────────────────────────────────────

test('a lock marker older than 30 s is stale even when its PID is alive again; the next writer proceeds', async (t2) => {
  const dir = await makeProject();
  t2.after(() => cleanup(dir));
  // This process stands in for a PID that was reused after the holder died.
  const lock = await plantLock(dir, [marker(process.pid)], { ageMs: 60_000 });
  const started = Date.now();
  const { item } = await obs.addObservation(dir, { kind: 'idea', summary: 'A stale lock never wedges the hub' });
  assert.ok(Date.now() - started < 5000, `took ${Date.now() - started} ms`);
  assert.ok((await obs.readStore(dir)).store.items.some((entry) => entry.id === item.id));
  assert.equal(fsSync.existsSync(lock), false, 'the stale lock is gone');
});

test('a stray file beside a dead or missing owner no longer wedges the lock', async (t2) => {
  const dir = await makeProject();
  t2.after(() => cleanup(dir));
  await plantLock(dir, [marker(deadPid()), 'Thumbs.db']);
  await obs.addObservation(dir, { kind: 'idea', summary: 'A thumbnail cache never wedges the hub' });
  await plantLock(dir, ['desktop.ini']);
  await obs.addObservation(dir, { kind: 'idea', summary: 'An ownerless lock folder is reaped too' });
  assert.equal((await obs.readStore(dir)).store.items.length, 2);
});

test('a fresh live holder still blocks; the timeout names the lock folder and the way out', async (t2) => {
  const dir = await makeProject();
  t2.after(() => cleanup(dir));
  const lock = await plantLock(dir, [marker(process.pid)]);
  await assert.rejects(
    withRegistryLock(path.join(dir, '.aioson', 'context'), () => assert.fail('entered a held lock'), { name: LOCK, timeoutMs: 150, pollMs: 10 }),
    (error) => error.code === 'EFEATURELOCK' && error.message.includes(lock) && /if none is running, delete that folder and retry/.test(error.message)
  );
  assert.equal(fsSync.existsSync(lock), true, 'a live holder keeps its lock');
});

test('a reader holding the store open for ~0.7 s delays a write instead of failing it', async (t2) => {
  const dir = await makeProject();
  t2.after(() => cleanup(dir));
  await obs.addObservation(dir, { kind: 'idea', summary: 'The first item creates the store' });
  // On Windows an open handle refuses the replacing rename (EPERM) until it closes.
  const fd = fsSync.openSync(path.join(dir, obs.RELATIVE_PATH), 'r');
  let held = true;
  const release = () => { if (held) { held = false; fsSync.closeSync(fd); } };
  const closer = setTimeout(release, 700);
  t2.after(() => { clearTimeout(closer); release(); });
  const { item } = await obs.addObservation(dir, { kind: 'idea', summary: 'The second item waits for the reader' });
  assert.ok((await obs.readStore(dir)).store.items.some((entry) => entry.id === item.id));
});
