'use strict';

const { observeExecution } = require('./execution-observation');

const labels = { running: 'executando', passed: 'aprovado', failed: 'reprovado', crashed: 'falhou', unavailable: 'indisponível', pending: 'aguardando', skipped: 'dispensado', not_applicable: '—', decision_required: 'decisão', paused: 'pausado', completed: 'concluído', cancelled: 'cancelado', integration: 'integração' };
const waits = { capacity: 'aguarda vaga', dependencies: 'aguarda dependências', previous_wave: 'aguarda onda anterior', run_paused: 'execução pausada', engine_missing: 'motor sem sinal' };
function clean(value) { return Array.from(String(value ?? ''), char => char.codePointAt(0) < 32 || (char.codePointAt(0) >= 127 && char.codePointAt(0) <= 159) ? ' ' : char).join('').replace(/\s+/g, ' ').trim(); }
function duration(ms) { return ms == null ? '—' : ms >= 3600000 ? `${Math.floor(ms / 3600000)}h ${Math.floor(ms % 3600000 / 60000)}m` : ms >= 60000 ? `${Math.floor(ms / 60000)}m ${Math.floor(ms % 60000 / 1000)}s` : `${Math.floor(ms / 1000)}s`; }
function fit(value, width) { const chars = Array.from(clean(value)); return chars.length > width ? `${chars.slice(0, width - 1).join('')}…` : chars.join('').padEnd(width); }
function wrap(value, width) {
  const words = clean(value).split(' ');
  const lines = [];
  let line = '';
  for (let word of words) {
    if (line && line.length + word.length + 1 > width) { lines.push(line); line = ''; }
    while (word.length > width) { lines.push(word.slice(0, width)); word = word.slice(width); }
    line += `${line ? ' ' : ''}${word}`;
  }
  if (line) lines.push(line);
  return lines;
}

function renderMonitor(status, { columns = 100 } = {}) {
  const width = Math.max(24, Math.min(160, columns || 100));
  const lines = [];
  const add = text => lines.push(...wrap(text, width));
  add(`AIOSON / EXECUÇÃO · ${status.feature}`);
  lines.push('─'.repeat(width));
  if (!status.run) { add(status.message || 'Nenhuma execução iniciada.'); return lines; }
  const obs = status.observation || observeExecution(status);
  const c = obs.counts;
  add(`${labels[status.run.status] || status.run.status} · onda ${status.run.current_wave ?? '—'}/${status.waves.length} · motor ${status.engine?.alive ? `ativo · sinal há ${duration(status.engine.age_ms)}` : status.engine?.state === 'idle' ? 'inativo' : 'SEM SINAL'}`);
  add(`DEV ${c.dev_passed}/${c.total} · QA ${c.qa_passed} aprovado(s), ${c.qa_failed} reprovado(s) · ${c.findings} achado(s)`);
  add(`DEV + QA aprovados: ${c.accepted}/${c.total} · Em execução: ${obs.concurrency.active}/${obs.concurrency.limit ?? '—'} unidades`);
  lines.push('');
  const focus = (status.units || []).filter(unit => unit.wave === status.run.current_wave || unit.qa?.status === 'failed' || unit.pending_decision || unit.dev?.status === 'running' || unit.qa?.status === 'running');
  const nameWidth = Math.max(10, width - 38);
  if (width >= 65) lines.push(`${fit('UNIDADE', nameWidth)}  ${fit('DEV', 11)}  ${fit('QA', 11)}  TEMPO`);
  for (const unit of focus) {
    const active = (status.running || []).find(item => item.unit === unit.id);
    const dev = labels[unit.dev?.status] || unit.dev?.status || '—';
    const qa = labels[unit.qa?.status] || unit.qa?.status || '—';
    if (width >= 65) lines.push(`${fit(unit.id, nameWidth)}  ${fit(dev, 11)}  ${fit(qa, 11)}  ${fit(duration(active?.elapsed_ms), 8)}`.trimEnd());
    else { add(unit.id); add(`  DEV ${dev} / QA ${qa} · ${duration(active?.elapsed_ms)}`); }
    if (active) {
      add(`  ${active.stage.toUpperCase()} · ${active.host} / ${active.model}`);
      const live = active.live;
      add(!live ? '  Aguardando primeira medição.' : live.measured === false ? '  Atividade de arquivos não medida.' : live.last_action ? `  ação: ${live.last_action.tool}${live.last_action.target ? ` · ${live.last_action.target}` : ''} · ${live.last_action.host} / ${live.last_action.model}` : `  ${live.files_changed ?? 0} arquivo(s) · ${live.last_write_age_ms == null ? 'sem escrita observada' : `escrita há ${duration(live.last_write_age_ms)} · ${live.last_write_path || ''}`}${live.stalled ? ' · sem atividade recente' : ''}`);
    } else {
      const waiting = obs.waiting.find(item => item.unit === unit.id);
      if (waiting) add(`  ${waits[waiting.reason]}${waiting.blocked_by.length ? `: ${waiting.blocked_by.join(', ')}` : ''}`);
    }
  }
  const remaining = (status.units || []).length - focus.length;
  if (remaining > 0) add(`+ ${remaining} unidade(s) nas demais ondas · --format=full para todas`);
  if (status.decisions_pending?.length) {
    lines.push('');
    for (const decision of status.decisions_pending) add(`DECISÃO · ${decision.unit} · ${decision.reason} → ${decision.hint}`);
  }
  if (c.qa_failed) add('ATENÇÃO · Há revisões reprovadas. Consulte os achados no painel ou em --json.');
  if (status.engine?.message) add(status.engine.message);
  if (!status.engine?.alive && status.resume_command) add(`Retomar: ${status.resume_command}`);
  lines.push('');
  add('Ctrl+C encerra apenas o monitor. O motor continua independente.');
  add(`Painel: aioson execution:dashboard . --feature=${status.feature}`);
  return lines;
}

module.exports = { renderMonitor };
