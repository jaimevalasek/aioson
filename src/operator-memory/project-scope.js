'use strict';

/**
 * operator-memory — the project scope of a standing decision.
 *
 * Operator memory follows the person into every project, so a decision said
 * about one project must not silently govern the others. A promoted decision
 * starts scoped to the project it was said in. It becomes operator-wide when
 * the same signal is detected in a second distinct project, or when its quote
 * names that scope itself ("em todos os meus projetos", "in every project").
 * A bare "sempre" / "always" is not a scope: it is how corrections are phrased.
 * Breadth counts distinct projects, never repetitions inside one, so a single
 * noisy project cannot entrench a rule everywhere.
 *
 * Decisions written before the field existed carry no scope and stay
 * operator-wide, exactly as they were loaded before.
 *
 * A project is identified by its git remote (upstream, else origin; scheme,
 * credentials and `.git` stripped), so two checkouts of one repository are one
 * project; without a remote, by its resolved root path. Only a short hash of
 * that identity is stored, plus a display name.
 */

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { resolveProjectRootOrSelf } = require('../lib/project-root');

const SCOPE_OPERATOR = 'operator';
const SCOPE_PROJECT = 'project';
const VALID_SCOPES = [SCOPE_OPERATOR, SCOPE_PROJECT];
const WIDEN_AT_PROJECTS = 2;
const MAX_PROJECTS = 16;
const MAX_GIT_WALK = 32;

// Matched on folded text (lowercase, no diacritics). Each pattern names more
// than one project; "todo o projeto" / "the whole project" stay local.
const CROSS_PROJECT_MARKERS = [
  /\ball\s+(?:of\s+)?(?:my|our|the)?\s*(?:projects|repos|repositories|codebases)\b/,
  /\b(?:every|each|any)\s+(?:single\s+)?(?:project|repo|repository|codebase)\b/,
  /\bacross\s+(?:all\s+)?(?:my\s+|our\s+)?(?:projects|repos|repositories|codebases)\b/,
  /\bother\s+projects\b/,
  /\bregardless\s+of\s+(?:the\s+)?project\b/,
  /\b(?:todos|todas)\s+(?:os\s+|as\s+)?(?:meus\s+|minhas\s+|nossos\s+|nossas\s+)?(?:projetos|repositorios|repos)\b/,
  /\b(?:todo|qualquer|cada)\s+(?:projeto|repositorio|repo)\b/,
  /\boutros\s+projetos\b/,
  /\b(?:independente(?:mente)?\s+do|seja\s+qual\s+for\s+o)\s+projeto\b/,
  /\btodos\s+(?:los\s+)?(?:mis\s+|nuestros\s+)?(?:proyectos|repositorios)\b/,
  /\b(?:cualquier|cada)\s+(?:proyecto|repositorio)\b/,
  /\botros\s+proyectos\b/,
  /\bsin\s+importar\s+el\s+proyecto\b/
];

function foldText(text) {
  return String(text || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
}

/** True when any text explicitly says the decision applies beyond one project. */
function namesCrossProjectScope(...texts) {
  const folded = foldText(texts.flat().filter(Boolean).join('\n'));
  if (!folded) return false;
  return CROSS_PROJECT_MARKERS.some((re) => re.test(folded));
}

function normalizeRemoteUrl(raw) {
  let url = String(raw || '').trim();
  if (!url || /^file:/i.test(url)) return null;
  const scheme = url.match(/^[a-z][a-z0-9+.-]*:\/\//i);
  if (scheme) {
    url = url.slice(scheme[0].length);
    const slash = url.indexOf('/');
    const authority = slash === -1 ? url : url.slice(0, slash);
    const rest = slash === -1 ? '' : url.slice(slash);
    const host = authority.slice(authority.lastIndexOf('@') + 1).replace(/:\d+$/, '');
    url = host + rest;
  } else {
    // scp-like `user@host:owner/repo` — a single-letter host is a Windows drive.
    const scp = url.match(/^(?:[^@/\\]+@)?([^:/\\]{2,}):(.+)$/);
    if (!scp) return null;
    url = `${scp[1]}/${scp[2]}`;
  }
  url = url.toLowerCase().replace(/\\/g, '/').replace(/\/{2,}/g, '/').replace(/\/+$/, '').replace(/\.git$/, '');
  return url.includes('/') ? url : null;
}

function findGitConfig(startDir) {
  let dir = path.resolve(startDir);
  for (let depth = 0; depth < MAX_GIT_WALK; depth += 1) {
    const dotGit = path.join(dir, '.git');
    let stat = null;
    try { stat = fs.statSync(dotGit); } catch { stat = null; }
    if (stat && stat.isDirectory()) return path.join(dotGit, 'config');
    if (stat && stat.isFile()) {
      // Linked worktree: `.git` points at its gitdir, whose `commondir` holds the config.
      try {
        const pointer = fs.readFileSync(dotGit, 'utf8').match(/^gitdir:\s*(.+)$/m);
        if (!pointer) return null;
        const gitDir = path.resolve(dir, pointer[1].trim());
        let commonDir = gitDir;
        try {
          commonDir = path.resolve(gitDir, fs.readFileSync(path.join(gitDir, 'commondir'), 'utf8').trim());
        } catch { /* not a worktree gitdir — its own config */ }
        return path.join(commonDir, 'config');
      } catch {
        return null;
      }
    }
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
  return null;
}

function readRemoteUrls(configPath) {
  let text = '';
  try { text = fs.readFileSync(configPath, 'utf8'); } catch { return {}; }
  const remotes = {};
  let current = null;
  for (const line of text.split(/\r?\n/)) {
    const section = line.match(/^\s*\[\s*remote\s+"([^"]+)"\s*\]/);
    if (section) { current = section[1]; continue; }
    if (/^\s*\[/.test(line)) { current = null; continue; }
    const url = current && line.match(/^\s*url\s*=\s*(.+?)\s*$/);
    if (url && !remotes[current]) remotes[current] = url[1];
  }
  return remotes;
}

function displayName(text) {
  const name = String(text || '').split(/[\\/]/).filter(Boolean).pop() || 'project';
  return name.replace(/[^A-Za-z0-9._-]+/g, '-').slice(0, 64) || 'project';
}

/**
 * Identify the project a command runs in.
 * @param {string} [startDir] defaults to the working directory
 * @returns {{key: string, name: string, source: 'remote'|'path'}}
 */
function resolveProjectScope(startDir = process.cwd()) {
  const root = resolveProjectRootOrSelf(startDir);
  const configPath = findGitConfig(root);
  const remotes = configPath ? readRemoteUrls(configPath) : {};
  for (const remote of ['upstream', 'origin']) {
    const normalized = normalizeRemoteUrl(remotes[remote]);
    if (normalized) {
      return { key: hashKey(`remote:${normalized}`), name: displayName(normalized), source: 'remote' };
    }
  }
  let resolved = path.resolve(root).replace(/\\/g, '/');
  if (process.platform === 'win32') resolved = resolved.toLowerCase();
  return { key: hashKey(`path:${resolved}`), name: displayName(root), source: 'path' };
}

// The `p` prefix keeps a key from ever reading as a number in the hand-rolled
// frontmatter parsers, which turn an all-digit scalar into a Number.
function hashKey(identity) {
  return `p${crypto.createHash('sha256').update(identity).digest('hex').slice(0, 16)}`;
}

/** Frontmatter lists are stored as one comma-separated scalar. */
function parseList(value) {
  if (Array.isArray(value)) return value.map(String).filter(Boolean);
  return String(value || '').split(',').map((v) => v.trim()).filter(Boolean);
}

/** Add a project to parallel key/name lists, keeping first-seen order and the cap. */
function addProject(keys, names, project) {
  const nextKeys = parseList(keys);
  const nextNames = parseList(names);
  if (project && project.key && !nextKeys.includes(project.key) && nextKeys.length < MAX_PROJECTS) {
    nextKeys.push(project.key);
    nextNames.push(project.name || 'project');
  }
  return { keys: nextKeys, names: nextNames };
}

/**
 * The scope a decision should carry, from the projects it was detected in and
 * whether its words name a cross-project scope.
 */
function decideScope({ projectKeys = [], explicit = false, requested = null } = {}) {
  if (requested === SCOPE_OPERATOR) return SCOPE_OPERATOR;
  if (requested === SCOPE_PROJECT) return parseList(projectKeys).length > 0 ? SCOPE_PROJECT : SCOPE_OPERATOR;
  if (explicit) return SCOPE_OPERATOR;
  if (parseList(projectKeys).length >= WIDEN_AT_PROJECTS) return SCOPE_OPERATOR;
  if (parseList(projectKeys).length === 0) return SCOPE_OPERATOR;
  return SCOPE_PROJECT;
}

/** True when a decision applies in the project identified by `projectKey`. */
function appliesInProject(decision, projectKey) {
  if (!decision || decision.scope !== SCOPE_PROJECT) return true;
  return parseList(decision.projects).includes(projectKey);
}

module.exports = {
  resolveProjectScope,
  namesCrossProjectScope,
  normalizeRemoteUrl,
  decideScope,
  appliesInProject,
  addProject,
  parseList,
  SCOPE_OPERATOR,
  SCOPE_PROJECT,
  VALID_SCOPES,
  WIDEN_AT_PROJECTS,
  MAX_PROJECTS,
  CROSS_PROJECT_MARKERS
};
