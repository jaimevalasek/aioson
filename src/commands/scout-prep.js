'use strict';

// aioson scout:prep [.] --question="..." --scope-paths="..." --parent-agent=deyvin \
//   --parent-session-id=<id> --parent-session-excerpt="..." [--feature-slug=<slug>] \
//   [--max-files-in-scope=<n>] [--scope-exclude="..."]
//
// Validates input + cap state, builds the standardized sub-agent prompt, and
// returns {id, prompt, output_path, cap_remaining} as JSON on stdout.
// Exit 0 = ready. Exit 2 = structured error on stderr ({error: {code, message, ...}}).
//
// V1 limitation: --scope-globs is rejected (no built-in fs.glob on Node 18-21).
// Callers must enumerate paths explicitly.

const fs = require('node:fs');
const path = require('node:path');
const {
  validateInput,
  enforceCaps,
  buildPrompt,
  generateScoutId,
  loadConfig
} = require('../sub-task-engine');
const { withLock } = require('../sub-task-state');
const { openRuntimeDb, logAgentEvent } = require('../runtime-store');

function splitCsv(value) {
  if (typeof value !== 'string' || value.length === 0) return [];
  return value.split(',').map((s) => s.trim()).filter((s) => s.length > 0);
}

function fail(code, message, details, logger, options) {
  const error = { error: { code, message } };
  if (details) error.error.details = details;
  if (!options.json) logger.log(JSON.stringify(error, null, 2));
  return { ok: false, exitCode: 2, ...error };
}

// L-01 fix: rootBoundary check rejects scope paths that resolve outside the
// project root. Without this, `--scope-paths="../../etc/passwd"` would leak
// arbitrary local files into the sub-agent's context. No privilege escalation
// (dispatcher runs with developer permissions), but violates principle of
// least surprise + becomes a sandbox escape if scout is ever invoked via
// API/MCP/webhook in V2.
function isInsideRoot(absPath, rootDir) {
  const rootResolved = path.resolve(rootDir);
  if (absPath === rootResolved) return true;
  return absPath.startsWith(rootResolved + path.sep);
}

function resolveScope(rootDir, scopePaths, scopeExclude) {
  // V1: scope_paths only. Each path must exist (file or directory) AND stay
  // under rootDir. Directories expand to direct file children (one level, no glob).
  const exclude = new Set(scopeExclude.map((p) => path.normalize(p)));
  const resolved = [];
  const rejected = [];
  for (const p of scopePaths) {
    const abs = path.resolve(rootDir, p);
    if (!isInsideRoot(abs, rootDir)) {
      rejected.push({ path: p, reason: 'path_outside_root' });
      continue;
    }
    let stat;
    try { stat = fs.statSync(abs); } catch { continue; }
    if (stat.isFile()) {
      const rel = path.relative(rootDir, abs).replace(/\\/g, '/');
      if (!exclude.has(path.normalize(rel))) resolved.push(rel);
    } else if (stat.isDirectory()) {
      let entries;
      try { entries = fs.readdirSync(abs, { withFileTypes: true }); } catch { continue; }
      for (const entry of entries) {
        if (!entry.isFile()) continue;
        const childAbs = path.join(abs, entry.name);
        if (!isInsideRoot(childAbs, rootDir)) continue; // defensive
        const rel = path.relative(rootDir, childAbs).replace(/\\/g, '/');
        if (!exclude.has(path.normalize(rel))) resolved.push(rel);
      }
    }
  }
  return { files: Array.from(new Set(resolved)).sort(), rejected };
}

async function emitEvent(targetDir, agent, type, message, payload) {
  try {
    const { db, runtimeDir } = await openRuntimeDb(targetDir);
    try {
      await logAgentEvent(db, runtimeDir, { agentName: agent, message, type, meta: payload });
    } finally {
      db.close();
    }
  } catch { /* telemetry is best-effort */ }
}

async function runScoutPrep({ args, options = {}, logger }) {
  const targetDir = path.resolve(process.cwd(), args?.[0] || '.');

  // Reject scope_globs explicitly (V1 limitation).
  if (options['scope-globs'] && String(options['scope-globs']).length > 0) {
    return fail(
      'globs_not_implemented_v1',
      'scope_globs is not implemented in V1. Enumerate explicit paths via --scope-paths instead.',
      null,
      logger,
      options
    );
  }

  const input = {
    question: options.question != null ? String(options.question) : undefined,
    scope_paths: splitCsv(options['scope-paths']),
    scope_exclude: splitCsv(options['scope-exclude']),
    parent_agent: options['parent-agent'] != null ? String(options['parent-agent']) : undefined,
    parent_session_id: options['parent-session-id'] != null ? String(options['parent-session-id']) : undefined,
    parent_session_excerpt: options['parent-session-excerpt'] != null ? String(options['parent-session-excerpt']) : undefined
  };
  if (options['feature-slug']) input.feature_slug = String(options['feature-slug']);
  if (options['max-files-in-scope'] != null) {
    const n = Number(options['max-files-in-scope']);
    if (Number.isInteger(n)) input.max_files_in_scope_override = n;
  }

  // Drop undefined keys so additionalProperties:false doesn't reject.
  for (const k of Object.keys(input)) if (input[k] === undefined) delete input[k];

  const v = validateInput(input);
  if (!v.ok) return fail('input_invalid', 'input validation failed', v.errors, logger, options);

  // Config: defaults + override file (engine throws config_invalid on bad file).
  let config;
  try { config = loadConfig(targetDir); }
  catch (err) {
    return fail(err.code || 'config_invalid', err.message, err.details || null, logger, options);
  }

  const scopeResult = resolveScope(targetDir, input.scope_paths, input.scope_exclude || []);
  if (scopeResult.rejected.length > 0) {
    return fail(
      'path_outside_root',
      `${scopeResult.rejected.length} scope path(s) resolved outside the project root and were rejected (security)`,
      scopeResult.rejected,
      logger,
      options
    );
  }
  const filesResolved = scopeResult.files;
  const scopeSize = filesResolved.length;
  const scoutId = generateScoutId({ feature_slug: input.feature_slug });
  const outputPath = path.join(config.scout_dir, `${scoutId}.json`).replace(/\\/g, '/');
  const outputAbs = path.join(targetDir, outputPath);

  // Enforce caps + persist state under lock.
  let prompt;
  let capRemaining;
  let capError = null;
  try {
    withLock(targetDir, config.scout_dir, (state) => {
      const action = {
        kind: 'prep',
        parent_session_id: input.parent_session_id,
        scope_size: scopeSize,
        config
      };
      if (input.max_files_in_scope_override != null) {
        action.max_files_override = input.max_files_in_scope_override;
      }
      const r = enforceCaps(state, action);
      if (!r.ok) {
        capError = r.error;
        return;
      }
      capRemaining = config.max_scouts_per_session - state.sessions[input.parent_session_id].scouts_in_session;
    });
  } catch (err) {
    return fail(err.code || 'lock_failure', err.message, null, logger, options);
  }

  if (capError) {
    await emitEvent(targetDir, input.parent_agent, 'sub_task', capError.code, {
      action: 'cap_exceeded',
      code: capError.code,
      details: capError.details || null,
      parent_session_id: input.parent_session_id
    });
    return fail(capError.code, capError.message, capError.details || null, logger, options);
  }

  try {
    prompt = buildPrompt(input, { expected_output_path: outputPath });
  } catch (err) {
    return fail(err.code || 'prompt_build_failed', err.message, err.details || null, logger, options);
  }

  await emitEvent(targetDir, input.parent_agent, 'sub_task', 'scout prepared', {
    action: 'prepared',
    id: scoutId,
    feature_slug: input.feature_slug || null,
    scope_size: scopeSize,
    parent_session_id: input.parent_session_id,
    cap_remaining: capRemaining,
    expected_output_path: outputPath
  });

  const out = {
    id: scoutId,
    prompt,
    output_path: outputPath,
    output_path_abs: outputAbs,
    cap_remaining: capRemaining,
    files_resolved: filesResolved
  };
  if (!options.json) logger.log(JSON.stringify(out, null, 2));
  return { ok: true, ...out };
}

module.exports = { runScoutPrep };
