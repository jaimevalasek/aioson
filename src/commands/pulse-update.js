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
 *   aioson pulse:update . --feature=checkout   # moves only active_feature
 */

const fs = require('node:fs/promises');
const path = require('node:path');
const { contextDir, readFileSafe, parseFrontmatter, parseFeaturesMap } = require('../preflight-engine');
const { resolveTargetDir } = require('../lib/project-root');
const { isNone } = require('./feature-current');

function nowDate() {
  return new Date().toISOString().slice(0, 10);
}

// The workflow binding follows project-pulse.md `active_feature` only for a
// feature in_progress in features.md (detectWorkflowMode). A pulse naming
// anything else moves feature:current and leaves the binding where it was —
// no command could move it, and none said why.
async function inspectWorkflowBinding(targetDir, slug) {
  if (!slug || isNone(slug)) return null;
  const features = parseFeaturesMap(await readFileSafe(path.join(contextDir(targetDir), 'features.md')));
  const status = features.has(slug) ? features.get(slug) : null;
  if (status === 'in_progress') return { follows: true, feature_status: status };
  return {
    follows: false,
    feature_status: status,
    warning: status
      ? `${slug} is "${status}" in features.md, not in_progress — feature:current follows the pulse, but the workflow binding does not until its row is in_progress`
      : `${slug} is not listed in features.md — feature:current follows the pulse, but the workflow binding only follows a feature in_progress there`
  };
}

// `aioson pulse:update . --feature=<slug>` is the command the workflow's
// binding-mismatch error prints, and it died on `--agent is required` (exit
// 1, pulse unchanged). The agent belongs to the session record (last_agent,
// the activity line, active_work); moving the registry needs none of it, so
// --feature alone rewrites active_feature (and its Status line) and keeps
// everything else as it was.
async function moveActiveFeature(targetDir, slug, options, logger) {
  const pulsePath = path.join(contextDir(targetDir), 'project-pulse.md');
  const existing = await readFileSafe(pulsePath);
  const previous = existing ? parseFrontmatter(existing).active_feature || null : null;
  const frontmatter = existing ? existing.match(/^---\r?\n([\s\S]*?)\r?\n---/) : null;
  let content;
  if (frontmatter) {
    const eol = frontmatter[0].includes('\r\n') ? '\r\n' : '\n';
    const lines = frontmatter[1].split(/\r?\n/);
    const index = lines.findIndex((line) => /^active_feature\s*:/.test(line));
    if (index === -1) lines.push(`active_feature: ${slug}`);
    else lines[index] = `active_feature: ${slug}`;
    content = `---${eol}${lines.join(eol)}${eol}---${existing.slice(frontmatter[0].length)}`
      .replace(/^(- \*\*Active feature:\*\* ).*$/m, (_line, label) => `${label}${slug}`);
  } else {
    content = `---\nlast_updated: ${nowDate()}\nactive_feature: ${slug}\n---\n\n${existing || '# Project Pulse\n'}`;
  }
  await fs.mkdir(path.dirname(pulsePath), { recursive: true });
  await fs.writeFile(pulsePath, content, 'utf8');

  const binding = await inspectWorkflowBinding(targetDir, slug);
  const result = {
    ok: true,
    path: path.relative(targetDir, pulsePath),
    active_feature: slug,
    previous_active_feature: previous,
    workflow_binding: binding
  };
  if (options.json) return result;
  logger.log(`Project pulse: active_feature → ${slug}${previous && previous !== slug ? ` (was ${previous})` : ''}`);
  if (binding && binding.follows) logger.log('  workflow binding: follows on the next workflow:next / workflow:status (the previous feature\'s progress is archived, and restored on return)');
  if (binding && !binding.follows) logger.log(`  warning: ${binding.warning}`);
  return result;
}

async function runPulseUpdate({ args, options = {}, logger }) {
  const targetDir = resolveTargetDir(args);
  const agent = options.agent ? String(options.agent) : null;
  const slug = options.feature ? String(options.feature) : null;
  const gate = options.gate ? String(options.gate) : null;
  const action = options.action ? String(options.action) : null;
  const next = options.next ? String(options.next) : null;
  const phase = options.phase ? String(options.phase) : null;
  const verdict = options.verdict ? String(options.verdict).toUpperCase() : null;

  if (!agent) {
    if (slug && options.feature !== true && !gate && !action && !next && !phase && !verdict) {
      return moveActiveFeature(targetDir, slug.trim(), options, logger);
    }
    if (options.json) return { ok: false, reason: 'missing_agent' };
    logger.log('--agent is required to record a session (--gate/--action/--next/--phase/--verdict). Example: aioson pulse:update . --agent=dev --feature=checkout — to move only the active feature: aioson pulse:update . --feature=<slug>');
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

  const binding = await inspectWorkflowBinding(targetDir, slug);
  const result = {
    ok: true,
    path: path.relative(targetDir, pulsePath),
    last_agent: agent,
    last_gate: gate,
    active_feature: slug,
    active_work: activeWork,
    next_recommendation: nextRec,
    workflow_binding: binding
  };

  if (options.json) return result;

  logger.log('Project pulse updated:');
  logger.log(`  last_agent: ${agent}`);
  if (gate) logger.log(`  last_gate: ${gate}`);
  if (slug) logger.log(`  active_work: ${activeWork}`);
  logger.log(`  Recent activity: +1 entry (kept last 3)`);
  if (next) logger.log(`  Next: ${next}`);
  // A session record routinely names a feature before its features.md row
  // exists (briefing, project-level work); the warning is for a listed
  // feature the binding will not follow.
  if (binding && !binding.follows && binding.feature_status) logger.log(`  warning: ${binding.warning}`);

  return result;
}

module.exports = { runPulseUpdate };
