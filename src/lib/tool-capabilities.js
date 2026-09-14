'use strict';

// Single host registry for the AI CLIs AIOSON can spawn.
//
// One entry per CLI feeds three consumers, so there is exactly one list to
// keep in sync when a host is added or a flag changes:
//   - `aioson live:start` (interactive/PTY): `--resume[=last|<id>]` and
//     `--permission-mode=yolo` map to the right argv through this table.
//   - `aioson tool:capabilities`: exposes the map as JSON to UI clients
//     (e.g. AIOSON Play) so they never duplicate the lookup.
//   - `src/agent-execution/capabilities.js`: derives the per-host EXECUTION
//     capability matrix (non-interactive external processes dispatched by the
//     agent-execution manifest and probed by `aioson host:signature`) from the
//     `execution` block. A host without an `execution` block is known to the
//     interactive surface but is NOT dispatchable and cannot be signed until a
//     non-interactive adapter exists under src/agent-execution/adapters/.
//
// Each CLI persists conversation history in its own per-cwd location, so
// "continue last conversation" is achieved by passing the right resume flag at
// spawn time — AIOSON never has to track an internal session ID.
//
// Keep entries minimal and source-of-truth here. Adding a new CLI = one entry
// (+ one adapter when it should be dispatchable).
//
// POLICY — every harness the framework launches for implementation or
// orchestration runs unattended: `live:start` defaults to `--permission-mode
// yolo`, every lane worker and direct dispatch runs `workspace-write` as the
// host's unattended flag, the runner appends it. A permission prompt inside
// an orchestrated run is the run not happening (the owner's rule after one
// lane spent a night asking). So every registered host declares its
// unattended flag (`yolo_args`); a host with none can still be used
// interactively but never dispatched. Adding a harness = one entry here with
// that flag (+ one adapter when it should be dispatchable).
//
// Sandbox translation lives here too — `read_only_args` for a read-only
// researcher, `yolo_args` for a lane worker — and the adapters consume it
// through `resolveSandboxArgs` (adapters/base.js) instead of carrying their
// own conditionals: one adapter that translated `workspace-write` on its own
// (`--sandbox workspace-write`, the provider's sandboxed write) left a lane
// worker asking for permission all night while the registry already declared
// the unattended flag. A lane worker runs unattended, always: the provider
// sandbox was measured and never ran unattended here (Codex's Windows sandbox
// setup fails to load; under `--sandbox workspace-write` the model answered
// DONE after 96 s without writing the file — under the unattended flag it
// wrote in 14 s). A host with `null` for a mode cannot honor it and is
// refused at build, never silently run with more (or less) power than the
// contract says.
//
// `permission_flags`, next to the unattended flag, names every flag (aliases
// included) through which a caller already states the host's permission,
// sandbox or approval mode. A launched session whose own `--tool-args` carry
// one gets no flag added (resolveLaunchPermission): the default appended the
// bypass anyway, and Codex refuses it twice ("cannot be used multiple times"),
// refuses it next to its `--yolo` alias, and silently overrode an explicit
// `--sandbox workspace-write --ask-for-approval on-request`.
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
    permission_flags: ['--dangerously-skip-permissions', '--allow-dangerously-skip-permissions', '--permission-mode'],
    read_only_args: ['--permission-mode', 'plan'],
    execution: {
      additional_workspaces: true,
      model_catalog: false,
      reasoning_effort: true,
    },
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
    // `--yolo` is the CLI's own alias of the bypass; `-s`/`-a` are the short
    // forms of `--sandbox`/`--ask-for-approval`.
    permission_flags: ['--dangerously-bypass-approvals-and-sandbox', '--yolo', '--sandbox', '-s', '--ask-for-approval', '-a', '--full-auto'],
    // Never `--sandbox workspace-write` for a lane worker: measured on the
    // operator's machine, the Windows sandbox setup fails to load and the
    // model reports DONE without writing (see the header note).
    read_only_args: ['--sandbox', 'read-only'],
    execution: {
      additional_workspaces: true,
      model_catalog: true,
      reasoning_effort: true,
    },
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
    // `opencode run --auto`: "auto-approve permissions that are not explicitly
    // denied" — the unattended contract a lane worker needs (verified from
    // the installed CLI's own help). No read-only flag: a read-only request is
    // refused at build (sandbox_mode_unsupported), never ignored.
    supports_yolo: true,
    yolo_args: ['--auto'],
    permission_flags: ['--auto'],
    read_only_args: null,
    execution: {
      additional_workspaces: false,
      model_catalog: false,
      reasoning_effort: false,
    },
  },
  kimi: {
    install_command: 'npm install -g @moonshot-ai/kimi-code',
    binary: 'kimi',
    supports_resume: false,
    resume_last: null,
    supports_session_id: false,
    resume_session_id: null,
    supports_session_picker: false,
    session_picker: null,
    // Kimi Code distinguishes `--yolo` (may still ask) from `--auto` (fully
    // unattended); unattended is what a permission-mode=yolo caller means.
    supports_yolo: true,
    yolo_args: ['--auto'],
    permission_flags: ['--auto', '--yolo', '--plan'],
    read_only_args: ['--plan'],
    execution: {
      additional_workspaces: true,
      model_catalog: false,
      reasoning_effort: false,
    },
  },
  qwen: {
    install_command: 'npm install -g @qwen-code/qwen-code',
    binary: 'qwen',
    supports_resume: false,
    resume_last: null,
    supports_session_id: false,
    resume_session_id: null,
    supports_session_picker: false,
    session_picker: null,
    supports_yolo: true,
    yolo_args: ['--yolo'],
    permission_flags: ['--yolo', '-y', '--approval-mode', '--sandbox', '-s', '--safe-mode'],
    read_only_args: ['--approval-mode', 'plan', '--sandbox', '--safe-mode'],
    execution: {
      additional_workspaces: false,
      model_catalog: false,
      reasoning_effort: false,
    },
  },
  grok: {
    install_command: 'npm install -g @xai-official/grok',
    binary: 'grok',
    supports_resume: true,
    resume_last: ['--continue'],
    supports_session_id: false,
    resume_session_id: null,
    supports_session_picker: false,
    session_picker: null,
    // `--always-approve`: "Auto-approve all tool executions" (the installed
    // CLI's help; the older `--yolo` is not a flag of this build). Headless
    // is `-p/--single <prompt>` with `-m` and `--reasoning-effort`
    // (adapters/grok.js); proven dispatchable by a real signature probe.
    supports_yolo: true,
    yolo_args: ['--always-approve'],
    permission_flags: ['--always-approve', '--permission-mode'],
    read_only_args: ['--permission-mode', 'plan'],
    execution: {
      additional_workspaces: false,
      model_catalog: false,
      reasoning_effort: true,
    },
  },
  // Declared by the desktop client for its sessions; flags as the client maps
  // them, non-interactive contract unverified — interactive only.
  muse: {
    install_command: null,
    binary: 'muse',
    supports_resume: false,
    resume_last: null,
    supports_session_id: false,
    resume_session_id: null,
    supports_session_picker: false,
    session_picker: null,
    // `--yolo` = `--disable-approval --disable-sandbox --trust-workspace`.
    supports_yolo: true,
    yolo_args: ['--yolo'],
    permission_flags: ['--yolo', '--disable-approval', '--disable-sandbox', '--trust-workspace'],
    read_only_args: null,
    execution: null,
  },
  agy: {
    install_command: null,
    binary: 'agy',
    supports_resume: true,
    resume_last: ['--continue'],
    supports_session_id: false,
    resume_session_id: null,
    supports_session_picker: false,
    session_picker: null,
    // Antigravity denies a tool that would need approval silently unless
    // pre-approved or released by this flag.
    supports_yolo: true,
    yolo_args: ['--dangerously-skip-permissions'],
    permission_flags: ['--dangerously-skip-permissions'],
    read_only_args: null,
    execution: null,
  },
  // Keep the legacy interactive `agy` key; execution roles use the product
  // name, but must launch the headless CLI, not the Antigravity editor.
  antigravity: {
    install_command: null,
    binary: 'agy',
    supports_resume: true,
    resume_last: ['--continue'],
    supports_session_id: true,
    resume_session_id: ['--conversation', '<id>'],
    supports_session_picker: false,
    session_picker: null,
    supports_yolo: true,
    // File tools auto-apply only in accept-edits; the dangerous flag covers
    // shell/tool permission prompts. Both are required by an unattended lane.
    yolo_args: ['--mode', 'accept-edits', '--dangerously-skip-permissions'],
    permission_flags: ['--dangerously-skip-permissions', '--mode', '--sandbox'],
    read_only_args: null,
    execution: {
      additional_workspaces: true,
      model_catalog: false,
      reasoning_effort: true,
    },
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

// Hosts that can run as non-interactive external processes (agent-execution
// dispatch + host:signature). Interactive-only entries are excluded.
function listExecutionHosts() {
  return Object.keys(TOOL_CAPS).filter((tool) => Boolean(TOOL_CAPS[tool].execution)).sort();
}

function getExecutionCapabilities(tool) {
  const caps = getToolCapabilities(tool);
  if (!caps || !caps.execution) return null;
  return { binary: caps.binary, install_command: caps.install_command, ...caps.execution };
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

// The permission mode a launched session gets when the caller names none:
// unattended. A caller that wants prompts says `--permission-mode=default`.
const DEFAULT_SESSION_PERMISSION_MODE = 'yolo';

/**
 * `yolo` args for a session that named no mode: the host's unattended flag
 * when it registers one; `[]` (the host's own default, which prompts) with
 * `warning` when it does not — an interactive session with a human at the
 * terminal can still run there, a lane worker cannot (see resolveSandboxArgs).
 */
function resolveDefaultSessionPermission(tool) {
  const caps = getToolCapabilities(tool);
  if (caps && caps.supports_yolo && Array.isArray(caps.yolo_args)) {
    return { mode: DEFAULT_SESSION_PERMISSION_MODE, args: [...caps.yolo_args], warning: null };
  }
  return { mode: 'default', args: [], warning: `${String(tool || '').trim().toLowerCase() || 'this host'} registers no unattended flag — the session will ask for permissions; declare its flag in the host registry (yolo_args) to run it unattended` };
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

const EXECUTABLE_EXTENSION = /\.(?:exe|cmd|bat|com|ps1|sh|js|cjs|mjs)$/i;

/**
 * The registered host a `--tool-bin` value launches — its basename without an
 * executable extension, matched against the registry's keys and binaries —
 * or null when it names none (a wrapper, another CLI).
 */
function hostForBinary(binary) {
  const base = String(binary || '').trim().split(/[\\/]/).pop().replace(EXECUTABLE_EXTENSION, '').toLowerCase();
  if (!base) return null;
  const hit = Object.entries(TOOL_CAPS).find(([key, caps]) => key === base || String(caps.binary || '').toLowerCase() === base);
  return hit ? hit[0] : null;
}

/** Every flag through which a caller states the host's permissions: the declared recognizers plus the registry's own mode flags. */
function permissionFlagsOf(caps) {
  if (!caps) return [];
  const own = [...(caps.yolo_args || []), ...(caps.read_only_args || [])].filter((token) => String(token).startsWith('-'));
  return [...new Set([...(Array.isArray(caps.permission_flags) ? caps.permission_flags : []), ...own])];
}

/** The first caller arg that states a permission/sandbox/approval flag of `tool` (`--sandbox` or `--sandbox=read-only`), or null. */
function findPermissionFlag(tool, args) {
  const flags = permissionFlagsOf(getToolCapabilities(tool));
  if (flags.length === 0) return null;
  for (const arg of args || []) {
    const token = String(arg);
    if (flags.some((flag) => token === flag || token.startsWith(`${flag}=`))) return token;
  }
  return null;
}

/**
 * The permission argv of one launched session (`live:start`), for the binary
 * that actually runs. The unattended default shipped as "append the `--tool`
 * flag, always", and the field found both ways it breaks a launch:
 *   - the caller's `--tool-args` already stated the permissions — the bypass
 *     flag itself, its `--yolo` alias, or an explicit `--sandbox workspace-write
 *     --ask-for-approval on-request` — and Codex refused the doubled flag
 *     ("cannot be used multiple times") or had the caller's sandbox overridden;
 *   - `--tool-bin` launched another CLI: `--tool=opencode --tool-bin=agy` sent
 *     opencode's `--auto` to Antigravity, which printed its help instead of
 *     opening.
 * So the flag is the launched binary's host's (the `--tool` when no
 * `--tool-bin`), nothing is added when the caller's args already carry one of
 * that host's `permission_flags`, and a binary the registry does not know gets
 * no flag at all — with a `warning` saying the session will ask. Policy
 * unchanged otherwise: no mode named is `yolo`; `default` adds nothing; an
 * explicit `yolo` that cannot be translated throws, as resolvePermissionModeArgs.
 * Returns `{ mode, host, binary, args, source: registry|tool_args|none, flag, warning }`.
 */
function resolveLaunchPermission(tool, { permissionMode = null, binary = null, userArgs = [] } = {}) {
  const requested = String(tool || '').trim().toLowerCase();
  const explicit = !(permissionMode === undefined || permissionMode === null || String(permissionMode).trim() === '');
  const mode = explicit ? String(permissionMode).trim().toLowerCase() : DEFAULT_SESSION_PERMISSION_MODE;
  const named = typeof binary === 'string' && binary.trim() ? binary.trim() : null;
  const host = named ? hostForBinary(named) : requested;
  const result = { mode, host: host && getToolCapabilities(host) ? host : null, binary: named || requested, args: [], source: 'none', flag: null, warning: null };
  if (mode === 'default') return result;
  if (mode !== 'yolo') throw new Error(`permission_mode_unknown:${permissionMode}`);
  if (!host) {
    if (explicit) throw new Error(`permission_mode_unsupported:${named}:yolo`);
    return { ...result, mode: 'default', warning: `--tool-bin ${named} is not a registered host (${listSupportedTools().join(', ')}) — no unattended flag was added and the session will ask for permissions; pass its own flag in --tool-args` };
  }
  const own = findPermissionFlag(host, userArgs);
  if (own) return { ...result, source: 'tool_args', flag: own };
  if (explicit) return { ...result, args: resolvePermissionModeArgs(host, 'yolo'), source: 'registry' };
  const defaulted = resolveDefaultSessionPermission(host);
  return { ...result, mode: defaulted.mode, args: defaulted.args, source: defaulted.args.length > 0 ? 'registry' : 'none', warning: defaulted.warning };
}

// The sandbox modes an execution caller may ask for. `read-only` is the
// researcher's (`read_only_args`); `workspace-write` is the lane worker's and
// always means unattended (`yolo_args`) — the provider sandboxes were
// measured and never ran unattended (see the header note).
const SANDBOX_MODES = ['read-only', 'workspace-write'];
const LANE_WORKER_MODE = 'yolo';

/**
 * The argv a host needs for a sandbox mode — the ONE translation every adapter
 * consumes (adapters/base.js), so no adapter can diverge from the registry.
 * Never throws: `{ok: true, args}` or `{ok: false, reason, ...}` with
 * `sandbox_mode_unknown | sandbox_mode_unsupported | permission_mode_unsupported`
 * — the caller refuses the dispatch instead of running the host with a
 * different power than the contract says.
 */
function resolveSandboxArgs(tool, sandboxMode) {
  const host = String(tool || '').trim().toLowerCase();
  const sandbox = sandboxMode === undefined || sandboxMode === null || sandboxMode === '' ? null : String(sandboxMode).trim().toLowerCase();
  if (sandbox === null) return { ok: true, args: [], sandbox_mode: null };
  if (!SANDBOX_MODES.includes(sandbox)) return { ok: false, reason: 'sandbox_mode_unknown', sandbox_mode: sandbox, host };
  const caps = getToolCapabilities(host);
  if (sandbox === 'read-only') {
    if (!caps || !Array.isArray(caps.read_only_args)) {
      return { ok: false, reason: 'sandbox_mode_unsupported', sandbox_mode: sandbox, host, message: `${host || 'this host'} has no read-only mode registered` };
    }
    return { ok: true, args: [...caps.read_only_args], sandbox_mode: sandbox };
  }
  if (!caps || !caps.supports_yolo || !Array.isArray(caps.yolo_args)) {
    return { ok: false, reason: 'permission_mode_unsupported', sandbox_mode: sandbox, permission_mode: LANE_WORKER_MODE, host, message: `${host || 'this host'} has no unattended write flag registered` };
  }
  return { ok: true, args: [...caps.yolo_args], sandbox_mode: sandbox, permission_mode: LANE_WORKER_MODE };
}

module.exports = {
  TOOL_CAPS,
  SANDBOX_MODES,
  LANE_WORKER_MODE,
  DEFAULT_SESSION_PERMISSION_MODE,
  resolveDefaultSessionPermission,
  getToolCapabilities,
  getExecutionCapabilities,
  listSupportedTools,
  listExecutionHosts,
  resolveResumeArgs,
  resolvePermissionModeArgs,
  resolveLaunchPermission,
  findPermissionFlag,
  hostForBinary,
  resolveSandboxArgs,
};
