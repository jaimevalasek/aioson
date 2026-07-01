'use strict';

/**
 * Autopilot activation signal — the single source of truth for "is autopilot
 * on?" outside the agent markdown files.
 *
 * Contract (docs/autopilot-handoff.md "Activation"), highest precedence first:
 *   - A scheme for the CURRENT feature with `agentic_policy.enabled: false`
 *     (the `--step` disarm) → OFF, even over `auto_handoff: true` — an explicit
 *     per-feature choice always wins over the project default.
 *   - `auto_handoff: true` in project.context.md frontmatter → ON (project default).
 *   - `auto_handoff: false` → OFF, even if a seeded scheme is lying around
 *     (step-by-step is the standing choice; a leftover scheme must not override it).
 *   - flag absent → ON only when `.aioson/context/workflow-execute.json` exists
 *     with `agentic_policy.enabled: true` (the per-feature "Autopilot" choice,
 *     which deliberately does NOT persist the frontmatter flag). When a slug is
 *     provided, the scheme counts only if it was seeded for THAT feature — a
 *     scheme left by a different/closed feature does not.
 */

const fs = require('node:fs/promises');
const path = require('node:path');
const { validateProjectContextFile } = require('./context');

const EXECUTION_STATE_RELATIVE_PATH = '.aioson/context/workflow-execute.json';

async function readSeededScheme(targetDir) {
  try {
    const raw = await fs.readFile(path.join(targetDir, EXECUTION_STATE_RELATIVE_PATH), 'utf8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function resolveAutopilotSignal(targetDir, { slug = null, projectContext = null } = {}) {
  let flag;
  try {
    const context = projectContext || await validateProjectContextFile(targetDir);
    flag = context && context.data && Object.prototype.hasOwnProperty.call(context.data, 'auto_handoff')
      ? context.data.auto_handoff === true
      : null;
  } catch {
    flag = null;
  }

  const scheme = await readSeededScheme(targetDir);
  const slugMatches = Boolean(
    scheme && (!slug || !scheme.feature || String(scheme.feature) === String(slug))
  );

  // Explicit per-feature disarm (--step) beats the project-wide flag.
  if (
    scheme && scheme.agentic_policy && scheme.agentic_policy.enabled === false &&
    slugMatches
  ) {
    return { enabled: false, source: 'scheme_disarmed' };
  }

  if (flag === true) return { enabled: true, source: 'frontmatter' };
  if (flag === false) return { enabled: false, source: 'frontmatter_off' };

  const schemeEnabled = Boolean(scheme && scheme.agentic_policy && scheme.agentic_policy.enabled === true);
  if (!schemeEnabled) return { enabled: false, source: null };
  if (!slugMatches) return { enabled: false, source: 'scheme_other_feature' };
  return { enabled: true, source: 'seeded_scheme' };
}

module.exports = {
  resolveAutopilotSignal
};
