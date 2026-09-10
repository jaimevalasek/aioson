'use strict';

const path = require('node:path');
const fs = require('node:fs/promises');
const { ensureDir, exists } = require('./utils');

// --- Helpers ---

function esc(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function buildRunId(mode) {
  const now = new Date();
  const date = now.toISOString().split('T')[0];
  const time = now.toTimeString().split(' ')[0].replace(/:/g, '-');
  return `${date}_${time}_${mode}`;
}

// Only the capture a finding recorded is embedded, never "<id>.png" looked up
// by name: a leftover C-01.png from an older run attached itself to an
// unrelated new C-01, and a refused capture has no file to embed. The path
// comes from report JSON (data), so it must resolve inside the folder.
async function encodeScreenshot(screenshotsDir, file) {
  if (!file) return '';
  const dir = path.resolve(screenshotsDir);
  const filePath = path.resolve(dir, String(file));
  if (!filePath.startsWith(dir + path.sep)) return '';
  try {
    const buf = await fs.readFile(filePath);
    return `data:image/png;base64,${buf.toString('base64')}`;
  } catch { return ''; }
}

// --- CSS ---

const CSS = `
:root{--c:#dc2626;--h:#ea580c;--m:#d97706;--l:#3b82f6;--cbg:#fef2f2;--hbg:#fff7ed;--mbg:#fffbeb;--lbg:#eff6ff}
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#f8fafc;color:#1e293b;line-height:1.5}
a{color:#3b82f6;text-decoration:none}a:hover{text-decoration:underline}
header{background:#0f172a;color:#fff;padding:2rem 2.5rem}
header h1{font-size:1.4rem;font-weight:800;letter-spacing:-0.02em}
.meta{font-size:.85rem;color:#94a3b8;margin-top:.375rem;display:flex;flex-wrap:wrap;gap:.75rem}
.meta span{display:flex;align-items:center;gap:.3rem}
.summary-bar{display:flex;flex-wrap:wrap;gap:.75rem;margin-top:1.5rem}
.badge{display:inline-flex;align-items:center;gap:.35rem;padding:.35rem .875rem;border-radius:9999px;font-weight:700;font-size:.8rem;letter-spacing:.01em}
.badge.critical{background:var(--c);color:#fff}
.badge.high{background:var(--h);color:#fff}
.badge.medium{background:var(--m);color:#fff}
.badge.low{background:var(--l);color:#fff}
.badge.ok{background:#16a34a;color:#fff}
.badge.scan{background:#7c3aed;color:#fff}
.badge.run{background:#0284c7;color:#fff}
.container{max-width:960px;margin:2rem auto;padding:0 1.25rem}
.card{background:#fff;border-radius:.75rem;padding:1.5rem;margin-bottom:1.5rem;box-shadow:0 1px 3px rgba(0,0,0,.08),0 1px 2px rgba(0,0,0,.04)}
.card h2{font-size:1rem;font-weight:700;color:#0f172a;padding-bottom:.75rem;border-bottom:2px solid #f1f5f9;margin-bottom:1rem}
.filters{display:flex;flex-wrap:wrap;gap:.5rem;margin-bottom:1.25rem}
.fbtn{padding:.35rem .875rem;border:1.5px solid #e2e8f0;border-radius:9999px;background:#fff;cursor:pointer;font-size:.8rem;font-weight:600;transition:all .15s;color:#475569}
.fbtn:hover{background:#f1f5f9}
.fbtn.active{color:#fff;border-color:transparent}
.fbtn.active[data-sev="all"]{background:#0f172a}
.fbtn.active[data-sev="critical"]{background:var(--c)}
.fbtn.active[data-sev="high"]{background:var(--h)}
.fbtn.active[data-sev="medium"]{background:var(--m)}
.fbtn.active[data-sev="low"]{background:var(--l)}
details{border-left:4px solid #e2e8f0;margin-bottom:.625rem;border-radius:0 .5rem .5rem 0;overflow:hidden;transition:border-color .15s}
details.critical{border-left-color:var(--c)}
details.high{border-left-color:var(--h)}
details.medium{border-left-color:var(--m)}
details.low{border-left-color:var(--l)}
summary{display:flex;align-items:center;gap:.75rem;padding:.75rem 1rem;cursor:pointer;user-select:none;background:#f8fafc;list-style:none;-webkit-appearance:none}
summary::-webkit-details-marker{display:none}
summary:hover{background:#f1f5f9}
details[open]>summary{background:#f1f5f9}
.fid{font-family:'Courier New',monospace;font-size:.75rem;font-weight:700;color:#64748b;white-space:nowrap}
.ftitle{font-weight:600;color:#1e293b;flex:1;font-size:.9rem}
.sev-dot{width:10px;height:10px;border-radius:50%;flex-shrink:0}
.sev-dot.critical{background:var(--c)}
.sev-dot.high{background:var(--h)}
.sev-dot.medium{background:var(--m)}
.sev-dot.low{background:var(--l)}
.chevron{margin-left:auto;color:#cbd5e1;font-size:.75rem;transition:transform .2s}
details[open] .chevron{transform:rotate(90deg)}
.fbody{padding:1rem 1.25rem;background:#fff}
.field{margin-bottom:.875rem}
.field:last-child{margin-bottom:0}
.field label{font-size:.7rem;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:#94a3b8;display:block;margin-bottom:.3rem}
.field code{background:#f1f5f9;padding:.25rem .5rem;border-radius:.3rem;font-size:.82rem;word-break:break-all;display:block;color:#374151}
.field p{font-size:.875rem;color:#374151}
.fix-box{background:#f0fdf4;border:1px solid #bbf7d0;border-radius:.375rem;padding:.625rem .875rem;font-size:.875rem;color:#166534}
.shot-wrap{margin-top:.875rem}
.shot-wrap img{max-width:100%;border-radius:.5rem;border:1px solid #e2e8f0;cursor:zoom-in;display:block}
.shot-wrap .shot-label{font-size:.7rem;color:#94a3b8;margin-top:.25rem}
.perf-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:1rem}
.pcard{background:#f8fafc;border-radius:.625rem;padding:1rem;text-align:center;border:1px solid #f1f5f9}
.pcard .pval{font-size:1.75rem;font-weight:800;color:#0f172a;line-height:1}
.pcard .plabel{font-size:.72rem;color:#64748b;margin-top:.375rem;font-weight:500}
.pcard.warn .pval{color:var(--m)}
.pcard.fail .pval{color:var(--c)}
table{width:100%;border-collapse:collapse;font-size:.875rem}
th{text-align:left;padding:.5rem .875rem;background:#f8fafc;font-weight:700;font-size:.7rem;text-transform:uppercase;letter-spacing:.06em;color:#94a3b8;border-bottom:1px solid #e2e8f0}
td{padding:.625rem .875rem;border-bottom:1px solid #f8fafc;vertical-align:middle}
tr:last-child td{border-bottom:none}
.sbadge{display:inline-block;padding:.2rem .625rem;border-radius:9999px;font-size:.72rem;font-weight:700}
.sbadge.covered{background:#dcfce7;color:#15803d}
.sbadge.partial{background:#fef9c3;color:#854d0e}
.sbadge.missing{background:#fee2e2;color:#991b1b}
.sbadge.documented{background:#e0f2fe;color:#0369a1}
.residual{background:#fffbeb;border:1px solid #fde68a;border-radius:.5rem;padding:1rem 1.25rem;font-size:.875rem;color:#92400e}
.residual ul{margin-left:1.25rem;margin-top:.375rem}
.residual li{margin-top:.25rem}
.empty{text-align:center;padding:2.5rem 1rem;color:#94a3b8}
footer{text-align:center;padding:2rem;font-size:.8rem;color:#94a3b8}
.lightbox{position:fixed;inset:0;background:rgba(0,0,0,.92);display:flex;align-items:center;justify-content:center;z-index:9999;cursor:zoom-out}
.lightbox img{max-width:92vw;max-height:92vh;border-radius:.5rem}
.routes-list{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:.375rem}
.route-item{font-family:'Courier New',monospace;font-size:.78rem;color:#475569;background:#f8fafc;padding:.3rem .625rem;border-radius:.25rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
`;

// --- JS ---

const JS = `
function filter(sev){
  document.querySelectorAll('.fbtn').forEach(b=>b.classList.toggle('active',b.dataset.sev===sev));
  document.querySelectorAll('details[data-sev]').forEach(d=>{
    d.style.display=(sev==='all'||d.dataset.sev===sev)?'':'none';
  });
  const vis=document.querySelectorAll('details[data-sev]:not([style*="none"])').length;
  const empty=document.getElementById('no-findings');
  if(empty)empty.style.display=vis===0?'':'none';
}
document.querySelectorAll('.shot-wrap img').forEach(img=>{
  img.addEventListener('click',()=>{
    const lb=document.createElement('div');
    lb.className='lightbox';
    const clone=new Image();
    clone.src=img.src;
    lb.appendChild(clone);
    lb.addEventListener('click',()=>lb.remove());
    document.body.appendChild(lb);
  });
});
filter('all');
`;

// --- Severity helpers ---

function sevColor(sev) {
  return { critical: '#dc2626', high: '#ea580c', medium: '#d97706', low: '#3b82f6' }[sev] || '#64748b';
}

function acStatusClass(status) {
  const map = { Covered: 'covered', Partial: 'partial', Missing: 'missing', Documented: 'documented', 'Not exercised': 'documented' };
  return map[status] || 'documented';
}

// --- Finding card ---

function renderFinding(f, idx) {
  const sev = esc(f.severity);
  const shot = f.screenshotData
    ? `<div class="shot-wrap"><img src="${f.screenshotData}" loading="lazy" alt="screenshot ${esc(f.id)}"><div class="shot-label">Screenshot — ${esc(f.id)}</div></div>`
    : '';

  return `
<details class="${sev}" data-sev="${sev}" id="f-${idx}">
  <summary>
    <span class="sev-dot ${sev}"></span>
    <span class="fid">[${esc(f.id)}]</span>
    <span class="ftitle">${esc(f.title)}</span>
    <span class="chevron">&#9658;</span>
  </summary>
  <div class="fbody">
    <div class="field"><label>Location</label><code>${esc(f.location)}</code></div>
    <div class="field"><label>Risk</label><p>${esc(f.risk)}</p></div>
    <div class="field"><label>Fix</label><div class="fix-box">${esc(f.fix)}</div></div>
    ${shot}
  </div>
</details>`;
}

// --- Performance cards ---

function perfCardClass(value, threshold) {
  if (!threshold) return '';
  return value > threshold * 1.5 ? 'fail' : value > threshold ? 'warn' : '';
}

function renderPerf(perf, thresholds = {}) {
  if (!perf) return '';
  return `
<div class="card">
  <h2>Performance</h2>
  <div class="perf-grid">
    <div class="pcard ${perfCardClass(perf.domContentLoaded, 1500)}">
      <div class="pval">${perf.domContentLoaded}<small style="font-size:.9rem">ms</small></div>
      <div class="plabel">DOM Content Loaded</div>
    </div>
    <div class="pcard ${perfCardClass(perf.loadComplete, thresholds.page_load_ms || 3000)}">
      <div class="pval">${perf.loadComplete}<small style="font-size:.9rem">ms</small></div>
      <div class="plabel">Page Load</div>
    </div>
    <div class="pcard ${perfCardClass(perf.ttfb, thresholds.ttfb_ms || 800)}">
      <div class="pval">${perf.ttfb}<small style="font-size:.9rem">ms</small></div>
      <div class="plabel">TTFB</div>
    </div>
    <div class="pcard ${perfCardClass(perf.resourceCount, thresholds.requests_max || 80)}">
      <div class="pval">${perf.resourceCount}</div>
      <div class="plabel">Requests</div>
    </div>
    <div class="pcard ${perfCardClass(perf.resourceSizeKb, thresholds.transfer_max_kb || 2048)}">
      <div class="pval">${perf.resourceSizeKb}<small style="font-size:.9rem">KB</small></div>
      <div class="plabel">Transfer</div>
    </div>
  </div>
</div>`;
}

// --- AC coverage table ---

function renderAcCoverage(acCoverage) {
  if (!acCoverage || acCoverage.length === 0) return '';
  const rows = acCoverage.map((ac) => {
    const shot = ac.screenshotData
      ? `<a href="#" onclick="event.preventDefault();document.getElementById('ac-shot-${esc(ac.id)}').click()">view</a><img id="ac-shot-${esc(ac.id)}" src="${ac.screenshotData}" style="display:none">`
      : '—';
    return `<tr>
      <td><code style="font-size:.8rem">${esc(ac.id)}</code></td>
      <td>${esc(ac.description)}</td>
      <td><span class="sbadge ${acStatusClass(ac.status)}">${esc(ac.status)}</span></td>
      <td>${shot}</td>
    </tr>`;
  }).join('');

  return `
<div class="card">
  <h2>Acceptance Criteria Coverage</h2>
  <table>
    <thead><tr><th>AC</th><th>Description</th><th>Status</th><th>Screenshot</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>
</div>`;
}

// --- Routes list (scan mode) ---

function renderRoutes(routes) {
  if (!routes || routes.length === 0) return '';
  const items = routes.map((r) => `<div class="route-item" title="${esc(r)}">${esc(r)}</div>`).join('');
  return `
<div class="card">
  <h2>Routes Discovered (${routes.length})</h2>
  <div class="routes-list">${items}</div>
</div>`;
}

// --- Residual risks ---

const RESIDUAL_RISKS = [
  'Tests run against a running instance — production environment may differ (headers, CSP, CDN).',
  'Content behind authentication was not tested (no credentials provided).',
  'JavaScript-heavy interactions may need additional manual verification.'
];

function renderResidual() {
  return `
<div class="card">
  <h2>Residual Risks</h2>
  <div class="residual"><ul>${RESIDUAL_RISKS.map((r) => `<li>${esc(r)}</li>`).join('')}</ul></div>
</div>`;
}

// --- Main HTML builder ---

function generateHtml({ projectName, url, mode, date, findings, acCoverage, perf, summary, routes, thresholds, execution }) {
  const sorted = [...findings].sort((a, b) => {
    const o = { critical: 0, high: 1, medium: 2, low: 3 };
    return (o[a.severity] ?? 4) - (o[b.severity] ?? 4);
  });

  const dateStr = new Date(date).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' });
  const total = findings.length;

  const severityBadges = [
    summary.critical > 0 ? `<span class="badge critical">&#x26A0; ${summary.critical} Critical</span>` : '',
    summary.high > 0 ? `<span class="badge high">&#x25B2; ${summary.high} High</span>` : '',
    summary.medium > 0 ? `<span class="badge medium">&#x25CF; ${summary.medium} Medium</span>` : '',
    summary.low > 0 ? `<span class="badge low">&#x25CB; ${summary.low} Low</span>` : '',
    execution?.execution_complete === false ? '<span class="badge high">INCOMPLETE execution</span>' : '',
    total === 0 ? `<span class="badge ${execution?.execution_complete === false ? 'medium' : 'ok'}">No findings recorded</span>` : ''
  ].filter(Boolean).join('\n    ');

  const findingCards = sorted.map((f, i) => renderFinding(f, i)).join('');

  const filterSection = total > 0 ? `
<div class="filters">
  <button class="fbtn active" data-sev="all" onclick="filter('all')">All (${total})</button>
  ${summary.critical > 0 ? `<button class="fbtn" data-sev="critical" onclick="filter('critical')">Critical (${summary.critical})</button>` : ''}
  ${summary.high > 0 ? `<button class="fbtn" data-sev="high" onclick="filter('high')">High (${summary.high})</button>` : ''}
  ${summary.medium > 0 ? `<button class="fbtn" data-sev="medium" onclick="filter('medium')">Medium (${summary.medium})</button>` : ''}
  ${summary.low > 0 ? `<button class="fbtn" data-sev="low" onclick="filter('low')">Low (${summary.low})</button>` : ''}
</div>` : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>QA Report — ${esc(projectName)}</title>
<style>${CSS}</style>
</head>
<body>
<header>
  <h1>QA Browser Report — ${esc(projectName)}</h1>
  <div class="meta">
    <span>&#128197; ${esc(dateStr)}</span>
    <span>&#127759; <a href="${esc(url)}" style="color:#93c5fd" target="_blank" rel="noopener">${esc(url)}</a></span>
    <span>&#128269; Mode: <span class="badge ${esc(mode)}" style="padding:.15rem .5rem;font-size:.72rem">${esc(mode)}</span></span>
    <span>&#9881; aioson qa:${esc(mode)}</span>
  </div>
  <div class="summary-bar">
    ${severityBadges}
  </div>
</header>

<div class="container">

${renderAcCoverage(acCoverage)}

${mode === 'scan' ? renderRoutes(routes) : ''}

${execution ? `<div class="card"><h2>Execution: ${execution.execution_complete ? 'COMPLETE' : 'INCOMPLETE'}</h2><p>Execution is not proof of complete security coverage. executed = ran without findings; failed = ran with findings; unavailable = not completed; not_applicable = absent surface.</p><ul>${execution.probe_results.map((row) => `<li>${esc(row.probe)}: ${esc(row.status)} — ${esc(row.target)}${row.reason ? ` (${esc(row.reason)})` : ''}</li>`).join('')}</ul></div>` : ''}

<div class="card">
  <h2>Findings</h2>
  ${filterSection}
  ${total > 0 ? findingCards : '<div class="empty">No findings recorded. Consult execution status and residual risks.</div>'}
  <div id="no-findings" style="display:none" class="empty">No findings match this filter.</div>
</div>

${renderPerf(perf, thresholds)}

${renderResidual()}

</div>

<footer>Generated by <strong>aioson</strong> &mdash; <a href="https://github.com/jaimevalasek/aioson">github.com/jaimevalasek/aioson</a></footer>
<script>${JS}</script>
</body>
</html>`;
}

// --- Reports index ---

async function updateReportsIndex(reportsDir) {
  let entries = [];
  try {
    const items = await fs.readdir(reportsDir, { withFileTypes: true });
    for (const item of items) {
      if (!item.isDirectory()) continue;
      const metaPath = path.join(reportsDir, item.name, 'meta.json');
      try {
        const raw = await fs.readFile(metaPath, 'utf8');
        entries.push({ folder: item.name, ...JSON.parse(raw) });
      } catch {
        entries.push({ folder: item.name, mode: '?', project: item.name, url: '', summary: {}, date: '' });
      }
    }
  } catch { return; }

  entries.sort((a, b) => b.folder.localeCompare(a.folder)); // newest first

  const rows = entries.map((e) => {
    const s = e.summary || {};
    const badges = [
      s.critical > 0 ? `<span class="badge critical">${s.critical} C</span>` : '',
      s.high > 0 ? `<span class="badge high">${s.high} H</span>` : '',
      s.medium > 0 ? `<span class="badge medium">${s.medium} M</span>` : '',
      s.low > 0 ? `<span class="badge low">${s.low} L</span>` : '',
      e.execution_complete === false ? '<span class="badge high">INCOMPLETE</span>' : '',
      (!s.critical && !s.high && !s.medium && !s.low && e.execution_complete !== false) ? `<span class="badge ok">No findings recorded</span>` : ''
    ].filter(Boolean).join(' ');

    const dateStr = e.date ? new Date(e.date).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' }) : e.folder;

    return `<tr>
      <td>${esc(dateStr)}</td>
      <td><span class="sbadge documented">${esc(e.mode)}</span></td>
      <td style="font-size:.8rem;color:#475569">${esc(e.url || '')}</td>
      <td>${badges}</td>
      <td><a href="${esc(e.folder)}/index.html">View &rarr;</a></td>
    </tr>`;
  }).join('');

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>QA Reports — History</title>
<style>${CSS}body{background:#f8fafc}header{padding:1.5rem 2.5rem}</style>
</head>
<body>
<header>
  <h1>QA Reports — History</h1>
  <div class="meta"><span>${entries.length} run(s) recorded</span></div>
</header>
<div class="container">
  <div class="card">
    <h2>All Runs</h2>
    ${entries.length > 0 ? `<table>
      <thead><tr><th>Date</th><th>Mode</th><th>URL</th><th>Summary</th><th></th></tr></thead>
      <tbody>${rows}</tbody>
    </table>` : '<div class="empty">No reports yet.</div>'}
  </div>
</div>
<footer>Generated by <strong>aioson</strong></footer>
</body>
</html>`;

  await fs.writeFile(path.join(reportsDir, 'index.html'), html, 'utf8');
}

// --- Main export ---

async function writeHtmlReport(targetDir, projectName, url, findings, acCoverage, perf, mode, screenshotsDir, extraData = {}) {
  const runId = buildRunId(mode);
  const reportsDir = path.join(targetDir, 'reports');
  const runDir = path.join(reportsDir, runId);

  await ensureDir(runDir);

  // Encode screenshots from findings
  const findingsWithShots = await Promise.all(
    findings.map(async (f) => ({
      ...f,
      screenshotData: await encodeScreenshot(screenshotsDir, f.screenshot)
    }))
  );

  // Encode AC screenshots
  const acWithShots = await Promise.all(
    (acCoverage || []).map(async (ac) => ({
      ...ac,
      screenshotData: await encodeScreenshot(screenshotsDir, ac.screenshot)
    }))
  );

  const bySev = (s) => findings.filter((f) => f.severity === s).length;
  const summary = { critical: bySev('critical'), high: bySev('high'), medium: bySev('medium'), low: bySev('low') };

  const html = generateHtml({
    projectName,
    url,
    mode,
    date: new Date().toISOString(),
    findings: findingsWithShots,
    acCoverage: acWithShots,
    perf,
    summary,
    routes: extraData.routes || null,
    thresholds: extraData.thresholds || {},
    execution: extraData.execution
  });

  const htmlPath = path.join(runDir, 'index.html');
  await fs.writeFile(htmlPath, html, 'utf8');

  // Write meta.json for the index
  const meta = { runId, date: new Date().toISOString(), mode, url, project: projectName, summary };
  if (extraData.execution) meta.execution_complete = extraData.execution.execution_complete;
  await fs.writeFile(path.join(runDir, 'meta.json'), `${JSON.stringify(meta, null, 2)}\n`, 'utf8');

  // Update reports/index.html
  await updateReportsIndex(reportsDir);

  return { htmlPath, runDir, runId, reportsDir };
}

module.exports = { writeHtmlReport, generateHtml, buildRunId };
