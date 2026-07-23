'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const { parsePorcelain } = require('../harness/git-baseline');

const execFileAsync = promisify(execFile);
const SPECIALIST_AGENTS = new Set(['tester', 'pentester']);
const MAX_TOTAL_PATHS = 5;
const MAX_BEHAVIOR_PATHS = 3;

function normalizeRelPath(value) {
  return String(value || '')
    .trim()
    .replace(/^[-*]\s+/, '')
    .replace(/^["'`]|["'`]$/g, '')
    .replace(/\\/g, '/')
    .replace(/^\.\//, '');
}

function isSafeExactPath(targetDir, relPath) {
  if (!relPath || path.isAbsolute(relPath) || /[*?{}[\]]/.test(relPath)) return false;
  const absolute = path.resolve(targetDir, relPath);
  const relative = path.relative(targetDir, absolute);
  return Boolean(relative) && !relative.startsWith('..') && !path.isAbsolute(relative);
}

function isForbiddenCorrectionPath(relPath) {
  const normalized = normalizeRelPath(relPath).toLowerCase();
  const base = path.posix.basename(normalized);
  return normalized === 'agents.md'
    || normalized === '.git'
    || normalized.startsWith('.git/')
    || normalized.startsWith('.aioson/agents/')
    || normalized.startsWith('.aioson/rules/')
    || normalized.startsWith('.aioson/skills/')
    || normalized.startsWith('.aioson/installed-skills/')
    || normalized.startsWith('.aioson/runtime/')
    || normalized === '.aioson/context/project.context.md'
    || normalized === '.aioson/context/workflow.state.json'
    || normalized === '.aioson/context/workflow-execute.json'
    || /^\.aioson\/context\/agent-execution-.+\.json$/.test(normalized)
    || /^\.env(?:\.|$)/.test(base)
    || [
      'package.json',
      'package-lock.json',
      'npm-shrinkwrap.json',
      'pnpm-lock.yaml',
      'yarn.lock',
      'bun.lock',
      'bun.lockb',
      'requirements.txt',
      'pyproject.toml',
      'poetry.lock',
      'cargo.toml',
      'cargo.lock',
      'go.mod',
      'go.sum',
      'composer.json',
      'composer.lock'
    ].includes(base);
}

async function hasSymlinkTraversal(targetDir, relPath) {
  const segments = normalizeRelPath(relPath).split('/').filter(Boolean);
  let cursor = path.resolve(targetDir);
  for (const segment of segments) {
    cursor = path.join(cursor, segment);
    try {
      const stat = await fs.lstat(cursor);
      if (stat.isSymbolicLink()) return true;
    } catch (error) {
      if (error && error.code === 'ENOENT') return false;
      return true;
    }
  }
  return false;
}

function splitPathList(value) {
  const normalized = String(value || '').trim().replace(/^\[|\]$/g, '');
  if (!normalized) return [];
  return normalized
    .split(/[,;\n]/)
    .map(normalizeRelPath)
    .filter(Boolean);
}

function markdownAllowedPaths(content) {
  const lines = String(content || '').split(/\r?\n/);
  const paths = [];
  for (let index = 0; index < lines.length; index += 1) {
    const match = lines[index].match(/^\s*(?:[-*]\s*)?allowed_fix_paths\s*:\s*(.*?)\s*$/i);
    if (!match) continue;
    if (match[1]) {
      paths.push(...splitPathList(match[1]));
      continue;
    }
    for (let next = index + 1; next < lines.length; next += 1) {
      const item = lines[next].match(/^\s+[-*]\s+(.+?)\s*$/);
      if (!item) break;
      paths.push(normalizeRelPath(item[1]));
    }
  }
  return paths.filter(Boolean);
}

function jsonAllowedPaths(value, paths = []) {
  if (Array.isArray(value)) {
    value.forEach((entry) => jsonAllowedPaths(entry, paths));
    return paths;
  }
  if (!value || typeof value !== 'object') return paths;
  for (const [key, entry] of Object.entries(value)) {
    if (key === 'allowed_fix_paths') {
      if (Array.isArray(entry)) paths.push(...entry.map(normalizeRelPath));
      else paths.push(...splitPathList(entry));
    } else {
      jsonAllowedPaths(entry, paths);
    }
  }
  return paths.filter(Boolean);
}

function isSupportPath(relPath) {
  const normalized = `/${normalizeRelPath(relPath).toLowerCase()}`;
  return normalized.includes('/test/')
    || normalized.includes('/tests/')
    || normalized.includes('/__tests__/')
    || /\.(?:test|spec)\.[a-z0-9]+$/.test(normalized)
    || normalized.startsWith('/docs/')
    || normalized.endsWith('.md');
}

function samePaths(left, right) {
  const a = [...new Set((left || []).map(normalizeRelPath))].sort();
  const b = [...new Set((right || []).map(normalizeRelPath))].sort();
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

async function inspectCorrectionPacket(targetDir, planPath, source) {
  if (!SPECIALIST_AGENTS.has(source)) {
    return { ok: true, applicable: false, allowed_fix_paths: [] };
  }

  const normalizedPlan = normalizeRelPath(planPath);
  if (!isSafeExactPath(targetDir, normalizedPlan)) {
    return { ok: false, reason: 'invalid_correction_packet_path' };
  }
  if (await hasSymlinkTraversal(targetDir, normalizedPlan)) {
    return { ok: false, reason: 'correction_packet_symlink_forbidden' };
  }

  const absolute = path.resolve(targetDir, normalizedPlan);
  let raw;
  try {
    raw = await fs.readFile(absolute, 'utf8');
  } catch {
    return { ok: false, reason: 'correction_packet_missing', packet_path: normalizedPlan };
  }

  let allowedPaths;
  if (path.extname(absolute).toLowerCase() === '.json') {
    try {
      allowedPaths = jsonAllowedPaths(JSON.parse(raw));
    } catch {
      return { ok: false, reason: 'correction_packet_invalid_json', packet_path: normalizedPlan };
    }
  } else {
    allowedPaths = markdownAllowedPaths(raw);
  }

  allowedPaths = [...new Set(allowedPaths.map(normalizeRelPath).filter(Boolean))];
  if (allowedPaths.length === 0) {
    return { ok: false, reason: 'allowed_fix_paths_missing', packet_path: normalizedPlan };
  }
  const invalidPaths = allowedPaths.filter((entry) => !isSafeExactPath(targetDir, entry));
  if (invalidPaths.length > 0) {
    return {
      ok: false,
      reason: 'allowed_fix_paths_invalid',
      packet_path: normalizedPlan,
      invalid_paths: invalidPaths
    };
  }
  const forbiddenPaths = allowedPaths.filter(isForbiddenCorrectionPath);
  if (forbiddenPaths.length > 0) {
    return {
      ok: false,
      reason: 'allowed_fix_paths_forbidden',
      packet_path: normalizedPlan,
      forbidden_paths: forbiddenPaths
    };
  }
  const symlinkPaths = [];
  for (const entry of allowedPaths) {
    if (await hasSymlinkTraversal(targetDir, entry)) symlinkPaths.push(entry);
  }
  if (symlinkPaths.length > 0) {
    return {
      ok: false,
      reason: 'allowed_fix_paths_symlink_forbidden',
      packet_path: normalizedPlan,
      symlink_paths: symlinkPaths
    };
  }
  const behaviorPaths = allowedPaths.filter((entry) => !isSupportPath(entry));
  if (allowedPaths.length > MAX_TOTAL_PATHS || behaviorPaths.length > MAX_BEHAVIOR_PATHS) {
    return {
      ok: false,
      reason: 'correction_path_budget_exceeded',
      packet_path: normalizedPlan,
      total_paths: allowedPaths.length,
      behavior_paths: behaviorPaths.length,
      max_total_paths: MAX_TOTAL_PATHS,
      max_behavior_paths: MAX_BEHAVIOR_PATHS
    };
  }

  return {
    ok: true,
    applicable: true,
    packet_path: normalizedPlan,
    packet_digest: crypto.createHash('sha256').update(raw).digest('hex'),
    allowed_fix_paths: allowedPaths,
    total_paths: allowedPaths.length,
    behavior_paths: behaviorPaths.length
  };
}

async function runGit(targetDir, args) {
  const { stdout } = await execFileAsync('git', args, {
    cwd: targetDir,
    windowsHide: true,
    timeout: 10000,
    maxBuffer: 1024 * 1024 * 10
  });
  return stdout;
}

async function hashWorkingPath(targetDir, relPath) {
  const absolute = path.resolve(targetDir, relPath);
  try {
    const stat = await fs.lstat(absolute);
    if (stat.isDirectory()) return null;
    if (stat.isSymbolicLink()) {
      const target = await fs.readlink(absolute);
      return crypto.createHash('sha256').update(`symlink:${target}`).digest('hex');
    }
    const content = await fs.readFile(absolute);
    return crypto.createHash('sha256').update(content).digest('hex');
  } catch {
    return null;
  }
}

async function readWorktree(targetDir) {
  try {
    const inside = (await runGit(targetDir, ['rev-parse', '--is-inside-work-tree'])).trim();
    if (inside !== 'true') return { ok: false, reason: 'git_worktree_required' };
    let head = null;
    try {
      head = (await runGit(targetDir, ['rev-parse', 'HEAD'])).trim() || null;
    } catch {
      head = null;
    }
    const entries = parsePorcelain(await runGit(targetDir, ['status', '--porcelain', '-uall']));
    const paths = [...new Set(entries.map((entry) => normalizeRelPath(entry.path)).filter(Boolean))];
    const hashes = {};
    for (const relPath of paths) {
      hashes[relPath] = await hashWorkingPath(targetDir, relPath);
    }
    return { ok: true, head, paths, hashes };
  } catch {
    return { ok: false, reason: 'git_worktree_required' };
  }
}

async function captureCorrectionBaseline(targetDir) {
  const snapshot = await readWorktree(targetDir);
  if (!snapshot.ok) return snapshot;
  return {
    ok: true,
    baseline: {
      captured_at: new Date().toISOString(),
      head: snapshot.head,
      dirty_paths: snapshot.paths,
      dirty_hashes: snapshot.hashes
    }
  };
}

async function verifyCorrectionChanges(targetDir, correctionScope, statePath) {
  if (!correctionScope?.baseline) {
    return { ok: false, reason: 'correction_baseline_missing', violations: [] };
  }

  const packet = await inspectCorrectionPacket(
    targetDir,
    correctionScope.packet_path,
    correctionScope.source
  );
  if (!packet.ok) return { ...packet, violations: [] };
  if (!samePaths(packet.allowed_fix_paths, correctionScope.allowed_fix_paths)) {
    return {
      ok: false,
      reason: 'allowed_fix_paths_changed',
      expected_paths: correctionScope.allowed_fix_paths,
      actual_paths: packet.allowed_fix_paths,
      violations: []
    };
  }

  const current = await readWorktree(targetDir);
  if (!current.ok) return { ...current, violations: [] };
  if (current.head !== correctionScope.baseline.head) {
    return {
      ok: false,
      reason: 'correction_head_changed',
      expected_head: correctionScope.baseline.head,
      actual_head: current.head,
      violations: []
    };
  }

  const baselinePaths = new Set(correctionScope.baseline.dirty_paths || []);
  const currentPaths = new Set(current.paths || []);
  const candidates = new Set([...baselinePaths, ...currentPaths]);
  const changedPaths = [];
  for (const relPath of candidates) {
    const wasDirty = baselinePaths.has(relPath);
    const isDirty = currentPaths.has(relPath);
    if (wasDirty !== isDirty) {
      changedPaths.push(relPath);
      continue;
    }
    if (
      wasDirty
      && correctionScope.baseline.dirty_hashes?.[relPath] !== current.hashes[relPath]
    ) {
      changedPaths.push(relPath);
    }
  }

  const allowed = new Set(correctionScope.allowed_fix_paths || []);
  const ignored = new Set([
    normalizeRelPath(correctionScope.packet_path),
    normalizeRelPath(statePath)
  ]);
  const relevantChanges = changedPaths.filter((entry) => !ignored.has(entry));
  const violations = relevantChanges.filter((entry) => !allowed.has(entry));
  return {
    ok: violations.length === 0,
    reason: violations.length === 0 ? null : 'correction_scope_violation',
    changed_paths: relevantChanges,
    allowed_fix_paths: [...allowed],
    violations
  };
}

module.exports = {
  MAX_TOTAL_PATHS,
  MAX_BEHAVIOR_PATHS,
  SPECIALIST_AGENTS,
  inspectCorrectionPacket,
  captureCorrectionBaseline,
  verifyCorrectionChanges
};
