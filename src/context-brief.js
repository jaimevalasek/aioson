'use strict';

const path = require('node:path');
const { selectContext } = require('./context-selector');
const { parseFrontmatter, readFileSafe } = require('./preflight-engine');
const { withIndex } = require('./context-search');
const { analyzeTaskVocabulary } = require('./lib/task-vocabulary');
const { focusFile } = require('./lib/section-focus');
const { pruneOptionalContext } = require('./lib/jev-context-filter');

const CODE_AGENTS = new Set(['dev', 'qa', 'tester', 'pentester']);
const IMPLEMENTATION_AGENTS = new Set(['dev']);
const REVIEW_AGENTS = new Set(['qa', 'tester']);
// Roles that name things — or approve the names someone else will write.
const NAMING_ROLES = new Set([
  'implementation', 'implementation-planning',
  'architecture', 'quality-review', 'test-design'
]);

// Recall only consumes markdown knowledge surfaces (rules, docs, features,
// plans, prds, researchs). Indexing/returning .json/.txt is cost and noise.
const RECALL_EXTENSIONS = ['.md'];

// Framework-keyed convention skills (e.g. `laravel-conventions.md`). When the
// project stack is known, recalling a *different* framework's convention skill
// is cross-stack noise, so it is dropped from the advisory recall list.
const FRAMEWORK_SKILL_TOKENS = new Set([
  'adonis', 'angular', 'astro', 'django', 'express', 'fastapi', 'flask', 'hono',
  'laravel', 'next', 'node', 'nuxt', 'phoenix', 'rails', 'react', 'remix',
  'spring', 'svelte', 'symfony', 'vue'
]);

const AGENT_PROFILES = {
  dev: {
    role: 'implementation',
    mustSurfaces: new Set(['rules', 'design_governance']),
    shouldSurfaces: new Set(['docs', 'bootstrap', 'context', 'feature_dossier'])
  },
  qa: {
    role: 'quality-review',
    mustSurfaces: new Set(['rules', 'design_governance']),
    shouldSurfaces: new Set(['docs', 'context', 'feature_dossier', 'bootstrap'])
  },
  tester: {
    role: 'test-design',
    mustSurfaces: new Set(['rules', 'design_governance']),
    shouldSurfaces: new Set(['docs', 'context', 'feature_dossier', 'bootstrap'])
  },
  pentester: {
    role: 'security-review',
    mustSurfaces: new Set(['rules', 'design_governance']),
    shouldSurfaces: new Set(['docs', 'context', 'feature_dossier', 'bootstrap'])
  },
  'refiner': {
    role: 'feature-framing',
    mustSurfaces: new Set(['rules']),
    shouldSurfaces: new Set(['docs', 'context', 'feature_dossier', 'bootstrap', 'design_governance'])
  },
  product: {
    role: 'product-definition',
    mustSurfaces: new Set(['rules']),
    shouldSurfaces: new Set(['docs', 'context', 'feature_dossier', 'bootstrap', 'design_governance'])
  },
  sheldon: {
    role: 'prd-enrichment',
    mustSurfaces: new Set(['rules']),
    shouldSurfaces: new Set(['docs', 'context', 'feature_dossier', 'bootstrap', 'design_governance'])
  },
  planner: {
    role: 'implementation-planning',
    mustSurfaces: new Set(['rules', 'design_governance']),
    shouldSurfaces: new Set(['docs', 'context', 'feature_dossier', 'bootstrap'])
  }
};

const CONCERN_KEYWORDS = [
  { concern: 'english-code', terms: ['english', 'ingles', 'naming', 'identifier', 'identifiers', 'class', 'function', 'variable'] },
  { concern: 'componentization', terms: ['componentization', 'componentizar', 'split', 'folder', 'folders', 'module', 'file-size', 'service'] },
  { concern: 'data-access', terms: ['query', 'queries', 'sql', 'database', 'eloquent', 'repository', 'controller', 'raw'] },
  { concern: 'framework-conventions', terms: ['laravel', 'framework', 'eloquent', 'artisan', 'controller', 'resource', 'policy', 'formrequest'] },
  { concern: 'security', terms: ['security', 'auth', 'permission', 'token', 'secret', 'tenant', 'upload', 'sanitize', 'password'] },
  { concern: 'testing', terms: ['test', 'tests', 'qa', 'coverage', 'regression', 'verify', 'assert'] },
  { concern: 'prd-enrichment', terms: ['prd', 'requirement', 'acceptance', 'criteria', 'enrich', 'sheldon'] },
  { concern: 'ui', terms: ['ui', 'ux', 'screen', 'frontend', 'layout'] }
];

const PROFILE_HINTS = {
  implementation: [
    'Load must_load paths before editing code.',
    'Use should_load paths when a decision is ambiguous or the touched path overlaps their reason.',
    'Use a prototype only after its active-feature owner is verified; with explicit none, inspect the current production code and tests.',
    'After implementation, verify the diff against verification_hints before marking the slice done.'
  ],
  'quality-review': [
    'Treat loaded rules and constraints as review criteria.',
    'Verify prototype status, owner, canonical paths, and manifest before using fidelity as acceptance evidence.',
    'Verify behavior, regressions, and implementation shape against the package before PASS.',
    'Report gaps as actionable findings with file/path references.'
  ],
  'test-design': [
    'Turn constraints and forbidden_patterns into focused regression tests.',
    'Prioritize tests around touched paths, data boundaries, framework conventions, and prior failure signals.',
    'Name the verification command required to prove the package.',
    'Use model knowledge to generate edge-case hypotheses, but keep only cases grounded in approved behavior, code, engineering controls, or production risk.',
    'When a defect is unequivocal and within the Tester correction budget, persist allowed paths, correct it under a finite self-cycle, and return acceptance to QA.'
  ],
  'security-review': [
    'Turn constraints into a feature-specific threat model.',
    'Probe auth, permission, input validation, data exposure, tenant boundaries, uploads, secrets, and unsafe query construction when present.',
    'Separate confirmed vulnerabilities from hardening recommendations.',
    'When hardening is deterministic and within the Pentester correction budget, persist allowed paths, correct it under a finite self-cycle, and return acceptance to QA.'
  ],
  'feature-framing': [
    'Use selected knowledge to challenge feature assumptions before PRD generation.',
    'When current behavior affects scope, inspect source code separately; this package contains knowledge, not implementation proof.',
    'Turn repository contradictions into specific findings with exact evidence paths.'
  ],
  'product-definition': [
    'Reconcile the approved promise with inspected current product behavior.',
    'Record one current-system fit decision per required capability.',
    'Resolve the prototype as feature-owned current or explicit none, exclude historical paths, and state the resolution in chat.',
    'Apply evidence-backed routine recommendations without creating a confirmation gate.'
  ],
  'prd-enrichment': [
    'Use constraints to enrich requirements before implementation starts.',
    'Reject a prototype owned by another or closed feature; repair an objective stale binding to explicit none.',
    'Convert downstream ambiguity into explicit acceptance criteria or open questions.',
    'Do not reopen decisions already grounded by selected rules or feature artifacts.'
  ],
  'implementation-planning': [
    'Inspect source code separately and classify every delivery path as reuse, modify, create, or retire.',
    'Plan from a prototype only when its active-feature binding is verified; otherwise use the repository baseline.',
    'Use selected constraints to shape the implementation delta and vertical phases.',
    'Record only evidence-triggered engineering controls, with phase verification and recovery where persistent or externally visible state can change.',
    'Apply evidence-backed technical recommendations without creating a confirmation gate.'
  ],
  architecture: [
    'Use selected rules and design governance as architecture constraints.',
    'Make module boundaries, data boundaries, and framework conventions explicit for downstream agents.',
    'Link applicable governance artifacts in the architecture handoff.'
  ],
  generic: [
    'Load must_load paths first.',
    'Use constraints as the operating contract for this turn.',
    'Treat gaps as clarification or routing signals.'
  ]
};

function normalizeToken(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9/-]+/g, ' ')
    .trim();
}

function dedupe(items, limit = 12) {
  const seen = new Set();
  const out = [];
  for (const item of items) {
    const text = String(item || '').trim();
    if (!text) continue;
    const key = normalizeToken(text);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(text);
    if (out.length >= limit) break;
  }
  return out;
}

function compactPathItem(item) {
  return {
    path: item.path,
    surface: item.surface,
    load_tier: item.load_tier,
    score: item.score,
    priority: item.priority || 0,
    reason: item.reason
  };
}

function inferOperation(agent, mode, task) {
  const text = normalizeToken(`${agent} ${mode} ${task}`);
  if (text.includes('pentest') || text.includes('security') || text.includes('vulnerability')) return 'security-review';
  if (agent === 'sheldon' || text.includes('prd') || text.includes('enrich')) return 'prd-enrichment';
  if (agent === 'tester' || text.includes('test')) return 'test-design';
  if (agent === 'qa' || text.includes('review')) return 'quality-review';
  if (text.includes('architecture')) return 'architecture';
  if (mode === 'executing' || text.includes('implement') || text.includes('refactor')) return 'implementation';
  return 'planning';
}

function inferStack(selection, documents) {
  const terms = new Set(selection.semantic && Array.isArray(selection.semantic.terms) ? selection.semantic.terms : []);
  for (const term of terms) {
    if (term === 'laravel') return 'Laravel';
    if (term === 'php') return 'PHP';
    if (term === 'react') return 'React';
    if (term === 'next') return 'Next.js';
    if (term === 'node') return 'Node.js';
  }

  const project = documents.get('.aioson/context/project.context.md') || '';
  const match = project.match(/^framework:\s*"?([^"\n]+)"?\s*$/m);
  return match ? match[1].trim() : '';
}

function includesConcernTerm(haystack, rawTerm) {
  const term = normalizeToken(rawTerm);
  if (!term) return false;
  if (term.length <= 3) {
    return new RegExp(`(^|\\s)${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(\\s|$)`).test(haystack);
  }
  return haystack.includes(term);
}

function inferConcerns(selection, task, profile) {
  const haystack = normalizeToken([
    task,
    selection.paths ? selection.paths.join(' ') : '',
    selection.selected ? selection.selected.map((item) => `${item.path} ${item.reason}`).join(' ') : ''
  ].join(' '));

  const concerns = [];
  // Naming is not a topic an implementation task opts into by mentioning it —
  // every task that writes code invents identifiers. Keyword-gating this concern
  // made it recall-dependent in exactly the wrong direction: an operator working
  // in their own language never types "naming" or "identifier", so the projects
  // most at risk of translated identifiers were the ones that never loaded the
  // convention. Implementation and planning roles now always carry it.
  if (profile && (IMPLEMENTATION_AGENTS.has(profile.agent) || NAMING_ROLES.has(profile.role))) {
    concerns.push('english-code');
  }
  for (const item of CONCERN_KEYWORDS) {
    if (item.terms.some((term) => includesConcernTerm(haystack, term))) concerns.push(item.concern);
  }
  return dedupe(concerns, 8);
}

function extractSectionBullets(markdown, headingPatterns) {
  const lines = String(markdown || '').split(/\r?\n/);
  const out = [];
  let active = false;
  let activeLevel = 0;
  for (const line of lines) {
    const heading = line.match(/^(#{2,6})\s+(.+?)\s*$/);
    if (heading) {
      const level = heading[1].length;
      const title = normalizeToken(heading[2]);
      if (active && level <= activeLevel) active = false;
      if (!active && headingPatterns.some((pattern) => pattern.test(title))) {
        active = true;
        activeLevel = level;
      }
      continue;
    }
    if (!active) continue;
    const bullet = line.match(/^\s*[-*]\s+(.+?)\s*$/);
    if (bullet) out.push(bullet[1].trim());
  }
  return out;
}

function extractDirectiveBullets(markdown) {
  const out = [];
  const lines = String(markdown || '').split(/\r?\n/);
  for (const line of lines) {
    const bullet = line.match(/^\s*[-*]\s+(.+?)\s*$/);
    if (!bullet) continue;
    const text = bullet[1].trim();
    if (/^(use|keep|prefer|put|load|treat|turn|verify|report|make|add|separate)\b/i.test(text)) out.push(text);
    if (/^(do not|never|avoid|no\s+)/i.test(text)) out.push(text);
  }
  return out;
}

function forbiddenFromBullets(bullets) {
  return bullets.filter((text) => (
    /^(do not|never|avoid|no\s+)/i.test(text)
    || /\bmust not\b/i.test(text)
    || /\bnot expose\b/i.test(text)
    || /\braw sql\b/i.test(text)
    || /\buser input\b/i.test(text)
  ));
}

const REQUIRED_CONSTRAINT_HEADINGS = [
  /required behavior/,
  /framework first/,
  /componentization/,
  /data access/,
  /controls/,
  /rules/,
  /baseline/
];

const REVIEW_HEADINGS = [/review checklist/, /checklist/, /verification/];

// Extract the operating constraints from a SINGLE governing document.
// Shared by the brief (aggregate over all selected docs) and the guard
// (per-rule attribution — the injection carries only the matched rule's own
// constraints, not the generic concern-based ones).
function extractDocConstraints(content) {
  const required = extractSectionBullets(content, REQUIRED_CONSTRAINT_HEADINGS);
  const review = extractSectionBullets(content, REVIEW_HEADINGS);
  const directives = extractDirectiveBullets(content);
  const base = [...required, ...directives];
  return {
    constraints: base,
    forbidden_patterns: forbiddenFromBullets(base),
    verification_hints: review
  };
}

function isHardConstraintDoc(item, content) {
  if (item.surface === 'rules' || item.surface === 'design_governance') return true;
  if (item.surface !== 'docs') return false;
  const frontmatter = parseFrontmatter(content || '');
  const scope = normalizeToken(frontmatter.constraint_scope || frontmatter.constraints || '');
  return scope === 'hard' || scope === 'contract';
}

// Framework names a rule may address a bullet to. A closed list on purpose:
// inferring "For each request," or "For new features," as a stack scope would
// silently delete ordinary guidance, which is a far worse failure than keeping
// one irrelevant line.
const STACK_WORDS = new Set([
  'laravel', 'php', 'symfony', 'wordpress', 'react', 'next', 'nextjs', 'next.js',
  'vue', 'nuxt', 'svelte', 'sveltekit', 'angular', 'astro', 'remix', 'solid',
  'node', 'nodejs', 'node.js', 'express', 'nest', 'nestjs', 'deno',
  'django', 'flask', 'fastapi', 'python', 'rails', 'ruby', 'spring', 'java',
  'kotlin', 'swift', 'flutter', 'dart', 'go', 'golang', 'rust', 'tauri',
  'electron', 'dotnet', '.net', 'csharp', 'elixir', 'phoenix'
]);

// "For Laravel, prefer FormRequest…" / "For non-Laravel stacks, translate…"
function stackScopeOf(bullet) {
  const match = /^-?\s*for\s+(non-)?([a-z][a-z0-9.+#-]{1,18})(?:\s+stacks?)?\s*[,:]/i.exec(String(bullet).trim());
  if (!match) return null;
  const stack = normalizeToken(match[2]);
  if (!STACK_WORDS.has(stack)) return null;
  return { negated: Boolean(match[1]), stack };
}

/**
 * Scope a document's bullets to the project's stack.
 *
 * A bullet addressed to another framework is not merely noise: it arrives in
 * `constraints`, which the agent reads as binding, and it spends a slot under a
 * hard cap. A React project was being handed "For Laravel, prefer FormRequest".
 * The same line is the single most actionable one in a Laravel project, so it
 * sorts to the front there.
 */
function rankForStack(bullets, stack) {
  const project = normalizeToken(stack || '');
  const addressed = [];
  const general = [];
  for (const bullet of bullets) {
    const scope = stackScopeOf(bullet);
    if (!scope || !project) { general.push(bullet); continue; }
    const namesProject = project.includes(scope.stack) || scope.stack.includes(project);
    if (scope.negated) {
      if (!namesProject) general.push(bullet);
      continue;
    }
    if (namesProject) addressed.push(bullet);
  }
  return [...addressed, ...general];
}

// Every document contributes its first bullet before any document contributes
// its second. Concatenating them instead made a cap truncate whole documents:
// the first rule spent the budget and the second, third, and fourth rules in a
// project contributed nothing at all — silently, since the package still looked
// full.
function interleave(groups) {
  const out = [];
  const depth = groups.reduce((max, group) => Math.max(max, group.length), 0);
  for (let index = 0; index < depth; index += 1) {
    for (const group of groups) {
      if (index < group.length) out.push(group[index]);
    }
  }
  return out;
}

function constraintsFromDocuments(documents, selected, stack = '') {
  const constraints = [];
  const forbidden = [];
  const checks = [];

  for (const item of selected) {
    const content = documents.get(item.path) || '';
    if (!isHardConstraintDoc(item, content)) continue;
    const doc = extractDocConstraints(content);
    constraints.push(rankForStack(doc.constraints, stack));
    forbidden.push(doc.forbidden_patterns);
    checks.push(doc.verification_hints);
  }

  return {
    constraints: dedupe(interleave(constraints), 14),
    forbidden_patterns: dedupe(interleave(forbidden), 10),
    verification_hints: dedupe(interleave(checks), 10)
  };
}

function profileVerificationHints(profile, concerns) {
  const hints = [...(PROFILE_HINTS[profile.role] || PROFILE_HINTS.generic)];

  if (IMPLEMENTATION_AGENTS.has(profile.agent)) {
    hints.push('Scan the final diff for violations of forbidden_patterns.');
  }
  if (REVIEW_AGENTS.has(profile.agent)) {
    hints.push('Check that must_load rules are represented in the review criteria.');
  }
  if (profile.agent === 'pentester') {
    hints.push('Build probes from attack surfaces implied by touched paths and constraints.');
  }
  if (profile.agent === 'sheldon') {
    hints.push('Convert missing downstream constraints into PRD acceptance criteria or explicit open questions.');
  }
  if (concerns.includes('english-code')) {
    hints.push('Check new source identifiers are technical English while user-facing copy stays in project language.');
  }
  if (IMPLEMENTATION_AGENTS.has(profile.agent) || REVIEW_AGENTS.has(profile.agent)) {
    hints.push('Run `aioson rules:check . --changed` as you go — it verifies the project rules deterministically instead of trusting recall.');
  }

  return hints;
}

function concernConstraints(concerns) {
  const constraints = [];

  if (concerns.includes('english-code')) {
    constraints.push('Use technical English for source code identifiers, filenames, classes, methods, variables, migrations, tests, and framework artifacts.');
  }
  if (concerns.includes('componentization')) {
    constraints.push('Keep files focused and split orchestration, validation, data access, formatting, and side effects into framework-appropriate units.');
  }
  if (concerns.includes('data-access')) {
    constraints.push('Keep controllers and route handlers thin: validate, authorize, delegate, and return a response.');
    constraints.push('Keep persistence details out of controllers, route handlers, UI components, views, jobs, and unrelated services.');
    constraints.push('Parameterize queries and keep reusable filters in the framework-appropriate data access layer.');
  }
  if (concerns.includes('framework-conventions')) {
    constraints.push('Prefer existing project and framework conventions before creating custom plumbing.');
  }
  if (concerns.includes('security')) {
    constraints.push('Map auth, ownership, input validation, data exposure, tenant, upload, secret, and query-construction surfaces before approval.');
  }
  if (concerns.includes('prd-enrichment')) {
    constraints.push('Convert implementation, security, and testing ambiguity into explicit acceptance criteria or open questions.');
  }

  return constraints;
}

function suggestedStructure(concerns) {
  if (concerns.includes('componentization')) {
    return [
      'Keep entrypoints thin and delegate orchestration to focused modules.',
      'Split reusable data access, validation, formatting, and side effects into framework-appropriate units.',
      'Keep tests aligned with the new module boundaries.'
    ];
  }
  return [];
}

function profileForAgent(agent) {
  const { canonicalAgentId } = require('./agents');
  const base = AGENT_PROFILES[canonicalAgentId(agent)] || {
    role: 'generic',
    mustSurfaces: new Set(['rules']),
    shouldSurfaces: new Set(['docs', 'context', 'design_governance', 'bootstrap', 'feature_dossier'])
  };
  return { ...base, agent };
}

const PROTECTED_LOAD_SIGNAL = /(?:paths|feature|task_types|triggers|aliases|entities|retrieval_intents):/;

function isProtectedMustLoad(item) {
  return item.load_tier === 'always' || PROTECTED_LOAD_SIGNAL.test(item.reason || '');
}

function capMustLoads(items, limit = 14) {
  if (items.length <= limit) return items;
  const protectedItems = items.filter(isProtectedMustLoad);
  const protectedPaths = new Set(protectedItems.map((item) => item.path));
  const remaining = items.filter((item) => !protectedPaths.has(item.path));
  return [
    ...protectedItems,
    ...remaining.slice(0, Math.max(0, limit - protectedItems.length))
  ];
}

// A rule reaches must_load on a hard signal — a declared path, task type,
// trigger, entity, alias, intent or feature. Semantic recall alone ("build",
// "prototype") is how the shipped kanban and widget rules landed in front of
// every landing page; on recall alone a rule is still read on demand from
// should_load, it just stops being law for a task it never named.
const HARD_RULE_SIGNAL = /(?:^|;\s*)(?:paths|task_types|triggers|aliases|entities|retrieval_intents|feature|feature-mentioned|intent):/;

function classifyLoads(selection, profile) {
  const selected = selection.selected || [];
  const must = [];
  const should = [];

  for (const item of selected) {
    if (item.load_tier === 'always' || profile.mustSurfaces.has(item.surface)) {
      if (item.surface === 'rules' && item.load_tier !== 'always' && typeof item.reason === 'string' && item.reason && !HARD_RULE_SIGNAL.test(item.reason)) {
        should.push(compactPathItem(item));
        continue;
      }
      must.push(compactPathItem(item));
      continue;
    }
    if (profile.shouldSurfaces.has(item.surface)) should.push(compactPathItem(item));
  }

  return {
    // The nominal budget remains 14, but deterministic/always matches are
    // never silently discarded. The package contains paths, not full files.
    must_load: capMustLoads(must, 14),
    should_load: should.slice(0, 10)
  };
}

function confidenceFrom({ selection, mustLoad, gaps }) {
  if (selection.activation_only || gaps.some((gap) => gap.code === 'missing_task' || gap.code === 'generic_task')) return 'low';
  if (mustLoad.length === 0) return 'low';
  if (gaps.length > 0) return 'medium';
  return 'high';
}

function buildGaps({ selection, agent, mode, task, paths, mustLoad, taskVocabulary }) {
  const gaps = [];
  if (!String(task || '').trim()) {
    gaps.push({ code: 'missing_task', message: 'No concrete task was provided; package is foundation-only.' });
  }
  if (taskVocabulary && taskVocabulary.generic && !selection.activation_only) {
    const booster = taskVocabulary.augmented_with
      ? ` Routing was boosted with the PRD title only ("${taskVocabulary.augmented_with}"), which names the feature, not its surfaces.`
      : '';
    gaps.push({
      code: 'generic_task',
      message: `The task names only workflow words, so rules and docs routed by triggers, task types, aliases or entities (forms, listings, status flows, payments…) could not match.${booster} Rerun with the surfaces this phase builds, in domain words, plus --paths=<files to touch>.`
    });
  }
  if (selection.activation_only) {
    gaps.push({ code: 'activation_only', message: 'Activation-only context; do not expand into implementation or review work.' });
  }
  if (mode === 'executing' && CODE_AGENTS.has(agent) && paths.length === 0) {
    gaps.push({ code: 'missing_paths', message: 'Executing code/review work without touched paths reduces retrieval precision.' });
  }
  if (mustLoad.length === 0) {
    gaps.push({ code: 'no_must_load', message: 'No mandatory rules or governance were selected for this task.' });
  }
  return gaps;
}

// should_load is optional reading, and it is where the chars were: whole
// 30-50k-char state files and PRDs offered as bare paths. Every item now
// carries its size; a large one names the sections that match the task (line
// ranges to read) or, with no match, a heading outline to choose from.
// must_load stays whole — rules are binding and small.
function annotateLoadCost({ mustLoad, shouldLoad, documents, focusTerms }) {
  const sizeOf = (item) => (documents.get(item.path) || '').length;
  const mustChars = mustLoad.reduce((sum, item) => sum + sizeOf(item), 0);
  let fullChars = 0;
  let focusedChars = 0;
  const annotated = shouldLoad.map((item) => {
    const content = documents.get(item.path);
    if (content === undefined) return item;
    const focus = focusFile(content, focusTerms);
    fullChars += focus.chars;
    if (!focus.large) {
      focusedChars += focus.chars;
      return { ...item, chars: focus.chars };
    }
    if (focus.focus.length > 0) {
      focusedChars += focus.focus_chars;
      return { ...item, chars: focus.chars, lines: focus.lines, read: 'sections', focus: focus.focus };
    }
    focusedChars += focus.outline.join(' | ').length;
    return { ...item, chars: focus.chars, lines: focus.lines, read: 'outline', outline: focus.outline };
  });
  return {
    shouldLoad: annotated,
    loadBudget: {
      must_load_chars: mustChars,
      should_load_chars: fullChars,
      should_load_focused_chars: focusedChars
    }
  };
}

async function loadSelectedDocuments(targetDir, selected) {
  const documents = new Map();
  for (const item of selected) {
    const content = await readFileSafe(path.join(targetDir, item.path));
    if (content) documents.set(item.path, content);
  }
  return documents;
}

function normalizeForRecall(value) {
  const normalized = String(value || '').replace(/\\/g, '/').replace(/^\.\//, '').toLowerCase();
  return normalized.startsWith('template/') ? normalized.slice('template/'.length) : normalized;
}

function recallEnabled(options) {
  const raw = options.recall;
  return raw === true || (typeof raw === 'string' && raw.trim().toLowerCase() === 'true');
}

// A recalled framework-convention skill for a stack other than the project's is
// cross-stack noise (e.g. surfacing `laravel-conventions.md` on a Node project).
// Only fires when the project stack is known AND the hit is a framework-keyed
// skill — everything else is kept.
function isForeignStackSkill(relPath, stack) {
  const normalizedStack = normalizeToken(stack);
  if (!normalizedStack) return false;
  const normalizedPath = normalizeForRecall(relPath);
  if (!normalizedPath.includes('/skills/')) return false;
  const base = normalizedPath.split('/').pop() || '';
  const token = (base.match(/^([a-z0-9]+)[-_]/) || [])[1] || '';
  if (!token || !FRAMEWORK_SKILL_TOKENS.has(token)) return false;
  return !normalizedStack.split(/\s+/).includes(token);
}

// Broad recall over the indexed corpus (incl. archived features, plans, prds,
// researchs) — the historical surface the live `select` walk cannot see. Kept
// as a SEPARATE advisory section: it never feeds must_load (select stays the
// precision gate), and is deduped against what select already selected. Off by
// default; only the agent-facing `context:brief` command opts in.
async function collectRecall(targetDir, query, selection, options) {
  if (!query) return [];
  const selectedPaths = new Set((selection.selected || []).map((item) => normalizeForRecall(item.path)));
  const stack = options.stack || '';
  try {
    const pkg = await withIndex(async (idx) => {
      await idx.indexDirectory(targetDir, { extensions: RECALL_EXTENSIONS });
      return idx.searchPackage(query, {
        projectDir: targetDir,
        limit: 8,
        agent: selection.agent,
        mode: selection.mode,
        paths: (selection.paths || []).join(',')
      });
    }, options.searchDir);

    const hits = pkg.results || [];
    const seen = new Set();
    const related = [];
    for (const hit of hits) {
      const key = normalizeForRecall(hit.relPath);
      if (!key || !key.endsWith('.md') || selectedPaths.has(key) || seen.has(key)) continue;
      if (isForeignStackSkill(hit.relPath, stack)) continue;
      seen.add(key);
      related.push({
        path: hit.relPath,
        title: hit.title,
        snippet: hit.snippet,
        score: hit.score,
        source_type: hit.source_type,
        reason: hit.reason
      });
      if (related.length >= 6) break;
    }
    return related;
  } catch {
    return [];
  }
}

const CONTEXT_DIR = path.join('.aioson', 'context');

// Feature slugs are pointers, never vocabulary: every `prd-{slug}.md` plus the
// requested and active feature.
async function knownFeatureSlugs(targetDir, extra) {
  const slugs = new Set(extra.filter(Boolean).map((slug) => String(slug).trim().toLowerCase()));
  try {
    const entries = await require('node:fs/promises').readdir(path.join(targetDir, CONTEXT_DIR));
    for (const name of entries) {
      const match = name.match(/^prd-(.+)\.md$/);
      if (match) slugs.add(match[1].toLowerCase());
    }
  } catch { /* no context dir */ }
  return slugs;
}

async function readPrdTitle(targetDir, slug) {
  if (!slug || !/^[a-z0-9][a-z0-9._-]*$/i.test(slug)) return '';
  const content = await readFileSafe(path.join(targetDir, CONTEXT_DIR, `prd-${slug}.md`));
  if (!content) return '';
  const heading = content.replace(/^---[\s\S]*?\n---\r?\n/, '').match(/^#\s+(.+)$/m);
  if (!heading) return '';
  return heading[1].replace(/^PRD\s*[—–:-]\s*/i, '').trim().slice(0, 160);
}

async function judgeOptionalContext(targetDir, jevFilter, input) {
  const { shouldLoad, skills } = input;
  if (!jevFilter) return { shouldLoad, skills, report: null, pruned: [] };
  const tagged = [...shouldLoad.map((item) => ({ ...item, slot: 'should_load' })), ...skills.map((item) => ({ ...item, slot: 'skills' }))];
  const result = await pruneOptionalContext({
    projectDir: targetDir,
    env: jevFilter.env,
    config: jevFilter.config,
    fetchImpl: jevFilter.fetchImpl,
    task: input.task,
    agent: input.agent,
    mode: input.mode,
    paths: input.paths,
    items: tagged,
    describe: (item) => String(parseFrontmatter(input.documents.get(item.path) || '').description || '')
  });
  const untag = (slot) => result.items.filter((item) => item.slot === slot).map(({ slot: _slot, ...item }) => item);
  return { shouldLoad: untag('should_load'), skills: untag('skills'), report: result.report, pruned: result.pruned };
}

async function buildContextBrief(targetDir, options = {}) {
  const agent = normalizeToken(options.agent || 'dev');
  const mode = options.mode || 'planning';
  const task = String(options.task || options.goal || '').trim();
  const paths = Array.isArray(options.paths)
    ? options.paths
    : String(options.paths || options.path || '')
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);

  const selectOptions = {
    agent,
    mode,
    task,
    paths: paths.join(','),
    feature: options.feature || options.slug || '',
    semantic: options.semantic,
    noSemantic: options.noSemantic || options['no-semantic']
  };
  let selection = await selectContext(targetDir, selectOptions);

  // A workflow-only task ("implement {slug} from the approved PRD and plan")
  // routes no domain rule. Measured on 29 real PRDs: the PRD title as extra
  // vocabulary selects 0-6 rules/docs, all on-feature; the capability map or
  // the full body select 10-40 (no precision), so the title is the only safe
  // booster. The gap stays either way — the title names the feature, not the
  // surfaces a phase builds.
  const pointerFeature = options.feature || options.slug || selection.active_feature || '';
  const vocabulary = analyzeTaskVocabulary(task, {
    featureSlugs: await knownFeatureSlugs(targetDir, [pointerFeature])
  });
  const taskVocabulary = { generic: vocabulary.generic, content_terms: vocabulary.content_terms, augmented_with: null };
  if (vocabulary.generic && !selection.activation_only) {
    const title = await readPrdTitle(targetDir, String(pointerFeature).trim().toLowerCase());
    if (title) {
      selection = await selectContext(targetDir, { ...selectOptions, task: `${task} ${title}` });
      selection.task = task;
      taskVocabulary.augmented_with = title;
    }
  }

  const profile = profileForAgent(selection.agent);
  // Skill routers matched on their own declared signals. Advisory pointers:
  // the agent's kernel skill contract decides whether to load one — the brief
  // only guarantees a matching skill is never invisible to the agent.
  const skills = (selection.selected || [])
    .filter((item) => item.surface === 'skills')
    .map(compactPathItem)
    .slice(0, 6);
  const documents = await loadSelectedDocuments(targetDir, selection.selected || []);
  const stack = inferStack(selection, documents);
  const concerns = inferConcerns(selection, task, profile);
  const { must_load: mustLoad, should_load: rawShouldLoad } = classifyLoads(selection, profile);
  const focusTerms = [
    ...taskVocabulary.content_terms,
    ...(taskVocabulary.augmented_with ? analyzeTaskVocabulary(taskVocabulary.augmented_with).content_terms : [])
  ];
  const { shouldLoad, loadBudget } = annotateLoadCost({ mustLoad, shouldLoad: rawShouldLoad, documents, focusTerms });
  const mustLoadPaths = new Set(mustLoad.map((item) => item.path));
  const constraintSources = (selection.selected || []).filter((item) => {
    const hard = isHardConstraintDoc(item, documents.get(item.path) || '');
    if (!hard) return false;
    return mustLoadPaths.has(item.path) || item.surface === 'docs';
  });
  const extracted = constraintsFromDocuments(documents, constraintSources, stack);
  const structure = suggestedStructure(concerns);
  const profileHints = profileVerificationHints(profile, concerns);
  const constraints = dedupe([...concernConstraints(concerns), ...extracted.constraints, ...structure], 18);
  const forbiddenPatterns = dedupe(extracted.forbidden_patterns, 10);
  const verificationHints = dedupe([...extracted.verification_hints, ...profileHints], 14);
  const gaps = buildGaps({ selection, agent: selection.agent, mode: selection.mode, task, paths: selection.paths, mustLoad, taskVocabulary });

  const fallbackUsed = ['context_select'];
  if (selection.semantic && selection.semantic.enabled) fallbackUsed.push('semantic_search');
  if (selection.memory && selection.memory.length > 0) fallbackUsed.push('runtime_memory');

  // Optional context over the budget is judged by JEV when the caller asks for
  // it (the context:brief CLI does); the guard, the evals and the activation
  // stay deterministic. must_load is never offered to the judge.
  const optional = await judgeOptionalContext(targetDir, options.jevFilter, {
    task, agent: selection.agent, mode: selection.mode, paths: selection.paths, shouldLoad, skills, documents
  });

  const recallQuery = [task, paths.join(' '), options.feature || options.slug || ''].filter(Boolean).join(' ').trim();
  const related = recallEnabled(options)
    ? await collectRecall(targetDir, recallQuery, selection, { ...options, stack })
    : [];
  if (related.length > 0) fallbackUsed.push('broad_recall');

  return {
    ok: true,
    agent: selection.agent,
    mode: selection.mode,
    task: selection.task,
    paths: selection.paths,
    feature: selection.feature,
    active_feature: selection.active_feature,
    intent: {
      agent: selection.agent,
      mode: selection.mode,
      role: profile.role,
      operation: inferOperation(selection.agent, selection.mode, task),
      stack,
      concerns
    },
    must_load: mustLoad,
    should_load: optional.shouldLoad,
    skills: optional.skills,
    ...(optional.report ? { jev_filter: optional.report, pruned: optional.pruned } : {}),
    constraints,
    forbidden_patterns: forbiddenPatterns,
    suggested_structure: structure,
    verification_hints: verificationHints,
    review_criteria: dedupe([...verificationHints, ...constraints], 18),
    memory: selection.memory || [],
    related,
    selected_count: selection.selected.length,
    semantic: selection.semantic,
    task_vocabulary: taskVocabulary,
    load_budget: loadBudget,
    confidence: confidenceFrom({ selection, mustLoad, gaps }),
    gaps,
    fallback_used: fallbackUsed
  };
}

module.exports = {
  buildContextBrief,
  inferOperation,
  inferConcerns,
  suggestedStructure,
  extractDocConstraints,
  rankForStack,
  classifyLoads
};
