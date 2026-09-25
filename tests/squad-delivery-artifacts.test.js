'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { preserveOutput, readPreservedOutput } = require('../src/squad/delivery-artifacts');
const { runSquadAutorun } = require('../src/commands/squad-autorun');
const { readSessionStatus } = require('../src/commands/squad-status');

async function fixture(t) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'aioson-delivery-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  return dir;
}

test('full outputs are immutable, deduplicated and verified before reading', async t => {
  const dir = await fixture(t);
  const output = { article: 'Grounded article. '.repeat(150), sources: [{ id: 'source-1', quote: 'Original material' }] };
  const a = await preserveOutput(dir, 'fixture', 'one', '../unsafe-task-id', output);
  const b = await preserveOutput(dir, 'fixture', 'one', '../unsafe-task-id', output);
  assert.deepEqual(a, b);
  assert.deepEqual((await readPreservedOutput(dir, a)).output, output);
  assert.ok(a.bytes > 500);
  const revised = await preserveOutput(dir, 'fixture', 'one', '../unsafe-task-id', { article: 'Revised opening' });
  assert.notEqual(a.sha256, revised.sha256);
  assert.deepEqual((await readPreservedOutput(dir, a)).output, output);
  await fs.writeFile(path.join(dir, a.path), 'tampered');
  await assert.rejects(readPreservedOutput(dir, a), /integrity/);
  await assert.rejects(preserveOutput(dir, 'fixture', 'one', '../unsafe-task-id', output), /integrity/);
});

test('delivery reader rejects references outside the project', async t => {
  const dir = await fixture(t);
  const external = await fixture(t);
  const reference = await preserveOutput(external, 'fixture', 'one', 'task', { value: 'private' });
  await assert.rejects(readPreservedOutput(dir, { ...reference, path: path.join(external, reference.path) }), /escapes project/);
});

for (const [domain, output] of Object.entries({
  content: { article: 'Supported claim with source-1. '.repeat(100), sources: [{ id: 'source-1', file: 'source.md' }] },
  process: { receipt: { operation_id: 'batch-1', accepted: ['item-1'], exceptions: [] } },
  software: { result: 'Built entry point', checks: [{ name: 'entry-point', exit_code: 0 }] }
})) {
  test(`autorun preserves ${domain} output and exposes its exact reference`, async t => {
    const dir = await fixture(t);
    const squad = path.join(dir, '.aioson/squads/fixture');
    const session = path.join(squad, 'sessions/one');
    const worker = path.join(squad, 'workers/executor');
    await fs.mkdir(session, { recursive: true });
    await fs.mkdir(worker, { recursive: true });
    await fs.writeFile(path.join(squad, 'squad.manifest.json'), JSON.stringify({ slug: 'fixture', mode: domain }));
    await fs.writeFile(path.join(session, 'plan.json'), JSON.stringify({ session_id: 'one', squad_slug: 'fixture', goal: 'Preserve result',
      tasks: [{ id: 'task-1', title: 'Produce output', executor: 'executor', status: 'pending', dependencies: [] }], parallel_groups: { 1: ['task-1'] } }));
    await fs.writeFile(path.join(worker, 'worker.json'), JSON.stringify({ slug: 'executor', type: 'manual', retry: { attempts: 1 } }));
    await fs.writeFile(path.join(worker, 'run.js'), `process.stdout.write(${JSON.stringify(JSON.stringify(output))});`);
    const result = await runSquadAutorun({ args: [dir], options: { squad: 'fixture', plan: 'one', json: true, bus: false, 'no-gap-closure': true }, logger: { log() {}, warn() {}, error() {} } });
    assert.equal(result.status, 'completed');
    const status = await readSessionStatus(dir, 'fixture', 'one');
    const reference = status.evidence[0].delivery;
    assert.deepEqual((await readPreservedOutput(dir, reference)).output, output);
    if (domain === 'process') {
      // An effect already executed must stay unverified if its receipt cannot be persisted.
      const plan = JSON.parse(await fs.readFile(path.join(session, 'plan.json'), 'utf8'));
      plan.tasks[0].status = 'pending';
      await fs.writeFile(path.join(session, 'plan.json'), JSON.stringify(plan));
      const deliveries = path.join(session, 'deliveries');
      await fs.rename(deliveries, path.join(session, 'retained-deliveries'));
      await fs.writeFile(deliveries, 'blocks-directory');
      const failed = await runSquadAutorun({ args: [dir], options: { squad: 'fixture', plan: 'one', json: true, bus: false, 'no-gap-closure': true }, logger: { log() {}, warn() {}, error() {} } });
      assert.equal(failed.ok, false);
      const current = JSON.parse(await fs.readFile(path.join(session, 'plan.json'), 'utf8'));
      assert.equal(current.tasks[0].status, 'unverified');
      assert.match(current.tasks[0].result.error, /evidence_persistence_failed/);
    }
  });
}
