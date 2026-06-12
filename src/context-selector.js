'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const {
  parseFrontmatter,
  parseAgentList,
  appliesToAgent,
  readFileSafe,
  readProjectPulse,
  readDevState
} = require('./preflight-engine');

const VALID_MODES = new Set(['planning', 'executing']);

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
        pathPatterns: parseListValue(fm.paths || fm.globs),
        scope: fm.scope || '',
        featureSlug: fm.feature_slug || fm.feature || inferred.featureSlug || '',
        tags: [...new Set([...parseListValue(fm.tags), ...inferred.tags])],
        loadTier: fm.load_tier || inferred.loadTier || surface.defaultTier
      });
    }
  }

  return candidates;
}

function keywordMatches(haystack, needles) {
  const normalizedHaystack = normalizeToken(haystack);
  const haystackWords = new Set(normalizedHaystack.split(/\s+/).flatMap(wordVariants));
  return needles.filter((needle) => {
    const normalizedNeedle = normalizeToken(needle);
    if (!normalizedNeedle) return false;
    if (normalizedHaystack.includes(normalizedNeedle)) return true;
    const words = normalizedNeedle.split(/\s+/).filter((word) => word.length >= 4);
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
  if (matchedPaths.length > 0) {
    score += 10;
    reasons.push(`paths:${matchedPaths.slice(0, 3).join(',')}`);
  }

  const activeFeature = context.feature || context.activeFeature || '';
  if (context.activationOnly && candidate.featureSlug && !context.feature) {
    return null;
  }
  if (candidate.featureSlug && activeFeature && candidate.featureSlug === activeFeature) {
    score += 45;
    reasons.push(`feature:${candidate.featureSlug}`);
  }

  if (candidate.featureSlug && context.lookup.includes(normalizeToken(candidate.featureSlug).replace(/-/g, ' '))) {
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
    agent,
    mode,
    task,
    paths.join(' '),
    activeFeature
  ].filter(Boolean).join(' '));

  const candidates = await collectCandidates(targetDir);
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
      activationOnly
    });
    if (scored) selected.push(scored);
  }

  selected.sort((a, b) => b.score - a.score || a.path.localeCompare(b.path));

  return {
    ok: true,
    agent,
    mode,
    task,
    paths,
    feature: feature || null,
    active_feature: activeFeature || null,
    activation_only: activationOnly,
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
