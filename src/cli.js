'use strict';

const { writeThrough } = require('./lib/console-write');
const { parseArgv } = require('./parser');
const { createTranslator, normalizeLocale } = require('./i18n');

// A command module loads on its first call: one CLI invocation — and every
// hook event — pays for the command it runs, not for all of them up front.
// Each loader destructures the names it binds right at the require, so static
// analysis still sees which exports of the module are in use: a bare
// `() => require(x)` reads as "every export used" and hides the dead ones.
function lazy(load) {
  let mod = null;
  const get = () => (mod ||= load());
  return new Proxy({}, { get: (_, name) => (...args) => get()[name](...args) });
}
const { runInit } = lazy(() => { const { runInit } = require('./commands/init'); return { runInit }; });
const { runInstall } = lazy(() => { const { runInstall } = require('./commands/install'); return { runInstall }; });
const { runSetup } = lazy(() => { const { runSetup } = require('./commands/setup'); return { runSetup }; });
const { runUpdate } = lazy(() => { const { runUpdate } = require('./commands/update'); return { runUpdate }; });
const { runInfo } = lazy(() => { const { runInfo } = require('./commands/info'); return { runInfo }; });
const { runDoctorCommand } = lazy(() => { const { runDoctorCommand } = require('./commands/doctor'); return { runDoctorCommand }; });
const { runI18nAdd } = lazy(() => { const { runI18nAdd } = require('./commands/i18n-add'); return { runI18nAdd }; });
const { runAgentsList, runAgentPrompt } = lazy(() => { const { runAgentsList, runAgentPrompt } = require('./commands/agents'); return { runAgentsList, runAgentPrompt }; });
const { runContextValidate } = lazy(() => { const { runContextValidate } = require('./commands/context-validate'); return { runContextValidate }; });
const { runContextPack } = lazy(() => { const { runContextPack } = require('./commands/context-pack'); return { runContextPack }; });
const { runContextSelect } = lazy(() => { const { runContextSelect } = require('./commands/context-select'); return { runContextSelect }; });
const { runContextBrief } = lazy(() => { const { runContextBrief } = require('./commands/context-brief'); return { runContextBrief }; });
const { runRulesLint } = lazy(() => { const { runRulesLint } = require('./commands/rules-lint'); return { runRulesLint }; });
const { runContextEvalsCommand } = lazy(() => { const { runContextEvalsCommand } = require('./commands/context-evals'); return { runContextEvalsCommand }; });
const { runContextUsageCommand } = lazy(() => { const { runContextUsageCommand } = require('./commands/context-usage'); return { runContextUsageCommand }; });
const { runContextLoad } = lazy(() => { const { runContextLoad } = require('./commands/context-load'); return { runContextLoad }; });
const { runChainAudit } = lazy(() => { const { runChainAudit } = require('./commands/chain-audit'); return { runChainAudit }; });
const {
  runChainClaim,
  runChainList,
  runChainReconcile,
  runChainRelease,
  runChainResolve
} = lazy(() => { const { runChainClaim, runChainList, runChainReconcile, runChainRelease, runChainResolve } = require('./commands/chain-work'); return { runChainClaim, runChainList, runChainReconcile, runChainRelease, runChainResolve }; });
const { runMemorySearch } = lazy(() => { const { runMemorySearch } = require('./commands/memory-search'); return { runMemorySearch }; });
const { runMemoryArchive } = lazy(() => { const { runMemoryArchive } = require('./commands/memory-archive'); return { runMemoryArchive }; });
const { runMemoryRestore } = lazy(() => { const { runMemoryRestore } = require('./commands/memory-restore'); return { runMemoryRestore }; });
const { runMemoryTrim } = lazy(() => { const { runMemoryTrim } = require('./commands/memory-trim'); return { runMemoryTrim }; });
const { runSetupContext } = lazy(() => { const { runSetupContext } = require('./commands/setup-context'); return { runSetupContext }; });
const { runLocaleApply } = lazy(() => { const { runLocaleApply } = require('./commands/locale-apply'); return { runLocaleApply }; });
const { runSmokeTest } = lazy(() => { const { runSmokeTest } = require('./commands/smoke'); return { runSmokeTest }; });
const { runMcpInit } = lazy(() => { const { runMcpInit } = require('./commands/mcp-init'); return { runMcpInit }; });
const { runScoutPrep } = lazy(() => { const { runScoutPrep } = require('./commands/scout-prep'); return { runScoutPrep }; });
const { runScoutValidate } = lazy(() => { const { runScoutValidate } = require('./commands/scout-validate'); return { runScoutValidate }; });
const { runScoutCommit } = lazy(() => { const { runScoutCommit } = require('./commands/scout-commit'); return { runScoutCommit }; });
const { runMcpDoctor } = lazy(() => { const { runMcpDoctor } = require('./commands/mcp-doctor'); return { runMcpDoctor }; });
const { runPackageTest } = lazy(() => { const { runPackageTest } = require('./commands/package-e2e'); return { runPackageTest }; });
const { runWorkflowPlan } = lazy(() => { const { runWorkflowPlan } = require('./commands/workflow-plan'); return { runWorkflowPlan }; });
const { runWorkflowNext } = lazy(() => { const { runWorkflowNext } = require('./commands/workflow-next'); return { runWorkflowNext }; });
const { runWorkflowStatus } = lazy(() => { const { runWorkflowStatus } = require('./commands/workflow-status'); return { runWorkflowStatus }; });
const { runWorkflowHeal } = lazy(() => { const { runWorkflowHeal } = require('./commands/workflow-heal'); return { runWorkflowHeal }; });
const { runWorkflowHarden } = lazy(() => { const { runWorkflowHarden } = require('./commands/workflow-harden'); return { runWorkflowHarden }; });
const { runParallelInit } = lazy(() => { const { runParallelInit } = require('./commands/parallel-init'); return { runParallelInit }; });
const { runParallelDoctor } = lazy(() => { const { runParallelDoctor } = require('./commands/parallel-doctor'); return { runParallelDoctor }; });
const { runParallelAssign } = lazy(() => { const { runParallelAssign } = require('./commands/parallel-assign'); return { runParallelAssign }; });
const { runParallelStatus } = lazy(() => { const { runParallelStatus } = require('./commands/parallel-status'); return { runParallelStatus }; });
const { runParallelMerge } = lazy(() => { const { runParallelMerge } = require('./commands/parallel-merge'); return { runParallelMerge }; });
const { runParallelGuard } = lazy(() => { const { runParallelGuard } = require('./commands/parallel-guard'); return { runParallelGuard }; });
const { runTestAgents } = lazy(() => { const { runTestAgents } = require('./commands/test-agents'); return { runTestAgents }; });
const { runLocaleDiff } = lazy(() => { const { runLocaleDiff } = require('./commands/locale-diff'); return { runLocaleDiff }; });
const { runQaDoctor } = lazy(() => { const { runQaDoctor } = require('./commands/qa-doctor'); return { runQaDoctor }; });
const { runQaInit } = lazy(() => { const { runQaInit } = require('./commands/qa-init'); return { runQaInit }; });
const { runQaRun } = lazy(() => { const { runQaRun } = require('./commands/qa-run'); return { runQaRun }; });
const { runBrowserRun, runBrowserSnapshot } = lazy(() => { const { runBrowserRun, runBrowserSnapshot } = require('./commands/browser-run'); return { runBrowserRun, runBrowserSnapshot }; });
const { runQaScan } = lazy(() => { const { runQaScan } = require('./commands/qa-scan'); return { runQaScan }; });
const { runQaReport } = lazy(() => { const { runQaReport } = require('./commands/qa-report'); return { runQaReport }; });
const { runPentesterReport, runPentesterCoverage } = lazy(() => { const { runPentesterReport, runPentesterCoverage } = require('./commands/pentester-report'); return { runPentesterReport, runPentesterCoverage }; });
const { runWebMap } = lazy(() => { const { runWebMap } = require('./commands/web-map'); return { runWebMap }; });
const { runWebScrape } = lazy(() => { const { runWebScrape } = require('./commands/web-scrape'); return { runWebScrape }; });
const { runWebSave } = lazy(() => { const { runWebSave } = require('./commands/web-save'); return { runWebSave }; });
const { runWebExtract } = lazy(() => { const { runWebExtract } = require('./commands/web-extract'); return { runWebExtract }; });
const { runWebDiscover } = lazy(() => { const { runWebDiscover } = require('./commands/web-discover'); return { runWebDiscover }; });
const { runWebCollect } = lazy(() => { const { runWebCollect } = require('./commands/web-collect'); return { runWebCollect }; });
const { runScanProject } = lazy(() => { const { runScanProject } = require('./commands/scan-project'); return { runScanProject }; });
const { runSecurityScan } = lazy(() => { const { runSecurityScan } = require('./commands/security-scan'); return { runSecurityScan }; });
const { runSecurityAudit } = lazy(() => { const { runSecurityAudit } = require('./commands/security-audit'); return { runSecurityAudit }; });
const { runReviewFeature } = lazy(() => { const { runReviewFeature } = require('./commands/review-feature'); return { runReviewFeature }; });
const { runReviewPrepare, runReviewCheck, runReviewStatus } = lazy(() => { const { runReviewPrepare, runReviewCheck, runReviewStatus } = require('./commands/review-intelligence'); return { runReviewPrepare, runReviewCheck, runReviewStatus }; });
const { runConfig } = lazy(() => { const { runConfig } = require('./commands/config'); return { runConfig }; });
const { runGenomeDoctor } = lazy(() => { const { runGenomeDoctor } = require('./commands/genome-doctor'); return { runGenomeDoctor }; });
const { runGenomeApprove } = lazy(() => { const { runGenomeApprove } = require('./commands/genome-approve'); return { runGenomeApprove }; });
const { runGenomeMigrate } = lazy(() => { const { runGenomeMigrate } = require('./commands/genome-migrate'); return { runGenomeMigrate }; });
const { runSquadStatus } = lazy(() => { const { runSquadStatus } = require('./commands/squad-status'); return { runSquadStatus }; });
const { runSquadDoctor } = lazy(() => { const { runSquadDoctor } = require('./commands/squad-doctor'); return { runSquadDoctor }; });
const { runSquadRepairGenomes } = lazy(() => { const { runSquadRepairGenomes } = require('./commands/squad-repair-genomes'); return { runSquadRepairGenomes }; });
const { runSquadValidate } = lazy(() => { const { runSquadValidate } = require('./commands/squad-validate'); return { runSquadValidate }; });
const { runSquadEval } = lazy(() => { const { runSquadEval } = require('./commands/squad-eval'); return { runSquadEval }; });
const { runSquadPilotApprove } = lazy(() => { const { runSquadPilotApprove } = require('./commands/squad-pilot-approve'); return { runSquadPilotApprove }; });
const { runSquadRoleScan } = lazy(() => { const { runSquadRoleScan } = require('./commands/squad-role-scan'); return { runSquadRoleScan }; });
const { runSquadPlaybook } = lazy(() => { const { runSquadPlaybook } = require('./commands/squad-playbook'); return { runSquadPlaybook }; });
const { runSquadExport } = lazy(() => { const { runSquadExport } = require('./commands/squad-export'); return { runSquadExport }; });
const { runSquadPipeline } = lazy(() => { const { runSquadPipeline } = require('./commands/squad-pipeline'); return { runSquadPipeline }; });
const { runSquadSession } = lazy(() => { const { runSquadSession } = require('./commands/squad-session'); return { runSquadSession }; });
const { runSquadAgentCreate } = lazy(() => { const { runSquadAgentCreate } = require('./commands/squad-agent-create'); return { runSquadAgentCreate }; });
const { runSquadInvestigate } = lazy(() => { const { runSquadInvestigate } = require('./commands/squad-investigate'); return { runSquadInvestigate }; });
const { runImplementationPlan } = lazy(() => { const { runImplementationPlan } = require('./commands/implementation-plan'); return { runImplementationPlan }; });
const { runFeatureClosure } = lazy(() => { const { runFeatureClosure } = require('./commands/feature-closure'); return { runFeatureClosure }; });
const { runSquadPlan } = lazy(() => { const { runSquadPlan } = require('./commands/squad-plan'); return { runSquadPlan }; });
const { runSquadLearning } = lazy(() => { const { runSquadLearning } = require('./commands/squad-learning'); return { runSquadLearning }; });
const { runLearning } = lazy(() => { const { runLearning } = require('./commands/learning'); return { runLearning }; });
const { runSquadDashboard } = lazy(() => { const { runSquadDashboard } = require('./commands/squad-dashboard'); return { runSquadDashboard }; });
const { runSquadWorker } = lazy(() => { const { runSquadWorker } = require('./commands/squad-worker'); return { runSquadWorker }; });
const { runSquadDaemon } = lazy(() => { const { runSquadDaemon } = require('./commands/squad-daemon'); return { runSquadDaemon }; });
const { runSquadMcp } = lazy(() => { const { runSquadMcp } = require('./commands/squad-mcp'); return { runSquadMcp }; });
const { runSquadRoi } = lazy(() => { const { runSquadRoi } = require('./commands/squad-roi'); return { runSquadRoi }; });
const { runSquadScore } = lazy(() => { const { runSquadScore } = require('./commands/squad-score'); return { runSquadScore }; });
const { runSquadProcesses } = lazy(() => { const { runSquadProcesses } = require('./commands/squad-processes'); return { runSquadProcesses }; });
const { runSquadWorktrees, runSquadMerge } = lazy(() => { const { runSquadWorktrees, runSquadMerge } = require('./commands/squad-worktrees'); return { runSquadWorktrees, runSquadMerge }; });
const { runSquadRecovery } = lazy(() => { const { runSquadRecovery } = require('./commands/squad-recovery'); return { runSquadRecovery }; });
const { runSquadDeploy } = lazy(() => { const { runSquadDeploy } = require('./commands/squad-deploy'); return { runSquadDeploy }; });
const { runSquadWebhook } = lazy(() => { const { runSquadWebhook } = require('./commands/squad-webhook'); return { runSquadWebhook }; });
const { runSquadBus } = lazy(() => { const { runSquadBus } = require('./commands/squad-bus'); return { runSquadBus }; });
const { runSquadAutorun } = lazy(() => { const { runSquadAutorun } = require('./commands/squad-autorun'); return { runSquadAutorun }; });
const { runSquadDependencyGraph } = lazy(() => { const { runSquadDependencyGraph } = require('./commands/squad-dependency-graph'); return { runSquadDependencyGraph }; });
const { runSquadToolRegister } = lazy(() => { const { runSquadToolRegister } = require('./commands/squad-tool-register'); return { runSquadToolRegister }; });
const { runSquadReview } = lazy(() => { const { runSquadReview } = require('./commands/squad-review'); return { runSquadReview }; });
const { runAgentAudit } = lazy(() => { const { runAgentAudit } = require('./commands/agent-audit'); return { runAgentAudit }; });
const { runSkillAudit } = lazy(() => { const { runSkillAudit } = require('./commands/skill-audit'); return { runSkillAudit }; });
const { isQualityCommand, runQualityCommand } = lazy(() => { const { isQualityCommand, runQualityCommand } = require('./commands/quality'); return { isQualityCommand, runQualityCommand }; });
const { runBriefGen } = lazy(() => { const { runBriefGen } = require('./commands/brief-gen'); return { runBriefGen }; });
const { runHarnessInit, runHarnessValidate, runHarnessApplyValidation } = lazy(() => { const { runHarnessInit, runHarnessValidate, runHarnessApplyValidation } = require('./commands/harness'); return { runHarnessInit, runHarnessValidate, runHarnessApplyValidation }; });
const { runVerifyGate } = lazy(() => { const { runVerifyGate } = require('./commands/verify-gate'); return { runVerifyGate }; });
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
  runRuntimeStorage,
  runRuntimePrune,
  runRuntimeCompact
} = lazy(() => { const { runRuntimeInit, runRuntimeIngest, runRuntimeTaskStart, runRuntimeStart, runRuntimeUpdate, runRuntimeTaskFinish, runRuntimeFinish, runRuntimeTaskFail, runRuntimeFail, runRuntimeStatus, runRuntimeLog, runAgentDone, runAgentRecover, runRuntimeSessionStart, runRuntimeSessionLog, runRuntimeSessionFinish, runRuntimeSessionStatus, runDeliver, runOutputStrategyExport, runOutputStrategyImport, runDevlogSync, runRuntimeStorage, runRuntimePrune, runRuntimeCompact } = require('./commands/runtime'); return { runRuntimeInit, runRuntimeIngest, runRuntimeTaskStart, runRuntimeStart, runRuntimeUpdate, runRuntimeTaskFinish, runRuntimeFinish, runRuntimeTaskFail, runRuntimeFail, runRuntimeStatus, runRuntimeLog, runAgentDone, runAgentRecover, runRuntimeSessionStart, runRuntimeSessionLog, runRuntimeSessionFinish, runRuntimeSessionStatus, runDeliver, runOutputStrategyExport, runOutputStrategyImport, runDevlogSync, runRuntimeStorage, runRuntimePrune, runRuntimeCompact }; });
const {
  runLiveStart,
  runRuntimeEmit,
  runLiveHandoff,
  runLiveStatus,
  runLiveClose,
  runLiveList
} = lazy(() => { const { runLiveStart, runRuntimeEmit, runLiveHandoff, runLiveStatus, runLiveClose, runLiveList } = require('./commands/live'); return { runLiveStart, runRuntimeEmit, runLiveHandoff, runLiveStatus, runLiveClose, runLiveList }; });
const {
  runToolCapabilities,
} = lazy(() => { const { runToolCapabilities } = require('./commands/tool-capabilities'); return { runToolCapabilities }; });
const { runHostSignature } = lazy(() => { const { runHostSignature } = require('./commands/host-signature'); return { runHostSignature }; });
const { runScaffoldComplete } = lazy(() => { const { runScaffoldComplete } = require('./commands/scaffold-complete'); return { runScaffoldComplete }; });
const {
  runCloudImportSquad,
  runCloudImportGenome,
  runCloudPublishGenome,
  runCloudPublishSquad
} = lazy(() => { const { runCloudImportSquad, runCloudImportGenome, runCloudPublishGenome, runCloudPublishSquad } = require('./commands/cloud'); return { runCloudImportSquad, runCloudImportGenome, runCloudPublishGenome, runCloudPublishSquad }; });
const {
  runRuntimeBackup,
  runRuntimeRestore
} = lazy(() => { const { runRuntimeBackup, runRuntimeRestore } = require('./commands/backup'); return { runRuntimeBackup, runRuntimeRestore }; });
const {
  runSkillInstall,
  runSkillList,
  runSkillRemove
} = lazy(() => { const { runSkillInstall, runSkillList, runSkillRemove } = require('./commands/skill'); return { runSkillInstall, runSkillList, runSkillRemove }; });
const { runDesignHybridOptions } = lazy(() => { const { runDesignHybridOptions } = require('./commands/design-hybrid-options'); return { runDesignHybridOptions }; });
const { runBackupLocal } = lazy(() => { const { runBackupLocal } = require('./commands/backup-local-cmd'); return { runBackupLocal }; });
const { runRecoveryGenerate, runRecoveryShow } = lazy(() => { const { runRecoveryGenerate, runRecoveryShow } = require('./commands/recovery'); return { runRecoveryGenerate, runRecoveryShow }; });
const { runContextMonitor } = lazy(() => { const { runContextMonitor } = require('./commands/context-monitor'); return { runContextMonitor }; });
const { runContextSearch, runContextSearchIndex } = lazy(() => { const { runContextSearch, runContextSearchIndex } = require('./commands/context-search'); return { runContextSearch, runContextSearchIndex }; });
const { runContextGuard } = lazy(() => { const { runContextGuard } = require('./commands/context-guard'); return { runContextGuard }; });
const { runContextCacheList, runContextCacheSave, runContextCacheRestore, runContextCacheCleanup } = lazy(() => { const { runContextCacheList, runContextCacheSave, runContextCacheRestore, runContextCacheCleanup } = require('./commands/context-cache'); return { runContextCacheList, runContextCacheSave, runContextCacheRestore, runContextCacheCleanup }; });
const { runSandboxExec } = lazy(() => { const { runSandboxExec } = require('./commands/sandbox'); return { runSandboxExec }; });
const { runAgentLoad, runAgentShardIndex } = lazy(() => { const { runAgentLoad, runAgentShardIndex } = require('./commands/agent-loader'); return { runAgentLoad, runAgentShardIndex }; });
const { runLearningEvolve, runLearningApply } = lazy(() => { const { runLearningEvolve, runLearningApply } = require('./commands/learning-evolve'); return { runLearningEvolve, runLearningApply }; });
const { runLearningRollback } = lazy(() => { const { runLearningRollback } = require('./commands/learning-rollback'); return { runLearningRollback }; });
const { runToolRegistry } = lazy(() => { const { runToolRegistry } = require('./commands/tool-registry-cmd'); return { runToolRegistry }; });
const { runHealth } = lazy(() => { const { runHealth } = require('./commands/health'); return { runHealth }; });
const { runContextHealth } = lazy(() => { const { runContextHealth } = require('./commands/context-health'); return { runContextHealth }; });
const { runHygieneScan } = lazy(() => { const { runHygieneScan } = require('./commands/hygiene-scan'); return { runHygieneScan }; });
const { runEvidencePrune } = lazy(() => { const { runEvidencePrune } = require('./commands/evidence-prune'); return { runEvidencePrune }; });
const { runStorageTriage } = lazy(() => { const { runStorageTriage } = require('./commands/storage-triage'); return { runStorageTriage }; });
const { runContextTrim } = lazy(() => { const { runContextTrim } = require('./commands/context-trim'); return { runContextTrim }; });
const { runHooksEmit } = lazy(() => { const { runHooksEmit } = require('./commands/hooks-emit'); return { runHooksEmit }; });
const { runHooksRecap } = lazy(() => { const { runHooksRecap } = require('./commands/hooks-recap'); return { runHooksRecap }; });
const { runHooksInstall, runHooksUninstall } = lazy(() => { const { runHooksInstall, runHooksUninstall } = require('./commands/hooks-install'); return { runHooksInstall, runHooksUninstall }; });
const { runSessionGuard } = lazy(() => { const { runSessionGuard } = require('./commands/session-guard'); return { runSessionGuard }; });
const { runDevlogProcess } = lazy(() => { const { runDevlogProcess } = require('./commands/devlog-process'); return { runDevlogProcess }; });
const { runDevlogWatch } = lazy(() => { const { runDevlogWatch } = require('./commands/devlog-watch'); return { runDevlogWatch }; });
const { runDevlogExportBrains } = lazy(() => { const { runDevlogExportBrains } = require('./commands/devlog-export-brains'); return { runDevlogExportBrains }; });
const { runBrainQuery } = lazy(() => { const { runBrainQuery } = require('./commands/brain-query'); return { runBrainQuery }; });
const {
  runMemoryStatus,
  runMemorySummary,
  runMemoryReflectPrepare,
  runMemoryReflectCommit
} = lazy(() => { const { runMemoryStatus, runMemorySummary, runMemoryReflectPrepare, runMemoryReflectCommit } = require('./commands/memory'); return { runMemoryStatus, runMemorySummary, runMemoryReflectPrepare, runMemoryReflectCommit }; });
const { runNotify } = lazy(() => { const { runNotify } = require('./commands/notify'); return { runNotify }; });
const { runSpecSync } = lazy(() => { const { runSpecSync } = require('./commands/spec-sync'); return { runSpecSync }; });
const { runSpecStatus } = lazy(() => { const { runSpecStatus } = require('./commands/spec-status'); return { runSpecStatus }; });
const { runSpecCheckpoint } = lazy(() => { const { runSpecCheckpoint } = require('./commands/spec-checkpoint'); return { runSpecCheckpoint }; });
const { runSpecTasks } = lazy(() => { const { runSpecTasks } = require('./commands/spec-tasks'); return { runSpecTasks }; });
const { runLearningExport } = lazy(() => { const { runLearningExport } = require('./commands/learning-export'); return { runLearningExport }; });
const { runRunnerRun } = lazy(() => { const { runRunnerRun } = require('./commands/runner-run'); return { runRunnerRun }; });
const { runRunnerQueue } = lazy(() => { const { runRunnerQueue } = require('./commands/runner-queue'); return { runRunnerQueue }; });
const { runRunnerPlan } = lazy(() => { const { runRunnerPlan } = require('./commands/runner-plan'); return { runRunnerPlan }; });
const { runRunnerDaemon } = lazy(() => { const { runRunnerDaemon } = require('./commands/runner-daemon'); return { runRunnerDaemon }; });
const { runPreflight } = lazy(() => { const { runPreflight } = require('./commands/preflight'); return { runPreflight }; });
const { runClassify } = lazy(() => { const { runClassify } = require('./commands/classify'); return { runClassify }; });
const { runPrototypeCheck } = lazy(() => { const { runPrototypeCheck } = require('./commands/prototype-check'); return { runPrototypeCheck }; });
const { runVerifyImplementation } = lazy(() => { const { runVerifyImplementation } = require('./commands/verify-implementation'); return { runVerifyImplementation }; });
const { runVerificationPlan } = lazy(() => { const { runVerificationPlan } = require('./commands/verification-plan'); return { runVerificationPlan }; });
const { runAgentExecution } = lazy(() => { const { runAgentExecution } = require('./commands/agent-execution'); return { runAgentExecution }; });
const { runExecution } = lazy(() => { const { runExecution } = require('./commands/execution'); return { runExecution }; });
const { runDelegationPlan, runDelegationRun } = lazy(() => { const { runDelegationPlan, runDelegationRun } = require('./commands/delegation'); return { runDelegationPlan, runDelegationRun }; });
const { runSizing } = lazy(() => { const { runSizing } = require('./commands/sizing'); return { runSizing }; });
const { runDetectTestRunner } = lazy(() => { const { runDetectTestRunner } = require('./commands/detect-test-runner'); return { runDetectTestRunner }; });
const { runPulseUpdate } = lazy(() => { const { runPulseUpdate } = require('./commands/pulse-update'); return { runPulseUpdate }; });
const { runAgentEpilogue } = lazy(() => { const { runAgentEpilogue } = require('./commands/agent-epilogue'); return { runAgentEpilogue }; });
const { runStateSave, runStateReset } = lazy(() => { const { runStateSave, runStateReset } = require('./commands/state-save'); return { runStateSave, runStateReset }; });
const { runOpIdentity } = lazy(() => { const { runOpIdentity } = require('./commands/op-identity'); return { runOpIdentity }; });
const { runOpCapture } = lazy(() => { const { runOpCapture } = require('./commands/op-capture'); return { runOpCapture }; });
const { runObserve, runObservationList, runObservationResolve } = lazy(() => { const { runObserve, runObservationList, runObservationResolve } = require('./commands/observe'); return { runObserve, runObservationList, runObservationResolve }; });
const { runOpPromote } = lazy(() => { const { runOpPromote } = require('./commands/op-promote'); return { runOpPromote }; });
const { runOpForget } = lazy(() => { const { runOpForget } = require('./commands/op-forget'); return { runOpForget }; });
const { runOpList } = lazy(() => { const { runOpList } = require('./commands/op-list'); return { runOpList }; });
const { runOpShow } = lazy(() => { const { runOpShow } = require('./commands/op-show'); return { runOpShow }; });
const { runOpReinforce } = lazy(() => { const { runOpReinforce } = require('./commands/op-reinforce'); return { runOpReinforce }; });
const { runOpMigrate } = lazy(() => { const { runOpMigrate } = require('./commands/op-migrate'); return { runOpMigrate }; });
const { runFeatureClose } = lazy(() => { const { runFeatureClose } = require('./commands/feature-close'); return { runFeatureClose }; });
const { runFeatureArchive, runFeatureSweep } = lazy(() => { const { runFeatureArchive, runFeatureSweep } = require('./commands/feature-archive'); return { runFeatureArchive, runFeatureSweep }; });
const { runFeatureTrace } = lazy(() => { const { runFeatureTrace } = require('./commands/feature-trace'); return { runFeatureTrace }; });
const { runFeatureDiff } = lazy(() => { const { runFeatureDiff } = require('./commands/feature-diff'); return { runFeatureDiff }; });
const { runWorkflowMode } = lazy(() => { const { runWorkflowMode } = require('./commands/workflow-mode'); return { runWorkflowMode }; });
const { runGenomeApply } = lazy(() => { const { runGenomeApply } = require('./commands/genome-apply'); return { runGenomeApply }; });
const { runSetupDetect } = lazy(() => { const { runSetupDetect } = require('./commands/setup-detect'); return { runSetupDetect }; });
const { runProfilerCoverage } = lazy(() => { const { runProfilerCoverage } = require('./commands/profiler-coverage'); return { runProfilerCoverage }; });
const { runFeatureExport } = lazy(() => { const { runFeatureExport } = require('./commands/feature-export'); return { runFeatureExport }; });
const { runFeatureCurrent } = lazy(() => { const { runFeatureCurrent } = require('./commands/feature-current'); return { runFeatureCurrent }; });
const { runFeatureList } = lazy(() => { const { runFeatureList } = require('./commands/feature-list'); return { runFeatureList }; });
const { runFeatureRegister, runFeatureTidy } = lazy(() => { const { runFeatureRegister, runFeatureTidy } = require('./commands/feature-registry'); return { runFeatureRegister, runFeatureTidy }; });
const { runFeatureTriage } = lazy(() => { const { runFeatureTriage } = require('./commands/feature-triage'); return { runFeatureTriage }; });
const { runDossierInit, runDossierShow, runDossierAddFinding, runDossierAddCodemap, runDossierLinkRule, runDossierCompact } = lazy(() => { const { runDossierInit, runDossierShow, runDossierAddFinding, runDossierAddCodemap, runDossierLinkRule, runDossierCompact } = require('./commands/dossier'); return { runDossierInit, runDossierShow, runDossierAddFinding, runDossierAddCodemap, runDossierLinkRule, runDossierCompact }; });
const { runDossierAddResearch } = lazy(() => { const { runDossierAddResearch } = require('./commands/dossier-add-research'); return { runDossierAddResearch }; });
const { runDossierAudit } = lazy(() => { const { runDossierAudit } = require('./commands/dossier-audit'); return { runDossierAudit }; });
const { runDevResumeData } = lazy(() => { const { runDevResumeData } = require('./commands/dev-resume'); return { runDevResumeData }; });
const { runRevisionOpen, runRevisionList, runRevisionResolve } = lazy(() => { const { runRevisionOpen, runRevisionList, runRevisionResolve } = require('./commands/revision'); return { runRevisionOpen, runRevisionList, runRevisionResolve }; });
const { runAcTestAudit } = lazy(() => { const { runAcTestAudit } = require('./commands/ac-test-audit'); return { runAcTestAudit }; });
const { runSddBenchmark } = lazy(() => { const { runSddBenchmark } = require('./commands/sdd-benchmark'); return { runSddBenchmark }; });
const { runBenchmarkBootstrap } = lazy(() => { const { runBenchmarkBootstrap } = require('./commands/benchmark-bootstrap'); return { runBenchmarkBootstrap }; });
const { runGateCheck } = lazy(() => { const { runGateCheck } = require('./commands/gate-check'); return { runGateCheck }; });
const { runGateApprove } = lazy(() => { const { runGateApprove } = require('./commands/gate-approve'); return { runGateApprove }; });
const { runArtifactValidate } = lazy(() => { const { runArtifactValidate } = require('./commands/artifact-validate'); return { runArtifactValidate }; });
const { runWorkflowExecute } = lazy(() => { const { runWorkflowExecute } = require('./commands/workflow-execute'); return { runWorkflowExecute }; });
const { runReviewCycle } = lazy(() => { const { runReviewCycle } = require('./commands/review-cycle'); return { runReviewCycle }; });
const { runRunnerQueueFromPlan } = lazy(() => { const { runRunnerQueueFromPlan } = require('./commands/runner-queue-from-plan'); return { runRunnerQueueFromPlan }; });
const { runLearningAutoPromote } = lazy(() => { const { runLearningAutoPromote } = require('./commands/learning-auto-promote'); return { runLearningAutoPromote }; });
const { runBriefValidate } = lazy(() => { const { runBriefValidate } = require('./commands/brief-validate'); return { runBriefValidate }; });
const { runIntakeAsk } = lazy(() => { const { runIntakeAsk } = require('./commands/intake-ask'); return { runIntakeAsk }; });
const { runPreflightContext } = lazy(() => { const { runPreflightContext } = require('./commands/preflight-context'); return { runPreflightContext }; });
const { runContextCompact } = lazy(() => { const { runContextCompact } = require('./commands/context-compact'); return { runContextCompact }; });
const { runSquadScaffold } = lazy(() => { const { runSquadScaffold } = require('./commands/squad-scaffold'); return { runSquadScaffold }; });
const { runSquadPreflight } = lazy(() => { const { runSquadPreflight } = require('./commands/squad-preflight'); return { runSquadPreflight }; });
const { runPatternDetect } = lazy(() => { const { runPatternDetect } = require('./commands/pattern-detect'); return { runPatternDetect }; });
const { runSelfLoop } = lazy(() => { const { runSelfLoop } = require('./commands/self-implement-loop'); return { runSelfLoop }; });
const { runSquadCard } = lazy(() => { const { runSquadCard } = require('./commands/squad-card'); return { runSquadCard }; });
const { runAgentExportSkill } = lazy(() => { const { runAgentExportSkill } = require('./commands/agent-export-skill'); return { runAgentExportSkill }; });
const { runGitGuard } = lazy(() => { const { runGitGuard } = require('./commands/git-guard'); return { runGitGuard }; });
const { runCommitPrepare } = lazy(() => { const { runCommitPrepare } = require('./commands/commit-prepare'); return { runCommitPrepare }; });
const { runAuthLogin, runAuthLogout, runAuthStatus } = lazy(() => { const { runAuthLogin, runAuthLogout, runAuthStatus } = require('./commands/auth'); return { runAuthLogin, runAuthLogout, runAuthStatus }; });
const { runWorkspaceInit, runWorkspaceStatus, runWorkspaceOpen } = lazy(() => { const { runWorkspaceInit, runWorkspaceStatus, runWorkspaceOpen } = require('./commands/workspace'); return { runWorkspaceInit, runWorkspaceStatus, runWorkspaceOpen }; });
const { runGenomePublish, runGenomeInstallStore, runGenomeInstall, runGenomeList, runGenomeRemove } = lazy(() => { const { runGenomePublish, runGenomeInstallStore, runGenomeInstall, runGenomeList, runGenomeRemove } = require('./commands/store-genome'); return { runGenomePublish, runGenomeInstallStore, runGenomeInstall, runGenomeList, runGenomeRemove }; });
const { runSkillPublish, runSkillInstallStore, runSkillListRemote } = lazy(() => { const { runSkillPublish, runSkillInstallStore, runSkillListRemote } = require('./commands/store-skill'); return { runSkillPublish, runSkillInstallStore, runSkillListRemote }; });
const { runSquadPublish, runSquadInstall, runSquadGrant, runSquadList } = lazy(() => { const { runSquadPublish, runSquadInstall, runSquadGrant, runSquadList } = require('./commands/store-squad'); return { runSquadPublish, runSquadInstall, runSquadGrant, runSquadList }; });
const { runSystemPackage, runSystemPublish, runSystemList, runSystemInstall } = lazy(() => { const { runSystemPackage, runSystemPublish, runSystemList, runSystemInstall } = require('./commands/store-system'); return { runSystemPackage, runSystemPublish, runSystemList, runSystemInstall }; });
const { runBriefingApprove, runBriefingUnapprove, runBriefingReview, runBriefingApplyFeedback, runBriefingFeedback } = lazy(() => { const { runBriefingApprove, runBriefingUnapprove, runBriefingReview, runBriefingApplyFeedback, runBriefingFeedback } = require('./commands/briefing'); return { runBriefingApprove, runBriefingUnapprove, runBriefingReview, runBriefingApplyFeedback, runBriefingFeedback }; });
const { runBriefingSources } = lazy(() => { const { runBriefingSources } = require('./commands/briefing-sources'); return { runBriefingSources }; });
const { runBriefingMigrateLineage } = lazy(() => { const { runBriefingMigrateLineage } = require('./commands/briefing-migrate-lineage'); return { runBriefingMigrateLineage }; });
const {
  runExplorationAddRun,
  runExplorationConfigure,
  runExplorationInit,
  runExplorationIntake,
  runExplorationPromote,
  runExplorationRecord,
  runExplorationReferences,
  runExplorationReview,
  runExplorationRun,
  runExplorationScan,
  runExplorationSelect,
  runExplorationStatus,
  runExplorationValidate
} = lazy(() => { const { runExplorationAddRun, runExplorationConfigure, runExplorationInit, runExplorationIntake, runExplorationPromote, runExplorationRecord, runExplorationReferences, runExplorationReview, runExplorationRun, runExplorationScan, runExplorationSelect, runExplorationStatus, runExplorationValidate } = require('./commands/exploration'); return { runExplorationAddRun, runExplorationConfigure, runExplorationInit, runExplorationIntake, runExplorationPromote, runExplorationRecord, runExplorationReferences, runExplorationReview, runExplorationRun, runExplorationScan, runExplorationSelect, runExplorationStatus, runExplorationValidate }; });
const { runCompressAgents } = lazy(() => { const { runCompressAgents } = require('./commands/compress-agents'); return { runCompressAgents }; });

const JSON_SUPPORTED_COMMANDS = new Set([
  'squad',
  'init',
  'install',
  'setup',
  'update',
  'i18n:add',
  'i18n-add',
  'agents',
  'agent:prompt',
  'agent-prompt',
  'agent:help',
  'agent-help',
  'agent:invoke',
  'agent-invoke',
  'agent:epilogue',
  'agent-epilogue',
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
  'context:select',
  'context-select',
  'context:brief',
  'context-brief',
  'context:guard',
  'context-guard',
  'rules:lint',
  'rules-lint',
  'rules:check',
  'rules-check',
  'context:evals',
  'context-evals',
  'context:usage',
  'context-usage',
  'context:load',
  'context-load',
  'chain:audit',
  'chain-audit',
  'chain:list',
  'chain-list',
  'chain:claim',
  'chain-claim',
  'chain:resolve',
  'chain-resolve',
  'chain:release',
  'chain-release',
  'chain:reconcile',
  'chain-reconcile',
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
  'workflow:heal',
  'workflow-heal',
  'workflow:harden',
  'workflow-harden',
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
  'browser:run',
  'browser-run',
  'browser:snapshot',
  'browser-snapshot',
  'qa:report',
  'qa-report',
  'pentester:report',
  'pentester-report',
  'pentester:coverage',
  'pentester-coverage',
  'feature:trace',
  'feature:summary',
  'feature-summary',
  'feature:acknowledge',
  'feature-acknowledge',
  'decision:add',
  'decision-add',
  'decision:resolve',
  'decision-resolve',
  'decision:list',
  'decision-list',
  'decide',
  'feature-trace',
  'feature:diff',
  'feature-diff',
  'workflow:mode',
  'workflow-mode',
  'genome:apply',
  'genome-apply',
  'setup:detect',
  'setup-detect',
  'profiler:coverage',
  'profiler-coverage',
  'web:map',
  'web-map',
  'web:scrape',
  'web-scrape',
  'web:save',
  'web-save',
  'web:extract',
  'web-extract',
  'web:discover',
  'web-discover',
  'web:collect',
  'web-collect',
  'jev:judge',
  'jev-judge',
  'jev:review',
  'jev-review',
  'jev:agent-review',
  'jev-agent-review',
  'scan:project',
  'scan-project',
  'security:scan',
  'security-scan',
  'security:audit',
  'security-audit',
  'audit:code',
  'audit-code',
  'verify:artifact',
  'verify-artifact',
  'delivery:parity',
  'delivery-parity',
  'design:seed',
  'design-seed',
  'rule:new',
  'rule-new',
  'doc:new',
  'doc-new',
  'briefing:sources',
  'briefing-sources',
  'briefing:review',
  'briefing-review',
  'briefing:apply-feedback',
  'briefing-apply-feedback',
  'briefing:feedback',
  'briefing-feedback',
  'briefing:migrate-lineage',
  'briefing-migrate-lineage',
  'exploration:init',
  'exploration-init',
  'exploration:configure',
  'exploration-configure',
  'exploration:references',
  'exploration-references',
  'exploration:intake',
  'exploration-intake',
  'exploration:scan',
  'exploration-scan',
  'exploration:add-run',
  'exploration-add-run',
  'exploration:record',
  'exploration-record',
  'exploration:validate',
  'exploration-validate',
  'exploration:status',
  'exploration-status',
  'exploration:review',
  'exploration-review',
  'exploration:select',
  'exploration-select',
  'exploration:promote',
  'exploration-promote',
  'exploration:run',
  'exploration-run',
  'review:feature',
  'review-feature',
  'review:prepare',
  'review-prepare',
  'review:check',
  'review-check',
  'review:status',
  'review-status',
  'config',
  'genome:doctor',
  'genome-doctor',
  'genome:approve',
  'genome-approve',
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
  'squad:eval',
  'squad-eval',
  'squad:pilot-approve',
  'squad-pilot-approve',
  'squad:role-scan',
  'squad-role-scan',
  'squad:playbook',
  'squad-playbook',
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
  'squad-mcp-call',
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
  'plan:bind',
  'plan-bind',
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
  'skill:audit',
  'skill-audit',
  'quality:audit',
  'quality:run',
  'quality:evals',
  'quality:bench',
  'quality-audit',
  'brief:gen',
  'harness:init',
  'harness-init',
  'harness:validate',
  'harness-validate',
  'harness:apply-validation',
  'harness-apply-validation',
  'harness:approve',
  'harness-approve',
  'harness:reject',
  'harness-reject',
  'harness:status',
  'harness-status',
  'harness:check',
  'harness-check',
  'harness:retro',
  'harness-retro',
  'harness:retro-promote',
  'harness-retro-promote',
  'harness:preview',
  'harness-preview',
  'brief-gen',
  'verify:gate',
  'verify-gate',
  'brief:validate',
  'brief-validate',
  'intake:ask',
  'intake-ask',
  'preflight:context',
  'preflight-context',
  'context:compact',
  'context-compact',
  'squad:scaffold',
  'squad-scaffold',
  'squad:preflight',
  'squad-preflight',
  'squad:agent:create',
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
  'runtime:storage',
  'runtime-storage',
  'runtime:prune',
  'runtime-prune',
  'runtime:compact',
  'runtime-compact',
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
  'tool:capabilities',
  'tool-capabilities',
  'host:signature',
  'host-signature',
  'execution:offer',
  'execution-offer',
  'execution:seed',
  'execution-seed',
  'execution:profiles:validate',
  'execution-profiles-validate',
  'execution:compile',
  'execution-compile',
  'execution:run',
  'execution-run',
  'execution:decide',
  'execution-decide',
  'execution:status',
  'execution-status',
  'execution:dashboard',
  'execution-dashboard',
  'execution:prices',
  'execution-prices',
  'execution:graph',
  'execution-graph',
  'execution:dependencies',
  'execution-dependencies',
  'scaffold:complete',
  'scaffold-complete',
  'deliver',
  'output-strategy:export',
  'output-strategy-export',
  'output-strategy:import',
  'output-strategy-import',
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
  'hooks:recap',
  'hooks-recap',
  'hooks:install',
  'hooks-install',
  'hooks:uninstall',
  'hooks-uninstall',
  'session:guard',
  'session-guard',
  'devlog:sync',
  'devlog-sync',
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
  'memory:search',
  'memory-search',
  'memory:archive',
  'memory-archive',
  'memory:restore',
  'memory-restore',
  'memory:trim',
  'memory-trim',
  'memory:reflect-prepare',
  'memory-reflect-prepare',
  'memory:reflect-commit',
  'memory-reflect-commit',
  'scout:prep',
  'scout-prep',
  'scout:validate',
  'scout-validate',
  'scout:commit',
  'scout-commit',
  'notify',
  'backup:local',
  'backup-local',
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
  'hygiene:scan',
  'hygiene-scan',
  'evidence:prune',
  'evidence-prune',
  'storage:triage',
  'storage-triage',
  'context:trim',
  'context-trim',
  'context:search',
  'context-search',
  'context:index',
  'context-index',
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
  'prototype:check',
  'prototype-check',
  'verify:implementation',
  'verify-implementation',
  'verification:plan',
  'verification-plan',
  'delegation:plan',
  'delegation-plan',
  'delegation:run',
  'delegation-run',
  'agent:execution:init',
  'agent-execution-init',
  'agent:execution:validate',
  'agent-execution-validate',
  'agent:execution:show',
  'agent-execution-show',
  'agent:execution:dispatch',
  'agent-execution-dispatch',
  'agent:execution:resume',
  'agent-execution-resume',
  'agent:execution:status',
  'agent-execution-status',
  'agent:execution:events',
  'agent-execution-events',
  'sizing',
  'detect:test-runner',
  'detect-test-runner',
  'pulse:update',
  'pulse-update',
  'state:save',
  'state-save',
  'state:reset',
  'state-reset',
  'op:identity',
  'op-identity',
  'op:capture',
  'op-capture',
  'op:promote',
  'op-promote',
  'op:forget',
  'op-forget',
  'op:list',
  'op-list',
  'op:show',
  'op-show',
  'op:reinforce',
  'op-reinforce',
  'op:migrate',
  'op-migrate',
  'observe',
  'observation:list',
  'observation-list',
  'observation:resolve',
  'observation-resolve',
  'dev:state:write',
  'dev-state-write',
  'feature:close',
  'feature:closure',
  'feature-closure',
  'feature-close',
  'feature:archive',
  'feature-archive',
  'feature:sweep',
  'feature-sweep',
  'feature:export',
  'feature-export',
  'feature:current',
  'feature-current',
  'feature:list',
  'feature-list',
  'feature:register',
  'feature-register',
  'feature:tidy',
  'feature-tidy',
  'feature:triage',
  'feature-triage',
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
  'ac:test-audit',
  'ac-test-audit',
  'sdd:benchmark',
  'sdd-benchmark',
  'benchmark:bootstrap',
  'benchmark-bootstrap',
  'gate:check',
  'gate-check',
  'gate:approve',
  'gate-approve',
  'artifact:validate',
  'artifact-validate',
  'spec:analyze',
  'spec-analyze',
  'forge:compile',
  'forge-compile',
  'workflow:execute',
  'workflow-execute',
  'review-cycle:status',
  'review-cycle-status',
  'review-cycle:advance',
  'review-cycle-advance',
  'review-cycle:resolve',
  'review-cycle-resolve',
  'review-cycle:reset',
  'review-cycle-reset',
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
  'system-install',
  'briefing:approve',
  'briefing-approve',
  'briefing:unapprove',
  'briefing-unapprove'
]);

const AGENT_HELP_COMMANDS = new Set([
  'agent:prompt', 'agent-prompt', 'agent:invoke', 'agent-invoke', 'agent:help', 'agent-help'
]);

const DEDICATED_HELP_COMMANDS = new Set([
  'op:identity', 'op-identity',
  'op:capture', 'op-capture',
  'op:promote', 'op-promote',
  'op:forget', 'op-forget',
  'op:list', 'op-list',
  'op:show', 'op-show',
  'op:reinforce', 'op-reinforce',
  'op:migrate', 'op-migrate',
  'observe',
  'observation:list', 'observation-list',
  'observation:resolve', 'observation-resolve'
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
      writeThrough(process.stdout, 1, `${toText(value)}\n`);
    },
    error(value = '') {
      writeThrough(process.stderr, 2, `${toText(value)}\n`);
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

function getCommandHelpUsage(command, t) {
  const suffix = String(command || '').replace(/[:\-]/g, '_');
  const key = `cli.help_${suffix}`;
  const usage = t(key);
  return usage === key ? null : usage;
}

function printQualityHelp(t, logger) {
  for (const key of ['cli.help_quality_audit', 'cli.help_quality_run', 'cli.help_quality_evals', 'cli.help_quality_bench']) logHelpLine(t, logger, key);
}

// The global --help, in print order; `null` is where the quality block goes.
const HELP_KEYS = [
  'cli.help_init', 'cli.help_install', 'cli.help_setup', 'cli.help_update',
  'cli.help_info', 'cli.help_doctor', 'cli.help_hygiene_scan', 'cli.help_evidence_prune',
  'cli.help_storage_triage', 'cli.help_i18n_add', 'cli.help_agents', 'cli.help_agent_prompt',
  'cli.help_agent_help', 'cli.help_agent_invoke', 'cli.help_agent_epilogue', 'cli.help_rule_new',
  'cli.help_doc_new', 'cli.help_decide', 'cli.help_observe', 'cli.help_observation_list',
  'cli.help_observation_resolve', 'cli.help_op_list', 'cli.help_op_show', 'cli.help_op_capture', 'cli.help_hooks_recap', 'cli.help_briefing_sources',
  'cli.help_briefing_approve', 'cli.help_briefing_unapprove', 'cli.help_briefing_review', 'cli.help_briefing_apply_feedback',
  'cli.help_briefing_feedback', 'cli.help_briefing_migrate_lineage', 'cli.help_exploration', 'cli.help_context_validate',
  'cli.help_context_pack', 'cli.help_context_search', 'cli.help_context_select', 'cli.help_context_brief',
  'cli.help_context_guard', 'cli.help_context_evals', 'cli.help_context_usage', 'cli.help_context_load',
  'cli.help_chain_audit', 'cli.help_chain_list', 'cli.help_chain_claim', 'cli.help_chain_resolve',
  'cli.help_chain_release', 'cli.help_chain_reconcile', 'cli.help_memory_status', 'cli.help_memory_summary',
  'cli.help_memory_search', 'cli.help_memory_archive', 'cli.help_memory_restore', 'cli.help_memory_trim', 'cli.help_brain_query',
  'cli.help_setup_context', 'cli.help_locale_apply', 'cli.help_locale_diff', 'cli.help_test_agents',
  'cli.help_test_smoke', 'cli.help_test_package', 'cli.help_workflow_plan', 'cli.help_workflow_next',
  'cli.help_workflow_status', 'cli.help_workflow_mode', 'cli.help_workflow_execute', 'cli.help_review_cycle',
  'cli.help_review_feature', 'cli.help_review_prepare', 'cli.help_review_check', 'cli.help_review_status',
  'cli.help_parallel_init', 'cli.help_parallel_doctor', 'cli.help_parallel_assign', 'cli.help_parallel_status',
  'cli.help_parallel_merge', 'cli.help_parallel_guard', 'cli.help_mcp_init', 'cli.help_mcp_doctor',
  'cli.help_qa_doctor', 'cli.help_qa_init', 'cli.help_qa_run', 'cli.help_qa_scan',
  'cli.help_browser_run', 'cli.help_browser_snapshot', 'cli.help_qa_report', 'cli.help_pentester_report',
  'cli.help_pentester_coverage', 'cli.help_feature_list', 'cli.help_feature_register', 'cli.help_feature_tidy',
  'cli.help_feature_triage', 'cli.help_feature_current', 'cli.help_feature_trace', 'cli.help_feature_diff',
  'cli.help_setup_detect', 'cli.help_genome_apply', 'cli.help_profiler_coverage', 'cli.help_feature_closure',
  'cli.help_feature_close', 'cli.help_feature_archive', 'cli.help_gate_check', 'cli.help_gate_approve',
  'cli.help_prototype_check', 'cli.help_ac_test_audit', 'cli.help_preflight', 'cli.help_pulse_update',
  'cli.help_agent_done', 'cli.help_commit_prepare', 'cli.help_dossier_init', 'cli.help_dossier_show', 'cli.help_dossier_add_finding',
  'cli.help_detect_test_runner', 'cli.help_dev_resume_data', 'cli.help_plan',
  'cli.help_harness_init', 'cli.help_harness_validate', 'cli.help_harness_apply_validation', 'cli.help_harness_approve',
  'cli.help_harness_reject', 'cli.help_harness_status', 'cli.help_harness_check', 'cli.help_harness_retro',
  'cli.help_harness_preview', 'cli.help_verification_plan', 'cli.help_delegation_plan', 'cli.help_delegation_run',
  'cli.help_web_map', 'cli.help_web_scrape', 'cli.help_web_save', 'cli.help_web_extract',
  'cli.help_web_discover', 'cli.help_web_collect', 'cli.help_jev_judge', 'cli.help_jev_review',
  'cli.help_jev_agent_review', 'cli.help_scan_project', 'cli.help_config', 'cli.help_genome_doctor',
  'cli.help_genome_approve', 'cli.help_genome_migrate', 'cli.help_squad_status', 'cli.help_squad_doctor',
  'cli.help_squad_repair_genomes', 'cli.help_squad_validate', 'cli.help_squad_eval', 'cli.help_squad_preflight',
  'cli.help_squad_pilot_approve', 'cli.help_squad_export', 'cli.help_squad_pipeline', 'cli.help_squad_plan', 'cli.help_squad_agent_create',
  'cli.help_squad_investigate', 'cli.help_squad_dashboard', 'cli.help_squad_worker', 'cli.help_squad_daemon',
  'cli.help_squad_mcp', 'cli.help_squad_roi', 'cli.help_squad_score', 'cli.help_squad_learning',
  'cli.help_agent_audit', null, 'cli.help_learning', 'cli.help_runtime_init',
  'cli.help_runtime_ingest', 'cli.help_runtime_task_start', 'cli.help_runtime_start', 'cli.help_runtime_update',
  'cli.help_runtime_task_finish', 'cli.help_runtime_finish', 'cli.help_runtime_task_fail', 'cli.help_runtime_fail',
  'cli.help_runtime_status', 'cli.help_runtime_log', 'cli.help_runtime_storage', 'cli.help_runtime_prune', 'cli.help_runtime_compact',
  'cli.help_agent_recover', 'cli.help_runtime_session_start', 'cli.help_runtime_session_log', 'cli.help_runtime_session_finish',
  'cli.help_runtime_session_status', 'cli.help_runtime_emit', 'cli.help_host_signature', 'cli.help_execution_offer',
  'cli.help_execution_seed', 'cli.help_execution_profiles_validate', 'cli.help_execution_compile', 'cli.help_execution_run',
  'cli.help_execution_decide', 'cli.help_execution_status', 'cli.help_execution_dashboard', 'cli.help_execution_prices',
  'cli.help_execution_graph', 'cli.help_execution_dependencies', 'cli.help_live_start', 'cli.help_live_status',
  'cli.help_live_handoff', 'cli.help_live_close', 'cli.help_live_list', 'cli.help_scaffold_complete', 'cli.help_runtime_backup',
  'cli.help_runtime_restore', 'cli.help_skill_install', 'cli.help_skill_list', 'cli.help_skill_remove',
  'cli.help_skill_audit', 'cli.help_design_hybrid_options', 'cli.help_cloud_import_squad', 'cli.help_cloud_import_genome',
  'cli.help_cloud_publish_squad', 'cli.help_cloud_publish_genome', 'cli.help_auth_login', 'cli.help_auth_logout',
  'cli.help_auth_status', 'cli.help_workspace_init', 'cli.help_workspace_status', 'cli.help_workspace_open',
  'cli.help_genome_publish', 'cli.help_genome_install', 'cli.help_genome_list', 'cli.help_genome_remove',
  'cli.help_genome_install_store', 'cli.help_skill_publish', 'cli.help_squad_list', 'cli.help_squad_publish',
  'cli.help_squad_install', 'cli.help_squad_grant'
];

function printHelp(t, logger) {
  logger.log(t('cli.title_line', { title: t('cli.title') }));
  logger.log(t('cli.usage'));
  for (const key of HELP_KEYS) {
    if (key === null) printQualityHelp(t, logger);
    else logHelpLine(t, logger, key);
  }
}

function printAgentHelp(agentName, jsonMode, logger, t) {
  const { AGENT_DEFINITIONS } = require('./constants');
  const { getAgentDefinition } = require('./agents');

  if (!agentName) {
    const list = AGENT_DEFINITIONS.map((a) => ({
      id: a.id,
      displayName: a.displayName,
      description: a.description || ''
    }));
    if (jsonMode) {
      writeJson({ ok: true, agents: list });
      return;
    }
    logger.log(`${t('agents.help_available')}\n`);
    for (const a of list) {
      logger.log(`  @${a.id.padEnd(24)} ${a.description}`);
    }
    logger.log(`\n${t('agents.help_run_detail')}`);
    return;
  }

  // Single resolver: ids, renamed ids (`briefing-refiner`) and retired ids (`deyvin`).
  const agent = getAgentDefinition(agentName);

  if (!agent) {
    if (jsonMode) {
      writeJson({ ok: false, error: t('agents.help_unknown_agent', { agent: agentName }) });
    } else {
      logger.error(t('agents.help_unknown_agent', { agent: agentName }));
    }
    process.exitCode = 1;
    return;
  }

  if (jsonMode) {
    writeJson({
      ok: true,
      agent: {
        id: agent.id,
        displayName: agent.displayName,
        description: agent.description || '',
        command: agent.command,
        path: agent.path,
        aliases: agent.aliases || [],
        legacyIds: agent.legacyIds || [],
        flags: agent.flags || [],
        dependsOn: agent.dependsOn,
        output: agent.output
      }
    });
    return;
  }

  const aliasLine = agent.aliases && agent.aliases.length > 0
    ? ` (aliases: ${agent.aliases.join(', ')})`
    : '';
  const legacyLine = agent.legacyIds && agent.legacyIds.length > 0
    ? ` (formerly: ${agent.legacyIds.join(', ')})`
    : '';
  logger.log(`${agent.command} — ${agent.description || agent.displayName}${aliasLine}${legacyLine}\n`);
  logger.log(`${t('agents.help_usage')}`);
  logger.log(`  aioson agent:prompt ${agent.id} [path] [options]`);
  const claudeActivation = agent.id === 'help' ? '/aioson:agent:help' : `/${agent.id}`;
  logger.log(`  ${claudeActivation} [task description]                  ${t('agents.help_claude_code')}\n`);
  logger.log(t('agents.help_common_options'));
  logger.log(`  --tool=<tool>       ${t('agents.help_opt_tool')}`);
  logger.log(`  --language=<lang>   ${t('agents.help_opt_language')}`);
  logger.log(`  --headless          ${t('agents.help_opt_headless')}`);
  logger.log(`  --output=<path>     ${t('agents.help_opt_output')}`);
  logger.log(`  --json              ${t('agents.help_opt_json')}`);
  if (agent.flags && agent.flags.length > 0) {
    logger.log(`\n${t('agents.help_agent_options', { command: agent.command })}`);
    for (const flag of agent.flags) {
      logger.log(`  --${flag.name}=${flag.value.padEnd(Math.max(12 - flag.name.length, 1))} ${flag.description}`);
    }
  }
  if (agent.dependsOn.length > 0) {
    logger.log(`\n${t('agents.help_requires')}`);
    for (const dep of agent.dependsOn) {
      logger.log(`  ${dep}`);
    }
  }
  logger.log(`\n${t('agents.help_produces')}\n  ${agent.output}`);
  logger.log(`\n${t('agents.help_instruction_file')}\n  ${agent.path}`);
}

function commandSupportsJson(command) {
  return JSON_SUPPORTED_COMMANDS.has(command);
}

function writeJson(payload, { compact = false } = {}) {
  const text = `${compact ? JSON.stringify(payload) : JSON.stringify(payload, null, 2)}\n`;
  writeThrough(process.stdout, 1, text);
}

// Flags that carry an agent id. A renamed agent's legacy id (see `aliases`
// in constants.js) is canonicalized once here so every command downstream
// compares canonical ids; unknown/custom values pass through untouched.
const AGENT_ID_FLAGS = ['agent', 'from', 'to', 'source-agent', 'stage'];

function canonicalizeAgentFlags(options) {
  const { canonicalAgentId } = require('./agents');
  for (const flag of AGENT_ID_FLAGS) {
    const value = options[flag];
    if (typeof value !== 'string' || !value.trim()) continue;
    const canonical = canonicalAgentId(value);
    if (canonical !== value.trim().toLowerCase().replace(/^@/, '')) options[flag] = canonical;
  }
  return options;
}

async function main() {
  const { command, args, options } = parseArgv(process.argv);
  canonicalizeAgentFlags(options);
  const locale = normalizeLocale(options.locale || process.env.AIOS_LITE_LOCALE || 'en');
  const jsonMode = Boolean(options.json);
  const { t } = createTranslator(locale);
  const logger = createLogger();
  const silentLogger = createSilentLogger();

  // Deprecated command families — implemented but ownerless (no agent or doc
  // routes to them; pente-fino audit 2026-08-12, owner decision: deprecate
  // without removing). Warn, never block; removal waits for a major release.
  // Live look-alikes stay untouched: runtime:emit, agent:execution:dispatch,
  // devlog:process, detect:test-runner.
  const DEPRECATED_COMMAND_PREFIXES = [
    'parallel:', 'parallel-',
    'orchestrator:', 'orchestrator-',
    'runner:', 'runner-',
    'cloud:', 'cloud-',
    'learning:', 'learning-',
    'context:cache', 'context-cache',
    'recovery:', 'recovery-',
    'pattern:detect', 'pattern-detect',
    'output-strategy:'
  ];
  if (command && DEPRECATED_COMMAND_PREFIXES.some((p) => command.startsWith(p))) {
    // `--json` promises a machine-only envelope — no human logs on either
    // stream — so the notice is for interactive runs only.
    if (!jsonMode) {
      const warn = typeof logger.warn === 'function' ? logger.warn.bind(logger) : logger.log.bind(logger);
      warn(`[deprecated] "${command}" belongs to an ownerless command family scheduled for removal in a future major release.`);
    }
  }

  if (
    command === '--version' ||
    command === '-v' ||
    command === 'version' ||
    options.version === true
  ) {
    const { getCliVersionSync, getGitBuildInfoSync, getCliVersionLabelSync } = require('./version');
    const version = getCliVersionSync();
    const git = getGitBuildInfoSync();
    if (jsonMode) {
      writeJson({ ok: true, version, git_sha: git ? git.sha : null, git_date: git ? git.date : null });
    } else {
      logger.log(`aioson ${getCliVersionLabelSync()}`);
    }
    return;
  }

  if (options.help && AGENT_HELP_COMMANDS.has(command)) {
    printAgentHelp(args[0], jsonMode, logger, t);
    return;
  }
  if (command === 'agent:help' || command === 'agent-help') {
    printAgentHelp(args[0], jsonMode, logger, t);
    return;
  }

  if (
    command === 'help' ||
    command === '--help' ||
    command === '-h'
  ) {
    printHelp(t, logger);
    return;
  }

  if (options.help && !DEDICATED_HELP_COMMANDS.has(command)) {
    const usage = getCommandHelpUsage(command, t);
    if (usage) {
      if (jsonMode) writeJson({ ok: true, command, usage });
      else logger.log(usage);
    } else {
      printHelp(t, logger);
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
    } else if (command === 'context:select' || command === 'context-select') {
      result = await runContextSelect({ args, options, logger: commandLogger, t });
    } else if (command === 'context:brief' || command === 'context-brief') {
      result = await runContextBrief({ args, options, logger: commandLogger, t });
    } else if (command === 'context:guard' || command === 'context-guard') {
      result = await runContextGuard({ args, options, logger: commandLogger, t });
    } else if (command === 'rules:lint' || command === 'rules-lint') {
      result = await runRulesLint({ args, options, logger: commandLogger, t });
    } else if (command === 'context:evals' || command === 'context-evals') {
      result = await runContextEvalsCommand({ args, options, logger: commandLogger, t });
    } else if (command === 'context:usage' || command === 'context-usage') {
      result = await runContextUsageCommand({ args, options, logger: commandLogger, t });
    } else if (command === 'rules:check' || command === 'rules-check') {
      const { runRulesCheck } = lazy(() => { const { runRulesCheck } = require('./commands/rules-check'); return { runRulesCheck }; });
      result = await runRulesCheck({ args, options, logger: commandLogger, t });
    } else if (command === 'context:load' || command === 'context-load') {
      result = await runContextLoad({ args, options, logger: commandLogger, t });
    } else if (command === 'chain:audit' || command === 'chain-audit') {
      result = await runChainAudit({ args, options, logger: commandLogger, t });
    } else if (command === 'chain:list' || command === 'chain-list') {
      result = await runChainList({ args, options, logger: commandLogger, t });
    } else if (command === 'chain:claim' || command === 'chain-claim') {
      result = await runChainClaim({ args, options, logger: commandLogger, t });
    } else if (command === 'chain:resolve' || command === 'chain-resolve') {
      result = await runChainResolve({ args, options, logger: commandLogger, t });
    } else if (command === 'chain:release' || command === 'chain-release') {
      result = await runChainRelease({ args, options, logger: commandLogger, t });
    } else if (command === 'chain:reconcile' || command === 'chain-reconcile') {
      result = await runChainReconcile({ args, options, logger: commandLogger, t });
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
    } else if (command === 'browser:run' || command === 'browser-run') {
      result = await runBrowserRun({ args, options, logger: commandLogger, t });
    } else if (command === 'browser:snapshot' || command === 'browser-snapshot') {
      result = await runBrowserSnapshot({ args, options, logger: commandLogger, t });
    } else if (command === 'qa:report' || command === 'qa-report') {
      result = await runQaReport({ args, options, logger: commandLogger, t });
    } else if (command === 'pentester:report' || command === 'pentester-report') {
      result = await runPentesterReport({ args, options, logger: commandLogger, t });
    } else if (command === 'web:map' || command === 'web-map') {
      result = await runWebMap({ args, options, logger: commandLogger, t });
    } else if (command === 'web:scrape' || command === 'web-scrape') {
      result = await runWebScrape({ args, options, logger: commandLogger, t });
    } else if (command === 'web:save' || command === 'web-save') {
      result = await runWebSave({ args, options, logger: commandLogger, t });
    } else if (command === 'web:extract' || command === 'web-extract') {
      result = await runWebExtract({ args, options, logger: commandLogger, t });
    } else if (command === 'web:discover' || command === 'web-discover') {
      result = await runWebDiscover({ args, options, logger: commandLogger, t });
    } else if (command === 'web:collect' || command === 'web-collect') {
      result = await runWebCollect({ args, options, logger: commandLogger, t });
    } else if (command === 'jev:judge' || command === 'jev-judge') {
      const { runJevJudge } = lazy(() => { const { runJevJudge } = require('./commands/jev-judge'); return { runJevJudge }; });
      result = await runJevJudge({ args, options, logger: commandLogger });
    } else if (command === 'jev:review' || command === 'jev-review') {
      const { runJevReview } = lazy(() => { const { runJevReview } = require('./commands/jev-review'); return { runJevReview }; });
      result = await runJevReview({ args, options, logger: commandLogger });
    } else if (command === 'jev:agent-review' || command === 'jev-agent-review') {
      const { runJevAgentReview } = lazy(() => { const { runJevAgentReview } = require('./commands/jev-agent-review'); return { runJevAgentReview }; });
      result = await runJevAgentReview({ args, options, logger: commandLogger });
    } else if (command === 'scan:project' || command === 'scan-project') {
      result = await runScanProject({ args, options, logger: commandLogger, t });
    } else if (command === 'security:scan' || command === 'security-scan') {
      result = await runSecurityScan({ args, options, logger: commandLogger, t });
    } else if (command === 'security:audit' || command === 'security-audit') {
      result = await runSecurityAudit({ args, options, logger: commandLogger, t });
    } else if (command === 'audit:code' || command === 'audit-code') {
      const { runAuditCode } = lazy(() => { const { runAuditCode } = require('./commands/audit-code'); return { runAuditCode }; });
      result = await runAuditCode({ args, options, logger: commandLogger, t });
    } else if (command === 'rule:new' || command === 'rule-new') {
      const { runRuleNew } = lazy(() => { const { runRuleNew } = require('./commands/rule-new'); return { runRuleNew }; });
      result = await runRuleNew({ args, options, logger: commandLogger, t });
    } else if (command === 'doc:new' || command === 'doc-new') {
      const { runDocNew } = lazy(() => { const { runDocNew } = require('./commands/rule-new'); return { runDocNew }; });
      result = await runDocNew({ args, options, logger: commandLogger, t });
    } else if (command === 'verify:artifact' || command === 'verify-artifact') {
      const { runVerifyArtifact } = lazy(() => { const { runVerifyArtifact } = require('./commands/verify-artifact'); return { runVerifyArtifact }; });
      result = await runVerifyArtifact({ args, options, logger: commandLogger, t });
    } else if (command === 'delivery:parity' || command === 'delivery-parity') {
      const { runDeliveryParity } = lazy(() => { const { runDeliveryParity } = require('./commands/delivery-parity'); return { runDeliveryParity }; });
      result = await runDeliveryParity({ args, options, logger: commandLogger, t });
    } else if (command === 'design:seed' || command === 'design-seed') {
      const { runDesignSeed } = lazy(() => { const { runDesignSeed } = require('./commands/design-seed'); return { runDesignSeed }; });
      result = await runDesignSeed({ args, options, logger: commandLogger, t });
    } else if (command === 'review:prepare' || command === 'review-prepare') {
      result = await runReviewPrepare({ args, options, logger: commandLogger });
      if (!jsonMode) process.exitCode = result.exitCode;
    } else if (command === 'review:check' || command === 'review-check') {
      result = await runReviewCheck({ args, options, logger: commandLogger });
      if (!jsonMode) process.exitCode = result.exitCode;
    } else if (command === 'review:status' || command === 'review-status') {
      result = await runReviewStatus({ args, options, logger: commandLogger });
      if (!jsonMode) process.exitCode = result.exitCode;
    } else if (command === 'review:feature' || command === 'review-feature') {
      result = await runReviewFeature({ args, options, logger: commandLogger, t });
    } else if (command === 'config') {
      result = await runConfig({ args, options, logger: commandLogger, t });
    } else if (command === 'genome:doctor' || command === 'genome-doctor') {
      result = await runGenomeDoctor({ args, options, logger: commandLogger, t });
    } else if (command === 'genome:approve' || command === 'genome-approve') {
      result = await runGenomeApprove({ args, options, logger: commandLogger });
    } else if (command === 'genome:migrate' || command === 'genome-migrate') {
      result = await runGenomeMigrate({ args, options, logger: commandLogger, t });
    } else if (command === 'squad') {
      result = await runSquadSession({ args, options, logger: commandLogger, t });
    } else if (command === 'squad:status' || command === 'squad-status') {
      result = await runSquadStatus({ args, options, logger: commandLogger, t });
    } else if (command === 'squad:doctor' || command === 'squad-doctor') {
      result = await runSquadDoctor({ args, options, logger: commandLogger, t });
    } else if (command === 'squad:repair-genomes' || command === 'squad-repair-genomes') {
      result = await runSquadRepairGenomes({ args, options, logger: commandLogger, t });
    } else if (command === 'squad:validate' || command === 'squad-validate') {
      result = await runSquadValidate({ args, options, logger: commandLogger, t });
    } else if (command === 'squad:eval' || command === 'squad-eval') {
      result = await runSquadEval({ args, options, logger: commandLogger, t });
    } else if (command === 'squad:pilot-approve' || command === 'squad-pilot-approve') {
      result = await runSquadPilotApprove({ args, options, logger: commandLogger });
    } else if (command === 'squad:role-scan' || command === 'squad-role-scan') {
      result = await runSquadRoleScan({ args, options, logger: commandLogger });
    } else if (command === 'squad:playbook' || command === 'squad-playbook') {
      result = await runSquadPlaybook({ args, options, logger: commandLogger });
    } else if (command === 'squad:export' || command === 'squad-export') {
      result = await runSquadExport({ args, options, logger: commandLogger, t });
    } else if (command === 'squad:pipeline' || command === 'squad-pipeline') {
      result = await runSquadPipeline({ args, options, logger: commandLogger, t });
    } else if (command === 'squad:agent-create' || command === 'squad-agent-create' || command === 'squad:agent:create') {
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
    } else if (command === 'squad:mcp:call' || command === 'squad-mcp-call') {
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
    } else if (command === 'skill:audit' || command === 'skill-audit') {
      result = await runSkillAudit({ args, options, logger: commandLogger });
    } else if (isQualityCommand(command)) {
      result = await runQualityCommand(command, { args, options, logger: commandLogger });
    } else if (command === 'brief:gen' || command === 'brief-gen') {
      result = await runBriefGen({ args, options, logger: commandLogger, t });
    } else if (command === 'harness:init' || command === 'harness-init') {
      result = await runHarnessInit({ args, options, logger: commandLogger, t });
    } else if (command === 'harness:validate' || command === 'harness-validate') {
      result = await runHarnessValidate({ args, options, logger: commandLogger, t });
    } else if (command === 'harness:apply-validation' || command === 'harness-apply-validation') {
      result = await runHarnessApplyValidation({ args, options, logger: commandLogger, t });
    } else if (command === 'harness:approve' || command === 'harness-approve') {
      const { runHarnessApprove } = lazy(() => { const { runHarnessApprove } = require('./commands/harness-gate'); return { runHarnessApprove }; });
      result = await runHarnessApprove({ args, options, logger: commandLogger, t });
    } else if (command === 'harness:reject' || command === 'harness-reject') {
      const { runHarnessReject } = lazy(() => { const { runHarnessReject } = require('./commands/harness-gate'); return { runHarnessReject }; });
      result = await runHarnessReject({ args, options, logger: commandLogger, t });
    } else if (command === 'harness:status' || command === 'harness-status') {
      const { runHarnessStatus } = lazy(() => { const { runHarnessStatus } = require('./commands/harness-status'); return { runHarnessStatus }; });
      result = await runHarnessStatus({ args, options, logger: commandLogger, t });
    } else if (command === 'harness:check' || command === 'harness-check') {
      const { runHarnessCheck } = lazy(() => { const { runHarnessCheck } = require('./commands/harness-check'); return { runHarnessCheck }; });
      result = await runHarnessCheck({ args, options, logger: commandLogger, t });
    } else if (command === 'harness:retro' || command === 'harness-retro') {
      const { runHarnessRetro } = lazy(() => { const { runHarnessRetro } = require('./commands/harness-retro'); return { runHarnessRetro }; });
      result = await runHarnessRetro({ args, options, logger: commandLogger, t });
    } else if (command === 'harness:retro-promote' || command === 'harness-retro-promote') {
      const { runHarnessRetroPromote } = lazy(() => { const { runHarnessRetroPromote } = require('./commands/harness-retro-promote'); return { runHarnessRetroPromote }; });
      result = await runHarnessRetroPromote({ args, options, logger: commandLogger, t });
    } else if (command === 'harness:preview' || command === 'harness-preview') {
      const { runHarnessPreview } = lazy(() => { const { runHarnessPreview } = require('./commands/harness-preview'); return { runHarnessPreview }; });
      result = await runHarnessPreview({ args, options, logger: commandLogger, t });
    } else if (command === 'verify:gate' || command === 'verify-gate') {
      result = await runVerifyGate({ args, options, logger: commandLogger, t });

    } else if (command === 'brief:validate' || command === 'brief-validate') {
      result = await runBriefValidate({ args, options, logger: commandLogger });
    } else if (command === 'intake:ask' || command === 'intake-ask') {
      result = await runIntakeAsk({ args, options, logger: commandLogger });
    } else if (command === 'preflight:context' || command === 'preflight-context') {
      result = await runPreflightContext({ args, options, logger: commandLogger });
    } else if (command === 'context:compact' || command === 'context-compact') {
      result = await runContextCompact({ args, options, logger: commandLogger });
    } else if (command === 'squad:scaffold' || command === 'squad-scaffold') {
      result = await runSquadScaffold({ args, options, logger: commandLogger });
    } else if (command === 'squad:preflight' || command === 'squad-preflight') {
      result = await runSquadPreflight({ args, options, logger: commandLogger });
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
    } else if (command === 'learning:auto-promote' || command === 'learning-auto-promote') {
      result = await runLearningAutoPromote({ args, options, logger: commandLogger });
    } else if (command === 'spec:sync' || command === 'spec-sync') {
      result = await runSpecSync({ args, options, logger: commandLogger });
    } else if (command === 'spec:status' || command === 'spec-status') {
      result = await runSpecStatus({ args, options, logger: commandLogger });
    } else if (command === 'spec:checkpoint' || command === 'spec-checkpoint') {
      result = await runSpecCheckpoint({ args, options, logger: commandLogger });
    } else if (command === 'spec:tasks' || command === 'spec-tasks') {
      result = await runSpecTasks({ args, options, logger: commandLogger });
    } else if (command.startsWith('learning:') || command === 'learning') {
      const sub = command === 'learning' ? (options.sub || args[1] || 'list') : command.split(':')[1];
      result = await runLearning({ args, options: { ...options, sub }, logger: commandLogger, t });
    } else if (command === 'plan:bind' || command === 'plan-bind') {
      result = await runImplementationPlan({ args, options: { ...options, sub: 'bind' }, logger: commandLogger, t });
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
    } else if (command === 'host:signature' || command === 'host-signature') {
      result = await runHostSignature({ args, options, logger: commandLogger, t });
    } else if (command === 'scaffold:complete' || command === 'scaffold-complete') {
      result = await runScaffoldComplete({ args, options, logger: commandLogger, t });
    } else if (command === 'deliver') {
      result = await runDeliver({ args, options, logger: commandLogger, t });
    } else if (command === 'output-strategy:export' || command === 'output-strategy-export') {
      result = await runOutputStrategyExport({ args, options, logger: commandLogger, t });
    } else if (command === 'output-strategy:import' || command === 'output-strategy-import') {
      result = await runOutputStrategyImport({ args, options, logger: commandLogger, t });
    } else if (command === 'devlog:sync' || command === 'devlog-sync') {
      result = await runDevlogSync({ args, options, logger: commandLogger, t });
    } else if (command === 'hooks:emit' || command === 'hooks-emit') {
      result = await runHooksEmit({ args, options, logger: commandLogger });
    } else if (command === 'hooks:recap' || command === 'hooks-recap') {
      result = await runHooksRecap({ args, options, logger: commandLogger });
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
    } else if (command === 'memory:search' || command === 'memory-search') {
      result = await runMemorySearch({ args, options, logger: commandLogger, t });
    } else if (command === 'memory:archive' || command === 'memory-archive') {
      result = await runMemoryArchive({ args, options, logger: commandLogger, t });
    } else if (command === 'memory:restore' || command === 'memory-restore') {
      result = await runMemoryRestore({ args, options, logger: commandLogger, t });
    } else if (command === 'memory:trim' || command === 'memory-trim') {
      result = await runMemoryTrim({ args, options, logger: commandLogger, t });
    } else if (command === 'memory:reflect-prepare' || command === 'memory-reflect-prepare') {
      result = await runMemoryReflectPrepare({ args, options, logger: commandLogger });
    } else if (command === 'memory:reflect-commit' || command === 'memory-reflect-commit') {
      result = await runMemoryReflectCommit({ args, options, logger: commandLogger });
    } else if (command === 'scout:prep' || command === 'scout-prep') {
      result = await runScoutPrep({ args, options, logger: commandLogger });
    } else if (command === 'scout:validate' || command === 'scout-validate') {
      result = await runScoutValidate({ args, options, logger: commandLogger });
    } else if (command === 'scout:commit' || command === 'scout-commit') {
      result = await runScoutCommit({ args, options, logger: commandLogger });
    } else if (command === 'notify') {
      result = await runNotify({ args, options, logger: commandLogger });
    } else if (command === 'runtime:storage' || command === 'runtime-storage') {
      result = await runRuntimeStorage({ args, options, logger: commandLogger, t });
    } else if (command === 'runtime:prune' || command === 'runtime-prune') {
      result = await runRuntimePrune({ args, options, logger: commandLogger, t });
    } else if (command === 'runtime:compact' || command === 'runtime-compact') {
      result = await runRuntimeCompact({ args, options, logger: commandLogger, t });
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
    } else if (command === 'hygiene:scan' || command === 'hygiene-scan') {
      result = await runHygieneScan({ args, options, logger: commandLogger });
    } else if (command === 'evidence:prune' || command === 'evidence-prune') {
      result = await runEvidencePrune({ args, options, logger: commandLogger });
    } else if (command === 'storage:triage' || command === 'storage-triage') {
      result = await runStorageTriage({ args, options, logger: commandLogger });
    } else if (command === 'context:trim' || command === 'context-trim') {
      result = await runContextTrim({ args, options, logger: commandLogger });
    } else if (command === 'context:search' || command === 'context-search') {
      result = await runContextSearch({ args, options, logger: commandLogger, t });
    } else if (
      command === 'context:index' ||
      command === 'context-index' ||
      command === 'context:search:index' ||
      command === 'context-search-index'
    ) {
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
    } else if (command === 'verification:plan' || command === 'verification-plan') {
      result = await runVerificationPlan({ args, options, logger: commandLogger });
    } else if (command === 'delegation:plan' || command === 'delegation-plan') {
      result = await runDelegationPlan({ args, options, logger: commandLogger });
    } else if (command === 'delegation:run' || command === 'delegation-run') {
      result = await runDelegationRun({ args, options, logger: commandLogger });
    } else if (command.startsWith('agent:execution:') || command.startsWith('agent-execution-')) {
      const sub = command.replace(/^agent:execution:|^agent-execution-/, '');
      result = await runAgentExecution({ args, options: { ...options, sub }, logger: commandLogger });
    } else if (command.startsWith('execution:') || command.startsWith('execution-')) {
      const sub = command.replace(/^execution:|^execution-/, '');
      result = await runExecution({ args, options: { ...options, sub }, logger: commandLogger });
    } else if (command === 'prototype:check' || command === 'prototype-check') {
      result = await runPrototypeCheck({ args, options, logger: commandLogger });
    } else if (command === 'verify:implementation' || command === 'verify-implementation') {
      result = await runVerifyImplementation({ args, options, logger: commandLogger });
    } else if (command === 'sizing') {
      result = await runSizing({ args, options, logger: commandLogger });
    } else if (command === 'detect:test-runner' || command === 'detect-test-runner') {
      result = await runDetectTestRunner({ args, options, logger: commandLogger });
    } else if (command === 'pulse:update' || command === 'pulse-update') {
      result = await runPulseUpdate({ args, options, logger: commandLogger });
    } else if (command === 'agent:epilogue' || command === 'agent-epilogue') {
      result = await runAgentEpilogue({ args, options, logger: commandLogger, t });
    } else if (
      command === 'state:save' ||
      command === 'state-save' ||
      command === 'dev:state:write' ||
      command === 'dev-state-write'
    ) {
      result = await runStateSave({ args, options, logger: commandLogger });
    } else if (command === 'state:reset' || command === 'state-reset') {
      result = await runStateReset({ args, options, logger: commandLogger });
    } else if (command === 'op:identity' || command === 'op-identity') {
      result = await runOpIdentity({ args, options, logger: commandLogger });
    } else if (command === 'op:capture' || command === 'op-capture') {
      result = await runOpCapture({ args, options, logger: commandLogger });
    } else if (command === 'observe') {
      result = await runObserve({ args, options, logger: commandLogger });
    } else if (command === 'observation:list' || command === 'observation-list') {
      result = await runObservationList({ args, options, logger: commandLogger });
    } else if (command === 'observation:resolve' || command === 'observation-resolve') {
      result = await runObservationResolve({ args, options, logger: commandLogger });
    } else if (command === 'op:promote' || command === 'op-promote') {
      result = await runOpPromote({ args, options, logger: commandLogger });
    } else if (command === 'op:forget' || command === 'op-forget') {
      result = await runOpForget({ args, options, logger: commandLogger });
    } else if (command === 'op:list' || command === 'op-list') {
      result = await runOpList({ args, options, logger: commandLogger });
    } else if (command === 'op:show' || command === 'op-show') {
      result = await runOpShow({ args, options, logger: commandLogger });
    } else if (command === 'op:reinforce' || command === 'op-reinforce') {
      result = await runOpReinforce({ args, options, logger: commandLogger });
    } else if (command === 'op:migrate' || command === 'op-migrate') {
      result = await runOpMigrate({ args, options, logger: commandLogger });
    } else if (command === 'feature:closure' || command === 'feature-closure') {
      result = await runFeatureClosure({ args, options, logger: commandLogger });
    } else if (command === 'feature:close' || command === 'feature-close') {
      result = await runFeatureClose({ args, options, logger: commandLogger });
    } else if (command === 'feature:archive' || command === 'feature-archive') {
      if (options.sweep) {
        result = await runFeatureSweep({ args, options, logger: commandLogger });
      } else {
        result = await runFeatureArchive({ args, options, logger: commandLogger });
      }
    } else if (command === 'feature:sweep' || command === 'feature-sweep') {
      result = await runFeatureSweep({ args, options, logger: commandLogger });
    } else if (command === 'feature:export' || command === 'feature-export') {
      result = await runFeatureExport({ args, options, logger: commandLogger });
    } else if (command === 'feature:current' || command === 'feature-current') {
      result = await runFeatureCurrent({ args, options, logger: commandLogger });
    } else if (command === 'feature:trace' || command === 'feature-trace') {
      result = await runFeatureTrace({ args, options, logger: commandLogger });
    } else if (command === 'feature:summary' || command === 'feature-summary') {
      const { runFeatureSummary } = lazy(() => { const { runFeatureSummary } = require('./commands/feature-summary'); return { runFeatureSummary }; });
      result = await runFeatureSummary({ args, options, logger: commandLogger });
    } else if (command === 'feature:acknowledge' || command === 'feature-acknowledge') {
      const { runFeatureAcknowledge } = lazy(() => { const { runFeatureAcknowledge } = require('./commands/feature-summary'); return { runFeatureAcknowledge }; });
      result = await runFeatureAcknowledge({ args, options, logger: commandLogger });
    } else if (command === 'decision:add' || command === 'decision-add') {
      const { runDecisionAdd } = lazy(() => { const { runDecisionAdd } = require('./commands/decision'); return { runDecisionAdd }; });
      result = await runDecisionAdd({ args, options, logger: commandLogger });
    } else if (command === 'decision:resolve' || command === 'decision-resolve') {
      const { runDecisionResolve } = lazy(() => { const { runDecisionResolve } = require('./commands/decision'); return { runDecisionResolve }; });
      result = await runDecisionResolve({ args, options, logger: commandLogger });
    } else if (command === 'decision:list' || command === 'decision-list') {
      const { runDecisionList } = lazy(() => { const { runDecisionList } = require('./commands/decision'); return { runDecisionList }; });
      result = await runDecisionList({ args, options, logger: commandLogger });
    } else if (command === 'decide') {
      const { runDecide } = lazy(() => { const { runDecide } = require('./commands/decide'); return { runDecide }; });
      result = await runDecide({ args, options, logger: commandLogger });
    } else if (command === 'feature:diff' || command === 'feature-diff') {
      result = await runFeatureDiff({ args, options, logger: commandLogger });
    } else if (command === 'workflow:mode' || command === 'workflow-mode') {
      result = await runWorkflowMode({ args, options, logger: commandLogger });
    } else if (command === 'genome:apply' || command === 'genome-apply') {
      result = await runGenomeApply({ args, options, logger: commandLogger });
    } else if (command === 'setup:detect' || command === 'setup-detect') {
      result = await runSetupDetect({ args, options, logger: commandLogger });
    } else if (command === 'pentester:coverage' || command === 'pentester-coverage') {
      result = await runPentesterCoverage({ args, options, logger: commandLogger, t });
    } else if (command === 'profiler:coverage' || command === 'profiler-coverage') {
      result = await runProfilerCoverage({ args, options, logger: commandLogger });
    } else if (command === 'feature:list' || command === 'feature-list') {
      result = await runFeatureList({ args, options, logger: commandLogger, t });
    } else if (command === 'feature:register' || command === 'feature-register') {
      result = await runFeatureRegister({ args, options, logger: commandLogger });
    } else if (command === 'feature:tidy' || command === 'feature-tidy') {
      result = await runFeatureTidy({ args, options, logger: commandLogger });
    } else if (command === 'feature:triage' || command === 'feature-triage') {
      result = await runFeatureTriage({ args, options, logger: commandLogger });
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
    } else if (command === 'ac:test-audit' || command === 'ac-test-audit') {
      result = await runAcTestAudit({ args, options, logger: commandLogger });
    } else if (command === 'sdd:benchmark' || command === 'sdd-benchmark') {
      result = await runSddBenchmark({ args, options, logger: commandLogger });
    } else if (command === 'benchmark:bootstrap' || command === 'benchmark-bootstrap') {
      result = await runBenchmarkBootstrap({ args, options, logger: commandLogger });
    } else if (command === 'gate:check' || command === 'gate-check') {
      result = await runGateCheck({ args, options, logger: commandLogger });
    } else if (command === 'gate:approve' || command === 'gate-approve') {
      result = await runGateApprove({ args, options, logger: commandLogger });
    } else if (command === 'artifact:validate' || command === 'artifact-validate') {
      result = await runArtifactValidate({ args, options, logger: commandLogger });
    } else if (command === 'spec:analyze' || command === 'spec-analyze') {
      const { runSpecAnalyze } = lazy(() => { const { runSpecAnalyze } = require('./commands/spec-analyze'); return { runSpecAnalyze }; });
      result = await runSpecAnalyze({ args, options, logger: commandLogger });
    } else if (command === 'forge:compile' || command === 'forge-compile') {
      const { runForgeCompile } = lazy(() => { const { runForgeCompile } = require('./commands/forge-compile'); return { runForgeCompile }; });
      result = await runForgeCompile({ args, options, logger: commandLogger });
    } else if (command === 'workflow:execute' || command === 'workflow-execute') {
      result = await runWorkflowExecute({ args, options, logger: commandLogger });
    } else if (command.startsWith('review-cycle:') || command.startsWith('review-cycle-')) {
      const sub = command.replace(/^review-cycle[:-]/, '');
      result = await runReviewCycle({ args, options: { ...options, sub }, logger: commandLogger, t });
    } else if (command === 'runner:queue:from-plan' || command === 'runner-queue-from-plan') {
      result = await runRunnerQueueFromPlan({ args, options, logger: commandLogger });
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
    } else if (command === 'briefing:sources' || command === 'briefing-sources') {
      result = await runBriefingSources({ args, options, logger: commandLogger, t });
    } else if (command === 'briefing:approve' || command === 'briefing-approve') {
      result = await runBriefingApprove({ args, options, logger: commandLogger });
    } else if (command === 'briefing:unapprove' || command === 'briefing-unapprove') {
      result = await runBriefingUnapprove({ args, options, logger: commandLogger });
    } else if (command === 'briefing:review' || command === 'briefing-review') {
      result = await runBriefingReview({ args, options, logger: commandLogger });
    } else if (command === 'briefing:apply-feedback' || command === 'briefing-apply-feedback') {
      result = await runBriefingApplyFeedback({ args, options, logger: commandLogger });
    } else if (command === 'briefing:feedback' || command === 'briefing-feedback') {
      result = await runBriefingFeedback({ args, options, logger: commandLogger });
    } else if (command === 'briefing:migrate-lineage' || command === 'briefing-migrate-lineage') {
      result = await runBriefingMigrateLineage({ args, options, logger: commandLogger, t });
    } else if (command === 'exploration:init' || command === 'exploration-init') {
      result = await runExplorationInit({ args, options, logger: commandLogger });
    } else if (command === 'exploration:configure' || command === 'exploration-configure') {
      result = await runExplorationConfigure({ args, options, logger: commandLogger });
    } else if (command === 'exploration:references' || command === 'exploration-references') {
      result = await runExplorationReferences({ args, options, logger: commandLogger });
    } else if (command === 'exploration:intake' || command === 'exploration-intake') {
      result = await runExplorationIntake({ args, options, logger: commandLogger });
    } else if (command === 'exploration:scan' || command === 'exploration-scan') {
      result = await runExplorationScan({ args, options, logger: commandLogger });
    } else if (command === 'exploration:add-run' || command === 'exploration-add-run') {
      result = await runExplorationAddRun({ args, options, logger: commandLogger });
    } else if (command === 'exploration:record' || command === 'exploration-record') {
      result = await runExplorationRecord({ args, options, logger: commandLogger });
    } else if (command === 'exploration:validate' || command === 'exploration-validate') {
      result = await runExplorationValidate({ args, options, logger: commandLogger });
    } else if (command === 'exploration:status' || command === 'exploration-status') {
      result = await runExplorationStatus({ args, options, logger: commandLogger });
    } else if (command === 'exploration:review' || command === 'exploration-review') {
      result = await runExplorationReview({ args, options, logger: commandLogger });
    } else if (command === 'exploration:select' || command === 'exploration-select') {
      result = await runExplorationSelect({ args, options, logger: commandLogger });
    } else if (command === 'exploration:promote' || command === 'exploration-promote') {
      result = await runExplorationPromote({ args, options, logger: commandLogger });
    } else if (command === 'exploration:run' || command === 'exploration-run') {
      result = await runExplorationRun({ args, options, logger: commandLogger });
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
      // The session-start recall (`op:list --titles-only`) is read on every agent activation: compact.
      const compact = (command === 'op:list' || command === 'op-list') && Boolean(options['titles-only']);
      writeJson(result || { ok: true }, { compact });
    }

    // A failed command must fail the process in both human and JSON modes.
    // Previously this propagation only ran for registered JSON commands,
    // making validation errors such as `workflow:heal` exit successfully.
    if (result && typeof result.exitCode === 'number') {
      process.exitCode = result.exitCode;
    } else if (result && Object.prototype.hasOwnProperty.call(result, 'ok') && !result.ok) {
      process.exitCode = 1;
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
