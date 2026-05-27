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
 */

const fs = require('node:fs');
const path = require('node:path');
const { resolveIdentity } = require('../operator-memory/identity');
const { ensureStorageTree, getStorageRoot } = require('../operator-memory/storage');
const { loadMemoryIndex } = require('../operator-memory/index-md');
const { readDecision } = require('../operator-memory/decision');

async function runOpList({ args = [], options = {}, logger }) {
  if (options.help === true || args.includes('--help') || args.includes('-h')) {
    if (logger) logger.log('op:list [--proposals] [--include-archived] [--feature=<slug>] [--agent=<name>] [--format=table|json] — list active decisions.');
    return { ok: true };
  }

  const format = options.format || 'table';
  const showProposals = Boolean(options.proposals);
  const includeArchived = Boolean(options['include-archived']);
  const filterFeature = options.feature ? String(options.feature) : null;
  const filterAgent = options.agent ? String(options.agent) : null;

  const resolved = resolveIdentity();
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

  // M3: apply --feature and --agent filters (BR-AO-07: AND-composable)
  if (filterFeature) {
    items = items.filter((item) => item.feature_slug === filterFeature);
  }
  if (filterAgent) {
    items = items.filter((item) => item.source_agent === filterAgent);
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
    if (logger) logger.log(JSON.stringify(result, null, 2));
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
      logger.log(`  ${tier}${item.slug.padEnd(40)}  ${item.signal_type.padEnd(14)}  ${category.padEnd(10)}  ${dateOnly}`);
    }
  }
  return { ok: true, count: items.length };
}

module.exports = { runOpList };
