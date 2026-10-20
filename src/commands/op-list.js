'use strict';

/**
 * aioson op:list — list active decisions (Phase 3, v1.14.0).
 *
 * Output formats:
 *   --format=table (default): human-readable columns
 *   --format=json: machine-readable JSON
 *
 * Flags:
 *   --proposals          show pending proposals instead of decisions
 *   --include-archived   include MEMORY-archive.md entries
 *   --titles-only        strip decision bodies/quotes from --format=json items —
 *                        the session-start recall path (kernel) lists titles and
 *                        lazy-loads matching bodies via op:show
 */

const fs = require('node:fs');
const path = require('node:path');
const { commandProject, positionalArgs, identityFor } = require('../operator-memory/command-context');
const { ensureStorageTree, getStorageRoot } = require('../operator-memory/storage');
const { loadMemoryIndex } = require('../operator-memory/index-md');
const { readDecision } = require('../operator-memory/decision');
const { resolveProjectScope, appliesInProject, parseList, SCOPE_PROJECT } = require('../operator-memory/project-scope');

function dayOf(value) {
  return value ? String(value).slice(0, 10) : null;
}

function leanTitle(fields) {
  return Object.fromEntries(Object.entries(fields).filter(([, value]) => value !== null && value !== undefined && value !== ''));
}

async function runOpList({ args = [], options = {}, logger }) {
  if (options.help === true || args.includes('--help') || args.includes('-h')) {
    if (logger) logger.log('op:list [path] [--proposals] [--include-archived] [--all] [--feature=<slug>] [--agent=<name>] [--titles-only] [--format=table|json] — list active decisions that apply in this project (--all: every project).');
    return { ok: true };
  }

  // The project is the `[path]` argument's, the working directory only without one.
  const where = commandProject(positionalArgs(args)[0]);
  if (where.error) {
    const err = `op:list — ${where.error}.`;
    if (options.json) return { ok: false, error: err };
    if (logger && logger.error) logger.error(err);
    return { ok: false, exitCode: 1, error: err };
  }

  const format = options.format || 'table';
  const showProposals = Boolean(options.proposals);
  const includeArchived = Boolean(options['include-archived']);
  const filterFeature = options.feature ? String(options.feature) : null;
  const filterAgent = options.agent ? String(options.agent) : null;

  const resolved = identityFor(where.dir);
  ensureStorageTree(resolved.identity);
  const root = getStorageRoot(resolved.identity);

  let items = [];
  if (showProposals) {
    const proposalsDir = path.join(root, 'proposals');
    if (fs.existsSync(proposalsDir)) {
      const files = fs.readdirSync(proposalsDir).filter((f) => f.endsWith('.md'));
      const { readProposal } = require('../operator-memory/proposal');
      for (const f of files) {
        const slug = f.slice(0, -3);
        const p = readProposal(resolved.identity, slug);
        if (p) items.push({ slug, ...p });
      }
    }
  } else {
    const active = loadMemoryIndex(resolved.identity, 'active');
    if (active && active.entries) {
      // Enrich with full decision data so --format=json carries category + body summary
      for (const entry of active.entries) {
        const d = readDecision(resolved.identity, entry.slug);
        if (d) items.push({ slug: entry.slug, title: entry.title, ...d });
      }
    }
    if (includeArchived) {
      const archive = loadMemoryIndex(resolved.identity, 'archive');
      if (archive && archive.entries) {
        for (const entry of archive.entries) {
          const d = readDecision(resolved.identity, entry.slug);
          if (d) items.push({ slug: entry.slug, title: entry.title, tier: 'archive', ...d });
        }
      }
    }
  }

  // A decision said in one project applies there only (project-scope.js): the
  // session-start recall lists what applies in this project; --all shows every
  // project's. Unscoped (pre-scope) decisions stay operator-wide.
  let currentProject = null;
  if (!showProposals && !options.all && items.some((item) => item.scope === SCOPE_PROJECT)) {
    try { currentProject = resolveProjectScope(where.dir); } catch { currentProject = null; }
    items = items.filter((item) => appliesInProject(item, currentProject));
  }

  // M3: apply --feature and --agent filters (BR-AO-07: AND-composable)
  if (filterFeature) {
    items = items.filter((item) => item.feature_slug === filterFeature);
  }
  if (filterAgent) {
    items = items.filter((item) => item.source_agent === filterAgent);
  }

  // --titles-only: the cheap session-start recall shape — index fields without
  // bodies/quotes, so a large operator memory costs one small JSON instead of
  // every decision body. Load a matching body with op:show <slug>. It is read
  // on every agent activation: empty fields are left out and dates are days.
  if (options['titles-only']) {
    items = items.map((item) => leanTitle({
      slug: item.slug,
      title: item.title,
      signal_type: item.signal_type,
      category: item.category,
      feature_slug: item.feature_slug,
      source_agent: item.source_agent,
      last_detected: dayOf(item.last_detected),
      last_reinforced: dayOf(item.last_reinforced),
      scope: item.scope,
      tier: item.tier
    }));
  }

  if (format === 'json' || options.json) {
    // BR-AO-09: structured JSON output when --feature is used
    if (filterFeature) {
      const decisions = items.map((item) => ({
        agent: item.source_agent || 'unknown',
        signal: item.signal_type || null,
        quote: Array.isArray(item.quotes) ? (item.quotes[item.quotes.length - 1] || null) : null,
        proposal: item.proposal || item.body || item.title || null,
        timestamp: item.last_reinforced || item.last_detected || null,
        session_id: item.session_id || null
      }));
      const result = {
        ok: true,
        feature: filterFeature,
        decisions,
        total: decisions.length
      };
      if (options.json) return result;
      if (logger) logger.log(JSON.stringify(result, null, 2));
      return result;
    }

    const result = {
      ok: true,
      feature: null,
      identity: resolved.identity,
      identity_source: resolved.source,
      tier: showProposals ? 'proposals' : (includeArchived ? 'active+archive' : 'active'),
      count: items.length,
      items
    };
    if (options.json) {
      return result;
    }
    if (logger) logger.log(options['titles-only'] ? JSON.stringify(result) : JSON.stringify(result, null, 2));
    return result;
  }

  if (items.length === 0) {
    const msg = showProposals
      ? `op:list — no pending proposals for identity ${resolved.identity}.`
      : `op:list — no decisions for identity ${resolved.identity}.`;
    if (logger) logger.log(msg);
    return { ok: true, count: 0 };
  }

  if (logger) {
    logger.log(`op:list — ${items.length} ${showProposals ? 'proposal(s)' : 'decision(s)'} for ${resolved.identity}:`);
    logger.log('');
    for (const item of items) {
      const dateOnly = String(item.last_reinforced || item.last_detected || '').slice(0, 10);
      const category = item.category || (showProposals ? 'proposal' : 'default');
      const tier = item.tier === 'archive' ? '[archive] ' : '';
      const only = item.scope === SCOPE_PROJECT ? `  only in: ${parseList(item.project_names).join(', ') || 'one project'}` : '';
      logger.log(`  ${tier}${item.slug.padEnd(40)}  ${item.signal_type.padEnd(14)}  ${category.padEnd(10)}  ${dateOnly}${only}`);
    }
  }
  return { ok: true, count: items.length };
}

module.exports = { runOpList };
