'use strict';

/**
 * aioson op:promote [path] <slug> — manually promote a proposal (skip 2x threshold).
 * Phase 2 (v1.13.0).
 */

const { ensureStorageTree } = require('../operator-memory/storage');
const { readProposal } = require('../operator-memory/proposal');
const { promoteProposal } = require('../operator-memory/decision');
const { resolveProjectScope, recordProject, parseList, VALID_SCOPES, SCOPE_PROJECT } = require('../operator-memory/project-scope');
const { commandProject, pathAndSlug, identityFor, projectTranslator } = require('../operator-memory/command-context');
const { emitDossierEvent } = require('../lib/dossier-telemetry');

function fail(options, logger, err) {
  if (options.json) return { ok: false, error: err };
  if (logger && logger.error) logger.error(err);
  return { ok: false, exitCode: 1, error: err };
}

// `--scope=project` means the project this command runs in. A proposal
// captured before projects were recorded carries none, and promoting it
// project-scoped without one would quietly fall back to operator-wide — the
// opposite of what was asked. Returns the project bound, or null.
function bindToProject(proposal, targetDir) {
  let project;
  try { project = resolveProjectScope(targetDir); } catch { project = null; }
  if (!(project && project.anchored)) return null;
  const seen = recordProject(proposal, project);
  proposal.projects = seen.keys;
  proposal.project_sets = seen.sets;
  proposal.project_names = seen.names;
  return project;
}

async function runOpPromote({ args = [], options = {}, logger, t = null }) {
  const { rawPath, slug } = pathAndSlug(args);

  if (options.help === true || args.includes('--help') || args.includes('-h')) {
    if (logger) logger.log('op:promote [path] <slug> [--scope=operator|project] — manually promote a pending proposal to a decision.');
    return { ok: true };
  }
  if (!slug) return fail(options, logger, 'op:promote — required argument: <slug>. Usage: aioson op:promote [path] <slug>');

  // The project is the `[path]` argument's, the working directory only without one.
  const where = commandProject(rawPath);
  if (where.error) return fail(options, logger, `op:promote — ${where.error}.`);
  const targetDir = where.dir;

  const resolved = identityFor(targetDir);
  ensureStorageTree(resolved.identity);
  const proposal = readProposal(resolved.identity, slug);
  if (!proposal) return fail(options, logger, `op:promote — proposal '${slug}' not found.`);

  const requestedScope = options.scope == null ? null : String(options.scope);
  if (requestedScope !== null && !VALID_SCOPES.includes(requestedScope)) {
    return fail(options, logger, `op:promote — invalid --scope='${requestedScope}'. Must be one of: ${VALID_SCOPES.join(', ')}.`);
  }
  const project = requestedScope === SCOPE_PROJECT ? bindToProject(proposal, targetDir) : null;
  if (requestedScope === SCOPE_PROJECT && !project) {
    return fail(options, logger, `op:promote — --scope=project needs a project (an AIOSON root or a git checkout), and none could be identified from ${targetDir}.`);
  }

  let decision;
  try {
    decision = promoteProposal({ identity: resolved.identity, proposal, scope: requestedScope });
  } catch (err) {
    return fail(options, logger, `op:promote failed: ${err.message}`);
  }

  await emitDossierEvent(targetDir, {
    agent: 'op-promote',
    type: 'op_promote',
    summary: `manual promote ${slug}`,
    meta: { identity_prefix: resolved.identity.slice(0, 8), slug, signal_type: decision.signal_type, category: decision.category, mode: 'manual' }
  });

  if (options.json) {
    return { ok: true, slug, identity: resolved.identity, category: decision.category, scope: decision.scope || 'operator' };
  }
  // The line a person reads, in the project's language.
  const onlyIn = decision.scope === SCOPE_PROJECT ? (project ? project.name : parseList(decision.project_names).join(', ')) : '';
  if (logger) {
    logger.log((t || projectTranslator(targetDir))(`cli.operator_memory.${onlyIn ? 'saved_here' : 'saved'}`, { proposal: proposal.proposal, slug, project: onlyIn }));
  }
  return { ok: true, slug };
}

module.exports = { runOpPromote };
