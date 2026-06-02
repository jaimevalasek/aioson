'use strict';

/**
 * aioson agent:export-skill — Export AIOSON agent as portable Agent Skills Standard
 *
 * Converts an AIOSON agent (.aioson/agents/<name>.md) into the Agent Skills Standard
 * format (SKILL.md + resources), making it usable in Cursor, Copilot,
 * Codex, JetBrains, and 32+ other tools.
 *
 * Usage:
 *   aioson agent:export-skill . --agent=dev
 *   aioson agent:export-skill . --agent=dev --output=.claude/skills/aioson-dev/
 *   aioson agent:export-skill . --agent=qa --json
 */

const fs = require('node:fs/promises');
const path = require('node:path');

const AGENTS_DIR = path.join('.aioson', 'agents');

// ─── Frontmatter extraction ─────────────────────────────────────────────────

/**
 * Extract YAML-like frontmatter from a markdown file.
 */
function extractFrontmatter(content) {
  const match = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) return { meta: {}, body: content };

  const meta = {};
  for (const line of match[1].split('\n')) {
    const kv = line.match(/^(\w[\w_-]*):\s*(.+)$/);
    if (kv) meta[kv[1]] = kv[2].trim().replace(/^["']|["']$/g, '');
  }

  return { meta, body: match[2] };
}

/**
 * Extract template sections from agent body (```template blocks or ## Template sections).
 */
function extractTemplates(body) {
  const templates = [];
  const templatePattern = /```template(?:\s+(\S+))?\n([\s\S]*?)```/g;
  let match;

  while ((match = templatePattern.exec(body)) !== null) {
    templates.push({
      name: match[1] || `template-${templates.length + 1}`,
      content: match[2].trim()
    });
  }

  return templates;
}

/**
 * Extract tool references from agent body.
 */
function extractTools(body) {
  const tools = new Set();
  const toolPattern = /\b(Read|Write|Edit|Bash|Glob|Grep|Agent|WebFetch|WebSearch|NotebookEdit)\b/g;
  let match;

  while ((match = toolPattern.exec(body)) !== null) {
    tools.add(match[1]);
  }

  return [...tools];
}

/**
 * Infer activation patterns from agent content.
 */
function inferActivation(agentName, body) {
  const activation = [];

  // Always activate for .aioson files
  activation.push({ path: '.aioson/**' });

  // Keyword-based activation from agent name/role
  const keywords = {
    dev: ['implement', 'code', 'build', 'feature'],
    qa: ['test', 'quality', 'verify', 'bug'],
    architect: ['architecture', 'structure', 'design'],
    analyst: ['analyze', 'discover', 'map'],
    'ux-ui': ['design', 'interface', 'component'],
    product: ['product', 'prd', 'requirement'],
    pm: ['sprint', 'backlog', 'story']
  };

  const agentKeywords = keywords[agentName] || [agentName];
  for (const kw of agentKeywords) {
    activation.push({ keyword: kw });
  }

  return activation;
}

// ─── SKILL.md generator ──────────────────────────────────────────────────────

/**
 * Generate Agent Skills Standard SKILL.md from AIOSON agent.
 */
function generateSkillMd(agentName, agentContent, options = {}) {
  const { meta, body } = extractFrontmatter(agentContent);
  const tools = extractTools(body);
  const activation = inferActivation(agentName, body);

  // Build skills-standard frontmatter
  const frontmatter = {
    name: meta.name || `AIOSON ${capitalize(agentName)} Agent`,
    description: meta.description || `${capitalize(agentName)} agent from AIOSON framework`,
    version: options.version || '1.0.0',
    tools: tools.length > 0 ? tools : ['Read', 'Write', 'Edit', 'Bash', 'Glob', 'Grep'],
    context: 'fork',
    activation
  };

  const fmLines = [
    '---',
    `name: ${frontmatter.name}`,
    `description: ${frontmatter.description}`,
    `version: ${frontmatter.version}`,
    `tools: [${frontmatter.tools.join(', ')}]`,
    `context: ${frontmatter.context}`,
    'activation:',
    ...frontmatter.activation.map((a) => {
      if (a.path) return `  - path: "${a.path}"`;
      if (a.keyword) return `  - keyword: "${a.keyword}"`;
      return '';
    }).filter(Boolean),
    '---',
    ''
  ];

  // Clean body: remove AIOSON-specific sections that don't apply portably
  let cleanBody = body;
  // Remove runtime boundary sections
  cleanBody = cleanBody.replace(/## AIOSON Runtime boundary[\s\S]*?(?=\n## |$)/g, '');
  // Remove observability sections
  cleanBody = cleanBody.replace(/## Observability[\s\S]*?(?=\n## |$)/g, '');

  return fmLines.join('\n') + cleanBody.trim() + '\n';
}

function capitalize(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Export an AIOSON agent as an Agent Skills Standard skill.
 *
 * @param {object} params  — { args, options, logger }
 */
async function runAgentExportSkill({ args, options = {}, logger }) {
  const targetDir = path.resolve(process.cwd(), args[0] || '.');
  const agentName = String(options.agent || options.a || '').trim();
  const outputDir = options.output
    ? path.resolve(targetDir, options.output)
    : path.join(targetDir, '.claude', 'skills', `aioson-${agentName}`);

  if (!agentName) {
    logger.error('Error: --agent is required');
    return { ok: false, error: 'missing_agent' };
  }

  // Read agent file
  const agentPath = path.join(targetDir, AGENTS_DIR, `${agentName}.md`);
  let agentContent;
  try {
    agentContent = await fs.readFile(agentPath, 'utf8');
  } catch {
    logger.error(`Agent not found: ${agentPath}`);
    return { ok: false, error: 'agent_not_found' };
  }

  // Generate SKILL.md
  const skillContent = generateSkillMd(agentName, agentContent, {
    version: options.version || '1.0.0'
  });

  // Extract templates
  const templates = extractTemplates(agentContent);

  // Write output
  await fs.mkdir(outputDir, { recursive: true });
  await fs.writeFile(path.join(outputDir, 'SKILL.md'), skillContent, 'utf8');

  const written = ['SKILL.md'];

  // Write templates
  if (templates.length > 0) {
    const templatesDir = path.join(outputDir, 'templates');
    await fs.mkdir(templatesDir, { recursive: true });
    for (const t of templates) {
      const ext = t.content.includes('{') ? '.json' : '.md';
      await fs.writeFile(path.join(templatesDir, `${t.name}${ext}`), t.content, 'utf8');
      written.push(`templates/${t.name}${ext}`);
    }
  }

  // Write scripts directory (empty, for custom scripts)
  const scriptsDir = path.join(outputDir, 'scripts');
  await fs.mkdir(scriptsDir, { recursive: true });

  if (options.json) {
    return {
      ok: true,
      agent: agentName,
      outputDir: path.relative(targetDir, outputDir),
      files: written
    };
  }

  logger.log(`Exported @${agentName} as Agent Skills Standard:`);
  logger.log(`  Output: ${path.relative(targetDir, outputDir)}/`);
  for (const f of written) {
    logger.log(`  ✓ ${f}`);
  }
  logger.log('');
  logger.log('This skill is now portable to Cursor, Copilot, and 32+ tools.');

  return { ok: true, agent: agentName, outputDir: path.relative(targetDir, outputDir), files: written };
}

module.exports = { runAgentExportSkill, generateSkillMd };
