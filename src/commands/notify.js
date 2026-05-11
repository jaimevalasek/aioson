'use strict';

// aioson notify [.] --level=info|warn|block --topic=<topic> --message=<text> [--agent=<name>] [--json]
//
// Visual wrapper around runtime:emit. Renders an inline prefix on stdout
// (ℹ / ⚠ / ⛔) and records the event in the runtime SQLite store. Level=block
// causes the command to exit with code 2 so callers know to wait for a human.

const path = require('node:path');
const { openRuntimeDb, logAgentEvent } = require('../runtime-store');
const { render, normalizeLevel } = require('../notify-renderer');

async function emitEvent(targetDir, agent, level, topic, message) {
  try {
    const { db, runtimeDir } = await openRuntimeDb(targetDir);
    try {
      await logAgentEvent(db, runtimeDir, {
        agentName: agent || `notify-${level}`,
        message,
        type: `notify_${level}`,
        meta: { topic, level }
      });
    } finally {
      db.close();
    }
  } catch {
    // best-effort: notify must always print, even if telemetry is unavailable
  }
}

async function runNotify({ args, options = {}, logger }) {
  const targetDir = path.resolve(process.cwd(), args?.[0] || '.');
  const level = normalizeLevel(options.level);
  const topic = options.topic ? String(options.topic).trim() : '';
  const message = String(options.message || '').trim();
  const agent = options.agent ? String(options.agent).trim() : null;

  if (!message) {
    if (!options.json) logger.log('✗ notify: --message is required');
    return { ok: false, error: 'missing_message', exitCode: 1 };
  }

  const rendered = render({ level, topic, message });

  if (!options.json) {
    logger.log(rendered.line);
  }

  await emitEvent(targetDir, agent, rendered.level, topic, message);

  // Surface the requested exit code to the CLI driver.
  if (rendered.exitCode !== 0) {
    process.exitCode = rendered.exitCode;
  }

  return {
    ok: rendered.exitCode === 0,
    level: rendered.level,
    topic,
    message,
    line: rendered.line,
    exitCode: rendered.exitCode
  };
}

module.exports = {
  runNotify
};
