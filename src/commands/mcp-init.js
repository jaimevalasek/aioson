'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const { validateProjectContextFile, getInteractionLanguage } = require('../context');
const { createTranslator } = require('../i18n');
const { ensureDir, readTextIfExists } = require('../utils');

const TOOL_PRESET_DEFINITIONS = [
  {
    id: 'claude',
    label: 'Claude Code',
    suggestedTargetFile: '.mcp.json'
  },
  {
    id: 'codex',
    label: 'Codex CLI',
    suggestedTargetFile: '.codex/mcp.json'
  },
  {
    id: 'opencode',
    label: 'OpenCode',
    suggestedTargetFile: '.opencode/mcp.json'
  }
];

function normalizeList(value) {
  return String(value || '')
    .split(',')
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
}

function extractStackValue(markdown, fieldLabel) {
  const text = String(markdown || '');
  const regex = new RegExp(`^-\\s*${fieldLabel}:\\s*(.*)$`, 'im');
  const match = text.match(regex);
  if (!match) return '';
  return String(match[1] || '').trim();
}

function normalizeDatabaseEngine(input) {
  const value = String(input || '').trim().toLowerCase();
  if (!value) return '';
  if (
    ['n/a', 'na', 'none', '-', '[not applicable]', 'not applicable'].includes(value)
  ) {
    return '';
  }
  if (value.includes('postgres') || value.includes('supabase')) return 'postgresql';
  if (value.includes('mysql') || value.includes('planetscale')) return 'mysql';
  if (value.includes('sqlite')) return 'sqlite';
  if (value.includes('mongo')) return 'mongodb';
  return value;
}

function inferWeb3Networks(contextData) {
  const frontmatterNetworks = normalizeList(contextData.web3_networks);
  if (frontmatterNetworks.length > 0) return frontmatterNetworks;

  const framework = String(contextData.framework || '').toLowerCase();
  if (['hardhat', 'foundry', 'truffle'].some((token) => framework.includes(token))) return ['ethereum'];
  if (framework.includes('anchor') || framework.includes('solana')) return ['solana'];
  if (framework.includes('cardano')) return ['cardano'];
  return ['ethereum'];
}

function resolveTranslator(t) {
  return typeof t === 'function' ? t : createTranslator('en').t;
}

function buildDatabaseServer(databaseEngine, t) {
  const translate = resolveTranslator(t);
  if (!databaseEngine) {
    return {
      id: 'database',
      enabled: false,
      recommended: false,
      reason: translate('mcp_init.reason_database_none'),
      engine: '',
      env: []
    };
  }

  return {
    id: 'database',
    enabled: true,
    recommended: true,
    reason: translate('mcp_init.reason_database_enabled'),
    engine: databaseEngine,
    env: ['DATABASE_MCP_URL']
  };
}

function buildChainRpcServer(web3Enabled, networks, t) {
  const translate = resolveTranslator(t);
  if (!web3Enabled) {
    return {
      id: 'chain-rpc',
      enabled: false,
      recommended: false,
      reason: translate('mcp_init.reason_chain_rpc_disabled'),
      networks: [],
      env: []
    };
  }

  return {
    id: 'chain-rpc',
    enabled: true,
    recommended: true,
    reason: translate('mcp_init.reason_chain_rpc_enabled'),
    networks,
    env: ['RPC_URL', 'CHAIN_ID', 'PRIVATE_KEY']
  };
}

function buildMcpPlan(targetDir, contextData, contextMarkdown, t) {
  const translate = resolveTranslator(t);
  const databaseValue = extractStackValue(contextMarkdown, 'Database');
  const databaseEngine = normalizeDatabaseEngine(databaseValue);
  const web3Enabled = Boolean(contextData.web3_enabled) || String(contextData.project_type) === 'dapp';
  const networks = web3Enabled ? inferWeb3Networks(contextData) : [];

  const servers = [
    {
      id: 'filesystem',
      enabled: true,
      recommended: true,
      reason: translate('mcp_init.reason_filesystem'),
      env: []
    },
    {
      id: 'context7',
      enabled: true,
      recommended: true,
      reason: translate('mcp_init.reason_context7'),
      env: ['CONTEXT7_MCP_URL'],
      optional_env: ['CONTEXT7_API_KEY']
    },
    buildDatabaseServer(databaseEngine, t),
    {
      id: 'web-search',
      enabled: true,
      recommended: true,
      reason: translate('mcp_init.reason_web_search'),
      env: []
    },
    buildChainRpcServer(web3Enabled, networks, t)
  ];

  return {
    generated_at: new Date().toISOString(),
    project: {
      path: targetDir,
      framework: contextData.framework || '',
      project_type: contextData.project_type || '',
      interaction_language: getInteractionLanguage(contextData, 'en'),
      conversation_language: getInteractionLanguage(contextData, 'en')
    },
    database_engine: databaseEngine,
    web3_enabled: web3Enabled,
    web3_networks: networks,
    servers
  };
}

function envTemplate(keys) {
  const output = {};
  for (const key of keys || []) {
    output[key] = `$${key}`;
  }
  return output;
}

function mergeEnvKeys(server) {
  const required = Array.isArray(server && server.env) ? server.env : [];
  const optional = Array.isArray(server && server.optional_env) ? server.optional_env : [];
  return Array.from(new Set([...required, ...optional]));
}

function serverTemplate(server) {
  if (server.id === 'filesystem') {
    return {
      transport: 'stdio',
      command: '<filesystem-mcp-command>',
      args: ['<project-root>'],
      env: {}
    };
  }

  if (server.id === 'context7') {
    return {
      transport: 'stdio',
      command: 'npx',
      args: ['-y', 'mcp-remote', '$CONTEXT7_MCP_URL'],
      env: envTemplate(mergeEnvKeys(server))
    };
  }

  if (server.id === 'database') {
    const env = envTemplate(mergeEnvKeys(server));
    env.DATABASE_ENGINE = server.engine || '<engine>';
    return {
      transport: 'stdio',
      command: 'npx',
      args: ['-y', 'mcp-remote', '$DATABASE_MCP_URL'],
      env
    };
  }

  if (server.id === 'chain-rpc') {
    return {
      transport: 'stdio',
      command: '<chain-rpc-mcp-command>',
      args: server.networks || [],
      env: envTemplate(server.env)
    };
  }

  return {
    transport: 'stdio',
    command: `<${server.id}-mcp-command>`,
    args: [],
    env: envTemplate(server.env)
  };
}

function normalizeTool(tool) {
  const value = String(tool || '').trim().toLowerCase();
  if (!value) return '';
  return value;
}

function resolveToolDefinitions(tool, t) {
  const normalized = normalizeTool(tool);
  if (!normalized) return TOOL_PRESET_DEFINITIONS;

  const found = TOOL_PRESET_DEFINITIONS.find((item) => item.id === normalized);
  if (!found) {
    const expected = TOOL_PRESET_DEFINITIONS.map((item) => item.id).join(', ');
    const translate = resolveTranslator(t);
    throw new Error(
      translate('mcp_init.invalid_tool', {
        tool: String(tool || ''),
        expected
      })
    );
  }
  return [found];
}

function buildToolPresets(plan, options = {}) {
  const selectedTools = resolveToolDefinitions(options.tool, options.t);
  const enabledServers = plan.servers.filter((server) => server.enabled);
  const translate = resolveTranslator(options.t);

  return selectedTools.map((tool) => {
    const mcpServers = {};
    for (const server of enabledServers) {
      mcpServers[server.id] = serverTemplate(server);
    }

    const envRequired = Array.from(
      new Set(
        enabledServers.flatMap((server) => server.env || [])
      )
    );

    return {
      tool: tool.id,
      tool_label: tool.label,
      generated_at: new Date().toISOString(),
      source_plan: '.aioson/mcp/servers.local.json',
      suggested_target_file: tool.suggestedTargetFile,
      notes: [
        translate('mcp_init.note_workspace_local'),
        translate('mcp_init.note_replace_placeholders'),
        translate('mcp_init.note_keep_secrets_env')
      ],
      env_required: envRequired,
      mcpServers
    };
  });
}

async function runMcpInit({ args, options = {}, logger, t }) {
  const targetDir = path.resolve(process.cwd(), args[0] || '.');
  const dryRun = Boolean(options['dry-run']);
  const jsonMode = Boolean(options.json);
  const requestedTool = normalizeTool(options.tool);
  const contextResult = await validateProjectContextFile(targetDir);
  const contextMarkdown = await readTextIfExists(
    path.join(targetDir, '.aioson/context/project.context.md')
  );
  const contextData = contextResult.parsed && contextResult.data ? contextResult.data : {};

  const plan = buildMcpPlan(targetDir, contextData, contextMarkdown || '', t);
  const filePath = path.join(targetDir, '.aioson/mcp/servers.local.json');
  const presets = buildToolPresets(plan, { tool: requestedTool, t });
  const presetDir = path.join(targetDir, '.aioson/mcp/presets');
  const presetFiles = presets.map((preset) => ({
    tool: preset.tool,
    path: path.join(presetDir, `${preset.tool}.json`)
  }));

  if (!dryRun) {
    await ensureDir(path.dirname(filePath));
    await fs.writeFile(filePath, `${JSON.stringify(plan, null, 2)}\n`, 'utf8');

    await ensureDir(presetDir);
    for (const presetFile of presetFiles) {
      const preset = presets.find((item) => item.tool === presetFile.tool);
      await fs.writeFile(presetFile.path, `${JSON.stringify(preset, null, 2)}\n`, 'utf8');
    }
  }

  const output = {
    ok: true,
    targetDir,
    filePath,
    dryRun,
    written: !dryRun,
    contextExists: contextResult.exists,
    contextParsed: contextResult.parsed,
    serverCount: plan.servers.length,
    presetCount: presets.length,
    presetFiles: presetFiles.map((item) => ({
      tool: item.tool,
      path: item.path
    })),
    plan,
    presets
  };

  if (jsonMode) {
    return output;
  }

  if (!contextResult.exists) {
    logger.log(t('mcp_init.context_missing'));
  }
  logger.log(
    dryRun
      ? t('mcp_init.dry_run_generated', { path: filePath })
      : t('mcp_init.generated', { path: filePath })
  );
  logger.log(t('mcp_init.server_count', { count: plan.servers.length }));
  logger.log(t('mcp_init.preset_count', { count: presets.length }));
  for (const presetFile of output.presetFiles) {
    logger.log(
      dryRun
        ? t('mcp_init.preset_dry_run', { tool: presetFile.tool, path: presetFile.path })
        : t('mcp_init.preset_written', { tool: presetFile.tool, path: presetFile.path })
    );
  }

  return output;
}

module.exports = {
  runMcpInit,
  normalizeDatabaseEngine,
  extractStackValue,
  buildMcpPlan,
  buildToolPresets,
  resolveToolDefinitions
};
