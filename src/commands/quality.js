'use strict';

const handlers = {
  'quality:audit': require('./quality-audit').runQualityAudit,
  'quality-audit': require('./quality-audit').runQualityAudit,
  'quality:run': require('./quality-run').runQualityChecks,
  'quality:evals': require('./quality-evals').runQualityEvals
};

function isQualityCommand(command) { return Object.hasOwn(handlers, command); }
async function runQualityCommand(command, context) {
  try { return await handlers[command](context); } catch (error) {
    const result = { status: 'error', error: error.message };
    if (!context.options?.json && context.logger) context.logger.log(error.message);
    return { ok: false, exitCode: 2, result };
  }
}

module.exports = { isQualityCommand, runQualityCommand };
