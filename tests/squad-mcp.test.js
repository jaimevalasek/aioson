'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const {
  BUILT_IN_CONNECTORS,
  getBuiltInConnector,
  listBuiltInConnectors,
  loadIntegrationConfig,
  saveIntegrationConfig,
  listIntegrations,
  resolveConfigValues,
  resolveConnectorEnv,
  buildWorkerMcpEnv
} = require('../src/mcp-connectors/registry');
const { openRuntimeDb, upsertMcpStatus, incrementMcpCalls, listMcpStatus, getMcpStatus } = require('../src/runtime-store');

async function makeTempDir() {
  return fs.mkdtemp(path.join(os.tmpdir(), 'aioson-mcp-'));
}

// --- Registry tests ---

test('BUILT_IN_CONNECTORS has expected connectors', () => {
  assert.ok(BUILT_IN_CONNECTORS['whatsapp-business']);
  assert.ok(BUILT_IN_CONNECTORS['telegram-bot']);
  assert.ok(BUILT_IN_CONNECTORS['smtp-email']);
  assert.ok(BUILT_IN_CONNECTORS['webhook-generic']);
  assert.ok(BUILT_IN_CONNECTORS['google-calendar']);
});

test('getBuiltInConnector returns null for unknown', () => {
  assert.equal(getBuiltInConnector('nonexistent'), null);
});

test('getBuiltInConnector returns connector definition', () => {
  const wa = getBuiltInConnector('whatsapp-business');
  assert.ok(wa);
  assert.equal(wa.name, 'WhatsApp Business API');
  assert.ok(wa.configSchema.phone_id);
  assert.ok(wa.actions.send_message);
});

test('listBuiltInConnectors returns summary list', () => {
  const list = listBuiltInConnectors();
  assert.ok(list.length >= 5);
  const wa = list.find(c => c.id === 'whatsapp-business');
  assert.ok(wa);
  assert.ok(wa.actions.includes('send_message'));
  assert.ok(wa.requiredConfig.includes('phone_id'));
});

// --- Config resolution ---

test('resolveConfigValues resolves from saved config', () => {
  const schema = {
    phone_id: { type: 'string', env: 'WHATSAPP_PHONE_ID', required: true },
    api_token: { type: 'string', env: 'WHATSAPP_API_TOKEN', required: true }
  };
  const { resolved, missing } = resolveConfigValues(schema, { phone_id: '123', api_token: 'abc' });
  assert.equal(resolved.phone_id, '123');
  assert.equal(resolved.api_token, 'abc');
  assert.equal(missing.length, 0);
});

test('resolveConfigValues reports missing required fields', () => {
  const schema = {
    phone_id: { type: 'string', env: 'WHATSAPP_PHONE_ID_TEST_MISSING', required: true },
    api_token: { type: 'string', env: 'WHATSAPP_API_TOKEN_TEST_MISSING', required: true }
  };
  const { missing } = resolveConfigValues(schema, {});
  assert.equal(missing.length, 2);
  assert.ok(missing.includes('phone_id'));
});

test('resolveConnectorEnv returns status configured when all present', () => {
  const wa = getBuiltInConnector('whatsapp-business');
  const { status } = resolveConnectorEnv(wa, { phone_id: '123', api_token: 'abc' });
  assert.equal(status, 'configured');
});

test('resolveConnectorEnv returns status unconfigured when missing', () => {
  const wa = getBuiltInConnector('whatsapp-business');
  const { status, missing } = resolveConnectorEnv(wa, {});
  assert.equal(status, 'unconfigured');
  assert.ok(missing.length > 0);
});

// --- Integration file CRUD ---

test('saveIntegrationConfig and loadIntegrationConfig roundtrip', async () => {
  const tmpDir = await makeTempDir();
  try {
    await fs.mkdir(path.join(tmpDir, '.aioson', 'squads', 'test-squad'), { recursive: true });
    const config = { connector: 'whatsapp-business', config: { phone_id: '123' } };
    await saveIntegrationConfig(tmpDir, 'test-squad', 'whatsapp', config);
    const loaded = await loadIntegrationConfig(tmpDir, 'test-squad', 'whatsapp');
    assert.deepStrictEqual(loaded, config);
  } finally {
    await fs.rm(tmpDir, { recursive: true, maxRetries: 5, retryDelay: 50 });
  }
});

test('loadIntegrationConfig returns null for missing', async () => {
  const tmpDir = await makeTempDir();
  try {
    const result = await loadIntegrationConfig(tmpDir, 'nope', 'nope');
    assert.equal(result, null);
  } finally {
    await fs.rm(tmpDir, { recursive: true, maxRetries: 5, retryDelay: 50 });
  }
});

test('listIntegrations returns all configured integrations', async () => {
  const tmpDir = await makeTempDir();
  try {
    await fs.mkdir(path.join(tmpDir, '.aioson', 'squads', 'ls-squad'), { recursive: true });
    await saveIntegrationConfig(tmpDir, 'ls-squad', 'wa', { connector: 'whatsapp-business', config: {} });
    await saveIntegrationConfig(tmpDir, 'ls-squad', 'tg', { connector: 'telegram-bot', config: {} });
    const list = await listIntegrations(tmpDir, 'ls-squad');
    assert.equal(list.length, 2);
    const slugs = list.map(i => i.slug).sort();
    assert.deepStrictEqual(slugs, ['tg', 'wa']);
  } finally {
    await fs.rm(tmpDir, { recursive: true, maxRetries: 5, retryDelay: 50 });
  }
});

test('listIntegrations returns empty for no dir', async () => {
  const tmpDir = await makeTempDir();
  try {
    const list = await listIntegrations(tmpDir, 'no-squad');
    assert.equal(list.length, 0);
  } finally {
    await fs.rm(tmpDir, { recursive: true, maxRetries: 5, retryDelay: 50 });
  }
});

// --- Worker MCP env ---

test('buildWorkerMcpEnv builds env vars for worker', () => {
  const integrations = [
    { slug: 'whatsapp', connector: 'whatsapp-business', config: { phone_id: '123', api_token: 'abc' } }
  ];
  const env = buildWorkerMcpEnv('.', 'test', ['whatsapp'], integrations);
  assert.ok(env.MCP_WHATSAPP);
  const parsed = JSON.parse(env.MCP_WHATSAPP);
  assert.equal(parsed.phone_id, '123');
  assert.equal(parsed.connector, 'whatsapp-business');
  assert.ok(parsed.actions.includes('send_message'));
});

test('buildWorkerMcpEnv skips unknown MCPs', () => {
  const env = buildWorkerMcpEnv('.', 'test', ['unknown'], []);
  assert.deepStrictEqual(env, {});
});

// --- SQLite MCP Status ---

test('mcp_status table is created by openRuntimeDb', async () => {
  const tmpDir = await makeTempDir();
  try {
    const { db } = await openRuntimeDb(tmpDir);
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='mcp_status'").all();
    assert.equal(tables.length, 1);
    db.close();
  } finally {
    await fs.rm(tmpDir, { recursive: true, maxRetries: 5, retryDelay: 50 });
  }
});

test('upsertMcpStatus and getMcpStatus work', async () => {
  const tmpDir = await makeTempDir();
  try {
    const { db } = await openRuntimeDb(tmpDir);
    upsertMcpStatus(db, { squadSlug: 's1', mcpSlug: 'wa', connector: 'whatsapp-business', status: 'connected' });
    const row = getMcpStatus(db, 's1', 'wa');
    assert.ok(row);
    assert.equal(row.status, 'connected');
    assert.equal(row.connector, 'whatsapp-business');
    assert.equal(row.calls_total, 0);
    db.close();
  } finally {
    await fs.rm(tmpDir, { recursive: true, maxRetries: 5, retryDelay: 50 });
  }
});

test('incrementMcpCalls increments counters', async () => {
  const tmpDir = await makeTempDir();
  try {
    const { db } = await openRuntimeDb(tmpDir);
    upsertMcpStatus(db, { squadSlug: 's1', mcpSlug: 'tg', connector: 'telegram-bot', status: 'connected' });
    incrementMcpCalls(db, 's1', 'tg', false);
    incrementMcpCalls(db, 's1', 'tg', false);
    incrementMcpCalls(db, 's1', 'tg', true);
    const row = getMcpStatus(db, 's1', 'tg');
    assert.equal(row.calls_total, 3);
    assert.equal(row.calls_failed, 1);
    db.close();
  } finally {
    await fs.rm(tmpDir, { recursive: true, maxRetries: 5, retryDelay: 50 });
  }
});

test('listMcpStatus returns all for squad', async () => {
  const tmpDir = await makeTempDir();
  try {
    const { db } = await openRuntimeDb(tmpDir);
    upsertMcpStatus(db, { squadSlug: 's1', mcpSlug: 'a', connector: 'whatsapp-business', status: 'connected' });
    upsertMcpStatus(db, { squadSlug: 's1', mcpSlug: 'b', connector: 'telegram-bot', status: 'unconfigured' });
    const rows = listMcpStatus(db, 's1');
    assert.equal(rows.length, 2);
    db.close();
  } finally {
    await fs.rm(tmpDir, { recursive: true, maxRetries: 5, retryDelay: 50 });
  }
});
