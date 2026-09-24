'use strict';

// Migration: remove the stale files an agent rename or retirement leaves
// behind in a consumer project.
//
// Why: `aioson update` copies the template's CURRENT files but never deletes
// the ones a previous template shipped. After `briefing-refiner` became
// `refiner`, an updated project would carry both `.aioson/agents/refiner.md`
// and the orphaned `.aioson/agents/briefing-refiner.md` (plus its slash
// command stub) — two entry points for one agent, the old one frozen at the
// pre-rename kernel. The legacy id itself keeps resolving through `aliases`
// (see `LEGACY_AGENT_IDS` in src/agents.js); only the dead files go.
//
// Safety: a legacy path is removed only when (a) the template does NOT ship
// it — so a real alias stub such as `pair.md` is never touched — and (b) the
// canonical counterpart already exists in the target, so the project is never
// left without the agent.
//
// Idempotent: re-running on a migrated project does nothing.

const fs = require('node:fs/promises');
const path = require('node:path');
const { LEGACY_AGENT_IDS } = require('../agents');

const ROOT_DIR = path.resolve(__dirname, '..', '..');
const TEMPLATE_DIR = path.join(ROOT_DIR, 'template');

// Every place a per-agent file is materialized by id.
const AGENT_FILE_PATTERNS = Object.freeze([
  '.aioson/agents/{id}.md',
  '.aioson/agents/manifests/{id}.manifest.json',
  '.claude/commands/aioson/agent/{id}.md'
]);

// Framework-owned docs that only a retired agent loaded. `update` overwrites
// managed docs without preserving edits, so removing them is the same
// ownership rule; the two continuity docs now ship under docs/dev/.
const RETIRED_FILES = Object.freeze([
  '.aioson/docs/deyvin/continuity-recovery.md',
  '.aioson/docs/deyvin/debugging-escalation.md',
  '.aioson/docs/deyvin/pair-execution.md',
  '.aioson/docs/deyvin/runtime-handoffs.md',
  '.aioson/docs/deyvin/scout-fallback.md',
  '.aioson/docs/ux-ui/accessibility-audit.md',
  '.aioson/docs/ux-ui/audit-mode.md',
  '.aioson/docs/ux-ui/component-map.md',
  '.aioson/docs/ux-ui/design-execution.md',
  '.aioson/docs/ux-ui/design-gate.md',
  '.aioson/docs/ux-ui/research-mode.md',
  '.aioson/docs/ux-ui/site-delivery.md',
  '.aioson/docs/ux-ui/token-contract.md',
  '.aioson/skills/process/aioson-spec-driven/references/analyst.md',
  '.aioson/skills/process/aioson-spec-driven/references/architect.md',
  '.aioson/skills/process/aioson-spec-driven/references/deyvin.md',
  '.aioson/skills/process/aioson-spec-driven/references/pm.md'
]);

async function exists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

function legacyAgentFiles() {
  const pairs = [];
  for (const [legacy, canonical] of Object.entries(LEGACY_AGENT_IDS)) {
    for (const pattern of AGENT_FILE_PATTERNS) {
      pairs.push({
        legacy,
        canonical,
        legacyRel: pattern.replace('{id}', legacy),
        // A manifest is optional per agent: its guard is the canonical kernel.
        canonicalRel: pattern.includes('manifests/')
          ? AGENT_FILE_PATTERNS[0].replace('{id}', canonical)
          : pattern.replace('{id}', canonical)
      });
    }
  }
  return pairs;
}

// Returns { changed: boolean, removed: string[] } — `removed` lists the
// project-relative paths deleted this run.
async function migrateAgentRename(targetDir, options = {}) {
  const templateDir = options.templateDir || TEMPLATE_DIR;
  const removed = [];
  for (const entry of legacyAgentFiles()) {
    // The template still ships this file → it is a live alias stub, not debris.
    if (await exists(path.join(templateDir, entry.legacyRel))) continue;
    const legacyAbs = path.join(targetDir, entry.legacyRel);
    if (!(await exists(legacyAbs))) continue;
    if (!(await exists(path.join(targetDir, entry.canonicalRel)))) continue;
    await fs.unlink(legacyAbs);
    removed.push(entry.legacyRel);
  }
  for (const rel of RETIRED_FILES) {
    if (await exists(path.join(templateDir, rel))) continue;
    const abs = path.join(targetDir, rel);
    if (!(await exists(abs))) continue;
    await fs.unlink(abs);
    removed.push(rel);
    // Drop the folder once it is empty (docs/deyvin/, docs/ux-ui/).
    await fs.rmdir(path.dirname(abs)).catch(() => {});
  }
  return { changed: removed.length > 0, removed };
}

module.exports = {
  AGENT_FILE_PATTERNS,
  RETIRED_FILES,
  legacyAgentFiles,
  migrateAgentRename
};
