'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const { parseFrontmatter } = require('../preflight-engine');

const ROUTING_FIELDS = ['task_types', 'triggers', 'paths', 'globs'];

function hasValue(raw) {
  if (raw === undefined || raw === null) return false;
  const value = String(raw).trim();
  return value !== '' && value !== '[]';
}

function lintRule(relPath, frontmatter) {
  const warnings = [];

  if (!hasValue(frontmatter.name)) warnings.push('missing required field: name');
  if (!hasValue(frontmatter.description)) warnings.push('missing required field: description');

  const loadTier = String(frontmatter.load_tier || 'trigger').trim().toLowerCase();
  const routing = ROUTING_FIELDS.filter((field) => hasValue(frontmatter[field]));

  if (loadTier !== 'always' && routing.length === 0) {
    warnings.push(
      'selector-invisible: no task_types, triggers, or paths — context:select can never score this rule above the load threshold, so agents will not load it on demand. Add routing metadata or set load_tier: always.'
    );
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

async function runRulesLint({ args, options = {}, logger }) {
  const targetDir = path.resolve(process.cwd(), args[0] || '.');
  const rulesDir = path.join(targetDir, '.aioson', 'rules');
  const relDir = '.aioson/rules';

  let entries = [];
  try {
    entries = await fs.readdir(rulesDir, { withFileTypes: true });
  } catch {
    const result = { ok: true, dir: relDir, rules: [], total: 0, warnings: 0 };
    if (options.json) return result;
    logger.log(`No rules directory found at ${relDir} — nothing to lint.`);
    return result;
  }

  const rules = [];
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith('.md')) continue;
    if (entry.name.toLowerCase() === 'readme.md') continue;
    const content = await fs.readFile(path.join(rulesDir, entry.name), 'utf8');
    rules.push(lintRule(`${relDir}/${entry.name}`, parseFrontmatter(content)));
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
    logger.log('Tip: add task_types/triggers/paths frontmatter so context:select can load the rule on demand (see .aioson/rules/README.md).');
  }

  return result;
}

module.exports = { runRulesLint };
