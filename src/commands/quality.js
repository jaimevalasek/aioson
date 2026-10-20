'use strict';

// Each handler loads its module on its own call: the CLI asks isQualityCommand
// for every command that reaches this branch of its dispatch (hooks:emit,
// agent:done, op:list…), so the map itself must not load the quality
// subsystem. The destructure at each require lets static analysis see which
// export is used.
const audit = () => { const { runQualityAudit } = require('./quality-audit'); return runQualityAudit; };
const handlers = {
  'quality:audit': audit,
  'quality-audit': audit,
  'quality:run': () => { const { runQualityChecks } = require('./quality-run'); return runQualityChecks; },
  'quality:evals': () => { const { runQualityEvals } = require('./quality-evals'); return runQualityEvals; },
  'quality:bench': () => { const { runQualityBench } = require('./quality-bench'); return runQualityBench; }
};

function isQualityCommand(command) { return Object.hasOwn(handlers, command); }
async function runQualityCommand(command, context) {
  try { return await handlers[command]()(context); } catch (error) {
    const result = { status: 'error', error: error.message };
    if (!context.options?.json && context.logger) context.logger.log(error.message);
    return { ok: false, exitCode: 2, result };
  }
}

module.exports = { isQualityCommand, runQualityCommand };
