'use strict';

/**
 * emitDossierEvent called the run-bound logAgentEvent with no runtime dir: it
 * threw on every call and its catch hid it, so no dossier event — op_capture,
 * op_promote, feature close, dossier auto-init — ever reached the project's
 * runtime database (0 rows across 59 real project databases). Each event is
 * now one row of its own, with no task, run or session file created.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const TEST_HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'aioson-dossier-home-'));
process.env.HOME = TEST_HOME;
process.env.USERPROFILE = TEST_HOME;
process.env.AIOSON_OPERATOR_ID = 'dossier-telemetry-bot';

const Database = require('better-sqlite3');
const { emitDossierEvent } = require('../src/lib/dossier-telemetry');
const { runOpCapture } = require('../src/commands/op-capture');
const { ensureStorageTree } = require('../src/operator-memory/storage');

ensureStorageTree('dossier-telemetry-bot');

function makeProject() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aioson-dossier-'));
  fs.mkdirSync(path.join(dir, '.aioson', 'context'), { recursive: true });
  fs.mkdirSync(path.join(dir, '.git'));
  fs.writeFileSync(path.join(dir, '.git', 'config'), '[core]\n\tbare = false\n[remote "origin"]\n\turl = https://github.com/acme/dossier.git\n');
  return dir;
}

function rows(dir, sql) {
  const db = new Database(path.join(dir, '.aioson', 'runtime', 'aios.sqlite'), { readonly: true, fileMustExist: true });
  try { return db.prepare(sql).all(); } finally { db.close(); }
}

test('emitDossierEvent lands one row of its own, with no task, run or session created', async () => {
  const dir = makeProject();
  await emitDossierEvent(dir, { agent: 'op-capture', type: 'op_promote', summary: 'promoted keep-pnpm (correction)', meta: { slug: 'keep-pnpm' } });
  const events = rows(dir, "SELECT source, event_type, agent_name, message, payload_json, run_key FROM execution_events WHERE source = 'dossier'");
  assert.equal(events.length, 1);
  assert.deepEqual(
    { ...events[0], payload_json: JSON.parse(events[0].payload_json) },
    { source: 'dossier', event_type: 'op_promote', agent_name: 'op-capture', message: 'promoted keep-pnpm (correction)', payload_json: { slug: 'keep-pnpm' }, run_key: null }
  );
  assert.equal(rows(dir, 'SELECT COUNT(*) AS n FROM agent_runs')[0].n, 0, 'no run left "running"');
  assert.equal(rows(dir, 'SELECT COUNT(*) AS n FROM tasks')[0].n, 0);
  assert.ok(!fs.existsSync(path.join(dir, '.aioson', 'runtime', '.sessions', 'op-capture.json')), 'no session file');
});

test('a promotion by op:capture is recorded in the project it was said in', async () => {
  const dir = makeProject();
  const previous = process.cwd();
  process.chdir(dir);
  let promoted;
  try {
    promoted = await runOpCapture({ args: [], options: { json: true, signal: 'correction', quote: 'não use yarn aqui', proposal: 'nao usar yarn neste repositorio de teste', 'source-agent': 'dev' }, logger: { log() {}, error() {}, warn() {} } });
  } finally {
    process.chdir(previous);
  }
  assert.equal(promoted.promoted, true);
  const types = rows(dir, "SELECT event_type, payload_json FROM execution_events WHERE source = 'dossier' ORDER BY id").map((row) => [row.event_type, JSON.parse(row.payload_json).slug]);
  assert.deepEqual(types, [['op_capture', promoted.slug], ['op_promote', promoted.slug]]);
});
