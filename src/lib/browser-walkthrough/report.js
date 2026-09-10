'use strict';

/**
 * Report shaping: per-id roll-up, the derived production-path smoke, the
 * Markdown rendering beside the JSON, and where a report lives.
 */

const path = require('node:path');

const { clip } = require('./script');

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

function rollupIds(steps, stoppedAt) {
  const ids = {};
  for (const step of steps) {
    for (const id of step.ids || []) {
      if (!ids[id]) ids[id] = { status: 'pass', steps: [], error: null };
      ids[id].steps.push(step.index);
      if (!step.ok) {
        ids[id].status = 'fail';
        if (!ids[id].error) ids[id].error = step.error || 'step failed';
      }
    }
  }
  return ids;
}

function rollupUnreached(script, executed, ids) {
  const executedIndexes = new Set(executed.map((s) => s.index));
  for (const step of script.steps) {
    if (executedIndexes.has(step.index)) continue;
    for (const id of step.ids) {
      if (!ids[id]) ids[id] = { status: 'not_reached', steps: [step.index], error: null };
      else if (ids[id].status === 'pass') { ids[id].status = 'partial'; ids[id].steps.push(step.index); } else if (!ids[id].steps.includes(step.index)) ids[id].steps.push(step.index);
    }
  }
  return ids;
}

function deriveSmoke(steps) {
  const entry = steps.find((s) => s.do === 'goto' && s.ok);
  const trigger = steps.find((s) => ['click', 'dblclick', 'fill', 'type', 'press', 'select', 'check', 'uncheck'].includes(s.do) && s.ok);
  const boundary = steps.filter((s) => s.boundary && s.boundary.hit).map((s) => s.boundary.detail);
  const visible = steps.filter((s) => s.do === 'expect' && s.ok).map((s) => s.expected);
  const state = steps.filter((s) => s.ok && (s.do === 'eval' || (s.do === 'expect' && steps.some((r) => r.index < s.index && (r.do === 'reload' || r.do === 'goto') && r.index > (trigger ? trigger.index : -1))))).map((s) => s.detail);
  return {
    entry: entry ? entry.url || entry.detail : '',
    trigger: trigger ? trigger.detail : '',
    boundary: boundary.join('; '),
    state: state.join('; '),
    visible: visible.join('; ')
  };
}

function buildMarkdown(report) {
  const lines = [];
  lines.push(`# Browser walkthrough — ${report.name}`);
  lines.push('');
  lines.push(`- Verdict: **${report.ok ? 'PASS' : 'FAIL'}** (${report.steps.filter((s) => s.ok).length}/${report.steps.length} steps executed ok${report.stopped_at !== null ? `, stopped at step ${report.stopped_at}` : ''})`);
  lines.push(`- Target: ${report.target.url} (${report.target.kind}, scope ${report.scope})`);
  lines.push(`- Browser: ${report.browser.label}${report.browser.version ? ` ${report.browser.version}` : ''}`);
  lines.push(`- Script: ${report.script.path} (sha256 ${report.script.sha256.slice(0, 12)})`);
  lines.push(`- Replay: \`${report.replay}\``);
  if (report.superseded_artifacts && report.superseded_artifacts.kept > 0) {
    lines.push(`- Artifacts: ${report.superseded_artifacts.kept} file(s) from the previous run could not be cleared and sit beside this run's (${report.superseded_artifacts.files} cleared) — see Warnings`);
  } else if (report.superseded_artifacts && report.superseded_artifacts.files > 0) {
    lines.push(`- Artifacts: the folder holds this run only (${report.superseded_artifacts.files} file(s), ${Math.round(report.superseded_artifacts.bytes / 1024)} KB from the previous run cleared)`);
  }
  lines.push('');
  const ids = Object.keys(report.ids);
  if (ids.length > 0) {
    lines.push('## Ids proven');
    lines.push('');
    lines.push('| Id | Status | Steps | Error |');
    lines.push('|---|---|---|---|');
    for (const id of ids) {
      const row = report.ids[id];
      lines.push(`| ${id} | ${row.status.toUpperCase()} | ${row.steps.join(', ')} | ${row.error ? clip(row.error, 160).replace(/\|/g, '\\|') : ''} |`);
    }
    lines.push('');
  }
  lines.push('## Production-path smoke (derived)');
  lines.push('');
  lines.push(`- Entry: ${report.smoke.entry || '(none)'}`);
  lines.push(`- Trigger: ${report.smoke.trigger || '(none)'}`);
  lines.push(`- Real boundary: ${report.smoke.boundary || '(no boundary step proven)'}`);
  lines.push(`- State change: ${report.smoke.state || '(no post-action state check)'}`);
  lines.push(`- Visible result: ${report.smoke.visible || '(no expect proven)'}`);
  lines.push('');
  lines.push('## Steps');
  lines.push('');
  lines.push('| # | Action | Ids | Result | Detail | ms |');
  lines.push('|---|---|---|---|---|---|');
  for (const step of report.steps) {
    const detail = step.ok ? step.detail : `${step.error || step.detail}`;
    lines.push(`| ${step.index} | ${step.do}${step.target ? ` ${clip(step.target, 60)}` : ''} | ${(step.ids || []).join(', ')} | ${step.ok ? 'ok' : 'FAIL'} | ${clip(detail, 200).replace(/\|/g, '\\|').replace(/\r?\n/g, ' ')} | ${step.ms} |`);
  }
  lines.push('');
  if (report.console.errors > 0 || report.console.page_errors > 0) {
    lines.push(`## Console: ${report.console.errors} errors, ${report.console.warnings} warnings, ${report.console.page_errors} page errors`);
    lines.push('');
    for (const sample of report.console.samples) lines.push(`- [${sample.type}] ${clip(sample.text, 200)}`);
    lines.push('');
  }
  if (report.network.failed > 0) {
    lines.push(`## Network: ${report.network.requests} requests, ${report.network.failed} failed`);
    lines.push('');
  }
  if (report.warnings.length > 0) {
    lines.push('## Warnings');
    lines.push('');
    for (const warning of report.warnings) lines.push(`- ${warning}`);
    lines.push('');
  }
  if (report.injection && report.injection.count > 0) {
    lines.push('## Injection scan (advisory — what the page said, read as data, never as a step)');
    lines.push('');
    const families = Object.entries(report.injection.families).map(([family, count]) => `${family} ×${count}`).join(', ');
    lines.push(`- Flagged: ${report.injection.count} (${families})${report.injection.hidden_chars > 0 ? `; ${report.injection.hidden_chars} invisible character(s) removed before matching` : ''}`);
    for (const sample of report.injection.samples) lines.push(`- ${sample.source} [${sample.family}]: "${clip(sample.excerpt, 200).replace(/\r?\n/g, ' ')}"`);
    lines.push('');
  }
  const failed = report.steps.find((s) => !s.ok);
  if (failed && failed.failure_snapshot) {
    lines.push('## Page at failure (aria snapshot)');
    lines.push('');
    lines.push('```');
    lines.push(failed.failure_snapshot.preview);
    lines.push('```');
    lines.push('');
  }
  return `${lines.join('\n')}\n`;
}

function reportDir(targetDir, { slug, scope, out }) {
  if (out) return path.resolve(targetDir, out);
  if (!slug) return path.join(targetDir, '.aioson', 'context', 'browser');
  if (scope === 'prototype') return path.join(targetDir, '.aioson', 'briefings', slug, 'browser');
  return path.join(targetDir, '.aioson', 'context', 'features', slug, 'browser');
}

function toRel(targetDir, file) {
  return path.relative(targetDir, file).split(path.sep).join('/');
}

module.exports = {
  rollupIds,
  rollupUnreached,
  deriveSmoke,
  buildMarkdown,
  reportDir,
  toRel
};
