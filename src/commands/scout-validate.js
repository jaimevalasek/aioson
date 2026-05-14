'use strict';

// aioson scout:validate [.] --input=<path-to-candidate-json>
//
// Reads the candidate scout report, runs `validateOutput`, and tracks retries
// per scout id in the state file. Exit 0 = PASS. Exit 2 = FAIL with structured
// error. After max_retries_on_malformed_json failures, returns retry_exhausted
// (and persists the scout file with status='error' if --persist-on-exhaust).

const fs = require('node:fs');
const path = require('node:path');
const { validateOutput, enforceCaps, loadConfig } = require('../sub-task-engine');
const { withLock } = require('../sub-task-state');
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

async function runScoutValidate({ args, options = {}, logger }) {
  const targetDir = path.resolve(process.cwd(), args?.[0] || '.');
  const inputPath = options.input ? String(options.input) : null;
  if (!inputPath) {
    return fail('input_invalid', '--input=<path> required', null, logger, options);
  }
  const inputAbs = path.isAbsolute(inputPath) ? inputPath : path.resolve(targetDir, inputPath);

  let raw;
  try { raw = fs.readFileSync(inputAbs, 'utf8'); }
  catch (err) {
    return fail('input_not_readable', `cannot read ${inputPath}: ${err.message}`, null, logger, options);
  }
  let parsed;
  try { parsed = JSON.parse(raw); }
  catch (err) {
    // Treat as schema_invalid (malformed JSON is a validation failure).
    parsed = null;
    const r = await trackRetry(targetDir, options, parsed, logger, [{ field: '<root>', reason: `JSON parse error: ${err.message}` }]);
    return r;
  }

  const v = validateOutput(parsed);
  if (v.ok) {
    if (!options.json) logger.log(JSON.stringify({ ok: true, id: parsed.id }, null, 2));
    return { ok: true, id: parsed.id };
  }
  return trackRetry(targetDir, options, parsed, logger, v.errors);
}

async function trackRetry(targetDir, options, parsed, logger, errors) {
  const scoutId = (parsed && typeof parsed.id === 'string') ? parsed.id : null;
  const sessionId = (parsed && typeof parsed.parent_session_id === 'string') ? parsed.parent_session_id : null;
  const agent = (parsed && typeof parsed.parent_agent === 'string') ? parsed.parent_agent : 'unknown';

  if (!scoutId || !sessionId) {
    return fail('schema_invalid', 'output validation failed', errors, logger, options);
  }

  let config;
  try { config = loadConfig(targetDir); }
  catch (err) {
    return fail(err.code || 'config_invalid', err.message, err.details || null, logger, options);
  }

  let retryError = null;
  try {
    withLock(targetDir, config.scout_dir, (state) => {
      const r = enforceCaps(state, {
        kind: 'validate',
        parent_session_id: sessionId,
        scout_id: scoutId,
        config
      });
      if (!r.ok) retryError = r.error;
    });
  } catch (err) {
    return fail(err.code || 'lock_failure', err.message, null, logger, options);
  }

  if (retryError && retryError.code === 'retry_exhausted') {
    await emitEvent(targetDir, agent, 'sub_task', 'scout validation retries exhausted', {
      action: 'failed',
      id: scoutId,
      reason: 'retry_exhausted',
      validation_errors: errors
    });
    return fail('retry_exhausted', retryError.message, { validation_errors: errors, retries: retryError.details }, logger, options);
  }

  await emitEvent(targetDir, agent, 'sub_task', 'scout validation failed (will retry)', {
    action: 'validation_failed',
    id: scoutId,
    validation_errors: errors
  });
  return fail('schema_invalid', 'output validation failed', errors, logger, options);
}

module.exports = { runScoutValidate };
