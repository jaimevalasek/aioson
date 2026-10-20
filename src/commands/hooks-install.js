'use strict';

/**
 * aioson hooks:install [projectDir] --agent=<name> --tool=<claude|antigravity|codex|opencode|all>
 *
 * Installs AIOSON event hooks into the AI tool's settings file.
 * After installation, every Write/Edit/Bash tool call and session stop
 * automatically emits a runtime event to SQLite — no manual aioson calls needed.
 *
 * Supported tools:
 *   --tool=claude      → ~/.claude/settings.json  ($CLAUDE_CONFIG_DIR when set)
 *   --tool=antigravity → ~/.gemini/antigravity/hooks.json  (+ .agents/hooks.json in project)
 *   --tool=codex       → ~/.codex/hooks.json  ($CODEX_HOME when set; Codex asks you to trust them once via /hooks)
 *   --tool=opencode    → ~/.config/opencode/plugins/aioson.js  ($XDG_CONFIG_HOME when set; a plugin on OpenCode's hook API)
 *   --tool=all         → installs for all detected tools
 */

const path = require('node:path');
const fs = require('node:fs/promises');
const os = require('node:os');
const { getAgentDefinition, normalizeAgentName } = require('../agents');
const { resolveTargetDir } = require('../lib/project-root');
const { renderOpencodePlugin, OPENCODE_PLUGIN_SIGNATURE } = require('../lib/opencode-plugin');
// Where each harness keeps its hooks, which handler is AIOSON's, and the safe
// read/merge/write of those files (src/lib/hook-settings-files.js).
const {
  configPaths,
  isAiosonHandler,
  allHandlers,
  readJsonForMerge,
  unusableConfig,
  writeFileAtomic,
  writeScrubbed,
  mergeHookEvents,
  aiosonDefinition,
  scrubHookFile
} = require('../lib/hook-settings-files');

const HOOK_AGENT_NAME_RE = /^[a-z][a-z0-9-]*$/;
const HOOK_TIMEOUT_SECONDS = 30;
// Codex caps a SessionEnd hook at 3 s (it clamps a longer timeout and warns at
// every start), so the end of a session is recorded by the lean hooks:emit.
const SESSION_END_TIMEOUT_SECONDS = 3;

// Resolved per call, never at load: tests point the home at a temporary directory.
function homeDir() {
  return os.homedir();
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
// `then` closes the turn in-process after the event (`--then=agent:done`);
// `extra` carries further flags (`--event=SessionEnd`).
function makeEmitCommand(agentName, source, { then = null, extra = [] } = {}) {
  const thenFlag = then ? ` --then=${then}` : '';
  const extraFlags = extra.length ? ` ${extra.join(' ')}` : '';
  return `aioson hooks:emit "$PWD"${thenFlag} --agent=${shellQuote(agentName)} --source=${shellQuote(source)}${extraFlags} 2>/dev/null || true`;
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

// The guard judges a write with the rules of the agent acting at that moment.
// A default install (no `--agent`) bakes `auto`, and the guard resolves the
// active agent at runtime; telemetry hooks keep the install-time agent. A
// default reinstall (init/install/update) passes the guard agent it found
// installed (`guard-agent`), so it keeps what the user chose.
function guardAgentFor(options, agentName) {
  if (options && options['guard-agent']) return String(options['guard-agent']);
  return options && options.agent ? agentName : 'auto';
}

// ─── Claude Code ─────────────────────────────────────────────────────────────

// One matcher group with one command handler — the shape every Claude Code hook here takes.
function commandGroup(matcher, command) {
  const hooks = [{ type: 'command', command }];
  return matcher ? { matcher, hooks } : { hooks };
}

function buildClaudeHooks(agentName, includeGuard = true, guardAgent = agentName) {
  const safeAgentName = normalizeHookAgentName(agentName);
  const safeGuardAgent = normalizeHookAgentName(guardAgent);
  const emitCmd = makeEmitCommand(safeAgentName, 'claude');

  const hooks = {
    PostToolUse: [
      commandGroup('Write|Edit|MultiEdit', emitCmd),
      commandGroup('Bash', emitCmd),
      // `Skill`: an AIOSON agent the model activates itself (`aioson:agent:<id>`,
      // an autopilot handoff) is recorded as the agent now working.
      commandGroup('Task|TodoWrite|Skill', emitCmd)
    ],
    // A failing command (non-zero exit) fires this instead of PostToolUse:
    // hooks:emit records it as a failed test step.
    PostToolUseFailure: [commandGroup('Bash', emitCmd)],
    // `/aioson:agent:dev` typed inside the session: records which agent the
    // user activated (the session itself opens without one).
    UserPromptSubmit: [commandGroup(null, emitCmd)],
    // The agent's final message is recorded first, then the turn is closed —
    // agent:done in the same process, and only inside an AIOSON project.
    Stop: [commandGroup(null, makeEmitCommand(safeAgentName, 'claude', { then: 'agent:done' }))],
    // Compaction keeps a model-written summary; the hooks keep the facts. The
    // marker bounds the stretch, and the next SessionStart (source `compact`)
    // gets the checkpoint rebuilt from it — no agent has to remember to write.
    PreCompact: [commandGroup(null, emitCmd)],
    SessionStart: [commandGroup('compact', makeRecapCommand(safeAgentName, 'claude'))]
  };

  if (includeGuard) {
    hooks.PreToolUse = [commandGroup('Write|Edit|MultiEdit|NotebookEdit', makeGuardCommand(safeGuardAgent))];
  }

  return hooks;
}

async function installClaudeHooks(agentName, dryRun, logger, includeGuard = true, guardAgent = agentName) {
  const configPath = configPaths().claude;

  const read = await readJsonForMerge(configPath);
  const skipped = unusableConfig(read, 'Claude Code', configPath, logger);
  if (skipped) return { tool: 'claude', configPath, skipped };

  const newHooks = buildClaudeHooks(agentName, includeGuard, guardAgent);
  // Merge: add AIOSON hooks without removing the user's own. A previously
  // installed guard hook is scrubbed too, so a reinstall with --no-guard
  // actually removes it.
  const merged = mergeHookEvents(read.data, newHooks);

  if (!dryRun) {
    await writeFileAtomic(configPath, JSON.stringify(merged, null, 2));
    logger.log(`  ✓ Claude Code — ${configPath}`);
  } else {
    logger.log(`  [dry-run] Would write: ${configPath}`);
    logger.log(`  Hooks to add:`);
    if (includeGuard) {
      logger.log(`    PreToolUse (Write|Edit|MultiEdit|NotebookEdit) → context:guard`);
    }
    logger.log(`    PostToolUse (Write|Edit|MultiEdit|Bash|Task|TodoWrite|Skill) → hooks:emit`);
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
    const skipped = [];

    // Global hooks
    const globalRead = await readJsonForMerge(globalPath);
    if (unusableConfig(globalRead, 'Antigravity global', globalPath, logger)) {
      skipped.push('global');
    } else {
      const mergedGlobal = mergeAntigravityHooks(globalRead.data, hooks);
      await writeFileAtomic(globalPath, JSON.stringify(mergedGlobal, null, 2));
      logger.log(`  ✓ Antigravity global — ${globalPath}`);
    }

    // Workspace hooks (project-scoped, takes priority)
    const wsRead = await readJsonForMerge(workspacePath);
    if (unusableConfig(wsRead, 'Antigravity workspace', workspacePath, logger)) {
      skipped.push('workspace');
    } else {
      const mergedWs = mergeAntigravityHooks(wsRead.data, hooks);
      await writeFileAtomic(workspacePath, JSON.stringify(mergedWs, null, 2));
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
  return writeScrubbed('antigravity', filePath, existing, dryRun, logger, label);
}

// ─── Codex (OpenAI) ───────────────────────────────────────────────────────────

// Codex hooks (stable, on by default) read Claude's shape — `~/.codex/hooks.json`
// with the events under `hooks`, matcher groups and command handlers — and send
// the same stdin fields, so the emit/recap commands are shared. Differences:
// a failing command still arrives as PostToolUse (no PostToolUseFailure, and the
// output text carries no exit code), file edits are the `apply_patch` tool and
// the plan tool is `update_plan` (hooks:emit reads both), and the session end
// has its own SessionEnd event. Codex runs `commandWindows` through
// `cmd.exe /C` on Windows, where "$PWD" and `|| true` mean nothing: those lines
// end with `2>nul & exit /b 0`, so a missing `aioson` or a crash is never a
// failed hook on every tool call. The agent name is validated kebab-case, so it
// needs no quoting there.
//
// Telemetry handlers run `async` (Codex keeps going while they record); the
// compaction marker and the checkpoint stay synchronous, so the marker lands
// before the summary and the checkpoint before the next model request. A new or
// changed hook runs only after the user trusts it (`/hooks` inside Codex) — by
// design, not ours to grant — so every handler change ships in one release.
function buildCodexHooks(agentName) {
  const safeAgentName = normalizeHookAgentName(agentName);
  const windows = (parts) => `${parts.join(' ')} 2>nul & exit /b 0`;
  const handler = (spec, extra = {}) => ({ type: 'command', timeout: HOOK_TIMEOUT_SECONDS, ...spec, ...extra });
  const group = (matcher, hooks) => (matcher ? { matcher, hooks } : { hooks });
  const emit = {
    command: makeEmitCommand(safeAgentName, 'codex'),
    commandWindows: windows(['aioson hooks:emit .', `--agent=${safeAgentName}`, '--source=codex'])
  };

  return {
    PostToolUse: [group('apply_patch|Bash|update_plan', [handler(emit, { async: true })])],
    UserPromptSubmit: [group(null, [handler(emit, { async: true })])],
    // The final message of a turn; the session itself closes at SessionEnd.
    Stop: [group(null, [handler(emit, { async: true })])],
    PreCompact: [group(null, [handler(emit)])],
    SessionStart: [group('compact', [handler({
      command: makeRecapCommand(safeAgentName, 'codex'),
      commandWindows: windows(['aioson hooks:recap .', `--agent=${safeAgentName}`, '--source=codex', '--json'])
    }, { statusMessage: 'AIOSON: restoring the session checkpoint' })])],
    // Records the end and closes the hooks session — no done-gates within Codex's 3 s.
    SessionEnd: [group(null, [handler({
      command: makeEmitCommand(safeAgentName, 'codex', { extra: ['--event=SessionEnd'] }),
      commandWindows: windows(['aioson hooks:emit .', `--agent=${safeAgentName}`, '--source=codex', '--event=SessionEnd'])
    }, { timeout: SESSION_END_TIMEOUT_SECONDS })])]
  };
}

const LEGACY_WRAPPER_SIGNATURE = '# AIOSON session wrapper for Codex CLI';
const CODEX_WRAPPER_PASSTHROUGH = [
  '#!/bin/bash',
  '# AIOSON: retired Codex wrapper. Codex runs the native hooks in hooks.json now;',
  '# this file only passes through, so a shell alias that still points here keeps',
  '# opening Codex. Drop the `alias codex=...` line from your shell rc, then delete it.',
  'echo "aioson: $0 is deprecated (Codex runs the native AIOSON hooks); remove its alias from your shell rc." >&2',
  'if command -v codex-bin >/dev/null 2>&1; then exec codex-bin "$@"; fi',
  'exec codex "$@"',
  ''
].join('\n');

// The pre-native-hooks wrapper becomes a pass-through instead of disappearing:
// the old installer told users to alias `codex` to it, and deleting it left
// that alias pointing at nothing. A file that is not that wrapper is left alone.
async function retireLegacyCodexWrapper(wrapperPath) {
  let content;
  try {
    content = await fs.readFile(wrapperPath, 'utf8');
  } catch {
    return false;
  }
  if (!content.includes(LEGACY_WRAPPER_SIGNATURE)) return false;
  await writeFileAtomic(wrapperPath, CODEX_WRAPPER_PASSTHROUGH);
  await fs.chmod(wrapperPath, 0o755).catch(() => {});
  return true;
}

async function installCodexHooks(agentName, dryRun, logger) {
  const paths = configPaths();
  const configPath = paths.codex;
  const read = await readJsonForMerge(configPath);
  const skipped = unusableConfig(read, 'Codex', configPath, logger);
  if (skipped) return { tool: 'codex', configPath, skipped };

  const newHooks = buildCodexHooks(agentName);
  const merged = mergeHookEvents(read.data, newHooks);
  // Codex keeps trust by each hook's definition and position: an unchanged set
  // is left byte for byte, so the review the user gave in /hooks still holds.
  const unchanged = aiosonDefinition(read.data) === aiosonDefinition(merged);

  if (!dryRun) {
    if (unchanged) {
      logger.log(`  ✓ Codex — ${configPath} (AIOSON hooks unchanged; the trust given in /hooks still holds)`);
    } else {
      await writeFileAtomic(configPath, JSON.stringify(merged, null, 2));
      logger.log(`  ✓ Codex — ${configPath}`);
      logger.log('  ⚠ Codex runs a new or changed hook only after you trust it: open Codex and run /hooks once — one review covers every AIOSON hook this version changed (automation may pass --dangerously-bypass-hook-trust).');
    }
    if (await retireLegacyCodexWrapper(paths.codex_wrapper)) {
      logger.log(`  ✓ Legacy Codex wrapper retired — ${paths.codex_wrapper} now only passes through to codex (drop its alias from your shell rc)`);
    }
  } else {
    logger.log(`  [dry-run] Would write: ${configPath}${unchanged ? ' (unchanged)' : ''}`);
    logger.log('  Hooks to add:');
    logger.log('    PostToolUse (apply_patch|Bash|update_plan) → hooks:emit (async)');
    logger.log('    UserPromptSubmit → hooks:emit (agent activated in the session, async)');
    logger.log('    Stop → hooks:emit (final message, async)');
    logger.log('    PreCompact → hooks:emit (compaction marker)');
    logger.log('    SessionStart (compact) → hooks:recap (session checkpoint)');
    logger.log('    SessionEnd → hooks:emit --event=SessionEnd (closes the hooks session)');
    logger.log('  After installing, trust the hooks once with /hooks inside Codex.');
  }

  return { tool: 'codex', configPath, hooks: newHooks, unchanged };
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
    await writeFileAtomic(pluginPath, source);
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
  const paths = configPaths();
  const checks = [
    { tool: 'claude', path: path.dirname(paths.claude) },
    { tool: 'antigravity', path: path.join(home, '.gemini', 'antigravity') },
    { tool: 'codex', path: path.dirname(paths.codex) },
    { tool: 'opencode', path: path.dirname(path.dirname(paths.opencode)) }
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
      if (!dryRun && await retireLegacyCodexWrapper(paths.codex_wrapper)) {
        logger.log(`  ✓ Legacy Codex wrapper retired — ${paths.codex_wrapper} now only passes through to codex (drop its alias from your shell rc)`);
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

/** The agents AIOSON's handlers in one hooks file name: `{ agent, guard }`, each when present. */
function hookFileAgents(data) {
  const found = {};
  for (const handler of allHandlers(data).filter(isAiosonHandler)) {
    const match = /--agent='?([a-z][a-z0-9-]*)'?/.exec(handler.command);
    const key = /^aioson context:guard /.test(handler.command) ? 'guard' : 'agent';
    if (match && !found[key]) found[key] = match[1];
  }
  return found;
}

/** The agent the installed OpenCode plugin bakes in, or null. */
async function pluginAgent(pluginPath) {
  try {
    const plugin = await fs.readFile(pluginPath, 'utf8');
    const match = plugin.startsWith(OPENCODE_PLUGIN_SIGNATURE) && /const AGENT = "([a-z][a-z0-9-]*)";/.exec(plugin);
    return match ? match[1] : null;
  } catch {
    return null;
  }
}

// The agent a previous install baked into the hooks (and the guard agent of the
// Claude hooks), so a default reinstall keeps what the user chose instead of
// resetting it to `dev` — which, for Codex, would also void the trust given in
// /hooks. Best-effort: nothing found answers no agent.
async function installedHookAgents() {
  const paths = configPaths();
  const found = {};
  for (const file of [paths.claude, paths.codex]) {
    const agents = hookFileAgents((await readJsonForMerge(file)).data);
    found.agent = found.agent || agents.agent;
    found.guard = found.guard || agents.guard;
  }
  if (!found.agent) found.agent = await pluginAgent(paths.opencode);
  return found;
}

// Best-effort hooks install the lifecycle commands run by default: honors
// --no-hooks and dry-run, resolves the hooks target from the command's --tool
// flag (falling back to machine auto-detection for prompt-only tools), keeps
// the agent already installed, and never throws — a hooks failure must not fail
// the surrounding command. Calls runHooksInstall through module.exports so
// tests can stub it.
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
    const kept = await installedHookAgents().catch(() => ({}));
    return await module.exports.runHooksInstall({
      args: [targetDir],
      options: {
        tool: DEFAULT_HOOK_TOOLS.has(requestedTool) ? requestedTool : 'all',
        'dry-run': Boolean(options['dry-run']),
        ...(kept.agent ? { agent: kept.agent, 'guard-agent': kept.guard || 'auto' } : {})
      },
      logger
    });
  } catch (error) {
    logger.log(t('hooks_setup.failed', { message: error.message }));
    return { ok: false, error: error.message };
  }
}

// The settings-file layer (configPaths, isAiosonHandler, isAiosonHookEntry,
// readJsonForMerge, mergeHookEvents, writeFileAtomic) is exported by
// src/lib/hook-settings-files.js, and OPENCODE_PLUGIN_SIGNATURE by
// src/lib/opencode-plugin.js — one owner each.
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
  normalizeHookAgentName
};
