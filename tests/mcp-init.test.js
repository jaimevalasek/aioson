'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { createTranslator } = require('../src/i18n');
const { runMcpInit, normalizeDatabaseEngine } = require('../src/commands/mcp-init');

async function makeTempDir() {
  return fs.mkdtemp(path.join(os.tmpdir(), 'aioson-mcp-init-'));
}

async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

function createQuietLogger() {
  return {
    log() {},
    error() {}
  };
}

test('normalizeDatabaseEngine maps common providers', () => {
  assert.equal(normalizeDatabaseEngine('PostgreSQL'), 'postgresql');
  assert.equal(normalizeDatabaseEngine('Supabase'), 'postgresql');
  assert.equal(normalizeDatabaseEngine('PlanetScale'), 'mysql');
  assert.equal(normalizeDatabaseEngine('SQLite'), 'sqlite');
  assert.equal(normalizeDatabaseEngine('MongoDB'), 'mongodb');
  assert.equal(normalizeDatabaseEngine('[not applicable]'), '');
});

test('mcp:init writes plan from existing context', async () => {
  const dir = await makeTempDir();
  const contextPath = path.join(dir, '.aioson/context/project.context.md');
  await fs.mkdir(path.dirname(contextPath), { recursive: true });
  await fs.writeFile(
    contextPath,
    `---\nproject_name: \"demo\"\nproject_type: \"dapp\"\nprofile: \"developer\"\nframework: \"Anchor\"\nframework_installed: true\nclassification: \"SMALL\"\nconversation_language: \"en\"\nweb3_enabled: true\nweb3_networks: \"solana\"\ncontract_framework: \"Anchor\"\naioson_version: \"0.1.8\"\n---\n\n# Project Context\n\n## Stack\n- Backend: Anchor\n- Frontend: Next.js\n- Database: PostgreSQL\n- Auth: Custom\n- UI/UX: Tailwind\n`,
    'utf8'
  );

  const { t } = createTranslator('en');
  const result = await runMcpInit({
    args: [dir],
    options: {},
    logger: createQuietLogger(),
    t
  });

  assert.equal(result.ok, true);
  assert.equal(result.written, true);
  assert.equal(await fileExists(result.filePath), true);
  assert.equal(result.plan.database_engine, 'postgresql');
  assert.equal(result.plan.web3_enabled, true);
  assert.equal(result.plan.web3_networks.includes('solana'), true);
  assert.equal(result.presetCount, 3);
  assert.equal(result.presetFiles.length, 3);
  assert.equal(
    await fileExists(path.join(dir, '.aioson/mcp/presets/codex.json')),
    true
  );

  const chainRpc = result.plan.servers.find((server) => server.id === 'chain-rpc');
  assert.equal(chainRpc.enabled, true);
  assert.equal(chainRpc.networks.includes('solana'), true);

  const context7 = result.plan.servers.find((server) => server.id === 'context7');
  assert.equal(context7.enabled, true);
  assert.equal(context7.env.includes('CONTEXT7_MCP_URL'), true);

  const codexPreset = JSON.parse(
    await fs.readFile(path.join(dir, '.aioson/mcp/presets/codex.json'), 'utf8')
  );
  assert.equal(codexPreset.tool, 'codex');
  assert.equal(Boolean(codexPreset.mcpServers.filesystem), true);
  assert.equal(codexPreset.mcpServers.context7.command, 'npx');
  assert.equal(codexPreset.mcpServers.context7.args.includes('mcp-remote'), true);
});

test('mcp:init dry-run does not write file and handles missing context', async () => {
  const dir = await makeTempDir();
  const { t } = createTranslator('en');
  const result = await runMcpInit({
    args: [dir],
    options: { 'dry-run': true },
    logger: createQuietLogger(),
    t
  });

  assert.equal(result.ok, true);
  assert.equal(result.dryRun, true);
  assert.equal(result.written, false);
  assert.equal(result.contextExists, false);
  assert.equal(await fileExists(result.filePath), false);
  assert.equal(
    await fileExists(path.join(dir, '.aioson/mcp/presets/claude.json')),
    false
  );
});

test('mcp:init supports --tool filter for a single preset', async () => {
  const dir = await makeTempDir();
  const contextPath = path.join(dir, '.aioson/context/project.context.md');
  await fs.mkdir(path.dirname(contextPath), { recursive: true });
  await fs.writeFile(
    contextPath,
    `---\nproject_name: \"demo\"\nproject_type: \"web_app\"\nprofile: \"developer\"\nframework: \"Node/Express\"\nframework_installed: true\nclassification: \"MICRO\"\nconversation_language: \"en\"\naioson_version: \"0.1.8\"\n---\n\n# Project Context\n\n## Stack\n- Database: SQLite\n`,
    'utf8'
  );

  const { t } = createTranslator('en');
  const result = await runMcpInit({
    args: [dir],
    options: { tool: 'codex' },
    logger: createQuietLogger(),
    t
  });

  assert.equal(result.ok, true);
  assert.equal(result.presetCount, 1);
  assert.equal(result.presetFiles.length, 1);
  assert.equal(result.presetFiles[0].tool, 'codex');
  assert.equal(
    await fileExists(path.join(dir, '.aioson/mcp/presets/codex.json')),
    true
  );
  assert.equal(
    await fileExists(path.join(dir, '.aioson/mcp/presets/claude.json')),
    false
  );

  const codexPreset = JSON.parse(
    await fs.readFile(path.join(dir, '.aioson/mcp/presets/codex.json'), 'utf8')
  );
  assert.equal(codexPreset.mcpServers.context7.args.includes('$CONTEXT7_MCP_URL'), true);
  assert.equal(codexPreset.mcpServers.database.args.includes('$DATABASE_MCP_URL'), true);
});

test('mcp:init rejects invalid --tool value', async () => {
  const dir = await makeTempDir();
  const { t } = createTranslator('en');

  await assert.rejects(
    runMcpInit({
      args: [dir],
      options: { tool: 'invalid-tool' },
      logger: createQuietLogger(),
      t
    }),
    /Invalid --tool value/
  );
});

test('mcp:init rejects invalid --tool value with localized pt-BR message', async () => {
  const dir = await makeTempDir();
  const { t } = createTranslator('pt-BR');

  await assert.rejects(
    runMcpInit({
      args: [dir],
      options: { tool: 'invalid-tool' },
      logger: createQuietLogger(),
      t
    }),
    /Valor invalido para --tool/
  );
});

test('mcp:init invalid --tool fallback works without translator argument', async () => {
  const dir = await makeTempDir();

  await assert.rejects(
    runMcpInit({
      args: [dir],
      options: { tool: 'invalid-tool' },
      logger: createQuietLogger()
    }),
    /Invalid --tool value/
  );
});

test('mcp:init localizes plan reasons and preset notes in pt-BR', async () => {
  const dir = await makeTempDir();
  const contextPath = path.join(dir, '.aioson/context/project.context.md');
  await fs.mkdir(path.dirname(contextPath), { recursive: true });
  await fs.writeFile(
    contextPath,
    `---\nproject_name: \"demo\"\nproject_type: \"dapp\"\nprofile: \"developer\"\nframework: \"Hardhat\"\nframework_installed: true\nclassification: \"SMALL\"\nconversation_language: \"pt-BR\"\nweb3_enabled: true\nweb3_networks: \"ethereum\"\ncontract_framework: \"Hardhat\"\naioson_version: \"0.1.9\"\n---\n\n# Project Context\n\n## Stack\n- Database: PostgreSQL\n`,
    'utf8'
  );

  const { t } = createTranslator('pt-BR');
  const result = await runMcpInit({
    args: [dir],
    options: { 'dry-run': true },
    logger: createQuietLogger(),
    t
  });

  const chainRpc = result.plan.servers.find((server) => server.id === 'chain-rpc');
  assert.equal(Boolean(chainRpc), true);
  assert.equal(chainRpc.reason.includes('Contexto dApp detectado'), true);
  assert.equal(result.presets[0].notes[0].includes('preset local de workspace'), true);
});
