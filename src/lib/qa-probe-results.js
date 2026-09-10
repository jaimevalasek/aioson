'use strict';

const { AsyncLocalStorage } = require('node:async_hooks');
const observedProbe = new AsyncLocalStorage();

// Preserve a probe's recovery path without erasing the fact it failed.
// Only fixed reason codes enter reports, never browser exception text.
function unavailable(fallback, reason = 'browser_operation_failed') {
  return () => {
    const state = observedProbe.getStore();
    if (state) state.reasons.add(reason);
    return fallback;
  };
}

async function recordObservedProbe(results, findings, probe, target, action) {
  const parent = observedProbe.getStore();
  const state = { reasons: new Set() };
  return observedProbe.run(state, async () => {
    const row = await recordProbe(results, findings, probe, target, action);
    if (state.reasons.size) {
      row.status = 'unavailable';
      row.reason = [...state.reasons].join(', ');
    }
    if (parent && row.status === 'unavailable') parent.reasons.add('child_probe_unavailable');
    return row;
  });
}

// Execution status is separate from security coverage and finding severity.
async function recordProbe(results, findings, probe, target, action) {
  const before = findings.length;
  let row;
  try {
    const outcome = await action();
    row = { probe, target, status: findings.length > before ? 'failed' : 'executed', finding_ids: findings.slice(before).map((finding) => finding.id), ...outcome };
  } catch {
    // Browser error messages can embed credentials, page content and URLs.
    row = { probe, target, status: 'unavailable', reason: 'browser_operation_failed', finding_ids: findings.slice(before).map((finding) => finding.id) };
  }
  results.push(row);
  return row;
}

function summarizeProbes(results) {
  const limitations = results.filter((row) => row.status === 'unavailable');
  // A run in which no probe executed proved nothing: a trailing-slash scan
  // persisted seven not_applicable file probes and zero routes as COMPLETE.
  const ran = results.some((row) => row.status === 'executed' || row.status === 'failed');
  return { probe_results: results, limitations, execution_complete: ran && limitations.length === 0 };
}

function probeSummaryMarkdown(execution) {
  let md = `### Execution: ${execution.execution_complete ? 'COMPLETE' : 'INCOMPLETE'}\n\n`;
  md += 'Execution is not proof of complete security coverage. executed = ran without findings; failed = ran with findings; unavailable = not completed; not_applicable = absent surface.\n\n';
  for (const row of execution.probe_results) md += `- ${row.probe}: ${row.status} — ${row.target}${row.reason ? ` (${row.reason})` : ''}\n`;
  return md + '\n';
}

module.exports = { recordProbe, recordObservedProbe, unavailable, summarizeProbes, probeSummaryMarkdown };
