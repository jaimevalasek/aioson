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

function antigravityTool(event) {
  const step = event?.event === 'step_update' ? event.step_update : null;
  if (!step || step.state !== 'ACTIVE' || step.step_type !== 'tool' || typeof step.tool_name !== 'string') return null;
  const parameters = step.tool_info?.parameters && typeof step.tool_info.parameters === 'object'
    ? step.tool_info.parameters
    : {};
  return {
    tool: step.tool_name,
    read_only: READ_ONLY_TOOLS.has(step.tool_name),
    fingerprint: `${step.tool_name}:${JSON.stringify(parameters).slice(0, 4000)}`
  };
}

/**
 * Detect exact repeated tool requests in a structured Antigravity session.
 * Model replies and tool completion events are ignored, so the next actual
 * action is compared with the preceding one. A mutating/verification tool
 * resets the read-only investigation streak, but four identical calls to that
 * tool are themselves a loop (for example, rerunning the same failing command
 * without an edit). Four identical actions, or 24 read-only actions without
 * any progress action, is enough evidence that another model should take over.
 */
function createExecutionLoopGuard(host, { threshold = 4, readThreshold = 24, onLoop = null } = {}) {
  let previous = null;
  let repeats = 0;
  let readsSinceProgress = 0;
  let tripped = false;
  return {
    observe(event) {
      if (tripped || host !== 'antigravity') return null;
      const action = antigravityTool(event);
      if (!action) return null;
      if (action.fingerprint === previous) repeats += 1;
      else { previous = action.fingerprint; repeats = 1; }
      if (action.read_only) readsSinceProgress += 1;
      else readsSinceProgress = 0;
      if (repeats < threshold && readsSinceProgress < readThreshold) return null;
      tripped = true;
      const kind = repeats >= threshold ? (action.read_only ? 'repeated_read' : 'repeated_action') : 'read_only_churn';
      const detail = {
        host,
        kind,
        tool: action.tool,
        repeats,
        threshold,
        read_actions: readsSinceProgress,
        read_threshold: readThreshold,
        fingerprint: action.fingerprint.slice(0, 500)
      };
      onLoop?.(detail);
      return 'unproductive_loop';
    },
    get repeats() { return repeats; },
    get readsSinceProgress() { return readsSinceProgress; },
    get tripped() { return tripped; }
  };
}

module.exports = { READ_ONLY_TOOLS, antigravityRead, antigravityTool, createExecutionLoopGuard };
