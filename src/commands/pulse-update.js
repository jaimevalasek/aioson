'use strict';

/**
 * aioson pulse:update — update project-pulse.md at session end.
 *
 * Replaces the manual project-pulse.md editing block in 7+ agents.
 * Keeps last 3 recent activity entries.
 *
 * Usage:
 *   aioson pulse:update . --agent=dev --feature=checkout --gate="Gate C: approved" \
 *     --action="Implemented payment webhook handler" --next="Continue with phase 4"
 *   aioson pulse:update . --agent=qa --verdict=PASS --feature=checkout
 */

const fs = require('node:fs/promises');
const path = require('node:path');
const { contextDir, readFileSafe, parseFrontmatter } = require('../preflight-engine');

function nowDate() {
  return new Date().toISOString().slice(0, 10);
}

async function runPulseUpdate({ args, options = {}, logger }) {
  const targetDir = path.resolve(process.cwd(), args[0] || '.');
  const agent = options.agent ? String(options.agent) : null;
  const slug = options.feature ? String(options.feature) : null;
  const gate = options.gate ? String(options.gate) : null;
  const action = options.action ? String(options.action) : null;
  const next = options.next ? String(options.next) : null;
  const phase = options.phase ? String(options.phase) : null;
  const verdict = options.verdict ? String(options.verdict).toUpperCase() : null;

  if (!agent) {
    if (options.json) return { ok: false, reason: 'missing_agent' };
    logger.log('--agent is required. Example: aioson pulse:update . --agent=dev --feature=checkout');
    return { ok: false };
  }

  const pulsePath = path.join(contextDir(targetDir), 'project-pulse.md');
  const existing = await readFileSafe(pulsePath);

  // Parse existing frontmatter
  const fm = existing ? parseFrontmatter(existing) : {};

  // Extract existing recent_activity lines (keep last 2 to add 1 new = 3 total)
  const existingActivities = [];
  if (existing) {
    const activityMatch = existing.match(/## Recent Activity\r?\n([\s\S]*?)(?=\r?\n##|\s*$)/);
    if (activityMatch) {
      const lines = activityMatch[1].split(/\r?\n/).filter((l) => l.trim().startsWith('-'));
      existingActivities.push(...lines.slice(-2));
    }
  }

  // Build new activity line
  const today = nowDate();
  let activityLine = `- ${today} @${agent}`;
  if (slug) activityLine += ` → ${slug}`;
  if (phase) activityLine += ` phase ${phase}`;
  if (gate) activityLine += ` (${gate})`;
  if (verdict) activityLine += ` VERDICT: ${verdict}`;
  if (action) activityLine += `: ${action}`;

  const recentActivities = [...existingActivities, activityLine];

  // Build active work entry
  let activeWork = fm.active_work || '';
  if (slug) {
    const phaseStr = phase ? ` → phase ${phase}` : '';
    const statusStr = verdict ? (verdict === 'PASS' ? 'done' : 'in_progress') : 'in_progress';
    activeWork = `${slug}${phaseStr} → @${agent} → ${statusStr}`;
  }

  // Build next recommendation
  const nextRec = next || fm.next_recommendation || '';

  // Write pulse file
  const lines = [
    '---',
    `last_updated: ${today}`,
    `last_agent: ${agent}`,
    gate ? `last_gate: ${gate}` : (fm.last_gate ? `last_gate: ${fm.last_gate}` : null),
    slug ? `active_feature: ${slug}` : (fm.active_feature ? `active_feature: ${fm.active_feature}` : null),
    activeWork ? `active_work: "${activeWork}"` : null,
    'blockers: none',
    nextRec ? `next_recommendation: "${nextRec}"` : null,
    '---',
    '',
    '# Project Pulse',
    '',
    '## Status',
    '',
    `- **Last agent:** @${agent}`,
    gate ? `- **Last gate:** ${gate}` : null,
    slug ? `- **Active feature:** ${slug}` : null,
    activeWork ? `- **Active work:** ${activeWork}` : null,
    nextRec ? `- **Next:** ${nextRec}` : null,
    '',
    '## Recent Activity',
    '',
    ...recentActivities,
    ''
  ].filter((l) => l !== null);

  await fs.mkdir(path.dirname(pulsePath), { recursive: true });
  await fs.writeFile(pulsePath, lines.join('\n'), 'utf8');

  const result = {
    ok: true,
    path: path.relative(targetDir, pulsePath),
    last_agent: agent,
    last_gate: gate,
    active_feature: slug,
    active_work: activeWork,
    next_recommendation: nextRec
  };

  if (options.json) return result;

  logger.log('Project pulse updated:');
  logger.log(`  last_agent: ${agent}`);
  if (gate) logger.log(`  last_gate: ${gate}`);
  if (slug) logger.log(`  active_work: ${activeWork}`);
  logger.log(`  Recent activity: +1 entry (kept last 3)`);
  if (next) logger.log(`  Next: ${next}`);

  return result;
}

module.exports = { runPulseUpdate };
