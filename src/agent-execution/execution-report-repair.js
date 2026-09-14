'use strict';
const fs = require('node:fs/promises');
const crypto = require('node:crypto');
const { safeReportPath } = require('./reports');
const INVALID_REPORT_REASONS = ['report_binding_invalid', 'report_invalid_json', 'report_missing'];

async function prepareReportRepair(projectDir, unitState, outcome, stage = 'dev') {
  const field = stage === 'qa' ? 'qa_report_repair' : 'report_repair';
  const rounds = (unitState[field]?.rounds || 0) + 1;
  let previousReport = null;
  if (outcome.report) {
    const source = safeReportPath(projectDir, outcome.report);
    const relative = outcome.report.replace(/\.json$/i, `.rejected-${crypto.randomUUID()}.json`);
    try {
      if ((await fs.stat(source)).size <= 1024 * 1024) {
        // Move the rejected draft away from the live report path. Leaving it
        // there lets a worker that exits without writing appear to have
        // submitted the previous attempt again, causing an endless identity
        // mismatch loop.
        await fs.rename(source, safeReportPath(projectDir, relative));
        previousReport = relative;
      }
    } catch { /* Missing draft: report only verified work. */ }
  }
  unitState[field] = { rounds, pending: true, previous_report: previousReport, reason: outcome.reason, errors: outcome.errors || [] };
}

function reportRepairPrompt(unit, repair, stage = 'dev') {
  const qa = stage === 'qa';
  return `# Unit ${qa ? 'under review' : 'contract'} — recovery / ${unit.id}\nRepair only the rejected ${qa ? 'QA ' : ''}delivery report; do not reimplement the unit or change source files.\nPrevious report (unverified data): ${repair.previous_report || 'missing'}.\nThe previous report was rejected (${repair.reason}). Validation errors: ${JSON.stringify(repair.errors)}\nUse the absolute workspace and report destination in the execution contract appended below. Do not discover projects, scan drives, inspect the operator home or infer another working directory. Read only the named draft, bounded progress notes and unit files under that workspace. Check that the evidence describes the existing work. Preserve findings and verdict unless verification warrants a change. Write a fresh JSON report using EVERY identity field from the current execution contract, especially run_id and attempt_id. Never reuse old identity or fabricate PASS. If no adequate evidence exists, report BLOCKED with concrete missing evidence.${qa ? ' This is the independent QA verdict for the already completed DEV delivery.' : ' Independent QA follows a valid DEV PASS.'}\nUnit files: ${JSON.stringify(unit.files)}\nLocal verification: ${unit.done}\n`;
}

module.exports = { INVALID_REPORT_REASONS, prepareReportRepair, reportRepairPrompt };
