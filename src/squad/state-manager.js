'use strict';

/**
 * Squad STATE.md manager
 *
 * Maintains a cross-session memory file per squad at:
 *   .aioson/squads/{slug}/STATE.md
 *
 * The STATE.md survives /compact or /clear and gives the next session instant context on:
 *   - Current position in the squad's lifecycle
 *   - Velocity metrics
 *   - Active blockers
 *   - Key decisions made
 *   - Pending tasks for the next session
 *
 * Uses YAML frontmatter for machine-parseable metadata + markdown body
 * for human-readable context.
 */

const fs = require('node:fs/promises');
const path = require('node:path');

const SQUADS_DIR = path.join('.aioson', 'squads');

function statePath(projectDir, squadSlug) {
  return path.join(projectDir, SQUADS_DIR, squadSlug, 'STATE.md');
}

function nowIso() {
  return new Date().toISOString();
}

// ─── Frontmatter parsing ──────────────────────────────────────────────────────

function parseFrontmatter(content) {
  const match = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) return { meta: {}, body: content };

  const meta = {};
  for (const line of match[1].split('\n')) {
    const kv = line.match(/^(\w[\w_]*):\s*(.+)$/);
    if (kv) {
      const val = kv[2].trim();
      // Parse numbers and booleans
      if (val === 'true') meta[kv[1]] = true;
      else if (val === 'false') meta[kv[1]] = false;
      else if (/^\d+(\.\d+)?$/.test(val)) meta[kv[1]] = Number(val);
      else meta[kv[1]] = val.replace(/^["']|["']$/g, '');
    }
  }

  return { meta, body: match[2] };
}

function serializeFrontmatter(meta) {
  const lines = ['---'];
  for (const [k, v] of Object.entries(meta)) {
    lines.push(`${k}: ${v}`);
  }
  lines.push('---');
  return lines.join('\n');
}

// ─── State structure ──────────────────────────────────────────────────────────

function defaultState(squadSlug) {
  return {
    meta: {
      squad: squadSlug,
      current_session: '',
      sessions_completed: 0,
      tasks_completed_total: 0,
      avg_tasks_per_session: 0,
      last_activity: nowIso()
    },
    decisions: [],
    blockers: [],
    pending: [],
    notes: []
  };
}

// ─── Parse body sections ──────────────────────────────────────────────────────

function parseSection(body, sectionName) {
  const pattern = new RegExp(`## ${sectionName}\\n([\\s\\S]*?)(?=\\n## |$)`);
  const match = body.match(pattern);
  if (!match) return [];

  return match[1]
    .split('\n')
    .filter((l) => l.startsWith('- '))
    .map((l) => l.slice(2).trim());
}

function buildSection(title, items) {
  if (items.length === 0) return `## ${title}\n*(none)*`;
  return `## ${title}\n${items.map((i) => `- ${i}`).join('\n')}`;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Read and parse the squad STATE.md.
 * Returns a default state object if the file does not exist.
 *
 * @returns {Promise<object>} { meta, decisions, blockers, pending, notes }
 */
async function readState(projectDir, squadSlug) {
  const p = statePath(projectDir, squadSlug);
  let content;
  try {
    content = await fs.readFile(p, 'utf8');
  } catch {
    return defaultState(squadSlug);
  }

  const { meta, body } = parseFrontmatter(content);

  return {
    meta: { ...defaultState(squadSlug).meta, ...meta },
    decisions: parseSection(body, 'Decisions Made'),
    blockers:  parseSection(body, 'Active Blockers'),
    pending:   parseSection(body, 'Pending'),
    notes:     parseSection(body, 'Notes')
  };
}

/**
 * Write the squad STATE.md from a state object.
 *
 * @param {string} projectDir
 * @param {string} squadSlug
 * @param {object} state  — { meta, decisions, blockers, pending, notes }
 */
async function writeState(projectDir, squadSlug, state) {
  const p = statePath(projectDir, squadSlug);
  await fs.mkdir(path.dirname(p), { recursive: true });

  const frontmatter = serializeFrontmatter({ ...state.meta, last_activity: nowIso() });

  const body = [
    '',
    buildSection('Decisions Made', state.decisions || []),
    '',
    buildSection('Active Blockers', state.blockers || []),
    '',
    buildSection('Pending', state.pending || []),
    '',
    buildSection('Notes', state.notes || [])
  ].join('\n');

  await fs.writeFile(p, frontmatter + body + '\n', 'utf8');
}

/**
 * Update specific fields in the STATE.md.
 * Merges meta, appends to list fields.
 *
 * @param {string}  projectDir
 * @param {string}  squadSlug
 * @param {object}  updates
 *   @param {object}   [updates.meta]        — Shallow merge into meta
 *   @param {string[]} [updates.addDecision] — Prepend to decisions list
 *   @param {string[]} [updates.addBlocker]  — Prepend to blockers list
 *   @param {string[]} [updates.addPending]  — Prepend to pending list
 *   @param {string[]} [updates.resolveBlocker] — Remove matching entries from blockers
 *   @param {string[]} [updates.resolvePending]  — Remove matching entries from pending
 *   @param {number}   [updates.tasksCompleted]  — Number to add to tasks_completed_total
 */
async function updateState(projectDir, squadSlug, updates = {}) {
  const state = await readState(projectDir, squadSlug);

  // Merge meta
  if (updates.meta) {
    Object.assign(state.meta, updates.meta);
  }

  // Add decisions (newest first, cap at 20)
  if (updates.addDecision) {
    const dated = updates.addDecision.map((d) => `${nowIso().slice(0, 10)}: ${d}`);
    state.decisions = [...dated, ...state.decisions].slice(0, 20);
  }

  // Add blockers
  if (updates.addBlocker) {
    state.blockers = [...updates.addBlocker, ...state.blockers];
  }

  // Resolve blockers (remove by substring match)
  if (updates.resolveBlocker) {
    for (const pattern of updates.resolveBlocker) {
      state.blockers = state.blockers.filter((b) => !b.toLowerCase().includes(pattern.toLowerCase()));
    }
  }

  // Add pending items
  if (updates.addPending) {
    state.pending = [...updates.addPending, ...state.pending];
  }

  // Resolve pending items
  if (updates.resolvePending) {
    for (const pattern of updates.resolvePending) {
      state.pending = state.pending.filter((p) => !p.toLowerCase().includes(pattern.toLowerCase()));
    }
  }

  // Update velocity metrics
  if (updates.tasksCompleted) {
    state.meta.tasks_completed_total = (state.meta.tasks_completed_total || 0) + updates.tasksCompleted;
    const sessions = state.meta.sessions_completed || 0;
    if (sessions > 0) {
      state.meta.avg_tasks_per_session = Math.round(
        (state.meta.tasks_completed_total / sessions) * 10
      ) / 10;
    }
  }

  await writeState(projectDir, squadSlug, state);
  return state;
}

/**
 * Record the start of a new session in the STATE.md.
 */
async function recordSessionStart(projectDir, squadSlug, sessionId, goal) {
  await updateState(projectDir, squadSlug, {
    meta: { current_session: sessionId }
  });
}

/**
 * Record the completion of a session in the STATE.md.
 * Updates velocity metrics and clears session-specific blockers.
 */
async function recordSessionEnd(projectDir, squadSlug, sessionId, results) {
  const completedCount = results.filter((r) => r.finalStatus === 'completed').length;
  const failedCount = results.filter((r) => r.finalStatus === 'failed').length;
  const escalatedCount = results.filter((r) => r.finalStatus === 'escalated').length;

  const state = await readState(projectDir, squadSlug);
  const sessionCount = (state.meta.sessions_completed || 0) + 1;

  const pending = [];
  for (const r of results) {
    if (r.finalStatus === 'escalated') {
      pending.push(`[escalated] ${r.task.title}`);
    }
  }

  await updateState(projectDir, squadSlug, {
    meta: {
      sessions_completed: sessionCount,
      last_session: sessionId
    },
    tasksCompleted: completedCount,
    addPending: pending,
    addDecision: failedCount + escalatedCount > 0
      ? [`Session ${sessionId.slice(0, 8)}: ${completedCount} completed, ${failedCount} failed, ${escalatedCount} escalated`]
      : [`Session ${sessionId.slice(0, 8)}: ${completedCount} tasks completed`]
  });
}

// ─── RuntimeState Serialization (Plan 81 §Sprint 4) ─────────────────────────

/**
 * Serialize complete runtime state for handoff between agents.
 * Eliminates the need for the next agent to reread STATE.md + bus + budget.
 *
 * Inspired by CrewAI v1.13 RuntimeState serialization.
 *
 * @param {string} projectDir
 * @param {string} squadSlug
 * @param {object} sessionContext  — { sessionId, currentWave, completedTasks, budgetUsed, budgetLimit, busSummary }
 * @returns {Promise<object>}  — serialized runtime state
 */
async function serializeRuntime(projectDir, squadSlug, sessionContext = {}) {
  const state = await readState(projectDir, squadSlug);

  return {
    runtime_state: {
      squad: squadSlug,
      current_session: state.meta.current_session,
      current_wave: sessionContext.currentWave || null,
      completed_tasks: sessionContext.completedTasks || [],
      active_decisions: state.decisions.slice(0, 10),
      active_blockers: state.blockers,
      pending: state.pending,
      budget_remaining: sessionContext.budgetLimit
        ? sessionContext.budgetLimit - (sessionContext.budgetUsed || 0)
        : null,
      budget_used: sessionContext.budgetUsed || 0,
      budget_limit: sessionContext.budgetLimit || null,
      bus_summary: sessionContext.busSummary || null,
      sessions_completed: state.meta.sessions_completed,
      avg_tasks_per_session: state.meta.avg_tasks_per_session,
      serialized_at: nowIso()
    }
  };
}

module.exports = {
  readState,
  writeState,
  updateState,
  recordSessionStart,
  recordSessionEnd,
  serializeRuntime
};
