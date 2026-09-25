'use strict';

const { runSquadAutorun } = require('./squad-autorun');
const { runSquadStatus, validSessionIdentity } = require('./squad-status');

async function runSquadSession({ args = [], options = {}, logger = console, t = key => key } = {}) {
  const [action, ...projectArgs] = args;
  if (!['run', 'resume', 'status'].includes(action)) {
    logger.log('Usage: aioson squad run|status|resume [path] --squad=<slug> [--session=<id>]');
    return { ok: false, error: 'unknown_squad_action' };
  }
  const session = options.session || options.plan;
  if (action === 'resume' && !session) return { ok: false, error: 'missing_session' };
  if (!validSessionIdentity(options.squad || options.s) || (session && !validSessionIdentity(session))) {
    return { ok: false, error: 'invalid_identity' };
  }
  if (options.session && options.plan && options.session !== options.plan) return { ok: false, error: 'conflicting_session' };
  const normalized = { ...options, squad: options.squad || options.s, ...(session ? { session, plan: session } : {}) };
  if (action === 'status') return runSquadStatus({ args: projectArgs, options: normalized, logger, t });
  return runSquadAutorun({ args: projectArgs, options: normalized, logger });
}

module.exports = { runSquadSession };
