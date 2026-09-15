'use strict';

const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { createRecoveryController } = require('./recovery');
const { statusExecution } = require('../agent-execution/execution-run');
const { readExecutionPlan } = require('../agent-execution/execution-plan');
const { observeExecution } = require('../agent-execution/execution-observation');
const { readExecutionRoles, resolveLaneRoles, resolveProfileFallbacks } = require('../lib/execution-roles');
const { readSignatures, findSignature, signatureState } = require('../lib/host-signature');
const { validateFeatureSlug, resolveExistingInsideRoot, isInsideRoot } = require('../verification/path-policy');
const { readHistoricalSnapshot, archivedFeatures } = require('./history');
const { MAX_CONFIG_BYTES, routingConfiguration, updateRoutingConfiguration, validateRoutingConfiguration } = require('./routing-config');

const ASSETS = { '/': ['index.html', 'text/html'], '/app.js': ['app.js', 'text/javascript'], '/style.css': ['style.css', 'text/css'], '/tokens.css': ['tokens.css', 'text/css'] };
const HEADERS = {
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'no-referrer',
  'Content-Security-Policy': "default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:; font-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'"
};

function send(res, status, body, type = 'application/json') {
  const text = type === 'application/json' ? JSON.stringify(body) : body;
  res.writeHead(status, { ...HEADERS, 'Content-Type': `${type}; charset=utf-8` });
  res.end(text);
}

async function readJsonRequest(req, maxBytes) {
  let size = 0, text = '';
  for await (const chunk of req) {
    size += chunk.length;
    if (size <= maxBytes) text += chunk.toString('utf8');
  }
  if (size > maxBytes) return { error: 'Pedido muito grande.', code: 413 };
  try { return { data: JSON.parse(text) }; }
  catch { return { error: 'JSON inválido.', code: 400 }; }
}

async function snapshot(projectDir, feature) {
  const result = await statusExecution({ projectDir, feature });
  if (!result.run && !result.compiled && !result.state_corrupt && !result.state_unreadable) {
    const historical = await readHistoricalSnapshot(projectDir, feature);
    if (historical) return { ...historical.status, observation: observeExecution(historical.status, historical.plan), observed_at: new Date().toISOString() };
  }
  const read = await readExecutionPlan(projectDir, feature);
  const rolesRead = await readExecutionRoles(projectDir);
  let observedPlan = read.plan;
  const routingFallbacks = [];
  if (rolesRead.ok && rolesRead.enabled && observedPlan) {
    const signatures = await readSignatures();
    const route = (laneId, kind, role) => {
      if (!role) return role;
      const state = signatureState(findSignature(signatures, { host: role.host, model: role.model, reasoning_effort: role.reasoning_effort || null }));
      if (state === 'valid') return { ...role, routing_profile: rolesRead.roles.active_profile || 'legacy' };
      const fallback = resolveProfileFallbacks(rolesRead.roles, laneId, kind).find(candidate => signatureState(findSignature(signatures, { host: candidate.host, model: candidate.model, reasoning_effort: candidate.reasoning_effort || null })) === 'valid');
      if (!fallback) return { ...role, routing_profile: rolesRead.roles.active_profile || 'legacy', signature_state: state };
      routingFallbacks.push({ lane: laneId, stage: kind, from_profile: rolesRead.roles.active_profile, to_profile: fallback.profile, reason: `signature_${state}`, host: fallback.host, model: fallback.model });
      return { ...fallback, routing_profile: fallback.profile, signature_state: 'valid' };
    };
    observedPlan = { ...observedPlan, lanes: Object.fromEntries(Object.entries(observedPlan.lanes || {}).map(([laneId, lane]) => {
      const selected = resolveLaneRoles(rolesRead.roles, laneId);
      const dev = route(laneId, 'dev', selected.dev || lane.dev);
      const qa = route(laneId, 'qa', selected.qa || lane.qa);
      return [laneId, { ...lane, dev, qa: qa ? { ...lane.qa, ...qa } : lane.qa }];
    })) };
  }
  result.routing = { ok: rolesRead.ok, enabled: rolesRead.enabled, active_profile: rolesRead.roles?.active_profile || 'legacy', fallbacks: routingFallbacks, reason: rolesRead.reason, errors: rolesRead.errors };
  result.observation = observeExecution(result, observedPlan);
  return { ...result, observed_at: new Date().toISOString() };
}

async function listFeatures(projectDir) {
  let entries;
  try { entries = await fs.readdir(path.join(projectDir, '.aioson/context'), { withFileTypes: true }); }
  catch (error) { if (error.code === 'ENOENT') return []; throw error; }
  const slugs = new Set(entries.filter(entry => entry.isFile()).map(entry => /^execution-(?:state|plan)-(.+)\.json$/.exec(entry.name)?.[1]).filter(slug => slug && validateFeatureSlug(slug).ok));
  const archived = await archivedFeatures(projectDir);
  for (const slug of archived) {
    if (slugs.has(slug)) continue;
    const folder = path.join(projectDir, '.aioson/context/done', slug);
    const files = await fs.readdir(folder).catch(() => []);
    if (files.includes(`execution-plan-${slug}.json`) || files.includes(`execution-state-${slug}.json`)) slugs.add(slug);
  }
  const features = [];
  for (const feature of slugs) {
    try {
      const status = await snapshot(projectDir, feature);
      features.push({ feature, archived: Boolean(status.archived), status: status.run?.status || (status.state_corrupt ? 'corrupt' : status.state_unreadable ? 'unreadable' : 'not_started'), engine: status.engine?.state || 'idle', counts: status.observation.counts, updated_at: status.run?.updated_at || null });
    } catch { features.push({ feature, status: 'unreadable', engine: 'unknown' }); }
  }
  return features.sort((a, b) => Number(b.status === 'running') - Number(a.status === 'running') || a.feature.localeCompare(b.feature));
}

async function readReport(projectDir, feature, unitId, stage) {
  if (!['dev', 'qa'].includes(stage)) return { code: 400, error: 'Etapa inválida.' };
  const status = await snapshot(projectDir, feature);
  const unit = status.units?.find(item => item.id === unitId);
  const report = unit?.[stage]?.report;
  if (!report) return { code: 404, error: 'Relatório ainda não disponível.' };
  // Only a ledger-bound report in THIS feature's reports directory is served.
  // Resolve both lexical and real paths, including parent directory symlinks.
  const resolved = await resolveExistingInsideRoot(projectDir, report);
  const roots = [path.join(projectDir, '.aioson/context/reports', feature)];
  if (status.archived) roots.push(path.join(projectDir, '.aioson/context/done', feature, 'reports'));
  const root = resolved.ok && roots.find(candidate => isInsideRoot(candidate, resolved.path));
  if (!root) return { code: 403, error: 'Relatório fora do diretório permitido.' };
  const realRoot = await fs.realpath(root);
  if (!isInsideRoot(realRoot, resolved.real_path)) return { code: 403, error: 'Relatório fora do diretório permitido.' };
  const stat = await fs.stat(resolved.real_path);
  if (!stat.isFile() || stat.size > 2 * 1024 * 1024) return { code: 413, error: 'Relatório excede o limite de leitura (2 MB).' };
  return { code: 200, data: JSON.parse(await fs.readFile(resolved.real_path, 'utf8')) };
}

function presentRecovery(snapshot, recovery = {}) {
  const stopped = !snapshot.engine?.alive;
  const actionable = snapshot.run
    && ['paused', 'decision_required', 'running'].includes(snapshot.run.status)
    && stopped;
  return { ...recovery, visible: Boolean(!snapshot.archived && (actionable || (snapshot.run && stopped && recovery.busy))) };
}

function createExecutionDashboard(projectDir, { port = 4181, feature = null, autoPort = false, recoveryController = null, recoveryPollMs = 5000 } = {}) {
  projectDir = path.resolve(projectDir);
  const assets = new Map();
  const recovery = recoveryController || createRecoveryController(projectDir);
  const actionToken = crypto.randomBytes(32).toString('hex');
  let watchdog = null, observing = false, stopped = false;
  const observeRuns = async () => {
    if (stopped || observing || !recovery.observe) return;
    observing = true;
    try {
      for (const item of await listFeatures(projectDir)) {
        if (stopped) break;
        const data = await snapshot(projectDir, item.feature);
        if (!stopped) await recovery.observe(item.feature, data);
      }
    } catch { /* Transient reads never justify a restart; the next poll retries. */ }
    finally { observing = false; }
  };
  const server = http.createServer(async (req, res) => {
    try {
      // Bind to loopback AND reject other Host headers (DNS rebinding) and
      // cross-site browser requests. Recovery only runs a fixed CLI operation.
      const actualPort = server.address()?.port;
      if (![`127.0.0.1:${actualPort}`, `localhost:${actualPort}`].includes(req.headers.host) || req.headers['sec-fetch-site'] === 'cross-site') {
        send(res, 403, { error: 'Acesso permitido somente pelo endereço local do painel.' }); return;
      }
      const url = new URL(req.url, `http://127.0.0.1:${actualPort}`);
      const action = /^\/api\/features\/([^/]+)\/recover$/.exec(url.pathname);
      if (req.method === 'POST' && url.pathname === '/api/routing/validate') {
        if (req.headers.origin !== `http://${req.headers.host}` || req.headers['x-aioson-action'] !== actionToken) { send(res, 403, { error: 'Ação permitida somente pelo painel local.' }); return; }
        if (!/^application\/json(?:;|$)/i.test(req.headers['content-type'] || '')) { send(res, 415, { error: 'Use um pedido JSON.' }); return; }
        const body = await readJsonRequest(req, MAX_CONFIG_BYTES + 8192);
        if (body.error) { send(res, body.code, { error: body.error }); return; }
        if (!body.data?.config || typeof body.data.config !== 'object' || Array.isArray(body.data.config)) { send(res, 400, { error: 'Envie a configuração a validar.' }); return; }
        const result = await validateRoutingConfiguration(body.data.config);
        send(res, result.code, result); return;
      }
      if (req.method === 'POST' && url.pathname === '/api/routing') {
        if (req.headers.origin !== `http://${req.headers.host}` || req.headers['x-aioson-action'] !== actionToken) { send(res, 403, { error: 'Ação permitida somente pelo painel local.' }); return; }
        if (!/^application\/json(?:;|$)/i.test(req.headers['content-type'] || '')) { send(res, 415, { error: 'Use um pedido JSON.' }); return; }
        const body = await readJsonRequest(req, MAX_CONFIG_BYTES + 8192);
        if (body.error) { send(res, body.code, { error: body.error }); return; }
        const activeRun = (await listFeatures(projectDir)).some(item => !item.archived && ['running', 'paused', 'decision_required'].includes(item.status));
        const result = await updateRoutingConfiguration(projectDir, body.data, { activeRun });
        send(res, result.code, result.data); return;
      }
      if (req.method === 'POST' && action) {
        if (req.headers.origin !== `http://${req.headers.host}` || req.headers['x-aioson-action'] !== actionToken) { send(res, 403, { error: 'Ação permitida somente pelo painel local.' }); return; }
        if (!/^application\/json(?:;|$)/i.test(req.headers['content-type'] || '')) { send(res, 415, { error: 'Use um pedido JSON.' }); return; }
        const slug = decodeURIComponent(action[1]);
        if (!validateFeatureSlug(slug).ok) { send(res, 400, { error: 'Feature inválida.' }); return; }
        const body = await readJsonRequest(req, 4096);
        if (body.error) { send(res, body.code, { error: body.error }); return; }
        const result = await recovery.recover(slug, body.data);
        send(res, result.code, result.data); return;
      }
      if (req.method !== 'GET') { send(res, 405, { error: 'Operação não permitida.' }); return; }
      const asset = ASSETS[url.pathname];
      if (asset) {
        if (!assets.has(asset[0])) assets.set(asset[0], await fs.readFile(path.join(__dirname, 'public', asset[0])));
        send(res, 200, assets.get(asset[0]), asset[1]); return;
      }
      if (url.pathname === '/api/features') {
        send(res, 200, { project: path.basename(projectDir), features: await listFeatures(projectDir), initial_feature: feature, action_token: actionToken }); return;
      }
      if (url.pathname === '/api/routing') {
        const result = await routingConfiguration(projectDir);
        send(res, result.code, result.ok ? result : { error: result.error, errors: result.errors || [] }); return;
      }
      const route = /^\/api\/features\/([^/]+)\/(status|report)$/.exec(url.pathname);
      if (route) {
        const slug = decodeURIComponent(route[1]);
        if (!validateFeatureSlug(slug).ok) { send(res, 400, { error: 'Feature inválida.' }); return; }
        if (route[2] === 'status') {
          const data = await snapshot(projectDir, slug);
          send(res, 200, { ...data, recovery: presentRecovery(data, recovery.status(slug, data)) }); return;
        }
        const report = await readReport(projectDir, slug, url.searchParams.get('unit'), url.searchParams.get('stage'));
        send(res, report.code, report.error ? { error: report.error } : report.data); return;
      }
      send(res, 404, { error: 'Endereço não encontrado.' });
    } catch (error) {
      send(res, error instanceof URIError ? 400 : 503, { error: error instanceof URIError ? 'Endereço inválido.' : 'Não foi possível ler os dados agora. O monitor tentará novamente.' });
    }
  });
  return {
    server,
    start() {
      return new Promise((resolve, reject) => {
        let requested = port;
        const onListening = () => {
          server.removeListener('error', onError);
          const bound = server.address().port;
          stopped = false;
          watchdog = setInterval(observeRuns, Math.max(250, Number(recoveryPollMs) || 5000));
          watchdog.unref?.();
          void observeRuns();
          resolve({ port: bound, url: `http://127.0.0.1:${bound}/${feature ? `?feature=${encodeURIComponent(feature)}` : ''}` });
        };
        const onError = error => {
          server.removeListener('listening', onListening);
          if (error.code === 'EADDRINUSE' && autoPort && requested !== 0) { requested = 0; listen(); }
          else reject(error);
        };
        const listen = () => {
          server.once('error', onError);
          server.once('listening', onListening);
          server.listen(requested, '127.0.0.1');
        };
        listen();
      });
    },
    stop() { stopped = true; clearInterval(watchdog); return new Promise(resolve => { server.close(resolve); server.closeIdleConnections(); }); }
  };
}

module.exports = { createExecutionDashboard, listFeatures, snapshot, readReport, presentRecovery };
