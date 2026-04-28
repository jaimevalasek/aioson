'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');

const { isCanonicalAgent, isValidSlug } = require('./schema');
const { shouldCompact, compact } = require('./dossier-compact');

const FEATURES_SUBDIR = 'features';
const REVISIONS_FILENAME = 'revisions.json';
const MAX_REVISION_ROUNDS = 3;

const VALID_SEVERITIES = new Set(['blocking', 'advisory']);
const VALID_STATUSES = new Set(['pending', 'approved', 'rejected', 'resolved']);

// Which workflow gate each agent "owns" (for anti-loop counter)
const GATE_BY_AGENT = {
  product: 'requirements',
  analyst: 'requirements',
  architect: 'design',
  'ux-ui': 'design',
  pm: 'plan',
  dev: 'plan',
  qa: 'execution'
};

function revisionsPath(contextDir, slug) {
  return path.join(contextDir, FEATURES_SUBDIR, slug, REVISIONS_FILENAME);
}

function dossierPath(contextDir, slug) {
  return path.join(contextDir, FEATURES_SUBDIR, slug, 'dossier.md');
}

function workflowStatePath(contextDir) {
  return path.join(contextDir, 'workflow.state.json');
}

function nextRevId(existing) {
  const n = existing.length + 1;
  return `rev-${String(n).padStart(3, '0')}`;
}

async function readRevisions({ slug, contextDir }) {
  const p = revisionsPath(contextDir, slug);
  try {
    const raw = await fs.readFile(p, 'utf8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function writeRevisions({ slug, contextDir, revisions }) {
  const p = revisionsPath(contextDir, slug);
  await fs.mkdir(path.dirname(p), { recursive: true });
  await fs.writeFile(p, JSON.stringify(revisions, null, 2) + '\n', 'utf8');
}

// Replace the content of one ## section in a markdown file.
async function updateDossierSection(filePath, sectionName, newContent) {
  let raw;
  try {
    raw = await fs.readFile(filePath, 'utf8');
  } catch {
    return; // dossier absent — skip silently
  }

  const lines = raw.split('\n');
  let sectionStart = -1;
  let sectionEnd = lines.length;

  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trimEnd() === `## ${sectionName}`) {
      sectionStart = i;
    } else if (sectionStart !== -1 && i > sectionStart && /^## /.test(lines[i])) {
      sectionEnd = i;
      break;
    }
  }

  let rebuilt;
  if (sectionStart === -1) {
    // Append section at end
    rebuilt = raw.trimEnd() + `\n\n## ${sectionName}\n\n${newContent.trimEnd()}\n`;
  } else {
    const before = lines.slice(0, sectionStart + 1);
    const after = lines.slice(sectionEnd);
    rebuilt = [...before, '', newContent.trimEnd(), '', ...after].join('\n');
  }

  await fs.writeFile(filePath, rebuilt, 'utf8');
}

function buildRevisionTable(revisions) {
  if (revisions.length === 0) {
    return '_(sem revisões abertas)_';
  }
  const header = '| id | requested_by | target | severity | status |';
  const divider = '|----|-------------|--------|----------|--------|';
  const rows = revisions.map((r) =>
    `| ${r.id} | ${r.requested_by} | ${r.target} | ${r.severity} | ${r.status} |`
  );
  return [header, divider, ...rows].join('\n');
}

async function readWorkflowState(contextDir) {
  const p = workflowStatePath(contextDir);
  try {
    const raw = await fs.readFile(p, 'utf8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function writeWorkflowState(contextDir, state) {
  const p = workflowStatePath(contextDir);
  await fs.writeFile(p, JSON.stringify(state, null, 2) + '\n', 'utf8');
}

async function open({
  slug,
  contextDir,
  requestedBy,
  target,
  targetArtifact,
  reason,
  severity,
  evidenceCodeRefs = [],
  now = () => new Date()
} = {}) {
  if (!isValidSlug(slug)) {
    const err = new Error(`invalid slug: ${JSON.stringify(slug)}`);
    err.code = 'EREVSLUG';
    throw err;
  }
  if (!isCanonicalAgent(requestedBy)) {
    const err = new Error(`requested_by must be a canonical agent id (got: ${JSON.stringify(requestedBy)})`);
    err.code = 'EREVAGENT';
    throw err;
  }
  if (!isCanonicalAgent(target)) {
    const err = new Error(`target must be a canonical agent id (got: ${JSON.stringify(target)})`);
    err.code = 'EREVAGENT';
    throw err;
  }
  if (!VALID_SEVERITIES.has(severity)) {
    const err = new Error(`severity must be 'blocking' or 'advisory' (got: ${JSON.stringify(severity)})`);
    err.code = 'EREVSCHEMA';
    throw err;
  }
  if (!targetArtifact || typeof targetArtifact !== 'string') {
    const err = new Error('target_artifact must be a non-empty relative path');
    err.code = 'EREVSCHEMA';
    throw err;
  }
  if (!reason || typeof reason !== 'string' || !reason.trim()) {
    const err = new Error('reason must be a non-empty string');
    err.code = 'EREVSCHEMA';
    throw err;
  }

  const revisions = await readRevisions({ slug, contextDir });
  const id = nextRevId(revisions);
  const createdAt = now().toISOString();

  const revision = {
    id,
    status: 'pending',
    requested_by: requestedBy,
    target,
    target_artifact: targetArtifact,
    reason: reason.trim(),
    severity,
    evidence_code_refs: Array.isArray(evidenceCodeRefs) ? evidenceCodeRefs : [],
    created_at: createdAt,
    resolved_at: null,
    resolution: null
  };

  revisions.push(revision);
  await writeRevisions({ slug, contextDir, revisions });

  // Update dossier ## Revision Requests
  const dp = dossierPath(contextDir, slug);
  await updateDossierSection(dp, 'Revision Requests', buildRevisionTable(revisions));

  return revision;
}

async function list({ slug, contextDir, status } = {}) {
  if (!isValidSlug(slug)) {
    const err = new Error(`invalid slug: ${JSON.stringify(slug)}`);
    err.code = 'EREVSLUG';
    throw err;
  }
  const revisions = await readRevisions({ slug, contextDir });
  if (status && VALID_STATUSES.has(status)) {
    return revisions.filter((r) => r.status === status);
  }
  return revisions;
}

async function resolve({
  slug,
  contextDir,
  revId,
  action,
  forceRevision = false,
  now = () => new Date()
} = {}) {
  if (!isValidSlug(slug)) {
    const err = new Error(`invalid slug: ${JSON.stringify(slug)}`);
    err.code = 'EREVSLUG';
    throw err;
  }
  if (action !== 'approve' && action !== 'reject') {
    const err = new Error(`action must be 'approve' or 'reject' (got: ${JSON.stringify(action)})`);
    err.code = 'EREVSCHEMA';
    throw err;
  }

  const revisions = await readRevisions({ slug, contextDir });
  const idx = revisions.findIndex((r) => r.id === revId);
  if (idx === -1) {
    const err = new Error(`revision '${revId}' not found in ${slug}`);
    err.code = 'EREVNOTFOUND';
    throw err;
  }

  const rev = revisions[idx];
  if (rev.status !== 'pending') {
    const err = new Error(`revision '${revId}' is '${rev.status}' — only pending revisions can be resolved`);
    err.code = 'EREVNOTPENDING';
    throw err;
  }

  const resolvedAt = now().toISOString();

  if (action === 'reject') {
    revisions[idx] = { ...rev, status: 'rejected', resolved_at: resolvedAt, resolution: 'rejected' };
    await writeRevisions({ slug, contextDir, revisions });
    const dp = dossierPath(contextDir, slug);
    await updateDossierSection(dp, 'Revision Requests', buildRevisionTable(revisions));
    if (await shouldCompact({ slug, contextDir })) await compact({ slug, contextDir });
    return { revision: revisions[idx], gateIncremented: null };
  }

  // approve path: check anti-loop limit
  const gate = GATE_BY_AGENT[rev.target] || null;
  let gateIncremented = null;
  let newRounds = null;

  if (gate) {
    const wfState = await readWorkflowState(contextDir);
    if (wfState) {
      const rounds = (wfState.gate_revision_rounds || {})[gate] || 0;
      if (rounds >= MAX_REVISION_ROUNDS && !forceRevision) {
        const err = new Error(
          `Anti-loop: gate '${gate}' already had ${rounds} revision round(s) (max ${MAX_REVISION_ROUNDS}). ` +
          `Use --force-revision to override.`
        );
        err.code = 'EREVLOOP';
        err.gate = gate;
        err.rounds = rounds;
        throw err;
      }
      newRounds = rounds + 1;
      const updatedState = {
        ...wfState,
        gate_revision_rounds: {
          ...(wfState.gate_revision_rounds || {}),
          [gate]: newRounds
        }
      };
      await writeWorkflowState(contextDir, updatedState);
      gateIncremented = { gate, rounds: newRounds };
    }
  }

  revisions[idx] = { ...rev, status: 'approved', resolved_at: resolvedAt, resolution: 'approved' };
  await writeRevisions({ slug, contextDir, revisions });
  const dp = dossierPath(contextDir, slug);
  await updateDossierSection(dp, 'Revision Requests', buildRevisionTable(revisions));
  if (await shouldCompact({ slug, contextDir })) await compact({ slug, contextDir });

  return { revision: revisions[idx], gateIncremented };
}

async function getBlockingRevisions({ slug, contextDir }) {
  if (!slug || !isValidSlug(slug)) return [];
  const revisions = await readRevisions({ slug, contextDir });
  return revisions.filter((r) => r.severity === 'blocking' && r.status === 'pending');
}

module.exports = {
  VALID_SEVERITIES,
  VALID_STATUSES,
  GATE_BY_AGENT,
  MAX_REVISION_ROUNDS,
  revisionsPath,
  readRevisions,
  writeRevisions,
  updateDossierSection,
  buildRevisionTable,
  open,
  list,
  resolve,
  getBlockingRevisions
};
