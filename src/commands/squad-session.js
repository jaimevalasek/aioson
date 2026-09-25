'use strict';

const { runSquadAutorun } = require('./squad-autorun');
const { runSquadStatus, validSessionIdentity } = require('./squad-status');
const { prepareRevision } = require('../squad/session-revision');
const { resolveTargetDir } = require('../lib/project-root');

async function runSquadSession({ args = [], options = {}, logger = console, t = key => key } = {}) {
  const [action, ...projectArgs] = args;
  if (!['run', 'resume', 'status', 'revise'].includes(action)) {
    logger.log('Usage: aioson squad run|status|resume|revise [path] --squad=<slug> [--session=<id>]');
    return { ok: false, error: 'unknown_squad_action' };
  }
  const session = options.session || options.plan;
  if (['resume', 'revise'].includes(action) && !session) return { ok: false, error: 'missing_session' };
  if (!validSessionIdentity(options.squad || options.s) || (session && !validSessionIdentity(session))) {
    return { ok: false, error: 'invalid_identity' };
  }
  if (options.session && options.plan && options.session !== options.plan) return { ok: false, error: 'conflicting_session' };
  const normalized = { ...options, squad: options.squad || options.s, ...(session ? { session, plan: session } : {}) };
  if (action === 'revise') {
    const result = await prepareRevision(resolveTargetDir(projectArgs), normalized.squad, session,
      String(options.tasks || options.task || '').split(',').map(id => id.trim()).filter(Boolean), options.feedback);
    if (result.ok) logger.log(`Revision prepared: ${result.session_id}; next: ${result.next_action}`);
    else logger.error(result.error);
    return result;
  }
  if (action === 'status') return runSquadStatus({ args: projectArgs, options: normalized, logger, t });
  return runSquadAutorun({ args: projectArgs, options: normalized, logger });
}

module.exports = { runSquadSession };
