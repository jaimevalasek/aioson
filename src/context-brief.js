'use strict';

const path = require('node:path');
const { selectContext } = require('./context-selector');
const { readFileSafe } = require('./preflight-engine');
const { withIndex } = require('./context-search');

const CODE_AGENTS = new Set(['dev', 'deyvin', 'qa', 'tester', 'pentester']);
const IMPLEMENTATION_AGENTS = new Set(['dev', 'deyvin']);
const REVIEW_AGENTS = new Set(['qa', 'tester']);

const AGENT_PROFILES = {
  dev: {
    role: 'implementation',
    mustSurfaces: new Set(['rules', 'design_governance']),
    shouldSurfaces: new Set(['docs', 'bootstrap', 'context', 'feature_dossier'])
  },
  deyvin: {
    role: 'pair-implementation',
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
  sheldon: {
    role: 'prd-enrichment',
    mustSurfaces: new Set(['rules']),
    shouldSurfaces: new Set(['docs', 'context', 'feature_dossier', 'bootstrap', 'design_governance'])
  },
  architect: {
    role: 'architecture',
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
    'After implementation, verify the diff against verification_hints before marking the slice done.'
  ],
  'pair-implementation': [
    'Load must_load paths before code inspection or editing.',
    'Keep the slice small enough to verify in one loop.',
    'Escalate when the package shows missing paths, missing feature context, or architecture uncertainty.'
  ],
  'quality-review': [
    'Treat loaded rules and constraints as review criteria.',
    'Verify behavior, regressions, and implementation shape against the package before PASS.',
    'Report gaps as actionable findings with file/path references.'
  ],
  'test-design': [
    'Turn constraints and forbidden_patterns into focused regression tests.',
    'Prioritize tests around touched paths, data boundaries, framework conventions, and prior failure signals.',
    'Name the verification command required to prove the package.'
  ],
  'security-review': [
    'Turn constraints into a feature-specific threat model.',
    'Probe auth, permission, input validation, data exposure, tenant boundaries, uploads, secrets, and unsafe query construction when present.',
    'Separate confirmed vulnerabilities from hardening recommendations.'
  ],
  'prd-enrichment': [
    'Use constraints to enrich requirements before implementation starts.',
    'Convert downstream ambiguity into explicit acceptance criteria or open questions.',
    'Do not reopen decisions already grounded by selected rules or feature artifacts.'
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
    reason: item.reason
  };
}

function inferOperation(agent, mode, task) {
  const text = normalizeToken(`${agent} ${mode} ${task}`);
  if (text.includes('pentest') || text.includes('security') || text.includes('vulnerability')) return 'security-review';
  if (agent === 'sheldon' || text.includes('prd') || text.includes('enrich')) return 'prd-enrichment';
  if (agent === 'tester' || text.includes('test')) return 'test-design';
  if (agent === 'qa' || text.includes('review')) return 'quality-review';
  if (agent === 'architect' || text.includes('architecture')) return 'architecture';
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

function inferConcerns(selection, task) {
  const haystack = normalizeToken([
    task,
    selection.paths ? selection.paths.join(' ') : '',
    selection.selected ? selection.selected.map((item) => `${item.path} ${item.reason}`).join(' ') : ''
  ].join(' '));

  const concerns = [];
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

function constraintsFromDocuments(documents, selected) {
  const constraints = [];
  const forbidden = [];
  const checks = [];

  for (const item of selected) {
    if (!['rules', 'design_governance', 'docs'].includes(item.surface)) continue;
    const doc = extractDocConstraints(documents.get(item.path) || '');
    constraints.push(...doc.constraints);
    forbidden.push(...doc.forbidden_patterns);
    checks.push(...doc.verification_hints);
  }

  return {
    constraints: dedupe(constraints, 14),
    forbidden_patterns: dedupe(forbidden, 10),
    verification_hints: dedupe(checks, 10)
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
  const base = AGENT_PROFILES[agent] || {
    role: 'generic',
    mustSurfaces: new Set(['rules']),
    shouldSurfaces: new Set(['docs', 'context', 'design_governance', 'bootstrap', 'feature_dossier'])
  };
  return { ...base, agent };
}

function classifyLoads(selection, profile) {
  const selected = selection.selected || [];
  const must = [];
  const should = [];

  for (const item of selected) {
    if (item.load_tier === 'always' || profile.mustSurfaces.has(item.surface)) {
      must.push(compactPathItem(item));
      continue;
    }
    if (profile.shouldSurfaces.has(item.surface)) should.push(compactPathItem(item));
  }

  return {
    must_load: must.slice(0, 14),
    should_load: should.slice(0, 10)
  };
}

function confidenceFrom({ selection, mustLoad, gaps }) {
  if (selection.activation_only || gaps.some((gap) => gap.code === 'missing_task')) return 'low';
  if (mustLoad.length === 0) return 'low';
  if (gaps.length > 0) return 'medium';
  return 'high';
}

function buildGaps({ selection, agent, mode, task, paths, mustLoad }) {
  const gaps = [];
  if (!String(task || '').trim()) {
    gaps.push({ code: 'missing_task', message: 'No concrete task was provided; package is foundation-only.' });
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

// Broad recall over the indexed corpus (incl. archived features, plans, prds,
// researchs) — the historical surface the live `select` walk cannot see. Kept
// as a SEPARATE advisory section: it never feeds must_load (select stays the
// precision gate), and is deduped against what select already selected. Off by
// default; only the agent-facing `context:brief` command opts in.
async function collectRecall(targetDir, query, selection, options) {
  if (!query) return [];
  const selectedPaths = new Set((selection.selected || []).map((item) => normalizeForRecall(item.path)));
  try {
    const pkg = await withIndex(async (idx) => {
      await idx.indexDirectory(targetDir);
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
      if (!key || selectedPaths.has(key) || seen.has(key)) continue;
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

  const selection = await selectContext(targetDir, {
    agent,
    mode,
    task,
    paths: paths.join(','),
    feature: options.feature || options.slug || '',
    semantic: options.semantic,
    noSemantic: options.noSemantic || options['no-semantic']
  });

  const profile = profileForAgent(selection.agent);
  const documents = await loadSelectedDocuments(targetDir, selection.selected || []);
  const stack = inferStack(selection, documents);
  const concerns = inferConcerns(selection, task);
  const { must_load: mustLoad, should_load: shouldLoad } = classifyLoads(selection, profile);
  const extracted = constraintsFromDocuments(documents, selection.selected || []);
  const structure = suggestedStructure(concerns);
  const profileHints = profileVerificationHints(profile, concerns);
  const constraints = dedupe([...concernConstraints(concerns), ...extracted.constraints, ...structure], 18);
  const forbiddenPatterns = dedupe(extracted.forbidden_patterns, 10);
  const verificationHints = dedupe([...extracted.verification_hints, ...profileHints], 14);
  const gaps = buildGaps({ selection, agent: selection.agent, mode: selection.mode, task, paths: selection.paths, mustLoad });

  const fallbackUsed = ['context_select'];
  if (selection.semantic && selection.semantic.enabled) fallbackUsed.push('semantic_search');
  if (selection.memory && selection.memory.length > 0) fallbackUsed.push('runtime_memory');

  const recallQuery = [task, paths.join(' '), options.feature || options.slug || ''].filter(Boolean).join(' ').trim();
  const related = recallEnabled(options) ? await collectRecall(targetDir, recallQuery, selection, options) : [];
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
    should_load: shouldLoad,
    constraints,
    forbidden_patterns: forbiddenPatterns,
    suggested_structure: structure,
    verification_hints: verificationHints,
    review_criteria: dedupe([...verificationHints, ...constraints], 18),
    memory: selection.memory || [],
    related,
    selected_count: selection.selected.length,
    semantic: selection.semantic,
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
  extractDocConstraints
};
