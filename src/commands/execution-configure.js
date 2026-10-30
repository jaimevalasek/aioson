'use strict';

// A chat-native wizard: describe choices without writes; apply only the reviewed
// document after explicit confirmation. No terminal input or model calls here.
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const {
  executionRolesPath, readExecutionRoles, validateExecutionRoles, laneRoleKey,
  seedRolesDocument, installedExecutionHosts, confirmDefaultModels, rolesDigest, normalizeExecutionRoles,
  EXECUTION_ROLES_RELATIVE_PATH, WIZARD_SOURCE_PREFIX
} = require('../lib/execution-roles');
const { withRegistryLock, writeAtomically } = require('../lib/feature-registry-storage');
const { listExecutionHosts, getExecutionCapabilities } = require('../lib/tool-capabilities');
const { effortsForHost, MAX_DEVELOPMENT_LANES } = require('../agent-execution/schema');
const { loadModelCatalog } = require('../agent-execution/model-catalog');
const { DEFAULT_MODEL, readSignatures } = require('../lib/host-signature');

async function snapshot(projectDir) {
  try {
    const raw = await fs.readFile(executionRolesPath(projectDir), 'utf8');
    return { digest: crypto.createHash('sha256').update(raw).digest('hex'), document: JSON.parse(raw) };
  } catch (error) {
    if (error.code === 'ENOENT') return { digest: 'missing', document: null };
    throw error;
  }
}

function roleLabel(key) {
  if (key === 'qa') return 'QA';
  if (key === 'integration_dev') return 'Orchestrator / final integration supervisor (DEV)';
  return key.replace(/_dev$/, ' DEV').replace(/_qa$/, ' QA').replace(/_/g, ' ');
}

function effortOptions(efforts, recommendHigh = true) {
  return [
    ...efforts.map(effort => ({ value: effort, recommended: recommendHigh && effort === 'high' })),
    { value: null, label: 'Use the CLI configured effort (explicit choice)', recommended: false }
  ];
}

async function runExecutionConfigure({ projectDir, feature, lanes, options = {}, env = process.env, now = Date.now(), locate, catalogLoader = loadModelCatalog }) {
  const refuse = (reason, message, extra = {}) => ({ ok: false, reason, message, ...extra, exitCode: 1 });
  if (!feature) return refuse('feature_required', 'Use --feature=<slug>');
  const registered = listExecutionHosts();
  const installed = await installedExecutionHosts({ hosts: registered, env, locate });
  if (!installed.length) return refuse('no_execution_host', 'Install an execution host CLI before configuring orchestration.', {
    install: registered.map(host => ({ host, command: getExecutionCapabilities(host)?.install_command || null }))
  });
  let before;
  try { before = await snapshot(projectDir); }
  catch (error) { return refuse('roles_unreadable', error.message); }
  const existing = await readExecutionRoles(projectDir);
  if (existing.present && !existing.ok) return refuse(existing.reason, 'Repair the existing roles file before configuring execution.', { errors: existing.errors });
  const laneIds = [...new Set((lanes || []).map(lane => String(lane).trim()))];
  if (!laneIds.length || laneIds.some(lane => !/^[a-z][a-z0-9-]*$/.test(lane))) return refuse('lanes_required', 'Declare the plan lanes or use --lanes=backend,frontend.');
  if (laneIds.length > MAX_DEVELOPMENT_LANES) return refuse('too_many_lanes', `At most ${MAX_DEVELOPMENT_LANES} lanes are supported.`);
  const defaults = seedRolesDocument({ lanes: laneIds, feature, installed });
  let document = before.document || defaults;
  if (options.config !== undefined) {
    if (typeof options.config !== 'string' || !options.config.trim()) return refuse('config_required', 'Use --config=<reviewed-json-file>');
    try { document = JSON.parse(await fs.readFile(path.resolve(projectDir, options.config), 'utf8')); }
    catch (error) { return refuse('config_unreadable', error.message); }
  }
  if (options.confirm === true && options.config === undefined) return refuse('choices_required', 'Complete the model and reasoning effort choices for each role and provide --config=<reviewed-json-file>.');
  let validation = validateExecutionRoles(document);
  if (!validation.ok) return refuse('roles_invalid', 'The proposed role configuration is invalid.', { errors: validation.errors });
  // Preserve inactive profiles, custom lanes, reviewer overrides and client settings.
  document = structuredClone(document);
  const activeRoles = document.profiles ? document.profiles[document.active_profile].roles : document.roles;
  const required = [...laneIds.map(lane => laneRoleKey(lane, 'dev')), 'qa', 'integration_dev'];
  if (options.confirm === true) {
    const unanswered = [...new Set([...required, ...Object.keys(activeRoles)])].filter(key => !activeRoles[key] || !['host', 'model', 'reasoning_effort'].every(field => Object.hasOwn(activeRoles[key], field)));
    if (unanswered.length) return refuse('choices_required', 'Explicitly choose host, model and reasoning_effort for every role; null is an explicit choice to use the configured effort.', { roles: unanswered });
  }
  for (const key of required) activeRoles[key] ||= defaults.profiles[defaults.active_profile].roles[key];
  document.enabled = true;
  document.source = `${WIZARD_SOURCE_PREFIX} (feature: ${feature})`;
  validation = validateExecutionRoles(document);
  if (!validation.ok) return refuse('roles_invalid', 'The proposed role configuration is invalid.', { errors: validation.errors });
  const signatures = await readSignatures({ env });
  const savedRoutes = [...Object.values(signatures.signatures || {}), ...Object.values(activeRoles)];
  const hosts = await Promise.all(installed.map(async host => {
    const catalog = await catalogLoader(host, { env }).catch(() => ({ models: [], source: null }));
    const supportedEfforts = getExecutionCapabilities(host)?.reasoning_effort ? effortsForHost(host) : [];
    const models = new Map((catalog.models || []).map(model => [model.slug, {
      id: model.slug, label: model.display_name, source: 'catalog',
      effort_options: effortOptions((model.supported_efforts || []).filter(effort => supportedEfforts.includes(effort)))
    }]));
    for (const route of savedRoutes) {
      if (route.host !== host || !route.model || route.model === DEFAULT_MODEL || models.has(route.model)) continue;
      const highVerified = Object.values(signatures.signatures || {}).some(signed => signed.host === host && signed.model === route.model && signed.reasoning_effort === 'high' && signed.status === 'valid');
      models.set(route.model, { id: route.model, label: route.model, source: 'saved_selection', effort_options: effortOptions(supportedEfforts, highVerified) });
    }
    return {
      host,
      model_source: catalog.source || null,
      models: [
        ...models.values(),
        { id: DEFAULT_MODEL, label: 'Use the CLI default model (explicit choice; actual model determined by the CLI)', effort_options: effortOptions(supportedEfforts, false) }
      ],
      allow_model_id: true,
      manual_model_effort_options: effortOptions(supportedEfforts, false)
    };
  }));
  const result = {
    ok: true, feature, state: 'awaiting_confirmation', written: false,
    path: EXECUTION_ROLES_RELATIVE_PATH, expected_digest: before.digest,
    coordinator: { mode: 'current-session', message: 'The monitoring chat conducts this wizard. integration_dev selects the external final integration supervisor; it does not switch the current chat model.' },
    roles: [...new Set([...required, ...Object.keys(activeRoles)])].map(role => ({
      role, label: roleLabel(role), current: activeRoles[role],
      required_answers: ['host', 'model', 'reasoning_effort'],
      questions: [
        { field: 'host', prompt: 'Choose the execution CLI.', options: installed },
        { field: 'model', prompt: 'Choose an actual model from the selected host catalog or enter its exact ID. Using the CLI default is a separate explicit choice.', options_from: 'hosts[chosen_host].models' },
        { field: 'reasoning_effort', prompt: 'Choose the reasoning effort for this model. Recommend high when marked recommended in its options; higher effort may take longer. The configured effort is a separate explicit choice.', options_from: 'hosts[chosen_host].models[chosen_model].effort_options' }
      ]
    })),
    hosts, configuration: document,
    instructions: 'In the main monitoring chat, ask host, MODEL and EFFORT explicitly for EVERY role, including QA and integration supervisor. Use the host/model-specific options; recommend high effort only when the selected model options mark it recommended. Explain the reasoning versus latency trade-off. When the local catalog is unavailable, ask for an exact model ID or inspect the selected CLI model list; never invent IDs or capabilities. Translate labels to the conversation language. Existing values are context, never answers: explicitly offer keep or change model AND effort. Never substitute configured-default or null for an unanswered field. Show the complete host/model/effort summary, then ask Confirm configuration and start / Edit / Cancel. Never infer acceptance from silence or Autopilot. Save all reviewed role fields as JSON and apply with --config=<file> --expect-digest=<expected_digest> --confirm only after the answer.',
    next: `aioson execution:configure . --feature=${feature} --config=<reviewed-json-file> --expect-digest=${before.digest} --confirm --json`,
    exitCode: 0
  };
  if (options.confirm !== true) return result;
  if (options['expect-digest'] !== before.digest) return refuse('configuration_changed', 'The role configuration changed or --expect-digest is missing. Review the wizard again before confirming.');
  const unavailable = Object.entries(activeRoles).filter(([, role]) => !installed.includes(role.host));
  if (unavailable.length) return refuse('host_not_installed', 'Choose an installed execution host for every active role.', { roles: unavailable.map(([role]) => role) });
  for (const [key, role] of Object.entries(activeRoles)) {
    const model = hosts.find(host => host.host === role.host)?.models.find(model => model.id === role.model.trim());
    if (model && !model.effort_options.some(option => option.value === (role.reasoning_effort || null))) return refuse('effort_unsupported_by_model', `Choose a supported reasoning effort for ${key} (${role.host}/${role.model}).`);
  }
  try {
    return await withRegistryLock(path.dirname(executionRolesPath(projectDir)), async () => {
      if ((await snapshot(projectDir)).digest !== before.digest) return refuse('configuration_changed', 'The role configuration changed. Review the wizard again before confirming.');
      await writeAtomically(executionRolesPath(projectDir), `${JSON.stringify(document, null, 2)}\n`);
      const confirmation = await confirmDefaultModels(projectDir, { now, expectedDigest: rolesDigest(normalizeExecutionRoles(document)) });
      if (!confirmation.ok) return refuse(confirmation.reason, 'Roles saved, but confirmation failed. Review the configuration again.', { written: true });
      return {
        ...result, state: 'confirmed', written: true, confirmation,
        next: `aioson execution:profiles:validate .${document.active_profile ? ` --profile=${document.active_profile}` : ''} --json`,
        compile_command: `aioson execution:compile . --feature=${feature}`
      };
    }, { name: '.execution-roles.lock' });
  } catch (error) { return refuse('write_failed', error.message); }
}

module.exports = { runExecutionConfigure };
