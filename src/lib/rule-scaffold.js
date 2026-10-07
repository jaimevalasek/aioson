'use strict';

/**
 * Scaffolds project-authored knowledge: a rule under `.aioson/rules/` (law the
 * agents obey) or a doc under `.aioson/docs/` (a procedure — the intelligence
 * an agent consults when the task calls for it).
 *
 * Both are the sanctioned extension point: `context:select`/`context:brief`
 * score them by `agents`, `paths`, `triggers`, `task_types`, `aliases`,
 * `priority`, and `load_tier`, so a well-formed file reaches every agent that
 * touches matching work without adding an agent or a hop. Hand-authored
 * frontmatter is where that routing usually breaks, so this command owns the
 * shape and the project owns the content.
 */

const fs = require('node:fs/promises');
const path = require('node:path');

const KEBAB = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

// Framework rules occupy the 5–10 band. A project rule defaults above it: when a
// client encodes their own design system or convention, it should outrank the
// framework's generic guidance rather than tie with it.
const DEFAULT_PRIORITY = 50;
const DEFAULT_MODES = ['planning', 'executing'];
const DEFAULT_LOAD_TIER = 'trigger';
const LOAD_TIERS = new Set(['always', 'trigger']);

function splitList(value) {
  if (Array.isArray(value)) return value.map((v) => String(v).trim()).filter(Boolean);
  return String(value || '')
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean);
}

// Quote only what YAML actually needs quoted inside a flow list: a leading
// indicator character, or a structural character anywhere. `src/**` and
// `refiner` stay bare, matching the shipped rules.
function yamlList(values) {
  const needsQuote = (v) => /^[-?:,[\]{}#&*!|>'"%@`]/.test(v) || /[:,[\]{}#]/.test(v);
  return `[${values.map((v) => (needsQuote(v) ? `"${v}"` : v)).join(', ')}]`;
}

function titleize(slug) {
  return slug.replace(/-/g, ' ').replace(/^./, (c) => c.toUpperCase());
}

function scopeLine(agents, pathPatterns) {
  return `${agents.length ? agents.map((a) => `\`@${a}\``).join(', ') : 'every agent'}${pathPatterns.length ? ` on ${pathPatterns.map((p) => `\`${p}\``).join(', ')}` : ''}`;
}

function ruleBody(name, { description, agents, paths: pathPatterns }) {
  return `# ${titleize(name)}

${description}

## Precedence

This is a project rule. It outranks framework defaults, design-skill guidance, and \`.aioson/brains/\` nodes for the work it matches. When this rule and a brain node disagree, follow this rule and say so; do not silently apply the generic pattern instead.

## Scope

Applies to ${scopeLine(agents, pathPatterns)}.

## Rules

- Replace this list with the concrete, checkable statements this rule enforces.
- Write each one so an agent can tell whether it was followed, not as a preference.
- State the exception explicitly when one exists; an unqualified rule gets applied where it should not.

## Out of scope

- Name what this rule deliberately does not govern, so it is not stretched into unrelated work.
`;
}

function docBody(name, { description, agents, paths: pathPatterns }) {
  return `# ${titleize(name)}

${description}

## When to consult

Consulted by ${scopeLine(agents, pathPatterns)}.

- Name the decision or the moment this procedure answers, in the words an agent uses for the task.

## Procedure

1. Replace these steps with the project's concrete procedure.
2. Point to the existing code, contract, or integration to reuse before anything new is created.

## Expected evidence

- What the agent shows to prove the procedure was followed: a path, a test, a command output.
`;
}

const KINDS = {
  rule: { root: ['.aioson', 'rules'], priority: true, body: ruleBody },
  doc: { root: ['.aioson', 'docs'], priority: false, body: docBody }
};

function quotedScalar(text) {
  return text.includes(':') ? `"${text.replace(/"/g, '\\"')}"` : text;
}

async function pathExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

// Where the file goes. A doc may live in a topic folder (`--folder=dev`); the
// folder groups files for people, routing still comes from the frontmatter.
function targetOf(kind, name, options) {
  const folder = kind === 'doc' ? String(options.folder || '').trim().replace(/\\/g, '/').replace(/^\/+|\/+$/g, '') : '';
  if (folder && !folder.split('/').every((segment) => KEBAB.test(segment))) {
    return { error: { ok: false, reason: 'invalid_folder', name, folder } };
  }
  return { relPath: path.posix.join(...KINDS[kind].root, ...(folder ? folder.split('/') : []), `${name}.md`) };
}

// The frontmatter values, validated, or the refusal that names the bad one.
function frontmatterOf(kind, name, options) {
  const loadTier = String(options['load-tier'] || options.loadTier || DEFAULT_LOAD_TIER).trim();
  if (!LOAD_TIERS.has(loadTier)) return { error: { ok: false, reason: 'invalid_load_tier', name, load_tier: loadTier } };
  const priorityInput = options.priority === undefined ? DEFAULT_PRIORITY : Number(options.priority);
  if (KINDS[kind].priority && (!Number.isFinite(priorityInput) || priorityInput < 0 || priorityInput > 100)) {
    return { error: { ok: false, reason: 'invalid_priority', name, priority: options.priority } };
  }
  const label = kind === 'rule' ? 'Project rule' : 'Project procedure';
  const modes = splitList(options.modes);
  return {
    frontmatter: {
      name,
      description: String(options.description || '').trim()
        || `${label}: ${titleize(name)}. Replace this description with what it ${kind === 'rule' ? 'enforces' : 'guides'} and why.`,
      ...(KINDS[kind].priority ? { priority: Math.trunc(priorityInput) } : {}),
      agents: splitList(options.agents),
      modes: modes.length ? modes : DEFAULT_MODES,
      task_types: splitList(options['task-types'] || options.taskTypes),
      load_tier: loadTier,
      triggers: splitList(options.triggers),
      aliases: splitList(options.aliases),
      paths: splitList(options.paths)
    }
  };
}

function renderFrontmatter(fm) {
  const lines = ['---', `name: ${fm.name}`, `description: ${quotedScalar(fm.description)}`];
  if (fm.priority !== undefined) lines.push(`priority: ${fm.priority}`, 'version: 1.0.0');
  if (fm.agents.length) lines.push(`agents: ${yamlList(fm.agents)}`);
  lines.push(`modes: ${yamlList(fm.modes)}`);
  if (fm.task_types.length) lines.push(`task_types: ${yamlList(fm.task_types)}`);
  lines.push(`load_tier: ${fm.load_tier}`);
  if (fm.triggers.length) lines.push(`triggers: ${yamlList(fm.triggers)}`);
  if (fm.aliases.length) lines.push(`aliases: ${yamlList(fm.aliases)}`);
  if (fm.paths.length) lines.push(`paths: ${yamlList(fm.paths)}`);
  lines.push('---', '');
  return lines.join('\n');
}

/**
 * @param {string} projectDir
 * @param {object} options CLI options (name, description, agents, triggers,
 *   task-types, aliases, paths, modes, priority, load-tier, folder, force)
 * @param {'rule'|'doc'} kind
 * @param {{ body?: (name: string, frontmatter: object) => string }} [overrides]
 *   programmatic callers (decide) supply their own body; never a CLI flag
 * @returns {Promise<{ok: boolean, reason?: string, kind?: string, path?: string,
 *   name?: string, frontmatter?: object, overwritten?: boolean, warnings?: string[]}>}
 */
async function scaffoldKnowledge(projectDir, options = {}, kind = 'rule', overrides = {}) {
  const name = String(options.name || '').trim().toLowerCase();
  if (!name) return { ok: false, reason: 'name_required' };
  if (!KEBAB.test(name)) return { ok: false, reason: 'invalid_name', name };
  const target = targetOf(kind, name, options);
  if (target.error) return target.error;
  if (!(await pathExists(path.join(projectDir, '.aioson')))) return { ok: false, reason: 'not_an_aioson_project' };

  const filePath = path.join(projectDir, ...target.relPath.split('/'));
  const exists = await pathExists(filePath);
  // A file already on disk is project-authored content. Never clobber it silently.
  if (exists && !options.force) return { ok: false, reason: 'already_exists', name, path: target.relPath };

  const built = frontmatterOf(kind, name, options);
  if (built.error) return built.error;
  const fm = built.frontmatter;
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const body = typeof overrides.body === 'function' ? overrides.body(name, fm) : KINDS[kind].body(name, fm);
  await fs.writeFile(filePath, `${renderFrontmatter(fm)}\n${body}`, 'utf8');

  // Without at least one routing dimension the file only loads on load_tier: always.
  const routed = [fm.agents, fm.triggers, fm.task_types, fm.aliases, fm.paths].some((list) => list.length > 0);
  const warnings = !routed && fm.load_tier !== 'always' ? ['no_routing_dimension'] : [];
  return { ok: true, kind, name, path: target.relPath, overwritten: exists, warnings, frontmatter: fm };
}

function scaffoldRule(projectDir, options = {}) {
  return scaffoldKnowledge(projectDir, options, 'rule');
}

function scaffoldDoc(projectDir, options = {}) {
  return scaffoldKnowledge(projectDir, options, 'doc');
}

module.exports = {
  DEFAULT_PRIORITY,
  DEFAULT_LOAD_TIER,
  scaffoldKnowledge,
  scaffoldRule,
  scaffoldDoc
};
