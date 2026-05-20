#!/usr/bin/env node
'use strict';

/**
 * sync-agents-preflight — guard rsync against wiping unpropagated workspace edits.
 *
 * Runs before `npm run sync:agents` (which copies template/ → workspace).
 * For each chain agent, extracts the `## Feature dossier` section from both
 * `.aioson/agents/{agent}.md` and `template/.aioson/agents/{agent}.md`, then
 * aborts with exit 1 if the workspace section is *longer* than the template
 * section — that means the workspace has edits that have not been propagated
 * back to the template, and rsync would silently overwrite them.
 *
 * If the workspace and template are equal, or the template is longer, the
 * preflight allows rsync to continue.
 *
 * Run programmatically via `node src/commands/sync-agents-preflight.js`.
 */

const fs = require('node:fs');
const path = require('node:path');

const { CHAIN_AGENTS, FEATURE_DOSSIER_HEADER, extractSection } = require('./dossier-audit');
const dossierTelemetry = require('../lib/dossier-telemetry');
const { diffAgentFile } = require('../lib/agent-semantic-diff');

// Active Learning Loop Phase 6 — workspace ↔ template parity checks for the
// `.aioson/` artifacts this feature ships. Phase 1 dev's documented decision
// (spec Agent Trail) confirmed `template/src/` does not exist by design: the
// CLI lives in `src/` only, and `template/` mirrors `.aioson/` artifacts
// (config, agents, docs, rules, brains, context). Phase 6 parity therefore
// targets the template `.aioson/` surface that active-learning-loop touches.
const LEARNING_LOOP_TIER1_COMMANDS = ['context:load', 'memory:search'];
const LEARNING_LOOP_TIER2_COMMANDS = ['memory:archive', 'memory:restore'];
const LEARNING_LOOP_ARCHIVE_PLACEHOLDERS = [
  '.aioson/rules/_archived/.gitkeep',
  '.aioson/brains/_archived/.gitkeep',
  '.aioson/context/_archived/.gitkeep'
];

function readFileOrEmpty(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch {
    return '';
  }
}

function checkLearningLoopTemplateParity(projectRoot) {
  const issues = [];
  const templateDir = path.join(projectRoot, 'template');

  // 1. template/.aioson/config/learning-loop.json must exist + be valid JSON.
  const cfgPath = path.join(templateDir, '.aioson', 'config', 'learning-loop.json');
  const cfgRaw = readFileOrEmpty(cfgPath);
  if (!cfgRaw) {
    issues.push({ kind: 'missing_config', path: 'template/.aioson/config/learning-loop.json' });
  } else {
    let cfg;
    try { cfg = JSON.parse(cfgRaw); }
    catch (err) {
      issues.push({ kind: 'invalid_config_json', path: 'template/.aioson/config/learning-loop.json', error: err.message });
      cfg = null;
    }
    if (cfg) {
      for (const key of ['enabled', 'skip_on_classification', 'execution_mode', 'lock_strategy', 'timeout_ms']) {
        if (!(key in cfg)) {
          issues.push({ kind: 'config_missing_key', key });
        }
      }
    }
  }

  // 2. template/.aioson/config/autonomy-protocol.json must list the verbs.
  const autonomyPath = path.join(templateDir, '.aioson', 'config', 'autonomy-protocol.json');
  const autonomyRaw = readFileOrEmpty(autonomyPath);
  if (!autonomyRaw) {
    issues.push({ kind: 'missing_autonomy', path: 'template/.aioson/config/autonomy-protocol.json' });
  } else {
    let autonomy;
    try { autonomy = JSON.parse(autonomyRaw); }
    catch (err) {
      issues.push({ kind: 'invalid_autonomy_json', error: err.message });
      autonomy = null;
    }
    if (autonomy && autonomy.tiers) {
      const tier1 = (autonomy.tiers.tier1_silent && autonomy.tiers.tier1_silent.aioson_commands) || [];
      const tier2 = (autonomy.tiers.tier2_notified && autonomy.tiers.tier2_notified.aioson_commands) || [];
      for (const verb of LEARNING_LOOP_TIER1_COMMANDS) {
        if (!tier1.includes(verb)) issues.push({ kind: 'autonomy_tier1_missing', verb });
      }
      for (const verb of LEARNING_LOOP_TIER2_COMMANDS) {
        if (!tier2.includes(verb)) issues.push({ kind: 'autonomy_tier2_missing', verb });
      }
    }
  }

  // 3. Archive folder placeholders must exist in the template tree.
  for (const rel of LEARNING_LOOP_ARCHIVE_PLACEHOLDERS) {
    const absPath = path.join(templateDir, rel);
    if (!fs.existsSync(absPath)) {
      issues.push({ kind: 'archive_placeholder_missing', path: `template/${rel}` });
    }
  }

  return issues;
}

/**
 * checkSemanticParity — T5 (workflow-handoff-integrity v1.9.8)
 *
 * Detects semantic drift between `.aioson/agents/{agent}.md` and
 * `template/.aioson/agents/{agent}.md`: headers (presence + order), section
 * content (hash), and frontmatter fields. Catches 981a8fd-style migration
 * incompleteness that the original Feature-dossier-length check misses.
 *
 * Mode-aware severity (per PMD-04 / DD-03):
 *   - Default (local dev): returns issues with severity='warning' (caller is non-blocking).
 *   - `AIOSON_PREPUBLISH=true`: returns issues with severity='error' (caller blocks publish).
 *
 * Returns array of issue objects.
 */
function checkSemanticParity(projectRoot) {
  const issues = [];
  const isPrepublish = process.env.AIOSON_PREPUBLISH === 'true';
  const severity = isPrepublish ? 'error' : 'warning';

  for (const agent of CHAIN_AGENTS) {
    const workspacePath = path.join(projectRoot, '.aioson', 'agents', `${agent}.md`);
    const templatePath = path.join(projectRoot, 'template', '.aioson', 'agents', `${agent}.md`);
    const workspaceRaw = readFileOrEmpty(workspacePath);
    const templateRaw = readFileOrEmpty(templatePath);

    const diff = diffAgentFile(workspaceRaw, templateRaw);
    if (!diff) continue;

    if (diff.missingFile) {
      // AC-T5-08 — file removed in one side, still present in the other.
      issues.push({
        agent,
        kind: 'missing_file',
        side: diff.missingFile,
        severity,
        hint: diff.missingFile === 'workspace'
          ? `template/.aioson/agents/${agent}.md exists but workspace/.aioson/agents/${agent}.md does not — sync would create it (likely fine, unless workspace deletion was intentional)`
          : `workspace/.aioson/agents/${agent}.md exists but template/.aioson/agents/${agent}.md does not — workspace edits are unpropagated; copy to template OR delete workspace file`
      });
      continue;
    }

    if (diff.missingInTemplate.length > 0) {
      issues.push({
        agent, kind: 'sections_missing_in_template', sections: diff.missingInTemplate, severity,
        hint: `Workspace has sections not in template: ${diff.missingInTemplate.map((s) => `'${s}'`).join(', ')}. Likely unpropagated workspace edits (981a8fd pattern).`
      });
    }
    if (diff.missingInWorkspace.length > 0) {
      issues.push({
        agent, kind: 'sections_missing_in_workspace', sections: diff.missingInWorkspace, severity,
        hint: `Template has sections not in workspace: ${diff.missingInWorkspace.map((s) => `'${s}'`).join(', ')}. Workspace lost content OR template added new sections post-sync.`
      });
    }
    if (diff.reordered) {
      issues.push({
        agent, kind: 'sections_reordered', severity,
        hint: 'Section order differs between workspace and template — review for unintended structural drift.'
      });
    }
    if (diff.divergedSections.length > 0) {
      issues.push({
        agent, kind: 'section_content_diverged', sections: diff.divergedSections.map((d) => d.header), severity,
        hint: `Section content hash differs (not cosmetic): ${diff.divergedSections.map((d) => `'${d.header}'`).join(', ')}. Investigate before sync to avoid 981a8fd-style migration regression.`
      });
    }
    if (diff.frontmatter) {
      const fm = diff.frontmatter;
      if (fm.missingInTemplate.length > 0) {
        issues.push({ agent, kind: 'frontmatter_missing_in_template', fields: fm.missingInTemplate, severity });
      }
      if (fm.missingInWorkspace.length > 0) {
        issues.push({ agent, kind: 'frontmatter_missing_in_workspace', fields: fm.missingInWorkspace, severity });
      }
      if (fm.valueChanged.length > 0) {
        issues.push({ agent, kind: 'frontmatter_value_changed', changes: fm.valueChanged, severity });
      }
    }
  }

  return issues;
}


function checkParity(projectRoot) {
  const violations = [];
  for (const agent of CHAIN_AGENTS) {
    const workspacePath = path.join(projectRoot, '.aioson', 'agents', `${agent}.md`);
    const templatePath = path.join(projectRoot, 'template', '.aioson', 'agents', `${agent}.md`);
    const workspaceRaw = readFileOrEmpty(workspacePath);
    const templateRaw = readFileOrEmpty(templatePath);
    if (!workspaceRaw && !templateRaw) continue;

    const workspaceSection = workspaceRaw ? extractSection(workspaceRaw, FEATURE_DOSSIER_HEADER) : null;
    const templateSection = templateRaw ? extractSection(templateRaw, FEATURE_DOSSIER_HEADER) : null;

    if (workspaceSection === templateSection) continue;

    const workspaceLen = workspaceSection ? workspaceSection.length : 0;
    const templateLen = templateSection ? templateSection.length : 0;

    if (workspaceLen > templateLen) {
      violations.push({ agent, workspaceLen, templateLen });
    }
  }
  return violations;
}

async function main(projectRoot = process.cwd()) {
  const violations = checkParity(projectRoot);
  const learningLoopIssues = checkLearningLoopTemplateParity(projectRoot);
  // T5 (workflow-handoff-integrity v1.9.8) — semantic parity check on top of length check.
  const semanticIssues = checkSemanticParity(projectRoot);
  const isPrepublish = process.env.AIOSON_PREPUBLISH === 'true';

  if (violations.length === 0 && learningLoopIssues.length === 0 && semanticIssues.length === 0) {
    return 0;
  }

  if (violations.length > 0) {
    process.stderr.write('[sync:agents BLOCKED] Workspace has Feature dossier edits not propagated to template:\n');
    for (const v of violations) {
      process.stderr.write(`  - @${v.agent}: workspace=${v.workspaceLen} chars, template=${v.templateLen} chars\n`);
    }
    process.stderr.write('\nCopy workspace → template for these agents before running sync:agents,\n');
    process.stderr.write('otherwise rsync will overwrite the workspace edits.\n');

    await dossierTelemetry.emitDossierEvent(projectRoot, {
      agent: 'sync-agents-preflight',
      type: 'sync_agents_parity_violation',
      summary: `${violations.length} agent(s) ahead in workspace`,
      meta: { violations }
    });
  }

  if (learningLoopIssues.length > 0) {
    process.stderr.write('[sync:agents BLOCKED] Active Learning Loop template parity issues:\n');
    for (const issue of learningLoopIssues) {
      process.stderr.write(`  - ${issue.kind}${issue.path ? ' (' + issue.path + ')' : ''}${issue.verb ? ' (' + issue.verb + ')' : ''}${issue.key ? ' (' + issue.key + ')' : ''}${issue.error ? ': ' + issue.error : ''}\n`);
    }
    await dossierTelemetry.emitDossierEvent(projectRoot, {
      agent: 'sync-agents-preflight',
      type: 'learning_loop_template_parity_violation',
      summary: `${learningLoopIssues.length} learning-loop template issue(s)`,
      meta: { issues: learningLoopIssues }
    });
  }

  // T5 semantic drift — warning-only locally, error in pre-publish mode.
  if (semanticIssues.length > 0) {
    const banner = isPrepublish
      ? '[sync:agents BLOCKED] Semantic parity drift detected (pre-publish hard fail — AIOSON_PREPUBLISH=true):'
      : '[sync:agents WARN] Semantic parity drift detected (warning only — non-blocking for local dev):';
    process.stderr.write(`${banner}\n`);
    for (const issue of semanticIssues) {
      const detail = issue.sections ? ` [${issue.sections.join(', ')}]`
        : issue.fields ? ` [${issue.fields.join(', ')}]`
        : issue.changes ? ` [${issue.changes.map((c) => c.key).join(', ')}]`
        : '';
      process.stderr.write(`  - @${issue.agent}: ${issue.kind}${detail}\n`);
      if (issue.hint) process.stderr.write(`    → ${issue.hint}\n`);
    }
    await dossierTelemetry.emitDossierEvent(projectRoot, {
      agent: 'sync-agents-preflight',
      type: 'semantic_parity_violation',
      summary: `${semanticIssues.length} semantic drift issue(s) (mode: ${isPrepublish ? 'prepublish-fail' : 'local-warn'})`,
      meta: { issues: semanticIssues, prepublish: isPrepublish }
    });
  }

  // Block only when there are HARD failures: length violations + learning-loop issues
  // always block (existing behavior). Semantic drift blocks ONLY in pre-publish mode.
  const hardBlock = violations.length > 0 || learningLoopIssues.length > 0
    || (isPrepublish && semanticIssues.length > 0);
  return hardBlock ? 1 : 0;
}

if (require.main === module) {
  main().then((code) => process.exit(code));
}

module.exports = { checkParity, checkLearningLoopTemplateParity, checkSemanticParity, main };
