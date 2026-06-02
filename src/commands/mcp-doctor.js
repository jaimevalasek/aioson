'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const { validateProjectContextFile, getInteractionLanguage } = require('../context');
const { localizeContextParseReason } = require('../context-parse-reason');
const { exists, readTextIfExists } = require('../utils');
const { extractStackValue, normalizeDatabaseEngine } = require('./mcp-init');

const REQUIRED_CORE_SERVERS = ['filesystem', 'context7'];
const TOOL_PRESETS = ['claude', 'codex', 'opencode'];

function normalizeBoolean(value, fallback = false) {
  if (typeof value === 'boolean') return value;
  if (value === undefined || value === null) return fallback;
  const text = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'y', 'on'].includes(text)) return true;
  if (['0', 'false', 'no', 'n', 'off'].includes(text)) return false;
  return fallback;
}

function makeCheck(id, ok, severity, message, hint = '') {
  return {
    id,
    ok: Boolean(ok),
    severity,
    message: String(message || ''),
    hint: String(hint || '')
  };
}

function uniqueStrings(values) {
  return Array.from(new Set((values || []).filter(Boolean).map((value) => String(value))));
}

async function readJsonFileIfExists(filePath) {
  if (!(await exists(filePath))) {
    return {
      exists: false,
      parsed: false,
      data: null,
      error: ''
    };
  }

  const raw = await fs.readFile(filePath, 'utf8');
  try {
    return {
      exists: true,
      parsed: true,
      data: JSON.parse(raw),
      error: ''
    };
  } catch (error) {
    return {
      exists: true,
      parsed: false,
      data: null,
      error: error.message
    };
  }
}

function summarizeChecks(checks) {
  const passed = checks.filter((item) => item.ok).length;
  const failed = checks.filter((item) => !item.ok && item.severity === 'error').length;
  const warnings = checks.filter((item) => !item.ok && item.severity === 'warn').length;
  return {
    total: checks.length,
    passed,
    failed,
    warnings
  };
}

function buildServerMap(plan) {
  const servers = Array.isArray(plan && plan.servers) ? plan.servers : [];
  const map = new Map();
  for (const server of servers) {
    const id = String(server && server.id ? server.id : '').trim();
    if (!id) continue;
    map.set(id, server);
  }
  return map;
}

function isWeb3Context(contextData) {
  if (!contextData || typeof contextData !== 'object') return false;
  return Boolean(contextData.web3_enabled) || String(contextData.project_type) === 'dapp';
}

function formatCheckPrefix(check, t) {
  if (check.ok) return t('mcp_doctor.prefix_ok');
  if (check.severity === 'warn') return t('mcp_doctor.prefix_warn');
  return t('mcp_doctor.prefix_fail');
}

async function runMcpDoctor({ args, options = {}, logger, t }) {
  const targetDir = path.resolve(process.cwd(), args[0] || '.');
  const strictEnv = normalizeBoolean(options['strict-env'], false);
  const planPath = path.join(targetDir, '.aioson/mcp/servers.local.json');
  const presetsDir = path.join(targetDir, '.aioson/mcp/presets');
  const contextPath = path.join(targetDir, '.aioson/context/project.context.md');

  const checks = [];

  const contextResult = await validateProjectContextFile(targetDir);
  const contextMarkdown = (await readTextIfExists(contextPath)) || '';
  const contextData = contextResult.parsed && contextResult.data ? contextResult.data : {};

  if (!contextResult.exists) {
    checks.push(
      makeCheck(
        'context.exists',
        false,
        'warn',
        t('mcp_doctor.context_missing'),
        t('mcp_doctor.context_missing_hint')
      )
    );
  } else if (!contextResult.parsed) {
    checks.push(
      makeCheck(
        'context.parsed',
        false,
        'warn',
        t('mcp_doctor.context_parse_invalid', {
          reason: localizeContextParseReason(contextResult.parseError, t)
        }),
        t('mcp_doctor.context_parse_invalid_hint')
      )
    );
  } else {
    checks.push(
      makeCheck(
        'context.parsed',
        true,
        'info',
        t('mcp_doctor.context_ok')
      )
    );
  }

  const planFile = await readJsonFileIfExists(planPath);
  if (!planFile.exists) {
    checks.push(
      makeCheck(
        'plan.exists',
        false,
        'error',
        t('mcp_doctor.plan_missing'),
        t('mcp_doctor.plan_missing_hint')
      )
    );
  } else if (!planFile.parsed) {
    checks.push(
      makeCheck(
        'plan.parsed',
        false,
        'error',
        t('mcp_doctor.plan_invalid', { error: planFile.error }),
        t('mcp_doctor.plan_invalid_hint')
      )
    );
  } else {
    checks.push(
      makeCheck(
        'plan.parsed',
        true,
        'info',
        t('mcp_doctor.plan_ok')
      )
    );
  }

  const plan = planFile.parsed && planFile.data ? planFile.data : {};
  const serverMap = buildServerMap(plan);
  const enabledServers = Array.from(serverMap.values()).filter((server) => server.enabled);

  if (planFile.parsed) {
    checks.push(
      makeCheck(
        'plan.servers',
        serverMap.size > 0,
        'error',
        serverMap.size > 0
          ? t('mcp_doctor.plan_servers_ok', { count: serverMap.size })
          : t('mcp_doctor.plan_servers_missing'),
        serverMap.size > 0 ? '' : t('mcp_doctor.plan_servers_hint')
      )
    );

    for (const serverId of REQUIRED_CORE_SERVERS) {
      const server = serverMap.get(serverId);
      const ok = Boolean(server && server.enabled === true);
      checks.push(
        makeCheck(
          `plan.core.${serverId}`,
          ok,
          'error',
          ok
            ? t('mcp_doctor.core_enabled', { server: serverId })
            : t('mcp_doctor.core_missing', { server: serverId }),
          ok ? '' : t('mcp_doctor.core_missing_hint')
        )
      );
    }
  }

  const presetChecks = [];
  for (const tool of TOOL_PRESETS) {
    const presetPath = path.join(presetsDir, `${tool}.json`);
    const present = await exists(presetPath);
    presetChecks.push({
      tool,
      path: presetPath,
      exists: present
    });
  }

  const existingPresetCount = presetChecks.filter((item) => item.exists).length;
  checks.push(
    makeCheck(
      'presets.any',
      existingPresetCount > 0,
      'error',
      existingPresetCount > 0
        ? t('mcp_doctor.presets_any_ok', { count: existingPresetCount })
        : t('mcp_doctor.presets_any_missing'),
      existingPresetCount > 0 ? '' : t('mcp_doctor.presets_any_hint')
    )
  );

  if (existingPresetCount > 0 && existingPresetCount < TOOL_PRESETS.length) {
    checks.push(
      makeCheck(
        'presets.coverage',
        false,
        'warn',
        t('mcp_doctor.presets_coverage_partial', {
          existing: existingPresetCount,
          total: TOOL_PRESETS.length
        }),
        t('mcp_doctor.presets_coverage_partial_hint')
      )
    );
  } else if (existingPresetCount === TOOL_PRESETS.length) {
    checks.push(
      makeCheck(
        'presets.coverage',
        true,
        'info',
        t('mcp_doctor.presets_coverage_full')
      )
    );
  }

  const requiredEnv = uniqueStrings(enabledServers.flatMap((server) => server.env || []));
  const missingEnv = requiredEnv.filter((key) => !process.env[key]);
  const envSeverity = strictEnv ? 'error' : 'warn';
  if (requiredEnv.length === 0) {
    checks.push(
      makeCheck(
        'env.required',
        true,
        'info',
        t('mcp_doctor.env_none_required')
      )
    );
  } else if (missingEnv.length > 0) {
    checks.push(
      makeCheck(
        'env.required',
        false,
        envSeverity,
        t('mcp_doctor.env_missing', {
          missing: missingEnv.length,
          total: requiredEnv.length,
          vars: missingEnv.join(', ')
        }),
        strictEnv
          ? t('mcp_doctor.env_missing_hint_strict')
          : t('mcp_doctor.env_missing_hint_relaxed')
      )
    );
  } else {
    checks.push(
      makeCheck(
        'env.required',
        true,
        'info',
        t('mcp_doctor.env_all_present', { count: requiredEnv.length })
      )
    );
  }

  if (contextResult.parsed && planFile.parsed) {
    const stackDatabase = normalizeDatabaseEngine(extractStackValue(contextMarkdown, 'Database'));
    if (stackDatabase) {
      const databaseServer = serverMap.get('database');
      const actualEngine = String(databaseServer && databaseServer.engine ? databaseServer.engine : '');
      const matches = Boolean(databaseServer && databaseServer.enabled && actualEngine === stackDatabase);
      checks.push(
        makeCheck(
          'compat.database',
          matches,
          matches ? 'info' : 'warn',
          matches
            ? t('mcp_doctor.compat_database_ok', { engine: stackDatabase })
            : t('mcp_doctor.compat_database_mismatch', { engine: stackDatabase }),
          matches
            ? ''
            : t('mcp_doctor.compat_database_hint')
        )
      );
    }

    const web3Enabled = isWeb3Context(contextData);
    const chainRpcServer = serverMap.get('chain-rpc');
    if (web3Enabled) {
      const chainOk = Boolean(chainRpcServer && chainRpcServer.enabled);
      checks.push(
        makeCheck(
          'compat.web3',
          chainOk,
          'error',
          chainOk
            ? t('mcp_doctor.compat_web3_ok')
            : t('mcp_doctor.compat_web3_missing'),
          chainOk ? '' : t('mcp_doctor.compat_web3_missing_hint')
        )
      );
    } else if (chainRpcServer && chainRpcServer.enabled) {
      checks.push(
        makeCheck(
          'compat.web3',
          false,
          'warn',
          t('mcp_doctor.compat_web3_unneeded'),
          t('mcp_doctor.compat_web3_unneeded_hint')
        )
      );
    }
  }

  const summary = summarizeChecks(checks);
  const output = {
    ok: summary.failed === 0,
    targetDir,
    strictEnv,
    context: {
      exists: contextResult.exists,
      parsed: contextResult.parsed,
      filePath: contextPath,
      projectType: String(contextData.project_type || ''),
      framework: String(contextData.framework || ''),
      interactionLanguage: getInteractionLanguage(contextData, 'en'),
      conversationLanguage: String(contextData.conversation_language || '')
    },
    plan: {
      filePath: planPath,
      exists: planFile.exists,
      parsed: planFile.parsed,
      serverCount: serverMap.size,
      enabledServers: enabledServers.map((server) => String(server.id || ''))
    },
    env: {
      required: requiredEnv,
      missing: missingEnv
    },
    presets: presetChecks,
    checks,
    summary
  };

  if (options.json) {
    return output;
  }

  logger.log(t('mcp_doctor.report_title', { path: targetDir }));
  for (const check of checks) {
    logger.log(
      t('mcp_doctor.check_line', {
        prefix: formatCheckPrefix(check, t),
        id: check.id,
        message: check.message
      })
    );
    if (check.hint) {
      logger.log(t('mcp_doctor.hint_line', { hint: check.hint }));
    }
  }
  logger.log(
    t('mcp_doctor.summary', {
      passed: summary.passed,
      failed: summary.failed,
      warnings: summary.warnings
    })
  );

  return output;
}

module.exports = {
  runMcpDoctor,
  summarizeChecks
};
