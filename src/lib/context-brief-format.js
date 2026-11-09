'use strict';

// How `context:brief` prints its package for an agent.
//
// Every concrete agent runs the brief at activation and again before each
// phase, and its output stays in the conversation, re-sent on every later
// call. The full form (`--full`) prints each item's whole selection reason
// (a doc's description, every matched term), section outlines, and every
// constraint line, most of them quoted from the must_load files the agent
// then reads in full anyway: 7-9 KB per brief on real projects.
//
// The compact form is the default. It never drops what binds: every must_load
// path is listed with a one-line reason and its lens, every constraint,
// forbidden pattern and hint that is NOT a line of a must_load file is
// printed, gaps and the observation fan are unchanged. What goes is what the
// agent can re-derive: reasons past one line, outlines, constraint lines it
// will read in their own file, and the per-item JEV pruning list.

const MAX_REASON_CHARS = 80;

function kchars(count) {
  const n = Number(count) || 0;
  return n >= 1000 ? `${(n / 1000).toFixed(1)}k chars` : `${n} chars`;
}

// "mode:executing; load_tier:always" -> "always"; long descriptions and
// term lists shrink to what says WHY the file was chosen.
function shortReason(reason) {
  const parts = String(reason || '')
    .split(/;\s*/)
    .map((part) => part.trim())
    .filter((part) => part && !/^mode:/.test(part) && !/^description:/.test(part))
    .map((part) => {
      if (part === 'load_tier:always') return 'always';
      const list = /^([a-z_-]+):(.*)$/.exec(part);
      if (!list || !list[2].includes(',')) return part;
      const terms = list[2].split(',').filter(Boolean);
      return `${list[1]}:${terms.slice(0, 3).join(',')}${terms.length > 3 ? ',…' : ''}`;
    });
  const text = parts.join('; ') || 'selected';
  return text.length > MAX_REASON_CHARS ? `${text.slice(0, MAX_REASON_CHARS - 1)}…` : text;
}

function compactHint(item) {
  if (item.read === 'lens') {
    return `your lens: lines ${item.focus.map((entry) => entry.lines).join(', ')} of ${item.lines}`;
  }
  if (item.read === 'sections') {
    return `${kchars(item.chars)}; read lines ${item.focus.map((entry) => entry.lines).join(', ')}`;
  }
  if (item.read === 'outline') {
    return `${kchars(item.chars)}; no section matches the task, pick one by heading`;
  }
  return item.chars ? kchars(item.chars) : '';
}

// The full form: every reason, outline and constraint line, as printed before
// the compact default existed.
function formatReadHint(item) {
  if (item.read === 'lens') {
    return [`your lens — read lines ${item.focus.map((entry) => entry.lines).join(', ')} of ${item.lines}; skip ${item.skipped_sections.join(' | ')} (addressed to other agents)`];
  }
  if (item.read === 'sections') {
    return [`large (${item.chars} chars) — read only: ${item.focus.map((entry) => `lines ${entry.lines} "${entry.heading}"`).join('; ')}`];
  }
  if (item.read === 'outline') {
    return [`large (${item.chars} chars), no section matches the task — pick from: ${item.outline.join(' | ')}`];
  }
  return [];
}

function fullBriefLines(result) {
  const out = [];
  out.push(`Context brief for @${result.agent} (${result.mode})`);
  if (result.task) out.push(`Task: ${result.task}`);
  out.push(`Intent: ${result.intent.operation}${result.intent.stack ? ` / ${result.intent.stack}` : ''}`);
  if (result.intent.concerns.length > 0) out.push(`Concerns: ${result.intent.concerns.join(', ')}`);
  out.push(`Confidence: ${result.confidence}`);

  if (result.must_load.length > 0) {
    out.push('Must load:');
    for (const item of result.must_load) {
      out.push(`- ${item.path} [${item.surface}] ${item.reason}`);
      for (const line of formatReadHint(item)) out.push(`    ${line}`);
    }
  }
  if (result.should_load.length > 0) {
    const budget = result.load_budget;
    const cost = budget && budget.should_load_chars > 0
      ? ` (~${budget.should_load_chars} chars whole; ~${budget.should_load_focused_chars} reading only the listed sections)`
      : '';
    out.push(`Should load when needed${cost}:`);
    for (const item of result.should_load) {
      out.push(`- ${item.path} [${item.surface}] ${item.reason}`);
      for (const line of formatReadHint(item)) out.push(`    ${line}`);
    }
  }
  if (result.skills && result.skills.length > 0) {
    out.push('Matching skills (load per your kernel skill contract):');
    for (const item of result.skills) out.push(`- ${item.path} ${item.reason}`);
  }
  if (result.jev_filter && result.jev_filter.status === 'used' && result.pruned.length > 0) {
    out.push(`Pruned by JEV (${result.pruned.length} of ${result.jev_filter.offered} optional, below noul ${result.jev_filter.min_noul}) — not needed for this task:`);
    for (const item of result.pruned) out.push(`- ${item.path} (${item.noul})`);
  }
  if (result.constraints.length > 0) {
    out.push('Constraints:');
    for (const item of result.constraints.slice(0, 8)) out.push(`- ${item}`);
  }
  if (result.forbidden_patterns.length > 0) {
    out.push('Forbidden patterns:');
    for (const item of result.forbidden_patterns.slice(0, 8)) out.push(`- ${item}`);
  }
  if (result.verification_hints.length > 0) {
    out.push('Verification hints:');
    for (const item of result.verification_hints.slice(0, 8)) out.push(`- ${item}`);
  }
  if (result.gaps.length > 0) {
    out.push('Gaps:');
    for (const gap of result.gaps) out.push(`- ${gap.code}: ${gap.message}`);
  }
  if (result.related && result.related.length > 0) {
    out.push('Related (recall — history/archive select cannot see):');
    for (const item of result.related) out.push(`- ${item.path} [${item.source_type}] ${item.reason || ''}`);
  }
  return out;
}

function compactBriefLines(result) {
  const out = [];
  const quoted = result.quotedFromMustLoad instanceof Set ? result.quotedFromMustLoad : new Set();
  const intent = `${result.intent.operation}${result.intent.stack ? ` / ${result.intent.stack}` : ''}`;
  out.push(`Context brief for @${result.agent} (${result.mode}) · ${intent} · confidence: ${result.confidence}`);

  if (result.must_load.length > 0) {
    out.push(`Must load (binding — read each in full before acting, ${result.must_load.length}):`);
    for (const item of result.must_load) {
      const hint = item.read === 'lens' ? ` [${compactHint(item)}]` : '';
      out.push(`- ${item.path} — ${shortReason(item.reason)}${hint}`);
    }
  }
  if (result.should_load.length > 0) {
    const budget = result.load_budget;
    const cost = budget && budget.should_load_chars > 0
      ? `; ~${budget.should_load_chars} chars whole, ~${budget.should_load_focused_chars} by the listed lines`
      : '';
    out.push(`Should load only when a decision needs it (${result.should_load.length}${cost}):`);
    for (const item of result.should_load) {
      const hint = compactHint(item);
      out.push(`- ${item.path}${hint ? ` (${hint})` : ''}`);
    }
  }
  if (result.skills && result.skills.length > 0) {
    out.push(`Matching skills (load per your kernel skill contract): ${result.skills.map((item) => item.path).join(', ')}`);
  }
  if (result.jev_filter && result.jev_filter.status === 'used' && result.pruned.length > 0) {
    out.push(`Pruned by JEV: ${result.pruned.length} of ${result.jev_filter.offered} optional, not needed for this task.`);
  }

  let omitted = 0;
  for (const [label, items] of [
    ['Constraints', result.constraints],
    ['Forbidden patterns', result.forbidden_patterns],
    ['Verification hints', result.verification_hints]
  ]) {
    const shown = items.slice(0, 8);
    const own = shown.filter((item) => !quoted.has(item));
    omitted += shown.length - own.length;
    if (own.length === 0) continue;
    out.push(`${label}:`);
    for (const item of own) out.push(`- ${item}`);
  }

  if (result.gaps.length > 0) {
    out.push('Gaps:');
    for (const gap of result.gaps) out.push(`- ${gap.code}: ${gap.message}`);
  }
  if (result.related && result.related.length > 0) {
    out.push(`Related (recall — history/archive select cannot see): ${result.related.map((item) => item.path).join(', ')}`);
  }
  const tail = omitted > 0 ? `${omitted} constraint/forbidden/hint line(s) are quoted from must_load files and omitted; ` : '';
  out.push(`(${tail}\`--full\` prints every reason, outline and line.)`);
  return out;
}

module.exports = { compactBriefLines, fullBriefLines, shortReason };
