'use strict';

// aioson memory:reflect-prepare [.] --agent=<name> [--git-range=<range>] [--force] [--json]
//
// Reads project state, asks the reflect engine for a verdict, and (if relevant)
// writes the in-harness manifest the agent will consume on the next turn.

const fs = require('node:fs/promises');
const path = require('node:path');
const { openRuntimeDb, logAgentEvent } = require('../runtime-store');
const { evaluate, buildPrompt } = require('../memory-reflect-engine');

const REFLECT_PROMPT_RELATIVE = path.join('.aioson', 'runtime', 'reflect-prompt.json');

async function ensureDir(dirPath) {
  await fs.mkdir(dirPath, { recursive: true });
}

async function emitEvent(targetDir, agent, type, message, payload) {
  try {
    const { db, runtimeDir } = await openRuntimeDb(targetDir);
    try {
      await logAgentEvent(db, runtimeDir, {
        agentName: agent,
        message,
        type,
        meta: payload || undefined
      });
    } finally {
      db.close();
    }
  } catch {
    // telemetry is best-effort; never fail prepare/commit due to event emission
  }
}

async function runMemoryReflectPrepare({ args, options = {}, logger }) {
  const targetDir = path.resolve(process.cwd(), args?.[0] || '.');
  const agent = String(options.agent || '').trim() || 'unknown';
  const gitRange = options['git-range'] || options.range || undefined;
  const force = Boolean(options.force);

  const evaluation = await evaluate(targetDir, { agent, gitRange });

  if (!evaluation.bootstrapPresent) {
    const message = `bootstrap/ missing at ${path.join(targetDir, '.aioson/context/bootstrap')} — run /discover to seed it.`;
    if (!options.json) logger.log(`! memory:reflect-prepare: ${message}`);
    await emitEvent(targetDir, agent, 'memory_reflect_skipped', message, { reason: 'missing_bootstrap' });
    return { ok: false, skipped: true, reason: 'missing_bootstrap', message };
  }

  if (evaluation.verdict === 'skip' && !force) {
    const message = 'reflect skipped: no relevant signals in diff';
    if (!options.json) logger.log(`· ${message}`);
    await emitEvent(targetDir, agent, 'memory_reflect_skipped', message, {
      reasons: evaluation.reasons,
      shortstat: evaluation.shortstat
    });
    return { ok: true, skipped: true, evaluation };
  }

  const manifest = await buildPrompt({
    targetDir,
    agent,
    evaluation,
    sessionId: options['session-id'] || undefined
  });

  const promptPath = path.join(targetDir, REFLECT_PROMPT_RELATIVE);
  await ensureDir(path.dirname(promptPath));
  await fs.writeFile(promptPath, JSON.stringify(manifest, null, 2), 'utf8');

  const promptRelative = path.relative(targetDir, promptPath);
  if (!options.json) {
    logger.log(`✓ reflect manifest written: ${promptRelative}`);
    logger.log(`  verdict: ${evaluation.verdict}`);
    logger.log(`  targets: ${manifest.targets.join(', ')}`);
    if (evaluation.reasons.length > 0) {
      logger.log(`  reasons: ${evaluation.reasons.join('; ')}`);
    }
    logger.log('  next: agent edits listed bootstrap files, then run `aioson memory:reflect-commit`.');
  }

  await emitEvent(targetDir, agent, 'memory_reflect_prepared', `reflect manifest at ${promptRelative}`, {
    targets: manifest.targets,
    snapshot_hash: manifest.snapshot_hash,
    reasons: evaluation.reasons,
    forced: force && evaluation.verdict === 'skip'
  });

  return { ok: true, manifest, manifestPath: promptPath, evaluation };
}

module.exports = {
  REFLECT_PROMPT_RELATIVE,
  runMemoryReflectPrepare
};
