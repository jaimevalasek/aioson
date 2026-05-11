'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const { REQUIRED_FILES } = require('./constants');
const { installTemplate, TEMPLATE_DIR } = require('./installer');
const { exists, copyFileWithDir } = require('./utils');
const { validateProjectContextFile, getInteractionLanguage } = require('./context');
const { applyAgentLocale } = require('./locales');
const { getCliVersion } = require('./version');
const { generatePermissions, OUTPUT_PATHS: PERMISSIONS_OUTPUT_PATHS } = require('./permissions-generator');

const BOOTSTRAP_REQUIRED = ['what-is.md', 'how-it-works.md', 'what-it-does.md', 'current-state.md'];

const CLAUDE_AGENT_COMMANDS_REQUIRED = [
  '.claude/commands/aioson/agent/setup.md',
  '.claude/commands/aioson/agent/dev.md',
  '.claude/commands/aioson/agent/qa.md',
  '.claude/commands/aioson/agent/discover.md'
];

async function countBootstrapFiles(targetDir) {
  const dir = path.join(targetDir, '.aioson/context/bootstrap');
  let present = 0;
  for (const name of BOOTSTRAP_REQUIRED) {
    if (await exists(path.join(dir, name))) present += 1;
  }
  return { present, required: BOOTSTRAP_REQUIRED.length };
}

async function readMtime(filePath) {
  try {
    const stat = await fs.stat(filePath);
    return stat.mtimeMs;
  } catch {
    return null;
  }
}

async function readContextVersion(targetDir) {
  try {
    const raw = await fs.readFile(path.join(targetDir, '.aioson/context/project.context.md'), 'utf8');
    const match = raw.match(/aioson_version\s*:\s*["']?([^"'\n]+)["']?/);
    return match ? match[1].trim() : null;
  } catch {
    return null;
  }
}

async function assessPermissionsSync(targetDir) {
  const protocolPath = path.join(targetDir, '.aioson/config/autonomy-protocol.json');
  const protocolMtime = await readMtime(protocolPath);
  if (protocolMtime === null) {
    return { protocolMissing: true, drifted: [], missing: [] };
  }

  // Only check files for tools the protocol actually declares — extra harness
  // files left over from previous installs are not considered drift.
  let declaredTools = [];
  try {
    const raw = await fs.readFile(protocolPath, 'utf8');
    const json = JSON.parse(raw);
    declaredTools = Object.keys(json.tools || {});
  } catch {
    declaredTools = Object.keys(PERMISSIONS_OUTPUT_PATHS);
  }

  const drifted = [];
  const missing = [];
  for (const tool of declaredTools) {
    const rel = PERMISSIONS_OUTPUT_PATHS[tool];
    if (!rel) continue;
    const m = await readMtime(path.join(targetDir, rel));
    if (m === null) {
      missing.push(rel);
    } else if (m < protocolMtime) {
      drifted.push(rel);
    }
  }
  return { protocolMissing: false, drifted, missing };
}

function parseMajor(version) {
  const cleaned = String(version || '').replace(/^v/, '');
  const major = Number(cleaned.split('.')[0]);
  return Number.isFinite(major) ? major : 0;
}

async function fileContainsAll(filePath, patterns) {
  try {
    const content = await fs.readFile(filePath, 'utf8');
    return patterns.every((pattern) => content.includes(pattern));
  } catch {
    return false;
  }
}

const GEMINI_COMMAND_EXPECTATIONS = [
  { file: '.gemini/commands/aios-setup.toml', agent: 'setup' },
  { file: '.gemini/commands/aios-analyst.toml', agent: 'analyst' },
  { file: '.gemini/commands/aios-architect.toml', agent: 'architect' },
  { file: '.gemini/commands/aios-ux-ui.toml', agent: 'ux-ui' },
  { file: '.gemini/commands/aios-pm.toml', agent: 'pm' },
  { file: '.gemini/commands/aios-dev.toml', agent: 'dev' },
  { file: '.gemini/commands/aios-qa.toml', agent: 'qa' },
  { file: '.gemini/commands/aios-orchestrator.toml', agent: 'orchestrator' }
];

const DESIGN_GOVERNANCE_FILES = [
  '.aioson/design-docs/code-reuse.md',
  '.aioson/design-docs/componentization.md',
  '.aioson/design-docs/file-size.md',
  '.aioson/design-docs/folder-structure.md',
  '.aioson/design-docs/naming.md'
];

const GATEWAY_FILE_BY_CHECK_ID = {
  'gateway:claude:contract': 'CLAUDE.md',
  'gateway:codex:contract': 'AGENTS.md',
  'gateway:gemini:contract': '.gemini/GEMINI.md',
  'gateway:opencode:contract': 'OPENCODE.md',
  'gateway:gemini:command:setup': '.gemini/commands/aios-setup.toml',
  'gateway:gemini:command:analyst': '.gemini/commands/aios-analyst.toml',
  'gateway:gemini:command:architect': '.gemini/commands/aios-architect.toml',
  'gateway:gemini:command:ux-ui': '.gemini/commands/aios-ux-ui.toml',
  'gateway:gemini:command:pm': '.gemini/commands/aios-pm.toml',
  'gateway:gemini:command:dev': '.gemini/commands/aios-dev.toml',
  'gateway:gemini:command:qa': '.gemini/commands/aios-qa.toml',
  'gateway:gemini:command:orchestrator': '.gemini/commands/aios-orchestrator.toml'
};

async function restoreTemplateFiles(targetDir, relPaths, options = {}) {
  const dryRun = Boolean(options.dryRun);
  const restored = [];

  for (const rel of relPaths) {
    const source = path.join(TEMPLATE_DIR, rel);
    const dest = path.join(targetDir, rel);
    if (!(await exists(source))) continue;
    if (!dryRun) {
      await copyFileWithDir(source, dest);
    }
    restored.push(rel);
  }

  return restored;
}

async function runDoctor(targetDir) {
  const checks = [];

  for (const rel of REQUIRED_FILES) {
    const filePath = path.join(targetDir, rel);
    checks.push({
      id: `file:${rel}`,
      key: 'doctor.required_file',
      params: { rel },
      ok: await exists(filePath)
    });
  }

  for (const rel of DESIGN_GOVERNANCE_FILES) {
    checks.push({
      id: `design-governance:${rel}`,
      key: 'doctor.required_file',
      params: { rel },
      ok: await exists(path.join(targetDir, rel)),
      hintKey: 'doctor.context_hint'
    });
  }

  const gatewayChecks = [
    {
      id: 'gateway:claude:contract',
      rel: 'CLAUDE.md',
      key: 'doctor.gateway_claude_pointer',
      hintKey: 'doctor.gateway_claude_pointer_hint',
      patterns: ['.aioson/config.md', '.aioson/agents/setup.md']
    },
    {
      id: 'gateway:codex:contract',
      rel: 'AGENTS.md',
      key: 'doctor.gateway_codex_pointer',
      hintKey: 'doctor.gateway_codex_pointer_hint',
      patterns: ['.aioson/config.md', '.aioson/agents/']
    },
    {
      id: 'gateway:gemini:contract',
      rel: '.gemini/GEMINI.md',
      key: 'doctor.gateway_gemini_pointer',
      hintKey: 'doctor.gateway_gemini_pointer_hint',
      patterns: ['.gemini/commands/', '.aioson/agents/']
    },
    {
      id: 'gateway:opencode:contract',
      rel: 'OPENCODE.md',
      key: 'doctor.gateway_opencode_pointer',
      hintKey: 'doctor.gateway_opencode_pointer_hint',
      patterns: ['.aioson/config.md', '.aioson/agents/']
    }
  ];

  for (const gatewayCheck of gatewayChecks) {
    const gatewayPath = path.join(targetDir, gatewayCheck.rel);
    if (!(await exists(gatewayPath))) continue;
    checks.push({
      id: gatewayCheck.id,
      key: gatewayCheck.key,
      params: {},
      ok: await fileContainsAll(gatewayPath, gatewayCheck.patterns),
      hintKey: gatewayCheck.hintKey
    });
  }

  for (const expectation of GEMINI_COMMAND_EXPECTATIONS) {
    const commandPath = path.join(targetDir, expectation.file);
    if (!(await exists(commandPath))) continue;
    checks.push({
      id: `gateway:gemini:command:${expectation.agent}`,
      key: 'doctor.gateway_gemini_command_pointer',
      params: { file: expectation.file },
      ok: await fileContainsAll(commandPath, [
        `@{ .aioson/agents/${expectation.agent}.md }`
      ]),
      hintKey: 'doctor.gateway_gemini_command_pointer_hint',
      hintParams: {
        file: expectation.file,
        agent: expectation.agent
      }
    });
  }

  const contextPath = path.join(targetDir, '.aioson/context/project.context.md');
  checks.push({
    id: 'context:project',
    key: 'doctor.context_generated',
    params: {},
    ok: await exists(contextPath),
    hintKey: 'doctor.context_hint'
  });

  const contextValidation = await validateProjectContextFile(targetDir);
  if (contextValidation.exists) {
    checks.push({
      id: 'context:frontmatter',
      key: 'doctor.context_frontmatter_valid',
      params: {},
      ok: contextValidation.parsed,
      hintKey: contextValidation.parsed ? undefined : 'doctor.context_frontmatter_valid_hint'
    });

    for (const issue of contextValidation.issues) {
      checks.push({
        id: issue.id,
        key: issue.key,
        params: issue.params || {},
        ok: false,
        hintKey: issue.hintKey,
        hintParams: issue.hintParams || undefined
      });
    }
  }

  const major = parseMajor(process.version);
  checks.push({
    id: 'node:version',
    key: 'doctor.node_version',
    params: { version: process.version },
    ok: major >= 18
  });

  // ── Living Memory checks (Fase 4) ────────────────────────────────────────
  // Severity = 'warning' so they surface to the user as advisories without
  // breaking the overall `report.ok` (which gates downstream tooling).

  // 1. bootstrap_coverage
  const bootstrapDirExists = await exists(path.join(targetDir, '.aioson/context/bootstrap'));
  const bootstrapStats = await countBootstrapFiles(targetDir);
  checks.push({
    id: 'living-memory:bootstrap_coverage',
    severity: 'warning',
    key: 'doctor.bootstrap_coverage',
    params: { present: bootstrapStats.present, required: bootstrapStats.required },
    ok: bootstrapStats.present === bootstrapStats.required,
    hintKey: bootstrapStats.present === bootstrapStats.required
      ? undefined
      : (bootstrapDirExists ? 'doctor.bootstrap_coverage_hint' : 'doctor.bootstrap_coverage_hint_seed')
  });

  // 2. features_dir_present
  const featuresDirExists = await exists(path.join(targetDir, '.aioson/context/features'));
  checks.push({
    id: 'living-memory:features_dir',
    severity: 'warning',
    key: 'doctor.features_dir_present',
    params: {},
    ok: featuresDirExists,
    hintKey: featuresDirExists ? undefined : 'doctor.features_dir_present_hint'
  });

  // 3. claude_commands_present
  const missingClaudeCmds = [];
  for (const rel of CLAUDE_AGENT_COMMANDS_REQUIRED) {
    if (!(await exists(path.join(targetDir, rel)))) missingClaudeCmds.push(rel);
  }
  checks.push({
    id: 'living-memory:claude_commands',
    severity: 'warning',
    key: 'doctor.claude_commands_present',
    params: { missing: missingClaudeCmds.length, required: CLAUDE_AGENT_COMMANDS_REQUIRED.length },
    ok: missingClaudeCmds.length === 0,
    hintKey: missingClaudeCmds.length === 0 ? undefined : 'doctor.claude_commands_present_hint',
    hintParams: missingClaudeCmds.length === 0 ? undefined : { paths: missingClaudeCmds.join(', ') }
  });

  // 4. version_drift
  const contextVersion = await readContextVersion(targetDir);
  const cliVersion = await getCliVersion();
  const versionOk = !contextVersion || contextVersion === cliVersion;
  checks.push({
    id: 'living-memory:version_drift',
    severity: 'warning',
    key: 'doctor.version_drift',
    params: { context: contextVersion || '(none)', cli: cliVersion },
    ok: versionOk,
    hintKey: versionOk ? undefined : 'doctor.version_drift_hint'
  });

  // 5. permissions_in_sync
  const permsAssessment = await assessPermissionsSync(targetDir);
  const permsOk = !permsAssessment.protocolMissing
    && permsAssessment.drifted.length === 0
    && permsAssessment.missing.length === 0;
  checks.push({
    id: 'living-memory:permissions_in_sync',
    severity: 'warning',
    key: 'doctor.permissions_in_sync',
    params: {
      drifted: permsAssessment.drifted.length,
      missing: permsAssessment.missing.length,
      protocol_missing: permsAssessment.protocolMissing ? 'yes' : 'no'
    },
    ok: permsOk,
    hintKey: permsOk
      ? undefined
      : (permsAssessment.protocolMissing ? 'doctor.permissions_protocol_missing_hint' : 'doctor.permissions_in_sync_hint'),
    hintParams: permsOk ? undefined : {
      paths: [...permsAssessment.drifted, ...permsAssessment.missing].join(', ') || '(none)'
    }
  });

  // Overall `ok` only considers errors (not warnings). `failedCount` still
  // includes warnings so the user sees them in the count line.
  const errorChecks = checks.filter((c) => !c.ok && c.severity !== 'warning');
  const warningChecks = checks.filter((c) => !c.ok && c.severity === 'warning');
  const failed = [...errorChecks, ...warningChecks];

  return {
    ok: errorChecks.length === 0,
    checks,
    failedCount: failed.length,
    warningCount: warningChecks.length,
    errorCount: errorChecks.length,
    contextValidation,
    livingMemory: {
      bootstrap: bootstrapStats,
      featuresDir: featuresDirExists,
      claudeCommandsMissing: missingClaudeCmds,
      versionDrift: !versionOk ? { context: contextVersion, cli: cliVersion } : null,
      permissions: permsAssessment
    }
  };
}

async function applyDoctorFixes(targetDir, report, options = {}) {
  const dryRun = Boolean(options.dryRun);
  const actions = [];
  let changedCount = 0;

  const missingRequiredFiles = report.checks
    .filter((check) => !check.ok && check.id.startsWith('file:'))
    .map((check) => check.params.rel);

  if (missingRequiredFiles.length > 0) {
    const installResult = await installTemplate(targetDir, {
      overwrite: false,
      dryRun,
      mode: 'install'
    });
    const copiedRequired = installResult.copied.filter((rel) => missingRequiredFiles.includes(rel));
    if (copiedRequired.length > 0) changedCount += copiedRequired.length;
    actions.push({
      id: 'required_files',
      applied: copiedRequired.length > 0,
      count: copiedRequired.length,
      missingCount: missingRequiredFiles.length
    });
  } else {
    actions.push({
      id: 'required_files',
      applied: false,
      skipped: true,
      count: 0,
      missingCount: 0
    });
  }

  const brokenGatewayFiles = Array.from(
    new Set(
      report.checks
        .filter((check) => !check.ok)
        .map((check) => GATEWAY_FILE_BY_CHECK_ID[check.id])
        .filter(Boolean)
    )
  );

  if (brokenGatewayFiles.length > 0) {
    const restored = await restoreTemplateFiles(targetDir, brokenGatewayFiles, { dryRun });
    if (restored.length > 0) changedCount += restored.length;
    actions.push({
      id: 'gateway_contracts',
      applied: restored.length > 0,
      count: restored.length,
      missingCount: brokenGatewayFiles.length
    });
  } else {
    actions.push({
      id: 'gateway_contracts',
      applied: false,
      skipped: true,
      count: 0,
      missingCount: 0
    });
  }

  const missingDesignGovernanceFiles = report.checks
    .filter((check) => !check.ok && check.id.startsWith('design-governance:'))
    .map((check) => check.params.rel);

  if (missingDesignGovernanceFiles.length > 0) {
    const restored = await restoreTemplateFiles(targetDir, missingDesignGovernanceFiles, { dryRun });
    if (restored.length > 0) changedCount += restored.length;
    actions.push({
      id: 'design_governance',
      applied: restored.length > 0,
      count: restored.length,
      missingCount: missingDesignGovernanceFiles.length
    });
  } else {
    actions.push({
      id: 'design_governance',
      applied: false,
      skipped: true,
      count: 0,
      missingCount: 0
    });
  }

  if (
    report.contextValidation &&
    report.contextValidation.parsed &&
    report.contextValidation.valid &&
    report.contextValidation.data
  ) {
    const locale = getInteractionLanguage(report.contextValidation.data, 'en');
    const localeResult = await applyAgentLocale(targetDir, locale, { dryRun });
    if (localeResult.copied.length > 0) changedCount += localeResult.copied.length;
    actions.push({
      id: 'locale_sync',
      applied: localeResult.copied.length > 0,
      count: localeResult.copied.length,
      locale: localeResult.locale
    });
  } else {
    actions.push({
      id: 'locale_sync',
      applied: false,
      skipped: true,
      count: 0
    });
  }

  // ── Living Memory fixes (Fase 4) ─────────────────────────────────────────

  // claude_commands: restore missing claude slash commands from template
  const missingClaudeCmds = (report.livingMemory && report.livingMemory.claudeCommandsMissing) || [];
  if (missingClaudeCmds.length > 0) {
    const restored = await restoreTemplateFiles(targetDir, missingClaudeCmds, { dryRun });
    if (restored.length > 0) changedCount += restored.length;
    actions.push({
      id: 'claude_commands',
      applied: restored.length > 0,
      count: restored.length,
      missingCount: missingClaudeCmds.length
    });
  } else {
    actions.push({ id: 'claude_commands', applied: false, skipped: true, count: 0, missingCount: 0 });
  }

  // features_dir: mkdir if missing
  const featuresDirOk = !!(report.livingMemory && report.livingMemory.featuresDir);
  if (!featuresDirOk) {
    const featuresDir = path.join(targetDir, '.aioson/context/features');
    if (!dryRun) {
      await fs.mkdir(featuresDir, { recursive: true });
    }
    changedCount += 1;
    actions.push({ id: 'features_dir', applied: !dryRun, count: 1, missingCount: 1 });
  } else {
    actions.push({ id: 'features_dir', applied: false, skipped: true, count: 0, missingCount: 0 });
  }

  // permissions_in_sync: regenerate native permission files
  const permsAssessment = (report.livingMemory && report.livingMemory.permissions) || null;
  const permsNeedRegen = permsAssessment
    && !permsAssessment.protocolMissing
    && (permsAssessment.drifted.length > 0 || permsAssessment.missing.length > 0);
  if (permsNeedRegen) {
    if (!dryRun) {
      try {
        const result = await generatePermissions(targetDir);
        const regenCount = (result.written || []).length;
        if (regenCount > 0) changedCount += regenCount;
        actions.push({
          id: 'permissions_in_sync',
          applied: regenCount > 0,
          count: regenCount,
          missingCount: permsAssessment.drifted.length + permsAssessment.missing.length
        });
      } catch (err) {
        actions.push({
          id: 'permissions_in_sync',
          applied: false,
          count: 0,
          error: err && err.message ? err.message : String(err),
          missingCount: permsAssessment.drifted.length + permsAssessment.missing.length
        });
      }
    } else {
      actions.push({
        id: 'permissions_in_sync',
        applied: false,
        count: permsAssessment.drifted.length + permsAssessment.missing.length,
        missingCount: permsAssessment.drifted.length + permsAssessment.missing.length,
        dryRun: true
      });
    }
  } else {
    actions.push({ id: 'permissions_in_sync', applied: false, skipped: true, count: 0, missingCount: 0 });
  }

  // bootstrap_coverage and version_drift: advisory only (no auto-fix)
  const bs = report.livingMemory && report.livingMemory.bootstrap;
  if (bs && bs.present < bs.required) {
    actions.push({
      id: 'bootstrap_coverage',
      applied: false,
      skipped: true,
      advisory: true,
      count: 0,
      missingCount: bs.required - bs.present
    });
  }
  if (report.livingMemory && report.livingMemory.versionDrift) {
    actions.push({
      id: 'version_drift',
      applied: false,
      skipped: true,
      advisory: true,
      count: 0,
      missingCount: 1
    });
  }

  return {
    dryRun,
    actions,
    changedCount
  };
}

module.exports = {
  runDoctor,
  parseMajor,
  applyDoctorFixes
};
