'use strict';

/**
 * Preflight Context Estimator — Plan 80, Script 2
 *
 * Estimates the token budget consumed by system prompt components before
 * a session starts. Provides visibility into truncation risk and detects
 * duplicate content between context files.
 *
 * Usage:
 *   node preflight-context.js --agent=dev [--squad=<slug>] [--verbose]
 *
 * Output: visual bar chart of context budget per component.
 */

const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');

const SQUADS_DIR = path.join('.aioson', 'squads');

// Default limits (chars). Agent files are read manually and are not subject to
// auto-loaded gateway truncation; the larger limit is the documented hard cap.
const DEFAULT_LIMITS = {
  agent_file: 40000,
  config: 40000,
  project_context: 4000,
  rules: 40000,
  squad_files: 8000,
  claude_md: 4000
};

// ─── File size reader ────────────────────────────────────────────────────────

async function readFileChars(filePath) {
  try {
    const content = await fs.readFile(filePath, 'utf8');
    return { chars: content.length, content };
  } catch {
    return { chars: 0, content: '' };
  }
}

// ─── Duplicate detection ─────────────────────────────────────────────────────

/**
 * Build content fingerprints from chunks of text.
 * Uses sliding window of ~200 chars to detect shared blocks.
 */
function buildFingerprints(content, windowSize = 200) {
  const hashes = new Set();
  const text = content.replace(/\s+/g, ' ').trim();

  for (let i = 0; i <= text.length - windowSize; i += windowSize / 2) {
    const chunk = text.slice(i, i + windowSize);
    const hash = crypto.createHash('md5').update(chunk).digest('hex').slice(0, 12);
    hashes.add(hash);
  }

  return hashes;
}

/**
 * Detect duplicate content blocks between files.
 * Returns array of { file1, file2, overlapPercent }.
 */
function detectDuplicates(fileEntries) {
  const duplicates = [];

  for (let i = 0; i < fileEntries.length; i++) {
    for (let j = i + 1; j < fileEntries.length; j++) {
      const a = fileEntries[i];
      const b = fileEntries[j];

      if (!a.fingerprints || !b.fingerprints) continue;
      if (a.fingerprints.size === 0 || b.fingerprints.size === 0) continue;

      let overlap = 0;
      for (const hash of a.fingerprints) {
        if (b.fingerprints.has(hash)) overlap++;
      }

      const smaller = Math.min(a.fingerprints.size, b.fingerprints.size);
      if (smaller === 0) continue;

      const overlapPercent = Math.round((overlap / smaller) * 100);
      if (overlapPercent > 20) {
        duplicates.push({
          file1: a.label,
          file2: b.label,
          overlapPercent
        });
      }
    }
  }

  return duplicates;
}

// ─── Bar renderer ────────────────────────────────────────────────────────────

function renderBar(used, limit, width = 10) {
  const pct = limit > 0 ? Math.min(used / limit, 1) : 0;
  const filled = Math.round(pct * width);
  const empty = width - filled;
  return '█'.repeat(filled) + '░'.repeat(empty);
}

function formatSize(chars) {
  if (chars >= 1000) return `${(chars / 1000).toFixed(1)}k`;
  return `${chars}`;
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Estimate the context budget for a given agent/squad session.
 *
 * @param {string} projectDir  — Project root
 * @param {object} options  — { agent, squad, verbose }
 * @returns {Promise<object>}  — { components[], total, totalLimit, duplicates[], warnings[] }
 */
async function estimateContext(projectDir, options = {}) {
  const { agent = 'dev', squad, verbose } = options;
  const components = [];
  const warnings = [];

  // 1. Agent file
  const agentPath = path.join(projectDir, '.aioson', 'agents', `${agent}.md`);
  const agentFile = await readFileChars(agentPath);
  const agentEntry = {
    label: 'agent file',
    path: agentPath,
    chars: agentFile.chars,
    limit: DEFAULT_LIMITS.agent_file,
    content: agentFile.content
  };
  components.push(agentEntry);
  if (agentFile.chars > DEFAULT_LIMITS.agent_file) {
    warnings.push(`${agent}.md is ${formatSize(agentFile.chars)} — exceeds the agent hard budget`);
  } else if (agentFile.chars > 15000) {
    warnings.push(`${agent}.md is ${formatSize(agentFile.chars)} — over the recommended agent target, but not auto-truncated`);
  }

  // 2. config.md
  const configPath = path.join(projectDir, '.aioson', 'config.md');
  const configFile = await readFileChars(configPath);
  components.push({
    label: 'config.md',
    path: configPath,
    chars: configFile.chars,
    limit: DEFAULT_LIMITS.config,
    content: configFile.content
  });

  // 3. project.context.md
  const ctxPath = path.join(projectDir, '.aioson', 'context', 'project.context.md');
  const ctxFile = await readFileChars(ctxPath);
  components.push({
    label: 'project.context.md',
    path: ctxPath,
    chars: ctxFile.chars,
    limit: DEFAULT_LIMITS.project_context,
    content: ctxFile.content
  });

  // 4. Active rules
  const rulesDir = path.join(projectDir, '.aioson', 'rules');
  let rulesChars = 0;
  let rulesContent = '';
  try {
    const entries = await fs.readdir(rulesDir);
    const mdFiles = entries.filter((f) => f.endsWith('.md'));
    for (const f of mdFiles) {
      const r = await readFileChars(path.join(rulesDir, f));
      rulesChars += r.chars;
      rulesContent += r.content + '\n';
    }
  } catch { /* no rules dir */ }
  components.push({
    label: 'active rules',
    path: rulesDir,
    chars: rulesChars,
    limit: DEFAULT_LIMITS.rules,
    content: rulesContent
  });

  // 5. Squad-specific files (if --squad provided)
  if (squad) {
    const squadDir = path.join(projectDir, SQUADS_DIR, squad);
    const agentsFile = await readFileChars(path.join(squadDir, 'agents', 'agents.md'));
    const squadFile = await readFileChars(path.join(squadDir, 'squad.md'));
    const totalSquad = agentsFile.chars + squadFile.chars;
    components.push({
      label: `squad: ${squad}`,
      path: squadDir,
      chars: totalSquad,
      limit: DEFAULT_LIMITS.squad_files,
      content: agentsFile.content + '\n' + squadFile.content
    });
  }

  // 6. CLAUDE.md + CLAUDE.local.md
  const claudeMd = await readFileChars(path.join(projectDir, 'CLAUDE.md'));
  const claudeLocal = await readFileChars(path.join(projectDir, 'CLAUDE.local.md'));
  const claudeTotal = claudeMd.chars + claudeLocal.chars;
  components.push({
    label: 'CLAUDE.md',
    path: path.join(projectDir, 'CLAUDE.md'),
    chars: claudeTotal,
    limit: DEFAULT_LIMITS.claude_md,
    content: claudeMd.content + '\n' + claudeLocal.content
  });

  // Calculate totals
  const totalChars = components.reduce((sum, c) => sum + c.chars, 0);
  const totalLimit = components.reduce((sum, c) => sum + c.limit, 0);

  // Duplicate detection (verbose mode)
  let duplicates = [];
  if (verbose) {
    const withFingerprints = components
      .filter((c) => c.content && c.chars > 100)
      .map((c) => ({ ...c, fingerprints: buildFingerprints(c.content) }));
    duplicates = detectDuplicates(withFingerprints);
  }

  // Budget warning
  const remaining = totalLimit - totalChars;
  if (remaining < 2000) {
    warnings.push(`Budget leaves only ~${formatSize(remaining)} for working context`);
  }

  // Exit code semantics
  let exitCode = 0;
  if (warnings.some((w) => w.includes('hard budget'))) exitCode = 1;
  if (totalChars > totalLimit) exitCode = 2;

  // Clean content from response (only needed internally)
  const cleanComponents = components.map(({ content, ...rest }) => rest);

  return {
    agent,
    squad: squad || null,
    components: cleanComponents,
    total: totalChars,
    totalLimit,
    remaining,
    duplicates,
    warnings,
    exitCode
  };
}

/**
 * Format the estimation result as a human-readable report.
 */
function formatReport(result) {
  const lines = [];
  lines.push(`Context budget estimate for @${result.agent} session`);
  lines.push('─'.repeat(45));

  for (const c of result.components) {
    const pct = c.limit > 0 ? Math.round((c.chars / c.limit) * 100) : 0;
    const bar = renderBar(c.chars, c.limit);
    const label = c.label.padEnd(20);
    const size = `${formatSize(c.chars)} / ${formatSize(c.limit)}`.padEnd(14);
    lines.push(`${label} ${size} ${bar} ${pct}%`);
  }

  lines.push('─'.repeat(45));
  const totalPct = result.totalLimit > 0 ? Math.round((result.total / result.totalLimit) * 100) : 0;
  const totalBar = renderBar(result.total, result.totalLimit);
  lines.push(`${'Total system prompt'.padEnd(20)} ~${formatSize(result.total)} / ${formatSize(result.totalLimit)}`.padEnd(35) + ` ${totalBar} ${totalPct}%`);
  lines.push('');

  for (const w of result.warnings) {
    lines.push(`⚠  ${w}`);
  }

  if (result.remaining > 0 && !result.warnings.some((w) => w.includes('only'))) {
    lines.push(`✓  Budget leaves ~${formatSize(result.remaining)} for working context`);
  }

  if (result.duplicates.length > 0) {
    lines.push('');
    lines.push('Duplicate content detected:');
    for (const d of result.duplicates) {
      lines.push(`  ⚠ ${d.file1} ↔ ${d.file2}: ${d.overlapPercent}% overlap`);
    }
  }

  return lines.join('\n');
}

module.exports = {
  estimateContext,
  formatReport
};
