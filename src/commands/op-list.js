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
 *                        lazy-loads matching bodies via op:show; capped at
 *                        DEFAULT_RECALL_LIMIT ranked decisions
 *   --match=<words>      only decisions whose title or body shares a word
 *   --limit=<n>          list the n ranked first (0 = all)
 */

const fs = require('node:fs');
const path = require('node:path');
const { positionalArgs, openCommand, commandIdentity, commandFailure } = require('../operator-memory/command-context');
const { getStorageRoot } = require('../operator-memory/storage');
const { loadMemoryIndex } = require('../operator-memory/index-md');
const { readDecision } = require('../operator-memory/decision');
const { tokenize } = require('../operator-memory/loader');
const { halfLifeForCategory, daysSinceReinforced } = require('../operator-memory/decay');
const { resolveProjectScope, appliesInProject, parseList, SCOPE_PROJECT } = require('../operator-memory/project-scope');

// Every agent activation reads the recall: like a memory index loaded at
// session start, it is the head of the store, not all of it — a store kept for
// months holds hundreds of decisions (522 here, 126 KB, before this cap).
const DEFAULT_RECALL_LIMIT = 40;

const HELP = `op:list [path] [--proposals] [--include-archived] [--all] [--feature=<slug>] [--agent=<name>] [--match=<words>] [--limit=<n>] [--titles-only] [--format=table|json] — list active decisions that apply in this project (--all: every project). --titles-only lists the ${DEFAULT_RECALL_LIMIT} ranked first (this project's, then the freshest) unless --limit says otherwise (0 = all).`;

function dayOf(value) {
  return value ? String(value).slice(0, 10) : null;
}

function leanTitle(fields) {
  return Object.fromEntries(Object.entries(fields).filter(([, value]) => value !== null && value !== undefined && value !== ''));
}

/** `--limit=<n>`: a whole number, 0 for all; the recall's head when absent. */
function recallLimit(options) {
  if (options.limit === undefined) return options['titles-only'] ? DEFAULT_RECALL_LIMIT : 0;
  const limit = Number(options.limit);
  return Number.isInteger(limit) && limit >= 0 ? limit : null;
}

/** How many of the asked words a decision's title or body holds. */
function matchHits(item, words) {
  const own = new Set(tokenize(`${item.title || ''} ${item.body || ''}`));
  return words.filter((word) => own.has(word)).length;
}

/**
 * The recall order: the best match for --match words, then a decision said in
 * this project, then the decay model's own freshness — each reinforcement
 * raises it, its category's half-life (identity 365 d … default 90 d) halves
 * it with age. The slug breaks ties, so the head is the same on every call.
 */
function rankForRecall(items, words, now) {
  return items
    .map((item) => ({
      item,
      hits: words.length > 0 ? matchHits(item, words) : 1,
      here: item.scope === SCOPE_PROJECT ? 1 : 0,
      weight: (1 + (Number(item.reinforcement_count) || 0)) * Math.pow(0.5, daysSinceReinforced(item, now) / halfLifeForCategory(item.category || 'default'))
    }))
    .filter((entry) => entry.hits > 0)
    .sort((a, b) => b.hits - a.hits || b.here - a.here || b.weight - a.weight || String(a.item.slug).localeCompare(String(b.item.slug)))
    .map((entry) => entry.item);
}

/** The ranked head and what it leaves out; untouched without a limit or match. */
function selectRecall(items, options, limit) {
  const words = options.match ? [...new Set(tokenize(String(options.match)))] : [];
  if (limit === 0 && words.length === 0) return { items, total: items.length, omitted: 0 };
  const ranked = rankForRecall(items, words, Date.now());
  const head = limit > 0 ? ranked.slice(0, limit) : ranked;
  return { items: head, total: ranked.length, omitted: ranked.length - head.length };
}

function moreHint(omitted) {
  return `${omitted} more decision(s) ranked lower — aioson op:list --json --titles-only --match="<task words>" finds them; --limit=0 lists all`;
}

/** Pending proposals, each with its slug. */
function loadProposals(identity) {
  const proposalsDir = path.join(getStorageRoot(identity), 'proposals');
  if (!fs.existsSync(proposalsDir)) return [];
  const { readProposal } = require('../operator-memory/proposal');
  const items = [];
  for (const file of fs.readdirSync(proposalsDir).filter((name) => name.endsWith('.md'))) {
    const slug = file.slice(0, -3);
    const proposal = readProposal(identity, slug);
    if (proposal) items.push({ slug, ...proposal });
  }
  return items;
}

/** One index tier, enriched with each decision's file so JSON carries category, scope and body. */
function loadTier(identity, tier) {
  const index = loadMemoryIndex(identity, tier);
  const marker = tier === 'archive' ? { tier: 'archive' } : {};
  const items = [];
  for (const entry of (index && index.entries) || []) {
    const decision = readDecision(identity, entry.slug);
    if (decision) items.push({ slug: entry.slug, title: entry.title, ...marker, ...decision });
  }
  return items;
}

function loadItems(identity, options) {
  if (options.proposals) return loadProposals(identity);
  const active = loadTier(identity, 'active');
  return options['include-archived'] ? [...active, ...loadTier(identity, 'archive')] : active;
}

/**
 * What applies here: a decision said in one project only there (project-scope.js),
 * an unscoped (pre-scope) one everywhere, every project's with --all; then
 * --feature and --agent, AND-composable (BR-AO-07).
 */
function applyFilters(items, dir, options) {
  let kept = items;
  if (!options.proposals && !options.all && kept.some((item) => item.scope === SCOPE_PROJECT)) {
    let currentProject = null;
    try { currentProject = resolveProjectScope(dir); } catch { currentProject = null; }
    kept = kept.filter((item) => appliesInProject(item, currentProject));
  }
  if (options.feature) kept = kept.filter((item) => item.feature_slug === String(options.feature));
  if (options.agent) kept = kept.filter((item) => item.source_agent === String(options.agent));
  return kept;
}

// --titles-only: the cheap session-start recall shape — index fields without
// bodies/quotes, so a large operator memory costs one small JSON instead of
// every decision body. Load a matching body with op:show <slug>. It is read
// on every agent activation: empty fields are left out and dates are days.
function titleOnly(item) {
  return leanTitle({
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
  });
}

// BR-AO-09: the structured shape of --feature.
function featureDecision(item) {
  return {
    agent: item.source_agent || 'unknown',
    signal: item.signal_type || null,
    quote: Array.isArray(item.quotes) ? (item.quotes[item.quotes.length - 1] || null) : null,
    proposal: item.proposal || item.body || item.title || null,
    timestamp: item.last_reinforced || item.last_detected || null,
    session_id: item.session_id || null
  };
}

function tierLabel(options) {
  if (options.proposals) return 'proposals';
  return options['include-archived'] ? 'active+archive' : 'active';
}

function jsonResult(items, recall, resolved, options) {
  if (options.feature) {
    const decisions = items.map(featureDecision);
    return { ok: true, feature: String(options.feature), decisions, total: decisions.length };
  }
  const left = recall.omitted > 0 ? { total: recall.total, omitted: recall.omitted, more: moreHint(recall.omitted) } : {};
  return {
    ok: true,
    feature: null,
    identity: resolved.identity,
    identity_source: resolved.source,
    tier: tierLabel(options),
    count: items.length,
    ...left,
    items
  };
}

function tableRow(item, showProposals) {
  const dateOnly = String(item.last_reinforced || item.last_detected || '').slice(0, 10);
  const category = item.category || (showProposals ? 'proposal' : 'default');
  const tier = item.tier === 'archive' ? '[archive] ' : '';
  const only = item.scope === SCOPE_PROJECT ? `  only in: ${parseList(item.project_names).join(', ') || 'one project'}` : '';
  return `  ${tier}${item.slug.padEnd(40)}  ${item.signal_type.padEnd(14)}  ${category.padEnd(10)}  ${dateOnly}${only}`;
}

function printTable(logger, items, recall, identity, showProposals) {
  if (items.length === 0) {
    if (logger) logger.log(`op:list — no ${showProposals ? 'pending proposals' : 'decisions'} for identity ${identity}.`);
    return { ok: true, count: 0 };
  }
  if (logger) {
    logger.log(`op:list — ${items.length} ${showProposals ? 'proposal(s)' : 'decision(s)'} for ${identity}:`);
    logger.log('');
    for (const item of items) logger.log(tableRow(item, showProposals));
    if (recall.omitted > 0) logger.log(`  … ${moreHint(recall.omitted)}`);
  }
  return { ok: true, count: items.length };
}

async function runOpList({ args = [], options = {}, logger }) {
  if (options.help === true || args.includes('--help') || args.includes('-h')) {
    if (logger) logger.log(HELP);
    return { ok: true };
  }

  // The project is the `[path]` argument's, the working directory only without one.
  const where = openCommand('op:list', positionalArgs(args)[0], options, logger);
  if (where.failure) return where.failure;
  const limit = recallLimit(options);
  if (limit === null) return commandFailure(options, logger, `op:list — --limit must be a whole number (0 = all), got '${options.limit}'.`);

  const resolved = commandIdentity(where.dir);
  const recall = selectRecall(applyFilters(loadItems(resolved.identity, options), where.dir, options), options, limit);
  const items = options['titles-only'] ? recall.items.map(titleOnly) : recall.items;

  if (options.format === 'json' || options.json) {
    const result = jsonResult(items, recall, resolved, options);
    // The recall is read on every activation: one compact line.
    if (!options.json && logger) logger.log(options['titles-only'] && !options.feature ? JSON.stringify(result) : JSON.stringify(result, null, 2));
    return result;
  }
  return printTable(logger, items, recall, resolved.identity, Boolean(options.proposals));
}

module.exports = { runOpList, DEFAULT_RECALL_LIMIT };
