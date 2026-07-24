'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { readGenomeSource, genomeExists } = require('../genome-files');
const {
  normalizeBinding,
  normalizeGenomeBindings,
  resolveExecutorGenomes
} = require('../genomes/bindings');

const MANAGED_START = '<!-- AIOSON:GENOME-COMPILED:BEGIN -->';
const MANAGED_END = '<!-- AIOSON:GENOME-COMPILED:END -->';

function sha256(value) {
  return createHash('sha256').update(String(value || ''), 'utf8').digest('hex');
}

function cleanLine(line) {
  return String(line || '')
    .replace(/^\s*(?:[-*+]|\d+[.)])\s+/, '')
    .replace(/^\s*\|/, '')
    .replace(/\|\s*$/, '')
    .replace(/\s*\|\s*/g, ' — ')
    .replace(/\*\*/g, '')
    .trim();
}

function extractActionableLines(content, options = {}) {
  const include = options.include || (() => true);
  const lines = String(content || '').split(/\r?\n/);
  const output = [];
  let inFrontmatter = lines[0]?.trim() === '---';
  let inCodeFence = false;
  for (let index = 0; index < lines.length; index++) {
    const raw = lines[index];
    if (index > 0 && inFrontmatter && raw.trim() === '---') {
      inFrontmatter = false;
      continue;
    }
    if (inFrontmatter) continue;
    if (raw.trim().startsWith('```')) {
      inCodeFence = !inCodeFence;
      continue;
    }
    if (inCodeFence || !/^\s*(?:[-*+]|\d+[.)]|\|)/.test(raw)) continue;
    const line = cleanLine(raw);
    if (line.length < 12 || /^[-:|\s]+$/.test(line) || !include(line)) continue;
    if (!output.includes(line)) output.push(line);
    if (output.length >= Number(options.limit || 12)) break;
  }
  return output;
}

function flattenLegacySection(entries) {
  return (entries || []).map((entry) => {
    if (typeof entry === 'string') return entry;
    if (entry && typeof entry === 'object') {
      return entry.content || entry.description || entry.name || JSON.stringify(entry);
    }
    return String(entry || '');
  }).filter(Boolean);
}

function compileEffects(source) {
  const effects = {
    procedure: [],
    restrictions: [],
    checklist: [],
    style: [],
    outputContract: []
  };

  if (source.kind === 'single-file' && source.genome?.sections) {
    const sections = source.genome.sections;
    effects.procedure.push(
      ...flattenLegacySection(sections.methodologies),
      ...flattenLegacySection(sections.frameworks),
      ...flattenLegacySection(sections.applicationNotes)
    );
    effects.restrictions.push(
      ...flattenLegacySection(sections.biases),
      ...flattenLegacySection(sections.conflictResolution)
    );
    effects.checklist.push(...flattenLegacySection(sections.heuristics));
    effects.style.push(...flattenLegacySection(sections.communicationStyle));
    effects.outputContract.push(...flattenLegacySection(sections.frameworks));
  }

  for (const document of source.documents || []) {
    const key = `${document.id} ${document.path}`.toLowerCase();
    if (/method|framework|application|skill|playbook/.test(key)) {
      effects.procedure.push(...extractActionableLines(document.content, { limit: 8 }));
    }
    if (/heuristic|decision|axiom|constraint|anti|method|application/.test(key)) {
      effects.restrictions.push(...extractActionableLines(document.content, {
        limit: 8,
        include: (line) => /\b(must|never|not|avoid|only|before|after|if|when|sempre|nunca|nao|não|evite|antes|depois|se|quando)\b/i.test(line)
      }));
    }
    if (/heuristic|checklist|quality|method|framework/.test(key)) {
      effects.checklist.push(...extractActionableLines(document.content, { limit: 10 }));
    }
    if (/voice|communication|identity|style|application/.test(key)) {
      effects.style.push(...extractActionableLines(document.content, { limit: 6 }));
    }
    if (/framework|output|format|application|skill/.test(key)) {
      effects.outputContract.push(...extractActionableLines(document.content, {
        limit: 8,
        include: (line) => /\b(output|structure|format|section|deliver|response|headline|cta|sa[ií]da|estrutura|formato|se[cç][aã]o|entrega|resposta)\b/i.test(line)
      }));
    }
  }

  for (const key of Object.keys(effects)) {
    effects[key] = [...new Set(effects[key].map(cleanLine).filter((line) => line.length >= 12))].slice(0, 12);
  }
  return effects;
}

function hasOperationalEffect(effects) {
  return Object.values(effects).some((entries) => Array.isArray(entries) && entries.length > 0);
}

async function compileGenomeBinding({ projectRoot, binding, executorSlug }) {
  const normalized = normalizeBinding(binding);
  if (!normalized) return { status: 'pending', reason: 'invalid-binding', binding: null };
  if (normalized.status === 'removed') {
    return { status: 'removed', reason: 'binding-removed', binding: normalized, effects: null };
  }
  if (normalized.conflicts.length > 0) {
    return {
      status: 'conflicted',
      reason: `declared-conflicts:${normalized.conflicts.join(',')}`,
      binding: normalized,
      effects: null
    };
  }

  let source;
  try {
    source = await readGenomeSource(projectRoot, normalized.slug);
  } catch (error) {
    return {
      status: 'pending',
      reason: error.message,
      binding: normalized,
      effects: null
    };
  }

  const sourceVersion = String(
    source.manifest?.version
    || source.manifest?.schemaVersion
    || source.genome?.version
    || 'legacy'
  );
  const sourceHash = sha256(
    JSON.stringify(source.manifest || {})
    + (source.documents || []).map((document) => `${document.path}:${document.content}`).join('\n')
  );
  if (normalized.version && String(normalized.version) !== sourceVersion) {
    return {
      status: 'stale',
      reason: `binding-version-${normalized.version}-source-version-${sourceVersion}`,
      binding: normalized,
      sourceHash,
      sourceVersion,
      effects: null
    };
  }

  const dependencies = source.manifest?.dependencies?.genomes || normalized.dependencies || [];
  const missingDependencies = [];
  for (const dependency of dependencies) {
    if (!(await genomeExists(projectRoot, dependency)) && !await folderGenomeExists(projectRoot, dependency)) {
      missingDependencies.push(dependency);
    }
  }
  if (missingDependencies.length > 0) {
    return {
      status: 'pending',
      reason: `missing-dependencies:${missingDependencies.join(',')}`,
      binding: normalized,
      sourceHash,
      sourceVersion,
      dependencies,
      effects: null
    };
  }

  const effects = compileEffects(source);
  if (!hasOperationalEffect(effects)) {
    return {
      status: 'conflicted',
      reason: 'null-operational-effect',
      binding: normalized,
      sourceHash,
      sourceVersion,
      effects
    };
  }

  const compilationId = sha256(JSON.stringify({
    slug: normalized.slug,
    sourceVersion,
    sourceHash,
    executorSlug,
    effects
  }));
  return {
    status: 'compiled',
    reason: null,
    binding: normalized,
    sourceHash,
    sourceVersion,
    compilationId,
    dependencies,
    effects,
    sourcePaths: (source.documents || []).map((document) => document.path)
  };
}

async function folderGenomeExists(projectRoot, slug) {
  try {
    await fs.access(path.join(projectRoot, '.aioson', 'genomes', slug, 'manifest.json'));
    return true;
  } catch {
    return false;
  }
}

function renderEffectList(entries, fallback) {
  if (!entries || entries.length === 0) return `- ${fallback}`;
  return entries.map((entry) => `- ${entry}`).join('\n');
}

function renderCompiledBlock(executorSlug, compilations) {
  const compiled = compilations.filter((item) => item.status === 'compiled');
  const combine = (key) => compiled.flatMap((item) => (
    item.effects[key].map((entry) => `[${item.binding.slug}] ${entry}`)
  ));
  return [
    MANAGED_START,
    '## Compiled genome method',
    '',
    `Executor: \`${executorSlug}\``,
    `Compilation IDs: ${compiled.map((item) => `\`${item.compilationId}\``).join(', ') || 'none'}`,
    '',
    '### Procedure',
    renderEffectList(combine('procedure'), 'No compiled procedure.'),
    '',
    '### Genome hard constraints',
    renderEffectList(combine('restrictions'), 'No compiled restrictions.'),
    '',
    '### Genome checklist',
    renderEffectList(combine('checklist'), 'No compiled checklist.'),
    '',
    '### Genome style',
    renderEffectList(combine('style'), 'Follow the executor base style.'),
    '',
    '### Genome output contract',
    renderEffectList(combine('outputContract'), 'Follow the executor base output contract.'),
    MANAGED_END
  ].join('\n');
}

function patchManagedBlock(content, block) {
  const source = String(content || '').trimEnd();
  const start = source.indexOf(MANAGED_START);
  const end = source.indexOf(MANAGED_END);
  if (start >= 0 && end >= start) {
    return `${source.slice(0, start)}${block}${source.slice(end + MANAGED_END.length)}`.trimEnd() + '\n';
  }
  return `${source}${source ? '\n\n' : ''}${block}\n`;
}

function removeManagedBlock(content) {
  const source = String(content || '');
  const start = source.indexOf(MANAGED_START);
  const end = source.indexOf(MANAGED_END);
  if (start < 0 || end < start) return source;
  const before = source.slice(0, start).trimEnd();
  const after = source.slice(end + MANAGED_END.length).trimStart();
  const next = [before, after].filter(Boolean).join('\n\n');
  return next ? `${next.trimEnd()}\n` : '';
}

async function writeAtomic(filePath, content) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(temporaryPath, content, 'utf8');
  await fs.rename(temporaryPath, filePath);
}

async function materializeExecutorEffects({ projectRoot, squadSlug, executor, compilations }) {
  const compiled = compilations.filter((item) => item.status === 'compiled');
  const squadRoot = path.resolve(projectRoot, '.aioson', 'squads', squadSlug);
  const executorPath = path.resolve(
    projectRoot,
    executor.file || path.join('.aioson', 'squads', squadSlug, 'agents', `${executor.slug}.md`)
  );
  const agentsRoot = path.join(squadRoot, 'agents');
  if (!executorPath.startsWith(`${agentsRoot}${path.sep}`)) {
    throw new Error(`Genome compiler refuses non-squad executor path: ${executorPath}`);
  }
  let currentPrompt;
  try {
    currentPrompt = await fs.readFile(executorPath, 'utf8');
  } catch {
    return { materialized: false, paths: [], reason: 'executor-prompt-missing' };
  }

  const checklistPath = path.join(squadRoot, 'checklists', `genome-${executor.slug}.md`);
  if (compiled.length === 0) {
    const changedPaths = [];
    const cleanedPrompt = removeManagedBlock(currentPrompt);
    if (cleanedPrompt !== currentPrompt) {
      await writeAtomic(executorPath, cleanedPrompt);
      changedPaths.push(executorPath);
    }
    let previousChecklist = null;
    try {
      previousChecklist = await fs.readFile(checklistPath, 'utf8');
    } catch {
      previousChecklist = null;
    }
    if (previousChecklist !== null) {
      const inactiveChecklist = [
        `# Compiled Genome Checklist — ${executor.slug}`,
        '',
        'No active compiled genome effects.',
        ''
      ].join('\n');
      if (previousChecklist !== inactiveChecklist) {
        await writeAtomic(checklistPath, inactiveChecklist);
        changedPaths.push(checklistPath);
      }
    }
    return {
      materialized: false,
      cleared: changedPaths.length > 0,
      paths: changedPaths,
      reason: 'no-active-compiled-bindings'
    };
  }

  const block = renderCompiledBlock(executor.slug, compiled);
  await writeAtomic(executorPath, patchManagedBlock(currentPrompt, block));
  const checklist = [
    `# Compiled Genome Checklist — ${executor.slug}`,
    '',
    ...compiled.flatMap((item) => [
      `## ${item.binding.slug}`,
      '',
      `Compilation: \`${item.compilationId}\``,
      '',
      renderEffectList(item.effects.checklist, 'No checklist effect was compiled.'),
      ''
    ])
  ].join('\n');
  await writeAtomic(checklistPath, checklist);
  return {
    materialized: true,
    paths: [executorPath, checklistPath],
    effectHash: sha256(`${block}\n${checklist}`)
  };
}

function aggregateBindingStatus(results) {
  if (results.length === 0) return 'pending';
  if (results.some((item) => item.status === 'conflicted')) return 'conflicted';
  if (results.some((item) => item.status === 'stale')) return 'stale';
  if (results.some((item) => item.status === 'pending')) return 'pending';
  if (results.every((item) => item.status === 'removed')) return 'removed';
  if (results.every((item) => item.status === 'compiled')) return 'compiled';
  return 'resolved';
}

async function compileGenomeBindingsForSquad({ projectRoot, squadSlug, executors, genomeBindings }) {
  const normalized = normalizeGenomeBindings(genomeBindings);
  const reports = [];
  const executorResults = new Map();

  for (const executor of executors || []) {
    const bindings = resolveExecutorGenomes(executor.slug, normalized);
    const compilations = [];
    for (const binding of bindings) {
      compilations.push(await compileGenomeBinding({
        projectRoot,
        binding,
        executorSlug: executor.slug
      }));
    }
    const materialization = await materializeExecutorEffects({
      projectRoot,
      squadSlug,
      executor,
      compilations
    });
    const enriched = compilations.map((item) => {
      if (item.status === 'compiled' && !materialization.materialized) {
        return { ...item, status: 'pending', reason: materialization.reason || 'operational-effect-not-materialized' };
      }
      return item;
    });
    executorResults.set(executor.slug, enriched);
    reports.push({
      executor: executor.slug,
      materialization,
      bindings: enriched
    });
  }

  const updateList = (bindings, targetExecutors) => bindings.map((binding) => {
    const related = targetExecutors.flatMap((executorSlug) => (
      (executorResults.get(executorSlug) || []).filter((item) => item.binding?.slug === binding.slug)
    ));
    const status = aggregateBindingStatus(related);
    const compilationIds = related.map((item) => item.compilationId).filter(Boolean);
    return normalizeBinding({
      ...binding,
      status,
      compilationId: compilationIds.length > 0 ? sha256(compilationIds.sort().join(':')) : null,
      compiledAt: status === 'compiled' ? new Date().toISOString() : null,
      sourceHash: related.find((item) => item.sourceHash)?.sourceHash || binding.sourceHash,
      dependencies: related.flatMap((item) => item.dependencies || []),
      action: status === 'compiled'
        ? null
        : related.map((item) => item.reason).filter(Boolean).join('; ') || 'resolve-binding'
    });
  });

  const executorSlugs = (executors || []).map((executor) => executor.slug);
  const nextBindings = {
    squad: updateList(normalized.squad, executorSlugs),
    executors: Object.fromEntries(Object.entries(normalized.executors).map(([executorSlug, bindings]) => [
      executorSlug,
      updateList(bindings, [executorSlug])
    ]))
  };

  return {
    genomeBindings: nextBindings,
    reports
  };
}

module.exports = {
  MANAGED_START,
  MANAGED_END,
  extractActionableLines,
  compileEffects,
  hasOperationalEffect,
  compileGenomeBinding,
  renderCompiledBlock,
  patchManagedBlock,
  removeManagedBlock,
  materializeExecutorEffects,
  aggregateBindingStatus,
  compileGenomeBindingsForSquad
};
