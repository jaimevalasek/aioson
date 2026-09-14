'use strict';

// Candidate worker. Expected outcomes stay in the parent process.
const fs = require('node:fs');
const { serialize } = require('node:v8');
const request = JSON.parse(fs.readFileSync(0, 'utf8'));
const solve = require(request.solution);
if (typeof solve !== 'function') throw new Error('Candidate must export a function.');
const observations = request.inputs.map(input => ({ value: solve(input), input }));
process.stdout.write(serialize(observations).toString('base64'));
