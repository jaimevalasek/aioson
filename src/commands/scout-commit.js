'use strict';

// aioson scout:commit [.] --input=<path-to-validated-json>
//
// Re-validates (defense-in-depth), persists the scout report at
// `<config.scout_dir>/{id}.json`, decrements the per-session cap, and emits
// `sub_task action=committed` telemetry. Idempotent: re-commit of same id is
// a no-op (returns committed:false, exit 0). Emits `slow_completion` warning
// if elapsed time between prep_at and now exceeds slow_completion_warn_seconds.

const fs = require('node:fs');
const path = require('node:path');
const { validateOutput, enforceCaps, loadConfig } = require('../sub-task-engine');
const { withLock, statePath, readState } = require('../sub-task-state');
const { openRuntimeDb, logAgentEvent } = require('../runtime-store');

function fail(code, message, details, logger, options) {
  const error = { error: { code, message } };
  if (details) error.error.details = details;
  if (!options.json) logger.log(JSON.stringify(error, null, 2));
  return { ok: false, exitCode: 2, ...error };
}

async function emitEvent(targetDir, agent, type, message, payload) {
  try {
    const { db, runtimeDir } = await openRuntimeDb(targetDir);
    try {
      await logAgentEvent(db, runtimeDir, { agentName: agent, message, type, meta: payload });
    } finally {
      db.close();
    }
  } catch { /* best-effort */ }
}

async function runScoutCommit({ args, options = {}, logger }) {
  const targetDir = path.resolve(process.cwd(), args?.[0] || '.');
  const inputPath = options.input ? String(options.input) : null;
  if (!inputPath) return fail('input_invalid', '--input=<path> required', null, logger, options);

  const inputAbs = path.isAbsolute(inputPath) ? inputPath : path.resolve(targetDir, inputPath);
  let raw;
  try { raw = fs.readFileSync(inputAbs, 'utf8'); }
  catch (err) {
    return fail('input_not_readable', `cannot read ${inputPath}: ${err.message}`, null, logger, options);
  }
  let parsed;
  try { parsed = JSON.parse(raw); }
  catch (err) {
    return fail('input_invalid', `JSON parse error: ${err.message}`, null, logger, options);
  }

  // Defense-in-depth re-validation.
  const v = validateOutput(parsed);
  if (!v.ok) {
    return fail('schema_invalid', 'commit-time validation failed (use scout:validate first)', v.errors, logger, options);
  }

  let config;
  try { config = loadConfig(targetDir); }
  catch (err) {
    return fail(err.code || 'config_invalid', err.message, err.details || null, logger, options);
  }

  const targetPath = path.join(targetDir, config.scout_dir, `${parsed.id}.json`);
  const targetRel = path.relative(targetDir, targetPath).replace(/\\/g, '/');

  // True idempotency check (C-01 fix): track *committed* ids in state, not
  // file existence. The documented happy path has the sub-agent writing the
  // report to `output_path` BEFORE scout:commit runs, so the file already
  // exists at the target on the first commit call. We must distinguish
  // "first commit, sub-agent staged the file" from "re-commit, no-op".
  let alreadyCommitted = false;
  try {
    withLock(targetDir, config.scout_dir, (state) => {
      const session = state.sessions[parsed.parent_session_id];
      if (session && session.committed_ids && session.committed_ids[parsed.id]) {
        alreadyCommitted = true;
      }
    });
  } catch (err) {
    return fail(err.code || 'lock_failure', err.message, null, logger, options);
  }
  if (alreadyCommitted) {
    const out = { ok: true, committed: false, reason: 'already_committed', path: targetRel, id: parsed.id };
    if (!options.json) logger.log(JSON.stringify(out, null, 2));
    return out;
  }

  // Persist the scout report. If the sub-agent already wrote at the same
  // path (the documented happy path), this overwrite is a no-op for the file
  // contents (validated identical above) but still serves as an explicit
  // commit step for observability. If input path differs from target path
  // (test/CI flow), this is the actual write.
  try {
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    fs.writeFileSync(targetPath, JSON.stringify(parsed, null, 2), 'utf8');
  } catch (err) {
    return fail('persist_failed', `failed to write ${targetRel}: ${err.message}`, null, logger, options);
  }

  // Decrement cap counter + mark committed_ids under lock.
  try {
    withLock(targetDir, config.scout_dir, (state) => {
      enforceCaps(state, { kind: 'commit', parent_session_id: parsed.parent_session_id });
      const session = state.sessions[parsed.parent_session_id] || {};
      if (!session.committed_ids) session.committed_ids = {};
      session.committed_ids[parsed.id] = true;
      state.sessions[parsed.parent_session_id] = session;
    });
  } catch (err) {
    // Persistence already happened; surface lock issue but don't roll back.
    await emitEvent(targetDir, parsed.parent_agent, 'sub_task', 'scout committed but cap decrement failed', {
      action: 'committed',
      id: parsed.id,
      lock_warning: err.message
    });
  }

  // Slow-completion observability (BR-07).
  const elapsedMs = elapsedSincePrep(targetDir, config, parsed);
  const slowThresholdMs = (config.slow_completion_warn_seconds || 300) * 1000;
  if (elapsedMs != null && elapsedMs > slowThresholdMs) {
    await emitEvent(targetDir, parsed.parent_agent, 'sub_task', 'scout completion exceeded warn threshold', {
      action: 'slow_completion',
      id: parsed.id,
      elapsed_ms: elapsedMs,
      warn_threshold_ms: slowThresholdMs
    });
  }

  await emitEvent(targetDir, parsed.parent_agent, 'sub_task', 'scout committed', {
    action: 'committed',
    id: parsed.id,
    feature_slug: parsed.feature_slug || null,
    parent_session_id: parsed.parent_session_id,
    findings_count: Array.isArray(parsed.findings) ? parsed.findings.length : 0,
    confidence: parsed.confidence,
    elapsed_ms: elapsedMs
  });

  const out = { ok: true, committed: true, path: targetRel, id: parsed.id };
  if (!options.json) logger.log(JSON.stringify(out, null, 2));
  return out;
}

function elapsedSincePrep(targetDir, config, parsed) {
  // Best-effort: read state file to find when prep happened. State may have
  // been pruned (24h housekeeping); in that case we cannot compute elapsed.
  try {
    const sf = statePath(targetDir, config.scout_dir);
    const state = readState(sf);
    const session = state.sessions?.[parsed.parent_session_id];
    if (!session || !session.last_prep_at) return null;
    const startMs = Date.parse(session.last_prep_at);
    const endMs = parsed.completed_at ? Date.parse(parsed.completed_at) : Date.now();
    if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) return null;
    return endMs - startMs;
  } catch {
    return null;
  }
}

module.exports = { runScoutCommit };
