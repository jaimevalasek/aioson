'use strict';

const READ_ONLY_TOOLS = new Set([
  'view_file',
  'grep_search',
  'list_dir',
  'find_by_name',
  'read_resource',
  'read_url_content'
]);

function antigravityRead(event) {
  const step = event?.event === 'step_update' ? event.step_update : null;
  if (!step || step.state !== 'ACTIVE' || step.step_type !== 'tool' || !READ_ONLY_TOOLS.has(step.tool_name)) return null;
  const parameters = step.tool_info?.parameters && typeof step.tool_info.parameters === 'object'
    ? step.tool_info.parameters
    : {};
  return {
    tool: step.tool_name,
    fingerprint: `${step.tool_name}:${JSON.stringify(parameters).slice(0, 4000)}`
  };
}

/**
 * Detect exact repeated read requests in a structured Antigravity session.
 * Model replies and tool completion events are ignored, so the next actual
 * read request is compared with the preceding one. Any different read resets
 * the streak. Six identical requests is enough evidence that another model
 * should take over without waiting for the whole unit timeout.
 */
function createExecutionLoopGuard(host, { threshold = 6, onLoop = null } = {}) {
  let previous = null;
  let repeats = 0;
  let tripped = false;
  return {
    observe(event) {
      if (tripped || host !== 'antigravity') return null;
      const read = antigravityRead(event);
      if (!read) return null;
      if (read.fingerprint === previous) repeats += 1;
      else { previous = read.fingerprint; repeats = 1; }
      if (repeats < threshold) return null;
      tripped = true;
      const detail = { host, tool: read.tool, repeats, threshold, fingerprint: read.fingerprint.slice(0, 500) };
      onLoop?.(detail);
      return 'unproductive_loop';
    },
    get repeats() { return repeats; },
    get tripped() { return tripped; }
  };
}

module.exports = { READ_ONLY_TOOLS, antigravityRead, createExecutionLoopGuard };
