'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const { exists } = require('./utils');
const { isCanonicalAgent } = require('./dossier/schema');

const MANIFESTS_RELATIVE_DIR = '.aioson/agents/manifests';
const ALLOWED_AUTONOMY_MODES = new Set(['guarded', 'trusted', 'headless']);
// Canonical scope-check modes. Kept in sync with SCOPE_CHECK_MODES in
// src/commands/workflow-next.js and src/commands/agents.js — this is the read
// path that validates the manifest's declared check_modes so the field cannot
// silently drift to a mode the router does not understand.
const ALLOWED_CHECK_MODES = new Set(['pre-dev', 'post-dev', 'post-fix', 'final']);

// SF-project-16: every field that influences autonomy is validated on read.
// Unknown fields are passed through (forward-compat), but autonomy_modes and
// check_modes are filtered to their allowed sets. Non-canonical agent ids are
// refused before the file is even opened.
function sanitizeManifest(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const out = { ...raw };
  if (Array.isArray(raw.autonomy_modes)) {
    const filtered = raw.autonomy_modes
      .filter((mode) => typeof mode === 'string' && ALLOWED_AUTONOMY_MODES.has(mode));
    out.autonomy_modes = filtered;
  }
  if (Array.isArray(raw.check_modes)) {
    out.check_modes = raw.check_modes
      .filter((mode) => typeof mode === 'string' && ALLOWED_CHECK_MODES.has(mode));
  }
  return out;
}

async function readAgentManifest(targetDir, agentId) {
  const safeAgentId = String(agentId || '').trim().toLowerCase();
  if (!safeAgentId) return null;
  // Refuse non-canonical agents before reading from disk — closes the
  // manifest-forgery vector for unknown agent ids.
  if (!isCanonicalAgent(safeAgentId)) return null;

  const manifestPath = path.join(targetDir, MANIFESTS_RELATIVE_DIR, `${safeAgentId}.manifest.json`);
  if (!(await exists(manifestPath))) return null;

  try {
    const raw = await fs.readFile(manifestPath, 'utf8');
    return sanitizeManifest(JSON.parse(raw));
  } catch {
    return null;
  }
}

async function resolveAgentCapabilities(targetDir, agentId) {
  const manifest = await readAgentManifest(targetDir, agentId);
  return Array.isArray(manifest && manifest.capabilities) ? manifest.capabilities : [];
}

function supportsTool(manifest, tool) {
  if (!manifest || !Array.isArray(manifest.supported_tools) || manifest.supported_tools.length === 0) {
    return true;
  }
  const safeTool = String(tool || 'codex').trim().toLowerCase();
  return manifest.supported_tools.map((item) => String(item).trim().toLowerCase()).includes(safeTool);
}

function canAgentPerform(manifest, capabilityId) {
  if (!manifest || !Array.isArray(manifest.capabilities)) return false;
  return manifest.capabilities.some((capability) => capability.id === capabilityId);
}

function buildAgentCapabilitySummary(manifest, tool) {
  if (!manifest || !Array.isArray(manifest.capabilities) || manifest.capabilities.length === 0) {
    return '';
  }

  const listed = manifest.capabilities
    .slice(0, 4)
    .map((capability) => `${capability.id} (${capability.category})`)
    .join(', ');

  const supportNote = supportsTool(manifest, tool)
    ? ''
    : ` Current tool "${String(tool || 'codex').toLowerCase()}" is not declared in the manifest.`;

  return `Declared capabilities: ${listed}.${supportNote}`;
}

module.exports = {
  MANIFESTS_RELATIVE_DIR,
  ALLOWED_AUTONOMY_MODES,
  ALLOWED_CHECK_MODES,
  readAgentManifest,
  resolveAgentCapabilities,
  supportsTool,
  canAgentPerform,
  buildAgentCapabilitySummary
};
