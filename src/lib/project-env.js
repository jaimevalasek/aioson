'use strict';

const fs = require('node:fs');
const path = require('node:path');

/** Orchestration secrets loaded from `<project>/.env` when absent from the OS env. */
const ORCHESTRATION_DOTENV_KEYS = ['CURSOR_API_KEY'];

function unquote(value) {
  const text = String(value || '').trim();
  if ((text.startsWith('"') && text.endsWith('"')) || (text.startsWith("'") && text.endsWith("'"))) {
    return text.slice(1, -1);
  }
  return text;
}

function parseDotEnv(content) {
  const out = {};
  for (const line of String(content || '').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const body = trimmed.startsWith('export ') ? trimmed.slice(7).trim() : trimmed;
    const eq = body.indexOf('=');
    if (eq <= 0) continue;
    const key = body.slice(0, eq).trim();
    if (!/^[A-Z_][A-Z0-9_]*$/i.test(key)) continue;
    out[key] = unquote(body.slice(eq + 1));
  }
  return out;
}

function dotEnvPath(projectDir) {
  return path.join(path.resolve(projectDir), '.env');
}

function readProjectDotEnv(projectDir) {
  const file = dotEnvPath(projectDir);
  try {
    if (!fs.statSync(file).isFile()) return { path: file, present: false, values: {} };
    const values = parseDotEnv(fs.readFileSync(file, 'utf8'));
    return { path: file, present: true, values };
  } catch (error) {
    if (error.code === 'ENOENT') return { path: file, present: false, values: {} };
    throw error;
  }
}

/** Merge whitelisted `.env` entries into `env`. Existing OS/process values win. */
function mergeProjectEnv(projectDir, env = process.env) {
  const { values } = readProjectDotEnv(projectDir);
  const merged = { ...env };
  for (const key of ORCHESTRATION_DOTENV_KEYS) {
    if (merged[key]) continue;
    const value = values[key];
    if (typeof value === 'string' && value.trim()) merged[key] = value.trim();
  }
  return merged;
}

/** Apply whitelisted `.env` entries to `process.env` (OS values kept). */
function applyProjectEnv(projectDir) {
  const merged = mergeProjectEnv(projectDir, process.env);
  for (const key of ORCHESTRATION_DOTENV_KEYS) {
    if (process.env[key]) continue;
    if (merged[key]) process.env[key] = merged[key];
  }
  return merged;
}

module.exports = {
  ORCHESTRATION_DOTENV_KEYS,
  parseDotEnv,
  readProjectDotEnv,
  mergeProjectEnv,
  applyProjectEnv,
  dotEnvPath
};
