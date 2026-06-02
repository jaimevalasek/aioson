'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const { exists, ensureDir } = require('../utils');

const MY_AGENTS_DIR = '.aioson/my-agents';
const SQUADS_DIR = '.aioson/squads';

const VALID_TYPES = ['agent', 'assistant', 'clone', 'worker'];
const VALID_TIERS = ['0', '1', '2', '3'];
const VALID_MODEL_TIERS = ['powerful', 'balanced', 'fast', 'none'];
const VALID_DISC = [
  'dominant-driver', 'influential-expressive', 'steady-amiable',
  'compliant-analytical', 'dominant-influential', 'influential-steady',
  'steady-compliant', 'compliant-dominant'
];

function resolveTargetDir(args) {
  return path.resolve(process.cwd(), args[0] || '.');
}

function slugify(name) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function resolveExecutorModelTier(type, modelTier) {
  if (type === 'worker') return 'none';
  return modelTier || 'balanced';
}

// ---------------------------------------------------------------------------
// Agent template builder — inspired by AIOX create-agent v3.0 but adapted
// for aioson's markdown-agent ecosystem (Claude Code, Codex, OpenCode).
//
// Levels:
//   0 — Infrastructure (skills, dependencies, file references)
//   1 — Identity (who the agent is)
//   2 — Operational (how the agent works)
//   3 — Voice DNA (how the agent communicates — for assistant/clone types)
//   4 — Quality (how to know the work is good)
//   5 — Integration (hand-offs and synergies)
// ---------------------------------------------------------------------------

function buildAgentTemplate(slug, opts) {
  const {
    mission = '',
    focus = [],
    scope = 'my-agents',
    squadSlug = null,
    squadName = null,
    type = 'agent',
    tier = null,
    disc = null,
    modelTier = null,
    domain = null,
    specialist = null,
    localeScope = 'universal',
    withInfra = false
  } = opts;

  const lines = [];

  // ── Header ──────────────────────────────────────────────────────────────
  lines.push(`# Agent @${slug}`);
  lines.push('');

  const identity = scope === 'squad' && squadSlug
    ? `<!-- identity: squad:${squadSlug}/${slug} | type: ${type}${tier ? ` | tier: ${tier}` : ''}${modelTier ? ` | modelTier: ${modelTier}` : ''} -->`
    : `<!-- identity: my-agent:${slug} | type: ${type}${tier ? ` | tier: ${tier}` : ''}${modelTier ? ` | modelTier: ${modelTier}` : ''} -->`;
  lines.push(identity);
  lines.push('');
  lines.push(`> ⚡ **ACTIVATED** — Execute immediately as @${slug}.`);
  lines.push('');

  // ── Project rules ───────────────────────────────────────────────────────
  if (scope === 'squad' && squadSlug) {
    lines.push(`> **Project rules**: Before starting, check \`.aioson/rules/\` in the project root.`);
    lines.push(`> For each \`.md\` file found: read YAML frontmatter. Load if \`agents:\` is absent (universal),`);
    lines.push(`> or if \`agents:\` includes \`squad:${squadSlug}/${slug}\` or \`squad:${squadSlug}\`. Otherwise skip.`);
  } else {
    lines.push(`> **Project rules**: Before starting, check \`.aioson/rules/\` in the project root.`);
    lines.push(`> For each \`.md\` file found: read YAML frontmatter. Load if \`agents:\` is absent (universal),`);
    lines.push(`> or if \`agents:\` includes \`${slug}\`. Otherwise skip.`);
  }
  lines.push('');

  // ── Level 1: Identity ───────────────────────────────────────────────────
  lines.push('## Mission');
  lines.push(mission || '[Define the agent mission — what problem does this agent solve?]');
  lines.push('');

  if (scope === 'squad' && squadSlug) {
    lines.push('## Quick context');
    lines.push(`Squad: ${squadName || squadSlug} | Agent: @${slug} | Type: ${type}${tier ? ` | Tier: ${tier}` : ''}`);
    lines.push(`Locale scope: ${localeScope}`);
    if (domain) lines.push(`Domain: ${domain}`);
    lines.push('');
  }

  if (specialist) {
    lines.push('## Specialist');
    lines.push(`Based on: **${specialist}**`);
    lines.push('[Add source material: books, articles, talks, methodologies that shaped this agent]');
    lines.push('');
  }

  if (disc) {
    lines.push('## Behavioral profile');
    lines.push(`DISC: ${disc}`);
    lines.push('');
  }

  // ── Level 2: Operational ────────────────────────────────────────────────
  lines.push('## Core principles');
  lines.push('[5-10 fundamental beliefs that guide every decision this agent makes]');
  lines.push('- [Principle 1]');
  lines.push('- [Principle 2]');
  lines.push('- [Principle 3]');
  lines.push('');

  if (focus.length > 0) {
    lines.push('## Focus');
    for (const f of focus) lines.push(`- ${f}`);
  } else {
    lines.push('## Focus');
    lines.push('- [Primary capability or focus area]');
    lines.push('- [Secondary capability]');
  }
  lines.push('');

  lines.push('## Operational framework');
  lines.push('[Step-by-step methodology — the deterministic process this agent follows]');
  lines.push('');
  lines.push('1. **Understand** — Read context, inputs, and constraints');
  lines.push('2. **Analyze** — Identify what is needed and what already exists');
  lines.push('3. **Execute** — Produce the output following the methodology');
  lines.push('4. **Validate** — Check against quality criteria before delivering');
  lines.push('');

  // ── Level 3: Voice DNA (assistant/clone types) ──────────────────────────
  if (type === 'assistant' || type === 'clone') {
    lines.push('## Voice DNA');
    lines.push('');
    lines.push('### Sentence starters');
    lines.push('[How this agent opens responses — categorized by mode]');
    lines.push('- **Explaining:** "[...]", "[...]"');
    lines.push('- **Challenging:** "[...]", "[...]"');
    lines.push('- **Recommending:** "[...]", "[...]"');
    lines.push('');
    lines.push('### Vocabulary');
    lines.push('**Always use:** [8+ domain-specific terms this agent prefers]');
    lines.push('');
    lines.push('**Never use:** [5+ terms this agent avoids]');
    lines.push('');
    lines.push('### Metaphors');
    lines.push('[5+ domain metaphors this agent uses naturally]');
    lines.push('- [Metaphor 1]');
    lines.push('- [Metaphor 2]');
    lines.push('');
    lines.push('### Emotional states');
    lines.push('[How the agent modulates tone based on context]');
    lines.push('- **Teaching:** patient, detailed, with examples');
    lines.push('- **Reviewing:** direct, precise, no filler');
    lines.push('- **Brainstorming:** energetic, expansive, provocative');
    lines.push('');
  }

  // ── Response standard ───────────────────────────────────────────────────
  lines.push('## Response standard');
  if (type === 'worker') {
    lines.push('Execute the task deterministically. No creative deviation. Follow the process exactly.');
  } else if (type === 'clone') {
    lines.push('[Define the delivery format — tone, structure, length, level of detail]');
    lines.push('Write as the specialist would write. Match their cadence, vocabulary, and reasoning style.');
  } else {
    lines.push('[Define the delivery format — tone, structure, length, level of detail]');
  }
  lines.push('');

  // ── Level 4: Quality ────────────────────────────────────────────────────
  lines.push('## Output examples');
  lines.push('[3+ real examples of what good output looks like — input → output pairs]');
  lines.push('');
  lines.push('### Example 1');
  lines.push('**Input:** [description]');
  lines.push('**Output:** [what the agent produces]');
  lines.push('');
  lines.push('### Example 2');
  lines.push('**Input:** [description]');
  lines.push('**Output:** [what the agent produces]');
  lines.push('');
  lines.push('### Example 3');
  lines.push('**Input:** [description]');
  lines.push('**Output:** [what the agent produces]');
  lines.push('');

  lines.push('## Anti-patterns');
  lines.push('');
  lines.push('**Never do:**');
  lines.push('- [Specific mistake this agent must avoid]');
  lines.push('- [Common trap in this domain]');
  lines.push('- [What makes output from this domain feel generic or weak]');
  lines.push('- [Bad habit that would break the agent\'s credibility]');
  lines.push('- [Shortcut that compromises quality]');
  lines.push('');
  lines.push('**Always do:**');
  lines.push('- [Non-negotiable quality behavior]');
  lines.push('- [What distinguishes expert-level output in this domain]');
  lines.push('- [Checkpoint the agent must hit every time]');
  lines.push('- [Structural requirement for every output]');
  lines.push('- [Validation the agent must run before delivering]');
  lines.push('');

  lines.push('## Completion criteria');
  lines.push('[How to know the work is done — measurable, not subjective]');
  lines.push('- [ ] [Criterion 1]');
  lines.push('- [ ] [Criterion 2]');
  lines.push('- [ ] [Criterion 3]');
  lines.push('');

  // ── Hard constraints ────────────────────────────────────────────────────
  lines.push('## Hard constraints');
  if (scope === 'squad' && localeScope && localeScope !== 'universal') {
    lines.push(`- This squad is locale-specific (${localeScope}). Use that locale for prompt examples and user-facing output inside this squad.`);
  } else {
    lines.push('- Use `interaction_language` from project context for all interaction. If it is absent, fall back to `conversation_language`.');
  }
  lines.push('- Do not invent facts or requirements — ask when uncertain');
  if (scope === 'squad' && squadSlug) {
    lines.push(`- Stay within squad scope: ${squadSlug}`);
    lines.push(`- Store outputs in the squad directory unless instructed otherwise`);
  }
  if (type === 'worker') {
    lines.push('- Execute deterministically — no creative interpretation of instructions');
  }
  lines.push('');

  // ── Level 5: Integration ────────────────────────────────────────────────
  lines.push('## Output contract');
  lines.push('[Define what artifacts this agent produces and where they go]');
  lines.push('');
  if (scope === 'squad' && squadSlug) {
    lines.push(`| Artifact | Location | Format |`);
    lines.push(`|----------|----------|--------|`);
    lines.push(`| [Primary output] | \`.aioson/squads/${squadSlug}/[path]\` | [format] |`);
  } else {
    lines.push('| Artifact | Location | Format |');
    lines.push('|----------|----------|--------|');
    lines.push('| [Primary output] | [path] | [format] |');
  }
  lines.push('');

  lines.push('## Hand-off');
  lines.push('[When this agent finishes, who should run next and with what context?]');
  lines.push('');
  lines.push('| Condition | Next agent | Context to pass |');
  lines.push('|-----------|------------|-----------------|');
  lines.push('| [When X is complete] | [@next-agent] | [What they need to know] |');
  lines.push('| [When review is needed] | [@reviewer or human] | [What to review] |');
  lines.push('');

  // ── Level 0: Infrastructure (at the end for easy editing) ───────────────
  if (withInfra && scope === 'squad' && squadSlug) {
    lines.push('## Dependencies');
    lines.push('');
    lines.push('```yaml');
    lines.push('skills: []');
    lines.push('tasks:');
    lines.push(`  - .aioson/squads/${squadSlug}/tasks/${slug}-main-workflow.md`);
    lines.push('templates:');
    lines.push(`  - .aioson/squads/${squadSlug}/templates/${slug}-output-tmpl.md`);
    lines.push('checklists:');
    lines.push(`  - .aioson/squads/${squadSlug}/checklists/${slug}-quality-gate.md`);
    lines.push('```');
    lines.push('');
  }

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Operational infrastructure stubs — tasks, templates, checklists
// ---------------------------------------------------------------------------

function buildTaskStub(slug, squadSlug) {
  return `# Task: ${slug} main workflow

**Task ID:** ${slug}-main
**Version:** 1.0
**Purpose:** [What this task accomplishes]
**Agent:** @${slug}
**Mode:** Sequential

## Inputs

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| [input_1] | string | Yes | [What this input is] |

## Steps

### Step 1: Understand context
**Action:** Read inputs and identify constraints
**Output:** [What this step produces]

### Step 2: Execute
**Action:** [The core work]
**Output:** [What this step produces]

### Step 3: Validate
**Action:** Run against completion criteria
**Output:** Validated deliverable

## Veto conditions
- [ ] [Condition that blocks completion] → STOP and report
- [ ] [Quality threshold not met] → Return to Step 2

## Completion criteria
- [ ] [Criterion 1]
- [ ] [Criterion 2]
`;
}

function buildTemplateStub(slug) {
  return `# Template: ${slug} output

**Version:** 1.0

## {Title}

**Date:** {date}
**Agent:** @${slug}

### Summary
{1-3 sentence executive summary}

### Content
{Main structured output}

### Recommendations
{Actionable next steps}
`;
}

function buildChecklistStub(slug) {
  return `# Quality gate: @${slug}

**Version:** 1.0

## Blocking (all must pass)
- [ ] Output follows the defined template structure
- [ ] No invented facts — all claims are traceable to input or research
- [ ] Completion criteria from the agent definition are satisfied

## Recommended (80%+ should pass)
- [ ] Output is concise — no filler or repetition
- [ ] Domain-specific vocabulary is used correctly
- [ ] Hand-off context is clear for the next agent
- [ ] Anti-patterns from the agent definition are avoided

## Approval
- 100% blocking + 80% recommended = **PASS**
- Any blocking failure = **VETO** — fix before delivering
`;
}

// ---------------------------------------------------------------------------
// Registration helpers
// ---------------------------------------------------------------------------

async function listSquads(projectDir) {
  const squadsDir = path.join(projectDir, SQUADS_DIR);
  if (!(await exists(squadsDir))) return [];

  const entries = await fs.readdir(squadsDir, { withFileTypes: true });
  const squads = [];
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name.startsWith('.')) continue;
    const manifestPath = path.join(squadsDir, entry.name, 'squad.manifest.json');
    if (await exists(manifestPath)) {
      try {
        const raw = await fs.readFile(manifestPath, 'utf8');
        const manifest = JSON.parse(raw);
        squads.push({ slug: entry.name, name: manifest.name || entry.name });
      } catch {
        squads.push({ slug: entry.name, name: entry.name });
      }
    }
  }
  return squads;
}

async function registerInClaudeMd(projectDir, slug, agentPath, scope) {
  const claudeMdPath = path.join(projectDir, 'CLAUDE.md');
  if (!(await exists(claudeMdPath))) return false;

  let content = await fs.readFile(claudeMdPath, 'utf8');

  if (scope === 'my-agents') {
    const sectionHeader = '## My agents';
    const entry = `- /${slug} -> \`${agentPath}\``;

    if (content.includes(sectionHeader)) {
      if (content.includes(entry)) return false;
      content = content.replace(sectionHeader, `${sectionHeader}\n${entry}`);
    } else {
      const agentsSection = content.indexOf('## Agents');
      if (agentsSection !== -1) {
        const nextSection = content.indexOf('\n## ', agentsSection + 1);
        const insertAt = nextSection !== -1 ? nextSection : content.length;
        const block = `\n${sectionHeader}\n${entry}\n`;
        content = content.slice(0, insertAt) + block + content.slice(insertAt);
      } else {
        content += `\n${sectionHeader}\n${entry}\n`;
      }
    }
  } else {
    const entry = `- /${slug} -> \`${agentPath}\``;
    if (content.includes(entry)) return false;
    content += `\n${entry}\n`;
  }

  await fs.writeFile(claudeMdPath, content, 'utf8');
  return true;
}

async function registerInAgentsMd(projectDir, slug, agentPath, scope) {
  const agentsMdPath = path.join(projectDir, 'AGENTS.md');
  if (!(await exists(agentsMdPath))) return false;

  let content = await fs.readFile(agentsMdPath, 'utf8');

  if (scope === 'my-agents') {
    const sectionHeader = '## My agents';
    const entry = `- @${slug} → \`${agentPath}\``;

    if (content.includes(sectionHeader)) {
      if (content.includes(`@${slug}`)) return false;
      content = content.replace(sectionHeader, `${sectionHeader}\n${entry}`);
    } else {
      const agentFilesSection = content.indexOf('## Agent files');
      if (agentFilesSection !== -1) {
        const nextSection = content.indexOf('\n## ', agentFilesSection + 1);
        const insertAt = nextSection !== -1 ? nextSection : content.length;
        const block = `\n${sectionHeader}\n${entry}\n`;
        content = content.slice(0, insertAt) + block + content.slice(insertAt);
      } else {
        content += `\n${sectionHeader}\n${entry}\n`;
      }
    }
  } else {
    const entry = `- @${slug} → \`${agentPath}\``;
    if (content.includes(`@${slug}`)) return false;
    content += `\n${entry}\n`;
  }

  await fs.writeFile(agentsMdPath, content, 'utf8');
  return true;
}

// ---------------------------------------------------------------------------
// Main command
// ---------------------------------------------------------------------------

async function runSquadAgentCreate({ args = [], options = {}, logger = console, t } = {}) {
  const projectDir = resolveTargetDir(args);
  const name = options.name || args[1];
  const scope = options.scope || null;
  const squadSlug = options.squad || null;
  const mission = options.mission || null;
  const focus = options.focus ? options.focus.split(',').map(f => f.trim()) : [];
  const type = options.type || 'agent';
  const tier = options.tier || null;
  const disc = options.disc || null;
  const modelTier = options['model-tier'] || options.modelTier || null;
  const behavioralProfile = options['behavioral-profile'] || options.behavioralProfile || disc || null;
  const domain = options.domain || null;
  const specialist = options.specialist || null;
  const withInfra = !!options['with-infra'];
  const dryRun = !!options['dry-run'];

  // Validate name
  if (!name) {
    const msg = t ? t('cli.squad_agent_create.no_name') : 'Usage: aioson squad:agent-create [path] --name=<agent-name> [--scope=my-agents|squad] [--squad=<slug>] [--type=agent|assistant|clone|worker]';
    logger.error(msg);
    return { ok: false, error: 'no_name' };
  }

  const slug = slugify(name);

  // Validate type
  if (!VALID_TYPES.includes(type)) {
    const msg = t ? t('cli.squad_agent_create.invalid_type', { type }) : `Invalid type: "${type}". Use: ${VALID_TYPES.join(', ')}`;
    logger.error(msg);
    return { ok: false, error: 'invalid_type' };
  }

  // Validate tier
  if (tier && !VALID_TIERS.includes(tier)) {
    const msg = t ? t('cli.squad_agent_create.invalid_tier', { tier }) : `Invalid tier: "${tier}". Use: 0 (foundation), 1 (master), 2 (systematizer), 3 (specialist)`;
    logger.error(msg);
    return { ok: false, error: 'invalid_tier' };
  }

  // Validate DISC
  if (disc && !VALID_DISC.includes(disc)) {
    const msg = t ? t('cli.squad_agent_create.invalid_disc', { disc }) : `Invalid DISC profile: "${disc}". Valid: ${VALID_DISC.join(', ')}`;
    logger.error(msg);
    return { ok: false, error: 'invalid_disc' };
  }

  if (behavioralProfile && !VALID_DISC.includes(behavioralProfile)) {
    const msg = `Invalid behavioral profile: "${behavioralProfile}". Valid: ${VALID_DISC.join(', ')}`;
    logger.error(msg);
    return { ok: false, error: 'invalid_behavioral_profile' };
  }

  if (modelTier && !VALID_MODEL_TIERS.includes(modelTier)) {
    const msg = `Invalid model tier: "${modelTier}". Use: ${VALID_MODEL_TIERS.join(', ')}`;
    logger.error(msg);
    return { ok: false, error: 'invalid_model_tier' };
  }

  // Determine scope
  let resolvedScope = scope;
  if (!resolvedScope) {
    resolvedScope = squadSlug ? 'squad' : 'my-agents';
  }

  if (resolvedScope !== 'my-agents' && resolvedScope !== 'squad') {
    const msg = t ? t('cli.squad_agent_create.invalid_scope', { scope: resolvedScope }) : `Invalid scope: "${resolvedScope}". Use "my-agents" or "squad".`;
    logger.error(msg);
    return { ok: false, error: 'invalid_scope' };
  }

  // If scope=squad, validate squad exists
  let squadName = null;
  let squadManifest = null;
  let localeScope = 'universal';
  if (resolvedScope === 'squad') {
    if (!squadSlug) {
      const squads = await listSquads(projectDir);
      if (squads.length === 0) {
        const msg = t ? t('cli.squad_agent_create.no_squads') : 'No squads found. Create a squad first with @squad or provide --squad=<slug>.';
        logger.error(msg);
        return { ok: false, error: 'no_squads' };
      }
      const msg = t ? t('cli.squad_agent_create.squad_required') : `--squad=<slug> required. Available squads: ${squads.map(s => s.slug).join(', ')}`;
      logger.error(msg);
      return { ok: false, error: 'squad_required', squads: squads.map(s => s.slug) };
    }

    const squadDir = path.join(projectDir, SQUADS_DIR, squadSlug);
    if (!(await exists(squadDir))) {
      const msg = t ? t('cli.squad_agent_create.squad_not_found', { squad: squadSlug }) : `Squad "${squadSlug}" not found at ${squadDir}`;
      logger.error(msg);
      return { ok: false, error: 'squad_not_found' };
    }

    const manifestPath = path.join(squadDir, 'squad.manifest.json');
    if (await exists(manifestPath)) {
      try {
        const raw = await fs.readFile(manifestPath, 'utf8');
        squadManifest = JSON.parse(raw);
        squadName = squadManifest.name || squadSlug;
        localeScope = squadManifest.locale_scope || 'universal';
      } catch { squadName = squadSlug; }
    } else {
      squadName = squadSlug;
    }
  }

  // Determine output paths
  let agentRelPath;
  let agentAbsPath;
  if (resolvedScope === 'my-agents') {
    agentRelPath = `${MY_AGENTS_DIR}/${slug}.md`;
    agentAbsPath = path.join(projectDir, agentRelPath);
  } else {
    agentRelPath = `${SQUADS_DIR}/${squadSlug}/agents/${slug}.md`;
    agentAbsPath = path.join(projectDir, agentRelPath);
  }

  // Check if already exists
  if (await exists(agentAbsPath)) {
    const msg = t ? t('cli.squad_agent_create.already_exists', { path: agentRelPath }) : `Agent already exists: ${agentRelPath}`;
    logger.error(msg);
    return { ok: false, error: 'already_exists', path: agentRelPath };
  }

  // Build agent template
  const content = buildAgentTemplate(slug, {
    mission, focus, scope: resolvedScope,
    squadSlug, squadName, type, tier, disc, modelTier: resolveExecutorModelTier(type, modelTier), domain, specialist,
    localeScope,
    withInfra
  });

  if (dryRun) {
    logger.log('');
    logger.log(`[dry-run] Would create: ${agentRelPath}`);
    logger.log(`[dry-run] Scope: ${resolvedScope} | Type: ${type}${tier ? ` | Tier: ${tier}` : ''}`);
    if (resolvedScope === 'squad') logger.log(`[dry-run] Squad: ${squadSlug}`);
    if (resolvedScope === 'squad') logger.log(`[dry-run] Locale scope: ${localeScope}`);
    if (withInfra) logger.log('[dry-run] Would generate operational infrastructure stubs');
    logger.log('');
    logger.log(content);
    return { ok: true, dryRun: true, path: agentRelPath, scope: resolvedScope, slug, type };
  }

  // Write agent file
  await ensureDir(path.dirname(agentAbsPath));
  await fs.writeFile(agentAbsPath, content, 'utf8');

  // Generate operational infrastructure stubs (squad scope + --with-infra)
  const infraFiles = [];
  if (withInfra && resolvedScope === 'squad') {
    const tasksDir = path.join(projectDir, SQUADS_DIR, squadSlug, 'tasks');
    const templatesDir = path.join(projectDir, SQUADS_DIR, squadSlug, 'templates');
    const checklistsDir = path.join(projectDir, SQUADS_DIR, squadSlug, 'checklists');

    const taskPath = path.join(tasksDir, `${slug}-main-workflow.md`);
    const templatePath = path.join(templatesDir, `${slug}-output-tmpl.md`);
    const checklistPath = path.join(checklistsDir, `${slug}-quality-gate.md`);

    await ensureDir(tasksDir);
    await ensureDir(templatesDir);
    await ensureDir(checklistsDir);

    if (!(await exists(taskPath))) {
      await fs.writeFile(taskPath, buildTaskStub(slug, squadSlug), 'utf8');
      infraFiles.push(`tasks/${slug}-main-workflow.md`);
    }
    if (!(await exists(templatePath))) {
      await fs.writeFile(templatePath, buildTemplateStub(slug), 'utf8');
      infraFiles.push(`templates/${slug}-output-tmpl.md`);
    }
    if (!(await exists(checklistPath))) {
      await fs.writeFile(checklistPath, buildChecklistStub(slug), 'utf8');
      infraFiles.push(`checklists/${slug}-quality-gate.md`);
    }
  }

  // Register in CLAUDE.md and AGENTS.md
  const registeredClaude = await registerInClaudeMd(projectDir, slug, agentRelPath, resolvedScope);
  const registeredAgents = await registerInAgentsMd(projectDir, slug, agentRelPath, resolvedScope);

  // Update squad manifest if scope=squad
  let manifestUpdated = false;
  if (resolvedScope === 'squad') {
    const manifestPath = path.join(projectDir, SQUADS_DIR, squadSlug, 'squad.manifest.json');
    if (await exists(manifestPath)) {
      try {
        const manifest = squadManifest || JSON.parse(await fs.readFile(manifestPath, 'utf8'));
        if (!Array.isArray(manifest.executors)) manifest.executors = [];

        const alreadyExists = manifest.executors.some(e => e.slug === slug);
        if (!alreadyExists) {
          const resolvedModelTier = resolveExecutorModelTier(type, modelTier);
          manifest.executors.push({
            slug,
            title: name,
            type,
            role: mission || slug,
            file: agentRelPath,
            usesLLM: type !== 'worker',
            deterministic: type === 'worker',
            modelTier: resolvedModelTier,
            behavioralProfile: behavioralProfile || undefined,
            domain: domain || undefined,
            tier: tier ? Number(tier) : undefined,
            disc: disc || undefined,
            skills: [],
            genomes: []
          });
          await fs.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
          manifestUpdated = true;
        }
      } catch { /* manifest parse error — skip */ }
    }
  }

  // Output
  logger.log('');
  logger.log(`  Agent created: ${agentRelPath}`);
  logger.log(`  Scope: ${resolvedScope === 'my-agents' ? 'my-agents (versioned, available globally)' : `squad:${squadSlug}`}`);
  logger.log(`  Type: ${type}${tier ? ` | Tier: ${tier}` : ''}${disc ? ` | DISC: ${disc}` : ''}`);
  if (resolvedScope === 'squad') logger.log(`  Locale scope: ${localeScope}`);
  if (modelTier || type === 'worker') logger.log(`  Model tier: ${resolveExecutorModelTier(type, modelTier)}`);
  logger.log(`  Slug: @${slug}`);
  if (registeredClaude) logger.log('  Registered in CLAUDE.md');
  if (registeredAgents) logger.log('  Registered in AGENTS.md');
  if (manifestUpdated) logger.log(`  Added to squad manifest: ${squadSlug}`);
  if (infraFiles.length > 0) {
    logger.log(`  Infrastructure stubs: ${infraFiles.join(', ')}`);
  }
  logger.log('');

  // Maturity assessment
  const maturity = assessMaturity(content, infraFiles.length > 0);
  logger.log(`  Maturity: Level ${maturity.level} — ${maturity.label} (${maturity.score}/10)`);
  logger.log(`  ${maturity.hint}`);
  logger.log('');

  logger.log('  Next steps:');
  logger.log(`  1. Fill in [bracketed placeholders] in ${agentRelPath}`);
  logger.log('  2. Add real output examples (input → output pairs)');
  logger.log('  3. Define anti-patterns specific to this agent\'s domain');
  if (type === 'assistant' || type === 'clone') {
    logger.log('  4. Complete the Voice DNA section with real vocabulary and sentence starters');
  }
  logger.log(`  ${type === 'assistant' || type === 'clone' ? '5' : '4'}. Invoke with @${slug} in your AI session`);
  if (resolvedScope === 'my-agents') {
    logger.log(`  ${type === 'assistant' || type === 'clone' ? '6' : '5'}. This agent is versioned with the project — commit to share with the team`);
  }
  logger.log('');

  return {
    ok: true,
    path: agentRelPath,
    scope: resolvedScope,
    slug,
    type,
    tier: tier ? Number(tier) : null,
    disc,
    modelTier: resolveExecutorModelTier(type, modelTier),
    behavioralProfile,
    squad: squadSlug,
    registeredClaude,
    registeredAgents,
    manifestUpdated,
    infraFiles,
    maturity
  };
}

// ---------------------------------------------------------------------------
// Maturity scoring — adapted from AIOX maturity levels
// ---------------------------------------------------------------------------

function assessMaturity(content, hasInfra) {
  let score = 0;
  const checks = [];

  // Identity (1.0)
  if (content.includes('## Mission') && !content.includes('[Define the agent mission')) {
    score += 1.0; checks.push('identity');
  }

  // Core principles (1.0)
  if (content.includes('## Core principles') && !content.includes('[5-10 fundamental')) {
    score += 1.0; checks.push('principles');
  }

  // Operational framework (1.0)
  if (content.includes('## Operational framework')) {
    score += 0.5; checks.push('framework-stub');
    if (!content.includes('[Step-by-step methodology')) {
      score += 0.5; checks.push('framework-filled');
    }
  }

  // Voice DNA (1.5 — for types that have it)
  if (content.includes('## Voice DNA')) {
    score += 0.5; checks.push('voice-stub');
    if (!content.includes('[How this agent opens')) {
      score += 1.0; checks.push('voice-filled');
    }
  } else {
    // Types without voice DNA get the points automatically
    score += 1.5; checks.push('voice-na');
  }

  // Output examples (1.5)
  if (content.includes('## Output examples')) {
    score += 0.5; checks.push('examples-stub');
    const exampleBlocks = (content.match(/\*\*Input:\*\*/g) || []).length;
    if (exampleBlocks >= 3) {
      score += 1.0; checks.push('examples-filled');
    }
  }

  // Anti-patterns (1.0)
  if (content.includes('## Anti-patterns')) {
    score += 0.5; checks.push('anti-stub');
    if (!content.includes('[Specific mistake')) {
      score += 0.5; checks.push('anti-filled');
    }
  }

  // Completion criteria (0.5)
  if (content.includes('## Completion criteria') && !content.includes('[Criterion 1]')) {
    score += 0.5; checks.push('criteria');
  }

  // Hand-off (0.5)
  if (content.includes('## Hand-off') && !content.includes('[@next-agent]')) {
    score += 0.5; checks.push('handoff');
  }

  // Infrastructure (1.5)
  if (hasInfra) {
    score += 1.5; checks.push('infra');
  }

  score = Math.min(10, Math.round(score * 10) / 10);

  let level, label, hint;
  if (score < 4) {
    level = 1; label = 'Persona only (scaffold)';
    hint = 'Fill in mission, principles, examples, and anti-patterns to reach Level 2.';
  } else if (score < 7) {
    level = 2; label = 'Functional (needs enrichment)';
    hint = 'Add real output examples and domain-specific anti-patterns to reach Level 3.';
  } else if (score < 9) {
    level = 3; label = 'Operational (deterministic)';
    hint = 'Agent is ready for use. Consider adding --with-infra for full operational files.';
  } else {
    level = 3; label = 'Production-ready';
    hint = 'Agent is complete with operational infrastructure. Ready for production.';
  }

  return { score, level, label, hint, checks };
}

module.exports = { runSquadAgentCreate };
