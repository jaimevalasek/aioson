'use strict';

const { deserialize } = require('node:v8');
const { isDeepStrictEqual } = require('node:util');

function gradeOutcomes(execution, vectors) {
  if (execution.status !== 'pass') return execution;
  let observations;
  try { observations = deserialize(Buffer.from(execution.stdout, 'base64')); }
  catch { return { ...execution, status: 'fail', reason: 'invalid_candidate_observations' }; }
  const expected = vectors.map(vector => ({ value: vector.expected, input: vector.input }));
  return { ...execution, status: isDeepStrictEqual(observations, expected) ? 'pass' : 'fail',
    reason: isDeepStrictEqual(observations, expected) ? null : 'outcome_mismatch' };
}

module.exports = { gradeOutcomes };
