'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const {
  isGenomeV2,
  normalizeGenome,
  normalizeGenomeMeta
} = require('./genomes');
const { parseGenomeMarkdown, serializeGenomeMarkdown } = require('./genome-format');
const { assertValidGenome, assertValidGenomeMeta } = require('./genome-schema');
const { ensureDir, exists } = require('./utils');

function getGenomeDir(projectRoot) {
  return path.join(projectRoot, '.aioson', 'genomes');
}

function getGenomeMarkdownPath(projectRoot, slug) {
  return path.join(getGenomeDir(projectRoot), `${slug}.md`);
}

function getGenomeMetaPath(projectRoot, slug) {
  return path.join(getGenomeDir(projectRoot), `${slug}.meta.json`);
}

function getGenomeFolderPath(projectRoot, slug) {
  return path.join(getGenomeDir(projectRoot), slug);
}

function getGenomeFolderManifestPath(projectRoot, slug) {
  return path.join(getGenomeFolderPath(projectRoot, slug), 'manifest.json');
}

async function readMetaFile(filePath, slug) {
  try {
    const text = await fs.readFile(filePath, 'utf8');
    return JSON.parse(text);
  } catch (error) {
    if (error && error.code === 'ENOENT') return null;
    throw new Error(`Invalid genome meta JSON for "${slug}" at ${filePath}: ${error.message}`);
  }
}

function mergeGenomeWithMeta(genome, rawMeta, slug) {
  if (!rawMeta) {
    return normalizeGenome({
      ...genome,
      slug: genome.slug || slug
    });
  }

  return normalizeGenome({
    ...genome,
    slug: genome.slug || rawMeta.slug || slug,
    domain: genome.domain || rawMeta.domain,
    type: genome.hasFrontmatter ? genome.type : rawMeta.type,
    language: genome.hasFrontmatter ? genome.language : rawMeta.language,
    depth: genome.hasFrontmatter ? genome.depth : rawMeta.depth,
    version: genome.hasFrontmatter ? genome.version : rawMeta.version,
    format: genome.hasFrontmatter ? genome.format : rawMeta.format,
    evidenceMode: genome.hasFrontmatter ? genome.evidenceMode : rawMeta.evidenceMode,
    sourceCount: genome.hasFrontmatter ? genome.sourceCount : rawMeta.sourceCount,
    personaSource: genome.hasFrontmatter ? genome.personaSource : rawMeta.personaSource,
    personaSources: genome.hasFrontmatter ? genome.personaSources : rawMeta.personaSources,
    disc: genome.hasFrontmatter ? genome.disc : rawMeta.disc,
    enneagram: genome.hasFrontmatter ? genome.enneagram : rawMeta.enneagram,
    bigFive: genome.hasFrontmatter ? genome.bigFive : rawMeta.bigFive,
    mbti: genome.hasFrontmatter ? genome.mbti : rawMeta.mbti,
    confidence: genome.hasFrontmatter ? genome.confidence : rawMeta.confidence,
    profilerReport: genome.hasFrontmatter ? genome.profilerReport : rawMeta.profilerReport,
    hybridMode: genome.hasFrontmatter ? genome.hybridMode : rawMeta.hybridMode
  });
}

async function readGenome(projectRoot, slug) {
  const markdownPath = getGenomeMarkdownPath(projectRoot, slug);
  const metaPath = getGenomeMetaPath(projectRoot, slug);

  if (!(await exists(markdownPath))) {
    throw new Error(`Genome "${slug}" not found at ${markdownPath}`);
  }

  const markdown = await fs.readFile(markdownPath, 'utf8');
  const parsedGenome = parseGenomeMarkdown(markdown);
  const rawMeta = await readMetaFile(metaPath, slug);
  const genome = assertValidGenome(mergeGenomeWithMeta(parsedGenome, rawMeta, slug));

  let meta;
  if (rawMeta) {
    meta = assertValidGenomeMeta({
      ...rawMeta,
      genome,
      compat: {
        ...(rawMeta.compat || {}),
        legacyMarkdownCompatible: true
      }
    });
  } else {
    meta = assertValidGenomeMeta(
      normalizeGenomeMeta({
        genome,
        compat: {
          legacyMarkdownCompatible: true,
          synthesizedFromLegacy: !isGenomeV2(parsedGenome)
        }
      })
    );
  }

  return {
    genome,
    meta,
    paths: {
      markdownPath,
      metaPath
    }
  };
}

async function readGenomeSource(projectRoot, slug) {
  const folderPath = getGenomeFolderPath(projectRoot, slug);
  const manifestPath = getGenomeFolderManifestPath(projectRoot, slug);
  if (await exists(manifestPath)) {
    const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
    const documents = [];
    const folderRoot = path.resolve(folderPath);
    const references = Array.isArray(manifest.references) ? manifest.references : [];
    for (const reference of references) {
      const relativePath = typeof reference === 'string' ? reference : reference?.file;
      if (!relativePath) continue;
      const referencePath = path.resolve(folderRoot, relativePath);
      if (referencePath !== folderRoot && !referencePath.startsWith(`${folderRoot}${path.sep}`)) {
        throw new Error(`Genome reference escapes folder: ${relativePath}`);
      }
      try {
        documents.push({
          id: typeof reference === 'object' ? reference.id || relativePath : relativePath,
          path: relativePath.replace(/\\/g, '/'),
          content: await fs.readFile(referencePath, 'utf8'),
          priority: typeof reference === 'object' ? reference.load_priority || null : null
        });
      } catch (error) {
        if (error.code !== 'ENOENT') throw error;
      }
    }
    const skillPath = path.join(folderPath, 'SKILL.md');
    if (await exists(skillPath)) {
      documents.unshift({
        id: 'skill',
        path: 'SKILL.md',
        content: await fs.readFile(skillPath, 'utf8'),
        priority: 'high'
      });
    }
    return {
      kind: 'modular',
      slug,
      manifest,
      documents,
      paths: { folderPath, manifestPath }
    };
  }

  const loaded = await readGenome(projectRoot, slug);
  return {
    kind: 'single-file',
    slug,
    manifest: loaded.meta,
    genome: loaded.genome,
    documents: [{
      id: 'genome',
      path: path.basename(loaded.paths.markdownPath),
      content: await fs.readFile(loaded.paths.markdownPath, 'utf8'),
      priority: 'high'
    }],
    paths: loaded.paths
  };
}

async function loadExistingMeta(projectRoot, slug) {
  const metaPath = getGenomeMetaPath(projectRoot, slug);
  const rawMeta = await readMetaFile(metaPath, slug);
  if (!rawMeta) return null;
  try {
    return normalizeGenomeMeta(rawMeta);
  } catch {
    return null;
  }
}

async function writeGenome(projectRoot, genomeInput, metaInput) {
  const normalizedGenome = assertValidGenome(
    normalizeGenome({
      ...genomeInput,
      generated: genomeInput && genomeInput.generated ? genomeInput.generated : new Date().toISOString().slice(0, 10),
      legacyFormat: false,
      hasFrontmatter: true
    })
  );
  const markdownPath = getGenomeMarkdownPath(projectRoot, normalizedGenome.slug);
  const metaPath = getGenomeMetaPath(projectRoot, normalizedGenome.slug);
  const existingMeta = await loadExistingMeta(projectRoot, normalizedGenome.slug);

  const normalizedMeta = assertValidGenomeMeta(
    normalizeGenomeMeta({
      ...(existingMeta || {}),
      ...(metaInput || {}),
      schemaVersion: normalizedGenome.version,
      version: normalizedGenome.version,
      format: normalizedGenome.format,
      genome: normalizedGenome,
      compat: {
        ...((existingMeta && existingMeta.compat) || {}),
        ...((metaInput && metaInput.compat) || {}),
        legacyMarkdownCompatible: true,
        synthesizedFromLegacy: false
      },
      createdAt:
        (metaInput && metaInput.createdAt) ||
        (existingMeta && existingMeta.createdAt) ||
        `${normalizedGenome.generated}T00:00:00.000Z`,
      updatedAt: new Date().toISOString()
    })
  );

  await ensureDir(getGenomeDir(projectRoot));
  await fs.writeFile(markdownPath, serializeGenomeMarkdown(normalizedGenome), 'utf8');
  await fs.writeFile(metaPath, `${JSON.stringify(normalizedMeta, null, 2)}\n`, 'utf8');

  return {
    genome: normalizedGenome,
    meta: normalizedMeta,
    paths: {
      markdownPath,
      metaPath
    }
  };
}

async function listGenomes(projectRoot) {
  const genomeDir = getGenomeDir(projectRoot);
  try {
    const entries = await fs.readdir(genomeDir, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isFile() && entry.name.endsWith('.md') && !entry.name.endsWith('.meta.json'))
      .map((entry) => entry.name.slice(0, -3))
      .sort();
  } catch (error) {
    if (error && error.code === 'ENOENT') return [];
    throw error;
  }
}

async function genomeExists(projectRoot, slug) {
  return exists(getGenomeMarkdownPath(projectRoot, slug));
}

module.exports = {
  getGenomeDir,
  getGenomeMarkdownPath,
  getGenomeMetaPath,
  getGenomeFolderPath,
  getGenomeFolderManifestPath,
  readGenome,
  readGenomeSource,
  writeGenome,
  listGenomes,
  genomeExists
};
