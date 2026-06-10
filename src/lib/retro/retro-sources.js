'use strict';

/**
 * Leitores de fonte para `aioson harness:retro` (RHO-lite, requirements §3.2/§5.1).
 *
 * Um leitor por fonte; cada um é best-effort independente (padrão de
 * `attempt-artifacts.js`): nunca propaga exceção, sempre devolve
 * `{ findings, warnings, count, ... }`. Fonte ausente, vazia, ilegível ou DB
 * lockado vira linha de aviso na "Trilha minerada", nunca erro fatal (REQ-3).
 *
 * Mineração 100% determinística (REQ-1): nenhuma chamada LLM, nenhuma
 * classificação semântica — só regex e chaves exatas. Leitura-apenas: este
 * módulo NUNCA escreve no filesystem.
 */

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const FINDING_ID_RE = /\b([A-Z]{1,2}-\d{1,2})\b/;
const TRAIL_ENTRY_RE = /^\*\*([^*]+)\*\*\s*\|\s*@?([\w.-]+)\s*\|\s*_([^_]+)_\s*$/;
const VERDICT_RE = /\b(?:verdict|veredicto)\b[^\n]*?\b(PASS|FAIL)\b/i;
const VERDICT_FALLBACK_RE = /\b(PASS|FAIL)\b/i;
const ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;

const SEVERITY_ALIASES = {
  critical: 'critical',
  crit: 'critical',
  high: 'high',
  med: 'medium',
  medium: 'medium',
  low: 'low',
  info: 'info',
  informational: 'info'
};

/** Normaliza severidade (case-insensitive); desconhecida → `unknown` (nunca promove). */
function normalizeSeverity(raw) {
  if (raw === null || raw === undefined) return 'unknown';
  const key = String(raw).trim().toLowerCase();
  return SEVERITY_ALIASES[key] || 'unknown';
}

/** Path relativo com separador POSIX (determinismo cross-OS — AC-4, EC Windows). */
function relPath(rootDir, p) {
  return path.relative(rootDir, p).replaceAll('\\', '/');
}

function readTextSafe(p) {
  try {
    return fs.readFileSync(p, 'utf8');
  } catch {
    return null;
  }
}

function listFilesSafe(dir) {
  try {
    return fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
}

function statSizeSafe(p) {
  try {
    return fs.statSync(p).size;
  } catch {
    return 0;
  }
}

/** Parser de frontmatter YAML simples (`key: value`, valor escalar de 1 linha). */
function parseFrontmatter(text) {
  if (typeof text !== 'string' || !text.startsWith('---')) return { data: {}, body: text || '' };
  const end = text.indexOf('\n---', 3);
  if (end === -1) return { data: {}, body: text };
  const block = text.slice(3, end).replace(/^\r?\n/, '');
  const body = text.slice(end + 4);
  const data = {};
  for (const line of block.split(/\r?\n/)) {
    const m = line.match(/^([A-Za-z0-9_]+):\s*(.*)$/);
    if (!m) continue;
    // Remove comentário inline (ex.: `status: resolved   # open | ...`).
    let value = m[2].replace(/\s+#.*$/, '').trim();
    value = value.replace(/^["']|["']$/g, '');
    data[m[1]] = value;
  }
  return { data, body };
}

function isoDate(raw) {
  if (!raw) return null;
  const m = String(raw).match(/\d{4}-\d{2}-\d{2}(?:T[\d:.+Z-]+)?/);
  return m ? m[0] : null;
}

function makeFinding(partial) {
  return {
    source_type: partial.source_type,
    feature_slug: partial.feature_slug,
    finding_id: partial.finding_id || null,
    severity: normalizeSeverity(partial.severity),
    title: (partial.title ? String(partial.title) : '').slice(0, 200),
    file_ref: partial.file_ref || null,
    date: partial.date || null,
    status: partial.status || 'unknown',
    source_path: partial.source_path,
    signature: partial.signature || null
  };
}

// --- 1. QA reports ----------------------------------------------------------

const KNOWN_SEVERITIES = new Set(['critical', 'high', 'medium', 'low', 'info']);

/** Extrai findings estruturados de um QA report (tabelas + headers de finding). */
function extractQaFindings({ body, slug, sourcePath, date, status }) {
  const found = new Map(); // finding_id → finding (primeiro vence)
  for (const rawLine of body.split(/\r?\n/)) {
    const line = rawLine.trim();
    // Linha de tabela: | ID | Sev | ... |
    if (line.startsWith('|')) {
      const cells = line.split('|').map((c) => c.trim()).filter((c, i, arr) => i > 0 && i < arr.length);
      if (cells.length >= 2) {
        const idMatch = cells[0].match(FINDING_ID_RE);
        if (idMatch) {
          const sevCell = cells.find((c) => KNOWN_SEVERITIES.has(c.toLowerCase()));
          if (sevCell) {
            const id = idMatch[1];
            if (!found.has(id)) {
              found.set(id, makeFinding({
                source_type: 'qa_report', feature_slug: slug, finding_id: id,
                severity: sevCell, title: cells[2] || cells[1] || id,
                date, status, source_path: sourcePath
              }));
            }
          }
        }
      }
      continue;
    }
    // Header de finding: ### C-01 — Title (High)
    const head = rawLine.match(/^#{2,5}\s+([A-Z]{1,2}-\d{1,2})\b\s*[—:-]?\s*(.*)$/);
    if (head) {
      const id = head[1];
      if (!found.has(id)) {
        const sevMatch = head[2].match(/\(([A-Za-z]+)/);
        found.set(id, makeFinding({
          source_type: 'qa_report', feature_slug: slug, finding_id: id,
          severity: sevMatch ? sevMatch[1] : 'unknown',
          title: head[2].replace(/\(.*$/, '').trim() || id,
          date, status, source_path: sourcePath
        }));
      }
    }
  }
  return [...found.values()];
}

function readQaReports({ rootDir, ctxDir, slug, locations }) {
  const findings = [];
  const warnings = [];
  let count = 0;
  for (const dir of locations.qaDirs) {
    for (const ent of listFilesSafe(dir)) {
      if (!ent.isFile()) continue;
      if (!/^qa-report-/.test(ent.name) || !ent.name.endsWith('.md')) continue;
      if (!ent.name.includes(slug)) continue;
      const full = path.join(dir, ent.name);
      const text = readTextSafe(full);
      if (text === null) {
        warnings.push(`qa_report ilegível: ${relPath(rootDir, full)}`);
        continue;
      }
      count += 1;
      const { data, body } = parseFrontmatter(text);
      const date = isoDate(data.created_at || data.updated_at || data.date);
      const status = (data.verdict || '').toUpperCase() === 'FAIL' ? 'open' : 'fixed';
      findings.push(...extractQaFindings({ body, slug, sourcePath: relPath(rootDir, full), date, status }));
    }
  }
  return { findings, warnings, count };
}

// --- 2. Corrections plans ---------------------------------------------------

function mapCorrectionStatus(raw) {
  const v = String(raw || '').toLowerCase();
  if (v === 'resolved') return 'fixed';
  if (v === 'open' || v === 'in_progress') return 'open';
  return 'unknown';
}

function readCorrections({ rootDir, slug, locations }) {
  const findings = [];
  const warnings = [];
  let count = 0;
  let bytes = 0;
  let entries = 0;
  for (const dir of locations.planDirs) {
    for (const ent of listFilesSafe(dir)) {
      if (!ent.isFile()) continue;
      if (!/^corrections-.*\.md$/.test(ent.name)) continue;
      const full = path.join(dir, ent.name);
      const text = readTextSafe(full);
      if (text === null) {
        warnings.push(`corrections ilegível: ${relPath(rootDir, full)}`);
        continue;
      }
      count += 1;
      bytes += statSizeSafe(full);
      const { data, body } = parseFrontmatter(text);
      const status = mapCorrectionStatus(data.status);
      const date = isoDate(data.created || data.date);
      const sourcePath = relPath(rootDir, full);
      const lines = body.split(/\r?\n/);
      for (let i = 0; i < lines.length; i += 1) {
        const head = lines[i].match(/^#{2,5}\s+([A-Z]{1,2}-\d{1,2})\s*[—:-]\s*(.+?)\s*$/);
        if (!head) continue;
        entries += 1;
        const sevMatch = head[2].match(/\(([A-Za-z]+)/);
        // Procura linha File:/Files: logo após o header.
        let fileRef = null;
        for (let j = i + 1; j < Math.min(i + 4, lines.length); j += 1) {
          const fm = lines[j].match(/^Files?:\s*(.+)$/i);
          if (fm) { fileRef = fm[1].trim(); break; }
        }
        findings.push(makeFinding({
          source_type: 'corrections', feature_slug: slug, finding_id: head[1],
          severity: sevMatch ? sevMatch[1] : 'unknown',
          title: head[2].replace(/\s*\(.*$/, '').trim(),
          file_ref: fileRef, date, status, source_path: sourcePath
        }));
      }
    }
  }
  return { findings, warnings, count, bytes, entries };
}

// --- 3. Dossier Agent Trail (verdicts + ciclos FAIL→PASS) -------------------

function readDossierTrail({ rootDir, slug, locations }) {
  const findings = [];
  const warnings = [];
  const cycles = [];
  let count = 0;
  let illegible = 0;

  for (const full of locations.dossierFiles) {
    const text = readTextSafe(full);
    if (text === null) continue;
    const sourcePath = relPath(rootDir, full);
    const trailIdx = text.indexOf('## Agent Trail');
    const region = trailIdx === -1 ? text : text.slice(trailIdx);
    const lines = region.split(/\r?\n/);

    // Acha headers de entrada e fatia o corpo entre eles.
    const entries = [];
    for (let i = 0; i < lines.length; i += 1) {
      const m = lines[i].match(TRAIL_ENTRY_RE);
      if (!m) continue;
      const ts = m[1].trim();
      const agent = m[2].trim().toLowerCase();
      const section = m[3].trim();
      if (!ISO_RE.test(ts)) { illegible += 1; continue; }
      // Corpo: até o próximo header de entrada.
      const bodyLines = [];
      for (let j = i + 1; j < lines.length; j += 1) {
        if (TRAIL_ENTRY_RE.test(lines[j])) break;
        if (/^<!--\s*sha256:/.test(lines[j])) continue;
        bodyLines.push(lines[j]);
      }
      entries.push({ ts, agent, section, body: bodyLines.join('\n') });
    }

    if (entries.length === 0) continue;
    count += entries.length;

    // Verdicts ordenados por timestamp → ciclos FAIL→PASS (D5). O trail é fonte
    // de VERDICTS/ciclos, não de findings: extrair findings do resumo @qa do
    // trail duplicaria o que já vem do corrections plan / QA report (fonte
    // autoritativa). Mantemos a leitura determinística e sem dupla contagem.
    const verdicts = [];
    for (const e of entries) {
      let vm = e.body.match(VERDICT_RE);
      if (!vm && e.agent === 'qa') vm = e.body.match(VERDICT_FALLBACK_RE);
      if (vm) verdicts.push({ ts: e.ts, verdict: vm[1].toUpperCase() });
    }
    verdicts.sort((a, b) => (a.ts < b.ts ? -1 : a.ts > b.ts ? 1 : 0));
    let openFail = null;
    for (const v of verdicts) {
      if (v.verdict === 'FAIL') {
        openFail = v.ts;
      } else if (v.verdict === 'PASS' && openFail) {
        cycles.push({ feature_slug: slug, fail_at: openFail, pass_at: v.ts, source_path: sourcePath });
        openFail = null;
      }
    }
  }

  if (illegible > 0) warnings.push(`dossier_trail: ${illegible} entrada(s) ilegível(is) (sem timestamp ISO)`);
  return { findings, warnings, count, cycles };
}

// --- 4. execution_events (aios.sqlite, readonly — D7) -----------------------

function readExecutionEvents({ rootDir, targetDir, slug }) {
  const warnings = [];
  let count = 0;
  let tokenAvailable = false;
  let tokenTotal = 0;
  const dbPath = path.join(targetDir, '.aioson', 'runtime', 'aios.sqlite');
  if (!fs.existsSync(dbPath)) {
    return { findings: [], warnings: [`execution_events: ${relPath(rootDir, dbPath)} ausente`], count: 0, tokenAvailable, tokenTotal };
  }
  let Database;
  try {
    Database = require('better-sqlite3');
  } catch {
    return { findings: [], warnings: ['execution_events: better-sqlite3 indisponível'], count: 0, tokenAvailable, tokenTotal };
  }
  let db = null;
  try {
    db = new Database(dbPath, { readonly: true, fileMustExist: true });
    const rows = db.prepare('SELECT payload_json, token_count FROM execution_events').all();
    for (const row of rows) {
      if (!row.payload_json) continue;
      let payload;
      try {
        payload = JSON.parse(row.payload_json);
      } catch {
        continue;
      }
      if (!payload || payload.slug !== slug) continue;
      count += 1;
      if (row.token_count !== null && row.token_count !== undefined) {
        tokenAvailable = true;
        tokenTotal += Number(row.token_count) || 0;
      }
    }
  } catch (err) {
    warnings.push(`execution_events: DB ilegível/lockado (${err.code || 'erro'})`);
  } finally {
    try { if (db) db.close(); } catch { /* best-effort */ }
  }
  return { findings: [], warnings, count, tokenAvailable, tokenTotal };
}

// --- 5. attempts/{n}/ -------------------------------------------------------

function readAttempts({ rootDir, slug, locations }) {
  const warnings = [];
  let count = 0;
  for (const planDir of locations.planDirs) {
    const attemptsDir = path.join(planDir, 'attempts');
    for (const ent of listFilesSafe(attemptsDir)) {
      if (ent.isDirectory() && /^\d+$/.test(ent.name)) count += 1;
    }
  }
  return { findings: [], warnings, count };
}

// --- 6. progress.json failure_signatures ------------------------------------

function readFailureSignatures({ rootDir, slug, locations }) {
  const findings = [];
  const warnings = [];
  let count = 0;
  for (const planDir of locations.planDirs) {
    const full = path.join(planDir, 'progress.json');
    const text = readTextSafe(full);
    if (text === null) continue;
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      warnings.push(`progress.json ilegível: ${relPath(rootDir, full)}`);
      continue;
    }
    const sigs = Array.isArray(data.failure_signatures) ? data.failure_signatures : [];
    const sourcePath = relPath(rootDir, full);
    for (const entry of sigs) {
      const signature = typeof entry === 'string' ? entry : (entry && (entry.signature || entry.sha1)) || null;
      if (!signature) continue;
      const occurrences = typeof entry === 'object' && Number.isInteger(entry.occurrences)
        ? Math.max(1, entry.occurrences)
        : (typeof entry === 'object' && Number.isInteger(entry.count) ? Math.max(1, entry.count) : 1);
      const title = (typeof entry === 'object' && entry.title) ? entry.title : `failure signature ${String(signature).slice(0, 12)}`;
      const severity = (typeof entry === 'object' && entry.severity) ? entry.severity : 'unknown';
      for (let k = 0; k < occurrences; k += 1) {
        count += 1;
        findings.push(makeFinding({
          source_type: 'progress', feature_slug: slug, finding_id: null,
          severity, title, date: null, status: 'open',
          source_path: sourcePath, signature: String(signature)
        }));
      }
    }
  }
  return { findings, warnings, count };
}

// --- 7. Devlogs (aioson-logs/) ----------------------------------------------

function readDevlogs({ rootDir, targetDir, slug }) {
  const findings = [];
  const warnings = [];
  let count = 0;
  const logsDir = path.join(targetDir, 'aioson-logs');
  for (const ent of listFilesSafe(logsDir)) {
    if (!ent.isFile() || !ent.name.endsWith('.md')) continue;
    const full = path.join(logsDir, ent.name);
    const text = readTextSafe(full);
    if (text === null) continue;
    const { data } = parseFrontmatter(text);
    if (data.feature !== slug) continue;
    count += 1;
  }
  return { findings, warnings, count };
}

// --- Localização de artefatos por feature (ativo + arquivado) ---------------

function dirExists(p) {
  try {
    return fs.statSync(p).isDirectory();
  } catch {
    return false;
  }
}

/**
 * Resolve os diretórios/arquivos de uma feature em locais ativos E arquivados
 * (`done/{slug}/`). Não inventa um segundo enumerador — espelha o layout que
 * `feature-archive.js` produz.
 */
function resolveLocations(targetDir, ctxDir, slug) {
  const doneRoot = path.join(ctxDir, 'done', slug);

  const qaDirs = [ctxDir, doneRoot].filter(dirExists);

  const planDirs = [
    path.join(targetDir, '.aioson', 'plans', slug),
    path.join(doneRoot, 'plans')
  ].filter(dirExists);

  const dossierCandidates = [
    path.join(ctxDir, 'features', slug, 'dossier.md'),
    path.join(doneRoot, 'features', slug, 'dossier.md'),
    path.join(doneRoot, 'dossier.md')
  ];
  // SF-02: lstat (não statSync) para NÃO seguir symlink — consistente com os
  // demais readers, que pulam symlinks via Dirent.isFile(). Um dossier.md que
  // seja um symlink apontando para fora do workspace é ignorado, não seguido.
  const dossierFiles = dossierCandidates.filter((p) => {
    try { return fs.lstatSync(p).isFile(); } catch { return false; }
  });

  return { qaDirs, planDirs, dossierFiles, doneRoot };
}

/**
 * Minera todas as fontes de UMA feature. Best-effort: nunca lança.
 *
 * @returns {{ slug, findings, cycles, counts, cost, minedPaths, warnings }}
 */
function collectFeatureSources(targetDir, slug) {
  const ctxDir = path.join(targetDir, '.aioson', 'context');
  const rootDir = targetDir;
  const locations = resolveLocations(targetDir, ctxDir, slug);

  const warnings = [];
  const findings = [];
  const cycles = [];

  const qa = readQaReports({ rootDir, ctxDir, slug, locations });
  const corr = readCorrections({ rootDir, slug, locations });
  const trail = readDossierTrail({ rootDir, slug, locations });
  const events = readExecutionEvents({ rootDir, targetDir, slug });
  const attempts = readAttempts({ rootDir, slug, locations });
  const sigs = readFailureSignatures({ rootDir, slug, locations });
  const devlogs = readDevlogs({ rootDir, targetDir, slug });

  for (const r of [qa, corr, trail, events, attempts, sigs, devlogs]) {
    findings.push(...r.findings);
    warnings.push(...r.warnings);
  }
  cycles.push(...trail.cycles);

  const counts = {
    qa_reports: qa.count,
    corrections: corr.count,
    dossier_trail: trail.count,
    execution_events: events.count,
    attempts: attempts.count,
    failure_signatures: sigs.count,
    devlogs: devlogs.count
  };

  const cost = {
    execution_events: events.count,
    corrections: corr.entries,
    fail_pass_cycles: cycles.length,
    corrections_bytes: corr.bytes,
    token_count_available: events.tokenAvailable,
    token_total: events.tokenAvailable ? events.tokenTotal : null
  };

  const minedPaths = [];
  for (const d of locations.qaDirs) minedPaths.push(relPath(rootDir, d));
  for (const d of locations.planDirs) minedPaths.push(relPath(rootDir, d));
  for (const f of locations.dossierFiles) minedPaths.push(relPath(rootDir, f));
  minedPaths.sort();

  return { slug, findings, cycles, counts, cost, minedPaths, warnings };
}

/**
 * Minera uma janela de features (1+). Soma contagens/custo e concatena
 * findings/cycles (a chave de agrupamento inclui o slug, então misturar é seguro).
 */
function collectSources(targetDir, slugs) {
  const list = Array.isArray(slugs) ? slugs : [slugs];
  const findings = [];
  const cycles = [];
  const warnings = [];
  const minedPaths = [];
  const counts = { qa_reports: 0, corrections: 0, dossier_trail: 0, execution_events: 0, attempts: 0, failure_signatures: 0, devlogs: 0 };
  const cost = { execution_events: 0, corrections: 0, fail_pass_cycles: 0, corrections_bytes: 0, token_count_available: false, token_total: null };
  const costByFeature = {};

  for (const slug of list) {
    const f = collectFeatureSources(targetDir, slug);
    findings.push(...f.findings);
    cycles.push(...f.cycles);
    warnings.push(...f.warnings);
    minedPaths.push(...f.minedPaths);
    costByFeature[slug] = f.cost;
    for (const k of Object.keys(counts)) counts[k] += f.counts[k];
    cost.execution_events += f.cost.execution_events;
    cost.corrections += f.cost.corrections;
    cost.fail_pass_cycles += f.cost.fail_pass_cycles;
    cost.corrections_bytes += f.cost.corrections_bytes;
    if (f.cost.token_count_available) {
      cost.token_count_available = true;
      cost.token_total = (cost.token_total || 0) + (f.cost.token_total || 0);
    }
  }

  return { features_mined: list.slice(), findings, cycles, counts, cost, costByFeature, minedPaths, warnings };
}

/** Subdiretórios de `.aioson/context/done/` = features fechadas (D6). */
function enumerateClosedFeatures(targetDir) {
  const doneDir = path.join(targetDir, '.aioson', 'context', 'done');
  const slugs = [];
  for (const ent of listFilesSafe(doneDir)) {
    if (ent.isDirectory()) slugs.push(ent.name);
  }
  slugs.sort();
  return slugs;
}

/**
 * Data de PASS de uma feature para ordenar a janela `--last=N` (D2: trail vence).
 * Prioridade: último PASS do Agent Trail → frontmatter de QA report → null.
 * (O caller pode cair em MANIFEST `completed` quando isto retornar null.)
 */
function resolveFeatureExists(targetDir, slug) {
  const ctxDir = path.join(targetDir, '.aioson', 'context');
  const loc = resolveLocations(targetDir, ctxDir, slug);
  if (loc.planDirs.length > 0 || loc.dossierFiles.length > 0) return true;
  if (dirExists(loc.doneRoot)) return true;
  if (dirExists(path.join(ctxDir, 'features', slug))) return true;
  // qa-report-{slug}*.md no contexto ativo
  for (const ent of listFilesSafe(ctxDir)) {
    if (ent.isFile() && /^qa-report-/.test(ent.name) && ent.name.includes(slug) && ent.name.endsWith('.md')) return true;
  }
  // listado em features.md
  const featuresText = readTextSafe(path.join(ctxDir, 'features.md'));
  if (featuresText && new RegExp(`\\b${slug.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')}\\b`).test(featuresText)) return true;
  return false;
}

function resolvePassDate(targetDir, slug) {
  const ctxDir = path.join(targetDir, '.aioson', 'context');
  const locations = resolveLocations(targetDir, ctxDir, slug);

  // 1. Trail: maior pass_at dos ciclos FAIL→PASS.
  const trail = readDossierTrail({ rootDir: targetDir, slug, locations });
  if (trail.cycles.length > 0) {
    return trail.cycles.map((c) => c.pass_at).sort().slice(-1)[0];
  }

  // 2. QA report com verdict PASS → created_at/updated_at.
  let best = null;
  for (const dir of locations.qaDirs) {
    for (const ent of listFilesSafe(dir)) {
      if (!ent.isFile() || !/^qa-report-/.test(ent.name) || !ent.name.includes(slug) || !ent.name.endsWith('.md')) continue;
      const text = readTextSafe(path.join(dir, ent.name));
      if (text === null) continue;
      const { data } = parseFrontmatter(text);
      if ((data.verdict || '').toUpperCase() === 'FAIL') continue;
      const d = isoDate(data.updated_at || data.created_at || data.date);
      if (d && (!best || d > best)) best = d;
    }
  }
  return best;
}

module.exports = {
  collectSources,
  collectFeatureSources,
  resolveLocations,
  resolvePassDate,
  resolveFeatureExists,
  enumerateClosedFeatures,
  normalizeSeverity,
  parseFrontmatter,
  relPath,
  // exportados para teste unitário dos parsers
  _internal: { readQaReports, readCorrections, readDossierTrail, readFailureSignatures, makeFinding }
};
