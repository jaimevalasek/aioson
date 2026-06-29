'use strict';

/**
 * aioson audit:code [path] [--changed] [--category=TODO,ANTI_PATTERN,DUPLICATION,DEAD_CODE]
 *   [--json] [--strict] — deterministic, build-free code-quality scan.
 *
 * The non-security half of a categorized code-quality audit, written in pure
 * Node so it runs cross-platform with no python/grep/tsc dependency. SECURITY is
 * NOT re-implemented here — `aioson security:audit` owns secrets/logs/controls.
 *
 * Categories (each a separate concern @qa can consume one at a time, one
 * category cleared per pass):
 *
 *   TODO          residual TODO/FIXME/XXX/placeholder/not-implemented        MED
 *   ANTI_PATTERN  eval / new Function / innerHTML / `: any` / coerce.boolean HIGH·MED
 *   DEAD_CODE     unused named imports (build-free TS6133 heuristic)         MED
 *   DUPLICATION   a string literal repeated 3+ times across 2+ files         LOW
 *
 * Exit code: a HIGH finding sets exit 1 (blocking); MED/LOW
 * are advisory and never fail the exit. Pass `suppressExitCode` for programmatic
 * callers (the workflow gate / @qa dispatch), matching security:audit.
 */

const path = require('node:path');
const fs = require('node:fs');

const { gitChangedFiles } = require('../harness/detect-runtime-feature');

const VERSION = '1.0.0';
const GENERATOR = `aioson audit:code@${VERSION}`;

const ALL_CATEGORIES = Object.freeze(['TODO', 'ANTI_PATTERN', 'DEAD_CODE', 'DUPLICATION']);

const IGNORE_DIRS = new Set([
  'node_modules', '.git', 'dist', 'build', 'out', 'coverage',
  '.next', '.nuxt', '.svelte-kit', 'vendor', '.aioson', '.venv', '__pycache__'
]);

const CODE_EXTS = new Set([
  '.js', '.jsx', '.mjs', '.cjs', '.ts', '.tsx',
  '.py', '.rb', '.go', '.java', '.php', '.vue', '.svelte', '.css', '.scss', '.html'
]);
const JS_TS_EXTS = new Set(['.js', '.jsx', '.mjs', '.cjs', '.ts', '.tsx']);
const TS_EXTS = new Set(['.ts', '.tsx']);

const MAX_FILE_BYTES = 512 * 1024;

// ─── TODO / placeholder ───────────────────────────────────────────────────────

const TODO_PATTERNS = [
  /\bTODO\b/,
  /\bFIXME\b/,
  /\bXXX\b/,
  /\bHACK\b/,
  /\bplaceholder\b/i,
  /not\s+implemented/i,
  /throw\s+new\s+Error\s*\(\s*['"`]not\s+impl/i
];

// ─── Anti-patterns (JS/TS unless noted) ───────────────────────────────────────

const ANTI_PATTERNS = [
  { re: /\beval\s*\(/,                 sev: 'HIGH', msg: 'eval() in code', ext: JS_TS_EXTS },
  { re: /\bnew\s+Function\s*\(/,       sev: 'HIGH', msg: 'new Function() (dynamic code)', ext: JS_TS_EXTS },
  { re: /\.innerHTML\s*=/,             sev: 'HIGH', msg: 'innerHTML assignment (use textContent / safe DOM API)', ext: JS_TS_EXTS },
  { re: /dangerouslySetInnerHTML/,     sev: 'HIGH', msg: 'dangerouslySetInnerHTML', ext: JS_TS_EXTS },
  { re: /z\.coerce\.boolean\s*\(/,     sev: 'HIGH', msg: 'z.coerce.boolean() ("false" coerces to true — use z.enum)', ext: JS_TS_EXTS },
  { re: /:\s*any\b/,                   sev: 'MED',  msg: '`: any` type (use unknown or an explicit type; // any-ok to allow)', ext: TS_EXTS, skip: (line) => line.includes('any-ok') },
  { re: /\bconsole\.(log|debug|trace)\s*\(/, sev: 'MED', msg: 'console.log/debug/trace left in code', ext: JS_TS_EXTS, prodOnly: true }
];

// ─── helpers ──────────────────────────────────────────────────────────────────

const SEVERITY_RANK = Object.freeze({ HIGH: 3, MED: 2, LOW: 1 });

function isProdFile(rel) {
  const lower = rel.toLowerCase();
  return !(
    /(^|[\\/])(test|tests|__tests__|spec|scripts|examples?|fixtures?|mocks?)([\\/]|$)/.test(lower) ||
    /\.(test|spec)\.[a-z]+$/.test(lower) ||
    /\.config\.[a-z]+$/.test(lower)
  );
}

function listSourceFiles(root) {
  const out = [];
  const stack = [root];
  while (stack.length) {
    const dir = stack.pop();
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (!IGNORE_DIRS.has(entry.name)) stack.push(full);
      } else if (entry.isFile() && CODE_EXTS.has(path.extname(entry.name).toLowerCase())) {
        out.push(full);
      }
    }
  }
  return out;
}

function readText(abs) {
  try {
    const stat = fs.statSync(abs);
    if (stat.size > MAX_FILE_BYTES) return null;
    return fs.readFileSync(abs, 'utf8');
  } catch {
    return null;
  }
}

function isCommentLine(stripped) {
  return stripped.startsWith('//') || stripped.startsWith('*') || stripped.startsWith('#') || stripped.startsWith('/*');
}

// ─── category scanners ─────────────────────────────────────────────────────────

function scanTodo(rel, ext, lines, push) {
  lines.forEach((line, i) => {
    for (const re of TODO_PATTERNS) {
      if (re.test(line)) {
        push({ category: 'TODO', severity: 'MED', message: 'TODO/FIXME/placeholder/not-implemented residual', file: rel, line: i + 1, snippet: line.trim().slice(0, 120) });
        break;
      }
    }
  });
}

function scanAntiPatterns(rel, ext, lines, push) {
  const prod = isProdFile(rel);
  lines.forEach((line, i) => {
    const stripped = line.trim();
    if (isCommentLine(stripped)) return;
    for (const ap of ANTI_PATTERNS) {
      if (ap.ext && !ap.ext.has(ext)) continue;
      if (ap.prodOnly && !prod) continue;
      if (ap.skip && ap.skip(line)) continue;
      if (ap.re.test(line)) {
        push({ category: 'ANTI_PATTERN', severity: ap.sev, message: ap.msg, file: rel, line: i + 1, snippet: stripped.slice(0, 120) });
      }
    }
  });
}

/**
 * DEAD_CODE — unused named imports, build-free. For each named import / require
 * destructure, the local name must appear more than once in the file (the import
 * itself is occurrence #1). A barrel re-export (`export { X } from`) suppresses
 * the flag. This is the static analogue of tsc TS6133 without needing a build.
 */
function scanDeadCode(rel, ext, content, lines, push) {
  if (!JS_TS_EXTS.has(ext) || rel.endsWith('.d.ts')) return;
  const specs = [];
  const importRe = /import\s+(?:type\s+)?(?:[A-Za-z0-9_$]+\s*,\s*)?\{([^}]*)\}\s*from\s*['"][^'"]+['"]/gs;
  const requireRe = /(?:const|let|var)\s*\{([^}]*)\}\s*=\s*require\(/gs;
  for (const re of [importRe, requireRe]) {
    let m;
    while ((m = re.exec(content)) !== null) {
      for (const raw of m[1].split(',')) {
        const part = raw.trim().replace(/^type\s+/, '');
        if (!part) continue;
        const local = (part.includes(' as ') ? part.split(/\s+as\s+/)[1] : part).trim();
        if (/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(local)) specs.push(local);
      }
    }
  }
  if (!specs.length) return;
  for (const name of [...new Set(specs)]) {
    // Re-exported names are "used" (barrel files).
    if (new RegExp(`export\\s*\\{[^}]*\\b${name}\\b`).test(content)) continue;
    const occurrences = (content.match(new RegExp(`\\b${name}\\b`, 'g')) || []).length;
    if (occurrences <= 1) {
      const idx = lines.findIndex((l) => new RegExp(`\\b${name}\\b`).test(l));
      push({ category: 'DEAD_CODE', severity: 'MED', message: `unused import "${name}" (declared, never used)`, file: rel, line: idx >= 0 ? idx + 1 : 1, snippet: idx >= 0 ? lines[idx].trim().slice(0, 120) : '' });
    }
  }
}

/**
 * DUPLICATION — a string literal (12..80 chars) that appears 3+ times across 2+
 * files is a constant waiting to drift. Pure text; comments and URLs ignored.
 */
function scanDuplication(files, push) {
  const literalRe = /["'`]([^"'`\n]{12,80})["'`]/g;
  const ignore = new Set(['use strict', 'application/json', 'text/plain', 'Content-Type', 'utf-8', 'utf8']);
  const occ = new Map(); // literal -> [{file,line}]
  for (const { rel, lines } of files) {
    lines.forEach((line, i) => {
      const stripped = line.trim();
      if (isCommentLine(stripped)) return;
      let m;
      literalRe.lastIndex = 0;
      while ((m = literalRe.exec(line)) !== null) {
        const lit = m[1];
        if (ignore.has(lit) || lit.startsWith('http://') || lit.startsWith('https://') || /^[\s./\\-]+$/.test(lit)) continue;
        if (!occ.has(lit)) occ.set(lit, []);
        occ.get(lit).push({ file: rel, line: i + 1 });
      }
    });
  }
  for (const [lit, places] of occ) {
    const files2 = new Set(places.map((p) => p.file));
    if (places.length >= 3 && files2.size >= 2) {
      push({
        category: 'DUPLICATION', severity: 'LOW',
        message: `literal "${lit.slice(0, 50)}" repeated ${places.length}x across ${files2.size} files (extract a constant)`,
        file: places[0].file, line: places[0].line,
        snippet: places.slice(0, 4).map((p) => `${p.file}:${p.line}`).join(', ')
      });
    }
  }
}

// ─── core scan ──────────────────────────────────────────────────────────────────

/**
 * @param {object} params
 * @param {string} params.targetDir
 * @param {string[]} [params.fileList] — absolute paths to scan; default = full walk
 * @param {Set<string>} params.categories
 * @returns {{ findings: Array, scanned: number }}
 */
function scanCodeQuality({ targetDir, fileList, categories }) {
  const abs = Array.isArray(fileList) && fileList.length
    ? fileList.filter((f) => CODE_EXTS.has(path.extname(f).toLowerCase()))
    : listSourceFiles(targetDir);

  const findings = [];
  const push = (f) => findings.push(f);
  const loaded = []; // { rel, ext, content, lines } for duplication pass

  for (const file of abs) {
    const content = readText(file);
    if (content === null) continue;
    const rel = path.relative(targetDir, file).split(path.sep).join('/');
    const ext = path.extname(file).toLowerCase();
    const lines = content.split('\n');
    loaded.push({ rel, ext, content, lines });

    if (categories.has('TODO')) scanTodo(rel, ext, lines, push);
    if (categories.has('ANTI_PATTERN')) scanAntiPatterns(rel, ext, lines, push);
    if (categories.has('DEAD_CODE')) scanDeadCode(rel, ext, content, lines, push);
  }
  if (categories.has('DUPLICATION')) scanDuplication(loaded, push);

  findings.sort((a, b) =>
    (SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity]) ||
    a.category.localeCompare(b.category) ||
    a.file.localeCompare(b.file) ||
    (a.line - b.line)
  );
  return { findings, scanned: loaded.length };
}

function parseCategories(option) {
  if (!option) return new Set(ALL_CATEGORIES);
  const wanted = String(option).split(',').map((s) => s.trim().toUpperCase()).filter(Boolean);
  const valid = wanted.filter((c) => ALL_CATEGORIES.includes(c));
  return new Set(valid.length ? valid : ALL_CATEGORIES);
}

async function runAuditCode({ args, options = {}, logger }) {
  const targetDir = path.resolve(process.cwd(), args?.[0] || '.');
  const suppressExitCode = Boolean(options.suppressExitCode);
  const setExitCode = (code) => { if (!suppressExitCode) process.exitCode = code; };
  const categories = parseCategories(options.category);

  let fileList = null;
  if (options.changed) {
    fileList = gitChangedFiles(targetDir).map((rel) => path.resolve(targetDir, rel));
  }

  const { findings, scanned } = scanCodeQuality({ targetDir, fileList, categories });

  const bySeverity = { HIGH: 0, MED: 0, LOW: 0 };
  const byCategory = {};
  for (const f of findings) {
    bySeverity[f.severity] = (bySeverity[f.severity] || 0) + 1;
    byCategory[f.category] = (byCategory[f.category] || 0) + 1;
  }

  const strict = Boolean(options.strict);
  const blocking = bySeverity.HIGH > 0 || (strict && bySeverity.MED > 0);

  const report = {
    generator: GENERATOR,
    root: targetDir,
    scanned_files: scanned,
    categories: [...categories],
    scope: options.changed ? 'changed' : 'full',
    total: findings.length,
    by_severity: bySeverity,
    by_category: byCategory,
    ok: !blocking,
    findings
  };

  // Persist for @qa to consume by category across invocations.
  try {
    const ctxDir = path.join(targetDir, '.aioson', 'context');
    fs.mkdirSync(ctxDir, { recursive: true });
    fs.writeFileSync(path.join(ctxDir, 'audit-code.json'), JSON.stringify(report, null, 2), 'utf8');
  } catch {
    // best-effort persistence — never fail the scan
  }

  if (options.json) {
    logger.log(JSON.stringify(report, null, 2));
    setExitCode(blocking ? 1 : 0);
    return report;
  }

  logger.log(`Code audit — ${scanned} file(s) scanned (${report.scope}) — ${findings.length} finding(s)`);
  if (bySeverity.HIGH || bySeverity.MED || bySeverity.LOW) {
    logger.log(`  HIGH: ${bySeverity.HIGH}  MED: ${bySeverity.MED}  LOW: ${bySeverity.LOW}`);
  }
  for (const cat of ALL_CATEGORIES) {
    if (byCategory[cat]) logger.log(`  ${cat}: ${byCategory[cat]}`);
  }
  for (const f of findings.slice(0, 50)) {
    logger.log(`  [${f.severity}] ${f.category} ${f.file}:${f.line} — ${f.message}`);
  }
  if (findings.length > 50) logger.log(`  … and ${findings.length - 50} more (see .aioson/context/audit-code.json)`);
  logger.log(blocking ? '  AUDIT=FAIL (HIGH findings present)' : '  AUDIT=OK (no blocking findings)');

  setExitCode(blocking ? 1 : 0);
  return report;
}

module.exports = {
  runAuditCode,
  scanCodeQuality,
  parseCategories,
  ALL_CATEGORIES,
  // exported for tests
  scanDeadCode,
  scanDuplication
};
