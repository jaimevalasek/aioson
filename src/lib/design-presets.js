'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');

// The framework ships exactly ONE design skill: the craft engine. Every fixed
// aesthetic preset was retired on 2026-08-28 — a preset hardcodes a palette
// and a typeface, so every project that picked the same one looked the same
// (the "made-by-AI" sameness the engine + identity.md route exists to kill).
// A copy an older version installed into a consumer keeps working while
// `design_skill` names it; nothing ships, updates or recommends it any more.
const DESIGN_ENGINE_ID = 'interface-design';

const RETIRED_DESIGN_PRESETS = Object.freeze([
  'aurora-command-ui',
  'bold-editorial-ui',
  'clean-saas-ui',
  'cognitive-core-ui',
  'glassmorphism-ui',
  'neo-brutalist-ui',
  'premium-command-center-ui',
  'warm-craft-ui',
  // a forged example skill that shipped under the domain it was extracted from
  'pt.squarespace.com'
]);

// Trees retired the same day for the same reason: a second design engine in
// disguise ("Cognitive Core Design System", triggered on any styled UI) and
// the framework's own dashboard component specs — the shape of THIS
// repository shipped into every consumer, like the retired design-doc seed.
const RETIRED_SKILL_TREES = Object.freeze([
  '.aioson/skills/design-system',
  '.aioson/skills/references/premium-command-center-ui',
  '.aioson/skills/premium-visual-design'
]);

function isRetiredDesignPreset(id) {
  return typeof id === 'string' && RETIRED_DESIGN_PRESETS.includes(id.trim());
}

/**
 * Splits an install-profile `design` value (string | string[]) into what the
 * installer can still honor and the retired ids it silently used to accept.
 * 'none' / 'all' / the engine pass through; a value left empty by the split
 * becomes 'none' — the engine is installed regardless of the profile.
 */
function normalizeDesignProfile(design) {
  if (design === undefined || design === null || design === '') return { design: 'none', retired: [] };
  const list = Array.isArray(design) ? design : [design];
  const retired = list.filter((id) => isRetiredDesignPreset(id));
  const kept = list.filter((id) => !isRetiredDesignPreset(id));
  if (kept.length === 0) return { design: 'none', retired };
  if (kept.length === 1) return { design: kept[0], retired };
  return { design: kept, retired };
}

async function fileExists(file) {
  try {
    await fs.access(file);
    return true;
  } catch {
    return false;
  }
}

function readDesignSkillField(raw) {
  // `[ \t]*`: `\s*` crossed the newline and read the next line as the value.
  const match = /^design_skill:[ \t]*(.*)$/m.exec(raw || '');
  if (!match) return '';
  return match[1].trim().replace(/^["']|["']$/g, '').trim();
}

/**
 * Names every retired preset a consumer still points at, and whether a
 * project-local copy exists to back it. Read-only.
 *
 * @returns {{ design_skill: string, retired_design_skill: string|null,
 *   local_path: string|null, profile_retired: string[], retired_trees: string[] }}
 */
async function inspectRetiredDesignPresets(targetDir, { installProfile = null } = {}) {
  const result = { design_skill: '', retired_design_skill: null, local_path: null, profile_retired: [], retired_trees: [] };

  let raw = '';
  try {
    raw = await fs.readFile(path.join(targetDir, '.aioson/context/project.context.md'), 'utf8');
  } catch {
    raw = '';
  }
  result.design_skill = readDesignSkillField(raw);
  if (isRetiredDesignPreset(result.design_skill)) {
    result.retired_design_skill = result.design_skill;
    for (const rel of [
      `.aioson/skills/design/${result.design_skill}/SKILL.md`,
      `.aioson/installed-skills/${result.design_skill}/SKILL.md`
    ]) {
      if (await fileExists(path.join(targetDir, rel))) {
        result.local_path = rel;
        break;
      }
    }
  }

  if (installProfile && installProfile.design !== undefined) {
    result.profile_retired = normalizeDesignProfile(installProfile.design).retired;
  }

  // Trees an older installer copied and update never removes: nothing routes
  // to them, so they are dead weight the consumer is told about — never deleted.
  for (const rel of RETIRED_SKILL_TREES) {
    if (await fileExists(path.join(targetDir, rel))) result.retired_trees.push(rel);
  }

  return result;
}

module.exports = {
  DESIGN_ENGINE_ID,
  RETIRED_DESIGN_PRESETS,
  RETIRED_SKILL_TREES,
  isRetiredDesignPreset,
  normalizeDesignProfile,
  inspectRetiredDesignPresets
};
