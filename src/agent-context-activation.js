'use strict';

const { buildContextBrief } = require('./context-brief');

function compactReason(reason, maxLength = 180) {
  const value = String(reason || '').trim();
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength - 1).trimEnd()}…`;
}

function formatItems(items, limit = Infinity) {
  return (items || []).slice(0, limit).map((item) => {
    const reason = compactReason(item.reason);
    const line = reason ? `- ${item.path} — ${reason}` : `- ${item.path}`;
    // Large optional files carry the line ranges that match the task.
    if (item.read === 'sections') return `${line} [read only lines ${item.focus.map((entry) => entry.lines).join(', ')} of ${item.lines}]`;
    if (item.read === 'lens') return `${line} [your lens: read lines ${item.focus.map((entry) => entry.lines).join(', ')} of ${item.lines}; the rest is addressed to other agents]`;
    if (item.read === 'outline') return `${line} [large: ${item.chars} chars — read by heading, not whole]`;
    return line;
  });
}

function formatContextActivation(brief) {
  if (!brief || !brief.task) return '';
  const lines = [
    '## Generated context retrieval — planning',
    '',
    `Task: ${brief.task}`,
    'This package satisfies the planning retrieval pass. Load every `must_load` path before acting.',
    'When concrete read/write paths become known, rerun `context:brief --mode=executing --paths=<exact paths>` before inspection or mutation.'
  ];

  if (brief.must_load && brief.must_load.length > 0) {
    lines.push('', 'Must load:', ...formatItems(brief.must_load));
  }
  if (brief.should_load && brief.should_load.length > 0) {
    lines.push('', 'Load only if the named decision needs it:', ...formatItems(brief.should_load, 5));
  }
  // The brief routes skills on their own declared signals; dropping them here
  // made a matched skill invisible to the agent it was selected for.
  if (brief.skills && brief.skills.length > 0) {
    lines.push('', 'Skills matching this task (open the router when its technique fits the work):', ...formatItems(brief.skills, 6));
  }
  if (brief.constraints && brief.constraints.length > 0) {
    lines.push('', 'Immediate constraints:', ...brief.constraints.slice(0, 6).map((item) => `- ${item}`));
  }
  if (brief.forbidden_patterns && brief.forbidden_patterns.length > 0) {
    lines.push('', 'Forbidden patterns:', ...brief.forbidden_patterns.slice(0, 4).map((item) => `- ${item}`));
  }
  if (brief.gaps && brief.gaps.length > 0) {
    lines.push('', 'Retrieval gaps:', ...brief.gaps.map((gap) => `- ${gap.code}: ${gap.message}`));
  }
  return lines.join('\n');
}

async function buildAgentContextActivation(targetDir, options = {}) {
  const task = String(options.task || options.goal || '').trim();
  if (!task) return '';
  try {
    const brief = await buildContextBrief(targetDir, {
      agent: options.agent || 'dev',
      mode: options.mode || 'planning',
      task,
      paths: options.paths || '',
      feature: options.feature || '',
      recall: false
    });
    return formatContextActivation(brief);
  } catch {
    return [
      '## Generated context retrieval — unavailable',
      '',
      'The gateway could not build the planning package. Before acting, run `context:brief` manually for the current agent/task; rerun it in executing mode when exact paths are known.'
    ].join('\n');
  }
}

module.exports = {
  buildAgentContextActivation,
  formatContextActivation
};
