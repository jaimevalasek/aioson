'use strict';

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { randomUUID } = require('node:crypto');
const Database = require('better-sqlite3');

function sessionDirectory(projectDir, squadSlug, sessionId) {
  return path.join(projectDir, '.aioson', 'squads', squadSlug, 'sessions', sessionId);
}

// SQLite supplies crash-safe, cross-process exclusion. The JSON remains authoritative.
function withCoordination(directory, action) {
  fs.mkdirSync(directory, { recursive: true });
  const db = new Database(path.join(directory, 'coordination.sqlite'), { timeout: 5000 });
  try {
    db.exec('CREATE TABLE IF NOT EXISTS execution_owner (id INTEGER PRIMARY KEY CHECK (id = 1), token TEXT, pid INTEGER, host TEXT)');
    return db.transaction(() => action(db)).immediate();
  } finally {
    db.close();
  }
}

function readPlan(directory) {
  try {
    return JSON.parse(fs.readFileSync(path.join(directory, 'plan.json'), 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}

function writePlan(directory, plan, previous) {
  const next = { ...plan, revision: (previous?.revision || 0) + 1 };
  const destination = path.join(directory, 'plan.json');
  const temporary = path.join(directory, `.plan-${randomUUID()}.tmp`);
  try {
    const fd = fs.openSync(temporary, 'wx');
    try {
      fs.writeFileSync(fd, JSON.stringify(next, null, 2), 'utf8');
      fs.fsyncSync(fd);
    } finally {
      fs.closeSync(fd);
    }
    fs.renameSync(temporary, destination);
  } finally {
    fs.rmSync(temporary, { force: true });
  }
  return next;
}

function saveSnapshot(directory, plan) {
  return withCoordination(directory, () => {
    const previous = readPlan(directory);
    if (previous && (previous.revision || 0) !== (plan.revision || 0)) {
      const error = new Error('Plan changed since it was read; reload before saving.');
      error.code = 'STALE_PLAN';
      throw error;
    }
    const next = writePlan(directory, plan, previous);
    plan.revision = next.revision;
    return path.join(directory, 'plan.json');
  });
}

function mutatePlan(directory, mutate) {
  return withCoordination(directory, () => {
    const plan = readPlan(directory);
    if (!plan || mutate(plan) === false) return null;
    return writePlan(directory, plan, plan);
  });
}

function ownerIsAlive(owner) {
  // A directory shared with another host must be reconciled on that host.
  if (owner.host !== os.hostname()) return true;
  try {
    process.kill(owner.pid, 0);
    return true;
  } catch (error) {
    return error.code !== 'ESRCH';
  }
}

function acquireExecution(directory) {
  const token = randomUUID();
  const acquired = withCoordination(directory, (db) => {
    const owner = db.prepare('SELECT * FROM execution_owner WHERE id = 1').get();
    if (owner && ownerIsAlive(owner)) return false;
    db.prepare('INSERT OR REPLACE INTO execution_owner (id, token, pid, host) VALUES (1, ?, ?, ?)')
      .run(token, process.pid, os.hostname());
    return true;
  });
  if (!acquired) return null;
  return () => withCoordination(directory, (db) => {
    db.prepare('DELETE FROM execution_owner WHERE id = 1 AND token = ?').run(token);
  });
}

module.exports = { sessionDirectory, readPlan, saveSnapshot, mutatePlan, acquireExecution };
