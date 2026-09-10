'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const { execFile } = require('node:child_process');
const { exists, ensureDir } = require('../utils');
const { resolveSkillCatalog } = require('../skills/registry');
const { resolveTargetDir } = require('../lib/project-root');
const { parseFrontmatter } = require('../preflight-engine');
const { DESIGN_ENGINE_ID } = require('../lib/design-presets');

const INSTALLED_SKILLS_DIR = '.aioson/installed-skills';
const TOOL_TARGETS = [
  '.claude/skills',
  '.cursor/skills',
  '.windsurf/skills'
];

async function copyRecursive(src, dest) {
  const stat = await fs.stat(src);
  if (stat.isDirectory()) {
    await ensureDir(dest);
    const entries = await fs.readdir(src);
    for (const entry of entries) {
      await copyRecursive(path.join(src, entry), path.join(dest, entry));
    }
    return;
  }

  await ensureDir(path.dirname(dest));
  await fs.copyFile(src, dest);
}

async function replaceDirectory(srcDir, destDir) {
  await fs.rm(destDir, { recursive: true, force: true });
  await copyRecursive(srcDir, destDir);
}

async function readJsonIfExists(filePath) {
  if (!(await exists(filePath))) return null;
  try {
    return JSON.parse(await fs.readFile(filePath, 'utf8'));
  } catch {
    return null;
  }
}

async function writeSkillMeta(destDir, patch) {
  const metaPath = path.join(destDir, '.skill-meta.json');
  const existing = await readJsonIfExists(metaPath) || {};
  const merged = {
    ...existing,
    ...patch
  };

  await fs.writeFile(metaPath, JSON.stringify(merged, null, 2), 'utf8');
  return merged;
}

/**
 * Parse YAML frontmatter from a SKILL.md file.
 */
// One frontmatter reader for every SKILL.md surface (the selector, the
// registry audit and this catalog read the same file the same way — a folded
// `description: >-` block is a description here too, not a literal `>-`).
function parseSkillFrontmatter(content) {
  return parseFrontmatter(String(content || ''));
}

/**
 * Copy a skill to a tool-specific directory (Claude Code, Cursor, Windsurf).
 */
async function distributeToTool(targetDir, slug, skillDir) {
  const results = [];
  for (const toolPath of TOOL_TARGETS) {
    const toolSkillDir = path.join(targetDir, toolPath, slug);
    try {
      await replaceDirectory(skillDir, toolSkillDir);
      results.push({ tool: toolPath, ok: true });
    } catch (err) {
      results.push({ tool: toolPath, ok: false, error: err.message });
    }
  }
  return results;
}

/**
 * Remove a skill from tool-specific directories.
 */
async function removeFromTools(targetDir, slug) {
  for (const toolPath of TOOL_TARGETS) {
    const toolSkillDir = path.join(targetDir, toolPath, slug);
    try {
      await fs.rm(toolSkillDir, { recursive: true, force: true });
    } catch {
      // Ignore — may not exist
    }
  }
}

/**
 * Update the AGENTS.md installed-skills section.
 */
async function updateAgentsMdSkills(targetDir) {
  const agentsPath = path.join(targetDir, 'AGENTS.md');
  if (!(await exists(agentsPath))) return;

  let content = await fs.readFile(agentsPath, 'utf8');

  // List installed skills
  const skillsDir = path.join(targetDir, INSTALLED_SKILLS_DIR);
  let skills = [];
  try {
    const entries = await fs.readdir(skillsDir);
    for (const slug of entries) {
      const skillMdPath = path.join(skillsDir, slug, 'SKILL.md');
      if (await exists(skillMdPath)) {
        const raw = await fs.readFile(skillMdPath, 'utf8');
        const fm = parseSkillFrontmatter(raw);
        skills.push({
          slug,
          name: fm.name || slug,
          description: fm.description || ''
        });
      }
    }
  } catch {
    // No installed skills
  }

  // Build the section
  const marker = '## Installed skills';
  const endMarker = '## '; // Next section starts with ##
  const startIdx = content.indexOf(marker);

  let skillsSection = '';
  if (skills.length > 0) {
    skillsSection = `${marker}\n\n`;
    skillsSection += 'These skills are available in the project. Load them on-demand when the task matches their description.\n\n';
    skillsSection += '| Skill | File | Description |\n';
    skillsSection += '|-------|------|-------------|\n';
    for (const s of skills) {
      const shortDesc = s.description.length > 100 ? s.description.slice(0, 100) + '...' : s.description;
      skillsSection += `| @${s.slug} | \`.aioson/installed-skills/${s.slug}/SKILL.md\` | ${shortDesc} |\n`;
    }
    skillsSection += '\n';
  }

  if (startIdx !== -1) {
    // Replace existing section
    const afterMarker = content.slice(startIdx + marker.length);
    const nextSectionIdx = afterMarker.indexOf('\n## ');
    if (nextSectionIdx !== -1) {
      const before = content.slice(0, startIdx);
      const after = afterMarker.slice(nextSectionIdx + 1);
      content = before + (skills.length > 0 ? skillsSection : '') + after;
    } else {
      // Section is at the end
      content = content.slice(0, startIdx) + skillsSection;
    }
  } else if (skills.length > 0) {
    // Insert before "## Golden rule" or at the end
    const goldenIdx = content.indexOf('## Golden rule');
    if (goldenIdx !== -1) {
      content = content.slice(0, goldenIdx) + skillsSection + content.slice(goldenIdx);
    } else {
      content = content.trimEnd() + '\n\n' + skillsSection;
    }
  }

  await fs.writeFile(agentsPath, content, 'utf8');
}

/**
 * Install from npm using @tech-leads-club/agent-skills
 * Runs the npm CLI, then moves the resulting files to .aioson/installed-skills/
 */
async function installFromNpm(targetDir, slug, options, logger) {
  return new Promise((resolve, reject) => {
    const args = ['@tech-leads-club/agent-skills', 'install', '--skill', slug];
    if (options.force) args.push('--force');

    logger.log(`  Running: npx ${args.join(' ')}`);
    execFile('npx', args, {
      cwd: targetDir,
      timeout: 60000,
      env: { ...process.env }
    }, async (error, stdout, stderr) => {
      if (error) {
        logger.error(`  npm install failed: ${error.message}`);
        return resolve({ ok: false, error: error.message });
      }

      // The npm tool installs to .claude/skills/{slug}/, .cursor/skills/{slug}/, .windsurf/skills/{slug}/
      // Find the SKILL.md in any of these and copy to .aioson/installed-skills/
      const sources = TOOL_TARGETS.map(t => path.join(targetDir, t, slug));
      let sourceDir = null;
      for (const src of sources) {
        if (await exists(path.join(src, 'SKILL.md'))) {
          sourceDir = src;
          break;
        }
      }

      if (!sourceDir) {
        return resolve({ ok: false, error: `Skill "${slug}" installed by npm but SKILL.md not found in tool directories` });
      }

      // Copy to .aioson/installed-skills/{slug}/
      const destDir = path.join(targetDir, INSTALLED_SKILLS_DIR, slug);
      await replaceDirectory(sourceDir, destDir);
      await writeSkillMeta(destDir, {
        source: 'npm',
        sourcePackage: '@tech-leads-club/agent-skills',
        sourcePath: path.relative(targetDir, sourceDir),
        installedAt: new Date().toISOString()
      });

      resolve({ ok: true, sourceDir, destDir });
    });
  });
}

/**
 * Install from aioson.com cloud registry
 */
async function installFromCloud(targetDir, slug, options, logger) {
  // Read cloud config
  let cloudUrl, cloudToken;
  try {
    const raw = await fs.readFile(path.join(targetDir, '.aioson/install.json'), 'utf8');
    const meta = JSON.parse(raw);
    cloudUrl = options.url || meta.cloudBaseUrl;
    cloudToken = options.token || meta.cloudApiToken;
  } catch {
    cloudUrl = options.url;
    cloudToken = options.token;
  }

  if (!cloudUrl) {
    return { ok: false, error: 'Cloud URL not configured. Use --url or set cloudBaseUrl.' };
  }

  const endpoint = `${cloudUrl.replace(/\/+$/, '')}/api/registry/skills/${encodeURIComponent(slug)}`;
  logger.log(`  Fetching: ${endpoint}`);

  const headers = { accept: 'application/json' };
  if (cloudToken) headers.authorization = `Bearer ${cloudToken}`;

  const response = await fetch(endpoint, { headers, signal: AbortSignal.timeout(15000) });
  if (!response.ok) {
    return { ok: false, error: `Cloud returned ${response.status}` };
  }

  const snapshot = await response.json();
  if (!snapshot.skill || !snapshot.contentMarkdown) {
    return { ok: false, error: 'Invalid skill snapshot from cloud' };
  }

  // Build SKILL.md with frontmatter
  const fm = [
    '---',
    `name: ${snapshot.skill.slug}`,
    `description: ${snapshot.skill.summary || snapshot.skill.title || slug}`,
    `source: cloud`,
    `domain: ${snapshot.skill.domain || 'general'}`,
    '---',
    '',
    snapshot.contentMarkdown
  ].join('\n');

  const destDir = path.join(targetDir, INSTALLED_SKILLS_DIR, slug);
  await fs.rm(destDir, { recursive: true, force: true });
  await ensureDir(destDir);
  await fs.writeFile(path.join(destDir, 'SKILL.md'), fm, 'utf8');

  // Write meta
  await writeSkillMeta(destDir, {
    source: 'cloud',
    cloudSlug: snapshot.skill.slug,
    installedAt: new Date().toISOString()
  });

  return { ok: true, destDir };
}

/**
 * Install from a local file path
 */
async function installFromLocal(targetDir, slug, filePath, logger) {
  const absPath = path.resolve(targetDir, filePath);
  if (!(await exists(absPath))) {
    return { ok: false, error: `File not found: ${absPath}` };
  }

  const destDir = path.join(targetDir, INSTALLED_SKILLS_DIR, slug);
  const stat = await fs.stat(absPath);
  const samePath = path.resolve(absPath) === path.resolve(destDir);

  if (!samePath) {
    await fs.rm(destDir, { recursive: true, force: true });
    await ensureDir(destDir);
  } else if (!stat.isDirectory()) {
    return { ok: false, error: 'Local self-install only supports skill directories' };
  }

  if (stat.isDirectory()) {
    if (!samePath) {
      await replaceDirectory(absPath, destDir);
    }
  } else {
    // Single file — copy as SKILL.md
    await ensureDir(destDir);
    await fs.copyFile(absPath, path.join(destDir, 'SKILL.md'));
  }

  // Write meta. A self-install (samePath) re-distributes an artifact that already
  // owns its provenance — preserve an existing `source` (e.g. `generated`, which
  // the hybrid-forge quality gate requires) instead of stamping it `local`.
  const existingMeta = samePath ? await readJsonIfExists(path.join(destDir, '.skill-meta.json')) : null;
  const preservedSource = existingMeta && typeof existingMeta.source === 'string' && existingMeta.source
    ? existingMeta.source
    : null;
  await writeSkillMeta(destDir, {
    source: preservedSource || 'local',
    ...(preservedSource ? {} : { sourcePath: filePath }),
    installedAt: new Date().toISOString()
  });

  return { ok: true, destDir };
}

// ── Main commands ──

async function runSkillInstall({ args, options = {}, logger, t }) {
  const targetDir = resolveTargetDir(args);
  const slug = options.slug || options.skill;
  const from = options.from || 'npm';

  if (!slug) {
    logger.error('Usage: aioson skill:install --slug=<name> [--from=npm|cloud|./path]');
    return { ok: false, error: 'Missing --slug' };
  }

  logger.log(`Installing skill "${slug}" from ${from}...`);

  let result;
  if (from === 'npm') {
    result = await installFromNpm(targetDir, slug, options, logger);
  } else if (from === 'cloud') {
    result = await installFromCloud(targetDir, slug, options, logger);
  } else {
    // Treat as local path
    result = await installFromLocal(targetDir, slug, from, logger);
  }

  if (!result.ok) {
    logger.error(`  Installation failed: ${result.error}`);
    return { ok: false, error: result.error, slug };
  }

  // Distribute to tool directories
  const skillDir = path.join(targetDir, INSTALLED_SKILLS_DIR, slug);
  const distributed = await distributeToTool(targetDir, slug, skillDir);

  for (const d of distributed) {
    const status = d.ok ? 'OK' : `FAIL: ${d.error}`;
    logger.log(`  ${d.tool}: ${status}`);
  }

  // Update AGENTS.md
  await updateAgentsMdSkills(targetDir);
  logger.log(`  AGENTS.md updated`);

  const skillMdPath = path.join(skillDir, 'SKILL.md');
  if (await exists(skillMdPath)) {
    const raw = await fs.readFile(skillMdPath, 'utf8');
    const fm = parseSkillFrontmatter(raw);
    logger.log(`\nInstalled: ${fm.name || slug}`);
    if (fm.description) {
      logger.log(`  ${fm.description.slice(0, 120)}`);
    }
  }

  logger.log(`\nSkill available at: .aioson/installed-skills/${slug}/SKILL.md`);

  return {
    ok: true,
    slug,
    from,
    installed: path.join(INSTALLED_SKILLS_DIR, slug),
    distributed: distributed.filter(d => d.ok).map(d => d.tool)
  };
}

/**
 * Parse a minimal extension.yml manifest if present in a skill directory.
 * Reads only top-level scalar fields and one level of nesting.
 * Returns null if the file is absent or unreadable.
 */
async function parseExtensionManifest(skillDir) {
  const manifestPath = path.join(skillDir, 'extension.yml');
  let raw;
  try {
    raw = await fs.readFile(manifestPath, 'utf8');
  } catch {
    return null; // file not present — this is the normal case for old skills
  }

  const manifest = {};
  let currentSection = null;

  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    // Detect top-level section (no leading spaces, ends with colon, no value)
    if (/^\w[\w-]*:$/.test(trimmed)) {
      currentSection = trimmed.slice(0, -1);
      manifest[currentSection] = {};
      continue;
    }

    // Nested key: value (indented with spaces or tab)
    if (currentSection && /^\s+/.test(line)) {
      const idx = trimmed.indexOf(':');
      if (idx === -1) continue;
      const key = trimmed.slice(0, idx).trim();
      const val = trimmed.slice(idx + 1).trim().replace(/^["']|["']$/g, '');
      if (key) manifest[currentSection][key] = val;
      continue;
    }

    // Top-level scalar key: value
    const idx = trimmed.indexOf(':');
    if (idx === -1) continue;
    const key = trimmed.slice(0, idx).trim();
    const val = trimmed.slice(idx + 1).trim().replace(/^["']|["']$/g, '');
    if (key) {
      currentSection = null;
      manifest[key] = val;
    }
  }

  return manifest;
}

/**
 * Scan a directory for .md files with SKILL.md or frontmatter descriptions.
 * Returns array of { slug, name, description, type, path }.
 */
async function scanSourceSkillDir(baseDir, type) {
  const results = [];
  if (!(await exists(baseDir))) return results;

  try {
    const entries = await fs.readdir(baseDir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue;

      if (entry.isDirectory()) {
        // Look for SKILL.md inside the directory
        const skillMdPath = path.join(baseDir, entry.name, 'SKILL.md');
        if (await exists(skillMdPath)) {
          const raw = await fs.readFile(skillMdPath, 'utf8');
          const fm = parseSkillFrontmatter(raw);
          results.push({
            slug: entry.name,
            name: fm.name || entry.name,
            description: fm.description || '',
            type,
            path: path.relative(process.cwd(), path.join(baseDir, entry.name))
          });
        }
      } else if (entry.isFile() && entry.name.endsWith('.md') && entry.name !== 'README.md') {
        // Read frontmatter from .md file directly
        const filePath = path.join(baseDir, entry.name);
        const raw = await fs.readFile(filePath, 'utf8');
        const fm = parseSkillFrontmatter(raw);
        const slug = entry.name.replace(/\.md$/, '');
        results.push({
          slug,
          name: fm.name || slug,
          description: fm.description || '',
          type,
          path: path.relative(process.cwd(), filePath)
        });
      }
    }
  } catch {
    // Directory not readable
  }

  return results;
}

async function runSkillList({ args, options = {}, logger, t }) {
  const targetDir = resolveTargetDir(args);
  const skillsDir = path.join(targetDir, INSTALLED_SKILLS_DIR);
  const showAll = options.all !== undefined;
  const registry = await resolveSkillCatalog(targetDir).catch(() => null);

  const installed = [];

  // Installed skills
  try {
    const entries = await fs.readdir(skillsDir);
    for (const slug of entries) {
      const skillMdPath = path.join(skillsDir, slug, 'SKILL.md');
      if (!(await exists(skillMdPath))) continue;

      const raw = await fs.readFile(skillMdPath, 'utf8');
      const fm = parseSkillFrontmatter(raw);

      let source = 'unknown';
      let meta = null;
      try {
        const metaRaw = await fs.readFile(path.join(skillsDir, slug, '.skill-meta.json'), 'utf8');
        meta = JSON.parse(metaRaw);
        source = meta.source || 'unknown';
      } catch { /* no meta */ }

      const author = meta?.author?.name || meta?.author_name || null;
      const model =
        meta?.generator?.model ||
        meta?.generation?.model ||
        meta?.generated_by_model ||
        null;

      // Read optional extension.yml manifest — additive, does not affect existing behavior
      const extManifest = showAll ? await parseExtensionManifest(path.join(skillsDir, slug)) : null;

      installed.push({
        slug,
        name: fm.name || slug,
        description: fm.description || '',
        source,
        author,
        model,
        manifest: extManifest,
        path: path.relative(targetDir, path.join(skillsDir, slug))
      });
    }
  } catch {
    // Dir may not exist
  }

  // Source skills (design, static, dynamic)
  const sourceBase = path.join(targetDir, '.aioson/skills');
  const designSkills = await scanSourceSkillDir(path.join(sourceBase, 'design'), 'design');
  const staticSkills = await scanSourceSkillDir(path.join(sourceBase, 'static'), 'static');
  const dynamicSkills = await scanSourceSkillDir(path.join(sourceBase, 'dynamic'), 'dynamic');

  // Check active design skill
  let activeDesignSkill = null;
  try {
    const contextPath = path.join(targetDir, '.aioson/context/project.context.md');
    const contextRaw = await fs.readFile(contextPath, 'utf8');
    // `[ \t]*`, never `\s*`: across the newline a bare `design_skill:` read the
    // next line as the skill id and the engine was never marked [active].
    const match = contextRaw.match(/design_skill:[ \t]*(.*)/);
    if (match) activeDesignSkill = match[1].trim().replace(/^["']|["']$/g, '').trim();
  } catch { /* no context */ }
  // A blank field is the engine: the design skill is never a question, and
  // the quotes the context writer emits are not part of the id.
  if (!activeDesignSkill) activeDesignSkill = DESIGN_ENGINE_ID;

  // Output
  if (installed.length > 0) {
    logger.log(`Installed skills (${installed.length}):\n`);
    for (const s of installed) {
      logger.log(`  ${s.slug} (${s.source})`);
      if (s.description) {
        logger.log(`    ${s.description.slice(0, 100)}`);
      }
      if (s.author) logger.log(`    author: ${s.author}`);
      if (s.model) logger.log(`    model: ${s.model}`);
      if (showAll && s.manifest) {
        const ext = s.manifest.extension || {};
        if (ext.version) logger.log(`    version: ${ext.version}`);
        const hooks = s.manifest.hooks;
        if (hooks && typeof hooks === 'object') {
          const hookNames = Object.keys(hooks).filter(h => hooks[h]?.enabled !== 'false' && hooks[h]?.enabled !== false);
          if (hookNames.length > 0) logger.log(`    hooks declared: ${hookNames.join(', ')}`);
        }
      }
      logger.log(`    ${s.path}/SKILL.md`);
      logger.log('');
    }
  } else {
    logger.log('No installed skills.\n');
  }

  // Always show source skills summary
  const allSource = [...designSkills, ...staticSkills, ...dynamicSkills];

  if (designSkills.length > 0) {
    logger.log(`Design skills (${designSkills.length}) — ONE active per project:`);
    for (const s of designSkills) {
      const active = activeDesignSkill === s.slug ? ' [active]' : '';
      logger.log(`  ${s.slug}${active}`);
      if (s.description) logger.log(`    ${s.description.slice(0, 100)}`);
    }
    logger.log('');
  }

  if (staticSkills.length > 0) {
    logger.log(`Static skills (${staticSkills.length}) — eligible when the detected framework matches:`);
    for (const s of staticSkills) {
      logger.log(`  ${s.slug}`);
      if (showAll && s.description) logger.log(`    ${s.description.slice(0, 100)}`);
    }
    logger.log('');
  }

  if (dynamicSkills.length > 0) {
    logger.log(`Dynamic skills (${dynamicSkills.length}) — eligible when task context matches:`);
    for (const s of dynamicSkills) {
      logger.log(`  ${s.slug}`);
      if (showAll && s.description) logger.log(`    ${s.description.slice(0, 100)}`);
    }
    logger.log('');
  }

  const processSkills = registry
    ? registry.catalog.filter((skill) => skill.category === 'process' && skill.registry_declared)
    : [];
  if (showAll && processSkills.length > 0) {
    logger.log(`Process skills (${processSkills.length}) — deterministic registry policy:`);
    for (const skill of processSkills) {
      const replacement = skill.replacement ? ` -> ${skill.replacement}` : '';
      logger.log(`  ${skill.id} [${skill.status}; ${skill.load_tier}]${replacement}`);
    }
    logger.log('');
  }

  if (installed.length === 0 && allSource.length === 0 && processSkills.length === 0) {
    logger.log('Use `aioson skill:install --slug=<name>` to add a skill.');
  } else {
    logger.log('Source skills require a matching agent/task policy; a runtime load is recorded explicitly.');
    logger.log('Use --all for registry policy. Use `aioson skill:audit --reachability --usage` for evidence.');
  }

  return {
    ok: true,
    installed,
    source: { design: designSkills, static: staticSkills, dynamic: dynamicSkills },
    process: processSkills
  };
}

async function runSkillRemove({ args, options = {}, logger, t }) {
  const targetDir = resolveTargetDir(args);
  const slug = options.slug || options.skill;

  if (!slug) {
    logger.error('Usage: aioson skill:remove --slug=<name>');
    return { ok: false, error: 'Missing --slug' };
  }

  const skillDir = path.join(targetDir, INSTALLED_SKILLS_DIR, slug);
  if (!(await exists(skillDir))) {
    logger.error(`Skill "${slug}" not found in .aioson/installed-skills/`);
    return { ok: false, error: 'not_found', slug };
  }

  // Remove from installed-skills
  await fs.rm(skillDir, { recursive: true, force: true });
  logger.log(`  Removed .aioson/installed-skills/${slug}/`);

  // Remove from tool directories
  await removeFromTools(targetDir, slug);
  logger.log(`  Removed from .claude/skills/, .cursor/skills/, .windsurf/skills/`);

  // Update AGENTS.md
  await updateAgentsMdSkills(targetDir);
  logger.log(`  AGENTS.md updated`);

  logger.log(`\nSkill "${slug}" removed.`);
  return { ok: true, slug };
}

module.exports = {
  runSkillInstall,
  runSkillList,
  runSkillRemove
};
