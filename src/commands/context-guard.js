'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { buildGuardResponse } = require('../context-guard');
const { normalizeAgentName } = require('../agents');
const { isAutoAgent, resolveActiveAgent } = require('../lib/active-agent');
const { resolveProjectRootOrSelf, resolveTargetDir } = require('../lib/project-root');

// `aioson context:guard [path] --tool=claude [--json]`
//
// Reference adapter for the operational retrieval loop. A harness hook pipes the
// pending tool event on stdin; the guard answers with a harness-shaped injection
// payload (or an empty object when no project rule is salient). Always exits 0 —
// it is advisory and must never block the host harness.
async function runContextGuard({ args, options = {}, logger }) {
  // `$PWD` from the hook is a starting point, not the project root — resolve
  // upward so rules are read from the project that actually owns the edit.
  const targetDir = resolveProjectRootOrSelf(resolveTargetDir(args));
  const event = await resolveEvent(args, options);

  let response;
  try {
    response = await buildGuardResponse(event || {}, targetDir, {
      tool: options.tool || 'claude',
      agent: await resolveGuardAgentAt(targetDir, options, event),
      // A configured JEV judges vocabulary-only injections; --no-jev skips it.
      jevFilter: options['no-jev'] ? null : { env: process.env }
    });
  } catch {
    // The guard is advisory and runs on the PreToolUse hot path. Any internal
    // failure must surface as an empty injection ({}), never a non-hook envelope
    // ({"ok":false,...}) on the hook's stdout channel.
    response = {};
  }

  const guard = response && response._guard;
  if (guard && guard.injected) await recordGuardEvent(targetDir, event, guard);

  if (options.json) {
    // Keep the wire payload pristine — strip the internal observability field.
    const { _guard, ...wire } = response;
    return wire;
  }

  if (guard && guard.injected) {
    logger.log(`context:guard injected ${guard.rules.length} rule(s): ${guard.rules.join(', ')} (confidence ${guard.confidence})`);
  } else {
    logger.log('context:guard: no salient project rule for this change');
  }

  return response;
}

// Best-effort, silent, only when the runtime store exists — the same contract
// as the brief telemetry. Read back by lib/guard-outcomes.js (context:usage).
async function recordGuardEvent(targetDir, event, guard) {
  let handle = null;
  try {
    const { openRuntimeDb, appendGuardEvent } = require('../runtime-store');
    handle = await openRuntimeDb(targetDir, { mustExist: true });
    if (!handle || !handle.db) return;
    appendGuardEvent(handle.db, {
      agentName: guard.agent,
      toolName: event && event.tool_name,
      payload: {
        file: guard.file,
        rules: guard.rules,
        violations: guard.violation_keys || [],
        jev: guard.jev ? guard.jev.status : null
      }
    });
  } catch { /* telemetry never breaks the hook */ } finally {
    if (handle && handle.db) { try { handle.db.close(); } catch { /* closed */ } }
  }
}

function resolveGuardAgent(options = {}, event = {}) {
  const explicit = [options.agent, options.a].find((value) => value && !isAutoAgent(value));
  const candidate = explicit
    || event?.agent
    || event?.agent_name
    || event?.context?.agent
    || process.env.AIOSON_AGENT
    || 'dev';
  return normalizeAgentName(candidate) || 'dev';
}

// An explicit agent wins; `auto` (what a default install bakes) or no flag
// resolves the agent acting now — event, AIOSON_AGENT, the project's latest
// brief — so the planner's plan is judged with the planner's rules.
async function resolveGuardAgentAt(targetDir, options = {}, event = {}) {
  const explicit = [options.agent, options.a].find((value) => value && !isAutoAgent(value));
  if (explicit) return normalizeAgentName(explicit) || 'dev';
  const active = await resolveActiveAgent(targetDir, { event });
  return active.agent || 'dev';
}

async function resolveEvent(args, options) {
  if (typeof options.event === 'string') return safeParse(options.event);
  if (typeof options['event-file'] === 'string') {
    try {
      const raw = fs.readFileSync(path.resolve(process.cwd(), options['event-file']), 'utf8');
      return safeParse(raw);
    } catch {
      return null;
    }
  }
  return readStdinEvent();
}

function safeParse(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function readStdinEvent() {
  return new Promise((resolve) => {
    if (process.stdin.isTTY) {
      resolve(null);
      return;
    }
    let data = '';
    let settled = false;
    const settle = (value) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => { data += chunk; });
    process.stdin.on('end', () => settle(safeParse(data)));
    process.stdin.on('error', () => settle(null));
  });
}

module.exports = { runContextGuard, resolveGuardAgent, resolveGuardAgentAt };
