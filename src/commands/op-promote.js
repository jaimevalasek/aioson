'use strict';

/**
 * aioson op:promote [path] <slug> — manually promote a proposal (skip 2x threshold).
 * Phase 2 (v1.13.0).
 */

const { readProposal } = require('../operator-memory/proposal');
const { promoteProposal } = require('../operator-memory/decision');
const { resolveProjectScope, recordProject, parseList, VALID_SCOPES, SCOPE_PROJECT } = require('../operator-memory/project-scope');
const { commandFailure: fail, openSlugCommand, projectTranslator } = require('../operator-memory/command-context');
const { emitDossierEvent } = require('../lib/dossier-telemetry');

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

// `--scope=operator|project` as asked, with the project bound for `project`; `{ error }` otherwise.
function requestedScopeFor(options, proposal, targetDir) {
  const requestedScope = options.scope == null ? null : String(options.scope);
  if (requestedScope !== null && !VALID_SCOPES.includes(requestedScope)) {
    return { error: `op:promote — invalid --scope='${requestedScope}'. Must be one of: ${VALID_SCOPES.join(', ')}.` };
  }
  if (requestedScope !== SCOPE_PROJECT) return { requestedScope, project: null };
  const project = bindToProject(proposal, targetDir);
  if (project) return { requestedScope, project };
  return { error: `op:promote — --scope=project needs a project (an AIOSON root or a git checkout), and none could be identified from ${targetDir}.` };
}

// The project a project-scoped decision is shown bound to.
function boundProjectName(decision, project) {
  if (decision.scope !== SCOPE_PROJECT) return '';
  return project ? project.name : parseList(decision.project_names).join(', ');
}

async function runOpPromote({ args = [], options = {}, logger, t = null }) {
  if (options.help === true || args.includes('--help') || args.includes('-h')) {
    if (logger) logger.log('op:promote [path] <slug> [--scope=operator|project] — manually promote a pending proposal to a decision.');
    return { ok: true };
  }

  // The project is the `[path]` argument's, the working directory only without one.
  const opened = openSlugCommand('op:promote', args, options, logger);
  if (opened.failure) return opened.failure;
  const { slug, dir: targetDir, resolved } = opened;
  const proposal = readProposal(resolved.identity, slug);
  if (!proposal) return fail(options, logger, `op:promote — proposal '${slug}' not found.`);

  const scoped = requestedScopeFor(options, proposal, targetDir);
  if (scoped.error) return fail(options, logger, scoped.error);
  const { requestedScope, project } = scoped;

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
  const onlyIn = boundProjectName(decision, project);
  if (logger) {
    logger.log((t || projectTranslator(targetDir, options))(`cli.operator_memory.${onlyIn ? 'saved_here' : 'saved'}`, { proposal: proposal.proposal, slug, project: onlyIn }));
  }
  return { ok: true, slug };
}

module.exports = { runOpPromote };
