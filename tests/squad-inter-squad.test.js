'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { callSquad, INBOX_DIR } = require('../src/squad/inter-squad');
const { SquadDaemon } = require('../src/squad-daemon');
const { openRuntimeDb } = require('../src/runtime-store');
const deliveries = require('../src/squad/event-delivery');
const { spawn } = require('node:child_process');

async function makeTempDir() {
  return fs.mkdtemp(path.join(os.tmpdir(), 'aioson-inter-squad-'));
}

async function setupWorker(tmpDir, squadSlug, workerSlug, config, script) {
  const workerDir = path.join(tmpDir, '.aioson', 'squads', squadSlug, 'workers', workerSlug);
  await fs.mkdir(workerDir, { recursive: true });
  await fs.writeFile(path.join(workerDir, 'worker.json'), JSON.stringify(config, null, 2));
  if (script) {
    await fs.writeFile(path.join(workerDir, 'run.js'), script);
  }
}

async function deliveryFixture(t, script) {
  const root = await makeTempDir();
  await setupWorker(root, 'beta', 'work', { slug: 'work', type: 'manual', retry: { attempts: 1 } }, script || `
    const fs=require('fs'),path=require('path');const input=JSON.parse(process.argv[2]);
    fs.appendFileSync(path.join(__dirname,'effects.jsonl'),JSON.stringify(input)+'\\n');
    process.stdout.write(JSON.stringify({done:true}));
  `);
  const daemon = new SquadDaemon(root, 'beta', { poll: 60000 });
  await daemon.start();
  t.after(async () => { await daemon.stop(); await fs.rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 }); });
  return { root, daemon, effects: path.join(root, '.aioson/squads/beta/workers/work/effects.jsonl'),
    request: { projectDir: root, from: 'alpha', to: 'beta', worker: 'work', payload: { value: 42 }, callId: 'stable-call' } };
}

test('HTTP retries with the same call identity return a receipt without repeating the worker', async (t) => {
  const { request, effects } = await deliveryFixture(t);
  const first = await callSquad(request);
  const second = await callSquad(request);
  assert.equal(first.ok, true);
  assert.equal(second.ok, true);
  assert.equal((await fs.readFile(effects, 'utf8')).trim().split('\n').length, 1);
  assert.equal(first.delivery_key, second.delivery_key);
  await fs.writeFile(path.join(path.dirname(effects), 'worker.json'), '{');
  assert.equal((await callSquad(request)).ok, true, 'an accepted receipt remains readable if worker configuration later breaks');
});

test('lost HTTP response queues the same identity and inbox returns the durable receipt', async (t) => {
  const { root, daemon, request, effects } = await deliveryFixture(t);
  const handler = daemon._handleWebhook.bind(daemon);
  daemon._handleWebhook = (req, res) => {
    res.end = () => res.destroy(); // Lose the response after the real worker has completed.
    return handler(req, res);
  };
  const result = await callSquad(request);
  assert.equal(result.error, 'offline_queued');
  assert.equal(result.reason, 'http_outcome_unknown');
  const queued = JSON.parse(await fs.readFile(path.join(INBOX_DIR(root, 'beta'), (await fs.readdir(INBOX_DIR(root, 'beta')))[0]), 'utf8'));
  assert.equal(queued.id, request.callId);
  daemon._handleWebhook = handler;
  await daemon._pollEvents();
  assert.equal((await fs.readdir(INBOX_DIR(root, 'beta'))).filter((file) => file.endsWith('.json')).length, 0);
  assert.equal((await fs.readFile(effects, 'utf8')).trim().split('\n').length, 1);
  const input = JSON.parse((await fs.readFile(effects, 'utf8')).trim());
  assert.equal(input._inter_squad.id, request.callId);
  assert.equal(input._inter_squad.conversationId, request.callId);
  assert.equal(input._inter_squad.depth, 1);
  assert.equal(input._delivery.attempt, 1);
});

test('concurrent HTTP calls report pending honestly and produce only one effect', async (t) => {
  const { daemon, request, effects } = await deliveryFixture(t, `
    const fs=require('fs'),path=require('path');fs.appendFileSync(path.join(__dirname,'effects.jsonl'),'effect\\n');
    setTimeout(()=>process.stdout.write(JSON.stringify({done:true})),500);
  `);
  const results = await Promise.all([callSquad(request), callSquad(request)]);
  assert.equal(results.filter((result) => result.ok).length, 1);
  assert.equal(results.find((result) => !result.ok).status, 'running');
  assert.equal(await fs.readFile(effects, 'utf8'), 'effect\n');
  assert.equal(daemon.db.prepare('SELECT attempts FROM squad_deliveries').get().attempts, 1);
});

test('a reused call ID with different content or worker is rejected without another effect', async (t) => {
  const { request, effects } = await deliveryFixture(t);
  assert.equal((await callSquad(request)).ok, true);
  for (const change of [{ payload: { value: 43 } }, { worker: 'other' }]) {
    const result = await callSquad({ ...request, ...change });
    assert.equal(result.ok, false);
    assert.equal(result.error, 'call_identity_conflict');
  }
  assert.equal((await fs.readFile(effects, 'utf8')).trim().split('\n').length, 1);
});

test('HTTP-accepted failure survives restart and reconciliation can resume without an inbox file', async (t) => {
  const { root, daemon, request, effects } = await deliveryFixture(t, 'process.exit(1);');
  const result = await callSquad(request);
  assert.equal(result.status, 'reconciliation_required');
  await daemon.stop();
  await fs.writeFile(path.join(path.dirname(effects), 'run.js'), "require('fs').appendFileSync(require('path').join(__dirname,'effects.jsonl'),'fixed\\n');process.stdout.write(JSON.stringify({done:true}));");
  const restarted = new SquadDaemon(root, 'beta', { poll: 60000 });
  await restarted.start();
  try {
    await assert.rejects(fs.access(effects), { code: 'ENOENT' });
    assert.equal(deliveries.reconcile(restarted.db, { squad: 'beta', key: result.delivery_key,
      resolution: 'retry', evidence: 'Verified that the worker exited before producing effects; fixed the worker.' }).ok, true);
    await restarted._pollEvents();
    assert.equal(await fs.readFile(effects, 'utf8'), 'fixed\n');
    assert.equal((await callSquad(request)).ok, true);
    assert.equal(await fs.readFile(effects, 'utf8'), 'fixed\n');
  } finally { await restarted.stop(); }
});

test('invalid HTTP envelopes and OPTIONS cannot dispatch a worker or create a receipt', async (t) => {
  const { daemon, effects } = await deliveryFixture(t);
  const metadata = { id: 'call', from: 'alpha', to: 'beta', conversationId: 'conv', depth: 1 };
  for (const change of [{ to: 'elsewhere' }, { from: '../outside' }, { depth: -1 }, { depth: '1' }, { id: '../call' }]) {
    const response = await fetch(`http://127.0.0.1:${daemon.webhookPort}/call/work`, {
      method: 'POST', body: JSON.stringify({ _inter_squad: { ...metadata, ...change } }) });
    assert.equal(response.status, 400);
  }
  const response = await fetch(`http://127.0.0.1:${daemon.webhookPort}/call/work`, { method: 'OPTIONS', body: JSON.stringify({ _inter_squad: metadata }) });
  assert.equal(response.status, 405);
  assert.equal(daemon.db.prepare('SELECT COUNT(*) AS count FROM squad_call_requests').get().count, 0);
  await assert.rejects(fs.access(effects), { code: 'ENOENT' });
});

test('call HMAC validation precedes delivery acceptance and sender does not bypass rejection through inbox', async (t) => {
  const { root, daemon, request, effects } = await deliveryFixture(t);
  const { randomBytes, createHmac } = require('node:crypto');
  const envName = 'AIOSON_INBOX_TEST_HMAC';
  const previous = process.env[envName];
  process.env[envName] = randomBytes(32).toString('hex');
  t.after(() => { if (previous === undefined) delete process.env[envName]; else process.env[envName] = previous; });
  daemon.config.webhook = { validate_signature: true, signature_env: envName };
  const rejected = await callSquad(request);
  assert.equal(rejected.error, 'signature_required');
  assert.equal(daemon.db.prepare('SELECT COUNT(*) AS count FROM squad_call_requests').get().count, 0);
  await assert.rejects(fs.access(INBOX_DIR(root, 'beta')), { code: 'ENOENT' });
  await assert.rejects(fs.access(effects), { code: 'ENOENT' });
  const body = JSON.stringify({ ...request.payload, _inter_squad: { id: request.callId, from: request.from,
    to: request.to, depth: 1, conversationId: request.callId } });
  const signature = 'sha256=' + createHmac('sha256', process.env[envName]).update(body).digest('hex');
  const response = await fetch(`http://127.0.0.1:${daemon.webhookPort}/call/work`, {
    method: 'POST', body, headers: { 'x-hub-signature-256': signature } });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).ok, true);
  assert.equal((await fs.readFile(effects, 'utf8')).trim().split('\n').length, 1);
});

test('inbox messages arriving after startup are polled and invalid messages are quarantined', async (t) => {
  const { root, daemon, request, effects } = await deliveryFixture(t);
  daemon.db.prepare("UPDATE squad_daemons SET status='stopped' WHERE squad_slug='beta'").run();
  assert.equal((await callSquad(request)).error, 'offline_queued');
  await fs.writeFile(path.join(INBOX_DIR(root, 'beta'), 'invalid.json'), '{');
  await daemon._pollEvents();
  assert.equal((await fs.readFile(effects, 'utf8')).trim().split('\n').length, 1);
  assert.equal(await fs.readFile(path.join(INBOX_DIR(root, 'beta'), 'failed/invalid.json'), 'utf8'), '{');
  assert.ok(daemon.eventLog.some((entry) => entry.message === 'Inbox message rejected' && entry.file === 'invalid.json'));
});

function runChild(script, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['-e', script, ...args], { windowsHide: true });
    let out = '', err = '';
    child.stdout.on('data', (data) => { out += data; });
    child.stderr.on('data', (data) => { err += data; });
    child.on('error', reject);
    child.on('close', (code) => code === 0 ? resolve(out) : reject(new Error(err || out)));
  });
}

test('two sender processes publish one complete inbox message and two daemons execute it once', async (t) => {
  const { root, daemon, request, effects } = await deliveryFixture(t);
  daemon.db.prepare("UPDATE squad_daemons SET status='stopped' WHERE squad_slug='beta'").run();
  const script = `require('./src/squad/inter-squad').callSquad(JSON.parse(process.argv[1])).then(r=>console.log(JSON.stringify(r))).catch(e=>{console.error(e);process.exit(1)});`;
  const results = await Promise.all([runChild(script, [JSON.stringify(request)]), runChild(script, [JSON.stringify(request)])]);
  assert.ok(results.every((result) => JSON.parse(result).error === 'offline_queued'));
  assert.equal((await fs.readdir(INBOX_DIR(root, 'beta'))).filter((file) => file.endsWith('.json')).length, 1);
  const conflicting = await callSquad({ ...request, payload: { changed: true } });
  assert.equal(conflicting.error, 'call_identity_conflict');
  const receiver = `const {SquadDaemon}=require('./src/squad-daemon');(async()=>{const d=new SquadDaemon(process.argv[1],'beta',{poll:60000});await d.start();await d.stop();})().catch(e=>{console.error(e);process.exit(1)});`;
  await Promise.all([runChild(receiver, [root]), runChild(receiver, [root])]);
  assert.equal((await fs.readFile(effects, 'utf8')).trim().split('\n').length, 1);
});

test('actual HTTP timeout while the worker is running preserves one delivery through inbox fallback', async (t) => {
  const { root, daemon, request, effects } = await deliveryFixture(t, `
    const fs=require('fs'),path=require('path');fs.appendFileSync(path.join(__dirname,'effects.jsonl'),'effect\\n');
    setTimeout(()=>process.stdout.write(JSON.stringify({done:true})),10500);
  `);
  await fs.writeFile(path.join(path.dirname(effects), 'worker.json'), JSON.stringify({ slug: 'work', type: 'manual', timeout_ms: 20000 }));
  assert.equal((await callSquad(request)).error, 'offline_queued');
  await daemon._pollEvents();
  assert.equal(await fs.readFile(effects, 'utf8'), 'effect\n');
  await Promise.all([...daemon.httpRequests]);
  await daemon._pollEvents();
  assert.equal((await fs.readdir(INBOX_DIR(root, 'beta'))).filter((file) => file.endsWith('.json')).length, 0);
  assert.equal(daemon.db.prepare('SELECT attempts FROM squad_deliveries').get().attempts, 1);
});

test('a call with a missing worker stays pending and can complete after the worker is installed', async (t) => {
  const { root, daemon, request, effects } = await deliveryFixture(t);
  const file = path.join(path.dirname(effects), 'worker.json');
  const config = await fs.readFile(file, 'utf8');
  await fs.unlink(file);
  const pending = await callSquad(request);
  assert.equal(pending.ok, false);
  assert.equal(pending.status, 'pending');
  assert.equal(pending.error, 'no_consumers');
  await fs.writeFile(file, config);
  await daemon._pollEvents();
  assert.equal((await callSquad(request)).ok, true);
  assert.equal((await fs.readFile(effects, 'utf8')).trim().split('\n').length, 1);
  assert.equal(await fs.readdir(INBOX_DIR(root, 'beta')).catch(() => null), null);
});

test('a receiver process dying after an effect keeps its inbox message and requires reconciliation', async (t) => {
  const { root, daemon, request, effects } = await deliveryFixture(t);
  daemon.db.prepare("UPDATE squad_daemons SET status='stopped' WHERE squad_slug='beta'").run();
  await callSquad(request);
  await runChild(`
    const {SquadDaemon}=require('./src/squad-daemon');
    const original=SquadDaemon.prototype._executeWorker;
    SquadDaemon.prototype._executeWorker=async function(...args){await original.apply(this,args);process.exit(0)};
    new SquadDaemon(process.argv[1],'beta',{poll:60000}).start().catch(e=>{console.error(e);process.exit(1)});
  `, [root]);
  await daemon._pollEvents();
  const row = daemon.db.prepare('SELECT * FROM squad_deliveries').get();
  assert.equal(row.status, 'reconciliation_required');
  assert.equal(row.attempts, 1);
  assert.equal((await fs.readFile(effects, 'utf8')).trim().split('\n').length, 1);
  assert.equal((await fs.readdir(INBOX_DIR(root, 'beta'))).filter((file) => file.endsWith('.json')).length, 1);
  assert.equal(deliveries.reconcile(daemon.db, { squad: 'beta', key: row.delivery_key,
    resolution: 'completed', evidence: 'Verified the effect recorded by the destination worker.' }).ok, true);
  await daemon._pollEvents();
  assert.equal((await fs.readdir(INBOX_DIR(root, 'beta'))).filter((file) => file.endsWith('.json')).length, 0);
  assert.equal((await fs.readFile(effects, 'utf8')).trim().split('\n').length, 1);
});

test('callSquad: depth > 5 retorna cascade_guard sem fazer fetch', async () => {
  const tmpDir = await makeTempDir();
  try {
    let fetchCalled = false;
    const origFetch = globalThis.fetch;
    globalThis.fetch = async () => { fetchCalled = true; return { ok: true, json: async () => ({}) }; };
    try {
      const result = await callSquad({
        projectDir: tmpDir,
        from: 'alpha',
        to: 'beta',
        worker: 'processar',
        payload: {},
        depth: 6
      });
      assert.equal(result.ok, false);
      assert.equal(result.error, 'cascade_guard');
      assert.equal(fetchCalled, false, 'fetch não deve ser chamado com depth > 5');
    } finally {
      globalThis.fetch = origFetch;
    }
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
  }
});

test('callSquad: resolved daemon receives the call identity through /call/{worker}', async () => {
  const tmpDir = await makeTempDir();
  try {
    // Criar DB com registro de daemon rodando
    const { db } = await openRuntimeDb(tmpDir);
    db.prepare(`
      INSERT INTO squad_daemons (squad_slug, status, pid, port, started_at, last_heartbeat)
      VALUES ('beta', 'running', 1234, 9999, datetime('now'), datetime('now'))
    `).run();
    db.close();

    let capturedUrl = null;
    let capturedBody = null;
    const origFetch = globalThis.fetch;
    globalThis.fetch = async (url, opts) => {
      capturedUrl = url;
      capturedBody = JSON.parse(opts.body);
      return { ok: true, json: async () => ({ ok: true, output: 'done' }) };
    };
    try {
      const result = await callSquad({
        projectDir: tmpDir,
        from: 'alpha',
        to: 'beta',
        worker: 'processar',
        payload: { dado: 'valor' }
      });
      assert.equal(capturedUrl, 'http://127.0.0.1:9999/call/processar');
      assert.equal(capturedBody.dado, 'valor');
      assert.ok(capturedBody._inter_squad);
      assert.equal(capturedBody._inter_squad.from, 'alpha');
      assert.equal(result.ok, true);
      assert.ok(result.conversationId);
    } finally {
      globalThis.fetch = origFetch;
    }
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
  }
});

test('callSquad: squad offline cria arquivo .json em inbox/', async () => {
  const tmpDir = await makeTempDir();
  try {
    // Sem registro de daemon — squad offline
    await openRuntimeDb(tmpDir).then(h => h.db.close());

    const origFetch = globalThis.fetch;
    // fetch não deve ser chamado
    globalThis.fetch = async () => { throw new Error('não deve ser chamado'); };
    try {
      const result = await callSquad({
        projectDir: tmpDir,
        from: 'alpha',
        to: 'beta',
        worker: 'processar',
        payload: { x: 1 }
      });

      assert.equal(result.ok, false);
      assert.equal(result.error, 'offline_queued');
      assert.ok(result.conversationId);

      // Verificar que o arquivo foi criado na inbox
      const inboxDir = INBOX_DIR(tmpDir, 'beta');
      const files = await fs.readdir(inboxDir);
      const jsonFiles = files.filter(f => f.endsWith('.json'));
      assert.equal(jsonFiles.length, 1);

      const msg = JSON.parse(await fs.readFile(path.join(inboxDir, jsonFiles[0]), 'utf8'));
      assert.equal(msg.from, 'alpha');
      assert.equal(msg.to, 'beta');
      assert.equal(msg.worker, 'processar');
      assert.deepEqual(msg.payload, { x: 1 });
      assert.equal(msg.conversationId, result.conversationId);
    } finally {
      globalThis.fetch = origFetch;
    }
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
  }
});

test('_processInbox: processa arquivo e deleta após sucesso', async () => {
  const tmpDir = await makeTempDir();
  try {
    const squadSlug = 'beta';
    const workerSlug = 'processar';

    await setupWorker(tmpDir, squadSlug, workerSlug,
      { slug: workerSlug, name: 'Processar', type: 'webhook' },
      'process.stdout.write(JSON.stringify({ done: true })); process.exit(0);'
    );

    // Criar inbox com mensagem
    const inboxDir = INBOX_DIR(tmpDir, squadSlug);
    await fs.mkdir(inboxDir, { recursive: true });
    const msgId = 'test-msg-001';
    await fs.writeFile(
      path.join(inboxDir, `${msgId}.json`),
      JSON.stringify({
        id: msgId,
        from: 'alpha',
        to: squadSlug,
        worker: workerSlug,
        payload: { x: 42 },
        conversationId: 'conv-123',
        depth: 1,
        created_at: new Date().toISOString()
      })
    );

    const daemon = new SquadDaemon(tmpDir, squadSlug, { port: 0 });
    await daemon.start();
    try {
      // Arquivo deve ter sido processado e deletado durante start()
      let files;
      try {
        files = await fs.readdir(inboxDir);
      } catch {
        files = [];
      }
      const remaining = files.filter(f => f.endsWith('.json'));
      assert.equal(remaining.length, 0, 'arquivo deve ser deletado após processamento bem-sucedido');
    } finally {
      await daemon.stop();
    }
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
  }
});

test('_processInbox: failed worker keeps the message pending for reconciliation', async () => {
  const tmpDir = await makeTempDir();
  try {
    const squadSlug = 'beta';
    const workerSlug = 'falhar';

    await setupWorker(tmpDir, squadSlug, workerSlug,
      { slug: workerSlug, name: 'Falhar', type: 'webhook' },
      'process.stderr.write("erro proposital"); process.exit(1);'
    );

    // Criar inbox com mensagem
    const inboxDir = INBOX_DIR(tmpDir, squadSlug);
    await fs.mkdir(inboxDir, { recursive: true });
    const msgFile = 'fail-msg-001.json';
    await fs.writeFile(
      path.join(inboxDir, msgFile),
      JSON.stringify({
        id: 'fail-msg-001',
        from: 'alpha',
        to: squadSlug,
        worker: workerSlug,
        payload: {},
        conversationId: 'conv-456',
        depth: 0,
        created_at: new Date().toISOString()
      })
    );

    const daemon = new SquadDaemon(tmpDir, squadSlug, { port: 0 });
    await daemon.start();
    try {
      // An unknown external outcome must remain tied to the original delivery.
      const failedDir = path.join(inboxDir, 'failed');
      const failedFiles = await fs.readdir(failedDir).catch(() => []);
      assert.equal(failedFiles.includes(msgFile), false);

      // Keep the original message until the outcome has been reconciled.
      const inboxFiles = await fs.readdir(inboxDir).catch(() => []);
      const jsonInInbox = inboxFiles.filter(f => f.endsWith('.json'));
      assert.equal(jsonInInbox.length, 1, 'message must remain available for reconciliation');
      const delivery = daemon.db.prepare('SELECT * FROM squad_deliveries').get();
      assert.equal(delivery.status, 'reconciliation_required');
      assert.equal(delivery.attempts, 1);
    } finally {
      await daemon.stop();
    }
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
  }
});
