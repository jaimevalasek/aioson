'use strict';

const SUPPORTED_PROMPT_TOOLS = new Set(['codex', 'claude', 'opencode']);

function resolvePromptTool(value) {
  const normalized = String(value || '')
    .trim()
    .toLowerCase();

  if (SUPPORTED_PROMPT_TOOLS.has(normalized)) {
    return normalized;
  }

  return 'codex';
}

module.exports = {
  SUPPORTED_PROMPT_TOOLS,
  resolvePromptTool
};
