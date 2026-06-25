'use strict';

const fs = require('node:fs/promises');

const {
  VERDICTS,
  validateVerificationReport,
  makeError
} = require('./result');
const { resolveInsideRoot } = require('./path-policy');
const { extractJsonBlock } = require('./ledger-store');

const REQUIRED_REPORT_SECTIONS = [
  { id: 'verdict', heading: 'Verdict' },
  { id: 'commands_run', heading: 'Commands Run' },
  { id: 'findings', heading: 'Findings' },
  { id: 'before_and_now', heading: 'Before And Now' },
  { id: 'residual_risk', heading: 'Residual Risk' },
  { id: 'recommended_route', heading: 'Recommended Route' },
  { id: 'machine_report', heading: 'Machine Report' }
];

function sectionPattern(heading) {
  return new RegExp(`^##\\s+${heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`, 'im');
}

function missingReportSections(content) {
  return REQUIRED_REPORT_SECTIONS
    .filter((section) => !sectionPattern(section.heading).test(content))
    .map((section) => section.id);
}

function extractSection(content, heading) {
  const text = String(content || '');
  const headingRe = new RegExp(`^##\\s+${heading}\\s*$`, 'im');
  const headingMatch = headingRe.exec(text);
  if (!headingMatch) return '';
  const start = headingMatch.index + headingMatch[0].length;
  const rest = text.slice(start);
  const nextHeading = rest.search(/^##\s+/m);
  return (nextHeading === -1 ? rest : rest.slice(0, nextHeading)).trim();
}

function proseVerdictTokens(content) {
  const verdictSection = extractSection(content, 'Verdict');
  if (!verdictSection) return [];
  const pattern = new RegExp(`\\b(${Array.from(VERDICTS).join('|')})\\b`, 'g');
  return [...verdictSection.matchAll(pattern)].map((match) => match[1]);
}

function proseVerdict(content) {
  const tokens = proseVerdictTokens(content);
  return tokens.length > 0 ? tokens[0] : null;
}

async function parseVerificationReport(rootDir, slug, reportPath, requestedPolicy) {
  const safe = resolveInsideRoot(rootDir, reportPath);
  if (!safe.ok) return safe;

  let content;
  try {
    content = await fs.readFile(safe.path, 'utf8');
  } catch {
    return makeError('report_not_found', { report_path: safe.relative_path });
  }

  const missingSections = missingReportSections(content);
  if (missingSections.length > 0) {
    return makeError('missing_report_sections', {
      feature_slug: slug,
      report_path: safe.relative_path,
      missing_sections: missingSections
    });
  }

  const rawJson = extractJsonBlock(content, 'Machine Report');
  if (!rawJson) {
    return makeError('missing_machine_report', {
      feature_slug: slug,
      report_path: safe.relative_path
    });
  }

  let report;
  try {
    report = JSON.parse(rawJson);
  } catch (error) {
    return makeError('invalid_machine_report_json', {
      feature_slug: slug,
      report_path: safe.relative_path,
      detail: error.message
    });
  }

  // Conflict only when the Verdict prose names verdict token(s) and NONE of them
  // match the machine verdict. Collecting all tokens (not just the first) avoids a
  // false conflict when the auditor writes a negated mention, e.g.
  // "Not a PASS — NEEDS_DEV_FIX" alongside a machine verdict of NEEDS_DEV_FIX.
  const proseTokens = proseVerdictTokens(content);
  if (proseTokens.length > 0 && report.verdict && !proseTokens.includes(report.verdict)) {
    return makeError('report_conflict', {
      feature_slug: slug,
      report_path: safe.relative_path,
      prose_verdict: proseTokens[0],
      machine_verdict: report.verdict
    });
  }

  const errors = validateVerificationReport(report, { slug, requestedPolicy });
  if (errors.length > 0) {
    return makeError('invalid_machine_report', {
      feature_slug: slug,
      report_path: safe.relative_path,
      errors
    });
  }

  return {
    ok: true,
    feature_slug: slug,
    report_path: safe.relative_path,
    report
  };
}

module.exports = {
  parseVerificationReport,
  REQUIRED_REPORT_SECTIONS,
  missingReportSections,
  proseVerdict,
  proseVerdictTokens
};
