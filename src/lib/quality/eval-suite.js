'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const { createHash } = require('node:crypto');

const digest = value => createHash('sha256').update(value).digest('hex');
const DEFAULT_SUITE = path.resolve(__dirname, '../../..', 'template/.aioson/quality/evals/core.json');

async function loadSuite(file = DEFAULT_SUITE) {
  const raw = await fs.readFile(file);
  const suite = JSON.parse(raw);
  if (suite.schema_version !== 1 || typeof suite.id !== 'string' || !suite.id || !Array.isArray(suite.tasks) || !suite.tasks.length) throw new Error('Invalid quality evaluation suite.');
  const ids = new Set();
  for (const task of suite.tasks) validateTask(task, ids);
  return { suite, hash: digest(raw), file: path.resolve(file) };
}

function validateTask(task, ids) {
  if (typeof task.id !== 'string' || !/^[a-z0-9-]+$/.test(task.id) || ids.has(task.id) || typeof task.prompt !== 'string' || !task.prompt || typeof task.source !== 'string'
    || !Array.isArray(task.vectors) || !task.vectors.length) throw new Error('Invalid or duplicate evaluation task.');
  ids.add(task.id);
  for (const vector of task.vectors) {
    if (!vector || !Object.hasOwn(vector, 'input') || !Object.hasOwn(vector, 'expected')) throw new Error('Evaluation vector requires input and expected output.');
  }
}

module.exports = { loadSuite, digest };
