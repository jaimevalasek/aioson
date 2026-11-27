'use strict';

/**
 * Builds and writes the outcome record of one delivery, and keeps REPORT.md
 * current. Called by feature:close (before anything is archived), by the
 * simple-plan close in agent:done, and by `aioson outcome:record` by hand.
 */

const path = require('node:path');
const { SCHEMA_VERSION, CLASSIFICATIONS } = require('./schema');
const { CATALOG_VERSION, detectPractices } = require('./practices');
const { measureOutcome } = require('./measures');
const { readRecord, writeRecord, readRecords, readText, outcomesDir, REPORT_FILE, writeFileAtomic } = require('./ledger');
const { analyze } = require('./report');
const { renderReport } = require('./report-render');

function contextData(targetDir) {
  const text = readText(path.join(targetDir, '.aioson', 'context', 'project.context.md')) || '';
  const block = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text);
  const data = {};
  if (!block) return data;
  for (const line of block[1].split(/\r?\n/)) {
    const m = /^([A-Za-z0-9_]+):\s*(.*)$/.exec(line);
    if (m) data[m[1]] = m[2].trim().replace(/^(["'])([\s\S]*)\1$/, '$2');
  }
  return data;
}

/** The project's own names, which no comment may keep (scrub.js). */
function projectNames(targetDir) {
  const data = contextData(targetDir);
  return [data.project_name, path.basename(path.resolve(targetDir))].filter((n) => typeof n === 'string' && n.trim());
}

function projectLocale(targetDir) {
  const data = contextData(targetDir);
  return String(data.interaction_language || data.conversation_language || 'en');
}

let cachedVersion;
function aiosonVersion() {
  if (cachedVersion === undefined) {
    try { cachedVersion = require('../../../package.json').version || null; } catch { cachedVersion = null; }
  }
  return cachedVersion;
}

function classificationOf(prd, targetDir) {
  const fromPrd = /^classification\s*:\s*["']?([A-Za-z]+)["']?/m.exec(String(prd || ''));
  const value = (fromPrd ? fromPrd[1] : contextData(targetDir).classification || '').toUpperCase();
  return CLASSIFICATIONS.includes(value) ? value : null;
}

function readPrd(targetDir, slug) {
  const ctxDir = path.join(targetDir, '.aioson', 'context');
  return readText(path.join(ctxDir, `prd-${slug}.md`)) || readText(path.join(ctxDir, 'done', slug, `prd-${slug}.md`));
}

const MAX_KEYS = ['fail_cycles', 'findings_critical', 'findings_high', 'findings_medium', 'findings_low', 'gate_reds'];

/**
 * A re-close never forgets what an earlier close measured:
 *   - a practice once seen stays seen (the archive prunes evidence, it does
 *     not undo the practice); a null keeps the earlier boolean;
 *   - a delivery that was closed as FAIL never passed QA the first time, and
 *     FAIL → accepted is one more correction round;
 *   - counts keep their highest value; other nulls keep the earlier number;
 *   - the person's answer is kept.
 */
function mergeWithPrevious(record, previous) {
  if (!previous) return record;
  const practices = { ...record.practices };
  for (const [id, before] of Object.entries(previous.practices || {})) {
    if (before === true || (practices[id] === null && typeof before === 'boolean')) practices[id] = before;
  }
  const prevOut = previous.outcome || {};
  const outcome = { ...record.outcome };
  for (const [key, value] of Object.entries(prevOut)) {
    if (outcome[key] === null || outcome[key] === undefined) outcome[key] = value;
    else if (MAX_KEYS.includes(key) && Number.isInteger(value)) outcome[key] = Math.max(outcome[key], value);
  }
  if (previous.verdict === 'FAIL' || prevOut.first_pass === false) outcome.first_pass = false;
  if (previous.verdict === 'FAIL' && record.verdict !== 'FAIL') {
    outcome.fail_cycles = Math.max(record.outcome.fail_cycles || 0, (prevOut.fail_cycles || 0) + 1);
  }
  return {
    ...record,
    classification: record.classification || previous.classification || null,
    shape: record.shape || previous.shape || null,
    autopilot: typeof record.autopilot === 'boolean' ? record.autopilot : (typeof previous.autopilot === 'boolean' ? previous.autopilot : null),
    practices,
    outcome,
    ...(previous.feedback ? { feedback: previous.feedback } : {})
  };
}

/**
 * buildRecord(targetDir, slug, { kind, verdict, integrity, forceBypass, now })
 * → a schema-valid record (practices + outcome), merged with the previous
 * record of the same delivery (mergeWithPrevious).
 */
async function buildRecord(targetDir, slug, { kind = 'feature', verdict = 'PASS', integrity = null, forceBypass = null, now = Date.now() } = {}) {
  const ctxDir = path.join(targetDir, '.aioson', 'context');
  const prd = kind === 'simple-plan' ? null : readPrd(targetDir, slug);
  const detected = await detectPractices({ targetDir, ctxDir, slug, kind, prd, integrity });
  const outcome = await measureOutcome({ targetDir, ctxDir, slug, verdict, now, forceBypass });
  const previous = readRecord(targetDir, slug);
  return mergeWithPrevious({
    schema: SCHEMA_VERSION,
    feature: slug,
    kind,
    classification: kind === 'simple-plan' ? null : classificationOf(prd, targetDir),
    verdict,
    closed_at: new Date(now).toISOString(),
    aioson_version: aiosonVersion(),
    catalog_version: CATALOG_VERSION,
    shape: detected.shape,
    autopilot: detected.autopilot,
    practices: detected.practices,
    outcome
  }, previous);
}

/** recordOutcome(...) → { ok, file, record, detected } | { ok:false, reason, error } — never throws. */
async function recordOutcome(targetDir, slug, options = {}) {
  try {
    const record = await buildRecord(targetDir, slug, options);
    const file = writeRecord(targetDir, record);
    const detected = Object.values(record.practices).filter((v) => v === true).length;
    return { ok: true, file, record, detected };
  } catch (error) {
    return { ok: false, reason: error && error.code === 'OUTCOME_SCHEMA' ? 'schema' : 'record_failed', error: String((error && error.message) || error).slice(0, 300) };
  }
}

/** Regenerates .aioson/outcomes/REPORT.md; returns { file, analysis, markdown }. */
function refreshReport(targetDir, { locale } = {}) {
  const analysis = analyze(readRecords(targetDir));
  const markdown = renderReport(analysis, { locale: locale || projectLocale(targetDir) });
  const file = path.join(outcomesDir(targetDir), REPORT_FILE);
  try { writeFileAtomic(file, markdown); } catch { /* the report is a view; the records are the data */ }
  return { file, analysis, markdown };
}

/** Records of every aioson project this machine knows (project-registry), this one included. */
function portfolioRecords(targetDir, { home } = {}) {
  const { livingProjects } = require('../project-registry');
  const dirs = new Set([path.resolve(targetDir)]);
  try { for (const p of livingProjects(home)) dirs.add(path.resolve(p.path)); } catch { /* registry unreadable */ }
  const records = [];
  let projects = 0;
  for (const dir of dirs) {
    const list = readRecords(dir);
    if (list.length > 0) projects += 1;
    records.push(...list);
  }
  return { records, projects };
}

module.exports = { buildRecord, mergeWithPrevious, recordOutcome, refreshReport, portfolioRecords, projectNames, projectLocale, aiosonVersion, contextData };
