'use strict';

/**
 * Phase capsule — what a new context needs to start one phase, in one short text.
 *
 * A Dev that starts cold read the whole plan and PRD: 25 agents spent about 6
 * minutes each before their first write, and `dev:resume-data` gave them almost
 * nothing. Each one then wrote helpers the earlier phases had already written,
 * because nothing told it they existed. The capsule compiles the phase itself,
 * the PRD rows it cites, the plan's shared sections scoped to it, what the branch
 * already created, and the open process and risk observations of the feature.
 *
 * It writes nothing to the project unless the caller names a file.
 */

const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const { declarationOnLine, isIndexable, SOURCE_GLOBS } = require('./duplicate-declarations');
const { planSections } = require('./plan-document');

const CITED_ID = /\b[A-Z][A-Z0-9]{1,9}-[A-Za-z0-9]+(?:-[A-Za-z0-9]+)*\b/g;
const AC_ID = /^AC-/;
const TABLE_SEPARATOR = /^\s*\|[\s:|-]+\|\s*$/;
const PHASE_COLUMN = /^(?:phases?|fases?|etapas?)$/i;
const CAP_COLUMN = /^cap$/i;
const DROPPED_SECTION = /^handoff\b/i;
const OBSERVATION_KINDS = new Set(['process', 'risk']);
const MAX_NAMES_PER_FILE = 30;

function splitRow(line) {
  return String(line).trim().replace(/^\|/, '').replace(/\|$/, '').split(/(?<!\\)\|/).map((cell) => cell.trim());
}

function clean(cell) {
  return String(cell).replace(/[*`]/g, '').trim();
}

/** `3, 7`, `Phase 3`, `1-backend` and `3 a 7` all name their phases; `1-backend` names 1 alone. */
function phasesInCell(cell) {
  const text = clean(cell);
  const phases = new Set();
  for (const match of text.matchAll(/(\d+)\s*(?:-|–|—|a|to|até)\s*(\d+)/g)) {
    for (let n = Number(match[1]); n <= Number(match[2]) && n - Number(match[1]) < 200; n += 1) phases.add(String(n));
  }
  for (const match of text.matchAll(/\d+/g)) phases.add(String(Number(match[0])));
  return phases;
}

/**
 * A plan section as this phase needs it: a table with a phase column keeps this
 * phase's rows, one with a CAP column keeps the capabilities the phase cites, and
 * a table with neither stays whole. `''` when only the heading would remain.
 */
function scopeSection(text, phaseId, citedIds) {
  const lines = String(text).split('\n');
  const out = [];
  let index = 0;
  while (index < lines.length) {
    if (!(index + 1 < lines.length && /^\s*\|/.test(lines[index]) && TABLE_SEPARATOR.test(lines[index + 1]))) {
      out.push(lines[index]);
      index += 1;
      continue;
    }
    const header = lines[index];
    const separator = lines[index + 1];
    const columns = splitRow(header).map(clean);
    const phaseColumn = columns.findIndex((name) => PHASE_COLUMN.test(name));
    const capColumn = columns.findIndex((name) => CAP_COLUMN.test(name));
    index += 2;
    const rows = [];
    while (index < lines.length && /^\s*\|/.test(lines[index])) {
      rows.push(lines[index]);
      index += 1;
    }
    const kept = rows.filter((row) => {
      const cells = splitRow(row);
      if (phaseColumn >= 0) return phasesInCell(cells[phaseColumn] || '').has(String(phaseId));
      if (capColumn >= 0) return citedIds.has(clean(cells[capColumn] || ''));
      return true;
    });
    if (kept.length > 0) out.push(header, separator, ...kept);
  }
  const body = out.slice(1).join('\n').trim();
  return body ? `${out[0]}\n\n${body}\n` : '';
}

/**
 * The PRD rows whose first cell is an id the phase cites, under their own table
 * header and section. `{ groups: [{ section, header, rows }], found: Set }`.
 */
function citedPrdRows(prd, citedIds) {
  const lines = String(prd || '').replace(/\r\n/g, '\n').split('\n');
  const groups = [];
  const found = new Set();
  let section = '';
  let group = null;
  let header = null;
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const heading = /^##\s+(.+)$/.exec(line);
    if (heading) {
      section = heading[1].trim();
      group = null;
      header = null;
      continue;
    }
    if (!/^\s*\|/.test(line)) {
      group = null;
      header = null;
      continue;
    }
    if (TABLE_SEPARATOR.test(line)) {
      header = lines[i - 1];
      group = null;
      continue;
    }
    if (header === null) continue;
    const first = clean(splitRow(line)[0] || '');
    if (!citedIds.has(first)) continue;
    found.add(first);
    if (!group) {
      group = { section, header, rows: [] };
      groups.push(group);
    }
    group.rows.push(line);
  }
  return { groups, found };
}

function renderRows(groups) {
  return groups.map((group) => {
    const width = splitRow(group.header).length;
    return [`### ${group.section}`, '', group.header, `|${'---|'.repeat(width)}`, ...group.rows].join('\n');
  }).join('\n\n');
}

// ─── what the branch already created ─────────────────────────────────────────

function git(targetDir, args) {
  return execFileSync('git', ['-c', 'core.quotepath=off', ...args], {
    cwd: targetDir,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
    maxBuffer: 512 * 1024 * 1024
  });
}

function gitLine(targetDir, args) {
  try {
    return git(targetDir, args).trim();
  } catch {
    return '';
  }
}

function defaultBranches(targetDir) {
  const remoteHead = gitLine(targetDir, ['symbolic-ref', '--quiet', '--short', 'refs/remotes/origin/HEAD']);
  return [...new Set([remoteHead, 'main', 'master', 'origin/main', 'origin/master'].filter(Boolean))];
}

/**
 * `{ ok, commit, ref, note }` or `{ ok: false, reason }`. Without `--base`, the
 * merge-base with the default branch. A clone can point `origin/HEAD` at the
 * branch being worked on, so a branch whose merge-base is HEAD itself gives way
 * to the next candidate.
 */
function resolveBase(targetDir, base) {
  if (base) {
    const commit = /^-/.test(base) ? '' : gitLine(targetDir, ['rev-parse', '--verify', '--quiet', `${base}^{commit}`]);
    return commit ? { ok: true, commit, ref: base } : { ok: false, reason: 'base_not_found' };
  }
  const head = gitLine(targetDir, ['rev-parse', 'HEAD']);
  if (!head) return { ok: false, reason: 'no_commits' };
  let onDefault = null;
  for (const branch of defaultBranches(targetDir)) {
    const commit = gitLine(targetDir, ['merge-base', 'HEAD', branch]);
    if (!commit) continue;
    if (commit !== head) return { ok: true, commit, ref: `merge-base with ${branch}` };
    onDefault = onDefault || branch;
  }
  if (!onDefault) return { ok: false, reason: 'default_branch_not_found' };
  return { ok: true, commit: head, ref: `merge-base with ${onDefault}`, note: `HEAD is on ${onDefault}, so only uncommitted work shows. Pass --base=<commit> to name where the feature started.` };
}

function collectFromDiff(diff, record) {
  let file = null;
  let previous = '';
  for (const raw of diff.split('\n')) {
    // A `+++` header follows its `---`; alone it is an added line that starts with `++`.
    if (raw.startsWith('+++ ') && previous.startsWith('--- ')) {
      const target = raw.slice(4).replace(/\r$/, '');
      file = target === '/dev/null' ? null : target.replace(/^"?b\//, '').replace(/"$/, '');
    } else if (raw.startsWith('diff --git ')) {
      file = null;
    } else if (file && raw.startsWith('+')) {
      record(file, raw.slice(1).replace(/\r$/, ''));
    }
    previous = raw;
  }
}

/**
 * Declarations added since the base, per file, from the committed diff, the
 * working tree and new untracked files. Never throws; outside git the section
 * says why it is empty.
 */
function createdSince(targetDir, base) {
  if (gitLine(targetDir, ['rev-parse', '--is-inside-work-tree']) !== 'true') {
    return { status: 'unavailable', reason: 'not_a_git_repository', files: [] };
  }
  const resolved = resolveBase(targetDir, base);
  if (!resolved.ok) return { status: 'unavailable', reason: resolved.reason, files: [] };

  const byFile = new Map();
  const record = (rel, line) => {
    if (!isIndexable(rel)) return;
    const declared = declarationOnLine(rel, line);
    if (!declared) return;
    if (!byFile.has(rel)) byFile.set(rel, { path: rel, exports: new Set(), local: new Set() });
    byFile.get(rel)[declared.exported ? 'exports' : 'local'].add(declared.name);
  };
  try {
    collectFromDiff(git(targetDir, ['diff', '-U0', '--no-color', '--no-ext-diff', resolved.commit, '--', ...SOURCE_GLOBS]), record);
    for (const rel of git(targetDir, ['ls-files', '--others', '--exclude-standard', '--', ...SOURCE_GLOBS]).split(/\r?\n/).filter(Boolean)) {
      if (!isIndexable(rel)) continue;
      let content;
      try { content = fs.readFileSync(path.join(targetDir, rel), 'utf8'); } catch { continue; }
      for (const line of content.split(/\r?\n/)) record(rel, line);
    }
  } catch {
    return { status: 'unavailable', reason: 'git_diff_failed', base: resolved.commit, files: [] };
  }
  const files = [...byFile.values()]
    .sort((a, b) => a.path.localeCompare(b.path))
    .map((item) => ({ path: item.path, exports: [...item.exports], local: [...item.local] }));
  return { status: 'ok', base: resolved.commit, base_ref: resolved.ref, ...(resolved.note ? { note: resolved.note } : {}), files };
}

const CREATED_REASONS = {
  not_a_git_repository: 'this project is not a git repository',
  no_commits: 'the repository has no commits yet',
  default_branch_not_found: 'no default branch was found; pass --base=<commit>',
  base_not_found: 'the --base commit was not found',
  git_diff_failed: 'git diff failed'
};

function renderNames(names) {
  const shown = names.slice(0, MAX_NAMES_PER_FILE).join(', ');
  return names.length > MAX_NAMES_PER_FILE ? `${shown}, +${names.length - MAX_NAMES_PER_FILE} more` : shown;
}

function renderCreated(created) {
  const title = created.status === 'ok' ? `## Already created since ${String(created.base).slice(0, 7)} (${created.base_ref})` : '## Already created';
  if (created.status !== 'ok') {
    return `${title}\n\nNot available: ${CREATED_REASONS[created.reason] || created.reason}. Look through the tree before writing a helper.`;
  }
  const note = created.note ? `\n\n${created.note}` : '';
  if (created.files.length === 0) return `${title}\n\nNo new top-level declarations.${note}`;
  const rows = created.files.map((file) => {
    const parts = [];
    if (file.exports.length > 0) parts.push(`exports ${renderNames(file.exports)}`);
    if (file.local.length > 0) parts.push(`local ${renderNames(file.local)}`);
    return `- ${file.path}: ${parts.join('; ')}`;
  });
  return `${title}\n\nImport what is here instead of writing it again. Move a local one to a shared module when this phase needs it too.${note}\n\n${rows.join('\n')}`;
}

function renderObservations(items) {
  if (items.length === 0) return '';
  return `## Open process and risk observations\n\n${items.map((item) => `- ${item.id} (${item.kind}): ${item.summary}`).join('\n')}`;
}

/**
 * @param {object} input
 * @param {string} input.targetDir project root
 * @param {string} input.slug feature slug
 * @param {string} input.phaseId phase number
 * @param {string} input.plan plan text
 * @param {string} [input.prd] PRD text
 * @param {Array} [input.observations] open observations of the feature
 * @param {string} [input.base] `--base`
 * @returns the capsule text with its measures, or `{ ok: false, reason, phases }`
 */
function buildPhaseCapsule({ targetDir, slug, phaseId, plan, prd = '', observations = [], base = '' }) {
  const { phases, sections } = planSections(plan);
  const id = String(Number(phaseId));
  const phase = phases.find((item) => item.id === id);
  if (!phase) return { ok: false, reason: 'phase_not_found', phases: phases.map((item) => item.id) };

  const citedIds = new Set(phase.text.match(CITED_ID) || []);
  const { groups, found } = citedPrdRows(prd, citedIds);
  const citedAcs = [...citedIds].filter((item) => AC_ID.test(item)).sort();
  const created = createdSince(targetDir, base);
  const relevant = observations.filter((item) => OBSERVATION_KINDS.has(item.kind));
  const shared = sections
    .filter((section) => !DROPPED_SECTION.test(section.title))
    .map((section) => scopeSection(section.text, id, citedIds))
    .filter(Boolean);

  const parts = [
    `# Phase ${id} capsule: ${slug}`,
    `What a new context needs to start this phase. The full sources stay at .aioson/context/implementation-plan-${slug}.md and .aioson/context/prd-${slug}.md: open them only for what this leaves out.`,
    phase.text.trim()
  ];
  if (groups.length > 0) parts.push(`## What the PRD says about the ids this phase cites\n\n${renderRows(groups)}`);
  parts.push(renderCreated(created));
  const observationText = renderObservations(relevant);
  if (observationText) parts.push(observationText);
  if (shared.length > 0) parts.push(`# Shared plan sections\n\n${shared.map((text) => text.trim()).join('\n\n')}`);
  const text = `${parts.join('\n\n')}\n`;

  const capsuleBytes = Buffer.byteLength(text, 'utf8');
  const planBytes = Buffer.byteLength(String(plan), 'utf8');
  const prdBytes = Buffer.byteLength(String(prd || ''), 'utf8');
  return {
    ok: true,
    feature: slug,
    phase: id,
    capsule: text,
    bytes: {
      capsule: capsuleBytes,
      plan: planBytes,
      prd: prdBytes,
      plan_and_prd: planBytes + prdBytes,
      percent_of_sources: planBytes + prdBytes > 0 ? Math.round((capsuleBytes / (planBytes + prdBytes)) * 1000) / 10 : null
    },
    acs: { cited: citedAcs, found: citedAcs.filter((item) => found.has(item)), missing: citedAcs.filter((item) => !found.has(item)) },
    created,
    observations: relevant.map((item) => ({ id: item.id, kind: item.kind, summary: item.summary }))
  };
}

module.exports = { buildPhaseCapsule, citedPrdRows, createdSince, phasesInCell, resolveBase, scopeSection };
