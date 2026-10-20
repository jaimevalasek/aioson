'use strict';

/**
 * aioson op:identity — operator-memory identity resolution (Phase 1, v1.12.0).
 *
 * Subcommands:
 *   show (default) — resolve current identity + emit summary
 *   set <id>       — Phase 1 stub. Full impl in Phase 5; prints guidance to use env override.
 *
 * Usage:
 *   aioson op:identity show
 *   aioson op:identity show --json
 *   aioson op:identity set ci-bot-shared       (Phase 1: prints guidance only)
 *   AIOSON_OPERATOR_ID=ci-bot aioson op:identity show
 */

const {
  validateOverride,
  OVERRIDE_REGEX
} = require('../operator-memory/identity');
const { positionalArgs, commandFailure, openCommand, commandIdentity } = require('../operator-memory/command-context');
const {
  ensureStorageTree,
  openIndexDb,
  recordIdentityActivity,
  getStorageRoot
} = require('../operator-memory/storage');
const { emitDossierEvent } = require('../lib/dossier-telemetry');

function parseSubcommand(args) {
  // parser.js strips the command name, so args contains positional args only:
  // `[path] [show|set <id>]`. The identity is read from the project's git
  // config (a per-repo user.email wins), so the path matters.
  const positional = positionalArgs(args);
  const rawPath = positional.length > 0 && positional[0] !== 'show' && positional[0] !== 'set' ? positional.shift() : null;
  const sub = positional[0] || 'show';
  const setValue = sub === 'set' ? positional[1] : null;
  return { rawPath, sub, setValue };
}

// Phase 5 full impl: process.env mutation works only within this Node process.
// For shell-session persistence the user must export AIOSON_OPERATOR_ID. This
// command initializes the identity storage tree for the new id so subsequent
// op:* invocations in the same process see a ready identity.
function setIdentity(setValue, options, logger) {
  if (!setValue) return commandFailure(options, logger, 'op:identity set — missing <id>. Usage: aioson op:identity set <id>');
  const validation = validateOverride(setValue);
  if (!validation.ok) {
    return commandFailure(options, logger, `op:identity set — '${setValue}' invalid (${validation.reason}; expected ${OVERRIDE_REGEX}, no reserved prefix _* or aioson-*).`);
  }
  process.env.AIOSON_OPERATOR_ID = setValue;
  ensureStorageTree(setValue);
  let db;
  try {
    db = openIndexDb();
    recordIdentityActivity(db, { identity: setValue, source: 'override' });
  } finally {
    if (db) { try { db.close(); } catch { /* ignore */ } }
  }
  if (options.json) {
    return {
      ok: true,
      identity: setValue,
      source: 'override',
      storage_root: getStorageRoot(setValue),
      persistence: 'process_env_only',
      shell_export: `export AIOSON_OPERATOR_ID=${setValue}`
    };
  }
  if (logger) logger.log(`op:identity set — process env AIOSON_OPERATOR_ID=${setValue} (this process only). Persist via shell:\n  export AIOSON_OPERATOR_ID=${setValue}\n  # or .bashrc / equivalent`);
  return { ok: true };
}

async function runOpIdentity({ args = [], options = {}, logger }) {
  if (options.help === true || args.includes('--help') || args.includes('-h')) {
    const help = [
      'op:identity [show] — resolve the active operator-memory identity.',
      'op:identity set <id> — initialize an override for this process only.',
      'Use AIOSON_OPERATOR_ID=<id> in the shell to persist an override.'
    ].join('\n');
    if (options.json) return { ok: true, help: true, command: 'op:identity' };
    if (logger) logger.log(help);
    return { ok: true, help: true };
  }

  const { rawPath, sub, setValue } = parseSubcommand(args);
  const where = openCommand('op:identity', rawPath, options, logger);
  if (where.failure) return where.failure;
  const targetDir = where.dir;

  if (sub !== 'show' && sub !== 'set') {
    return commandFailure(options, logger, `op:identity — unknown subcommand '${sub}'. Use: show | set <id>`);
  }
  if (sub === 'set') return setIdentity(setValue, options, logger);

  // sub === 'show'
  const resolved = commandIdentity(targetDir);

  let db;
  try {
    db = openIndexDb();
    recordIdentityActivity(db, { identity: resolved.identity, source: resolved.source });
  } finally {
    if (db) {
      try { db.close(); } catch { /* swallow */ }
    }
  }

  if (resolved.source === 'anonymous-fallback') {
    await emitDossierEvent(targetDir, {
      agent: 'op-identity',
      type: 'op_identity_unresolved',
      summary: 'git email unavailable; using _anonymous bucket',
      meta: { identity: resolved.identity, source: resolved.source }
    });
  }

  const storageRoot = getStorageRoot(resolved.identity);

  const result = {
    ok: true,
    identity: resolved.identity,
    source: resolved.source,
    storage_root: storageRoot,
    warning: resolved.warning
  };

  if (options.json) return result;

  if (resolved.warning && logger && logger.error) {
    logger.error(`⚠ ${resolved.warning}`);
  }
  const sourceLabel = resolved.source === 'override'
    ? '(override via AIOSON_OPERATOR_ID)'
    : resolved.source === 'anonymous-fallback'
      ? '(anonymous fallback — set git config user.email to scope memory)'
      : '(git-email-hash)';
  if (logger) {
    logger.log(`op:identity — ${resolved.identity} ${sourceLabel}`);
    logger.log(`storage_root: ${storageRoot}`);
  }
  return result;
}

module.exports = {
  runOpIdentity
};
