'use strict';

/**
 * ac-test-audit — deterministic AC→test evidence audit (no LLM).
 *
 * `AC_ID_RE` is the single canonical AC identifier pattern; spec-analyze and
 * artifact-validate import it so all three surfaces extract the same IDs
 * (case-insensitive segments cover slugged ids like AC-checkout-01).
 *
 * Matching contract & known limitations (kept honest on purpose):
 * - Evidence is a token-boundary mention of the AC id in a test file or in an
 *   executable harness criterion. `mentionsAcId` matches whole hyphen-delimited
 *   tokens so AC-1 does NOT match inside AC-10 (substring collision).
 * - It cannot judge assertion strength: any token-boundary mention counts, so a
 *   weak/empty test or a comment that names the AC reads as covered. The
 *   harness `verification` path is the stronger evidence.
 * - A test that exercises an AC's behaviour without naming the id reads as
 *   missing — the audit enforces the "cite the AC in its test" convention.
 */

const fs = require('node:fs/promises');
const path = require('node:path');

const AC_ID_RE = /\bAC(?:-[A-Za-z0-9]+)+\b/g;
const TEST_FILE_RE = /(?:^|[\\/])(?:tests?|__tests__)[\\/].+\.(?:test|spec)\.(?:js|cjs|mjs|ts|tsx|jsx)$|(?:^|[\\/])[^\\/]+\.(?:test|spec)\.(?:js|cjs|mjs|ts|tsx|jsx)$/i;

function extractAcIds(content) {
  return [...new Set(String(content || '').match(AC_ID_RE) || [])].sort();
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Whole-token match: the id must not be flanked by word chars or hyphens, so
// AC-1 will not match inside AC-10 / AC-100 and AC-SDLC-1 not inside AC-SDLC-10.
function mentionsAcId(text, acId) {
  return new RegExp(`(?<![\\w-])${escapeRegExp(acId)}(?![\\w-])`).test(String(text || ''));
}

async function readText(filePath) {
  try {
    return await fs.readFile(filePath, 'utf8');
  } catch {
    return null;
  }
}

function toRel(targetDir, filePath) {
  return path.relative(targetDir, filePath).split(path.sep).join('/');
}

function shouldSkipDir(targetDir, dirPath) {
  const rel = toRel(targetDir, dirPath);
  return rel.split('/').some((part, idx, parts) => {
    if (part === 'node_modules' || part === '.git' || part === 'dist' || part === 'build' || part === 'coverage') return true;
    return idx > 0 && parts[idx - 1] === '.aioson' && part === 'backups';
  });
}

async function listTestFiles(targetDir, dirPath = targetDir, out = []) {
  let entries;
  try {
    entries = await fs.readdir(dirPath, { withFileTypes: true });
  } catch {
    return out;
  }

  for (const entry of entries) {
    const full = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      if (!shouldSkipDir(targetDir, full)) await listTestFiles(targetDir, full, out);
      continue;
    }
    if (!entry.isFile()) continue;
    const rel = toRel(targetDir, full);
    if (TEST_FILE_RE.test(rel)) out.push(full);
  }
  return out;
}

function testEvidenceFor(acId, testContents) {
  return testContents
    .filter((item) => mentionsAcId(item.content, acId))
    .map((item) => ({
      file: item.file,
      evidence: `test file references ${acId}`
    }));
}

function harnessEvidenceFor(acId, contract) {
  if (!contract || !Array.isArray(contract.criteria)) return [];
  return contract.criteria
    .filter((criterion) => {
      if (!criterion || typeof criterion !== 'object') return false;
      const text = JSON.stringify(criterion);
      return mentionsAcId(text, acId) && typeof criterion.verification === 'string' && criterion.verification.trim();
    })
    .map((criterion) => ({
      file: '.aioson/plans/{slug}/harness-contract.json',
      criterion: criterion.id,
      evidence: `executable harness criterion references ${acId}`
    }));
}

async function readHarnessContract(targetDir, slug) {
  const contractPath = path.join(targetDir, '.aioson', 'plans', slug, 'harness-contract.json');
  const raw = await readText(contractPath);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function collectAcceptanceCriteria(targetDir, slug) {
  const contextDir = path.join(targetDir, '.aioson', 'context');
  const sources = [
    { kind: 'requirements', path: path.join(contextDir, `requirements-${slug}.md`) },
    { kind: 'prd', path: path.join(contextDir, `prd-${slug}.md`) },
    { kind: 'conformance', path: path.join(contextDir, `conformance-${slug}.yaml`) }
  ];

  const byId = new Map();
  for (const source of sources) {
    const content = await readText(source.path);
    if (!content) continue;
    for (const id of extractAcIds(content)) {
      if (!byId.has(id)) {
        byId.set(id, { id, sources: [] });
      }
      byId.get(id).sources.push({
        kind: source.kind,
        file: toRel(targetDir, source.path)
      });
    }
  }

  return [...byId.values()].sort((a, b) => a.id.localeCompare(b.id));
}

async function auditAcceptanceCriteriaTests(targetDir, slug) {
  const criteria = await collectAcceptanceCriteria(targetDir, slug);
  const testFiles = await listTestFiles(targetDir);
  const testContents = [];
  for (const filePath of testFiles) {
    const content = await readText(filePath);
    if (content !== null) {
      testContents.push({ file: toRel(targetDir, filePath), content });
    }
  }

  const contract = await readHarnessContract(targetDir, slug);
  const items = criteria.map((criterion) => {
    const testEvidence = testEvidenceFor(criterion.id, testContents);
    const harnessEvidence = harnessEvidenceFor(criterion.id, contract).map((e) => ({
      ...e,
      file: e.file.replace('{slug}', slug)
    }));
    const evidence = [...testEvidence, ...harnessEvidence];
    return {
      ac: criterion.id,
      status: evidence.length > 0 ? 'covered' : 'missing',
      sources: criterion.sources,
      evidence
    };
  });

  const missing = items.filter((item) => item.status === 'missing');
  const summary = {
    acs_total: items.length,
    covered: items.filter((item) => item.status === 'covered').length,
    missing: missing.length,
    test_files_scanned: testContents.length
  };

  return {
    ok: missing.length === 0,
    feature: slug,
    audited_at: new Date().toISOString(),
    summary,
    items,
    missing: missing.map((item) => item.ac)
  };
}

module.exports = {
  AC_ID_RE,
  extractAcIds,
  mentionsAcId,
  collectAcceptanceCriteria,
  auditAcceptanceCriteriaTests
};
