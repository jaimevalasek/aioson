'use strict';

const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');
const { openRuntimeDb, insertWorkerRun } = require('./runtime-store');
const { listWorkers, runWorker, loadWorkerConfig } = require('./worker-runner');
const deliveries = require('./squad/event-delivery');

const SQUADS_DIR = path.join('.aioson', 'squads');

// --- Simple Cron Parser (zero dependencies) ---

const CRON_PRESETS = {
  '@yearly': '0 0 1 1 *',
  '@monthly': '0 0 1 * *',
  '@weekly': '0 0 * * 0',
  '@daily': '0 0 * * *',
  '@hourly': '0 * * * *',
  '@every5m': '*/5 * * * *',
  '@every10m': '*/10 * * * *',
  '@every15m': '*/15 * * * *',
  '@every30m': '*/30 * * * *'
};

function parseCronField(field, min, max) {
  if (field === '*') return null; // matches all
  const values = new Set();
  for (const part of field.split(',')) {
    const stepMatch = part.match(/^(\*|\d+(?:-\d+)?)\/(\d+)$/);
    if (stepMatch) {
      const step = parseInt(stepMatch[2], 10);
      let start = min;
      let end = max;
      if (stepMatch[1] !== '*') {
        const range = stepMatch[1].split('-');
        start = parseInt(range[0], 10);
        if (range[1]) end = parseInt(range[1], 10);
      }
      for (let i = start; i <= end; i += step) values.add(i);
    } else if (part.includes('-')) {
      const [a, b] = part.split('-').map(Number);
      for (let i = a; i <= b; i++) values.add(i);
    } else {
      values.add(parseInt(part, 10));
    }
  }
  return values;
}

function parseCronExpression(expr) {
  const resolved = CRON_PRESETS[expr] || expr;
  const parts = resolved.trim().split(/\s+/);
  if (parts.length !== 5) return null;
  return {
    minute: parseCronField(parts[0], 0, 59),
    hour: parseCronField(parts[1], 0, 23),
    dayOfMonth: parseCronField(parts[2], 1, 31),
    month: parseCronField(parts[3], 1, 12),
    dayOfWeek: parseCronField(parts[4], 0, 6)
  };
}

function cronMatches(parsed, date) {
  if (!parsed) return false;
  const checks = [
    [parsed.minute, date.getMinutes()],
    [parsed.hour, date.getHours()],
    [parsed.dayOfMonth, date.getDate()],
    [parsed.month, date.getMonth() + 1],
    [parsed.dayOfWeek, date.getDay()]
  ];
  return checks.every(([field, val]) => field === null || field.has(val));
}

// --- Squad Daemon ---

class SquadDaemon {
  constructor(projectDir, squadSlug, options = {}) {
    this.projectDir = projectDir;
    this.squadSlug = squadSlug;
    this.webhookPort = options.port || 0;
    this.pollInterval = options.poll || 10000;
    this.config = options.config || {};
    this.running = false;
    this.db = null;
    this.httpServer = null;
    this.cronTimer = null;
    this.pollTimer = null;
    this.cronJobs = [];
    this.lastCronCheck = null;
    this.eventLog = [];
    this.startedAt = null;
    this.eventPoll = null;
    this.cronRuns = new Map();
    this.inboxPoll = null;
    this.httpRequests = new Set();
  }

  log(level, message, data) {
    const entry = {
      ts: new Date().toISOString(),
      level,
      squad: this.squadSlug,
      message,
      ...(data || {})
    };
    this.eventLog.push(entry);
    if (this.eventLog.length > 500) this.eventLog.shift();
    return entry;
  }

  async start() {
    // 1. Open runtime DB
    const handle = await openRuntimeDb(this.projectDir, { mustExist: false });
    if (!handle) {
      throw new Error('Could not open runtime database');
    }
    this.db = handle.db;

    // 2. Load workers and register cron jobs
    const workers = await listWorkers(this.projectDir, this.squadSlug);
    this.cronJobs = [];
    for (const worker of workers) {
      if (worker.type === 'scheduled' && worker.trigger && worker.trigger.cron) {
        const parsed = parseCronExpression(worker.trigger.cron);
        if (parsed) {
          this.cronJobs.push({ workerSlug: worker.slug, cron: worker.trigger.cron, parsed });
        }
      }
    }

    // 3. Start webhook HTTP server
    this.httpServer = await this._startWebhookServer();

    // 4. Start cron check loop (every 60s, checks at minute boundaries)
    this.lastCronCheck = new Date();
    this.cronTimer = setInterval(() => this._checkCron(), 60000);

    // 5. Start event poll loop
    this.pollTimer = setInterval(() => this._pollEvents(), this.pollInterval);

    // 6. Register daemon in SQLite
    this._upsertDaemonRecord('running');

    this.running = true;
    await this._processInbox();

    this.startedAt = new Date().toISOString();
    this.log('info', 'Daemon started', {
      port: this.webhookPort,
      cronJobs: this.cronJobs.length,
      workers: workers.length
    });

    return {
      port: this.webhookPort,
      cronJobs: this.cronJobs.length,
      workers: workers.length
    };
  }

  async stop() {
    this.running = false;

    if (this.cronTimer) {
      clearInterval(this.cronTimer);
      this.cronTimer = null;
    }
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }

    if (this.httpServer) {
      await new Promise((resolve) => this.httpServer.close(resolve));
      this.httpServer = null;
    }

    await Promise.allSettled([this.eventPoll, this.inboxPoll, ...this.cronRuns.values(), ...this.httpRequests].filter(Boolean));

    this._upsertDaemonRecord('stopped');

    if (this.db) {
      this.db.close();
      this.db = null;
    }

    this.log('info', 'Daemon stopped');
  }

  getStatus() {
    return {
      squad: this.squadSlug,
      running: this.running,
      port: this.webhookPort,
      startedAt: this.startedAt,
      cronJobs: this.cronJobs.map(j => ({ worker: j.workerSlug, cron: j.cron })),
      recentLogs: this.eventLog.slice(-20)
    };
  }

  // --- Private methods ---

  _startWebhookServer() {
    return new Promise((resolve, reject) => {
      const server = http.createServer((req, res) => {
        const request = this._handleWebhook(req, res).catch((error) => {
          this.log('error', 'HTTP request failed', { error: error.message });
          if (!res.headersSent) res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: false, error: 'request_failed' }));
        });
        this.httpRequests.add(request);
        request.finally(() => this.httpRequests.delete(request));
      });
      server.on('error', reject);
      const bindAddr = this.config.webhook?.bind || '127.0.0.1';
      server.listen(this.webhookPort, bindAddr, () => {
        this.webhookPort = server.address().port;
        resolve(server);
      });
    });
  }

  async _handleWebhook(req, res) {
    const segments = (req.url || '').replace(/\/+$/, '').split('/').filter(Boolean);

    // Status aceita GET e POST (health check externo)
    if (segments[0] === 'status' && segments.length === 1) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(this.getStatus()));
      return;
    }

    if (req.method !== 'POST' && req.method !== 'OPTIONS') {
      res.writeHead(405, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Method not allowed' }));
      return;
    }

    // Read raw body (must be before JSON.parse so HMAC validates original bytes)
    let rawBody = '';
    for await (const chunk of req) rawBody += chunk;

    // HMAC signature validation
    if (this.config.webhook?.validate_signature) {
      const { createHmac, timingSafeEqual } = require('node:crypto');
      const envKey = this.config.webhook.signature_env || 'WEBHOOK_SECRET';
      const headerKey = (this.config.webhook.signature_header || 'x-hub-signature-256').toLowerCase();
      const secret = process.env[envKey];
      const receivedSig = req.headers[headerKey];

      if (!secret || !receivedSig) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'signature_required' }));
        return;
      }
      const expected = 'sha256=' + createHmac('sha256', secret).update(rawBody).digest('hex');
      try {
        if (!timingSafeEqual(Buffer.from(receivedSig), Buffer.from(expected))) {
          res.writeHead(401, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'invalid_signature' }));
          return;
        }
      } catch {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'invalid_signature' }));
        return;
      }
    }

    let payload;
    try {
      payload = JSON.parse(rawBody || '{}');
    } catch {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Invalid JSON body' }));
      return;
    }

    // POST /call/:worker (inter-squad)
    if (segments[0] === 'call' && segments[1]) {
      if (req.method !== 'POST') {
        res.writeHead(405, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: 'Method not allowed' }));
        return;
      }
      const depth = payload?._inter_squad?.depth ?? 0;
      if (depth > 5) {
        res.writeHead(429, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'cascade_guard' }));
        return;
      }
      const { _inter_squad: metadata, ...body } = payload || {};
      const result = await this._acceptCall({ protocol: 1, id: metadata?.id, from: metadata?.from,
        to: metadata?.to, worker: segments[1], payload: body, conversationId: metadata?.conversationId, depth });
      const status = result.ok ? 200 : ['pending', 'running'].includes(result.status) ? 202
        : result.error === 'invalid_call_envelope' ? 400 : 409;
      res.writeHead(status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(result));
      return;
    }

    // /api/:path (public API endpoints)
    if (segments[0] === 'api' && segments[1]) {
      const apiPath = '/' + segments[1];
      const endpoint = (this.config.api_endpoints || []).find(e => e.path === apiPath);

      if (!endpoint) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'api_endpoint_not_found' }));
        return;
      }

      const origin = req.headers['origin'];
      const corsOrigins = endpoint.cors_origins || [];
      if (origin && corsOrigins.includes(origin)) {
        res.setHeader('Access-Control-Allow-Origin', origin);
        res.setHeader('Access-Control-Allow-Methods', endpoint.method || 'POST');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
        res.setHeader('Vary', 'Origin');
      }
      if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
      }

      const result = await this._executeWorker(endpoint.worker, payload, 'api');
      res.writeHead(result.ok ? 200 : 500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(result));
      return;
    }

    if (segments[0] !== 'webhook' || !segments[1]) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Not found. Use POST /webhook/<worker-slug>' }));
      return;
    }

    const workerSlug = segments[1];

    this.log('info', `Webhook received for ${workerSlug}`, { payload });

    // Execute worker
    const result = await this._executeWorker(workerSlug, payload, 'webhook');

    const statusCode = result.ok ? 200 : 500;
    res.writeHead(statusCode, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(result));
  }

  async _checkCron() {
    if (!this.running || this.cronJobs.length === 0) return;

    const now = new Date();
    deliveries.recover(this.db, this.squadSlug);
    const started = [];
    for (const job of this.cronJobs) {
      if (this.cronRuns.has(job.workerSlug)) continue;
      const outstanding = this.db.prepare(`SELECT d.* FROM squad_deliveries d JOIN squad_delivery_batches b ON b.source_key=d.source_key
        WHERE d.squad_slug=? AND d.worker_slug=? AND b.source_type='cron' AND d.status IN ('pending','running','reconciliation_required') ORDER BY d.updated_at LIMIT 1`)
        .get(this.squadSlug, job.workerSlug);
      if (!outstanding && !cronMatches(job.parsed, now)) continue;
      const operation = (async () => {
        let row = outstanding;
        if (!row) {
          const config = await loadWorkerConfig(this.projectDir, this.squadSlug, job.workerSlug);
          const batch = deliveries.prepareBatch(this.db, { type: 'cron', id: `${job.workerSlug}:${Math.floor(now.getTime() / 60000)}`, squad: this.squadSlug, workers: [{ ...config, slug: job.workerSlug }] });
          row = this.db.prepare('SELECT * FROM squad_deliveries WHERE source_key=?').get(batch.source_key);
        }
        const owned = deliveries.claim(this.db, row.delivery_key);
        if (owned) await this._runDelivery(owned, {}, 'scheduled');
      })().catch((error) => this.log('error', `Cron execution failed: ${job.workerSlug}`, { error: error.message }))
        .finally(() => this.cronRuns.delete(job.workerSlug));
      this.cronRuns.set(job.workerSlug, operation);
      started.push(operation);
    }
    this.lastCronCheck = now;

    // Update heartbeat
    this._updateHeartbeat();
    await Promise.all(started);
  }

  async _pollEvents() {
    if (!this.running || !this.db) return;
    if (this.eventPoll) return this.eventPoll;
    this.eventPoll = this._deliverHandoffs();
    try { await this.eventPoll; } finally { this.eventPoll = null; }
  }

  async _deliverHandoffs() {

    // Poll for pending handoffs targeted at this squad
    try {
      deliveries.recover(this.db, this.squadSlug);
      const pending = this.db.prepare(
        "SELECT * FROM squad_handoffs WHERE to_squad = ? AND status IN ('pending','failed') ORDER BY created_at ASC"
      ).all(this.squadSlug);
      const workers = await listWorkers(this.projectDir, this.squadSlug);
      const consumers = workers.filter((worker) => worker.type === 'event' && worker.trigger?.source === 'handoff');

      for (const handoff of pending) {
        if (!this.running) break;
        this.log('info', `Handoff received from ${handoff.from_squad}`, { handoffId: handoff.id });

        // Find event-triggered workers
        const batch = deliveries.prepareBatch(this.db, { type: 'handoff', id: handoff.id, squad: this.squadSlug, workers: consumers });
        let payload;
        try {
          payload = handoff.payload_json ? JSON.parse(handoff.payload_json) : {};
          if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new Error('Expected object payload');
        } catch (error) {
          this.db.prepare('UPDATE squad_delivery_batches SET error=? WHERE source_key=?').run(`invalid_payload: ${error.message}`, batch.source_key);
          continue;
        }
        const rows = this.db.prepare('SELECT * FROM squad_deliveries WHERE source_key=? ORDER BY worker_slug').all(batch.source_key);
        for (const row of rows) {
          if (!this.running) break;
          const owned = deliveries.claim(this.db, row.delivery_key);
          if (owned) await this._runDelivery(owned, payload, 'event');
        }
      }
    } catch (err) {
      this.log('error', 'Poll error', { error: err.message });
    }

    await this._processInbox().catch((error) => this.log('error', 'Inbox poll failed', { error: error.message }));
    this._updateHeartbeat();
  }

  async _runDelivery(owned, payload, triggerType) {
    let result;
    try {
      result = await this._executeWorker(owned.worker_slug, {
        ...payload, _delivery: { idempotency_key: owned.delivery_key, attempt: owned.attempts, source_key: owned.source_key }
      }, triggerType, { noRetry: true });
    } catch (error) {
      result = { ok: false, error: error.message };
    }
    deliveries.finish(this.db, owned, result);
    return result;
  }

  async _executeWorker(workerSlug, inputPayload, triggerType, options = {}) {
    const result = await runWorker(this.projectDir, this.squadSlug, workerSlug, inputPayload, {
      triggerType,
      noRetry: false,
      ...options
    });

    // Log to runtime store
    if (this.db) {
      try {
        const conversationId = triggerType === 'inter-squad'
          ? inputPayload?._inter_squad?.conversationId
          : undefined;
        insertWorkerRun(this.db, {
          squadSlug: this.squadSlug,
          workerSlug,
          triggerType,
          inputJson: JSON.stringify(inputPayload),
          outputJson: result.ok ? JSON.stringify(result.output) : null,
          status: result.ok ? 'completed' : 'failed',
          errorMessage: result.ok ? null : result.error,
          durationMs: result.durationMs || 0,
          attempt: result.attempt || 1,
          conversationId
        });
      } catch (err) {
        this.log('error', 'Failed to log worker run', { error: err.message });
      }
    }

    this.log(result.ok ? 'info' : 'error', `Worker ${workerSlug}: ${result.ok ? 'completed' : 'failed'}`, {
      triggerType,
      durationMs: result.durationMs
    });

    return result;
  }

  async _acceptCall(message) {
    let request;
    try {
      request = deliveries.normalizeCall(message);
      if (request.to !== this.squadSlug) throw new Error('invalid_call_envelope');
    } catch (error) { return { ok: false, error: error.message }; }
    deliveries.recover(this.db, this.squadSlug);
    let batch;
    try { batch = deliveries.prepareCall(this.db, request, null); }
    catch (error) { return { ok: false, error: error.message }; }
    let row = this.db.prepare('SELECT * FROM squad_deliveries WHERE source_key=?').get(batch.source_key);
    if (!row) {
      let worker;
      try { worker = await loadWorkerConfig(this.projectDir, this.squadSlug, request.worker); }
      catch (error) {
        this.db.prepare('UPDATE squad_delivery_batches SET error=? WHERE source_key=?').run('worker_config_invalid', batch.source_key);
        this.log('error', 'Call worker configuration invalid', { worker: request.worker, error: error.message });
        return { ok: false, status: 'pending', error: 'worker_config_invalid', callId: request.id };
      }
      batch = deliveries.prepareCall(this.db, request, worker);
      row = this.db.prepare('SELECT * FROM squad_deliveries WHERE source_key=?').get(batch.source_key);
    }
    if (!row) return { ok: false, status: 'pending', error: 'no_consumers', callId: request.id };
    const owned = deliveries.claim(this.db, row.delivery_key);
    if (owned) await this._runDelivery(owned, {
      ...request.payload, _inter_squad: { id: request.id, from: request.from, to: request.to,
        conversationId: request.conversationId, depth: request.depth }
    }, 'inter-squad');
    row = this.db.prepare('SELECT * FROM squad_deliveries WHERE delivery_key=?').get(row.delivery_key);
    return { ok: row.status === 'completed', status: row.status, error: row.error,
      output: row.receipt_json ? JSON.parse(row.receipt_json) : null, callId: request.id, delivery_key: row.delivery_key };
  }

  async _processInbox() {
    if (!this.db) return;
    if (this.inboxPoll) return this.inboxPoll;
    this.inboxPoll = this._drainInbox();
    try { await this.inboxPoll; } finally { this.inboxPoll = null; }
  }

  async _drainInbox() {
    const inboxDir = path.join(this.projectDir, '.aioson', 'squads', this.squadSlug, 'inbox');
    let entries = [];
    try { entries = await fs.readdir(inboxDir, { withFileTypes: true }); } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }

    for (const entry of entries.filter((entry) => entry.isFile() && entry.name.endsWith('.json'))) {
      if (!this.running) break;
      const file = entry.name;
      const filePath = path.join(inboxDir, file);
      try {
        const raw = await fs.readFile(filePath, 'utf8');
        const msg = JSON.parse(raw);
        const request = deliveries.normalizeCall({ ...msg, depth: msg.protocol === 1 ? msg.depth : (msg.depth ?? 0) + 1 });
        const result = await this._acceptCall(request);
        if (result.ok) {
          await fs.unlink(filePath);
        } else if (['invalid_call_envelope', 'call_identity_conflict'].includes(result.error)) {
          throw new Error(result.error);
        }
      } catch (error) {
        if (error.code === 'ENOENT') continue; // Another daemon may have removed a completed file.
        this.log('error', 'Inbox message rejected', { file, error: error.message });
        if (error instanceof SyntaxError || ['invalid_call_envelope', 'call_identity_conflict'].includes(error.message)) {
          const failedDir = path.join(inboxDir, 'failed');
          await fs.mkdir(failedDir, { recursive: true });
          await fs.rename(filePath, path.join(failedDir, file)).catch(() => {});
        }
      }
    }
    // HTTP-accepted calls survive loss of the connection and need no inbox file to resume.
    const pending = this.db.prepare(`SELECT r.request_json FROM squad_call_requests r
      JOIN squad_delivery_batches b ON b.source_key=r.source_key WHERE b.squad_slug=? AND b.status='pending'`).all(this.squadSlug);
    for (const row of pending) {
      if (!this.running) break;
      await this._acceptCall(JSON.parse(row.request_json));
    }
  }

  _upsertDaemonRecord(status) {
    if (!this.db) return;
    try {
      this.db.prepare(`
        INSERT INTO squad_daemons (squad_slug, status, pid, port, started_at, last_heartbeat, config_json)
        VALUES (@squad_slug, @status, @pid, @port, @started_at, @last_heartbeat, @config_json)
        ON CONFLICT(squad_slug) DO UPDATE SET
          status = excluded.status,
          pid = excluded.pid,
          port = excluded.port,
          started_at = CASE WHEN excluded.status = 'running' THEN excluded.started_at ELSE squad_daemons.started_at END,
          last_heartbeat = excluded.last_heartbeat,
          config_json = excluded.config_json,
          error_message = NULL
      `).run({
        squad_slug: this.squadSlug,
        status,
        pid: process.pid,
        port: this.webhookPort || null,
        started_at: this.startedAt || new Date().toISOString(),
        last_heartbeat: new Date().toISOString(),
        config_json: JSON.stringify({
          cronJobs: this.cronJobs.map(j => ({ worker: j.workerSlug, cron: j.cron }))
        })
      });
    } catch {
      // Ignore — daemon record is nice-to-have
    }
  }

  _updateHeartbeat() {
    if (!this.db) return;
    try {
      this.db.prepare(
        "UPDATE squad_daemons SET last_heartbeat = datetime('now') WHERE squad_slug = ?"
      ).run(this.squadSlug);
    } catch {
      // Ignore
    }
  }
}

module.exports = {
  SquadDaemon,
  parseCronExpression,
  cronMatches,
  parseCronField
};
