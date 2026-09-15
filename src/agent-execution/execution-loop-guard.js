'use strict';

const READ_ONLY_TOOLS = new Set([
  'view_file',
  'grep_search',
  'list_dir',
  'find_by_name',
  'read_resource',
  'read_url_content',
  'read',
  'grep',
  'glob',
  'list',
  'webfetch',
  'websearch'
]);

const SHELL_TOOLS = new Set(['bash', 'shell', 'run_command']);

function shellCommand(parameters) {
  if (!parameters || typeof parameters !== 'object') return '';
  return String(parameters.command || parameters.Command || parameters.CommandLine || parameters.command_line || '').trim();
}

function scanShellCommand(command) {
  const parts = [];
  let current = '';
  let quote = null;
  let escaped = false;
  let redirection = false;
  for (let index = 0; index < command.length; index += 1) {
    const character = command[index];
    if (escaped) {
      current += character;
      escaped = false;
      continue;
    }
    if (character === '\\' && quote !== "'") {
      current += character;
      escaped = true;
      continue;
    }
    if (quote) {
      current += character;
      if (character === quote) quote = null;
      continue;
    }
    if (character === "'" || character === '"' || character === '`') {
      quote = character;
      current += character;
      continue;
    }
    if (character === '>') redirection = true;
    const doubleOperator = (character === '&' || character === '|') && command[index + 1] === character;
    if (character === '|' || character === ';' || character === '\n' || doubleOperator) {
      if (current.trim()) parts.push(current.trim());
      current = '';
      if (doubleOperator) index += 1;
      continue;
    }
    current += character;
  }
  if (current.trim()) parts.push(current.trim());
  return { parts, redirection, balanced: quote === null && !escaped };
}

function readOnlyShellCommand(parameters) {
  const command = shellCommand(parameters);
  if (!command) return false;
  const scanned = scanShellCommand(command);
  if (scanned.redirection || !scanned.balanced || !scanned.parts.length) return false;
  const parts = scanned.parts;
  return parts.every((part) => {
    const value = part.trim();
    if (/^(?:rg|grep|fd|ls|dir|cat|type|head|tail|wc|pwd|Get-Content|Select-String|Get-ChildItem|Resolve-Path|Test-Path)\b/i.test(value)) return true;
    if (/^find\b/i.test(value)) return !/(?:^|\s)-(?:delete|exec|execdir|ok|okdir)\b/i.test(value);
    if (/^sed\b/i.test(value)) return !/(?:^|\s)-(?:i|[^\s]*i[^\s]*)\b/.test(value);
    return /^git\s+(?:status|diff|log|show|blame|grep|ls-files|rev-parse)\b/i.test(value);
  });
}

function toolReadOnly(tool, parameters) {
  return READ_ONLY_TOOLS.has(tool) || (SHELL_TOOLS.has(tool) && readOnlyShellCommand(parameters));
}

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
    read_only: toolReadOnly(step.tool_name, parameters),
    parameters,
    fingerprint: `${step.tool_name}:${JSON.stringify(parameters).slice(0, 4000)}`
  };
}

function opencodeTool(event) {
  const part = event?.type === 'tool_use' ? event.part : null;
  const state = part?.state;
  if (part?.type !== 'tool' || typeof part.tool !== 'string' || state?.status !== 'completed') return null;
  const parameters = state.input && typeof state.input === 'object' ? state.input : {};
  return {
    tool: part.tool,
    read_only: toolReadOnly(part.tool, parameters),
    parameters,
    fingerprint: `${part.tool}:${JSON.stringify(parameters).slice(0, 4000)}`
  };
}

function structuredTool(host, event) {
  if (host === 'antigravity') return antigravityTool(event);
  if (host === 'opencode') return opencodeTool(event);
  return null;
}

/**
 * Detect exact repeated tool requests in a supported structured session.
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
      if (tripped) return null;
      const action = structuredTool(host, event);
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

module.exports = { READ_ONLY_TOOLS, SHELL_TOOLS, shellCommand, scanShellCommand, readOnlyShellCommand, toolReadOnly, antigravityRead, antigravityTool, opencodeTool, structuredTool, createExecutionLoopGuard };
