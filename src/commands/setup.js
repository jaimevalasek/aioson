'use strict';

const path = require('node:path');
const readline = require('node:readline/promises');
const { installTemplate, readInstallProfile } = require('../installer');
const { detectFramework } = require('../detector');
const { detectSystemLanguage } = require('./setup-context');
const { runSetupContext } = require('./setup-context');
const { resolvePromptTool } = require('../prompt-tool');
const { normalizeBoolean } = require('../context-writer');
const { runInstallWizard } = require('../install-wizard');
const { resolveTargetDir } = require('../lib/project-root');
const { defaultProjectTool } = require('../lib/project-tool');

async function ask(rl, question, fallback = '') {
  const suffix = fallback ? ` (${fallback})` : '';
  const value = await rl.question(`${question}${suffix}: `);
  const cleaned = String(value || '').trim();
  if (!cleaned) return fallback;
  return cleaned;
}

// The hint names the tool this project was installed for (install.json, then
// the gateway file present), not a fixed codex: `install --tool=claude`
// followed by setup used to suggest `--tool=codex`.
function logClosing({ targetDir, dryRun, tool, logger, t }) {
  logger.log('');
  if (dryRun) {
    logger.log(t('setup.dry_run_done', { targetDir }));
    return;
  }
  logger.log(t('setup.done'));
  logger.log(t('setup.step_agents'));
  logger.log(t('setup.step_agent_prompt', { tool: resolvePromptTool(tool || defaultProjectTool(targetDir)) }));
}

async function runSetup({ args, options, logger, t }) {
  const targetDir = resolveTargetDir(args);
  const dryRun = Boolean(options['dry-run']);
  const force = Boolean(options.force);
  const defaultsMode = Boolean(options.defaults);

  // Step 1 — install profile. The saved one (.aioson/install.json) always
  // applies, terminal or not: without a TTY it used to be dropped, and a
  // claude/development project got AGENTS.md, OPENCODE.md and the squad docs
  // it had left out. The wizard only runs for a first setup in a TTY.
  const isTTY = process.stdin.isTTY && process.stdout.isTTY;
  let installProfile = await readInstallProfile(targetDir);
  if (!installProfile && !dryRun && isTTY) {
    installProfile = await runInstallWizard({});
  }

  // Step 2 — install template
  logger.log(t('setup.installing'));
  const installResult = await installTemplate(targetDir, {
    overwrite: force,
    dryRun,
    mode: 'install',
    installProfile,
    tool: options.tool
  });
  logger.log(t(dryRun ? 'setup.dry_run_installed' : 'setup.installed', { count: installResult.copied.length }));

  // Step 3 — detect framework and system language
  const detection = await detectFramework(targetDir);
  const detectedFramework = detection.framework;
  const detectedInstalled = detection.installed;
  const systemLang = detectSystemLanguage();

  // Build setup:context options by merging detected state with explicit flags.
  // --dry-run travels with them: setup:context writes the context file and
  // every agent prompt, and a dry-run that skipped only the template copy
  // still rewrote both.
  const contextOptions = { defaults: true, 'dry-run': dryRun };

  // Propagate any explicit overrides the user passed to `setup`
  const passthroughFlags = [
    'project-name', 'project-type', 'framework', 'framework-installed',
    'classification', 'lang', 'language', 'profile', 'backend', 'frontend',
    'database', 'auth', 'uiux', 'design-skill', 'test-runner',
    'web3-enabled', 'web3-networks', 'contract-framework',
    'wallet-provider', 'indexer', 'rpc-provider',
    'queues', 'storage', 'websockets', 'payments', 'email', 'cache', 'search'
  ];
  for (const flag of passthroughFlags) {
    if (Object.prototype.hasOwnProperty.call(options, flag)) {
      contextOptions[flag] = options[flag];
    }
  }

  // Apply language: explicit flag > system detection
  if (!contextOptions.lang && !contextOptions.language) {
    contextOptions.lang = systemLang;
  }

  // For greenfield projects (nothing detected), ask minimal interactive questions
  // unless --defaults is set or the user already passed --framework
  const isGreenfield = !detectedFramework;
  const frameworkProvided = Object.prototype.hasOwnProperty.call(options, 'framework');

  if (!defaultsMode && isGreenfield && !frameworkProvided) {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    try {
      logger.log(t('setup.no_framework_detected'));

      const projectName = await ask(
        rl,
        t('setup.q_project_name'),
        path.basename(targetDir) || 'my-project'
      );
      if (projectName !== path.basename(targetDir)) {
        contextOptions['project-name'] = projectName;
      }

      const framework = await ask(rl, t('setup.q_framework'), '');
      if (framework) {
        contextOptions.framework = framework;
        contextOptions['framework-installed'] = 'false';
      }

      const detectedLang = contextOptions.lang || systemLang;
      const lang = await ask(rl, t('setup.q_lang'), detectedLang);
      contextOptions.lang = lang;
    } finally {
      rl.close();
    }
  } else if (!defaultsMode && detectedFramework) {
    // Existing project with detected framework — confirm before proceeding
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    try {
      logger.log(
        t('setup.framework_detected', {
          framework: detectedFramework,
          installed: String(detectedInstalled)
        })
      );

      const confirmed = normalizeBoolean(
        await ask(rl, t('setup.q_confirm_framework'), 'true'),
        true
      );

      if (!confirmed) {
        const override = await ask(rl, t('setup.q_override_framework'), detectedFramework);
        contextOptions.framework = override;
        contextOptions['framework-installed'] = await ask(
          rl,
          t('setup.q_framework_installed'),
          'false'
        );
      }

      const detectedLang = contextOptions.lang || systemLang;
      const lang = await ask(rl, t('setup.q_lang'), detectedLang);
      contextOptions.lang = lang;
    } finally {
      rl.close();
    }
  }

  // Step 4 — run setup:context with fully resolved options
  logger.log(t('setup.writing_context'));
  const contextResult = await runSetupContext({
    args: [targetDir],
    options: contextOptions,
    logger,
    t
  });

  logClosing({ targetDir, dryRun, tool: options.tool, logger, t });

  return {
    ok: true,
    targetDir,
    dryRun,
    installProfile,
    installResult,
    contextResult,
    detection
  };
}

module.exports = { runSetup };
