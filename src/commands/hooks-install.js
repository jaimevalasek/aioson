'use strict';

/**
 * aioson hooks:install [projectDir] --agent=<name> --tool=<claude|antigravity|codex|all>
 *
 * Installs AIOSON event hooks into the AI tool's settings file.
 * After installation, every Write/Edit/Bash tool call and session stop
 * automatically emits a runtime event to SQLite — no manual aioson calls needed.
 *
 * Supported tools:
 *   --tool=claude      → ~/.claude/settings.json
 *   --tool=antigravity → ~/.gemini/antigravity/hooks.json  (+ .agents/hooks.json in project)
 *   --tool=codex       → ~/.codex/config.yaml  (limited: no hook system, documents workaround)
 *   --tool=all         → installs for all detected tools
 */

const path = require('node:path');
const fs = require('node:fs/promises');
const os = require('node:os');
const { getAgentDefinition, normalizeAgentName } = require('../agents');

const HOME = os.homedir();
const HOOK_AGENT_NAME_RE = /^[a-z][a-z0-9-]*$/;

// ─── Config file paths ────────────────────────────────────────────────────────

const CONFIG_PATHS = {
  claude: path.join(HOME, '.claude', 'settings.json'),
  antigravity: path.join(HOME, '.gemini', 'antigravity', 'hooks.json'),
  antigravity_workspace: '.agents/hooks.json' // relative to project
};

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

function makeEmitCommand(agentName, source) {
  // $PWD is the project directory at hook execution time
  return `aioson hooks:emit "$PWD" --agent=${shellQuote(agentName)} --source=${shellQuote(source)} 2>/dev/null || true`;
}

function makeDoneCommand(agentName) {
  return `aioson agent:done "$PWD" --agent=${shellQuote(agentName)} --summary=${shellQuote(`Session ended via ${agentName} hook`)} 2>/dev/null || true`;
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
  'aioson agent:done',
  'aioson context:guard',
  'aioson live:start'
];

function isAiosonHookEntry(entry) {
  const cmd = entry?.hooks?.[0]?.command || entry?.command || '';
  return AIOSON_HOOK_SIGNATURES.some((sig) => cmd.includes(sig));
}

function buildClaudeHooks(agentName, includeGuard = true) {
  const safeAgentName = normalizeHookAgentName(agentName);
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
    Stop: [
      {
        hooks: [{ type: 'command', command: doneCmd }]
      }
    ]
  };

  if (includeGuard) {
    hooks.PreToolUse = [
      {
        matcher: 'Write|Edit|MultiEdit|NotebookEdit',
        hooks: [{ type: 'command', command: makeGuardCommand(safeAgentName) }]
      }
    ];
  }

  return hooks;
}

async function installClaudeHooks(agentName, dryRun, logger, includeGuard = true) {
  const configPath = CONFIG_PATHS.claude;
  await fs.mkdir(path.dirname(configPath), { recursive: true });

  let existing = {};
  try {
    existing = JSON.parse(await fs.readFile(configPath, 'utf8'));
  } catch { /* file doesn't exist yet */ }

  const newHooks = buildClaudeHooks(agentName, includeGuard);

  // Merge: add AIOSON hooks without removing existing ones
  const merged = { ...existing };
  if (!merged.hooks) merged.hooks = {};

  // When the guard is opted out, still scrub any previously-installed guard hook
  // so a reinstall with --no-guard actually removes it.
  for (const event of Object.keys(merged.hooks)) {
    if (newHooks[event]) continue;
    merged.hooks[event] = (merged.hooks[event] || []).filter((entry) => !isAiosonHookEntry(entry));
    if (merged.hooks[event].length === 0) delete merged.hooks[event];
  }

  for (const [event, hookList] of Object.entries(newHooks)) {
    if (!merged.hooks[event]) {
      merged.hooks[event] = hookList;
    } else {
      // Remove any existing AIOSON hooks (to avoid duplicates on reinstall)
      const filtered = merged.hooks[event].filter((entry) => !isAiosonHookEntry(entry));
      merged.hooks[event] = [...filtered, ...hookList];
    }
  }

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
    logger.log(`    Stop → agent:done`);
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
  const globalPath = CONFIG_PATHS.antigravity;
  const workspacePath = path.join(projectDir, CONFIG_PATHS.antigravity_workspace);

  const hooks = buildAntigravityHooks(agentName);

  if (!dryRun) {
    await fs.mkdir(path.dirname(globalPath), { recursive: true });
    await fs.mkdir(path.dirname(workspacePath), { recursive: true });

    // Global hooks
    let globalExisting = {};
    try { globalExisting = JSON.parse(await fs.readFile(globalPath, 'utf8')); } catch { /* new file */ }
    const mergedGlobal = mergeAntigravityHooks(globalExisting, hooks);
    await fs.writeFile(globalPath, JSON.stringify(mergedGlobal, null, 2), 'utf8');
    logger.log(`  ✓ Antigravity global — ${globalPath}`);

    // Workspace hooks (project-scoped, takes priority)
    let wsExisting = {};
    try { wsExisting = JSON.parse(await fs.readFile(workspacePath, 'utf8')); } catch { /* new file */ }
    const mergedWs = mergeAntigravityHooks(wsExisting, hooks);
    await fs.writeFile(workspacePath, JSON.stringify(mergedWs, null, 2), 'utf8');
    logger.log(`  ✓ Antigravity workspace — ${workspacePath}`);
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

// ─── Codex (OpenAI) ───────────────────────────────────────────────────────────

async function installCodexHooks(agentName, dryRun, logger) {
  const safeAgentName = normalizeHookAgentName(agentName);
  // Codex CLI does not have a native hook system as of 2026.
  // The workaround: add a shell alias that wraps `codex` and calls live:start before / agent:done after.
  const configPath = path.join(HOME, '.codex', 'config.yaml');
  const wrapperPath = path.join(HOME, '.codex', 'aioson-wrapper.sh');

  const wrapperScript = `#!/bin/bash
# AIOSON session wrapper for Codex CLI
# Generated by: aioson hooks:install --tool=codex --agent=${safeAgentName}
# Usage: replace \`codex\` calls with \`codex-aioson\` OR add to .bashrc:
#   alias codex='${wrapperPath}'

PROJECT_DIR="\${1:-$PWD}"
AGENT=${shellQuote(safeAgentName)}

# Start live session before Codex runs
aioson live:start "$PROJECT_DIR" --agent="$AGENT" --tool=codex --no-launch 2>/dev/null || true

# Run Codex with all original arguments
codex-bin "$@"
EXIT_CODE=$?

# Register session end
aioson agent:done "$PROJECT_DIR" --agent="$AGENT" --summary="Codex session ended" 2>/dev/null || true

exit $EXIT_CODE
`;

  if (!dryRun) {
    await fs.mkdir(path.dirname(wrapperPath), { recursive: true });
    await fs.writeFile(wrapperPath, wrapperScript, 'utf8');
    await fs.chmod(wrapperPath, 0o755);
    logger.log(`  ✓ Codex wrapper — ${wrapperPath}`);
    logger.log(`  ⚠ Codex has no native hooks. Add this to ~/.bashrc:`);
    logger.log(`    alias codex='${wrapperPath}'`);
    logger.log(`  Or rename: mv $(which codex) $(which codex)-bin`);
  } else {
    logger.log(`  [dry-run] Would write: ${wrapperPath}`);
    logger.log(`  ⚠ Codex has no native hook system. Wrapper script approach only.`);
  }

  return { tool: 'codex', wrapperPath, limited: true };
}

// ─── Detection ───────────────────────────────────────────────────────────────

async function detectInstalledTools() {
  const detected = [];
  const checks = [
    { tool: 'claude', path: path.join(HOME, '.claude') },
    { tool: 'antigravity', path: path.join(HOME, '.gemini', 'antigravity') },
    { tool: 'codex', path: path.join(HOME, '.codex') }
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
  const projectDir = path.resolve(process.cwd(), args[0] || '.');
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
      logger.log('No supported AI tools detected. Install Claude Code, Antigravity, or Codex first.');
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
        results.push(await installClaudeHooks(agentName, dryRun, logger, includeGuard));
      } else if (t === 'antigravity') {
        results.push(await installAntigravityHooks(agentName, projectDir, dryRun, logger));
      } else if (t === 'codex') {
        results.push(await installCodexHooks(agentName, dryRun, logger));
      } else {
        logger.log(`  ⚠ Unknown tool: ${t} — supported: claude, antigravity, codex`);
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
    logger.log('  • Session end → logged as agent:done');
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
  const dryRun = options['dry-run'] || options.dryRun || false;
  const tool = options.tool ? String(options.tool).trim().toLowerCase() : 'claude';
  const tools = tool.split(',').map((t) => t.trim()).filter(Boolean);

  logger.log(`Hooks Uninstall — agent: @${agentName}${dryRun ? ' [dry-run]' : ''}`);
  logger.log('─'.repeat(50));

  for (const t of tools) {
    if (t === 'claude') {
      try {
        const configPath = CONFIG_PATHS.claude;
        const existing = JSON.parse(await fs.readFile(configPath, 'utf8'));
        if (existing.hooks) {
          for (const event of Object.keys(existing.hooks)) {
            existing.hooks[event] = (existing.hooks[event] || []).filter((entry) => !isAiosonHookEntry(entry));
            if (existing.hooks[event].length === 0) delete existing.hooks[event];
          }
          if (Object.keys(existing.hooks).length === 0) delete existing.hooks;
        }
        if (!dryRun) {
          await fs.writeFile(configPath, JSON.stringify(existing, null, 2), 'utf8');
          logger.log(`  ✓ Claude Code hooks removed — ${configPath}`);
        } else {
          logger.log(`  [dry-run] Would remove AIOSON hooks from: ${configPath}`);
        }
      } catch {
        logger.log(`  Claude Code settings not found — nothing to remove`);
      }
    }
  }

  return { ok: true };
}

module.exports = {
  runHooksInstall,
  runHooksUninstall,
  buildClaudeHooks,
  buildAntigravityHooks,
  normalizeHookAgentName,
  isAiosonHookEntry
};
