'use strict';

/**
 * `.aioson/config/execution-roles.json` — the unlock file of the orchestrated
 * execution path (compiled lanes running as parallel external processes with a
 * host/model per role).
 *
 * The framework SEEDS it and never UNLOCKS it: `seedExecutionRoles` (the
 * planner, `aioson execution:seed`) writes one `{lane}_dev` role per lane plus
 * `qa`, each on an execution host installed on this machine at the harness
 * default model, always `enabled: false`, and never touches an existing file.
 * Choosing a model, enabling the file and signing the hosts stay acts of a
 * person (or of the supervising desktop client, which validated each pair with
 * `aioson host:signature`). It never ships in `template/`. Absent, disabled or
 * invalid → the orchestrated option does not exist and the single-DEV route is
 * untouched; the offer then names the unlock step instead of staying silent.
 *
 * Roles are snake_case keys: `{lane}_dev` (required per lane), `{lane}_qa`
 * (optional override of the shared `qa` reviewer), `qa` (lane-level reviewer,
 * required) and `integration_dev` (optional model for the integration pass).
 *
 * The optional `execution` block is the client seam: `spawner` names the
 * command the engine hands each unit envelope to (the node becomes a process
 * — a terminal — the supervising client owns; the engine keeps waiting for the
 * bound report). Legacy `unit_timeout_ms` is accepted but ignored: AIOSON no
 * longer owns a wall-clock deadline for an orchestrated worker.
 * The environment variable `AIOSON_EXECUTION_SPAWNER` wins over the file: it
 * is the hint of the client that owns the session's PTY.
 */

const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { REASONING_EFFORTS, MAX_MODEL_NAME_LENGTH, MAX_DEVELOPMENT_LANES, effortsForHost } = require('../agent-execution/schema');
const { listExecutionHosts, getExecutionCapabilities } = require('./tool-capabilities');
const { readSignatures, findSignature, signatureState, locateOnPath, DEFAULT_MODEL } = require('./host-signature');

const EXECUTION_ROLES_RELATIVE_PATH = '.aioson/config/execution-roles.json';
// The owner's "run with these defaults" answer lives beside the roles file,
// never inside it: the desktop client's reader refuses unknown root keys.
const EXECUTION_ROLES_CONFIRMATION_RELATIVE_PATH = '.aioson/config/execution-roles.confirmed.json';
const SEED_SOURCE_PREFIX = 'aioson-planner';
const LANE_ID = /^[a-z][a-z0-9-]*$/;
const EXECUTION_ROLES_VERSION = 1;
const ROLE_KEY = /^[a-z][a-z0-9_]*$/;
const ROOT_KEYS = ['version', 'source', 'enabled', 'roles', 'profiles', 'active_profile', 'parallel', 'on_unavailable', 'execution'];
const EXECUTION_KEYS = ['spawner', 'unit_timeout_ms', 'require_independent_qa'];
const SPAWNER_KEYS = ['command', 'args'];
const MAX_SPAWNER_ARGS = 16;
const MAX_SPAWNER_TOKEN_LENGTH = 200;
// Kept as exports for consumers compiled against v1. Values in the roles file
// are legacy input only and never arm an orchestrated worker timer.
const MIN_UNIT_TIMEOUT_MS = 60000;
const MAX_UNIT_TIMEOUT_MS = 4 * 60 * 60 * 1000;
const UNLIMITED_UNIT_TIMEOUT_MS = 0;
const DEFAULT_SPAWNER_UNIT_TIMEOUT_MS = 0;
const SPAWNER_ENV = 'AIOSON_EXECUTION_SPAWNER';
const ROLE_KEYS = ['host', 'model', 'reasoning_effort'];
const PROFILE_KEYS = ['enabled', 'fallback_use', 'fallback_profiles', 'roles'];
const MAX_FALLBACK_PROFILES = 8;
const ON_UNAVAILABLE = ['ask', 'fallback', 'pause'];
const DEFAULT_ON_UNAVAILABLE = 'ask';
// The scheduler limits unit pipelines, not logical lane names. A large plan
// can therefore run several disjoint backend/frontend units at once. Ten is
// the product default and the hard local ceiling; real dependency and file
// conflicts still reduce the ready pool safely.
const MAX_CONCURRENT_UNIT_PIPELINES = 10;
const DEFAULT_MAX_CONCURRENT_LANES = MAX_CONCURRENT_UNIT_PIPELINES;
const SECRET_KEY = /token|secret|password|authorization|api[_-]?key/i;

function isPlainObject(value) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function sha256(text) {
  return crypto.createHash('sha256').update(String(text)).digest('hex');
}

function executionRolesPath(projectDir) {
  return path.join(projectDir, ...EXECUTION_ROLES_RELATIVE_PATH.split('/'));
}

/** `backend` → `backend_dev`, `mobile-app` → `mobile_app_qa`. */
function laneRoleKey(lane, kind) {
  return `${String(lane || '').toLowerCase().replace(/-/g, '_')}_${kind}`;
}

function validateExecutionRoles(value, { hosts = listExecutionHosts() } = {}) {
  const errors = [];
  const add = (errorPath, message) => errors.push({ path: errorPath, message });
  if (!isPlainObject(value)) return { ok: false, errors: [{ path: '$', message: 'must be an object' }] };

  for (const key of Object.keys(value)) {
    if (!ROOT_KEYS.includes(key)) {
      add(`$.${key}`, SECRET_KEY.test(key) ? 'secret fields are forbidden; use environment configuration' : 'unknown field');
    }
  }
  if (value.version !== EXECUTION_ROLES_VERSION) add('$.version', `must equal ${EXECUTION_ROLES_VERSION}`);
  if (value.source !== undefined && (typeof value.source !== 'string' || !value.source.trim())) {
    add('$.source', 'must be a non-empty string');
  }
  if (typeof value.enabled !== 'boolean') add('$.enabled', 'must be boolean');

  const validateRoleMap = (roleMap, basePath) => {
    if (!isPlainObject(roleMap)) {
      add(basePath, 'must be an object');
      return;
    }
    if (Object.keys(roleMap).length === 0) add(basePath, 'must declare at least one role');
    for (const [key, role] of Object.entries(roleMap)) {
      const base = `${basePath}.${key}`;
      if (!ROLE_KEY.test(key)) add(base, 'role key must be snake_case');
      if (!isPlainObject(role)) {
        add(base, 'must be {host, model, reasoning_effort?}');
        continue;
      }
      for (const field of Object.keys(role)) {
        if (!ROLE_KEYS.includes(field)) {
          add(`${base}.${field}`, SECRET_KEY.test(field) ? 'secret fields are forbidden; use environment configuration' : 'unknown field');
        }
      }
      const caps = hosts.includes(role.host) ? getExecutionCapabilities(role.host) : null;
      if (!caps) add(`${base}.host`, `must be one of ${hosts.join(', ')}`);
      if (typeof role.model !== 'string' || !role.model.trim()) {
        add(`${base}.model`, 'must be a non-empty model id');
      } else if (role.model.length > MAX_MODEL_NAME_LENGTH) {
        add(`${base}.model`, `must be at most ${MAX_MODEL_NAME_LENGTH} characters`);
      }
      if (role.reasoning_effort !== undefined && role.reasoning_effort !== null) {
        if (!REASONING_EFFORTS.includes(role.reasoning_effort)) {
          add(`${base}.reasoning_effort`, `must be one of ${REASONING_EFFORTS.join(', ')} or null`);
        } else if (caps && !caps.reasoning_effort) {
          add(`${base}.reasoning_effort`, `effort_unsupported_by_host: ${role.host} does not accept a reasoning effort`);
        } else if (!effortsForHost(role.host).includes(role.reasoning_effort)) {
          add(`${base}.reasoning_effort`, `effort_unsupported_by_host: ${role.host} accepts ${effortsForHost(role.host).join(', ')}`);
        }
      }
    }
  };
  const hasLegacyRoles = value.roles !== undefined;
  const hasProfiles = value.profiles !== undefined;
  if (hasLegacyRoles === hasProfiles) {
    add('$', 'declare exactly one of roles (legacy single profile) or profiles');
  }
  if (hasLegacyRoles) validateRoleMap(value.roles, '$.roles');
  if (hasProfiles) {
    if (!isPlainObject(value.profiles) || Object.keys(value.profiles).length === 0) {
      add('$.profiles', 'must be a non-empty object');
    } else {
      for (const [profileName, profile] of Object.entries(value.profiles)) {
        const base = `$.profiles.${profileName}`;
        if (!ROLE_KEY.test(profileName)) add(base, 'profile key must be snake_case');
        if (!isPlainObject(profile)) { add(base, 'must be {enabled?, roles}'); continue; }
        for (const key of Object.keys(profile)) if (!PROFILE_KEYS.includes(key)) add(`${base}.${key}`, 'unknown field');
        if (profile.enabled !== undefined && typeof profile.enabled !== 'boolean') add(`${base}.enabled`, 'must be boolean');
        if (profile.fallback_use !== undefined && typeof profile.fallback_use !== 'boolean') add(`${base}.fallback_use`, 'must be boolean');
        if (profile.fallback_profiles !== undefined && (!Array.isArray(profile.fallback_profiles) || profile.fallback_profiles.length > MAX_FALLBACK_PROFILES || profile.fallback_profiles.some(name => typeof name !== 'string' || !ROLE_KEY.test(name)))) {
          add(`${base}.fallback_profiles`, `must be an array of at most ${MAX_FALLBACK_PROFILES} snake_case profile names`);
        }
        if (Array.isArray(profile.fallback_profiles)) {
          if (new Set(profile.fallback_profiles).size !== profile.fallback_profiles.length) add(`${base}.fallback_profiles`, 'must not contain duplicates');
          if (profile.fallback_profiles.includes(profileName)) add(`${base}.fallback_profiles`, 'must not reference its own profile');
        }
        validateRoleMap(profile.roles, `${base}.roles`);
      }
      for (const [profileName, profile] of Object.entries(value.profiles)) {
        if (!isPlainObject(profile) || !Array.isArray(profile.fallback_profiles)) continue;
        for (const target of profile.fallback_profiles) {
          if (!Object.hasOwn(value.profiles, target)) add(`$.profiles.${profileName}.fallback_profiles`, `references missing profile ${target}`);
          else if (value.profiles[target]?.enabled === false) add(`$.profiles.${profileName}.fallback_profiles`, `references disabled profile ${target}`);
        }
      }
      // Only enabled fallback edges participate in routing. Reject an
      // indirect cycle here so a chain can be traversed transitively without
      // ever returning to an already failed provider profile.
      const visiting = new Set();
      const visited = new Set();
      const reportedCycles = new Set();
      const visit = (profileName, trail = []) => {
        if (visited.has(profileName)) return;
        if (visiting.has(profileName)) return;
        const profile = value.profiles[profileName];
        if (!isPlainObject(profile) || profile.enabled === false || profile.fallback_use !== true) {
          visited.add(profileName);
          return;
        }
        visiting.add(profileName);
        for (const target of Array.isArray(profile.fallback_profiles) ? profile.fallback_profiles : []) {
          if (!Object.hasOwn(value.profiles, target) || value.profiles[target]?.enabled === false) continue;
          if (visiting.has(target)) {
            const start = trail.indexOf(target);
            const cycle = [...(start >= 0 ? trail.slice(start) : trail), profileName, target];
            const key = [...new Set(cycle)].sort().join('|');
            if (!reportedCycles.has(key)) {
              reportedCycles.add(key);
              add(`$.profiles.${profileName}.fallback_profiles`, `fallback chain contains a cycle: ${cycle.join(' -> ')}`);
            }
            continue;
          }
          visit(target, [...trail, profileName]);
        }
        visiting.delete(profileName);
        visited.add(profileName);
      };
      for (const profileName of Object.keys(value.profiles)) visit(profileName);
    }
    if (typeof value.active_profile !== 'string' || !value.active_profile.trim()) {
      add('$.active_profile', 'must name an enabled profile');
    } else if (isPlainObject(value.profiles) && !Object.hasOwn(value.profiles, value.active_profile)) {
      add('$.active_profile', 'must reference a declared profile');
    } else if (value.profiles?.[value.active_profile]?.enabled === false) {
      add('$.active_profile', 'must reference an enabled profile');
    }
  } else if (value.active_profile !== undefined) {
    add('$.active_profile', 'requires profiles');
  }

  if (value.execution !== undefined) {
    if (!isPlainObject(value.execution)) {
      add('$.execution', 'must be an object');
    } else {
      for (const key of Object.keys(value.execution)) {
        if (!EXECUTION_KEYS.includes(key)) add(`$.execution.${key}`, SECRET_KEY.test(key) ? 'secret fields are forbidden; use environment configuration' : 'unknown field');
      }
      const spawner = value.execution.spawner;
      if (spawner !== undefined && spawner !== null) {
        if (!isPlainObject(spawner)) {
          add('$.execution.spawner', 'must be {command, args?}');
        } else {
          for (const key of Object.keys(spawner)) {
            if (!SPAWNER_KEYS.includes(key)) add(`$.execution.spawner.${key}`, SECRET_KEY.test(key) ? 'secret fields are forbidden; use environment configuration' : 'unknown field');
          }
          if (typeof spawner.command !== 'string' || !spawner.command.trim() || spawner.command.length > MAX_SPAWNER_TOKEN_LENGTH) {
            add('$.execution.spawner.command', `must be a non-empty command of at most ${MAX_SPAWNER_TOKEN_LENGTH} characters`);
          }
          if (spawner.args !== undefined && (!Array.isArray(spawner.args) || spawner.args.length > MAX_SPAWNER_ARGS || spawner.args.some((arg) => typeof arg !== 'string' || arg.length > MAX_SPAWNER_TOKEN_LENGTH))) {
            add('$.execution.spawner.args', `must be an array of at most ${MAX_SPAWNER_ARGS} strings`);
          }
        }
      }
      // unit_timeout_ms is accepted for backward compatibility and ignored.
      const independent = value.execution.require_independent_qa;
      if (independent !== undefined && independent !== null && typeof independent !== 'boolean') {
        add('$.execution.require_independent_qa', 'must be a boolean');
      }
    }
  }
  if (value.parallel !== undefined) {
    if (!isPlainObject(value.parallel)) {
      add('$.parallel', 'must be an object');
    } else {
      for (const key of Object.keys(value.parallel)) {
        if (key !== 'max_concurrent_lanes') add(`$.parallel.${key}`, 'unknown field');
      }
      const max = value.parallel.max_concurrent_lanes;
      if (max !== undefined && (!Number.isInteger(max) || max < 1 || max > MAX_CONCURRENT_UNIT_PIPELINES)) {
        add('$.parallel.max_concurrent_lanes', `must be an integer between 1 and ${MAX_CONCURRENT_UNIT_PIPELINES}`);
      }
    }
  }
  if (value.on_unavailable !== undefined && !ON_UNAVAILABLE.includes(value.on_unavailable)) {
    add('$.on_unavailable', `must be one of ${ON_UNAVAILABLE.join(', ')}`);
  }
  return { ok: errors.length === 0, errors };
}

function normalizeExecutionRoles(value) {
  const activeProfile = value.profiles ? value.active_profile.trim() : null;
  const normalizeRoleMap = roleMap => Object.fromEntries(Object.entries(roleMap).map(([key, role]) => [key, {
      host: role.host,
      model: role.model.trim(),
      reasoning_effort: role.reasoning_effort || null
    }]));
  const profiles = value.profiles ? Object.fromEntries(Object.entries(value.profiles).map(([name, profile]) => [name, {
    enabled: profile.enabled !== false,
    fallback_use: profile.fallback_use === true,
    fallback_profiles: profile.fallback_use === true ? [...(profile.fallback_profiles || [])] : [],
    roles: normalizeRoleMap(profile.roles)
  }])) : null;
  const roles = activeProfile ? profiles[activeProfile].roles : normalizeRoleMap(value.roles);
  return {
    version: value.version,
    source: value.source || null,
    enabled: value.enabled,
    active_profile: activeProfile,
    profiles,
    roles,
    parallel: {
      max_concurrent_lanes: value.parallel?.max_concurrent_lanes || DEFAULT_MAX_CONCURRENT_LANES
    },
    on_unavailable: value.on_unavailable || DEFAULT_ON_UNAVAILABLE,
    execution: normalizeExecutionBlock(value.execution)
  };
}

// `require_independent_qa`: the lane reviewer must not be the implementer's
// host/model — the judge differs from the producer. Off by default: the
// compile warns (`self_review_same_model`); on, the same condition refuses the
// plan. A client that proves two hosts on the machine turns it on.
function normalizeExecutionBlock(value) {
  if (!isPlainObject(value)) return { spawner: null, require_independent_qa: false };
  const spawner = isPlainObject(value.spawner) && typeof value.spawner.command === 'string' && value.spawner.command.trim()
    ? { command: value.spawner.command.trim(), args: Array.isArray(value.spawner.args) ? value.spawner.args.map(String) : [] }
    : null;
  return {
    spawner,
    require_independent_qa: value.require_independent_qa === true
  };
}

/** `"C:\\Program Files\\cockpit\\cockpitctl.exe" unit spawn` → {command, args}; double quotes group a token. */
function parseSpawnerCommand(text) {
  const tokens = [];
  let current = '';
  let quoted = false;
  let started = false;
  for (const char of String(text || '')) {
    if (char === '"') {
      quoted = !quoted;
      started = true;
      continue;
    }
    if (!quoted && /\s/.test(char)) {
      if (started) tokens.push(current);
      current = '';
      started = false;
      continue;
    }
    current += char;
    started = true;
  }
  if (started) tokens.push(current);
  if (tokens.length === 0 || !tokens[0]) return null;
  return { command: tokens[0], args: tokens.slice(1) };
}

/**
 * The spawner in force: the environment (the client that owns the session's
 * PTY) wins over the roles file (the project default). `null` = the engine
 * spawns the host processes itself.
 */
function resolveSpawner({ roles = null, env = process.env } = {}) {
  const fromEnv = parseSpawnerCommand(env[SPAWNER_ENV]);
  if (fromEnv) return { ...fromEnv, source: 'env' };
  const fromRoles = roles?.execution?.spawner || null;
  if (fromRoles) return { command: fromRoles.command, args: [...(fromRoles.args || [])], source: 'roles' };
  return null;
}

/**
 * Read + validate the unlock file. Never throws.
 * `reason`: roles_file_missing | roles_unreadable | roles_invalid | roles_disabled | null
 */
async function readExecutionRoles(projectDir, { hosts } = {}) {
  const file = executionRolesPath(projectDir);
  const relative = EXECUTION_ROLES_RELATIVE_PATH;
  let raw;
  try {
    raw = await fs.readFile(file, 'utf8');
  } catch (error) {
    // ENOTDIR is how POSIX says "a parent is a file" (Windows says ENOENT):
    // the roles file cannot exist there, so it is absent, never "present but
    // unreadable" — which made seed answer already_present over a blocked path.
    if (error.code === 'ENOENT' || error.code === 'ENOTDIR') {
      return { present: false, ok: false, enabled: false, path: relative, reason: 'roles_file_missing', errors: [], roles: null, digest: null };
    }
    return { present: true, ok: false, enabled: false, path: relative, reason: 'roles_unreadable', errors: [{ path: '$', message: error.message }], roles: null, digest: null };
  }
  const fileDigest = sha256(raw);
  let value;
  try {
    value = JSON.parse(raw);
  } catch (error) {
    return { present: true, ok: false, enabled: false, path: relative, reason: 'roles_invalid', errors: [{ path: '$', message: `invalid JSON: ${error.message}` }], roles: null, digest: fileDigest, file_digest: fileDigest };
  }
  const validation = validateExecutionRoles(value, { hosts });
  if (!validation.ok) {
    return { present: true, ok: false, enabled: false, path: relative, reason: 'roles_invalid', errors: validation.errors, roles: null, digest: fileDigest, file_digest: fileDigest };
  }
  const roles = normalizeExecutionRoles(value);
  // `digest` is the BINDING digest — what the compiled plan is bound to — and
  // covers only what shapes the units (roles, parallelism, the independent-
  // review rule). The process budget and the spawner are read fresh by every
  // run and stay out of it; legacy `unit_timeout_ms` is ignored. `file_digest`
  // is the raw file.
  const digest = rolesBindingDigest(roles);
  if (!roles.enabled) {
    return { present: true, ok: true, enabled: false, path: relative, reason: 'roles_disabled', errors: [], roles, digest, file_digest: fileDigest };
  }
  return { present: true, ok: true, enabled: true, path: relative, reason: null, errors: [], roles, digest, file_digest: fileDigest };
}

/**
 * Schema marker retained in compiled plans. All execution-role choices are
 * runtime configuration: the engine reloads profile/model/fallback policy,
 * independent-QA policy and worker-pool capacity while a run is active.
 */
function rolesBindingDigest(roles) {
  const canonical = { version: roles.version };
  return sha256(JSON.stringify(canonical));
}

/** `{lane}_dev` is required per lane; `{lane}_qa` overrides the shared `qa`. */
function resolveLaneRoles(roles, lane) {
  const devKey = laneRoleKey(lane, 'dev');
  const qaKey = laneRoleKey(lane, 'qa');
  const dev = roles.roles[devKey] ? { role: devKey, ...roles.roles[devKey] } : null;
  const qa = roles.roles[qaKey]
    ? { role: qaKey, inherited: false, ...roles.roles[qaKey] }
    : (roles.roles.qa ? { role: 'qa', inherited: true, ...roles.roles.qa } : null);
  return { dev, qa };
}

/**
 * Ordered, transitive profile chain. The declaration order is preserved and
 * each route is visited once. Validation rejects cycles, while the visited set
 * also makes this safe for callers holding an older unvalidated document.
 */
function profileFallbackOrder(roles, startProfile = roles?.active_profile) {
  if (!roles?.profiles || !startProfile || !roles.profiles[startProfile]?.enabled) return [];
  const ordered = [];
  const visited = new Set([startProfile]);
  const walk = (profileName) => {
    const profile = roles.profiles[profileName];
    if (!profile?.enabled || profile.fallback_use !== true) return;
    for (const target of profile.fallback_profiles || []) {
      if (visited.has(target)) continue;
      visited.add(target);
      if (!roles.profiles[target]?.enabled) continue;
      ordered.push(target);
      walk(target);
    }
  };
  walk(startProfile);
  return ordered;
}

/** Ordered, explicitly enabled profile alternatives for the same lane role. */
function resolveProfileFallbacks(roles, lane, kind) {
  if (!roles?.profiles || !roles.active_profile) return [];
  const active = roles.profiles[roles.active_profile];
  if (!active?.fallback_use) return [];
  const key = kind === 'dev' ? laneRoleKey(lane, 'dev') : laneRoleKey(lane, 'qa');
  const seenRoutes = new Set();
  return profileFallbackOrder(roles).flatMap(profileName => {
    const profile = roles.profiles[profileName];
    if (!profile?.enabled) return [];
    const role = kind === 'qa' ? (profile.roles[key] || profile.roles.qa) : profile.roles[key];
    if (!role) return [];
    const routeKey = `${role.host}\u0000${role.model}\u0000${role.reasoning_effort || ''}`;
    if (seenRoutes.has(routeKey)) return [];
    seenRoutes.add(routeKey);
    return [{ profile: profileName, role: role === profile.roles.qa ? 'qa' : key, ...role }];
  });
}

function signatureHint(role) {
  return `aioson host:signature . --host=${role.host} --model=${role.model}${role.reasoning_effort ? ` --effort=${role.reasoning_effort}` : ''}`;
}

/** Signature state of every declared role on this machine. */
async function checkRoleSignatures(roles, { env = process.env, now = Date.now() } = {}) {
  const store = await readSignatures({ env });
  const report = {};
  const missing = [];
  for (const [key, role] of Object.entries(roles.roles)) {
    const entry = findSignature(store, { host: role.host, model: role.model, reasoning_effort: role.reasoning_effort });
    const state = signatureState(entry, now);
    report[key] = {
      host: role.host,
      model: role.model,
      reasoning_effort: role.reasoning_effort,
      state,
      checked_at: entry?.checked_at || null,
      expires_at: entry?.expires_at || null,
      reason: entry?.reason || null,
      hint: state === 'valid' ? null : signatureHint(role)
    };
    if (state !== 'valid') missing.push({ role: key, ...report[key] });
  }
  return { path: store.path, roles: report, missing, ok: missing.length === 0 };
}

/** Registered execution hosts whose binary is on this machine's PATH, in registry order. */
async function installedExecutionHosts({ hosts = listExecutionHosts(), env = process.env, locate = locateOnPath } = {}) {
  const installed = [];
  for (const host of hosts) {
    const caps = getExecutionCapabilities(host);
    if (!caps || !caps.binary) continue;
    if (await locate(caps.binary, env)) installed.push(host);
  }
  return installed;
}

/**
 * The seeded document: every lane's implementer on the first installed host,
 * the reviewer on the second when there is one (the judge differs from the
 * producer), every model the harness default, and disabled.
 */
function seedRolesDocument({ lanes, feature, installed }) {
  const devHost = installed[0];
  const qaHost = installed.length > 1 ? installed[1] : installed[0];
  const roles = {};
  for (const lane of lanes) roles[laneRoleKey(lane, 'dev')] = { host: devHost, model: DEFAULT_MODEL, reasoning_effort: null };
  // The final integration supervisor is a DEV (it may repair cross-unit
  // failures); the shared QA remains its independent reviewer when a second
  // host is available.
  roles.integration_dev = { host: devHost, model: DEFAULT_MODEL, reasoning_effort: null };
  roles.qa = { host: qaHost, model: DEFAULT_MODEL, reasoning_effort: null };
  return {
    version: EXECUTION_ROLES_VERSION,
    source: feature ? `${SEED_SOURCE_PREFIX} (feature: ${feature})` : SEED_SOURCE_PREFIX,
    enabled: false,
    roles,
    parallel: { max_concurrent_lanes: DEFAULT_MAX_CONCURRENT_LANES },
    on_unavailable: DEFAULT_ON_UNAVAILABLE
  };
}

/**
 * Write the roles file for these lanes — disabled, on installed hosts, at the
 * harness default model — and never over an existing one. Never throws.
 * `outcome`: seeded | already_present | no_execution_host | write_failed |
 *            lanes_required | lane_invalid | too_many_lanes
 */
async function seedExecutionRoles(projectDir, { lanes = [], feature = null, hosts, env = process.env, locate } = {}) {
  const relative = EXECUTION_ROLES_RELATIVE_PATH;
  const laneIds = [...new Set(lanes.map((lane) => String(lane || '').trim().toLowerCase()).filter(Boolean))];
  if (laneIds.length === 0) {
    return { ok: false, outcome: 'lanes_required', path: relative, written: false, message: 'declare at least one lane (--lanes=backend,frontend, or the plan\'s `## Development execution lanes` table)' };
  }
  const invalid = laneIds.filter((lane) => !LANE_ID.test(lane));
  if (invalid.length > 0) {
    return { ok: false, outcome: 'lane_invalid', path: relative, written: false, lanes: invalid, message: `lane ids must be kebab-case: ${invalid.join(', ')}` };
  }
  if (laneIds.length > MAX_DEVELOPMENT_LANES) {
    return { ok: false, outcome: 'too_many_lanes', path: relative, written: false, lanes: laneIds, message: `${laneIds.length} lanes declared; at most ${MAX_DEVELOPMENT_LANES}` };
  }
  const registered = hosts || listExecutionHosts();
  const existing = await readExecutionRoles(projectDir, { hosts: registered });
  const alreadyPresent = () => {
    const declared = existing.roles ? Object.keys(existing.roles.roles) : null;
    const wanted = [...laneIds.map((lane) => laneRoleKey(lane, 'dev')), 'integration_dev', 'qa'];
    return {
      ok: true,
      outcome: 'already_present',
      path: relative,
      written: false,
      valid: existing.ok,
      enabled: existing.enabled,
      reason: existing.reason,
      errors: existing.errors,
      missing_roles: declared ? wanted.filter((key) => !declared.includes(key)) : null,
      message: `${relative} already exists — nothing was changed`
    };
  };
  if (existing.present) return alreadyPresent();
  const installed = await installedExecutionHosts({ hosts: registered, env, locate });
  if (installed.length === 0) {
    return {
      ok: false,
      outcome: 'no_execution_host',
      path: relative,
      written: false,
      hosts: { registered, installed: [] },
      install: registered.map((host) => ({ host, command: getExecutionCapabilities(host)?.install_command || null })),
      message: `no execution host CLI is installed on this machine (registered: ${registered.join(', ')}) — install one, then seed again`
    };
  }
  const document = seedRolesDocument({ lanes: laneIds, feature, installed });
  const validation = validateExecutionRoles(document, { hosts: registered });
  if (!validation.ok) {
    return { ok: false, outcome: 'seed_invalid', path: relative, written: false, errors: validation.errors, message: 'the seeded document does not validate — nothing was written' };
  }
  const file = executionRolesPath(projectDir);
  const writeFailed = (error) => ({ ok: false, outcome: 'write_failed', path: relative, written: false, error: error.message, message: `${relative} could not be written: ${error.message}` });
  try {
    await fs.mkdir(path.dirname(file), { recursive: true });
  } catch (error) {
    return writeFailed(error);
  }
  try {
    // `wx`: create only — a file that appeared between the read and the write
    // is the owner's and stays untouched.
    await fs.writeFile(file, `${JSON.stringify(document, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
  } catch (error) {
    if (error.code === 'EEXIST') return alreadyPresent();
    return writeFailed(error);
  }
  return {
    ok: true,
    outcome: 'seeded',
    path: relative,
    written: true,
    enabled: false,
    source: document.source,
    roles: document.roles,
    hosts: { registered, installed },
    independent_review: installed.length > 1,
    message: `${relative} seeded (disabled): ${Object.keys(document.roles).join(', ')} — choose a model per role, enable it, sign the hosts`
  };
}

/** Digest of the role map alone (sorted, host/model/effort) — what a confirmation binds to. */
function rolesDigest(roles) {
  const canonical = Object.keys(roles.roles).sort().map((key) => [key, roles.roles[key].host, roles.roles[key].model, roles.roles[key].reasoning_effort || null]);
  return sha256(JSON.stringify(canonical));
}

/** Roles still on the harness default model — the ones an owner never chose. */
function defaultModelRoles(roles) {
  return Object.entries(roles.roles)
    .filter(([, role]) => role.model === DEFAULT_MODEL)
    .map(([key, role]) => ({ role: key, host: role.host, model: role.model }));
}

function confirmationPath(projectDir) {
  return path.join(projectDir, ...EXECUTION_ROLES_CONFIRMATION_RELATIVE_PATH.split('/'));
}

async function readConfirmation(projectDir) {
  try {
    const parsed = JSON.parse(await fs.readFile(confirmationPath(projectDir), 'utf8'));
    return { present: true, digest: typeof parsed?.digest === 'string' ? parsed.digest : null, at: parsed?.at || null };
  } catch {
    return { present: false, digest: null, at: null };
  }
}

/**
 * Record the owner's "run with the default models" answer against the current
 * role map. A later change to any role changes the digest and reopens the
 * question — only for the roles still on the default.
 */
async function confirmDefaultModels(projectDir, { now = Date.now(), hosts } = {}) {
  const read = await readExecutionRoles(projectDir, { hosts });
  if (!read.present || !read.ok) return { ok: false, reason: read.reason, path: EXECUTION_ROLES_CONFIRMATION_RELATIVE_PATH, errors: read.errors };
  const pending = defaultModelRoles(read.roles);
  const digest = rolesDigest(read.roles);
  const record = { version: 1, digest, at: new Date(now).toISOString(), roles: pending.map((item) => item.role) };
  try {
    await fs.mkdir(path.dirname(confirmationPath(projectDir)), { recursive: true });
    await fs.writeFile(confirmationPath(projectDir), `${JSON.stringify(record, null, 2)}\n`, 'utf8');
  } catch (error) {
    return { ok: false, reason: 'write_failed', path: EXECUTION_ROLES_CONFIRMATION_RELATIVE_PATH, error: error.message };
  }
  return { ok: true, path: EXECUTION_ROLES_CONFIRMATION_RELATIVE_PATH, digest, confirmed: pending };
}

/**
 * The unlock step the offer's answer implies — one command or edit, named,
 * so an unavailable offer is never a dead end.
 */
function describeOnboarding(offer, { feature = null, lanes = [], installed = null } = {}) {
  const slug = feature || '<slug>';
  const laneList = lanes.length > 0 ? lanes.join(',') : '<lane-a,lane-b>';
  const rolesPath = offer.roles_path || EXECUTION_ROLES_RELATIVE_PATH;
  const hosts = Array.isArray(installed) ? { installed } : undefined;
  switch (offer.reason) {
    case 'roles_file_missing':
      return {
        state: 'not_unlocked',
        next: `aioson execution:seed . --feature=${slug} --lanes=${laneList}`,
        message: `${rolesPath} does not exist — seed it (one dev role per lane plus qa, disabled, on an installed host), then choose the models and enable it`,
        ...(hosts ? { hosts } : {})
      };
    case 'roles_unreadable':
    case 'roles_invalid':
      return {
        state: 'invalid',
        next: `fix ${rolesPath}: ${(offer.errors || []).map((error) => `${error.path} ${error.message}`).join('; ') || 'see errors'}`,
        message: `${rolesPath} is not readable as a roles file`
      };
    case 'roles_disabled':
      return {
        state: 'disabled',
        next: `set "enabled": true in ${rolesPath} (the desktop client's execution panel does the same)`,
        message: `${rolesPath} exists but is disabled — enabling it is the owner's act`
      };
    case 'defaults_unconfirmed':
      return {
        state: 'pending_confirmation',
        next: 'aioson execution:offer . --confirm-defaults',
        message: `role(s) still on the harness default model: ${(offer.pending_confirmation || []).map((item) => `${item.role} (${item.host})`).join(', ')} — choose a model per role in ${rolesPath}, or confirm the defaults once`
      };
    case 'ok':
      return { state: 'ready', next: `aioson execution:compile . --feature=${slug}`, message: 'orchestrated execution is available on this machine' };
    default: {
      const missing = offer.missing || [];
      return {
        state: 'unsigned',
        next: missing[0]?.hint || 'aioson host:signature . --host=<host> --model=<model>',
        message: `${missing.length} role(s) without a valid signature on this machine`
      };
    }
  }
}

/**
 * The offer: is the orchestrated path available in this project on this
 * machine right now? Requires the unlock file (present, valid, enabled), the
 * owner's answer on any role still at the default model, and a valid,
 * unexpired signature for every declared role — in that order, so nobody is
 * sent to sign a model they were about to change.
 */
async function offerExecution(projectDir, { env = process.env, now = Date.now(), hosts } = {}) {
  const roles = await readExecutionRoles(projectDir, { hosts });
  const base = {
    available: false,
    roles_path: roles.path,
    roles_digest: roles.digest,
    inside_play: Boolean(env.AIOSON_PLAY),
    roles: roles.roles,
    errors: roles.errors
  };
  if (!roles.present || !roles.ok) return { ...base, reason: roles.reason };
  if (!roles.enabled) return { ...base, reason: 'roles_disabled' };
  const pending = defaultModelRoles(roles.roles);
  if (pending.length > 0) {
    const confirmation = await readConfirmation(projectDir);
    if (confirmation.digest !== rolesDigest(roles.roles)) {
      return { ...base, reason: 'defaults_unconfirmed', pending_confirmation: pending };
    }
  }
  const signatures = await checkRoleSignatures(roles.roles, { env, now });
  if (!signatures.ok) {
    return { ...base, reason: `signature_${signatures.missing[0].state}`, signatures, missing: signatures.missing };
  }
  return { ...base, available: true, reason: 'ok', signatures, missing: [] };
}

module.exports = {
  DEFAULT_MAX_CONCURRENT_LANES,
  MAX_CONCURRENT_UNIT_PIPELINES,
  DEFAULT_ON_UNAVAILABLE,
  DEFAULT_SPAWNER_UNIT_TIMEOUT_MS,
  MIN_UNIT_TIMEOUT_MS,
  MAX_UNIT_TIMEOUT_MS,
  UNLIMITED_UNIT_TIMEOUT_MS,
  rolesBindingDigest,
  SPAWNER_ENV,
  parseSpawnerCommand,
  resolveSpawner,
  EXECUTION_ROLES_CONFIRMATION_RELATIVE_PATH,
  EXECUTION_ROLES_RELATIVE_PATH,
  EXECUTION_ROLES_VERSION,
  ON_UNAVAILABLE,
  SEED_SOURCE_PREFIX,
  checkRoleSignatures,
  confirmDefaultModels,
  defaultModelRoles,
  describeOnboarding,
  executionRolesPath,
  installedExecutionHosts,
  laneRoleKey,
  offerExecution,
  readConfirmation,
  readExecutionRoles,
  resolveLaneRoles,
  profileFallbackOrder,
  resolveProfileFallbacks,
  rolesDigest,
  seedExecutionRoles,
  signatureHint,
  validateExecutionRoles
};
