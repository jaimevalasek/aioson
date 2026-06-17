'use strict';

const path = require('node:path');
const {
  getContextUsage,
  computeWarningLevel,
  THRESHOLDS
} = require('../squad-dashboard/context-monitor');
const { openRuntimeDb, appendRunEvent } = require('../runtime-store');

const PROJECT_BUDGET_ZONES = {
  safe: 0.60,
  warning: 0.80,
  critical: 1.00
};

const BAR_WIDTH = 20;
const LEVEL_ICONS = { normal: ' ', warning: '⚠', critical: '!', overflow: 'X', unknown: '?' };

function renderBar(ratio, width) {
  const clamped = Math.max(0, Math.min(1, ratio));
  const filled = Math.round(clamped * width);
  const bar = '█'.repeat(filled) + '░'.repeat(width - filled);
  return `[${bar}] ${Math.round(clamped * 100)}%`;
}

function formatTokens(n) {
  if (typeof n !== 'number') return '?';
  return n.toLocaleString();
}

function renderAgent(slug, agent) {
  const used = agent.totalUsed || 0;
  const win = agent.windowSize || 0;
  const ratio = win > 0 ? used / win : 0;
  const level = agent.warningLevel || computeWarningLevel(used, win);
  const icon = LEVEL_ICONS[level] || '?';
  const bar = renderBar(ratio, BAR_WIDTH);
  const line = `  ${icon} ${slug.padEnd(16)} ${bar}  ${formatTokens(used)}/${formatTokens(win)}`;
  if (level === 'warning' || level === 'critical' || level === 'overflow') {
    return `${line}  [${level.toUpperCase()}]`;
  }
  return line;
}

async function emitBudgetEvent(cwd, { tokens, budget, pct, zone, agentName }) {
  const { db } = await openRuntimeDb(cwd, { mustExist: true }).catch(() => ({ db: null }));
  if (!db) return;
  try {
    const run = db.prepare(
      "SELECT run_key FROM agent_runs WHERE status = 'running' ORDER BY updated_at DESC LIMIT 1"
    ).get();
    if (run) {
      appendRunEvent(db, {
        runKey: run.run_key,
        eventType: zone === 'critical' ? 'context_budget_critical' : 'context_budget_warning',
        phase: 'live',
        status: 'running',
        message: `Context at ${pct}% of budget (${tokens.toLocaleString()} tokens)`,
        payload: { tokens, budget, pct, zone, agentName: agentName || null },
        createdAt: new Date().toISOString()
      });
    }
  } finally {
    db.close();
  }
}

async function runContextMonitor({ args, options, logger }) {
  const cwd = path.resolve(process.cwd(), args[0] || '.');
  const squadSlug = options.squad || null;
  const agentSlug = options.agent || null;
  const budget = options.budget ? Number(options.budget) : null;

  // Project-level budget monitoring (--budget=<tokens>)
  if (budget && !squadSlug) {
    const tokens = options.tokens ? Number(options.tokens) : null;
    if (tokens !== null) {
      const pct = Math.round((tokens / budget) * 100);
      const zone = pct >= 100 ? 'overflow'
        : pct >= PROJECT_BUDGET_ZONES.warning * 100 ? 'critical'
        : pct >= PROJECT_BUDGET_ZONES.safe * 100 ? 'warning'
        : 'safe';

      const icon = zone === 'overflow' ? 'X' : zone === 'critical' ? '!' : zone === 'warning' ? '⚠' : '✓';

      if (!options.json) {
        logger.log(`  ${icon} Context: ${tokens.toLocaleString()} tokens (${pct}%) — ${zone.toUpperCase()}`);
        if (zone === 'warning') {
          logger.log(`  Suggestion: /compact before next agent activation; use /clear only for a hard reset`);
        } else if (zone === 'critical' || zone === 'overflow') {
          logger.log(`  Run: aioson context:health . for reduction options`);
        }
      }

      if (zone === 'warning' || zone === 'critical' || zone === 'overflow') {
        await emitBudgetEvent(cwd, { tokens, budget, pct, zone, agentName: agentSlug });
      }

      if (options.json) {
        return { ok: true, tokens, budget, pct, zone };
      }
      return { ok: true, tokens, budget, pct, zone };
    }

    if (!options.json) {
      logger.log(`  Budget: ${budget.toLocaleString()} tokens`);
      logger.log(`  Zones: safe=<${PROJECT_BUDGET_ZONES.safe * 100}%  warning=${PROJECT_BUDGET_ZONES.safe * 100}-${PROJECT_BUDGET_ZONES.warning * 100}%  critical=>=${PROJECT_BUDGET_ZONES.warning * 100}%`);
      logger.log(`  Use --tokens=<n> to check against budget`);
    }
    return { ok: true, budget, zones: PROJECT_BUDGET_ZONES };
  }

  if (!squadSlug) {
    logger.log('\n  Context Monitor\n');
    logger.log('  No squad specified. Use --squad=<slug> to monitor a squad.');
    logger.log('  Example: aioson context:monitor . --squad=my-squad');
    logger.log('  Or use --budget=<tokens> --tokens=<current> for project-level monitoring.');
    logger.log('');
    return { ok: true, squads: [] };
  }

  const data = await getContextUsage(cwd, squadSlug, agentSlug || null);

  if (!data) {
    logger.log(`\n  No context data found for squad: ${squadSlug}`);
    logger.log('  The squad may not have started yet or context-monitor.json is missing.');
    logger.log('');
    return { ok: true, squadSlug, agents: {} };
  }

  if (options.json) {
    return { ok: true, ...data };
  }

  logger.log(`\n  Context Monitor — ${squadSlug}\n`);

  if (agentSlug) {
    // Single agent
    const agent = data;
    logger.log(renderAgent(agentSlug, agent));
  } else {
    const agents = data.agents || {};
    if (Object.keys(agents).length === 0) {
      logger.log('  No agents tracked yet.');
    } else {
      for (const [slug, agent] of Object.entries(agents)) {
        logger.log(renderAgent(slug, agent));
      }
    }
  }

  logger.log('');
  logger.log(`  Thresholds: warning=${Math.round(THRESHOLDS.warning * 100)}%  critical=${Math.round(THRESHOLDS.critical * 100)}%`);
  if (data.updatedAt) {
    logger.log(`  Updated: ${data.updatedAt}`);
  }
  logger.log('');

  return { ok: true, ...data };
}

module.exports = { runContextMonitor };
