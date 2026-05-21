'use strict';

/**
 * aioson op:* — Phase 1 stubs for commands shipped in later phases.
 *
 * Each stub emits a "Not yet implemented" stderr message + structured
 * `op_command_stub` telemetry event, then exits non-zero. Replaced in
 * Phases 2-5 with full implementations.
 *
 * AC-P1-07: six CLI commands respond with at least --help text; op:identity
 * is fully functional in Phase 1; the other five are stubs until their
 * respective phases ship.
 */

const { emitDossierEvent } = require('../lib/dossier-telemetry');

const STUB_INFO = {
  'op:capture':  { phase: 2, release: 'v1.13.0', summary: 'capture LLM-driven signal into proposals/ queue' },
  'op:promote':  { phase: 2, release: 'v1.13.0', summary: 'manually promote a proposal to decisions/ (skip 2x threshold)' },
  'op:forget':   { phase: 2, release: 'v1.13.0', summary: 'soft-delete a decision or proposal to history/' },
  'op:list':     { phase: 3, release: 'v1.14.0', summary: 'list active decisions (and --include-archived)' },
  'op:show':     { phase: 3, release: 'v1.14.0', summary: 'print a single decision body + frontmatter' }
};

function makeStub(commandName) {
  const info = STUB_INFO[commandName];
  if (!info) {
    throw new Error(`makeStub: unknown command '${commandName}'`);
  }

  return async function runStub({ args = [], options = {}, logger } = {}) {
    const targetDir = process.cwd();
    const helpRequested = options.help === true || args.includes('--help') || args.includes('-h');

    if (helpRequested) {
      const msg = `${commandName} — ${info.summary}\n  Status: shipped in Phase ${info.phase} (${info.release}).\n  Phase 1 (v1.12.0) wires the command surface but defers logic to that release.`;
      if (options.json) return { ok: true, stub: true, command: commandName, phase: info.phase, release: info.release, summary: info.summary };
      if (logger) logger.log(msg);
      return { ok: true, stub: true };
    }

    await emitDossierEvent(targetDir, {
      agent: commandName,
      type: 'op_command_stub',
      summary: `${commandName} invoked before its release phase`,
      meta: { command: commandName, phase: info.phase, release: info.release }
    });

    const errMsg = `${commandName} — Not yet implemented (ships in Phase ${info.phase} / ${info.release}). Run \`${commandName} --help\` for scope.`;
    if (options.json) {
      return { ok: false, stub: true, command: commandName, phase: info.phase, release: info.release, error: errMsg };
    }
    if (logger && logger.error) {
      logger.error(errMsg);
    }
    return { ok: false, stub: true, exitCode: 1 };
  };
}

module.exports = {
  runOpCapture: makeStub('op:capture'),
  runOpPromote: makeStub('op:promote'),
  runOpForget:  makeStub('op:forget'),
  runOpList:    makeStub('op:list'),
  runOpShow:    makeStub('op:show'),
  STUB_INFO
};
