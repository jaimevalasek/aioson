'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const VERDICTS = ['PASS', 'FAIL', 'BLOCKED'];
const IDENTITY_FIELDS = ['feature','run_id','attempt_id','agent','host','model_resolved','manifest_digest'];
function samePathSet(actual, expected) {
  if (!Array.isArray(actual) || !Array.isArray(expected) || actual.length !== expected.length) return false;
  const sorted = (list) => JSON.stringify([...list].map(String).sort());
  return sorted(actual) === sorted(expected);
}
function validateReport(r, expected = null) {
  const errors = [];
  const req = ['version','feature','run_id','attempt_id','agent','host','model_requested','model_resolved','manifest_digest','writable_roots','started_at','finished_at','verdict','findings','evidence'];
  if (expected?.model_resolution_strategy !== undefined) req.push('model_resolution_strategy');
  if (expected?.lane !== undefined) req.push('lane', 'write_paths');
  for (const key of req) if (r?.[key] === undefined) errors.push({ path: `$.${key}`, message: 'is required' });
  if (r && !VERDICTS.includes(r.verdict)) errors.push({ path: '$.verdict', message: 'must be PASS, FAIL, or BLOCKED' });
  for (const key of ['findings', 'evidence', 'writable_roots']) {
    if (r && !Array.isArray(r[key])) errors.push({ path: `$.${key}`, message: 'must be an array' });
  }
  if (r && r.messages !== undefined && !Array.isArray(r.messages)) errors.push({ path: '$.messages', message: 'must be an array when present' });
  if (expected) {
    for (const key of IDENTITY_FIELDS) {
      if (r?.[key] !== expected[key]) errors.push({ path: `$.${key}`, message: 'does not match the registered attempt' });
    }
  }
  for (const key of ['model_requested', 'model_resolution_strategy', 'lane']) {
    if (expected?.[key] !== undefined && r?.[key] !== expected[key]) {
      errors.push({ path: `$.${key}`, message: 'does not match the registered attempt' });
    }
  }
  if (expected?.reasoning_effort && r?.reasoning_effort !== expected.reasoning_effort) {
    errors.push({ path: '$.reasoning_effort', message: 'does not match the registered attempt' });
  }
  // The same paths, in any order: the integration supervisor copies ~200 of
  // them by hand, and a reordered copy of the exact set is the same scope.
  for (const key of ['writable_roots', 'write_paths']) {
    if (expected?.[key] !== undefined && !samePathSet(r?.[key], expected[key])) {
      errors.push({ path: `$.${key}`, message: 'does not match the registered attempt' });
    }
  }
  if (expected && !['ready', 'running'].includes(expected.status)) {
    errors.push({ path: '$.attempt_id', message: 'attempt is not eligible to report' });
  }
  return { ok: errors.length === 0, errors };
}
// A worker's report is a declaration, even when it lists commands or logs.
// Only checks executed and recorded by the engine can establish verification.
function reportVerification(report) {
  const count = Array.isArray(report?.evidence) ? report.evidence.length : 0;
  return { source: 'agent_report', status: count ? 'reported' : 'not_recorded', evidence_count: count };
}
function safeReportPath(projectDir, relative) { const root=path.resolve(projectDir,'.aioson','context','reports'); const target=path.resolve(projectDir,relative); if(target!==root && !target.startsWith(root+path.sep)) throw new Error('report path escapes report root'); return target; }
async function writeReport(projectDir, relative, report, expected) { const check=validateReport(report,expected); if(!check.ok){const e=new Error('invalid report');e.errors=check.errors;throw e;} const file=safeReportPath(projectDir,relative); await fs.mkdir(path.dirname(file),{recursive:true}); const handle=await fs.open(file,'wx'); try{await handle.writeFile(`${JSON.stringify(report,null,2)}\n`,'utf8')}finally{await handle.close()} return file; }
module.exports={validateReport,reportVerification,safeReportPath,writeReport};
