'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const Database = require('better-sqlite3');
const { ensureDir, exists } = require('./utils');
const {
  attachBindingsToExecutors,
  flattenGenomeBindings,
  mergeGenomeBindings
} = require('./genomes/bindings');
const { runMigration: runLearningLoopMigration } = require('./learning-loop-migration');
const { runMigration: runNeuralChainMigration } = require('./neural-chain-migration');

const RUNTIME_DIR = path.join('.aioson', 'runtime');
const DB_FILE = 'aios.sqlite';
const LOGS_DIR = 'aioson-logs';
const SESSIONS_DIR = '.sessions';
const VALID_STATUSES = new Set(['queued', 'running', 'completed', 'failed']);
const VALID_TASK_STATUSES = new Set(['queued', 'running', 'completed', 'failed']);

function slugify(value) {
  return String(value || 'run')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'run';
}

function nowIso() {
  return new Date().toISOString();
}

function resolveRuntimePaths(targetDir) {
  const runtimeDir = path.join(targetDir, RUNTIME_DIR);
  return {
    runtimeDir,
    dbPath: path.join(runtimeDir, DB_FILE),
    logsDir: path.join(targetDir, LOGS_DIR)
  };
}

async function runtimeStoreExists(targetDir) {
  const { dbPath } = resolveRuntimePaths(targetDir);
  return exists(dbPath);
}

async function openRuntimeDb(targetDir, options = {}) {
  const { runtimeDir, dbPath, logsDir } = resolveRuntimePaths(targetDir);
  const mustExist = Boolean(options.mustExist);

  if (mustExist && !(await exists(dbPath))) {
    return null;
  }

  await ensureDir(runtimeDir);
  await ensureDir(logsDir);

  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  // Wait up to 5s for a transient lock instead of throwing SQLITE_BUSY at once.
  db.pragma('busy_timeout = 5000');

  db.exec(`
    CREATE TABLE IF NOT EXISTS squads (
      squad_slug TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      mode TEXT NOT NULL DEFAULT 'content',
      mission TEXT,
      goal TEXT,
      status TEXT NOT NULL DEFAULT 'active',
      visibility TEXT NOT NULL DEFAULT 'private',
      manifest_json TEXT,
      context_json TEXT,
      package_dir TEXT,
      agents_dir TEXT,
      output_dir TEXT,
      logs_dir TEXT,
      media_dir TEXT,
      latest_session_path TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS squad_executors (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      squad_slug TEXT NOT NULL,
      executor_slug TEXT NOT NULL,
      title TEXT,
      role TEXT,
      file_path TEXT,
      skills_json TEXT,
      genomes_json TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE (squad_slug, executor_slug),
      FOREIGN KEY (squad_slug) REFERENCES squads(squad_slug) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS squad_skills (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      squad_slug TEXT NOT NULL,
      skill_slug TEXT NOT NULL,
      title TEXT,
      description TEXT,
      UNIQUE (squad_slug, skill_slug),
      FOREIGN KEY (squad_slug) REFERENCES squads(squad_slug) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS squad_mcps (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      squad_slug TEXT NOT NULL,
      mcp_slug TEXT NOT NULL,
      required INTEGER NOT NULL DEFAULT 0,
      purpose TEXT,
      UNIQUE (squad_slug, mcp_slug),
      FOREIGN KEY (squad_slug) REFERENCES squads(squad_slug) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS squad_genomes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      squad_slug TEXT NOT NULL,
      genome_slug TEXT NOT NULL,
      scope_type TEXT NOT NULL DEFAULT 'squad',
      agent_slug TEXT,
      UNIQUE (squad_slug, genome_slug, scope_type, agent_slug),
      FOREIGN KEY (squad_slug) REFERENCES squads(squad_slug) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS tasks (
      task_key TEXT PRIMARY KEY,
      squad_slug TEXT,
      session_key TEXT,
      task_kind TEXT,
      parent_task_key TEXT,
      title TEXT NOT NULL,
      goal TEXT,
      meta_json TEXT,
      status TEXT NOT NULL,
      created_by TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      finished_at TEXT
    );

    CREATE TABLE IF NOT EXISTS agent_runs (
      run_key TEXT PRIMARY KEY,
      task_key TEXT,
      agent_name TEXT NOT NULL,
      agent_kind TEXT NOT NULL DEFAULT 'official',
      squad_slug TEXT,
      session_key TEXT,
      source TEXT NOT NULL DEFAULT 'direct',
      workflow_id TEXT,
      workflow_stage TEXT,
      parent_run_key TEXT,
      title TEXT,
      status TEXT NOT NULL,
      summary TEXT,
      used_skills_json TEXT,
      output_path TEXT,
      started_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      finished_at TEXT,
      FOREIGN KEY (task_key) REFERENCES tasks(task_key) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS agent_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      run_key TEXT NOT NULL,
      event_type TEXT NOT NULL,
      message TEXT NOT NULL DEFAULT '',
      payload_json TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (run_key) REFERENCES agent_runs(run_key) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS execution_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      task_key TEXT,
      run_key TEXT,
      agent_name TEXT,
      agent_kind TEXT,
      squad_slug TEXT,
      session_key TEXT,
      source TEXT,
      workflow_id TEXT,
      workflow_stage TEXT,
      parent_run_key TEXT,
      event_type TEXT NOT NULL,
      phase TEXT,
      status TEXT,
      tool_name TEXT,
      message TEXT NOT NULL DEFAULT '',
      payload_json TEXT,
      sequence_no INTEGER NOT NULL DEFAULT 1,
      parent_event_id INTEGER,
      created_at TEXT NOT NULL,
      FOREIGN KEY (task_key) REFERENCES tasks(task_key) ON DELETE SET NULL,
      FOREIGN KEY (run_key) REFERENCES agent_runs(run_key) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS artifacts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      task_key TEXT,
      run_key TEXT,
      squad_slug TEXT,
      agent_name TEXT,
      kind TEXT NOT NULL,
      title TEXT,
      file_path TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (task_key) REFERENCES tasks(task_key) ON DELETE SET NULL,
      FOREIGN KEY (run_key) REFERENCES agent_runs(run_key) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS content_items (
      content_key TEXT PRIMARY KEY,
      task_key TEXT,
      run_key TEXT,
      squad_slug TEXT NOT NULL,
      session_key TEXT,
      title TEXT NOT NULL,
      content_type TEXT NOT NULL,
      layout_type TEXT NOT NULL DEFAULT 'document',
      status TEXT NOT NULL DEFAULT 'completed',
      summary TEXT,
      blueprint_slug TEXT,
      used_skills_json TEXT,
      payload_json TEXT,
      json_path TEXT,
      html_path TEXT,
      created_by_agent TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (task_key) REFERENCES tasks(task_key) ON DELETE SET NULL,
      FOREIGN KEY (run_key) REFERENCES agent_runs(run_key) ON DELETE SET NULL
    );

    CREATE INDEX IF NOT EXISTS idx_squads_updated ON squads(updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_squad_executors_squad ON squad_executors(squad_slug, updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_squad_skills_squad ON squad_skills(squad_slug);
    CREATE INDEX IF NOT EXISTS idx_squad_mcps_squad ON squad_mcps(squad_slug);
    CREATE INDEX IF NOT EXISTS idx_squad_genomes_squad ON squad_genomes(squad_slug);
    CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status, updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_tasks_squad ON tasks(squad_slug, updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_agent_runs_status ON agent_runs(status, updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_agent_runs_task ON agent_runs(task_key, updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_agent_runs_squad ON agent_runs(squad_slug, updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_agent_events_run ON agent_events(run_key, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_execution_events_run ON execution_events(run_key, sequence_no DESC, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_execution_events_task ON execution_events(task_key, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_execution_events_created ON execution_events(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_artifacts_task ON artifacts(task_key, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_content_items_squad ON content_items(squad_slug, updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_content_items_task ON content_items(task_key, updated_at DESC);

    CREATE TABLE IF NOT EXISTS squad_analyses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      squad_slug TEXT NOT NULL,
      coverage_json TEXT,
      suggestions_json TEXT,
      metrics_json TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (squad_slug) REFERENCES squads(squad_slug)
    );

    CREATE INDEX IF NOT EXISTS idx_squad_analyses_squad ON squad_analyses(squad_slug, created_at DESC);

    CREATE TABLE IF NOT EXISTS squad_ports (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      squad_slug TEXT NOT NULL,
      port_type TEXT NOT NULL CHECK(port_type IN ('input', 'output')),
      port_key TEXT NOT NULL,
      data_type TEXT DEFAULT 'any',
      description TEXT,
      required INTEGER DEFAULT 0,
      content_blueprint_slug TEXT,
      FOREIGN KEY (squad_slug) REFERENCES squads(squad_slug),
      UNIQUE(squad_slug, port_type, port_key)
    );

    CREATE TABLE IF NOT EXISTS squad_pipelines (
      slug TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      status TEXT DEFAULT 'draft' CHECK(status IN ('draft', 'active', 'paused', 'archived')),
      trigger_mode TEXT DEFAULT 'manual' CHECK(trigger_mode IN ('manual', 'on_output', 'scheduled')),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS pipeline_nodes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      pipeline_slug TEXT NOT NULL,
      squad_slug TEXT NOT NULL,
      position_x REAL DEFAULT 0,
      position_y REAL DEFAULT 0,
      config_json TEXT,
      FOREIGN KEY (pipeline_slug) REFERENCES squad_pipelines(slug),
      FOREIGN KEY (squad_slug) REFERENCES squads(squad_slug),
      UNIQUE(pipeline_slug, squad_slug)
    );

    CREATE TABLE IF NOT EXISTS pipeline_edges (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      pipeline_slug TEXT NOT NULL,
      source_squad TEXT NOT NULL,
      source_port TEXT NOT NULL,
      target_squad TEXT NOT NULL,
      target_port TEXT NOT NULL,
      transform_json TEXT,
      FOREIGN KEY (pipeline_slug) REFERENCES squad_pipelines(slug)
    );

    CREATE TABLE IF NOT EXISTS squad_handoffs (
      id TEXT PRIMARY KEY,
      pipeline_slug TEXT,
      from_squad TEXT NOT NULL,
      from_port TEXT NOT NULL,
      to_squad TEXT NOT NULL,
      to_port TEXT NOT NULL,
      payload_json TEXT,
      status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'consumed', 'failed', 'expired')),
      created_at TEXT NOT NULL,
      consumed_at TEXT,
      FOREIGN KEY (from_squad) REFERENCES squads(squad_slug),
      FOREIGN KEY (to_squad) REFERENCES squads(squad_slug)
    );

    CREATE INDEX IF NOT EXISTS idx_squad_pipelines_status ON squad_pipelines(status, updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_pipeline_nodes_pipeline ON pipeline_nodes(pipeline_slug);
    CREATE INDEX IF NOT EXISTS idx_pipeline_edges_pipeline ON pipeline_edges(pipeline_slug);
    CREATE INDEX IF NOT EXISTS idx_squad_handoffs_to ON squad_handoffs(to_squad, status, created_at DESC);

    CREATE TABLE IF NOT EXISTS artisan_squads (
      id TEXT PRIMARY KEY,
      slug TEXT NOT NULL UNIQUE,
      title TEXT NOT NULL,
      status TEXT DEFAULT 'draft' CHECK(status IN ('draft', 'refining', 'ready', 'created', 'archived')),
      domain TEXT,
      goal TEXT,
      mode TEXT DEFAULT 'content',
      prd_markdown TEXT,
      summary TEXT,
      confidence REAL DEFAULT 0,
      tags_json TEXT DEFAULT '[]',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS artisan_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      artisan_id TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('user', 'assistant', 'system')),
      content TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (artisan_id) REFERENCES artisan_squads(id)
    );

    CREATE INDEX IF NOT EXISTS idx_artisan_squads_status ON artisan_squads(status, updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_artisan_messages_artisan ON artisan_messages(artisan_id, created_at ASC);

    CREATE TABLE IF NOT EXISTS delivery_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      squad_slug TEXT NOT NULL,
      content_key TEXT,
      webhook_slug TEXT,
      trigger_type TEXT NOT NULL,
      url TEXT NOT NULL,
      status_code INTEGER,
      response_body TEXT,
      error_message TEXT,
      attempt INTEGER DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_delivery_log_squad ON delivery_log(squad_slug);
    CREATE INDEX IF NOT EXISTS idx_delivery_log_content ON delivery_log(content_key);

    CREATE TABLE IF NOT EXISTS backup_manifest (
      record_key TEXT PRIMARY KEY,
      record_type TEXT NOT NULL,
      content_hash TEXT NOT NULL,
      backed_up_at TEXT NOT NULL,
      remote_key TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_backup_manifest_type ON backup_manifest(record_type, backed_up_at DESC);

    CREATE TABLE IF NOT EXISTS squad_investigations (
      investigation_slug TEXT PRIMARY KEY,
      domain TEXT NOT NULL,
      mode TEXT DEFAULT 'full',
      dimensions_covered INTEGER DEFAULT 0,
      total_dimensions INTEGER DEFAULT 7,
      confidence REAL DEFAULT 0,
      report_path TEXT,
      linked_squad_slug TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_squad_investigations_domain ON squad_investigations(domain);
    CREATE INDEX IF NOT EXISTS idx_squad_investigations_squad ON squad_investigations(linked_squad_slug);

    CREATE TABLE IF NOT EXISTS implementation_plans (
      plan_id TEXT PRIMARY KEY,
      project_name TEXT,
      scope TEXT DEFAULT 'project',
      feature_slug TEXT,
      status TEXT DEFAULT 'draft',
      classification TEXT,
      phases_total INTEGER DEFAULT 0,
      phases_completed INTEGER DEFAULT 0,
      source_artifacts TEXT,
      source_hash TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS plan_phases (
      plan_id TEXT NOT NULL,
      phase_number INTEGER NOT NULL,
      title TEXT NOT NULL,
      status TEXT DEFAULT 'pending',
      completed_at TEXT,
      notes TEXT,
      PRIMARY KEY (plan_id, phase_number),
      FOREIGN KEY (plan_id) REFERENCES implementation_plans(plan_id)
    );

    CREATE TABLE IF NOT EXISTS squad_execution_plans (
      plan_slug TEXT PRIMARY KEY,
      squad_slug TEXT NOT NULL,
      status TEXT DEFAULT 'draft',
      rounds_total INTEGER DEFAULT 0,
      rounds_completed INTEGER DEFAULT 0,
      based_on_blueprint TEXT,
      based_on_investigation TEXT,
      source_hash TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS squad_plan_rounds (
      plan_slug TEXT NOT NULL,
      round_number INTEGER NOT NULL,
      executor_slug TEXT NOT NULL,
      title TEXT NOT NULL,
      status TEXT DEFAULT 'pending',
      completed_at TEXT,
      notes TEXT,
      PRIMARY KEY (plan_slug, round_number),
      FOREIGN KEY (plan_slug) REFERENCES squad_execution_plans(plan_slug)
    );

    CREATE TABLE IF NOT EXISTS squad_learnings (
      learning_id TEXT PRIMARY KEY,
      squad_slug TEXT NOT NULL,
      type TEXT NOT NULL CHECK (type IN ('preference', 'process', 'domain', 'quality')),
      title TEXT NOT NULL,
      signal TEXT DEFAULT 'explicit' CHECK (signal IN ('explicit', 'implicit')),
      confidence TEXT DEFAULT 'medium' CHECK (confidence IN ('high', 'medium', 'low')),
      frequency INTEGER DEFAULT 1,
      last_reinforced TEXT,
      applies_to TEXT DEFAULT 'squad',
      file_path TEXT,
      promoted_to TEXT,
      status TEXT DEFAULT 'active' CHECK (status IN ('active', 'stale', 'archived', 'promoted')),
      source_session TEXT,
      evidence TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS project_learnings (
      learning_id TEXT PRIMARY KEY,
      project_name TEXT,
      feature_slug TEXT,
      type TEXT NOT NULL CHECK (type IN ('preference', 'process', 'domain', 'quality')),
      title TEXT NOT NULL,
      confidence TEXT DEFAULT 'medium',
      frequency INTEGER DEFAULT 1,
      last_reinforced TEXT,
      applies_to TEXT DEFAULT 'project',
      promoted_to TEXT,
      status TEXT DEFAULT 'active' CHECK (status IN ('active', 'stale', 'archived', 'promoted')),
      source_session TEXT,
      evidence TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      kind TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_impl_plans_status ON implementation_plans(status);
    CREATE INDEX IF NOT EXISTS idx_squad_exec_plans_squad ON squad_execution_plans(squad_slug);
    CREATE INDEX IF NOT EXISTS idx_squad_exec_plans_status ON squad_execution_plans(status);
    CREATE INDEX IF NOT EXISTS idx_squad_learnings_squad ON squad_learnings(squad_slug);
    CREATE INDEX IF NOT EXISTS idx_squad_learnings_type ON squad_learnings(type);
    CREATE INDEX IF NOT EXISTS idx_squad_learnings_status ON squad_learnings(status);
    CREATE INDEX IF NOT EXISTS idx_project_learnings_type ON project_learnings(type);
    CREATE INDEX IF NOT EXISTS idx_project_learnings_status ON project_learnings(status);

    CREATE TABLE IF NOT EXISTS squad_metrics (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      squad_slug TEXT NOT NULL,
      metric_key TEXT NOT NULL,
      metric_value REAL NOT NULL,
      metric_unit TEXT,
      period TEXT,
      baseline REAL,
      target REAL,
      source TEXT DEFAULT 'manual',
      notes TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      UNIQUE(squad_slug, metric_key, period)
    );
    CREATE INDEX IF NOT EXISTS idx_squad_metrics_squad ON squad_metrics(squad_slug, period DESC);

    CREATE TABLE IF NOT EXISTS worker_runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      squad_slug TEXT NOT NULL,
      worker_slug TEXT NOT NULL,
      trigger_type TEXT NOT NULL DEFAULT 'manual',
      input_json TEXT,
      output_json TEXT,
      status TEXT DEFAULT 'running',
      error_message TEXT,
      duration_ms INTEGER,
      attempt INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now')),
      completed_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_worker_runs_squad ON worker_runs(squad_slug, created_at DESC);

    CREATE TABLE IF NOT EXISTS squad_daemons (
      squad_slug TEXT PRIMARY KEY,
      status TEXT DEFAULT 'stopped',
      pid INTEGER,
      port INTEGER,
      started_at TEXT,
      last_heartbeat TEXT,
      config_json TEXT,
      error_message TEXT
    );

    CREATE TABLE IF NOT EXISTS mcp_status (
      squad_slug TEXT NOT NULL,
      mcp_slug TEXT NOT NULL,
      connector TEXT NOT NULL,
      status TEXT DEFAULT 'unconfigured',
      last_check TEXT,
      last_error TEXT,
      calls_total INTEGER DEFAULT 0,
      calls_failed INTEGER DEFAULT 0,
      PRIMARY KEY (squad_slug, mcp_slug)
    );

    CREATE TABLE IF NOT EXISTS workflow_reviews (
      review_id TEXT PRIMARY KEY,
      squad_slug TEXT NOT NULL,
      workflow_slug TEXT NOT NULL,
      phase_id TEXT NOT NULL,
      attempt_number INTEGER DEFAULT 1,
      reviewer_slug TEXT NOT NULL,
      verdict TEXT NOT NULL,
      score REAL,
      feedback TEXT,
      veto_triggered TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_workflow_reviews_squad ON workflow_reviews(squad_slug, workflow_slug);

    CREATE TABLE IF NOT EXISTS squad_scores (
      squad_slug TEXT NOT NULL,
      dimension TEXT NOT NULL,
      score INTEGER NOT NULL,
      max_score INTEGER NOT NULL,
      details_json TEXT,
      scored_at TEXT DEFAULT (datetime('now')),
      PRIMARY KEY (squad_slug, dimension, scored_at)
    );
    CREATE INDEX IF NOT EXISTS idx_squad_scores_squad ON squad_scores(squad_slug);

    CREATE TABLE IF NOT EXISTS squad_roi_config (
      squad_slug TEXT PRIMARY KEY,
      pricing_model TEXT DEFAULT 'fixed',
      setup_fee REAL,
      monthly_fee REAL,
      percentage_fee REAL,
      percentage_base TEXT,
      currency TEXT DEFAULT 'BRL',
      contract_months INTEGER DEFAULT 12,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS dynamic_squad_tools (
      name TEXT NOT NULL,
      squad_slug TEXT NOT NULL,
      description TEXT NOT NULL,
      input_schema TEXT NOT NULL DEFAULT '{}',
      handler_type TEXT NOT NULL DEFAULT 'shell',
      handler_code TEXT,
      handler_path TEXT,
      registered_at TEXT NOT NULL,
      registered_by TEXT,
      PRIMARY KEY (name, squad_slug)
    );
    CREATE INDEX IF NOT EXISTS idx_dynamic_squad_tools_squad ON dynamic_squad_tools(squad_slug);

    CREATE TABLE IF NOT EXISTS inter_squad_events (
      id TEXT PRIMARY KEY,
      from_squad TEXT NOT NULL,
      event TEXT NOT NULL,
      payload TEXT,
      created_at TEXT NOT NULL,
      consumed_by TEXT NOT NULL DEFAULT '[]',
      ttl_hours INTEGER NOT NULL DEFAULT 48
    );
    CREATE INDEX IF NOT EXISTS idx_inter_squad_events_from ON inter_squad_events(from_squad, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_inter_squad_events_event ON inter_squad_events(event, created_at DESC);
  `);

  ensureLegacyColumns(db);

  return { db, dbPath, runtimeDir };
}

function createRunKey(agentName) {
  return `${slugify(agentName)}-${Date.now()}`;
}

function createTaskKey(title) {
  return `task-${slugify(title)}-${Date.now()}`;
}

function normalizeStatus(value, fallback) {
  const candidate = String(value || fallback || '')
    .trim()
    .toLowerCase();
  return VALID_STATUSES.has(candidate) ? candidate : fallback;
}

function normalizeTaskStatus(value, fallback) {
  const candidate = String(value || fallback || '')
    .trim()
    .toLowerCase();
  return VALID_TASK_STATUSES.has(candidate) ? candidate : fallback;
}

function ensureLegacyColumns(db) {
  const taskColumns = db.prepare('PRAGMA table_info(tasks)').all();
  const taskColumnNames = new Set(taskColumns.map((column) => column.name));

  if (!taskColumnNames.has('task_kind')) {
    db.exec('ALTER TABLE tasks ADD COLUMN task_kind TEXT');
  }

  if (!taskColumnNames.has('parent_task_key')) {
    db.exec('ALTER TABLE tasks ADD COLUMN parent_task_key TEXT');
  }

  if (!taskColumnNames.has('meta_json')) {
    db.exec('ALTER TABLE tasks ADD COLUMN meta_json TEXT');
  }

  db.exec('CREATE INDEX IF NOT EXISTS idx_tasks_session ON tasks(session_key, updated_at DESC)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_tasks_parent ON tasks(parent_task_key, updated_at DESC)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_tasks_kind ON tasks(task_kind, updated_at DESC)');

  const agentRunColumns = db.prepare('PRAGMA table_info(agent_runs)').all();
  const agentRunColumnNames = new Set(agentRunColumns.map((column) => column.name));

  if (!agentRunColumnNames.has('task_key')) {
    db.exec('ALTER TABLE agent_runs ADD COLUMN task_key TEXT');
  }

  if (!agentRunColumnNames.has('used_skills_json')) {
    db.exec('ALTER TABLE agent_runs ADD COLUMN used_skills_json TEXT');
  }

  if (!agentRunColumnNames.has('source')) {
    db.exec("ALTER TABLE agent_runs ADD COLUMN source TEXT NOT NULL DEFAULT 'direct'");
  }

  if (!agentRunColumnNames.has('workflow_id')) {
    db.exec('ALTER TABLE agent_runs ADD COLUMN workflow_id TEXT');
  }

  if (!agentRunColumnNames.has('workflow_stage')) {
    db.exec('ALTER TABLE agent_runs ADD COLUMN workflow_stage TEXT');
  }

  if (!agentRunColumnNames.has('parent_run_key')) {
    db.exec('ALTER TABLE agent_runs ADD COLUMN parent_run_key TEXT');
  }

  const squadColumns = db.prepare('PRAGMA table_info(squads)').all();
  const squadColumnNames = new Set(squadColumns.map((column) => column.name));

  if (!squadColumnNames.has('context_json')) {
    db.exec('ALTER TABLE squads ADD COLUMN context_json TEXT');
  }

  if (!squadColumnNames.has('mode')) {
    db.exec("ALTER TABLE squads ADD COLUMN mode TEXT NOT NULL DEFAULT 'content'");
  }

  if (!squadColumnNames.has('package_dir')) {
    db.exec('ALTER TABLE squads ADD COLUMN package_dir TEXT');
  }

  const contentItemColumns = db.prepare('PRAGMA table_info(content_items)').all();
  const contentItemColumnNames = new Set(contentItemColumns.map((column) => column.name));

  if (!contentItemColumnNames.has('blueprint_slug')) {
    db.exec('ALTER TABLE content_items ADD COLUMN blueprint_slug TEXT');
  }

  if (!contentItemColumnNames.has('used_skills_json')) {
    db.exec('ALTER TABLE content_items ADD COLUMN used_skills_json TEXT');
  }

  try { db.exec('ALTER TABLE worker_runs ADD COLUMN conversation_id TEXT'); } catch { /* já existe */ }

  // Event Enrichment (Plan 61) — new columns in execution_events
  const execEventColumns = db.prepare('PRAGMA table_info(execution_events)').all();
  const execEventColumnNames = new Set(execEventColumns.map((col) => col.name));

  if (!execEventColumnNames.has('plan_step_id')) {
    db.exec('ALTER TABLE execution_events ADD COLUMN plan_step_id TEXT');
  }
  if (!execEventColumnNames.has('worker_status')) {
    db.exec('ALTER TABLE execution_events ADD COLUMN worker_status TEXT');
  }
  if (!execEventColumnNames.has('verdict')) {
    db.exec('ALTER TABLE execution_events ADD COLUMN verdict TEXT');
  }
  if (!execEventColumnNames.has('token_count')) {
    db.exec('ALTER TABLE execution_events ADD COLUMN token_count INTEGER');
  }
  if (!execEventColumnNames.has('progress_pct')) {
    db.exec('ALTER TABLE execution_events ADD COLUMN progress_pct REAL');
  }

  db.exec('CREATE INDEX IF NOT EXISTS idx_execution_events_agent_type ON execution_events(agent_name, event_type, created_at DESC)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_execution_events_verdict ON execution_events(verdict, created_at DESC)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_plan_phases_status ON plan_phases(plan_id, status)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_artifacts_run ON artifacts(run_key, created_at DESC)');

  // Dynamic Tools (Feature: Tool Registry)
  db.exec(`
    CREATE TABLE IF NOT EXISTS dynamic_tools (
      name TEXT PRIMARY KEY,
      description TEXT NOT NULL,
      input_schema TEXT NOT NULL DEFAULT '{}',
      handler_type TEXT NOT NULL DEFAULT 'shell',
      handler_code TEXT,
      handler_path TEXT,
      squad_slug TEXT,
      registered_at TEXT NOT NULL DEFAULT (datetime('now')),
      registered_by TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_dynamic_tools_squad ON dynamic_tools(squad_slug);
  `);

  // Evolution Log (Feature: Learning Evolution Pipeline)
  db.exec(`
    CREATE TABLE IF NOT EXISTS evolution_log (
      id TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL,
      deltas_count INTEGER NOT NULL DEFAULT 0,
      squad_slug TEXT,
      files_json TEXT,
      source_learning_ids_json TEXT
    );
  `);

  runLearningLoopMigration(db);
  runNeuralChainMigration(db);
}

function insertEvent(db, record) {
  db.prepare(`
    INSERT INTO agent_events (run_key, event_type, message, payload_json, created_at)
    VALUES (@run_key, @event_type, @message, @payload_json, @created_at)
  `).run(record);
}

function getRunContext(db, runKey) {
  return db
    .prepare(`
      SELECT
        run_key,
        task_key,
        agent_name,
        agent_kind,
        squad_slug,
        session_key,
        source,
        workflow_id,
        workflow_stage,
        parent_run_key,
        status,
        summary,
        title
      FROM agent_runs
      WHERE run_key = ?
    `)
    .get(runKey);
}

function nextExecutionSequence(db, runKey) {
  if (!runKey) return 1;
  const row = db
    .prepare('SELECT COALESCE(MAX(sequence_no), 0) AS max_sequence FROM execution_events WHERE run_key = ?')
    .get(runKey);
  return Number(row?.max_sequence || 0) + 1;
}

function insertExecutionEvent(db, record) {
  db.prepare(`
    INSERT INTO execution_events (
      task_key, run_key, agent_name, agent_kind, squad_slug, session_key,
      source, workflow_id, workflow_stage, parent_run_key,
      event_type, phase, status, tool_name, message, payload_json,
      sequence_no, parent_event_id, created_at,
      plan_step_id, worker_status, verdict, token_count, progress_pct
    ) VALUES (
      @task_key, @run_key, @agent_name, @agent_kind, @squad_slug, @session_key,
      @source, @workflow_id, @workflow_stage, @parent_run_key,
      @event_type, @phase, @status, @tool_name, @message, @payload_json,
      @sequence_no, @parent_event_id, @created_at,
      @plan_step_id, @worker_status, @verdict, @token_count, @progress_pct
    )
  `).run(record);
}

function appendContextLoadEvent(db, options) {
  const eventType = String(options.eventType || '').trim();
  if (eventType !== 'rule_loaded' && eventType !== 'brain_loaded') {
    throw new Error(`appendContextLoadEvent: invalid eventType "${eventType}" (must be rule_loaded|brain_loaded)`);
  }

  const now = options.createdAt || nowIso();
  const agentName = options.agentName ? String(options.agentName).trim() : null;
  const payloadJson = options.payload ? JSON.stringify(options.payload) : null;
  const runKey = options.runKey ? String(options.runKey).trim() : null;
  const sequenceNo = runKey ? nextExecutionSequence(db, runKey) : 1;

  insertExecutionEvent(db, {
    task_key: null,
    run_key: runKey,
    agent_name: agentName,
    agent_kind: null,
    squad_slug: null,
    session_key: null,
    source: 'context_load',
    workflow_id: null,
    workflow_stage: null,
    parent_run_key: null,
    event_type: eventType,
    phase: 'context_load',
    status: null,
    tool_name: null,
    message: String(options.message || ''),
    payload_json: payloadJson,
    sequence_no: sequenceNo,
    parent_event_id: null,
    created_at: now,
    plan_step_id: null,
    worker_status: null,
    verdict: null,
    token_count: null,
    progress_pct: null
  });
}

function appendRunEvent(db, options) {
  const run = getRunContext(db, options.runKey);
  if (!run) {
    throw new Error(`Run not found: ${options.runKey}`);
  }

  const now = options.createdAt || nowIso();
  const payloadJson = options.payload ? JSON.stringify(options.payload) : null;

  const doInsert = db.transaction(() => {
    insertEvent(db, {
      run_key: run.run_key,
      event_type: String(options.eventType || 'update'),
      message: String(options.message || ''),
      payload_json: payloadJson,
      created_at: now
    });

    insertExecutionEvent(db, {
      task_key: run.task_key,
      run_key: run.run_key,
      agent_name: run.agent_name,
      agent_kind: run.agent_kind,
      squad_slug: run.squad_slug,
      session_key: run.session_key,
      source: run.source,
      workflow_id: run.workflow_id,
      workflow_stage: run.workflow_stage,
      parent_run_key: run.parent_run_key,
      event_type: String(options.eventType || 'update'),
      phase: options.phase ? String(options.phase).trim() : null,
      status: options.status ? String(options.status).trim() : run.status || null,
      tool_name: options.toolName ? String(options.toolName).trim() : null,
      message: String(options.message || ''),
      payload_json: payloadJson,
      sequence_no: nextExecutionSequence(db, run.run_key),
      parent_event_id: options.parentEventId || null,
      created_at: now,
      plan_step_id: options.planStepId ? String(options.planStepId).trim() : null,
      worker_status: options.workerStatus ? String(options.workerStatus).trim() : null,
      verdict: options.verdict ? String(options.verdict).trim().toUpperCase() : null,
      token_count: options.tokenCount != null ? Number(options.tokenCount) || null : null,
      progress_pct: options.progressPct != null ? Number(options.progressPct) || null : null
    });
  });

  doInsert();
}

function startTask(db, options) {
  const now = nowIso();
  const taskKey = String(options.taskKey || createTaskKey(options.title));
  const status = normalizeTaskStatus(options.status, 'running');
  const metaJson = options.metaJson && typeof options.metaJson === 'object'
    ? JSON.stringify(options.metaJson)
    : (typeof options.metaJson === 'string' && options.metaJson.trim() ? options.metaJson.trim() : null);

  db.prepare(`
    INSERT INTO tasks (
      task_key, squad_slug, session_key, task_kind, parent_task_key,
      title, goal, meta_json, status, created_by, created_at, updated_at, finished_at
    ) VALUES (
      @task_key, @squad_slug, @session_key, @task_kind, @parent_task_key,
      @title, @goal, @meta_json, @status, @created_by, @created_at, @updated_at, @finished_at
    )
  `).run({
    task_key: taskKey,
    squad_slug: options.squadSlug ? String(options.squadSlug).trim() : null,
    session_key: options.sessionKey ? String(options.sessionKey).trim() : null,
    task_kind: options.taskKind ? String(options.taskKind).trim() : null,
    parent_task_key: options.parentTaskKey ? String(options.parentTaskKey).trim() : null,
    title: String(options.title).trim(),
    goal: options.goal ? String(options.goal).trim() : null,
    meta_json: metaJson,
    status,
    created_by: options.createdBy ? String(options.createdBy).trim() : null,
    created_at: now,
    updated_at: now,
    finished_at: status === 'completed' || status === 'failed' ? now : null
  });

  return taskKey;
}

function updateTask(db, options) {
  const existing = db.prepare('SELECT task_key, status FROM tasks WHERE task_key = ?').get(options.taskKey);
  if (!existing) {
    throw new Error(`Task not found: ${options.taskKey}`);
  }

  const now = nowIso();
  const nextStatus = normalizeTaskStatus(options.status, existing.status || 'running');
  const metaJson = options.metaJson && typeof options.metaJson === 'object'
    ? JSON.stringify(options.metaJson)
    : (typeof options.metaJson === 'string' && options.metaJson.trim() ? options.metaJson.trim() : null);

  db.prepare(`
    UPDATE tasks
    SET
      status = @status,
      goal = COALESCE(@goal, goal),
      task_kind = COALESCE(@task_kind, task_kind),
      parent_task_key = COALESCE(@parent_task_key, parent_task_key),
      meta_json = COALESCE(@meta_json, meta_json),
      updated_at = @updated_at,
      finished_at = CASE
        WHEN @status IN ('completed', 'failed') THEN @updated_at
        ELSE finished_at
      END
    WHERE task_key = @task_key
  `).run({
    task_key: String(options.taskKey),
    status: nextStatus,
    goal: options.goal ? String(options.goal).trim() : null,
    task_kind: options.taskKind ? String(options.taskKind).trim() : null,
    parent_task_key: options.parentTaskKey ? String(options.parentTaskKey).trim() : null,
    meta_json: metaJson,
    updated_at: now
  });

  return nextStatus;
}

function attachArtifact(db, options) {
  const now = nowIso();
  db.prepare(`
    INSERT INTO artifacts (
      task_key, run_key, squad_slug, agent_name, kind, title, file_path, created_at
    ) VALUES (
      @task_key, @run_key, @squad_slug, @agent_name, @kind, @title, @file_path, @created_at
    )
  `).run({
    task_key: options.taskKey ? String(options.taskKey) : null,
    run_key: options.runKey ? String(options.runKey) : null,
    squad_slug: options.squadSlug ? String(options.squadSlug) : null,
    agent_name: options.agentName ? String(options.agentName) : null,
    kind: String(options.kind || inferArtifactKind(options.filePath || '')).trim(),
    title: options.title ? String(options.title).trim() : null,
    file_path: String(options.filePath).trim(),
    created_at: now
  });
}

function upsertContentItem(db, options) {
  const now = nowIso();
  const contentKey = String(options.contentKey || createTaskKey(options.title || 'content')).trim();
  const usedSkillsJson = normalizeStringArray(options.usedSkills).length > 0 ? JSON.stringify(normalizeStringArray(options.usedSkills)) : null;

  db.prepare(`
    INSERT INTO content_items (
      content_key, task_key, run_key, squad_slug, session_key, title, content_type, layout_type,
      status, summary, blueprint_slug, used_skills_json, payload_json, json_path, html_path, created_by_agent, created_at, updated_at
    ) VALUES (
      @content_key, @task_key, @run_key, @squad_slug, @session_key, @title, @content_type, @layout_type,
      @status, @summary, @blueprint_slug, @used_skills_json, @payload_json, @json_path, @html_path, @created_by_agent, @created_at, @updated_at
    )
    ON CONFLICT(content_key) DO UPDATE SET
      task_key = excluded.task_key,
      run_key = excluded.run_key,
      squad_slug = excluded.squad_slug,
      session_key = excluded.session_key,
      title = excluded.title,
      content_type = excluded.content_type,
      layout_type = excluded.layout_type,
      status = excluded.status,
      summary = excluded.summary,
      blueprint_slug = excluded.blueprint_slug,
      used_skills_json = excluded.used_skills_json,
      payload_json = excluded.payload_json,
      json_path = excluded.json_path,
      html_path = excluded.html_path,
      created_by_agent = excluded.created_by_agent,
      updated_at = excluded.updated_at
  `).run({
    content_key: contentKey,
    task_key: options.taskKey ? String(options.taskKey).trim() : null,
    run_key: options.runKey ? String(options.runKey).trim() : null,
    squad_slug: String(options.squadSlug).trim(),
    session_key: options.sessionKey ? String(options.sessionKey).trim() : null,
    title: String(options.title || contentKey).trim(),
    content_type: String(options.contentType || 'content').trim(),
    layout_type: String(options.layoutType || 'document').trim(),
    status: String(options.status || 'completed').trim(),
    summary: options.summary ? String(options.summary).trim() : null,
    blueprint_slug: options.blueprintSlug ? String(options.blueprintSlug).trim() : null,
    used_skills_json: usedSkillsJson,
    payload_json:
      options.payload && typeof options.payload === 'object'
        ? JSON.stringify(options.payload)
        : options.payloadJson
          ? String(options.payloadJson)
          : null,
    json_path: options.jsonPath ? String(options.jsonPath).trim() : null,
    html_path: options.htmlPath ? String(options.htmlPath).trim() : null,
    created_by_agent: options.createdByAgent ? String(options.createdByAgent).trim() : null,
    created_at: now,
    updated_at: now
  });

  return contentKey;
}

function normalizeArray(value) {
  return Array.isArray(value) ? value : [];
}

function normalizeStringArray(value) {
  const values = Array.isArray(value)
    ? value
    : typeof value === 'string'
      ? value.split(',')
      : [];

  return Array.from(
    new Set(
      values
        .map((entry) => String(entry || '').trim())
        .filter(Boolean)
    )
  );
}

function parseJsonArray(value) {
  if (!value) return [];
  try {
    return normalizeStringArray(JSON.parse(value));
  } catch {
    return [];
  }
}


function parseJsonObject(value) {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function getTaskPlanProgress(meta) {
  const steps = Array.isArray(meta?.plan_steps) ? meta.plan_steps : [];
  return {
    plan_steps_done: steps.filter((step) => step && step.done).length,
    plan_steps_total: steps.length
  };
}

function decorateTaskSnapshotRow(row) {
  const meta = parseJsonObject(row.meta_json);
  const progress = getTaskPlanProgress(meta);
  row.meta = meta;
  row.plan_steps_done = progress.plan_steps_done;
  row.plan_steps_total = progress.plan_steps_total;
  row.is_live_session = row.task_kind === 'live_session';
  row.is_micro_task = row.task_kind === 'micro_task';
  return row;
}

function decorateRunSnapshotRow(row) {
  row.used_skills = parseJsonArray(row.used_skills_json);
  row.is_live = row.source === 'live';
  row.is_handoff_child = Boolean(row.parent_run_key);
  return row;
}

function decorateExecutionEventSnapshotRow(row) {
  const payload = parseJsonObject(row.payload_json);
  row.payload = payload;
  row.is_handoff = row.event_type === 'handoff';
  row.handoff_from = payload?.from || row.agent_name || null;
  row.handoff_to = payload?.to || null;
  return row;
}

function upsertSquadManifest(db, options) {
  const now = nowIso();
  const slug = String(options.slug).trim();
  const manifest = options.manifest && typeof options.manifest === 'object' ? options.manifest : {};
  const context =
    options.context && typeof options.context === 'object'
      ? options.context
      : manifest.context && typeof manifest.context === 'object'
        ? manifest.context
        : null;
  const skills = normalizeArray(manifest.skills);
  const mcps = normalizeArray(manifest.mcps);
  const executors = normalizeArray(manifest.executors);
  const genomeBindings = mergeGenomeBindings({
    blueprintBindings: manifest.genomeBindings,
    manifestBindings: manifest.genomeBindings || manifest.genomes,
    legacyExecutors: executors
  });
  const resolvedExecutors = attachBindingsToExecutors(executors, genomeBindings);
  const genomes = flattenGenomeBindings(genomeBindings);

  db.prepare(`
    INSERT INTO squads (
      squad_slug, name, mode, mission, goal, status, visibility, manifest_json,
      context_json,
      package_dir, agents_dir, output_dir, logs_dir, media_dir, latest_session_path,
      created_at, updated_at
    ) VALUES (
      @squad_slug, @name, @mode, @mission, @goal, @status, @visibility, @manifest_json,
      @context_json,
      @package_dir, @agents_dir, @output_dir, @logs_dir, @media_dir, @latest_session_path,
      @created_at, @updated_at
    )
    ON CONFLICT(squad_slug) DO UPDATE SET
      name = excluded.name,
      mode = excluded.mode,
      mission = excluded.mission,
      goal = excluded.goal,
      status = excluded.status,
      visibility = excluded.visibility,
      manifest_json = excluded.manifest_json,
      context_json = excluded.context_json,
      package_dir = excluded.package_dir,
      agents_dir = excluded.agents_dir,
      output_dir = excluded.output_dir,
      logs_dir = excluded.logs_dir,
      media_dir = excluded.media_dir,
      latest_session_path = excluded.latest_session_path,
      updated_at = excluded.updated_at
  `).run({
    squad_slug: slug,
    name: String(options.name || manifest.name || slug).trim(),
    mode: String(options.mode || manifest.mode || 'content').trim(),
    mission: options.mission ? String(options.mission).trim() : manifest.mission ? String(manifest.mission).trim() : null,
    goal: options.goal ? String(options.goal).trim() : manifest.goal ? String(manifest.goal).trim() : null,
    status: String(options.status || 'active').trim(),
    visibility: String(options.visibility || manifest.visibility || 'private').trim(),
    manifest_json: JSON.stringify(manifest),
    context_json: context ? JSON.stringify(context) : null,
    package_dir: options.packageDir ? String(options.packageDir).trim() : manifest?.package?.rootDir ? String(manifest.package.rootDir).trim() : null,
    agents_dir: options.agentsDir ? String(options.agentsDir).trim() : null,
    output_dir: options.outputDir ? String(options.outputDir).trim() : null,
    logs_dir: options.logsDir ? String(options.logsDir).trim() : null,
    media_dir: options.mediaDir ? String(options.mediaDir).trim() : null,
    latest_session_path: options.latestSessionPath ? String(options.latestSessionPath).trim() : null,
    created_at: now,
    updated_at: now
  });

  db.prepare('DELETE FROM squad_executors WHERE squad_slug = ?').run(slug);
  db.prepare('DELETE FROM squad_skills WHERE squad_slug = ?').run(slug);
  db.prepare('DELETE FROM squad_mcps WHERE squad_slug = ?').run(slug);
  db.prepare('DELETE FROM squad_genomes WHERE squad_slug = ?').run(slug);

  const insertExecutor = db.prepare(`
    INSERT INTO squad_executors (
      squad_slug, executor_slug, title, role, file_path, skills_json, genomes_json,
      created_at, updated_at
    ) VALUES (
      @squad_slug, @executor_slug, @title, @role, @file_path, @skills_json, @genomes_json,
      @created_at, @updated_at
    )
  `);

  for (const executor of resolvedExecutors) {
    insertExecutor.run({
      squad_slug: slug,
      executor_slug: String(executor.slug || '').trim(),
      title: executor.title ? String(executor.title).trim() : null,
      role: executor.role ? String(executor.role).trim() : null,
      file_path: executor.file ? String(executor.file).trim() : null,
      skills_json: JSON.stringify(normalizeArray(executor.skills)),
      genomes_json: JSON.stringify(normalizeArray(executor.genomes)),
      created_at: now,
      updated_at: now
    });
  }

  const insertSkill = db.prepare(`
    INSERT INTO squad_skills (squad_slug, skill_slug, title, description)
    VALUES (@squad_slug, @skill_slug, @title, @description)
  `);

  for (const skill of skills) {
    insertSkill.run({
      squad_slug: slug,
      skill_slug: String(skill.slug || '').trim(),
      title: skill.title ? String(skill.title).trim() : null,
      description: skill.description ? String(skill.description).trim() : null
    });
  }

  const insertMcp = db.prepare(`
    INSERT INTO squad_mcps (squad_slug, mcp_slug, required, purpose)
    VALUES (@squad_slug, @mcp_slug, @required, @purpose)
  `);

  for (const mcp of mcps) {
    insertMcp.run({
      squad_slug: slug,
      mcp_slug: String(mcp.slug || '').trim(),
      required: mcp.required ? 1 : 0,
      purpose: mcp.purpose ? String(mcp.purpose).trim() : null
    });
  }

  const insertGenome = db.prepare(`
    INSERT INTO squad_genomes (squad_slug, genome_slug, scope_type, agent_slug)
    VALUES (@squad_slug, @genome_slug, @scope_type, @agent_slug)
  `);

  for (const genome of genomes) {
    insertGenome.run({
      squad_slug: slug,
      genome_slug: String(genome.slug || '').trim(),
      scope_type: String(genome.scope || 'squad').trim(),
      agent_slug: genome.agentSlug ? String(genome.agentSlug).trim() : null
    });
  }

  return slug;
}

// ─── Pipeline CRUD ────────────────────────────────────────────────────────────

function upsertPipeline(db, options) {
  const now = nowIso();
  const slug = String(options.slug).trim();
  db.prepare(`
    INSERT INTO squad_pipelines (slug, name, description, status, trigger_mode, created_at, updated_at)
    VALUES (@slug, @name, @description, @status, @trigger_mode, @created_at, @updated_at)
    ON CONFLICT(slug) DO UPDATE SET
      name = excluded.name,
      description = COALESCE(excluded.description, description),
      status = excluded.status,
      trigger_mode = excluded.trigger_mode,
      updated_at = excluded.updated_at
  `).run({
    slug,
    name: String(options.name || slug).trim(),
    description: options.description ? String(options.description).trim() : null,
    status: String(options.status || 'draft').trim(),
    trigger_mode: String(options.triggerMode || 'manual').trim(),
    created_at: now,
    updated_at: now
  });
  return slug;
}

function addPipelineNode(db, options) {
  db.prepare(`
    INSERT INTO pipeline_nodes (pipeline_slug, squad_slug, position_x, position_y, config_json)
    VALUES (@pipeline_slug, @squad_slug, @position_x, @position_y, @config_json)
    ON CONFLICT(pipeline_slug, squad_slug) DO UPDATE SET
      position_x = excluded.position_x,
      position_y = excluded.position_y,
      config_json = COALESCE(excluded.config_json, config_json)
  `).run({
    pipeline_slug: String(options.pipelineSlug).trim(),
    squad_slug: String(options.squadSlug).trim(),
    position_x: Number(options.positionX || 0),
    position_y: Number(options.positionY || 0),
    config_json: options.config ? JSON.stringify(options.config) : null
  });
}

function updateNodePosition(db, options) {
  db.prepare(`
    UPDATE pipeline_nodes SET position_x = @position_x, position_y = @position_y
    WHERE pipeline_slug = @pipeline_slug AND squad_slug = @squad_slug
  `).run({
    pipeline_slug: String(options.pipelineSlug).trim(),
    squad_slug: String(options.squadSlug).trim(),
    position_x: Number(options.positionX || 0),
    position_y: Number(options.positionY || 0)
  });
}

function addPipelineEdge(db, options) {
  db.prepare(`
    INSERT INTO pipeline_edges (pipeline_slug, source_squad, source_port, target_squad, target_port, transform_json)
    VALUES (@pipeline_slug, @source_squad, @source_port, @target_squad, @target_port, @transform_json)
  `).run({
    pipeline_slug: String(options.pipelineSlug).trim(),
    source_squad: String(options.sourceSquad).trim(),
    source_port: String(options.sourcePort).trim(),
    target_squad: String(options.targetSquad).trim(),
    target_port: String(options.targetPort).trim(),
    transform_json: options.transform ? JSON.stringify(options.transform) : null
  });
}

function removePipelineEdge(db, id) {
  db.prepare('DELETE FROM pipeline_edges WHERE id = ?').run(id);
}

function getPipelineDAG(db, pipelineSlug) {
  const pipeline = db.prepare('SELECT * FROM squad_pipelines WHERE slug = ?').get(pipelineSlug);
  if (!pipeline) return null;
  const nodes = db.prepare('SELECT * FROM pipeline_nodes WHERE pipeline_slug = ?').all(pipelineSlug);
  const edges = db.prepare('SELECT * FROM pipeline_edges WHERE pipeline_slug = ?').all(pipelineSlug);
  return { pipeline, nodes, edges };
}

function listPipelines(db) {
  return db.prepare('SELECT * FROM squad_pipelines ORDER BY updated_at DESC').all();
}

function upsertSquadPorts(db, squadSlug, ports) {
  db.prepare('DELETE FROM squad_ports WHERE squad_slug = ?').run(squadSlug);
  const insert = db.prepare(`
    INSERT INTO squad_ports (squad_slug, port_type, port_key, data_type, description, required, content_blueprint_slug)
    VALUES (@squad_slug, @port_type, @port_key, @data_type, @description, @required, @content_blueprint_slug)
  `);
  const all = [...(ports.inputs || []).map(p => ({ ...p, type: 'input' })), ...(ports.outputs || []).map(p => ({ ...p, type: 'output' }))];
  for (const port of all) {
    insert.run({
      squad_slug: String(squadSlug).trim(),
      port_type: port.type,
      port_key: String(port.key).trim(),
      data_type: String(port.dataType || 'any').trim(),
      description: port.description ? String(port.description).trim() : null,
      required: port.required ? 1 : 0,
      content_blueprint_slug: port.contentBlueprintSlug ? String(port.contentBlueprintSlug).trim() : null
    });
  }
}

function getTopologicalOrder(db, pipelineSlug) {
  const nodes = db.prepare('SELECT squad_slug FROM pipeline_nodes WHERE pipeline_slug = ?').all(pipelineSlug);
  const edges = db.prepare('SELECT source_squad, target_squad FROM pipeline_edges WHERE pipeline_slug = ?').all(pipelineSlug);

  const slugs = nodes.map(n => n.squad_slug);
  const inDegree = Object.fromEntries(slugs.map(s => [s, 0]));
  const adj = Object.fromEntries(slugs.map(s => [s, []]));

  for (const { source_squad, target_squad } of edges) {
    if (adj[source_squad] !== undefined && inDegree[target_squad] !== undefined) {
      adj[source_squad].push(target_squad);
      inDegree[target_squad]++;
    }
  }

  const queue = slugs.filter(s => inDegree[s] === 0);
  const order = [];

  while (queue.length > 0) {
    const node = queue.shift();
    order.push(node);
    for (const neighbor of (adj[node] || [])) {
      inDegree[neighbor]--;
      if (inDegree[neighbor] === 0) queue.push(neighbor);
    }
  }

  return order.length === slugs.length ? order : null; // null = cycle detected
}

// ─── Artisan CRUD ─────────────────────────────────────────────────────────────

function createArtisanSquad(db, options) {
  const now = nowIso();
  const id = options.id || `artisan-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const slug = options.slug || id;
  db.prepare(`
    INSERT INTO artisan_squads (id, slug, title, status, domain, goal, mode, prd_markdown, summary, confidence, tags_json, created_at, updated_at)
    VALUES (@id, @slug, @title, @status, @domain, @goal, @mode, @prd_markdown, @summary, @confidence, @tags_json, @created_at, @updated_at)
  `).run({
    id, slug,
    title: options.title || 'Nova ideia',
    status: 'draft',
    domain: options.domain || null,
    goal: options.goal || null,
    mode: options.mode || 'content',
    prd_markdown: options.prdMarkdown || null,
    summary: options.summary || null,
    confidence: options.confidence || 0,
    tags_json: JSON.stringify(options.tags || []),
    created_at: now, updated_at: now
  });
  return id;
}

function updateArtisanSquad(db, id, updates) {
  const now = nowIso();
  const existing = db.prepare('SELECT id FROM artisan_squads WHERE id = ?').get(id);
  if (!existing) throw new Error(`Artisan squad not found: ${id}`);
  const fields = [];
  const values = { id, updated_at: now };
  const allowed = ['title', 'status', 'domain', 'goal', 'mode', 'prd_markdown', 'summary', 'confidence', 'tags_json'];
  for (const key of allowed) {
    if (Object.prototype.hasOwnProperty.call(updates, key)) {
      fields.push(`${key} = @${key}`);
      values[key] = updates[key];
    }
  }
  if (fields.length === 0) return;
  db.prepare(`UPDATE artisan_squads SET ${fields.join(', ')}, updated_at = @updated_at WHERE id = @id`).run(values);
}

function getArtisanSquad(db, id) {
  return db.prepare('SELECT * FROM artisan_squads WHERE id = ?').get(id) || null;
}

function listArtisanSquads(db) {
  return db.prepare('SELECT * FROM artisan_squads ORDER BY updated_at DESC').all();
}

function deleteArtisanSquad(db, id) {
  db.prepare('DELETE FROM artisan_messages WHERE artisan_id = ?').run(id);
  db.prepare('DELETE FROM artisan_squads WHERE id = ?').run(id);
}

function addArtisanMessage(db, artisanId, role, content) {
  const now = nowIso();
  db.prepare(`
    INSERT INTO artisan_messages (artisan_id, role, content, created_at)
    VALUES (@artisan_id, @role, @content, @created_at)
  `).run({ artisan_id: artisanId, role, content, created_at: now });
}

function getArtisanMessages(db, artisanId) {
  return db.prepare('SELECT * FROM artisan_messages WHERE artisan_id = ? ORDER BY created_at ASC').all(artisanId);
}

function insertSquadAnalysis(db, options) {
  const now = nowIso();
  db.prepare(`
    INSERT INTO squad_analyses (squad_slug, coverage_json, suggestions_json, metrics_json, created_at)
    VALUES (@squad_slug, @coverage_json, @suggestions_json, @metrics_json, @created_at)
  `).run({
    squad_slug: String(options.slug).trim(),
    coverage_json: JSON.stringify(options.coverage || {}),
    suggestions_json: JSON.stringify(options.suggestions || []),
    metrics_json: JSON.stringify(options.metrics || {}),
    created_at: now
  });
}

function inferArtifactKind(filePath) {
  if (/\.html?$/i.test(filePath)) return 'html';
  if (/\.md$/i.test(filePath)) return 'markdown';
  return 'file';
}

function startRun(db, options) {
  const now = nowIso();
  const runKey = String(options.runKey || createRunKey(options.agentName));
  const status = normalizeStatus(options.status, 'running');
  const agentKind = String(options.agentKind || (options.squadSlug ? 'squad' : 'official')).trim();
  const taskKey = options.taskKey ? String(options.taskKey).trim() : null;
  const source = String(options.source || 'direct').trim() || 'direct';
  const usedSkillsJson = normalizeStringArray(options.usedSkills).length > 0 ? JSON.stringify(normalizeStringArray(options.usedSkills)) : null;

  if (taskKey) {
    const taskExists = db.prepare('SELECT task_key FROM tasks WHERE task_key = ?').get(taskKey);
    if (!taskExists) {
      throw new Error(`Task not found: ${taskKey}`);
    }
  }

  db.prepare(`
    INSERT INTO agent_runs (
      run_key, task_key, agent_name, agent_kind, squad_slug, session_key, source,
      workflow_id, workflow_stage, parent_run_key, title,
      status, summary, used_skills_json, output_path, started_at, updated_at, finished_at
    ) VALUES (
      @run_key, @task_key, @agent_name, @agent_kind, @squad_slug, @session_key, @source,
      @workflow_id, @workflow_stage, @parent_run_key, @title,
      @status, @summary, @used_skills_json, @output_path, @started_at, @updated_at, @finished_at
    )
  `).run({
    run_key: runKey,
    task_key: taskKey,
    agent_name: String(options.agentName).trim(),
    agent_kind: agentKind,
    squad_slug: options.squadSlug ? String(options.squadSlug).trim() : null,
    session_key: options.sessionKey ? String(options.sessionKey).trim() : null,
    source,
    workflow_id: options.workflowId ? String(options.workflowId).trim() : null,
    workflow_stage: options.workflowStage ? String(options.workflowStage).trim() : null,
    parent_run_key: options.parentRunKey ? String(options.parentRunKey).trim() : null,
    title: options.title ? String(options.title).trim() : null,
    status,
    summary: options.summary ? String(options.summary).trim() : null,
    used_skills_json: usedSkillsJson,
    output_path: options.outputPath ? String(options.outputPath).trim() : null,
    started_at: now,
    updated_at: now,
    finished_at: status === 'completed' || status === 'failed' ? now : null
  });

  appendRunEvent(db, {
    runKey,
    eventType: String(options.eventType || 'start'),
    phase: options.phase || 'run',
    status,
    message: String(options.message || options.title || 'Agent started'),
    payload: options.payload,
    createdAt: now
  });

  return runKey;
}

function updateRun(db, options) {
  const now = nowIso();
  const existing = db
    .prepare('SELECT run_key, status, used_skills_json, source, workflow_id, workflow_stage, parent_run_key FROM agent_runs WHERE run_key = ?')
    .get(options.runKey);
  if (!existing) {
    throw new Error(`Run not found: ${options.runKey}`);
  }
  const taskKey = options.taskKey ? String(options.taskKey).trim() : null;

  if (taskKey) {
    const taskExists = db.prepare('SELECT task_key FROM tasks WHERE task_key = ?').get(taskKey);
    if (!taskExists) {
      throw new Error(`Task not found: ${taskKey}`);
    }
  }

  const nextStatus = normalizeStatus(options.status, existing.status || 'running');
  const existingUsedSkills = parseJsonArray(existing.used_skills_json);
  const nextUsedSkills = normalizeStringArray([...(existingUsedSkills || []), ...normalizeStringArray(options.usedSkills)]);
  db.prepare(`
    UPDATE agent_runs
    SET
      status = @status,
      summary = COALESCE(@summary, summary),
      used_skills_json = COALESCE(@used_skills_json, used_skills_json),
      output_path = COALESCE(@output_path, output_path),
      task_key = COALESCE(@task_key, task_key),
      source = COALESCE(@source, source),
      workflow_id = COALESCE(@workflow_id, workflow_id),
      workflow_stage = COALESCE(@workflow_stage, workflow_stage),
      parent_run_key = COALESCE(@parent_run_key, parent_run_key),
      updated_at = @updated_at,
      finished_at = CASE
        WHEN @status IN ('completed', 'failed') THEN @updated_at
        ELSE finished_at
      END
    WHERE run_key = @run_key
  `).run({
    run_key: String(options.runKey),
    status: nextStatus,
    summary: options.summary ? String(options.summary).trim() : null,
    used_skills_json: nextUsedSkills.length > 0 ? JSON.stringify(nextUsedSkills) : null,
    output_path: options.outputPath ? String(options.outputPath).trim() : null,
    task_key: taskKey,
    source: options.source ? String(options.source).trim() : null,
    workflow_id: options.workflowId ? String(options.workflowId).trim() : null,
    workflow_stage: options.workflowStage ? String(options.workflowStage).trim() : null,
    parent_run_key: options.parentRunKey ? String(options.parentRunKey).trim() : null,
    updated_at: now
  });

  appendRunEvent(db, {
    runKey: String(options.runKey),
    eventType: String(options.eventType || 'update'),
    phase: options.phase || 'run',
    status: nextStatus,
    toolName: options.toolName,
    message: String(options.message || options.summary || 'Run updated'),
    payload: options.payload,
    createdAt: now
  });

  return nextStatus;
}

function getStatusSnapshot(db) {
  const taskSummaryRows = db.prepare(`
    SELECT status, COUNT(*) AS count
    FROM tasks
    GROUP BY status
  `).all();

  const taskCounts = {
    queued: 0,
    running: 0,
    completed: 0,
    failed: 0
  };

  for (const row of taskSummaryRows) {
    if (Object.prototype.hasOwnProperty.call(taskCounts, row.status)) {
      taskCounts[row.status] = Number(row.count || 0);
    }
  }

  const summaryRows = db.prepare(`
    SELECT status, COUNT(*) AS count
    FROM agent_runs
    GROUP BY status
  `).all();

  const counts = {
    queued: 0,
    running: 0,
    completed: 0,
    failed: 0
  };

  for (const row of summaryRows) {
    if (Object.prototype.hasOwnProperty.call(counts, row.status)) {
      counts[row.status] = Number(row.count || 0);
    }
  }

  const activeRuns = db.prepare(`
    SELECT run_key, task_key, agent_name, agent_kind, squad_slug, session_key, source, workflow_id, workflow_stage, parent_run_key, title, status, summary, used_skills_json, output_path, started_at, updated_at
    FROM agent_runs
    WHERE status IN ('queued', 'running')
    ORDER BY updated_at DESC, started_at DESC
  `).all();

  const recentRuns = db.prepare(`
    SELECT run_key, task_key, agent_name, agent_kind, squad_slug, session_key, source, workflow_id, workflow_stage, parent_run_key, title, status, summary, used_skills_json, output_path, started_at, updated_at, finished_at
    FROM agent_runs
    ORDER BY updated_at DESC, started_at DESC
    LIMIT 20
  `).all();

  const activeTasks = db.prepare(`
    SELECT
      task_key, squad_slug, session_key, task_kind, parent_task_key, title, goal, meta_json, status, created_by, created_at, updated_at,
      (
        SELECT COUNT(*)
        FROM agent_runs
        WHERE agent_runs.task_key = tasks.task_key
      ) AS agent_count,
      (
        SELECT COUNT(*)
        FROM artifacts
        WHERE artifacts.task_key = tasks.task_key
      ) AS artifact_count,
      (
        SELECT agent_name
        FROM agent_runs
        WHERE agent_runs.task_key = tasks.task_key
        ORDER BY CASE WHEN agent_runs.status IN ('queued', 'running') THEN 0 ELSE 1 END, updated_at DESC, started_at DESC
        LIMIT 1
      ) AS latest_agent_name,
      (
        SELECT COUNT(*)
        FROM tasks AS child_tasks
        WHERE child_tasks.parent_task_key = tasks.task_key
      ) AS child_task_count,
      (
        SELECT COUNT(*)
        FROM tasks AS child_tasks
        WHERE child_tasks.parent_task_key = tasks.task_key AND child_tasks.status = 'completed'
      ) AS completed_child_task_count,
      (
        SELECT COUNT(*)
        FROM agent_runs AS handoff_runs
        WHERE handoff_runs.task_key = tasks.task_key AND handoff_runs.parent_run_key IS NOT NULL
      ) AS handoff_count
    FROM tasks
    WHERE status IN ('queued', 'running')
    ORDER BY updated_at DESC, created_at DESC
  `).all();

  const recentTasks = db.prepare(`
    SELECT
      task_key, squad_slug, session_key, task_kind, parent_task_key, title, goal, meta_json, status, created_by, created_at, updated_at, finished_at,
      (
        SELECT COUNT(*)
        FROM agent_runs
        WHERE agent_runs.task_key = tasks.task_key
      ) AS agent_count,
      (
        SELECT COUNT(*)
        FROM artifacts
        WHERE artifacts.task_key = tasks.task_key
      ) AS artifact_count,
      (
        SELECT agent_name
        FROM agent_runs
        WHERE agent_runs.task_key = tasks.task_key
        ORDER BY CASE WHEN agent_runs.status IN ('queued', 'running') THEN 0 ELSE 1 END, updated_at DESC, started_at DESC
        LIMIT 1
      ) AS latest_agent_name,
      (
        SELECT COUNT(*)
        FROM tasks AS child_tasks
        WHERE child_tasks.parent_task_key = tasks.task_key
      ) AS child_task_count,
      (
        SELECT COUNT(*)
        FROM tasks AS child_tasks
        WHERE child_tasks.parent_task_key = tasks.task_key AND child_tasks.status = 'completed'
      ) AS completed_child_task_count,
      (
        SELECT COUNT(*)
        FROM agent_runs AS handoff_runs
        WHERE handoff_runs.task_key = tasks.task_key AND handoff_runs.parent_run_key IS NOT NULL
      ) AS handoff_count
    FROM tasks
    ORDER BY updated_at DESC, created_at DESC
    LIMIT 20
  `).all();

  const recentArtifacts = db.prepare(`
    SELECT id, task_key, run_key, squad_slug, agent_name, kind, title, file_path, created_at
    FROM artifacts
    ORDER BY created_at DESC
    LIMIT 20
  `).all();

  const recentContentItems = db.prepare(`
    SELECT
      content_key, task_key, run_key, squad_slug, session_key, title, content_type, layout_type,
      status, summary, blueprint_slug, used_skills_json, json_path, html_path, created_by_agent, created_at, updated_at
    FROM content_items
    ORDER BY updated_at DESC, created_at DESC
    LIMIT 20
  `).all();

  const recentExecutionEvents = db.prepare(`
    SELECT
      id, task_key, run_key, agent_name, agent_kind, squad_slug, session_key, source,
      workflow_id, workflow_stage, parent_run_key, event_type, phase, status,
      tool_name, message, payload_json, sequence_no, parent_event_id, created_at
    FROM execution_events
    ORDER BY created_at DESC, id DESC
    LIMIT 40
  `).all();

  for (const row of activeRuns) {
    decorateRunSnapshotRow(row);
  }

  for (const row of recentRuns) {
    decorateRunSnapshotRow(row);
  }

  for (const row of activeTasks) {
    decorateTaskSnapshotRow(row);
  }

  for (const row of recentTasks) {
    decorateTaskSnapshotRow(row);
  }

  for (const row of recentContentItems) {
    row.used_skills = parseJsonArray(row.used_skills_json);
  }

  for (const row of recentExecutionEvents) {
    decorateExecutionEventSnapshotRow(row);
  }

  const activeLiveSessions = activeTasks.filter((task) => task.task_kind === 'live_session');
  const activeMicroTasks = activeTasks.filter((task) => task.task_kind === 'micro_task');
  const recentLiveSessions = recentTasks.filter((task) => task.task_kind === 'live_session');
  const recentMicroTasks = recentTasks.filter((task) => task.task_kind === 'micro_task');
  const recentHandoffs = recentExecutionEvents.filter((event) => event.event_type === 'handoff');

  return {
    taskCounts,
    counts,
    activeTasks,
    recentTasks,
    activeRuns,
    recentRuns,
    activeLiveSessions,
    activeMicroTasks,
    recentLiveSessions,
    recentMicroTasks,
    recentHandoffs,
    recentArtifacts,
    recentContentItems,
    recentExecutionEvents
  };
}

// ─── Agent Log Session helpers ───────────────────────────────────────────────

function resolveSessionsDir(runtimeDir) {
  return path.join(runtimeDir, SESSIONS_DIR);
}

function resolveSessionFile(runtimeDir, agentName) {
  return path.join(resolveSessionsDir(runtimeDir), `${agentName}.json`);
}

async function readAgentSession(runtimeDir, agentName) {
  const filePath = resolveSessionFile(runtimeDir, agentName);
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function writeAgentSession(runtimeDir, agentName, data) {
  const sessionsDir = resolveSessionsDir(runtimeDir);
  await ensureDir(sessionsDir);
  const filePath = resolveSessionFile(runtimeDir, agentName);
  await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf8');
}

async function clearAgentSession(runtimeDir, agentName) {
  const filePath = resolveSessionFile(runtimeDir, agentName);
  try { await fs.unlink(filePath); } catch { /* noop */ }
}

/**
 * Core function for `aioson runtime-log`.
 *
 * Squad agents (--squad): state is stored in SQLite, not in session files.
 *   This avoids race conditions when the orquestrador calls runtime-log in
 *   parallel bash commands — SQLite serializes concurrent writes automatically.
 *   Logic: find the most-recent running task for the squad → find or create a
 *   run for this agent → add event. If no running task exists, create one.
 *
 * Official agents (no --squad): state is stored in .sessions/{agent}.json.
 *   Single-process by design, no race condition.
 */
async function logAgentEvent(db, runtimeDir, options) {
  const agentName = String(options.agentName || 'unknown').trim();
  const squadSlug = options.squadSlug ? String(options.squadSlug).trim() : null;
  const sessionKey = options.sessionKey ? String(options.sessionKey).trim() : null;
  const isFinish = Boolean(options.finish);
  const now = nowIso();

  let runKey = null;
  let taskKey = null;

  if (squadSlug) {
    // ── Squad agent: look up active task from SQLite ──────────────────────────
    const activeTask = db.prepare(
      `SELECT task_key FROM tasks WHERE squad_slug = ? AND status IN ('running', 'queued') ORDER BY created_at DESC LIMIT 1`
    ).get(squadSlug);

    if (activeTask) {
      taskKey = activeTask.task_key;
    } else {
      // No active task — create one (only the first concurrent call wins; the
      // second will find the task on its next read because SQLite is serialized)
      const taskTitle = options.taskTitle || `${squadSlug} — sessão`;
      taskKey = startTask(db, {
        title: taskTitle,
        squadSlug,
        status: 'running',
        createdBy: agentName
      });
    }

    // Find existing running run for this specific agent under the task
    const activeRun = db.prepare(
      `SELECT run_key FROM agent_runs WHERE task_key = ? AND agent_name = ? AND status = 'running' LIMIT 1`
    ).get(taskKey, agentName);

    if (activeRun) {
      runKey = activeRun.run_key;
      if (!isFinish) {
        appendRunEvent(db, {
          runKey,
          eventType: options.type || 'status',
          phase: options.type || 'run',
          status: 'running',
          message: String(options.message || ''),
          payload: options.meta,
          createdAt: now
        });
      }
    } else {
      // First call for this agent — create a run (and emit start event via startRun)
      // Use taskTitle from --title only if provided, otherwise use agent name
      const runTitle = options.taskTitle || `@${agentName}`;
      runKey = startRun(db, {
        taskKey,
        agentName,
        agentKind: 'squad',
        squadSlug,
        title: runTitle,
        message: options.message || 'Iniciando'
      });
    }
  } else {
    // ── Official agent: session-file based ───────────────────────────────────
    const session = await readAgentSession(runtimeDir, agentName);
    runKey = session && !session.finished ? session.runKey : null;
    taskKey = session && !session.finished ? session.taskKey : null;

    if (!runKey) {
      const taskTitle = options.taskTitle || `@${agentName}`;
      taskKey = startTask(db, {
        title: taskTitle,
        squadSlug: null,
        sessionKey,
        status: 'running',
        createdBy: agentName
      });
      runKey = startRun(db, {
        taskKey,
        agentName,
        agentKind: 'official',
        squadSlug: null,
        sessionKey,
        title: taskTitle,
        message: options.message || 'Iniciando'
      });
      await writeAgentSession(runtimeDir, agentName, { runKey, taskKey, sessionKey, startedAt: now, finished: false });
    } else {
      appendRunEvent(db, {
        runKey,
        eventType: options.type || 'status',
        phase: options.type || 'run',
        status: 'running',
        message: String(options.message || ''),
        payload: options.meta,
        createdAt: now
      });
    }
  }

  if (isFinish) {
    const finalStatus = normalizeStatus(options.status, 'completed');
    updateRun(db, {
      runKey,
      status: finalStatus,
      summary: options.summary,
      eventType: finalStatus === 'completed' ? 'finished' : 'failed',
      message: options.message || (finalStatus === 'completed' ? 'Concluído' : 'Falhou')
    });
    // For squad: only finish the task when orquestrador calls --finish
    const isOrquestrador = agentName === 'orquestrador';
    if (taskKey && (!squadSlug || isOrquestrador)) {
      updateTask(db, { taskKey, status: finalStatus });
      if (!squadSlug) await clearAgentSession(runtimeDir, agentName);
    }
  }

  return { runKey, taskKey };
}

// --- Squad Investigations CRUD ---

function insertInvestigation(db, options = {}) {
  const slug = options.investigationSlug || `inv-${slugify(options.domain || 'unknown')}-${Date.now()}`;
  const now = nowIso();
  db.prepare(`
    INSERT OR REPLACE INTO squad_investigations
      (investigation_slug, domain, mode, dimensions_covered, total_dimensions,
       confidence, report_path, linked_squad_slug, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    slug,
    String(options.domain || ''),
    String(options.mode || 'full'),
    Number(options.dimensionsCovered) || 0,
    Number(options.totalDimensions) || 7,
    Number(options.confidence) || 0,
    options.reportPath || null,
    options.linkedSquadSlug || null,
    now,
    now
  );
  return slug;
}

function listInvestigations(db) {
  return db.prepare(`
    SELECT * FROM squad_investigations ORDER BY created_at DESC
  `).all();
}

function getInvestigation(db, slug) {
  return db.prepare(`
    SELECT * FROM squad_investigations WHERE investigation_slug = ?
  `).get(slug) || null;
}

function linkInvestigation(db, investigationSlug, squadSlug) {
  const now = nowIso();
  const result = db.prepare(`
    UPDATE squad_investigations
    SET linked_squad_slug = ?, updated_at = ?
    WHERE investigation_slug = ?
  `).run(squadSlug, now, investigationSlug);
  return result.changes > 0;
}

// --- Implementation Plans CRUD ---

function upsertImplementationPlan(db, options = {}) {
  const planId = options.planId || `plan-${slugify(options.projectName || 'proj')}-${Date.now()}`;
  const now = nowIso();
  db.prepare(`
    INSERT OR REPLACE INTO implementation_plans
      (plan_id, project_name, scope, feature_slug, status, classification,
       phases_total, phases_completed, source_artifacts, source_hash, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    planId,
    options.projectName || null,
    options.scope || 'project',
    options.featureSlug || null,
    options.status || 'draft',
    options.classification || null,
    Number(options.phasesTotal) || 0,
    Number(options.phasesCompleted) || 0,
    options.sourceArtifacts ? JSON.stringify(options.sourceArtifacts) : null,
    options.sourceHash || null,
    now,
    now
  );
  return planId;
}

function getImplementationPlan(db, planId) {
  return db.prepare(`
    SELECT * FROM implementation_plans WHERE plan_id = ?
  `).get(planId) || null;
}

function listImplementationPlans(db) {
  return db.prepare(`
    SELECT * FROM implementation_plans ORDER BY created_at DESC
  `).all();
}

function updateImplementationPlanStatus(db, planId, status) {
  const now = nowIso();
  const result = db.prepare(`
    UPDATE implementation_plans SET status = ?, updated_at = ? WHERE plan_id = ?
  `).run(status, now, planId);
  return result.changes > 0;
}

function upsertPlanPhase(db, planId, phaseNumber, title, status) {
  db.prepare(`
    INSERT OR REPLACE INTO plan_phases (plan_id, phase_number, title, status, completed_at)
    VALUES (?, ?, ?, ?, ?)
  `).run(
    planId,
    phaseNumber,
    title,
    status || 'pending',
    status === 'completed' ? nowIso() : null
  );
}

function updatePlanPhaseStatus(db, planId, phaseNumber, status, notes) {
  const now = nowIso();
  const result = db.prepare(`
    UPDATE plan_phases SET status = ?, completed_at = ?, notes = ?
    WHERE plan_id = ? AND phase_number = ?
  `).run(
    status,
    status === 'completed' ? now : null,
    notes || null,
    planId,
    phaseNumber
  );
  if (result.changes > 0 && status === 'completed') {
    db.prepare(`
      UPDATE implementation_plans
      SET phases_completed = (SELECT COUNT(*) FROM plan_phases WHERE plan_id = ? AND status = 'completed'),
          updated_at = ?
      WHERE plan_id = ?
    `).run(planId, now, planId);
  }
  return result.changes > 0;
}

function getPlanPhases(db, planId) {
  return db.prepare(`
    SELECT * FROM plan_phases WHERE plan_id = ? ORDER BY phase_number
  `).all(planId);
}

// --- Squad Execution Plans CRUD ---

function upsertSquadExecutionPlan(db, options = {}) {
  const planSlug = options.planSlug || `sqplan-${slugify(options.squadSlug || 'squad')}-${Date.now()}`;
  const now = nowIso();
  db.prepare(`
    INSERT OR REPLACE INTO squad_execution_plans
      (plan_slug, squad_slug, status, rounds_total, rounds_completed,
       based_on_blueprint, based_on_investigation, source_hash, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    planSlug,
    options.squadSlug || '',
    options.status || 'draft',
    Number(options.roundsTotal) || 0,
    Number(options.roundsCompleted) || 0,
    options.basedOnBlueprint || null,
    options.basedOnInvestigation || null,
    options.sourceHash || null,
    now,
    now
  );
  return planSlug;
}

function getSquadExecutionPlan(db, planSlug) {
  return db.prepare(`
    SELECT * FROM squad_execution_plans WHERE plan_slug = ?
  `).get(planSlug) || null;
}

function getSquadExecutionPlanBySquad(db, squadSlug) {
  return db.prepare(`
    SELECT * FROM squad_execution_plans WHERE squad_slug = ? ORDER BY created_at DESC LIMIT 1
  `).get(squadSlug) || null;
}

function listSquadExecutionPlans(db) {
  return db.prepare(`
    SELECT * FROM squad_execution_plans ORDER BY created_at DESC
  `).all();
}

function updateSquadExecutionPlanStatus(db, planSlug, status) {
  const now = nowIso();
  const result = db.prepare(`
    UPDATE squad_execution_plans SET status = ?, updated_at = ? WHERE plan_slug = ?
  `).run(status, now, planSlug);
  return result.changes > 0;
}

function upsertSquadPlanRound(db, planSlug, roundNumber, executorSlug, title, status) {
  db.prepare(`
    INSERT OR REPLACE INTO squad_plan_rounds (plan_slug, round_number, executor_slug, title, status, completed_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    planSlug,
    roundNumber,
    executorSlug,
    title,
    status || 'pending',
    status === 'completed' ? nowIso() : null
  );
}

function updateSquadPlanRoundStatus(db, planSlug, roundNumber, status, notes) {
  const now = nowIso();
  const result = db.prepare(`
    UPDATE squad_plan_rounds SET status = ?, completed_at = ?, notes = ?
    WHERE plan_slug = ? AND round_number = ?
  `).run(
    status,
    status === 'completed' ? now : null,
    notes || null,
    planSlug,
    roundNumber
  );
  if (result.changes > 0 && status === 'completed') {
    db.prepare(`
      UPDATE squad_execution_plans
      SET rounds_completed = (SELECT COUNT(*) FROM squad_plan_rounds WHERE plan_slug = ? AND status = 'completed'),
          updated_at = ?
      WHERE plan_slug = ?
    `).run(planSlug, now, planSlug);
  }
  return result.changes > 0;
}

function getSquadPlanRounds(db, planSlug) {
  return db.prepare(`
    SELECT * FROM squad_plan_rounds WHERE plan_slug = ? ORDER BY round_number
  `).all(planSlug);
}

// --- Squad Learnings CRUD ---

function insertSquadLearning(db, options = {}) {
  const learningId = options.learningId || `sl-${slugify(options.squadSlug || 'squad')}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const now = nowIso();
  db.prepare(`
    INSERT OR REPLACE INTO squad_learnings
      (learning_id, squad_slug, type, title, signal, confidence, frequency,
       last_reinforced, applies_to, file_path, promoted_to, status,
       source_session, evidence, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    learningId,
    options.squadSlug || '',
    options.type || 'preference',
    options.title || '',
    options.signal || 'explicit',
    options.confidence || 'medium',
    Number(options.frequency) || 1,
    options.lastReinforced || now,
    options.appliesTo || 'squad',
    options.filePath || null,
    options.promotedTo || null,
    options.status || 'active',
    options.sourceSession || null,
    options.evidence || null,
    now,
    now
  );
  return learningId;
}

function listSquadLearnings(db, squadSlug, statusFilter) {
  if (statusFilter) {
    return db.prepare(`
      SELECT * FROM squad_learnings WHERE squad_slug = ? AND status = ? ORDER BY created_at DESC
    `).all(squadSlug, statusFilter);
  }
  return db.prepare(`
    SELECT * FROM squad_learnings WHERE squad_slug = ? ORDER BY created_at DESC
  `).all(squadSlug);
}

function getSquadLearning(db, learningId) {
  return db.prepare(`
    SELECT * FROM squad_learnings WHERE learning_id = ?
  `).get(learningId) || null;
}

function updateSquadLearningStatus(db, learningId, status) {
  const now = nowIso();
  const result = db.prepare(`
    UPDATE squad_learnings SET status = ?, updated_at = ? WHERE learning_id = ?
  `).run(status, now, learningId);
  return result.changes > 0;
}

function reinforceSquadLearning(db, learningId) {
  const now = nowIso();
  const result = db.prepare(`
    UPDATE squad_learnings SET frequency = frequency + 1, last_reinforced = ?, updated_at = ? WHERE learning_id = ?
  `).run(now, now, learningId);
  return result.changes > 0;
}

function promoteSquadLearning(db, learningId, promotedTo) {
  const now = nowIso();
  const result = db.prepare(`
    UPDATE squad_learnings SET status = 'promoted', promoted_to = ?, updated_at = ? WHERE learning_id = ?
  `).run(promotedTo, now, learningId);
  return result.changes > 0;
}

function archiveStaleSquadLearnings(db, squadSlug, staleDays) {
  const days = Number(staleDays) || 90;
  const cutoff = new Date(Date.now() - days * 86400000).toISOString();
  const result = db.prepare(`
    UPDATE squad_learnings SET status = 'stale', updated_at = datetime('now')
    WHERE squad_slug = ? AND status = 'active' AND last_reinforced < ?
  `).run(squadSlug, cutoff);
  return result.changes;
}

function getSquadLearningStats(db, squadSlug) {
  return db.prepare(`
    SELECT type, status, COUNT(*) as count FROM squad_learnings
    WHERE squad_slug = ? GROUP BY type, status ORDER BY type, status
  `).all(squadSlug);
}

// --- Project Learnings CRUD ---

function insertProjectLearning(db, options = {}) {
  const learningId = options.learningId || `pl-${slugify(options.projectName || 'proj')}-${Date.now()}`;
  const now = nowIso();
  db.prepare(`
    INSERT OR REPLACE INTO project_learnings
      (learning_id, project_name, feature_slug, type, title, confidence, frequency,
       last_reinforced, applies_to, promoted_to, status,
       source_session, evidence, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    learningId,
    options.projectName || null,
    options.featureSlug || null,
    options.type || 'preference',
    options.title || '',
    options.confidence || 'medium',
    Number(options.frequency) || 1,
    options.lastReinforced || now,
    options.appliesTo || 'project',
    options.promotedTo || null,
    options.status || 'active',
    options.sourceSession || null,
    options.evidence || null,
    now,
    now
  );
  return learningId;
}

function listProjectLearnings(db, statusFilter) {
  if (statusFilter) {
    return db.prepare(`
      SELECT * FROM project_learnings WHERE status = ? ORDER BY created_at DESC
    `).all(statusFilter);
  }
  return db.prepare(`
    SELECT * FROM project_learnings ORDER BY created_at DESC
  `).all();
}

function getProjectLearning(db, learningId) {
  return db.prepare(`
    SELECT * FROM project_learnings WHERE learning_id = ?
  `).get(learningId) || null;
}

function updateProjectLearningStatus(db, learningId, status) {
  const now = nowIso();
  const result = db.prepare(`
    UPDATE project_learnings SET status = ?, updated_at = ? WHERE learning_id = ?
  `).run(status, now, learningId);
  return result.changes > 0;
}

function reinforceProjectLearning(db, learningId) {
  const now = nowIso();
  const result = db.prepare(`
    UPDATE project_learnings SET frequency = frequency + 1, last_reinforced = ?, updated_at = ? WHERE learning_id = ?
  `).run(now, now, learningId);
  return result.changes > 0;
}

function promoteProjectLearning(db, learningId, promotedTo) {
  const now = nowIso();
  const result = db.prepare(`
    UPDATE project_learnings SET status = 'promoted', promoted_to = ?, updated_at = ? WHERE learning_id = ?
  `).run(promotedTo, now, learningId);
  return result.changes > 0;
}

function getProjectLearningStats(db) {
  return db.prepare(`
    SELECT type, status, COUNT(*) as count FROM project_learnings
    GROUP BY type, status ORDER BY type, status
  `).all();
}

// --- Squad Metrics CRUD ---

function upsertSquadMetric(db, { squadSlug, metricKey, value, unit, period, baseline, target, source, notes }) {
  db.prepare(`
    INSERT INTO squad_metrics (squad_slug, metric_key, metric_value, metric_unit, period, baseline, target, source, notes)
    VALUES (@squad_slug, @metric_key, @metric_value, @metric_unit, @period, @baseline, @target, @source, @notes)
    ON CONFLICT(squad_slug, metric_key, period) DO UPDATE SET
      metric_value = excluded.metric_value,
      metric_unit = excluded.metric_unit,
      baseline = COALESCE(excluded.baseline, squad_metrics.baseline),
      target = COALESCE(excluded.target, squad_metrics.target),
      source = excluded.source,
      notes = COALESCE(excluded.notes, squad_metrics.notes)
  `).run({
    squad_slug: String(squadSlug).trim(),
    metric_key: String(metricKey).trim(),
    metric_value: Number(value),
    metric_unit: unit ? String(unit).trim() : null,
    period: period ? String(period).trim() : null,
    baseline: baseline != null ? Number(baseline) : null,
    target: target != null ? Number(target) : null,
    source: source ? String(source).trim() : 'manual',
    notes: notes ? String(notes).trim() : null
  });
}

function listSquadMetrics(db, squadSlug, period) {
  if (period) {
    return db.prepare(
      'SELECT * FROM squad_metrics WHERE squad_slug = ? AND period = ? ORDER BY metric_key ASC'
    ).all(squadSlug, period);
  }
  return db.prepare(
    'SELECT * FROM squad_metrics WHERE squad_slug = ? ORDER BY period DESC, metric_key ASC'
  ).all(squadSlug);
}

function deleteSquadMetric(db, squadSlug, metricKey, period) {
  db.prepare(
    'DELETE FROM squad_metrics WHERE squad_slug = ? AND metric_key = ? AND period = ?'
  ).run(squadSlug, metricKey, period);
}

// --- Worker Runs CRUD ---

function insertWorkerRun(db, { squadSlug, workerSlug, triggerType, inputJson, outputJson, status, errorMessage, durationMs, attempt, conversationId }) {
  const now = nowIso();
  return db.prepare(`
    INSERT INTO worker_runs (squad_slug, worker_slug, trigger_type, input_json, output_json, status, error_message, duration_ms, attempt, conversation_id, created_at, completed_at)
    VALUES (@squad_slug, @worker_slug, @trigger_type, @input_json, @output_json, @status, @error_message, @duration_ms, @attempt, @conversation_id, @created_at, @completed_at)
  `).run({
    squad_slug: String(squadSlug).trim(),
    worker_slug: String(workerSlug).trim(),
    trigger_type: String(triggerType || 'manual').trim(),
    input_json: inputJson || null,
    output_json: outputJson || null,
    status: String(status || 'running').trim(),
    error_message: errorMessage || null,
    duration_ms: durationMs != null ? Number(durationMs) : null,
    attempt: Number(attempt || 1),
    conversation_id: conversationId || null,
    created_at: now,
    completed_at: (status === 'completed' || status === 'failed') ? now : null
  });
}

function listWorkerRuns(db, squadSlug, limit = 50) {
  return db.prepare(
    'SELECT * FROM worker_runs WHERE squad_slug = ? ORDER BY created_at DESC, id DESC LIMIT ?'
  ).all(squadSlug, limit);
}

function getWorkerRunStats(db, squadSlug) {
  return db.prepare(`
    SELECT worker_slug, status, COUNT(*) as count,
           AVG(duration_ms) as avg_duration_ms
    FROM worker_runs WHERE squad_slug = ?
    GROUP BY worker_slug, status
    ORDER BY worker_slug, status
  `).all(squadSlug);
}

// --- MCP Status CRUD ---

function upsertMcpStatus(db, { squadSlug, mcpSlug, connector, status, lastError }) {
  db.prepare(`
    INSERT INTO mcp_status (squad_slug, mcp_slug, connector, status, last_check, last_error)
    VALUES (?, ?, ?, ?, datetime('now'), ?)
    ON CONFLICT(squad_slug, mcp_slug) DO UPDATE SET
      connector = excluded.connector,
      status = excluded.status,
      last_check = excluded.last_check,
      last_error = excluded.last_error
  `).run(squadSlug, mcpSlug, connector, status || 'unconfigured', lastError || null);
}

function incrementMcpCalls(db, squadSlug, mcpSlug, failed) {
  if (failed) {
    db.prepare(`
      UPDATE mcp_status SET calls_total = calls_total + 1, calls_failed = calls_failed + 1
      WHERE squad_slug = ? AND mcp_slug = ?
    `).run(squadSlug, mcpSlug);
  } else {
    db.prepare(`
      UPDATE mcp_status SET calls_total = calls_total + 1
      WHERE squad_slug = ? AND mcp_slug = ?
    `).run(squadSlug, mcpSlug);
  }
}

function listMcpStatus(db, squadSlug) {
  return db.prepare('SELECT * FROM mcp_status WHERE squad_slug = ? ORDER BY mcp_slug').all(squadSlug);
}

function getMcpStatus(db, squadSlug, mcpSlug) {
  return db.prepare('SELECT * FROM mcp_status WHERE squad_slug = ? AND mcp_slug = ?').get(squadSlug, mcpSlug);
}

// --- ROI Config CRUD ---

function upsertROIConfig(db, { squadSlug, pricingModel, setupFee, monthlyFee, percentageFee, percentageBase, currency, contractMonths }) {
  db.prepare(`
    INSERT INTO squad_roi_config (squad_slug, pricing_model, setup_fee, monthly_fee, percentage_fee, percentage_base, currency, contract_months)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(squad_slug) DO UPDATE SET
      pricing_model = excluded.pricing_model,
      setup_fee = excluded.setup_fee,
      monthly_fee = excluded.monthly_fee,
      percentage_fee = excluded.percentage_fee,
      percentage_base = excluded.percentage_base,
      currency = excluded.currency,
      contract_months = excluded.contract_months,
      updated_at = datetime('now')
  `).run(squadSlug, pricingModel || 'fixed', setupFee || null, monthlyFee || null, percentageFee || null, percentageBase || null, currency || 'BRL', contractMonths || 12);
}

function getROIConfig(db, squadSlug) {
  return db.prepare('SELECT * FROM squad_roi_config WHERE squad_slug = ?').get(squadSlug);
}

function deleteROIConfig(db, squadSlug) {
  return db.prepare('DELETE FROM squad_roi_config WHERE squad_slug = ?').run(squadSlug);
}

// ─── Dynamic Tools CRUD ───────────────────────────────────────────────────────

function registerDynamicTool(db, opts) {
  const now = nowIso();
  db.prepare(`
    INSERT OR REPLACE INTO dynamic_tools
      (name, description, input_schema, handler_type, handler_code, handler_path, squad_slug, registered_at, registered_by)
    VALUES
      (@name, @description, @inputSchema, @handlerType, @handlerCode, @handlerPath, @squadSlug, @registeredAt, @registeredBy)
  `).run({
    name: String(opts.name),
    description: String(opts.description),
    inputSchema: opts.inputSchema ? JSON.stringify(opts.inputSchema) : '{}',
    handlerType: String(opts.handlerType || 'shell'),
    handlerCode: opts.handlerCode || null,
    handlerPath: opts.handlerPath || null,
    squadSlug: opts.squadSlug || null,
    registeredAt: now,
    registeredBy: opts.registeredBy || null
  });
  return opts.name;
}

function unregisterDynamicTool(db, name) {
  return db.prepare('DELETE FROM dynamic_tools WHERE name = ?').run(name);
}

function getDynamicTool(db, name) {
  return db.prepare('SELECT * FROM dynamic_tools WHERE name = ?').get(name) || null;
}

function listDynamicTools(db, squadSlug = null) {
  if (squadSlug) {
    return db.prepare('SELECT * FROM dynamic_tools WHERE squad_slug = ? ORDER BY registered_at DESC').all(squadSlug);
  }
  return db.prepare('SELECT * FROM dynamic_tools ORDER BY registered_at DESC').all();
}

// ─── Evolution Log CRUD ───────────────────────────────────────────────────────

function insertEvolutionLog(db, opts) {
  const id = `evo-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  db.prepare(`
    INSERT INTO evolution_log (id, applied_at, deltas_count, squad_slug, files_json, source_learning_ids_json)
    VALUES (@id, @appliedAt, @deltasCount, @squadSlug, @filesJson, @sourceIdsJson)
  `).run({
    id,
    appliedAt: nowIso(),
    deltasCount: Number(opts.deltasCount || 0),
    squadSlug: opts.squadSlug || null,
    filesJson: JSON.stringify(opts.files || []),
    sourceIdsJson: JSON.stringify(opts.sourceLearningIds || [])
  });
  return id;
}

function listEvolutionLog(db, limit = 20) {
  return db.prepare('SELECT * FROM evolution_log ORDER BY applied_at DESC LIMIT ?').all(limit);
}

module.exports = {
  resolveRuntimePaths,
  runtimeStoreExists,
  openRuntimeDb,
  upsertSquadManifest,
  insertSquadAnalysis,
  startTask,
  updateTask,
  startRun,
  updateRun,
  attachArtifact,
  upsertContentItem,
  getStatusSnapshot,
  createRunKey,
  createTaskKey,
  appendRunEvent,
  appendContextLoadEvent,
  logAgentEvent,
  readAgentSession,
  writeAgentSession,
  clearAgentSession,
  // Pipeline CRUD
  upsertPipeline,
  addPipelineNode,
  updateNodePosition,
  addPipelineEdge,
  removePipelineEdge,
  getPipelineDAG,
  listPipelines,
  upsertSquadPorts,
  getTopologicalOrder,
  // Artisan CRUD
  createArtisanSquad,
  updateArtisanSquad,
  getArtisanSquad,
  listArtisanSquads,
  deleteArtisanSquad,
  addArtisanMessage,
  getArtisanMessages,
  // Investigation CRUD
  insertInvestigation,
  listInvestigations,
  getInvestigation,
  linkInvestigation,
  // Implementation Plans CRUD
  upsertImplementationPlan,
  getImplementationPlan,
  listImplementationPlans,
  updateImplementationPlanStatus,
  upsertPlanPhase,
  updatePlanPhaseStatus,
  getPlanPhases,
  // Squad Execution Plans CRUD
  upsertSquadExecutionPlan,
  getSquadExecutionPlan,
  getSquadExecutionPlanBySquad,
  listSquadExecutionPlans,
  updateSquadExecutionPlanStatus,
  upsertSquadPlanRound,
  updateSquadPlanRoundStatus,
  getSquadPlanRounds,
  // Squad Learnings CRUD
  insertSquadLearning,
  listSquadLearnings,
  getSquadLearning,
  updateSquadLearningStatus,
  reinforceSquadLearning,
  promoteSquadLearning,
  archiveStaleSquadLearnings,
  getSquadLearningStats,
  // Project Learnings CRUD
  insertProjectLearning,
  listProjectLearnings,
  getProjectLearning,
  updateProjectLearningStatus,
  reinforceProjectLearning,
  promoteProjectLearning,
  getProjectLearningStats,
  // Squad Metrics CRUD
  upsertSquadMetric,
  listSquadMetrics,
  deleteSquadMetric,
  // Worker Runs CRUD
  insertWorkerRun,
  listWorkerRuns,
  getWorkerRunStats,
  // MCP Status CRUD
  upsertMcpStatus,
  incrementMcpCalls,
  listMcpStatus,
  getMcpStatus,
  // ROI Config CRUD
  upsertROIConfig,
  getROIConfig,
  deleteROIConfig,
  // Dynamic Tools CRUD
  registerDynamicTool,
  unregisterDynamicTool,
  getDynamicTool,
  listDynamicTools,
  // Evolution Log CRUD
  insertEvolutionLog,
  listEvolutionLog
};
