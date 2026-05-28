'use strict';

// Capabilities map for the AI CLIs that AIOSON can spawn via `aioson live:start`.
// Each CLI persists conversation history in its own per-cwd location, so
// "continue last conversation" is achieved by passing the right resume flag
// at spawn time — AIOSON never has to track an internal session ID.
//
// Used by:
//   - `aioson live:start --resume[=last|<id>]` to map to the correct argv
//   - `aioson live:start --permission-mode=yolo` to map to the correct argv
//   - `aioson tool:capabilities` to expose this map as JSON to UI clients
//     (e.g. AIOSON Play) so they don't duplicate the lookup.
//
// Keep entries minimal and source-of-truth here. Adding a new CLI = one entry.
const TOOL_CAPS = {
  claude: {
    install_command: 'npm install -g @anthropic-ai/claude-code',
    binary: 'claude',
    supports_resume: true,
    resume_last: ['--continue'],
    supports_session_id: true,
    resume_session_id: ['--resume', '<id>'],
    supports_session_picker: true,
    session_picker: ['--resume'],
    supports_yolo: true,
    yolo_args: ['--dangerously-skip-permissions'],
  },
  codex: {
    install_command: 'npm install -g @openai/codex',
    binary: 'codex',
    supports_resume: true,
    resume_last: ['resume', '--last'],
    supports_session_id: true,
    resume_session_id: ['resume', '<id>'],
    supports_session_picker: true,
    session_picker: ['resume'],
    supports_yolo: true,
    yolo_args: ['--dangerously-bypass-approvals-and-sandbox'],
  },
  opencode: {
    install_command: 'npm install -g opencode-ai',
    binary: 'opencode',
    supports_resume: true,
    resume_last: ['--continue'],
    supports_session_id: true,
    resume_session_id: ['--session', '<id>'],
    supports_session_picker: false,
    session_picker: null,
    supports_yolo: false,
    yolo_args: null,
  },
  // DEPRECATED: Gemini CLI free/personal tier ends 2026-06-18. Enterprise
  // (Code Assist Standard/Enterprise) unaffected. Hard removal in v1.22.
  // See gemini-phaseout / CHANGELOG v1.21.x.
  gemini: {
    install_command: 'npm install -g @google/gemini-cli',
    binary: 'gemini',
    supports_resume: false,
    resume_last: null,
    supports_session_id: false,
    resume_session_id: null,
    supports_session_picker: false,
    session_picker: null,
    supports_yolo: false,
    yolo_args: null,
  },
};

function getToolCapabilities(tool) {
  const key = String(tool || '').trim().toLowerCase();
  if (!key) return null;
  return TOOL_CAPS[key] || null;
}

function listSupportedTools() {
  return Object.keys(TOOL_CAPS).sort();
}

// Resolve the argv prefix to add to the CLI spawn so it resumes a conversation.
// `resumeOpt` accepted shapes:
//   - true            → resume last
//   - 'last' / 'true' → resume last
//   - '' / undefined / null / false → no resume
//   - any other string → treat as session id
// Returns [] when the tool doesn't support resume or resumeOpt is falsy.
function resolveResumeArgs(tool, resumeOpt) {
  if (resumeOpt === undefined || resumeOpt === null || resumeOpt === '' || resumeOpt === false) {
    return [];
  }
  const caps = getToolCapabilities(tool);
  if (!caps || !caps.supports_resume) return [];

  const wantsLast =
    resumeOpt === true ||
    resumeOpt === 'last' ||
    String(resumeOpt).toLowerCase() === 'true';

  if (wantsLast) {
    return Array.isArray(caps.resume_last) ? [...caps.resume_last] : [];
  }

  if (caps.supports_session_id && Array.isArray(caps.resume_session_id)) {
    return caps.resume_session_id.map((part) => (part === '<id>' ? String(resumeOpt) : part));
  }

  return Array.isArray(caps.resume_last) ? [...caps.resume_last] : [];
}

function resolvePermissionModeArgs(tool, permissionMode) {
  const mode = String(permissionMode || '').trim().toLowerCase();
  if (!mode || mode === 'default') return [];
  if (mode !== 'yolo') {
    throw new Error(`permission_mode_unknown:${permissionMode}`);
  }

  const caps = getToolCapabilities(tool);
  if (!caps) {
    throw new Error(`tool_unknown:${tool}`);
  }
  if (!caps.supports_yolo || !Array.isArray(caps.yolo_args)) {
    throw new Error(`permission_mode_unsupported:${tool}:yolo`);
  }
  return [...caps.yolo_args];
}

module.exports = {
  TOOL_CAPS,
  getToolCapabilities,
  listSupportedTools,
  resolveResumeArgs,
  resolvePermissionModeArgs,
};
