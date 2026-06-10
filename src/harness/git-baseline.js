'use strict';

/**
 * Baseline git do self:loop (loop-guardrails REQ-2/3 + D2).
 *
 * Única fronteira `child_process` da Fase 1 além do sandbox — todo o I/O git
 * dos guards vive aqui. Módulos consumidores recebem objetos puros.
 *
 * - `captureBaseline`: no preflight, grava HEAD + dirty_paths (porcelain) e o
 *   `git hash-object` dos dirty paths que casam `forbidden_files` (D2 — fecha
 *   EC-2: tentativa que re-modifica um path sujo proibido ainda viola).
 * - `computeChangedSet`: pós-attempt, changed set = porcelain atual −
 *   dirty_paths do baseline. NUNCA `git diff --name-only` (não vê untracked,
 *   EC-1). Paths normalizados `/` (EC-6). Rename conta os dois paths (EC-3);
 *   deleção conta (EC-4).
 */

const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const { normalizePath, matchGlob, matchAny } = require('./glob-match');

/**
 * Estado do framework: o próprio loop escreve progress.json/baseline.json/
 * attempts/ sob `.aioson/` durante a execução — esses paths são excluídos do
 * changed-set para não gerar falsa violação (mesmo precedente do git ingest
 * do neural-chain, que exclui `.aioson/*`).
 */
const FRAMEWORK_STATE_GLOB = '.aioson/**';

function git(targetDir, gitArgs) {
  return execFileSync('git', gitArgs, {
    cwd: targetDir,
    encoding: 'utf8',
    maxBuffer: 1024 * 1024 * 10,
    stdio: ['ignore', 'pipe', 'pipe']
  });
}

/** Map porcelain XY → status do schema §2.3. */
function porcelainStatus(xy) {
  if (xy.includes('R') || xy.includes('C')) return 'renamed';
  if (xy === '??') return 'added';
  if (xy.includes('A')) return 'added';
  if (xy.includes('D')) return 'deleted';
  return 'modified';
}

/**
 * Parseia `git status --porcelain` em entradas { path, status }.
 * Rename (`R  old -> new`) produz DUAS entradas (EC-3).
 * Exportada pura para teste determinístico.
 */
function parsePorcelain(output) {
  const entries = [];
  for (const rawLine of String(output || '').split('\n')) {
    const line = rawLine.replace(/\r$/, '');
    if (!line.trim()) continue;
    const xy = line.slice(0, 2);
    let rest = line.slice(3);
    // porcelain pode citar paths com espaços/especiais entre aspas
    const unquote = (p) => {
      const trimmed = p.trim();
      if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
        try { return JSON.parse(trimmed); } catch { return trimmed.slice(1, -1); }
      }
      return trimmed;
    };
    const status = porcelainStatus(xy);
    if (status === 'renamed' && rest.includes(' -> ')) {
      const [from, to] = rest.split(' -> ');
      entries.push({ path: normalizePath(unquote(from)), status: 'renamed' });
      entries.push({ path: normalizePath(unquote(to)), status: 'renamed' });
      continue;
    }
    entries.push({ path: normalizePath(unquote(rest)), status });
  }
  return entries;
}

function readPorcelain(targetDir) {
  // -uall: untracked listados arquivo a arquivo — sem ele o porcelain colapsa
  // dirs novos (`?? secrets/`) e `secrets/**` não casaria o dir vazio de sufixo.
  const entries = parsePorcelain(git(targetDir, ['status', '--porcelain', '-uall']));
  return entries.filter((entry) => !matchGlob(FRAMEWORK_STATE_GLOB, entry.path));
}

function readHead(targetDir) {
  try {
    return git(targetDir, ['rev-parse', 'HEAD']).trim();
  } catch {
    return null; // repo sem commits ainda
  }
}

/**
 * `git hash-object` de um path do working tree; null para path
 * inexistente/deletado (deleção posterior será detectada por hash null≠hash).
 */
function hashWorkingTreePath(targetDir, relPath) {
  const abs = path.join(targetDir, relPath);
  if (!fs.existsSync(abs) || fs.statSync(abs).isDirectory()) return null;
  try {
    return git(targetDir, ['hash-object', '--', relPath]).trim();
  } catch {
    return null;
  }
}

/**
 * Captura o baseline no preflight (REQ-2 + D2) e grava
 * `.aioson/plans/{slug}/baseline.json`.
 *
 * @returns {{ baseline, warnings: [{path, reason}] }}
 */
function captureBaseline(targetDir, planDir, { forbiddenGlobs = [] } = {}) {
  const dirtyEntries = readPorcelain(targetDir);
  const dirtyPaths = dirtyEntries.map((e) => e.path);

  // D2: hash apenas dos dirty paths que casam forbidden (conjunto bounded)
  const forbiddenDirtyHashes = {};
  const warnings = [];
  for (const dirtyPath of dirtyPaths) {
    const matched = matchAny(forbiddenGlobs, dirtyPath);
    if (matched) {
      forbiddenDirtyHashes[dirtyPath] = hashWorkingTreePath(targetDir, dirtyPath);
      warnings.push({
        path: dirtyPath,
        reason: `dirty path matches forbidden glob "${matched}" at loop start — re-modification will be a scope violation`
      });
    }
  }

  const baseline = {
    captured_at: new Date().toISOString(),
    head: readHead(targetDir),
    dirty_paths: dirtyPaths,
    forbidden_dirty_hashes: forbiddenDirtyHashes
  };

  fs.mkdirSync(planDir, { recursive: true });
  fs.writeFileSync(path.join(planDir, 'baseline.json'), JSON.stringify(baseline, null, 2), 'utf8');

  return { baseline, warnings };
}

function loadBaseline(planDir) {
  const baselinePath = path.join(planDir, 'baseline.json');
  if (!fs.existsSync(baselinePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(baselinePath, 'utf8'));
  } catch {
    return null;
  }
}

/**
 * Changed set da tentativa (REQ-3): porcelain atual − dirty_paths do baseline,
 * MAIS dirty paths proibidos cujo hash mudou desde o baseline (D2 / EC-2).
 *
 * @returns {{ files: [{path, status}], rehashViolations: [{path, reason}] }}
 */
function computeChangedSet(targetDir, baseline) {
  const current = readPorcelain(targetDir);
  const baselineDirty = new Set((baseline && baseline.dirty_paths) || []);

  const files = current.filter((entry) => !baselineDirty.has(entry.path));

  const rehashViolations = [];
  const hashes = (baseline && baseline.forbidden_dirty_hashes) || {};
  for (const [dirtyPath, baselineHash] of Object.entries(hashes)) {
    const currentHash = hashWorkingTreePath(targetDir, dirtyPath);
    if (currentHash !== baselineHash) {
      rehashViolations.push({
        path: dirtyPath,
        reason: 'forbidden dirty path was re-modified after baseline (content hash changed)'
      });
    }
  }

  return { files, rehashViolations };
}

/** `git diff` da tentativa para attempts/{n}/diff.patch (should-have REQ-9). */
function captureDiffPatch(targetDir) {
  try {
    return git(targetDir, ['diff', 'HEAD']);
  } catch {
    try {
      return git(targetDir, ['diff']);
    } catch {
      return '';
    }
  }
}

module.exports = {
  parsePorcelain,
  captureBaseline,
  loadBaseline,
  computeChangedSet,
  captureDiffPatch
};
