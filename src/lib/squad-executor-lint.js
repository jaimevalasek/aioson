'use strict';

/**
 * Squad executor lint — the measured half of "is this squad well-formed?".
 *
 * squad:validate historically only proved that executor FILES exist. Every
 * consumer squad measured in the 2026-09 supervised session had passed that
 * bar while shipping 273-byte role stubs next to 20 KB prompts, placeholder
 * text, near-identical executors under different slugs, and workers that could
 * not receive a large payload. None of that was visible to any gate.
 *
 * This module reads the executor bodies and the worker entrypoints and
 * returns numbers a gate can act on. Tiering is honest:
 *   - `issues`   → provable from text alone (a stub cannot carry a mission;
 *                  a placeholder is a placeholder). squad:validate promotes
 *                  them to errors under --strict, warnings otherwise.
 *   - `warnings` → need context or taste (a missing section in a legacy
 *                  shape, a bloated prompt, two executors that read alike).
 *                  Always advisory, always with the sample so the rewrite is
 *                  directed.
 *
 * Model-agnostic, build-free, language-aware (English and pt-BR headings).
 */

const fs = require('node:fs');
const path = require('node:path');

// Bytes. A prompt under the floor is a role label, not an executor — provable
// from size alone, so it blocks under --strict. Between the floor and the thin
// line the prompt exists but cannot carry mission + context + constraints +
// output contract with any depth (the consumer stubs measured in 2026-09 sat at
// 273–500 bytes; the leanest real executor at ~800): advisory. The ceiling is a
// token-economy signal: past it, depth belongs in skills/ or docs/ the executor
// loads on demand.
const EXECUTOR_FLOOR_BYTES = 400;
const EXECUTOR_THIN_BYTES = 600;
const EXECUTOR_CEILING_BYTES = 16000;
const BYTES_PER_TOKEN = 4;
const NEAR_DUPLICATE_JACCARD = 0.6;

// Canonical sections from docs/squad/package-contract.md, with the pt-BR
// spellings a localized squad legitimately uses. The three core sections are
// the ones every executor shape (contract, crm "Role:" flow, legacy) needs to
// be operable: what it is for, what it must not do, what it returns.
const SECTION_ALIASES = {
  mission: ['mission', 'missão', 'missao', 'papel', 'role'],
  'hard constraints': ['hard constraints', 'constraints', 'restrições', 'restricoes', 'limites', 'never', 'nunca'],
  'output contract': ['output contract', 'output', 'saída', 'saida', 'entrega', 'contrato de saída', 'contrato de saida', 'response pattern', 'formato de resposta']
};
const CORE_SECTIONS = Object.keys(SECTION_ALIASES);

const PLACEHOLDER_PATTERNS = [
  /\bTODO\b/, /\bFIXME\b/, /\bTBD\b/, /lorem ipsum/i,
  /<placeholder>/i, /\[insert [^\]]*\]/i, /\[preencher[^\]]*\]/i, /\bXXX\b/
];

const WORKER_ARGV_PATTERN = /process\.argv\[2\]|sys\.argv\[1\]/;
const WORKER_INPUT_ENV = 'AIOSON_WORKER_INPUT_FILE';

function readText(file) {
  try {
    return fs.readFileSync(file, 'utf8');
  } catch {
    return null;
  }
}

function headings(text) {
  const out = [];
  for (const line of text.split(/\r?\n/)) {
    const m = /^#{1,4}\s+(.+?)\s*$/.exec(line);
    if (m) out.push(m[1].toLowerCase());
  }
  return out;
}

function hasSection(heads, key) {
  const aliases = SECTION_ALIASES[key];
  return heads.some((h) => aliases.some((a) => h.includes(a)));
}

function shingles(text, size = 3) {
  const words = text
    .toLowerCase()
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter(Boolean);
  const set = new Set();
  for (let i = 0; i + size <= words.length; i++) set.add(words.slice(i, i + size).join(' '));
  return set;
}

function jaccard(a, b) {
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const s of a) if (b.has(s)) inter++;
  return inter / (a.size + b.size - inter);
}

function relPosix(root, file) {
  return path.relative(root, file).split(path.sep).join('/');
}

/**
 * Resolve the executor files to lint: manifest.executors[].file when declared,
 * else every agents/*.md except agents.md.
 */
function resolveExecutorFiles(targetDir, slug, manifest) {
  const squadDir = path.join(targetDir, '.aioson', 'squads', slug);
  const declared = Array.isArray(manifest?.executors) ? manifest.executors : [];
  const files = [];
  const seen = new Set();
  for (const exec of declared) {
    if (!exec || !exec.file) continue;
    // Only prompt files are executors here; a worker entrypoint (run.js/run.py)
    // declared as an executor is measured by the worker pass below.
    if (!/\.md$/i.test(exec.file)) continue;
    const abs = path.resolve(targetDir, exec.file);
    if (seen.has(abs)) continue;
    seen.add(abs);
    files.push({ slug: exec.slug || path.basename(exec.file, '.md'), file: abs, declared: true, type: exec.type || null });
  }
  if (files.length === 0) {
    const agentsDir = path.join(squadDir, 'agents');
    let entries;
    try { entries = fs.readdirSync(agentsDir); } catch { entries = []; }
    for (const name of entries) {
      if (!name.endsWith('.md') || name === 'agents.md') continue;
      files.push({ slug: name.replace(/\.md$/, ''), file: path.join(agentsDir, name), declared: false, type: null });
    }
  }
  return files;
}

function resolveWorkerEntrypoints(targetDir, slug) {
  const workersDir = path.join(targetDir, '.aioson', 'squads', slug, 'workers');
  let entries;
  try { entries = fs.readdirSync(workersDir, { withFileTypes: true }); } catch { return []; }
  const out = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    for (const name of ['run.js', 'run.py']) {
      const file = path.join(workersDir, entry.name, name);
      if (fs.existsSync(file)) out.push({ slug: entry.name, file });
    }
  }
  return out;
}

/**
 * @param {object} params
 * @param {string} params.targetDir  project root
 * @param {string} params.slug       squad slug
 * @param {object} [params.manifest] parsed squad.manifest.json (read from disk when absent)
 * @returns {{ issues: string[], warnings: string[], metrics: object, executors: object[] }}
 */
function analyzeSquadExecutors({ targetDir, slug, manifest = null } = {}) {
  const issues = [];
  const warnings = [];
  const root = path.resolve(targetDir || '.');
  let man = manifest;
  if (!man) {
    const raw = readText(path.join(root, '.aioson', 'squads', slug, 'squad.manifest.json'));
    try { man = raw ? JSON.parse(raw) : null; } catch { man = null; }
  }

  const executors = [];
  const bodies = [];
  for (const entry of resolveExecutorFiles(root, slug, man)) {
    const text = readText(entry.file);
    const rel = relPosix(root, entry.file);
    if (text === null) {
      // Missing files are squad:validate's structural error; not repeated here.
      executors.push({ slug: entry.slug, file: rel, bytes: 0, missing: true });
      continue;
    }
    const bytes = Buffer.byteLength(text, 'utf8');
    const heads = headings(text);
    const missingSections = CORE_SECTIONS.filter((key) => !hasSection(heads, key));
    const placeholders = PLACEHOLDER_PATTERNS.filter((re) => re.test(text)).map((re) => re.source);
    const isWorker = entry.type === 'worker';
    const record = {
      slug: entry.slug,
      file: rel,
      bytes,
      tokens: Math.round(bytes / BYTES_PER_TOKEN),
      headings: heads.length,
      missingSections,
      placeholders,
      stub: !isWorker && bytes < EXECUTOR_FLOOR_BYTES,
      thin: !isWorker && bytes >= EXECUTOR_FLOOR_BYTES && bytes < EXECUTOR_THIN_BYTES,
      bloated: bytes > EXECUTOR_CEILING_BYTES
    };
    executors.push(record);
    bodies.push({ slug: entry.slug, file: rel, shingles: shingles(text) });

    if (record.stub) {
      issues.push(`Executor "${entry.slug}" is a stub: ${bytes} bytes (< ${EXECUTOR_FLOOR_BYTES}) at ${rel} — a role label is not an executor; write its mission, context, constraints and output contract`);
    }
    if (placeholders.length > 0) {
      issues.push(`Executor "${entry.slug}" still carries placeholder text (${placeholders.join(', ')}) at ${rel}`);
    }
    if (record.thin) {
      warnings.push(`Executor "${entry.slug}" is thin: ${bytes} bytes (< ${EXECUTOR_THIN_BYTES}) at ${rel} — a real role carries mission, quick context, hard constraints and an output contract with enough depth to act on`);
    }
    if (record.bloated) {
      warnings.push(`Executor "${entry.slug}" is ${bytes} bytes (~${record.tokens} tokens, > ${EXECUTOR_CEILING_BYTES}) at ${rel} — every session pays it; move reference depth into skills/ or docs/ the executor loads on demand`);
    }
    if (!record.stub && missingSections.length > 0) {
      warnings.push(`Executor "${entry.slug}" has no ${missingSections.map((s) => `"${s}"`).join(', ')} section at ${rel} — the package contract expects mission, hard constraints and an output contract`);
    }
  }

  const duplicates = [];
  for (let i = 0; i < bodies.length; i++) {
    for (let j = i + 1; j < bodies.length; j++) {
      const score = jaccard(bodies[i].shingles, bodies[j].shingles);
      if (score >= NEAR_DUPLICATE_JACCARD) {
        duplicates.push({ a: bodies[i].slug, b: bodies[j].slug, similarity: Number(score.toFixed(2)) });
        warnings.push(`Executors "${bodies[i].slug}" and "${bodies[j].slug}" are near-duplicates (${Math.round(score * 100)}% shared phrasing) — merge them or give each a distinct contribution`);
      }
    }
  }

  const workers = [];
  for (const worker of resolveWorkerEntrypoints(root, slug)) {
    const text = readText(worker.file) || '';
    const argvOnly = WORKER_ARGV_PATTERN.test(text) && !text.includes(WORKER_INPUT_ENV);
    workers.push({ slug: worker.slug, file: relPosix(root, worker.file), argvOnly });
    if (argvOnly) {
      warnings.push(`Worker "${worker.slug}" reads its input only from argv (${relPosix(root, worker.file)}) — payloads past the platform argv budget arrive through ${WORKER_INPUT_ENV}; read that file when the variable is set`);
    }
  }

  const sized = executors.filter((e) => !e.missing);
  const totalBytes = sized.reduce((sum, e) => sum + e.bytes, 0);
  const metrics = {
    executors: executors.length,
    measured: sized.length,
    totalBytes,
    estimatedTokens: Math.round(totalBytes / BYTES_PER_TOKEN),
    minBytes: sized.length ? Math.min(...sized.map((e) => e.bytes)) : 0,
    maxBytes: sized.length ? Math.max(...sized.map((e) => e.bytes)) : 0,
    stubs: sized.filter((e) => e.stub).length,
    thin: sized.filter((e) => e.thin).length,
    bloated: sized.filter((e) => e.bloated).length,
    withPlaceholders: sized.filter((e) => e.placeholders.length > 0).length,
    missingCoreSections: sized.filter((e) => !e.stub && e.missingSections.length > 0).length,
    nearDuplicates: duplicates.length,
    workers: workers.length,
    workersArgvOnly: workers.filter((w) => w.argvOnly).length,
    floorBytes: EXECUTOR_FLOOR_BYTES,
    thinBytes: EXECUTOR_THIN_BYTES,
    ceilingBytes: EXECUTOR_CEILING_BYTES
  };

  return { issues, warnings, metrics, executors, duplicates, workers };
}

module.exports = {
  analyzeSquadExecutors,
  EXECUTOR_FLOOR_BYTES,
  EXECUTOR_THIN_BYTES,
  EXECUTOR_CEILING_BYTES,
  NEAR_DUPLICATE_JACCARD,
  CORE_SECTIONS
};
