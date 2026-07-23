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
 * - Compatibility mode accepts any token-boundary mention. Strict callers can
 *   require an assertion signal near the AC reference, so an empty test or a
 *   comment-only mention is reported as weak evidence. The harness
 *   `verification` path is always strong evidence.
 * - A test that exercises an AC's behaviour without naming the id reads as
 *   missing — the audit enforces the "cite the AC in its test" convention.
 */

const fs = require('node:fs/promises');
const path = require('node:path');

const AC_ID_RE = /\bAC(?:-[A-Za-z0-9]+)+\b/g;
const JS_TEST_FILE_RE = /(?:^|[\\/])(?:tests?|__tests__)[\\/].+\.(?:test|spec)\.(?:js|cjs|mjs|ts|tsx|jsx)$|(?:^|[\\/])[^\\/]+\.(?:test|spec)\.(?:js|cjs|mjs|ts|tsx|jsx)$/i;

function isTestFile(relPath) {
  const rel = String(relPath || '').replace(/\\/g, '/');
  if (JS_TEST_FILE_RE.test(rel)) return true;
  if (/(?:^|\/)tests?\/.*\.rs$/i.test(rel) || /_test\.rs$/i.test(rel) || /^(?:src|crates|packages)\/.*\.rs$/i.test(rel)) return true;
  if (/_test\.go$/i.test(rel)) return true;
  if (/(?:^|\/)(?:test_.+|.+_test)\.py$/i.test(rel) || /(?:^|\/)tests?\/.*\.py$/i.test(rel)) return true;
  if (/(?:^|\/)tests?\/.*(?:Test\.php|\.php)$/i.test(rel)) return true;
  if (/(?:_spec|_test)\.rb$/i.test(rel)) return true;
  if (/(?:Test|Tests)\.(?:java|kt|kts|cs)$/i.test(rel)) return true;
  return false;
}

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
    if (isTestFile(rel)) out.push(full);
  }
  return out;
}

// Blank comments and string/template contents while preserving offsets and
// newlines. AC ids may legitimately live in test titles/comments, so matching
// still uses the original source; only test/assertion syntax is read from this
// masked view. This is deliberately conservative: ambiguous text is never
// promoted to executable proof.
function maskNonCode(content) {
  const text = String(content || '');
  const chars = [...text];
  let state = 'code';
  let quote = null;
  let escaped = false;

  for (let i = 0; i < chars.length; i += 1) {
    const current = chars[i];
    const next = chars[i + 1];

    if (state === 'line-comment') {
      if (current === '\n' || current === '\r') state = 'code';
      else chars[i] = ' ';
      continue;
    }
    if (state === 'block-comment') {
      if (current === '*' && next === '/') {
        chars[i] = ' ';
        chars[i + 1] = ' ';
        i += 1;
        state = 'code';
      } else if (current !== '\n' && current !== '\r') {
        chars[i] = ' ';
      }
      continue;
    }
    if (state === 'string') {
      if (current !== '\n' && current !== '\r') chars[i] = ' ';
      if (escaped) {
        escaped = false;
      } else if (current === '\\') {
        escaped = true;
      } else if (current === quote) {
        state = 'code';
        quote = null;
      }
      continue;
    }

    if (current === '/' && next === '/') {
      chars[i] = ' ';
      chars[i + 1] = ' ';
      i += 1;
      state = 'line-comment';
    } else if (current === '/' && next === '*') {
      chars[i] = ' ';
      chars[i + 1] = ' ';
      i += 1;
      state = 'block-comment';
    } else if (current === '"' || current === "'" || current === '`') {
      chars[i] = ' ';
      state = 'string';
      quote = current;
      escaped = false;
    }
  }
  return chars.join('');
}

function hasAssertionNearAc(content, acId) {
  const text = String(content || '');
  const code = maskNonCode(text);
  const matcher = new RegExp(`(?<![\\w-])${escapeRegExp(acId)}(?![\\w-])`, 'g');
  const testStarts = [];
  const testStartRe = /(?:^|\n)\s*(test|it|describe)(?:\.(only|skip|todo))?\s*\(/g;
  let testStart;
  while ((testStart = testStartRe.exec(code)) !== null) {
    testStarts.push({ index: testStart.index, modifier: testStart[2] || null });
  }
  let match;
  while ((match = matcher.exec(text)) !== null) {
    const previous = [...testStarts].reverse().find((entry) => entry.index <= match.index);
    const next = testStarts.find((entry) => entry.index > match.index);
    // Keep the AC and assertion inside one test declaration. An adjacent AC
    // comment may bind to the immediately following test, but never to a later
    // unrelated test block merely because it is textually close.
    const bindToNext = next !== undefined
      && (previous === undefined || match.index - previous.index > 1200)
      && next.index - match.index <= 300;
    const boundTest = bindToNext ? next : previous;
    if (boundTest && ['skip', 'todo'].includes(boundTest.modifier)) continue;
    const start = bindToNext ? match.index : (previous?.index ?? Math.max(0, match.index - 300));
    const followingTest = testStarts.find((entry) => entry.index > (bindToNext ? next.index : start));
    const end = Math.min(text.length, followingTest?.index ?? (match.index + acId.length + 1200));
    const window = code.slice(start, end);
    if (/\b(assert(?:\.[A-Za-z]+)?|expect|should|fail)\s*\(/i.test(window)
      || /\.(?:toBe|toEqual|toStrictEqual|toMatch|toContain|toHave|toThrow|resolves|rejects)\b/.test(window)
      || /\bthrow\s+new\s+Error\b/.test(window)
      || /\b(?:assert(?:_eq|_ne|_matches)?|debug_assert(?:_eq|_ne)?|matches|panic)!\s*\(/.test(window)
      || /\b(?:assert|assertEqual|assertTrue|assertFalse|assertRaises)\b(?:\s|\()/i.test(window)
      || /\b(?:assertEquals|assertThat|assertThrows|Assertions\.[A-Za-z]+)\s*\(/.test(window)
      || /\b(?:Assert\.[A-Za-z]+|Should\(\)|Expect\()/.test(window)
      || /\b(?:t\.(?:Error|Errorf|Fatal|Fatalf|Fail|FailNow)|require\.[A-Za-z]+|assert\.[A-Za-z]+)\s*\(/.test(window)) return true;
  }
  return false;
}

function testEvidenceFor(acId, testContents, options = {}) {
  return testContents
    .filter((item) => mentionsAcId(item.content, acId))
    .filter((item) => !options.requireAssertions || hasAssertionNearAc(item.content, acId))
    .map((item) => ({
      file: item.file,
      evidence: options.requireAssertions
        ? `test file references ${acId} with a nearby assertion signal`
        : `test file references ${acId}`
    }));
}

function weakTestEvidenceFor(acId, testContents) {
  return testContents
    .filter((item) => mentionsAcId(item.content, acId) && !hasAssertionNearAc(item.content, acId))
    .map((item) => ({
      file: item.file,
      evidence: `test file references ${acId} without a nearby assertion signal`
    }));
}

function harnessEvidenceFor(acId, contract, report) {
  if (!contract || !Array.isArray(contract.criteria) || !report || report.ok !== true) return [];
  const passedChecks = new Map((Array.isArray(report.checks) ? report.checks : [])
    .filter((check) => check && check.ok === true)
    .map((check) => [String(check.id), check]));
  return contract.criteria
    .filter((criterion) => {
      if (!criterion || typeof criterion !== 'object') return false;
      const text = JSON.stringify(criterion);
      const check = passedChecks.get(String(criterion.id));
      return mentionsAcId(text, acId)
        && typeof criterion.verification === 'string'
        && criterion.verification.trim()
        && check
        && check.command === criterion.verification;
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

async function readHarnessReport(targetDir, slug) {
  const reportPath = path.join(targetDir, '.aioson', 'plans', slug, 'last-check-output.json');
  const raw = await readText(reportPath);
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

async function auditAcceptanceCriteriaTests(targetDir, slug, options = {}) {
  const requireCriteria = Boolean(options.requireCriteria);
  const requireAssertions = Boolean(options.requireAssertions);
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
  const harnessReport = await readHarnessReport(targetDir, slug);
  const items = criteria.map((criterion) => {
    const testEvidence = testEvidenceFor(criterion.id, testContents, { requireAssertions });
    const weakEvidence = requireAssertions ? weakTestEvidenceFor(criterion.id, testContents) : [];
    const harnessEvidence = harnessEvidenceFor(criterion.id, contract, harnessReport).map((e) => ({
      ...e,
      file: e.file.replace('{slug}', slug)
    }));
    const evidence = [...testEvidence, ...harnessEvidence];
    return {
      ac: criterion.id,
      status: evidence.length > 0 ? 'covered' : (weakEvidence.length > 0 ? 'weak' : 'missing'),
      sources: criterion.sources,
      evidence,
      weak_evidence: weakEvidence
    };
  });

  const missingItems = items.filter((item) => item.status !== 'covered');
  const noCriteria = requireCriteria && items.length === 0;
  const summary = {
    acs_total: items.length,
    covered: items.filter((item) => item.status === 'covered').length,
    missing: items.filter((item) => item.status === 'missing').length,
    weak: items.filter((item) => item.status === 'weak').length,
    criteria_required: requireCriteria,
    assertion_signals_required: requireAssertions,
    test_files_scanned: testContents.length
  };

  return {
    ok: !noCriteria && missingItems.length === 0,
    feature: slug,
    audited_at: new Date().toISOString(),
    policy: { require_criteria: requireCriteria, require_assertions: requireAssertions },
    summary,
    items,
    missing: noCriteria
      ? ['<no acceptance criteria declared>']
      : missingItems.map((item) => item.ac)
  };
}

module.exports = {
  AC_ID_RE,
  extractAcIds,
  isTestFile,
  mentionsAcId,
  maskNonCode,
  hasAssertionNearAc,
  collectAcceptanceCriteria,
  auditAcceptanceCriteriaTests
};
