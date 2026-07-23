'use strict';

/**
 * aioson agent:audit — Token and size audit for AIOSON agent files
 *
 * Scans .aioson/agents/*.md (and optionally locale variants) and reports:
 *   - Size in chars and estimated tokens per file
 *   - Size per section (## headings)
 *   - Files and sections over budget thresholds
 *   - Sections that are candidates to move to .aioson/docs/ (on-demand loading)
 *   - Estimated token savings per session if candidates are moved
 *
 * Budget thresholds (from config.md guidelines):
 *   Auto-loaded files (CLAUDE.md, AGENTS.md): 3,500 chars recommended / 4,000 hard
 *   Agent files (read manually):
 *     focused agents  (analyst, qa, tester):   8,000 chars
 *     generalist agents (dev, architect):      15,000 chars
 *     orchestrator agents (orchestrator, squad): 12,000 chars
 *
 * Usage:
 *   aioson agent:audit .
 *   aioson agent:audit . --verbose          Show per-section breakdown
 *   aioson agent:audit . --locales          Include locale variant files
 *   aioson agent:audit . --runtime-only     Scan project/runtime surfaces only
 *   aioson agent:audit . --template-only    Scan template surfaces only
 *   aioson agent:audit . --inception        Scan project and template surfaces
 *   aioson agent:audit . --fix              Write savings report to .aioson/docs/agent-audit.md
 *   aioson agent:audit . --json
 */

const fs = require('node:fs/promises');
const path = require('node:path');

// ─── Thresholds ───────────────────────────────────────────────────────────────

const CHARS_PER_TOKEN = 4;

// Agent type classification by slug keywords
const AGENT_TYPES = [
  { type: 'auto-loaded',   slugs: ['CLAUDE', 'AGENTS'],                    target: 3500, hard: 4000 },
  { type: 'orchestrator',  slugs: ['orchestrator', 'squad'],                target: 12000, hard: 20000 },
  { type: 'generalist',    slugs: ['dev', 'architect', 'deyvin', 'sheldon', 'planner', 'setup', 'product', 'ux-ui', 'site-forge'], target: 15000, hard: 40000 },
  { type: 'focused',       slugs: [],                                       target: 8000,  hard: 16000 } // default
];

// Sections considered "on-demand candidates" — rarely needed at session start
const ON_DEMAND_KEYWORDS = [
  'conventions', 'folder structure', 'stack', 'laravel', 'next.js', 'node',
  'web3', 'dapp', 'brownfield', 'debugging', 'git worktree', 'worktree',
  'motion', 'animation', 'output contract', 'output targets', 'format',
  'devlog', 'observabilidade', 'observability', 'exemplos', 'examples',
  'reference', 'template', 'esquema'
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function estimateTokens(chars) {
  return Math.ceil(chars / CHARS_PER_TOKEN);
}

function formatKb(chars) {
  return `${(chars / 1024).toFixed(1)}KB`;
}

function formatTokens(chars) {
  return `~${estimateTokens(chars).toLocaleString()} tok`;
}

function classifyAgent(slug) {
  for (const def of AGENT_TYPES) {
    if (def.slugs.some((s) => slug.toLowerCase().includes(s.toLowerCase()))) {
      return def;
    }
  }
  return AGENT_TYPES[AGENT_TYPES.length - 1]; // focused (default)
}

function isOnDemandCandidate(sectionTitle) {
  const lower = sectionTitle.toLowerCase();
  return ON_DEMAND_KEYWORDS.some((kw) => lower.includes(kw));
}

// ─── Section parser ───────────────────────────────────────────────────────────

function parseSections(content) {
  const sections = [];
  const lines = content.split(/\r?\n/);
  const headingRe = /^(#{1,4})\s+(.+)/;

  let currentSection = null;
  let currentLines = [];

  function flush() {
    if (currentSection !== null) {
      const body = currentLines.join('\n');
      sections.push({
        title: currentSection.title,
        level: currentSection.level,
        chars: body.length,
        tokens: estimateTokens(body.length),
        onDemandCandidate: isOnDemandCandidate(currentSection.title)
      });
    }
  }

  for (const line of lines) {
    const match = line.match(headingRe);
    if (match) {
      flush();
      currentSection = { level: match[1].length, title: match[2].trim() };
      currentLines = [line];
    } else {
      currentLines.push(line);
    }
  }
  flush();

  return sections;
}

// ─── File scanner ─────────────────────────────────────────────────────────────

async function scanAgentFile(filePath, relativePath, category = 'workspace_agent') {
  let content;
  try {
    content = await fs.readFile(filePath, 'utf8');
  } catch {
    return null;
  }

  const slug = path.basename(filePath, '.md');
  const typeDef = classifyAgent(slug);
  const chars = content.length;
  const sections = parseSections(content);

  const onDemandSections = sections.filter((s) => s.onDemandCandidate);
  const onDemandChars = onDemandSections.reduce((sum, s) => sum + s.chars, 0);

  const status =
    chars > typeDef.hard
      ? 'over_hard'
      : chars > typeDef.target
        ? 'over_target'
        : 'ok';

  return {
    file: relativePath,
    slug,
    category,
    agent_type: typeDef.type,
    chars,
    tokens: estimateTokens(chars),
    target_chars: typeDef.target,
    hard_chars: typeDef.hard,
    status,
    sections,
    on_demand_candidates: onDemandSections,
    savings_if_moved: onDemandChars,
    savings_tokens: estimateTokens(onDemandChars)
  };
}

async function scanDir(dirPath, projectDir, results, category = 'workspace_agent') {
  let entries;
  try {
    entries = await fs.readdir(dirPath, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith('.md')) continue;
    const filePath = path.join(dirPath, entry.name);
    const rel = path.relative(projectDir, filePath).split(path.sep).join('/');
    const result = await scanAgentFile(filePath, rel, category);
    if (result) results.push(result);
  }
}

function normalizeRel(projectDir, filePath) {
  return path.relative(projectDir, filePath).split(path.sep).join('/');
}

function getAuditMode(options) {
  const selected = [
    options['runtime-only'] ? 'runtime' : null,
    options['template-only'] ? 'template' : null,
    options.inception ? 'inception' : null
  ].filter(Boolean);

  if (selected.length > 1) {
    return { error: 'conflicting_modes', selected };
  }

  return { mode: selected[0] || 'inception' };
}

function buildAgentRoots(targetDir, mode) {
  const roots = [];

  if (mode === 'runtime' || mode === 'inception') {
    roots.push({
      type: 'dir',
      path: path.join(targetDir, '.aioson', 'agents'),
      rel: '.aioson/agents',
      category: 'workspace_agent'
    });
    for (const name of ['CLAUDE.md', 'AGENTS.md']) {
      roots.push({
        type: 'file',
        path: path.join(targetDir, name),
        rel: name,
        category: 'auto_loaded'
      });
    }
  }

  if (mode === 'template' || mode === 'inception') {
    roots.push({
      type: 'dir',
      path: path.join(targetDir, 'template', '.aioson', 'agents'),
      rel: 'template/.aioson/agents',
      category: 'template_agent'
    });
    for (const name of ['CLAUDE.md', 'AGENTS.md']) {
      roots.push({
        type: 'file',
        path: path.join(targetDir, 'template', name),
        rel: `template/${name}`,
        category: 'auto_loaded'
      });
    }
  }

  return roots;
}

// ─── Report writer ────────────────────────────────────────────────────────────

function buildMarkdownReport(files, projectDir) {
  const overHard = files.filter((f) => f.status === 'over_hard');
  const overTarget = files.filter((f) => f.status === 'over_target');
  const totalTokens = files.reduce((s, f) => s + f.tokens, 0);
  const totalSavings = files.reduce((s, f) => s + f.savings_tokens, 0);

  const lines = [
    '# Agent Audit Report',
    `Generated: ${new Date().toISOString()}`,
    '',
    '## Summary',
    `Total agent files scanned : ${files.length}`,
    `Inventory estimated tokens: ~${totalTokens.toLocaleString()}`,
    `Over hard limit           : ${overHard.length}`,
    `Over target               : ${overTarget.length}`,
    `Potential savings across inventory (on-demand split): ~${totalSavings.toLocaleString()} tokens`,
    ''
  ];

  if (overHard.length > 0) {
    lines.push('## Over hard limit (split recommended)');
    for (const f of overHard) {
      lines.push(`- **${f.file}** — ${formatKb(f.chars)} (${formatTokens(f.chars)}) — type: ${f.agent_type}, hard: ${formatKb(f.hard_chars)}`);
    }
    lines.push('');
  }

  if (overTarget.length > 0) {
    lines.push('## Over target (consider splitting)');
    for (const f of overTarget) {
      lines.push(`- ${f.file} — ${formatKb(f.chars)} (${formatTokens(f.chars)}) — target: ${formatKb(f.target_chars)}`);
    }
    lines.push('');
  }

  lines.push('## On-demand candidates (sections to move to .aioson/docs/)');
  lines.push('These sections are loaded every session but are rarely needed at start.');
  lines.push('Moving them to `.aioson/docs/` files saves tokens without losing capability.');
  lines.push('');

  for (const f of files) {
    if (f.on_demand_candidates.length === 0) continue;
    lines.push(`### ${f.file}`);
    lines.push(`Current size: ${formatKb(f.chars)} — savings if moved: ~${f.savings_tokens.toLocaleString()} tokens`);
    for (const s of f.on_demand_candidates) {
      lines.push(`- \`## ${s.title}\` (${formatKb(s.chars)})`);
    }
    lines.push('');
  }

  lines.push('## All files');
  lines.push('| File | Type | Size | Tokens | Target | Status |');
  lines.push('|------|------|------|--------|--------|--------|');
  for (const f of [...files].sort((a, b) => b.chars - a.chars)) {
    const statusLabel = { ok: '✓', over_target: '⚠', over_hard: '✗' }[f.status];
    lines.push(`| ${f.file} | ${f.agent_type} | ${formatKb(f.chars)} | ${formatTokens(f.chars)} | ${formatKb(f.target_chars)} | ${statusLabel} |`);
  }

  return lines.join('\n');
}

function summarizeFiles(files) {
  const overHard = files.filter((file) => file.status === 'over_hard');
  const overTarget = files.filter((file) => file.status === 'over_target');
  const withinTarget = files.filter((file) => file.status === 'ok');
  const totalTokens = files.reduce((sum, file) => sum + file.tokens, 0);
  const potentialSavingsTokens = files.reduce((sum, file) => sum + file.savings_tokens, 0);

  return {
    files: files.length,
    over_hard: overHard.length,
    over_target: overTarget.length,
    within_target: withinTarget.length,
    total_tokens: totalTokens,
    potential_savings_tokens: potentialSavingsTokens
  };
}

function summarizeActivationRisk(files) {
  const agentFiles = files.filter((file) => file.category !== 'auto_loaded');
  const entrypoints = files.filter((file) => file.category === 'auto_loaded');
  const largestAgent = [...agentFiles].sort((a, b) => b.tokens - a.tokens)[0] || null;
  const largestEntrypoint = [...entrypoints].sort((a, b) => b.tokens - a.tokens)[0] || null;

  return {
    largest_agent_file: largestAgent ? largestAgent.file : null,
    largest_agent_tokens: largestAgent ? largestAgent.tokens : 0,
    largest_entrypoint_file: largestEntrypoint ? largestEntrypoint.file : null,
    largest_entrypoint_tokens: largestEntrypoint ? largestEntrypoint.tokens : 0,
    worst_case_activation_tokens:
      (largestAgent ? largestAgent.tokens : 0) +
      (largestEntrypoint ? largestEntrypoint.tokens : 0)
  };
}

// ─── Main command ─────────────────────────────────────────────────────────────

async function runAgentAudit({ args, options = {}, logger }) {
  const targetDir = path.resolve(process.cwd(), args[0] || '.');
  const verbose = Boolean(options.verbose || options.v);
  const includeLocales = Boolean(options.locales);
  const writeFix = Boolean(options.fix);
  const modeResult = getAuditMode(options);

  if (modeResult.error) {
    if (!options.json) logger.error('Choose only one audit mode: --runtime-only, --template-only, or --inception.');
    return { ok: false, reason: modeResult.error, selected: modeResult.selected };
  }

  const mode = modeResult.mode;
  const scanRoots = buildAgentRoots(targetDir, mode);

  const files = [];

  for (const root of scanRoots) {
    if (root.type === 'dir') {
      if (await dirExists(root.path)) await scanDir(root.path, targetDir, files, root.category);
      continue;
    }

    const r = await scanAgentFile(root.path, normalizeRel(targetDir, root.path), root.category);
    if (r) files.push(r);
  }

  // Optionally include locales
  if (includeLocales && (mode === 'runtime' || mode === 'inception')) {
    await scanLocaleAgents(path.join(targetDir, '.aioson', 'locales'), targetDir, files, 'workspace_agent');
  }
  if (includeLocales && (mode === 'template' || mode === 'inception')) {
    await scanLocaleAgents(path.join(targetDir, 'template', '.aioson', 'locales'), targetDir, files, 'template_agent');
  }

  const roots = scanRoots.map((r) => r.rel);

  if (files.length === 0) {
    if (!options.json) logger.log('No agent files found. Run from the aioson project root or a project with .aioson/agents/.');
    return { ok: false, reason: 'no_files', mode, roots };
  }

  // Sort by size descending
  files.sort((a, b) => b.chars - a.chars);

  const summary = summarizeFiles(files);
  const activation_risk = summarizeActivationRisk(files);
  const withinBudget = summary.over_hard === 0;

  if (options.json) {
    return {
      ok: true,
      within_budget: withinBudget,
      mode,
      roots,
      summary,
      activation_risk,
      files
    };
  }

  // ── Console report ─────────────────────────────────────────────────────────
  const overHard = files.filter((f) => f.status === 'over_hard');
  const overTarget = files.filter((f) => f.status === 'over_target');

  logger.log('Agent Audit');
  logger.log('─'.repeat(70));
  logger.log(`Mode           : ${mode}`);
  logger.log(`Roots          : ${roots.join(', ')}`);
  logger.log(`Files scanned  : ${summary.files}`);
  logger.log(`Inventory tokens: ~${summary.total_tokens.toLocaleString()} across scanned files`);
  logger.log(`Largest agent   : ${activation_risk.largest_agent_file || 'n/a'} (~${activation_risk.largest_agent_tokens.toLocaleString()} tok)`);
  logger.log(`Activation upper: ~${activation_risk.worst_case_activation_tokens.toLocaleString()} tok (largest agent + largest entrypoint)`);
  logger.log(`Over hard limit: ${summary.over_hard}   Over target: ${summary.over_target}`);
  logger.log(`Budget status  : ${withinBudget ? 'within hard limits' : 'attention required'}`);
  logger.log(`Potential save : ~${summary.potential_savings_tokens.toLocaleString()} tokens across inventory (on-demand split)`);
  logger.log('');

  // File table
  const COL = { file: 45, type: 14, size: 9, tokens: 12, status: 8 };
  logger.log(
    'File'.padEnd(COL.file) +
    'Type'.padEnd(COL.type) +
    'Size'.padEnd(COL.size) +
    'Tokens'.padEnd(COL.tokens) +
    'Status'
  );
  logger.log('─'.repeat(70));

  for (const f of files) {
    const statusLabel = { ok: '✓ ok', over_target: '⚠ target', over_hard: '✗ hard' }[f.status];
    logger.log(
      f.file.slice(0, COL.file - 1).padEnd(COL.file) +
      f.agent_type.padEnd(COL.type) +
      formatKb(f.chars).padEnd(COL.size) +
      formatTokens(f.chars).padEnd(COL.tokens) +
      statusLabel
    );

    if (verbose && f.sections.length > 0) {
      const topSections = [...f.sections].sort((a, b) => b.chars - a.chars).slice(0, 5);
      for (const s of topSections) {
        const flag = s.onDemandCandidate ? ' [on-demand candidate]' : '';
        logger.log(`  ${'§ ' + s.title.slice(0, 40)}  ${formatKb(s.chars)}${flag}`);
      }
    }
  }

  logger.log('');

  // On-demand candidates summary
  const withCandidates = files.filter((f) => f.on_demand_candidates.length > 0);
  if (withCandidates.length > 0) {
    logger.log('On-demand candidates (move to .aioson/docs/ to save tokens):');
    for (const f of withCandidates) {
      logger.log(`  ${f.file.slice(0, 42)}  save ~${f.savings_tokens.toLocaleString()} tok  (${f.on_demand_candidates.length} section${f.on_demand_candidates.length > 1 ? 's' : ''})`);
      if (verbose) {
        for (const s of f.on_demand_candidates) {
          logger.log(`    § ${s.title.slice(0, 50)}  ${formatKb(s.chars)}`);
        }
      }
    }
    logger.log('');
  }

  if (overHard.length > 0) {
    logger.log('✗ Files over the configured hard budget:');
    for (const f of overHard) {
      logger.log(`  ${f.file} — ${formatKb(f.chars)} (target: ${formatKb(f.target_chars)}, hard: ${formatKb(f.hard_chars)})`);
    }
    logger.log('  Auto-loaded entrypoints may be truncated by their harness; manually loaded agent prompts are reported here as context-cost risks.');
    logger.log('');
  }

  // Write fix report
  if (writeFix) {
    const reportPath = path.join(targetDir, '.aioson', 'docs', 'agent-audit.md');
    const reportDir = path.dirname(reportPath);
    await fs.mkdir(reportDir, { recursive: true });
    await fs.writeFile(reportPath, buildMarkdownReport(files, targetDir), 'utf8');
    logger.log(`✓ Full report saved: .aioson/docs/agent-audit.md`);
    logger.log('  Review the "On-demand candidates" section to decide which sections to move.');
  } else {
    logger.log('Tip: Run with --fix to save a full markdown report with split recommendations.');
    logger.log('     Run with --verbose to see per-section breakdown.');
  }

  return {
    ok: true,
    within_budget: withinBudget,
    mode,
    roots,
    activation_risk,
    ...summary
  };
}

async function scanLocaleAgents(localesBase, targetDir, files, category) {
  try {
    const langs = await fs.readdir(localesBase, { withFileTypes: true });
    for (const lang of langs) {
      if (!lang.isDirectory()) continue;
      await scanDir(path.join(localesBase, lang.name, 'agents'), targetDir, files, category);
    }
  } catch {
    // locales dir optional
  }
}

async function dirExists(dirPath) {
  try {
    const s = await fs.stat(dirPath);
    return s.isDirectory();
  } catch {
    return false;
  }
}

module.exports = { runAgentAudit };
