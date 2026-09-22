'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
  return value;
}

function cacheKey(request, config) {
  return crypto.createHash('sha256').update(JSON.stringify(canonical({ version: 1, request, endpoint: config.endpoint, route: config.route, model: config.model }))).digest('hex');
}

function cacheDir(root) { return path.join(root, '.aioson', 'cache', 'jev'); }
async function prepareDir(root) {
  const dir = cacheDir(root);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, '.gitignore'), '*\n', { flag: 'wx' }).catch((error) => { if (error.code !== 'EEXIST') throw error; });
  return dir;
}
function cacheEnabled(root, config) {
  return Boolean(root && config.enabled && config.status === 'ready' && config.cacheEnabled && !/latest|preview/i.test(config.model));
}

async function readCache(root, key, ttlMs) {
  try {
    const entry = JSON.parse(await fs.readFile(path.join(cacheDir(root), `${key}.json`), 'utf8'));
    const age = Date.now() - entry.created_at_ms;
    return entry.version === 1 && entry.key === key && age >= 0 && age <= ttlMs ? entry.response : null;
  } catch { return null; }
}

async function writeCache(root, key, response) {
  try {
    const dir = await prepareDir(root);
    // No state, instructions, credentials or raw error bodies are persisted.
    const safe = { ok: true, status: 'used', answers: response.answers, model: response.model, route: response.route, provider: response.provider, usage: response.usage, request_id: response.request_id };
    await fs.writeFile(path.join(dir, `${key}.json`), JSON.stringify({ version: 1, key, created_at_ms: Date.now(), response: safe }), { mode: 0o600 });
  } catch { /* Optional cache must never gate the workflow. */ }
}

async function recordEvent(root, event) {
  if (!root) return;
  try {
    const dir = await prepareDir(root);
    const file = path.join(dir, 'events.jsonl');
    // Stop recording when full, rather than growing without a bound or deleting evidence.
    const stat = await fs.stat(file).catch(() => null);
    if (stat && stat.size >= 1024 * 1024) return;
    const { status, key, duration_ms, model, route, usage } = event;
    await fs.appendFile(file, `${JSON.stringify({ at: new Date().toISOString(), status, key, duration_ms, model, route, usage })}\n`, { mode: 0o600 });
  } catch { /* Telemetry is best effort. */ }
}

module.exports = { cacheKey, cacheEnabled, readCache, writeCache, recordEvent };
