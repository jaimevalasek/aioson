'use strict';

const fs = require('node:fs');
const { parseArgv } = require('./parser');
const { createTranslator, normalizeLocale } = require('./i18n');
const { runInit } = require('./commands/init');
const { runInstall } = require('./commands/install');
const { runSetup } = require('./commands/setup');
const { runUpdate } = require('./commands/update');
const { runInfo } = require('./commands/info');
const { runDoctorCommand } = require('./commands/doctor');
const { runI18nAdd } = require('./commands/i18n-add');
const { runAgentsList, runAgentPrompt } = require('./commands/agents');
const { runContextValidate } = require('./commands/context-validate');
const { runContextPack } = require('./commands/context-pack');
const { runSetupContext } = require('./commands/setup-context');
const { runLocaleApply } = require('./commands/locale-apply');
const { runSmokeTest } = require('./commands/smoke');
const { runMcpInit } = require('./commands/mcp-init');
const { runMcpDoctor } = require('./commands/mcp-doctor');
const { runPackageTest } = require('./commands/package-e2e');
const { runWorkflowPlan } = require('./commands/workflow-plan');
const { runWorkflowNext } = require('./commands/workflow-next');
const { runWorkflowStatus } = require('./commands/workflow-status');
const { runWorkflowHeal } = require('./commands/workflow-heal');
const { runWorkflowHarden } = require('./commands/workflow-harden');
const { runParallelInit } = require('./commands/parallel-init');
const { runParallelDoctor } = require('./commands/parallel-doctor');
const { runParallelAssign } = require('./commands/parallel-assign');
const { runParallelStatus } = require('./commands/parallel-status');
const { runParallelMerge } = require('./commands/parallel-merge');
const { runParallelGuard } = require('./commands/parallel-guard');
const { runTestAgents } = require('./commands/test-agents');
const { runLocaleDiff } = require('./commands/locale-diff');
const { runQaDoctor } = require('./commands/qa-doctor');
const { runQaInit } = require('./commands/qa-init');
const { runQaRun } = require('./commands/qa-run');
const { runQaScan } = require('./commands/qa-scan');
const { runQaReport } = require('./commands/qa-report');
const { runWebMap } = require('./commands/web-map');
const { runWebScrape } = require('./commands/web-scrape');
const { runScanProject } = require('./commands/scan-project');
const { runSecurityScan } = require('./commands/security-scan');
const { runSecurityAudit } = require('./commands/security-audit');
const { runConfig } = require('./commands/config');
const { runGenomeDoctor } = require('./commands/genome-doctor');
const { runGenomeMigrate } = require('./commands/genome-migrate');
const { runSquadStatus } = require('./commands/squad-status');
const { runSquadDoctor } = require('./commands/squad-doctor');
const { runSquadRepairGenomes } = require('./commands/squad-repair-genomes');
const { runSquadValidate } = require('./commands/squad-validate');
const { runSquadExport } = require('./commands/squad-export');
const { runSquadPipeline } = require('./commands/squad-pipeline');
const { runSquadAgentCreate } = require('./commands/squad-agent-create');
const { runSquadInvestigate } = require('./commands/squad-investigate');
const { runImplementationPlan } = require('./commands/implementation-plan');
const { runSquadPlan } = require('./commands/squad-plan');
const { runSquadLearning } = require('./commands/squad-learning');
const { runLearning } = require('./commands/learning');
const { runSquadDashboard } = require('./commands/squad-dashboard');
const { runSquadWorker } = require('./commands/squad-worker');
const { runSquadDaemon } = require('./commands/squad-daemon');
const { runSquadMcp } = require('./commands/squad-mcp');
const { runSquadRoi } = require('./commands/squad-roi');
const { runSquadScore } = require('./commands/squad-score');
const { runSquadProcesses } = require('./commands/squad-processes');
const { runSquadWorktrees, runSquadMerge } = require('./commands/squad-worktrees');
const { runSquadRecovery } = require('./commands/squad-recovery');
const { runSquadDeploy } = require('./commands/squad-deploy');
const { runSquadWebhook } = require('./commands/squad-webhook');
const { runSquadBus } = require('./commands/squad-bus');
const { runSquadAutorun } = require('./commands/squad-autorun');
const { runSquadDependencyGraph } = require('./commands/squad-dependency-graph');
const { runSquadToolRegister } = require('./commands/squad-tool-register');
const { runSquadReview } = require('./commands/squad-review');
const { runAgentAudit } = require('./commands/agent-audit');
const { runBriefGen } = require('./commands/brief-gen');
const { runHarnessInit, runHarnessValidate, runHarnessApplyValidation } = require('./commands/harness');
const { runVerifyGate } = require('./commands/verify-gate');
const {
  runRuntimeInit,
  runRuntimeIngest,
  runRuntimeTaskStart,
  runRuntimeStart,
  runRuntimeUpdate,
  runRuntimeTaskFinish,
  runRuntimeFinish,
  runRuntimeTaskFail,
  runRuntimeFail,
  runRuntimeStatus,
  runRuntimeLog,
  runAgentDone,
  runAgentRecover,
  runRuntimeSessionStart,
  runRuntimeSessionLog,
  runRuntimeSessionFinish,
  runRuntimeSessionStatus,
  runDeliver,
  runOutputStrategyExport,
  runOutputStrategyImport,
  runDevlogSync,
  runRuntimePrune
} = require('./commands/runtime');
const {
  runLiveStart,
  runRuntimeEmit,
  runLiveHandoff,
  runLiveStatus,
  runLiveClose,
  runLiveList
} = require('./commands/live');
const {
  runToolCapabilities,
} = require('./commands/tool-capabilities');
const { runScaffoldComplete } = require('./commands/scaffold-complete');
const {
  runCloudImportSquad,
  runCloudImportGenome,
  runCloudPublishGenome,
  runCloudPublishSquad
} = require('./commands/cloud');
const {
  runRuntimeBackup,
  runRuntimeRestore
} = require('./commands/backup');
const {
  runSkillInstall,
  runSkillList,
  runSkillRemove
} = require('./commands/skill');
const { runDesignHybridOptions } = require('./commands/design-hybrid-options');
const { runBackupLocal } = require('./commands/backup-local-cmd');
const { runRecoveryGenerate, runRecoveryShow } = require('./commands/recovery');
const { runContextMonitor } = require('./commands/context-monitor');
const { runContextSearch, runContextSearchIndex } = require('./commands/context-search');
const { runContextCacheList, runContextCacheSave, runContextCacheRestore, runContextCacheCleanup } = require('./commands/context-cache');
const { runSandboxExec } = require('./commands/sandbox');
const { runAgentLoad, runAgentShardIndex } = require('./commands/agent-loader');
const { runLearningEvolve, runLearningApply } = require('./commands/learning-evolve');
const { runLearningRollback } = require('./commands/learning-rollback');
const { runToolRegistry } = require('./commands/tool-registry-cmd');
const { runHealth } = require('./commands/health');
const { runContextHealth } = require('./commands/context-health');
const { runContextTrim } = require('./commands/context-trim');
const { runHooksEmit } = require('./commands/hooks-emit');
const { runHooksInstall, runHooksUninstall } = require('./commands/hooks-install');
const { runSessionGuard } = require('./commands/session-guard');
const { runDevlogProcess } = require('./commands/devlog-process');
const { runDevlogWatch } = require('./commands/devlog-watch');
const { runDevlogExportBrains } = require('./commands/devlog-export-brains');
const { runBrainQuery } = require('./commands/brain-query');
const { runMemoryStatus, runMemorySummary } = require('./commands/memory');
const { runSpecSync } = require('./commands/spec-sync');
const { runSpecStatus } = require('./commands/spec-status');
const { runSpecCheckpoint } = require('./commands/spec-checkpoint');
const { runSpecTasks } = require('./commands/spec-tasks');
const { runLearningExport } = require('./commands/learning-export');
const { runRunnerRun } = require('./commands/runner-run');
const { runRunnerQueue } = require('./commands/runner-queue');
const { runRunnerPlan } = require('./commands/runner-plan');
const { runRunnerDaemon } = require('./commands/runner-daemon');
const { runPreflight } = require('./commands/preflight');
const { runClassify } = require('./commands/classify');
const { runSizing } = require('./commands/sizing');
const { runDetectTestRunner } = require('./commands/detect-test-runner');
const { runPulseUpdate } = require('./commands/pulse-update');
const { runStateSave } = require('./commands/state-save');
const { runFeatureClose } = require('./commands/feature-close');
const { runFeatureArchive } = require('./commands/feature-archive');
const { runDossierInit, runDossierShow, runDossierAddFinding, runDossierAddCodemap, runDossierLinkRule, runDossierCompact } = require('./commands/dossier');
const { runDossierAddResearch } = require('./commands/dossier-add-research');
const { runDossierAudit } = require('./commands/dossier-audit');
const { runDevResumeData } = require('./commands/dev-resume');
const { runRevisionOpen, runRevisionList, runRevisionResolve } = require('./commands/revision');
const { runGateCheck } = require('./commands/gate-check');
const { runGateApprove } = require('./commands/gate-approve');
const { runArtifactValidate } = require('./commands/artifact-validate');
const { runWorkflowExecute } = require('./commands/workflow-execute');
const { runRunnerQueueFromPlan } = require('./commands/runner-queue-from-plan');
const { runLearningAutoPromote } = require('./commands/learning-auto-promote');
const { runBriefValidate } = require('./commands/brief-validate');
const { runPreflightContext } = require('./commands/preflight-context');
const { runContextCompact } = require('./commands/context-compact');
const { runSquadScaffold } = require('./commands/squad-scaffold');
const { runPatternDetect } = require('./commands/pattern-detect');
const { runSelfLoop } = require('./commands/self-implement-loop');
const { runSquadCard } = require('./commands/squad-card');
const { runAgentExportSkill } = require('./commands/agent-export-skill');
const { runGitGuard } = require('./commands/git-guard');
const { runCommitPrepare } = require('./commands/commit-prepare');
const { runAuthLogin, runAuthLogout, runAuthStatus } = require('./commands/auth');
const { runWorkspaceInit, runWorkspaceStatus, runWorkspaceOpen } = require('./commands/workspace');
const { runGenomePublish, runGenomeInstallStore, runGenomeInstall, runGenomeList, runGenomeRemove } = require('./commands/store-genome');
const { runSkillPublish, runSkillInstallStore, runSkillListRemote } = require('./commands/store-skill');
const { runSquadPublish, runSquadInstall, runSquadGrant, runSquadList } = require('./commands/store-squad');
const { runSystemPackage, runSystemPublish, runSystemList, runSystemInstall } = require('./commands/store-system');
const { runBriefingApprove, runBriefingUnapprove } = require('./commands/briefing');
const { runCompressAgents } = require('./commands/compress-agents');

const JSON_SUPPORTED_COMMANDS = new Set([
  'init',
  'install',
  'setup',
  'update',
  'i18n:add',
  'i18n-add',
  'agents',
  'agent:prompt',
  'agent-prompt',
  'agent:invoke',
  'agent-invoke',
  'setup:context',
  'setup-context',
  'locale:apply',
  'locale-apply',
  'info',
  'doctor',
  'context:validate',
  'context-validate',
  'context:pack',
  'context-pack',
  'test:smoke',
  'test-smoke',
  'test:agents',
  'test-agents',
  'locale:diff',
  'locale-diff',
  'test:package',
  'test-package',
  'workflow:plan',
  'workflow-plan',
  'workflow:next',
  'workflow-next',
  'workflow:status',
  'workflow-status',
  'agent:next',
  'agent-next',
  'parallel:init',
  'parallel-init',
  'parallel:doctor',
  'parallel-doctor',
  'parallel:assign',
  'parallel-assign',
  'parallel:status',
  'parallel-status',
  'parallel:merge',
  'parallel-merge',
  'parallel:guard',
  'parallel-guard',
  'orchestrator:init',
  'orchestrator-init',
  'orchestrator:doctor',
  'orchestrator-doctor',
  'orchestrator:assign',
  'orchestrator:merge',
  'orchestrator-merge',
  'orchestrator:guard',
  'orchestrator-guard',
  'orchestrator-assign',
  'orchestrator:status',
  'orchestrator-status',
  'mcp:init',
  'mcp-init',
  'mcp:doctor',
  'mcp-doctor',
  'qa:doctor',
  'qa-doctor',
  'qa:init',
  'qa-init',
  'qa:run',
  'qa-run',
  'qa:scan',
  'qa-scan',
  'qa:report',
  'qa-report',
  'web:map',
  'web-map',
  'web:scrape',
  'web-scrape',
  'scan:project',
  'scan-project',
  'security:scan',
  'security-scan',
  'security:audit',
  'security-audit',
  'config',
  'genome:doctor',
  'genome-doctor',
  'genome:migrate',
  'genome-migrate',
  'squad:status',
  'squad-status',
  'squad:doctor',
  'squad-doctor',
  'squad:repair-genomes',
  'squad-repair-genomes',
  'squad:validate',
  'squad-validate',
  'squad:export',
  'squad-export',
  'squad:pipeline',
  'squad-pipeline',
  'squad:agent-create',
  'squad-agent-create',
  'squad:investigate',
  'squad-investigate',
  'squad:dashboard',
  'squad-dashboard',
  'squad:worker',
  'squad-worker',
  'squad:daemon',
  'squad-daemon',
  'squad:mcp',
  'squad-mcp',
  'squad:mcp:call',
  'squad:roi',
  'squad-roi',
  'squad:score',
  'squad-score',
  'squad:processes',
  'squad-processes',
  'squad:worktrees',
  'squad-worktrees',
  'squad:merge',
  'squad-merge',
  'squad:recovery',
  'squad-recovery',
  'squad:deploy',
  'squad-deploy',
  'squad:webhook',
  'squad-webhook',
  'plan:show',
  'plan:status',
  'plan:checkpoint',
  'plan:stale',
  'plan:register',
  'plan',
  'squad:plan',
  'squad-plan',
  'squad:bus',
  'squad-bus',
  'squad:autorun',
  'squad-autorun',
  'squad:dependency-graph',
  'squad-dependency-graph',
  'squad:tool:register',
  'squad-tool-register',
  'squad:review',
  'squad-review',
  'agent:audit',
  'agent-audit',
  'brief:gen',
  'harness:init',
  'harness-init',
  'harness:validate',
  'harness-validate',
  'harness:apply-validation',
  'harness-apply-validation',
  'brief-gen',
  'verify:gate',
  'verify-gate',
  'brief:validate',
  'brief-validate',
  'preflight:context',
  'preflight-context',
  'context:compact',
  'context-compact',
  'squad:scaffold',
  'squad-scaffold',
  'pattern:detect',
  'pattern-detect',
  'self:loop',
  'self-loop',
  'squad:card',
  'squad-card',
  'git:guard',
  'git-guard',
  'commit:prepare',
  'commit-prepare',
  'agent:export-skill',
  'agent-export-skill',
  'squad:learning',
  'squad-learning',
  'learning',
  'learning:list',
  'learning:stats',
  'learning:promote',
  'learning:evolve',
  'learning-evolve',
  'learning:apply',
  'learning-apply',
  'learning:rollback',
  'learning-rollback',
  'learning:export',
  'learning-export',
  'spec:sync',
  'spec-sync',
  'spec:status',
  'spec-status',
  'spec:checkpoint',
  'spec-checkpoint',
  'spec:tasks',
  'spec-tasks',
  'tool:register',
  'tool-register',
  'tool:list',
  'tool-list',
  'tool:call',
  'tool-call',
  'tool:unregister',
  'tool-unregister',
  'tool:show',
  'tool-show',
  'health',
  'runtime:init',
  'runtime-init',
  'runtime:ingest',
  'runtime-ingest',
  'runtime:task:start',
  'runtime-task-start',
  'runtime:start',
  'runtime-start',
  'runtime:update',
  'runtime-update',
  'runtime:task:finish',
  'runtime-task-finish',
  'runtime:finish',
  'runtime-finish',
  'runtime:task:fail',
  'runtime-task-fail',
  'runtime:fail',
  'runtime-fail',
  'runtime:status',
  'runtime-status',
  'runtime:log',
  'runtime-log',
  'agent:done',
  'agent-done',
  'agent:recover',
  'agent-recover',
  'runtime:session:start',
  'runtime-session-start',
  'runtime:session:log',
  'runtime-session-log',
  'runtime:session:finish',
  'runtime-session-finish',
  'runtime:session:status',
  'runtime-session-status',
  'runtime:emit',
  'runtime-emit',
  'live:start',
  'live-start',
  'live:status',
  'live-status',
  'live:handoff',
  'live-handoff',
  'live:close',
  'live-close',
  'live:list',
  'live-list',
  'scaffold:complete',
  'scaffold-complete',
  'deliver',
  'output-strategy:export',
  'output-strategy:import',
  'cloud:import:squad',
  'cloud-import-squad',
  'cloud:import:genome',
  'cloud-import-genome',
  'cloud:publish:squad',
  'cloud-publish-squad',
  'cloud:publish:genome',
  'cloud-publish-genome',
  'hooks:emit',
  'hooks-emit',
  'hooks:install',
  'hooks-install',
  'hooks:uninstall',
  'hooks-uninstall',
  'session:guard',
  'session-guard',
  'devlog:process',
  'devlog-process',
  'devlog:watch',
  'devlog-watch',
  'devlog:export-brains',
  'devlog-export-brains',
  'brain:query',
  'brain-query',
  'memory:status',
  'memory-status',
  'memory:summary',
  'memory-summary',
  'runtime:backup',
  'runtime-backup',
  'runtime:restore',
  'runtime-restore',
  'skill:install',
  'skill-install',
  'skill:list',
  'skill-list',
  'skill:remove',
  'skill-remove',
  'design-hybrid:options',
  'design-hybrid-options',
  'recovery:generate',
  'recovery-generate',
  'recovery:show',
  'recovery-show',
  'context:monitor',
  'context-monitor',
  'context:health',
  'context-health',
  'context:trim',
  'context-trim',
  'context:search',
  'context-search',
  'context:search:index',
  'context-search-index',
  'context:cache',
  'context-cache',
  'context:cache:save',
  'context-cache-save',
  'context:cache:restore',
  'context-cache-restore',
  'context:cache:cleanup',
  'context-cache-cleanup',
  'sandbox:exec',
  'sandbox-exec',
  'agent:load',
  'agent-load',
  'agent:shard:index',
  'agent-shard-index',
  'runner:run',
  'runner-run',
  'runner:queue',
  'runner-queue',
  'runner:plan',
  'runner-plan',
  'runner:daemon',
  'runner-daemon',
  'version',
  '--version',
  '-v',
  'preflight',
  'classify',
  'sizing',
  'detect:test-runner',
  'detect-test-runner',
  'pulse:update',
  'pulse-update',
  'state:save',
  'state-save',
  'feature:close',
  'feature-close',
  'feature:archive',
  'feature-archive',
  'dossier:init',
  'dossier-init',
  'dossier:show',
  'dossier-show',
  'dossier:add-finding',
  'dossier-add-finding',
  'dossier:add-codemap',
  'dossier-add-codemap',
  'dossier:link-rule',
  'dossier-link-rule',
  'dossier:add-research',
  'dossier-add-research',
  'dossier:audit',
  'dossier-audit',
  'dossier:compact',
  'dossier-compact',
  'dev:resume-data',
  'dev-resume-data',
  'revision:open',
  'revision-open',
  'revision:list',
  'revision-list',
  'revision:resolve',
  'revision-resolve',
  'gate:check',
  'gate-check',
  'gate:approve',
  'gate-approve',
  'artifact:validate',
  'artifact-validate',
  'workflow:execute',
  'workflow-execute',
  'runner:queue:from-plan',
  'runner-queue-from-plan',
  'learning:auto-promote',
  'learning-auto-promote',
  'auth:login',
  'auth-login',
  'auth:logout',
  'auth-logout',
  'auth:status',
  'auth-status',
  'workspace:init',
  'workspace-init',
  'workspace:status',
  'workspace-status',
  'workspace:open',
  'workspace-open',
  'genome:publish',
  'genome-publish',
  'genome:install',
  'genome-install',
  'genome:install:store',
  'genome-install-store',
  'genome:list',
  'genome-list',
  'genome:remove',
  'genome-remove',
  'skill:publish',
  'skill-publish',
  'compress:agents',
  'compress-agents',
  'skill:install:store',
  'skill-install-store',
  'squad:list',
  'squad-list',
  'squad:publish',
  'squad-publish',
  'squad:install',
  'squad-install',
  'squad:grant',
  'squad-grant',
  'system:package',
  'system-package',
  'system:publish',
  'system-publish',
  'system:list',
  'system-list',
  'system:install',
  'system-install'
]);

const LEGACY_DASHBOARD_COMMANDS = new Set([
  'dashboard:init',
  'dashboard-init',
  'dashboard:dev',
  'dashboard-dev',
  'dashboard:open',
  'dashboard-open'
]);

function toText(value) {
  if (value === undefined || value === null) return '';
  return typeof value === 'string' ? value : String(value);
}

function createLogger() {
  return {
    log(value = '') {
      fs.writeSync(1, `${toText(value)}\n`);
    },
    error(value = '') {
      fs.writeSync(2, `${toText(value)}\n`);
    }
  };
}

function createSilentLogger() {
  return {
    log() {},
    error() {}
  };
}

function logHelpLine(t, logger, key) {
  logger.log(t('cli.help_item_line', { text: t(key) }));
}

function printHelp(t, logger) {
  logger.log(t('cli.title_line', { title: t('cli.title') }));
  logger.log(t('cli.usage'));
  logHelpLine(t, logger, 'cli.help_init');
  logHelpLine(t, logger, 'cli.help_install');
  logHelpLine(t, logger, 'cli.help_setup');
  logHelpLine(t, logger, 'cli.help_update');
  logHelpLine(t, logger, 'cli.help_info');
  logHelpLine(t, logger, 'cli.help_doctor');
  logHelpLine(t, logger, 'cli.help_i18n_add');
  logHelpLine(t, logger, 'cli.help_agents');
  logHelpLine(t, logger, 'cli.help_agent_prompt');
  logHelpLine(t, logger, 'cli.help_agent_invoke');
  logHelpLine(t, logger, 'cli.help_context_validate');
  logHelpLine(t, logger, 'cli.help_context_pack');
  logHelpLine(t, logger, 'cli.help_memory_status');
  logHelpLine(t, logger, 'cli.help_memory_summary');
  logHelpLine(t, logger, 'cli.help_brain_query');
  logHelpLine(t, logger, 'cli.help_setup_context');
  logHelpLine(t, logger, 'cli.help_locale_apply');
  logHelpLine(t, logger, 'cli.help_locale_diff');
  logHelpLine(t, logger, 'cli.help_test_agents');
  logHelpLine(t, logger, 'cli.help_test_smoke');
  logHelpLine(t, logger, 'cli.help_test_package');
  logHelpLine(t, logger, 'cli.help_workflow_plan');
  logHelpLine(t, logger, 'cli.help_workflow_next');
  logHelpLine(t, logger, 'cli.help_workflow_status');
  logHelpLine(t, logger, 'cli.help_workflow_execute');
  logHelpLine(t, logger, 'cli.help_parallel_init');
  logHelpLine(t, logger, 'cli.help_parallel_doctor');
  logHelpLine(t, logger, 'cli.help_parallel_assign');
  logHelpLine(t, logger, 'cli.help_parallel_status');
  logHelpLine(t, logger, 'cli.help_parallel_merge');
  logHelpLine(t, logger, 'cli.help_parallel_guard');
  logHelpLine(t, logger, 'cli.help_mcp_init');
  logHelpLine(t, logger, 'cli.help_mcp_doctor');
  logHelpLine(t, logger, 'cli.help_qa_doctor');
  logHelpLine(t, logger, 'cli.help_qa_init');
  logHelpLine(t, logger, 'cli.help_qa_run');
  logHelpLine(t, logger, 'cli.help_qa_scan');
  logHelpLine(t, logger, 'cli.help_qa_report');
  logHelpLine(t, logger, 'cli.help_web_map');
  logHelpLine(t, logger, 'cli.help_web_scrape');
  logHelpLine(t, logger, 'cli.help_scan_project');
  logHelpLine(t, logger, 'cli.help_config');
  logHelpLine(t, logger, 'cli.help_genome_doctor');
  logHelpLine(t, logger, 'cli.help_genome_migrate');
  logHelpLine(t, logger, 'cli.help_squad_status');
  logHelpLine(t, logger, 'cli.help_squad_doctor');
  logHelpLine(t, logger, 'cli.help_squad_repair_genomes');
  logHelpLine(t, logger, 'cli.help_squad_validate');
  logHelpLine(t, logger, 'cli.help_squad_export');
  logHelpLine(t, logger, 'cli.help_squad_pipeline');
  logHelpLine(t, logger, 'cli.help_squad_agent_create');
  logHelpLine(t, logger, 'cli.help_squad_investigate');
  logHelpLine(t, logger, 'cli.help_squad_dashboard');
  logHelpLine(t, logger, 'cli.help_squad_worker');
  logHelpLine(t, logger, 'cli.help_squad_daemon');
  logHelpLine(t, logger, 'cli.help_squad_mcp');
  logHelpLine(t, logger, 'cli.help_squad_roi');
  logHelpLine(t, logger, 'cli.help_squad_score');
  logHelpLine(t, logger, 'cli.help_squad_learning');
  logHelpLine(t, logger, 'cli.help_learning');
  logHelpLine(t, logger, 'cli.help_runtime_init');
  logHelpLine(t, logger, 'cli.help_runtime_ingest');
  logHelpLine(t, logger, 'cli.help_runtime_task_start');
  logHelpLine(t, logger, 'cli.help_runtime_start');
  logHelpLine(t, logger, 'cli.help_runtime_update');
  logHelpLine(t, logger, 'cli.help_runtime_task_finish');
  logHelpLine(t, logger, 'cli.help_runtime_finish');
  logHelpLine(t, logger, 'cli.help_runtime_task_fail');
  logHelpLine(t, logger, 'cli.help_runtime_fail');
  logHelpLine(t, logger, 'cli.help_runtime_status');
  logHelpLine(t, logger, 'cli.help_runtime_session_start');
  logHelpLine(t, logger, 'cli.help_runtime_session_log');
  logHelpLine(t, logger, 'cli.help_runtime_session_finish');
  logHelpLine(t, logger, 'cli.help_runtime_session_status');
  logHelpLine(t, logger, 'cli.help_runtime_emit');
  logHelpLine(t, logger, 'cli.help_live_start');
  logHelpLine(t, logger, 'cli.help_live_status');
  logHelpLine(t, logger, 'cli.help_live_handoff');
  logHelpLine(t, logger, 'cli.help_live_close');
  logHelpLine(t, logger, 'cli.help_scaffold_complete');
  logHelpLine(t, logger, 'cli.help_runtime_backup');
  logHelpLine(t, logger, 'cli.help_runtime_restore');
  logHelpLine(t, logger, 'cli.help_skill_install');
  logHelpLine(t, logger, 'cli.help_skill_list');
  logHelpLine(t, logger, 'cli.help_skill_remove');
  logHelpLine(t, logger, 'cli.help_design_hybrid_options');
  logHelpLine(t, logger, 'cli.help_cloud_import_squad');
  logHelpLine(t, logger, 'cli.help_cloud_import_genome');
  logHelpLine(t, logger, 'cli.help_cloud_publish_squad');
  logHelpLine(t, logger, 'cli.help_cloud_publish_genome');
  logHelpLine(t, logger, 'cli.help_auth_login');
  logHelpLine(t, logger, 'cli.help_auth_logout');
  logHelpLine(t, logger, 'cli.help_auth_status');
  logHelpLine(t, logger, 'cli.help_workspace_init');
  logHelpLine(t, logger, 'cli.help_workspace_status');
  logHelpLine(t, logger, 'cli.help_workspace_open');
  logHelpLine(t, logger, 'cli.help_genome_publish');
  logHelpLine(t, logger, 'cli.help_genome_install');
  logHelpLine(t, logger, 'cli.help_genome_list');
  logHelpLine(t, logger, 'cli.help_genome_remove');
  logHelpLine(t, logger, 'cli.help_genome_install_store');
  logHelpLine(t, logger, 'cli.help_skill_publish');
  logHelpLine(t, logger, 'cli.help_squad_list');
  logHelpLine(t, logger, 'cli.help_squad_publish');
  logHelpLine(t, logger, 'cli.help_squad_install');
  logHelpLine(t, logger, 'cli.help_squad_grant');
}

function commandSupportsJson(command) {
  return JSON_SUPPORTED_COMMANDS.has(command);
}

function writeJson(payload) {
  const text = `${JSON.stringify(payload, null, 2)}\n`;
  fs.writeSync(1, text);
}

async function main() {
  const { command, args, options } = parseArgv(process.argv);
  const locale = normalizeLocale(options.locale || process.env.AIOS_LITE_LOCALE || 'en');
  const jsonMode = Boolean(options.json);
  const { t } = createTranslator(locale);
  const logger = createLogger();
  const silentLogger = createSilentLogger();

  if (command === 'help' || options.help || command === '--help' || command === '-h') {
    printHelp(t, logger);
    return;
  }

  if (command === '--version' || command === '-v' || command === 'version' || options.version) {
    const result = await runInfo({ args: ['.'], options, logger, t });
    if (jsonMode) {
      writeJson(result);
    }
    return;
  }

  if (LEGACY_DASHBOARD_COMMANDS.has(command)) {
    const message = t('cli.dashboard_moved', { command });
    if (jsonMode) {
      writeJson({
        ok: false,
        error: {
          code: 'dashboard_moved',
          message,
          command
        }
      });
    } else {
      logger.error(t('cli.dashboard_moved_line', { message }));
    }
    process.exitCode = 1;
    return;
  }

  try {
    let result = null;
    const commandLogger =
      jsonMode && commandSupportsJson(command) ? silentLogger : logger;

    if (command === 'init') {
      result = await runInit({ args, options, logger: commandLogger, t });
    } else if (command === 'install') {
      result = await runInstall({ args, options, logger: commandLogger, t });
    } else if (command === 'setup') {
      result = await runSetup({ args, options, logger: commandLogger, t });
    } else if (command === 'install') {
      result = await runInstall({ args, options, logger: commandLogger, t });
    } else if (command === 'update') {
      result = await runUpdate({ args, options, logger: commandLogger, t });
    } else if (command === 'info') {
      result = await runInfo({ args, options, logger: commandLogger, t });
    } else if (command === 'doctor') {
      result = await runDoctorCommand({ args, options, logger: commandLogger, t });
    } else if (command === 'i18n:add' || command === 'i18n-add') {
      result = await runI18nAdd({ args, options, logger: commandLogger, t });
    } else if (command === 'agents') {
      result = await runAgentsList({ args, options, logger: commandLogger, t });
    } else if (
      command === 'agent:prompt' ||
      command === 'agent-prompt' ||
      command === 'agent:invoke' ||
      command === 'agent-invoke'
    ) {
      result = await runAgentPrompt({ args, options, logger: commandLogger, t });
    } else if (command === 'context:validate' || command === 'context-validate') {
      result = await runContextValidate({ args, options, logger: commandLogger, t });
    } else if (command === 'context:pack' || command === 'context-pack') {
      result = await runContextPack({ args, options, logger: commandLogger, t });
    } else if (command === 'setup:context' || command === 'setup-context') {
      result = await runSetupContext({ args, options, logger: commandLogger, t });
    } else if (command === 'locale:apply' || command === 'locale-apply') {
      result = await runLocaleApply({ args, options, logger: commandLogger, t });
    } else if (command === 'locale:diff' || command === 'locale-diff') {
      result = await runLocaleDiff({ args, options, logger: commandLogger, t });
    } else if (command === 'test:agents' || command === 'test-agents') {
      result = await runTestAgents({ args, options, logger: commandLogger, t });
    } else if (command === 'test:smoke' || command === 'test-smoke') {
      result = await runSmokeTest({ args, options, logger: commandLogger, t });
    } else if (command === 'test:package' || command === 'test-package') {
      result = await runPackageTest({ args, options, logger: commandLogger, t });
    } else if (command === 'workflow:plan' || command === 'workflow-plan') {
      result = await runWorkflowPlan({ args, options, logger: commandLogger, t });
    } else if (
      command === 'workflow:next' ||
      command === 'workflow-next' ||
      command === 'agent:next' ||
      command === 'agent-next'
    ) {
      if (options.status || options.suggest) {
        result = await runWorkflowStatus({ args, options, logger: commandLogger, t });
      } else {
        result = await runWorkflowNext({ args, options, logger: commandLogger, t });
      }
    } else if (
      command === 'workflow:status' ||
      command === 'workflow-status'
    ) {
      result = await runWorkflowStatus({ args, options, logger: commandLogger, t });
    } else if (
      command === 'workflow:heal' ||
      command === 'workflow-heal'
    ) {
      result = await runWorkflowHeal({ args, options, logger: commandLogger, t });
    } else if (
      command === 'workflow:harden' ||
      command === 'workflow-harden'
    ) {
      result = await runWorkflowHarden({ args, options, logger: commandLogger, t });
    } else if (
      command === 'parallel:init' ||
      command === 'parallel-init' ||
      command === 'orchestrator:init' ||
      command === 'orchestrator-init'
    ) {
      result = await runParallelInit({ args, options, logger: commandLogger, t });
    } else if (
      command === 'parallel:doctor' ||
      command === 'parallel-doctor' ||
      command === 'orchestrator:doctor' ||
      command === 'orchestrator-doctor'
    ) {
      result = await runParallelDoctor({ args, options, logger: commandLogger, t });
    } else if (
      command === 'parallel:assign' ||
      command === 'parallel-assign' ||
      command === 'orchestrator:assign' ||
      command === 'orchestrator-assign'
    ) {
      result = await runParallelAssign({ args, options, logger: commandLogger, t });
    } else if (
      command === 'parallel:status' ||
      command === 'parallel-status' ||
      command === 'orchestrator:status' ||
      command === 'orchestrator-status'
    ) {
      result = await runParallelStatus({ args, options, logger: commandLogger, t });
    } else if (
      command === 'parallel:merge' ||
      command === 'parallel-merge' ||
      command === 'orchestrator:merge' ||
      command === 'orchestrator-merge'
    ) {
      result = await runParallelMerge({ args, options, logger: commandLogger, t });
    } else if (
      command === 'parallel:guard' ||
      command === 'parallel-guard' ||
      command === 'orchestrator:guard' ||
      command === 'orchestrator-guard'
    ) {
      result = await runParallelGuard({ args, options, logger: commandLogger, t });
    } else if (command === 'mcp:init' || command === 'mcp-init') {
      result = await runMcpInit({ args, options, logger: commandLogger, t });
    } else if (command === 'mcp:doctor' || command === 'mcp-doctor') {
      result = await runMcpDoctor({ args, options, logger: commandLogger, t });
    } else if (command === 'qa:doctor' || command === 'qa-doctor') {
      result = await runQaDoctor({ args, options, logger: commandLogger, t });
    } else if (command === 'qa:init' || command === 'qa-init') {
      result = await runQaInit({ args, options, logger: commandLogger, t });
    } else if (command === 'qa:run' || command === 'qa-run') {
      result = await runQaRun({ args, options, logger: commandLogger, t });
    } else if (command === 'qa:scan' || command === 'qa-scan') {
      result = await runQaScan({ args, options, logger: commandLogger, t });
    } else if (command === 'qa:report' || command === 'qa-report') {
      result = await runQaReport({ args, options, logger: commandLogger, t });
    } else if (command === 'web:map' || command === 'web-map') {
      result = await runWebMap({ args, options, logger: commandLogger, t });
    } else if (command === 'web:scrape' || command === 'web-scrape') {
      result = await runWebScrape({ args, options, logger: commandLogger, t });
    } else if (command === 'scan:project' || command === 'scan-project') {
      result = await runScanProject({ args, options, logger: commandLogger, t });
    } else if (command === 'security:scan' || command === 'security-scan') {
      result = await runSecurityScan({ args, options, logger: commandLogger, t });
    } else if (command === 'security:audit' || command === 'security-audit') {
      result = await runSecurityAudit({ args, options, logger: commandLogger, t });
    } else if (command === 'config') {
      result = await runConfig({ args, options, logger: commandLogger, t });
    } else if (command === 'genome:doctor' || command === 'genome-doctor') {
      result = await runGenomeDoctor({ args, options, logger: commandLogger, t });
    } else if (command === 'genome:migrate' || command === 'genome-migrate') {
      result = await runGenomeMigrate({ args, options, logger: commandLogger, t });
    } else if (command === 'squad:status' || command === 'squad-status') {
      result = await runSquadStatus({ args, options, logger: commandLogger, t });
    } else if (command === 'squad:doctor' || command === 'squad-doctor') {
      result = await runSquadDoctor({ args, options, logger: commandLogger, t });
    } else if (command === 'squad:repair-genomes' || command === 'squad-repair-genomes') {
      result = await runSquadRepairGenomes({ args, options, logger: commandLogger, t });
    } else if (command === 'squad:validate' || command === 'squad-validate') {
      result = await runSquadValidate({ args, options, logger: commandLogger, t });
    } else if (command === 'squad:export' || command === 'squad-export') {
      result = await runSquadExport({ args, options, logger: commandLogger, t });
    } else if (command === 'squad:pipeline' || command === 'squad-pipeline') {
      result = await runSquadPipeline({ args, options, logger: commandLogger, t });
    } else if (command === 'squad:agent-create' || command === 'squad-agent-create') {
      result = await runSquadAgentCreate({ args, options, logger: commandLogger, t });
    } else if (command === 'squad:investigate' || command === 'squad-investigate') {
      result = await runSquadInvestigate({ args, options, logger: commandLogger, t });
    } else if (command === 'squad:dashboard' || command === 'squad-dashboard') {
      result = await runSquadDashboard({ args, options, logger: commandLogger, t });
    } else if (command === 'squad:worker' || command === 'squad-worker') {
      const sub = options.sub || 'list';
      result = await runSquadWorker({ args, options: { ...options, sub }, logger: commandLogger, t });
    } else if (command === 'squad:daemon' || command === 'squad-daemon') {
      const sub = options.sub || 'status';
      result = await runSquadDaemon({ args, options: { ...options, sub }, logger: commandLogger, t });
    } else if (command === 'squad:mcp:call') {
      result = await runSquadMcp({ args, options: { ...options, sub: 'call' }, logger: commandLogger, t });
    } else if (command === 'squad:mcp' || command === 'squad-mcp') {
      const sub = options.sub || 'status';
      result = await runSquadMcp({ args, options: { ...options, sub }, logger: commandLogger, t });
    } else if (command === 'squad:roi' || command === 'squad-roi') {
      const sub = options.sub || 'report';
      result = await runSquadRoi({ args, options: { ...options, sub }, logger: commandLogger, t });
    } else if (command === 'squad:score' || command === 'squad-score') {
      result = await runSquadScore({ args, options, logger: commandLogger, translator: t });
    } else if (command === 'squad:processes' || command === 'squad-processes') {
      result = await runSquadProcesses({ args, options, logger: commandLogger, t });
    } else if (command === 'squad:worktrees' || command === 'squad-worktrees') {
      result = await runSquadWorktrees({ args, options, logger: commandLogger, t });
    } else if (command === 'squad:merge' || command === 'squad-merge') {
      result = await runSquadMerge({ args, options, logger: commandLogger, t });
    } else if (command === 'squad:recovery' || command === 'squad-recovery') {
      result = await runSquadRecovery({ args, options, logger: commandLogger, t });
    } else if (command === 'squad:deploy' || command === 'squad-deploy') {
      result = await runSquadDeploy({ args, options, logger: commandLogger, t });
    } else if (command === 'squad:webhook' || command === 'squad-webhook') {
      const sub = options.sub || 'start';
      result = await runSquadWebhook({ args, options: { ...options, sub }, logger: commandLogger, t });
    } else if (command === 'squad:plan' || command === 'squad-plan') {
      result = await runSquadPlan({ args, options, logger: commandLogger, t });
    } else if (command === 'squad:bus' || command === 'squad-bus') {
      const sub = args[1] || options.sub || 'read';
      result = await runSquadBus({ args, options: { ...options, sub }, logger: commandLogger });
    } else if (command === 'squad:autorun' || command === 'squad-autorun') {
      result = await runSquadAutorun({ args, options, logger: commandLogger });
    } else if (command === 'squad:dependency-graph' || command === 'squad-dependency-graph') {
      result = await runSquadDependencyGraph({ args, options, logger: commandLogger });
    } else if (command === 'squad:tool:register' || command === 'squad-tool-register') {
      result = await runSquadToolRegister({ args, options, logger: commandLogger });
    } else if (command === 'squad:review' || command === 'squad-review') {
      result = await runSquadReview({ args, options, logger: commandLogger });
    } else if (command === 'agent:audit' || command === 'agent-audit') {
      result = await runAgentAudit({ args, options, logger: commandLogger });
    } else if (command === 'brief:gen' || command === 'brief-gen') {
      result = await runBriefGen({ args, options, logger: commandLogger, t });
    } else if (command === 'harness:init' || command === 'harness-init') {
      result = await runHarnessInit({ args, options, logger: commandLogger, t });
    } else if (command === 'harness:validate' || command === 'harness-validate') {
      result = await runHarnessValidate({ args, options, logger: commandLogger, t });
    } else if (command === 'harness:apply-validation' || command === 'harness-apply-validation') {
      result = await runHarnessApplyValidation({ args, options, logger: commandLogger, t });
    } else if (command === 'verify:gate' || command === 'verify-gate') {
      result = await runVerifyGate({ args, options, logger: commandLogger, t });

    } else if (command === 'brief:validate' || command === 'brief-validate') {
      result = await runBriefValidate({ args, options, logger: commandLogger });
    } else if (command === 'preflight:context' || command === 'preflight-context') {
      result = await runPreflightContext({ args, options, logger: commandLogger });
    } else if (command === 'context:compact' || command === 'context-compact') {
      result = await runContextCompact({ args, options, logger: commandLogger });
    } else if (command === 'squad:scaffold' || command === 'squad-scaffold') {
      result = await runSquadScaffold({ args, options, logger: commandLogger });
    } else if (command === 'pattern:detect' || command === 'pattern-detect') {
      result = await runPatternDetect({ args, options, logger: commandLogger });
    } else if (command === 'self:loop' || command === 'self-loop') {
      result = await runSelfLoop({ args, options, logger: commandLogger });
    } else if (command === 'squad:card' || command === 'squad-card') {
      result = await runSquadCard({ args, options, logger: commandLogger });
    } else if (command === 'git:guard' || command === 'git-guard') {
      result = await runGitGuard({ args, options, logger: commandLogger });
    } else if (command === 'commit:prepare' || command === 'commit-prepare') {
      result = await runCommitPrepare({ args, options, logger: commandLogger });
    } else if (command === 'agent:export-skill' || command === 'agent-export-skill') {
      result = await runAgentExportSkill({ args, options, logger: commandLogger });
    } else if (command === 'squad:learning' || command === 'squad-learning') {
      const sub = args[1] || 'list';
      result = await runSquadLearning({ args, options: { ...options, sub }, logger: commandLogger, t });
    } else if (command === 'learning:evolve' || command === 'learning-evolve') {
      result = await runLearningEvolve({ args, options, logger: commandLogger, t });
    } else if (command === 'learning:rollback' || command === 'learning-rollback') {
      result = await runLearningRollback({ args, options, logger: commandLogger });
    } else if (command === 'learning:apply' || command === 'learning-apply') {
      result = await runLearningApply({ args, options, logger: commandLogger, t });
    } else if (command === 'learning:export' || command === 'learning-export') {
      result = await runLearningExport({ args, options, logger: commandLogger });
    } else if (command === 'spec:sync' || command === 'spec-sync') {
      result = await runSpecSync({ args, options, logger: commandLogger });
    } else if (command === 'spec:status' || command === 'spec-status') {
      result = await runSpecStatus({ args, options, logger: commandLogger });
    } else if (command === 'spec:checkpoint' || command === 'spec-checkpoint') {
      result = await runSpecCheckpoint({ args, options, logger: commandLogger });
    } else if (command === 'spec:tasks' || command === 'spec-tasks') {
      result = await runSpecTasks({ args, options, logger: commandLogger });
    } else if (command.startsWith('learning:') || command === 'learning') {
      const sub = command === 'learning' ? (args[1] || 'list') : command.split(':')[1];
      result = await runLearning({ args, options: { ...options, sub }, logger: commandLogger, t });
    } else if (command.startsWith('plan:') || command === 'plan') {
      const sub = command === 'plan' ? (args[1] || 'show') : command.split(':')[1];
      result = await runImplementationPlan({ args, options: { ...options, sub }, logger: commandLogger, t });
    } else if (command === 'runtime:init' || command === 'runtime-init') {
      result = await runRuntimeInit({ args, options, logger: commandLogger, t });
    } else if (command === 'runtime:ingest' || command === 'runtime-ingest') {
      result = await runRuntimeIngest({ args, options, logger: commandLogger, t });
    } else if (command === 'runtime:task:start' || command === 'runtime-task-start') {
      result = await runRuntimeTaskStart({ args, options, logger: commandLogger, t });
    } else if (command === 'runtime:start' || command === 'runtime-start') {
      result = await runRuntimeStart({ args, options, logger: commandLogger, t });
    } else if (command === 'runtime:update' || command === 'runtime-update') {
      result = await runRuntimeUpdate({ args, options, logger: commandLogger, t });
    } else if (command === 'runtime:task:finish' || command === 'runtime-task-finish') {
      result = await runRuntimeTaskFinish({ args, options, logger: commandLogger, t });
    } else if (command === 'runtime:finish' || command === 'runtime-finish') {
      result = await runRuntimeFinish({ args, options, logger: commandLogger, t });
    } else if (command === 'runtime:task:fail' || command === 'runtime-task-fail') {
      result = await runRuntimeTaskFail({ args, options, logger: commandLogger, t });
    } else if (command === 'runtime:fail' || command === 'runtime-fail') {
      result = await runRuntimeFail({ args, options, logger: commandLogger, t });
    } else if (command === 'runtime:status' || command === 'runtime-status') {
      result = await runRuntimeStatus({ args, options, logger: commandLogger, t });
    } else if (command === 'runtime:log' || command === 'runtime-log') {
      result = await runRuntimeLog({ args, options, logger: commandLogger, t });
    } else if (command === 'agent:done' || command === 'agent-done') {
      result = await runAgentDone({ args, options, logger: commandLogger, t });
    } else if (command === 'agent:recover' || command === 'agent-recover') {
      result = await runAgentRecover({ args, options, logger: commandLogger, t });
    } else if (command === 'runtime:session:start' || command === 'runtime-session-start') {
      result = await runRuntimeSessionStart({ args, options, logger: commandLogger, t });
    } else if (command === 'runtime:session:log' || command === 'runtime-session-log') {
      result = await runRuntimeSessionLog({ args, options, logger: commandLogger, t });
    } else if (command === 'runtime:session:finish' || command === 'runtime-session-finish') {
      result = await runRuntimeSessionFinish({ args, options, logger: commandLogger, t });
    } else if (command === 'runtime:session:status' || command === 'runtime-session-status') {
      result = await runRuntimeSessionStatus({ args, options, logger: commandLogger, t });
    } else if (command === 'runtime:emit' || command === 'runtime-emit') {
      result = await runRuntimeEmit({ args, options, logger: commandLogger, t });
    } else if (command === 'live:start' || command === 'live-start') {
      result = await runLiveStart({ args, options, logger: commandLogger, t });
    } else if (command === 'live:status' || command === 'live-status') {
      result = await runLiveStatus({ args, options, logger: commandLogger, t });
    } else if (command === 'live:handoff' || command === 'live-handoff') {
      result = await runLiveHandoff({ args, options, logger: commandLogger, t });
    } else if (command === 'live:close' || command === 'live-close') {
      result = await runLiveClose({ args, options, logger: commandLogger, t });
    } else if (command === 'live:list' || command === 'live-list') {
      result = await runLiveList({ args, options, logger: commandLogger, t });
    } else if (command === 'tool:capabilities' || command === 'tool-capabilities') {
      result = await runToolCapabilities({ args, options, logger: commandLogger, t });
    } else if (command === 'scaffold:complete' || command === 'scaffold-complete') {
      result = await runScaffoldComplete({ args, options, logger: commandLogger, t });
    } else if (command === 'deliver') {
      result = await runDeliver({ args, options, logger: commandLogger, t });
    } else if (command === 'output-strategy:export') {
      result = await runOutputStrategyExport({ args, options, logger: commandLogger, t });
    } else if (command === 'output-strategy:import') {
      result = await runOutputStrategyImport({ args, options, logger: commandLogger, t });
    } else if (command === 'devlog:sync' || command === 'devlog-sync') {
      result = await runDevlogSync({ args, options, logger: commandLogger, t });
    } else if (command === 'hooks:emit' || command === 'hooks-emit') {
      result = await runHooksEmit({ args, options, logger: commandLogger });
    } else if (command === 'hooks:install' || command === 'hooks-install') {
      result = await runHooksInstall({ args, options, logger: commandLogger });
    } else if (command === 'hooks:uninstall' || command === 'hooks-uninstall') {
      result = await runHooksUninstall({ args, options, logger: commandLogger });
    } else if (command === 'session:guard' || command === 'session-guard') {
      result = await runSessionGuard({ args, options, logger: commandLogger });
    } else if (command === 'devlog:process' || command === 'devlog-process') {
      result = await runDevlogProcess({ args, options, logger: commandLogger });
    } else if (command === 'devlog:watch' || command === 'devlog-watch') {
      result = await runDevlogWatch({ args, options, logger: commandLogger });
    } else if (command === 'devlog:export-brains' || command === 'devlog-export-brains') {
      result = await runDevlogExportBrains({ args, options, logger: commandLogger });
    } else if (command === 'brain:query' || command === 'brain-query') {
      result = await runBrainQuery({ args, options, logger: commandLogger });
    } else if (command === 'memory:status' || command === 'memory-status') {
      result = await runMemoryStatus({ args, options, logger: commandLogger });
    } else if (command === 'memory:summary' || command === 'memory-summary') {
      result = await runMemorySummary({ args, options, logger: commandLogger });
    } else if (command === 'runtime:prune' || command === 'runtime-prune') {
      result = await runRuntimePrune({ args, options, logger: commandLogger, t });
    } else if (command === 'runtime:backup' || command === 'runtime-backup') {
      result = await runRuntimeBackup({ args, options, logger: commandLogger, t });
    } else if (command === 'runtime:restore' || command === 'runtime-restore') {
      result = await runRuntimeRestore({ args, options, logger: commandLogger, t });
    } else if (command === 'backup:local' || command === 'backup-local') {
      result = await runBackupLocal({ args, options, logger: commandLogger, t });
    } else if (command === 'skill:install' || command === 'skill-install') {
      if (options.from === 'store') {
        result = await runSkillInstallStore({ args, options, logger: commandLogger, t });
      } else {
        result = await runSkillInstall({ args, options, logger: commandLogger, t });
      }
    } else if (command === 'skill:install:store' || command === 'skill-install-store') {
      result = await runSkillInstallStore({ args, options, logger: commandLogger, t });
    } else if (command === 'skill:list' || command === 'skill-list') {
      if (options.remote) {
        result = await runSkillListRemote({ args, options, logger: commandLogger, t });
      } else {
        result = await runSkillList({ args, options, logger: commandLogger, t });
      }
    } else if (command === 'skill:remove' || command === 'skill-remove') {
      result = await runSkillRemove({ args, options, logger: commandLogger, t });
    } else if (command === 'design-hybrid:options' || command === 'design-hybrid-options') {
      result = await runDesignHybridOptions({ args, options, logger: commandLogger, t });
    } else if (command === 'cloud:import:squad' || command === 'cloud-import-squad') {
      result = await runCloudImportSquad({ args, options, logger: commandLogger, t });
    } else if (command === 'cloud:import:genome' || command === 'cloud-import-genome') {
      result = await runCloudImportGenome({ args, options, logger: commandLogger, t });
    } else if (command === 'cloud:publish:squad' || command === 'cloud-publish-squad') {
      result = await runCloudPublishSquad({ args, options, logger: commandLogger, t });
    } else if (command === 'cloud:publish:genome' || command === 'cloud-publish-genome') {
      result = await runCloudPublishGenome({ args, options, logger: commandLogger, t });
    } else if (command === 'recovery:generate' || command === 'recovery-generate') {
      result = await runRecoveryGenerate({ args, options, logger: commandLogger, t });
    } else if (command === 'recovery:show' || command === 'recovery-show') {
      result = await runRecoveryShow({ args, options, logger: commandLogger, t });
    } else if (command === 'context:monitor' || command === 'context-monitor') {
      result = await runContextMonitor({ args, options, logger: commandLogger, t });
    } else if (command === 'context:health' || command === 'context-health') {
      result = await runContextHealth({ args, options, logger: commandLogger });
    } else if (command === 'context:trim' || command === 'context-trim') {
      result = await runContextTrim({ args, options, logger: commandLogger });
    } else if (command === 'context:search' || command === 'context-search') {
      result = await runContextSearch({ args, options, logger: commandLogger, t });
    } else if (command === 'context:search:index' || command === 'context-search-index') {
      result = await runContextSearchIndex({ args, options, logger: commandLogger, t });
    } else if (command === 'context:cache' || command === 'context-cache') {
      result = await runContextCacheList({ args, options, logger: commandLogger, t });
    } else if (command === 'context:cache:save' || command === 'context-cache-save') {
      result = await runContextCacheSave({ args, options, logger: commandLogger, t });
    } else if (command === 'context:cache:restore' || command === 'context-cache-restore') {
      result = await runContextCacheRestore({ args, options, logger: commandLogger, t });
    } else if (command === 'context:cache:cleanup' || command === 'context-cache-cleanup') {
      result = await runContextCacheCleanup({ args, options, logger: commandLogger, t });
    } else if (command === 'sandbox:exec' || command === 'sandbox-exec') {
      result = await runSandboxExec({ args, options, logger: commandLogger, t });
    } else if (command === 'agent:load' || command === 'agent-load') {
      result = await runAgentLoad({ args, options, logger: commandLogger, t });
    } else if (command === 'agent:shard:index' || command === 'agent-shard-index') {
      result = await runAgentShardIndex({ args, options, logger: commandLogger, t });
    } else if (command.startsWith('tool:') || command.startsWith('tool-')) {
      const sub = command.replace(/^tool[:-]/, '');
      result = await runToolRegistry({ args, options: { ...options, sub }, logger: commandLogger, t });
    } else if (command === 'health') {
      result = await runHealth({ args, options, logger: commandLogger, t });
    } else if (command === 'runner:run' || command === 'runner-run') {
      result = await runRunnerRun({ args, options, logger: commandLogger });
    } else if (command === 'runner:queue' || command === 'runner-queue') {
      const sub = args[1] || options.sub || 'list';
      result = await runRunnerQueue({ args, options: { ...options, sub }, logger: commandLogger });
    } else if (command === 'runner:plan' || command === 'runner-plan') {
      result = await runRunnerPlan({ args, options, logger: commandLogger });
    } else if (command === 'runner:daemon' || command === 'runner-daemon') {
      const sub = args[1] || options.sub || 'status';
      result = await runRunnerDaemon({ args, options: { ...options, sub }, logger: commandLogger });
    } else if (command === 'preflight') {
      result = await runPreflight({ args, options, logger: commandLogger });
    } else if (command === 'classify') {
      result = await runClassify({ args, options, logger: commandLogger });
    } else if (command === 'sizing') {
      result = await runSizing({ args, options, logger: commandLogger });
    } else if (command === 'detect:test-runner' || command === 'detect-test-runner') {
      result = await runDetectTestRunner({ args, options, logger: commandLogger });
    } else if (command === 'pulse:update' || command === 'pulse-update') {
      result = await runPulseUpdate({ args, options, logger: commandLogger });
    } else if (command === 'state:save' || command === 'state-save') {
      result = await runStateSave({ args, options, logger: commandLogger });
    } else if (command === 'feature:close' || command === 'feature-close') {
      result = await runFeatureClose({ args, options, logger: commandLogger });
    } else if (command === 'feature:archive' || command === 'feature-archive') {
      result = await runFeatureArchive({ args, options, logger: commandLogger });
    } else if (command === 'dossier:init' || command === 'dossier-init') {
      result = await runDossierInit({ args, options, logger: commandLogger });
    } else if (command === 'dossier:show' || command === 'dossier-show') {
      result = await runDossierShow({ args, options, logger: commandLogger });
    } else if (command === 'dossier:add-finding' || command === 'dossier-add-finding') {
      result = await runDossierAddFinding({ args, options, logger: commandLogger });
    } else if (command === 'dossier:add-codemap' || command === 'dossier-add-codemap') {
      result = await runDossierAddCodemap({ args, options, logger: commandLogger });
    } else if (command === 'dossier:link-rule' || command === 'dossier-link-rule') {
      result = await runDossierLinkRule({ args, options, logger: commandLogger });
    } else if (command === 'dossier:add-research' || command === 'dossier-add-research') {
      result = await runDossierAddResearch({ args, options, logger: commandLogger });
    } else if (command === 'dossier:audit' || command === 'dossier-audit') {
      result = await runDossierAudit({ args, options, logger: commandLogger });
    } else if (command === 'dossier:compact' || command === 'dossier-compact') {
      result = await runDossierCompact({ args, options, logger: commandLogger });
    } else if (command === 'dev:resume-data' || command === 'dev-resume-data') {
      result = await runDevResumeData({ args, options, logger: commandLogger });
    } else if (command === 'revision:open' || command === 'revision-open') {
      result = await runRevisionOpen({ args, options, logger: commandLogger });
    } else if (command === 'revision:list' || command === 'revision-list') {
      result = await runRevisionList({ args, options, logger: commandLogger });
    } else if (command === 'revision:resolve' || command === 'revision-resolve') {
      result = await runRevisionResolve({ args, options, logger: commandLogger });
    } else if (command === 'gate:check' || command === 'gate-check') {
      result = await runGateCheck({ args, options, logger: commandLogger });
    } else if (command === 'gate:approve' || command === 'gate-approve') {
      result = await runGateApprove({ args, options, logger: commandLogger });
    } else if (command === 'artifact:validate' || command === 'artifact-validate') {
      result = await runArtifactValidate({ args, options, logger: commandLogger });
    } else if (command === 'workflow:execute' || command === 'workflow-execute') {
      result = await runWorkflowExecute({ args, options, logger: commandLogger });
    } else if (command === 'runner:queue:from-plan' || command === 'runner-queue-from-plan') {
      result = await runRunnerQueueFromPlan({ args, options, logger: commandLogger });
    } else if (command === 'learning:auto-promote' || command === 'learning-auto-promote') {
      result = await runLearningAutoPromote({ args, options, logger: commandLogger });
    } else if (command === 'auth:login' || command === 'auth-login') {
      result = await runAuthLogin({ args, options, logger: commandLogger, t });
    } else if (command === 'auth:logout' || command === 'auth-logout') {
      result = await runAuthLogout({ args, options, logger: commandLogger, t });
    } else if (command === 'auth:status' || command === 'auth-status') {
      result = await runAuthStatus({ args, options, logger: commandLogger, t });
    } else if (command === 'workspace:init' || command === 'workspace-init') {
      result = await runWorkspaceInit({ args, options, logger: commandLogger, t });
    } else if (command === 'workspace:status' || command === 'workspace-status') {
      result = await runWorkspaceStatus({ args, options, logger: commandLogger, t });
    } else if (command === 'workspace:open' || command === 'workspace-open') {
      result = await runWorkspaceOpen({ args, options, logger: commandLogger, t });
    } else if (command === 'genome:publish' || command === 'genome-publish') {
      result = await runGenomePublish({ args, options, logger: commandLogger, t });
    } else if (command === 'genome:install' || command === 'genome-install') {
      result = await runGenomeInstall({ args, options, logger: commandLogger, t });
    } else if (command === 'genome:install:store' || command === 'genome-install-store') {
      result = await runGenomeInstallStore({ args, options, logger: commandLogger, t });
    } else if (command === 'genome:list' || command === 'genome-list') {
      result = await runGenomeList({ args, options, logger: commandLogger, t });
    } else if (command === 'genome:remove' || command === 'genome-remove') {
      result = await runGenomeRemove({ args, options, logger: commandLogger, t });
    } else if (command === 'compress:agents' || command === 'compress-agents') {
      result = await runCompressAgents({ args, options, logger: commandLogger });
    } else if (command === 'skill:publish' || command === 'skill-publish') {
      result = await runSkillPublish({ args, options, logger: commandLogger, t });
    } else if (command === 'squad:list' || command === 'squad-list') {
      result = await runSquadList({ args, options, logger: commandLogger, t });
    } else if (command === 'squad:publish' || command === 'squad-publish') {
      result = await runSquadPublish({ args, options, logger: commandLogger, t });
    } else if (command === 'squad:install' || command === 'squad-install') {
      result = await runSquadInstall({ args, options, logger: commandLogger, t });
    } else if (command === 'squad:grant' || command === 'squad-grant') {
      result = await runSquadGrant({ args, options, logger: commandLogger, t });
    } else if (command === 'system:package' || command === 'system-package') {
      result = await runSystemPackage({ args, options, logger: commandLogger, t });
    } else if (command === 'system:publish' || command === 'system-publish') {
      result = await runSystemPublish({ args, options, logger: commandLogger, t });
    } else if (command === 'system:list' || command === 'system-list') {
      result = await runSystemList({ args, options, logger: commandLogger, t });
    } else if (command === 'system:install' || command === 'system-install') {
      result = await runSystemInstall({ args, options, logger: commandLogger, t });
    } else if (command === 'briefing:approve' || command === 'briefing-approve') {
      result = await runBriefingApprove({ args, options, logger: commandLogger });
    } else if (command === 'briefing:unapprove' || command === 'briefing-unapprove') {
      result = await runBriefingUnapprove({ args, options, logger: commandLogger });
    } else {
      const message = t('cli.unknown_command', { command });
      if (jsonMode) {
        writeJson({
          ok: false,
          error: {
            code: 'unknown_command',
            message,
            command
          }
        });
      } else {
        logger.error(t('cli.unknown_command_line', { message }));
        printHelp(t, logger);
      }
      process.exitCode = 1;
      return;
    }

    if (jsonMode && commandSupportsJson(command)) {
      writeJson(result || { ok: true });
      if (result && typeof result.exitCode === 'number') {
        process.exitCode = result.exitCode;
      } else if (result && Object.prototype.hasOwnProperty.call(result, 'ok') && !result.ok) {
        process.exitCode = 1;
      }
    }
  } catch (error) {
    if (jsonMode) {
      writeJson({
        ok: false,
        error: {
          code: 'command_error',
          message: error.message,
          command
        }
      });
    } else {
      logger.error(t('cli.error_prefix', { message: error.message }));
    }
    process.exitCode = 1;
  }
}

main();
