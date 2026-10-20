'use strict';

/**
 * Observations, second pass — the review of bacf6b17 measured each of these
 * on the real binary: a feature close pushed the next feature's own items
 * out of its agents' fan; `observe .` from a subfolder scaffolded a parasite
 * project; agent:done and agent:prompt dropped the handoff list; a FAIL close
 * unbound items of a feature still being corrected; items bound to an
 * abandoned feature vanished from every fan; any word of features.md passed
 * as a resolve ref; a hand-edited shape crashed the list and the brief; a
 * secret crossing the 240-char cut was stored as a prefix; absolute paths
 * never overlapped; the owner's settle was credited to the last agent that
 * briefed; an unreadable store listed as "nothing open" with exit 0.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const obs = require('../src/lib/observations');
const { runObserve, runObservationList, runObservationResolve, defaultFeature } = require('../src/commands/observe');
const { runContextBrief } = require('../src/commands/context-brief');
const { runHygieneScan } = require('../src/commands/hygiene-scan');
const { runFeatureClose } = require('../src/commands/feature-close');
const { runFeatureRegister } = require('../src/commands/feature-registry');
const { runPulseUpdate } = require('../src/commands/pulse-update');
const { runWorkflowNext } = require('../src/commands/workflow-next');
const { runAgentPrompt } = require('../src/commands/agents');
const { maybeAutoAdvanceWorkflow } = require('../src/commands/runtime');
const { openRuntimeDb } = require('../src/runtime-store');
const { redactTelemetryText } = require('../src/lib/telemetry-redaction');
const { parseArgv } = require('../src/parser');
const { createTranslator } = require('../src/i18n');

const ROOT = path.resolve(__dirname, '..');
const CLI = path.join(ROOT, 'bin', 'aioson.js');
const { t } = createTranslator('en');
const DAY = 24 * 60 * 60 * 1000;
// Every fake key is assembled at runtime so git:guard never sees a literal one.
const fill = (unit, length) => unit.repeat(Math.ceil(length / unit.length)).slice(0, length);

function logger() {
  const lines = [];
  return { lines, log(value) { lines.push(String(value)); }, error(value) { lines.push(`ERR ${value}`); }, warn(value) { lines.push(`WARN ${value}`); } };
}

async function write(dir, rel, body) {
  const full = path.join(dir, rel);
  await fs.mkdir(path.dirname(full), { recursive: true });
  await fs.writeFile(full, body, 'utf8');
}

async function makeProject({ activeFeature = 'checkout', rows = null } = {}) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'aioson-observations-hardening-'));
  await write(dir, '.aioson/config.md', '# project\n');
  await write(dir, '.aioson/context/project.context.md', [
    '---', 'project_name: "demo"', 'project_type: "web_app"', 'profile: "developer"', 'framework: "Next.js"',
    'framework_installed: true', 'classification: "SMALL"', 'conversation_language: "en"', 'aioson_version: "1.73.0"', '---', '', '# Context'
  ].join('\n'));
  await write(dir, '.aioson/context/project-pulse.md', `---\nlast_updated: 2026-10-20\nactive_feature: ${activeFeature}\n---\n\n# Project Pulse\n`);
  const table = rows || [`| ${activeFeature} | in_progress | 2026-10-01 | — |`];
  await write(dir, '.aioson/context/features.md', `# Features\n\n| slug | status | started | completed |\n|------|--------|---------|-----------|\n${table.join('\n')}\n`);
  await write(dir, 'src/hall.js', 'module.exports = 1;\n');
  return dir;
}

function cleanup(dir) {
  return fs.rm(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
}

function run(argv, cwd) {
  return spawnSync(process.execPath, [CLI, ...argv], { cwd, encoding: 'utf8', env: { ...process.env, AIOSON_AGENT: '' } });
}

async function exists(file) {
  try { await fs.access(file); return true; } catch { return false; }
}

// ── the fan ─────────────────────────────────────────────────────────────────

test('a close never pushes the next feature\'s own items out of its fan; the total and "+N more" survive the limit', async (t2) => {
  const dir = await makeProject({ activeFeature: 'facade', rows: ['| checkout | in_progress | 2026-10-01 | — |', '| facade | in_progress | 2026-10-05 | — |'] });
  t2.after(() => cleanup(dir));
  const t0 = Date.now() - 10 * 60 * 60 * 1000;
  const own = [
    (await obs.addObservation(dir, { kind: 'defect', summary: 'Facade: the east wall render cracks at the window line', feature: 'facade' }, { now: t0 })).item.id,
    (await obs.addObservation(dir, { kind: 'risk', summary: 'Facade: scaffold anchors were never load tested', feature: 'facade' }, { now: t0 + 1000 })).item.id
  ];
  for (let i = 0; i < 6; i += 1) {
    await obs.addObservation(dir, { kind: 'defect', summary: `Checkout leftover defect ${i} noticed beside the work`, feature: 'checkout' }, { now: t0 - (i + 1) * 60000 });
  }
  const before = (await obs.readStore(dir)).store.items.filter((item) => item.feature === 'checkout').map((item) => item.updated_at);
  const carry = await obs.carryFeatureObservations(dir, 'checkout');
  assert.equal(carry.carried.length, 6);
  const carried = (await obs.readStore(dir)).store.items.filter((item) => item.origin_feature === 'checkout');
  assert.deepEqual(carried.map((item) => item.updated_at), before, 'the carry keeps every item\'s place: updated_at is untouched');
  assert.ok(carried.every((item) => item.carried_at), 'when it moved is on record');

  const fan = await obs.fanFor(dir, 'dev', { feature: 'facade' });
  assert.deepEqual(fan.items.slice(0, 2).map((item) => item.id).sort(), own.slice().sort(), 'the feature\'s own items come first');
  assert.equal(fan.items.length, 5);
  assert.equal(fan.total, 8);
  const lines = obs.fanLines(fan.items, fan.total);
  assert.match(lines[0], /^Open observations for you \(8\)/);
  assert.equal(lines.at(-1), '- +3 more — aioson observation:list .');

  const out = logger();
  const brief = await runContextBrief({ args: [dir], options: { agent: 'dev', mode: 'executing', feature: 'facade', task: 'render the east wall', 'no-semantic': true, 'no-recall': true }, logger: out });
  assert.equal(brief.observations_total, 8);
  assert.ok(out.lines.includes('Open observations for you (8) — settle or carry them, never fix in passing (aioson observation:list .):'), out.lines.join('\n'));
  assert.ok(out.lines.includes('- +3 more — aioson observation:list .'));
});

test('a path the agent will touch outranks a project-wide item; an item bound to another live feature stays out', async (t2) => {
  const dir = await makeProject({ rows: ['| checkout | in_progress | 2026-10-01 | — |', '| facade | in_progress | 2026-10-05 | — |'] });
  t2.after(() => cleanup(dir));
  const old = Date.now() - 5 * DAY;
  const onPath = await obs.addObservation(dir, { kind: 'defect', summary: 'The hall tile cracked after the floor was laid', feature: 'facade', paths: 'src/hall.js' }, { now: old });
  const project = await obs.addObservation(dir, { kind: 'defect', summary: 'The cement bags are stacked in the rain' });
  const elsewhere = await obs.addObservation(dir, { kind: 'defect', summary: 'The facade lights flicker at dusk', feature: 'facade' });
  const fan = await obs.fanFor(dir, 'dev', { feature: 'checkout', paths: 'src/hall.js' });
  assert.deepEqual(fan.items.map((item) => item.id), [onPath.item.id, project.item.id]);
  assert.ok(!fan.items.some((item) => item.id === elsewhere.item.id));
});

// ── the project root ────────────────────────────────────────────────────────

test('observe run from a subfolder records in the project; outside any project it writes nothing', async (t2) => {
  const dir = await makeProject();
  t2.after(() => cleanup(dir));
  const sub = path.join(dir, 'src');
  const ok = run(['observe', '.', '--kind=defect', '--summary=Avatar upload fails after the storage change', '--json'], sub);
  assert.equal(ok.status, 0, ok.stderr);
  assert.equal(JSON.parse(ok.stdout).feature, 'checkout', 'the active feature of the project, not of the subfolder');
  assert.equal((await obs.listObservations(dir)).items.length, 1);
  assert.equal(await exists(path.join(sub, '.aioson')), false, 'no parasite project in the subfolder');

  const bare = await fs.mkdtemp(path.join(os.tmpdir(), 'aioson-observations-outside-'));
  t2.after(() => cleanup(bare));
  const refused = run(['observe', '.', '--kind=idea', '--summary=Order history could offer a reorder button', '--json'], bare);
  assert.equal(refused.status, 1);
  assert.match(JSON.parse(refused.stdout).error, /not inside an AIOSON project/);
  assert.equal(await exists(path.join(bare, '.aioson')), false);
});

test('pulse:update from a subfolder updates the project\'s pulse', async (t2) => {
  const dir = await makeProject();
  t2.after(() => cleanup(dir));
  const sub = path.join(dir, 'src');
  await runPulseUpdate({ args: [sub], options: { agent: 'dev', feature: 'checkout', action: 'Plastered the hall wall', json: true }, logger: logger() });
  assert.match(await fs.readFile(path.join(dir, '.aioson', 'context', 'project-pulse.md'), 'utf8'), /Plastered the hall wall/);
  assert.equal(await exists(path.join(sub, '.aioson')), false);
});

// ── the handoff ─────────────────────────────────────────────────────────────

const PRD = [
  '---', 'classification: SMALL', 'product_scope: approved', 'prd_ready: approved', 'sheldon_review: not_requested', '---',
  '# PRD - Checkout', '', '## Feature Capability Map', '',
  '| CAP | Promised outcome | Actor / trigger | Scope decision | Rationale |', '|---|---|---|---|---|',
  '| CAP-checkout-01 | Customer pays in one step | Customer submits the cart | required | Core promise |', '',
  '## Acceptance Criteria', '',
  '| AC | CAP | Observable behavior | Evidence |', '|---|---|---|---|',
  '| AC-checkout-01 | CAP-checkout-01 | Order confirmed after payment | integration test |', ''
].join('\n');

test('agent:done prints the handoff block its silenced workflow:next computed for the next stage', async (t2) => {
  const dir = await makeProject();
  t2.after(() => cleanup(dir));
  await fs.cp(path.join(ROOT, 'template', '.aioson', 'agents', 'manifests'), path.join(dir, '.aioson', 'agents', 'manifests'), { recursive: true });
  const { item } = await obs.addObservation(dir, { kind: 'question', summary: 'Should a failed payment keep the cart for 24 hours or 7 days', feature: 'checkout' });
  await runWorkflowNext({ args: [dir], options: { 'expect-feature': 'checkout' }, logger: logger(), t });
  await write(dir, '.aioson/context/prd-checkout.md', PRD);
  const out = logger();
  const advanced = await maybeAutoAdvanceWorkflow({ targetDir: dir, normalizedAgent: '@product', options: {}, logger: out, t });
  assert.equal(advanced.advanced, true, JSON.stringify(advanced));
  assert.ok(out.lines.includes('[Observations] 1 open for @sheldon — settle or carry, never fix in passing (aioson observation:list .):'), out.lines.join('\n'));
  assert.ok(out.lines.some((line) => line.startsWith(`  - ${item.id} (question`)), out.lines.join('\n'));
});

test('agent:prompt carries the agent\'s share inside the prompt, on the workflow path and off it', async (t2) => {
  const dir = await makeProject();
  t2.after(() => cleanup(dir));
  const idea = await obs.addObservation(dir, { kind: 'idea', summary: 'Order history could offer a reorder button' });
  const question = await obs.addObservation(dir, { kind: 'question', summary: 'Should a failed payment keep the cart for 24 hours or 7 days', feature: 'checkout' });
  // @refiner is no workflow stage: this prompt is its only handoff.
  const refiner = await runAgentPrompt({ args: ['refiner', dir], options: {}, logger: logger(), t });
  assert.match(refiner.prompt, new RegExp(`- ${idea.item.id} \\(idea`));
  assert.match(refiner.prompt, new RegExp(`- ${question.item.id} \\(question`), 'a scope question reaches @refiner');
  // @product through the workflow engine.
  await runWorkflowNext({ args: [dir], options: { 'expect-feature': 'checkout' }, logger: logger(), t });
  const product = await runAgentPrompt({ args: ['product', dir], options: {}, logger: logger(), t });
  assert.match(product.prompt, /Open observations for you \(2\)/);
  assert.match(product.prompt, new RegExp(idea.item.id));
});

// ── feature binding ─────────────────────────────────────────────────────────

test('a FAIL close leaves the feature\'s items bound while it is corrected; the accepting close carries them', async (t2) => {
  const dir = await makeProject();
  t2.after(() => cleanup(dir));
  const { item } = await obs.addObservation(dir, { kind: 'question', summary: 'Should a failed payment keep the cart for 24 hours or 7 days', feature: 'checkout' });
  const failed = await runFeatureClose({ args: [dir], options: { feature: 'checkout', verdict: 'FAIL', notes: 'AC-02 fails on an empty cart', json: true }, logger: logger() });
  assert.deepEqual(failed.observations_carried, []);
  assert.equal((await obs.readStore(dir)).store.items.find((entry) => entry.id === item.id).feature, 'checkout');
  const passed = await runFeatureClose({ args: [dir], options: { feature: 'checkout', verdict: 'PASS', force: true, json: true }, logger: logger() });
  assert.deepEqual(passed.observations_carried.map((entry) => entry.id), [item.id]);
});

test('an item bound to a done or abandoned feature reads as project-wide; --feature binds a slug or nothing', async (t2) => {
  const dir = await makeProject({ activeFeature: 'facade', rows: ['| checkout | done | 2026-10-01 | 2026-10-10 |', '| tiles | in_progress | 2026-10-03 | — |', '| facade | in_progress | 2026-10-05 | — |'] });
  t2.after(() => cleanup(dir));
  const done = await obs.addObservation(dir, { kind: 'risk', summary: 'The scaffold on the east wall wobbles under load', feature: 'checkout' });
  const abandoned = await obs.addObservation(dir, { kind: 'defect', summary: 'The hall tile grout never set', feature: 'tiles' });
  assert.ok((await obs.observationsForAgent(dir, 'dev', { feature: 'facade' })).some((entry) => entry.id === done.item.id), 'bound to a done feature');
  assert.ok(!(await obs.observationsForAgent(dir, 'dev', { feature: 'facade' })).some((entry) => entry.id === abandoned.item.id), 'tiles is still live');
  const register = await runFeatureRegister({ args: [dir], options: { feature: 'tiles', status: 'abandoned', 'no-archive': true, json: true }, logger: logger() });
  assert.equal(register.ok, true, JSON.stringify(register));
  assert.ok((await obs.observationsForAgent(dir, 'dev', { feature: 'facade' })).some((entry) => entry.id === abandoned.item.id), 'abandoned without a close, never lost');

  assert.equal((await obs.addObservation(dir, { kind: 'idea', summary: 'A wooden handrail on the stairs', feature: 'Facade' })).item.feature, 'facade');
  await assert.rejects(obs.addObservation(dir, { kind: 'idea', summary: 'A wooden handrail on the porch', feature: '{slug}' }), /not a feature slug/);
  await write(dir, '.aioson/context/project-pulse.md', '---\nactive_feature: tiles\n---\n');
  assert.equal(await defaultFeature(dir), null, 'a pulse still naming an abandoned feature binds nothing');
});

test('a resolve ref is a registry row, a feature folder or an existing file — never a word of features.md, never the store', async (t2) => {
  const dir = await makeProject();
  t2.after(() => cleanup(dir));
  for (const ref of ['status', 'slug', 'completed', 'in_progress', 'Features', '#', '|', '—', '2026-10-01', '..']) {
    assert.equal((await obs.refExists(dir, ref)).ok, false, ref);
  }
  assert.deepEqual(await obs.refExists(dir, '.aioson/context/observations.json'), { ok: false, reason: 'the observations store itself' });
  assert.deepEqual(await obs.refExists(dir, 'checkout'), { ok: true, kind: 'feature' });
  await write(dir, '.aioson/context/prd-facade.md', '# PRD — Facade\n');
  assert.deepEqual(await obs.refExists(dir, 'facade'), { ok: true, kind: 'feature' });
});

// ── shapes, text, paths ─────────────────────────────────────────────────────

test('every hand-edited shape reads as one shape: the list, the brief and the handoff print every item', async (t2) => {
  const dir = await makeProject();
  t2.after(() => cleanup(dir));
  const now = new Date().toISOString();
  await write(dir, obs.RELATIVE_PATH, JSON.stringify({
    schema_version: obs.SCHEMA_VERSION,
    items: [
      { id: 'OBS-aaaaaa', kind: 'Defect', summary: 'Paths written as one string by hand', paths: 'src/hall.js', feature: 'Checkout', status: 'open', seen: 'x', created_at: now, updated_at: now },
      { id: 'OBS-bbbbbb', kind: 'defect', summary: 'No paths key at all after a merge', status: 'open', created_at: now, updated_at: now },
      { id: 'OBS-cccccc', kind: 'risk', summary: 'Closed by hand with a resolution', status: 'closed', resolution: { as: 'fixed', by: 'owner', at: now }, created_at: now, updated_at: now }
    ]
  }));
  const listed = await obs.listObservations(dir, { status: 'all' });
  const byId = Object.fromEntries(listed.items.map((item) => [item.id, item]));
  assert.deepEqual(byId['OBS-aaaaaa'].paths, ['src/hall.js']);
  assert.equal(byId['OBS-aaaaaa'].kind, 'defect');
  assert.equal(byId['OBS-aaaaaa'].feature, 'checkout');
  assert.equal(byId['OBS-aaaaaa'].seen, 1);
  assert.deepEqual(byId['OBS-bbbbbb'].paths, []);
  assert.equal(byId['OBS-cccccc'].status, 'resolved');

  const list = logger();
  assert.equal((await runObservationList({ args: [dir], options: {}, logger: list })).ok, true);
  const brief = logger();
  await runContextBrief({ args: [dir], options: { agent: 'dev', mode: 'executing', feature: 'checkout', task: 'plaster the hall wall', 'no-semantic': true, 'no-recall': true }, logger: brief });
  assert.ok(brief.lines.includes('Open observations for you (2) — settle or carry them, never fix in passing (aioson observation:list .):'), brief.lines.join('\n'));
  const fan = await obs.fanFor(dir, 'dev', { feature: 'checkout' });
  assert.equal(obs.handoffLines(fan.items, fan.total, 'dev').length, 1 + fan.total, 'a line for every item the header counts');
});

test('redaction runs before the cut: a secret crossing the summary limit is never stored as a prefix', async (t2) => {
  const dir = await makeProject();
  t2.after(() => cleanup(dir));
  const key = 'sk_' + 'live_' + fill('4eC39HqLyjWDarjtT1zdp7dc', 24);
  const summary = `${'x'.repeat(239 - key.length + 4)} ${key} and more words after it`;
  const { item } = await obs.addObservation(dir, { kind: 'risk', summary });
  assert.doesNotMatch(item.summary, /sk_live_[A-Za-z0-9]{4,}/);
  const detail = await obs.addObservation(dir, { kind: 'risk', summary: 'The deploy script echoes a token', detail: `${'y'.repeat(1190)} ${key}` });
  assert.doesNotMatch(detail.item.detail, /sk_live_[A-Za-z0-9]{4,}/);
});

test('bare provider tokens are blanked; their look-alikes are left alone', () => {
  const tokens = {
    'github-token': ['gh' + 'p_' + fill('Ab1Cd2Ef3Gh4', 36), 'gh' + 's_' + fill('Zz9Yy8', 36), 'github' + '_pat_' + '11ABCDEFG0' + fill('y_Y', 72)],
    'slack-token': ['xo' + 'xb-' + '123456789012-1234567890123-' + fill('aBcD', 24)],
    jwt: ['ey' + 'J' + fill('hbGciOiJIUzI1NiJ9', 17) + '.ey' + 'J' + fill('zdWIiOiIxMjM0In0', 16) + '.' + fill('dozjgNryP4J3jVmNHl0w5N', 22)],
    'openai-api-key': ['sk-' + 'proj-' + fill('Ab3_Cd4-', 48)]
  };
  for (const [id, values] of Object.entries(tokens)) {
    for (const value of values) {
      const out = redactTelemetryText(`the CI uses ${value} in deploy.yml`);
      assert.equal(out, `the CI uses [REDACTED:${id}] in deploy.yml`, value.slice(0, 12));
    }
  }
  const lookalikes = [
    'push to gh-pages after the build',
    'a ghp_short value is no token',
    'the github_pat setting is documented',
    'a xoxb-style bot token is expected here',
    'the sk-proj-card component renders',
    'Authorization header carries eyJhbGciOi.payload.sig in the example',
    'config key eyJ.alpha.beta stays',
    'version 1.2.3 and the JWT spec'
  ];
  for (const text of lookalikes) assert.equal(redactTelemetryText(text), text, text);
});

test('paths: an absolute path inside the project is stored relative, a directory overlaps its files, bare --paths/--detail are refused', async (t2) => {
  const dir = await makeProject({ rows: ['| checkout | in_progress | 2026-10-01 | — |', '| facade | in_progress | 2026-10-05 | — |'] });
  t2.after(() => cleanup(dir));
  const absolute = await obs.addObservation(dir, { kind: 'defect', summary: 'The hall tile cracked after the floor was laid', paths: path.join(dir, 'src', 'hall.js'), feature: 'facade' });
  assert.deepEqual(absolute.item.paths, ['src/hall.js']);
  const folder = await obs.addObservation(dir, { kind: 'risk', summary: 'The source folder has no tests at all', paths: 'src/', feature: 'facade' });
  assert.deepEqual(folder.item.paths, ['src']);
  const fan = await obs.observationsForAgent(dir, 'dev', { feature: 'checkout', paths: path.join(dir, 'src', 'hall.js') });
  assert.deepEqual(fan.map((item) => item.id).sort(), [absolute.item.id, folder.item.id].sort(), 'an absolute brief path overlaps relative item paths');
  const cased = await obs.observationsForAgent(dir, 'dev', { feature: 'checkout', paths: 'Src/Hall.js' });
  assert.equal(cased.length, ['win32', 'darwin'].includes(process.platform) ? 2 : 0, 'case folds only where the filesystem does');

  const barePaths = await runObserve({ args: [dir], options: { kind: 'idea', summary: 'Order history could offer a reorder button', paths: true }, logger: logger() });
  assert.equal(barePaths.exitCode, 1);
  assert.match(barePaths.error, /--paths needs a value/);
  const bareDetail = await runObserve({ args: [dir], options: { kind: 'idea', summary: 'Order history could offer a reorder button', detail: true }, logger: logger() });
  assert.match(bareDetail.error, /--detail needs a value/);
});

// ── settling, the store, the parser ─────────────────────────────────────────

test('observation:resolve is the owner\'s unless the session says which agent it is; the latest brief is no author', async (t2) => {
  const dir = await makeProject();
  t2.after(() => cleanup(dir));
  const { db } = await openRuntimeDb(dir);
  db.close();
  await runContextBrief({ args: [dir], options: { agent: 'dev', mode: 'executing', feature: 'checkout', task: 'plaster the hall wall', 'no-semantic': true, 'no-recall': true }, logger: logger() });
  const first = await obs.addObservation(dir, { kind: 'defect', summary: 'Avatar upload fails after the storage change' });
  const second = await obs.addObservation(dir, { kind: 'defect', summary: 'The cart badge shows a stale count' });
  const saved = process.env.AIOSON_AGENT;
  try {
    delete process.env.AIOSON_AGENT;
    const owner = await runObservationResolve({ args: [dir], options: { id: first.item.id, as: 'dismissed', why: 'cosmetic, the owner accepted it' }, logger: logger() });
    assert.equal(owner.resolution.by, 'owner');
    process.env.AIOSON_AGENT = 'qa';
    const agent = await runObservationResolve({ args: [dir], options: { id: second.item.id, as: 'fixed' }, logger: logger() });
    assert.equal(agent.resolution.by, 'qa');
  } finally {
    if (saved === undefined) delete process.env.AIOSON_AGENT;
    else process.env.AIOSON_AGENT = saved;
  }
});

test('an unreadable store: the list exits 1 instead of "nothing open", preflight and hygiene name it, the writer says rename it aside', async (t2) => {
  const dir = await makeProject();
  t2.after(() => cleanup(dir));
  await write(dir, obs.RELATIVE_PATH, '{ "schema_version": "project-observations/v1", "items": [ { "id": "OBS-aaaaaa", } ] }');
  const out = logger();
  const listed = await runObservationList({ args: [dir], options: {}, logger: out });
  assert.equal(listed.ok, false);
  assert.equal(listed.exitCode, 1);
  assert.match(listed.error, /unreadable .*rename it aside/);
  assert.ok(!out.lines.some((line) => /nothing open/.test(line)), out.lines.join('\n'));
  assert.equal(run(['observation:list', dir, '--json'], dir).status, 1);

  await assert.rejects(obs.addObservation(dir, { kind: 'idea', summary: 'Order history could offer a reorder button' }), (error) => /rename it aside/.test(error.message) && !/remove it/.test(error.message));
  const preflight = await runFeatureClose({ args: [dir], options: { feature: 'checkout', verdict: 'PASS', preflight: true, json: true }, logger: logger() });
  assert.ok(preflight.notes.some((note) => /unreadable .*nothing bound to checkout can be carried/.test(note)), preflight.notes.join('\n'));
  const scan = await runHygieneScan({ args: [dir], options: { json: true }, logger: logger() });
  assert.equal(scan.buckets.unreadable_observations.length, 1);
  assert.equal(scan.buckets.unreadable_observations[0].path, obs.RELATIVE_PATH);
});

test('--resolved is a switch: it never swallows the project path', () => {
  const parsed = parseArgv(['node', 'aioson', 'observation:list', '--resolved', '../proj']);
  assert.deepEqual(parsed.args, ['../proj']);
  assert.equal(parsed.options.resolved, true);
});

test('agent ids are canonical; a question reaches @refiner and @tester; @pentester stays out of defects', async (t2) => {
  const dir = await makeProject();
  t2.after(() => cleanup(dir));
  assert.equal((await obs.addObservation(dir, { kind: 'idea', summary: 'Order history could offer a reorder button', agent: '@deyvin' })).item.agent, 'dev');
  const question = await obs.addObservation(dir, { kind: 'question', summary: 'Should a failed payment keep the cart for 24 hours or 7 days' });
  await obs.addObservation(dir, { kind: 'defect', summary: 'Avatar upload fails after the storage change' });
  assert.deepEqual((await obs.observationsForAgent(dir, 'briefing-refiner')).map((item) => item.kind).sort(), ['idea', 'question']);
  assert.ok((await obs.observationsForAgent(dir, 'tester')).some((item) => item.id === question.item.id));
  assert.deepEqual(await obs.observationsForAgent(dir, 'pentester'), []);
});

// ── answered questions, re-observation, the recap ───────────────────────────

test('an answered question reaches its feature\'s question audience, with the answer, until the feature closes', async (t2) => {
  const dir = await makeProject();
  t2.after(() => cleanup(dir));
  const { item } = await obs.addObservation(dir, { kind: 'question', summary: 'Should a failed payment keep the cart for 24 hours or 7 days', feature: 'checkout' });
  await obs.resolveObservation(dir, { id: item.id, as: 'answered', why: 'keep it for 7 days, then expire' });

  const brief = logger();
  const result = await runContextBrief({ args: [dir], options: { agent: 'dev', mode: 'executing', feature: 'checkout', task: 'implement the cart expiry', 'no-semantic': true, 'no-recall': true }, logger: brief });
  assert.deepEqual(result.observations, [], 'nothing is open');
  assert.deepEqual(result.observations_answered.map((entry) => entry.id), [item.id]);
  assert.ok(brief.lines.includes(`- ${item.id} (question, answered) Should a failed payment keep the cart for 24 hours or 7 days → answer: keep it for 7 days, then expire`), brief.lines.join('\n'));
  assert.deepEqual((await obs.fanFor(dir, 'dev', { feature: 'facade' })).answered, [], 'another feature does not inherit it');
  assert.deepEqual((await obs.fanFor(dir, 'pentester', { feature: 'checkout' })).answered, [], 'only the question audience hears it');

  const next = logger();
  const payload = await runWorkflowNext({ args: [dir], options: { 'expect-feature': 'checkout' }, logger: next, t });
  assert.deepEqual(payload.observations_answered.map((entry) => entry.answer), ['keep it for 7 days, then expire']);
  assert.ok(next.lines.includes(`[Observations] 1 answered question(s) on this feature for @${payload.agent} — the answer stands:`), next.lines.join('\n'));

  await runFeatureClose({ args: [dir], options: { feature: 'checkout', verdict: 'PASS', force: true, json: true }, logger: logger() });
  assert.deepEqual((await obs.fanFor(dir, 'dev', { feature: 'checkout' })).answered, [], 'a closed feature hands no answer on');
});

test('re-observing a project-wide item during a feature never binds it, so no close carries it', async (t2) => {
  const dir = await makeProject();
  t2.after(() => cleanup(dir));
  const { item } = await obs.addObservation(dir, { kind: 'process', summary: 'Deliver the cement next to the mixer next time' });
  assert.equal(item.feature, null);
  const again = await obs.addObservation(dir, { kind: 'process', summary: 'Deliver the cement next to the mixer next time', feature: 'checkout' });
  assert.equal(again.item.seen, 2);
  assert.equal(again.item.feature, null, 'only the first record binds');
  const viaCommand = await runObserve({ args: [dir], options: { kind: 'process', summary: 'Deliver the cement next to the mixer next time' }, logger: logger() });
  assert.equal(viaCommand.feature, null, 'the active feature is a default for new items only');
  assert.deepEqual((await obs.carryFeatureObservations(dir, 'checkout')).carried, []);
  assert.equal((await obs.readStore(dir)).store.items[0].origin_feature, null);
});

test('the recap lists open items before settled ones and never cuts a summary mid-word', async (t2) => {
  const dir = await makeProject();
  t2.after(() => cleanup(dir));
  const now = Date.now();
  const open = [];
  for (let i = 0; i < 2; i += 1) {
    open.push((await obs.addObservation(dir, { kind: 'risk', summary: `Open risk ${i} recorded early this morning` }, { now: now - 10 * 60 * 60 * 1000 })).item.id);
  }
  const long = 'The scaffold on the east wall wobbles under load whenever the crane swings pallets past the second floor windows';
  open.push((await obs.addObservation(dir, { kind: 'risk', summary: long }, { now: now - 9 * 60 * 60 * 1000 })).item.id);
  for (let i = 0; i < 6; i += 1) {
    const { item } = await obs.addObservation(dir, { kind: 'defect', summary: `Settled defect number ${i} noticed beside the work` }, { now: now - 60 * 60 * 1000 });
    await obs.resolveObservation(dir, { id: item.id, as: 'fixed' }, { now: now - (6 - i) * 60000 });
  }
  const recent = await obs.recentObservations(dir, { now });
  assert.equal(recent.length, 5);
  assert.deepEqual(recent.slice(0, 3).map((item) => item.id).sort(), open.slice().sort(), 'settled noise never pushes an open item out');
  assert.ok(recent.slice(3).every((item) => item.status === 'resolved'));
  const shown = recent.find((item) => item.id === open[2]).summary;
  assert.ok(shown.length <= 48 && shown.endsWith('…'), shown);
  const kept = shown.slice(0, -1);
  assert.ok(long.startsWith(kept) && long[kept.length] === ' ', `cut mid-word: ${shown}`);

  const { buildCompactionRecap } = require('../src/lib/compaction-recap');
  const line = buildCompactionRecap({ events: [], observations: recent }).match(/Observations on record[^\n]*/)[0];
  for (const item of recent) assert.ok(line.includes(item.summary), `the recap cut "${item.summary}": ${line}`);
});

// ── near duplicates ─────────────────────────────────────────────────────────

test('observe names an open item of the same kind on the same paths or in near-identical words, and only then', async (t2) => {
  const dir = await makeProject();
  t2.after(() => cleanup(dir));
  const tile = await obs.addObservation(dir, { kind: 'defect', summary: 'Tile in the hall cracked after the floor was laid', paths: 'src/hall.js' });
  assert.deepEqual(tile.similar, []);
  const reworded = await obs.addObservation(dir, { kind: 'defect', summary: 'The hall tile cracked when the floor was laid' });
  assert.deepEqual(reworded.similar.map((item) => item.id), [tile.item.id]);
  const samePath = await obs.addObservation(dir, { kind: 'defect', summary: 'Gutter leaks above the kitchen window', paths: 'src/hall.js' });
  assert.deepEqual(samePath.similar.map((item) => item.id), [tile.item.id]);
  assert.deepEqual((await obs.addObservation(dir, { kind: 'defect', summary: 'Avatar upload shows a stale image' })).similar, []);
  assert.deepEqual((await obs.addObservation(dir, { kind: 'idea', summary: 'Tile in the hall cracked after the floor was laid' })).similar, [], 'another kind is another thing');
  assert.deepEqual((await obs.addObservation(dir, { kind: 'defect', summary: 'Tile in the hall cracked after the floor was laid' })).similar, [], 'a repeat is recognized, not hinted');

  await obs.resolveObservation(dir, { id: tile.item.id, as: 'dismissed', why: 'cosmetic' });
  await obs.resolveObservation(dir, { id: reworded.item.id, as: 'dismissed', why: 'same as the tile' });
  await obs.resolveObservation(dir, { id: samePath.item.id, as: 'fixed' });
  const out = logger();
  const recorded = await runObserve({ args: [dir], options: { kind: 'defect', summary: 'Hall tile cracked after the floor was laid again' }, logger: out });
  assert.deepEqual(recorded.similar, [], 'settled items are never hinted');

  const hinted = logger();
  await runObserve({ args: [dir], options: { kind: 'defect', summary: 'The hall tile cracked after the new floor was laid' }, logger: hinted });
  assert.ok(hinted.lines.some((line) => line === `  possibly already on record: ${recorded.id} — Hall tile cracked after the floor was laid again`), hinted.lines.join('\n'));
});
