'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const { buildInitialFeedback } = require('./feedback-schema');
const { buildRefinementReport } = require('./refinement-report');
const { resolveBriefingPath } = require('./briefing-paths');
const {
  buildBrowserMarkdownRuntime,
  escapeHtml,
  renderSafeMarkdown
} = require('./safe-markdown');

function safeJson(value) {
  return JSON.stringify(value).replace(/</g, '\\u003c');
}

const FINDING_CATEGORIES = ['ambiguity', 'redundancy', 'gap', 'risk', 'pending-decision', 'scope-suggestion'];

const LABELS = {
  en: {
    title: 'Briefing Decision Room',
    eyebrow: 'Guided review workspace',
    round: 'round',
    source: 'source',
    decisions: 'Decisions',
    document: 'Document',
    review_summary: 'Review summary',
    decision_queue: 'Decision queue',
    section_index: 'Document sections',
    queue_empty: 'No guided decisions are pending. Read the full document or save the review as-is.',
    open_document: 'Open document',
    previous: 'Previous',
    next: 'Next',
    question_fallback: 'Review this finding',
    recommendation: 'Recommendation',
    recommended: 'Recommended',
    tradeoff: 'Impact / trade-off',
    evidence: 'Supporting evidence',
    no_evidence: 'No evidence references supplied',
    rationale: 'Rationale or note',
    rationale_placeholder: 'Why does this choice fit the project?',
    approve_selection: 'Approve selection',
    accept_recommendation: 'Accept recommendation',
    request_change: 'Request change',
    defer: 'Defer',
    reopen: 'Reopen',
    status_pending: 'Pending',
    status_accepted: 'Approved',
    status_rejected: 'Change requested',
    status_deferred: 'Deferred',
    blocking_chip: 'blocking',
    progress: 'Decision progress',
    decided: 'decided',
    approved: 'Approved decisions',
    unresolved: 'Unresolved decisions',
    other_states: 'Rejected / deferred',
    changed_sections: 'Changed sections',
    blocking_items: 'Blocking items',
    notes: 'Notes',
    pending_findings: 'Pending decisions',
    filters_title: 'Filter decisions',
    filter_all: 'all',
    edit: 'Edit text',
    finish_editing: 'Finish editing',
    section_status: 'Section state',
    section_statuses: {
      unchanged: 'No change',
      accepted: 'Accepted',
      change_requested: 'Change requested',
      remove_requested: 'Remove requested',
      blocked: 'Blocked'
    },
    note_placeholder: 'Plain text note for this section',
    btn_download: 'Download JSON',
    btn_copy: 'Copy JSON',
    btn_save: 'Save to file',
    btn_copy_path: 'Copy path',
    target_hint: 'Save target:',
    save_hint: 'Selections autosave locally. Saved with no note and the recommended options, the round applies with no other question, unless the text would go beyond your decisions. With a note or another choice, you confirm the text first.',
    details: 'Technical details and export',
    discard_draft: 'Discard draft',
    section_blocked: 'Section marked as blocked',
    blocks_prd: 'Blocks PRD:',
    autosaved: 'Draft autosaved locally at',
    draft_restored: 'Local draft restored',
    downloaded: 'Downloaded refinement-feedback.json — move it over the existing file in the briefing folder.',
    copied: 'JSON copied — paste it in the chat or into refinement-feedback.json.',
    saved: 'Saved refinement-feedback.json.',
    path_copied: 'Path copied.',
    no_fsa: 'Direct save unavailable in this browser; downloaded JSON instead.',
    sandbox_fallback: 'Direct save blocked here; downloaded JSON instead. Open this file in a real browser for direct save.',
    selection_required: 'Choose the required option before approving this decision.'
  },
  pt: {
    title: 'Sala de Decisões do Briefing',
    eyebrow: 'Workspace de revisão guiada',
    round: 'rodada',
    source: 'fonte',
    decisions: 'Decisões',
    document: 'Documento',
    review_summary: 'Resumo final',
    decision_queue: 'Fila de decisões',
    section_index: 'Seções do documento',
    queue_empty: 'Não há decisões guiadas pendentes. Leia o documento completo ou salve a revisão como está.',
    open_document: 'Abrir documento',
    previous: 'Anterior',
    next: 'Próxima',
    question_fallback: 'Revise este achado',
    recommendation: 'Recomendação',
    recommended: 'Recomendado',
    tradeoff: 'Impacto / trade-off',
    evidence: 'Evidências de apoio',
    no_evidence: 'Nenhuma referência de evidência informada',
    rationale: 'Justificativa ou nota',
    rationale_placeholder: 'Por que esta escolha combina com o projeto?',
    approve_selection: 'Aprovar seleção',
    accept_recommendation: 'Aceitar recomendação',
    request_change: 'Solicitar mudança',
    defer: 'Adiar',
    reopen: 'Reabrir',
    status_pending: 'Pendente',
    status_accepted: 'Aprovada',
    status_rejected: 'Mudança solicitada',
    status_deferred: 'Adiada',
    blocking_chip: 'bloqueante',
    progress: 'Progresso das decisões',
    decided: 'decididas',
    approved: 'Decisões aprovadas',
    unresolved: 'Decisões pendentes',
    other_states: 'Rejeitadas / adiadas',
    changed_sections: 'Seções alteradas',
    blocking_items: 'Itens bloqueantes',
    notes: 'Notas',
    pending_findings: 'Decisões pendentes',
    filters_title: 'Filtrar decisões',
    filter_all: 'todas',
    edit: 'Editar texto',
    finish_editing: 'Concluir edição',
    section_status: 'Estado da seção',
    section_statuses: {
      unchanged: 'Sem mudança',
      accepted: 'Aceita',
      change_requested: 'Mudança solicitada',
      remove_requested: 'Remoção solicitada',
      blocked: 'Bloqueada'
    },
    note_placeholder: 'Nota em texto puro para esta seção',
    btn_download: 'Baixar JSON',
    btn_copy: 'Copiar JSON',
    btn_save: 'Salvar no arquivo',
    btn_copy_path: 'Copiar caminho',
    target_hint: 'Destino:',
    save_hint: 'As escolhas são salvas localmente. Salvando sem nota e com as opções recomendadas, a rodada é aplicada sem outra pergunta, a não ser que o texto vá além das suas decisões. Com nota ou outra escolha, você confirma o texto antes.',
    details: 'Detalhes técnicos e exportação',
    discard_draft: 'Descartar rascunho',
    section_blocked: 'Seção marcada como bloqueada',
    blocks_prd: 'Bloqueia o PRD:',
    autosaved: 'Rascunho salvo localmente às',
    draft_restored: 'Rascunho local restaurado',
    downloaded: 'refinement-feedback.json baixado — mova por cima do arquivo existente na pasta do briefing.',
    copied: 'JSON copiado — cole no chat ou dentro de refinement-feedback.json.',
    saved: 'refinement-feedback.json salvo.',
    path_copied: 'Caminho copiado.',
    no_fsa: 'Salvamento direto indisponível neste navegador; o JSON foi baixado.',
    sandbox_fallback: 'Salvamento direto bloqueado aqui; o JSON foi baixado. Abra este arquivo num navegador de verdade para salvar direto.',
    selection_required: 'Escolha a opção obrigatória antes de aprovar esta decisão.'
  }
};

function resolveLabels(locale) {
  return String(locale || '').toLowerCase().startsWith('pt') ? LABELS.pt : LABELS.en;
}

function renderEvidence(refs, labels) {
  if (!Array.isArray(refs) || refs.length === 0) return '';
  return `<details class="evidence"><summary>${escapeHtml(labels.evidence)} (${refs.length})</summary><ul>${refs
    .map((ref) => `<li><code>${escapeHtml(ref)}</code></li>`)
    .join('')}</ul></details>`;
}

function renderOption(finding, option, labels) {
  const inputType = finding.selection_mode === 'multiple' ? 'checkbox' : 'radio';
  const inputId = `choice-${finding.id}-${option.id}`;
  const isChecked = (finding.selected_option_ids || []).includes(option.id);
  const evidence = [...new Set([...(finding.evidence_refs || []), ...(option.evidence_refs || [])])];
  return `
          <label class="option-card" for="${escapeHtml(inputId)}">
            <input id="${escapeHtml(inputId)}" type="${inputType}" name="choice-${escapeHtml(finding.id)}" value="${escapeHtml(option.id)}"${isChecked ? ' checked' : ''}>
            <span class="option-control" aria-hidden="true"></span>
            <span class="option-copy">
              <span class="option-title">${escapeHtml(option.label)}${option.recommended ? ` <span class="badge badge-recommended">${escapeHtml(labels.recommended)}</span>` : ''}</span>
              <span class="option-description">${escapeHtml(option.description)}</span>
              <span class="option-impact"><b>${escapeHtml(labels.tradeoff)}:</b> ${escapeHtml(option.impact)}</span>
              ${renderEvidence(evidence, labels)}
            </span>
          </label>`;
}

function renderFinding(finding, labels, index) {
  const hasOptions = Array.isArray(finding.options) && finding.options.length > 0;
  const question = finding.question || finding.text || labels.question_fallback;
  const recommendation = !hasOptions && finding.recommendation
    ? `<div class="legacy-recommendation"><span>${escapeHtml(labels.recommendation)}</span><strong>${escapeHtml(finding.recommendation)}</strong></div>`
    : '';
  const choices = hasOptions
    ? `<fieldset class="options" data-role="options"><legend class="sr-only">${escapeHtml(question)}</legend>${finding.options
      .map((option) => renderOption(finding, option, labels))
      .join('')}</fieldset>`
    : recommendation;
  const approveLabel = hasOptions ? labels.approve_selection : labels.accept_recommendation;
  return `
      <article class="finding decision-card${index === 0 ? ' is-active' : ''}" data-finding="${escapeHtml(finding.id)}" data-cat="${escapeHtml(finding.category)}" data-status="${escapeHtml(finding.status || 'pending')}"${index === 0 ? '' : ' hidden'}>
        <div class="decision-meta">
          <span class="badge badge-category">${escapeHtml(finding.category)}</span>
          <span class="badge badge-severity">${escapeHtml(finding.severity)}</span>
          ${finding.blocking ? `<span class="badge badge-blocking">${escapeHtml(labels.blocking_chip)}</span>` : ''}
          <span class="decision-id">${escapeHtml(finding.id)}</span>
        </div>
        <h2>${escapeHtml(question)}</h2>
        <p class="decision-context">${escapeHtml(finding.text)}</p>
        ${choices}
        ${renderEvidence(finding.evidence_refs, labels)}
        <label class="rationale-label">
          <span>${escapeHtml(labels.rationale)}</span>
          <textarea data-role="f-rationale" rows="3" maxlength="2000" placeholder="${escapeHtml(labels.rationale_placeholder)}">${escapeHtml(finding.rationale || finding.note || '')}</textarea>
        </label>
        <div class="decision-actions">
          <button type="button" class="primary" data-set-f-status="accepted">${escapeHtml(approveLabel)}</button>
          <button type="button" data-set-f-status="rejected">${escapeHtml(labels.request_change)}</button>
          <button type="button" data-set-f-status="deferred">${escapeHtml(labels.defer)}</button>
          <button type="button" class="quiet" data-set-f-status="pending">${escapeHtml(labels.reopen)}</button>
          <span class="decision-status" data-role="f-status-text"></span>
        </div>
      </article>`;
}

function renderSection(section, labels) {
  const statusOptions = Object.entries(labels.section_statuses)
    .map(([value, label]) => `<option value="${value}"${section.status === value ? ' selected' : ''}>${escapeHtml(label)}</option>`)
    .join('');
  return `
      <article class="document-section" id="${escapeHtml(section.id)}" data-section="${escapeHtml(section.id)}">
        <div class="section-head">
          <div>
            <span class="section-kicker">${escapeHtml(section.id)}</span>
            <h2>${escapeHtml(section.title)}</h2>
          </div>
          <div class="section-controls">
            <label><span>${escapeHtml(labels.section_status)}</span><select data-role="status">${statusOptions}</select></label>
            <button type="button" data-edit-section aria-pressed="false">${escapeHtml(labels.edit)}</button>
          </div>
        </div>
        <div class="reader markdown-body" data-role="reader">${renderSafeMarkdown(section.current_text || '')}</div>
        <div class="editor" data-role="editor" contenteditable="plaintext-only" spellcheck="true" hidden>${escapeHtml(section.current_text || '')}</div>
        <label class="section-note"><span>${escapeHtml(labels.notes)}</span><textarea data-role="note" rows="3" placeholder="${escapeHtml(labels.note_placeholder)}"></textarea></label>
      </article>`;
}

function buildReviewHtml(data) {
  const feedback = data.feedback;
  const labels = resolveLabels(data.locale);
  const sections = feedback.sections || [];
  const findings = feedback.findings || [];
  const feedbackPath = `.aioson/briefings/${feedback.briefing_slug}/refinement-feedback.json`;
  const feedbackAbsPath = data.feedbackAbsPath || '';

  const decisionNav = findings.length > 0
    ? findings.map((finding, index) => `
        <button type="button" class="rail-item${index === 0 ? ' active' : ''}" data-decision-id="${escapeHtml(finding.id)}" data-cat="${escapeHtml(finding.category)}">
          <span class="rail-index">${String(index + 1).padStart(2, '0')}</span>
          <span><b>${escapeHtml(finding.question || finding.text)}</b><small data-nav-status="${escapeHtml(finding.id)}"></small></span>
        </button>`).join('')
    : `<p class="rail-empty">${escapeHtml(labels.queue_empty)}</p>`;
  const sectionNav = sections.map((section) => `<a class="rail-item" href="#${escapeHtml(section.id)}"><span>${escapeHtml(section.title)}</span></a>`).join('');
  const decisionMarkup = findings.length > 0
    ? findings.map((finding, index) => renderFinding(finding, labels, index)).join('')
    : `<div class="empty-state"><div class="empty-icon">✓</div><h2>${escapeHtml(labels.queue_empty)}</h2><button type="button" data-open-document>${escapeHtml(labels.open_document)}</button></div>`;
  const sectionMarkup = sections.map((section) => renderSection(section, labels)).join('');
  const filterButtons = [`<button type="button" data-cat="all" class="active">${escapeHtml(labels.filter_all)}</button>`]
    .concat(FINDING_CATEGORIES.map((category) => `<button type="button" data-cat="${category}">${category}</button>`))
    .join('');
  const runtimeLabels = {
    ...labels,
    section_statuses: labels.section_statuses
  };

  return `<!doctype html>
<!-- aioson:review schema=${escapeHtml(feedback.schema_version)} slug=${escapeHtml(feedback.briefing_slug)} source_hash=${escapeHtml(feedback.source_hash)} -->
<html lang="${labels === LABELS.pt ? 'pt-BR' : 'en'}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(labels.title)} - ${escapeHtml(feedback.briefing_slug)}</title>
  <style>
    :root {
      color-scheme: light;
      --canvas: #f3f5f2;
      --surface: #ffffff;
      --surface-soft: #f8faf7;
      --ink: #16201b;
      --muted: #68746d;
      --line: #d9e0da;
      --line-strong: #b9c5bc;
      --accent: #176b4f;
      --accent-soft: #e5f3ec;
      --accent-strong: #0e513b;
      --warn: #9a5b08;
      --warn-soft: #fff4da;
      --danger: #a33b32;
      --danger-soft: #fbeae7;
      --shadow: 0 18px 50px rgba(28, 47, 37, .08);
      --radius: 16px;
    }
    * { box-sizing: border-box; }
    html { max-width: 100%; scroll-behavior: smooth; }
    body { max-width: 100%; margin: 0; min-width: 320px; overflow-x: hidden; font: 14px/1.55 Inter, ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif; color: var(--ink); background: var(--canvas); }
    button, select, textarea { font: inherit; color: inherit; }
    button, select, textarea, [contenteditable] { outline: none; }
    button:focus-visible, select:focus-visible, textarea:focus-visible, [contenteditable]:focus-visible, a:focus-visible, input:focus-visible + .option-control {
      box-shadow: 0 0 0 3px rgba(23, 107, 79, .22);
      border-color: var(--accent);
    }
    button { cursor: pointer; border: 1px solid var(--line-strong); border-radius: 10px; background: var(--surface); padding: 9px 13px; font-weight: 650; }
    button:hover { border-color: var(--accent); }
    button.primary { color: #fff; background: var(--accent); border-color: var(--accent); }
    button.primary:hover { background: var(--accent-strong); }
    button.quiet { color: var(--muted); border-color: transparent; background: transparent; }
    button:disabled { cursor: not-allowed; opacity: .42; }
    .sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0,0,0,0); white-space: nowrap; border: 0; }
    .app-header { position: sticky; top: 0; z-index: 20; border-bottom: 1px solid var(--line); background: rgba(255,255,255,.96); backdrop-filter: blur(14px); }
    .header-inner { max-width: 1500px; margin: 0 auto; padding: 16px 24px 12px; }
    .header-row { display: flex; align-items: flex-end; justify-content: space-between; gap: 24px; }
    .header-row > * { min-width: 0; }
    .eyebrow, .section-kicker { display: block; color: var(--accent); font-size: 11px; font-weight: 800; letter-spacing: .09em; text-transform: uppercase; }
    h1 { margin: 2px 0 2px; font-size: clamp(21px, 2.5vw, 31px); line-height: 1.15; letter-spacing: -.025em; }
    .meta { color: var(--muted); font-size: 12px; overflow-wrap: anywhere; }
    .view-tabs { min-width: 0; max-width: 100%; display: flex; gap: 4px; padding: 4px; border: 1px solid var(--line); border-radius: 12px; background: var(--surface-soft); }
    .view-tabs button { min-height: 36px; border: 0; background: transparent; color: var(--muted); padding: 7px 12px; }
    .view-tabs button.active { background: var(--surface); color: var(--ink); box-shadow: 0 2px 10px rgba(22,32,27,.08); }
    .restore-banner { margin-top: 10px; display: flex; justify-content: space-between; align-items: center; gap: 12px; padding: 9px 12px; border: 1px solid #efd392; border-radius: 10px; background: var(--warn-soft); color: #704206; }
    .restore-banner[hidden] { display: none; }
    .workspace { max-width: 1500px; min-width: 0; margin: 0 auto; display: grid; grid-template-columns: 285px minmax(0, 1fr); gap: 22px; padding: 22px 24px 108px; }
    .workspace > *, main { min-width: 0; }
    .rail { position: sticky; top: 106px; align-self: start; min-width: 0; max-width: 100%; max-height: calc(100vh - 128px); overflow: auto; border: 1px solid var(--line); border-radius: var(--radius); background: var(--surface); box-shadow: var(--shadow); }
    .rail-section { min-width: 0; padding: 16px; border-bottom: 1px solid var(--line); }
    .rail-section:last-child { border-bottom: 0; }
    .rail h2 { margin: 0 0 10px; font-size: 13px; }
    .progress-copy { display: flex; justify-content: space-between; gap: 12px; color: var(--muted); font-size: 12px; }
    .progress-track { height: 7px; margin-top: 8px; overflow: hidden; border-radius: 999px; background: #e8ece8; }
    .progress-track span { display: block; width: 0; height: 100%; border-radius: inherit; background: var(--accent); transition: width .2s ease; }
    .rail-nav { display: grid; gap: 5px; }
    .rail-item { width: 100%; min-width: 0; max-width: 100%; overflow: hidden; display: flex; gap: 10px; align-items: flex-start; text-align: left; text-decoration: none; color: var(--ink); border: 1px solid transparent; border-radius: 10px; background: transparent; padding: 9px; }
    .rail-item > span:last-child { min-width: 0; }
    .rail-item:hover, .rail-item.active { border-color: #bfd9cd; background: var(--accent-soft); }
    .rail-item[hidden] { display: none; }
    .rail-index { flex: 0 0 auto; color: var(--muted); font: 700 11px/1.5 ui-monospace, SFMono-Regular, Consolas, monospace; }
    .rail-item b { display: -webkit-box; overflow: hidden; overflow-wrap: anywhere; font-size: 12px; line-height: 1.4; -webkit-line-clamp: 2; -webkit-box-orient: vertical; }
    .rail-item small { display: block; margin-top: 3px; color: var(--muted); font-size: 10px; }
    .rail-empty { color: var(--muted); font-size: 12px; }
    .filters { display: flex; flex-wrap: wrap; gap: 6px; }
    .filters button { min-width: 0; max-width: 100%; min-height: 26px; padding: 3px 8px; overflow-wrap: anywhere; white-space: normal; border-radius: 999px; color: var(--muted); font-size: 10px; }
    .filters button.active { color: #fff; background: var(--accent); border-color: var(--accent); }
    .stats { display: grid; gap: 8px; }
    .stat { min-width: 0; display: flex; justify-content: space-between; gap: 10px; color: var(--muted); font-size: 12px; }
    .stat span { min-width: 0; overflow-wrap: anywhere; }
    .stat strong { flex: 0 0 auto; color: var(--ink); }
    .danger { color: var(--danger) !important; }
    .view[hidden] { display: none; }
    .view-heading { margin-bottom: 14px; }
    .view-heading h2 { margin: 0; font-size: 17px; }
    .view-heading p { margin: 4px 0 0; color: var(--muted); }
    .decision-card, .document-section, .summary-panel, .empty-state {
      border: 1px solid var(--line);
      border-radius: var(--radius);
      background: var(--surface);
      box-shadow: var(--shadow);
    }
    .decision-card { min-height: 510px; padding: clamp(22px, 4vw, 42px); }
    .decision-card[hidden] { display: none; }
    .decision-meta { display: flex; align-items: center; gap: 7px; flex-wrap: wrap; }
    .badge { display: inline-flex; align-items: center; border: 1px solid var(--line); border-radius: 999px; padding: 2px 8px; color: var(--muted); background: var(--surface-soft); font-size: 10px; font-weight: 750; }
    .badge-category { color: var(--accent); border-color: #add1c1; background: var(--accent-soft); }
    .badge-severity { color: var(--warn); border-color: #efd392; background: var(--warn-soft); }
    .badge-blocking { color: var(--danger); border-color: #e7b9b4; background: var(--danger-soft); }
    .badge-recommended { margin-left: 7px; color: var(--accent); border-color: #add1c1; background: var(--accent-soft); vertical-align: 2px; }
    .decision-id { margin-left: auto; color: var(--muted); font: 700 11px/1.5 ui-monospace, SFMono-Regular, Consolas, monospace; }
    .decision-card h2 { max-width: 850px; margin: 18px 0 6px; font-size: clamp(23px, 3vw, 34px); line-height: 1.2; letter-spacing: -.025em; }
    .decision-context { max-width: 850px; margin: 0 0 24px; color: var(--muted); }
    .options { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; margin: 0; padding: 0; border: 0; }
    .option-card { position: relative; display: flex; gap: 12px; min-height: 150px; padding: 17px; border: 1px solid var(--line); border-radius: 13px; background: var(--surface-soft); cursor: pointer; transition: border-color .15s ease, background .15s ease, transform .15s ease; }
    .option-card:hover { border-color: #9fc7b5; transform: translateY(-1px); }
    .option-card:has(input:checked) { border-color: var(--accent); background: var(--accent-soft); box-shadow: inset 0 0 0 1px var(--accent); }
    .option-card input { position: absolute; opacity: 0; pointer-events: none; }
    .option-control { flex: 0 0 20px; width: 20px; height: 20px; margin-top: 1px; border: 2px solid var(--line-strong); border-radius: 50%; background: #fff; }
    .option-card input[type="checkbox"] + .option-control { border-radius: 5px; }
    .option-card input:checked + .option-control { border-color: var(--accent); background: var(--accent); box-shadow: inset 0 0 0 4px #fff; }
    .option-card input[type="checkbox"]:checked + .option-control { box-shadow: inset 0 0 0 3px #fff; }
    .option-copy { min-width: 0; display: flex; flex-direction: column; gap: 7px; }
    .option-title { font-size: 15px; font-weight: 800; }
    .option-description, .option-impact { color: var(--muted); font-size: 12px; }
    .legacy-recommendation { margin: 18px 0; padding: 18px; border-left: 4px solid var(--accent); border-radius: 0 12px 12px 0; background: var(--accent-soft); }
    .legacy-recommendation span { display: block; color: var(--accent); font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: .08em; }
    .legacy-recommendation strong { display: block; margin-top: 5px; font-size: 16px; }
    .evidence { margin-top: 5px; color: var(--muted); font-size: 11px; }
    .evidence summary { cursor: pointer; font-weight: 700; }
    .evidence ul { margin: 7px 0 0; padding-left: 18px; }
    .evidence code { overflow-wrap: anywhere; }
    .rationale-label { display: block; margin-top: 22px; }
    .rationale-label > span, .section-note > span { display: block; margin-bottom: 6px; color: var(--muted); font-size: 12px; font-weight: 700; }
    textarea { width: 100%; resize: vertical; border: 1px solid var(--line-strong); border-radius: 10px; background: #fff; padding: 10px 12px; }
    .decision-actions { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-top: 18px; padding-top: 18px; border-top: 1px solid var(--line); }
    .decision-status { margin-left: auto; border-radius: 999px; padding: 5px 9px; color: var(--muted); background: var(--surface-soft); font-size: 11px; font-weight: 800; }
    .decision-card[data-status="accepted"] .decision-status { color: var(--accent); background: var(--accent-soft); }
    .decision-card[data-status="rejected"] .decision-status { color: var(--danger); background: var(--danger-soft); }
    .decision-card[data-status="deferred"] .decision-status { color: var(--warn); background: var(--warn-soft); }
    .pager { display: flex; justify-content: space-between; gap: 12px; margin-top: 14px; }
    .document-index { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 12px; }
    .document-index a { border: 1px solid var(--line); border-radius: 999px; background: var(--surface); padding: 5px 9px; color: var(--muted); text-decoration: none; font-size: 11px; }
    .document-section { margin-bottom: 14px; overflow: hidden; scroll-margin-top: 116px; }
    .section-head { display: flex; justify-content: space-between; align-items: center; gap: 18px; padding: 16px 20px; border-bottom: 1px solid var(--line); background: var(--surface-soft); }
    .section-head h2 { margin: 2px 0 0; font-size: 17px; }
    .section-controls { display: flex; align-items: flex-end; gap: 8px; }
    .section-controls label span { display: block; color: var(--muted); font-size: 10px; font-weight: 700; }
    select { min-height: 38px; border: 1px solid var(--line-strong); border-radius: 9px; background: #fff; padding: 6px 30px 6px 9px; }
    .reader, .editor { min-height: 120px; padding: 22px; }
    .reader[hidden], .editor[hidden] { display: none; }
    .editor { white-space: pre-wrap; background: #fbfcfb; font: 13px/1.6 ui-monospace, SFMono-Regular, Consolas, monospace; }
    .markdown-body { overflow-wrap: anywhere; }
    .markdown-body > :first-child { margin-top: 0; }
    .markdown-body > :last-child { margin-bottom: 0; }
    .markdown-body h1, .markdown-body h2, .markdown-body h3, .markdown-body h4 { margin: 1.1em 0 .45em; line-height: 1.25; }
    .markdown-body p { margin: 0 0 .8em; }
    .markdown-body table { width: 100%; border-collapse: collapse; margin: 12px 0; font-size: 12px; }
    .markdown-body th, .markdown-body td { border: 1px solid var(--line); padding: 7px 9px; text-align: left; }
    .markdown-body th { background: var(--surface-soft); }
    .markdown-body code { border-radius: 5px; background: #edf1ed; padding: 1px 4px; font: 12px ui-monospace, SFMono-Regular, Consolas, monospace; }
    .markdown-body pre { overflow: auto; border-radius: 10px; background: #17201b; padding: 13px; color: #edf5f0; }
    .markdown-body pre code { background: transparent; padding: 0; color: inherit; }
    .markdown-body blockquote { margin: 12px 0; border-left: 3px solid var(--accent); padding-left: 12px; color: var(--muted); }
    .section-note { display: block; padding: 0 22px 20px; }
    .summary-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; }
    .summary-panel { min-height: 220px; padding: 20px; }
    .summary-panel h2 { margin: 0 0 10px; font-size: 15px; }
    .summary-panel ul { margin: 0; padding-left: 18px; }
    .summary-panel li { margin-bottom: 7px; color: var(--muted); }
    .empty-state { display: grid; place-items: center; min-height: 420px; padding: 34px; text-align: center; }
    .empty-state h2 { max-width: 620px; font-size: 20px; }
    .empty-icon { display: grid; place-items: center; width: 52px; height: 52px; border-radius: 50%; color: var(--accent); background: var(--accent-soft); font-size: 24px; font-weight: 800; }
    .action-bar { position: fixed; z-index: 30; left: 0; right: 0; bottom: 0; border-top: 1px solid var(--line); background: rgba(255,255,255,.97); backdrop-filter: blur(14px); }
    .action-inner { width: 100%; max-width: 1500px; margin: 0 auto; display: flex; align-items: center; gap: 8px; padding: 12px 24px; }
    .action-inner > * { min-width: 0; }
    .action-copy { min-width: 0; margin-right: auto; }
    .action-copy b { display: block; font-size: 12px; }
    .action-copy span { display: block; overflow: hidden; color: var(--muted); font-size: 10px; text-overflow: ellipsis; white-space: nowrap; }
    .save-status { min-width: 0; color: var(--muted); font-size: 11px; }
    .technical { max-width: 1500px; margin: 0 auto 95px; padding: 0 24px; }
    .technical details { border: 1px solid var(--line); border-radius: 12px; background: var(--surface); padding: 12px 14px; color: var(--muted); font-size: 11px; }
    .technical code { overflow-wrap: anywhere; }
    @media (max-width: 920px) {
      .header-row { align-items: flex-start; flex-direction: column; gap: 12px; }
      .app-header { position: static; }
      .workspace { grid-template-columns: 1fr; padding: 14px 14px 132px; }
      .rail { position: static; max-height: none; }
      .rail-nav { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      .options, .summary-grid { grid-template-columns: 1fr; }
      .decision-card { min-height: 0; padding: 22px 18px; }
      .section-head { align-items: stretch; flex-direction: column; }
      .section-controls { align-items: stretch; flex-wrap: wrap; }
      .action-inner { align-items: stretch; flex-wrap: wrap; padding: 10px 14px; }
      .action-copy { flex-basis: 100%; }
      .technical { padding: 0 14px; }
    }
    @media (max-width: 520px) {
      .header-inner { padding: 14px; }
      .meta { white-space: normal; word-break: break-word; }
      .view-tabs { width: 100%; display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); overflow: visible; }
      .view-tabs button { min-width: 0; padding: 6px 4px; white-space: normal; font-size: 12px; }
      .rail-nav { grid-template-columns: 1fr; }
      .decision-actions button { flex: 1 1 45%; }
      .decision-status { flex-basis: 100%; margin-left: 0; text-align: center; }
      .section-controls > * { flex: 1 1 100%; }
      .action-inner { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); }
      .action-copy, .save-status, .action-inner > button:last-child { grid-column: 1 / -1; }
      .action-inner > button { width: 100%; min-width: 0; padding: 8px 4px; overflow-wrap: anywhere; white-space: normal; }
    }
    @media (prefers-reduced-motion: reduce) { *, *::before, *::after { scroll-behavior: auto !important; transition: none !important; } }
  </style>
</head>
<body>
  <header class="app-header">
    <div class="header-inner">
      <div class="header-row">
        <div>
          <span class="eyebrow">${escapeHtml(labels.eyebrow)}</span>
          <h1>${escapeHtml(labels.title)}</h1>
          <div class="meta">${escapeHtml(feedback.briefing_slug)} · ${escapeHtml(labels.round)} ${escapeHtml(String(feedback.round || 1))} · ${escapeHtml(labels.source)} ${escapeHtml(feedback.source_briefing_path)}</div>
        </div>
        <nav class="view-tabs" aria-label="${escapeHtml(labels.title)}">
          <button type="button" class="active" data-view-target="decisions">${escapeHtml(labels.decisions)}</button>
          <button type="button" data-view-target="document">${escapeHtml(labels.document)}</button>
          <button type="button" data-view-target="summary">${escapeHtml(labels.review_summary)}</button>
        </nav>
      </div>
      <div class="restore-banner" id="restore-banner" hidden><span></span><button type="button" id="discard-draft">${escapeHtml(labels.discard_draft)}</button></div>
    </div>
  </header>

  <div class="workspace">
    <aside class="rail">
      <section class="rail-section">
        <h2>${escapeHtml(labels.progress)}</h2>
        <div class="progress-copy"><span><strong id="decided-count">0</strong> / ${findings.length} ${escapeHtml(labels.decided)}</span><span id="progress-percent">0%</span></div>
        <div class="progress-track" aria-hidden="true"><span id="progress-bar"></span></div>
      </section>
      <section class="rail-section" id="decision-rail">
        <h2>${escapeHtml(labels.decision_queue)}</h2>
        <div class="rail-nav" id="decision-nav">${decisionNav}</div>
      </section>
      <section class="rail-section" id="section-rail" hidden>
        <h2>${escapeHtml(labels.section_index)}</h2>
        <div class="rail-nav">${sectionNav}</div>
      </section>
      <section class="rail-section">
        <h2>${escapeHtml(labels.filters_title)}</h2>
        <div class="filters" id="filters">${filterButtons}</div>
      </section>
      <section class="rail-section stats">
        <div class="stat"><span>${escapeHtml(labels.changed_sections)}</span><strong id="changed">0</strong></div>
        <div class="stat"><span>${escapeHtml(labels.blocking_items)}</span><strong id="blocked" class="danger">0</strong></div>
        <div class="stat"><span>${escapeHtml(labels.notes)}</span><strong id="notes">0</strong></div>
        <div class="stat"><span>${escapeHtml(labels.pending_findings)}</span><strong id="pending-findings">0</strong></div>
        <div id="blockers" class="danger"></div>
      </section>
    </aside>

    <main>
      <section class="view" id="view-decisions">
        <div class="view-heading"><h2>${escapeHtml(labels.decision_queue)}</h2><p>${escapeHtml(labels.save_hint)}</p></div>
        <div id="decision-list">${decisionMarkup}</div>
        ${findings.length > 0 ? `<div class="pager"><button type="button" id="previous-decision">${escapeHtml(labels.previous)}</button><button type="button" id="next-decision">${escapeHtml(labels.next)}</button></div>` : ''}
      </section>
      <section class="view" id="view-document" hidden>
        <div class="view-heading"><h2>${escapeHtml(labels.document)}</h2><p>${escapeHtml(labels.save_hint)}</p></div>
        <nav class="document-index">${sectionNav}</nav>
        ${sectionMarkup}
      </section>
      <section class="view" id="view-summary" hidden>
        <div class="view-heading"><h2>${escapeHtml(labels.review_summary)}</h2><p>${escapeHtml(labels.save_hint)}</p></div>
        <div class="summary-grid">
          <article class="summary-panel"><h2>${escapeHtml(labels.approved)}</h2><ul id="approved-list"></ul></article>
          <article class="summary-panel"><h2>${escapeHtml(labels.unresolved)}</h2><ul id="unresolved-list"></ul></article>
          <article class="summary-panel"><h2>${escapeHtml(labels.other_states)}</h2><ul id="other-list"></ul></article>
        </div>
      </section>
    </main>
  </div>

  <div class="technical">
    <details>
      <summary>${escapeHtml(labels.details)}</summary>
      <p>${escapeHtml(labels.source)}: <code>${escapeHtml(feedback.source_briefing_path)}</code></p>
      <p>source hash: <code>${escapeHtml(feedback.source_hash)}</code></p>
      <p>${escapeHtml(labels.target_hint)} <code id="target-path">${escapeHtml(feedbackAbsPath || feedbackPath)}</code> ${feedbackAbsPath ? `<button type="button" id="copy-path">${escapeHtml(labels.btn_copy_path)}</button>` : ''}</p>
    </details>
  </div>

  <footer class="action-bar">
    <div class="action-inner">
      <div class="action-copy"><b>${escapeHtml(labels.save_hint)}</b><span id="autosave"></span><span id="status" class="save-status"></span></div>
      <button type="button" id="copy">${escapeHtml(labels.btn_copy)}</button>
      <button type="button" id="download">${escapeHtml(labels.btn_download)}</button>
      <button type="button" class="primary" id="save">${escapeHtml(labels.btn_save)}</button>
    </div>
  </footer>

  <script>
    const feedback = ${safeJson(feedback)};
    const L = ${safeJson(runtimeLabels)};
    const LS_KEY = 'aioson-review:' + feedback.briefing_slug + ':' + feedback.source_hash + ':' + feedback.review_generated_at;
    const sectionById = new Map(feedback.sections.map(section => [section.id, section]));
    const findingById = new Map((feedback.findings || []).map(finding => [finding.id, finding]));
    const statusEl = document.getElementById('status');
    const autosaveEl = document.getElementById('autosave');
    let activeCategory = 'all';
    let currentFindingId = feedback.findings && feedback.findings[0] ? feedback.findings[0].id : null;

    ${buildBrowserMarkdownRuntime()}

    function plainText(node) {
      return (node.innerText || node.textContent || '').replace(/\\r\\n?/g, '\\n');
    }

    function setText(id, value) {
      const node = document.getElementById(id);
      if (node) node.textContent = String(value);
    }

    function statusLabel(status) {
      return L['status_' + status] || status;
    }

    function visibleFindingIds() {
      return (feedback.findings || [])
        .filter(finding => activeCategory === 'all' || finding.category === activeCategory)
        .map(finding => finding.id);
    }

    function showFinding(id) {
      const visible = visibleFindingIds();
      if (!visible.includes(id)) id = visible[0] || null;
      currentFindingId = id;
      document.querySelectorAll('.decision-card').forEach(card => {
        const isActive = card.dataset.finding === id;
        card.hidden = !isActive;
        card.classList.toggle('is-active', isActive);
      });
      document.querySelectorAll('[data-decision-id]').forEach(button => {
        const isVisible = activeCategory === 'all' || button.dataset.cat === activeCategory;
        button.hidden = !isVisible;
        button.classList.toggle('active', isVisible && button.dataset.decisionId === id);
      });
      const position = visible.indexOf(id);
      const previous = document.getElementById('previous-decision');
      const next = document.getElementById('next-decision');
      if (previous) previous.disabled = position <= 0;
      if (next) next.disabled = position < 0 || position >= visible.length - 1;
    }

    function moveFinding(offset) {
      const visible = visibleFindingIds();
      const current = visible.indexOf(currentFindingId);
      const target = visible[current + offset];
      if (target) showFinding(target);
    }

    function showView(name) {
      document.querySelectorAll('[data-view-target]').forEach(button => {
        button.classList.toggle('active', button.dataset.viewTarget === name);
      });
      document.querySelectorAll('.view').forEach(view => {
        view.hidden = view.id !== 'view-' + name;
      });
      document.getElementById('decision-rail').hidden = name !== 'decisions';
      document.getElementById('section-rail').hidden = name !== 'document';
      if (name === 'summary') collect();
    }

    function selectedOptionIds(card) {
      return [...card.querySelectorAll('[data-role="options"] input:checked')].map(input => input.value);
    }

    function hasValidSelection(card, finding) {
      if (!finding.options || finding.options.length === 0) return Boolean(finding.recommendation);
      const count = selectedOptionIds(card).length;
      return finding.selection_mode === 'single' ? count === 1 : count > 0;
    }

    function setFindingStatus(card, status) {
      const finding = findingById.get(card.dataset.finding);
      if (!finding) return;
      if (status === 'accepted' && !hasValidSelection(card, finding)) {
        statusEl.textContent = L.selection_required;
        const firstInput = card.querySelector('[data-role="options"] input');
        if (firstInput) firstInput.focus();
        return;
      }
      finding.status = status;
      card.dataset.status = status;
      touch();
      const visible = visibleFindingIds();
      const position = visible.indexOf(finding.id);
      if (status !== 'pending' && position >= 0 && position < visible.length - 1) {
        showFinding(visible[position + 1]);
      }
    }

    function appendSummaryItem(list, text) {
      const item = document.createElement('li');
      item.textContent = text;
      list.appendChild(item);
    }

    function updateSummaryLists() {
      const approvedList = document.getElementById('approved-list');
      const unresolvedList = document.getElementById('unresolved-list');
      const otherList = document.getElementById('other-list');
      for (const list of [approvedList, unresolvedList, otherList]) list.replaceChildren();
      (feedback.findings || []).forEach(finding => {
        const selected = (finding.selected_option_ids || []).map(id => {
          const option = (finding.options || []).find(candidate => candidate.id === id);
          return option ? option.label : id;
        });
        const suffix = selected.length ? ': ' + selected.join(', ') : finding.recommendation ? ': ' + finding.recommendation : '';
        const text = finding.id + ' — ' + (finding.question || finding.text) + suffix;
        if (finding.status === 'accepted') appendSummaryItem(approvedList, text);
        else if (finding.status === 'pending') appendSummaryItem(unresolvedList, text);
        else appendSummaryItem(otherList, text + ' (' + statusLabel(finding.status) + ')');
      });
      for (const list of [approvedList, unresolvedList, otherList]) {
        if (!list.children.length) appendSummaryItem(list, '—');
      }
    }

    function collect() {
      feedback.last_modified_at = new Date().toISOString();
      let changed = 0;
      let notes = 0;
      document.querySelectorAll('.document-section[data-section]').forEach(sectionEl => {
        const section = sectionById.get(sectionEl.dataset.section);
        if (!section) return;
        const editor = sectionEl.querySelector('[data-role="editor"]');
        const reader = sectionEl.querySelector('[data-role="reader"]');
        section.current_text = plainText(editor);
        reader.innerHTML = renderSafeMarkdown(section.current_text);
        section.status = sectionEl.querySelector('[data-role="status"]').value;
        const note = sectionEl.querySelector('[data-role="note"]').value.trim();
        section.comments_count = note ? 1 : 0;
        if (section.current_text !== section.original_text || section.status !== 'unchanged') changed += 1;
        if (note) notes += 1;
        sectionEl.classList.toggle('is-blocked', section.status === 'blocked');
      });

      document.querySelectorAll('.decision-card').forEach(card => {
        const finding = findingById.get(card.dataset.finding);
        if (!finding) return;
        finding.selected_option_ids = selectedOptionIds(card);
        finding.rationale = card.querySelector('[data-role="f-rationale"]').value.trim();
        finding.note = finding.rationale;
        finding.status = card.dataset.status || 'pending';
        const statusText = card.querySelector('[data-role="f-status-text"]');
        if (statusText) statusText.textContent = statusLabel(finding.status);
        const navStatus = document.querySelector('[data-nav-status="' + finding.id + '"]');
        if (navStatus) navStatus.textContent = statusLabel(finding.status);
      });

      feedback.comments = [];
      feedback.blocking_items = [];
      document.querySelectorAll('.document-section[data-section]').forEach(sectionEl => {
        const section = sectionById.get(sectionEl.dataset.section);
        if (!section) return;
        const note = sectionEl.querySelector('[data-role="note"]').value.trim();
        if (note) {
          const severity = section.status === 'blocked' ? 'blocking' : 'note';
          feedback.comments.push({ id: 'comment-' + section.id, section_id: section.id, target_text_hash: null, note, severity, resolved: false });
        }
        if (section.status === 'blocked') {
          feedback.blocking_items.push({ id: 'block-' + section.id, section_id: section.id, note: note || L.section_blocked, resolved: false });
        }
      });
      (feedback.findings || []).forEach(finding => {
        if (finding.blocking && finding.status === 'pending') {
          feedback.blocking_items.push({ id: 'block-' + finding.id, section_id: finding.section_id, note: finding.text, resolved: false });
        }
      });

      const total = (feedback.findings || []).length;
      const decided = (feedback.findings || []).filter(finding => finding.status !== 'pending').length;
      const pending = total - decided;
      const percent = total ? Math.round(decided / total * 100) : 100;
      setText('decided-count', decided);
      setText('progress-percent', percent + '%');
      document.getElementById('progress-bar').style.width = percent + '%';
      setText('changed', changed);
      setText('blocked', feedback.blocking_items.length);
      setText('notes', notes);
      setText('pending-findings', pending);
      const blockersEl = document.getElementById('blockers');
      blockersEl.textContent = feedback.blocking_items.length
        ? L.blocks_prd + '\\n' + feedback.blocking_items.map(item => '- ' + item.note).join('\\n')
        : '';
      updateSummaryLists();
    }

    function autosave() {
      try {
        localStorage.setItem(LS_KEY, JSON.stringify(feedback));
        autosaveEl.textContent = L.autosaved + ' ' + new Date().toTimeString().slice(0, 5);
      } catch (error) { /* storage unavailable — export remains usable */ }
    }

    function touch() {
      collect();
      autosave();
    }

    function restoreDraft() {
      let raw = null;
      try { raw = localStorage.getItem(LS_KEY); } catch (error) { return; }
      if (!raw) return;
      let draft;
      try { draft = JSON.parse(raw); } catch (error) { return; }
      if (!draft || draft.source_hash !== feedback.source_hash) return;
      (draft.sections || []).forEach(draftSection => {
        const sectionEl = document.querySelector('.document-section[data-section="' + draftSection.id + '"]');
        if (!sectionEl) return;
        if (typeof draftSection.current_text === 'string') {
          sectionEl.querySelector('[data-role="editor"]').textContent = draftSection.current_text;
          sectionEl.querySelector('[data-role="reader"]').innerHTML = renderSafeMarkdown(draftSection.current_text);
        }
        sectionEl.querySelector('[data-role="status"]').value = draftSection.status || 'unchanged';
        const draftNote = (draft.comments || []).find(comment => comment.section_id === draftSection.id);
        sectionEl.querySelector('[data-role="note"]').value = draftNote ? draftNote.note : '';
      });
      (draft.findings || []).forEach(draftFinding => {
        const card = document.querySelector('.decision-card[data-finding="' + draftFinding.id + '"]');
        if (!card) return;
        card.dataset.status = draftFinding.status || 'pending';
        card.querySelectorAll('[data-role="options"] input').forEach(input => {
          input.checked = (draftFinding.selected_option_ids || []).includes(input.value);
        });
        card.querySelector('[data-role="f-rationale"]').value = draftFinding.rationale || draftFinding.note || '';
      });
      const banner = document.getElementById('restore-banner');
      banner.hidden = false;
      banner.querySelector('span').textContent = L.draft_restored
        + (draft.last_modified_at ? ' (' + draft.last_modified_at.slice(0, 16).replace('T', ' ') + ')' : '');
    }

    function jsonText(method) {
      feedback.export_method = method;
      collect();
      return JSON.stringify(feedback, null, 2);
    }

    function download() {
      const blob = new Blob([jsonText('download')], { type: 'application/json' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = 'refinement-feedback.json';
      link.click();
      URL.revokeObjectURL(link.href);
      statusEl.textContent = L.downloaded;
      autosave();
    }

    async function copyJson() {
      await navigator.clipboard.writeText(jsonText('copy-paste'));
      statusEl.textContent = L.copied;
      autosave();
    }

    let fileHandle = null;
    async function saveDirect() {
      if (!window.showSaveFilePicker) {
        download();
        statusEl.textContent = L.no_fsa;
        return;
      }
      try {
        if (!fileHandle) {
          fileHandle = await window.showSaveFilePicker({
            id: 'aioson-refinement-feedback',
            suggestedName: 'refinement-feedback.json',
            types: [{ description: 'JSON', accept: { 'application/json': ['.json'] } }]
          });
        }
        const writable = await fileHandle.createWritable();
        await writable.write(jsonText('file-system-access'));
        await writable.close();
        statusEl.textContent = L.saved;
        autosave();
      } catch (error) {
        if (error && error.name === 'AbortError') return;
        fileHandle = null;
        download();
        statusEl.textContent = L.sandbox_fallback;
      }
    }

    document.addEventListener('input', event => {
      if (event.target.matches('[data-role="options"] input') || event.target.matches('textarea') || event.target.matches('[contenteditable]')) touch();
    });
    document.addEventListener('change', event => {
      if (event.target.matches('select') || event.target.matches('[data-role="options"] input')) touch();
    });
    document.addEventListener('click', event => {
      const viewButton = event.target.closest('[data-view-target]');
      if (viewButton) showView(viewButton.dataset.viewTarget);
      const navButton = event.target.closest('[data-decision-id]');
      if (navButton) showFinding(navButton.dataset.decisionId);
      const statusButton = event.target.closest('[data-set-f-status]');
      if (statusButton) setFindingStatus(statusButton.closest('.decision-card'), statusButton.dataset.setFStatus);
      const editButton = event.target.closest('[data-edit-section]');
      if (editButton) {
        const sectionEl = editButton.closest('.document-section');
        const editor = sectionEl.querySelector('[data-role="editor"]');
        const reader = sectionEl.querySelector('[data-role="reader"]');
        const isEditing = !editor.hidden;
        if (isEditing) {
          const text = plainText(editor);
          reader.innerHTML = renderSafeMarkdown(text);
          editor.hidden = true;
          reader.hidden = false;
          editButton.textContent = L.edit;
          editButton.setAttribute('aria-pressed', 'false');
          touch();
        } else {
          reader.hidden = true;
          editor.hidden = false;
          editButton.textContent = L.finish_editing;
          editButton.setAttribute('aria-pressed', 'true');
          editor.focus();
        }
      }
      if (event.target.closest('[data-open-document]')) showView('document');
    });
    document.getElementById('download').addEventListener('click', download);
    document.getElementById('copy').addEventListener('click', () => copyJson().catch(() => download()));
    document.getElementById('save').addEventListener('click', saveDirect);
    const previousButton = document.getElementById('previous-decision');
    const nextButton = document.getElementById('next-decision');
    if (previousButton) previousButton.addEventListener('click', () => moveFinding(-1));
    if (nextButton) nextButton.addEventListener('click', () => moveFinding(1));
    const copyPathButton = document.getElementById('copy-path');
    if (copyPathButton) copyPathButton.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(document.getElementById('target-path').textContent);
        statusEl.textContent = L.path_copied;
      } catch (error) { /* path remains visible for manual copy */ }
    });
    document.getElementById('discard-draft').addEventListener('click', () => {
      try { localStorage.removeItem(LS_KEY); } catch (error) { /* ignore */ }
      location.reload();
    });
    document.getElementById('filters').addEventListener('click', event => {
      const button = event.target.closest('button[data-cat]');
      if (!button) return;
      document.querySelectorAll('#filters button').forEach(other => other.classList.remove('active'));
      button.classList.add('active');
      activeCategory = button.dataset.cat;
      showFinding(visibleFindingIds()[0] || null);
    });

    restoreDraft();
    collect();
    showFinding(currentFindingId);
    autosave();
  </script>
</body>
</html>`;
}

async function writeReviewArtifacts(projectDir, {
  slug,
  sourceMarkdown,
  sections,
  sourceHash,
  findings = [],
  round = 1,
  locale = 'en'
}) {
  const briefingDir = resolveBriefingPath(projectDir, slug);
  const sourcePath = `.aioson/briefings/${slug}/briefings.md`;
  const feedback = buildInitialFeedback({ slug, sourcePath, sourceHash, sections, findings, round });
  const html = buildReviewHtml({
    feedback,
    sourceMarkdown,
    locale,
    feedbackAbsPath: path.join(briefingDir, 'refinement-feedback.json')
  });
  const report = buildRefinementReport({
    briefing_slug: slug,
    source_briefing_path: sourcePath,
    source_hash: sourceHash,
    status: 'review_generated',
    next_action: 'collect_feedback',
    round: feedback.round,
    applied_changes: [],
    skipped_changes: [],
    unresolved_comments: [],
    blocking_items: [],
    findings: feedback.findings
  });

  await fs.mkdir(briefingDir, { recursive: true });
  await fs.writeFile(path.join(briefingDir, 'review.html'), html, 'utf8');
  await fs.writeFile(path.join(briefingDir, 'refinement-feedback.json'), `${JSON.stringify(feedback, null, 2)}\n`, 'utf8');
  await fs.writeFile(path.join(briefingDir, 'refinement-report.md'), report, 'utf8');

  return { feedback, html, report };
}

module.exports = { buildReviewHtml, escapeHtml, safeJson, writeReviewArtifacts };
