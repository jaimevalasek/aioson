'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const { resolveQualityTarget } = require('../lib/quality/target');
const { runEvals } = require('../lib/quality/evals');
const { compareRuns } = require('../lib/quality/eval-compare');
const { writeJson } = require('../lib/quality/files');

async function runQualityEvals({ args, options = {}, logger }) {
  const root = resolveQualityTarget(args);
  let payload;
  if (options.compare) {
    if (!options.baseline || typeof options.baseline !== 'string') throw new Error('Comparison requires --baseline=<run.json>.');
    const before = JSON.parse(await fs.readFile(path.resolve(root, options.baseline), 'utf8'));
    const after = JSON.parse(await fs.readFile(path.resolve(root, options.compare), 'utf8'));
    const result = compareRuns(before, after);
    if (options.output) await writeJson(root, options.output, result, { exclusive: true });
    payload = { ok: result.regressions === 0, exitCode: result.regressions ? 1 : 0, result };
  } else payload = await runEvals(root, options);
  if (!options.json && logger) logger.log(JSON.stringify(payload.result.summary || payload.result, null, 2));
  return payload;
}

module.exports = { runQualityEvals };
