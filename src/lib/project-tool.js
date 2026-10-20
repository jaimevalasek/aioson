'use strict';

/**
 * The tool a command speaks to when it runs without --tool; the first answer wins:
 * 1. the harness running it: AIOSON_RUNNER_TOOL, then AIOSON_TOOL — the same
 *    variables, in the same order and trimmed/lowercased, that
 *    model-delegation's detectHost reads — when the value is a project tool
 *    (claude, codex, opencode);
 * 2. the installer's record (install.json `install_profile.tools`) when it
 *    names exactly one project tool: a project installed for several tools
 *    (`init --all`) cannot say which one is calling;
 * 3. the gateway file present (CLAUDE.md → claude, AGENTS.md → codex,
 *    OPENCODE.md → opencode);
 * 4. codex.
 * A hardcoded codex sent Claude installs "Read AGENTS.md and execute @qa"; the
 * first recorded tool then sent every Codex session of an `init --all` project
 * the Claude prompt.
 */

const fs = require('node:fs');
const path = require('node:path');

const GATEWAY_FILES = [['CLAUDE.md', 'claude'], ['AGENTS.md', 'codex'], ['OPENCODE.md', 'opencode']];
const KNOWN_TOOLS = new Set(GATEWAY_FILES.map(([, tool]) => tool));

function envTool(env) {
  const value = String((env && (env.AIOSON_RUNNER_TOOL || env.AIOSON_TOOL)) || '').trim().toLowerCase();
  return KNOWN_TOOLS.has(value) ? value : null;
}

function recordedTool(targetDir) {
  try {
    const install = JSON.parse(fs.readFileSync(path.join(targetDir, '.aioson', 'install.json'), 'utf8'));
    const tools = install && install.install_profile && Array.isArray(install.install_profile.tools)
      ? install.install_profile.tools
      : [];
    const known = [...new Set(tools.filter((tool) => KNOWN_TOOLS.has(tool)))];
    return known.length === 1 ? known[0] : null;
  } catch {
    return null;
  }
}

function defaultProjectTool(targetDir, env = process.env) {
  const fromEnv = envTool(env);
  if (fromEnv) return fromEnv;
  const recorded = recordedTool(targetDir);
  if (recorded) return recorded;
  const present = GATEWAY_FILES.find(([file]) => fs.existsSync(path.join(targetDir, file)));
  return present ? present[1] : 'codex';
}

module.exports = { defaultProjectTool };
