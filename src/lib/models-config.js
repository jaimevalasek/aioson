'use strict';

const fs = require('node:fs');
const path = require('node:path');

const MODELS_CONFIG_CANDIDATES = ['aioson-models.json'];

function candidatePaths(projectDir) {
  const root = path.resolve(projectDir || '.');
  return MODELS_CONFIG_CANDIDATES.map((rel) => ({
    rel,
    path: path.join(root, ...rel.split('/'))
  }));
}

function readModelsConfig(projectDir) {
  const candidates = candidatePaths(projectDir);
  for (const candidate of candidates) {
    let raw;
    try {
      raw = fs.readFileSync(candidate.path, 'utf8');
    } catch (error) {
      if (error.code === 'ENOENT') continue;
      return { ok: false, error: 'config_unreadable', rel: candidate.rel, path: candidate.path };
    }
    try {
      const data = JSON.parse(raw);
      if (!data || typeof data !== 'object' || Array.isArray(data)) {
        return { ok: false, error: 'config_invalid', rel: candidate.rel, path: candidate.path, detail: 'expected an object' };
      }
      return { ok: true, rel: candidate.rel, path: candidate.path, data };
    } catch (error) {
      return {
        ok: false,
        error: 'config_invalid',
        rel: candidate.rel,
        path: candidate.path,
        detail: error.message
      };
    }
  }
  return {
    ok: false,
    error: 'config_missing',
    rel: candidates[0].rel,
    path: candidates[0].path,
    data: null
  };
}

module.exports = {
  MODELS_CONFIG_CANDIDATES,
  readModelsConfig
};
