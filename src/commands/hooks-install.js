'use strict';

/**
 * aioson hooks:install [projectDir] --agent=<name> --tool=<claude|antigravity|codex|opencode|all>
 *
 * Installs AIOSON event hooks into the AI tool's settings file.
 * After installation, every Write/Edit/Bash tool call and session stop
 * automatically emits a runtime event to SQLite — no manual aioson calls needed.
 *
 * Supported tools:
 *   --tool=claude      → ~/.claude/settings.json
 *   --tool=antigravity → ~/.gemini/antigravity/hooks.json  (+ .agents/hooks.json in project)
 *   --tool=codex       → ~/.codex/hooks.json  (native hooks; Codex asks you to trust them once via /hooks)
 *   --tool=opencode    → ~/.config/opencode/plugins/aioson.js  (a plugin on OpenCode's hook API)
 *   --tool=all         → installs for all detected tools
 */

const path = require('node:path');
const fs = require('node:fs/promises');
const os = require('node:os');
const { getAgentDefinition, normalizeAgentName } = require('../agents');
const { resolveTargetDir } = require('../lib/project-root');
const { renderOpencodePlugin, OPENCODE_PLUGIN_SIGNATURE } = require('../lib/opencode-plugin');

const HOOK_AGENT_NAME_RE = /^[a-z][a-z0-9-]*$/;
const HOOK_TIMEOUT_SECONDS = 30;

// ─── Config file paths ────────────────────────────────────────────────────────

// Resolved per call, never at load: tests point the home at a temporary directory.
function homeDir() {
  return os.homedir();
}

function configPaths() {
  const home = homeDir();
  return {
    claude: path.join(home, '.claude', 'settings.json'),
    antigravity: path.join(home, '.gemini', 'antigravity', 'hooks.json'),
    antigravity_workspace: '.agents/hooks.json', // relative to project
    codex: path.join(home, '.codex', 'hooks.json'),
    codex_wrapper: path.join(home, '.codex', 'aioson-wrapper.sh'), // pre-native-hooks workaround
    opencode: path.join(home, '.config', 'opencode', 'plugins', 'aioson.js')
  };
}

// ─── Hook command templates ───────────────────────────────────────────────────

function normalizeHookAgentName(input = 'dev') {
  const raw = normalizeAgentName(input || 'dev').replace(/^\//, '');
  const definition = getAgentDefinition(raw);
  const agentName = definition ? definition.id : raw;

  if (!HOOK_AGENT_NAME_RE.test(agentName)) {
    throw new Error(
      `invalid agent name "${String(input)}"; use a known agent id or kebab-case identifier`
    );
  }

  return agentName;
}

function shellQuote(value) {
  return `'${String(value).replace(/'/g, `'\\''`)}'`;
}

// `$PWD` is the SHELL's working directory when the hook fires — NOT the project
// directory. Any `cd` during the session moves it, so every command below treats
// it as a starting point and walks up to the nearest `.aioson/` (see
// `src/lib/project-root.js`). Commands that write refuse to run outside a
// project rather than scaffolding a store in whatever directory was current.
function makeEmitCommand(agentName, source) {
  return `aioson hooks:emit "$PWD" --agent=${shellQuote(agentName)} --source=${shellQuote(source)} 2>/dev/null || true`;
}

function makeDoneCommand(agentName) {
  return `aioson agent:done "$PWD" --agent=${shellQuote(agentName)} --summary=${shellQuote(`Session ended via ${agentName} hook`)} 2>/dev/null || true`;
}

// SessionStart after a compaction: re-inject the checkpoint rebuilt from the
// events recorded before it. Other session starts answer `{}`.
function makeRecapCommand(agentName, source) {
  return `aioson hooks:recap "$PWD" --agent=${shellQuote(agentName)} --source=${shellQuote(source)} --json 2>/dev/null || true`;
}

function makeGuardCommand(agentName) {
  // PreToolUse: the harness pipes the pending edit event (JSON on stdin); the
  // guard derives a query from the artifact itself, runs context:brief, and
  // injects salient project-rule constraints before the write lands. Advisory —
  // always exits 0, never blocks the tool.
  return `aioson context:guard "$PWD" --tool=claude --agent=${shellQuote(agentName)} --json 2>/dev/null || true`;
}

// ─── Claude Code ─────────────────────────────────────────────────────────────

// True for any hook entry AIOSON owns, so reinstall/uninstall can scrub them
// without disturbing user-authored hooks.
const AIOSON_HOOK_SIGNATURES = [
  'aioson hooks:emit',
  'aioson hooks:recap',
  'aioson agent:done',
  'aioson context:guard',
  'aioson live:start'
];

function isAiosonHookEntry(entry) {
  const cmd = entry?.hooks?.[0]?.command || entry?.command || '';
  return AIOSON_HOOK_SIGNATURES.some((sig) => cmd.includes(sig));
}

// Read a JSON config as the base of a merge. A missing file is a fresh start,
// but a file that exists and does not parse must abort the merge for that
// target: writing "merged" hooks over content we could not read would replace
// the user's whole settings file with a hooks-only object.
async function readJsonForMerge(filePath) {
  let raw;
  try {
    raw = await fs.readFile(filePath, 'utf8');
  } catch {
    return { data: {}, corrupted: false };
  }
  try {
    return { data: JSON.parse(raw), corrupted: false };
  } catch {
    return { data: null, corrupted: true };
  }
}

// Merge AIOSON hook groups into a Claude-shaped settings object (`hooks` →
// event → groups), keeping the user's own entries: previous AIOSON entries are
// scrubbed first, so a reinstall never duplicates and an event dropped from
// the build disappears.
function mergeHookEvents(existing, newHooks) {
  const merged = { ...(existing || {}) };
  merged.hooks = { ...(merged.hooks || {}) };
  for (const event of Object.keys(merged.hooks)) {
    merged.hooks[event] = (merged.hooks[event] || []).filter((entry) => !isAiosonHookEntry(entry));
    if (merged.hooks[event].length === 0) delete merged.hooks[event];
  }
  for (const [event, hookList] of Object.entries(newHooks)) {
    merged.hooks[event] = [...(merged.hooks[event] || []), ...hookList];
  }
  return merged;
}

// Remove AIOSON entries from a Claude-shaped hooks file, leaving user hooks alone.
async function scrubHookFile(tool, filePath, dryRun, logger, label) {
  let existing;
  try {
    existing = JSON.parse(await fs.readFile(filePath, 'utf8'));
  } catch {
    logger.log(`  ${label} hooks not found — nothing to remove`);
    return { tool, path: filePath, removed: false };
  }
  if (existing && existing.hooks) {
    for (const event of Object.keys(existing.hooks)) {
      existing.hooks[event] = (existing.hooks[event] || []).filter((entry) => !isAiosonHookEntry(entry));
      if (existing.hooks[event].length === 0) delete existing.hooks[event];
    }
    if (Object.keys(existing.hooks).length === 0) delete existing.hooks;
  }
  if (!dryRun) {
    await fs.writeFile(filePath, JSON.stringify(existing, null, 2), 'utf8');
    logger.log(`  ✓ ${label} hooks removed — ${filePath}`);
  } else {
    logger.log(`  [dry-run] Would remove AIOSON hooks from: ${filePath}`);
  }
  return { tool, path: filePath, removed: true };
}

// The guard judges a write with the rules of the agent acting at that moment.
// A default install (no `--agent`) bakes `auto`, and the guard resolves the
// active agent at runtime; telemetry hooks keep the install-time agent.
function guardAgentFor(options, agentName) {
  return options && options.agent ? agentName : 'auto';
}

function buildClaudeHooks(agentName, includeGuard = true, guardAgent = agentName) {
  const safeAgentName = normalizeHookAgentName(agentName);
  const safeGuardAgent = normalizeHookAgentName(guardAgent);
  const emitCmd = makeEmitCommand(safeAgentName, 'claude');
  const doneCmd = makeDoneCommand(safeAgentName);

  const hooks = {
    PostToolUse: [
      {
        matcher: 'Write|Edit|MultiEdit',
        hooks: [{ type: 'command', command: emitCmd }]
      },
      {
        matcher: 'Bash',
        hooks: [{ type: 'command', command: emitCmd }]
      },
      {
        matcher: 'Task|TodoWrite',
        hooks: [{ type: 'command', command: emitCmd }]
      }
    ],
    // A failing command (non-zero exit) fires this instead of PostToolUse:
    // hooks:emit records it as a failed test step.
    PostToolUseFailure: [
      {
        matcher: 'Bash',
        hooks: [{ type: 'command', command: emitCmd }]
      }
    ],
    // `/aioson:agent:dev` typed inside the session: records which agent the
    // user activated (the session itself opens without one).
    UserPromptSubmit: [
      {
        hooks: [{ type: 'command', command: emitCmd }]
      }
    ],
    // The agent's final message is recorded first, then the turn is closed;
    // one command so the order holds.
    Stop: [
      {
        hooks: [{ type: 'command', command: `${emitCmd}; ${doneCmd}` }]
      }
    ],
    // Compaction keeps a model-written summary; the hooks keep the facts. The
    // marker bounds the stretch, and the next SessionStart (source `compact`)
    // gets the checkpoint rebuilt from it — no agent has to remember to write.
    PreCompact: [
      {
        hooks: [{ type: 'command', command: emitCmd }]
      }
    ],
    SessionStart: [
      {
        matcher: 'compact',
        hooks: [{ type: 'command', command: makeRecapCommand(safeAgentName, 'claude') }]
      }
    ]
  };

  if (includeGuard) {
    hooks.PreToolUse = [
      {
        matcher: 'Write|Edit|MultiEdit|NotebookEdit',
        hooks: [{ type: 'command', command: makeGuardCommand(safeGuardAgent) }]
      }
    ];
  }

  return hooks;
}

async function installClaudeHooks(agentName, dryRun, logger, includeGuard = true, guardAgent = agentName) {
  const configPath = configPaths().claude;
  await fs.mkdir(path.dirname(configPath), { recursive: true });

  const { data: existing, corrupted } = await readJsonForMerge(configPath);
  if (corrupted) {
    logger.log(`  ⚠ Claude Code — ${configPath} exists but is not valid JSON; leaving it untouched. Fix the file and re-run: aioson hooks:install`);
    return { tool: 'claude', configPath, skipped: 'invalid-config' };
  }

  const newHooks = buildClaudeHooks(agentName, includeGuard, guardAgent);
  // Merge: add AIOSON hooks without removing the user's own. A previously
  // installed guard hook is scrubbed too, so a reinstall with --no-guard
  // actually removes it.
  const merged = mergeHookEvents(existing, newHooks);

  if (!dryRun) {
    await fs.writeFile(configPath, JSON.stringify(merged, null, 2), 'utf8');
    logger.log(`  ✓ Claude Code — ${configPath}`);
  } else {
    logger.log(`  [dry-run] Would write: ${configPath}`);
    logger.log(`  Hooks to add:`);
    if (includeGuard) {
      logger.log(`    PreToolUse (Write|Edit|MultiEdit|NotebookEdit) → context:guard`);
    }
    logger.log(`    PostToolUse (Write|Edit|MultiEdit|Bash|Task|TodoWrite) → hooks:emit`);
    logger.log(`    PostToolUseFailure (Bash) → hooks:emit`);
    logger.log(`    UserPromptSubmit → hooks:emit (agent activated in the session)`);
    logger.log(`    Stop → hooks:emit (final message) + agent:done`);
    logger.log(`    PreCompact → hooks:emit (compaction marker)`);
    logger.log(`    SessionStart (compact) → hooks:recap (session checkpoint)`);
  }

  return { tool: 'claude', configPath, hooks: newHooks };
}

// ─── Antigravity ─────────────────────────────────────────────────────────────

function buildAntigravityHooks(agentName) {
  const safeAgentName = normalizeHookAgentName(agentName);
  const emitCmd = makeEmitCommand(safeAgentName, 'antigravity');
  const doneCmd = makeDoneCommand(safeAgentName);
  const startCmd = `aioson live:start "$PWD" --agent=${shellQuote(safeAgentName)} --tool=antigravity --no-launch 2>/dev/null || true`;

  return {
    SessionStart: [{ type: 'command', command: startCmd }],
    PostToolUse: [
      { matcher: 'Write|Edit|MultiEdit', hooks: [{ type: 'command', command: emitCmd }] },
      { matcher: 'Bash', hooks: [{ type: 'command', command: emitCmd }] },
      { matcher: 'Task|TodoWrite', hooks: [{ type: 'command', command: emitCmd }] }
    ],
    SessionEnd: [{ type: 'command', command: doneCmd }],
    Stop: [{ type: 'command', command: doneCmd }]
  };
}

async function installAntigravityHooks(agentName, projectDir, dryRun, logger) {
  const globalPath = configPaths().antigravity;
  const workspacePath = path.join(projectDir, configPaths().antigravity_workspace);

  const hooks = buildAntigravityHooks(agentName);

  if (!dryRun) {
    await fs.mkdir(path.dirname(globalPath), { recursive: true });
    await fs.mkdir(path.dirname(workspacePath), { recursive: true });
    const skipped = [];

    // Global hooks
    const globalRead = await readJsonForMerge(globalPath);
    if (globalRead.corrupted) {
      skipped.push('global');
      logger.log(`  ⚠ Antigravity global — ${globalPath} exists but is not valid JSON; leaving it untouched. Fix the file and re-run: aioson hooks:install`);
    } else {
      const mergedGlobal = mergeAntigravityHooks(globalRead.data, hooks);
      await fs.writeFile(globalPath, JSON.stringify(mergedGlobal, null, 2), 'utf8');
      logger.log(`  ✓ Antigravity global — ${globalPath}`);
    }

    // Workspace hooks (project-scoped, takes priority)
    const wsRead = await readJsonForMerge(workspacePath);
    if (wsRead.corrupted) {
      skipped.push('workspace');
      logger.log(`  ⚠ Antigravity workspace — ${workspacePath} exists but is not valid JSON; leaving it untouched. Fix the file and re-run: aioson hooks:install`);
    } else {
      const mergedWs = mergeAntigravityHooks(wsRead.data, hooks);
      await fs.writeFile(workspacePath, JSON.stringify(mergedWs, null, 2), 'utf8');
      logger.log(`  ✓ Antigravity workspace — ${workspacePath}`);
    }

    if (skipped.length > 0) {
      return { tool: 'antigravity', globalPath, workspacePath, hooks, skipped: 'invalid-config', skippedFiles: skipped };
    }
  } else {
    logger.log(`  [dry-run] Would write: ${globalPath}`);
    logger.log(`  [dry-run] Would write: ${workspacePath}`);
    logger.log(`  Hooks to add: SessionStart → live:start, PostToolUse → hooks:emit, SessionEnd/Stop → agent:done`);
  }

  return { tool: 'antigravity', globalPath, workspacePath, hooks };
}

function mergeAntigravityHooks(existing, newHooks) {
  const merged = { ...existing };
  if (!merged.hooks) merged.hooks = {};

  for (const [event, entries] of Object.entries(newHooks)) {
    const existingEntries = Array.isArray(merged.hooks[event]) ? merged.hooks[event] : [];
    // Remove previous AIOSON entries
    const filtered = existingEntries.filter((e) => {
      const cmd = (e.command || e.hooks?.[0]?.command || '');
      return !cmd.includes('aioson');
    });
    const newEntries = Array.isArray(entries) ? entries : [entries];
    merged.hooks[event] = [...filtered, ...newEntries];
  }

  return merged;
}

// Scrub AIOSON entries from one Antigravity hooks file, mirroring the
// `cmd.includes('aioson')` policy the merge uses on install.
async function scrubAntigravityHookFile(filePath, dryRun, logger, label) {
  let existing;
  try {
    existing = JSON.parse(await fs.readFile(filePath, 'utf8'));
  } catch {
    logger.log(`  ${label} not found — nothing to remove`);
    return { tool: 'antigravity', path: filePath, removed: false };
  }
  if (existing.hooks) {
    for (const event of Object.keys(existing.hooks)) {
      existing.hooks[event] = (existing.hooks[event] || []).filter((entry) => {
        const cmd = entry.command || entry.hooks?.[0]?.command || '';
        return !cmd.includes('aioson');
      });
      if (existing.hooks[event].length === 0) delete existing.hooks[event];
    }
    if (Object.keys(existing.hooks).length === 0) delete existing.hooks;
  }
  if (!dryRun) {
    await fs.writeFile(filePath, JSON.stringify(existing, null, 2), 'utf8');
    logger.log(`  ✓ ${label} hooks removed — ${filePath}`);
  } else {
    logger.log(`  [dry-run] Would remove AIOSON hooks from: ${filePath}`);
  }
  return { tool: 'antigravity', path: filePath, removed: true };
}

// ─── Codex (OpenAI) ───────────────────────────────────────────────────────────

// Codex hooks (stable, on by default) read Claude's shape — `~/.codex/hooks.json`
// with the events under `hooks`, matcher groups and command handlers — and send
// the same stdin fields, so the emit/recap commands are shared. Differences:
// a failing command still arrives as PostToolUse (no PostToolUseFailure; the
// exit code travels in tool_response), file edits are the `apply_patch` tool
// and the plan tool is `update_plan` (hooks:emit reads both), and the session
// end has its own SessionEnd event. Codex runs `commandWindows` on Windows,
// where "$PWD" and `|| true` mean nothing; the agent name is validated
// kebab-case, so it needs no quoting there. A new or changed hook runs only
// after the user trusts it (`/hooks` inside Codex) — by design, not ours to
// grant.
function buildCodexHooks(agentName) {
  const safeAgentName = normalizeHookAgentName(agentName);
  const windows = (parts) => parts.join(' ');
  const handler = (spec, extra = {}) => ({ type: 'command', timeout: HOOK_TIMEOUT_SECONDS, ...spec, ...extra });
  const group = (matcher, hooks) => (matcher ? { matcher, hooks } : { hooks });
  const emit = {
    command: makeEmitCommand(safeAgentName, 'codex'),
    commandWindows: windows(['aioson hooks:emit .', `--agent=${safeAgentName}`, '--source=codex'])
  };

  return {
    PostToolUse: [group('apply_patch|Bash|update_plan', [handler(emit, { statusMessage: 'AIOSON: recording' })])],
    UserPromptSubmit: [group(null, [handler(emit)])],
    // The final message of a turn; the session itself closes at SessionEnd.
    Stop: [group(null, [handler(emit)])],
    PreCompact: [group(null, [handler(emit)])],
    SessionStart: [group('compact', [handler({
      command: makeRecapCommand(safeAgentName, 'codex'),
      commandWindows: windows(['aioson hooks:recap .', `--agent=${safeAgentName}`, '--source=codex', '--json'])
    }, { statusMessage: 'AIOSON: restoring the session checkpoint' })])],
    // Codex defaults SessionEnd handlers to a 1 s timeout; closing the run takes longer.
    SessionEnd: [group(null, [handler({
      command: makeDoneCommand(safeAgentName),
      commandWindows: windows(['aioson agent:done .', `--agent=${safeAgentName}`, '--summary="Session ended via codex hook"'])
    }, { timeout: 20 })])]
  };
}

async function removeLegacyCodexWrapper(wrapperPath) {
  try {
    await fs.unlink(wrapperPath);
    return true;
  } catch {
    return false;
  }
}

async function installCodexHooks(agentName, dryRun, logger) {
  const paths = configPaths();
  const configPath = paths.codex;
  const { data: existing, corrupted } = await readJsonForMerge(configPath);
  if (corrupted) {
    logger.log(`  ⚠ Codex — ${configPath} exists but is not valid JSON; leaving it untouched. Fix the file and re-run: aioson hooks:install`);
    return { tool: 'codex', configPath, skipped: 'invalid-config' };
  }

  const newHooks = buildCodexHooks(agentName);
  const merged = mergeHookEvents(existing, newHooks);

  if (!dryRun) {
    await fs.mkdir(path.dirname(configPath), { recursive: true });
    await fs.writeFile(configPath, JSON.stringify(merged, null, 2), 'utf8');
    logger.log(`  ✓ Codex — ${configPath}`);
    logger.log('  ⚠ Codex runs a new or changed hook only after you trust it: open Codex and run /hooks once (automation may pass --dangerously-bypass-hook-trust).');
    if (await removeLegacyCodexWrapper(paths.codex_wrapper)) {
      logger.log(`  ✓ Legacy Codex wrapper removed — ${paths.codex_wrapper} (native hooks replace it; drop its alias from your shell rc)`);
    }
  } else {
    logger.log(`  [dry-run] Would write: ${configPath}`);
    logger.log('  Hooks to add:');
    logger.log('    PostToolUse (apply_patch|Bash|update_plan) → hooks:emit');
    logger.log('    UserPromptSubmit → hooks:emit (agent activated in the session)');
    logger.log('    Stop → hooks:emit (final message)');
    logger.log('    PreCompact → hooks:emit (compaction marker)');
    logger.log('    SessionStart (compact) → hooks:recap (session checkpoint)');
    logger.log('    SessionEnd → agent:done');
    logger.log('  After installing, trust the hooks once with /hooks inside Codex.');
  }

  return { tool: 'codex', configPath, hooks: newHooks };
}

// ─── OpenCode ────────────────────────────────────────────────────────────────

// OpenCode has no shell hooks: it loads JavaScript plugins from
// ~/.config/opencode/plugins/ at startup and calls the hooks they return. The
// plugin (src/lib/opencode-plugin.mjs) mirrors the Claude Code hooks on that
// API; rendering bakes the agent name in.
function buildOpencodePlugin(agentName) {
  return renderOpencodePlugin(normalizeHookAgentName(agentName));
}

async function readOwnedFile(filePath) {
  try {
    const content = await fs.readFile(filePath, 'utf8');
    return { exists: true, ours: content.startsWith(OPENCODE_PLUGIN_SIGNATURE) };
  } catch {
    return { exists: false, ours: false };
  }
}

async function installOpencodeHooks(agentName, dryRun, logger) {
  const pluginPath = configPaths().opencode;
  const source = buildOpencodePlugin(agentName);
  const current = await readOwnedFile(pluginPath);
  if (current.exists && !current.ours) {
    logger.log(`  ⚠ OpenCode — ${pluginPath} exists and is not the AIOSON plugin; leaving it untouched. Move it and re-run: aioson hooks:install --tool=opencode`);
    return { tool: 'opencode', pluginPath, skipped: 'foreign-file' };
  }
  if (!dryRun) {
    await fs.mkdir(path.dirname(pluginPath), { recursive: true });
    await fs.writeFile(pluginPath, source, 'utf8');
    logger.log(`  ✓ OpenCode plugin — ${pluginPath}`);
    logger.log('  ⚠ OpenCode loads plugins at startup: restart it to pick the plugin up.');
  } else {
    logger.log(`  [dry-run] Would write: ${pluginPath}`);
    logger.log('  Plugin hooks: tool.execute.after → hooks:emit, chat.message → hooks:emit (agent activated), text.complete → hooks:emit (final message), session.compacting → hooks:emit (compaction marker) + hooks:recap into the compaction prompt, first turn after compaction → hooks:recap into the system prompt');
  }
  return { tool: 'opencode', pluginPath };
}

async function removeOpencodePlugin(pluginPath, dryRun, logger) {
  const current = await readOwnedFile(pluginPath);
  if (!current.exists) {
    logger.log('  OpenCode plugin not found — nothing to remove');
    return { tool: 'opencode', path: pluginPath, removed: false };
  }
  if (!current.ours) {
    logger.log(`  ⚠ OpenCode — ${pluginPath} is not the AIOSON plugin; leaving it untouched`);
    return { tool: 'opencode', path: pluginPath, removed: false, reason: 'foreign-file' };
  }
  if (!dryRun) {
    await fs.unlink(pluginPath);
    logger.log(`  ✓ OpenCode plugin removed — ${pluginPath}`);
  } else {
    logger.log(`  [dry-run] Would remove: ${pluginPath}`);
  }
  return { tool: 'opencode', path: pluginPath, removed: true };
}

// ─── Detection ───────────────────────────────────────────────────────────────

async function detectInstalledTools() {
  const detected = [];
  const home = homeDir();
  const checks = [
    { tool: 'claude', path: path.join(home, '.claude') },
    { tool: 'antigravity', path: path.join(home, '.gemini', 'antigravity') },
    { tool: 'codex', path: path.join(home, '.codex') },
    { tool: 'opencode', path: path.join(home, '.config', 'opencode') }
  ];

  for (const { tool, path: p } of checks) {
    try {
      await fs.access(p);
      detected.push(tool);
    } catch { /* not installed */ }
  }

  return detected;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function runHooksInstall({ args, options = {}, logger }) {
  const projectDir = resolveTargetDir(args);
  let agentName;
  try {
    agentName = normalizeHookAgentName(options.agent || 'dev');
  } catch (err) {
    logger.log(`Invalid agent name: ${err.message}`);
    return { ok: false, reason: 'invalid_agent_name', error: err.message };
  }
  const dryRun = options['dry-run'] || options.dryRun || false;
  const includeGuard = !(options['no-guard'] || options.noGuard);
  let tool = options.tool ? String(options.tool).trim().toLowerCase() : 'all';

  if (tool === 'all') {
    const detected = await detectInstalledTools();
    if (detected.length === 0) {
      logger.log('No supported AI tools detected. Install Claude Code, Antigravity, Codex or OpenCode first.');
      return { ok: false, reason: 'no_tools_detected' };
    }
    logger.log(`Detected tools: ${detected.join(', ')}`);
    tool = detected.join(',');
  }

  const tools = tool.split(',').map((t) => t.trim()).filter(Boolean);
  const results = [];

  logger.log(`Hooks Install — agent: @${agentName}${dryRun ? ' [dry-run]' : ''}`);
  logger.log('─'.repeat(50));

  for (const t of tools) {
    try {
      if (t === 'claude') {
        results.push(await installClaudeHooks(agentName, dryRun, logger, includeGuard, guardAgentFor(options, agentName)));
      } else if (t === 'antigravity') {
        results.push(await installAntigravityHooks(agentName, projectDir, dryRun, logger));
      } else if (t === 'codex') {
        results.push(await installCodexHooks(agentName, dryRun, logger));
      } else if (t === 'opencode') {
        results.push(await installOpencodeHooks(agentName, dryRun, logger));
      } else {
        logger.log(`  ⚠ Unknown tool: ${t} — supported: claude, antigravity, codex, opencode`);
      }
    } catch (err) {
      logger.log(`  ✗ ${t}: ${err.message}`);
      results.push({ tool: t, error: err.message });
    }
  }

  logger.log('─'.repeat(50));

  if (!dryRun) {
    logger.log('');
    logger.log('Hooks installed. From now on:');
    if (includeGuard && tools.includes('claude')) {
      logger.log('  • Before each file write/edit → context:guard injects salient project-rule constraints');
    }
    logger.log('  • Every file write/edit → logged as artifact event');
    logger.log('  • Every bash command → logged as step_done event');
    logger.log('  • /aioson:agent:<name> typed in a session → logged as agent_activated');
    logger.log('  • Session end → logged as agent:done');
    if (tools.some((name) => ['claude', 'codex', 'opencode'].includes(name))) {
      logger.log('  • After a compaction → the session checkpoint comes back from the recorded events');
    }
    logger.log('');
    logger.log('To verify: aioson live:status . --agent=' + agentName);
    logger.log('To uninstall: aioson hooks:uninstall --tool=' + tools.join(','));
  }

  if (options.json) {
    return { ok: true, results, agentName, dryRun };
  }

  return { ok: true, results, agentName, dryRun };
}

async function runHooksUninstall({ args, options = {}, logger }) {
  let agentName;
  try {
    agentName = normalizeHookAgentName(options.agent || 'dev');
  } catch (err) {
    logger.log(`Invalid agent name: ${err.message}`);
    return { ok: false, reason: 'invalid_agent_name', error: err.message };
  }
  const projectDir = resolveTargetDir(args);
  const dryRun = options['dry-run'] || options.dryRun || false;
  const tool = options.tool ? String(options.tool).trim().toLowerCase() : 'claude';
  const tools = tool.split(',').map((t) => t.trim()).filter(Boolean);

  logger.log(`Hooks Uninstall — agent: @${agentName}${dryRun ? ' [dry-run]' : ''}`);
  logger.log('─'.repeat(50));

  const results = [];

  const paths = configPaths();
  for (const t of tools) {
    if (t === 'claude') {
      results.push(await scrubHookFile('claude', paths.claude, dryRun, logger, 'Claude Code'));
    } else if (t === 'antigravity') {
      // Install writes both a global and a workspace hooks file — scrub both.
      results.push(await scrubAntigravityHookFile(paths.antigravity, dryRun, logger, 'Antigravity global'));
      results.push(await scrubAntigravityHookFile(
        path.join(projectDir, paths.antigravity_workspace), dryRun, logger, 'Antigravity workspace'
      ));
    } else if (t === 'codex') {
      results.push(await scrubHookFile('codex', paths.codex, dryRun, logger, 'Codex'));
      if (!dryRun && await removeLegacyCodexWrapper(paths.codex_wrapper)) {
        logger.log(`  ✓ Legacy Codex wrapper removed — ${paths.codex_wrapper} (drop its alias from your shell rc if you added one)`);
      }
    } else if (t === 'opencode') {
      results.push(await removeOpencodePlugin(paths.opencode, dryRun, logger));
    } else {
      logger.log(`  ⚠ Unknown tool: ${t} — supported: claude, antigravity, codex, opencode`);
      results.push({ tool: t, removed: false, reason: 'unsupported' });
    }
  }

  return { ok: true, results };
}

// ─── Default install for init/install/update ─────────────────────────────────

// Best-effort hooks install the lifecycle commands run by default: honors
// --no-hooks and dry-run, resolves the hooks target from the command's --tool
// flag (falling back to machine auto-detection for prompt-only tools), and
// never throws — a hooks failure must not fail the surrounding command.
// Calls runHooksInstall through module.exports so tests can stub it.
const DEFAULT_HOOK_TOOLS = new Set(['claude', 'antigravity', 'codex', 'opencode']);

async function installDefaultHooks({ targetDir, options = {}, logger, t }) {
  if (options['no-hooks']) {
    logger.log(t('hooks_setup.skipped'));
    return null;
  }
  const requestedTool = String(options.tool || '').trim().toLowerCase();
  logger.log('');
  logger.log(t('hooks_setup.installing'));
  try {
    return await module.exports.runHooksInstall({
      args: [targetDir],
      options: {
        tool: DEFAULT_HOOK_TOOLS.has(requestedTool) ? requestedTool : 'all',
        'dry-run': Boolean(options['dry-run'])
      },
      logger
    });
  } catch (error) {
    logger.log(t('hooks_setup.failed', { message: error.message }));
    return { ok: false, error: error.message };
  }
}

module.exports = {
  runHooksInstall,
  runHooksUninstall,
  installDefaultHooks,
  buildClaudeHooks,
  buildCodexHooks,
  buildOpencodePlugin,
  guardAgentFor,
  buildAntigravityHooks,
  scrubAntigravityHookFile,
  mergeHookEvents,
  normalizeHookAgentName,
  isAiosonHookEntry,
  readJsonForMerge,
  configPaths,
  OPENCODE_PLUGIN_SIGNATURE
};
