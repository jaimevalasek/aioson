'use strict';

/**
 * aioson squad:gateway [path] --squad=<slug> [--dry-run] [--json]
 *
 * Writes or refreshes a persistent squad's one-line entry in CLAUDE.md and
 * AGENTS.md (src/squad/gateway-entry.js): its name, where the package lives and
 * its mission's first sentence, between AIOSON-SQUAD markers. A legacy entry's
 * authored prose moves to the package's docs/gateway-note.md.
 */

const { resolveTargetDir } = require('../lib/project-root');
const { writeSquadGatewayEntry } = require('../squad/gateway-entry');

async function runSquadGateway({ args = [], options = {}, logger = console } = {}) {
  const projectDir = resolveTargetDir(args);
  const slug = String(options.squad || options.slug || '').trim();
  if (!slug) {
    const message = 'squad:gateway — --squad=<slug> is required';
    if (!options.json) logger.error(message);
    return { ok: false, error: 'missing_squad', message };
  }
  const result = writeSquadGatewayEntry(projectDir, slug, { dryRun: Boolean(options['dry-run']) });
  if (options.json) return result;
  if (!result.ok) {
    logger.error(`squad:gateway — ${result.message}`);
    return result;
  }
  if (result.skipped === 'ephemeral') logger.log(`squad:gateway — ${slug} is ephemeral: not registered.`);
  else if (result.files.length === 0) logger.log(`squad:gateway — ${slug} is already one line (or no CLAUDE.md/AGENTS.md here).`);
  else logger.log(`squad:gateway — ${slug} ${options['dry-run'] ? 'would be' : 'is'} one line in ${result.files.join(', ')}:\n${result.line}`);
  return result;
}

module.exports = { runSquadGateway };
