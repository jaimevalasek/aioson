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
 *                        DEFAULT_RECALL_LIMIT ranked decisions (table output too),
 *                        unless --feature or --proposals asks for another shape
 *   --match=<words>      only decisions whose title or body shares a word (two
 *                        letters and up); none usable → `match_ignored: true`
 *   --limit=<n>          list the n ranked first (0 = all), in every shape;
 *                        `total` and `omitted` come with any head
 */

const fs = require('node:fs');
const path = require('node:path');
const { positionalArgs, openCommand, commandIdentity, commandFailure, projectTranslator } = require('../operator-memory/command-context');
const { getStorageRoot } = require('../operator-memory/storage');
const { loadMemoryIndex } = require('../operator-memory/index-md');
const { readDecision } = require('../operator-memory/decision');
const { STOPWORDS } = require('../operator-memory/loader');
const { halfLifeForCategory, daysSinceReinforced } = require('../operator-memory/decay');
const { resolveProjectScope, appliesInProject, parseList, foldText, SCOPE_PROJECT } = require('../operator-memory/project-scope');

// Every agent activation reads the recall: like a memory index loaded at
// session start, it is the head of the store, not all of it — a store kept for
// months holds hundreds of decisions (522 here, 126 KB, before this cap).
const DEFAULT_RECALL_LIMIT = 40;

// Forgetting a prohibition is a failure the agent cannot see; forgetting a
// permission only costs a question. So within each scope group the exclusions
// and corrections head the recall, before authorizations and confirmations.
const PROHIBITIVE_SIGNALS = new Set(['exclusion', 'correction']);

// Two-letter words that are only grammar in en, pt-BR or es: they would match
// almost every decision. CI, PR, UI, QA, DB, JS and Go stay task words.
const SHORT_STOPWORDS = new Set(['am', 'at', 'by', 'do', 'he', 'if', 'it', 'me', 'my', 'so', 'up', 'us', 'we', 'ao', 'da', 'eu', 'ja', 'ou', 'se', 'te', 'tu', 'al', 'el', 'en', 'es', 'ha', 'la', 'le', 'lo', 'mi', 'ni', 'si', 'su', 'un', 'ya', 'yo']);

const HELP = `op:list [path] [--proposals] [--include-archived] [--all] [--feature=<slug>] [--agent=<name>] [--match=<words>] [--limit=<n>] [--titles-only] [--format=table|json] — list active decisions that apply in this project (--all: every project). --titles-only lists the ${DEFAULT_RECALL_LIMIT} ranked first (this project's first, prohibitions before permissions, then the freshest) unless --limit says otherwise (0 = all); --feature and --proposals list everything unless --limit is given.`;

function dayOf(value) {
  return value ? String(value).slice(0, 10) : null;
}

function leanTitle(fields) {
  return Object.fromEntries(Object.entries(fields).filter(([, value]) => value !== null && value !== undefined && value !== ''));
}

// The shape every agent runs at activation: --titles-only decisions, not a
// feature's record (--feature) or the pending queue (--proposals).
function isActivationRecall(options) {
  return Boolean(options['titles-only']) && !options.feature && !options.proposals;
}

/**
 * `--limit=<n>`: a whole number, 0 for all; absent, the head of the activation
 * recall only. Given without a value (the parser's `true`) it is no number.
 */
function recallLimit(options) {
  if (options.limit === undefined) return isActivationRecall(options) ? DEFAULT_RECALL_LIMIT : 0;
  const limit = typeof options.limit === 'boolean' || options.limit === '' ? NaN : Number(options.limit);
  return Number.isInteger(limit) && limit >= 0 ? limit : null;
}

/** A `--limit` that is no whole number: a usage error in every shape (exit 1). */
function limitFailure(options, logger) {
  const given = options.limit === true ? 'no value' : `'${options.limit}'`;
  const message = `op:list — --limit must be a whole number (0 = all), got ${given}.`;
  return { ...commandFailure(options, logger, message), error: 'limit_invalid', message };
}

/** The words --match compares: folded, two letters and up, grammar words left out. */
function matchWords(text) {
  return foldText(text).split(/[^a-z0-9]+/).filter((word) => word.length >= 2 && !STOPWORDS.has(word) && !SHORT_STOPWORDS.has(word));
}

/** How many of the asked words a decision's title or body holds. */
function matchHits(item, words) {
  const own = new Set(matchWords(`${item.title || ''} ${item.body || ''}`));
  return words.filter((word) => own.has(word)).length;
}

/** The decay model's freshness; a proposal is as old as its last detection. */
function decayWeight(item, now) {
  const dated = { last_reinforced: item.last_reinforced || item.last_detected, promoted_at: item.promoted_at || item.first_detected };
  return (1 + (Number(item.reinforcement_count) || 0)) * Math.pow(0.5, daysSinceReinforced(dated, now) / halfLifeForCategory(item.category || 'default'));
}

function recallEntry(item, words, project, now) {
  return {
    item,
    hits: words.length > 0 ? matchHits(item, words) : 1,
    here: item.scope === SCOPE_PROJECT && appliesInProject(item, project) ? 1 : 0,
    prohibitive: PROHIBITIVE_SIGNALS.has(item.signal_type) ? 1 : 0,
    weight: decayWeight(item, now)
  };
}

function compareRecall(a, b) {
  return b.hits - a.hits || b.here - a.here || b.prohibitive - a.prohibitive || b.weight - a.weight
    || String(a.item.slug).localeCompare(String(b.item.slug));
}

/**
 * The recall order: the best match for --match words, then the decisions said
 * in this project, prohibitions before permissions within each group, then the
 * decay model's own freshness — each reinforcement raises it, its category's
 * half-life (identity 365 d … default 90 d) halves it with age. The slug breaks
 * ties, so the head is the same on every call.
 */
function rankForRecall(items, words, project, now) {
  return items
    .map((item) => recallEntry(item, words, project, now))
    .filter((entry) => entry.hits > 0)
    .sort(compareRecall)
    .map((entry) => entry.item);
}

/** The words of --match, and whether it was given without one usable word. */
function matchQuery(options) {
  if (options.match === undefined) return { words: [], ignored: false };
  const words = [...new Set(matchWords(typeof options.match === 'string' ? options.match : ''))];
  return { words, ignored: words.length === 0 };
}

/**
 * The ranked head and what it leaves out; untouched without a limit or a usable
 * match word. A --match with no usable word is reported, never dropped in
 * silence, and the normal head applies.
 */
function selectRecall(items, options, limit, project) {
  const { words, ignored } = matchQuery(options);
  if (limit === 0 && words.length === 0) return { items, applied: false, total: items.length, omitted: 0, match_ignored: ignored };
  const ranked = rankForRecall(items, words, project, Date.now());
  const head = limit > 0 ? ranked.slice(0, limit) : ranked;
  return { items: head, applied: true, total: ranked.length, omitted: ranked.length - head.length, match_ignored: ignored };
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

/** The project the command runs in — resolved only when some decision is bound to one. */
function currentProjectFor(dir, items) {
  if (!items.some((item) => item.scope === SCOPE_PROJECT)) return null;
  try { return resolveProjectScope(dir); } catch { return null; }
}

/**
 * What applies here: a decision said in one project only there (project-scope.js),
 * an unscoped (pre-scope) one everywhere, every project's with --all; then
 * --feature and --agent, AND-composable (BR-AO-07).
 */
function applyFilters(items, project, options) {
  let kept = items;
  if (!options.proposals && !options.all) kept = kept.filter((item) => appliesInProject(item, project));
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

/**
 * Whenever a head applies: `total` and `omitted` (0 when nothing is left out),
 * the way to the rest, and a --match that had no usable word.
 */
function recallFields(recall) {
  const fields = recall.applied ? { total: recall.total, omitted: recall.omitted } : {};
  if (recall.omitted > 0) fields.more = moreHint(recall.omitted);
  if (recall.match_ignored) fields.match_ignored = true;
  return fields;
}

function jsonResult(items, recall, resolved, options) {
  if (options.feature) {
    const decisions = items.map(featureDecision);
    return { ok: true, feature: String(options.feature), decisions, total: decisions.length, ...recallFields(recall) };
  }
  return {
    ok: true,
    feature: null,
    identity: resolved.identity,
    identity_source: resolved.source,
    tier: tierLabel(options),
    count: items.length,
    ...recallFields(recall),
    items
  };
}

/** The text listing's one-line note that --match had no usable word. */
function noteIgnoredMatch(logger, recall, dir, options) {
  if (!recall.match_ignored || !logger) return;
  logger.log(projectTranslator(dir, options)('cli.operator_memory.match_ignored', { match: typeof options.match === 'string' ? options.match : '' }));
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
  if (limit === null) return limitFailure(options, logger);

  const resolved = commandIdentity(where.dir);
  const loaded = loadItems(resolved.identity, options);
  const project = currentProjectFor(where.dir, loaded);
  const recall = selectRecall(applyFilters(loaded, project, options), options, limit, project);
  const items = options['titles-only'] ? recall.items.map(titleOnly) : recall.items;

  if (options.format === 'json' || options.json) {
    const result = jsonResult(items, recall, resolved, options);
    // The recall is read on every activation: one compact line.
    if (!options.json && logger) logger.log(options['titles-only'] && !options.feature ? JSON.stringify(result) : JSON.stringify(result, null, 2));
    return result;
  }
  noteIgnoredMatch(logger, recall, where.dir, options);
  return printTable(logger, items, recall, resolved.identity, Boolean(options.proposals));
}

module.exports = { runOpList, DEFAULT_RECALL_LIMIT };
