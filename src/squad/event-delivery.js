'use strict';

const { createHash, randomUUID } = require('node:crypto');
const os = require('node:os');

function migrate(db) {
  // Additive, versioned locally: no change to the legacy handoff status CHECK.
  db.exec(`
    CREATE TABLE IF NOT EXISTS squad_delivery_schema (version INTEGER PRIMARY KEY);
    CREATE TABLE IF NOT EXISTS squad_delivery_batches (
      source_key TEXT PRIMARY KEY, source_type TEXT NOT NULL, source_id TEXT NOT NULL,
      squad_slug TEXT NOT NULL, consumers_json TEXT NOT NULL, error TEXT,
      status TEXT NOT NULL DEFAULT 'pending', updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS squad_deliveries (
      delivery_key TEXT PRIMARY KEY, source_key TEXT NOT NULL, squad_slug TEXT NOT NULL,
      worker_slug TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending',
      attempts INTEGER NOT NULL DEFAULT 0, max_attempts INTEGER NOT NULL,
      idempotent INTEGER NOT NULL DEFAULT 0, owner_token TEXT, owner_pid INTEGER, owner_host TEXT,
      next_attempt_at INTEGER NOT NULL DEFAULT 0, error TEXT, receipt_json TEXT,
      history_json TEXT NOT NULL DEFAULT '[]', updated_at TEXT NOT NULL,
      FOREIGN KEY (source_key) REFERENCES squad_delivery_batches(source_key)
    );
    CREATE INDEX IF NOT EXISTS idx_squad_deliveries_pending ON squad_deliveries(squad_slug,status);
    INSERT OR IGNORE INTO squad_delivery_schema (version) VALUES (1);
  `);
}

const timestamp = () => new Date().toISOString();
const keyFor = (...parts) => createHash('sha256').update(JSON.stringify(parts)).digest('hex');

function alive(row) {
  if (row.owner_host !== os.hostname()) return true;
  if (!Number.isInteger(row.owner_pid) || row.owner_pid <= 0) return true;
  try { process.kill(row.owner_pid, 0); return true; } catch (error) { return error.code !== 'ESRCH'; }
}

function prepareBatch(db, { type, id, squad, workers }) {
  const sourceKey = keyFor(type, id, squad);
  return db.transaction(() => {
    let batch = db.prepare('SELECT * FROM squad_delivery_batches WHERE source_key=?').get(sourceKey);
    if (!batch || (JSON.parse(batch.consumers_json).length === 0 && workers.length)) {
      const consumers = workers.map((worker) => worker.slug);
      db.prepare(`INSERT INTO squad_delivery_batches (source_key,source_type,source_id,squad_slug,consumers_json,error,updated_at)
        VALUES (?,?,?,?,?,?,?) ON CONFLICT(source_key) DO UPDATE SET consumers_json=excluded.consumers_json,error=excluded.error,updated_at=excluded.updated_at`)
        .run(sourceKey, type, id, squad, JSON.stringify(consumers), workers.length ? null : 'no_consumers', timestamp());
      for (const worker of workers) {
        const configuredMax = worker.delivery?.max_attempts;
        const max = Number.isInteger(configuredMax) && configuredMax > 0 ? Math.min(configuredMax, 5) : 3;
        db.prepare(`INSERT OR IGNORE INTO squad_deliveries
          (delivery_key,source_key,squad_slug,worker_slug,max_attempts,idempotent,updated_at) VALUES (?,?,?,?,?,?,?)`)
          .run(keyFor(sourceKey, worker.slug), sourceKey, squad, worker.slug, max, worker.delivery?.idempotent === true ? 1 : 0, timestamp());
      }
      batch = db.prepare('SELECT * FROM squad_delivery_batches WHERE source_key=?').get(sourceKey);
    }
    if (type === 'handoff') {
      // Legacy readers must not claim a handoff owned by the delivery protocol.
      db.prepare("UPDATE squad_handoffs SET status='failed' WHERE id=? AND status='pending'").run(id);
    }
    return batch;
  }).immediate();
}

function recover(db, squad) {
  db.transaction(() => {
    for (const row of db.prepare("SELECT * FROM squad_deliveries WHERE squad_slug=? AND status='running'").all(squad)) {
      if (!alive(row)) db.prepare("UPDATE squad_deliveries SET status='reconciliation_required',error='owner_exited_outcome_unknown',updated_at=? WHERE delivery_key=? AND owner_token=?")
        .run(timestamp(), row.delivery_key, row.owner_token);
    }
  }).immediate();
}

function claim(db, key) {
  return db.transaction(() => {
    const row = db.prepare('SELECT * FROM squad_deliveries WHERE delivery_key=?').get(key);
    if (!row || row.status !== 'pending' || row.attempts >= row.max_attempts || row.next_attempt_at > Date.now()) return null;
    const batch = db.prepare('SELECT source_type FROM squad_delivery_batches WHERE source_key=?').get(row.source_key);
    if (batch.source_type === 'cron' && db.prepare(`SELECT 1 FROM squad_deliveries d JOIN squad_delivery_batches b ON b.source_key=d.source_key
      WHERE d.squad_slug=? AND d.worker_slug=? AND d.delivery_key<>? AND b.source_type='cron' AND d.status IN ('running','reconciliation_required') LIMIT 1`)
      .get(row.squad_slug, row.worker_slug, key)) return null;
    const token = randomUUID();
    const history = JSON.parse(row.history_json);
    history.push({ attempt: row.attempts + 1, status: 'running', started_at: timestamp() });
    db.prepare(`UPDATE squad_deliveries SET status='running',attempts=attempts+1,owner_token=?,owner_pid=?,owner_host=?,history_json=?,updated_at=? WHERE delivery_key=?`)
      .run(token, process.pid, os.hostname(), JSON.stringify(history), timestamp(), key);
    return { ...row, owner_token: token, attempts: row.attempts + 1 };
  }).immediate();
}

function settleBatch(db, sourceKey) {
  const batch = db.prepare('SELECT * FROM squad_delivery_batches WHERE source_key=?').get(sourceKey);
  const deliveries = db.prepare('SELECT * FROM squad_deliveries WHERE source_key=?').all(sourceKey);
  const required = JSON.parse(batch.consumers_json);
  if (!required.length || required.some((worker) => !deliveries.some((row) => row.worker_slug === worker && row.status === 'completed'))) return;
  db.prepare("UPDATE squad_delivery_batches SET status='completed',error=NULL,updated_at=? WHERE source_key=?").run(timestamp(), sourceKey);
  if (batch.source_type === 'handoff') db.prepare("UPDATE squad_handoffs SET status='consumed',consumed_at=? WHERE id=?").run(timestamp(), batch.source_id);
}

function finish(db, owned, result) {
  return db.transaction(() => {
    const row = db.prepare("SELECT * FROM squad_deliveries WHERE delivery_key=? AND owner_token=? AND status='running'").get(owned.delivery_key, owned.owner_token);
    if (!row) throw new Error('Delivery ownership lost');
    const successful = result?.ok === true;
    const retry = !successful && row.idempotent && result?.retryable !== false && row.attempts < row.max_attempts;
    const status = successful ? 'completed' : retry ? 'pending'
      : result?.attempts === 0 || row.idempotent || result?.retryable === false ? 'failed' : 'reconciliation_required';
    const history = JSON.parse(row.history_json);
    Object.assign(history[history.length - 1], { status, finished_at: timestamp(), error: result?.error || null });
    db.prepare(`UPDATE squad_deliveries SET status=?,error=?,receipt_json=?,history_json=?,next_attempt_at=?,updated_at=? WHERE delivery_key=?`)
      .run(status, successful ? null : result?.error || 'worker_failed', successful ? JSON.stringify(result.output ?? null) : null,
        JSON.stringify(history), retry ? Date.now() + Math.min(30000, 1000 * 2 ** (row.attempts - 1)) : 0, timestamp(), row.delivery_key);
    settleBatch(db, row.source_key);
    return status;
  }).immediate();
}

function reconcile(db, { squad, key, resolution, evidence }) {
  if (!['retry', 'completed', 'failed'].includes(resolution) || typeof evidence !== 'string' || !evidence.trim()) {
    return { ok: false, error: 'resolution_and_evidence_required' };
  }
  return db.transaction(() => {
    const row = db.prepare('SELECT * FROM squad_deliveries WHERE delivery_key=? AND squad_slug=?').get(key, squad);
    if (!row) return { ok: false, error: 'delivery_not_found' };
    if (row.status === 'running' && alive(row)) return { ok: false, error: 'delivery_in_use' };
    if (row.status === 'completed') return { ok: false, error: 'already_completed' };
    const history = JSON.parse(row.history_json);
    history.push({ resolution, evidence: evidence.trim(), at: timestamp() });
    const status = resolution === 'retry' ? 'pending' : resolution;
    db.prepare(`UPDATE squad_deliveries SET status=?,owner_token=NULL,owner_pid=NULL,owner_host=NULL,next_attempt_at=0,
      max_attempts=?,error=NULL,receipt_json=?,history_json=?,updated_at=? WHERE delivery_key=?`)
      .run(status, resolution === 'retry' ? Math.max(row.max_attempts, row.attempts + 1) : row.max_attempts,
        resolution === 'completed' ? JSON.stringify({ reconciliation_evidence: evidence.trim() }) : row.receipt_json,
        JSON.stringify(history), timestamp(), key);
    settleBatch(db, row.source_key);
    return { ok: true, delivery_key: key, status };
  }).immediate();
}

function list(db, squad) {
  return {
    batches: db.prepare('SELECT * FROM squad_delivery_batches WHERE squad_slug=? ORDER BY updated_at DESC').all(squad),
    deliveries: db.prepare('SELECT * FROM squad_deliveries WHERE squad_slug=? ORDER BY updated_at DESC').all(squad)
  };
}

module.exports = { migrate, prepareBatch, recover, claim, finish, reconcile, list };
