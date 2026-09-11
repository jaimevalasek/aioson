'use strict';

/**
 * aioson squad:preflight — deterministic module map for an @squad activation.
 *
 * Usage:
 *   aioson squad:preflight . --operation=create --lane=standard --mode=software --json
 *   aioson squad:preflight . --operation=default-create --signals=customer-facing,content
 *   aioson squad:preflight . --operation=session-run --mode=content --signals=content
 *
 * Prints the task files, docs and skill router the activation must load (with
 * byte counts), the done-gate commands for that lane, and the package digest.
 * Read-only; nothing is written.
 */

const { resolveSquadPreflight, measurePreflight, OPERATIONS, LANES, MODES, SIGNALS } = require('../lib/squad-preflight');
const { resolveTargetDir } = require('../lib/project-root');

async function runSquadPreflight({ args = [], options = {}, logger = console } = {}) {
  const targetDir = resolveTargetDir(args);
  const operation = String(options.operation || options.op || '').trim();
  if (!operation) {
    logger.error(`Usage: aioson squad:preflight [path] --operation=<${OPERATIONS.join('|')}> [--lane=<${LANES.join('|')}>] [--mode=<${MODES.join('|')}>] [--signals=<${SIGNALS.join(',')}>] [--json]`);
    return { ok: false, error: 'missing_operation', exitCode: 1 };
  }
  const resolved = resolveSquadPreflight({
    operation,
    lane: String(options.lane || 'standard').trim(),
    mode: String(options.mode || 'mixed').trim(),
    signals: options.signals
  });
  if (!resolved.ok) {
    logger.error(`Unknown operation "${resolved.operation}". Expected one of: ${resolved.operations.join(', ')}`);
    return { ...resolved, exitCode: 1 };
  }
  const result = measurePreflight(targetDir, resolved);
  if (options.json) return result;

  logger.log('');
  logger.log(`══ Squad preflight: ${result.operation} · lane ${result.lane} · mode ${result.mode} ══`);
  if (result.signals.length > 0) logger.log(`  Signals: ${result.signals.join(', ')}`);
  logger.log('');
  logger.log('  Load, in this order:');
  for (const entry of result.load) {
    const size = entry.bytes === null ? 'MISSING' : `${entry.bytes} B`;
    logger.log(`    ${size.padStart(9)}  ${entry.file}  — ${entry.reason}`);
  }
  logger.log('');
  logger.log(`  Total: ${result.totalBytes} bytes (~${result.estimatedTokens} tokens)${result.missing.length ? ` · ${result.missing.length} file(s) missing` : ''}`);
  logger.log('');
  logger.log('  Done gate:');
  for (const cmd of result.doneGate) logger.log(`    ${cmd}`);
  logger.log('');
  return result;
}

module.exports = { runSquadPreflight };
