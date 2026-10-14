'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const {
  cleanCell,
  extractSection,
  mapColumns,
  normalizeLabel,
  parseFirstMarkdownTable
} = require('./feature-completeness-format');
const { isInsideRoot } = require('../verification/path-policy');

const CHECKPOINTS_DIR = '.aioson/runtime/checkpoints';

async function readFreshGateCheckpoint(targetDir, gateLetter, slug, artifactPath) {
  const checkpointPath = path.join(
    targetDir,
    CHECKPOINTS_DIR,
    `gate-${gateLetter}-${slug}.json`
  );

  try {
    const [raw, checkpointStat, artifactStat, artifactContent] = await Promise.all([
      fs.readFile(checkpointPath, 'utf8'),
      fs.stat(checkpointPath),
      fs.stat(artifactPath),
      fs.readFile(artifactPath)
    ]);
    const checkpoint = JSON.parse(raw);
    const matchesGate = String(checkpoint.gate || '').toUpperCase() === String(gateLetter).toUpperCase();
    const matchesFeature = String(checkpoint.slug || '') === String(slug);
    const artifactName = path.basename(artifactPath);
    const snapshot = Array.isArray(checkpoint.prerequisites_snapshot)
      ? checkpoint.prerequisites_snapshot.find((entry) => entry.file === artifactName)
      : null;
    const artifactDigest = crypto.createHash('sha256').update(artifactContent).digest('hex');
    const isFresh = snapshot?.sha256
      ? snapshot.sha256 === artifactDigest
      : snapshot?.mtime
        ? snapshot.mtime === artifactStat.mtime.toISOString()
        : checkpointStat.mtimeMs >= artifactStat.mtimeMs;

    // A plan edited after approval (e.g. plan:bind after a PRD revision) leaves
    // the checkpoint stale, but its recorded approval still dates the plan
    // baseline that execution started from.
    const approvedBaselineMs = matchesGate && matchesFeature
      ? approvedPlanBaselineMs(checkpoint, snapshot)
      : null;
    if (matchesGate && matchesFeature && isFresh) {
      return { exists: true, path: checkpointPath, checkpoint, approved_baseline_ms: approvedBaselineMs };
    }
    return {
      exists: false,
      path: checkpointPath,
      reason: 'stale',
      checkpoint_exists: true,
      approved_baseline_ms: approvedBaselineMs
    };
  } catch (error) {
    return {
      exists: false,
      path: checkpointPath,
      reason: error && error.code === 'ENOENT' ? 'missing' : 'invalid',
      checkpoint_exists: error && error.code !== 'ENOENT'
    };
  }
}

/**
 * Plan time the approving gate:check validated, read only from a PASS the
 * checkpoint recorded: the baseline mtime that check measured (taken before
 * gate:approve rewrites the plan frontmatter), else the plan snapshot, else the
 * approval instant. Never derived from the current plan, so a later edit cannot
 * move it.
 */
function approvedPlanBaselineMs(checkpoint, snapshot) {
  const result = checkpoint && checkpoint.gate_check_result;
  if (!result || String(result.result || '').toUpperCase() !== 'PASS') return null;
  const recorded = Array.isArray(result.evidence)
    ? result.evidence.find((entry) => entry && entry.type === 'gate_c_baseline')
    : null;
  for (const value of [recorded && recorded.plan_mtime, snapshot && snapshot.mtime, checkpoint.timestamp]) {
    const ms = Date.parse(value || '');
    if (Number.isFinite(ms)) return ms;
  }
  return null;
}

function parsePlanStatus(content) {
  const match = String(content || '').match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) return '';
  const status = match[1].match(/^status:\s*(.+)$/m);
  return status ? cleanCell(status[1]).toLowerCase() : '';
}

function extractDeltaPaths(value) {
  return [...new Set(String(value || '')
    .replace(/<br\s*\/?>/gi, ',')
    .split(/[,;\n]/)
    .map((item) => cleanCell(item)
      .replace(/^\s*(?:create|modify|reuse|retire)\s*:\s*/i, '')
      .replace(/\s+\((?:create|modify|reuse|retire|new|existing)\)\s*$/i, '')
      .trim())
    .filter((item) => item && !/[*?{}[\]]/.test(item) && (/[\\/]/.test(item) || /\.[a-z0-9]{1,10}$/i.test(item))))];
}

function parseImplementationDelta(content) {
  const section = extractSection(content, [
    'Implementation Delta',
    'Delta de Implementacao',
    'Delta de Implementação'
  ]);
  const table = section ? parseFirstMarkdownTable(section) : null;
  if (!table || table.malformed.length > 0) return null;
  const columns = mapColumns(table, {
    action: ['Action', 'Path action', 'Acao', 'Ação'],
    paths: ['Exact paths', 'Paths', 'Caminhos exatos', 'Caminhos']
  });
  if (columns.missing.length > 0) return null;
  return table.rows.flatMap((row) => {
    const action = normalizeLabel(row[columns.indexes.action]);
    return extractDeltaPaths(row[columns.indexes.paths]).map((relativePath) => ({
      action,
      path: relativePath
    }));
  });
}

async function inspectPathState(targetDir, item, planMtimeMs) {
  if (!item.path || path.isAbsolute(item.path)) return { ...item, state: 'unsafe' };
  const absolute = path.resolve(targetDir, item.path);
  const relative = path.relative(targetDir, absolute);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
    return { ...item, state: 'unsafe' };
  }
  try {
    const [rootRealPath, targetRealPath, stat] = await Promise.all([
      fs.realpath(targetDir),
      fs.realpath(absolute),
      fs.stat(absolute)
    ]);
    if (!isInsideRoot(rootRealPath, targetRealPath) || !stat.isFile()) {
      return { ...item, state: 'unsafe' };
    }
    return {
      ...item,
      state: 'present',
      mtime: stat.mtime.toISOString(),
      after_plan: stat.mtimeMs > planMtimeMs
    };
  } catch (error) {
    return {
      ...item,
      state: error && error.code === 'ENOENT' ? 'absent' : 'unsafe'
    };
  }
}

async function resolveGateCBaseline(targetDir, slug, artifactPath) {
  const checkpoint = await readFreshGateCheckpoint(targetDir, 'C', slug, artifactPath);
  if (checkpoint.exists) {
    return {
      mode: 'checkpoint',
      pre_implementation: false,
      blocking: false,
      owner: 'dev',
      cause: null,
      // Carried into a re-approval so the baseline is never lost.
      plan_mtime: Number.isFinite(checkpoint.approved_baseline_ms)
        ? new Date(checkpoint.approved_baseline_ms).toISOString()
        : undefined,
      checkpoint
    };
  }

  let content;
  let planStat;
  try {
    [content, planStat] = await Promise.all([
      fs.readFile(artifactPath, 'utf8'),
      fs.stat(artifactPath)
    ]);
  } catch {
    return {
      mode: 'pre_implementation',
      pre_implementation: true,
      blocking: false,
      owner: 'planner',
      cause: 'plan_missing',
      checkpoint
    };
  }

  const delta = parseImplementationDelta(content);
  const status = parsePlanStatus(content);
  if (!delta || delta.length === 0) {
    return {
      mode: 'pre_implementation',
      pre_implementation: true,
      blocking: false,
      owner: 'planner',
      cause: 'gate_c_recovery_plan_invalid',
      recommendation: `repair implementation-plan-${slug}.md before recovering Gate C`,
      checkpoint
    };
  }
  // A stale checkpoint whose approval was recorded dates the baseline: a delta
  // path written after it is execution evidence even when the plan file itself
  // was edited later. Without one, only the plan file's own mtime can date it.
  const approvedBaselineMs = Number.isFinite(checkpoint.approved_baseline_ms) ? checkpoint.approved_baseline_ms : null;
  const baselineMs = approvedBaselineMs ?? planStat.mtimeMs;
  const states = await Promise.all(delta.map((item) => inspectPathState(targetDir, item, baselineMs)));
  const unsafe = states.filter((item) => item.state === 'unsafe');
  const createPresentBeforePlan = states.filter((item) => item.action === 'create' && item.state === 'present' && !item.after_plan);
  const started = states.some((item) => (
    ['create', 'modify'].includes(item.action)
    && item.state === 'present'
    && item.after_plan
  ));
  const retirementOnlyAmbiguity = !started && states.some((item) => item.action === 'retire' && item.state === 'absent');
  const approvedPlan = status === 'approved';

  if (approvedPlan && started && unsafe.length === 0 && createPresentBeforePlan.length === 0) {
    return {
      mode: 'recovered_execution',
      pre_implementation: false,
      blocking: false,
      owner: 'dev',
      cause: approvedBaselineMs === null
        ? 'gate_c_checkpoint_missing_after_execution_started'
        : 'gate_c_plan_revised_after_execution',
      recovery: approvedBaselineMs === null
        ? 'approved plan timestamp and exact delta paths prove implementation started'
        : 'the recorded Gate C approval dates the plan baseline and exact delta paths written after it prove implementation started; re-approve Gate C to seal the revised plan',
      plan_sha256: crypto.createHash('sha256').update(content).digest('hex'),
      // Re-approval records this time, so the original baseline survives every
      // later revision instead of moving forward with each plan edit.
      plan_mtime: new Date(baselineMs).toISOString(),
      path_states: states,
      checkpoint
    };
  }

  if (unsafe.length > 0 || createPresentBeforePlan.length > 0 || retirementOnlyAmbiguity) {
    const planNewer = createPresentBeforePlan.length > 0;
    return {
      mode: 'ambiguous',
      pre_implementation: true,
      blocking: true,
      owner: planNewer ? 'planner' : 'gate-c-recovery',
      cause: planNewer ? 'gate_c_recovery_plan_newer_than_execution' : 'gate_c_recovery_evidence_ambiguous',
      recommendation: planNewer
        ? `revalidate implementation-plan-${slug}.md because planned create paths predate it`
        : 'recover Gate C from an unambiguous approved baseline before continuing',
      plan_sha256: crypto.createHash('sha256').update(content).digest('hex'),
      plan_mtime: planStat.mtime.toISOString(),
      path_states: states,
      checkpoint
    };
  }

  return {
    mode: 'pre_implementation',
    pre_implementation: true,
    blocking: false,
    owner: 'planner',
    cause: checkpoint.reason === 'stale' ? 'gate_c_checkpoint_stale' : null,
    plan_sha256: crypto.createHash('sha256').update(content).digest('hex'),
    plan_mtime: planStat.mtime.toISOString(),
    path_states: states,
    checkpoint
  };
}

module.exports = {
  CHECKPOINTS_DIR,
  parseImplementationDelta,
  readFreshGateCheckpoint,
  resolveGateCBaseline
};
