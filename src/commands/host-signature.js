'use strict';

// aioson host:signature — probe and record whether a (host, model, effort)
// combination works on this machine, list recorded signatures, or read one
// signature's state without probing.
//
//   aioson host:signature [path] --host=<host> [--model=<id>] [--effort=<level>] [--unattended-probe=false] [--ttl=<hours>] [--timeout=<ms>] [--json]
//   aioson host:signature [path] --host=<host> [--model=<id>] [--effort=<level>] --status [--json]
//   aioson host:signature [path] --list [--json]
//
// The probe result is the command's verdict (`ok` = signature valid); `--list`
// and `--status` are read-only and always `ok: true` — their answer is in
// `state`, not in the exit code. The probe is two calls: read-only (login,
// model) and the unattended write a lane worker runs under — the second is
// what tells a host that asks for approval from one that edits on its own.

const {
  listSignatures,
  lookupSignature,
  normalizeEffort,
  normalizeModel,
  probeHostSignature,
  readSignatures
} = require('../lib/host-signature');
const { TOOL_CAPS, LANE_WORKER_MODE, listExecutionHosts } = require('../lib/tool-capabilities');
const { resolveTargetDir } = require('../lib/project-root');
const { applyProjectEnv, mergeProjectEnv } = require('../lib/project-env');

function describe(entry) {
  const effort = entry.reasoning_effort ? ` effort=${entry.reasoning_effort}` : '';
  return `${entry.host} ${entry.model}${effort}`;
}

function describeUnattended(entry) {
  const probes = entry && entry.unattended && typeof entry.unattended === 'object' ? Object.values(entry.unattended) : [];
  if (probes.length === 0) return 'unattended write: not probed';
  return `unattended write: ${probes.map((probe) => `${probe.state}${probe.reason ? ` (${probe.reason})` : ''}`).join(', ')}`;
}

async function runHostSignature({ args, options = {}, logger, t: _t, adapterRegistry, resolverOptions, env, home, now } = {}) {
  const projectDir = resolveTargetDir(args);
  applyProjectEnv(projectDir);
  const storeOptions = { env: mergeProjectEnv(projectDir, env || process.env), home };
  const clock = typeof now === 'function' ? now : () => Date.now();

  if (options.list === true) {
    const store = await readSignatures(storeOptions);
    const signatures = listSignatures(store, clock());
    const result = { ok: true, path: store.path, count: signatures.length, signatures };
    if (!options.json) {
      if (!signatures.length) logger.log(`No host signatures recorded (${store.path}).`);
      for (const entry of signatures) {
        logger.log(`${entry.state.padEnd(8)} ${describe(entry)} — ${entry.reason || 'ok'} (checked ${entry.checked_at || 'never'}, expires ${entry.expires_at || '-'})`);
      }
    }
    return result;
  }

  const host = String(options.host || '').trim().toLowerCase();
  if (!host) {
    return {
      ok: false,
      reason: 'host_required',
      message: `Use --host=<${listExecutionHosts().join('|')}> (known CLIs: ${Object.keys(TOOL_CAPS).sort().join(', ')})`,
      hosts: listExecutionHosts()
    };
  }
  const model = normalizeModel(options.model === undefined ? undefined : String(options.model));
  const effort = normalizeEffort(options.effort === undefined ? null : String(options.effort));

  if (options.status === true) {
    const lookup = await lookupSignature({ host, model, reasoning_effort: effort }, { ...storeOptions, now: clock() });
    const result = { ok: true, host, model, reasoning_effort: effort, state: lookup.state, signature: lookup.entry, path: lookup.path };
    if (!options.json) {
      logger.log(`${lookup.state}: ${describe({ host, model, reasoning_effort: effort })}${lookup.entry?.reason ? ` — ${lookup.entry.reason}` : ''}${lookup.entry?.expires_at ? ` (expires ${lookup.entry.expires_at})` : ''}${lookup.entry ? `; ${describeUnattended(lookup.entry)}` : ''}`);
    }
    return result;
  }

  const unattendedProbe = !(options['unattended-probe'] === false || String(options['unattended-probe']).toLowerCase() === 'false');

  const probed = await probeHostSignature({
    host,
    model,
    reasoning_effort: effort,
    ttlHours: options.ttl,
    timeout: options.timeout,
    unattendedProbe,
    adapterRegistry,
    resolverOptions,
    env: storeOptions.env,
    home,
    now: clock
  });
  const entry = probed.entry;
  const result = {
    ok: entry.status === 'valid',
    host: entry.host,
    model: entry.model,
    reasoning_effort: entry.reasoning_effort,
    state: entry.status === 'valid' ? 'valid' : 'invalid',
    reason: entry.reason || null,
    signature: entry,
    persisted: probed.persisted,
    path: probed.path || null
  };
  result.unattended = entry.unattended && typeof entry.unattended === 'object' ? entry.unattended[LANE_WORKER_MODE] || null : null;
  if (!options.json) {
    if (result.ok) {
      logger.log(`Signature valid: ${describe(entry)} (version ${entry.version || 'unknown'}, expires ${entry.expires_at}); ${describeUnattended(entry)}`);
      if (result.unattended && result.unattended.state === 'unverified') {
        logger.log(`  ⚠ the unattended write probe exited without writing its file — the host answered but did not edit; a lane worker on it is unproven. Re-run to re-check, or read the excerpt: ${result.unattended.output_excerpt || '(no output)'}`);
      }
    } else {
      const install = entry.reason === 'executable_not_found' && entry.install_command ? `; install: ${entry.install_command}` : '';
      const unattended = entry.reason === 'host_not_unattended' ? ` — ${entry.error}. A lane worker on this host would sit asking for permission until its budget elapses; fix the host configuration (or choose another host) and sign again` : '';
      logger.error(`Signature invalid: ${describe(entry)} — ${entry.reason}${install}${unattended}`);
    }
  }
  return result;
}

module.exports = { runHostSignature };
