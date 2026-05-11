'use strict';

// Permissions generator
//
// Reads `.aioson/config/autonomy-protocol.json` and derives the four native
// permission files used by the supported harnesses. Idempotent: rewrites the
// outputs every time, backing up any previous version under
// `.aioson/backups/{timestamp}/permissions/{tool}/`.
//
// Hard rule: `tier3_blocking` is NEVER materialized into a tool's allow list,
// even if a tool lists it in `derived_from_tiers`.

const fs = require('node:fs/promises');
const path = require('node:path');

const PROTOCOL_RELATIVE_PATH = path.join('.aioson', 'config', 'autonomy-protocol.json');
const TIER3_KEY = 'tier3_blocking';

// ─── IO helpers ───────────────────────────────────────────────────────────

async function readProtocol(targetDir) {
  const file = path.join(targetDir, PROTOCOL_RELATIVE_PATH);
  try {
    const raw = await fs.readFile(file, 'utf8');
    const json = JSON.parse(raw);
    return { ok: true, protocol: json, file };
  } catch (err) {
    return { ok: false, error: err, file };
  }
}

async function fileExists(filePath) {
  try {
    const stat = await fs.stat(filePath);
    return stat.isFile();
  } catch {
    return false;
  }
}

async function ensureDir(dirPath) {
  await fs.mkdir(dirPath, { recursive: true });
}

function nowStamp() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

async function backupExisting(targetDir, relativePath, backupRoot) {
  const abs = path.join(targetDir, relativePath);
  if (!(await fileExists(abs))) return null;
  const dest = path.join(backupRoot, relativePath);
  await ensureDir(path.dirname(dest));
  const content = await fs.readFile(abs);
  await fs.writeFile(dest, content);
  return dest;
}

async function writeFileAtomic(filePath, content) {
  await ensureDir(path.dirname(filePath));
  await fs.writeFile(filePath, content, 'utf8');
}

// ─── Tier resolution ──────────────────────────────────────────────────────

function resolveDerivedSets(protocol, tool) {
  const tiers = (protocol && protocol.tiers) || {};
  const derivedKeys = Array.isArray(tool.derived_from_tiers) ? tool.derived_from_tiers : [];

  const shellSet = new Set();
  const aiosonSet = new Set();

  for (const key of derivedKeys) {
    if (key === TIER3_KEY) continue; // never bypassable
    const tier = tiers[key];
    if (!tier) continue;
    for (const p of tier.shell_patterns || []) shellSet.add(p);
    for (const c of tier.aioson_commands || []) aiosonSet.add(c);
  }

  return {
    shellPatterns: [...shellSet],
    aiosonCommands: [...aiosonSet]
  };
}

function resolveLegacySets(tool) {
  // v1.0 fallback: tool exposes its own shell_whitelist + aioson_whitelist.
  return {
    shellPatterns: Array.isArray(tool.shell_whitelist) ? [...tool.shell_whitelist] : [],
    aiosonCommands: Array.isArray(tool.aioson_whitelist) ? [...tool.aioson_whitelist] : []
  };
}

function resolveToolSets(protocol, tool) {
  const isV11 = String(protocol.version || '').startsWith('1.1');
  if (isV11 && Array.isArray(tool.derived_from_tiers) && tool.derived_from_tiers.length > 0) {
    return resolveDerivedSets(protocol, tool);
  }
  return resolveLegacySets(tool);
}

// ─── Per-tool serializers ─────────────────────────────────────────────────

// Convert a generic shell pattern (e.g. "git diff *") into Claude's Bash(...) form.
// Patterns ending in " *" become "Bash(<prefix>:*)"; exact patterns become "Bash(<pattern>)".
function shellToClaudeRule(pattern) {
  const trimmed = String(pattern || '').trim();
  if (!trimmed) return null;
  if (trimmed.endsWith(' *')) {
    const prefix = trimmed.slice(0, -2).trim();
    return `Bash(${prefix}:*)`;
  }
  // Reject patterns that still contain unsupported wildcards in the middle.
  if (trimmed.includes('*')) return `Bash(${trimmed})`;
  return `Bash(${trimmed})`;
}

function aiosonToClaudeRule(command) {
  const trimmed = String(command || '').trim();
  if (!trimmed) return null;
  return `Bash(aioson ${trimmed}:*)`;
}

function buildClaudeSettings({ shellPatterns, aiosonCommands }) {
  const allow = [];
  for (const p of shellPatterns) {
    const rule = shellToClaudeRule(p);
    if (rule) allow.push(rule);
  }
  for (const c of aiosonCommands) {
    const rule = aiosonToClaudeRule(c);
    if (rule) allow.push(rule);
  }
  return {
    permissions: {
      allow: [...new Set(allow)]
    }
  };
}

function buildCodexPermissions({ shellPatterns, aiosonCommands }, tool) {
  return {
    version: '1.1',
    mode: tool.mode || 'guarded',
    shell_allowed: shellPatterns,
    aioson_allowed: aiosonCommands,
    requires_tty: Boolean(tool.requires_tty)
  };
}

// Minimal, hand-rolled TOML emitter — keys are constant, values are strings.
function tomlString(value) {
  // Escape backslashes and double-quotes; no other special handling needed for our values.
  return `"${String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

function buildGeminiToml({ shellPatterns, aiosonCommands }, tool) {
  const lines = [];
  lines.push('# Generated by aioson permissions-generator. Do not edit by hand.');
  lines.push('version = "1.1"');
  lines.push(`mode = ${tomlString(tool.mode || 'guarded')}`);
  lines.push(`requires_tty = ${Boolean(tool.requires_tty)}`);
  lines.push('');
  lines.push('shell_allowed = [');
  for (const p of shellPatterns) lines.push(`  ${tomlString(p)},`);
  lines.push(']');
  lines.push('');
  lines.push('aioson_allowed = [');
  for (const c of aiosonCommands) lines.push(`  ${tomlString(c)},`);
  lines.push(']');
  return lines.join('\n') + '\n';
}

// Minimal hand-rolled YAML emitter — same constraints as TOML above.
function yamlString(value) {
  return `"${String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

function buildOpencodeYaml({ shellPatterns, aiosonCommands }, tool) {
  const lines = [];
  lines.push('# Generated by aioson permissions-generator. Do not edit by hand.');
  lines.push('version: "1.1"');
  lines.push(`mode: ${yamlString(tool.mode || 'guarded')}`);
  lines.push(`requires_tty: ${Boolean(tool.requires_tty)}`);
  lines.push('shell_allowed:');
  if (shellPatterns.length === 0) {
    lines.push('  []');
  } else {
    for (const p of shellPatterns) lines.push(`  - ${yamlString(p)}`);
  }
  lines.push('aioson_allowed:');
  if (aiosonCommands.length === 0) {
    lines.push('  []');
  } else {
    for (const c of aiosonCommands) lines.push(`  - ${yamlString(c)}`);
  }
  return lines.join('\n') + '\n';
}

// ─── Output map ───────────────────────────────────────────────────────────

const OUTPUT_PATHS = {
  claude: '.claude/settings.json',
  codex: '.codex/permissions.json',
  gemini: '.gemini/permissions.toml',
  opencode: '.opencode/permissions.yaml'
};

// For Claude only: merge with any existing user/local edits so we don't blow them away.
async function mergeClaudeSettings(targetDir, generated) {
  const filePath = path.join(targetDir, OUTPUT_PATHS.claude);
  let existing = {};
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    existing = JSON.parse(raw);
  } catch {
    existing = {};
  }
  const existingAllow = Array.isArray(existing?.permissions?.allow) ? existing.permissions.allow : [];
  const generatedAllow = generated.permissions.allow;
  const merged = [...new Set([...generatedAllow, ...existingAllow])];
  return {
    ...existing,
    permissions: {
      ...(existing.permissions || {}),
      allow: merged
    }
  };
}

// ─── Public API ───────────────────────────────────────────────────────────

/**
 * Generate native permission files for each supported harness.
 *
 * @param {string} targetDir absolute project root
 * @param {object} [options]
 * @param {boolean} [options.dryRun] when true, do not write any files
 * @param {string[]} [options.tools] restrict generation to these tools
 * @returns {Promise<{written:string[], backedUp:string[], skipped:string[], protocolVersion:string}>}
 */
async function generatePermissions(targetDir, options = {}) {
  const dryRun = Boolean(options.dryRun);
  const toolsFilter = Array.isArray(options.tools) ? new Set(options.tools) : null;

  const { ok, protocol, file } = await readProtocol(targetDir);
  const written = [];
  const backedUp = [];
  const skipped = [];

  if (!ok) {
    return { written, backedUp, skipped: [file], protocolVersion: null, missing: true };
  }

  const tools = (protocol && protocol.tools) || {};
  const backupRoot = path.join(targetDir, '.aioson', 'backups', nowStamp(), 'permissions');

  for (const [name, tool] of Object.entries(tools)) {
    if (toolsFilter && !toolsFilter.has(name)) {
      skipped.push(name);
      continue;
    }
    const outRel = OUTPUT_PATHS[name];
    if (!outRel) {
      skipped.push(name);
      continue;
    }
    const sets = resolveToolSets(protocol, tool);
    let content;
    if (name === 'claude') {
      const generated = buildClaudeSettings(sets);
      const merged = await mergeClaudeSettings(targetDir, generated);
      content = JSON.stringify(merged, null, 2) + '\n';
    } else if (name === 'codex') {
      content = JSON.stringify(buildCodexPermissions(sets, tool), null, 2) + '\n';
    } else if (name === 'gemini') {
      content = buildGeminiToml(sets, tool);
    } else if (name === 'opencode') {
      content = buildOpencodeYaml(sets, tool);
    } else {
      skipped.push(name);
      continue;
    }

    if (dryRun) {
      written.push(outRel);
      continue;
    }

    const backupPath = await backupExisting(targetDir, outRel, backupRoot);
    if (backupPath) backedUp.push(path.relative(targetDir, backupPath));
    await writeFileAtomic(path.join(targetDir, outRel), content);
    written.push(outRel);
  }

  return {
    written,
    backedUp,
    skipped,
    protocolVersion: String(protocol.version || ''),
    missing: false
  };
}

module.exports = {
  PROTOCOL_RELATIVE_PATH,
  OUTPUT_PATHS,
  resolveToolSets,
  buildClaudeSettings,
  buildCodexPermissions,
  buildGeminiToml,
  buildOpencodeYaml,
  generatePermissions
};
