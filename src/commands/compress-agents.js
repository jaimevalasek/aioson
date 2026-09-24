'use strict';

/**
 * aioson compress:agents — Compress agent instruction files to reduce token usage
 *
 * Usage:
 *   aioson compress:agents .                        # compress all agents (structural)
 *   aioson compress:agents . --agent=dev            # compress specific agent
 *   aioson compress:agents . --agent=dev,analyst    # compress multiple agents
 *   aioson compress:agents . --rules                # also compress .aioson/rules/
 *   aioson compress:agents . --dry-run              # preview savings without writing
 *   aioson compress:agents . --llm                  # LLM-assisted (needs ANTHROPIC_API_KEY)
 *   aioson compress:agents . --llm --model=haiku    # choose model: haiku | sonnet | opus
 *   aioson compress:agents . --restore              # restore from .original.md backups
 *   aioson compress:agents . --stats                # show stats only (no changes)
 */

const fs = require('node:fs/promises');
const path = require('node:path');
const { resolveTargetDir } = require('../lib/project-root');

// ---------------------------------------------------------------------------
// Structural compression — no LLM required
// ---------------------------------------------------------------------------

// Section headers that are purely explanatory with no actionable content.
// Their rules are already implied by the surrounding content.
const REMOVABLE_SECTION_HEADERS = [
  'por que isso importa',
  'why this matters',
  'why this is important',
  'por que isso é importante',
  'por que isso é relevante',
];

// Filler phrase prefixes to strip from the start of prose lines
const FILLER_PREFIXES = [
  /^É importante (notar|ressaltar|observar|destacar) que\s*/i,
  /^Vale (ressaltar|notar|destacar|observar) que\s*/i,
  /^Deve-se (observar|notar|ressaltar) que\s*/i,
  /^Cabe (notar|ressaltar|observar) que\s*/i,
  /^It is important to (note|remember|understand) that\s*/i,
  /^Note that\s*/i,
  /^Please note that\s*/i,
  /^Keep in mind that\s*/i,
  /^As mentioned (earlier|above|before|previously)?,?\s*/i,
  /^Observe que\s*/i,
  /^Ressaltamos que\s*/i,
  /^Destacamos que\s*/i,
];

// Trailing qualifiers that add no information — strip to end of sentence
const FILLER_TRAILERS = [
  / — o que (garante|assegura|permite|significa|implica)[^.]*\./g,
  / — isso (é|se torna|se tornou) (fundamental|importante|necessário|crítico) porque[^.]*\./g,
  /, o que (é|se torna) (esperado|natural|correto)\./g,
  / como mencionado anteriormente/g,
  / como dito anteriormente/g,
  / as (previously|already) mentioned/g,
];

/**
 * Split markdown into an array of sections.
 * Each section: { header: string|null, level: number|null, body: string }
 * Respects fenced code blocks — headings inside code blocks are not treated as section boundaries.
 */
function splitSections(text) {
  const sections = [];
  const lines = text.split('\n');
  let currentHeader = null;
  let currentLevel = null;
  let currentBody = [];
  let inCodeBlock = false;
  let frontmatterDone = false;
  let frontmatterLines = [];
  let inFrontmatter = false;

  // Handle YAML frontmatter at the very top
  if (lines[0] === '---') {
    inFrontmatter = true;
    frontmatterLines.push(lines[0]);
    for (let i = 1; i < lines.length; i++) {
      frontmatterLines.push(lines[i]);
      if (lines[i] === '---') {
        frontmatterDone = true;
        // Emit as a special section with no header
        sections.push({ header: null, level: null, body: frontmatterLines.join('\n') + '\n' });
        frontmatterLines = [];
        inFrontmatter = false;
        // Process remaining lines normally
        const remaining = lines.slice(i + 1);
        return [...sections, ...splitSections(remaining.join('\n'))];
      }
    }
    if (inFrontmatter) {
      // Malformed frontmatter — treat as body
      return [{ header: null, level: null, body: text }];
    }
  }

  for (const line of lines) {
    if (line.startsWith('```')) {
      inCodeBlock = !inCodeBlock;
      currentBody.push(line);
      continue;
    }

    if (!inCodeBlock) {
      const headingMatch = line.match(/^(#{1,3}) (.+)$/);
      if (headingMatch) {
        sections.push({ header: currentHeader, level: currentLevel, body: currentBody.join('\n') });
        currentHeader = line;
        currentLevel = headingMatch[1].length;
        currentBody = [];
        continue;
      }
    }

    currentBody.push(line);
  }

  sections.push({ header: currentHeader, level: currentLevel, body: currentBody.join('\n') });
  return sections;
}

function shouldRemoveSection(header) {
  if (!header) return false;
  const normalized = header.replace(/^#+\s*/, '').toLowerCase().trim();
  return REMOVABLE_SECTION_HEADERS.some(h => normalized === h);
}

function compressBody(body) {
  let inCodeBlock = false;
  const lines = body.split('\n').map(line => {
    if (line.startsWith('```')) {
      inCodeBlock = !inCodeBlock;
      return line;
    }
    if (inCodeBlock) return line;

    // Skip: headers, table rows, list items, blockquotes, empty lines
    if (
      line.startsWith('#') || line.startsWith('|') || line.startsWith('>') ||
      line.startsWith('- ') || line.startsWith('* ') || line.startsWith('  - ') ||
      line.startsWith('  * ') || line.trim() === ''
    ) return line;

    let out = line;

    for (const pattern of FILLER_PREFIXES) {
      const replaced = out.replace(pattern, '');
      if (replaced !== out) {
        out = replaced.charAt(0).toUpperCase() + replaced.slice(1);
        break;
      }
    }

    for (const pattern of FILLER_TRAILERS) {
      out = out.replace(pattern, (m) => '.');
    }

    return out;
  });

  return lines.join('\n');
}

function compressStructural(text) {
  const sections = splitSections(text);
  const kept = sections.filter(s => !shouldRemoveSection(s.header));

  const parts = kept.map(({ header, body }) => {
    const h = header ? header + '\n' : '';
    return h + compressBody(body);
  });

  return parts.join('').replace(/\n{3,}/g, '\n\n').trimEnd() + '\n';
}

// ---------------------------------------------------------------------------
// LLM compression — calls Anthropic Messages API via fetch
// ---------------------------------------------------------------------------

const { MODEL_MAP } = require('../runner/cascade');

const LLM_SYSTEM = `You are a markdown compression expert specializing in AI agent instruction files.

Compress the file the user sends. Goal: smallest possible file that preserves 100% of the technical meaning.

ALWAYS PRESERVE — never touch these:
- YAML frontmatter (--- blocks)
- All fenced code blocks (\`\`\` ... \`\`\`)
- All markdown tables (| ... |)
- File paths, URLs, bash commands, CLI flags
- Every rule, constraint, and actionable instruction
- Section headers that introduce actionable content

REMOVE OR COMPRESS:
- Sections titled "Por que isso importa" / "Why this matters" / "Rationale" — only if the rule already makes the reason obvious
- Preamble paragraphs that just restate what the section header says
- Filler phrase openers: "É importante notar que", "Vale ressaltar que", "It is important to note that", "Note that", "Keep in mind that", etc.
- Multi-paragraph explanations reducible to 1 dense sentence
- Trailing qualifiers that add no information

OUTPUT: Only the compressed markdown. No preamble, no commentary, no explanation.`;

async function compressWithLLM(text, apiKey, model) {
  const resp = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model,
      max_tokens: 32000,
      system: LLM_SYSTEM,
      messages: [{ role: 'user', content: text }],
    }),
  });

  if (!resp.ok) {
    const body = await resp.text().catch(() => '');
    throw new Error(`API ${resp.status}: ${body.slice(0, 200)}`);
  }

  const data = await resp.json();
  // Current models think by default: read text blocks by type, never content[0].
  if (data.stop_reason === 'refusal') throw new Error('model declined the request (refusal)');
  if (data.stop_reason === 'max_tokens') throw new Error('output truncated at max_tokens');
  const out = (data.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('');
  if (!out.trim()) throw new Error('empty model output');
  return out;
}

// ---------------------------------------------------------------------------
// Restore from backups
// ---------------------------------------------------------------------------

async function runRestore(dir, agentFilter, logger) {
  const files = (await fs.readdir(dir)).filter(f => f.endsWith('.original.md'));
  const targets = agentFilter
    ? files.filter(f => agentFilter.some(a => f === `${a}.original.md`))
    : files;

  if (targets.length === 0) {
    logger.log('No .original.md backup files found.');
    return { ok: true, restored: 0 };
  }

  for (const file of targets) {
    const src = path.join(dir, file);
    const dest = path.join(dir, file.replace('.original.md', '.md'));
    await fs.copyFile(src, dest);
    await fs.unlink(src);
    logger.log(`  Restored: ${file.replace('.original.md', '.md')}`);
  }

  logger.log(`\nRestored ${targets.length} file(s). Backup files removed.`);
  return { ok: true, restored: targets.length };
}

// ---------------------------------------------------------------------------
// Compress a single directory of .md files
// ---------------------------------------------------------------------------

async function compressDir(dir, { agentFilter, dryRun, useLLM, apiKey, model, logger }) {
  let files;
  try {
    files = (await fs.readdir(dir)).filter(f => f.endsWith('.md') && !f.endsWith('.original.md'));
  } catch {
    return [];
  }

  const targets = agentFilter
    ? files.filter(f => agentFilter.some(a => f === `${a}.md`))
    : files;

  const results = [];

  for (const file of targets) {
    const filePath = path.join(dir, file);
    const backupPath = path.join(dir, file.replace('.md', '.original.md'));

    const original = await fs.readFile(filePath, 'utf8');
    const originalSize = Buffer.byteLength(original, 'utf8');

    let compressed;
    try {
      compressed = useLLM
        ? await compressWithLLM(original, apiKey, model)
        : compressStructural(original);
    } catch (err) {
      logger.error(`  ✗ ${file}: ${err.message}`);
      results.push({ file, ok: false, error: err.message });
      continue;
    }

    const compressedSize = Buffer.byteLength(compressed, 'utf8');
    const saved = originalSize - compressedSize;
    const pct = Math.round((saved / originalSize) * 100);

    if (pct < 2) {
      logger.log(`  · ${file}: ${(originalSize / 1024).toFixed(1)}KB — already compact, skipped`);
      results.push({ file, ok: true, skipped: true, originalSize });
      continue;
    }

    if (dryRun) {
      logger.log(`  ~ ${file}: ${(originalSize / 1024).toFixed(1)}KB → ${(compressedSize / 1024).toFixed(1)}KB  (−${pct}%)`);
    } else {
      // Write backup only if none exists
      let backedUp = false;
      try {
        await fs.access(backupPath);
      } catch {
        await fs.writeFile(backupPath, original, 'utf8');
        backedUp = true;
      }

      await fs.writeFile(filePath, compressed, 'utf8');
      const tag = backedUp ? ' ← backup saved' : '';
      logger.log(`  ✓ ${file}: ${(originalSize / 1024).toFixed(1)}KB → ${(compressedSize / 1024).toFixed(1)}KB  (−${pct}%)${tag}`);
    }

    results.push({ file, ok: true, skipped: false, originalSize, compressedSize, saved, pct });
  }

  return results;
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

async function runCompressAgents({ args, options = {}, logger }) {
  const targetDir = resolveTargetDir(args);
  const agentsDir = path.join(targetDir, '.aioson', 'agents');
  const rulesDir  = path.join(targetDir, '.aioson', 'rules');

  const dryRun      = Boolean(options['dry-run'] || options.dry);
  const useLLM      = Boolean(options.llm);
  const doRestore   = Boolean(options.restore);
  const alsoRules   = Boolean(options.rules);
  const statsOnly   = Boolean(options.stats);
  const agentFilter = options.agent
    ? String(options.agent).split(',').map(a => a.trim()).filter(Boolean)
    : null;

  // Resolve model alias → full model ID
  const modelAlias = String(options.model || 'haiku').toLowerCase();
  const model = MODEL_MAP[modelAlias] || modelAlias;

  // --- RESTORE MODE ---
  if (doRestore) {
    try { await fs.access(agentsDir); } catch {
      logger.error(`No .aioson/agents/ directory found in ${targetDir}`);
      return { ok: false, error: 'no_agents_dir' };
    }
    return runRestore(agentsDir, agentFilter, logger);
  }

  // --- VALIDATE ---
  try {
    await fs.access(agentsDir);
  } catch {
    logger.error(`No .aioson/agents/ directory found in ${targetDir}`);
    return { ok: false, error: 'no_agents_dir' };
  }

  let apiKey = null;
  if (useLLM) {
    apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      logger.error('--llm requires ANTHROPIC_API_KEY to be set');
      return { ok: false, error: 'missing_api_key' };
    }
  }

  // --- COMPRESS ---
  const mode = useLLM ? `LLM (${model})` : 'structural';
  const action = dryRun ? 'Preview' : 'Compress';
  logger.log(`${action} — mode: ${mode}`);
  logger.log('');

  const sharedOpts = { agentFilter, dryRun: dryRun || statsOnly, useLLM, apiKey, model, logger };

  logger.log('Agents:');
  const agentResults = await compressDir(agentsDir, sharedOpts);

  let ruleResults = [];
  if (alsoRules) {
    logger.log('\nRules:');
    ruleResults = await compressDir(rulesDir, { ...sharedOpts, agentFilter: null });
  }

  const allResults = [...agentResults, ...ruleResults];
  const compressed = allResults.filter(r => r.ok && !r.skipped);
  const totalSaved = compressed.reduce((sum, r) => sum + (r.saved || 0), 0);
  const errors = allResults.filter(r => !r.ok);

  logger.log('');
  logger.log(`─────────────────────────────────────`);
  logger.log(`Files processed : ${allResults.length}`);
  logger.log(`Compressed      : ${compressed.length}`);
  if (errors.length) logger.log(`Errors          : ${errors.length}`);
  logger.log(`Total saved     : ${(totalSaved / 1024).toFixed(1)} KB`);
  if (!dryRun && !statsOnly && compressed.length > 0) {
    logger.log('');
    logger.log('Backups: <agent>.original.md');
    logger.log('Restore: aioson compress:agents . --restore');
  }

  return { ok: true, results: allResults, totalSaved };
}

module.exports = { runCompressAgents };
