'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { loadModelCatalog } = require('../agent-execution/model-catalog');
const { effortsForHost } = require('../agent-execution/schema');
const {
  EXECUTION_ROLES_RELATIVE_PATH,
  profileFallbackOrder,
  validateExecutionRoles
} = require('../lib/execution-roles');
const { findSignature, readSignatures, signatureState } = require('../lib/host-signature');
const { listExecutionHosts } = require('../lib/tool-capabilities');

const MAX_CONFIG_BYTES = 64 * 1024;

function digest(text) {
  return crypto.createHash('sha256').update(text).digest('hex');
}

function roleMaps(config) {
  if (config?.profiles) return Object.values(config.profiles).map(profile => profile.roles || {});
  return config?.roles ? [config.roles] : [];
}

async function readRaw(projectDir) {
  const file = path.join(projectDir, ...EXECUTION_ROLES_RELATIVE_PATH.split('/'));
  const raw = await fs.readFile(file, 'utf8');
  if (Buffer.byteLength(raw) > MAX_CONFIG_BYTES) throw Object.assign(new Error('A configuração excede 64 KB.'), { code: 'config_too_large' });
  return { file, raw, config: JSON.parse(raw), digest: digest(raw) };
}

function signatureView(store, now) {
  return Object.values(store.signatures || {}).map(entry => ({
    host: entry.host,
    model: entry.model,
    reasoning_effort: entry.reasoning_effort || null,
    state: signatureState(entry, now),
    reason: entry.reason || null,
    checked_at: entry.checked_at || null,
    expires_at: entry.expires_at || null,
    unattended: entry.unattended?.yolo?.state || null
  })).filter(entry => entry.host && entry.model);
}

async function routingConfiguration(projectDir, { env = process.env, now = Date.now() } = {}) {
  let source;
  try { source = await readRaw(projectDir); }
  catch (error) {
    return { ok: false, code: error.code === 'ENOENT' ? 404 : 422, error: error.code === 'ENOENT' ? `${EXECUTION_ROLES_RELATIVE_PATH} não existe neste projeto.` : `Não foi possível ler a configuração: ${error.message}` };
  }
  const validated = validateExecutionRoles(source.config);
  if (!validated.ok) return { ok: false, code: 422, error: 'A configuração atual é inválida.', errors: validated.errors, digest: source.digest };
  const store = await readSignatures({ env });
  const signatures = signatureView(store, now);
  const hosts = listExecutionHosts();
  const modelSets = Object.fromEntries(hosts.map(host => [host, new Set()]));
  for (const entry of signatures) if (modelSets[entry.host]) modelSets[entry.host].add(entry.model);
  for (const map of roleMaps(source.config)) for (const role of Object.values(map)) {
    if (modelSets[role.host] && typeof role.model === 'string') modelSets[role.host].add(role.model);
  }
  const codex = await loadModelCatalog('codex', { env });
  if (codex.available) for (const model of codex.models.slice(0, 500)) modelSets.codex?.add(model.slug);
  return {
    ok: true,
    code: 200,
    path: EXECUTION_ROLES_RELATIVE_PATH,
    digest: source.digest,
    config: source.config,
    options: {
      hosts: hosts.map(host => ({ host, efforts: effortsForHost(host) })),
      models: Object.fromEntries(hosts.map(host => [host, [...modelSets[host]].sort()])),
      signatures
    }
  };
}

function signatureCommand(role) {
  return `aioson host:signature . --host=${role.host} --model=${role.model}${role.reasoning_effort ? ` --effort=${role.reasoning_effort}` : ''}`;
}

function fallbackRole(profile, roleKey) {
  if (!profile?.roles) return null;
  if (profile.roles[roleKey]) return profile.roles[roleKey];
  return roleKey === 'qa' || roleKey.endsWith('_qa') ? profile.roles.qa || null : null;
}

/**
 * Validate the edited document without saving or starting a model. This is the
 * same cached host/model/effort evidence consumed before every dispatch, plus
 * the configured profile fallback order.
 */
async function validateRoutingConfiguration(config, { env = process.env, now = Date.now() } = {}) {
  const validation = validateExecutionRoles(config);
  if (!validation.ok) {
    return { ok: false, code: 422, reason: 'config_invalid', errors: validation.errors, checks: [], commands: [], message: 'A estrutura da configuração é inválida.' };
  }
  const store = await readSignatures({ env });
  const profileName = config.profiles ? config.active_profile : 'legacy';
  const active = config.profiles ? config.profiles[profileName] : { enabled: true, fallback_use: false, fallback_profiles: [], roles: config.roles };
  const checks = [];
  const commands = new Set();
  const nowValue = typeof now === 'function' ? now() : now;
  const describe = role => {
    const entry = findSignature(store, { host: role.host, model: role.model, reasoning_effort: role.reasoning_effort || null });
    return {
      host: role.host,
      model: role.model,
      reasoning_effort: role.reasoning_effort || null,
      signature_state: signatureState(entry, nowValue),
      reason: entry?.reason || null,
      checked_at: entry?.checked_at || null,
      expires_at: entry?.expires_at || null,
      command: signatureCommand(role)
    };
  };
  for (const [roleKey, role] of Object.entries(active.roles || {})) {
    const primary = describe(role);
    let fallback = null;
    if (primary.signature_state !== 'valid' && active.fallback_use === true) {
      for (const fallbackName of profileFallbackOrder({ profiles: config.profiles, active_profile: profileName })) {
        const candidateProfile = config.profiles?.[fallbackName];
        if (!candidateProfile || candidateProfile.enabled === false) continue;
        const candidateRole = fallbackRole(candidateProfile, roleKey);
        if (!candidateRole) continue;
        const candidate = describe(candidateRole);
        if (candidate.signature_state === 'valid') {
          fallback = { profile: fallbackName, ...candidate };
          break;
        }
      }
    }
    const ok = primary.signature_state === 'valid' || Boolean(fallback);
    if (!ok) commands.add(primary.command);
    checks.push({ role: roleKey, ok, primary, effective: fallback || { profile: profileName, ...primary }, fallback_used: Boolean(fallback) });
  }
  const ready = config.enabled === true && active.enabled !== false && checks.length > 0 && checks.every(item => item.ok);
  return {
    ok: ready,
    code: 200,
    reason: config.enabled !== true ? 'configuration_disabled' : active.enabled === false ? 'profile_disabled' : ready ? null : 'signature_unavailable',
    active_profile: profileName,
    checks,
    commands: [...commands],
    message: ready
      ? `Perfil ${profileName} pronto. ${checks.filter(item => item.fallback_used).length ? 'Há funções roteadas por fallback válido.' : 'Todas as funções usam assinaturas válidas.'}`
      : `Perfil ${profileName} ainda não está pronto para todos os disparos.`
  };
}

async function updateRoutingConfiguration(projectDir, payload, { env = process.env } = {}) {
  if (!payload || typeof payload !== 'object' || typeof payload.expected_digest !== 'string' || !payload.config || typeof payload.config !== 'object' || Array.isArray(payload.config)) {
    return { code: 400, data: { error: 'Envie expected_digest e config.' } };
  }
  let current;
  try { current = await readRaw(projectDir); }
  catch (error) { return { code: error.code === 'ENOENT' ? 404 : 422, data: { error: `Não foi possível ler a configuração atual: ${error.message}` } }; }
  if (payload.expected_digest !== current.digest) return { code: 409, data: { error: 'A configuração mudou desde que o editor foi aberto. Recarregue antes de salvar.', reason: 'config_changed' } };
  const validation = validateExecutionRoles(payload.config);
  if (!validation.ok) return { code: 422, data: { error: 'Corrija os campos inválidos antes de salvar.', reason: 'config_invalid', errors: validation.errors } };
  // The user's saved routing is the runtime source of truth. Active engines
  // reload it before every new stage and while filling the worker pool, so an
  // active run is not a reason to reject profile, policy or capacity edits.
  const text = `${JSON.stringify(payload.config, null, 2)}\n`;
  if (Buffer.byteLength(text) > MAX_CONFIG_BYTES) return { code: 413, data: { error: 'A configuração excede 64 KB.' } };
  const tmp = `${current.file}.${process.pid}.${crypto.randomUUID()}.tmp`;
  try {
    await fs.writeFile(tmp, text, { encoding: 'utf8', flag: 'wx' });
    await fs.rename(tmp, current.file);
  } catch (error) {
    await fs.rm(tmp, { force: true }).catch(() => {});
    return { code: 503, data: { error: `Não foi possível salvar a configuração: ${error.message}` } };
  }
  const result = await routingConfiguration(projectDir, { env });
  return { code: result.ok ? 200 : result.code, data: result.ok ? { ...result, message: 'Configuração salva. Novos estágios usarão este roteamento.' } : result };
}

module.exports = { MAX_CONFIG_BYTES, routingConfiguration, updateRoutingConfiguration, validateRoutingConfiguration };
