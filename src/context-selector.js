'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const Database = require('better-sqlite3');
const {
  parseFrontmatter,
  parseAgentList,
  appliesToAgent,
  readFileSafe,
  readProjectPulse,
  readDevState
} = require('./preflight-engine');
const { openRuntimeDb } = require('./runtime-store');
const { searchProjectLearnings } = require('./learning-loop-fts5');

const VALID_MODES = new Set(['planning', 'executing']);
const SEMANTIC_MAX_TERMS = 24;
const SEMANTIC_RESULT_LIMIT = 80;
const MEMORY_RESULT_LIMIT = 5;

const SHORT_SEMANTIC_TERMS = new Set(['api', 'sql', 'orm', 'php', 'mvc', 'dto', 'ui', 'ux']);
const KNOWN_FRAMEWORK_TERMS = new Set([
  'adonis', 'angular', 'astro', 'django', 'express', 'fastapi', 'flask', 'hono',
  'laravel', 'next', 'node', 'nuxt', 'phoenix', 'rails', 'react', 'remix',
  'svelte', 'symfony', 'vue'
]);

const SEMANTIC_STOP_WORDS = new Set([
  'a', 'an', 'and', 'as', 'by', 'com', 'como', 'da', 'das', 'de', 'do', 'dos',
  'e', 'em', 'for', 'from', 'in', 'into', 'no', 'nos', 'o', 'os', 'of', 'on',
  'ou', 'para', 'por', 'que', 'the', 'to', 'um', 'uma', 'with',
  'agent', 'agente', 'agents', 'aioson', 'dev', 'deyvin', 'architect',
  'feature', 'funcionalidade', 'task', 'tarefa', 'work', 'trabalho',
  'create', 'criar', 'fazer', 'implementar', 'implement', 'implementation',
  'nova', 'novo', 'new', 'ajuste', 'change', 'update',
  'evitar', 'exposto', 'http',
  'boundary', 'code', 'codigo', 'código', 'component', 'developer', 'model',
  'module', 'script', 'source', 'test'
]);

const SEMANTIC_SYNONYMS = new Map([
  ['ingles', ['english']],
  ['english', ['ingles']],
  ['fonte', []],
  ['padrao', ['pattern', 'convention']],
  ['padroes', ['patterns', 'conventions']],
  ['pattern', ['convention']],
  ['patterns', ['conventions']],
  ['pasta', ['folder', 'directory']],
  ['pastas', ['folders', 'directories']],
  ['folder', ['directory']],
  ['folders', ['directories']],
  ['componentizacao', ['componentization']],
  ['componentizando', ['componentization']],
  ['componentizar', ['componentization']],
  ['separacao', ['separation', 'boundary']],
  ['separar', ['separation', 'boundary']],
  ['manutencao', ['maintainability']],
  ['manutenivel', ['maintainable']],
  ['consulta', ['query', 'queries']],
  ['consultas', ['query', 'queries']],
  ['query', ['queries']],
  ['queries', ['query']],
  ['banco', ['database', 'data']],
  ['dados', ['data', 'database']],
  ['frameworks', ['framework']],
  ['framework', ['convention']],
  ['laravel', ['eloquent', 'artisan']],
  ['php', ['laravel']],
  ['controller', ['controllers']],
  ['controllers', ['controller']],
  ['service', ['services']],
  ['services', ['service']],
  ['repository', ['repositories']],
  ['repositories', ['repository']],
  ['migration', ['migrations']],
  ['migrations', ['migration']],
  ['eloquent', ['laravel']],
  ['raw', ['sql']],
  ['sql', ['query', 'database']]
]);

const SURFACES = [
  { key: 'rules', dir: path.join('.aioson', 'rules'), recursive: false, defaultTier: 'trigger' },
  { key: 'docs', dir: path.join('.aioson', 'docs'), recursive: true, defaultTier: 'trigger' },
  { key: 'design_governance', dir: path.join('.aioson', 'design-docs'), recursive: false, defaultTier: 'trigger' },
  { key: 'context', dir: path.join('.aioson', 'context'), recursive: false, defaultTier: 'trigger' },
  { key: 'bootstrap', dir: path.join('.aioson', 'context', 'bootstrap'), recursive: false, defaultTier: 'trigger' },
  { key: 'feature_dossier', dir: path.join('.aioson', 'context', 'features'), recursive: true, defaultTier: 'trigger' }
];

const FOUNDATION_CONTEXT_BASENAMES = new Set([
  'project.context.md',
  'project-pulse.md',
  'dev-state.md',
  'memory-index.md'
]);

const FOUNDATION_ACTIVATION_PATHS = new Set([
  '.aioson/context/project.context.md',
  '.aioson/context/project-pulse.md'
]);

const FOUNDATION_ACTIVATION_AGENTS = [
  'briefing',
  'product',
  'sheldon',
  'analyst',
  'architect',
  'ux-ui',
  'pm',
  'qa',
  'orchestrator',
  'scope-check',
  'discovery-design-doc'
];

const ACTIVATION_ONLY_CONTEXT_PATHS_BY_AGENT = new Map([
  [
    'deyvin',
    new Set([...FOUNDATION_ACTIVATION_PATHS, '.aioson/context/dev-state.md'])
  ],
  ...FOUNDATION_ACTIVATION_AGENTS.map((agent) => [agent, FOUNDATION_ACTIVATION_PATHS])
]);

const UNIVERSAL_ALWAYS_CONTEXT_BASENAMES = new Set([
  'project.context.md',
  'project-pulse.md'
]);

const AGENT_ALWAYS_CONTEXT_BASENAMES = new Map([
  ['dev', new Set(['dev-state.md', 'memory-index.md'])],
  ['deyvin', new Set(['dev-state.md', 'memory-index.md'])]
]);

function normalizeSlashes(value) {
  return String(value || '').replace(/\\/g, '/').replace(/^\.\//, '');
}

function normalizeToken(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[`*_]/g, '')
    .replace(/[^a-z0-9/-]+/g, ' ')
    .trim();
}

function normalizeFeaturePointer(value) {
  const normalized = normalizeToken(value).replace(/\s+/g, '-');
  if (!normalized || normalized === 'none' || normalized === '-none-' || normalized === '-') return '';
  return normalized;
}

function isActivationOnlyTask(agent, mode, task) {
  if (!ACTIVATION_ONLY_CONTEXT_PATHS_BY_AGENT.has(agent) || mode !== 'planning') return false;
  const normalized = normalizeToken(task);
  if (!normalized) return true;
  return (
    normalized.includes('agent activation') ||
    normalized.includes('activation only') ||
    normalized.includes('without concrete task') ||
    normalized.includes('no concrete task')
  );
}

function parseListValue(value) {
  if (value === undefined || value === null) return [];
  const raw = String(value).trim();
  if (!raw || raw === '[]') return [];
  if (raw.startsWith('[') && raw.endsWith(']')) {
    return raw
      .slice(1, -1)
      .split(',')
      .map((item) => item.trim().replace(/^["']|["']$/g, ''))
      .filter(Boolean);
  }
  return raw
    .split(',')
    .map((item) => item.trim().replace(/^["']|["']$/g, ''))
    .filter(Boolean);
}

function semanticSearchEnabled(options) {
  const raw = options.semantic;
  if (raw === false) return false;
  if (typeof raw === 'string' && raw.trim().toLowerCase() === 'false') return false;
  if (options.noSemantic === true || options['no-semantic'] === true) return false;
  return true;
}

function modeFromOptions(mode) {
  const normalized = normalizeToken(mode || 'planning');
  return VALID_MODES.has(normalized) ? normalized : 'planning';
}

function escapeRegex(value) {
  return String(value).replace(/[|\\{}()[\]^$+?.]/g, '\\$&');
}

function globToRegex(glob) {
  const normalized = normalizeSlashes(glob);
  let out = '^';
  for (let i = 0; i < normalized.length; i += 1) {
    const char = normalized[i];
    const next = normalized[i + 1];
    if (char === '*' && next === '*') {
      out += '.*';
      i += 1;
    } else if (char === '*') {
      out += '[^/]*';
    } else {
      out += escapeRegex(char);
    }
  }
  out += '$';
  return new RegExp(out);
}

function pathMatchesPattern(filePath, pattern) {
  const file = normalizeSlashes(filePath);
  const normalizedPattern = normalizeSlashes(pattern);
  if (!file || !normalizedPattern) return false;
  if (normalizedPattern.endsWith('/**')) {
    const prefix = normalizedPattern.slice(0, -3);
    return file === prefix || file.startsWith(`${prefix}/`);
  }
  if (!normalizedPattern.includes('*')) {
    return file === normalizedPattern || file.startsWith(`${normalizedPattern}/`);
  }
  return globToRegex(normalizedPattern).test(file);
}

function splitOptionList(value) {
  if (Array.isArray(value)) return value.map(String).filter(Boolean);
  return String(value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

async function walkMarkdown(rootDir, relDir, recursive) {
  const absDir = path.join(rootDir, relDir);
  const out = [];
  let entries;
  try {
    entries = await fs.readdir(absDir, { withFileTypes: true });
  } catch {
    return out;
  }

  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue;
    const childRel = path.join(relDir, entry.name);
    if (entry.isDirectory()) {
      if (recursive) out.push(...await walkMarkdown(rootDir, childRel, recursive));
      continue;
    }
    if (!entry.isFile() || !entry.name.endsWith('.md')) continue;
    if (entry.name.toLowerCase() === 'readme.md') continue;
    out.push(normalizeSlashes(childRel));
  }
  return out.sort();
}

function inferContextMetadata(relPath, fm) {
  const base = path.basename(relPath);
  const slugMatch = base.match(/^(prd|requirements|spec|design-doc|readiness|implementation-plan|ui-spec|scope-check)-(.+)\.md$/);
  const tags = [];
  let featureSlug = fm.feature_slug || fm.feature || '';
  let loadTier = fm.load_tier || 'trigger';

  if (FOUNDATION_CONTEXT_BASENAMES.has(base)) {
    if (UNIVERSAL_ALWAYS_CONTEXT_BASENAMES.has(base)) {
      loadTier = fm.load_tier || 'always';
    }
    tags.push('foundation');
  }
  if (slugMatch) {
    tags.push(slugMatch[1], 'feature');
    if (!featureSlug) featureSlug = slugMatch[2];
  }
  if (base === 'discovery.md') tags.push('discovery', 'project-memory', 'entities', 'business-rules');
  if (base === 'architecture.md') tags.push('architecture', 'technical-design', 'module-boundary');
  if (base === 'ui-spec.md') tags.push('ui-spec', 'ui', 'ux', 'frontend', 'visual-design');
  if (base === 'scope-check.md') tags.push('scope-check', 'alignment', 'pre-dev');
  if (relPath.includes('/bootstrap/')) tags.push('bootstrap');
  if (relPath.includes('/features/') && base === 'dossier.md') {
    tags.push('feature', 'dossier');
    if (!featureSlug) {
      const parts = relPath.split('/');
      const index = parts.indexOf('features');
      if (index !== -1) featureSlug = parts[index + 1] || '';
    }
  }

  return { tags, featureSlug, loadTier };
}

async function collectCandidates(targetDir) {
  const candidates = [];

  for (const surface of SURFACES) {
    const relPaths = await walkMarkdown(targetDir, surface.dir, surface.recursive);
    for (const relPath of relPaths) {
      if (surface.key === 'feature_dossier' && !relPath.endsWith('/dossier.md')) continue;
      const absPath = path.join(targetDir, relPath);
      const content = await readFileSafe(absPath);
      if (!content) continue;
      const stat = await fs.stat(absPath).catch(() => null);
      const fm = parseFrontmatter(content);
      const inferred = inferContextMetadata(relPath, fm);
      const description = fm.description || fm.name || path.basename(relPath, '.md');
      candidates.push({
        path: relPath,
        surface: surface.key,
        size: stat ? stat.size : content.length,
        frontmatter: fm,
        description,
        agents: parseAgentList(fm.agents),
        modes: parseListValue(fm.modes),
        taskTypes: parseListValue(fm.task_types || fm.taskTypes),
        triggers: parseListValue(fm.triggers),
        aliases: parseListValue(fm.aliases || fm.alias),
        entities: parseListValue(fm.entities || fm.entity),
        retrievalIntents: parseListValue(fm.retrieval_intents || fm.intents || fm.intent),
        pathPatterns: parseListValue(fm.paths || fm.globs),
        scope: fm.scope || '',
        featureSlug: fm.feature_slug || fm.feature || inferred.featureSlug || '',
        tags: [...new Set([...parseListValue(fm.tags), ...inferred.tags])],
        loadTier: fm.load_tier || inferred.loadTier || surface.defaultTier,
        searchText: content.slice(0, 100_000)
      });
    }
  }

  return candidates;
}

function normalizeForSemantic(value) {
  return normalizeToken(value).replace(/[/-]+/g, ' ');
}

function addSemanticTerm(out, term) {
  const normalized = normalizeForSemantic(term).trim();
  if (!normalized) return;
  for (const part of normalized.split(/\s+/)) {
    if (!part) continue;
    if (SEMANTIC_STOP_WORDS.has(part)) continue;
    if (part.length < 4 && !SHORT_SEMANTIC_TERMS.has(part)) continue;
    out.add(part);
    if (part.endsWith('s') && part.length > 4) out.add(part.slice(0, -1));
    const synonyms = SEMANTIC_SYNONYMS.get(part) || [];
    for (const synonym of synonyms) out.add(synonym);
  }
}

function projectSemanticTerms(candidates) {
  const project = candidates.find((candidate) => candidate.path === '.aioson/context/project.context.md');
  if (!project) return [];
  const fm = project.frontmatter || {};
  return [
    fm.framework
  ].filter(Boolean);
}

function buildSemanticTerms({ task, paths, feature, activeFeature }, candidates) {
  const terms = new Set();
  const rawValues = [
    task,
    paths.join(' '),
    feature,
    activeFeature
  ].filter(Boolean);

  for (const raw of rawValues) addSemanticTerm(terms, raw);
  const taskAlreadyNamesFramework = [...terms].some((term) => KNOWN_FRAMEWORK_TERMS.has(term));
  if (!taskAlreadyNamesFramework) {
    for (const raw of projectSemanticTerms(candidates)) addSemanticTerm(terms, raw);
  }
  return [...terms].slice(0, SEMANTIC_MAX_TERMS);
}

function buildFtsQuery(terms) {
  return terms
    .map((term) => `"${String(term).replace(/"/g, '').trim()}"`)
    .filter((term) => term !== '""')
    .join(' OR ');
}

function semanticBaseScore(candidate) {
  if (candidate.surface === 'rules') return 26;
  if (candidate.surface === 'design_governance') return 24;
  if (candidate.surface === 'docs') return 22;
  if (candidate.surface === 'bootstrap') return 24;
  if (candidate.surface === 'feature_dossier') return 18;
  return 16;
}

function semanticMinimumTerms(candidate) {
  if (candidate.surface === 'docs') return 4;
  if (candidate.surface === 'bootstrap') return 3;
  if (candidate.surface === 'context') return 3;
  return 3;
}

function semanticCandidateAllowed(candidate) {
  const base = path.basename(candidate.path);
  if (candidate.loadTier === 'always') return false;
  if (candidate.surface === 'bootstrap') return base !== 'current-state-archive.md';
  if (candidate.surface === 'context') {
    if (candidate.featureSlug) return true;
    return base === 'design-doc.md' || base === 'readiness.md';
  }
  return ['rules', 'design_governance', 'docs', 'feature_dossier'].includes(candidate.surface);
}

function matchSemanticTerms(candidate, terms) {
  const haystack = normalizeForSemantic([
    candidate.path,
    candidate.description,
    candidate.scope,
    candidate.tags.join(' '),
    candidate.searchText
  ].join(' '));
  return terms.filter((term) => haystack.includes(term));
}

function buildLexicalSemanticMatches(candidates, terms) {
  const matches = new Map();
  if (terms.length === 0) return matches;

  for (const candidate of candidates) {
    if (!semanticCandidateAllowed(candidate)) continue;
    const matched = matchSemanticTerms(candidate, terms);
    if (matched.length === 0) continue;
    const score = Math.min(50, semanticBaseScore(candidate) + matched.length * 7);
    matches.set(candidate.path, {
      score,
      terms: matched.slice(0, 6),
      reason: `semantic:${matched.slice(0, 6).join(',')}`
    });
  }

  return matches;
}

function buildSemanticMatches(candidates, terms) {
  if (terms.length === 0) return new Map();
  const query = buildFtsQuery(terms);
  if (!query) return new Map();

  let db;
  try {
    db = new Database(':memory:');
    db.exec(`
      CREATE VIRTUAL TABLE candidates USING fts5(
        candidate_id UNINDEXED,
        path,
        title,
        body,
        tokenize = "unicode61 remove_diacritics 2"
      );
    `);
    const insert = db.prepare('INSERT INTO candidates (candidate_id, path, title, body) VALUES (?, ?, ?, ?)');
    const insertMany = db.transaction((items) => {
      for (let i = 0; i < items.length; i += 1) {
        const candidate = items[i];
        insert.run(
          i,
          candidate.path,
          candidate.description || path.basename(candidate.path),
          [
            candidate.path,
            candidate.description,
            candidate.scope,
            candidate.tags.join(' '),
            candidate.searchText
          ].join('\n')
        );
      }
    });
    insertMany(candidates);

    const rows = db.prepare(`
      SELECT candidate_id
      FROM candidates
      WHERE candidates MATCH ?
      ORDER BY rank
      LIMIT ?
    `).all(query, SEMANTIC_RESULT_LIMIT);

    const matches = new Map();
    for (const row of rows) {
      const candidate = candidates[Number(row.candidate_id)];
      if (!candidate) continue;
      if (!semanticCandidateAllowed(candidate)) continue;
      const matched = matchSemanticTerms(candidate, terms);
      if (matched.length === 0) continue;
      const score = Math.min(50, semanticBaseScore(candidate) + matched.length * 7);
      matches.set(candidate.path, {
        score,
        terms: matched.slice(0, 6),
        reason: `semantic:${matched.slice(0, 6).join(',')}`
      });
    }
    return matches;
  } catch {
    return buildLexicalSemanticMatches(candidates, terms);
  } finally {
    if (db) db.close();
  }
}

async function collectMemoryMatches(targetDir, terms) {
  if (terms.length === 0) return [];
  const query = terms.slice(0, 8).join(' ');
  if (!query) return [];

  let handle = null;
  try {
    handle = await openRuntimeDb(targetDir, { mustExist: true });
    if (!handle || !handle.db) return [];
    const outcome = searchProjectLearnings(handle.db, {
      query,
      limit: MEMORY_RESULT_LIMIT,
      surface: 'all',
      includeArchived: false
    });
    if (!outcome.ok) return [];
    return outcome.results.map((result) => ({
      surface: 'memory',
      target_type: result.target_type,
      target_id: result.target_id,
      feature_slug: result.feature_slug || '',
      status: result.status,
      score: result.score,
      snippet: result.snippet || '',
      reason: `memory_fts:${query}`
    }));
  } catch {
    return [];
  } finally {
    if (handle && handle.db) handle.db.close();
  }
}

function keywordMatches(haystack, needles) {
  const normalizedHaystack = normalizeToken(haystack);
  const haystackWords = new Set(normalizedHaystack.split(/\s+/).flatMap(wordVariants));
  return needles.filter((needle) => {
    const normalizedNeedle = normalizeToken(needle);
    if (!normalizedNeedle) return false;
    const needleTokens = normalizedNeedle.split(/\s+/).filter(Boolean);
    // Short single-token needles (e.g. alias "ui", entity "api") must match on a
    // word boundary. A bare substring check false-fires inside "build"/"require"/
    // "rapid", which pollutes selection scoring and — via the entities/aliases
    // salience gate — makes context:guard inject unrelated rules.
    if (needleTokens.length === 1 && normalizedNeedle.length <= 3) {
      return wordVariants(normalizedNeedle).some((variant) => haystackWords.has(variant));
    }
    if (normalizedHaystack.includes(normalizedNeedle)) return true;
    const words = needleTokens.filter((word) => word.length >= 4);
    if (words.length === 0) return false;
    const hits = words.filter((word) => wordVariants(word).some((variant) => haystackWords.has(variant))).length;
    return hits >= Math.min(2, words.length);
  });
}

function wordVariants(word) {
  const raw = String(word || '').trim();
  if (!raw) return [];
  const variants = new Set([raw]);
  if (raw.endsWith('ing') && raw.length > 5) {
    const stem = raw.slice(0, -3);
    variants.add(stem);
    variants.add(`${stem}e`);
  }
  if (raw.endsWith('s') && raw.length > 4) variants.add(raw.slice(0, -1));
  return [...variants];
}

function scoreCandidate(candidate, context) {
  const reasons = [];
  let score = 0;
  let effectiveLoadTier = candidate.loadTier;
  const base = path.basename(candidate.path);

  if (!appliesToAgent(candidate.frontmatter, context.agent)) return null;
  if (context.activationOnly) {
    const allowedActivationPaths = ACTIVATION_ONLY_CONTEXT_PATHS_BY_AGENT.get(context.agent);
    if (!allowedActivationPaths || !allowedActivationPaths.has(candidate.path)) return null;
  }

  if (candidate.modes.length > 0 && !candidate.modes.map(normalizeToken).includes(context.mode)) {
    return null;
  }
  if (candidate.modes.length > 0) {
    score += 5;
    reasons.push(`mode:${context.mode}`);
  }

  const agentAlways = AGENT_ALWAYS_CONTEXT_BASENAMES.get(context.agent);
  if (agentAlways && agentAlways.has(base)) {
    effectiveLoadTier = 'always';
    score += 100;
    reasons.push('load_tier:always');
  } else if (candidate.loadTier === 'always') {
    score += 100;
    reasons.push('load_tier:always');
  }

  const matchedPaths = [];
  for (const requestedPath of context.paths) {
    for (const pattern of candidate.pathPatterns) {
      if (pathMatchesPattern(requestedPath, pattern)) matchedPaths.push(`${requestedPath}~${pattern}`);
    }
  }
  const directPathMatch = context.paths.some((requestedPath) => {
    const normalized = normalizeSlashes(requestedPath);
    return normalized === candidate.path || pathMatchesPattern(candidate.path, normalized);
  });
  if (matchedPaths.length > 0) {
    score += 10;
    reasons.push(`paths:${matchedPaths.slice(0, 3).join(',')}`);
  }
  if (directPathMatch) {
    score += 10;
    reasons.push('paths:direct');
  }

  const activeFeature = context.feature || context.activeFeature || '';
  const featureMentioned = candidate.featureSlug
    && context.lookup.includes(normalizeToken(candidate.featureSlug).replace(/-/g, ' '));
  if (context.activationOnly && candidate.featureSlug && !context.feature) {
    return null;
  }
  if (candidate.featureSlug && candidate.featureSlug !== activeFeature && !featureMentioned && !directPathMatch) {
    return null;
  }
  if (candidate.featureSlug && activeFeature && candidate.featureSlug === activeFeature) {
    score += 45;
    reasons.push(`feature:${candidate.featureSlug}`);
  }

  if (featureMentioned) {
    score += 45;
    reasons.push(`feature-mentioned:${candidate.featureSlug}`);
  }

  const matchedTaskTypes = keywordMatches(context.lookup, candidate.taskTypes);
  if (matchedTaskTypes.length > 0) {
    score += 40;
    reasons.push(`task_types:${matchedTaskTypes.slice(0, 3).join(',')}`);
  }

  const matchedTriggers = keywordMatches(context.lookup, candidate.triggers);
  if (matchedTriggers.length > 0) {
    score += 40;
    reasons.push(`triggers:${matchedTriggers.slice(0, 3).join(',')}`);
  }

  const matchedAliases = keywordMatches(context.lookup, candidate.aliases);
  if (matchedAliases.length > 0) {
    score += 35;
    reasons.push(`aliases:${matchedAliases.slice(0, 3).join(',')}`);
  }

  const matchedEntities = keywordMatches(context.lookup, candidate.entities);
  if (matchedEntities.length > 0) {
    score += 30;
    reasons.push(`entities:${matchedEntities.slice(0, 3).join(',')}`);
  }

  const matchedRetrievalIntents = keywordMatches(context.lookup, candidate.retrievalIntents);
  if (matchedRetrievalIntents.length > 0) {
    score += 25;
    reasons.push(`retrieval_intents:${matchedRetrievalIntents.slice(0, 3).join(',')}`);
  }

  const matchedTags = keywordMatches(context.lookup, candidate.tags);
  if (matchedTags.length > 0) {
    score += 20;
    reasons.push(`tags:${matchedTags.slice(0, 3).join(',')}`);
  }

  const descriptionHits = keywordMatches(context.lookup, [
    candidate.description,
    candidate.scope,
    path.basename(candidate.path, '.md').replace(/-/g, ' ')
  ]);
  if (descriptionHits.length > 0) {
    score += 20;
    reasons.push(`description:${descriptionHits.slice(0, 2).join(',')}`);
  }

  const semanticHit = context.semanticMatches && context.semanticMatches.get(candidate.path);
  const featureRouted = Boolean(
    (candidate.featureSlug && activeFeature && candidate.featureSlug === activeFeature) || featureMentioned
  );
  const hardRoutingHit = matchedPaths.length > 0
    || directPathMatch
    || matchedTaskTypes.length > 0
    || matchedTriggers.length > 0
    || matchedAliases.length > 0
    || matchedEntities.length > 0
    || matchedRetrievalIntents.length > 0
    || featureRouted;
  const weakJustifiedSemanticHit = candidate.loadTier === 'justified' && semanticHit && semanticHit.terms.length < 3;
  const weakPureSemanticHit = semanticHit && !hardRoutingHit && semanticHit.terms.length < semanticMinimumTerms(candidate);
  if (semanticHit && effectiveLoadTier !== 'always' && !weakJustifiedSemanticHit && !weakPureSemanticHit) {
    score += semanticHit.score;
    reasons.push(semanticHit.reason);
  }

  const threshold = effectiveLoadTier === 'justified' ? 50 : 30;
  if (score < threshold) return null;

  return {
    path: candidate.path,
    surface: candidate.surface,
    load_tier: effectiveLoadTier,
    size: candidate.size,
    score,
    reason: reasons.join('; ')
  };
}

async function selectContext(targetDir, options = {}) {
  const agent = normalizeToken(options.agent || 'dev');
  const mode = modeFromOptions(options.mode);
  const task = String(options.task || options.goal || '').trim();
  const paths = splitOptionList(options.paths || options.path).map(normalizeSlashes);
  const feature = normalizeFeaturePointer(options.feature || options.slug || '');
  const activationOnly = isActivationOnlyTask(agent, mode, task);

  const pulse = await readProjectPulse(targetDir);
  const devState = await readDevState(targetDir);
  const activeFeature = normalizeFeaturePointer(
    feature || pulse.active_feature || devState.active_feature || ''
  );

  const lookup = normalizeToken([
    task,
    paths.join(' '),
    activeFeature
  ].filter(Boolean).join(' '));

  const candidates = await collectCandidates(targetDir);
  const semanticEnabled = semanticSearchEnabled(options) && !activationOnly;
  const semanticTerms = semanticEnabled
    ? buildSemanticTerms({ task, paths, feature, activeFeature }, candidates)
    : [];
  const semanticMatches = semanticEnabled
    ? buildSemanticMatches(candidates, semanticTerms)
    : new Map();
  const selected = [];
  for (const candidate of candidates) {
    const scored = scoreCandidate(candidate, {
      agent,
      mode,
      task,
      paths,
      feature,
      activeFeature,
      lookup,
      activationOnly,
      semanticMatches
    });
    if (scored) selected.push(scored);
  }

  selected.sort((a, b) => b.score - a.score || a.path.localeCompare(b.path));
  const memory = semanticEnabled ? await collectMemoryMatches(targetDir, semanticTerms) : [];

  return {
    ok: true,
    agent,
    mode,
    task,
    paths,
    feature: feature || null,
    active_feature: activeFeature || null,
    activation_only: activationOnly,
    semantic: {
      enabled: semanticEnabled,
      terms: semanticTerms
    },
    memory,
    selected
  };
}

module.exports = {
  selectContext,
  collectCandidates,
  parseListValue,
  pathMatchesPattern,
  isActivationOnlyTask
};
