'use strict';
/* global document, location, history, Option */

const $ = id => document.getElementById(id);
const labels = { running: 'Executando', passed: 'Aprovado', failed: 'Reprovado', crashed: 'Falha no processo', unavailable: 'Indisponível', pending: 'Aguardando', skipped: 'Dispensado', not_applicable: 'Não se aplica', decision_required: 'Decisão pendente', paused: 'Pausado', completed: 'Concluído', cancelled: 'Cancelado', integration: 'Integração', not_started: 'Não iniciado', corrupt: 'Estado inválido', unreadable: 'Leitura indisponível' };
const waitLabels = { capacity: 'Aguardando vaga', dependencies: 'Aguardando dependências', previous_wave: 'Aguardando onda anterior', run_paused: 'Execução pausada', engine_missing: 'Motor sem sinal', write_conflict: 'Aguardando arquivos compartilhados' };
labels.interrupted = 'Interrompido';
let selected = new URLSearchParams(location.search).get('feature');
let features = [];
let current = null;
let filter = 'all';
let timer;
let generation = 0;
let reportGeneration = 0;
let lastSuccess = null;
let actionToken = null;
let recovering = false;
let actionMessage = null;
let routingEditor = null;
let pendingProfileDeletion = null;

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = String(text);
  return node;
}
function badge(state, reason) { return el('span', `badge ${Object.hasOwn(labels, state) ? state : ''}`, reason === 'context_budget_exceeded' ? 'Limite de contexto' : labels[state] || state || '—'); }
function duration(ms) {
  if (ms == null) return '—';
  if (ms >= 3600000) return `${Math.floor(ms / 3600000)}h ${Math.floor(ms % 3600000 / 60000)}m`;
  if (ms >= 60000) return `${Math.floor(ms / 60000)}m ${Math.floor(ms % 60000 / 1000)}s`;
  return `${Math.floor(ms / 1000)}s`;
}
function human(value) { const text = String(value || '').replace(/-/g, ' '); return text.charAt(0).toUpperCase() + text.slice(1); }
function unitName(id) { return human(String(id).replace(/^phase-\d+-/, '')); }
function phaseLabel(unit) {
  const phase = String(unit?.phase || unit?.id || '').replace(/^phase-/, '');
  const match = /^(\d+)(?:-(.+))?$/.exec(phase);
  return match ? `Fase ${match[1]}${match[2] ? ` · ${human(match[2])}` : ''}` : `Fase ${human(phase)}`;
}
function unitStageLabel(unit, status) {
  const active = status.running?.find(item => item.unit === unit.id);
  if (active?.stage) return active.stage.toUpperCase();
  if (unit.dev?.status === 'passed' && unit.qa?.status === 'passed') return 'Concluído';
  if (unit.dev?.status === 'passed' && unit.qa?.status === 'pending') return 'QA aguardando início';
  if (unit.dev?.status === 'pending') return 'DEV aguardando início';
  return unit.qa?.status === 'failed' ? 'QA reprovado' : human(unit.status);
}
function time(at) { return at ? new Date(at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '—'; }
function apiPath(suffix) { return `/api/features/${encodeURIComponent(selected)}/${suffix}`; }
async function getJSON(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(url, { signal: controller.signal });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Não foi possível atualizar.');
    return data;
  } finally { clearTimeout(timeout); }
}

function renderFeatures() {
  const query = $('search').value.toLocaleLowerCase();
  const focused = document.activeElement?.dataset.feature;
  $('feature-count').textContent = features.length;
  $('features').replaceChildren(...features.filter(item => item.feature.includes(query)).map(item => {
    const button = el('button', 'feature', `${human(item.feature)}${item.archived ? ' · Arquivada' : ''}`);
    button.type = 'button';
    button.dataset.feature = item.feature;
    button.setAttribute('aria-current', String(selected === item.feature));
    button.append(el('span', 'feature-state', `${item.status === 'running' && item.engine !== 'alive' ? 'Motor sem sinal' : labels[item.status] || item.status}${item.counts ? ` · ${item.counts.accepted}/${item.counts.total} DEV + QA` : ''}`));
    button.onclick = () => selectFeature(item.feature);
    return button;
  }));
  if (focused) [...$('features').children].find(node => node.dataset.feature === focused)?.focus({ preventScroll: true });
}

function selectFeature(feature) {
  if (feature === selected && current) return;
  selected = feature;
  current = null;
  filter = 'all';
  $('wave').value = 'all';
  $('detail').close();
  $('findings').replaceChildren();
  reportGeneration++;
  $('execution').hidden = true;
  $('title').textContent = human(feature);
  $('subtitle').textContent = 'Carregando o estado da execução…';
  history.replaceState(null, '', `?feature=${encodeURIComponent(feature)}`);
  refresh();
}

function renderMetrics(status) {
  const obs = status.observation;
  const counts = obs.counts;
  const metrics = [
    ['DEV + QA aprovados', `${counts.accepted}/${counts.total}`, `${counts.dev_passed} implementada(s) · ${counts.qa_passed} revisada(s)`, 'success'],
    ['Em execução', `${obs.concurrency.active}/${obs.concurrency.limit ?? '—'}`, 'Unidades simultâneas · DEV → QA', ''],
    ['QA reprovado', counts.qa_failed, `${counts.findings} achado(s) registrados`, counts.qa_failed ? 'warning' : ''],
    ['Decisões pendentes', status.decisions_pending?.length || 0, 'Intervenções solicitadas pelo motor', '']
  ];
  $('metrics').replaceChildren(...metrics.map(([label, value, note, tone]) => {
    const node = el(label === 'QA reprovado' || label === 'Decisões pendentes' ? 'button' : 'article', 'metric');
    if (node.tagName === 'BUTTON') {
      node.type = 'button';
      node.onclick = () => { $('attention-title').scrollIntoView({ block: 'start', behavior: 'instant' }); };
    }
    node.append(el('div', 'metric-label', label), el('div', `metric-number ${tone}`, value), el('div', 'metric-note', note));
    return node;
  }));
}

function renderRoles(status) {
  $('routing-profile').textContent = status.routing?.ok
    ? `Perfil ativo: ${status.routing.active_profile}${status.routing.fallbacks?.length ? ` · ${status.routing.fallbacks.length} fallback(s) pronto(s)` : ''}`
    : `Configuração inválida: ${status.routing?.reason || 'não disponível'}`;
  $('roles').replaceChildren(...status.observation.assignments.map(role => {
    const node = el('article', 'role');
    const head = el('div', 'role-head');
    head.append(el('span', '', `${human(role.lane)} / ${role.stage.toUpperCase()}`), el('span', 'role-host', role.host || '—'));
    node.append(head, el('div', 'role-model', role.model || 'Modelo não definido'));
    const mismatch = role.active.filter(item => !item.matches);
    const fallback = role.active.filter(item => item.routing_profile && item.routing_profile !== status.routing?.active_profile);
    const waitingForDev = role.stage === 'qa' && status.running?.some(item => item.lane === role.lane && item.stage === 'dev');
    const queuedReview = role.stage === 'qa' && status.observation.waiting.some(item => item.stage === 'qa' && status.units.some(unit => unit.id === item.unit && unit.lane === role.lane));
    const activity = role.active.length ? `${role.active.length} em execução` : queuedReview ? 'Revisão aguardando início' : waitingForDev ? 'Aguardando entrega do DEV' : 'Sem unidade ativa';
    node.append(el('div', `role-meta ${role.active.length ? 'active' : ''}`, `${activity}${role.reasoning_effort ? ` · esforço ${role.reasoning_effort}` : ''}`));
    if (mismatch.length) node.append(el('p', 'severity high', `Em uso: ${mismatch.map(item => `${item.host}/${item.model}`).join(', ')}`));
    if (fallback.length) node.append(el('p', 'severity medium', `Fallback em uso: ${fallback.map(item => item.routing_profile).join(', ')}`));
    else if (role.routing_profile && role.routing_profile !== status.routing?.active_profile) node.append(el('p', 'severity medium', `Fallback pronto: ${role.routing_profile}`));
    return node;
  }));
}

function roleTitle(key) {
  const labels = { backend_dev: 'Backend / DEV', backend_qa: 'Backend / QA', frontend_dev: 'Frontend / DEV', frontend_qa: 'Frontend / QA', qa: 'QA compartilhado', integration_dev: 'Integração / DEV' };
  return labels[key] || human(key).replaceAll('_', ' ');
}

function editorRoleMap() {
  const config = routingEditor.config;
  return config.profiles ? config.profiles[config.active_profile].roles : config.roles;
}

function matchingSignature(role) {
  return routingEditor.options.signatures.find(item => item.host === role.host && item.model === role.model && (item.reasoning_effort || null) === (role.reasoning_effort || null));
}

function markRoutingDirty() {
  if (!routingEditor) return;
  routingEditor.dirty = true;
  $('routing-validation').hidden = true;
}

function routingFeedback(text, failure = false) {
  $('routing-feedback').className = failure ? 'small severity high' : 'small muted';
  $('routing-feedback').textContent = text;
}

function nextProfileName(config) {
  const names = Object.keys(config.profiles || {});
  const indexes = names.map(name => /^roles(\d+)$/.exec(name)?.[1]).filter(Boolean).map(Number);
  if (indexes.length) {
    let index = Math.max(...indexes) + 1;
    while (Object.hasOwn(config.profiles, `roles${String(index).padStart(2, '0')}`)) index++;
    return `roles${String(index).padStart(2, '0')}`;
  }
  let index = 2, name = `${config.active_profile}_copy`;
  while (Object.hasOwn(config.profiles, name)) name = `${config.active_profile}_copy${index++}`;
  return name;
}

function requestedProfileName({ generateWhenUnchanged = false } = {}) {
  const input = $('routing-profile-name');
  let name = input.value.trim();
  if (generateWhenUnchanged && name === routingEditor.config.active_profile) name = nextProfileName(routingEditor.config);
  if (!/^[a-z][a-z0-9_]*$/.test(name)) {
    routingFeedback('Use um nome em minúsculas, começando por letra e contendo somente letras, números ou _.', true);
    input.focus();
    return null;
  }
  return name;
}

function duplicateRoutingProfile() {
  if (!routingEditor?.config.profiles) return;
  const { config } = routingEditor;
  const name = requestedProfileName({ generateWhenUnchanged: true });
  if (!name) return;
  if (Object.hasOwn(config.profiles, name)) { routingFeedback(`O perfil ${name} já existe.`, true); return; }
  const source = config.profiles[config.active_profile];
  config.profiles[name] = { ...JSON.parse(JSON.stringify(source)), enabled: true, fallback_use: false, fallback_profiles: [] };
  config.active_profile = name;
  markRoutingDirty();
  renderRoutingEditor();
  routingFeedback(`Perfil ${name} criado como cópia. Ajuste os modelos e salve.`);
}

function renameRoutingProfile() {
  if (!routingEditor?.config.profiles) return;
  const { config } = routingEditor;
  const previous = config.active_profile;
  const name = requestedProfileName();
  if (!name || name === previous) return;
  if (Object.hasOwn(config.profiles, name)) { routingFeedback(`O perfil ${name} já existe.`, true); return; }
  const renamed = {};
  for (const [key, value] of Object.entries(config.profiles)) renamed[key === previous ? name : key] = value;
  for (const profile of Object.values(renamed)) profile.fallback_profiles = (profile.fallback_profiles || []).map(key => key === previous ? name : key);
  config.profiles = renamed;
  config.active_profile = name;
  markRoutingDirty();
  renderRoutingEditor();
  routingFeedback(`Perfil renomeado para ${name}. Salve para confirmar.`);
}

function deleteRoutingProfile() {
  if (!routingEditor?.config.profiles) return;
  const { config } = routingEditor;
  const names = Object.keys(config.profiles);
  if (names.length <= 1) { routingFeedback('Mantenha pelo menos um perfil.', true); return; }
  const removed = config.active_profile;
  const next = names.find(name => name !== removed);
  const fallbackReferences = Object.values(config.profiles).filter(profile => (profile.fallback_profiles || []).includes(removed)).length;
  pendingProfileDeletion = { removed, next };
  $('confirm-profile-delete-title').textContent = `Excluir ${removed}?`;
  $('confirm-profile-delete-copy').textContent = `O perfil será removido da configuração em edição. ${next} assumirá como perfil ativo.`;
  const fallbackImpact = fallbackReferences === 1
    ? '1 referência de fallback também será removida. '
    : fallbackReferences > 1 ? `${fallbackReferences} referências de fallback também serão removidas. ` : '';
  $('confirm-profile-delete-impact').textContent = `${fallbackImpact}A mudança só será gravada ao salvar; Cancelar o editor mantém o arquivo atual.`;
  $('confirm-profile-delete').showModal();
}

function applyRoutingProfileDeletion() {
  if (!routingEditor?.config.profiles || !pendingProfileDeletion) return;
  const { config } = routingEditor;
  const { removed, next } = pendingProfileDeletion;
  if (!Object.hasOwn(config.profiles, removed) || !Object.hasOwn(config.profiles, next)) {
    $('confirm-profile-delete').close();
    pendingProfileDeletion = null;
    routingFeedback('A lista de perfis mudou. Revise a configuração antes de excluir.', true);
    return;
  }
  delete config.profiles[removed];
  for (const profile of Object.values(config.profiles)) profile.fallback_profiles = (profile.fallback_profiles || []).filter(name => name !== removed);
  config.active_profile = next;
  $('confirm-profile-delete').close();
  pendingProfileDeletion = null;
  markRoutingDirty();
  renderRoutingEditor();
  routingFeedback(`Perfil ${removed} removido. O perfil ativo agora é ${next}; salve para confirmar.`);
}

function renderRoutingEditor() {
  const { config, options } = routingEditor;
  const profile = $('routing-active-profile');
  const names = config.profiles ? Object.keys(config.profiles).filter(name => config.profiles[name].enabled !== false) : ['legacy'];
  profile.replaceChildren(...names.map(name => new Option(name, name, false, name === (config.active_profile || 'legacy'))));
  profile.disabled = !config.profiles;
  profile.onchange = () => { config.active_profile = profile.value; markRoutingDirty(); renderRoutingEditor(); };
  $('routing-parallel').value = config.parallel?.max_concurrent_lanes || 2;
  $('routing-profile-tools').hidden = !config.profiles;
  $('routing-profile-name').value = config.active_profile || 'legacy';
  $('delete-profile').disabled = !config.profiles || names.length <= 1;

  const fallbackRoot = $('routing-fallback');
  fallbackRoot.replaceChildren();
  if (config.profiles) {
    const active = config.profiles[config.active_profile];
    const label = el('label', 'routing-check');
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox'; checkbox.checked = active.fallback_use === true;
    checkbox.onchange = () => { active.fallback_use = checkbox.checked; markRoutingDirty(); renderRoutingEditor(); };
    label.append(checkbox, el('span', '', 'Usar fallback automático'));
    fallbackRoot.append(label);
    const choices = el('div', 'routing-fallback-list');
    choices.append(el('span', 'small muted', 'Ordem dos perfis alternativos:'));
    for (const name of names.filter(name => name !== config.active_profile)) {
      const fallbackLabel = el('label', 'routing-check compact');
      const selected = document.createElement('input');
      selected.type = 'checkbox'; selected.checked = (active.fallback_profiles || []).includes(name);
      selected.disabled = !active.fallback_use;
      selected.onchange = () => {
        active.fallback_profiles ||= [];
        active.fallback_profiles = selected.checked
          ? [...active.fallback_profiles.filter(item => item !== name), name]
          : active.fallback_profiles.filter(item => item !== name);
        markRoutingDirty(); renderRoutingEditor();
      };
      fallbackLabel.append(selected, el('span', '', name)); choices.append(fallbackLabel);
    }
    if (names.length === 1) choices.append(el('span', 'small muted', 'Crie outro perfil para usá-lo como fallback.'));
    fallbackRoot.append(choices);
  }

  const root = $('routing-role-fields');
  root.replaceChildren();
  for (const [key, role] of Object.entries(editorRoleMap())) {
    const fieldset = el('fieldset', 'routing-role');
    fieldset.append(el('legend', '', roleTitle(key)));
    const grid = el('div', 'routing-grid');
    const hostLabel = el('label', '', 'Harness');
    const host = document.createElement('select');
    host.replaceChildren(...options.hosts.map(item => new Option(item.host, item.host, false, item.host === role.host)));
    hostLabel.append(host);
    const modelLabel = el('label', '', 'Modelo');
    const model = document.createElement('input');
    const listId = `routing-models-${key}`;
    const datalist = document.createElement('datalist'); datalist.id = listId;
    model.setAttribute('list', listId); model.autocomplete = 'off'; model.value = role.model;
    modelLabel.append(model, datalist);
    const effortLabel = el('label', '', 'Esforço');
    const effort = document.createElement('select');
    effortLabel.append(effort);
    const signature = el('p', 'routing-signature small');
    const syncOptions = () => {
      datalist.replaceChildren(...(options.models[host.value] || []).map(name => new Option(name)));
      const levels = options.hosts.find(item => item.host === host.value)?.efforts || [];
      effort.replaceChildren(new Option('Padrão do modelo', ''), ...levels.map(level => new Option(level, level)));
      effort.value = role.reasoning_effort || '';
    };
    const syncRole = () => {
      role.host = host.value;
      role.model = model.value.trim();
      role.reasoning_effort = effort.value || null;
      const found = matchingSignature(role);
      signature.className = `routing-signature small ${found?.state === 'valid' ? 'valid' : 'invalid'}`;
      signature.textContent = found ? `Assinatura: ${found.state}${found.reason ? ` · ${found.reason}` : ''}${found.unattended ? ` · autônomo ${found.unattended}` : ''}` : 'Assinatura: ainda não validada';
    };
    host.onchange = () => { role.host = host.value; role.reasoning_effort = null; syncOptions(); syncRole(); markRoutingDirty(); };
    model.oninput = () => { syncRole(); markRoutingDirty(); }; effort.onchange = () => { syncRole(); markRoutingDirty(); };
    syncOptions(); syncRole();
    grid.append(hostLabel, modelLabel, effortLabel);
    fieldset.append(grid, signature); root.append(fieldset);
  }
}

async function openRoutingEditor() {
  $('routing-dialog').showModal();
  $('routing-role-fields').replaceChildren(el('p', 'muted', 'Lendo a configuração do projeto…'));
  $('routing-feedback').textContent = '';
  $('save-routing').disabled = true;
  try {
    const data = await getJSON('/api/routing');
    routingEditor = { digest: data.digest, config: JSON.parse(JSON.stringify(data.config)), options: data.options, dirty: false };
    renderRoutingEditor();
    $('save-routing').disabled = false;
  } catch (error) {
    routingEditor = null;
    $('routing-role-fields').replaceChildren();
    $('routing-feedback').className = 'small severity high';
    $('routing-feedback').textContent = error.message;
  }
}

async function saveRouting(event) {
  event.preventDefault();
  if (!routingEditor || !actionToken) return;
  routingEditor.config.parallel ||= {};
  routingEditor.config.parallel.max_concurrent_lanes = Number($('routing-parallel').value);
  $('save-routing').disabled = true;
  $('routing-feedback').className = 'small muted';
  $('routing-feedback').textContent = 'Validando e salvando…';
  try {
    const response = await fetch('/api/routing', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Aioson-Action': actionToken }, body: JSON.stringify({ expected_digest: routingEditor.digest, config: routingEditor.config }) });
    const result = await response.json();
    if (!response.ok) throw new Error(`${result.error || 'Não foi possível salvar.'}${result.errors?.length ? ` ${result.errors.map(item => `${item.path}: ${item.message}`).join('; ')}` : ''}`);
    routingEditor = { digest: result.digest, config: JSON.parse(JSON.stringify(result.config)), options: result.options, dirty: false };
    $('routing-feedback').className = 'small routing-saved';
    $('routing-feedback').textContent = result.message;
    renderRoutingEditor();
    await refresh();
  } catch (error) {
    $('routing-feedback').className = 'small severity high';
    $('routing-feedback').textContent = error.message;
  } finally { $('save-routing').disabled = false; }
}

async function validateRouting() {
  if (!routingEditor || !actionToken) return;
  routingEditor.config.parallel ||= {};
  routingEditor.config.parallel.max_concurrent_lanes = Number($('routing-parallel').value);
  const button = $('validate-routing');
  button.disabled = true;
  routingFeedback('Conferindo estrutura, assinaturas locais e fallbacks…');
  try {
    const response = await fetch('/api/routing/validate', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Aioson-Action': actionToken }, body: JSON.stringify({ config: routingEditor.config }) });
    const result = await response.json();
    if (!response.ok) throw new Error(`${result.message || result.error || 'Configuração inválida.'}${result.errors?.length ? ` ${result.errors.map(item => `${item.path}: ${item.message}`).join('; ')}` : ''}`);
    const root = $('routing-validation'); root.hidden = false; root.replaceChildren();
    root.className = `routing-validation ${result.ok ? 'valid' : 'invalid'}`;
    root.append(el('strong', '', result.ok ? 'Configuração pronta' : 'Configuração precisa de atenção'), el('p', 'small', result.message));
    for (const check of result.checks || []) {
      const effective = check.effective;
      root.append(el('div', `routing-validation-row ${check.ok ? 'valid' : 'invalid'}`, `${roleTitle(check.role)} · ${check.ok ? 'pronto' : `assinatura ${check.primary.signature_state}`}${check.fallback_used ? ` · fallback ${effective.profile}: ${effective.host}/${effective.model}` : ''}`));
    }
    if (result.commands?.length) {
      root.append(el('p', 'small muted', 'Valide os modelos ausentes em um terminal:'));
      for (const command of result.commands) root.append(el('code', 'routing-command', command));
    }
    root.append(el('p', 'small muted', 'Esta conferência usa assinaturas locais em cache e não chama nenhum modelo.'));
    routingFeedback(result.ok ? 'Validação concluída: o perfil pode ser usado no próximo disparo.' : 'Validação concluída com pendências.', !result.ok);
  } catch (error) { routingFeedback(error.message, true); }
  finally { button.disabled = false; }
}

function tokenNumber(value) { return typeof value === 'number' ? value.toLocaleString('pt-BR') : 'Não informado'; }
function costLabel(cost) { return typeof cost?.usd === 'number' ? `$${cost.usd.toFixed(4)}${typeof cost.usd_upper === 'number' ? `–$${cost.usd_upper.toFixed(4)} (faixa estimada)` : cost.complete ? '' : ' (parcial)'}` : 'Não informado'; }
function inputLabel(usage) { return usage?.input_basis === 'inclusive' ? 'Entrada total (cache incluído)' : 'Entrada reportada (base do harness)'; }

const expandedUsageWaves = new Set();

function waveBreakdown(wave) {
  const content = el('div', 'wave-breakdown');
  const measured = (wave.models || []).filter(model => model.total_tokens !== null);
  const leaders = measured.filter(model => model.total_tokens === measured[0]?.total_tokens);
  const ranking = leaders.length
    ? `Maior consumo registrado${leaders.length > 1 ? ' (empate)' : ''}: ${leaders.map(model => `${model.model || 'Modelo não informado'} · ${model.host || 'Harness não informado'}`).join('; ')} — ${tokenNumber(leaders[0].total_tokens)} tokens de entrada + saída reportadas${wave.usage.complete ? '' : ' · comparação parcial'}.`
    : 'Sem tokens suficientes para comparar modelos nesta onda.';
  content.append(el('p', 'wave-usage-leader', ranking), el('p', 'muted small', 'Ordenado por entrada + saída registradas. A coluna de cache é um detalhamento quando o harness informa entrada inclusiva; quando a base é desconhecida, não é somada para evitar contagem dupla. Inclui falhas e retrabalho.'));
  const unitSection = el('section', 'wave-unit-section');
  unitSection.append(el('h3', '', `Fases e unidades desta onda (${wave.units?.length || 0})`));
  const unitList = el('div', 'wave-unit-list');
  for (const unit of wave.units || []) {
    const card = el('article', 'wave-unit');
    card.append(el('h4', '', `${phaseLabel(unit)}${unit.lane ? ` · ${human(unit.lane)}` : ''}`));
    if (unit.scope) card.append(el('p', 'wave-unit-scope', unit.scope));
    const states = [unit.dev_status ? `DEV ${labels[unit.dev_status] || unit.dev_status}` : null, unit.qa_status ? `QA ${labels[unit.qa_status] || unit.qa_status}` : null].filter(Boolean).join(' · ');
    card.append(el('p', 'muted small', `${states || labels[unit.status] || 'Estado não informado'} · ${unit.attempts} tentativa(s) · ${tokenNumber(unit.total_tokens)} tokens · ${duration(unit.agent_ms)}${unit.file_count != null ? ` · ${unit.file_count} arquivo(s)` : ''}`));
    unitList.append(card);
  }
  if (!unitList.children.length) unitList.append(el('p', 'muted', 'O plano desta execução não preservou os nomes das fases.'));
  unitSection.append(unitList); content.append(unitSection);
  const roles = el('div', 'wave-role-list');
  for (const role of wave.roles || []) {
    const card = el('article', 'wave-role');
    card.append(el('h3', '', `${role.lane ? human(role.lane) : 'Área não informada'} / ${role.stage ? role.stage.toUpperCase() : 'Etapa não informada'}`), el('p', 'wave-role-model', role.model || 'Modelo não informado'), el('p', 'muted small', `${role.host || 'Harness não informado'} · ${role.attempts} tentativa(s) · ${role.usage.measured_attempts} com uso informado${role.usage.complete ? '' : ' · parcial'}`));
    const values = el('dl', 'wave-role-values');
    for (const [label, value] of [
      ['Entrada + saída reportadas', tokenNumber(role.total_tokens)], [inputLabel(role.usage), tokenNumber(role.usage.input_tokens)],
      ['Cache lido / criado', `${tokenNumber(role.usage.cache_read_tokens)} / ${tokenNumber(role.usage.cache_write_tokens)}`],
      ['Saída', tokenNumber(role.usage.output_tokens)], ['Tempo dos agentes', duration(role.agent_ms)], ['API estimada (USD)', costLabel(role.cost)]
    ]) {
      const field = el('div'); field.append(el('dt', '', label), el('dd', '', value)); values.append(field);
    }
    card.append(values); roles.append(card);
  }
  if (!roles.children.length) roles.append(el('p', 'muted', 'Nenhuma tentativa registrada nesta onda.'));
  content.append(roles);
  return content;
}

function renderUsage(status) {
  const metrics = status.metrics;
  $('usage-note').textContent = metrics
    ? `${metrics.attempts.length} tentativa(s) · ${metrics.usage.measured_attempts} com uso informado. ${metrics.history_complete ? 'Inclui falhas e retrabalho registrados.' : 'Histórico anterior parcial: somente etapas preservadas.'} Custo equivalente via API; não representa cobrança da assinatura. A base da entrada varia por harness; cache fica separado quando a inclusão não pode ser comprovada. Tokens acumulados não medem a janela de contexto.`
    : 'Métricas ainda não disponíveis. Registros antigos podem não informar tokens.';
  if (status.context_limit_enabled === false) $('usage-note').textContent += ' Corte de contexto do AIOSON desativado nesta execução; limites do harness continuam válidos.';
  if (metrics?.models?.some(model => model.recalculated)) $('usage-note').textContent += ' Codex: estimativa recalculada com tabela oficial OpenAI Standard; tarifas e valores originais preservados. A faixa cobre contexto curto/longo quando faltam dados por chamada; não inclui ferramentas ou outros níveis de serviço.';
  const focusedWave = document.activeElement?.dataset.usageWave;
  $('usage-waves').replaceChildren(...(metrics?.waves || []).flatMap((wave, index) => {
    const row = el('tr');
    const usage = wave.usage;
    const key = JSON.stringify([status.feature, status.run?.run_id, wave.wave]);
    const open = expandedUsageWaves.has(key);
    const cell = el('td'), toggle = el('button', 'wave-usage-toggle', `${open ? '▾' : '▸'} Onda ${wave.wave}`);
    toggle.type = 'button'; toggle.dataset.usageWave = String(wave.wave);
    toggle.setAttribute('aria-expanded', String(open)); toggle.setAttribute('aria-controls', `wave-usage-detail-${index}`);
    cell.append(toggle);
    row.append(cell, ...[duration(wave.wall_ms), duration(wave.agent_ms), tokenNumber(usage.input_tokens), `${tokenNumber(usage.cache_read_tokens)} / ${tokenNumber(usage.cache_write_tokens)}`, tokenNumber(usage.output_tokens), costLabel(wave.cost)].map(value => el('td', '', value)));
    const detail = el('tr', 'wave-usage-detail'), body = el('td', 'wave-breakdown-cell');
    detail.id = `wave-usage-detail-${index}`; detail.hidden = !open; body.colSpan = 7;
    if (open) body.append(waveBreakdown(wave));
    detail.append(body);
    toggle.onclick = () => { if (expandedUsageWaves.has(key)) expandedUsageWaves.delete(key); else expandedUsageWaves.add(key); renderUsage(status); };
    return [row, detail];
  }));
  if (focusedWave) [...$('usage-waves').querySelectorAll('[data-usage-wave]')].find(button => button.dataset.usageWave === focusedWave)?.focus({ preventScroll: true });
  $('usage-models')?.replaceChildren(...(metrics?.models || []).map(model => {
    const item = el('div', 'finding');
    item.append(el('h3', '', `${model.model} · ${model.host}`), el('p', '', `${model.attempts} tentativas · entrada reportada: ${tokenNumber(model.usage.input_tokens)} · entrada sem cache derivável: ${tokenNumber(model.usage.uncached_input_tokens)} · cache lido: ${tokenNumber(model.usage.cache_read_tokens)} · saída: ${tokenNumber(model.usage.output_tokens)} · ${costLabel(model.cost)}`));
    const tariff = model.tariff;
    if (tariff) {
      const rate = value => typeof value === 'number' ? `$${(value * 1e6).toFixed(2)}` : 'não informada';
      item.append(el('p', '', `${tariff.provider} ${tariff.service_tier || ''} · por 1 milhão: entrada ${rate(tariff.rates.input)} / cache lido ${rate(tariff.rates.cache_read)} / saída ${rate(tariff.rates.output)} · referência ${tariff.fetched_at?.slice(0, 10) || 'não informada'}`));
      item.append(el('p', 'muted small', `Fonte: ${tariff.source}`));
      if (tariff.long_context) item.append(el('p', 'muted small', 'Acima de 272 mil tokens de entrada por chamada: entrada/cache 2×; saída 1,5×. O total acumulado da onda não determina essa faixa.'));
    }
    return item;
  }));
}

function activityText(unit, status) {
  if (interruptedUnit(unit, status)) return { text: 'Execução interrompida', path: 'O registro anterior será retomado; não há worker ativo confirmado.' };
  const active = status.running?.find(item => item.unit === unit.id);
  if (active) {
    if (!status.engine?.alive) return { text: 'Motor sem sinal', path: 'Última atividade registrada; processo não confirmado.' };
    const live = active.live;
    if (!live) return { text: 'Primeira medição pendente', path: `${active.host} / ${active.model}` };
    if (live.measured === false) return { text: 'Arquivos não medidos', path: `${active.host} / ${active.model}` };
    const actionLabels = { dispatch: 'Iniciando o modelo', view_file: 'Lendo arquivo', grep_search: 'Buscando no código', list_dir: 'Listando arquivos', find_by_name: 'Localizando arquivo', run_command: 'Executando comando', write_to_file: 'Escrevendo arquivo', replace_file_content: 'Alterando arquivo', multi_replace_file_content: 'Alterando arquivos' };
    const action = live.last_action;
    const actionAge = action?.at ? Math.max(0, Date.now() - Date.parse(action.at)) : null;
    const currentAction = action && Number.isFinite(actionAge) && actionAge < 180000
      ? `${actionLabels[action.tool] || human(action.tool)}${action.target ? ` · ${action.target}` : ''}`
      : null;
    const write = live.last_write_age_ms == null ? 'Sem escrita observada' : `Escrita há ${duration(live.last_write_age_ms)}`;
    const round = Number(unit.rework?.rounds) || 0;
    const contractRepair = unit.invalidation ? `Revalidação após ${unit.invalidation.producer} · ` : '';
    const recovery = round > 0 ? `${unit.qa?.status === 'running' ? 'Revisão da correção' : 'Correção'} ${round} · ` : '';
    return { text: `${active.stage.toUpperCase()} · ${contractRepair}${recovery}${currentAction || `${live.files_changed ?? 0} arquivo(s) · ${write}`}${live.stalled ? ' · Sem atividade recente' : ''}`, path: currentAction ? `${action.host} / ${action.model}` : live.last_write_path || `${active.routing_profile ? `${active.routing_profile} · ` : ''}${active.host} / ${active.model}` };
  }
  const waiting = status.observation.waiting.find(item => item.unit === unit.id);
  if (waiting) return { text: waiting.reason === 'write_conflict' ? 'Aguardando arquivos compartilhados' : waitLabels[waiting.reason], path: unit.invalidation ? `Revalidação após ${unit.invalidation.producer} · ${waiting.blocked_by.length ? `${waiting.blocked_by.length} unidade(s) pendente(s)` : 'na ordem do plano'}` : waiting.blocked_by.length ? `${waiting.blocked_by.length} unidade(s) pendente(s)` : 'Na ordem do plano' };
  if (unit.owner === 'integration') return { text: 'Integração pelo DEV supervisor', path: 'Etapa fora dos processos de unidade' };
  if (unit.pending_decision) return { text: 'Decisão necessária', path: unit.pending_decision.reason };
  return { text: unit.qa?.status === 'failed' ? 'Revisar os achados de QA' : 'Etapa finalizada', path: '' };
}

function interruptedUnit(unit, status) {
  return !status.engine?.alive && ['dev', 'qa'].some(stage => unit[stage]?.status === 'running');
}

function renderUnits() {
  if (!current) return;
  const focused = document.activeElement?.dataset.unit;
  const wave = $('wave').value;
  const units = (current.units || []).filter(unit => (wave === 'all' || String(unit.wave) === wave) && (filter === 'all' || (filter === 'running' ? current.running?.some(item => item.unit === unit.id) : unit.qa?.status === 'failed' || unit.pending_decision || interruptedUnit(unit, current) || current.running?.some(item => item.unit === unit.id && item.live?.stalled))));
  $('units').replaceChildren(...units.map(unit => {
    const row = el('tr');
    const name = el('td');
    const button = el('button', 'unit-name', `${unitName(unit.id)} / ${unitStageLabel(unit, current)}`);
    button.type = 'button';
    button.dataset.unit = unit.id;
    button.onclick = () => openDetail(unit.id);
    name.append(button, el('div', 'unit-sub', `ONDA ${unit.wave} · ${phaseLabel(unit).toUpperCase()}`));
    const displayStage = stage => !current.engine?.alive && unit[stage]?.status === 'running' ? 'interrupted' : unit[stage]?.status;
    const dev = el('td'); dev.append(badge(displayStage('dev'), unit.dev?.reason));
    const qa = el('td'); qa.append(badge(displayStage('qa'), unit.qa?.reason));
    if (unit.qa?.status === 'pending' && current.running?.some(item => item.unit === unit.id && item.stage === 'dev')) {
      qa.append(el('div', 'unit-sub', 'Aguardando entrega do DEV'));
    }
    const activity = el('td', 'activity');
    const info = activityText(unit, current);
    activity.append(el('span', '', info.text), el('span', 'activity-path', info.path));
    const active = current.running?.find(item => item.unit === unit.id);
    row.append(name, dev, qa, activity, el('td', '', duration(active?.elapsed_ms ?? unit.qa?.elapsed_ms ?? unit.dev?.elapsed_ms)));
    return row;
  }));
  $('unit-empty').hidden = units.length > 0;
  if (focused) [...$('units').querySelectorAll('[data-unit]')].find(node => node.dataset.unit === focused)?.focus({ preventScroll: true });
  document.querySelectorAll('[data-filter]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.filter === filter)));
  $('waves').replaceChildren(...(current.waves || []).map(item => {
    const unitCount = item.units?.length || 0;
    const button = el('button', `wave-button ${item.status}`, `${item.units.every(unit => unit.owner === 'integration') ? 'Integração' : `Onda ${item.wave}`} · ${unitCount} unidade${unitCount === 1 ? '' : 's'} · ${labels[item.status] || item.status}`);
    button.type = 'button'; button.setAttribute('aria-pressed', String(String(item.wave) === wave));
    button.onclick = () => { $('wave').value = String(item.wave); renderUnits(); };
    return button;
  }));
}

function renderAttention(status) {
  const openFindings = new Set([...$('findings').querySelectorAll('details[open]')].map(node => node.dataset.index));
  const findings = status.findings || [];
  $('finding-count').textContent = findings.length;
  $('findings').replaceChildren(...findings.map((finding, index) => {
    const node = el('details', 'finding'); node.dataset.index = String(index); node.open = openFindings.has(String(index));
    const title = el('summary'); title.append(el('span', `severity ${finding.severity || ''}`, finding.severity || 'nota'), document.createTextNode(finding.unit ? unitName(finding.unit) : finding.check || 'Execução'));
    node.append(title, el('div', 'unit-sub', `${finding.source || 'run'}${finding.path ? ` · ${finding.path}` : ''}`), el('p', '', finding.summary || finding.message || finding.text || finding.check));
    return node;
  }));
  if (!findings.length) $('findings').append(el('p', 'muted small', 'Nenhum achado registrado até agora.'));
  $('decisions').replaceChildren(...(status.decisions_pending || []).map(decision => {
    const node = el('article', 'decision');
    node.append(el('h3', '', `${unitName(decision.unit)} / ${decision.stage}`), el('p', '', decision.reason), el('code', '', decision.hint));
    const retry = el('button', '', 'Tentar corrigir esta unidade');
    retry.type = 'button'; retry.disabled = !canRecover(status);
    retry.onclick = () => recoverExecution(decision.unit);
    node.append(retry);
    return node;
  }));
  $('events').replaceChildren(...status.observation.events.slice(0, 12).map(event => {
    const node = el('div', 'event');
    const at = el('time', '', time(event.at)); at.dateTime = event.at; at.title = new Date(event.at).toLocaleString('pt-BR');
    const content = el('div');
    content.append(el('div', 'event-title', `${unitName(event.unit)} · ${(event.stage || '').toUpperCase()} ${event.type === 'started' ? 'iniciado' : event.type === 'decision' ? event.choice : labels[event.type] || event.type}`), el('div', 'event-meta', event.host ? `${event.host} / ${event.model}` : event.reason_before || 'Decisão registrada'));
    node.append(at, content); return node;
  }));
  if (!status.observation.events.length) $('events').append(el('p', 'muted small', 'As transições aparecerão quando as unidades iniciarem.'));
}

function render(status) {
  const firstSnapshot = !current || current.feature !== status.feature;
  current = status;
  const actionable = !status.archived && status.run && ['paused', 'decision_required', 'running'].includes(status.run.status) && !status.engine?.alive;
  const repeated = status.engine?.alive && (status.units || []).some(unit => (unit.rework?.rounds || 0) >= 2 && (unit.dev?.status === 'running' || unit.qa?.status === 'running'));
  $('recovery-bar').hidden = !(actionable || repeated || recovering || status.recovery?.busy || status.recovery?.phase === 'failed');
  $('recovery-title').textContent = status.recovery?.phase === 'maintenance' ? 'Correção técnica em andamento pelo supervisor' : repeated ? 'Correções repetidas — entrega ainda não aprovada' : recovering || status.recovery?.busy ? 'Recuperação em andamento' : 'Execução interrompida — precisa de recuperação';
  $('recover-run').disabled = !canRecover(status);
  $('recover-run').textContent = repeated ? 'Correção automática em andamento' : recovering || status.recovery?.busy ? 'Retomada em andamento…' : 'Corrigir e continuar execução';
  const localMessage = actionMessage?.feature === status.feature && actionMessage.run_id === status.run?.run_id ? actionMessage.text : null;
  $('recovery-feedback').textContent = status.recovery?.message || localMessage || (repeated ? 'O motor está repetindo DEV → QA com os achados anteriores. Não está aguardando confirmação; confira a rodada e as evidências de progresso nas unidades.' : 'A execução não terminou. A recuperação preserva o trabalho e as aprovações, reenvia os erros aos modelos configurados e continua com QA.');
  $('empty').hidden = true;
  $('execution').hidden = false;
  $('title').textContent = human(status.feature);
  $('run-status').hidden = false;
  const runState = status.run?.status || (status.state_corrupt ? 'corrupt' : status.state_unreadable ? 'unreadable' : 'not_started');
  $('run-status').replaceWith(Object.assign(badge(runState === 'running' && !status.engine?.alive ? 'interrupted' : runState), { id: 'run-status' }));
  $('subtitle').textContent = status.run ? `RUN ${status.run.run_id.slice(0, 8)} · Início ${new Date(status.run.started_at).toLocaleString('pt-BR')} · Onda ${status.run.current_wave ?? '—'} de ${status.waves.length}` : status.message;
  if (status.until_complete) $('subtitle').textContent += ' · Recuperação automática até aprovação do QA';
  renderMetrics(status); renderRoles(status); renderUsage(status);
  $('pool').textContent = `${status.observation.concurrency.active} de ${status.observation.concurrency.limit ?? '—'} vagas ocupadas`;
  const waveValue = $('wave').value;
  const waveKey = (status.waves || []).map(wave => wave.wave).join(',');
  if ($('wave').dataset.key !== waveKey) {
    $('wave').replaceChildren(new Option('Todas', 'all'), ...(status.waves || []).map(wave => new Option(String(wave.wave), String(wave.wave))));
    $('wave').dataset.key = waveKey;
    if ([...$('wave').options].some(option => option.value === waveValue)) $('wave').value = waveValue;
  }
  if (firstSnapshot && status.run?.current_wave != null) $('wave').value = String(status.run.current_wave);
  const warning = status.state_unreadable ? 'Leitura temporariamente indisponível. Atualizando novamente em alguns segundos.' : status.state_corrupt ? status.message : status.engine?.message;
  $('engine-warning').hidden = !warning;
  $('engine-warning').textContent = warning || '';
  renderUnits(); renderAttention(status);
  $('integration').hidden = !status.integration?.units?.length;
  $('integration').textContent = `Integração final: ${status.integration?.units?.join(', ') || ''}. Responsável: DEV supervisor. A conclusão dos processos de unidade não significa que a feature inteira foi aprovada.`;
  $('updated').textContent = `Última leitura ${new Date(status.observed_at).toLocaleTimeString('pt-BR')} · Atualização a cada 5 s`;
}

function openDetail(id) {
  const unit = current?.units?.find(item => item.id === id);
  if (!unit) return;
  reportGeneration++;
  $('detail-title').textContent = `${unitName(id)} · ${phaseLabel(unit)}`;
  $('report').replaceChildren();
  const body = $('detail-body');
  body.replaceChildren(el('p', 'mono', `${unit.id} · onda ${unit.wave}${unit.file_count != null ? ` · ${unit.file_count} arquivo(s)` : ''}`));
  if (unit.scope) body.append(el('p', '', unit.scope));
  for (const attempt of current.metrics?.attempts?.filter(item => item.unit === id) || []) {
    const item = el('details', 'finding');
    item.append(el('summary', '', `${attempt.stage.toUpperCase()} · tentativa ${attempt.attempt || 'anterior'} · ${attempt.host} / ${attempt.model}`));
    item.append(el('p', '', `Entrada: ${tokenNumber(attempt.usage?.input_tokens)} · Cache lido: ${tokenNumber(attempt.usage?.cache_read_tokens)} · Cache criado: ${tokenNumber(attempt.usage?.cache_write_tokens)} · Saída: ${tokenNumber(attempt.usage?.output_tokens)} · ${costLabel(attempt.cost)}`));
    if (attempt.context_budget) item.append(el('p', '', `Orçamento de contexto: ${tokenNumber(attempt.context_budget.max_tokens)} · Pico informado: ${tokenNumber(attempt.usage?.peak_context_tokens)} · Janela: ${tokenNumber(attempt.context_budget.context_window_tokens)}`));
    if (attempt.cost?.tariff) item.append(el('p', 'muted small', `Tarifa ${attempt.cost.tariff.provider} / ${attempt.cost.tariff.id} · ${attempt.cost.tariff.fetched_at} · ${attempt.cost.tariff.source}`));
    body.append(item);
  }
  const waiting = current.observation.waiting.find(item => item.unit === id);
  if (waiting) body.append(el('p', '', `${waitLabels[waiting.reason]}${waiting.blocked_by.length ? `: ${waiting.blocked_by.join(', ')}` : '. As vagas são compartilhadas pelos fluxos DEV → QA, na ordem do plano.'}`));
  for (const stage of ['dev', 'qa']) {
    const actual = unit[stage];
    const planned = current.observation.assignments.find(role => role.lane === unit.lane && role.stage === stage);
    const section = el('section', 'detail-section');
    section.append(el('h3', '', stage.toUpperCase()), el('p', '', `Estado: ${labels[actual?.status] || actual?.status || '—'}`), el('p', '', `Planejado: ${planned?.host || '—'} / ${planned?.model || '—'}`), el('p', '', `Registrado: ${actual?.host || 'Não iniciado'}${actual?.model ? ` / ${actual.model}` : ''}`));
    if (actual?.report) {
      const button = el('button', 'quiet', `Ler relatório ${stage.toUpperCase()}`);
      button.type = 'button'; button.onclick = () => showReport(id, stage); section.append(button);
    }
    body.append(section);
  }
  const messages = (current.mailbox || []).filter(message => message.from === id);
  if (messages.length) {
    const section = el('section', 'detail-section'); section.append(el('h3', '', 'Mensagens da unidade'));
    for (const message of messages) section.append(el('p', '', `${message.to}: ${message.text}`));
    body.append(section);
  }
  $('detail').showModal();
}

async function showReport(unit, stage) {
  const request = ++reportGeneration;
  $('report').replaceChildren(el('p', 'muted', 'Carregando relatório…'));
  try {
    const report = await getJSON(`${apiPath('report')}?unit=${encodeURIComponent(unit)}&stage=${stage}`);
    if (request !== reportGeneration) return;
    $('report').replaceChildren(el('h3', '', `Relatório ${stage.toUpperCase()}`), el('pre', '', JSON.stringify(report, null, 2)));
  } catch (error) { if (request === reportGeneration) $('report').replaceChildren(el('p', 'severity high', error.message)); }
}

async function refresh() {
  clearTimeout(timer);
  const request = ++generation;
  $('refresh').disabled = true;
  try {
    const data = await getJSON('/api/features');
    if (request !== generation) return;
    features = data.features;
    actionToken = data.action_token || null;
    selected ||= data.initial_feature || features[0]?.feature;
    $('project').textContent = data.project;
    renderFeatures();
    if (selected) {
      const status = await getJSON(apiPath('status'));
      if (request !== generation) return;
      // A transient replacement must not erase the last useful view.
      if (status.state_unreadable && current) throw new Error('Estado temporariamente ilegível. Exibindo a última leitura.');
      render(status);
    } else {
      $('execution').hidden = true; $('empty').hidden = false;
      $('run-status').hidden = true;
    }
    lastSuccess = new Date();
    $('connection').textContent = `● Ao vivo · ${time(lastSuccess)}`;
    $('connection').classList.remove('offline');
    $('error').hidden = true;
  } catch (error) {
    if (request !== generation) return;
    $('error').textContent = `${error.message} Nova tentativa automática em 5 s.${lastSuccess ? ` Última leitura válida: ${time(lastSuccess)}.` : ''}`;
    $('error').hidden = false;
    $('connection').textContent = 'Sem atualização';
    $('connection').classList.add('offline');
  } finally {
    if (request === generation) { $('refresh').disabled = false; timer = setTimeout(refresh, 5000); }
  }
}

function canRecover(status) {
  return Boolean(actionToken && !status.archived && status.run && ['paused', 'decision_required', 'running'].includes(status.run.status) && !status.engine?.alive && !status.recovery?.busy && !recovering);
}

async function recoverExecution(unit) {
  if (!canRecover(current)) return;
  const feature = current.feature, runId = current.run.run_id;
  recovering = true;
  actionMessage = { feature, run_id: runId, text: 'Enviando a solicitação de recuperação…' };
  render(current);
  try {
    const response = await fetch(`/api/features/${encodeURIComponent(feature)}/recover`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Aioson-Action': actionToken }, body: JSON.stringify({ run_id: runId, ...(unit ? { unit } : {}) }) });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Não foi possível retomar a execução.');
    actionMessage = { feature, run_id: runId, text: result.message };
  } catch (error) { actionMessage = { feature, run_id: runId, text: error.message }; }
  finally { recovering = false; await refresh(); }
}

$('search').addEventListener('input', renderFeatures);
$('refresh').addEventListener('click', refresh);
$('recover-run').addEventListener('click', () => recoverExecution());
$('edit-routing').addEventListener('click', openRoutingEditor);
$('routing-form').addEventListener('submit', saveRouting);
$('routing-parallel').addEventListener('input', markRoutingDirty);
$('duplicate-profile').addEventListener('click', duplicateRoutingProfile);
$('rename-profile').addEventListener('click', renameRoutingProfile);
$('delete-profile').addEventListener('click', deleteRoutingProfile);
$('cancel-profile-delete').addEventListener('click', () => { pendingProfileDeletion = null; $('confirm-profile-delete').close(); });
$('apply-profile-delete').addEventListener('click', applyRoutingProfileDeletion);
$('confirm-profile-delete').addEventListener('cancel', () => { pendingProfileDeletion = null; });
$('validate-routing').addEventListener('click', validateRouting);
$('close-routing').addEventListener('click', () => $('routing-dialog').close());
$('cancel-routing').addEventListener('click', () => $('routing-dialog').close());
$('wave').addEventListener('change', renderUnits);
document.querySelectorAll('[data-filter]').forEach(button => button.addEventListener('click', () => { filter = button.dataset.filter; renderUnits(); }));
$('close-detail').onclick = () => $('detail').close();
$('detail').addEventListener('close', () => { reportGeneration++; });
function setTheme(theme) {
  document.documentElement.dataset.theme = theme;
  $('theme').textContent = theme === 'dark' ? 'Porcelana' : 'Tinta';
  try { localStorage.setItem('aioson-execution-theme', theme); } catch { /* Private browser storage may be disabled. */ }
}
$('theme').onclick = () => setTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark');
try { setTheme(localStorage.getItem('aioson-execution-theme') === 'light' ? 'light' : 'dark'); } catch { setTheme('dark'); }
refresh();
