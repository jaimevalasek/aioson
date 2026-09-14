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
const {
  extractSection,
  parseFirstMarkdownTable,
  mapColumns,
  cleanCell,
  normalizeLabel,
  genericEvidence
} = require('./feature-completeness-format');

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

// Rust is the one supported language whose quotes need their own lexing: an
// apostrophe may be a lifetime rather than a literal, and a raw string carries
// its own delimiter. The masker relaxes those two rules for these files only,
// because in every other language a single quote does open a string and must
// keep being blanked.
function isRustSource(relPath) {
  return /\.rs$/i.test(String(relPath || ''));
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

// A Rust lifetime or loop label is an apostrophe followed by an identifier that
// no closing apostrophe terminates: `'static`, `'a`, `'_`, `'outer:`. A char
// literal always closes, so `'a'` and `b'a'` still read as literals, and an
// escape (`'\n'`, `'\''`) never starts an identifier.
function isRustLifetimeAt(chars, index) {
  if (!/[A-Za-z_]/.test(chars[index + 1] || '')) return false;
  let end = index + 1;
  while (end < chars.length && /[A-Za-z0-9_]/.test(chars[end])) end += 1;
  return chars[end] !== "'";
}

// A Rust raw string takes no escapes and may hold quotes of its own: `r"..."`,
// `r#"..."#`, `br##"..."##`. Reading one as an ordinary string closes it at the
// first inner quote and leaves the mask inverted for the rest of the file —
// hiding real assertions and, worse, exposing string bodies as if they were
// code. Returns the index of the closing delimiter, or null when `index` does
// not open a raw string. An unterminated one masks to the end, which is the
// conservative direction.
function rustRawStringAt(chars, index) {
  let hashes = 0;
  let prefix = index - 1;
  while (prefix >= 0 && chars[prefix] === '#') {
    hashes += 1;
    prefix -= 1;
  }
  if (chars[prefix] !== 'r') return null;
  if (chars[prefix - 1] === 'b' || chars[prefix - 1] === 'c') prefix -= 1;
  // The prefix must open the token, never end a longer identifier.
  if (prefix > 0 && /[A-Za-z0-9_]/.test(chars[prefix - 1] || '')) return null;

  for (let i = index + 1; i < chars.length; i += 1) {
    if (chars[i] !== '"') continue;
    let closed = true;
    for (let hash = 1; hash <= hashes; hash += 1) {
      if (chars[i + hash] !== '#') {
        closed = false;
        break;
      }
    }
    if (closed) return i + hashes;
  }
  return chars.length - 1;
}

// Blank comments and string/template contents while preserving offsets and
// newlines. AC ids may legitimately live in test titles/comments, so matching
// still uses the original source; only test/assertion syntax is read from this
// masked view. This is deliberately conservative: ambiguous text is never
// promoted to executable proof.
function maskNonCode(content, options = {}) {
  const text = String(content || '');
  // Rust needs two exceptions the other languages do not: a lifetime opens no
  // literal, and a raw string carries its own delimiter. Lexing either as an
  // ordinary quote desynchronises the mask for the rest of the file.
  const rust = options.rust ?? isRustSource(options.file);
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
      if (rust && current === "'" && isRustLifetimeAt(chars, i)) continue;
      const rawEnd = rust && current === '"' ? rustRawStringAt(chars, i) : null;
      if (rawEnd !== null) {
        for (let j = i; j <= rawEnd; j += 1) {
          if (chars[j] !== '\n' && chars[j] !== '\r') chars[j] = ' ';
        }
        i = rawEnd;
        continue;
      }
      chars[i] = ' ';
      state = 'string';
      quote = current;
      escaped = false;
    }
  }
  return chars.join('');
}

function hasAssertionNearAc(content, acId, options = {}) {
  const text = String(content || '');
  const code = maskNonCode(text, options);
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
    .filter((item) => !options.requireAssertions
      || hasAssertionNearAc(item.content, acId, { file: item.file }))
    .map((item) => ({
      file: item.file,
      evidence: options.requireAssertions
        ? `test file references ${acId} with a nearby assertion signal`
        : `test file references ${acId}`
    }));
}

function weakTestEvidenceFor(acId, testContents) {
  return testContents
    .filter((item) => mentionsAcId(item.content, acId)
      && !hasAssertionNearAc(item.content, acId, { file: item.file }))
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

// A6: depois do feature:archive os artefatos moram em
// `.aioson/context/done/{slug}/` (raiz) e `done/{slug}/plans/` (plan dir).
// Cada leitura tenta o caminho vivo e cai para o arquivado — auditoria
// retroativa de feature fechada deixa de reportar "0/0 covered".
async function readJsonFirst(paths) {
  for (const filePath of paths) {
    const raw = await readText(filePath);
    if (!raw) continue;
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }
  return null;
}

async function readHarnessContract(targetDir, slug) {
  return readJsonFirst([
    path.join(targetDir, '.aioson', 'plans', slug, 'harness-contract.json'),
    path.join(targetDir, '.aioson', 'context', 'done', slug, 'plans', 'harness-contract.json')
  ]);
}

async function readHarnessReport(targetDir, slug) {
  return readJsonFirst([
    path.join(targetDir, '.aioson', 'plans', slug, 'last-check-output.json'),
    path.join(targetDir, '.aioson', 'context', 'done', slug, 'plans', 'last-check-output.json')
  ]);
}

// Third evidence channel (opt-in, close-time): the QA CAP/AC evidence table.
// A visual/measured AC verified live by QA must not demand a ritual test file
// that only re-cites the id — but the channel is NOT a blanket bypass. It only
// applies to ACs whose PRD `Evidence` column declares manual verification
// (smoke, measurement, inspection); an AC that PROMISED an automated test
// still owes that test, so the "cite the AC in an asserting test" convention
// keeps its teeth. Rows count only with result PASS and non-generic evidence,
// exactly mirroring validateExecutionEvidence. Keyed lowercase; reads live
// then archived (A6).
const { readBrowserEvidence, browserEvidenceFor } = require('./browser-evidence');

const AUTOMATED_EVIDENCE_RE = /test|spec|assert|automat|unit|integra|e2e|playwright|cypress|vitest|jest|check/i;

async function readTextFirst(paths) {
  for (const filePath of paths) {
    const content = await readText(filePath);
    if (content) return { content, path: filePath };
  }
  return { content: null, path: null };
}

// AC id → declared evidence text from the PRD Acceptance Criteria table.
// Same section/column aliases as validatePrdAcceptanceCriteria — one contract.
async function collectDeclaredEvidence(targetDir, slug) {
  const byAc = new Map();
  const { content: prd } = await readTextFirst([
    path.join(targetDir, '.aioson', 'context', `prd-${slug}.md`),
    path.join(targetDir, '.aioson', 'context', 'done', slug, `prd-${slug}.md`)
  ]);
  if (!prd) return byAc;
  const section = extractSection(prd, ['Acceptance Criteria', 'Criterios de Aceite']);
  if (!section) return byAc;
  const table = parseFirstMarkdownTable(section);
  if (!table) return byAc;
  const columns = mapColumns(table, {
    ac: ['AC', 'Acceptance criterion', 'Criterio de aceite'],
    evidence: ['Evidence', 'Verification', 'Evidencia', 'Verificacao']
  });
  if (columns.missing.length > 0) return byAc;
  for (const row of table.rows) {
    const evidence = cleanCell(row[columns.indexes.evidence]);
    if (!evidence) continue;
    for (const ac of extractAcIds(String(row[columns.indexes.ac] || ''))) {
      const key = ac.toLowerCase();
      if (!byAc.has(key)) byAc.set(key, evidence);
    }
  }
  return byAc;
}

async function collectQaEvidence(targetDir, slug) {
  const candidates = [
    path.join(targetDir, '.aioson', 'context', `qa-report-${slug}.md`),
    path.join(targetDir, '.aioson', 'context', 'done', slug, `qa-report-${slug}.md`)
  ];
  const byAc = new Map();
  let report = null;
  let file = null;
  for (const candidate of candidates) {
    report = await readText(candidate);
    if (report) {
      file = toRel(targetDir, candidate);
      break;
    }
  }
  if (!report) return byAc;
  const section = extractSection(report, [
    'CAP/AC evidence table',
    'Capability acceptance evidence',
    'Evidencias CAP/AC'
  ]);
  if (!section) return byAc;
  const table = parseFirstMarkdownTable(section);
  if (!table) return byAc;
  const columns = mapColumns(table, {
    cap: ['CAP', 'Capability', 'Capacidade'],
    ac: ['AC', 'Acceptance criterion', 'Criterio de aceite'],
    result: ['Result', 'Verdict', 'Resultado', 'Veredito'],
    evidence: ['Evidence', 'Proof', 'Evidencia', 'Prova']
  });
  if (columns.missing.length > 0) return byAc;
  for (const row of table.rows) {
    const result = normalizeLabel(row[columns.indexes.result]);
    if (result !== 'pass' && result !== 'passed') continue;
    const evidence = cleanCell(row[columns.indexes.evidence]);
    if (genericEvidence(evidence)) continue;
    for (const ac of extractAcIds(String(row[columns.indexes.ac] || ''))) {
      const key = ac.toLowerCase();
      if (!byAc.has(key)) byAc.set(key, { file, evidence });
    }
  }
  return byAc;
}

async function collectAcceptanceCriteria(targetDir, slug) {
  const contextDir = path.join(targetDir, '.aioson', 'context');
  const archivedDir = path.join(contextDir, 'done', slug);
  const sources = [
    { kind: 'requirements', file: `requirements-${slug}.md` },
    { kind: 'prd', file: `prd-${slug}.md` },
    { kind: 'conformance', file: `conformance-${slug}.yaml` }
  ].map((source) => ({
    kind: source.kind,
    candidates: [path.join(contextDir, source.file), path.join(archivedDir, source.file)]
  }));

  const byId = new Map();
  for (const source of sources) {
    let content = null;
    let sourcePath = null;
    for (const candidate of source.candidates) {
      content = await readText(candidate);
      if (content) {
        sourcePath = candidate;
        break;
      }
    }
    if (!content) continue;
    source.path = sourcePath;
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
  const acceptQaEvidence = Boolean(options.acceptQaEvidence);
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
  // Walkthroughs driven through a real browser (browser:run --slug) are
  // automated evidence too: the script is the reproduction, the report the
  // per-AC verdict. Read once, consulted per criterion.
  const browserEvidence = readBrowserEvidence(targetDir, slug);
  const qaEvidence = acceptQaEvidence
    ? await collectQaEvidence(targetDir, slug)
    : new Map();
  const declaredEvidence = acceptQaEvidence
    ? await collectDeclaredEvidence(targetDir, slug)
    : new Map();
  const items = criteria.map((criterion) => {
    const testEvidence = testEvidenceFor(criterion.id, testContents, { requireAssertions });
    const weakEvidence = requireAssertions ? weakTestEvidenceFor(criterion.id, testContents) : [];
    const harnessEvidence = harnessEvidenceFor(criterion.id, contract, harnessReport).map((e) => ({
      ...e,
      file: e.file.replace('{slug}', slug)
    }));
    const declared = declaredEvidence.get(criterion.id.toLowerCase());
    const manualDeclared = Boolean(declared) && !AUTOMATED_EVIDENCE_RE.test(declared);
    const qaRow = manualDeclared ? qaEvidence.get(criterion.id.toLowerCase()) : undefined;
    const qaRowEvidence = qaRow
      ? [{
        file: qaRow.file,
        evidence: `QA report records concrete PASS evidence for ${criterion.id} (PRD declares manual verification: ${declared})`
      }]
      : [];
    const browserRows = browserEvidenceFor(criterion.id, browserEvidence);
    const evidence = [...testEvidence, ...harnessEvidence, ...browserRows, ...qaRowEvidence];
    return {
      ac: criterion.id,
      status: evidence.length > 0 ? 'covered' : (weakEvidence.length > 0 ? 'weak' : 'missing'),
      sources: criterion.sources,
      evidence,
      weak_evidence: weakEvidence
    };
  });

  let deferredAcs = [];
  if (acceptQaEvidence) {
    const { evaluateFollowups } = require('./delivery-followups');
    const disposition = await evaluateFollowups(targetDir, slug);
    if (disposition.eligible) deferredAcs = disposition.deferred_acs;
  }
  for (const item of items) if (deferredAcs.includes(item.ac.toUpperCase())) item.status = 'deferred';
  const missingItems = items.filter((item) => !['covered', 'deferred'].includes(item.status));
  const noCriteria = requireCriteria && items.length === 0;
  const summary = {
    acs_total: items.length,
    deferred: items.filter(item => item.status === 'deferred').length,
    covered: items.filter((item) => item.status === 'covered').length,
    missing: items.filter((item) => item.status === 'missing').length,
    weak: items.filter((item) => item.status === 'weak').length,
    criteria_required: requireCriteria,
    assertion_signals_required: requireAssertions,
    qa_evidence_accepted: acceptQaEvidence,
    browser_covered: items.filter((item) => item.evidence.some((e) => e.kind === 'browser')).length,
    test_files_scanned: testContents.length
  };

  return {
    ok: !noCriteria && missingItems.length === 0,
    feature: slug,
    audited_at: new Date().toISOString(),
    policy: {
      require_criteria: requireCriteria,
      require_assertions: requireAssertions,
      accept_qa_evidence: acceptQaEvidence
    },
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
