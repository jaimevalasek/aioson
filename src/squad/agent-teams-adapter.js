'use strict';

/**
 * Agent Teams Adapter — Plan 81, Phase 1.1
 *
 * Translates squad manifests into Claude Code Agent Teams configurations.
 * Enables squads to execute via native Agent Teams parallelism instead of
 * manual Promise.all of subprocesses.
 *
 * Mapping:
 *   executors[].slug            → teammates[].name
 *   executors[].type            → teammates[].subagent definition
 *   tasks[].wave                → tasks[].dependencies
 *   tasks[].must_haves          → tasks[].acceptance_criteria
 *   budget.max_tokens_per_task  → per-teammate token limits
 *   intra-bus messages          → shared mailbox messages
 *
 * Fallback: if Agent Teams is not available (Claude Code < v2.1.32),
 * returns { available: false } and caller falls back to legacy engine.
 */

const { execSync } = require('node:child_process');
const fs = require('node:fs/promises');
const path = require('node:path');

const SQUADS_DIR = path.join('.aioson', 'squads');

// ─── Availability detection ──────────────────────────────────────────────────

/**
 * Detect if Claude Code Agent Teams is available.
 * Checks for claude binary and version >= 2.1.32.
 */
function detectAgentTeams() {
  try {
    const versionOutput = execSync('claude --version 2>/dev/null', {
      encoding: 'utf8',
      timeout: 5000
    }).trim();

    const match = versionOutput.match(/(\d+)\.(\d+)\.(\d+)/);
    if (!match) return { available: false, reason: 'version_parse_error', raw: versionOutput };

    const [, major, minor, patch] = match.map(Number);
    const version = `${major}.${minor}.${patch}`;

    // Agent Teams requires v2.1.32+
    const meetsMinimum =
      major > 2 ||
      (major === 2 && minor > 1) ||
      (major === 2 && minor === 1 && patch >= 32);

    return {
      available: meetsMinimum,
      version,
      reason: meetsMinimum ? 'ok' : 'version_too_old'
    };
  } catch {
    return { available: false, reason: 'claude_not_found' };
  }
}

// ─── Manifest to Team Config translation ─────────────────────────────────────

/**
 * Build a teammate definition from a squad executor.
 */
function executorToTeammate(executor, squadSlug, projectDir) {
  // Normalize to forward-slashes after path.join: agentFile is a string fed
  // into agent tooling (Codex/Claude/OpenCode), JSON outputs, and CLI logs.
  // Node's fs APIs accept forward-slash on Windows, but if we emit native
  // backslash paths here, every consumer that handles them across platforms
  // would need its own normalization. Standardize at the boundary.
  const agentFile = (executor.file
    ? path.join(projectDir, executor.file)
    : path.join(projectDir, SQUADS_DIR, squadSlug, 'agents', `${executor.slug}.md`)
  ).replace(/\\/g, '/');

  const teammate = {
    name: executor.slug,
    role: executor.role || executor.title || executor.slug,
    type: mapExecutorType(executor.type),
    agentFile: agentFile
  };

  // Model tier mapping
  if (executor.modelTier) {
    const tierMap = {
      powerful: 'opus',
      balanced: 'sonnet',
      fast: 'haiku',
      none: null
    };
    teammate.model = tierMap[executor.modelTier] || 'sonnet';
  }

  // Skills
  if (executor.skills && executor.skills.length > 0) {
    teammate.skills = executor.skills;
  }

  return teammate;
}

/**
 * Map AIOSON executor type to Agent Teams teammate type.
 */
function mapExecutorType(type) {
  const typeMap = {
    agent: 'subagent',
    worker: 'worker',
    clone: 'subagent',
    assistant: 'subagent',
    'human-gate': 'gate',
    research: 'research',
    reviewer: 'subagent',
    skill: 'skill'
  };
  return typeMap[type] || 'subagent';
}

/**
 * Convert a task decomposition plan to Agent Teams task list.
 */
function planToTeamTasks(plan, executors) {
  const tasks = [];

  for (const task of plan.tasks) {
    const teamTask = {
      id: task.id,
      title: task.title,
      description: task.description,
      assignTo: task.executor || null,
      dependencies: task.dependencies || [],
      acceptance_criteria: task.acceptance_criteria || [],
      priority: task.priority || 0,
      metadata: {}
    };

    // Map must_haves to structured acceptance criteria
    if (task.must_haves) {
      if (task.must_haves.artifacts) {
        teamTask.acceptance_criteria.push(
          ...task.must_haves.artifacts.map((a) => `Artifact exists: ${a}`)
        );
      }
      if (task.must_haves.key_links) {
        teamTask.acceptance_criteria.push(
          ...task.must_haves.key_links.map((l) => `Wired: ${l}`)
        );
      }
    }

    // read_first_hints become context for the teammate
    if (task.read_first_hints && task.read_first_hints.length > 0) {
      teamTask.metadata.read_first = task.read_first_hints;
    }

    tasks.push(teamTask);
  }

  return tasks;
}

/**
 * Translate a full squad manifest + plan into an Agent Teams configuration.
 *
 * @param {string} projectDir
 * @param {object} manifest  — squad.manifest.json contents
 * @param {object} plan  — decomposed task plan
 * @param {object} [options]  — { budget, enableBus }
 * @returns {object}  — Agent Teams config
 */
function translateToTeamConfig(projectDir, manifest, plan, options = {}) {
  const { budget = {} } = options;
  const executors = manifest.executors || [];

  // Build teammates
  const teammates = executors.map((e) =>
    executorToTeammate(e, manifest.slug, projectDir)
  );

  // Build tasks
  const tasks = planToTeamTasks(plan, executors);

  // Team configuration
  const teamConfig = {
    name: `squad-${manifest.slug}`,
    description: manifest.mission || manifest.goal || `Squad: ${manifest.name}`,
    teammates,
    tasks,
    settings: {
      parallel: true,
      maxConcurrent: teammates.length,
      taskTimeout: budget.max_tokens_per_task ? Math.ceil(budget.max_tokens_per_task / 100) : 300,
      quality: {
        verifyOnComplete: true,
        blockOnFail: true
      }
    }
  };

  // Budget constraints
  if (budget.max_tokens_per_session) {
    teamConfig.settings.tokenBudget = budget.max_tokens_per_session;
  }
  if (budget.max_tokens_per_task) {
    teamConfig.settings.perTaskTokenLimit = budget.max_tokens_per_task;
  }

  // Anti-loop settings
  if (manifest.anti_loop) {
    teamConfig.settings.antiLoop = {
      threshold: manifest.anti_loop.threshold || 8,
      action: manifest.anti_loop.action || 'feedback'
    };
  }

  return teamConfig;
}

/**
 * Write Agent Teams config to a JSON file for claude --team usage.
 */
async function writeTeamConfig(projectDir, squadSlug, teamConfig) {
  const configDir = path.join(projectDir, '.aioson', 'squads', squadSlug, 'team-config');
  await fs.mkdir(configDir, { recursive: true });

  const configPath = path.join(configDir, 'team.json');
  await fs.writeFile(configPath, JSON.stringify(teamConfig, null, 2), 'utf8');

  return configPath;
}

/**
 * Resolve the execution engine for a squad:autorun run.
 * Returns 'agent-teams' if requested and available, otherwise 'legacy'.
 */
function resolveEngine(requestedEngine) {
  if (requestedEngine === 'legacy') return { engine: 'legacy', reason: 'explicit' };

  if (requestedEngine === 'agent-teams') {
    const detection = detectAgentTeams();
    if (detection.available) {
      return { engine: 'agent-teams', version: detection.version, reason: 'explicit' };
    }
    return { engine: 'legacy', reason: `agent-teams requested but ${detection.reason}`, fallback: true };
  }

  // Auto-detect
  if (requestedEngine === 'auto') {
    const detection = detectAgentTeams();
    if (detection.available) {
      return { engine: 'agent-teams', version: detection.version, reason: 'auto-detected' };
    }
    return { engine: 'legacy', reason: 'auto-fallback' };
  }

  return { engine: 'legacy', reason: 'default' };
}

module.exports = {
  detectAgentTeams,
  translateToTeamConfig,
  writeTeamConfig,
  resolveEngine,
  executorToTeammate,
  planToTeamTasks,
  mapExecutorType
};
