'use strict';
const MATRIX = {
  claude: { native_subagent: false, fresh_session: false, external_process: true, additional_workspaces: true, model_catalog: false, reasoning_effort: false, executable: 'claude' },
  codex: { native_subagent: false, fresh_session: false, external_process: true, additional_workspaces: true, model_catalog: true, reasoning_effort: true, executable: 'codex' },
  opencode: { native_subagent: false, fresh_session: false, external_process: true, additional_workspaces: false, model_catalog: false, reasoning_effort: false, executable: 'opencode' }
};
function capabilities(host) { return { ...(MATRIX[host] || {}), source: 'registered_adapter' }; }
function requiredCapability(mode) { return mode === 'subagent' ? 'native_subagent' : mode === 'fresh-session' ? 'fresh_session' : mode === 'external' ? 'external_process' : null; }
module.exports = { MATRIX, capabilities, requiredCapability };
