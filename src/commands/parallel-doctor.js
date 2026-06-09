'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const { validateProjectContextFile } = require('../context');
const { exists, ensureDir } = require('../utils');
const {
  parseWorkers,
  renderSharedDecisions,
  renderAgentStatus,
  PREREQUISITE_FILES
} = require('./parallel-init');
const {
  WORKSPACE_MANIFEST_RELATIVE_PATH,
  OWNERSHIP_MAP_RELATIVE_PATH,
  MERGE_PLAN_RELATIVE_PATH,
  buildLaneOwnershipEntries,
  buildWorkspaceManifest,
  buildOwnershipMap,
  buildMergePlan,
  collectOwnershipConflicts,
  collectWritePathConflicts,
  extractStatusScopeItems,
  extractStatusDependencyItems,
  extractStatusWritePathItems,
  extractStatusMergeRank,
  buildMachineSyncReport,
  collectDependencyIssues
} = require('../parallel-workspace');

const DEFAULT_FIX_WORKERS = 3;

function makeCheck(id, ok, severity, message, hint = '') {
  return {
    id,
    ok: Boolean(ok),
    severity,
    message: String(message || ''),
    hint: String(hint || '')
  };
}

function buildLaneFilename(index) {
  return `agent-${index}.status.md`;
}

function parseLaneIndex(fileName) {
  const match = String(fileName || '').match(/^agent-(\d+)\.status\.md$/);
  if (!match) return null;
  const value = Number(match[1]);
  if (!Number.isFinite(value) || value <= 0) return null;
  return Math.floor(value);
}

function laneRange(count) {
  const output = [];
  for (let i = 1; i <= count; i += 1) {
    output.push(i);
  }
  return output;
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

function formatCheckPrefix(check, t) {
  if (check.ok) return t('parallel_doctor.prefix_ok');
  if (check.severity === 'warn') return t('parallel_doctor.prefix_warn');
  return t('parallel_doctor.prefix_fail');
}

function extractMetadata(content, key, fallback = '') {
  const regex = new RegExp(`^-\\s*${key}:\\s*(.*)$`, 'im');
  const match = String(content || '').match(regex);
  if (!match) return fallback;
  return String(match[1] || '').trim() || fallback;
}

async function collectPrerequisites(targetDir) {
  const items = [];
  for (const rel of PREREQUISITE_FILES) {
    items.push({
      path: rel,
      exists: await exists(path.join(targetDir, rel))
    });
  }
  return items;
}

function resolveExpectedWorkers(state, workersOption) {
  if (workersOption !== undefined && workersOption !== null) return workersOption;
  if (state.laneIndices.length > 0) return Math.max(...state.laneIndices);
  return DEFAULT_FIX_WORKERS;
}

async function inspectParallelState(targetDir, workersOption) {
  const parallelDir = path.join(targetDir, '.aioson/context/parallel');
  const dirExists = await exists(parallelDir);
  const entries = dirExists ? await fs.readdir(parallelDir) : [];
  const sharedExists = entries.includes('shared-decisions.md');
  const manifestExists = await exists(path.join(targetDir, WORKSPACE_MANIFEST_RELATIVE_PATH));
  const ownershipExists = await exists(path.join(targetDir, OWNERSHIP_MAP_RELATIVE_PATH));
  const mergePlanExists = await exists(path.join(targetDir, MERGE_PLAN_RELATIVE_PATH));
  const laneIndices = entries
    .map(parseLaneIndex)
    .filter((value) => value !== null)
    .sort((a, b) => a - b);
  const laneFiles = laneIndices.map((index) => buildLaneFilename(index));

  const expectedWorkers = resolveExpectedWorkers(
    {
      laneIndices
    },
    workersOption
  );
  const expectedLaneIndices = laneRange(expectedWorkers);
  const missingLaneIndices = expectedLaneIndices.filter((index) => !laneIndices.includes(index));

  return {
    parallelDir,
    dirExists,
    entries,
    sharedExists,
    manifestExists,
    ownershipExists,
    mergePlanExists,
    laneIndices,
    laneFiles,
    expectedWorkers,
    expectedLaneIndices,
    missingLaneIndices
  };
}

async function analyzeParallelState(targetDir, state) {
  const emptyAnalysis = {
    laneEntries: [],
    ownershipConflicts: [],
    dependencies: {
      declaredCount: 0,
      invalidCount: 0,
      blockedCount: 0,
      orderViolationCount: 0,
      invalid: [],
      blocked: [],
      orderViolations: []
    },
    writeScope: {
      laneCount: 0,
      totalPathCount: 0,
      uncoveredAssignedLaneCount: 0,
      invalidPatternCount: 0,
      invalidPatterns: [],
      conflictCount: 0,
      conflicts: []
    },
    sync: {
      workspaceManifestInSync: false,
      ownershipMapInSync: false,
      mergePlanInSync: false,
      staleFiles: ['workspace.manifest.json', 'ownership-map.json', 'merge-plan.json']
    }
  };

  if (!state.dirExists || state.laneIndices.length === 0) {
    return emptyAnalysis;
  }

  const laneStates = [];
  for (const index of state.laneIndices) {
    const content = await fs.readFile(path.join(state.parallelDir, buildLaneFilename(index)), 'utf8');
    laneStates.push({
      lane: index,
      owner: extractMetadata(content, 'owner', `lane-${index}`),
      status: extractMetadata(content, 'status', 'pending'),
      scopeItems: extractStatusScopeItems(content),
      dependencyItems: extractStatusDependencyItems(content),
      writePathItems: extractStatusWritePathItems(content),
      mergeRank: extractStatusMergeRank(content, index)
    });
  }

  const laneEntries = buildLaneOwnershipEntries(
    laneStates.map((lane) => ({
      lane: lane.lane,
      items: lane.scopeItems,
      owner: lane.owner,
      dependsOn: lane.dependencyItems,
      writePaths: lane.writePathItems,
      mergeRank: lane.mergeRank
    }))
  );

  const writeScope = collectWritePathConflicts(laneStates);
  writeScope.laneCount = laneStates.filter((lane) => Array.isArray(lane.writePathItems) && lane.writePathItems.length > 0).length;
  writeScope.totalPathCount = laneStates.reduce(
    (sum, lane) => sum + (Array.isArray(lane.writePathItems) ? lane.writePathItems.length : 0),
    0
  );
  writeScope.uncoveredAssignedLaneCount = laneStates.filter(
    (lane) => Array.isArray(lane.scopeItems) && lane.scopeItems.length > 0 && (!lane.writePathItems || lane.writePathItems.length === 0)
  ).length;

  let workspaceManifest = null;
  let ownershipMap = null;
  let mergePlan = null;
  try {
    workspaceManifest = state.manifestExists
      ? JSON.parse(await fs.readFile(path.join(targetDir, WORKSPACE_MANIFEST_RELATIVE_PATH), 'utf8'))
      : null;
  } catch {
    workspaceManifest = null;
  }
  try {
    ownershipMap = state.ownershipExists
      ? JSON.parse(await fs.readFile(path.join(targetDir, OWNERSHIP_MAP_RELATIVE_PATH), 'utf8'))
      : null;
  } catch {
    ownershipMap = null;
  }
  try {
    mergePlan = state.mergePlanExists
      ? JSON.parse(await fs.readFile(path.join(targetDir, MERGE_PLAN_RELATIVE_PATH), 'utf8'))
      : null;
  } catch {
    mergePlan = null;
  }

  return {
    laneEntries,
    ownershipConflicts: collectOwnershipConflicts({ lanes: laneEntries }),
    writeScope,
    dependencies: collectDependencyIssues({
      lanes: laneStates,
      mergeOrder: mergePlan && Array.isArray(mergePlan.order) ? mergePlan.order : []
    }),
    sync: buildMachineSyncReport({
      laneEntries,
      workspaceManifest,
      ownershipMap,
      mergePlan
    })
  };
}

function buildChecks(context, state, prerequisites, workersOption, force, analysis, t) {
  const checks = [];

  checks.push(
    makeCheck(
      'context.exists',
      context.exists,
      'error',
      context.exists
        ? t('parallel_doctor.check_context_exists_ok')
        : t('parallel_doctor.check_context_exists_missing'),
      context.exists ? '' : t('parallel_doctor.check_context_exists_hint')
    )
  );

  checks.push(
    makeCheck(
      'context.parsed',
      context.parsed,
      'error',
      context.parsed
        ? t('parallel_doctor.check_context_parsed_ok')
        : t('parallel_doctor.check_context_parsed_invalid'),
      context.parsed ? '' : t('parallel_doctor.check_context_parsed_hint')
    )
  );

  const classification = String(context.data && context.data.classification ? context.data.classification : '');
  const isMedium = classification === 'MEDIUM';
  const classificationOk = isMedium || force;
  checks.push(
    makeCheck(
      'context.classification',
      classificationOk,
      'error',
      classificationOk
        ? t('parallel_doctor.check_context_classification_ok', {
            classification: classification || t('parallel_doctor.classification_unknown')
          })
        : t('parallel_doctor.check_context_classification_invalid', {
            classification: classification || t('parallel_doctor.classification_unknown')
          }),
      classificationOk ? '' : t('parallel_doctor.check_context_classification_hint')
    )
  );

  checks.push(
    makeCheck(
      'parallel.dir',
      state.dirExists,
      'error',
      state.dirExists
        ? t('parallel_doctor.check_parallel_dir_ok')
        : t('parallel_doctor.check_parallel_dir_missing'),
      state.dirExists ? '' : t('parallel_doctor.check_parallel_dir_hint')
    )
  );

  checks.push(
    makeCheck(
      'parallel.shared',
      state.sharedExists,
      'error',
      state.sharedExists
        ? t('parallel_doctor.check_parallel_shared_ok')
        : t('parallel_doctor.check_parallel_shared_missing'),
      state.sharedExists ? '' : t('parallel_doctor.check_parallel_shared_hint')
    )
  );

  checks.push(
    makeCheck(
      'parallel.manifest',
      state.manifestExists,
      'error',
      state.manifestExists
        ? t('parallel_doctor.check_parallel_manifest_ok')
        : t('parallel_doctor.check_parallel_manifest_missing'),
      state.manifestExists ? '' : t('parallel_doctor.check_parallel_manifest_hint')
    )
  );

  checks.push(
    makeCheck(
      'parallel.ownership',
      state.ownershipExists,
      'error',
      state.ownershipExists
        ? t('parallel_doctor.check_parallel_ownership_ok')
        : t('parallel_doctor.check_parallel_ownership_missing'),
      state.ownershipExists ? '' : t('parallel_doctor.check_parallel_ownership_hint')
    )
  );

  checks.push(
    makeCheck(
      'parallel.merge_plan',
      state.mergePlanExists,
      'error',
      state.mergePlanExists
        ? t('parallel_doctor.check_parallel_merge_ok')
        : t('parallel_doctor.check_parallel_merge_missing'),
      state.mergePlanExists ? '' : t('parallel_doctor.check_parallel_merge_hint')
    )
  );

  checks.push(
    makeCheck(
      'parallel.machine_sync',
      analysis.sync.staleFiles.length === 0,
      'error',
      analysis.sync.staleFiles.length === 0
        ? t('parallel_doctor.check_machine_sync_ok')
        : t('parallel_doctor.check_machine_sync_stale', {
            files: analysis.sync.staleFiles.join(', ')
          }),
      analysis.sync.staleFiles.length === 0 ? '' : t('parallel_doctor.check_machine_sync_hint')
    )
  );

  checks.push(
    makeCheck(
      'parallel.ownership_conflicts',
      analysis.ownershipConflicts.length === 0,
      'error',
      analysis.ownershipConflicts.length === 0
        ? t('parallel_doctor.check_ownership_conflicts_ok')
        : t('parallel_doctor.check_ownership_conflicts_found', {
            count: analysis.ownershipConflicts.length
          }),
      analysis.ownershipConflicts.length === 0 ? '' : t('parallel_doctor.check_ownership_conflicts_hint')
    )
  );

  checks.push(
    makeCheck(
      'parallel.write_scope.present',
      analysis.writeScope.uncoveredAssignedLaneCount === 0,
      'warn',
      analysis.writeScope.uncoveredAssignedLaneCount === 0
        ? t('parallel_doctor.check_write_scope_present_ok')
        : t('parallel_doctor.check_write_scope_present_missing', {
            count: analysis.writeScope.uncoveredAssignedLaneCount
          }),
      analysis.writeScope.uncoveredAssignedLaneCount === 0 ? '' : t('parallel_doctor.check_write_scope_present_hint')
    )
  );

  checks.push(
    makeCheck(
      'parallel.write_scope.valid',
      analysis.writeScope.invalidPatternCount === 0,
      'error',
      analysis.writeScope.invalidPatternCount === 0
        ? t('parallel_doctor.check_write_scope_valid_ok')
        : t('parallel_doctor.check_write_scope_valid_invalid', {
            count: analysis.writeScope.invalidPatternCount
          }),
      analysis.writeScope.invalidPatternCount === 0 ? '' : t('parallel_doctor.check_write_scope_valid_hint')
    )
  );

  checks.push(
    makeCheck(
      'parallel.write_scope.conflicts',
      analysis.writeScope.conflictCount === 0,
      'error',
      analysis.writeScope.conflictCount === 0
        ? t('parallel_doctor.check_write_scope_conflicts_ok')
        : t('parallel_doctor.check_write_scope_conflicts_found', {
            count: analysis.writeScope.conflictCount
          }),
      analysis.writeScope.conflictCount === 0 ? '' : t('parallel_doctor.check_write_scope_conflicts_hint')
    )
  );

  checks.push(
    makeCheck(
      'parallel.dependencies.valid',
      analysis.dependencies.invalidCount === 0,
      'error',
      analysis.dependencies.invalidCount === 0
        ? t('parallel_doctor.check_dependencies_valid_ok')
        : t('parallel_doctor.check_dependencies_valid_invalid', {
            count: analysis.dependencies.invalidCount
          }),
      analysis.dependencies.invalidCount === 0 ? '' : t('parallel_doctor.check_dependencies_valid_hint')
    )
  );

  checks.push(
    makeCheck(
      'parallel.dependencies.blocked',
      analysis.dependencies.blockedCount === 0,
      'warn',
      analysis.dependencies.blockedCount === 0
        ? t('parallel_doctor.check_dependencies_blocked_ok')
        : t('parallel_doctor.check_dependencies_blocked_found', {
            count: analysis.dependencies.blockedCount
          }),
      analysis.dependencies.blockedCount === 0 ? '' : t('parallel_doctor.check_dependencies_blocked_hint')
    )
  );

  checks.push(
    makeCheck(
      'parallel.merge_order',
      analysis.dependencies.orderViolationCount === 0,
      'error',
      analysis.dependencies.orderViolationCount === 0
        ? t('parallel_doctor.check_merge_order_ok')
        : t('parallel_doctor.check_merge_order_invalid', {
            count: analysis.dependencies.orderViolationCount
          }),
      analysis.dependencies.orderViolationCount === 0 ? '' : t('parallel_doctor.check_merge_order_hint')
    )
  );

  checks.push(
    makeCheck(
      'parallel.lanes.present',
      state.laneIndices.length > 0,
      'error',
      state.laneIndices.length > 0
        ? t('parallel_doctor.check_lanes_present_ok', {
            count: state.laneIndices.length
          })
        : t('parallel_doctor.check_lanes_present_missing'),
      state.laneIndices.length > 0 ? '' : t('parallel_doctor.check_lanes_present_hint')
    )
  );

  checks.push(
    makeCheck(
      'parallel.lanes.sequence',
      state.missingLaneIndices.length === 0,
      'error',
      state.missingLaneIndices.length === 0
        ? t('parallel_doctor.check_lanes_sequence_ok', {
            workers: state.expectedWorkers
          })
        : t('parallel_doctor.check_lanes_sequence_missing', {
            lanes: state.missingLaneIndices.join(', ')
          }),
      state.missingLaneIndices.length === 0 ? '' : t('parallel_doctor.check_lanes_sequence_hint')
    )
  );

  if (workersOption !== undefined && workersOption !== null) {
    checks.push(
      makeCheck(
        'parallel.workers.option',
        state.expectedWorkers === workersOption,
        'info',
        t('parallel_doctor.check_workers_option', { workers: workersOption })
      )
    );
  }

  const missingPrereq = prerequisites.filter((item) => !item.exists).length;
  checks.push(
    makeCheck(
      'parallel.prerequisites',
      missingPrereq === 0,
      missingPrereq === 0 ? 'info' : 'warn',
      missingPrereq === 0
        ? t('parallel_doctor.check_prereq_ok')
        : t('parallel_doctor.check_prereq_missing', { count: missingPrereq }),
      missingPrereq === 0 ? '' : t('parallel_doctor.check_prereq_hint')
    )
  );

  return checks;
}

async function applyParallelFixes(targetDir, context, state, options) {
  // accept both --dry-run (kebab, as the parser stores it) and --dryRun (camel)
  const dryRun = Boolean(options.dryRun || options['dry-run']);
  const generatedAt = new Date().toISOString();
  const projectName =
    String((context.data && context.data.project_name) || '').trim() || path.basename(targetDir) || 'project';
  const classification = String((context.data && context.data.classification) || 'MEDIUM');
  const actions = [];
  let changedCount = 0;

  if (!state.dirExists) {
    if (!dryRun) {
      await ensureDir(state.parallelDir);
    }
    actions.push({
      id: 'parallel_dir',
      applied: true,
      count: 1
    });
    changedCount += 1;
  } else {
    actions.push({
      id: 'parallel_dir',
      applied: false,
      skipped: true,
      count: 0
    });
  }

  if (!state.sharedExists) {
    const sharedPath = path.join(state.parallelDir, 'shared-decisions.md');
    const content = renderSharedDecisions({
      projectName,
      classification,
      workers: state.expectedWorkers,
      generatedAt
    });
    if (!dryRun) {
      await ensureDir(path.dirname(sharedPath));
      await fs.writeFile(sharedPath, content, 'utf8');
    }
    actions.push({
      id: 'shared_decisions',
      applied: true,
      count: 1
    });
    changedCount += 1;
  } else {
    actions.push({
      id: 'shared_decisions',
      applied: false,
      skipped: true,
      count: 0
    });
  }

  if (state.missingLaneIndices.length > 0) {
    for (const index of state.missingLaneIndices) {
      const lanePath = path.join(state.parallelDir, buildLaneFilename(index));
      const content = renderAgentStatus({
        index,
        generatedAt
      });
      if (!dryRun) {
        await ensureDir(path.dirname(lanePath));
        await fs.writeFile(lanePath, content, 'utf8');
      }
    }
    actions.push({
      id: 'lane_files',
      applied: true,
      count: state.missingLaneIndices.length
    });
    changedCount += state.missingLaneIndices.length;
  } else {
    actions.push({
      id: 'lane_files',
      applied: false,
      skipped: true,
      count: 0
    });
  }

  const assignmentSeed = [];
  for (const index of state.expectedLaneIndices) {
    const lanePath = path.join(state.parallelDir, buildLaneFilename(index));
    let scopeItems = [];
    let dependencyItems = [];
    let owner = `lane-${index}`;
    let mergeRank = index;
    try {
      const content = await fs.readFile(lanePath, 'utf8');
      scopeItems = extractStatusScopeItems(content);
      dependencyItems = extractStatusDependencyItems(content);
      const writePathItems = extractStatusWritePathItems(content);
      owner = extractMetadata(content, 'owner', owner);
      mergeRank = extractStatusMergeRank(content, index);
      assignmentSeed.push({
        lane: index,
        items: scopeItems,
        owner,
        dependsOn: dependencyItems,
        writePaths: writePathItems,
        mergeRank
      });
    } catch {
      assignmentSeed.push({
        lane: index,
        items: [],
        owner,
        dependsOn: [],
        writePaths: [],
        mergeRank
      });
      continue;
    }
  }
  const laneEntries = buildLaneOwnershipEntries(assignmentSeed);
  let currentWorkspaceManifest = null;
  let currentOwnershipMap = null;
  let currentMergePlan = null;
  try {
    currentWorkspaceManifest = state.manifestExists
      ? JSON.parse(await fs.readFile(path.join(targetDir, WORKSPACE_MANIFEST_RELATIVE_PATH), 'utf8'))
      : null;
  } catch {
    currentWorkspaceManifest = null;
  }
  try {
    currentOwnershipMap = state.ownershipExists
      ? JSON.parse(await fs.readFile(path.join(targetDir, OWNERSHIP_MAP_RELATIVE_PATH), 'utf8'))
      : null;
  } catch {
    currentOwnershipMap = null;
  }
  try {
    currentMergePlan = state.mergePlanExists
      ? JSON.parse(await fs.readFile(path.join(targetDir, MERGE_PLAN_RELATIVE_PATH), 'utf8'))
      : null;
  } catch {
    currentMergePlan = null;
  }
  const sync = buildMachineSyncReport({
    laneEntries,
    workspaceManifest: currentWorkspaceManifest,
    ownershipMap: currentOwnershipMap,
    mergePlan: currentMergePlan
  });
  const machineFiles = [
    {
      id: 'workspace_manifest',
      rel: WORKSPACE_MANIFEST_RELATIVE_PATH,
      exists: state.manifestExists,
      inSync: sync.workspaceManifestInSync,
      payload: buildWorkspaceManifest({
        projectName,
        classification,
        workers: state.expectedWorkers,
        generatedAt,
        lanes: laneEntries
      })
    },
    {
      id: 'ownership_map',
      rel: OWNERSHIP_MAP_RELATIVE_PATH,
      exists: state.ownershipExists,
      inSync: sync.ownershipMapInSync,
      payload: buildOwnershipMap({
        generatedAt,
        lanes: laneEntries
      })
    },
    {
      id: 'merge_plan',
      rel: MERGE_PLAN_RELATIVE_PATH,
      exists: state.mergePlanExists,
      inSync: sync.mergePlanInSync,
      payload: buildMergePlan({
        generatedAt,
        lanes: laneEntries
      })
    }
  ];

  let machineFileChanges = 0;
  for (const file of machineFiles) {
    if (file.exists && file.inSync) continue;
    if (!dryRun) {
      await ensureDir(path.dirname(path.join(targetDir, file.rel)));
      await fs.writeFile(path.join(targetDir, file.rel), `${JSON.stringify(file.payload, null, 2)}\n`, 'utf8');
    }
    machineFileChanges += 1;
  }
  actions.push({
    id: 'machine_files',
    applied: machineFileChanges > 0,
    skipped: machineFileChanges === 0,
    count: machineFileChanges
  });
  changedCount += machineFileChanges;

  return {
    dryRun,
    actions,
    changedCount
  };
}

async function runParallelDoctor({ args, options = {}, logger, t }) {
  const targetDir = path.resolve(process.cwd(), args[0] || '.');
  const dryRun = Boolean(options['dry-run']);
  const fix = Boolean(options.fix);
  const force = Boolean(options.force);
  const workersOptionRaw = options.workers;
  const workersOption = workersOptionRaw !== undefined ? parseWorkers(workersOptionRaw) : undefined;
  if (workersOptionRaw !== undefined && workersOption === null) {
    throw new Error(
      t('parallel_doctor.invalid_workers', {
        min: 2,
        max: 6
      })
    );
  }

  const context = await validateProjectContextFile(targetDir);
  const prerequisites = await collectPrerequisites(targetDir);
  let state = await inspectParallelState(targetDir, workersOption);
  let analysis = await analyzeParallelState(targetDir, state);
  let checks = buildChecks(context, state, prerequisites, workersOption, force, analysis, t);
  let fixResult = null;

  if (fix) {
    const classification = String((context.data && context.data.classification) || '');
    if (classification !== 'MEDIUM' && !force) {
      throw new Error(
        t('parallel_doctor.requires_medium', {
          classification: classification || t('parallel_doctor.classification_unknown')
        })
      );
    }
    fixResult = await applyParallelFixes(targetDir, context, state, {
      dryRun
    });

    state = await inspectParallelState(targetDir, workersOption);
    analysis = await analyzeParallelState(targetDir, state);
    checks = buildChecks(context, state, prerequisites, workersOption, force, analysis, t);
  }

  const summary = summarizeChecks(checks);
  const output = {
    ok: summary.failed === 0,
    targetDir,
    workers: state.expectedWorkers,
    fix: {
      enabled: fix,
      dryRun,
      force,
      ...(fixResult
        ? {
            changedCount: fixResult.changedCount,
            actions: fixResult.actions
          }
        : {})
    },
    state: {
      parallelDir: state.parallelDir,
      dirExists: state.dirExists,
      sharedExists: state.sharedExists,
      manifestExists: state.manifestExists,
      ownershipExists: state.ownershipExists,
      mergePlanExists: state.mergePlanExists,
      laneFiles: state.laneFiles,
      laneIndices: state.laneIndices,
      missingLaneIndices: state.missingLaneIndices
    },
    analysis,
    checks,
    summary
  };

  if (options.json) {
    return output;
  }

  logger.log(t('parallel_doctor.report_title', { path: targetDir }));
  for (const check of checks) {
    logger.log(
      t('parallel_doctor.check_line', {
        prefix: formatCheckPrefix(check, t),
        id: check.id,
        message: check.message
      })
    );
    if (check.hint) {
      logger.log(t('parallel_doctor.hint_line', { hint: check.hint }));
    }
  }
  logger.log(
    t('parallel_doctor.summary', {
      passed: summary.passed,
      failed: summary.failed,
      warnings: summary.warnings
    })
  );

  if (fixResult) {
    logger.log(
      dryRun
        ? t('parallel_doctor.fix_summary_dry_run', { count: fixResult.changedCount })
        : t('parallel_doctor.fix_summary', { count: fixResult.changedCount })
    );
  }

  return output;
}

module.exports = {
  runParallelDoctor,
  parseLaneIndex,
  summarizeChecks
};
