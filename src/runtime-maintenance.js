'use strict';

const fs = require('node:fs');

const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_HISTORY_DAYS = 30;
const DEFAULT_OUTPUT_DAYS = 14;
// A row only counts as live work when it moved inside this window. Crashed
// sessions and dead engines leave rows in running/correcting forever; treating
// those as active blocked compaction for good (measured: 92 "running" rows, the
// oldest four months old, none touched in the last day).
const DEFAULT_LIVE_WINDOW_MINUTES = 120;
// Health thresholds. Deletes never shrink the file (auto_vacuum is off), so
// free pages are the dead weight only VACUUM gives back.
const COMPACT_MIN_FREE_BYTES = 8 * 1024 * 1024;
const COMPACT_MIN_FREE_RATIO = 0.25;
const OVERSIZED_LIVE_BYTES = 64 * 1024 * 1024;
const EXECUTION_LIVE_STATES = "'queued', 'spawning', 'running', 'pausing', 'resuming'";

const CATEGORY_BY_TABLE = new Map([
  ['agent_execution_events', 'verbose_telemetry'],
  ['execution_events', 'verbose_telemetry'],
  ['agent_events', 'verbose_telemetry'],
  ['delivery_log', 'verbose_telemetry'],
  ['agent_execution_runs', 'operational_history'],
  ['agent_runs', 'operational_history'],
  ['tasks', 'operational_history'],
  ['runner_queue', 'operational_coordination'],
  ['worker_runs', 'operational_coordination'],
  ['chain_work_items', 'operational_coordination'],
  ['squad_handoffs', 'operational_coordination'],
  ['inter_squad_events', 'operational_coordination'],
  ['squad_daemons', 'operational_coordination'],
  ['artifacts', 'durable_runtime_knowledge'],
  ['content_items', 'rebuildable_index'],
  ['implementation_plans', 'durable_runtime_knowledge'],
  ['plan_phases', 'durable_runtime_knowledge'],
  ['project_learnings', 'durable_runtime_knowledge'],
  ['squad_learnings', 'durable_runtime_knowledge'],
  ['evolution_log', 'durable_runtime_knowledge'],
  ['chain_edges', 'durable_runtime_knowledge']
]);

const PRUNABLE_TABLES = [
  'agent_execution_events',
  'agent_execution_runs',
  'execution_events',
  'agent_events',
  'agent_runs',
  'tasks',
  'content_items',
  'delivery_log',
  'runner_queue',
  'worker_runs'
];

function tableExists(db, table) {
  return Boolean(db.prepare(
    "SELECT 1 FROM sqlite_master WHERE type IN ('table', 'view') AND name = ?"
  ).get(table));
}

function quoteIdentifier(value) {
  return `"${String(value).replace(/"/g, '""')}"`;
}

function positiveDays(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed >= 1 ? parsed : fallback;
}

function resolveRetentionPolicy(options = {}, now = Date.now()) {
  const historyDays = positiveDays(options.historyDays, DEFAULT_HISTORY_DAYS);
  const outputDays = positiveDays(options.outputDays, Math.min(DEFAULT_OUTPUT_DAYS, historyDays));
  return {
    historyDays,
    outputDays,
    historyCutoff: new Date(now - historyDays * DAY_MS).toISOString(),
    outputCutoff: new Date(now - outputDays * DAY_MS).toISOString()
  };
}

function categoryForTable(table) {
  if (CATEGORY_BY_TABLE.has(table)) return CATEGORY_BY_TABLE.get(table);
  if (table.startsWith('project_learnings_fts')) return 'durable_runtime_knowledge';
  return 'catalog_and_configuration';
}

function fileSize(filePath) {
  try {
    return fs.statSync(filePath).size;
  } catch {
    return 0;
  }
}

function tableByteMap(db) {
  const bytes = new Map();
  try {
    const rows = db.prepare(`
      SELECT COALESCE(m.tbl_name, d.name) AS table_name, SUM(d.pgsize) AS bytes
      FROM dbstat d
      LEFT JOIN sqlite_master m ON m.name = d.name
      WHERE d.name NOT LIKE 'sqlite_%'
      GROUP BY COALESCE(m.tbl_name, d.name)
    `).all();
    for (const row of rows) bytes.set(row.table_name, Number(row.bytes || 0));
  } catch {
    // dbstat is optional in some SQLite builds; row counts still remain useful.
  }
  return bytes;
}

function listTableStorage(db) {
  const byteMap = tableByteMap(db);
  return db.prepare(`
    SELECT name
    FROM sqlite_master
    WHERE type = 'table' AND name NOT LIKE 'sqlite_%'
    ORDER BY name
  `).all().map(({ name }) => ({
    table: name,
    category: categoryForTable(name),
    rows: Number(db.prepare(`SELECT COUNT(*) AS count FROM ${quoteIdentifier(name)}`).get().count || 0),
    bytes: byteMap.get(name) || 0
  }));
}

function countWhere(db, table, where, params) {
  if (!tableExists(db, table)) return 0;
  return Number(db.prepare(`SELECT COUNT(*) AS count FROM ${quoteIdentifier(table)} WHERE ${where}`).get(...params).count || 0);
}

// Binds two cutoffs: inactivity of a waiting state, last event of a process state.
function expiredExecutionRunSql(alias) {
  return `((${alias}.state NOT IN (${EXECUTION_LIVE_STATES})
      AND (${alias}.state IN ('passed', 'failed', 'cancelled') OR ${alias}.updated_at < ?))
    OR (${alias}.state IN (${EXECUTION_LIVE_STATES}) AND NOT EXISTS (
      SELECT 1 FROM agent_execution_events recent
      WHERE recent.telemetry_run_id = ${alias}.telemetry_run_id AND recent.created_at >= ?
    )))`;
}

function retentionRules(db, policy) {
  const rules = [
    {
      // Waiting states (correcting, waiting_report, paused) expire by
      // inactivity; a process state with no event inside the window is a dead
      // engine. The run row of a process state is never removed (AC-10).
      key: 'terminal_execution_output',
      table: 'agent_execution_events',
      where: `event_type = 'output' AND created_at < ? AND EXISTS (
        SELECT 1 FROM agent_execution_runs r
        WHERE r.telemetry_run_id = agent_execution_events.telemetry_run_id
          AND ${expiredExecutionRunSql('r')}
      )`,
      params: [policy.outputCutoff, policy.outputCutoff, policy.outputCutoff]
    },
    {
      key: 'terminal_execution_runs',
      table: 'agent_execution_runs',
      where: `updated_at < ? AND state NOT IN (${EXECUTION_LIVE_STATES})`,
      params: [policy.historyCutoff]
    },
    {
      key: 'old_file_content_index',
      table: 'content_items',
      where: `source_path IS NOT NULL AND updated_at < ?
        AND NOT EXISTS (
          SELECT 1 FROM agent_runs r
          WHERE r.run_key = content_items.run_key AND r.status IN ('queued', 'running')
        )
        AND NOT EXISTS (
          SELECT 1 FROM tasks t
          WHERE t.task_key = content_items.task_key AND t.status IN ('queued', 'running')
        )`,
      params: [policy.outputCutoff]
    },
    {
      key: 'old_execution_events',
      table: 'execution_events',
      where: `created_at < ?
        AND NOT EXISTS (
          SELECT 1 FROM agent_runs r
          WHERE r.run_key = execution_events.run_key AND r.status IN ('queued', 'running')
        )
        AND NOT EXISTS (
          SELECT 1 FROM tasks t
          WHERE t.task_key = execution_events.task_key AND t.status IN ('queued', 'running')
        )`,
      params: [policy.historyCutoff]
    },
    {
      key: 'old_agent_events',
      table: 'agent_events',
      where: `created_at < ? AND NOT EXISTS (
        SELECT 1 FROM agent_runs r
        WHERE r.run_key = agent_events.run_key AND r.status IN ('queued', 'running')
      )`,
      params: [policy.historyCutoff]
    },
    {
      key: 'terminal_agent_runs',
      table: 'agent_runs',
      where: `status IN ('completed', 'failed', 'abandoned') AND finished_at < ?
        AND NOT EXISTS (
          SELECT 1 FROM agent_runs child
          WHERE child.parent_run_key = agent_runs.run_key
        )
        AND NOT EXISTS (
          SELECT 1 FROM chain_work_items item
          WHERE item.origin_run_key = agent_runs.run_key
            AND item.status IN ('open', 'claimed', 'in_progress', 'blocked')
        )`,
      params: [policy.historyCutoff]
    },
    {
      key: 'terminal_tasks',
      table: 'tasks',
      where: `status IN ('completed', 'failed', 'abandoned') AND finished_at < ?
        AND NOT EXISTS (
          SELECT 1 FROM tasks child
          WHERE child.parent_task_key = tasks.task_key
        )
        AND NOT EXISTS (
          SELECT 1 FROM agent_runs active_run
          WHERE active_run.task_key = tasks.task_key AND active_run.status IN ('queued', 'running')
        )
        AND NOT EXISTS (
          SELECT 1 FROM agent_runs source_run
          JOIN chain_work_items item ON item.origin_run_key = source_run.run_key
          WHERE source_run.task_key = tasks.task_key
            AND item.status IN ('open', 'claimed', 'in_progress', 'blocked')
        )`,
      params: [policy.historyCutoff]
    },
    {
      key: 'old_delivery_log',
      table: 'delivery_log',
      where: 'created_at < ?',
      params: [policy.historyCutoff]
    },
    {
      key: 'terminal_runner_queue',
      table: 'runner_queue',
      where: "status IN ('completed', 'failed', 'skipped') AND finished_at < ?",
      params: [policy.historyCutoff]
    },
    {
      key: 'terminal_worker_runs',
      table: 'worker_runs',
      where: "status IN ('completed', 'failed') AND completed_at < ?",
      params: [policy.historyCutoff]
    }
  ];
  return rules.filter((rule) => tableExists(db, rule.table));
}

function previewRuntimePrune(db, options = {}) {
  const policy = resolveRetentionPolicy(options, options.now);
  const candidates = retentionRules(db, policy).map((rule) => ({
    key: rule.key,
    table: rule.table,
    rows: countWhere(db, rule.table, rule.where, rule.params)
  }));
  return {
    policy,
    candidates,
    directRows: candidates.reduce((total, item) => total + item.rows, 0),
    note: 'Direct targets only; foreign-key cascades can remove additional child telemetry rows. File-backed content indexes are rebuildable with runtime:ingest; legacy rows without source_path are preserved.'
  };
}

function countTables(db, tables) {
  const counts = {};
  for (const table of tables) {
    if (tableExists(db, table)) {
      counts[table] = Number(db.prepare(`SELECT COUNT(*) AS count FROM ${quoteIdentifier(table)}`).get().count || 0);
    }
  }
  return counts;
}

function pruneRuntimeData(db, options = {}) {
  const policy = resolveRetentionPolicy(options, options.now);
  const before = countTables(db, PRUNABLE_TABLES);
  const direct = {};

  const execute = db.transaction(() => {
    for (const rule of retentionRules(db, policy)) {
      const result = db.prepare(`DELETE FROM ${quoteIdentifier(rule.table)} WHERE ${rule.where}`).run(...rule.params);
      direct[rule.key] = Number(result.changes || 0);
    }
  });
  execute();

  const after = countTables(db, PRUNABLE_TABLES);
  const deleted = {};
  let total = 0;
  for (const [table, count] of Object.entries(before)) {
    const delta = Math.max(0, count - (after[table] || 0));
    deleted[table] = delta;
    total += delta;
  }

  return { policy, direct, deleted: { ...deleted, total } };
}

function activeRuntimeCounts(db) {
  const checks = [
    ['tasks', "status IN ('queued', 'running')"],
    ['agent_runs', "status IN ('queued', 'running')"],
    ['agent_execution_runs', "state IN ('queued', 'spawning', 'running', 'pausing', 'paused', 'resuming')"],
    ['runner_queue', "status IN ('pending', 'running')"],
    ['chain_work_items', "status IN ('open', 'claimed', 'in_progress', 'blocked')"],
    ['squad_handoffs', "status NOT IN ('consumed', 'completed', 'failed')"]
  ];
  return Object.fromEntries(checks.map(([table, where]) => [table, countWhere(db, table, where, [])]));
}

function liveCutoffIso(options = {}) {
  const minutes = positiveDays(options.liveWindowMinutes, DEFAULT_LIVE_WINDOW_MINUTES);
  const now = options.now === undefined ? Date.now() : options.now;
  return new Date(now - minutes * 60 * 1000).toISOString();
}

function liveExecutionRunSql(alias) {
  return `(${alias}.state IN (${EXECUTION_LIVE_STATES}) AND (${alias}.updated_at >= ? OR EXISTS (
    SELECT 1 FROM agent_execution_events recent
    WHERE recent.telemetry_run_id = ${alias}.telemetry_run_id AND recent.created_at >= ?
  )))`;
}

// Work that is probably writing right now: an active status that also moved
// inside the live window. Rows stuck in an active status past the window are
// counted as stale instead, so they no longer block compaction.
function liveRuntimeCounts(db, options = {}) {
  const cutoff = liveCutoffIso(options);
  const live = {};
  const stale = {};
  const checks = [
    ['tasks', "status = 'running'", 'updated_at >= ?', [cutoff]],
    ['agent_runs', "status = 'running'", 'updated_at >= ?', [cutoff]],
    ['agent_execution_runs', `state IN (${EXECUTION_LIVE_STATES})`, liveExecutionRunSql('agent_execution_runs'), [cutoff, cutoff]],
    ['runner_queue', "status = 'running'", 'COALESCE(started_at, created_at) >= ?', [cutoff]]
  ];
  for (const [table, active, recent, params] of checks) {
    if (!tableExists(db, table)) continue;
    const total = countWhere(db, table, active, []);
    live[table] = table === 'agent_execution_runs'
      ? countWhere(db, table, recent, params)
      : countWhere(db, table, `${active} AND ${recent}`, params);
    stale[table] = Math.max(0, total - live[table]);
  }
  const sum = (counts) => Object.values(counts).reduce((total, count) => total + count, 0);
  return { live: { ...live, total: sum(live) }, stale: { ...stale, total: sum(stale) }, cutoff };
}

function assessRuntimeDbHealth(database = {}) {
  const sizeBytes = Number(database.sizeBytes) || 0;
  const freeBytes = Number(database.reclaimableFreeBytes) || 0;
  const liveBytes = Math.max(0, sizeBytes - freeBytes);
  const freeRatio = sizeBytes > 0 ? freeBytes / sizeBytes : 0;
  const reasons = [];
  if (freeBytes >= COMPACT_MIN_FREE_BYTES && freeRatio >= COMPACT_MIN_FREE_RATIO) reasons.push('reclaimable_free_pages');
  if (liveBytes >= OVERSIZED_LIVE_BYTES) reasons.push('live_data_oversized');
  return {
    status: reasons.length > 0 ? 'warn' : 'healthy',
    sizeBytes,
    liveBytes,
    freeBytes,
    freeRatio: Number(freeRatio.toFixed(3)),
    reasons,
    thresholds: {
      compactMinFreeBytes: COMPACT_MIN_FREE_BYTES,
      compactMinFreeRatio: COMPACT_MIN_FREE_RATIO,
      oversizedLiveBytes: OVERSIZED_LIVE_BYTES
    }
  };
}

function readDatabaseStats(db, dbPath) {
  const pageSize = Number(db.pragma('page_size', { simple: true }) || 0);
  const pageCount = Number(db.pragma('page_count', { simple: true }) || 0);
  const freePages = Number(db.pragma('freelist_count', { simple: true }) || 0);
  return {
    sizeBytes: fileSize(dbPath),
    walBytes: fileSize(`${dbPath}-wal`),
    pageSize,
    pageCount,
    freePages,
    reclaimableFreeBytes: freePages * pageSize
  };
}

// Raw lane output is only a debugging tail while the feature is in flight;
// the run rows, lifecycle events and report files stay as the history.
function purgeFeatureExecutionOutput(db, feature, options = {}) {
  if (!feature || !tableExists(db, 'agent_execution_runs') || !tableExists(db, 'agent_execution_events')) return 0;
  const cutoff = liveCutoffIso(options);
  return Number(db.prepare(`
    DELETE FROM agent_execution_events
    WHERE event_type = 'output' AND telemetry_run_id IN (
      SELECT run.telemetry_run_id FROM agent_execution_runs run
      WHERE run.feature = ? AND NOT ${liveExecutionRunSql('run')}
    )
  `).run(feature, cutoff, cutoff).changes || 0);
}

/**
 * Lifecycle maintenance for a quiet point (feature:close): drop the closed
 * feature's raw lane output, apply the retention policy, and give the space
 * back with VACUUM when free pages are a real share of the file and nothing is
 * writing. Never throws on a busy database; the caller only reports.
 */
function maintainRuntimeDb(db, dbPath, options = {}) {
  const featureOutputDeleted = db.transaction(() => purgeFeatureExecutionOutput(db, options.feature, options))();
  const prune = pruneRuntimeData(db, options);
  db.pragma('wal_checkpoint(TRUNCATE)');
  const before = readDatabaseStats(db, dbPath);
  const healthBefore = assessRuntimeDbHealth(before);
  const activity = liveRuntimeCounts(db, options);
  let compaction = { ok: false, skipped: 'not_needed' };
  if (healthBefore.reasons.includes('reclaimable_free_pages')) {
    if (activity.live.total > 0) {
      compaction = { ok: false, skipped: 'live_runtime', live: activity.live };
    } else if (db.pragma('quick_check', { simple: true }) !== 'ok') {
      compaction = { ok: false, skipped: 'integrity_check_failed' };
    } else {
      try {
        compaction = { ok: true, ...compactRuntimeDb(db, dbPath) };
      } catch (error) {
        compaction = { ok: false, skipped: 'busy', error: error.code || error.message };
      }
    }
  }
  const after = readDatabaseStats(db, dbPath);
  return {
    featureOutputDeleted,
    pruned: prune.deleted.total,
    compaction,
    before: { sizeBytes: before.sizeBytes, freeBytes: before.reclaimableFreeBytes },
    health: assessRuntimeDbHealth(after),
    stale: activity.stale
  };
}

function formatMegabytes(bytes) {
  return `${((Number(bytes) || 0) / (1024 * 1024)).toFixed(1)} MB`;
}

function describeRuntimeMaintenance(result) {
  const parts = [`runtime db: ${result.featureOutputDeleted} lane output event(s) of the closed feature removed`, `${result.pruned} expired row(s) pruned`];
  const { compaction } = result;
  if (compaction.ok) {
    parts.push(`compacted ${formatMegabytes(compaction.beforeBytes)} -> ${formatMegabytes(compaction.afterBytes)}`);
  } else if (compaction.skipped === 'not_needed') {
    parts.push(`${formatMegabytes(result.health.sizeBytes)}, no compaction needed`);
  } else {
    parts.push(`compaction skipped (${compaction.skipped}); run aioson runtime:compact . later`);
  }
  if (result.health.reasons.includes('live_data_oversized')) parts.push('live data still above the healthy size; see aioson runtime:storage .');
  return parts.join('; ');
}

function getRuntimeStorageReport(db, dbPath, options = {}) {
  const tables = listTableStorage(db).sort((a, b) => b.bytes - a.bytes || b.rows - a.rows || a.table.localeCompare(b.table));
  const categories = new Map();
  for (const table of tables) {
    const current = categories.get(table.category) || { category: table.category, rows: 0, bytes: 0, tables: 0 };
    current.rows += table.rows;
    current.bytes += table.bytes;
    current.tables += 1;
    categories.set(table.category, current);
  }

  const database = readDatabaseStats(db, dbPath);
  const { sizeBytes, freePages } = database;
  const preview = previewRuntimePrune(db, options);
  const health = assessRuntimeDbHealth(database);
  const activity = liveRuntimeCounts(db, options);
  const recommendations = [];
  if (preview.directRows > 0) recommendations.push('prune');
  if (freePages > 0 || (preview.directRows > 0 && sizeBytes >= 10 * 1024 * 1024)) recommendations.push('compact_after_prune');
  if ((categories.get('verbose_telemetry')?.bytes || 0) > sizeBytes * 0.5) recommendations.push('verbose_telemetry_dominates');
  if (activity.stale.total > 0) recommendations.push('recover_stale_runs');

  return {
    ok: true,
    dbPath,
    database,
    health,
    policy: preview.policy,
    active: activeRuntimeCounts(db),
    live: activity.live,
    stale: activity.stale,
    preview,
    categories: [...categories.values()].sort((a, b) => b.bytes - a.bytes),
    tables,
    recommendations
  };
}

function compactRuntimeDb(db, dbPath) {
  const beforeBytes = fileSize(dbPath);
  db.pragma('wal_checkpoint(TRUNCATE)');
  db.exec('VACUUM');
  db.pragma('wal_checkpoint(TRUNCATE)');
  const afterBytes = fileSize(dbPath);
  return {
    beforeBytes,
    afterBytes,
    reclaimedBytes: Math.max(0, beforeBytes - afterBytes)
  };
}

module.exports = {
  DEFAULT_HISTORY_DAYS,
  DEFAULT_OUTPUT_DAYS,
  DEFAULT_LIVE_WINDOW_MINUTES,
  resolveRetentionPolicy,
  listTableStorage,
  previewRuntimePrune,
  pruneRuntimeData,
  getRuntimeStorageReport,
  compactRuntimeDb,
  activeRuntimeCounts,
  liveRuntimeCounts,
  assessRuntimeDbHealth,
  readDatabaseStats,
  purgeFeatureExecutionOutput,
  maintainRuntimeDb,
  describeRuntimeMaintenance
};
