'use strict';

// Memory Reflect Engine
//
// Deterministic core for the living-memory feature. Decides whether a session
// is "relevant" enough to trigger a bootstrap refresh, builds the manifest
// the in-harness agent will consume, and validates the agent's output.
//
// No LLM calls, no network. Pure I/O on git, filesystem and the project's
// bootstrap dir. See `.aioson/context/architecture-living-memory.md` §5.1.

const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');

const execFileAsync = promisify(execFile);

const BOOTSTRAP_FILES = ['what-is.md', 'how-it-works.md', 'what-it-does.md', 'current-state.md'];
const DEFAULT_GIT_RANGE = 'HEAD~3..HEAD';
const VOLUME_FILES_THRESHOLD = 10;
const VOLUME_LINES_THRESHOLD = 200;

// Heuristic patterns (anchored by path segment, not extension).
const PATTERN_ROUTES = /(^|\/)(routes|controllers)\//;
const PATTERN_NEXT_API = /(^|\/)(pages|app)\/api\//;
const PATTERN_MODELS = /(^|\/)(models|migrations)\//;
const PATTERN_PRISMA = /(^|\/)prisma\/schema\.prisma$/;
const PATTERN_LARAVEL_MODELS = /(^|\/)app\/Models\//;
const PATTERN_PRD = /\.aioson\/context\/prd-[^/]+\.md$/;
const PATTERN_REQUIREMENTS = /\.aioson\/context\/requirements-[^/]+\.md$/;
const PATTERN_FEATURES = /\.aioson\/context\/features\.md$/;
const PATTERN_CURRENT_STATE = /\.aioson\/context\/bootstrap\/current-state\.md$/;

function bootstrapDir(targetDir) {
  return path.join(targetDir, '.aioson', 'context', 'bootstrap');
}

function runtimeDir(targetDir) {
  return path.join(targetDir, '.aioson', 'runtime');
}

async function readFileOrEmpty(filePath) {
  try {
    return await fs.readFile(filePath, 'utf8');
  } catch {
    return '';
  }
}

async function readBootstrapSnapshot(targetDir) {
  const dir = bootstrapDir(targetDir);
  const snapshot = {};
  for (const name of BOOTSTRAP_FILES) {
    snapshot[name] = await readFileOrEmpty(path.join(dir, name));
  }
  return snapshot;
}

function hashSnapshot(snapshot) {
  const hash = crypto.createHash('sha256');
  for (const name of BOOTSTRAP_FILES) {
    hash.update(name);
    hash.update('\0');
    hash.update(snapshot[name] || '');
    hash.update('\0');
  }
  return hash.digest('hex');
}

async function runGit(targetDir, args) {
  try {
    const { stdout } = await execFileAsync('git', args, { cwd: targetDir, maxBuffer: 4 * 1024 * 1024 });
    return stdout;
  } catch {
    return '';
  }
}

async function readChangedFiles(targetDir, gitRange) {
  const range = gitRange || DEFAULT_GIT_RANGE;
  const stdout = await runGit(targetDir, ['diff', '--name-only', range]);
  const files = stdout.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (files.length > 0) return files;
  // Fallback: uncommitted changes vs HEAD (useful for fresh sessions).
  const fallback = await runGit(targetDir, ['diff', '--name-only', 'HEAD']);
  return fallback.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
}

async function readDiffSummary(targetDir, gitRange) {
  const range = gitRange || DEFAULT_GIT_RANGE;
  const stdout = await runGit(targetDir, ['diff', '--shortstat', range]);
  const trimmed = stdout.trim();
  if (trimmed) return trimmed;
  return (await runGit(targetDir, ['diff', '--shortstat', 'HEAD'])).trim();
}

function parseShortstat(line) {
  const filesMatch = line.match(/(\d+)\s+files?\s+changed/);
  const insMatch = line.match(/(\d+)\s+insertions?/);
  const delMatch = line.match(/(\d+)\s+deletions?/);
  return {
    files: filesMatch ? Number(filesMatch[1]) : 0,
    insertions: insMatch ? Number(insMatch[1]) : 0,
    deletions: delMatch ? Number(delMatch[1]) : 0
  };
}

function classifyFiles(files) {
  const signals = {
    routes: [],
    api: [],
    models: [],
    prisma: [],
    laravelModels: [],
    prd: [],
    requirements: [],
    features: false,
    currentState: false
  };
  for (const f of files) {
    if (PATTERN_ROUTES.test(f)) signals.routes.push(f);
    if (PATTERN_NEXT_API.test(f)) signals.api.push(f);
    if (PATTERN_MODELS.test(f)) signals.models.push(f);
    if (PATTERN_PRISMA.test(f)) signals.prisma.push(f);
    if (PATTERN_LARAVEL_MODELS.test(f)) signals.laravelModels.push(f);
    if (PATTERN_PRD.test(f)) signals.prd.push(f);
    if (PATTERN_REQUIREMENTS.test(f)) signals.requirements.push(f);
    if (PATTERN_FEATURES.test(f)) signals.features = true;
    if (PATTERN_CURRENT_STATE.test(f)) signals.currentState = true;
  }
  return signals;
}

function buildReasons(signals, shortstat) {
  const reasons = [];
  if (signals.routes.length > 0) reasons.push(`routes/controllers touched (${signals.routes.length} files)`);
  if (signals.api.length > 0) reasons.push(`api handlers touched (${signals.api.length} files)`);
  if (signals.models.length > 0) reasons.push(`models/migrations touched (${signals.models.length} files)`);
  if (signals.prisma.length > 0) reasons.push('prisma/schema.prisma changed');
  if (signals.laravelModels.length > 0) reasons.push(`app/Models touched (${signals.laravelModels.length} files)`);
  if (signals.prd.length > 0) reasons.push(`prd-*.md changed (${signals.prd.length})`);
  if (signals.requirements.length > 0) reasons.push(`requirements-*.md changed (${signals.requirements.length})`);
  if (signals.features) reasons.push('features.md changed');
  if (signals.currentState) reasons.push('bootstrap/current-state.md changed');
  if (shortstat.files >= VOLUME_FILES_THRESHOLD && (shortstat.insertions + shortstat.deletions) >= VOLUME_LINES_THRESHOLD) {
    reasons.push(`high volume: ${shortstat.files} files, ${shortstat.insertions + shortstat.deletions} lines`);
  }
  return reasons;
}

async function bootstrapExists(targetDir) {
  try {
    const stat = await fs.stat(bootstrapDir(targetDir));
    return stat.isDirectory();
  } catch {
    return false;
  }
}

/**
 * Evaluate whether a session warrants a bootstrap refresh.
 *
 * @param {string} targetDir absolute project root
 * @param {object} [options]
 * @param {string} [options.agent] agent slug that triggered the call (informational)
 * @param {string} [options.gitRange] git range, default HEAD~3..HEAD
 * @returns {Promise<{verdict:'relevant'|'skip',reasons:string[],signals:object,shortstat:object,bootstrapPresent:boolean,changedFiles:string[]}>}
 */
async function evaluate(targetDir, options = {}) {
  const present = await bootstrapExists(targetDir);
  const files = await readChangedFiles(targetDir, options.gitRange);
  const shortstatLine = await readDiffSummary(targetDir, options.gitRange);
  const shortstat = parseShortstat(shortstatLine);
  const signals = classifyFiles(files);
  const reasons = buildReasons(signals, shortstat);

  const verdict = reasons.length > 0 ? 'relevant' : 'skip';
  return {
    verdict,
    reasons,
    signals,
    shortstat,
    bootstrapPresent: present,
    changedFiles: files,
    gitRange: options.gitRange || DEFAULT_GIT_RANGE,
    agent: options.agent || null
  };
}

function chooseTargetsFromSignals(signals) {
  const targets = new Set();
  if (signals.routes.length || signals.api.length || signals.models.length ||
      signals.prisma.length || signals.laravelModels.length) {
    targets.add('how-it-works.md');
    targets.add('current-state.md');
  }
  if (signals.prd.length || signals.features || signals.requirements.length) {
    targets.add('what-it-does.md');
    targets.add('current-state.md');
  }
  if (signals.currentState) {
    targets.add('current-state.md');
  }
  if (targets.size === 0) targets.add('current-state.md');
  return [...targets];
}

/**
 * Build the manifest the in-harness agent consumes to perform reflection.
 *
 * @param {object} params
 * @param {string} params.targetDir
 * @param {string} params.agent
 * @param {object} params.evaluation result of `evaluate()`
 * @param {string} [params.sessionId]
 * @returns {Promise<object>} reflect-prompt manifest
 */
async function buildPrompt({ targetDir, agent, evaluation, sessionId }) {
  const snapshot = await readBootstrapSnapshot(targetDir);
  const snapshotHash = hashSnapshot(snapshot);
  const targets = chooseTargetsFromSignals(evaluation.signals);
  const diffSummary = `${evaluation.shortstat.files} files, +${evaluation.shortstat.insertions}/-${evaluation.shortstat.deletions}`;

  return {
    version: 1,
    session_id: sessionId || `${agent || 'agent'}-${new Date().toISOString()}`,
    trigger_agent: agent || null,
    git_range: evaluation.gitRange,
    heuristic_verdict: evaluation.verdict,
    heuristic_reasons: evaluation.reasons,
    targets,
    current_bootstrap_snapshot: snapshot,
    snapshot_hash: snapshotHash,
    diff_summary: diffSummary,
    changed_files: evaluation.changedFiles,
    instructions: buildInstructions(targets),
    validation_rules: {
      must_have_frontmatter: true,
      must_update_generated_at: true,
      must_diff_content: true,
      allowed_paths: targets.map((name) => `.aioson/context/bootstrap/${name}`)
    },
    generated_at: new Date().toISOString()
  };
}

function buildInstructions(targets) {
  const names = targets.map((t) => `bootstrap/${t}`).join(', ');
  const parts = [
    `Edit only: ${names}.`,
    'Remove obsolete entries. Add new capabilities. Preserve YAML frontmatter.',
    'Update the `generated_at` field in each touched file.'
  ];
  if (targets.includes('current-state.md')) {
    // Tag entries so the feature:close / memory:trim rollup can attribute and
    // date them (agent-loading-contract P0).
    parts.push('In current-state.md, prefix each new entry under "## What the system already has" with `[{feature-slug} · {YYYY-MM-DD}]`.');
  }
  parts.push('When done, write the result via `aioson memory:reflect-commit` (do not edit other files).');
  return parts.join(' ');
}

function hasFrontmatter(text) {
  return /^---\s*\n[\s\S]*?\n---\s*(\n|$)/.test(String(text || ''));
}

function extractGeneratedAt(text) {
  const match = String(text || '').match(/generated_at\s*:\s*["']?([0-9T:\-.Z+]+)["']?/);
  return match ? match[1] : null;
}

/**
 * Validate the agent's reflect output before persisting.
 *
 * @param {object} params
 * @param {object} params.manifest the reflect-prompt manifest produced by buildPrompt
 * @param {object} params.files map of relative path → new content
 * @param {object} [params.currentSnapshot] map of bootstrap filename → current on-disk content
 * @returns {{ok:boolean, errors:string[]}}
 */
function validate({ manifest, files, currentSnapshot }) {
  const errors = [];
  if (!manifest || typeof manifest !== 'object') {
    return { ok: false, errors: ['manifest missing or invalid'] };
  }
  if (!files || typeof files !== 'object') {
    return { ok: false, errors: ['no files to commit'] };
  }

  // SECURITY: path containment is fail-closed. A manifest without
  // allowed_paths cannot grant arbitrary writes — reject up front.
  const allowedList = manifest.validation_rules?.allowed_paths;
  if (!Array.isArray(allowedList) || allowedList.length === 0) {
    return { ok: false, errors: ['manifest validation_rules.allowed_paths is missing or empty'] };
  }
  const allowed = new Set(allowedList);
  const filePaths = Object.keys(files);
  if (filePaths.length === 0) {
    errors.push('files map is empty');
  }
  for (const p of filePaths) {
    // Reject absolute paths and parent-traversal segments explicitly so a
    // crafted allowed_paths entry can't be matched by a different physical
    // path.
    if (path.isAbsolute(p) || p.split(/[\\/]/).includes('..')) {
      errors.push(`file outside allowed_paths: ${p}`);
      continue;
    }
    if (!allowed.has(p)) {
      errors.push(`file outside allowed_paths: ${p}`);
    }
  }

  const rules = manifest.validation_rules || {};
  for (const [filePath, content] of Object.entries(files)) {
    const name = path.posix.basename(filePath);
    const original = (manifest.current_bootstrap_snapshot && manifest.current_bootstrap_snapshot[name]) || '';

    if (rules.must_have_frontmatter && !hasFrontmatter(content)) {
      errors.push(`${filePath}: missing YAML frontmatter`);
    }
    if (rules.must_update_generated_at) {
      const next = extractGeneratedAt(content);
      const prev = extractGeneratedAt(original);
      if (!next) {
        errors.push(`${filePath}: missing generated_at`);
      } else if (prev && next === prev) {
        errors.push(`${filePath}: generated_at not updated`);
      }
    }
    if (rules.must_diff_content && original && content === original) {
      errors.push(`${filePath}: content unchanged`);
    }
  }

  if (currentSnapshot && manifest.snapshot_hash) {
    const currentHash = hashSnapshot({
      'what-is.md': currentSnapshot['what-is.md'] || '',
      'how-it-works.md': currentSnapshot['how-it-works.md'] || '',
      'what-it-does.md': currentSnapshot['what-it-does.md'] || '',
      'current-state.md': currentSnapshot['current-state.md'] || ''
    });
    if (currentHash !== manifest.snapshot_hash) {
      errors.push('snapshot_hash mismatch: bootstrap changed between prepare and commit');
    }
  }

  return { ok: errors.length === 0, errors };
}

module.exports = {
  BOOTSTRAP_FILES,
  DEFAULT_GIT_RANGE,
  evaluate,
  buildPrompt,
  validate,
  // exported for tests / reuse
  hashSnapshot,
  readBootstrapSnapshot,
  classifyFiles,
  parseShortstat,
  bootstrapExists
};
