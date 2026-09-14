'use strict';

const path = require('node:path');
const { resolveTargetDir } = require('../project-root');

function resolveQualityTarget(args) {
  const requested = path.resolve(args?.[0] || '.');
  const target = resolveTargetDir(args);
  if (requested !== target) {
    throw new Error('Quality execution cannot redirect a storage path to its owning project. Use an explicit project directory or a dedicated Git checkout.');
  }
  return target;
}

module.exports = { resolveQualityTarget };
