'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const { openRuntimeDb } = require('../runtime-store');

const REQUIRED_BOOTSTRAP = ['what-is.md', 'what-it-does.md', 'how-it-works.md', 'current-state.md'];

async function fileExists(filePath) {
  try {
    const stat = await fs.stat(filePath);
    return stat.isFile();
  } catch {
    return false;
  }
}

async function readText(filePath) {
  try {
    return await fs.readFile(filePath, 'utf8');
  } catch {
    return '';
  }
}

async function listFiles(dirPath, predicate = () => true) {
  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isFile() && predicate(entry.name))
      .map((entry) => entry.name)
      .sort();
  } catch {
    return [];
  }
}

function firstLine(text) {
  const withoutFrontmatter = String(text || '').replace(/^---[\s\S]*?---\r?\n?/, '');
  return withoutFrontmatter
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line && !line.startsWith('#')) || '';
}

async function collectRuntimeSummary(targetDir) {
  let handle;
  try {
    handle = await openRuntimeDb(targetDir, { mustExist: true });
  } catch {
    return { exists: false, taskCounts: {}, recentRuns: [], learnings: 0 };
  }

  if (!handle || !handle.db) {
    return { exists: false, taskCounts: {}, recentRuns: [], learnings: 0 };
  }

  const { db, dbPath } = handle;
  try {
    const rows = db.prepare('SELECT status, COUNT(*) AS count FROM tasks GROUP BY status').all();
    const taskCounts = {};
    for (const row of rows) taskCounts[row.status] = Number(row.count || 0);

    const recentRuns = db.prepare(`
      SELECT agent_name, status, summary, title, finished_at, updated_at
      FROM agent_runs
      ORDER BY COALESCE(finished_at, updated_at, started_at) DESC
      LIMIT 8
    `).all();

    let learnings = 0;
    try {
      const row = db.prepare("SELECT COUNT(*) AS count FROM project_learnings WHERE status = 'active'").get();
      learnings = Number(row?.count || 0);
    } catch {
      learnings = 0;
    }

    return { exists: true, dbPath, taskCounts, recentRuns, learnings };
  } finally {
    db.close();
  }
}

async function collectMemoryStatus(targetDir) {
  const bootstrapDir = path.join(targetDir, '.aioson', 'context', 'bootstrap');
  const bootstrapFiles = [];
  for (const name of REQUIRED_BOOTSTRAP) {
    bootstrapFiles.push({
      path: `.aioson/context/bootstrap/${name}`,
      exists: await fileExists(path.join(bootstrapDir, name))
    });
  }

  const memoryIndexPath = path.join(targetDir, '.aioson', 'context', 'memory-index.md');
  const contextPackPath = path.join(targetDir, '.aioson', 'context', 'context-pack.md');
  const projectPulsePath = path.join(targetDir, '.aioson', 'context', 'project-pulse.md');
  const logsDir = path.join(targetDir, 'aioson-logs');
  const devlogs = await listFiles(logsDir, (name) => name.startsWith('devlog-') && name.endsWith('.md'));
  const devlogManifestPath = path.join(logsDir, 'manifest.md');

  const brainsDir = path.join(targetDir, '.aioson', 'brains');
  const brainIndexPath = path.join(brainsDir, '_index.json');
  let brainIndex = null;
  const brainWarnings = [];
  try {
    brainIndex = JSON.parse(await fs.readFile(brainIndexPath, 'utf8'));
  } catch {
    brainWarnings.push(`Missing or invalid ${path.relative(targetDir, brainIndexPath)}`);
  }

  const brains = Array.isArray(brainIndex?.brains) ? brainIndex.brains : [];
  for (const brain of brains) {
    const rel = String(brain.path || '');
    const brainPath = rel.startsWith('.aioson/brains/')
      ? path.join(targetDir, rel)
      : path.join(brainsDir, rel);
    if (!(await fileExists(brainPath))) {
      brainWarnings.push(`Missing brain file: ${rel || brain.id || '(unknown)'}`);
    }
  }

  const runtime = await collectRuntimeSummary(targetDir);
  const bootstrapCoverage = bootstrapFiles.filter((file) => file.exists).length;

  return {
    ok: bootstrapCoverage === REQUIRED_BOOTSTRAP.length && brainWarnings.length === 0,
    targetDir,
    bootstrap: {
      required: REQUIRED_BOOTSTRAP.length,
      present: bootstrapCoverage,
      missing: bootstrapFiles.filter((file) => !file.exists).map((file) => file.path),
      files: bootstrapFiles
    },
    context: {
      memoryIndex: await fileExists(memoryIndexPath),
      contextPack: await fileExists(contextPackPath),
      projectPulse: await fileExists(projectPulsePath)
    },
    devlogs: {
      count: devlogs.length,
      manifest: await fileExists(devlogManifestPath),
      files: devlogs.map((name) => `aioson-logs/${name}`)
    },
    brains: {
      index: await fileExists(brainIndexPath),
      count: brains.length,
      files: brains.map((brain) => brain.path).filter(Boolean),
      warnings: brainWarnings
    },
    runtime
  };
}

function formatTaskCounts(counts) {
  const entries = Object.entries(counts || {});
  if (entries.length === 0) return 'none';
  return entries.map(([key, value]) => `${key}:${value}`).join(', ');
}

async function runMemoryStatus({ args, options = {}, logger }) {
  const targetDir = path.resolve(process.cwd(), args[0] || '.');
  const status = await collectMemoryStatus(targetDir);

  if (options.json) return status;

  logger.log('AIOSON Memory Status');
  logger.log(`Bootstrap: ${status.bootstrap.present}/${status.bootstrap.required}`);
  if (status.bootstrap.missing.length > 0) {
    logger.log(`Missing bootstrap: ${status.bootstrap.missing.join(', ')}`);
  }
  logger.log(`Memory index: ${status.context.memoryIndex ? 'present' : 'missing'}`);
  logger.log(`Context pack: ${status.context.contextPack ? 'present' : 'missing'}`);
  logger.log(`Project pulse: ${status.context.projectPulse ? 'present' : 'missing'}`);
  logger.log(`Devlogs: ${status.devlogs.count} (${status.devlogs.manifest ? 'manifest present' : 'no manifest'})`);
  logger.log(`Brains: ${status.brains.count} indexed${status.brains.warnings.length ? `, ${status.brains.warnings.length} warning(s)` : ''}`);
  for (const warning of status.brains.warnings) logger.log(`- ${warning}`);
  logger.log(`Runtime: ${status.runtime.exists ? formatTaskCounts(status.runtime.taskCounts) : 'missing'}`);
  logger.log(`Active learnings: ${status.runtime.learnings || 0}`);
  return status;
}

async function runMemorySummary({ args, options = {}, logger }) {
  const targetDir = path.resolve(process.cwd(), args[0] || '.');
  const status = await collectMemoryStatus(targetDir);
  const pulse = await readText(path.join(targetDir, '.aioson', 'context', 'project-pulse.md'));
  const whatIs = await readText(path.join(targetDir, '.aioson', 'context', 'bootstrap', 'what-is.md'));
  const currentState = await readText(path.join(targetDir, '.aioson', 'context', 'bootstrap', 'current-state.md'));

  const recentRuns = (status.runtime.recentRuns || []).slice(0, Number(options.last || 5));
  const lines = [
    '# AIOSON Memory Summary',
    '',
    '## Bootstrap',
    `- Coverage: ${status.bootstrap.present}/${status.bootstrap.required}`,
    `- Identity: ${firstLine(whatIs) || 'not available'}`,
    `- Current state: ${firstLine(currentState) || 'not available'}`,
    '',
    '## Project Pulse',
    pulse ? pulse.split(/\r?\n/).slice(0, 28).join('\n') : '_No project-pulse.md found_',
    '',
    '## Recent Runtime',
    status.runtime.exists
      ? `- Tasks: ${formatTaskCounts(status.runtime.taskCounts)}`
      : '- Runtime database missing',
    `- Active learnings: ${status.runtime.learnings || 0}`
  ];

  if (recentRuns.length > 0) {
    lines.push('', '## Recent Runs');
    for (const run of recentRuns) {
      const when = run.finished_at || run.updated_at || '';
      const summary = run.summary || run.title || '(no summary)';
      lines.push(`- ${when} ${run.agent_name}: ${summary}`);
    }
  }

  lines.push('', '## Retrieval Hints');
  lines.push('- Use `aioson context:pack . --agent=<agent> --goal="<task>"` for focused project context.');
  lines.push('- Use `aioson brain:query . --tags=<tags> --min-quality=4` for procedural patterns.');
  lines.push('- Use Git only when memory and runtime do not explain recent work.');

  const summary = lines.join('\n');
  if (options.json) return { ok: true, status, summary };
  logger.log(summary);
  return { ok: true, status, summary };
}

const { runMemoryReflectPrepare } = require('./memory-reflect-prepare');
const { runMemoryReflectCommit } = require('./memory-reflect-commit');

module.exports = {
  REQUIRED_BOOTSTRAP,
  collectMemoryStatus,
  runMemoryStatus,
  runMemorySummary,
  runMemoryReflectPrepare,
  runMemoryReflectCommit
};
