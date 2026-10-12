'use strict';

/**
 * The Pentester's session-end gate over `security-findings-{slug}.json`.
 *
 * QA's Gate D (handoff-contract.js) always validated this file — review
 * contract, coverage roll-ups, declared surfaces, sanitized targets — but only
 * at QA's handoff, after the Pentester had left, and never for a direct
 * `paths`/`routes`/`project` run that no workflow closes. Measured on the five
 * v2 artifacts found in local consumer projects: four failed that gate
 * (19/19/10/2 blocking items), including the most recent run, whose endpoints
 * carried `<port>` placeholders that no URL parser accepts. Nothing told the
 * Pentester; the first reader of the defect was QA.
 *
 * This module replays the SAME Gate D functions (one judgment, two moments)
 * and adds only the finding-level half of the documented contract the gate
 * never read (`docs/pentester/review-contract-and-findings.md`):
 * - issues — provable from the text alone: legacy artifact version, enum
 *   values outside the documented vocabularies (a `recommended_owner` naming a
 *   retired agent routes to nobody);
 * - warnings — need context: missing per-finding fields, uncorrected findings
 *   without a remediation record, high/critical shape gaps, path-like affected
 *   artifacts that do not exist.
 * Open high/critical findings are QA's to adjudicate, so they are a metric,
 * never an issue: the Pentester must not "repair" them by self-acceptance.
 * Deliberately NOT checked: `remediation.status: applied_pending_qa` beside
 * `status: fixed`. It reads like self-acceptance, but QA adjudicates by moving
 * `status` and leaves the remediation record alone — 7 of 7 such findings in
 * the most recent real run were QA's own verdicts. A check that fires on the
 * legitimate post-QA state is a gate that cries wolf.
 */

const fs = require('node:fs');
const path = require('node:path');

// Vocabularies are matched exactly: QA's Gate D compares `status`, `severity`
// and `recommended_gate_status` with `===`, so a `High` or `Open` that a
// case-folding check waved through would never block at QA.
const SEVERITIES = ['info', 'low', 'medium', 'high', 'critical'];
const STATUSES = ['open', 'needs_validation', 'false_positive', 'accepted_risk', 'fixed'];
const STATUS_ALIASES = { accepted: 'accepted_risk' };
const OWNERS = ['pentester', 'dev', 'qa', 'planner'];
const GATE_STATUSES = ['note', 'review', 'block'];
const VOCABULARY = { severity: SEVERITIES, status: STATUSES, recommended_owner: OWNERS, recommended_gate_status: GATE_STATUSES };
const CLOSED = new Set(['fixed', 'false_positive', 'accepted_risk']);
const REQUIRED_FIELDS = ['id', 'title', 'surface', 'hypothesis', 'preconditions', 'reproduction_steps', 'evidence', 'impact', 'affected_artifacts', 'suggested_fix'];
// `security:audit` / `security:scan` write their own records into the same
// file through findings-writer (`source`, `finding_id`, `control_id`, `scope`,
// absolute artifact paths, `inconclusive` when a check could not run). The
// writer shapes them, not a hand; measured on 19 real artifacts, 24 of 70
// records were the scanner's and every one would have tripped the authored
// field checks. They are counted and held to their own vocabulary only.
const SCANNER_SOURCES = new Set(['security-audit', 'security-scan']);
const SCANNER_SEVERITIES = [...SEVERITIES, 'inconclusive'];
const SAMPLE = 4;

const text = (value) => (typeof value === 'string' ? value.trim() : '');
const lower = (value) => text(value).toLowerCase();
const findingId = (finding, index) => text(finding && (finding.id || finding.finding_id)) || `findings[${index}]`;
const isEmpty = (value) => value === undefined || value === null
  || (typeof value === 'string' && !value.trim())
  || (Array.isArray(value) && value.length === 0);
const isHigh = (finding) => ['high', 'critical'].includes(lower(finding.severity));
const isScannerRecord = (finding) => Boolean(finding) && SCANNER_SOURCES.has(text(finding.source));

function sample(ids) {
  const head = ids.slice(0, SAMPLE).join(', ');
  return ids.length > SAMPLE ? `${head} (+${ids.length - SAMPLE} more)` : head;
}

function canonicalOwner(value) {
  try {
    const { canonicalAgentId } = require('../../agents');
    const canonical = canonicalAgentId(value);
    return OWNERS.includes(canonical) ? canonical : null;
  } catch {
    return null;
  }
}

// A path-like reference names a file the reviewer can open; anything else may
// be an artifact id (`CAP-01`, a finding id) or a route (`GET /api/orders`),
// which the contract also allows.
function pathLike(value) {
  const raw = text(typeof value === 'string' ? value : value && (value.path || value.value));
  if (!raw || /[*?<>{}]/.test(raw) || /^[a-z]+:\/\//i.test(raw) || /^[A-Z]{3,7} \//.test(raw)) return null;
  const clean = raw.replace(/#L?\d+(?:-L?\d+)?$/i, '').replace(/:\d+(?::\d+)?(?:-\d+)?$/, '');
  if (!/[\\/]/.test(clean) && !/\.[a-z0-9]{1,8}$/i.test(clean)) return null;
  return clean;
}

function newTally() {
  return {
    invalid: { severity: [], status: [], recommended_owner: [], recommended_gate_status: [] },
    retiredOwners: [],
    aliasedStatus: [],
    missing: new Map(),
    noRemediation: [],
    noAttackPath: [],
    unproven: [],
    absentPaths: [],
    malformed: []
  };
}

function checkVocabulary(finding, id, tally, scanner) {
  const severities = scanner ? SCANNER_SEVERITIES : SEVERITIES;
  if (!severities.includes(text(finding.severity))) tally.invalid.severity.push(`${id} (${finding.severity ?? 'absent'})`);
  const status = text(finding.status);
  if (!STATUSES.includes(status)) {
    if (STATUS_ALIASES[status]) tally.aliasedStatus.push(`${id} (${status} → ${STATUS_ALIASES[status]})`);
    else tally.invalid.status.push(`${id} (${finding.status ?? 'absent'})`);
  }
  if (!GATE_STATUSES.includes(text(finding.recommended_gate_status))) {
    tally.invalid.recommended_gate_status.push(`${id} (${finding.recommended_gate_status ?? 'absent'})`);
  }
  // The scanner's owner is whoever must produce the missing artifact
  // (`product`, `planner`, …); the authored vocabulary does not apply to it.
  if (scanner) return;
  const owner = text(finding.recommended_owner);
  if (OWNERS.includes(owner)) return;
  const successor = owner ? canonicalOwner(owner) : null;
  if (successor) tally.retiredOwners.push(`${id} (${owner} → ${successor})`);
  else tally.invalid.recommended_owner.push(`${id} (${owner || 'absent'})`);
}

function checkFields(finding, id, tally) {
  const missing = REQUIRED_FIELDS.filter((field) => isEmpty(finding[field]));
  if (typeof finding.safe_to_reproduce !== 'boolean') missing.push('safe_to_reproduce');
  for (const field of missing) tally.missing.set(field, [...(tally.missing.get(field) || []), id]);
}

function checkDisposition(finding, id, tally, isApp) {
  const status = lower(finding.status);
  if (CLOSED.has(status)) return;
  const remediation = finding.remediation && typeof finding.remediation === 'object' ? text(finding.remediation.status) : '';
  if (!remediation) tally.noRemediation.push(id);
  if (!isHigh(finding) || status === 'needs_validation') return;
  if (isApp && isEmpty(finding.attack_path)) tally.noAttackPath.push(id);
  if (finding.safe_to_reproduce !== true || isEmpty(finding.evidence)) tally.unproven.push(id);
}

function checkPaths(finding, id, tally, targetDir) {
  if (!targetDir) return;
  for (const entry of Array.isArray(finding.affected_artifacts) ? finding.affected_artifacts : []) {
    const rel = pathLike(entry);
    if (rel && !path.isAbsolute(rel) && !fs.existsSync(path.resolve(targetDir, rel))) tally.absentPaths.push(`${id}: ${rel}`);
  }
}

function checkShape(finding, id, tally, { isApp, targetDir }) {
  checkFields(finding, id, tally);
  checkDisposition(finding, id, tally, isApp);
  checkPaths(finding, id, tally, targetDir);
}

const GATE_DEFAULT = ' (absent → the default: high/critical `block`, medium `review`, low/info `note`)';

function tallyIssues(tally) {
  const issues = tally.malformed.map((id) => `${id} is not an object`);
  for (const [field, offenders] of Object.entries(tally.invalid)) {
    if (!offenders.length) continue;
    const hint = field === 'recommended_gate_status' && offenders.some((entry) => entry.endsWith('(absent)')) ? GATE_DEFAULT : '';
    issues.push(`findings[].${field} outside ${VOCABULARY[field].join('|')}${hint}: ${sample(offenders)}`);
  }
  if (tally.aliasedStatus.length) issues.push(`findings[].status uses a legacy alias — write the current value: ${sample(tally.aliasedStatus)}`);
  if (tally.retiredOwners.length) issues.push(`findings[].recommended_owner names a retired agent — write its successor: ${sample(tally.retiredOwners)}`);
  return issues;
}

function tallyWarnings(tally) {
  const warnings = [];
  for (const [field, ids] of tally.missing) warnings.push(`findings[].${field} missing or empty on ${ids.length} finding(s): ${sample(ids)}`);
  const rules = [
    [tally.noRemediation, (n) => `${n} uncorrected finding(s) carry no remediation record — each needs \`remediation: { "status": "deferred", "summary": "<blocker and next action>" }\` and an owner`],
    [tally.noAttackPath, () => 'app high/critical finding(s) without `attack_path` — prove it or keep `needs_validation` (reported no higher than medium)'],
    [tally.unproven, () => 'high/critical finding(s) without evidence or `safe_to_reproduce: true` — unproven claims stay `needs_validation`'],
    [tally.absentPaths, (n) => `${n} affected artifact path(s) do not exist in the workspace — name real paths or artifact ids`]
  ];
  for (const [ids, message] of rules) if (ids.length) warnings.push(`${message(ids.length)}: ${sample(ids)}`);
  return warnings;
}

function findingMetrics(findings) {
  const count = (key) => findings.reduce((acc, finding) => {
    const value = lower(finding && finding[key]) || 'absent';
    acc[value] = (acc[value] || 0) + 1;
    return acc;
  }, {});
  const open = findings.filter((finding) => finding && !CLOSED.has(lower(finding.status)));
  const remediated = (status) => findings.filter((finding) => finding && finding.remediation && finding.remediation.status === status).length;
  return {
    findings: findings.length,
    scanner_records: findings.filter(isScannerRecord).length,
    by_severity: count('severity'),
    by_status: count('status'),
    open_high_critical: open.filter(isHigh).length,
    qa_blocking: open.filter((finding) => isHigh(finding) && text(finding.recommended_gate_status) === 'block').length,
    corrections_pending_qa: remediated('applied_pending_qa'),
    deferred: remediated('deferred')
  };
}

function analyzeFindingsContract(data, { targetDir } = {}) {
  const findings = Array.isArray(data && data.findings) ? data.findings : [];
  const version = String(data && data.version !== undefined ? data.version : '').trim();
  const versionIssues = !version || Number.parseInt(version, 10) !== 2
    ? [`artifact version ${version || '(absent)'} — the current contract is v2 (\`"version": 2\`); QA's Gate D skips every v2 evidence check for a legacy artifact`]
    : [];
  const tally = newTally();
  const context = { isApp: Boolean(data && data.review_contract && data.review_contract.target_mode === 'app_target'), targetDir };
  findings.forEach((finding, index) => {
    const id = findingId(finding, index);
    if (!finding || typeof finding !== 'object' || Array.isArray(finding)) {
      tally.malformed.push(id);
      return;
    }
    const scanner = isScannerRecord(finding);
    checkVocabulary(finding, id, tally, scanner);
    if (!scanner) checkShape(finding, id, tally, context);
  });
  return { issues: [...versionIssues, ...tallyIssues(tally)], warnings: tallyWarnings(tally), metrics: findingMetrics(findings) };
}

const ENDPOINT_PARSE = 'endpoint is neither a local URL nor an absolute route';
const ENDPOINT_REMOTE = 'endpoint is not local';

async function gateDVerdict(targetDir, file) {
  const { readSecurityFindings, validateReviewContract, validateV2SecurityEvidence } = require('../../handoff-contract');
  const envelope = await readSecurityFindings(file);
  const contractMissing = validateReviewContract(envelope && envelope.reviewContract);
  if (contractMissing.length) {
    return { errors: [`security: invalid review_contract (missing: ${contractMissing.join(', ')}) — QA's Gate D blocks on it`], warnings: [] };
  }
  const gate = await validateV2SecurityEvidence(targetDir, envelope);
  const warnings = [...gate.warnings];
  if (gate.errors.some((issue) => issue.includes(ENDPOINT_PARSE))) {
    warnings.push('endpoints must parse: store a loopback URL with its real port (`http://127.0.0.1:3000/api/orders/:id`) or the absolute route (`/api/orders/:id`) — placeholders such as `<port>` or `<host>` are rejected');
  }
  if (gate.errors.some((issue) => issue.includes(ENDPOINT_REMOTE))) {
    warnings.push('a non-loopback host never persists: name the absolute route and describe the exposed interface in the finding evidence');
  }
  return { errors: gate.errors, warnings };
}

/**
 * Full session-end analysis of one findings file: QA's Gate D verdict on it
 * (review contract + v2 evidence, verbatim) plus the finding contract above
 * and the coverage numbers. Never throws.
 */
async function analyzeSecurityFindings({ targetDir, file }) {
  let data;
  try {
    data = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (error) {
    return { issues: [`findings artifact is not valid JSON: ${error.message}`], warnings: [], metrics: {} };
  }
  if (!data || typeof data !== 'object' || !Array.isArray(data.findings)) {
    return { issues: ['findings artifact needs a top-level `findings` array'], warnings: [], metrics: {} };
  }
  const gate = await gateDVerdict(targetDir, file);
  const contract = analyzeFindingsContract(data, { targetDir });
  const { analyzeCoverage } = require('../../pentester-coverage');
  const coverage = analyzeCoverage(data);
  const reviewContract = data.review_contract || {};
  return {
    issues: [...gate.errors, ...contract.issues],
    warnings: [...gate.warnings, ...contract.warnings],
    metrics: {
      ...contract.metrics,
      review_depth: reviewContract.review_depth || null,
      report_mode: reviewContract.report_mode || null,
      coverage: {
        complete: coverage.complete,
        rows: coverage.rows.length,
        not_tested: coverage.notTested.length,
        missing_required: coverage.missingRequired.length,
        missing_surfaces: coverage.missingSurfaces.length
      }
    }
  };
}

module.exports = { analyzeFindingsContract, analyzeSecurityFindings };
