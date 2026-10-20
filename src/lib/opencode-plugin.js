'use strict';

/**
 * The OpenCode adapter is a plugin file, not a settings entry: OpenCode loads
 * JavaScript from ~/.config/opencode/plugins/ and calls the hooks it returns.
 * The plugin itself lives next to this module as real ESM
 * (opencode-plugin.mjs), loaded for real by the tests; rendering only bakes
 * the agent name in. The first line is the signature install and uninstall
 * use to tell the file apart from a user's own plugin.
 */

const fs = require('node:fs');
const path = require('node:path');

const OPENCODE_PLUGIN_SIGNATURE = '// AIOSON OpenCode plugin';
const TEMPLATE_PATH = path.join(__dirname, 'opencode-plugin.mjs');
const AGENT_PLACEHOLDER = /__AIOSON_AGENT__/g;

/** @param {string} agentName an already validated kebab-case agent id */
function renderOpencodePlugin(agentName) {
  const template = fs.readFileSync(TEMPLATE_PATH, 'utf8');
  if (!template.startsWith(OPENCODE_PLUGIN_SIGNATURE)) {
    throw new Error('opencode-plugin.mjs lost its signature line');
  }
  return template.replace(AGENT_PLACEHOLDER, agentName);
}

module.exports = { renderOpencodePlugin, OPENCODE_PLUGIN_SIGNATURE };
