'use strict';

const { GENOME_TYPES, GENOME_EVIDENCE_MODES } = require('../genomes');

const DEFAULT_BINDING_PRIORITY = 100;
const DEFAULT_BINDING_MODE = 'persistent';
const DEFAULT_BINDING_SOURCE = 'manual';
const EXECUTOR_SCOPE = 'executor';
const BINDING_STATUSES = Object.freeze([
  'pending',
  'resolved',
  'compiled',
  'conflicted',
  'stale',
  'removed'
]);

function ensureArray(value) {
  return Array.isArray(value) ? value : [];
}

function normalizeText(value, fallback = '') {
  if (value === undefined || value === null) return fallback;
  return String(value).trim();
}

function normalizeSlug(value, fallback = '') {
  return normalizeText(value, fallback)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

function normalizeExecutorSlug(value, fallback = '') {
  return normalizeSlug(normalizeText(value, fallback).replace(/^@/, ''), fallback);
}

function normalizeOptionalEnum(value, allowed) {
  const normalized = normalizeText(value).toLowerCase();
  if (!normalized) return null;
  return allowed.includes(normalized) ? normalized : normalized;
}

function normalizeOptionalText(value) {
  const normalized = normalizeText(value);
  return normalized || null;
}

function normalizePriority(value, fallback = DEFAULT_BINDING_PRIORITY) {
  if (value === undefined || value === null || value === '') return fallback;
  const parsed = Number.parseInt(String(value), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeBinding(binding, fallback = {}) {
  const raw = typeof binding === 'string' ? { slug: binding } : binding && typeof binding === 'object' ? { ...binding } : {};
  const slug = normalizeSlug(raw.slug || fallback.slug);

  if (!slug) return null;

  return {
    slug,
    type: normalizeOptionalEnum(raw.type ?? fallback.type, GENOME_TYPES),
    mode: normalizeText(raw.mode || fallback.mode || DEFAULT_BINDING_MODE).toLowerCase(),
    source: normalizeText(raw.source || fallback.source || DEFAULT_BINDING_SOURCE).toLowerCase(),
    priority: normalizePriority(raw.priority, normalizePriority(fallback.priority, DEFAULT_BINDING_PRIORITY)),
    version: normalizeOptionalText(raw.version ?? fallback.version),
    evidenceMode: normalizeOptionalEnum(
      raw.evidenceMode ?? raw.evidence_mode ?? fallback.evidenceMode ?? fallback.evidence_mode,
      GENOME_EVIDENCE_MODES
    ),
    notes: normalizeOptionalText(raw.notes ?? fallback.notes),
    status: normalizeOptionalEnum(raw.status ?? fallback.status, BINDING_STATUSES) || 'pending',
    compilationId: normalizeOptionalText(
      raw.compilationId ?? raw.compilation_id ?? fallback.compilationId ?? fallback.compilation_id
    ),
    compiledAt: normalizeOptionalText(
      raw.compiledAt ?? raw.compiled_at ?? fallback.compiledAt ?? fallback.compiled_at
    ),
    sourceHash: normalizeOptionalText(
      raw.sourceHash ?? raw.source_hash ?? fallback.sourceHash ?? fallback.source_hash
    ),
    dependencies: ensureArray(raw.dependencies ?? fallback.dependencies).map((value) => normalizeText(value)).filter(Boolean),
    conflicts: ensureArray(raw.conflicts ?? fallback.conflicts).map((value) => normalizeText(value)).filter(Boolean),
    owner: normalizeOptionalText(raw.owner ?? fallback.owner),
    action: normalizeOptionalText(raw.action ?? fallback.action)
  };
}

function dedupeBindings(bindings = []) {
  const entries = new Map();
  const statusRank = {
    removed: 6,
    compiled: 5,
    resolved: 4,
    stale: 3,
    conflicted: 2,
    pending: 1
  };

  for (const binding of ensureArray(bindings)) {
    const normalized = normalizeBinding(binding);
    if (!normalized) continue;

    const current = entries.get(normalized.slug);
    if (!current) {
      entries.set(normalized.slug, normalized);
      continue;
    }

    const nextWins =
      normalized.priority > current.priority ||
      (
        normalized.priority === current.priority
        && (
          statusRank[normalized.status] > statusRank[current.status]
          || (
            statusRank[normalized.status] === statusRank[current.status]
            && JSON.stringify(normalized) !== JSON.stringify(current)
          )
        )
      );

    if (nextWins) {
      entries.set(normalized.slug, normalized);
    }
  }

  return Array.from(entries.values()).sort((left, right) => {
    if (right.priority !== left.priority) return right.priority - left.priority;
    return left.slug.localeCompare(right.slug);
  });
}

function normalizeLegacyManifestGenomes(input) {
  if (!Array.isArray(input)) {
    return {
      squad: [],
      executors: {}
    };
  }

  const squad = [];
  const executors = {};

  for (const item of input) {
    if (typeof item === 'string') {
      const normalized = normalizeBinding(item);
      if (normalized) squad.push(normalized);
      continue;
    }

    if (!item || typeof item !== 'object') continue;
    const scope = normalizeText(item.scope || item.scopeType || item.level, 'squad').toLowerCase();
    const executorSlug = normalizeExecutorSlug(item.agentSlug || item.executorSlug || item.agent || item.executor);
    const normalized = normalizeBinding(item);
    if (!normalized) continue;

    if (scope === EXECUTOR_SCOPE || scope === 'agent' || executorSlug) {
      if (!executorSlug) continue;
      executors[executorSlug] = executors[executorSlug] || [];
      executors[executorSlug].push(normalized);
      continue;
    }

    squad.push(normalized);
  }

  return {
    squad: dedupeBindings(squad),
    executors: Object.fromEntries(
      Object.entries(executors)
        .map(([slug, values]) => [slug, dedupeBindings(values)])
        .filter(([, values]) => values.length > 0)
    )
  };
}

function normalizeStructuredBindings(input = {}) {
  const source = input && typeof input === 'object' ? input : {};
  const squad = dedupeBindings(source.squad);
  const executors = {};
  const rawExecutors = source.executors && typeof source.executors === 'object' ? source.executors : {};

  for (const [executorSlug, values] of Object.entries(rawExecutors)) {
    const normalizedSlug = normalizeExecutorSlug(executorSlug);
    if (!normalizedSlug) continue;
    const resolved = dedupeBindings(values);
    if (resolved.length > 0) {
      executors[normalizedSlug] = resolved;
    }
  }

  return {
    squad,
    executors
  };
}

function normalizeGenomeBindings(input = {}) {
  if (Array.isArray(input)) {
    return normalizeLegacyManifestGenomes(input);
  }

  if (!input || typeof input !== 'object') {
    return {
      squad: [],
      executors: {}
    };
  }

  return normalizeStructuredBindings(input);
}

function normalizeLegacyExecutorGenomes(executors = []) {
  const resolved = {};

  for (const executor of ensureArray(executors)) {
    const slug = normalizeExecutorSlug(executor?.slug || executor?.name || executor?.id);
    if (!slug) continue;
    const bindings = dedupeBindings(executor?.genomes);
    if (bindings.length > 0) {
      resolved[slug] = bindings;
    }
  }

  return resolved;
}

function mergeGenomeBindings({ blueprintBindings, manifestBindings, legacyExecutors } = {}) {
  const blueprint = normalizeGenomeBindings(blueprintBindings);
  const manifest = normalizeGenomeBindings(manifestBindings);
  const legacy = normalizeStructuredBindings({
    executors: normalizeLegacyExecutorGenomes(legacyExecutors)
  });
  const executors = {};
  const executorSlugs = new Set([
    ...Object.keys(legacy.executors),
    ...Object.keys(blueprint.executors),
    ...Object.keys(manifest.executors)
  ]);

  for (const executorSlug of executorSlugs) {
    const merged = dedupeBindings([
      ...(legacy.executors[executorSlug] || []),
      ...(blueprint.executors[executorSlug] || []),
      ...(manifest.executors[executorSlug] || [])
    ]);

    if (merged.length > 0) {
      executors[executorSlug] = merged;
    }
  }

  return {
    squad: dedupeBindings([...(blueprint.squad || []), ...(manifest.squad || [])]),
    executors
  };
}

function resolveExecutorGenomes(executorSlug, genomeBindings = {}) {
  const normalizedExecutorSlug = normalizeExecutorSlug(executorSlug);
  const normalized = normalizeGenomeBindings(genomeBindings);
  return dedupeBindings([
    ...(normalized.squad || []),
    ...(normalized.executors?.[normalizedExecutorSlug] || [])
  ]);
}

function attachBindingsToExecutors(executors = [], genomeBindings = {}) {
  return ensureArray(executors).map((executor) => {
    if (!executor || typeof executor !== 'object') return executor;
    const slug = normalizeExecutorSlug(executor.slug || executor.name || executor.id);
    if (!slug) return executor;
    return {
      ...executor,
      genomes: resolveExecutorGenomes(slug, genomeBindings)
    };
  });
}

function flattenGenomeBindings(genomeBindings = {}) {
  const normalized = normalizeGenomeBindings(genomeBindings);
  const items = [];

  for (const binding of normalized.squad) {
    items.push({
      ...binding,
      scope: 'squad',
      agentSlug: null
    });
  }

  for (const [executorSlug, bindings] of Object.entries(normalized.executors)) {
    for (const binding of bindings) {
      items.push({
        ...binding,
        scope: EXECUTOR_SCOPE,
        agentSlug: executorSlug
      });
    }
  }

  return items;
}

module.exports = {
  EXECUTOR_SCOPE,
  BINDING_STATUSES,
  ensureArray,
  normalizeBinding,
  normalizeGenomeBindings,
  normalizeLegacyExecutorGenomes,
  mergeGenomeBindings,
  resolveExecutorGenomes,
  attachBindingsToExecutors,
  flattenGenomeBindings
};
