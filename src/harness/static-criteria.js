'use strict';

/**
 * Static-pattern criteria (SG-* — Static Gate) — the build-independent half of
 * the harness contract.
 *
 * Where an RG-* criterion EXECUTES a command (a working build, migrations, a
 * booted app — expensive, run once at the last gate per A5), an SG-* criterion
 * proves a claim by READING the changed files: a required pattern is present
 * (the code was actually written / wired) and a forbidden pattern is absent (no
 * placeholder, stub or anti-pattern snuck in). Pure fs + RegExp +
 * `node --check`/`JSON.parse` — no shell, no build — so it costs ~milliseconds
 * and runs at EVERY gate (@dev-done, @qa-done; advisory in per-phase
 * `harness:check`), cross-platform by construction.
 *
 * Two build-free pattern checks over the declared files:
 *   must_match      OR-across-files  — each pattern must appear in >= 1 file
 *   must_not_match  absent-in-all    — no pattern may appear in ANY file
 * plus a post-write parse-check (the `parseable` gate) to catch a truncated or
 * corrupted write before it reaches a human.
 *
 * An invalid regex degrades to a literal substring test instead of throwing — a
 * contract typo never crashes the gate, it just matches literally.
 */

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

/** A criterion is static when it carries a non-empty must_match or must_not_match. */
function isStaticCriterion(criterion) {
  if (!criterion || typeof criterion !== 'object') return false;
  return (
    (Array.isArray(criterion.must_match) && criterion.must_match.length > 0) ||
    (Array.isArray(criterion.must_not_match) && criterion.must_not_match.length > 0)
  );
}

/**
 * Compile a pattern to a tester: a real RegExp when the source is valid, else a
 * literal-substring test (a contract typo matches literally, never throws).
 */
function patternTester(pattern) {
  const src = String(pattern);
  try {
    const re = new RegExp(src);
    return (text) => re.test(text);
  } catch {
    return (text) => text.includes(src);
  }
}

/**
 * Parse-check a file by extension. Returns { checked, ok, reason }.
 * `checked: false` means no stdlib parser applies to this extension (skipped,
 * like the harness skips .ts/.md) — never a failure.
 */
function parseCheckFile(absPath) {
  const ext = path.extname(absPath).toLowerCase();
  if (ext === '.json') {
    let content;
    try {
      content = fs.readFileSync(absPath, 'utf8');
    } catch (err) {
      return { checked: true, ok: false, reason: `cannot read file (${err.code || err.message})` };
    }
    try {
      JSON.parse(content);
      return { checked: true, ok: true, reason: null };
    } catch (err) {
      return { checked: true, ok: false, reason: `invalid JSON (${err.message})` };
    }
  }
  if (ext === '.js' || ext === '.mjs' || ext === '.cjs') {
    // `node --check` is the syntax parser shipped with the runtime AIOSON runs
    // on — guaranteed present, cross-platform, no extra dependency.
    const res = spawnSync(process.execPath, ['--check', absPath], { encoding: 'utf8', timeout: 10000 });
    if (res.status === 0) return { checked: true, ok: true, reason: null };
    const detail = String(res.stderr || res.stdout || '')
      .split('\n')
      .map((l) => l.trim())
      .find((l) => l) || `exit ${res.status}`;
    return { checked: true, ok: false, reason: `syntax error (${detail})` };
  }
  // No stdlib parser for this extension (.ts/.tsx/.md/...): skip, like the harness.
  return { checked: false, ok: true, reason: null };
}

/**
 * Evaluate one static criterion against the working tree.
 *
 * @param {object} criterion — a criteria[] entry with must_match/must_not_match/files
 * @param {string} cwd — project root the relative file paths resolve against
 * @returns {{ id, kind:'static', ok, files, missing_files, must_match_misses,
 *             must_not_match_hits, parse_failures, detail }}
 */
function evaluateStaticCriterion(criterion, cwd) {
  const id = criterion.id;
  const files = Array.isArray(criterion.files) ? criterion.files.slice() : [];
  const mustMatch = Array.isArray(criterion.must_match) ? criterion.must_match : [];
  const mustNotMatch = Array.isArray(criterion.must_not_match) ? criterion.must_not_match : [];

  const resolved = files.map((rel) => ({ rel, abs: path.resolve(cwd, rel) }));
  const missingFiles = resolved.filter((f) => !fs.existsSync(f.abs)).map((f) => f.rel);

  // Read each existing file once, and parse-check it for truncation/corruption.
  const contents = new Map();
  const parseFailures = [];
  for (const f of resolved) {
    if (!fs.existsSync(f.abs)) continue;
    let text = '';
    try {
      text = fs.readFileSync(f.abs, 'utf8');
    } catch {
      // Unreadable file is reported by the parse-check below.
    }
    contents.set(f.rel, text);
    const pc = parseCheckFile(f.abs);
    if (pc.checked && !pc.ok) parseFailures.push(`${f.rel}: ${pc.reason}`);
  }

  // must_match — OR across files: each pattern must appear in >= 1 file.
  const mustMatchMisses = [];
  for (const pat of mustMatch) {
    const test = patternTester(pat);
    const hit = [...contents.values()].some((text) => test(text));
    if (!hit) mustMatchMisses.push(String(pat));
  }

  // must_not_match — absent in all: no pattern may appear in ANY file.
  const mustNotMatchHits = [];
  for (const pat of mustNotMatch) {
    const test = patternTester(pat);
    for (const [rel, text] of contents) {
      if (test(text)) mustNotMatchHits.push({ pattern: String(pat), file: rel });
    }
  }

  const reasons = [];
  if (missingFiles.length) reasons.push(`missing files: ${missingFiles.join(', ')}`);
  if (parseFailures.length) reasons.push(`parse: ${parseFailures.join('; ')}`);
  if (mustMatchMisses.length) reasons.push(`must_match not found: ${mustMatchMisses.map((p) => `/${p}/`).join(', ')}`);
  if (mustNotMatchHits.length) {
    reasons.push(`must_not_match present: ${mustNotMatchHits.map((h) => `/${h.pattern}/ in ${h.file}`).join(', ')}`);
  }

  const ok =
    missingFiles.length === 0 &&
    parseFailures.length === 0 &&
    mustMatchMisses.length === 0 &&
    mustNotMatchHits.length === 0;

  return {
    id,
    kind: 'static',
    ok,
    files,
    missing_files: missingFiles,
    must_match_misses: mustMatchMisses,
    must_not_match_hits: mustNotMatchHits,
    parse_failures: parseFailures,
    detail: ok ? null : reasons.join(' | ')
  };
}

/**
 * Evaluate every static criterion in a contract's criteria[]. Runtime criteria
 * (those with a `verification` command) are ignored here.
 *
 * @param {object} params
 * @param {Array} params.criteria — criteria[] from the contract
 * @param {string} params.cwd — project root
 * @returns {{ checks: Array, ok: boolean, total: number, failed: number }}
 */
function evaluateStaticCriteria({ criteria = [], cwd } = {}) {
  const root = cwd || process.cwd();
  const checks = [];
  for (const criterion of Array.isArray(criteria) ? criteria : []) {
    if (!isStaticCriterion(criterion)) continue;
    checks.push(evaluateStaticCriterion(criterion, root));
  }
  const failed = checks.filter((c) => !c.ok).length;
  return { checks, ok: failed === 0, total: checks.length, failed };
}

module.exports = {
  isStaticCriterion,
  patternTester,
  parseCheckFile,
  evaluateStaticCriterion,
  evaluateStaticCriteria
};
