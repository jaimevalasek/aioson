'use strict';

/**
 * Observations — the project's working memory for what an agent notices
 * outside its current scope. The failure this guards against: a defect seen
 * beside the feature, an idea for the next one, a process gap, a risk, a
 * question for a later stage — lived only in the conversation that saw it,
 * so it was either "fixed in passing" outside the approved scope or dropped
 * at the next compaction. Every carrier was narrower (op:capture, decide,
 * continuity.md, delivery followups, learnings). Now one call records it, the
 * surfaces the owner and the next agent already read show it, close carries
 * it instead of deleting it, and settling it needs a real outcome.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const obs = require('../src/lib/observations');
const { runObserve, runObservationList, runObservationResolve } = require('../src/commands/observe');
const { runWorkflowStatus } = require('../src/commands/workflow-status');
const { runContextBrief } = require('../src/commands/context-brief');
const { runHygieneScan } = require('../src/commands/hygiene-scan');
const { buildCompactionRecap } = require('../src/lib/compaction-recap');
const { buildRecapResponse } = require('../src/commands/hooks-recap');
const { createTranslator } = require('../src/i18n');
const { MANAGED_FILES } = require('../src/constants');
const { buildBlock } = require('../src/gateway-pointer-merge');

const ROOT = path.resolve(__dirname, '..');
const CLI = path.join(ROOT, 'bin', 'aioson.js');
const { t } = createTranslator('en');
const DAY = 24 * 60 * 60 * 1000;

function logger() {
  const lines = [];
  return { lines, log(value) { lines.push(String(value)); }, error(value) { lines.push(`ERR ${value}`); } };
}

async function write(dir, rel, body) {
  const full = path.join(dir, rel);
  await fs.mkdir(path.dirname(full), { recursive: true });
  await fs.writeFile(full, body, 'utf8');
}

async function makeProject({ activeFeature = 'checkout' } = {}) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'aioson-observations-'));
  await write(dir, '.aioson/config.md', '# project\n');
  await write(dir, '.aioson/context/project.context.md', [
    '---', 'project_name: "demo"', 'project_type: "web_app"', 'profile: "developer"', 'framework: "Next.js"',
    'framework_installed: true', 'classification: "SMALL"', 'conversation_language: "en"', 'aioson_version: "1.72.1"', '---', '', '# Context'
  ].join('\n'));
  await write(dir, '.aioson/context/project-pulse.md', `---\nlast_updated: 2026-10-20\nactive_feature: ${activeFeature}\n---\n\n# Project Pulse\n`);
  await write(dir, '.aioson/context/features.md', '# Features\n\n| slug | status | started | completed |\n|------|--------|---------|-----------|\n| checkout | in_progress | 2026-10-01 | — |\n');
  await write(dir, 'src/hall.js', 'module.exports = 1;\n');
  return dir;
}

function cleanup(dir) {
  return fs.rm(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
}

// ── the store ───────────────────────────────────────────────────────────────

test('observe records one typed line; a repeat raises seen, a settled one reopens with its history kept', async (t2) => {
  const dir = await makeProject();
  t2.after(() => cleanup(dir));
  const first = await obs.addObservation(dir, { kind: 'defect', summary: 'Tile in the hall cracked after the floor was laid', paths: 'src/hall.js, src\\floor.js', feature: 'checkout', agent: '@dev' });
  assert.equal(first.created, true);
  assert.match(first.item.id, /^OBS-[0-9a-f]{6}$/);
  assert.deepEqual(first.item.paths, ['src/hall.js', 'src/floor.js']);
  assert.equal(first.item.agent, 'dev');
  assert.equal(first.item.status, 'open');

  // Same summary, accents and punctuation aside: one item, seen twice.
  const again = await obs.addObservation(dir, { kind: 'defect', summary: 'Tile in the hall cracked, after the floor was laid!', agent: 'qa' });
  assert.equal(again.created, false);
  assert.equal(again.item.id, first.item.id);
  assert.equal(again.item.seen, 2);
  assert.equal(again.item.agent, 'dev', 'the first reporter stays on record');

  const settled = await obs.resolveObservation(dir, { id: first.item.id, as: 'dismissed', why: 'cosmetic, owner accepted it', by: 'owner' });
  assert.equal(settled.item.status, 'resolved');
  assert.equal(settled.item.resolution.as, 'dismissed');

  const back = await obs.addObservation(dir, { kind: 'defect', summary: 'Tile in the hall cracked after the floor was laid' });
  assert.equal(back.reopened, true);
  assert.equal(back.item.status, 'open');
  assert.equal(back.item.resolution, null);
  assert.equal(back.item.history.length, 1);
  assert.equal(back.item.history[0].as, 'dismissed');

  const raw = JSON.parse(await fs.readFile(path.join(dir, obs.RELATIVE_PATH), 'utf8'));
  assert.equal(raw.schema_version, obs.SCHEMA_VERSION);
  assert.equal(raw.items.length, 1);
});

test('observe validates the kind and the summary, and redacts a secret on write', async (t2) => {
  const dir = await makeProject();
  t2.after(() => cleanup(dir));
  await assert.rejects(obs.addObservation(dir, { kind: 'bug', summary: 'something broke somewhere' }), /--kind must be one of: defect, idea, process, risk, question/);
  await assert.rejects(obs.addObservation(dir, { kind: 'idea', summary: 'short' }), /--summary needs at least 8 characters/);
  const noted = await obs.addObservation(dir, { kind: 'risk', summary: 'The webhook calls the vendor with api_key=sk_live_1234567890abcdef in the query string' });
  assert.doesNotMatch(noted.item.summary, /sk_live_1234567890abcdef/);
  assert.match(noted.item.summary, /REDACTED/);
});

test('a corrupt store is reported by readers and refused by writers, never overwritten', async (t2) => {
  const dir = await makeProject();
  t2.after(() => cleanup(dir));
  await write(dir, obs.RELATIVE_PATH, '{ not json');
  const listed = await obs.listObservations(dir);
  assert.deepEqual(listed.items, []);
  assert.match(listed.error, /invalid JSON/);
  await assert.rejects(obs.addObservation(dir, { kind: 'idea', summary: 'a reorder button on order history' }), /unreadable/);
  assert.equal(await fs.readFile(path.join(dir, obs.RELATIVE_PATH), 'utf8'), '{ not json', 'the corrupt file is left for the owner to look at');
});

test('resolve needs a real outcome: dismissed/answered carry a why, planned/promoted point at something that exists', async (t2) => {
  const dir = await makeProject();
  t2.after(() => cleanup(dir));
  const { item } = await obs.addObservation(dir, { kind: 'defect', summary: 'Avatar upload fails after the storage change' });
  await assert.rejects(obs.resolveObservation(dir, { id: item.id, as: 'dismissed' }), /needs --why/);
  await assert.rejects(obs.resolveObservation(dir, { id: item.id, as: 'answered' }), /needs --why/);
  await assert.rejects(obs.resolveObservation(dir, { id: item.id, as: 'planned' }), /needs --ref/);
  await assert.rejects(obs.resolveObservation(dir, { id: item.id, as: 'promoted', ref: 'nowhere/plan.md' }), /path does not exist/);
  await assert.rejects(obs.resolveObservation(dir, { id: item.id, as: 'promoted', ref: 'no-such-feature' }), /neither an existing path nor a known feature slug/);
  await assert.rejects(obs.resolveObservation(dir, { id: item.id, as: 'promoted', ref: '../outside.md' }), /outside the project/);
  await assert.rejects(obs.resolveObservation(dir, { id: 'OBS-000000', as: 'fixed' }), /not on record/);
  await assert.rejects(obs.resolveObservation(dir, { id: item.id, as: 'done' }), /--as must be one of/);

  await write(dir, '.aioson/context/simple-plans/avatar-upload.md', '---\nstatus: pending\n---\n# plan\n');
  const planned = await obs.resolveObservation(dir, { id: item.id, as: 'planned', ref: '.aioson/context/simple-plans/avatar-upload.md', by: '@dev' });
  assert.equal(planned.item.resolution.ref, '.aioson/context/simple-plans/avatar-upload.md');
  assert.equal(planned.item.resolution.by, 'dev');

  // A feature slug known to features.md is a valid promotion target; a re-resolve keeps the earlier outcome as history.
  const promoted = await obs.resolveObservation(dir, { id: item.id, as: 'promoted', ref: 'checkout' });
  assert.equal(promoted.superseded, true);
  assert.equal(promoted.item.history[0].as, 'planned');
});

test('the fan: counts by kind, stale after 30 days, each agent sees the kinds that address it on its feature or paths', async (t2) => {
  const dir = await makeProject();
  t2.after(() => cleanup(dir));
  const now = Date.parse('2026-10-20T12:00:00Z');
  const old = now - 45 * DAY;
  await obs.addObservation(dir, { kind: 'defect', summary: 'Tile in the hall cracked after the floor was laid', paths: 'src/hall.js', feature: 'checkout' }, { now: old });
  await obs.addObservation(dir, { kind: 'idea', summary: 'The stairs would be safer with one more step', feature: 'checkout' }, { now });
  await obs.addObservation(dir, { kind: 'process', summary: 'Deliver the cement next to the mixer next time' }, { now });
  await obs.addObservation(dir, { kind: 'risk', summary: 'The scaffold on the east wall wobbles under load', feature: 'facade' }, { now });
  await obs.addObservation(dir, { kind: 'question', summary: 'Phase 4 must pick mixer or floor for the mortar', feature: 'checkout' }, { now });

  const summary = await obs.summarizeOpen(dir, { now });
  assert.equal(summary.total, 5);
  assert.deepEqual(summary.by_kind, { defect: 1, idea: 1, process: 1, risk: 1, question: 1 });
  assert.equal(summary.stale, 1);
  assert.equal(obs.describeByKind(summary.by_kind), 'defect 1, idea 1, process 1, risk 1, question 1');

  const ids = (items) => items.map((item) => item.kind).sort();
  // dev on checkout: its defect and its question; not the facade risk, not the idea, never the process item.
  assert.deepEqual(ids(await obs.observationsForAgent(dir, '@dev', { feature: 'checkout', now })), ['defect', 'question']);
  // dev on another feature touching the defect's path still hears about the defect.
  assert.deepEqual(ids(await obs.observationsForAgent(dir, 'dev', { feature: 'facade', paths: 'src/hall.js', now })), ['defect', 'risk']);
  // product scoping the next feature sees the idea wherever it was noticed, and nothing feature-bound.
  assert.deepEqual(ids(await obs.observationsForAgent(dir, 'product', { now })), ['idea']);
  // pentester hears risks only; nobody is addressed by a process item.
  assert.deepEqual(ids(await obs.observationsForAgent(dir, 'pentester', { feature: 'facade', now })), ['risk']);
  assert.deepEqual(await obs.observationsForAgent(dir, 'neo', { now }), []);

  const stale = await obs.staleObservations(dir, { now });
  assert.equal(stale.length, 1);
  assert.equal(stale[0].kind, 'defect');
  assert.match(stale[0].reason, /open for 45 days/);
  assert.match(stale[0].reason, /observation:resolve \. --id=OBS-/);

  const recent = await obs.recentObservations(dir, { now, hours: 24 });
  assert.equal(recent.length, 4, 'the 45-day-old item is not recent');
});

test('closing a feature carries its open observations to the project hub and keeps where they came from', async (t2) => {
  const dir = await makeProject();
  t2.after(() => cleanup(dir));
  await obs.addObservation(dir, { kind: 'defect', summary: 'Tile in the hall cracked after the floor was laid', feature: 'checkout' });
  await obs.addObservation(dir, { kind: 'idea', summary: 'The stairs would be safer with one more step', feature: 'checkout' });
  const kept = await obs.addObservation(dir, { kind: 'risk', summary: 'The scaffold on the east wall wobbles under load', feature: 'facade' });
  const { item: settled } = await obs.addObservation(dir, { kind: 'question', summary: 'Phase 4 must pick mixer or floor for the mortar', feature: 'checkout' });
  await obs.resolveObservation(dir, { id: settled.id, as: 'answered', why: 'mixer' });

  assert.equal((await obs.openForFeature(dir, 'checkout')).length, 2);
  const carry = await obs.carryFeatureObservations(dir, 'checkout');
  assert.deepEqual(carry.carried.map((item) => item.kind).sort(), ['defect', 'idea']);

  const all = await obs.listObservations(dir, { status: 'all' });
  assert.equal(all.items.length, 4, 'nothing was deleted');
  for (const item of all.items.filter((entry) => carry.carried.some((c) => c.id === entry.id))) {
    assert.equal(item.feature, null);
    assert.equal(item.origin_feature, 'checkout');
    assert.equal(item.status, 'open');
  }
  assert.equal(all.items.find((item) => item.id === kept.item.id).feature, 'facade', 'another feature keeps its binding');
  assert.equal((await obs.listObservations(dir, { status: 'open', feature: 'project' })).items.length, 2);
  assert.deepEqual((await obs.carryFeatureObservations(dir, 'checkout')).carried, [], 'a second close carries nothing');
});

// ── the commands ─────────────────────────────────────────────────────────────

test('observe defaults the feature to the active one and reports the next step; list groups the fan; resolve records the outcome', async (t2) => {
  const dir = await makeProject();
  t2.after(() => cleanup(dir));
  const out = logger();
  const recorded = await runObserve({ args: [dir], options: { kind: 'idea', summary: 'Order history could offer a reorder button', agent: 'qa' }, logger: out });
  assert.equal(recorded.ok, true);
  assert.equal(recorded.feature, 'checkout');
  assert.equal(recorded.created, true);
  assert.match(out.lines[0], /observe — OBS-[0-9a-f]{6} \(idea\) recorded · feature checkout · @qa/);
  assert.match(out.lines[1], /next: offer it to @product\/@briefing/);
  assert.match(out.lines[2], /aioson observation:resolve \. --id=OBS-/);

  const invalid = await runObserve({ args: [dir], options: { kind: 'idea' }, logger: logger() });
  assert.equal(invalid.ok, false);
  assert.equal(invalid.exitCode, 1);

  const list = logger();
  const listed = await runObservationList({ args: [dir], options: {}, logger: list });
  assert.equal(listed.open, 1);
  assert.match(list.lines[0], /observations — 1 open \(idea 1\)/);
  assert.match(list.lines[1], /^idea \(1\) — next:/);
  assert.match(list.lines[2], /◻ OBS-[0-9a-f]{6} 0d Order history could offer a reorder button \(feature checkout · @qa\)/);

  const json = await runObservationList({ args: [dir], options: { json: true, kind: 'idea' }, logger: logger() });
  assert.equal(json.items.length, 1);
  assert.equal(json.items[0].next_step, obs.NEXT_STEP.idea);
  const badKind = await runObservationList({ args: [dir], options: { kind: 'bug' }, logger: logger() });
  assert.equal(badKind.exitCode, 1);

  const resolved = await runObservationResolve({ args: [dir], options: { id: recorded.id, as: 'promoted', ref: 'checkout', by: 'owner' }, logger: logger() });
  assert.equal(resolved.ok, true);
  assert.equal(resolved.resolution.as, 'promoted');
  const refused = await runObservationResolve({ args: [dir], options: { id: recorded.id, as: 'dismissed' }, logger: logger() });
  assert.equal(refused.exitCode, 1);
  assert.match(refused.error, /needs --why/);

  const empty = logger();
  await runObservationList({ args: [dir], options: {}, logger: empty });
  assert.match(empty.lines[0], /nothing open/);
  const all = await runObservationList({ args: [dir], options: { all: true, json: true }, logger: logger() });
  assert.equal(all.resolved, 1);
});

test('the spawned binary: a validation failure exits 1, a record exits 0 with JSON, --help answers without a store', async (t2) => {
  const dir = await makeProject();
  t2.after(() => cleanup(dir));
  const run = (argv) => spawnSync(process.execPath, [CLI, ...argv], { cwd: dir, encoding: 'utf8', env: { ...process.env, AIOSON_AGENT: '' } });
  const missing = run(['observe', dir, '--kind=risk']);
  assert.equal(missing.status, 1);
  assert.match(missing.stderr, /--summary needs at least/);
  const ok = run(['observe', dir, '--kind=risk', '--summary=The scaffold on the east wall wobbles under load', '--json']);
  assert.equal(ok.status, 0, ok.stderr);
  const payload = JSON.parse(ok.stdout);
  assert.equal(payload.kind, 'risk');
  assert.equal(payload.feature, 'checkout');
  const help = run(['observation:resolve', dir, '--help']);
  assert.equal(help.status, 0, help.stderr);
  assert.match(help.stdout, /planned\/promoted need an existing --ref/);
  const listed = run(['observation:list', dir, '--json']);
  assert.equal(listed.status, 0, listed.stderr);
  assert.equal(JSON.parse(listed.stdout).open, 1);
});

// ── the surfaces ─────────────────────────────────────────────────────────────

test('workflow:status carries the fan for the owner and for @neo', async (t2) => {
  const dir = await makeProject();
  t2.after(() => cleanup(dir));
  await obs.addObservation(dir, { kind: 'defect', summary: 'Tile in the hall cracked after the floor was laid', feature: 'checkout' });
  await obs.addObservation(dir, { kind: 'idea', summary: 'The stairs would be safer with one more step' });
  const out = logger();
  const status = await runWorkflowStatus({ args: [dir], options: {}, logger: out, t });
  assert.equal(status.openObservations.total, 2);
  assert.deepEqual(status.openObservations.by_kind, { defect: 1, idea: 1, process: 0, risk: 0, question: 0 });
  assert.equal(status.openObservations.items.length, 2);
  assert.ok(out.lines.some((line) => line.includes('Open observations: 2 (defect 1, idea 1) (aioson observation:list .)')), out.lines.join('\n'));
});

test('context:brief hands each agent its share of the fan, with the next step, in text and JSON', async (t2) => {
  const dir = await makeProject();
  t2.after(() => cleanup(dir));
  await obs.addObservation(dir, { kind: 'defect', summary: 'Tile in the hall cracked after the floor was laid', paths: 'src/hall.js', feature: 'checkout' });
  await obs.addObservation(dir, { kind: 'idea', summary: 'The stairs would be safer with one more step', feature: 'checkout' });
  await obs.addObservation(dir, { kind: 'process', summary: 'Deliver the cement next to the mixer next time' });

  const dev = logger();
  const devBrief = await runContextBrief({ args: [dir], options: { agent: 'dev', mode: 'executing', feature: 'checkout', task: 'plaster the hall wall', paths: 'src/hall.js', 'no-semantic': true, 'no-recall': true }, logger: dev });
  assert.deepEqual(devBrief.observations.map((item) => item.kind), ['defect']);
  const header = dev.lines.findIndex((line) => line.startsWith('Open observations for you (1)'));
  assert.ok(header > 0, dev.lines.join('\n'));
  assert.match(dev.lines[header + 1], /^- OBS-[0-9a-f]{6} \(defect, 0d\) Tile in the hall cracked after the floor was laid \[src\/hall\.js\] → fix it through a Simple Plan/);

  const productBrief = await runContextBrief({ args: [dir], options: { agent: 'product', mode: 'planning', task: 'scope the next feature', 'no-semantic': true, 'no-recall': true, json: true }, logger: logger() });
  assert.deepEqual(productBrief.observations.map((item) => item.kind), ['idea'], 'an idea reaches product wherever it was noticed');

  const quiet = logger();
  await runContextBrief({ args: [dir], options: { agent: 'neo', mode: 'planning', task: 'route', 'no-semantic': true, 'no-recall': true }, logger: quiet });
  assert.ok(!quiet.lines.some((line) => line.startsWith('Open observations')), 'a process item addresses no agent');
});

test('hygiene:scan names the observations nobody settled in 30 days', async (t2) => {
  const dir = await makeProject();
  t2.after(() => cleanup(dir));
  const old = Date.now() - 40 * DAY;
  await obs.addObservation(dir, { kind: 'risk', summary: 'The scaffold on the east wall wobbles under load' }, { now: old });
  await obs.addObservation(dir, { kind: 'idea', summary: 'The stairs would be safer with one more step' });
  const scan = await runHygieneScan({ args: [dir], options: { json: true }, logger: logger() });
  assert.equal(scan.buckets.stale_observations.length, 1);
  assert.equal(scan.buckets.stale_observations[0].path, obs.RELATIVE_PATH);
  assert.match(scan.buckets.stale_observations[0].reason, /open for 40 days/);
  assert.equal(scan.summary.counts.stale_observations, 1);
});

test('the post-compaction recap lists what was put on record in the last 24 hours, with or without a hook session', async (t2) => {
  const recap = buildCompactionRecap({
    events: [],
    observations: [
      { id: 'OBS-abc123', kind: 'defect', status: 'open', summary: 'Tile in the hall cracked after the floor was laid' },
      { id: 'OBS-def456', kind: 'process', status: 'resolved', summary: 'Deliver the cement next to the mixer next time' }
    ]
  });
  assert.match(recap, /Observations on record \(last 24h, aioson observation:list \.\): OBS-abc123 \(defect\) Tile in the hall cracked after the floor was laid; OBS-def456 \(process, settled\) Deliver the cement/);

  const dir = await makeProject();
  t2.after(() => cleanup(dir));
  await obs.addObservation(dir, { kind: 'question', summary: 'Phase 4 must pick mixer or floor for the mortar' });
  const saved = { key: process.env.AIOSON_LIVE_SESSION_KEY, session: process.env.AIOSON_LIVE_SESSION };
  delete process.env.AIOSON_LIVE_SESSION_KEY;
  delete process.env.AIOSON_LIVE_SESSION;
  try {
    const response = await buildRecapResponse(dir, null, { when: 'always', source: 'opencode' });
    assert.match(response.additionalContext, /OBS-[0-9a-f]{6} \(question\) Phase 4 must pick mixer or floor/);
  } finally {
    if (saved.key !== undefined) process.env.AIOSON_LIVE_SESSION_KEY = saved.key;
    if (saved.session !== undefined) process.env.AIOSON_LIVE_SESSION = saved.session;
  }
});

// ── the kernels, the doc, the corpus ─────────────────────────────────────────

test('every gateway kernel carries the one-line capture directive, inside budget, and the installed copies match', async () => {
  for (const name of ['CLAUDE.md', 'AGENTS.md', 'OPENCODE.md']) {
    const template = await fs.readFile(path.join(ROOT, 'template', name), 'utf8');
    assert.match(template, /Anything noticed outside the current scope is never fixed in passing nor dropped: `aioson observe \. --kind=<defect\|idea\|process\|risk\|question> --summary="<one line>"`\./, name);
    const installed = buildBlock(template);
    assert.ok(installed.length < 4000, `${name} installed is ${installed.length} chars`);
    assert.equal(await fs.readFile(path.join(ROOT, name), 'utf8'), installed, `${name} at the repo root drifted from its template block`);
  }
});

test('@neo reads the fan from the engine and prints it, never settling an item; the routed doc ships, is managed and mirrored', async () => {
  const neo = await fs.readFile(path.join(ROOT, 'template', '.aioson', 'agents', 'neo.md'), 'utf8');
  assert.match(neo, /`openObservations`/);
  assert.match(neo, /Observations: \{openObservations\.total by kind, stale count, or none\}/);
  assert.match(neo, /Neo never settles one/);
  assert.equal(await fs.readFile(path.join(ROOT, '.aioson', 'agents', 'neo.md'), 'utf8'), neo);

  const doc = await fs.readFile(path.join(ROOT, 'template', '.aioson', 'docs', 'observations.md'), 'utf8');
  assert.match(doc, /^load_tier: trigger$/m);
  assert.match(doc, /aioson observe \. --kind=<defect\|idea\|process\|risk\|question>/);
  assert.match(doc, /never create scope, grant approval, satisfy a workflow gate/);
  assert.ok(MANAGED_FILES.includes('.aioson/docs/observations.md'));
  assert.equal(await fs.readFile(path.join(ROOT, '.aioson', 'docs', 'observations.md'), 'utf8'), doc);

  const evals = JSON.parse(await fs.readFile(path.join(ROOT, 'template', '.aioson', 'evals', 'observations.evals.json'), 'utf8'));
  assert.ok(evals.scenarios.filter((s) => s.expect).length >= 4, 'positive scenarios for dev, qa, product and a pt-BR task');
  assert.ok(evals.scenarios.filter((s) => s.absent).length >= 2, 'negatives keep the doc quiet on unrelated work');
});
