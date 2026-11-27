'use strict';

/**
 * Where outcome records live, and the only code that writes them.
 *
 *   .aioson/outcomes/{slug}.json   one record per closed feature or simple plan
 *   .aioson/outcomes/REPORT.md     what the records show (report.js)
 *
 * One file per delivery, never one shared ledger: two chats on the same
 * folder, or a merge between branches, each touch their own file. Writes are
 * atomic (temporary file + rename) so a reader never sees half a record.
 */

const fs = require('node:fs');
const path = require('node:path');
const { validateRecord, sanitizeRead, SLUG: SLUG_RE } = require('./schema');

const OUTCOMES_DIR = path.join('.aioson', 'outcomes');
const REPORT_FILE = 'REPORT.md';

/** A file's text, or null when it cannot be read. */
function readText(file) {
  try { return fs.readFileSync(file, 'utf8'); } catch { return null; }
}

function outcomesDir(targetDir) {
  return path.join(targetDir, OUTCOMES_DIR);
}

function recordPath(targetDir, slug) {
  if (!SLUG_RE.test(String(slug || ''))) throw new Error(`invalid slug: ${slug}`);
  return path.join(outcomesDir(targetDir), `${slug}.json`);
}

function writeFileAtomic(file, content) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.${Date.now().toString(36)}.tmp`;
  fs.writeFileSync(tmp, content, 'utf8');
  try {
    fs.renameSync(tmp, file);
  } catch (err) {
    try { fs.unlinkSync(tmp); } catch { /* already gone */ }
    throw err;
  }
}

/**
 * The record of `slug` (practice ids outside the catalog dropped), or null
 * when it does not exist, is unreadable, or fails the schema.
 */
function readRecord(targetDir, slug) {
  try {
    return sanitizeRead(JSON.parse(fs.readFileSync(recordPath(targetDir, slug), 'utf8')));
  } catch {
    return null;
  }
}

/**
 * Writes `record` after validating it against the closed schema. A record
 * that fails validation is never written: the schema is the promise that the
 * file holds numbers and enumerations only.
 */
function writeRecord(targetDir, record) {
  const check = validateRecord(record);
  if (!check.ok) {
    const error = new Error(`outcome record refused: ${check.errors.join('; ')}`);
    error.code = 'OUTCOME_SCHEMA';
    error.errors = check.errors;
    throw error;
  }
  const file = recordPath(targetDir, record.feature);
  writeFileAtomic(file, `${JSON.stringify(record, null, 2)}\n`);
  return file;
}

/** Every readable, schema-valid record of the project, oldest close first. */
function readRecords(targetDir) {
  let entries;
  try { entries = fs.readdirSync(outcomesDir(targetDir), { withFileTypes: true }); } catch { return []; }
  const records = [];
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith('.json')) continue;
    const slug = entry.name.slice(0, -'.json'.length);
    if (!SLUG_RE.test(slug)) continue;
    const record = readRecord(targetDir, slug);
    if (record) records.push(record);
  }
  return records.sort((a, b) => String(a.closed_at || '').localeCompare(String(b.closed_at || '')));
}

module.exports = {
  OUTCOMES_DIR,
  REPORT_FILE,
  SLUG_RE,
  outcomesDir,
  recordPath,
  readRecord,
  writeRecord,
  readRecords,
  readText,
  writeFileAtomic
};
