'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const {
  attachBindingsToExecutors,
  mergeGenomeBindings,
  normalizeGenomeBindings
} = require('../genomes/bindings');
const { compileGenomeBindingsForSquad } = require('./genome-compiler');

function normalizeSlug(value, fallback = '') {
  const normalized = String(value || fallback)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);

  return normalized || fallback;
}

async function readJsonIfExists(filePath) {
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function readTextIfExists(filePath) {
  try {
    return await fs.readFile(filePath, 'utf8');
  } catch {
    return '';
  }
}

async function writeJson(filePath, value) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function renderGenomeBindingsSection(genomeBindings) {
  const normalized = normalizeGenomeBindings(genomeBindings);
  const lines = ['## Genome bindings', ''];

  if (normalized.squad.length === 0 && Object.keys(normalized.executors).length === 0) {
    lines.push('- None', '');
    return lines.join('\n').trimEnd();
  }

  if (normalized.squad.length > 0) {
    lines.push('### Squad-level');
    for (const binding of normalized.squad) {
      lines.push(`- ${binding.slug} (${binding.mode})`);
    }
    lines.push('');
  }

  const executors = Object.entries(normalized.executors);
  if (executors.length > 0) {
    lines.push('### Executor-level');
    for (const [executorSlug, bindings] of executors) {
      lines.push(`- ${executorSlug}: ${bindings.map((binding) => binding.slug).join(', ')}`);
    }
    lines.push('');
  }

  const stateLines = [];
  for (const binding of normalized.squad) {
    stateLines.push(`- squad/${binding.slug}: ${binding.status}${binding.action ? ` — ${binding.action}` : ''}`);
  }
  for (const [executorSlug, bindings] of executors) {
    for (const binding of bindings) {
      stateLines.push(`- ${executorSlug}/${binding.slug}: ${binding.status}${binding.action ? ` — ${binding.action}` : ''}`);
    }
  }
  if (stateLines.length > 0) {
    lines.push('### Compilation state', ...stateLines, '');
  }

  return lines.join('\n').trimEnd();
}

function patchReadiness(content, genomeBindings) {
  const section = renderGenomeBindingsSection(genomeBindings);
  const source = String(content || '').trimEnd();
  const startMatch = source.match(/^## Genome bindings\b/m);
  if (startMatch && startMatch.index !== undefined) {
    const start = startMatch.index;
    const tail = source.slice(start + startMatch[0].length);
    const nextMatch = tail.match(/\n##\s+/);
    const end = nextMatch && nextMatch.index !== undefined ? start + startMatch[0].length + nextMatch.index + 1 : source.length;
    return `${`${source.slice(0, start)}${section}${source.slice(end)}`.trimEnd()}\n`;
  }

  return `${source ? `${source}\n\n` : ''}${section}\n`;
}

function getSquadPaths(projectRoot, squadSlug) {
  const slug = normalizeSlug(squadSlug, 'squad');
  const packageRoot = path.join(projectRoot, '.aioson', 'squads', slug);
  return {
    squadSlug: slug,
    squadRoot: packageRoot,
    manifestPath: path.join(packageRoot, 'squad.manifest.json'),
    blueprintPath: path.join(projectRoot, '.aioson', 'squads', '.designs', `${slug}.blueprint.json`),
    legacyBlueprintPath: path.join(packageRoot, 'docs', 'blueprint.json'),
    readinessPath: path.join(packageRoot, 'docs', 'readiness.md')
  };
}

async function applyGenomeBindingsToSquad({ projectRoot, squadSlug, genomeBindings }) {
  const paths = getSquadPaths(projectRoot, squadSlug);
  const manifest = await readJsonIfExists(paths.manifestPath);

  if (!manifest || typeof manifest !== 'object') {
    throw new Error(`Squad manifest not found: ${paths.manifestPath}`);
  }

  const blueprint =
    (await readJsonIfExists(paths.blueprintPath)) ||
    (await readJsonIfExists(paths.legacyBlueprintPath)) ||
    {};

  const existingBindings = mergeGenomeBindings({
    blueprintBindings: blueprint?.genomeBindings,
    manifestBindings: manifest?.genomeBindings || manifest?.genomes,
    legacyExecutors: manifest?.executors
  });
  const incoming = normalizeGenomeBindings(genomeBindings);
  const mergedBindings = mergeGenomeBindings({
    blueprintBindings: existingBindings,
    manifestBindings: incoming
  });
  const compilation = await compileGenomeBindingsForSquad({
    projectRoot,
    squadSlug: paths.squadSlug,
    executors: manifest.executors || [],
    genomeBindings: mergedBindings
  });
  const finalBindings = compilation.genomeBindings;

  const nextBlueprint = {
    ...blueprint,
    genomeBindings: finalBindings
  };
  const nextManifest = {
    ...manifest,
    genomes: finalBindings,
    genomeBindings: finalBindings,
    executors: attachBindingsToExecutors(manifest.executors || [], finalBindings)
  };

  await writeJson(paths.blueprintPath, nextBlueprint);
  await writeJson(paths.manifestPath, nextManifest);

  const readinessText = await readTextIfExists(paths.readinessPath);
  await fs.mkdir(path.dirname(paths.readinessPath), { recursive: true });
  await fs.writeFile(paths.readinessPath, patchReadiness(readinessText, finalBindings), 'utf8');

  return {
    squadSlug: paths.squadSlug,
    paths,
    genomeBindings: finalBindings,
    compilation: compilation.reports
  };
}

module.exports = {
  getSquadPaths,
  applyGenomeBindingsToSquad,
  patchReadiness
};
