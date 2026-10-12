'use strict';

// One seeded source of resampling randomness for every paired comparison the
// quality tools report (`quality:evals --compare`, `quality:bench --baseline`).
//
// The first implementation drew `seed % n` straight from a 32-bit LCG. The low
// bits of such a generator cycle with period 2^k, so the index sequence for
// n = 8 repeated every eight draws: every bootstrap resample was a permutation
// of the original samples, the "interval" collapsed to the point estimate and
// excluded zero on any nonzero delta; for every even n the draws alternated
// parity. mulberry32 hashes the state before use, so the index comes from the
// whole word, and the fixed seed keeps an interval reproducible run to run.

function seededRandom(seed = 42) {
  let state = seed | 0;
  return function next() {
    state = (state + 0x6D2B79F5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** One resample of `values` with replacement, the same length, drawn from `next`. */
function resample(values, next) {
  return values.map(() => values[Math.floor(next() * values.length)]);
}

module.exports = { seededRandom, resample };
