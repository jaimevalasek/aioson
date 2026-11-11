'use strict';

/**
 * Static test-report linter — the deterministic half of the Tester contract.
 *
 * The tester's value is adversarial depth, but until now the only machine-checked
 * part of its output was the bounded-correction packet (review-cycle:advance).
 * This lint makes the coverage side measurable: the hypothesis matrix proves the
 * tester *enumerated* boundary/failure/property cases per tested path, and the
 * residual-risk section makes stopping short of full coverage a named decision
 * instead of a silent default. Same trade as prd-lint and briefing-lint: pure
 * RegExp over the text, issues are provable defects, warnings are measurements a
 * reviewer judges in context. Whether each hypothesis actually bites — and
 * whether the delivered behavior passes — stays with the agent and with QA.
 */

const HARD_PLACEHOLDER = /\bTODO\b|\bFIXME\b|Lorem ipsum|\[count\]|\[low\/medium\/high/;

const MANDATORY_SECTIONS = [
  'Scope',
  'Hypothesis matrix',
  'Tests added or changed',
  'Commands and results',
  'Residual risk'
];

const HYPOTHESIS_CLASSES = ['boundary', 'invariant', 'state-transition', 'failure', 'regression', 'property'];
const MATRIX_COLUMNS = ['path', 'class', 'test', 'expected', 'result'];

// A result marker, not a success marker: a tester report that reproduces a
// defect legitimately records FAIL and routes it to Dev.
const COMMAND_RUNNER = /\b(?:npm|node|npx|pnpm|yarn|bun|cargo|pytest|python|go|dotnet|make|php|composer|mvn|gradle|forge)\b/i;
const COMMAND_RESULT = /\b(?:PASS(?:ED)?|FAIL(?:ED)?|exit(?: code)?\s*[:=]?\s*\d+|success|error)\b/i;
// A red run: the reproduction a correction packet rests on.
const COMMAND_RED = /\b(?:FAIL(?:ED|ING|S)?|falh(?:ou|a|aram|ando)|exit(?: code)?\s*[:=]?\s*[1-9]\d*|[1-9]\d* failing|red)\b/i;

// The oracle of a hypothesis row: where its expected value came from. A cell
// that names the current output as the expectation is the incident this lint
// exists for — the test asserts what the code does, not what was approved.
const OBSERVED_ORACLE_CELL = /^(?:observed|current|as[- ]is|snapshot|n\/?a|same|idem|ditto|tbd|-|—|\?+)$|\b(?:current|existing|observed|actual|today'?s)\s+(?:output|behaviou?r|result|value|response)\b|\bas\s+(?:currently\s+)?implemented\b|\bsame\s+as\s+(?:before|now|today|current)\b|\bwhatever\b|\bcomportamento\s+atual\b|\bsa[ií]da\s+atual\b|\bresultado\s+atual\b|\bcomo\s+(?:est[aá]\s+)?implementad[oa]\b|\bcomo\s+(?:est[aá]|retorna)\s+hoje\b|\bcomportamiento\s+actual\b/i;
const SPEC_CITATION = /\b(?:AC|EC|CAP|PROM|RG|SEC|PT|VULN)-[A-Za-z0-9-]+\b|\b(?:invariant|invariante|contract|contrato|PRD|plan|plano|RFC|spec)\b/i;

function parseFrontmatter(text) {
  const match = String(text || '').match(/^---\r?\n([\s\S]*?)\r?\n---/);
  const out = {};
  if (!match) return out;
  for (const line of match[1].split(/\r?\n/)) {
    const kv = line.match(/^([\w-]+):\s*(.*)$/);
    if (kv) out[kv[1]] = kv[2].trim();
  }
  return out;
}

/** Body of the first `## <heading>` section exactly matching `title`, or null. */
function sectionBody(text, title) {
  const lines = String(text || '').split(/\r?\n/);
  let start = -1;
  for (let i = 0; i < lines.length; i += 1) {
    const heading = lines[i].match(/^##\s+(.+?)\s*$/);
    if (start === -1 && heading && heading[1] === title) {
      start = i + 1;
      continue;
    }
    if (start !== -1 && /^##\s+/.test(lines[i])) {
      return lines.slice(start, i).join('\n');
    }
  }
  return start === -1 ? null : lines.slice(start).join('\n');
}

/** First markdown table in `body` as { header: string[], rows: string[][] }, or null. */
function parseFirstTable(body) {
  const lines = String(body || '').split(/\r?\n/).filter((line) => /^\s*\|/.test(line));
  if (lines.length < 2) return null;
  const cells = (line) => line.split('|').slice(1, -1).map((cell) => cell.trim());
  const header = cells(lines[0]);
  const rows = lines
    .slice(1)
    .filter((line) => !/^\s*\|[\s:|-]+\|?\s*$/.test(line))
    .map(cells);
  return { header, rows };
}

function normalizeClass(cell) {
  return String(cell || '')
    .replace(/[`[\]]/g, '')
    .trim()
    .toLowerCase();
}

/**
 * @param {object} inputs
 * @param {string} inputs.report  text of .aioson/context/test-report-{slug}.md
 * @param {string} inputs.slug
 * @returns {{ issues: string[], warnings: string[], metrics: object }}
 */
function analyzeTestReport({ report, slug }) {
  const text = String(report || '');
  const issues = [];
  const warnings = [];

  checkIdentity(text, slug, issues);
  const { present, missing } = checkSections(text, issues, warnings);
  const matrix = analyzeHypothesisMatrix(sectionBody(text, 'Hypothesis matrix'), issues, warnings);
  const testFilesNamed = namedTestFiles(sectionBody(text, 'Tests added or changed'), warnings);

  // ── executed-command evidence ──
  const commandsBody = sectionBody(text, 'Commands and results');
  const hasCommandEvidence = commandsBody !== null
    && COMMAND_RUNNER.test(commandsBody)
    && COMMAND_RESULT.test(commandsBody);
  if (commandsBody !== null && !hasCommandEvidence) {
    issues.push('## Commands and results must record at least one exact executed command with its observed result');
  }

  // ── residual risk ──
  const residualBody = sectionBody(text, 'Residual risk');
  const residualEntries = residualBody === null
    ? 0
    : residualBody.split(/\r?\n/).filter((line) => /^\s*(?:[-*]|\d+\.)\s+\S/.test(line)).length;
  if (residualBody !== null && residualEntries === 0) {
    warnings.push('empty residual risk claims the tested scope is fully proven — verify that is intended');
  }

  // ── placeholder discipline ──
  if (HARD_PLACEHOLDER.test(text)) {
    issues.push('test report contains an unfilled placeholder (TODO/FIXME/template token)');
  }
  if (/\bTBD\b/.test(text)) {
    warnings.push('test report contains TBD — a test report records what ran, not what is pending');
  }

  const packet = checkCorrectionPacket(sectionBody(text, 'Correction packet'), commandsBody, issues, warnings);

  return {
    issues,
    warnings,
    metrics: {
      sections_present: present.length,
      sections_missing: missing,
      hypotheses_total: matrix.rowsTotal,
      hypotheses_by_class: matrix.byClass,
      hypotheses_invalid_class: matrix.invalidClassRows,
      oracle_spec_cited: matrix.specCited,
      oracle_observed_rows: matrix.observedRows,
      oracle_empty_rows: matrix.emptyRows,
      has_expected_column: matrix.hasExpectedColumn,
      test_files_named: testFilesNamed,
      has_command_evidence: hasCommandEvidence,
      has_red_evidence: packet.hasRedEvidence,
      residual_risk_entries: residualEntries,
      has_correction_packet: packet.present
    }
  };
}

function checkIdentity(text, slug, issues) {
  const fm = parseFrontmatter(text);
  if (Object.keys(fm).length === 0) {
    issues.push('test report has no YAML frontmatter (`feature: {slug}`)');
    return;
  }
  const feature = (fm.feature || '').replace(/^["']|["']$/g, '');
  if (!feature) issues.push('frontmatter is missing `feature`');
  else if (slug && feature !== slug) issues.push(`frontmatter feature "${feature}" does not match the report slug "${slug}"`);
}

function checkSections(text, issues, warnings) {
  const present = [];
  const missing = [];
  for (const title of MANDATORY_SECTIONS) {
    if (sectionBody(text, title) === null) missing.push(title);
    else present.push(title);
  }
  for (const title of missing) issues.push(`mandatory section missing: ## ${title}`);
  if (missing.length === 0) {
    const order = [];
    for (const line of text.split(/\r?\n/)) {
      const heading = line.match(/^##\s+(.+?)\s*$/);
      if (heading && MANDATORY_SECTIONS.includes(heading[1])) order.push(heading[1]);
    }
    if (order.join('|') !== MANDATORY_SECTIONS.join('|')) {
      warnings.push('mandatory sections are present but not in the canonical order');
    }
  }
  return { present, missing };
}

/** Paths under `## Tests added or changed` — what the oracle lint will read. */
function namedTestFiles(testsBody, warnings) {
  if (testsBody === null) return [];
  const { extractTestFilePaths } = require('./test-oracle-lint');
  // Extraction names candidates; analyzeNamedTestFiles authorizes each read
  // against the project-owned repository roots, including sibling repositories.
  const named = extractTestFilePaths(testsBody, { allowParentPaths: true });
  if (named.length === 0) {
    warnings.push('## Tests added or changed names no test file — the oracle of this pass cannot be measured; name each added or changed test file by path');
  }
  return named;
}

/** Optional, but complete when present — and proven red-then-green. */
function checkCorrectionPacket(packetBody, commandsBody, issues, warnings) {
  const hasRedEvidence = commandsBody !== null && COMMAND_RED.test(commandsBody);
  if (packetBody === null) return { present: false, hasRedEvidence };
  if (!/allowed_fix_paths/.test(packetBody)) {
    issues.push('## Correction packet is missing `allowed_fix_paths` — review-cycle:advance will reject it');
  }
  if (commandsBody !== null && !hasRedEvidence) {
    warnings.push('## Correction packet without a recorded failing run in ## Commands and results — a correction is proven red-then-green; record the reproduction that failed before the fix');
  }
  return { present: true, hasRedEvidence };
}

/**
 * The matrix proves two things: that the tester ENUMERATED hypotheses by class,
 * and — since the `Expected` column — that each expected value was written from
 * the approved behavior, not read off the current output. A row whose oracle is
 * the implementation is an issue: the text itself says the test asserts what the
 * code does today. A row that never cites its source is a warning: the oracle
 * may be right, but nothing ties it to an AC, a control, a finding or an
 * invariant.
 */
function analyzeHypothesisMatrix(matrixBody, issues, warnings) {
  const byClass = Object.fromEntries(HYPOTHESIS_CLASSES.map((c) => [c, 0]));
  const out = { rowsTotal: 0, invalidClassRows: 0, specCited: 0, observedRows: 0, emptyRows: 0, hasExpectedColumn: false, byClass };
  if (matrixBody === null) return out;
  const table = parseFirstTable(matrixBody);
  if (!table) {
    issues.push('## Hypothesis matrix must contain a Markdown table (`| Path | Class | Test | Expected | Result |`)');
    return out;
  }
  const headerLower = table.header.map((cell) => cell.toLowerCase());
  const missingColumns = MATRIX_COLUMNS.filter((col) => !headerLower.includes(col));
  out.hasExpectedColumn = headerLower.includes('expected');
  if (missingColumns.length > 0) {
    const detail = missingColumns.includes('expected')
      ? ' — `Expected` carries the value each test asserts and where it comes from (AC-*/EC-*/finding id/invariant), written before the code runs; the current output is never the oracle'
      : '';
    issues.push(`hypothesis matrix missing column(s): ${missingColumns.join(', ')}${detail}`);
    return out;
  }
  const classIndex = headerLower.indexOf('class');
  const expectedIndex = headerLower.indexOf('expected');
  const testIndex = headerLower.indexOf('test');
  out.rowsTotal = table.rows.length;
  for (const row of table.rows) {
    const cls = normalizeClass(row[classIndex]);
    if (HYPOTHESIS_CLASSES.includes(cls)) byClass[cls] += 1;
    else {
      out.invalidClassRows += 1;
      issues.push(`hypothesis row with invalid class "${row[classIndex] || ''}" (${HYPOTHESIS_CLASSES.join('|')})`);
    }
    const expected = String(row[expectedIndex] || '').replace(/`/g, '').trim();
    const label = String(row[testIndex] || '').trim() || `row ${table.rows.indexOf(row) + 1}`;
    if (expected.length === 0) {
      out.emptyRows += 1;
      issues.push(`hypothesis row "${label}" has an empty Expected cell — write the expected value from the approved behavior before running the code`);
    } else if (OBSERVED_ORACLE_CELL.test(expected)) {
      out.observedRows += 1;
      issues.push(`hypothesis row "${label}" takes the current output as its oracle ("${expected}") — a test that asserts what the code does today proves nothing about the approved behavior; derive the value from the AC/EC/invariant or route the defect`);
    } else if (SPEC_CITATION.test(expected)) {
      out.specCited += 1;
    }
  }
  if (out.rowsTotal === 0) {
    warnings.push('hypothesis matrix has no rows — verify the tested scope genuinely produced no hypotheses');
  } else {
    if (byClass.boundary === 0 && byClass.failure === 0) {
      warnings.push('hypothesis matrix has no boundary or failure class — adversarial depth is the default on critical paths');
    }
    if (out.specCited === 0) {
      warnings.push('no hypothesis row cites the source of its expected value (AC-*/EC-*/finding id/invariant) — the oracles are not traceable to the approved behavior');
    }
  }
  return out;
}

module.exports = {
  analyzeTestReport,
  MANDATORY_SECTIONS,
  HYPOTHESIS_CLASSES,
  MATRIX_COLUMNS
};
