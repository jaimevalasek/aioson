'use strict';

const { resolveQualityTarget } = require('../lib/quality/target');
const { runChecks } = require('../lib/quality/checks');

async function runQualityChecks({ args, options = {}, logger }) {
  const result = await runChecks(resolveQualityTarget(args), options);
  if (!options.json && logger) logger.log(JSON.stringify(result.plan || result.result, null, 2));
  return result;
}

module.exports = { runQualityChecks };
