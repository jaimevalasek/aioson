'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const { parseFrontmatter } = require('../preflight-engine');
const { parseFrontmatterList: parseFlowList } = require('../lib/frontmatter');
const { listAgentDefinitions, canonicalAgentId } = require('../agents');
const { resolveTargetDir } = require('../lib/project-root');

const SELECTOR_MODES = ['planning', 'executing'];
const LOAD_TIERS = ['always', 'trigger', 'justified', 'archive'];

const ROUTING_FIELDS = [
  'task_types',
  'triggers',
  'aliases',
  'entities',
  'retrieval_intents',
  'paths',
  'globs'
];

function hasValue(raw) {
  if (raw === undefined || raw === null) return false;
  const value = String(raw).trim();
  return value !== '' && value !== '[]';
}

function editDistance(a, b) {
  const row = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i += 1) {
    let previous = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const current = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, previous + (a[i - 1] === b[j - 1] ? 0 : 1));
      previous = current;
    }
  }
  return row[b.length];
}

let knownAgentIds = null;
function agentIds() {
  if (!knownAgentIds) {
    knownAgentIds = new Set(listAgentDefinitions().flatMap((agent) => [
      agent.id,
      ...(agent.aliases || []),
      ...(agent.legacyIds || []),
      ...(agent.retiredIds || [])
    ]));
  }
  return knownAgentIds;
}

// Scope declarations that silently change who receives the document. Custom
// and squad agent ids are legitimate, so an unknown id is reported only when
// it is a near-miss of a framework agent — a typo routes the rule to nobody.
function scopeWarnings(frontmatter) {
  const warnings = [];
  if (Object.prototype.hasOwnProperty.call(frontmatter, 'agents') && String(frontmatter.agents).trim() === '') {
    warnings.push('agents is declared without a value, so the document reaches EVERY agent; list the agents ([dev, planner]) or write agents: [] when every agent is intended.');
  }
  const known = agentIds();
  for (const agent of parseFlowList(frontmatter.agents)) {
    const id = canonicalAgentId(agent);
    if (id === 'all' || known.has(id)) continue;
    const near = [...known].find((candidate) => editDistance(id, candidate) <= 2 && Math.min(id.length, candidate.length) >= 3);
    if (near) warnings.push(`agents: "${agent}" is not an agent id (did you mean "${canonicalAgentId(near)}"?) — no agent receives the document under that name.`);
  }
  for (const mode of parseFlowList(frontmatter.modes)) {
    if (!SELECTOR_MODES.includes(String(mode).trim().toLowerCase())) {
      warnings.push(`modes: "${mode}" is not a selector mode (${SELECTOR_MODES.join(', ')}) — the document is never selected in that mode.`);
    }
  }
  if (hasValue(frontmatter.load_tier) && !LOAD_TIERS.includes(String(frontmatter.load_tier).trim().toLowerCase())) {
    warnings.push(`load_tier: "${frontmatter.load_tier}" is not one of ${LOAD_TIERS.join(', ')} — it routes as trigger.`);
  }
  return warnings;
}

function lintRule(relPath, frontmatter) {
  const warnings = [];
  const isRule = relPath.startsWith('.aioson/rules/');

  if (isRule && !hasValue(frontmatter.name)) warnings.push('missing required field: name');
  if (!hasValue(frontmatter.description)) warnings.push('missing required field: description');
  warnings.push(...scopeWarnings(frontmatter));

  const loadTier = String(frontmatter.load_tier || 'trigger').trim().toLowerCase();
  const routing = ROUTING_FIELDS.filter((field) => hasValue(frontmatter[field]));

  if (loadTier !== 'always' && routing.length === 0) {
    warnings.push(
      'selector-invisible: no task_types, triggers, aliases, entities, retrieval_intents, paths, or globs — metadata-only routing cannot score this rule above the load threshold; semantic fallback may still find it, but rules should declare routing metadata or set load_tier: always.'
    );
  }

  if (hasValue(frontmatter.priority)) {
    const priority = Number(frontmatter.priority);
    if (!Number.isInteger(priority) || priority < 0 || priority > 100) {
      warnings.push('invalid priority: expected an integer from 0 to 100');
    }
  }

  return {
    path: relPath,
    name: String(frontmatter.name || path.basename(relPath, '.md')),
    load_tier: loadTier,
    agents: hasValue(frontmatter.agents) ? String(frontmatter.agents) : 'all',
    routing,
    warnings,
    ok: warnings.length === 0
  };
}

async function collectMarkdownFiles(absDir, relDir, recursive) {
  let entries = [];
  try {
    entries = await fs.readdir(absDir, { withFileTypes: true });
  } catch {
    return [];
  }
  const files = [];
  for (const entry of entries) {
    if (entry.name.toLowerCase() === 'readme.md') continue;
    const absChild = path.join(absDir, entry.name);
    const relChild = `${relDir}/${entry.name}`;
    if (entry.isDirectory()) {
      if (recursive) files.push(...await collectMarkdownFiles(absChild, relChild, recursive));
      continue;
    }
    if (!entry.isFile() || !entry.name.endsWith('.md')) continue;
    files.push({ abs: absChild, rel: relChild });
  }
  return files;
}

async function runRulesLint({ args, options = {}, logger }) {
  const targetDir = resolveTargetDir(args);
  const relDir = '.aioson/rules';

  const files = await collectMarkdownFiles(path.join(targetDir, '.aioson', 'rules'), relDir, true);
  if (options.docs) {
    files.push(...await collectMarkdownFiles(path.join(targetDir, '.aioson', 'docs'), '.aioson/docs', true));
  }

  if (files.length === 0) {
    const result = { ok: true, dir: relDir, rules: [], total: 0, warnings: 0 };
    if (options.json) return result;
    logger.log(`No rule${options.docs ? '/doc' : ''} files found under ${relDir}${options.docs ? ' or .aioson/docs' : ''} — nothing to lint.`);
    return result;
  }

  const rules = [];
  for (const file of files) {
    const content = await fs.readFile(file.abs, 'utf8');
    rules.push(lintRule(file.rel, parseFrontmatter(content)));
  }

  const warningsCount = rules.reduce((sum, rule) => sum + rule.warnings.length, 0);
  const result = {
    ok: !(options.strict && warningsCount > 0),
    dir: relDir,
    rules,
    total: rules.length,
    warnings: warningsCount
  };
  if (options.strict && warningsCount > 0) result.exitCode = 1;
  if (options.json) return result;

  logger.log(`Rules lint for ${relDir} (${rules.length} rule${rules.length === 1 ? '' : 's'})`);
  for (const rule of rules) {
    if (rule.ok) {
      const routing = rule.load_tier === 'always' ? 'load_tier: always' : `routing: ${rule.routing.join(', ')}`;
      logger.log(`OK   ${rule.name} [agents: ${rule.agents}] ${routing}`);
    } else {
      logger.log(`WARN ${rule.name}`);
      for (const warning of rule.warnings) logger.log(`     - ${warning}`);
    }
  }
  const clean = rules.filter((rule) => rule.ok).length;
  logger.log(`Summary: ${clean}/${rules.length} ok, ${warningsCount} warning${warningsCount === 1 ? '' : 's'}.`);
  if (warningsCount > 0) {
    logger.log('Tip: add routing frontmatter such as task_types, triggers, aliases, entities, retrieval_intents, paths, or globs so context:select can route the rule deterministically; semantic fallback is only a recall aid (see .aioson/rules/README.md).');
  }

  return result;
}

module.exports = { runRulesLint };
