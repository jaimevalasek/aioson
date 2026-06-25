'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const { validateVerificationReport } = require('../../verification/schema');

function isFileSafe(filePath) {
  try {
    return fs.lstatSync(filePath).isFile();
  } catch {
    return false;
  }
}

function listFilesSafe(dir) {
  try {
    return fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
}

function readTextSafe(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch {
    return null;
  }
}

function collectReportFiles(featureDirs) {
  const seen = new Set();
  const files = [];

  for (const featureDir of featureDirs || []) {
    const latest = path.join(featureDir, 'verification-report.md');
    if (isFileSafe(latest)) {
      seen.add(latest);
      files.push(latest);
    }

    const runsDir = path.join(featureDir, 'verification-runs');
    for (const entry of listFilesSafe(runsDir)) {
      if (!entry.isFile()) continue;
      if (!/-report\.md$/i.test(entry.name)) continue;
      const full = path.join(runsDir, entry.name);
      if (seen.has(full)) continue;
      seen.add(full);
      files.push(full);
    }
  }

  files.sort();
  return files;
}

function extractMachineReport(content) {
  const text = String(content || '');
  const heading = /^##\s+Machine Report\s*$/im.exec(text);
  if (!heading) return { ok: false, reason: 'missing_machine_report' };
  const afterHeading = text.slice(heading.index + heading[0].length);
  const block = afterHeading.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (!block) return { ok: false, reason: 'missing_machine_report_json' };
  try {
    return { ok: true, report: JSON.parse(block[1]) };
  } catch {
    return { ok: false, reason: 'invalid_machine_report_json' };
  }
}

function stableStringify(value) {
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(',')}]`;
  }
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function reportIdentity(report) {
  return crypto.createHash('sha1').update(stableStringify(report)).digest('hex');
}

function isLatestReportPath(filePath) {
  return path.basename(filePath) === 'verification-report.md';
}

function shouldSkipPromotedDuplicate(seenReports, identity, filePath) {
  const seen = seenReports.get(identity);
  if (!seen) {
    seenReports.set(identity, {
      paths: [filePath],
      skippedPromotedDuplicate: false
    });
    return false;
  }

  const involvesLatest = isLatestReportPath(filePath) || seen.paths.some(isLatestReportPath);
  seen.paths.push(filePath);
  if (involvesLatest && !seen.skippedPromotedDuplicate) {
    seen.skippedPromotedDuplicate = true;
    return true;
  }
  return false;
}

function timestampFromPath(filePath) {
  const name = path.basename(filePath);
  const match = name.match(/(\d{8}T\d{6}Z)/);
  if (!match) return null;
  return match[1].replace(
    /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/,
    '$1-$2-$3T$4:$5:$6Z'
  );
}

function severityFromVerification(severity) {
  const value = String(severity || '').toLowerCase();
  if (value === 'blocking') return 'high';
  if (value === 'warning') return 'medium';
  if (value === 'info') return 'info';
  return 'unknown';
}

function statusFromVerification(status) {
  const value = String(status || '').toUpperCase();
  if (value === 'CONFIRMS' || value === 'NOT_APPLICABLE') return 'fixed';
  if (value === 'DOES_NOT_CONFIRM' || value === 'PARTIAL' || value === 'NOT_VERIFIED') return 'open';
  return 'unknown';
}

function fileRefFromFinding(finding) {
  if (!finding || !finding.file) return null;
  return finding.line ? `${finding.file}:${finding.line}` : String(finding.file);
}

function titleFromFinding(report, finding) {
  const parts = [
    finding.kind || 'verification',
    finding.status || report.verdict || 'UNKNOWN'
  ];
  if (finding.claim_id) parts.push(`claim ${finding.claim_id}`);
  return parts.join(' ');
}

function isRetroRelevantFinding(finding) {
  const status = String((finding && finding.status) || '').toUpperCase();
  return status === 'DOES_NOT_CONFIRM' || status === 'PARTIAL' || status === 'NOT_VERIFIED';
}

function reportFindings({ report, slug, sourcePath, sourceDate, makeFinding }) {
  const findings = Array.isArray(report.findings) ? report.findings : [];
  return findings.filter(isRetroRelevantFinding).map((finding, index) => makeFinding({
    source_type: 'verification_report',
    feature_slug: slug,
    finding_id: finding.id ? String(finding.id).slice(0, 80) : `VR-${index + 1}`,
    severity: severityFromVerification(finding.severity),
    title: titleFromFinding(report, finding),
    file_ref: fileRefFromFinding(finding),
    date: sourceDate,
    status: statusFromVerification(finding.status),
    source_path: sourcePath,
    signature: null
  }));
}

function readVerificationReports({ rootDir, slug, locations, makeFinding, relPath }) {
  const warnings = [];
  const findings = [];
  const files = collectReportFiles(locations.featureDirs);
  const countedFiles = [];
  const seenReports = new Map();
  let count = 0;

  for (const full of files) {
    const sourcePath = relPath(rootDir, full);
    const text = readTextSafe(full);
    if (text === null) {
      warnings.push(`verification_report ilegível: ${sourcePath}`);
      continue;
    }

    const parsed = extractMachineReport(text);
    if (!parsed.ok) {
      warnings.push(`verification_report ignorado (${parsed.reason}): ${sourcePath}`);
      continue;
    }

    const errors = validateVerificationReport(parsed.report, {
      slug,
      requestedPolicy: parsed.report.policy || 'standard'
    });
    if (errors.length > 0) {
      const compact = errors.map((error) => `${error.field}:${error.reason}`).join(', ');
      warnings.push(`verification_report inválido (${compact}): ${sourcePath}`);
      continue;
    }

    const identity = reportIdentity(parsed.report);
    if (shouldSkipPromotedDuplicate(seenReports, identity, full)) continue;
    countedFiles.push(full);
    count += 1;
    findings.push(...reportFindings({
      report: parsed.report,
      slug,
      sourcePath,
      sourceDate: timestampFromPath(full),
      makeFinding
    }));
  }

  return { findings, warnings, count, files: countedFiles };
}

module.exports = {
  readVerificationReports,
  _internal: {
    collectReportFiles,
    extractMachineReport,
    reportIdentity,
    shouldSkipPromotedDuplicate,
    severityFromVerification,
    statusFromVerification,
    titleFromFinding,
    isRetroRelevantFinding
  }
};
