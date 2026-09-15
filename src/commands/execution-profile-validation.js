'use strict';

// Batch-prove every enabled execution profile with the same real host harness
// used by `host:signature`. Probes run concurrently but persist in one merge,
// avoiding lost signatures when several models finish at the same time.

const {
  profileFallbackOrder,
  readExecutionRoles,
  signatureHint
} = require('../lib/execution-roles');
const {
  findSignature,
  probeHostSignature,
  readSignatures,
  signatureKey,
  signatureState,
  writeSignatures
} = require('../lib/host-signature');

const DEFAULT_VALIDATION_CONCURRENCY = 3;
const MAX_VALIDATION_CONCURRENCY = 10;

function routeKey(role) {
  return signatureKey(role.host, role.model, role.reasoning_effort || null);
}

function fallbackRole(profile, roleKey) {
  if (!profile?.roles) return null;
  if (profile.roles[roleKey]) return profile.roles[roleKey];
  return roleKey === 'qa' || roleKey.endsWith('_qa') ? profile.roles.qa || null : null;
}

function requestedProfiles(roles, option) {
  if (!roles.profiles) return [{ name: 'legacy', profile: { enabled: true, roles: roles.roles } }];
  const requested = option && option !== true
    ? new Set(String(option).split(',').map(value => value.trim()).filter(Boolean))
    : null;
  return Object.entries(roles.profiles)
    .filter(([name, profile]) => profile.enabled !== false && (!requested || requested.has(name)))
    .map(([name, profile]) => ({ name, profile }));
}

function collectRoutes(roles, profileOption) {
  const byRoute = new Map();
  for (const { name, profile } of requestedProfiles(roles, profileOption)) {
    for (const [roleName, role] of Object.entries(profile.roles || {})) {
      const key = routeKey(role);
      const existing = byRoute.get(key) || {
        key,
        host: role.host,
        model: role.model,
        reasoning_effort: role.reasoning_effort || null,
        bindings: []
      };
      existing.bindings.push({ profile: name, role: roleName });
      byRoute.set(key, existing);
    }
  }
  return [...byRoute.values()];
}

async function mapConcurrent(items, concurrency, task) {
  const results = new Array(items.length);
  let cursor = 0;
  const worker = async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await task(items[index], index);
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
  return results;
}

function routeView(route, entry, now) {
  const state = signatureState(entry, now);
  return {
    ...route,
    state,
    reason: entry?.reason || null,
    checked_at: entry?.checked_at || null,
    expires_at: entry?.expires_at || null,
    unattended: entry?.unattended?.yolo?.state || null,
    command: signatureHint(route)
  };
}

function routingReadiness(roles, routeStates) {
  const profileName = roles.profiles ? roles.active_profile : 'legacy';
  const active = roles.profiles ? roles.profiles[profileName] : { enabled: true, roles: roles.roles };
  const fallbacks = roles.profiles ? profileFallbackOrder(roles) : [];
  const checks = [];
  for (const [roleName, primary] of Object.entries(active?.roles || {})) {
    const candidates = [{ profile: profileName, role: primary }];
    for (const fallbackName of fallbacks) {
      const candidate = fallbackRole(roles.profiles[fallbackName], roleName);
      if (candidate) candidates.push({ profile: fallbackName, role: candidate });
    }
    const seen = new Set();
    const alternatives = candidates.flatMap(candidate => {
      const key = routeKey(candidate.role);
      if (seen.has(key)) return [];
      seen.add(key);
      const route = routeStates.get(key);
      return [{ profile: candidate.profile, host: candidate.role.host, model: candidate.role.model, reasoning_effort: candidate.role.reasoning_effort || null, state: route?.state || 'missing', reason: route?.reason || null }];
    });
    const effective = alternatives.find(candidate => candidate.state === 'valid') || null;
    checks.push({ role: roleName, ready: Boolean(effective), effective, alternatives });
  }
  return {
    ready: roles.enabled === true && active?.enabled !== false && checks.length > 0 && checks.every(check => check.ready),
    active_profile: profileName,
    fallback_order: fallbacks,
    roles: checks
  };
}

function concurrencyOption(value) {
  if (value === undefined || value === true) return DEFAULT_VALIDATION_CONCURRENCY;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 1 && parsed <= MAX_VALIDATION_CONCURRENCY ? parsed : null;
}

async function runExecutionProfileValidation({
  projectDir,
  options = {},
  logger,
  env = process.env,
  home,
  now = () => Date.now(),
  probe = probeHostSignature,
  adapterRegistry,
  resolverOptions
} = {}) {
  const clock = typeof now === 'function' ? now : () => Number(now);
  const rolesRead = await readExecutionRoles(projectDir);
  if (!rolesRead.present || !rolesRead.ok) {
    return { ok: false, reason: rolesRead.reason, path: rolesRead.path, errors: rolesRead.errors || [], exitCode: 1 };
  }
  const concurrency = concurrencyOption(options.concurrency);
  if (concurrency === null) {
    return { ok: false, reason: 'invalid_concurrency', message: `Use --concurrency=<1..${MAX_VALIDATION_CONCURRENCY}>`, exitCode: 1 };
  }
  const profiles = requestedProfiles(rolesRead.roles, options.profile);
  if (options.profile && options.profile !== true) {
    const known = new Set(profiles.map(item => item.name));
    const unknown = String(options.profile).split(',').map(value => value.trim()).filter(Boolean).filter(name => !known.has(name));
    if (unknown.length) return { ok: false, reason: 'profile_unknown_or_disabled', profiles: unknown, exitCode: 1 };
  }
  const routes = collectRoutes(rolesRead.roles, options.profile);
  if (!routes.length) return { ok: false, reason: 'no_enabled_profile_routes', path: rolesRead.path, exitCode: 1 };

  const storeOptions = { env, home };
  let store = await readSignatures(storeOptions);
  if (store.unreadable) return { ok: false, reason: 'signature_store_unreadable', path: store.path, message: store.error, exitCode: 1 };
  const statusOnly = options.status === true;
  const routesToProbe = statusOnly ? [] : routes.filter(route => options.refresh === true || signatureState(findSignature(store, route), clock()) !== 'valid');
  if (!statusOnly) {
    const probed = await mapConcurrent(routesToProbe, concurrency, async route => {
      try {
        return await probe({
          host: route.host,
          model: route.model,
          reasoning_effort: route.reasoning_effort,
          ttlHours: options.ttl,
          timeout: options.timeout,
          unattendedProbe: !(options['unattended-probe'] === false || String(options['unattended-probe']).toLowerCase() === 'false'),
          adapterRegistry,
          resolverOptions,
          env,
          home,
          now: clock,
          persist: false
        });
      } catch (error) {
        return { entry: { host: route.host, model: route.model, reasoning_effort: route.reasoning_effort, status: 'invalid', reason: 'probe_error', error: error.message, checked_at: new Date(clock()).toISOString(), expires_at: new Date(clock()).toISOString() } };
      }
    });
    store = await readSignatures(storeOptions);
    if (store.unreadable) return { ok: false, reason: 'signature_store_unreadable', path: store.path, message: store.error, exitCode: 1 };
    for (const result of probed) {
      const entry = result?.entry;
      if (entry?.host && entry?.model) store.signatures[signatureKey(entry.host, entry.model, entry.reasoning_effort)] = entry;
    }
    await writeSignatures(store, storeOptions);
  }

  const latest = await readSignatures(storeOptions);
  const at = clock();
  const routeResults = routes.map(route => routeView(route, findSignature(latest, route), at));
  const allRouteResults = collectRoutes(rolesRead.roles).map(route => routeView(route, findSignature(latest, route), at));
  const routeStates = new Map(allRouteResults.map(route => [route.key, route]));
  const routing = routingReadiness(rolesRead.roles, routeStates);
  const invalid = routeResults.filter(route => route.state !== 'valid');
  const result = {
    ok: routing.ready && invalid.length === 0,
    reason: !routing.ready ? 'routing_unavailable' : invalid.length ? 'profile_route_invalid' : null,
    mode: statusOnly ? 'status' : 'probe',
    path: rolesRead.path,
    signatures_path: latest.path,
    concurrency: statusOnly ? 0 : concurrency,
    probed: routesToProbe.length,
    cached: routes.length - routesToProbe.length,
    profiles: profiles.map(item => item.name),
    routes: routeResults,
    summary: { total: routeResults.length, valid: routeResults.length - invalid.length, invalid: invalid.length },
    routing,
    exitCode: routing.ready && invalid.length === 0 ? 0 : 1
  };
  if (!options.json) {
    logger.log(`${statusOnly ? 'Profile signature status' : 'Profile harness validation'}: ${result.summary.valid}/${result.summary.total} route(s) valid; ${result.probed} probed, ${result.cached} cached; active routing ${routing.ready ? 'ready' : 'unavailable'}.`);
    for (const route of routeResults) logger.log(`  ${route.state.padEnd(8)} ${route.host}/${route.model}${route.reasoning_effort ? `/${route.reasoning_effort}` : ''} — ${route.bindings.map(item => `${item.profile}.${item.role}`).join(', ')}${route.reason ? ` (${route.reason})` : ''}`);
    for (const check of routing.roles.filter(item => !item.ready)) logger.error(`  ✗ ${check.role}: no valid route in ${[routing.active_profile, ...routing.fallback_order].join(' -> ')}`);
  }
  return result;
}

module.exports = {
  DEFAULT_VALIDATION_CONCURRENCY,
  MAX_VALIDATION_CONCURRENCY,
  collectRoutes,
  concurrencyOption,
  routingReadiness,
  runExecutionProfileValidation
};
