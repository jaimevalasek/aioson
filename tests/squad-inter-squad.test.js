'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { callSquad, INBOX_DIR } = require('../src/squad/inter-squad');
const { SquadDaemon } = require('../src/squad-daemon');
const { openRuntimeDb } = require('../src/runtime-store');

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

test('callSquad: com porta resolvida, faz fetch para http://127.0.0.1:{port}/webhook/{worker}', async () => {
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
      assert.equal(capturedUrl, 'http://127.0.0.1:9999/webhook/processar');
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

test('_processInbox: move para failed/ quando worker falha', async () => {
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
      // Arquivo deve ter sido movido para failed/
      const failedDir = path.join(inboxDir, 'failed');
      const failedFiles = await fs.readdir(failedDir).catch(() => []);
      assert.ok(failedFiles.includes(msgFile), 'arquivo deve estar em failed/');

      // Não deve estar mais na inbox
      const inboxFiles = await fs.readdir(inboxDir).catch(() => []);
      const jsonInInbox = inboxFiles.filter(f => f.endsWith('.json'));
      assert.equal(jsonInInbox.length, 0, 'arquivo não deve estar mais na inbox');
    } finally {
      await daemon.stop();
    }
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
  }
});
