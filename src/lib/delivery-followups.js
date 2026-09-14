'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { parseFrontmatter } = require('../preflight-engine');
const { readProjectFile, contentHash } = require('./plan-document');
const { extractSection, parseFirstMarkdownTable } = require('./feature-completeness-format');

const VERDICT = 'accepted_with_followups';
const POLICY_PATH = '.aioson/closure-policy.json';
const RISK_FIELDS = ['primary_flow', 'data_loss', 'security', 'availability'];
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const TEXT_FIELDS = ['summary', 'reproduction', 'expected', 'observed', 'verification', 'rationale'];

function assertSlug(slug) { if (!SLUG.test(slug || '')) throw new Error('Invalid feature slug'); }
function reviewPath(slug) { assertSlug(slug); return `.aioson/context/features/${slug}/closure-review.json`; }
function ids(text) { return [...new Set(String(text || '').match(/\bAC-[\w-]+/gi) || [])].map(id => id.toUpperCase()); }
function table(content, title) { return parseFirstMarkdownTable(extractSection(content, [title]) || '')?.rows || []; }

async function readJson(root, relative) { return JSON.parse(await readProjectFile(root, relative)); }
async function readPolicy(root) {
  try {
    const policy = await readJson(root, POLICY_PATH);
    if (policy.schema_version !== 1 || typeof policy.enabled !== 'boolean' || typeof policy.auto_close !== 'boolean'
      || typeof policy.allow_secondary_ac_deferral !== 'boolean' || !policy.authorized_by) throw new Error('Invalid closure policy');
    return policy;
  } catch (error) {
    if (error.code === 'ENOENT') return { schema_version: 1, enabled: false, auto_close: false, allow_secondary_ac_deferral: false };
    throw error;
  }
}

async function safeWrite(root, relative, content, { exclusive = false } = {}) {
  const base = await fs.realpath(root);
  const absolute = path.resolve(root, relative);
  const rel = path.relative(path.resolve(root), absolute);
  if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) throw new Error('Unsafe output path');
  // Check each ancestor before mkdir to avoid writing through an external link.
  let current = base;
  for (const segment of rel.split(path.sep).slice(0, -1)) {
    current = path.join(current, segment);
    try { await fs.mkdir(current); } catch (error) { if (error.code !== 'EEXIST') throw error; }
    const real = await fs.realpath(current);
    const inside = path.relative(base, real);
    if (inside.startsWith('..') || path.isAbsolute(inside)) throw new Error('Output parent escapes project');
  }
  try {
    const stat = await fs.lstat(absolute);
    if (!stat.isFile() || stat.isSymbolicLink()) throw new Error('Output is not a regular project file');
  } catch (error) { if (error.code !== 'ENOENT') throw error; }
  const temporary = path.join(path.dirname(absolute), `.closure-${randomUUID()}.tmp`);
  try {
    await fs.writeFile(temporary, content, { encoding: 'utf8', flag: 'wx' });
    if (exclusive) await fs.link(temporary, absolute);
    else await fs.rename(temporary, absolute);
  } finally {
    await fs.unlink(temporary).catch(error => { if (error.code !== 'ENOENT') throw error; });
  }
}

async function featureText(root, slug, name) {
  const relative = `.aioson/context/${name}-${slug}.md`;
  try { return await readProjectFile(root, relative); }
  catch (error) {
    if (error.code !== 'ENOENT') throw error;
    return readProjectFile(root, `.aioson/context/done/${slug}/${name}-${slug}.md`);
  }
}

async function snapshot(root, slug, policy, findings) {
  const [prd, plan, qa] = await Promise.all(['prd', 'implementation-plan', 'qa-report'].map(name => featureText(root, slug, name)));
  const securityErrors = await require('../handoff-contract').validateSecurityForFeature(root, slug);
  if (securityErrors.length) throw new Error(securityErrors.join('; '));
  const files = new Set(findings.flatMap(finding => finding.files || []));
  const retire = new Set();
  for (const row of table(plan, 'Implementation Delta')) {
    const paths = String(row[3] || '').replace(/`/g, '').split(/,|;|<br\s*\/?>/i).map(v => v.trim()).filter(Boolean);
    for (const file of paths) { files.add(file); if (row[1].toLowerCase() === 'retire') retire.add(file); }
  }
  const hashes = { prd: contentHash(prd), plan: contentHash(plan), qa: contentHash(qa), policy: contentHash(JSON.stringify(policy)) };
  for (const file of [...files].sort()) {
    try { hashes[file] = contentHash(await readProjectFile(root, file, null)); }
    catch (error) { if (error.code === 'ENOENT' && retire.has(file)) hashes[file] = 'retired'; else throw error; }
  }
  const securityPath = `.aioson/context/security-findings-${slug}.json`;
  try { hashes.security = contentHash(await readProjectFile(root, securityPath)); }
  catch (error) {
    if (error.code !== 'ENOENT') throw error;
    try { hashes.security = contentHash(await readProjectFile(root, `.aioson/context/done/${slug}/security-findings-${slug}.json`)); }
    catch (archivedError) { if (archivedError.code !== 'ENOENT') throw archivedError; hashes.security = null; }
  }
  for (const file of ['package.json', 'package-lock.json', 'Cargo.toml', 'Cargo.lock', 'pyproject.toml', 'composer.json', 'composer.lock']) {
    try { hashes[file] = contentHash(await readProjectFile(root, file, null)); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  return { hashes, prd, plan, qa };
}

function validateFindings(review, policy, prd, qa) {
  if (review.schema_version !== 1 || !Array.isArray(review.findings) || review.findings.length === 0 || review.findings.length > 5) throw new Error('Supply 1–5 concrete low-impact findings');
  if (parseFrontmatter(qa).verdict !== VERDICT) throw new Error(`QA must explicitly record verdict: ${VERDICT}`);
  const declared = new Set(table(prd, 'Acceptance Criteria').flatMap(row => ids(row[0])));
  const rows = table(qa, 'CAP/AC evidence table');
  const outcomes = new Map();
  for (const row of rows) for (const ac of ids(row[1])) {
    if (outcomes.has(ac)) throw new Error(`Duplicate QA evidence for ${ac}`);
    outcomes.set(ac, { result: String(row[2]).toLowerCase(), evidence: row[3], caps: row[0] });
  }
  const seen = new Set();
  const deferred = new Set();
  for (const finding of review.findings) {
    if (!SLUG.test(finding.id || '') || seen.has(finding.id)) throw new Error('Finding IDs must be unique slugs');
    seen.add(finding.id);
    if (finding.severity !== 'low' || finding.verified !== true || !['cosmetic', 'wording', 'documentation', 'noncritical_defect'].includes(finding.kind)) throw new Error(`${finding.id}: only verified low-impact findings are eligible`);
    if (!finding.risk || RISK_FIELDS.some(key => finding.risk[key] !== false)) throw new Error(`${finding.id}: material or unknown risk cannot be deferred`);
    for (const field of TEXT_FIELDS) if (typeof finding[field] !== 'string' || finding[field].trim().length < 10 || /\b(?:TODO|TBD)\b/i.test(finding[field])) throw new Error(`${finding.id}: concrete ${field} is required`);
    if (!Array.isArray(finding.files) || finding.files.length < 1 || finding.files.length > 8 || finding.files.some(file => typeof file !== 'string' || /[*?[\]{}]/.test(file))) throw new Error(`${finding.id}: provide 1–8 exact paths`);
    const behaviorFiles = finding.files.filter(file => !/(?:^|\/)(?:tests?|__tests__)\/|\.(?:test|spec)\./.test(file));
    if (behaviorFiles.length > 5 || new Set(behaviorFiles.map(file => path.posix.dirname(file.replace(/\\/g, '/')).split('/').slice(0, 2).join('/'))).size > 2) throw new Error(`${finding.id}: correction exceeds the Simple Plan budget`);
    if (!Array.isArray(finding.ac_ids)) throw new Error(`${finding.id}: ac_ids must be an array`);
    for (const ac of finding.ac_ids) {
      const key = String(ac).toUpperCase();
      if (!policy.allow_secondary_ac_deferral || !declared.has(key) || deferred.has(key)) throw new Error(`${finding.id}: AC deferral is unauthorized, unknown or duplicated`);
      const outcome = outcomes.get(key);
      if (!outcome || outcome.result !== 'fail' || String(outcome.evidence || '').length < 10) throw new Error(`${key}: preserve a concrete FAIL row; absent evidence is not minor`);
      deferred.add(key);
    }
  }
  if (declared.size === 0) throw new Error('No acceptance criteria are declared');
  for (const ac of declared) {
    const row = outcomes.get(ac);
    if (!deferred.has(ac) && (!row || row.result !== 'pass' || String(row.evidence || '').length < 10)) throw new Error(`${ac}: required behavior lacks PASS evidence`);
  }
  for (const ac of outcomes.keys()) if (!declared.has(ac)) throw new Error(`QA cites unknown ${ac}`);
  // A whole capability cannot be accepted on deferred criteria alone.
  const caps = table(prd, 'Feature Capability Map').filter(row => String(row[3]).toLowerCase() === 'required').map(row => row[0]);
  for (const cap of caps) if (![...outcomes.entries()].some(([ac, row]) => declared.has(ac) && row.result === 'pass' && row.caps.split(/[, ]+/).includes(cap))) throw new Error(`${cap}: primary behavior is unverified`);
  return [...deferred];
}

async function evaluateFollowups(root, slug) {
  assertSlug(slug);
  let review;
  try {
    const policy = await readPolicy(root);
    if (!policy.enabled) return { eligible: false, active: false, reason: 'policy_disabled', deferred_acs: [], policy };
    try { review = await readJson(root, reviewPath(slug)); }
    catch (error) {
      if (error.code !== 'ENOENT') throw error;
      try { review = await readJson(root, `.aioson/context/done/${slug}/closure-review.json`); }
      catch (archivedError) { if (archivedError.code === 'ENOENT') return { eligible: false, active: false, reason: 'review_missing', deferred_acs: [], policy }; throw archivedError; }
    }
    if (review.feature !== slug) throw new Error('Review belongs to another feature');
    const current = await snapshot(root, slug, policy, review.findings);
    const deferred = validateFindings(review, policy, current.prd, current.qa);
    if (JSON.stringify(current.hashes) !== JSON.stringify(review.binding)) throw new Error('Closure evidence is stale; QA must re-evaluate before preparing again');
    return { eligible: true, active: true, disposition: VERDICT, deferred_acs: deferred, policy, review };
  } catch (error) { return { eligible: false, active: true, reason: 'invalid_closure_review', error: error.message, deferred_acs: [] }; }
}

async function prepareFollowups(root, slug, input) {
  assertSlug(slug);
  if (!input || input.schema_version !== 1 || (input.feature && input.feature !== slug)) throw new Error('Invalid closure review version or feature');
  const policy = await readPolicy(root);
  if (!policy.enabled) throw new Error('Closure policy is disabled');
  const current = await snapshot(root, slug, policy, input.findings || []);
  const review = { ...input, feature: slug, schema_version: 1 };
  validateFindings(review, policy, current.prd, current.qa);
  review.binding = current.hashes;
  review.prepared_at = new Date().toISOString();
  await safeWrite(root, reviewPath(slug), JSON.stringify(review, null, 2) + '\n');
  return evaluateFollowups(root, slug);
}

async function persistFollowupPlans(root, slug, evaluation) {
  evaluation = await evaluateFollowups(root, slug);
  if (!evaluation.eligible) throw new Error('Cannot persist ineligible followups');
  const plans = [];
  for (const finding of evaluation.review.findings) {
    const relative = `.aioson/context/simple-plans/${slug}-followup-${finding.id}.md`;
    const origin = contentHash(JSON.stringify(finding));
    const body = `---\nstatus: pending\nsource_feature: ${slug}\nsource_finding: ${finding.id}\nsource_finding_sha256: ${origin}\n---\n\n# Simple Plan — ${finding.summary}\n\n## Problem\n${finding.observed}\n\n## Reproduction\n${finding.reproduction}\n\n## Expected outcome\n${finding.expected}\n\n## Scope\n${finding.files.map(file => '- ' + file).join('\n')}\n\n## Acceptance and verification\n${finding.verification}\n\n## Deferral rationale\n${finding.rationale}\n\nOrigin: .aioson/context/done/${slug}/closure-review.json\n`;
    try { await safeWrite(root, relative, body, { exclusive: true }); }
    catch (error) {
      if (error.code !== 'EEXIST') throw error;
      const existing = parseFrontmatter(await readProjectFile(root, relative));
      if (existing.source_finding_sha256 !== origin) throw new Error(`Conflicting followup plan: ${relative}`, { cause: error });
    }
    plans.push(relative);
  }
  // Durable before any index/workflow mutation; archive can be retried.
  await safeWrite(root, `.aioson/context/done/${slug}/closure-review.json`, JSON.stringify({ ...evaluation.review, plans, disposition: VERDICT }, null, 2) + '\n');
  return plans;
}

module.exports = { VERDICT, POLICY_PATH, readPolicy, safeWrite, evaluateFollowups, prepareFollowups, persistFollowupPlans, validateFindings, featureText };
