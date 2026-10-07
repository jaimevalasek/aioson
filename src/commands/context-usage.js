'use strict';

const { resolveTargetDir } = require('../lib/project-root');
const { collectContextUsage } = require('../lib/context-usage');
const { collectGuardOutcomes } = require('../lib/guard-outcomes');

// Offered → honored: what the guard injected at write time, and whether the
// measured violations it carried were fixed or are still in the files.
function logGuardOutcomes(logger, guard) {
  if (!guard || !guard.available || guard.totals.injections === 0) return;
  const { totals } = guard;
  logger.log(`Guard at write time: ${totals.injections} injection${totals.injections === 1 ? '' : 's'} — measured violations fixed ${totals.violations_fixed}, still present ${totals.violations_still_present}${totals.violations_file_gone ? `, file gone ${totals.violations_file_gone}` : ''}.`);
  for (const rule of guard.rules.slice(0, 10)) {
    const outcome = rule.with_violations > 0 ? ` · violations fixed ${rule.fixed} / still present ${rule.still_present}` : '';
    logger.log(`- ${rule.path}: injected ${rule.injections}${outcome}`);
  }
}

// `aioson context:usage [dir] [--since=<days>] [--feature=<slug>] [--json]`
//
// Advisory reader over the knowledge-routing telemetry: what the briefs
// selected, what the agents confirmed loading, who closed sessions without a
// brief, and which active skills the window never routed. Always exit 0 — a
// missing runtime store is "nothing recorded", not a failure.
async function runContextUsageCommand({ args, options = {}, logger }) {
  const targetDir = resolveTargetDir(args);
  const report = await collectContextUsage(targetDir, { since: options.since, feature: options.feature });
  if (report.available) report.guard = await collectGuardOutcomes(targetDir, { sinceDays: report.since_days });
  report.exitCode = 0;
  if (options.json) return report;

  if (!report.available) {
    logger.log('Context usage: no runtime store yet — nothing recorded. Run `aioson runtime:init .`; every `context:brief` and `context:load` then leaves a row this command reads.');
    return report;
  }

  const scope = report.feature ? `, feature ${report.feature}` : '';
  logger.log(`Context usage (last ${report.since_days} days${scope}): ${report.totals.briefs} brief${report.totals.briefs === 1 ? '' : 's'} · ${report.totals.loads} load${report.totals.loads === 1 ? '' : 's'} · ${report.totals.dones} session end${report.totals.dones === 1 ? '' : 's'}.`);

  if (report.agents.length > 0) {
    logger.log('Agents (briefs / loads / session ends):');
    for (const entry of report.agents) {
      logger.log(`- @${entry.agent}: ${entry.briefs} / ${entry.loads} / ${entry.dones}`);
    }
  }

  if (report.artifacts.length > 0) {
    logger.log('Artifacts (selected by a brief × confirmed loads):');
    for (const entry of report.artifacts.slice(0, 20)) {
      logger.log(`- ${entry.path}: ${entry.selected} × ${entry.loaded}${entry.sections.length > 0 ? ` [${entry.sections.join(', ')}]` : ''}`);
    }
    if (report.artifacts.length > 20) logger.log(`  … and ${report.artifacts.length - 20} more (use --json for the full list).`);
  }

  const { flags } = report;
  if (flags.done_without_brief.length > 0) {
    logger.log(`Sessions closed without a brief (kernel mandates context:brief): ${flags.done_without_brief.map((agent) => `@${agent}`).join(', ')} — routed knowledge was reachable but never asked for.`);
  }
  if (flags.sessions_without_brief && flags.sessions_without_brief.length > 0) {
    logger.log(`Sessions closed without a brief since the previous close: ${flags.sessions_without_brief.map((entry) => `@${entry.agent} ${entry.without_brief}/${entry.dones}`).join(', ')} — rules and docs for those sessions were never routed.`);
  }
  if (flags.generic_brief_sessions && flags.generic_brief_sessions.length > 0) {
    logger.log(`Sessions whose only brief named workflow words (no domain rule could match): ${flags.generic_brief_sessions.map((entry) => `@${entry.agent} ${entry.generic_only}/${entry.dones}`).join(', ')} — brief with the surfaces being built, in domain words, plus --paths.`);
  }
  if (flags.loaded_never_selected.length > 0) {
    logger.log('Loaded but never offered by a brief (routing gap — the agent needed it and the selector did not surface it):');
    for (const relPath of flags.loaded_never_selected.slice(0, 10)) {
      logger.log(`- ${relPath}  → aioson context:select . --agent=<agent> --task="<the task>" --explain=${relPath}`);
    }
  }
  if (flags.selected_never_loaded.length > 0) {
    logger.log('Offered repeatedly, never confirmed loaded:');
    for (const relPath of flags.selected_never_loaded.slice(0, 10)) logger.log(`- ${relPath}`);
  }
  if (flags.skills_never_selected.length > 0) {
    logger.log(`Active skills no brief selected in the window (trigger review or retirement candidates — cross-check with \`aioson skill:audit . --usage\`): ${flags.skills_never_selected.map((skill) => skill.id).join(', ')}`);
  }
  logGuardOutcomes(logger, report.guard);
  for (const caveat of report.caveats) logger.log(`note: ${caveat}`);
  return report;
}

module.exports = { runContextUsageCommand };
