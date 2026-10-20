'use strict';

/**
 * operator-memory — the project scope of a standing decision.
 *
 * Operator memory follows the person into every project, so a decision said
 * about one project must not silently govern the others. A promoted decision
 * starts scoped to the project it was said in. It becomes operator-wide when
 * the same signal is detected in a second distinct project, or when the user's
 * own words name that scope ("em todos os meus projetos", "in every project").
 * A bare "sempre" / "always" is not a scope: it is how corrections are phrased.
 * Breadth counts distinct projects, never repetitions inside one, so a single
 * noisy project cannot entrench a rule everywhere.
 *
 * Decisions written before the field existed carry no scope and stay
 * operator-wide, exactly as they were loaded before.
 *
 * A checkout answers to a SET of identities: its root path, its own remote
 * (`origin`, else the only remote — `upstream` names the parent a fork or a
 * starter pulls from, shared by every project made from it) and the
 * repository's common git dir, shared by its worktrees; the last two carry the
 * project's path inside the checkout, so two projects of one repository stay
 * two. A decision applies wherever any key it recorded matches. A re-detection
 * that matches any key adds the checkout's new keys and is not breadth, so the
 * first `git remote add`, a new `upstream` or a worktree never turns one
 * project into two; breadth counts disjoint identity sets. Only short hashes
 * of the identities are stored, plus a display name.
 */

const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { escapeDataTree, resolveProjectRoot } = require('../lib/project-root');

const SCOPE_OPERATOR = 'operator';
const SCOPE_PROJECT = 'project';
const VALID_SCOPES = [SCOPE_OPERATOR, SCOPE_PROJECT];
const WIDEN_AT_PROJECTS = 2;
const MAX_PROJECTS = 16;
const MAX_KEYS_PER_PROJECT = 12;
const MAX_GIT_WALK = 32;

// Matched on folded text (lowercase, no diacritics). Each pattern names every
// project inclusively. "todo o projeto" / "the whole project" stay local, and
// so do phrasings that mention other projects by contrast or distribution
// ("unlike other projects, here…", "each project has its own…"): they describe
// a local rule, and widening on them is the leak this scope exists to stop.
// Erring toward the project is recoverable (a repeat in a second project
// widens); erring toward the operator is not.
const CROSS_PROJECT_MARKERS = [
  /\ball\s+(?:of\s+)?(?:my|our|the)?\s*(?:projects|repos|repositories|codebases)\b/,
  /\b(?:every|any)\s+(?:single\s+)?(?:project|repo|repository|codebase)\b/,
  /\bacross\s+(?:all\s+)?(?:my\s+|our\s+)?(?:projects|repos|repositories|codebases)\b/,
  /\bregardless\s+of\s+(?:the\s+)?project\b/,
  /\b(?:todos|todas)\s+(?:os\s+|as\s+)?(?:meus\s+|minhas\s+|nossos\s+|nossas\s+)?(?:projetos|repositorios|repos)\b/,
  /\b(?:todo|qualquer)\s+(?:projeto|repositorio|repo)\b/,
  /\b(?:independente(?:mente)?\s+do|seja\s+qual\s+for\s+o)\s+projeto\b/,
  /\btodos\s+(?:los\s+)?(?:mis\s+|nuestros\s+)?(?:proyectos|repositorios|repos)\b/,
  /\bcualquier\s+(?:proyecto|repositorio)\b/,
  /\bsin\s+importar\s+el\s+proyecto\b/,
  /\b(?:nao|no)\s+importa\s+(?:o|el|qual|cual|que)\s+(?:projeto|proyecto|repositorio|repo)\b/,
  /\bno\s+matter\s+(?:the|which|what)\s+(?:project|repo|repository|codebase)\b/
];

// A marker only widens when it is the scope the sentence asserts. Not when a
// negation in its own clause negates that scope: followed, modals, clitics or
// a copula allowed in between, by a scope verb or phrase ("não se aplica a
// todos os projetos", "doesn't apply to every project", "no es para todos mis
// proyectos", "não quero isso em todos"), or standing right before the marker
// or its preposition ("nem em todos", "not in every project", "no en todos").
// A negated action leaves the marker in force: "nunca use yarn em qualquer
// projeto", "never push to main in any repo" and "não commitar sem pedir em
// todos os projetos" are prohibitions said for every project. Not either as the
// subject of a distributive possessive ("every project uses its own…", "todo
// projeto tem sua…"), nor when the same words point at one project ("aqui",
// "here", "this one", "neste", "deste", "só este"). A clause ends at punctuation
// or at "mas"/"but"/"pero": "não use yarn, em todos os projetos" widens.
const CLAUSE_BREAK = /[.;:!?,()\n\u2013\u2014]|\b(?:mas|porem|contudo|but|however|pero)\b/;
// Bare "no" reads as a negation only when what follows it does: in pt-BR it is
// "em + o" before a noun ("rode lint no CI em todos os projetos" widens).
const NEGATION_WORD = String.raw`(?:nao|nem|nunca|jamais|jamas|tampoco|ni|no|not|never|nor|cannot|[a-z]+n't|dont|doesnt|didnt|isnt|arent|wont|cant|shouldnt|wouldnt|couldnt|mustnt)`;
// Between the negation and what it negates: clitics, modals, a copula, and a
// "want" aimed at the rule itself ("não quero isso", "I don't want this").
const SCOPE_FILLER = String.raw`(?:se|me|te|lhe|lo|la|le|deve|devem|deveria|pode|podem|poderia|precisa|precisam|vai|vao|tem\s+que|e|eh|ser|estar|should|must|can|could|would|will|may|might|need\s+to|needs\s+to|has\s+to|have\s+to|be|debe|deben|deberia|puede|pueden|va|(?:quero|quer|queremos|want|wants|quiero|quiere)\s+(?:isso|isto|this|that|it|esto|eso))`;
const SCOPE_VERB = String.raw`(?:aplica|aplicam|aplicar|aplican|vale|valem|valer|valen|serve|servem|servir|sirve|sirven|generaliza|generalizam|generalizar|generalize|generalizes|generalice|conta|contam|contar|cuenta|cuentan|estende|estendem|estender|extend|extends|apply|applies|hold|holds|count|counts|meant|go\s+for|goes\s+for|is\s+for|e\s+para|e\s+pra|es\s+para|(?:is\s+|e\s+|es\s+)?(?:a\s+|uma\s+|una\s+)?(?:rule|regra|regla))`;
const SCOPE_PREPOSITION = String.raw`(?:em|para|pra|a|ao|de|do|da|en|in|on|for|to|at|across)`;
const NEGATED_SCOPE = new RegExp(String.raw`(?:^|\s)${NEGATION_WORD}(?:\s+${SCOPE_FILLER})*(?:\s+${SCOPE_VERB}(?![a-z])|(?:\s+${SCOPE_PREPOSITION})?\s*$)`);
const DISTRIBUTIVE_AFTER = /^(?:\s+\S+){0,3}?\s+(?:(?:its|their)\s+own|(?:tem|teem)\s+(?:a\s+|o\s+|as\s+|os\s+)?(?:sua|seu|suas|seus|propria|proprio)|(?:sua|seu|suas|seus)\s+propri[oa]s?|tienen?\s+(?:su|sus)|(?:su|sus)\s+propi[oa]s?)\b/;
const ONE_PROJECT_HERE = /\b(?:aqui|here|neste|nesta|nesse|nessa|deste|desse|daqui)\b|\bthis\s+(?:one|repo|repository|project|codebase)\b|\b(?:so|apenas|somente|only|just|solo)\s+(?:este|esse|esta|essa|this)\b|\b(?:este|esse)\s+(?:projeto|repo|repositorio|proyecto)\b|\ben\s+este\b/;
// Curly apostrophes (U+2018, U+2019, U+02BC) read as `'`: "doesn’t" is "doesn't".
const CURLY_APOSTROPHES = new RegExp(`[${String.fromCharCode(0x2018, 0x2019, 0x02BC)}]`, 'g');

function foldText(text) {
  return String(text || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(CURLY_APOSTROPHES, "'")
    .toLowerCase();
}

/** True when a negation in the marker's own clause, before it, negates its scope. */
function negatedInClause(before) {
  return NEGATED_SCOPE.test(before.split(CLAUSE_BREAK).pop());
}

function assertsCrossProjectScope(text) {
  const folded = foldText(text);
  if (!folded || ONE_PROJECT_HERE.test(folded)) return false;
  return CROSS_PROJECT_MARKERS.some((marker) => {
    const re = new RegExp(marker.source, 'g');
    let match;
    while ((match = re.exec(folded)) !== null) {
      const after = folded.slice(match.index + match[0].length);
      if (!negatedInClause(folded.slice(0, match.index)) && !DISTRIBUTIVE_AFTER.test(after)) return true;
    }
    return false;
  });
}

/**
 * True when any of the user's words explicitly say the decision applies beyond
 * one project. Callers pass the user's quotes only — an agent's paraphrase
 * generalizes ("in any repo") and must never decide the scope.
 */
function namesCrossProjectScope(...texts) {
  return texts.flat().filter(Boolean).some(assertsCrossProjectScope);
}

// A remote as `host/path`: scheme, credentials, port, trailing slash and
// `.git` stripped, lowercased; null for a local path. Identities hashed before
// identity sets existed used exactly this (see `legacyKeysFor`), so it stays
// verbatim and the canonical forms are layered on top in `normalizeRemoteUrl`.
function remoteHostPath(raw) {
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

// One repository, one identity, whatever door it was cloned through.
function canonicalRemote(url) {
  const slash = url.indexOf('/');
  const host = url.slice(0, slash).replace(/^www\./, '').replace(/^ssh\.github\.com$/, 'github.com');
  const parts = url.slice(slash + 1).split('/');
  // Azure DevOps answers one repository at dev.azure.com/{org}/{project}/_git/{repo},
  // ssh.dev.azure.com/v3/{org}/{project}/{repo}, {org}.visualstudio.com/{project}/_git/{repo}
  // and vs-ssh.visualstudio.com/v3/{org}/{project}/{repo}.
  if ((host === 'ssh.dev.azure.com' || host === 'vs-ssh.visualstudio.com') && parts[0] === 'v3' && parts.length === 4) {
    return `dev.azure.com/${parts.slice(1).join('/')}`;
  }
  const org = host === 'dev.azure.com' ? parts.shift() : (host.match(/^([^.]+)\.visualstudio\.com$/) || [])[1];
  if (org) {
    const rest = parts.filter((part) => part !== 'defaultcollection');
    if (rest.length === 3 && rest[1] === '_git') return `dev.azure.com/${org}/${rest[0]}/${rest[2]}`;
    if (rest.length === 2 && rest[0] === '_git') return `dev.azure.com/${org}/${rest[1]}/${rest[1]}`;
    if (host === 'dev.azure.com') parts.unshift(org);
  }
  return `${host}/${parts.join('/')}`;
}

function normalizeRemoteUrl(raw) {
  // A query or fragment never names the repository and may carry a token.
  const hostPath = remoteHostPath(String(raw || '').trim().replace(/[?#].*$/, ''));
  return hostPath ? canonicalRemote(hostPath) : null;
}

function sameDir(left, right) {
  const a = path.resolve(left);
  const b = path.resolve(right);
  return process.platform === 'win32' ? a.toLowerCase() === b.toLowerCase() : a === b;
}

/**
 * The git checkout holding `startDir`: its root, its config and the common git
 * dir its worktrees share. The walk stops below the home directory — a home
 * versioned as dotfiles is not the repository of every project under it —
 * unless `stopAtHome` is false (the walk identities were first hashed with).
 */
function findGitCheckout(startDir, stopAtHome = true) {
  const home = stopAtHome ? os.homedir() : '';
  let dir = path.resolve(startDir);
  for (let depth = 0; depth < MAX_GIT_WALK; depth += 1) {
    if (depth > 0 && home && sameDir(dir, home)) return null;
    const dotGit = path.join(dir, '.git');
    let stat;
    try { stat = fs.statSync(dotGit); } catch { stat = null; }
    if (stat && stat.isDirectory()) return { root: dir, commonDir: dotGit, configPath: path.join(dotGit, 'config') };
    if (stat && stat.isFile()) return linkedCheckout(dir, dotGit);
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
  return null;
}

// Linked worktree (or submodule): `.git` is a file pointing at its gitdir,
// whose `commondir` holds the shared config.
function linkedCheckout(dir, dotGit) {
  try {
    const pointer = fs.readFileSync(dotGit, 'utf8').match(/^gitdir:\s*(.+)$/m);
    if (!pointer) return null;
    const gitDir = path.resolve(dir, pointer[1].trim());
    let commonDir = gitDir;
    try {
      commonDir = path.resolve(gitDir, fs.readFileSync(path.join(gitDir, 'commondir'), 'utf8').trim());
    } catch { /* not a worktree gitdir — its own config */ }
    return { root: dir, commonDir, configPath: path.join(commonDir, 'config') };
  } catch {
    return null;
  }
}

/** The raw `url` value of each remote (first one wins), as written in the config. */
function readRemoteUrls(configPath) {
  let text;
  try { text = fs.readFileSync(configPath, 'utf8'); } catch { return {}; }
  const remotes = {};
  let current = null;
  for (const line of text.split(/\r?\n/)) {
    const section = line.match(/^\s*\[\s*remote\s+"([^"]+)"\s*\]/i);
    if (section) { current = section[1]; continue; }
    if (/^\s*\[/.test(line)) { current = null; continue; }
    const url = current && line.match(/^\s*url\s*=\s*(.+?)\s*$/i);
    if (url && !remotes[current]) remotes[current] = url[1];
  }
  return remotes;
}

const CONFIG_ESCAPES = { n: '\n', t: '\t' };

/** A git config value as git reads it: quotes removed, escapes resolved, an inline `#`/`;` comment dropped. */
function configValue(raw) {
  const text = String(raw || '');
  let out = '';
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (ch === '\\' && i + 1 < text.length) {
      i += 1;
      out += CONFIG_ESCAPES[text[i]] || text[i];
    } else if (ch === '"') {
      quoted = !quoted;
    } else if (!quoted && /[#;]/.test(ch)) {
      break;
    } else {
      out += ch;
    }
  }
  return out.trim();
}

// `upstream` names the parent a fork or a starter pulls from: every project
// made from it carries the same one, so it never identifies this one.
function ownRemote(remotes) {
  const own = Object.keys(remotes).filter((name) => name !== 'upstream');
  if (own.includes('origin')) return remotes.origin;
  return own.length === 1 ? remotes[own[0]] : null;
}

function displayName(text) {
  const name = String(text || '').split(/[\\/]/).filter(Boolean).pop() || 'project';
  return name.replace(/[^A-Za-z0-9._-]+/g, '-').slice(0, 64) || 'project';
}

function foldPath(dir) {
  const resolved = path.resolve(dir).replace(/\\/g, '/');
  return process.platform === 'win32' ? resolved.toLowerCase() : resolved;
}

/**
 * Identify the project a command runs in.
 * @param {string} [startDir] defaults to the working directory
 * @returns {{key: string, keys: string[], legacyKeys: string[], name: string, source: 'remote'|'path', anchored: boolean}}
 *   `keys` is every identity this checkout answers to (the first is `key`);
 *   `legacyKeys` only match decisions recorded before identity sets;
 *   `anchored` is false when neither an AIOSON root nor a git checkout was found.
 */
function resolveProjectScope(startDir = process.cwd()) {
  const base = escapeDataTree(startDir);
  const aiosonRoot = resolveProjectRoot(base);
  const root = aiosonRoot || base;
  const checkout = findGitCheckout(root);
  const remotes = checkout ? readRemoteUrls(checkout.configPath) : {};
  const own = normalizeRemoteUrl(configValue(ownRemote(remotes)));
  const inside = checkout ? path.relative(checkout.root, root).replace(/\\/g, '/') : '';
  const sub = inside ? `#${process.platform === 'win32' ? inside.toLowerCase() : inside}` : '';

  const keys = [];
  if (own) keys.push(hashKey(`remote:${own}${sub}`));
  if (checkout) keys.push(hashKey(`gitdir:${foldPath(checkout.commonDir)}${sub}`));
  keys.push(hashKey(`path:${foldPath(root)}`));

  return {
    key: keys[0],
    keys,
    legacyKeys: legacyKeysFor(root, checkout, remotes).filter((key) => !keys.includes(key)),
    name: displayName(own && !sub ? own : root),
    source: own ? 'remote' : 'path',
    anchored: Boolean(aiosonRoot || checkout)
  };
}

// The key this checkout had before identity sets: `upstream` first, the raw
// config value, no path inside the checkout, the walk past the home dir.
function legacyKeysFor(root, checkout, remotes) {
  const legacyCheckout = checkout || findGitCheckout(root, false);
  const legacyRemotes = legacyCheckout === checkout ? remotes : readRemoteUrls(legacyCheckout ? legacyCheckout.configPath : '');
  const hostPath = remoteHostPath(legacyRemotes.upstream) || remoteHostPath(legacyRemotes.origin);
  return hostPath ? [hashKey(`remote:${hostPath}`)] : [];
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

/**
 * The disjoint identity sets a decision or proposal recorded, one per project
 * (`project_sets: 'k1+k2,k3'`). A record written before identity sets has only
 * `projects`, where every key was its own project.
 */
function projectSets(record) {
  const raw = record ? record.project_sets : null;
  const sets = (Array.isArray(raw) ? raw : parseList(raw))
    .map((set) => (Array.isArray(set) ? set : String(set).split('+')).map((key) => String(key).trim()).filter(Boolean))
    .filter((set) => set.length > 0);
  return sets.length > 0 ? sets : parseList(record && record.projects).map((key) => [key]);
}

function serializeProjectSets(sets) {
  return sets.map((set) => set.join('+')).join(',');
}

/**
 * Record `project` (from resolveProjectScope) in a record's identity sets. A
 * set sharing any key with the checkout is the same project: it absorbs the
 * checkout's keys — and any other set the checkout bridges — without counting
 * as breadth. Only a checkout no set knows adds a project, up to the cap.
 * Returns parallel `sets`/`names` plus the flat `keys` union.
 */
function recordProject(record, project) {
  let sets = projectSets(record);
  let names = parseList(record && record.project_names);
  while (names.length < sets.length) names.push('project');
  names = names.slice(0, sets.length);
  const own = project && Array.isArray(project.keys) ? project.keys.filter(Boolean) : [];
  if (own.length > 0) {
    const known = new Set(answersTo(project, record));
    const hits = sets.map((set, i) => (set.some((key) => known.has(key)) ? i : -1)).filter((i) => i !== -1);
    if (hits.length === 0) {
      if (sets.length < MAX_PROJECTS) {
        sets = [...sets, own];
        names = [...names, project.name || 'project'];
      }
    } else {
      const merged = [...new Set([...own, ...hits.flatMap((i) => sets[i])])].slice(0, MAX_KEYS_PER_PROJECT);
      const first = hits[0];
      sets = sets.map((set, i) => (i === first ? merged : set)).filter((set, i) => i === first || !hits.includes(i));
      names = names.filter((name, i) => i === first || !hits.includes(i));
    }
  }
  return { sets, names, keys: [...new Set(sets.flat())] };
}

/**
 * The scope a decision should carry, from the distinct projects it was
 * detected in (one entry each) and whether the user's words name a
 * cross-project scope.
 */
function decideScope({ projectKeys = [], explicit = false, requested = null } = {}) {
  if (requested === SCOPE_OPERATOR) return SCOPE_OPERATOR;
  if (requested === SCOPE_PROJECT) return parseList(projectKeys).length > 0 ? SCOPE_PROJECT : SCOPE_OPERATOR;
  if (explicit) return SCOPE_OPERATOR;
  if (parseList(projectKeys).length >= WIDEN_AT_PROJECTS) return SCOPE_OPERATOR;
  if (parseList(projectKeys).length === 0) return SCOPE_OPERATOR;
  return SCOPE_PROJECT;
}

/**
 * The keys `project` (a resolveProjectScope result, or a single key) answers to
 * for `record`: its own identities, plus the key 1.73.0 gave this checkout only
 * when the record was written before identity sets. A newer record never sees
 * the old key — a fork's or a client's is the upstream's remote, which is the
 * starter's own identity today.
 */
function answersTo(project, record) {
  if (typeof project === 'string') return [project];
  if (!project) return [];
  const legacy = parseList(record && record.project_sets).length === 0 ? (project.legacyKeys || []) : [];
  return [...(project.keys || []), ...legacy];
}

/**
 * True when a decision applies in `project` — a resolveProjectScope result,
 * matched on any key it answers to, or a single key.
 */
function appliesInProject(decision, project) {
  if (!decision || decision.scope !== SCOPE_PROJECT) return true;
  const recorded = new Set(projectSets(decision).flat());
  return answersTo(project, decision).some((key) => recorded.has(key));
}

module.exports = {
  resolveProjectScope,
  namesCrossProjectScope,
  normalizeRemoteUrl,
  configValue,
  decideScope,
  appliesInProject,
  recordProject,
  projectSets,
  serializeProjectSets,
  parseList,
  foldText,
  SCOPE_OPERATOR,
  SCOPE_PROJECT,
  VALID_SCOPES
};
