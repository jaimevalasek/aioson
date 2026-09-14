'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const { runExecution } = require('../src/commands/execution');
const { buildExecutionGraph, renderMermaid, renderAscii, graphExecution, FORMATS } = require('../src/agent-execution/execution-graph');
const { readExecutionPlan } = require('../src/agent-execution/execution-plan');
const { signatureKey, writeSignatures } = require('../src/lib/host-signature');

const ROOT = path.resolve(__dirname, '..');
const BIN = path.join(ROOT, 'bin', 'aioson.js');
const logger = { log() {}, error() {}, warn() {} };
const SLUG = 'orders';

const PLAN_HEAD = [
  '---',
  'feature: orders',
  'status: approved',
  '---',
  '# Implementation Plan — orders',
  '',
  '## Capability Delivery Plan',
  '| CAP | Phase | Files | Verification |',
  '|---|---|---|---|',
  '| CAP-orders-api | 1 | src/api/orders.ts | npm test -- orders.api |',
  '| CAP-orders-ui | 2 | src/ui/Orders.tsx | npm test -- orders.ui |',
  '| CAP-orders-wire | 3 | src/app.ts | npm test -- app |',
  '',
  '## Development execution lanes',
  '| Lane | Host | Model | Exact write paths | Integration owner |',
  '|---|---|---|---|---|',
  '| backend | codex | gpt-5.6 | src/api/** | dev |',
  '| frontend | kimi | kimi-k3 | src/ui/** | dev |',
  ''
].join('\n');

const PLAN_WAVES = `${PLAN_HEAD}${[
  '## Execution Sequence',
  '| Phase | Wave | Files | Scope | Done when |',
  '|---|---|---|---|---|',
  '| 1 | 1 | src/api/orders.ts | CAP-orders-api | npm test -- orders.api passes |',
  '| 2 | 1 | src/ui/Orders.tsx | CAP-orders-ui | npm test -- orders.ui passes |',
  '| 3 | 2 | src/app.ts | CAP-orders-wire | npm test -- app passes |',
  ''
].join('\n')}`;

const PLAN_DEPS = `${PLAN_HEAD}${[
  '## Execution Sequence',
  '| Phase | Wave | Files | Scope | Done when | Depends on |',
  '|---|---|---|---|---|---|',
  '| 1 | 1 | src/api/orders.ts | CAP-orders-api | npm test -- orders.api passes | |',
  '| 2 | 1 | src/ui/Orders.tsx | CAP-orders-ui | npm test -- orders.ui passes | |',
  '| 3 | 2 | src/ui/OrdersList.tsx | CAP-orders-ui | npm test -- orders.ui passes | 2 (dev) |',
  '| 4 | 3 | src/app.ts | CAP-orders-wire | npm test -- app passes | |',
  ''
].join('\n')}`;

const ROLES = {
  version: 1,
  source: 'test-client',
  enabled: true,
  roles: {
    backend_dev: { host: 'codex', model: 'gpt-5.6', reasoning_effort: 'high' },
    frontend_dev: { host: 'kimi', model: 'kimi-k3', reasoning_effort: null },
    qa: { host: 'claude', model: 'claude-sonnet-5' }
  },
  parallel: { max_concurrent_lanes: 2 },
  on_unavailable: 'ask'
};

function signed(host, model, effort) {
  return { host, model, reasoning_effort: effort, status: 'valid', reason: null, checked_at: '2026-08-25T10:00:00.000Z', expires_at: '2999-01-01T00:00:00.000Z' };
}

async function setup(t, plan) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'aioson-execution-graph-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }));
  for (const rel of ['.aioson/context', '.aioson/config', '.aioson/agents']) await fs.mkdir(path.join(dir, ...rel.split('/')), { recursive: true });
  await fs.writeFile(path.join(dir, '.aioson', 'context', `implementation-plan-${SLUG}.md`), plan, 'utf8');
  await fs.writeFile(path.join(dir, '.aioson', 'config', 'execution-roles.json'), JSON.stringify(ROLES, null, 2), 'utf8');
  await fs.copyFile(path.join(ROOT, 'template', '.aioson', 'agents', 'dev.md'), path.join(dir, '.aioson', 'agents', 'dev.md'));
  const env = { ...process.env, AIOSON_HOST_SIGNATURES: path.join(dir, 'signatures.json') };
  delete env.AIOSON_PLAY;
  await writeSignatures({ signatures: {
    [signatureKey('codex', 'gpt-5.6', 'high')]: signed('codex', 'gpt-5.6', 'high'),
    [signatureKey('kimi', 'kimi-k3', null)]: signed('kimi', 'kimi-k3', null),
    [signatureKey('claude', 'claude-sonnet-5', null)]: signed('claude', 'claude-sonnet-5', null)
  } }, { env });
  const compiled = await runExecution({ args: [dir], options: { sub: 'compile', feature: SLUG, json: true }, logger, env });
  assert.equal(compiled.ok, true, JSON.stringify(compiled.errors));
  return { dir, env };
}

test('execution:graph — a wave-scheduled plan is drawn with implicit barrier edges; a dependency-scheduled plan with its typed edges; integration units are nodes the session DEV owns', async (t) => {
  const waves = await setup(t, PLAN_WAVES);
  let result = await graphExecution({ projectDir: waves.dir, feature: SLUG, format: 'json' });
  assert.equal(result.ok, true);
  const g = result.graph;
  assert.equal(g.version, 1);
  assert.equal(g.scheduling, 'waves');
  assert.equal(g.run, null);
  assert.deepEqual(g.nodes.map((n) => [n.id, n.kind, n.lane, n.wave, n.status]), [['phase-1', 'unit', 'backend', 1, null], ['phase-2', 'unit', 'frontend', 1, null], ['phase-3', 'integration', null, 2, null]]);
  assert.deepEqual(g.edges, [
    { from: 'phase-1', to: 'phase-3', gate: 'after_qa', explicit: false },
    { from: 'phase-2', to: 'phase-3', gate: 'after_qa', explicit: false }
  ]);
  assert.deepEqual(g.summary, { nodes: 3, lane_units: 2, integration_units: 1, edges: 2, explicit_edges: 0 });
  assert.deepEqual(g.integration, { owner: 'dev', units: ['phase-3'], role: null, verification: [
    { cap: 'CAP-orders-api', command: 'npm test -- orders.api' },
    { cap: 'CAP-orders-ui', command: 'npm test -- orders.ui' },
    { cap: 'CAP-orders-wire', command: 'npm test -- app' }
  ] });
  const mermaid = renderMermaid(g);
  assert.match(mermaid, /^flowchart TD\n/);
  assert.match(mermaid, /subgraph wave_1\["Wave 1"\]\n    phase_1\["phase-1<br\/>backend · 1<br\/>not started"\]/);
  assert.match(mermaid, /phase_1 -\.->\|wave barrier\| phase_3/);
  assert.match(mermaid, /class phase_3 integration/);
  assert.match(mermaid, /class phase_1 pending/);
  const ascii = renderAscii(g);
  assert.match(ascii, /^orders — execution graph · scheduling: waves · max 2 concurrent · no run\n/);
  assert.match(ascii, /wave 1\n  ○ phase-1  backend      not started\n  ○ phase-2  frontend     not started\nwave 2\n  ◇ phase-3  integration  integration \(session dev\)/);
  assert.match(ascii, /barrier: units without `Depends on` wait for every lane unit of the earlier waves \(2 implicit edge\(s\)\)/);
  assert.match(ascii, /integration \(session dev\): phase-3/);

  const deps = await setup(t, PLAN_DEPS);
  result = await graphExecution({ projectDir: deps.dir, feature: SLUG, format: 'mermaid' });
  assert.equal(result.graph.scheduling, 'dependencies');
  assert.deepEqual(result.graph.edges, [
    { from: 'phase-2', to: 'phase-3', gate: 'after_dev', explicit: true },
    { from: 'phase-1', to: 'phase-4', gate: 'after_qa', explicit: false },
    { from: 'phase-3', to: 'phase-4', gate: 'after_qa', explicit: false }
  ], 'wave-1 units have no barrier; the integration unit waits for every earlier lane unit, drawn after transitive reduction (phase-2 is reached through phase-3)');
  assert.match(result.rendered, /phase_2 -->\|after_dev\| phase_3/);
  assert.match(renderAscii(result.graph), /◇ phase-4/);
  assert.match(renderAscii(result.graph), /○ phase-3  frontend {5}not started  ← phase-2 \(after_dev\)/);
  assert.match(renderAscii(result.graph), /edges \(explicit\)\n  phase-2 ─after_dev→ phase-3/);
});

test('execution:graph lays the run state over the nodes and waves — status glyphs, hosts, qa findings, pending decisions', async (t) => {
  const { dir } = await setup(t, PLAN_WAVES);
  const { plan } = await readExecutionPlan(dir, SLUG);
  const state = {
    version: 1, feature: SLUG, run_id: '12345678-abcd', status: 'decision_required', reason: 'decision_pending', current_wave: 1,
    waves: [{ wave: 1, status: 'decision_required', units: ['phase-1', 'phase-2'] }, { wave: 2, status: 'pending', units: ['phase-3'] }],
    units: {
      'phase-1': { id: 'phase-1', lane: 'backend', wave: 1, owner: 'lane', status: 'passed', pending_decision: null, dev: { status: 'passed', host: 'codex', model: 'gpt-5.6', verdict: 'PASS' }, qa: { status: 'failed', host: 'claude', model: 'claude-sonnet-5', verdict: 'FAIL', findings: [{ summary: 'x' }, { summary: 'y' }] } },
      'phase-2': { id: 'phase-2', lane: 'frontend', wave: 1, owner: 'lane', status: 'decision_required', pending_decision: { stage: 'dev', reason: 'capacity' }, dev: { status: 'unavailable', host: 'kimi', model: 'kimi-k3' }, qa: { status: 'pending' } },
      'phase-3': { id: 'phase-3', lane: null, wave: 2, owner: 'integration', status: 'integration', pending_decision: null, dev: { status: 'pending' }, qa: { status: 'not_applicable' } }
    }
  };
  await fs.writeFile(path.join(dir, '.aioson', 'context', `execution-state-${SLUG}.json`), JSON.stringify(state, null, 2));
  const graph = buildExecutionGraph({ plan, state });
  assert.deepEqual(graph.run, { run_id: '12345678-abcd', status: 'decision_required', reason: 'decision_pending', current_wave: 1, decisions_pending: 1 });
  assert.deepEqual(graph.waves.map((w) => w.status), ['decision_required', 'pending']);
  const n1 = graph.nodes.find((n) => n.id === 'phase-1');
  assert.equal(n1.status, 'passed');
  assert.deepEqual(n1.qa, { status: 'failed', host: 'claude', model: 'claude-sonnet-5', verdict: 'FAIL', findings: 2 });
  const n2 = graph.nodes.find((n) => n.id === 'phase-2');
  assert.deepEqual(n2.decision, { stage: 'dev', reason: 'capacity' });
  const mermaid = renderMermaid(graph);
  assert.match(mermaid, /subgraph wave_1\["Wave 1 · decision_required"\]/);
  assert.match(mermaid, /phase_1\["phase-1<br\/>backend · 1<br\/>dev passed codex · qa failed \(2\)"\]/);
  assert.match(mermaid, /phase_2\["phase-2<br\/>frontend · 2<br\/>dev unavailable kimi · qa pending · DECISION dev:capacity"\]/);
  assert.match(mermaid, /class phase_1 qa_failed/);
  assert.match(mermaid, /class phase_2 decision/);
  const ascii = renderAscii(graph);
  assert.match(ascii, /run 12345678 decision_required \(decision_pending\)/);
  assert.match(ascii, /wave 1 \[decision_required\]\n  ● phase-1 .*dev passed codex · qa failed \(2\)\n  ✗ phase-2 .*DECISION dev:capacity/);
  const viaCommand = await graphExecution({ projectDir: dir, feature: SLUG, format: 'ascii' });
  assert.equal(viaCommand.graph.run.status, 'decision_required');
});

test('CLI: execution:graph renders to the terminal, wraps the document under --json, refuses an unknown format or an uncompiled feature, and is listed in --help', async (t) => {
  const { dir, env } = await setup(t, PLAN_DEPS);
  const run = (args) => spawnSync(process.execPath, [BIN, ...args], { encoding: 'utf8', env });

  const ascii = run(['execution:graph', dir, `--feature=${SLUG}`]);
  assert.equal(ascii.status, 0, ascii.stderr);
  assert.match(ascii.stdout, /orders — execution graph · scheduling: dependencies/);
  assert.match(ascii.stdout, /phase-2 ─after_dev→ phase-3/);

  const mermaid = run(['execution-graph', dir, `--feature=${SLUG}`, '--format=mermaid']);
  assert.equal(mermaid.status, 0, mermaid.stderr);
  assert.match(mermaid.stdout, /^flowchart TD/);

  const json = run(['execution:graph', dir, `--feature=${SLUG}`, '--format=json', '--json']);
  assert.equal(json.status, 0, json.stderr);
  const payload = JSON.parse(json.stdout);
  assert.equal(payload.ok, true);
  assert.equal(payload.format, 'json');
  assert.equal(payload.graph.summary.explicit_edges, 1);
  assert.match(payload.rendered, /"scheduling": "dependencies"/);

  const badFormat = run(['execution:graph', dir, `--feature=${SLUG}`, '--format=dot', '--json']);
  assert.equal(badFormat.status, 1);
  assert.deepEqual(JSON.parse(badFormat.stdout).valid, FORMATS);

  const missing = run(['execution:graph', dir, '--feature=nothing-here', '--json']);
  assert.equal(missing.status, 1);
  assert.equal(JSON.parse(missing.stdout).reason, 'plan_not_compiled');

  const noFeature = run(['execution:graph', dir, '--json']);
  assert.equal(noFeature.status, 1);
  assert.equal(JSON.parse(noFeature.stdout).reason, 'feature_required');

  const help = run(['--help']);
  assert.match(help.stdout, /aioson execution:graph \[path\] --feature=<slug> \[--format=ascii\|mermaid\|json\]/);
});
