'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const { buildInitialFeedback } = require('./feedback-schema');
const { buildRefinementReport } = require('./refinement-report');
const { resolveBriefingPath } = require('./briefing-paths');

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function safeJson(value) {
  return JSON.stringify(value).replace(/</g, '\\u003c');
}

const FINDING_CATEGORIES = ['ambiguity', 'redundancy', 'gap', 'risk', 'pending-decision', 'scope-suggestion'];

// UI strings for the generated surface. The surface is user-facing, so it follows
// the interaction language (locale from the CLI); schema enum values (statuses,
// categories) stay canonical English because they round-trip into the JSON.
const LABELS = {
  en: {
    title: 'Briefing Review',
    round: 'round',
    source: 'source',
    notes: 'Notes',
    note_placeholder: 'Plain text note for this section',
    finding_note_placeholder: 'Decision / note for this finding',
    findings_title: 'Audit findings',
    other_findings: 'Findings without a matching section',
    recommendation: 'Recommendation',
    blocking_chip: 'blocking',
    summary_title: 'Review State',
    summary_changed: 'Changed sections',
    summary_blocked: 'Blocking items',
    summary_notes: 'Notes',
    summary_pending_findings: 'Pending findings',
    filters_title: 'Finding filters',
    filter_all: 'all',
    btn_download: 'Download JSON',
    btn_copy: 'Copy JSON',
    btn_save: 'Save to file',
    toolbar_hint: 'Save writes structured feedback only. HTML edits are not canonical until exported.',
    hint_title: 'How to use',
    hint_body: [
      'Open this file in a real browser (double-click it) — editor previews are sandboxed and block saving and downloads.',
      'Edit section text, set a status per section, decide each finding, add notes.',
      'Then return the JSON one of three ways: “Save to file” directly over {feedbackPath}; “Download JSON” and move it over {feedbackPath}; or “Copy JSON” and paste it in the chat when you reactivate @briefing-refiner.',
      'Your edits autosave to this browser (local draft) — closing the tab loses nothing.'
    ],
    blocks_title: 'What blocks the PRD',
    blocks_body: 'Any section marked blocked, and any blocking finding still pending.',
    // runtime strings
    section_blocked: 'Section marked as blocked',
    blocks_prd: 'Blocks PRD:',
    autosaved: 'Draft autosaved locally at',
    draft_restored: 'Local draft restored',
    discard_draft: 'Discard draft',
    downloaded: 'Downloaded refinement-feedback.json — move it over the existing file in the briefing folder.',
    copied: 'JSON copied — paste it in the chat or into refinement-feedback.json.',
    saved: 'Saved refinement-feedback.json.',
    no_fsa: 'Direct save unavailable in this browser; downloaded JSON instead.',
    sandbox_fallback: 'Direct save blocked here (sandboxed preview) — downloaded JSON instead. Open this file in a real browser for direct save.'
  },
  pt: {
    title: 'Revisão do Briefing',
    round: 'rodada',
    source: 'fonte',
    notes: 'Notas',
    note_placeholder: 'Nota em texto puro para esta seção',
    finding_note_placeholder: 'Decisão / nota para este achado',
    findings_title: 'Achados da auditoria',
    other_findings: 'Achados sem seção correspondente',
    recommendation: 'Recomendação',
    blocking_chip: 'bloqueante',
    summary_title: 'Estado da revisão',
    summary_changed: 'Seções alteradas',
    summary_blocked: 'Itens bloqueantes',
    summary_notes: 'Notas',
    summary_pending_findings: 'Achados pendentes',
    filters_title: 'Filtros de achados',
    filter_all: 'todos',
    btn_download: 'Baixar JSON',
    btn_copy: 'Copiar JSON',
    btn_save: 'Salvar no arquivo',
    toolbar_hint: 'Salvar grava apenas o feedback estruturado. Edições no HTML não são canônicas até exportar.',
    hint_title: 'Como usar',
    hint_body: [
      'Abra este arquivo num navegador de verdade (duplo clique) — previews de editor são sandboxed e bloqueiam salvar e baixar.',
      'Edite o texto das seções, marque o status de cada uma, decida cada achado e anote comentários.',
      'Depois devolva o JSON de uma destas formas: “Salvar no arquivo” direto sobre {feedbackPath}; “Baixar JSON” e mover por cima de {feedbackPath}; ou “Copiar JSON” e colar no chat ao reativar o @briefing-refiner.',
      'Suas edições são salvas automaticamente neste navegador (rascunho local) — fechar a aba não perde nada.'
    ],
    blocks_title: 'O que bloqueia o PRD',
    blocks_body: 'Qualquer seção marcada como blocked e qualquer achado bloqueante ainda pendente.',
    // runtime strings
    section_blocked: 'Seção marcada como bloqueada',
    blocks_prd: 'Bloqueia o PRD:',
    autosaved: 'Rascunho salvo localmente às',
    draft_restored: 'Rascunho local restaurado',
    discard_draft: 'Descartar rascunho',
    downloaded: 'refinement-feedback.json baixado — mova por cima do arquivo existente na pasta do briefing.',
    copied: 'JSON copiado — cole no chat ou dentro de refinement-feedback.json.',
    saved: 'refinement-feedback.json salvo.',
    no_fsa: 'Salvamento direto indisponível neste navegador; o JSON foi baixado.',
    sandbox_fallback: 'Salvamento direto bloqueado aqui (preview sandboxed) — o JSON foi baixado. Abra este arquivo num navegador de verdade para salvar direto.'
  }
};

function resolveLabels(locale) {
  return String(locale || '').toLowerCase().startsWith('pt') ? LABELS.pt : LABELS.en;
}

function renderFinding(finding, labels) {
  const rec = finding.recommendation
    ? `<div class="f-rec"><b>${escapeHtml(labels.recommendation)}:</b> ${escapeHtml(finding.recommendation)}</div>`
    : '';
  const blockChip = finding.blocking ? `<span class="chip chip-block">${escapeHtml(labels.blocking_chip)}</span>` : '';
  return `
        <div class="finding" data-finding="${escapeHtml(finding.id)}" data-cat="${escapeHtml(finding.category)}">
          <div class="f-head">
            <span class="chip chip-cat">${escapeHtml(finding.category)}</span>
            <span class="chip chip-sev-${escapeHtml(finding.severity)}">${escapeHtml(finding.severity)}</span>
            ${blockChip}
            <span class="f-id">${escapeHtml(finding.id)}</span>
            <select data-role="f-status">
              <option value="pending"${finding.status === 'pending' ? ' selected' : ''}>pending</option>
              <option value="accepted"${finding.status === 'accepted' ? ' selected' : ''}>accepted</option>
              <option value="rejected"${finding.status === 'rejected' ? ' selected' : ''}>rejected</option>
              <option value="deferred"${finding.status === 'deferred' ? ' selected' : ''}>deferred</option>
            </select>
          </div>
          <div class="f-text">${escapeHtml(finding.text)}</div>
          ${rec}
          <input class="f-note" data-role="f-note" type="text" value="${escapeHtml(finding.note || '')}" placeholder="${escapeHtml(labels.finding_note_placeholder)}">
        </div>`;
}

function buildReviewHtml(data) {
  const feedback = data.feedback;
  const labels = resolveLabels(data.locale);
  const sections = feedback.sections || [];
  const findings = feedback.findings || [];
  const feedbackPath = `.aioson/briefings/${feedback.briefing_slug}/refinement-feedback.json`;

  const findingsBySection = new Map();
  const orphanFindings = [];
  const sectionIds = new Set(sections.map((section) => section.id));
  for (const finding of findings) {
    if (sectionIds.has(finding.section_id)) {
      if (!findingsBySection.has(finding.section_id)) findingsBySection.set(finding.section_id, []);
      findingsBySection.get(finding.section_id).push(finding);
    } else {
      orphanFindings.push(finding);
    }
  }

  const nav = sections.map((section) => `<a href="#${escapeHtml(section.id)}">${escapeHtml(section.title)}</a>`).join('');
  const sectionMarkup = sections.map((section) => {
    const own = findingsBySection.get(section.id) || [];
    const findingsBlock = own.length > 0
      ? `<div class="findings"><div class="findings-title">${escapeHtml(labels.findings_title)} (${own.length})</div>${own.map((f) => renderFinding(f, labels)).join('\n')}</div>`
      : '';
    return `
      <section class="section" id="${escapeHtml(section.id)}" data-section="${escapeHtml(section.id)}">
        <div class="section-head">
          <h2>${escapeHtml(section.title)}</h2>
          <span class="chip chip-state" data-role="state-chip"></span>
          <select data-role="status">
            <option value="unchanged">unchanged</option>
            <option value="accepted">accepted</option>
            <option value="change_requested">change_requested</option>
            <option value="remove_requested">remove_requested</option>
            <option value="blocked">blocked</option>
          </select>
        </div>
        <div class="editor" contenteditable="plaintext-only" spellcheck="true">${escapeHtml(section.current_text || '')}</div>
        <label class="note-label">${escapeHtml(labels.notes)}</label>
        <textarea class="note" data-role="note" rows="3" placeholder="${escapeHtml(labels.note_placeholder)}"></textarea>
        ${findingsBlock}
      </section>`;
  }).join('\n');

  const orphanMarkup = orphanFindings.length > 0
    ? `
      <section class="section" data-section="">
        <div class="section-head"><h2>${escapeHtml(labels.other_findings)}</h2></div>
        <div class="findings">${orphanFindings.map((f) => renderFinding(f, labels)).join('\n')}</div>
      </section>`
    : '';

  const filterButtons = [`<button type="button" data-cat="all" class="active">${escapeHtml(labels.filter_all)}</button>`]
    .concat(FINDING_CATEGORIES.map((cat) => `<button type="button" data-cat="${cat}">${cat}</button>`))
    .join('');

  const hintBody = labels.hint_body
    .map((line) => escapeHtml(line).split(escapeHtml('{feedbackPath}')).join(`<code>${escapeHtml(feedbackPath)}</code>`))
    .map((line) => `<p>${line}</p>`)
    .join('');

  const runtimeLabels = {
    section_blocked: labels.section_blocked,
    blocks_prd: labels.blocks_prd,
    autosaved: labels.autosaved,
    draft_restored: labels.draft_restored,
    downloaded: labels.downloaded,
    copied: labels.copied,
    saved: labels.saved,
    no_fsa: labels.no_fsa,
    sandbox_fallback: labels.sandbox_fallback
  };

  return `<!doctype html>
<!-- aioson:review schema=${escapeHtml(feedback.schema_version)} slug=${escapeHtml(feedback.briefing_slug)} source_hash=${escapeHtml(feedback.source_hash)} -->
<html lang="${labels === LABELS.pt ? 'pt-BR' : 'en'}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(labels.title)} - ${escapeHtml(feedback.briefing_slug)}</title>
  <style>
    :root { color-scheme: light; --bg: #f6f7f9; --panel: #ffffff; --ink: #172026; --muted: #5c6975; --line: #d8dee6; --accent: #0b6f85; --block: #b42318; --change: #8a5a00; --ok: #1b7f3a; }
    * { box-sizing: border-box; }
    body { margin: 0; font: 14px/1.5 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; color: var(--ink); background: var(--bg); }
    header { padding: 16px 20px; border-bottom: 1px solid var(--line); background: var(--panel); position: sticky; top: 0; z-index: 3; }
    h1 { margin: 0 0 4px; font-size: 20px; }
    h2 { margin: 0; font-size: 16px; }
    .meta { color: var(--muted); font-size: 12px; }
    .banner { margin-top: 8px; padding: 6px 10px; border: 1px solid var(--line); border-radius: 6px; background: #fff8e6; font-size: 12px; display: flex; gap: 10px; align-items: center; }
    .banner button { min-height: 24px; padding: 2px 8px; font-size: 12px; }
    .layout { display: grid; grid-template-columns: 220px minmax(0, 1fr) 300px; gap: 16px; padding: 16px; }
    nav, aside { position: sticky; top: 82px; align-self: start; max-height: calc(100vh - 100px); overflow: auto; }
    nav a { display: block; padding: 8px 10px; color: var(--ink); text-decoration: none; border-left: 3px solid transparent; }
    nav a:hover { border-left-color: var(--accent); background: #eaf3f6; }
    .toolbar, nav, aside, .section { background: var(--panel); border: 1px solid var(--line); border-radius: 6px; }
    .toolbar { padding: 10px; margin-bottom: 12px; display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
    button, select, input.f-note { border: 1px solid var(--line); background: #fff; border-radius: 4px; padding: 5px 8px; color: var(--ink); font: inherit; }
    button, select { min-height: 32px; }
    button { cursor: pointer; }
    button.primary { background: var(--accent); border-color: var(--accent); color: #fff; }
    main { min-width: 0; }
    .section { margin-bottom: 12px; overflow: hidden; }
    .section-head { display: flex; align-items: center; gap: 12px; padding: 10px 12px; border-bottom: 1px solid var(--line); background: #fbfcfd; }
    .section-head h2 { flex: 1; }
    .section.is-blocked .section-head { background: #fdf0ee; }
    .editor { min-height: 96px; padding: 12px; white-space: pre-wrap; outline: none; }
    .editor:focus { box-shadow: inset 0 0 0 2px var(--accent); }
    .note-label { display: block; padding: 0 12px 4px; color: var(--muted); font-size: 12px; }
    .note { width: calc(100% - 24px); margin: 0 12px 12px; resize: vertical; border: 1px solid var(--line); border-radius: 4px; padding: 8px; font: inherit; }
    .findings { border-top: 1px dashed var(--line); padding: 10px 12px 12px; }
    .findings-title { color: var(--muted); font-size: 12px; margin-bottom: 8px; }
    .finding { border: 1px solid var(--line); border-radius: 6px; padding: 8px 10px; margin-bottom: 8px; background: #fbfcfd; }
    .finding[hidden] { display: none; }
    .f-head { display: flex; align-items: center; gap: 6px; margin-bottom: 6px; flex-wrap: wrap; }
    .f-head select { margin-left: auto; min-height: 26px; padding: 2px 6px; font-size: 12px; }
    .f-id { color: var(--muted); font-size: 11px; }
    .f-text { margin-bottom: 6px; }
    .f-rec { color: var(--muted); font-size: 13px; margin-bottom: 6px; }
    .f-note { width: 100%; font-size: 13px; }
    .chip { display: inline-block; border-radius: 999px; padding: 1px 8px; font-size: 11px; border: 1px solid var(--line); background: #fff; }
    .chip-cat { border-color: var(--accent); color: var(--accent); }
    .chip-sev-high { border-color: var(--block); color: var(--block); }
    .chip-sev-medium { border-color: var(--change); color: var(--change); }
    .chip-sev-low { color: var(--muted); }
    .chip-block { background: var(--block); border-color: var(--block); color: #fff; }
    .chip-state { display: none; font-size: 11px; }
    .section.is-changed .chip-state { display: inline-block; border-color: var(--change); color: var(--change); }
    .section.is-blocked .chip-state { display: inline-block; border-color: var(--block); color: var(--block); }
    aside { padding: 12px; }
    .summary-item { display: flex; justify-content: space-between; border-bottom: 1px solid var(--line); padding: 8px 0; }
    .filters { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; }
    .filters button { border-radius: 999px; font-size: 12px; min-height: 26px; padding: 2px 10px; }
    .filters button.active { background: var(--accent); border-color: var(--accent); color: #fff; }
    .danger { color: var(--block); font-weight: 600; }
    .status { margin-top: 10px; color: var(--muted); min-height: 20px; font-size: 12px; }
    .autosave { color: var(--muted); font-size: 11px; min-height: 16px; }
    .hint { margin-top: 12px; color: var(--muted); font-size: 12px; border-top: 1px solid var(--line); padding-top: 10px; }
    .hint p { margin: 0 0 6px; }
    #blockers { white-space: pre-wrap; color: var(--block); font-size: 12px; margin-top: 8px; }
    @media (max-width: 900px) { .layout { grid-template-columns: 1fr; } nav, aside { position: static; max-height: none; } }
  </style>
</head>
<body>
  <header>
    <h1>${escapeHtml(labels.title)}: ${escapeHtml(feedback.briefing_slug)}</h1>
    <div class="meta">${escapeHtml(labels.source)}: ${escapeHtml(feedback.source_briefing_path)} | source hash ${escapeHtml(feedback.source_hash)} | ${escapeHtml(labels.round)} ${escapeHtml(String(feedback.round || 1))}</div>
    <div class="banner" id="restore-banner" hidden><span></span><button type="button" id="discard-draft">${escapeHtml(labels.discard_draft)}</button></div>
  </header>
  <div class="layout">
    <nav aria-label="Sections">${nav}</nav>
    <main>
      <div class="toolbar">
        <button type="button" class="primary" id="download">${escapeHtml(labels.btn_download)}</button>
        <button type="button" id="copy">${escapeHtml(labels.btn_copy)}</button>
        <button type="button" id="save">${escapeHtml(labels.btn_save)}</button>
        <span class="meta">${escapeHtml(labels.toolbar_hint)}</span>
      </div>
      ${sectionMarkup}
      ${orphanMarkup}
    </main>
    <aside>
      <h2>${escapeHtml(labels.summary_title)}</h2>
      <div class="summary-item"><span>${escapeHtml(labels.summary_changed)}</span><strong id="changed">0</strong></div>
      <div class="summary-item"><span>${escapeHtml(labels.summary_blocked)}</span><strong id="blocked" class="danger">0</strong></div>
      <div class="summary-item"><span>${escapeHtml(labels.summary_notes)}</span><strong id="notes">0</strong></div>
      <div class="summary-item"><span>${escapeHtml(labels.summary_pending_findings)}</span><strong id="pending-findings">0</strong></div>
      <div id="blockers"></div>
      <h2 style="margin-top:16px">${escapeHtml(labels.filters_title)}</h2>
      <div class="filters" id="filters">${filterButtons}</div>
      <div class="status" id="status"></div>
      <div class="autosave" id="autosave"></div>
      <div class="hint"><b>${escapeHtml(labels.hint_title)}:</b>${hintBody}<b>${escapeHtml(labels.blocks_title)}:</b> ${escapeHtml(labels.blocks_body)}</div>
    </aside>
  </div>
  <script>
    const feedback = ${safeJson(feedback)};
    const L = ${safeJson(runtimeLabels)};
    const LS_KEY = 'aioson-review:' + feedback.briefing_slug + ':' + feedback.source_hash;
    const sectionById = new Map(feedback.sections.map(section => [section.id, section]));
    const findingById = new Map((feedback.findings || []).map(finding => [finding.id, finding]));
    const statusEl = document.getElementById('status');
    const autosaveEl = document.getElementById('autosave');

    function plainText(node) {
      return (node.innerText || node.textContent || '').replace(/\\r\\n?/g, '\\n');
    }

    function setText(id, value) { document.getElementById(id).textContent = String(value); }

    function collect() {
      feedback.last_modified_at = new Date().toISOString();
      let changed = 0;
      let notes = 0;
      document.querySelectorAll('.section[data-section]').forEach(sectionEl => {
        const section = sectionById.get(sectionEl.dataset.section);
        if (!section) return;
        section.current_text = plainText(sectionEl.querySelector('.editor'));
        section.status = sectionEl.querySelector('[data-role="status"]').value;
        const note = sectionEl.querySelector('[data-role="note"]').value.trim();
        section.comments_count = note ? 1 : 0;
        const isChanged = section.current_text !== section.original_text || section.status !== 'unchanged';
        if (isChanged) changed += 1;
        if (note) notes += 1;
        sectionEl.classList.toggle('is-changed', isChanged);
        sectionEl.classList.toggle('is-blocked', section.status === 'blocked');
        const chip = sectionEl.querySelector('[data-role="state-chip"]');
        if (chip) chip.textContent = section.status === 'blocked' ? 'blocked' : (isChanged ? section.status : '');
      });
      document.querySelectorAll('.finding').forEach(findingEl => {
        const finding = findingById.get(findingEl.dataset.finding);
        if (!finding) return;
        finding.status = findingEl.querySelector('[data-role="f-status"]').value;
        finding.note = findingEl.querySelector('[data-role="f-note"]').value.trim();
      });
      feedback.comments = [];
      feedback.blocking_items = [];
      document.querySelectorAll('.section[data-section]').forEach(sectionEl => {
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
      const pendingFindings = (feedback.findings || []).filter(finding => finding.status === 'pending').length;
      setText('changed', changed);
      setText('blocked', feedback.blocking_items.length);
      setText('notes', notes);
      setText('pending-findings', pendingFindings);
      const blockersEl = document.getElementById('blockers');
      blockersEl.textContent = feedback.blocking_items.length
        ? L.blocks_prd + '\\n' + feedback.blocking_items.map(item => '- ' + item.note).join('\\n')
        : '';
    }

    function autosave() {
      try {
        localStorage.setItem(LS_KEY, JSON.stringify(feedback));
        autosaveEl.textContent = L.autosaved + ' ' + new Date().toTimeString().slice(0, 5);
      } catch (error) { /* storage unavailable (some sandboxes) — export still works */ }
    }

    function touch() { collect(); autosave(); }

    function restoreDraft() {
      let raw = null;
      try { raw = localStorage.getItem(LS_KEY); } catch (error) { return; }
      if (!raw) return;
      let draft;
      try { draft = JSON.parse(raw); } catch (error) { return; }
      if (!draft || draft.source_hash !== feedback.source_hash) return;
      (draft.sections || []).forEach(ds => {
        const sectionEl = document.querySelector('.section[data-section="' + ds.id + '"]');
        if (!sectionEl) return;
        if (typeof ds.current_text === 'string') sectionEl.querySelector('.editor').innerText = ds.current_text;
        sectionEl.querySelector('[data-role="status"]').value = ds.status || 'unchanged';
        const draftNote = (draft.comments || []).find(comment => comment.section_id === ds.id);
        sectionEl.querySelector('[data-role="note"]').value = draftNote ? draftNote.note : '';
      });
      (draft.findings || []).forEach(df => {
        const findingEl = document.querySelector('.finding[data-finding="' + df.id + '"]');
        if (!findingEl) return;
        findingEl.querySelector('[data-role="f-status"]').value = df.status || 'pending';
        findingEl.querySelector('[data-role="f-note"]').value = df.note || '';
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
          fileHandle = await window.showSaveFilePicker({ suggestedName: 'refinement-feedback.json', types: [{ description: 'JSON', accept: { 'application/json': ['.json'] } }] });
        }
        const writable = await fileHandle.createWritable();
        await writable.write(jsonText('file-system-access'));
        await writable.close();
        statusEl.textContent = L.saved;
        autosave();
      } catch (error) {
        if (error && error.name === 'AbortError') return; // user cancelled the picker
        // SecurityError/NotAllowedError: sandboxed preview (or revoked handle) —
        // degrade to download instead of dead-ending with a raw error message.
        fileHandle = null;
        download();
        statusEl.textContent = L.sandbox_fallback;
      }
    }

    document.addEventListener('input', touch);
    document.addEventListener('change', touch);
    document.getElementById('download').addEventListener('click', download);
    document.getElementById('copy').addEventListener('click', () => copyJson().catch(() => download()));
    document.getElementById('save').addEventListener('click', saveDirect);
    document.getElementById('discard-draft').addEventListener('click', () => {
      try { localStorage.removeItem(LS_KEY); } catch (error) { /* ignore */ }
      location.reload();
    });
    document.getElementById('filters').addEventListener('click', (event) => {
      const btn = event.target.closest('button[data-cat]');
      if (!btn) return;
      document.querySelectorAll('#filters button').forEach(other => other.classList.remove('active'));
      btn.classList.add('active');
      const cat = btn.dataset.cat;
      document.querySelectorAll('.finding').forEach(findingEl => {
        findingEl.hidden = !(cat === 'all' || findingEl.dataset.cat === cat);
      });
    });
    restoreDraft();
    touch();
  </script>
</body>
</html>`;
}

async function writeReviewArtifacts(projectDir, { slug, sourceMarkdown, sections, sourceHash, findings = [], round = 1, locale = 'en' }) {
  // Validates slug as a safe segment and asserts containment before any write.
  const briefingDir = resolveBriefingPath(projectDir, slug);
  const sourcePath = `.aioson/briefings/${slug}/briefings.md`;
  const feedback = buildInitialFeedback({ slug, sourcePath, sourceHash, sections, findings, round });
  const html = buildReviewHtml({ feedback, sourceMarkdown, locale });
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
