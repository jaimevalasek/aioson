'use strict';

// Offered → honored. context:guard records every injection (`guard_injected`)
// with the measured violations it carried. This reader re-runs the same
// checkers on each file as it is NOW and tells, per violation, whether the
// agent fixed it or it landed and stayed — the evidence a rule needs before
// anyone claims it "works". Advisory and read-only: no runtime store means
// nothing recorded; a file that no longer exists is counted apart.

const fs = require('node:fs');
const path = require('node:path');
const { openRuntimeDb, runtimeStoreExists } = require('../runtime-store');
const { detectEditViolations } = require('./edit-time-enforcement');

const DEFAULT_SINCE_DAYS = 30;

function parsePayload(json) {
  try {
    return json ? JSON.parse(json) : null;
  } catch {
    return null;
  }
}

async function currentKeys(targetDir, { agent, file, kind }) {
  let content;
  try {
    content = fs.readFileSync(path.join(targetDir, file), 'utf8');
  } catch {
    return null; // the file is gone
  }
  // Judged as a fresh write of the current content: every violation in it now.
  const blocks = await detectEditViolations(targetDir, {
    agent, rel: file, kind, toolName: 'Write', toolInput: { content }, before: null, uncapped: true, keepExistingCitations: true
  });
  return new Set(blocks.flatMap((block) => block.findings.map((finding) => `${block.path}|${finding.key}`)));
}

/**
 * @returns {Promise<{ available: boolean, totals?: object, rules?: object[] }>}
 */
async function collectGuardOutcomes(targetDir, options = {}) {
  if (!(await runtimeStoreExists(targetDir))) return { available: false };
  const sinceDays = Number(options.sinceDays) > 0 ? Number(options.sinceDays) : DEFAULT_SINCE_DAYS;
  const rows = await readGuardRows(targetDir, new Date(Date.now() - sinceDays * 86_400_000).toISOString());
  const table = ruleTable();
  await recheck(targetDir, foldInjections(rows, table), table);
  const ruleRows = [...table.rules.values()].sort((a, b) => (b.injections - a.injections) || a.path.localeCompare(b.path));
  const sum = (field) => ruleRows.reduce((total, rule) => total + rule[field], 0);
  return {
    available: true,
    since_days: sinceDays,
    totals: {
      injections: rows.length,
      violations_fixed: sum('fixed'),
      violations_still_present: sum('still_present'),
      violations_file_gone: sum('file_gone')
    },
    rules: ruleRows
  };
}

async function readGuardRows(targetDir, since) {
  const handle = await openRuntimeDb(targetDir, { mustExist: true });
  try {
    return handle.db.prepare(
      "SELECT agent_name, payload_json FROM execution_events WHERE source = 'context_guard' AND event_type = 'guard_injected' AND created_at >= ? ORDER BY created_at ASC, id ASC"
    ).all(since);
  } finally {
    handle.db.close();
  }
}

function ruleTable() {
  const rules = new Map();
  const of = (rulePath) => {
    if (!rules.has(rulePath)) rules.set(rulePath, { path: rulePath, injections: 0, with_violations: 0, fixed: 0, still_present: 0, file_gone: 0 });
    return rules.get(rulePath);
  };
  return { rules, of };
}

// Counts injections per rule and groups the recorded violation keys by the
// file, agent and reading that produced them: file|agent|kind → rule|key set.
function foldInjections(rows, table) {
  const recorded = new Map();
  for (const row of rows) {
    const payload = parsePayload(row.payload_json);
    if (payload) foldPayload(payload, row.agent_name || 'dev', table, recorded);
  }
  return recorded;
}

function foldPayload(payload, agent, table, recorded) {
  for (const rulePath of payload.rules || []) table.of(rulePath).injections += 1;
  for (const violation of (payload.violations || []).filter((entry) => entry.keys && entry.keys.length > 0)) {
    table.of(violation.rule).with_violations += 1;
    const group = `${payload.file}\u0000${agent}\u0000${violation.kind || 'code'}`;
    if (!recorded.has(group)) recorded.set(group, new Set());
    violation.keys.forEach((key) => recorded.get(group).add(`${violation.rule}|${key}`));
  }
}

function outcomeOf(now, entry) {
  if (now === null) return 'file_gone';
  return now.has(entry) ? 'still_present' : 'fixed';
}

async function recheck(targetDir, recorded, table) {
  for (const [group, keys] of recorded) {
    const [file, agent, kind] = group.split('\u0000');
    const now = await currentKeys(targetDir, { agent, file, kind });
    for (const entry of keys) table.of(entry.slice(0, entry.indexOf('|')))[outcomeOf(now, entry)] += 1;
  }
}

module.exports = { collectGuardOutcomes };
