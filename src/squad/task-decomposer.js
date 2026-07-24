'use strict';

/**
 * Squad task decomposer — autonomous goal → execution plan
 *
 * Given a high-level goal, the decomposer:
 *   1. Reads the squad manifest to discover available executors and their roles
 *   2. Breaks the goal into sub-tasks with acceptance criteria
 *   3. Maps each task to the most suitable executor
 *   4. Detects dependencies between tasks (sequential vs parallel)
 *   5. Returns a prioritized execution plan
 *
 * Two decomposition modes:
 *   heuristic (default) — regex + keyword matching, zero LLM calls, instant
 *   structured          — uses a structured prompt template saved to disk
 *                         for the agent to fill in (LLM completes it on activation)
 *
 * The execution plan is saved to:
 *   .aioson/squads/{slug}/sessions/{sessionId}/plan.json
 *
 * Format:
 *   {
 *     id, session_id, squad_slug, goal, created_at,
 *     decomposition_mode,
 *     tasks: [{ id, title, description, acceptance_criteria, executor, dependencies,
 *               priority, parallel_group, status }],
 *     execution_order: [...],   // topological order
 *     parallel_groups: { N: [...taskIds] }
 *   }
 */

const fs = require('node:fs/promises');
const path = require('node:path');
const { randomUUID } = require('node:crypto');

// ─── Squad manifest loading ───────────────────────────────────────────────────

async function loadSquadManifest(projectDir, squadSlug) {
  const squadDir = path.join(projectDir, '.aioson', 'squads', squadSlug);

  // Try squad.manifest.json first (canonical), fall back to squad.json (legacy)
  let squadJson = null;
  let manifestSource = null;
  for (const fileName of ['squad.manifest.json', 'squad.json']) {
    try {
      squadJson = JSON.parse(
        await fs.readFile(path.join(squadDir, fileName), 'utf8')
      );
      manifestSource = fileName;
      break;
    } catch { /* try next */ }
  }

  // Discover executor agent files from correct path
  const agentsDir = path.join(projectDir, '.aioson', 'squads', squadSlug, 'agents');
  let executorFiles = [];
  try {
    const entries = await fs.readdir(agentsDir, { withFileTypes: true });
    executorFiles = entries
      .filter((e) => e.isFile() && e.name.endsWith('.md') && e.name !== 'agents.md')
      .map((e) => e.name.replace(/\.md$/, ''));
  } catch { /* agents dir optional */ }

  // Build executor list from manifest + discovered files
  const executors = buildExecutorList(squadJson, executorFiles);

  const discoverySource = manifestSource
    ? `manifest (${manifestSource}, ${executors.length} executor(s))`
    : `heuristic (${executorFiles.length} agent file(s) discovered)`;

  return { squadJson, executors, discoverySource };
}

function buildExecutorList(squadJson, discoveredFiles) {
  const execMap = {};

  // From manifest: supports both array format (squad.manifest.json) and object format (legacy squad.json)
  if (squadJson && squadJson.executors) {
    const executorEntries = Array.isArray(squadJson.executors)
      ? squadJson.executors.map((e) => [e.slug, e])
      : Object.entries(squadJson.executors);

    for (const [slug, config] of executorEntries) {
      if (!slug) continue;
      execMap[slug] = {
        slug,
        name: config.name || config.title || slug,
        role: config.role || slug,
        type: config.type || 'agent',
        persistent: config.persistent !== false,
        contribution: config.contribution || null,
        decisionRights: config.decisionRights || config.decision_rights || [],
        expertise: config.expertise || {},
        skills: config.skills || [],
        keywords: extractKeywords(
          config.role || '',
          config.name || config.title || '',
          config.skills || [],
          config.expertise || {}
        )
      };
    }
  }

  // From discovered agent files (if not already in map)
  for (const slug of discoveredFiles) {
    if (!execMap[slug]) {
      execMap[slug] = {
        slug,
        name: slug,
        role: slug,
        type: 'agent',
        persistent: true,
        contribution: null,
        decisionRights: [],
        expertise: {},
        skills: [],
        keywords: extractKeywords(slug)
      };
    }
  }

  return Object.values(execMap);
}

function extractKeywords(...sources) {
  const text = JSON.stringify(sources.flat()).toLowerCase();
  return text.split(/[\s,;_-]+/).filter((w) => w.length > 3);
}

// ─── Heuristic decomposition ─────────────────────────────────────────────────

// Action verb patterns → task type mapping
const ACTION_VERBS = {
  research:   ['research', 'investigate', 'analyze', 'study', 'explore', 'discover', 'find', 'pesquisar', 'investigar', 'analisar', 'estudar', 'explorar', 'descobrir', 'encontrar'],
  write:      ['write', 'create', 'draft', 'compose', 'produce', 'generate', 'craft', 'escrever', 'criar', 'redigir', 'compor', 'produzir', 'gerar'],
  review:     ['review', 'critique', 'evaluate', 'assess', 'check', 'validate', 'verify', 'revisar', 'criticar', 'avaliar', 'conferir', 'validar', 'verificar'],
  design:     ['design', 'plan', 'structure', 'outline', 'architect', 'map', 'projetar', 'planejar', 'estruturar', 'arquitetar', 'mapear'],
  publish:    ['publish', 'post', 'distribute', 'share', 'deliver', 'send', 'output', 'publicar', 'distribuir', 'compartilhar', 'entregar', 'enviar'],
  summarize:  ['summarize', 'consolidate', 'compile', 'aggregate', 'collect', 'resumir', 'consolidar', 'compilar', 'agregar', 'coletar'],
  translate:  ['translate', 'adapt', 'localize', 'convert', 'rewrite', 'traduzir', 'adaptar', 'localizar', 'converter', 'reescrever'],
  optimize:   ['optimize', 'improve', 'refine', 'enhance', 'edit', 'revise', 'otimizar', 'melhorar', 'refinar', 'aprimorar', 'editar']
};

const EXECUTOR_ROLE_MAP = {
  research:  ['researcher', 'analyst', 'investigator', 'scout', 'explorer'],
  write:     ['writer', 'copywriter', 'author', 'creator', 'scriptwriter'],
  review:    ['critic', 'reviewer', 'editor', 'qa', 'quality', 'validator'],
  design:    ['designer', 'architect', 'strategist', 'planner'],
  publish:   ['publisher', 'distributor', 'delivery', 'output'],
  summarize: ['summarizer', 'aggregator', 'curator'],
  translate: ['translator', 'localizer', 'adapter'],
  optimize:  ['optimizer', 'editor', 'refiner']
};

function detectVerbType(text) {
  const lower = text.toLowerCase();
  for (const [type, verbs] of Object.entries(ACTION_VERBS)) {
    if (verbs.some((v) => lower.includes(v))) return type;
  }
  return 'write'; // default
}

function scoreExecutorForType(executor, verbType, taskText = '') {
  const roleKeywords = EXECUTOR_ROLE_MAP[verbType] || [];
  const execKeywords = executor.keywords;
  const roleScore = roleKeywords.reduce((score, roleKeyword) => (
    score + (execKeywords.some((keyword) => keyword.includes(roleKeyword) || roleKeyword.includes(keyword)) ? 3 : 0)
  ), 0);
  const taskKeywords = new Set(extractKeywords(taskText));
  const domainScore = execKeywords.reduce((score, keyword) => (
    score + (taskKeywords.has(keyword) ? 1 : 0)
  ), 0);
  const reviewBonus = verbType === 'review' && executor.type === 'reviewer' ? 4 : 0;
  return roleScore + domainScore + reviewBonus;
}

function assignExecutor(executors, verbType, taskText = '') {
  if (executors.length === 0) return { executor: null, score: 0 };

  const scored = executors.map((e) => ({
    executor: e,
    score: scoreExecutorForType(e, verbType, taskText)
  }));
  scored.sort((a, b) => b.score - a.score || a.executor.slug.localeCompare(b.executor.slug));

  return scored[0].score > 0 ? scored[0] : { executor: executors[0], score: 0 };
}

function selectIndependentReviewer(executors, ownerSlug, taskText) {
  const candidates = executors
    .filter((executor) => executor.slug !== ownerSlug)
    .map((executor) => ({
      executor,
      score: scoreExecutorForType(executor, 'review', taskText)
    }))
    .sort((a, b) => b.score - a.score || a.executor.slug.localeCompare(b.executor.slug));
  return candidates[0]?.executor || null;
}

function buildEphemeralSpecialist(taskText, verbType, owner, expertiseScore) {
  if (!owner || expertiseScore > 0) return null;
  const domainTerms = extractKeywords(taskText).slice(0, 3);
  const domain = domainTerms.join('-') || verbType;
  return {
    slug: `specialist-${domain}`.slice(0, 80),
    role: `Task-specific ${verbType} specialist`,
    contribution: `Close the uncovered ${verbType} capability for this task only`,
    evidence: domainTerms,
    persistent: false,
    integration_owner: owner.slug,
    instructions: `Apply specialist ${verbType} expertise to "${taskText}" and return evidence to integration owner ${owner.slug}.`
  };
}

function extractSubGoals(goal) {
  const text = String(goal || '').trim();

  // Split on: numbered lists, bullet points, "and then", semicolons, newlines
  const parts = text
    .split(/(?:\d+[.)]\s+|[•\-*]\s+|\band\s+then\b|;\s*|\n+)/)
    .map((s) => s.trim())
    .filter((s) => s.length > 10);

  if (parts.length > 1) return parts;

  // Single sentence: split on commas + conjunctions suggesting parallel work
  const commaSplit = text.split(/,\s+(?:and\s+)?/).map((s) => s.trim()).filter((s) => s.length > 10);
  if (commaSplit.length > 1 && commaSplit.length <= 8) return commaSplit;

  // Single goal — treat as one task
  return [text];
}

function buildAcceptanceCriteria(taskTitle, verbType) {
  const base = [
    `Output directly addresses the task: "${taskTitle.slice(0, 80)}"`,
    'Content is complete, not truncated',
    'No generic filler — all content is task-specific'
  ];

  const specific = {
    research:  ['Findings cite at least one concrete source or evidence', 'Distinguishes facts from inferences'],
    write:     ['Follows the squad\'s tone and style guidelines', 'Covers all required points from the brief'],
    review:    ['Lists specific issues with clear descriptions', 'Each issue has a concrete recommendation'],
    design:    ['Plan is actionable — each step is executable', 'Dependencies between steps are explicit'],
    publish:   ['Output format matches delivery specification', 'File is written to correct output path'],
    summarize: ['Captures all key points from source material', 'No important information omitted'],
    translate: ['Preserves original meaning accurately', 'Reads naturally in the target language'],
    optimize:  ['Each change is explained with a clear reason', 'Original intent is preserved']
  };

  return [...base, ...(specific[verbType] || [])];
}

// ─── must_haves contract builder ──────────────────────────────────────────────

/**
 * Build a must_haves contract for a task based on its verb type.
 * These are heuristic defaults — executors can override in squad.json.
 */
function buildMustHaves(taskTitle, verbType) {
  const title = taskTitle.slice(0, 60);

  const contracts = {
    research: {
      truths:    [`Research findings address: "${title}"`],
      artifacts: [],
      key_links: []
    },
    write: {
      truths:    [`Written content covers the scope of: "${title}"`],
      artifacts: [],  // populated if executor writes to a file
      key_links: []
    },
    review: {
      truths:    [`Review identifies concrete issues in: "${title}"`],
      artifacts: [],
      key_links: []
    },
    design: {
      truths:    [`Design plan is actionable for: "${title}"`],
      artifacts: [],
      key_links: []
    },
    publish: {
      truths:    [`Output is delivered for: "${title}"`],
      artifacts: [],
      key_links: []
    },
    summarize: {
      truths:    [`Summary captures all key points of: "${title}"`],
      artifacts: [],
      key_links: []
    },
    translate: {
      truths:    [`Translation preserves the meaning of: "${title}"`],
      artifacts: [],
      key_links: []
    },
    optimize: {
      truths:    [`Optimization is applied to: "${title}"`],
      artifacts: [],
      key_links: []
    }
  };

  return contracts[verbType] || {
    truths:    [`Task output addresses: "${title}"`],
    artifacts: [],
    key_links: []
  };
}

// ─── read_first hints builder ─────────────────────────────────────────────────

/**
 * Build read_first hints for a task.
 * These are instructions (not literal paths) telling the executor what to read
 * before starting — avoids loading everything inline and inflating context.
 */
function buildReadFirstHints(verbType) {
  const hints = {
    research:  ['Start with web search or existing researchs/ cache before reading code'],
    write:     ['Read the brief/spec document first, then any referenced source material'],
    review:    ['Read only the artifact being reviewed — not the full codebase'],
    design:    ['Read existing architecture docs and constraints before designing'],
    publish:   ['Read output spec and target format before writing to disk'],
    summarize: ['Read source material first, then check for existing summaries to build on'],
    translate: ['Read the original content in full before starting translation'],
    optimize:  ['Read the current implementation first — understand before changing']
  };

  return hints[verbType] || ['Read only files directly relevant to this specific task'];
}

function detectDependencies(tasks) {
  // Simple heuristic: review/optimize/publish tasks depend on write/research tasks
  const DEPENDENT_TYPES = new Set(['review', 'optimize', 'publish', 'summarize']);
  const PRODUCER_TYPES = new Set(['research', 'write', 'design']);

  const producerIds = tasks
    .filter((t) => PRODUCER_TYPES.has(t._verbType))
    .map((t) => t.id);

  return tasks.map((task) => ({
    ...task,
    dependencies: DEPENDENT_TYPES.has(task._verbType) ? producerIds.filter((id) => id !== task.id) : []
  }));
}

function assignParallelGroups(tasks) {
  // Group 1: tasks with no dependencies (can run in parallel)
  // Group 2: tasks that depend only on group 1
  // Group N: tasks that depend on group N-1
  const groupMap = {};
  const assigned = new Set();

  let group = 1;
  let remaining = [...tasks];

  while (remaining.length > 0) {
    const currentGroup = remaining.filter((t) =>
      t.dependencies.every((dep) => assigned.has(dep))
    );

    if (currentGroup.length === 0) {
      // Circular dependency or unresolvable — assign all remaining to next group
      for (const t of remaining) {
        groupMap[t.id] = group;
        assigned.add(t.id);
      }
      break;
    }

    for (const t of currentGroup) {
      groupMap[t.id] = group;
      assigned.add(t.id);
    }

    remaining = remaining.filter((t) => !assigned.has(t.id));
    group++;
  }

  return tasks.map((t) => ({ ...t, parallel_group: groupMap[t.id] || 1 }));
}

function heuristicDecompose(goal, executors) {
  const subGoals = extractSubGoals(goal);

  let tasks = subGoals.map((sg, i) => {
    const verbType = detectVerbType(sg);
    const assignment = assignExecutor(executors, verbType, sg);
    const executor = assignment.executor;
    const reviewer = selectIndependentReviewer(executors, executor?.slug, sg);
    const specialist = buildEphemeralSpecialist(sg, verbType, executor, assignment.score);
    const criteria = buildAcceptanceCriteria(sg, verbType);
    const mustHaves = buildMustHaves(sg, verbType);
    const readFirstHints = buildReadFirstHints(verbType);

    return {
      id: `task-${String(i + 1).padStart(2, '0')}`,
      title: sg.slice(0, 100),
      description: sg,
      acceptance_criteria: criteria,
      must_haves: mustHaves,
      read_first_hints: readFirstHints,
      executor: executor ? executor.slug : null,
      owner: executor ? executor.slug : null,
      reviewer: reviewer ? reviewer.slug : null,
      review_exception: reviewer ? null : 'no-independent-reviewer-available',
      decision_right: {
        owner: 'final',
        reviewer: reviewer ? 'veto-on-quality-failure' : 'exception-recorded'
      },
      contribution: executor?.contribution || `Own ${verbType} integration for this task`,
      expertise_score: assignment.score,
      specialist,
      dependencies: [],
      priority: i + 1,
      parallel_group: 1,
      wave: 1,
      status: 'pending',
      _verbType: verbType
    };
  });

  tasks = detectDependencies(tasks);
  tasks = assignParallelGroups(tasks);

  // Topological sort
  const executionOrder = topologicalSort(tasks);

  // Build parallel group index (kept as parallel_groups for backward compat)
  // and waves (canonical new name)
  const parallelGroups = {};
  const waves = {};
  for (const t of tasks) {
    const g = t.parallel_group;
    if (!parallelGroups[g]) parallelGroups[g] = [];
    if (!waves[g]) waves[g] = [];
    parallelGroups[g].push(t.id);
    waves[g].push(t.id);
  }

  // Clean up internal field; set wave = parallel_group for clarity
  const cleanTasks = tasks.map(({ _verbType, ...rest }) => ({ ...rest, wave: rest.parallel_group }));

  const ephemeralSpecialists = cleanTasks
    .map((task) => task.specialist)
    .filter(Boolean)
    .filter((specialist, index, all) => all.findIndex((item) => item.slug === specialist.slug) === index);
  const persistentCore = [...new Set(cleanTasks.map((task) => task.owner).filter(Boolean))];
  const uncoveredCapabilities = cleanTasks
    .filter((task) => !task.owner)
    .map((task) => ({ task: task.id, capability: task.title }));

  return {
    tasks: cleanTasks,
    executionOrder,
    parallelGroups,
    waves,
    composition: {
      persistent_core: persistentCore,
      ephemeral_specialists: ephemeralSpecialists,
      uncovered_capabilities: uncoveredCapabilities
    }
  };
}

function topologicalSort(tasks) {
  const inDegree = {};
  const adj = {};
  const order = [];
  const queue = [];

  for (const t of tasks) {
    inDegree[t.id] = t.dependencies.length;
    adj[t.id] = tasks.filter((o) => o.dependencies.includes(t.id)).map((o) => o.id);
  }

  for (const t of tasks) {
    if (inDegree[t.id] === 0) queue.push(t.id);
  }

  while (queue.length > 0) {
    const id = queue.shift();
    order.push(id);
    for (const neighbor of (adj[id] || [])) {
      inDegree[neighbor]--;
      if (inDegree[neighbor] === 0) queue.push(neighbor);
    }
  }

  // Add any remaining (handles cycles gracefully)
  for (const t of tasks) {
    if (!order.includes(t.id)) order.push(t.id);
  }

  return order;
}

// ─── Structured prompt template (for LLM-powered decomposition) ──────────────

function buildStructuredPrompt(goal, executors, squadSlug) {
  const execList = executors
    .map((e) => `- ${e.slug}: ${e.role}${e.skills.length ? ` (skills: ${e.skills.join(', ')})` : ''}`)
    .join('\n');

  return `You are the @squad coordinator for squad "${squadSlug}".

## Goal
${goal}

## Available executors
${execList || '(none discovered — create generic tasks)'}

## Your task
Decompose the goal above into 2–7 concrete sub-tasks.

For each sub-task, provide:
1. A short title (max 80 chars)
2. A clear description (1–3 sentences)
3. 3–5 acceptance criteria (specific, verifiable)
4. The executor slug that should handle it
5. Dependencies (list task IDs that must complete first, or empty)
6. One persistent integration owner and one independent reviewer
7. Decision rights and the executor's concrete contribution
8. An optional task-specific specialist only when the persistent roster has a named capability gap

Output ONLY valid JSON in this format:
{
  "tasks": [
    {
      "id": "task-01",
      "title": "...",
      "description": "...",
      "acceptance_criteria": ["...", "..."],
      "executor": "executor-slug",
      "owner": "executor-slug",
      "reviewer": "independent-reviewer-slug",
      "decision_right": {"owner": "final", "reviewer": "veto-on-quality-failure"},
      "contribution": "...",
      "specialist": null,
      "dependencies": []
    }
  ]
}

Rules:
- Keep the persistent roster small; do not add a permanent executor without repeated contribution
- A temporary specialist must be task-bound, non-persistent, and return work to a named integration owner
- Never average away the relevant expert's decision right through naive voting
- If no independent reviewer exists, record an explicit review exception instead of pretending independence
- Research tasks always precede write tasks when both exist
- Review/critique tasks always depend on write tasks
- Maximum 7 tasks — merge smaller tasks if needed
- Each task must be completable in one session`;
}

// ─── Plan persistence ─────────────────────────────────────────────────────────

async function savePlan(projectDir, squadSlug, sessionId, plan) {
  const planDir = path.join(
    projectDir, '.aioson', 'squads', squadSlug, 'sessions', sessionId
  );
  await fs.mkdir(planDir, { recursive: true });
  const planPath = path.join(planDir, 'plan.json');
  await fs.writeFile(planPath, JSON.stringify(plan, null, 2), 'utf8');
  return planPath;
}

async function loadPlan(projectDir, squadSlug, sessionId) {
  const planPath = path.join(
    projectDir, '.aioson', 'squads', squadSlug, 'sessions', sessionId, 'plan.json'
  );
  try {
    return JSON.parse(await fs.readFile(planPath, 'utf8'));
  } catch {
    return null;
  }
}

async function updateTaskStatus(projectDir, squadSlug, sessionId, taskId, status, result = null) {
  const plan = await loadPlan(projectDir, squadSlug, sessionId);
  if (!plan) return null;

  const task = plan.tasks.find((t) => t.id === taskId);
  if (!task) return null;

  task.status = status;
  if (result !== null) task.result = result;
  task.updated_at = new Date().toISOString();

  await savePlan(projectDir, squadSlug, sessionId, plan);
  return plan;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Decompose a goal into an execution plan.
 *
 * @param {string} projectDir
 * @param {string} squadSlug
 * @param {string} goal          — High-level objective
 * @param {object} [options]
 *   @param {string}  [options.sessionId]   — Defaults to generated UUID
 *   @param {string}  [options.mode]        — 'heuristic' (default) | 'structured'
 *   @param {boolean} [options.save]        — Save plan to disk (default: true)
 * @returns {Promise<object>} plan
 */
async function decompose(projectDir, squadSlug, goal, options = {}) {
  const {
    sessionId = randomUUID(),
    mode = 'heuristic',
    save = true
  } = options;

  const { executors, discoverySource } = await loadSquadManifest(projectDir, squadSlug);

  let tasks, executionOrder, parallelGroups, waves, composition;
  let structuredPrompt = null;

  if (mode === 'structured') {
    // Return a prompt template for the agent to fill in with LLM
    structuredPrompt = buildStructuredPrompt(goal, executors, squadSlug);
    // Use heuristic as fallback scaffold
    ({ tasks, executionOrder, parallelGroups, waves, composition } = heuristicDecompose(goal, executors));
  } else {
    ({ tasks, executionOrder, parallelGroups, waves, composition } = heuristicDecompose(goal, executors));
  }

  const plan = {
    id: randomUUID(),
    session_id: sessionId,
    squad_slug: squadSlug,
    goal,
    created_at: new Date().toISOString(),
    decomposition_mode: mode,
    executor_count: executors.length,
    executor_discovery: discoverySource,
    tasks,
    execution_order: executionOrder,
    parallel_groups: parallelGroups,
    waves,
    composition,
    structured_prompt: structuredPrompt
  };

  if (save) {
    await savePlan(projectDir, squadSlug, sessionId, plan);
  }

  return plan;
}

/**
 * Get the next tasks ready to execute (dependencies satisfied, status pending).
 *
 * @returns {object[]} tasks ready to run
 */
function getReadyTasks(plan) {
  const completed = new Set(
    plan.tasks.filter((t) => t.status === 'completed' || t.status === 'done').map((t) => t.id)
  );

  return plan.tasks.filter((t) => {
    if (t.status !== 'pending') return false;
    return t.dependencies.every((dep) => completed.has(dep));
  });
}

/**
 * Check if a plan is fully complete.
 */
function isPlanComplete(plan) {
  return plan.tasks.every((t) => ['completed', 'done', 'skipped'].includes(t.status));
}

/**
 * Format a plan as a human-readable markdown summary.
 */
function formatPlan(plan) {
  const lines = [
    `## Execution Plan — ${plan.squad_slug}`,
    `Session: ${plan.session_id}`,
    `Goal: ${plan.goal}`,
    `Decomposition: ${plan.decomposition_mode}  |  Executors: ${plan.executor_count}`,
    `Created: ${plan.created_at}`,
    '',
    `### Tasks (${plan.tasks.length})`
  ];

  for (const taskId of plan.execution_order) {
    const task = plan.tasks.find((t) => t.id === taskId);
    if (!task) continue;
    const statusIcon = {
      pending: '○', in_progress: '●', completed: '✓', done: '✓',
      failed: '✗', skipped: '–', escalated: '⚠'
    }[task.status] || '?';

    lines.push(`\n**[${statusIcon}] ${task.id}: ${task.title}**`);
    lines.push(`  Executor: ${task.executor || 'unassigned'}  |  Wave: ${task.wave || task.parallel_group}`);
    if (task.dependencies.length > 0) lines.push(`  Depends on: ${task.dependencies.join(', ')}`);
    if (task.read_first_hints && task.read_first_hints.length > 0) {
      lines.push(`  Read first: ${task.read_first_hints[0]}`);
    }
    lines.push('  Acceptance criteria:');
    for (const c of task.acceptance_criteria) lines.push(`    - ${c}`);
    if (task.must_haves) {
      if (task.must_haves.truths && task.must_haves.truths.length > 0) {
        lines.push(`  Must-have truth: ${task.must_haves.truths[0]}`);
      }
      if (task.must_haves.artifacts && task.must_haves.artifacts.length > 0) {
        lines.push(`  Must-have artifact: ${task.must_haves.artifacts[0]}`);
      }
    }
  }

  const waveMap = plan.waves || plan.parallel_groups;
  if (Object.keys(waveMap).length > 1) {
    lines.push('', '### Execution waves');
    for (const [wave, ids] of Object.entries(waveMap)) {
      lines.push(`  Wave ${wave}: ${ids.join(', ')}${ids.length > 1 ? ' (parallel)' : ''}`);
    }
  }

  return lines.join('\n');
}

module.exports = {
  decompose,
  getReadyTasks,
  isPlanComplete,
  updateTaskStatus,
  loadPlan,
  savePlan,
  formatPlan,
  heuristicDecompose,
  buildStructuredPrompt,
  loadSquadManifest,
  extractSubGoals,
  assignExecutor,
  selectIndependentReviewer,
  detectDependencies,
  assignParallelGroups,
  topologicalSort
};
