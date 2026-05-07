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

function readFileOrEmpty(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch {
    return '';
  }
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

  if (violations.length === 0) {
    return 0;
  }

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

  return 1;
}

if (require.main === module) {
  main().then((code) => process.exit(code));
}

module.exports = { checkParity, main };
