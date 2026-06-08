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

function buildReviewHtml(data) {
  const feedback = data.feedback;
  const sections = feedback.sections || [];
  const nav = sections.map((section) => `<a href="#${escapeHtml(section.id)}">${escapeHtml(section.title)}</a>`).join('');
  const sectionMarkup = sections.map((section) => `
      <section class="section" id="${escapeHtml(section.id)}" data-section="${escapeHtml(section.id)}">
        <div class="section-head">
          <h2>${escapeHtml(section.title)}</h2>
          <select data-role="status">
            <option value="unchanged">unchanged</option>
            <option value="accepted">accepted</option>
            <option value="change_requested">change_requested</option>
            <option value="remove_requested">remove_requested</option>
            <option value="blocked">blocked</option>
          </select>
        </div>
        <div class="editor" contenteditable="plaintext-only" spellcheck="true">${escapeHtml(section.current_text || '')}</div>
        <label class="note-label">Notes</label>
        <textarea class="note" data-role="note" rows="3" placeholder="Plain text note for this section"></textarea>
      </section>`).join('\n');

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Briefing Review - ${escapeHtml(feedback.briefing_slug)}</title>
  <style>
    :root { color-scheme: light; --bg: #f6f7f9; --panel: #ffffff; --ink: #172026; --muted: #5c6975; --line: #d8dee6; --accent: #0b6f85; --block: #b42318; --change: #8a5a00; --ok: #1b7f3a; }
    * { box-sizing: border-box; }
    body { margin: 0; font: 14px/1.5 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; color: var(--ink); background: var(--bg); }
    header { padding: 16px 20px; border-bottom: 1px solid var(--line); background: var(--panel); position: sticky; top: 0; z-index: 3; }
    h1 { margin: 0 0 4px; font-size: 20px; }
    h2 { margin: 0; font-size: 16px; }
    .meta { color: var(--muted); font-size: 12px; }
    .layout { display: grid; grid-template-columns: 220px minmax(0, 1fr) 300px; gap: 16px; padding: 16px; }
    nav, aside { position: sticky; top: 82px; align-self: start; max-height: calc(100vh - 100px); overflow: auto; }
    nav a { display: block; padding: 8px 10px; color: var(--ink); text-decoration: none; border-left: 3px solid transparent; }
    nav a:hover { border-left-color: var(--accent); background: #eaf3f6; }
    .toolbar, nav, aside, .section { background: var(--panel); border: 1px solid var(--line); border-radius: 6px; }
    .toolbar { padding: 10px; margin-bottom: 12px; display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
    button, select { min-height: 32px; border: 1px solid var(--line); background: #fff; border-radius: 4px; padding: 5px 8px; color: var(--ink); }
    button.primary { background: var(--accent); border-color: var(--accent); color: #fff; }
    main { min-width: 0; }
    .section { margin-bottom: 12px; overflow: hidden; }
    .section-head { display: flex; justify-content: space-between; gap: 12px; padding: 10px 12px; border-bottom: 1px solid var(--line); background: #fbfcfd; }
    .editor { min-height: 96px; padding: 12px; white-space: pre-wrap; outline: none; }
    .editor:focus { box-shadow: inset 0 0 0 2px var(--accent); }
    .note-label { display: block; padding: 0 12px 4px; color: var(--muted); font-size: 12px; }
    .note { width: calc(100% - 24px); margin: 0 12px 12px; resize: vertical; border: 1px solid var(--line); border-radius: 4px; padding: 8px; font: inherit; }
    aside { padding: 12px; }
    .summary-item { display: flex; justify-content: space-between; border-bottom: 1px solid var(--line); padding: 8px 0; }
    .filters label { display: block; margin: 6px 0; color: var(--muted); }
    .danger { color: var(--block); font-weight: 600; }
    .status { margin-top: 10px; color: var(--muted); min-height: 20px; }
    @media (max-width: 900px) { .layout { grid-template-columns: 1fr; } nav, aside { position: static; max-height: none; } }
  </style>
</head>
<body>
  <header>
    <h1>Briefing Review: ${escapeHtml(feedback.briefing_slug)}</h1>
    <div class="meta">${escapeHtml(feedback.source_briefing_path)} | source hash ${escapeHtml(feedback.source_hash)}</div>
  </header>
  <div class="layout">
    <nav aria-label="Sections">${nav}</nav>
    <main>
      <div class="toolbar">
        <button class="primary" id="download">Download JSON</button>
        <button id="copy">Copy JSON</button>
        <button id="save">Save JSON</button>
        <span class="meta">Save writes structured feedback only. HTML edits are not canonical until exported.</span>
      </div>
      ${sectionMarkup}
    </main>
    <aside>
      <h2>Review State</h2>
      <div class="summary-item"><span>Changed</span><strong id="changed">0</strong></div>
      <div class="summary-item"><span>Blocked</span><strong id="blocked" class="danger">0</strong></div>
      <div class="summary-item"><span>Notes</span><strong id="notes">0</strong></div>
      <h2 style="margin-top:16px">Filters</h2>
      <div class="filters">
        <label><input type="checkbox" value="ambiguity"> ambiguity</label>
        <label><input type="checkbox" value="redundancy"> redundancy</label>
        <label><input type="checkbox" value="gap"> gap</label>
        <label><input type="checkbox" value="risk"> risk</label>
        <label><input type="checkbox" value="pending-decision"> pending decision</label>
        <label><input type="checkbox" value="scope"> scope suggestion</label>
      </div>
      <div class="status" id="status"></div>
    </aside>
  </div>
  <script>
    const feedback = ${safeJson(feedback)};
    const byId = new Map(feedback.sections.map(section => [section.id, section]));
    const statusEl = document.getElementById('status');

    function plainText(node) {
      return (node.innerText || node.textContent || '').replace(/\\r\\n/g, '\\n');
    }

    function touch() {
      feedback.last_modified_at = new Date().toISOString();
      let changed = 0;
      let blocked = 0;
      let notes = 0;
      document.querySelectorAll('.section').forEach(sectionEl => {
        const id = sectionEl.dataset.section;
        const section = byId.get(id);
        const text = plainText(sectionEl.querySelector('.editor'));
        const status = sectionEl.querySelector('[data-role="status"]').value;
        const note = sectionEl.querySelector('[data-role="note"]').value.trim();
        section.current_text = text;
        section.status = status;
        section.comments_count = note ? 1 : 0;
        if (text !== section.original_text || status !== 'unchanged') changed += 1;
        if (status === 'blocked') blocked += 1;
        if (note) notes += 1;
      });
      feedback.comments = [];
      feedback.blocking_items = [];
      document.querySelectorAll('.section').forEach(sectionEl => {
        const id = sectionEl.dataset.section;
        const note = sectionEl.querySelector('[data-role="note"]').value.trim();
        const status = sectionEl.querySelector('[data-role="status"]').value;
        if (note) {
          const severity = status === 'blocked' ? 'blocking' : 'note';
          feedback.comments.push({ id: 'comment-' + id, section_id: id, target_text_hash: null, note, severity, resolved: false });
        }
        if (status === 'blocked') {
          feedback.blocking_items.push({ id: 'block-' + id, section_id: id, note: note || 'Section marked as blocked', resolved: false });
        }
      });
      document.getElementById('changed').textContent = String(changed);
      document.getElementById('blocked').textContent = String(blocked);
      document.getElementById('notes').textContent = String(notes);
    }

    function jsonText(method) {
      feedback.export_method = method;
      touch();
      return JSON.stringify(feedback, null, 2);
    }

    function download() {
      const blob = new Blob([jsonText('download')], { type: 'application/json' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = 'refinement-feedback.json';
      link.click();
      URL.revokeObjectURL(link.href);
      statusEl.textContent = 'Downloaded refinement-feedback.json';
    }

    async function copyJson() {
      await navigator.clipboard.writeText(jsonText('copy-paste'));
      statusEl.textContent = 'Copied JSON to clipboard';
    }

    async function saveJson() {
      if (!window.showSaveFilePicker) {
        download();
        statusEl.textContent = 'Direct save unavailable; downloaded JSON instead';
        return;
      }
      const handle = await window.showSaveFilePicker({ suggestedName: 'refinement-feedback.json', types: [{ description: 'JSON', accept: { 'application/json': ['.json'] } }] });
      const writable = await handle.createWritable();
      await writable.write(jsonText('file-system-access'));
      await writable.close();
      statusEl.textContent = 'Saved refinement-feedback.json';
    }

    document.addEventListener('input', touch);
    document.addEventListener('change', touch);
    document.getElementById('download').addEventListener('click', download);
    document.getElementById('copy').addEventListener('click', () => copyJson().catch(() => download()));
    document.getElementById('save').addEventListener('click', () => saveJson().catch(error => { statusEl.textContent = error.message; }));
    touch();
  </script>
</body>
</html>`;
}

async function writeReviewArtifacts(projectDir, { slug, sourceMarkdown, sections, sourceHash }) {
  // Validates slug as a safe segment and asserts containment before any write.
  const briefingDir = resolveBriefingPath(projectDir, slug);
  const sourcePath = `.aioson/briefings/${slug}/briefings.md`;
  const feedback = buildInitialFeedback({ slug, sourcePath, sourceHash, sections });
  const html = buildReviewHtml({ feedback, sourceMarkdown });
  const report = buildRefinementReport({
    briefing_slug: slug,
    source_briefing_path: sourcePath,
    source_hash: sourceHash,
    status: 'review_generated',
    next_action: 'rerun_review',
    applied_changes: [],
    skipped_changes: [],
    unresolved_comments: [],
    blocking_items: []
  });

  await fs.mkdir(briefingDir, { recursive: true });
  await fs.writeFile(path.join(briefingDir, 'review.html'), html, 'utf8');
  await fs.writeFile(path.join(briefingDir, 'refinement-feedback.json'), `${JSON.stringify(feedback, null, 2)}\n`, 'utf8');
  await fs.writeFile(path.join(briefingDir, 'refinement-report.md'), report, 'utf8');

  return { feedback, html, report };
}

module.exports = { buildReviewHtml, escapeHtml, safeJson, writeReviewArtifacts };
