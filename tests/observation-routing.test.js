'use strict';

/**
 * Improvements noticed while building. The failure this guards against: @dev
 * sees what would make the delivered capability more complete (a detail modal
 * beside a listing) and the owner never hears of it — the idea lived only in
 * the session, or sat in the hub where nothing offered it at the end of the
 * task and nothing turned an answer into an artifact. Now the end of @dev's
 * task prints the ideas with their three destinations, and one command runs
 * the owner's choice: add to the feature (PRD amended first), a Simple Plan,
 * or a draft of a future feature.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const obs = require('../src/lib/observations');
const routing = require('../src/lib/observation-routing');
const { runWorkflowNext } = require('../src/commands/workflow-next');
const { maybeAutoAdvanceWorkflow } = require('../src/commands/runtime');
const { createTranslator } = require('../src/i18n');
const { MANAGED_FILES } = require('../src/constants');
const { approveAndSealSheldonReview } = require('./helpers/feature-evidence');

const ROOT = path.resolve(__dirname, '..');
const CLI = path.join(ROOT, 'bin', 'aioson.js');
const { t } = createTranslator('en');
const FEATURE = 'listagem-pedidos';
const NL = String.fromCharCode(10);

async function write(dir, rel, body) {
  const full = path.join(dir, rel);
  await fs.mkdir(path.dirname(full), { recursive: true });
  await fs.writeFile(full, body, 'utf8');
}

async function read(dir, rel) {
  return fs.readFile(path.join(dir, rel), 'utf8');
}

async function exists(dir, rel) {
  return fs.access(path.join(dir, rel)).then(() => true, () => false);
}

async function makeProject() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'aioson-routing-'));
  await write(dir, '.aioson/config.md', '# project\n');
  await write(dir, '.aioson/context/project.context.md', [
    '---', 'project_name: "demo"', 'project_type: "web_app"', 'profile: "developer"', 'framework: "Next.js"',
    'framework_installed: true', 'classification: "SMALL"', 'conversation_language: "pt-BR"', 'aioson_version: "1.83.0"', '---', '', '# Context'
  ].join('\n'));
  await write(dir, '.aioson/context/features.md', `# Features\n\n| slug | status | started | completed |\n|------|--------|---------|-----------|\n| ${FEATURE} | in_progress | 2026-11-20 | — |\n`);
  return dir;
}

const cleanup = (dir) => fs.rm(dir, { recursive: true, force: true });

async function idea(dir, summary, extra = {}) {
  const { item } = await obs.addObservation(dir, { kind: 'idea', summary, feature: FEATURE, agent: 'dev', ...extra });
  return item;
}

function cli(dir, ...argv) {
  const run = spawnSync(process.execPath, [CLI, ...argv, '--no-persist'], { cwd: dir, encoding: 'utf8' });
  return { code: run.status, out: `${run.stdout}${run.stderr}` };
}

// ── the destinations ────────────────────────────────────────────────────────

test('simple-plan: seeds a pending plan from the idea and settles it as planned against that path', async (t2) => {
  const dir = await makeProject();
  t2.after(() => cleanup(dir));
  const item = await idea(dir, 'Filtro por status na listagem de pedidos', { paths: ['src/orders/list.js'] });
  const result = await routing.routeObservation(dir, { id: item.id, to: 'simple-plan' });
  assert.equal(result.slug, 'filtro-status-listagem-pedidos');
  assert.equal(result.ref, '.aioson/context/simple-plans/filtro-status-listagem-pedidos.md');
  const plan = await read(dir, result.ref);
  assert.match(plan, /^status: pending$/m);
  assert.match(plan, new RegExp(`^source_observation: ${item.id}$`, 'm'));
  assert.match(plan, new RegExp(`^source_feature: ${FEATURE}$`, 'm'));
  assert.match(plan, /- src\/orders\/list\.js/);
  const settled = (await obs.listObservations(dir, { status: 'all' })).items.find((entry) => entry.id === item.id);
  assert.equal(settled.status, 'resolved');
  assert.equal(settled.resolution.as, 'planned');
  assert.equal(settled.resolution.ref, result.ref);
});

test('draft: registers a planning row and writes the feature-owned source pack @briefing reads', async (t2) => {
  const dir = await makeProject();
  t2.after(() => cleanup(dir));
  const item = await idea(dir, 'Listagem de pedidos sem modal de detalhes: abrir o pedido sem sair da tela');
  const result = await routing.routeObservation(dir, { id: item.id, to: 'draft' });
  assert.equal(result.slug, 'listagem-pedidos-modal-detalhes');
  assert.equal(result.artifact, 'plans/listagem-pedidos-modal-detalhes/idea.md');
  assert.match(await read(dir, result.artifact), new RegExp(`source_observation: ${item.id}`));
  assert.match(await read(dir, '.aioson/context/features.md'), /\| listagem-pedidos-modal-detalhes \| planning \|/);
  // The live feature keeps being the active one: a draft is nobody's current work.
  const { resolveActiveFeature } = require('../src/commands/feature-current');
  assert.equal((await resolveActiveFeature(dir)).slug, FEATURE);
  const settled = (await obs.listObservations(dir, { status: 'all' })).items.find((entry) => entry.id === item.id);
  assert.deepEqual([settled.resolution.as, settled.resolution.ref], ['promoted', 'listagem-pedidos-modal-detalhes']);
});

test('feature: records an approved scope addition that stays pending until the PRD cites its id', async (t2) => {
  const dir = await makeProject();
  t2.after(() => cleanup(dir));
  const item = await idea(dir, 'Exportar a listagem de pedidos em CSV', { paths: ['src/orders/export.js'] });
  const result = await routing.routeObservation(dir, { id: item.id, to: 'feature' });
  assert.equal(result.ref, `.aioson/context/features/${FEATURE}/scope-additions.md`);
  assert.match(await read(dir, result.ref), new RegExp(`\\| ${item.id} \\| Exportar a listagem de pedidos em CSV \\| src/orders/export\\.js \\|`));
  assert.deepEqual((await routing.pendingScopeAdditions(dir, FEATURE)).map((entry) => entry.id), [item.id]);
  // Scope is the PRD's: once it cites the id, nothing is pending.
  await write(dir, `.aioson/context/prd-${FEATURE}.md`, `# PRD\n\n| CAP-${FEATURE}-02 | Export the listing (${item.id}) | required |\n`);
  assert.deepEqual(await routing.pendingScopeAdditions(dir, FEATURE), []);
});

test('routing is idempotent: the same observation reuses its artifact and a settled one is refused', async (t2) => {
  const dir = await makeProject();
  t2.after(() => cleanup(dir));
  const item = await idea(dir, 'Busca por cliente na listagem de pedidos');
  const first = await routing.routeObservation(dir, { id: item.id, to: 'simple-plan' });
  // A crash between the write and the settle leaves the plan behind: the retry reuses it.
  const store = JSON.parse(await read(dir, '.aioson/context/observations.json'));
  Object.assign(store.items[0], { status: 'open', resolution: null });
  await write(dir, '.aioson/context/observations.json', JSON.stringify(store));
  const again = await routing.routeObservation(dir, { id: item.id, to: 'simple-plan' });
  assert.equal(again.created, false);
  assert.equal(again.ref, first.ref);
  await assert.rejects(routing.routeObservation(dir, { id: item.id, to: 'draft' }), /already settled \(planned/);
});

test('two ideas with the same words never share a destination, and an explicit slug never moves', async (t2) => {
  const dir = await makeProject();
  t2.after(() => cleanup(dir));
  const one = await idea(dir, 'Filtro por status: listagem de pedidos', { feature: null });
  const two = await idea(dir, 'Filtro por status — com chips de cor', { feature: null });
  const a = await routing.routeObservation(dir, { id: one.id, to: 'simple-plan' });
  const b = await routing.routeObservation(dir, { id: two.id, to: 'simple-plan' });
  assert.notEqual(a.ref, b.ref);
  assert.match(b.slug, new RegExp(`-${two.id.replace('OBS-', '')}$`));
  const three = await idea(dir, 'Paginação na listagem de pedidos', { feature: null });
  await assert.rejects(routing.routeObservation(dir, { id: three.id, to: 'simple-plan', slug: a.slug }), /already taken/);
  await assert.rejects(routing.routeObservation(dir, { id: three.id, to: 'simple-plan', slug: 'Not Kebab' }), /kebab-case/);
});

test('a Simple Plan never takes the name of a feature: it would share that feature dev-state', async (t2) => {
  const dir = await makeProject();
  t2.after(() => cleanup(dir));
  const item = await idea(dir, 'Listagem de pedidos: falta o filtro por status');
  const result = await routing.routeObservation(dir, { id: item.id, to: 'simple-plan' });
  assert.equal(result.slug, `${FEATURE}-${item.id.replace('OBS-', '')}`);
  const other = await idea(dir, 'Paginação na listagem de pedidos');
  await assert.rejects(routing.routeObservation(dir, { id: other.id, to: 'simple-plan', slug: FEATURE }), /already taken/);
});

test('a derived slug cut on a hyphen stays a slug when the id is appended', async (t2) => {
  const dir = await makeProject();
  t2.after(() => cleanup(dir));
  const clause = 'abcdefghij klmnopqrst uvwxyzabcd efghijk lmnopqrstu';
  const one = await idea(dir, `${clause}: primeira`, { feature: null });
  const two = await idea(dir, `${clause}: segunda`, { feature: null });
  await routing.routeObservation(dir, { id: one.id, to: 'simple-plan' });
  const second = await routing.routeObservation(dir, { id: two.id, to: 'simple-plan' });
  assert.match(second.slug, /^[a-z0-9]+(?:-[a-z0-9]+)*$/);
  assert.match(second.slug, new RegExp(`-${two.id.replace('OBS-', '')}$`));
});

test('draft: a run that wrote the pack and died before the registry row finishes on the next one', async (t2) => {
  const dir = await makeProject();
  t2.after(() => cleanup(dir));
  const item = await idea(dir, 'Exportar pedidos em planilha');
  const slug = routing.slugFromSummary(item.summary, item.id);
  await write(dir, `plans/${slug}/idea.md`, `---\nsource_observation: ${item.id}\n---\n\n# pack left by the interrupted run\n`);
  const result = await routing.routeObservation(dir, { id: item.id, to: 'draft' });
  assert.equal(result.slug, slug);
  assert.equal(result.created, false);
  assert.match(await read(dir, '.aioson/context/features.md'), new RegExp(`\\| ${slug} \\| planning \\|`));
  const settled = (await obs.listObservations(dir, { status: 'all' })).items.find((entry) => entry.id === item.id);
  assert.deepEqual([settled.status, settled.resolution.ref], ['resolved', slug]);
});

test('what is not work to schedule, or has nowhere to land, is refused with the next step', async (t2) => {
  const dir = await makeProject();
  t2.after(() => cleanup(dir));
  const { item: question } = await obs.addObservation(dir, { kind: 'question', summary: 'Should the cart survive 24 hours or 7 days', feature: FEATURE });
  await assert.rejects(routing.routeObservation(dir, { id: question.id, to: 'draft' }), /answer it with observation:resolve/);
  const unbound = await idea(dir, 'Atalho de teclado para abrir o pedido', { feature: null });
  await assert.rejects(routing.routeObservation(dir, { id: unbound.id, to: 'feature' }), /bound to no feature/);
  const bound = await idea(dir, 'Cabeçalho fixo na tabela de pedidos');
  await assert.rejects(routing.routeObservation(dir, { id: bound.id, to: 'feature', feature: 'ghost-feature' }), /not a feature this project knows/);
  await assert.rejects(routing.routeObservation(dir, { id: bound.id, to: 'nowhere' }), /--to=<feature\|simple-plan\|draft> is required/);
  await assert.rejects(routing.routeObservation(dir, { id: 'OBS-ffffff', to: 'draft' }), /is not on record/);
  // Nothing was written by a refusal.
  assert.equal(await exists(dir, 'plans'), false);
  assert.equal(await exists(dir, '.aioson/context/simple-plans'), false);
});

test('a closed feature takes no additions', async (t2) => {
  const dir = await makeProject();
  t2.after(() => cleanup(dir));
  await write(dir, '.aioson/context/features.md', `# Features\n\n| slug | status | started | completed |\n|---|---|---|---|\n| ${FEATURE} | done | 2026-11-01 | 2026-11-10 |\n`);
  const item = await idea(dir, 'Detalhe do pedido em modal');
  await assert.rejects(routing.routeObservation(dir, { id: item.id, to: 'feature' }), /already closed/);
});

// ── the end of @dev's task ──────────────────────────────────────────────────

test('the closing block lists the feature ideas with the three destinations, and says nothing when nothing was noticed', async (t2) => {
  const dir = await makeProject();
  t2.after(() => cleanup(dir));
  assert.deepEqual(await routing.improvementFields(dir, FEATURE), {});
  const modal = await idea(dir, 'Listagem sem modal de detalhes', { paths: ['src/orders/list.js'] });
  await obs.addObservation(dir, { kind: 'defect', summary: 'Avatar upload broken on the profile page', feature: FEATURE });
  await obs.addObservation(dir, { kind: 'idea', summary: 'Idea of another feature entirely', feature: 'another-feature' });
  const lines = [];
  routing.printImprovements({ log: (line) => lines.push(line) }, await routing.improvementFields(dir, FEATURE));
  const text = lines.join('\n');
  assert.match(text, new RegExp(`^\\[Improvements\\] 1 idea\\(s\\) noticed while @dev built ${FEATURE}`));
  assert.match(text, new RegExp(`- ${modal.id} Listagem sem modal de detalhes \\(src/orders/list\\.js\\)`));
  assert.match(text, /observation:route \. --id=<OBS> --to=feature\|simple-plan\|draft/);
  assert.match(text, /--as=dismissed --why=/);
  assert.doesNotMatch(text, /Avatar upload|another feature/, 'other kinds and other features stay out of the block');
  // A routed idea leaves the block; an approved addition appears as pending instead.
  await routing.routeObservation(dir, { id: modal.id, to: 'feature' });
  const after = [];
  routing.printImprovements({ log: (line) => after.push(line) }, await routing.improvementFields(dir, FEATURE));
  assert.equal(after.length, 1);
  assert.match(after[0], new RegExp(`^\\[Scope additions\\] 1 approved for ${FEATURE}, not cited by its PRD yet`));
});

// A project whose @dev stage is the current one and can complete: PRD, sealed review, plan, code and test.
async function devReadyProject() {
  const dir = await makeProject();
  const slug = 'demo';
  await write(dir, '.aioson/context/features.md', `| slug | status | started | completed |
|---|---|---|---|
| ${slug} | in_progress | 2026-11-20 | |
`);
  await write(dir, `.aioson/context/prd-${slug}.md`, [
    '---', 'classification: SMALL', 'product_scope: approved', 'prd_ready: approved', 'sheldon_review: pending', '---', '# Demo', '',
    '## Feature Capability Map', '', '| CAP | Promised outcome | Actor / trigger | Scope decision | Rationale |', '|---|---|---|---|---|',
    '| CAP-demo-01 | User sees a saved result | User submits | required | Core promise |', '',
    '## Acceptance Criteria', '', '| AC | CAP | Observable behavior | Evidence |', '|---|---|---|---|',
    '| AC-demo-01 | CAP-demo-01 | Saved result appears | integration test |', ''
  ].join(NL));
  await approveAndSealSheldonReview(dir);
  await write(dir, `.aioson/context/implementation-plan-${slug}.md`, [
    '---', 'status: approved', '---', '# Plan', '', '## Capability Delivery Plan', '',
    '| CAP | Phase | Files | Verification |', '|---|---|---|---|',
    '| CAP-demo-01 | 1 | src/demo.js, tests/demo.test.js | node --test |', ''
  ].join(NL));
  await write(dir, 'src/demo.js', `module.exports = { saved: true };${NL}`);
  await write(dir, 'tests/demo.test.js', `const test = require('node:test'); const assert = require('node:assert/strict'); test('AC-demo-01 saves result', () => assert.equal(require('../src/demo').saved, true));${NL}`);
  await write(dir, '.aioson/context/workflow.state.json', JSON.stringify({
    version: 1, mode: 'feature', classification: 'SMALL', sequence: ['product', 'sheldon', 'planner', 'dev', 'qa'],
    current: 'dev', next: 'qa', completed: ['product', 'sheldon', 'planner'], skipped: [], featureSlug: slug, detour: null, updatedAt: new Date().toISOString()
  }));
  return { dir, slug };
}

test('workflow:next --complete=dev prints the improvements block with the handoff', async (t2) => {
  const { dir, slug } = await devReadyProject();
  t2.after(() => cleanup(dir));
  const item = await idea(dir, 'Listagem sem modal de detalhes', { feature: slug });
  const lines = [];
  const logger = { log: (line) => lines.push(String(line)), error() {}, warn() {} };
  const payload = await runWorkflowNext({ args: [dir], options: { tool: 'codex', complete: 'dev' }, logger, t });
  const text = lines.join(NL);
  assert.equal(payload.completedStage, 'dev', text);
  assert.match(text, /\[Improvements\] 1 idea\(s\) noticed while @dev built demo/, text);
  assert.ok(text.includes(item.id), text);
  assert.equal(payload.improvements.total, 1, 'the payload carries the block for the JSON consumers');
  assert.equal(text.split(item.id).length - 1, 1, 'printed once');
});

test('@dev completes through workflow:next, never agent:done auto-advance — that is where the block must live', async (t2) => {
  const { dir } = await devReadyProject();
  t2.after(() => cleanup(dir));
  const advanced = await maybeAutoAdvanceWorkflow({ targetDir: dir, normalizedAgent: '@dev', options: {}, logger: { log() {}, error() {}, warn() {} }, t });
  assert.equal(advanced.skipped, 'no_canonical_artifact');
  const kernel = await fs.readFile(path.join(ROOT, 'template', '.aioson', 'agents', 'dev.md'), 'utf8');
  assert.match(kernel, /aioson workflow:next \. --complete=dev/);
});

// ── the dossier ─────────────────────────────────────────────────────────────

test('a routed idea leaves one Agent Trail line in the dossier of the feature it came from', async (t2) => {
  const { dir, slug } = await devReadyProject();
  t2.after(() => cleanup(dir));
  const plan = await idea(dir, 'Filtro por status na listagem', { feature: slug });
  const draft = await idea(dir, 'Exportar a listagem em CSV', { feature: slug });
  const first = await routing.routeObservation(dir, { id: plan.id, to: 'simple-plan', by: 'dev' });
  assert.equal(first.dossier, 'added');
  await routing.routeObservation(dir, { id: draft.id, to: 'feature' });
  const dossier = await read(dir, `.aioson/context/features/${slug}/dossier.md`);
  assert.match(dossier, new RegExp(`Improvement ${plan.id} "Filtro por status na listagem" routed to simple-plan: \\.aioson/context/simple-plans/filtro-status-listagem\\.md`));
  assert.match(dossier, new RegExp(`Improvement ${draft.id} .* routed to feature: .*scope-additions\\.md \\(not scope until the PRD cites it\\)`));
  assert.equal(dossier.split('## Agent Trail').length, 2, 'the trail section is appended to, never duplicated');
});

test('a dossier that cannot be written never undoes the routing', async (t2) => {
  const dir = await makeProject();
  t2.after(() => cleanup(dir));
  // No PRD and no briefing: the dossier can be neither found nor bootstrapped.
  const bound = await idea(dir, 'Atalho de teclado para abrir o pedido');
  const unbound = await idea(dir, 'Cabeçalho fixo na tabela de pedidos', { feature: null });
  const one = await routing.routeObservation(dir, { id: bound.id, to: 'simple-plan' });
  const two = await routing.routeObservation(dir, { id: unbound.id, to: 'simple-plan' });
  assert.deepEqual([one.dossier, two.dossier], ['skipped', 'skipped']);
  for (const result of [one, two]) {
    assert.equal(result.item.status, 'resolved');
    assert.equal(await exists(dir, result.ref), true);
  }
  assert.equal(await exists(dir, `.aioson/context/features/${FEATURE}/dossier.md`), false, 'no dossier is invented');
});

// ── the command ─────────────────────────────────────────────────────────────

test('observation:route through the shipped binary: json payload, exit codes and the settled outcome', async (t2) => {
  const dir = await makeProject();
  t2.after(() => cleanup(dir));
  const item = await idea(dir, 'Detalhe do pedido em modal');
  const missing = cli(dir, 'observation:route', '.', `--id=${item.id}`);
  assert.equal(missing.code, 1);
  assert.match(missing.out, /--to=<feature\|simple-plan\|draft> is required/);
  const ok = cli(dir, 'observation:route', '.', `--id=${item.id}`, '--to=simple-plan', '--json');
  assert.equal(ok.code, 0, ok.out);
  const payload = JSON.parse(ok.out);
  assert.deepEqual([payload.ok, payload.route, payload.as, payload.created], [true, 'simple-plan', 'planned', true]);
  assert.equal(await exists(dir, payload.ref), true);
  const again = cli(dir, 'observation:route', '.', `--id=${item.id}`, '--to=draft');
  assert.equal(again.code, 1);
  assert.match(again.out, /already settled \(planned/);
  assert.match(cli(dir, 'observation:route', '--help').out, /feature {5}add it to the feature being built/);
});

// ── reach ───────────────────────────────────────────────────────────────────

test('the radar doc ships, is registered, and the kernel points at it', async () => {
  assert.ok(MANAGED_FILES.includes('.aioson/docs/dev/improvement-radar.md'));
  for (const base of ['template/.aioson', '.aioson']) {
    const doc = await fs.readFile(path.join(ROOT, base, 'docs/dev/improvement-radar.md'), 'utf8');
    assert.match(doc, /observation:route \. --id=<OBS> --to=simple-plan/);
    const kernel = await fs.readFile(path.join(ROOT, base, 'agents/dev.md'), 'utf8');
    assert.match(kernel, /\.aioson\/docs\/dev\/improvement-radar\.md/);
    assert.match(kernel, /^Improvements noticed:/m, 'the completion report carries the relayed block');
  }
});

test('slugs read like the idea: first clause, connectors dropped, accents gone', () => {
  assert.equal(routing.slugFromSummary('Listagem de pedidos sem modal de detalhes: abrir o pedido', 'OBS-aaaaaa'), 'listagem-pedidos-modal-detalhes');
  assert.equal(routing.slugFromSummary('Paginação — a lista cresce sem limite', 'OBS-aaaaaa'), 'paginacao');
  assert.equal(routing.slugFromSummary('de la', 'OBS-0a1b2c'), 'improvement-0a1b2c');
});
