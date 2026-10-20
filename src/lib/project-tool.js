'use strict';

/**
 * The tool a project was installed for, used when a command runs without
 * --tool: the installer's record (install.json `install_profile.tools`), else
 * the gateway file present (CLAUDE.md → claude, AGENTS.md → codex,
 * OPENCODE.md → opencode). Only a project with neither falls back to codex.
 * A hardcoded codex sent Claude installs "Read AGENTS.md and execute @qa".
 */

const fs = require('node:fs');
const path = require('node:path');

const GATEWAY_FILES = [['CLAUDE.md', 'claude'], ['AGENTS.md', 'codex'], ['OPENCODE.md', 'opencode']];
const KNOWN_TOOLS = new Set(GATEWAY_FILES.map(([, tool]) => tool));

function recordedTool(targetDir) {
  try {
    const install = JSON.parse(fs.readFileSync(path.join(targetDir, '.aioson', 'install.json'), 'utf8'));
    const tools = install && install.install_profile && Array.isArray(install.install_profile.tools)
      ? install.install_profile.tools
      : [];
    return tools.find((tool) => KNOWN_TOOLS.has(tool)) || null;
  } catch {
    return null;
  }
}

function defaultProjectTool(targetDir) {
  const recorded = recordedTool(targetDir);
  if (recorded) return recorded;
  const present = GATEWAY_FILES.find(([file]) => fs.existsSync(path.join(targetDir, file)));
  return present ? present[1] : 'codex';
}

module.exports = { defaultProjectTool };
