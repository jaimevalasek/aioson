'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const { randomUUID, createHash } = require('node:crypto');
const { execute, commandFor } = require('./process');
const { writeJson, ensureNewOutput } = require('./files');
const { sourceIdentity } = require('./provenance');

async function qualityPlan(root, options = {}) {
  const profile = options.profile || 'product';
  if (!['framework', 'product'].includes(profile)) throw new Error('Quality profile must be framework or product.');
  const configPath = path.resolve(root, options.config || '.aioson/quality.json');
  const configuration = await readConfiguration(configPath, Boolean(options.config));
  if (configuration) {
    return { profile, source: path.relative(root, configPath).replace(/\\/g, '/'), checks: configuration.checks };
  }
  let manifest;
  try { manifest = JSON.parse(await fs.readFile(path.join(root, 'package.json'), 'utf8')); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  const ids = profile === 'framework' ? ['lint', 'test:quality', 'quality:coverage', 'quality:static'] : ['lint', 'test'];
  return { profile, source: 'package.json scripts', checks: ids.map(id => ({
    id: id.replace(/:/g, '-'), argv: manifest?.scripts?.[id] ? ['npm', 'run', id] : null,
    reason: manifest?.scripts?.[id] ? null : `No ${id} script configured; provide .aioson/quality.json for this stack.`
  })) };
}

async function readConfiguration(file, explicit) {
  let configuration;
  try { configuration = JSON.parse(await fs.readFile(file, 'utf8')); }
  catch (error) { if (error.code === 'ENOENT' && !explicit) return null; throw error; }
  if (configuration?.schema_version !== 1 || !Array.isArray(configuration.checks)) throw new Error('Invalid quality check configuration.');
  const ids = new Set();
  for (const check of configuration.checks) {
    if (typeof check?.id !== 'string' || !/^[a-z0-9-]+$/.test(check.id) || ids.has(check.id)) throw new Error('Invalid or duplicate quality check.');
    commandFor(check.argv);
    const timeout = Number(check.timeout_ms ?? 600000);
    if (!Number.isInteger(timeout) || timeout < 1 || timeout > 600000) throw new Error('Invalid check timeout.');
    ids.add(check.id);
  }
  return configuration;
}

async function runChecks(root, options = {}) {
  const plan = await qualityPlan(root, options);
  if (options['dry-run']) return { ok: true, exitCode: 0, plan };
  await ensureNewOutput(root, options.output);
  const runId = randomUUID();
  const checks = [];
  for (const check of plan.checks) {
    const result = check.argv ? await execute(check.argv, { cwd: root, timeout: Number(check.timeout_ms ?? 600000) })
      : { status: 'not_run', reason: check.reason, duration_ms: 0 };
    const log = `.aioson/runtime/quality/checks/${runId}/${check.id}.json`;
    await writeJson(root, log, result, { exclusive: true });
    checks.push({ id: check.id, status: result.status, reason: result.reason, duration_ms: result.duration_ms, log });
  }
  const incomplete = !checks.length || checks.some(check => ['not_run', 'error'].includes(check.status));
  const status = incomplete ? 'error' : checks.some(check => check.status === 'fail') ? 'fail' : 'pass';
  const result = { schema_version: 1, run_id: runId, created_at: new Date().toISOString(), profile: plan.profile,
    config_sha256: createHash('sha256').update(JSON.stringify(plan)).digest('hex'), environment: { node: process.version, platform: process.platform, arch: process.arch },
    source: await sourceIdentity(root), status, checks };
  const output = options.output || `.aioson/runtime/quality/checks/${runId}/result.json`;
  await writeJson(root, output, result, { exclusive: true });
  return { ok: status === 'pass', exitCode: status === 'error' ? 2 : status === 'fail' ? 1 : 0, result, output };
}

module.exports = { qualityPlan, runChecks };
