'use strict';

/**
 * Best-effort runtime telemetry for `verify:implementation`.
 *
 * The verifier already stores durable artifacts under
 * `.aioson/context/features/{slug}/verification-runs/`. Runtime telemetry is a
 * query/index layer only: it must never store raw auditor output, stderr,
 * prompt text, or finding evidence.
 */

const { openRuntimeDb, startTask, startRun } = require('../runtime-store');

const SOURCE = 'verify_implementation';
const EVENT_TYPE = 'implementation_verification_completed';
const PHASE = 'implementation_verification';

function bool(value) {
  return Boolean(value);
}

function safeString(value) {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text || null;
}

function safeNumber(value) {
  if (value === null || value === undefined) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function pathOrNull(value) {
  const text = safeString(value);
  return text ? text.replace(/\\/g, '/') : null;
}

function summarizeRunner(runner) {
  if (!runner || typeof runner !== 'object') return null;
  return {
    status: safeString(runner.status),
    tool_detected: bool(runner.detected),
    permission_mode: safeString(runner.permission_mode),
    destructive_commands_allowed: bool(runner.destructive_commands_allowed),
    timeout_ms: safeNumber(runner.timeout_ms),
    max_output_bytes: safeNumber(runner.max_output_bytes),
    duration_ms: safeNumber(runner.duration_ms),
    exit_code: safeNumber(runner.exit_code),
    signal: safeString(runner.signal),
    output_bytes: safeNumber(runner.output_bytes),
    output_truncated: bool(runner.output_truncated)
  };
}

function buildVerificationTelemetryPayload(result, { durationMs = null } = {}) {
  const runner = summarizeRunner(result.runner);
  const payload = {
    feature_slug: safeString(result.feature_slug),
    mode: safeString(result.mode),
    policy: safeString(result.policy),
    ok: bool(result.ok),
    verdict: safeString(result.verdict),
    recommended_route: safeString(result.recommended_route),
    blocking_findings_count: safeNumber(result.blocking_findings_count),
    reason: safeString(result.reason),
    tool: safeString(result.tool),
    model: safeString(result.model),
    ledger_path: pathOrNull(result.ledger_path),
    prompt_path: pathOrNull(result.prompt_path),
    report_path: pathOrNull(result.report_path),
    run_report_path: pathOrNull(result.run_report_path),
    report_json_path: pathOrNull(result.report_json_path),
    raw_output_stored: bool(result.raw_report_path),
    stderr_stored: bool(result.stderr_path),
    duration_ms: safeNumber(durationMs)
  };

  if (runner) payload.runner = runner;
  return payload;
}

function runtimeStatus(result) {
  if (!result || result.mode === 'verify-implementation') return 'failed';
  return 'completed';
}

async function recordVerificationTelemetry(rootDir, result, { startedAt = null } = {}) {
  if (!rootDir || !result || typeof result !== 'object') {
    return { emitted: false, reason: 'invalid_input' };
  }

  try {
    const durationMs = startedAt ? Math.max(0, Date.now() - Number(startedAt)) : null;
    const payload = buildVerificationTelemetryPayload(result, { durationMs });
    const { db } = await openRuntimeDb(rootDir);
    try {
      const status = runtimeStatus(result);
      const title = `Implementation verification: ${payload.feature_slug || 'unknown'}`;
      const taskKey = startTask(db, {
        title,
        taskKind: 'implementation_verification',
        status,
        createdBy: 'verify:implementation',
        metaJson: {
          feature_slug: payload.feature_slug,
          mode: payload.mode,
          policy: payload.policy,
          source: SOURCE
        }
      });
      const runKey = startRun(db, {
        taskKey,
        agentName: 'verify:implementation',
        agentKind: 'system',
        source: SOURCE,
        title: `verify:implementation ${payload.mode || 'unknown'} ${payload.feature_slug || 'unknown'}`,
        status,
        summary: `${payload.verdict || (result.ok ? 'PASS' : 'INCONCLUSIVE')} via ${payload.mode || 'unknown'}`,
        outputPath: payload.report_path || payload.prompt_path || payload.ledger_path || null,
        eventType: EVENT_TYPE,
        phase: PHASE,
        toolName: payload.tool,
        verdict: payload.verdict,
        message: `Implementation verification completed: ${payload.verdict || (result.ok ? 'ok' : 'blocked')}`,
        payload
      });
      return { emitted: true, task_key: taskKey, run_key: runKey, event_type: EVENT_TYPE };
    } finally {
      db.close();
    }
  } catch (err) {
    return { emitted: false, reason: 'telemetry_error', message: err && err.message ? err.message : String(err) };
  }
}

module.exports = {
  SOURCE,
  EVENT_TYPE,
  PHASE,
  buildVerificationTelemetryPayload,
  recordVerificationTelemetry
};

