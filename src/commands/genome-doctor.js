'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const { loadCompatibleGenome } = require('../lib/genomes/compat');

const INSTALLED_SKILLS_DIR = '.aioson/installed-skills';
const BUILTIN_SKILLS_DIR = '.aioson/skills';
const GENOMES_DIR = '.aioson/genomes';

/**
 * Walk up the directory tree from startDir looking for a dir that contains .aioson/.
 * Falls back to process.cwd() if not found.
 */
async function findProjectRoot(startDir) {
  let current = startDir;
  for (let i = 0; i < 10; i++) {
    try {
      await fs.access(path.join(current, '.aioson'));
      return current;
    } catch {
      const parent = path.dirname(current);
      if (parent === current) break;
      current = parent;
    }
  }
  return process.cwd();
}

async function fileExists(p) {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

/**
 * Check whether a skill slug is available in the project.
 * Checks installed skills AND built-in skills directories.
 */
async function isSkillAvailable(projectRoot, slug) {
  const installedPath = path.join(projectRoot, INSTALLED_SKILLS_DIR, slug, 'SKILL.md');
  const builtinExact = path.join(projectRoot, BUILTIN_SKILLS_DIR, slug, 'SKILL.md');
  const builtinDir = path.join(projectRoot, BUILTIN_SKILLS_DIR, slug);

  for (const candidate of [installedPath, builtinExact]) {
    try {
      await fs.access(candidate);
      return { found: true, path: path.relative(projectRoot, path.dirname(candidate)) };
    } catch { /* not found */ }
  }

  try {
    const stat = await fs.stat(builtinDir);
    if (stat.isDirectory()) {
      return { found: true, path: path.relative(projectRoot, builtinDir) };
    }
  } catch { /* not found */ }

  return { found: false };
}

/**
 * Check whether a genome slug is available — both folder (Track 4.2/4.3) and single-file formats.
 */
async function isGenomeAvailable(projectRoot, slug) {
  const folderSkillMd = path.join(projectRoot, GENOMES_DIR, slug, 'SKILL.md');
  const mdPath = path.join(projectRoot, GENOMES_DIR, `${slug}.md`);

  if (await fileExists(folderSkillMd)) {
    return { found: true, format: 'folder', path: path.relative(projectRoot, path.dirname(folderSkillMd)) };
  }
  if (await fileExists(mdPath)) {
    return { found: true, format: 'single-file', path: path.relative(projectRoot, mdPath) };
  }
  return { found: false };
}

/**
 * Read and parse the .meta.json companion file for a genome .md.
 */
async function readGenomeMeta(mdFilePath) {
  const slug = path.basename(mdFilePath, '.md');
  const metaPath = path.join(path.dirname(mdFilePath), `${slug}.meta.json`);
  try {
    const raw = await fs.readFile(metaPath, 'utf8');
    return { meta: JSON.parse(raw), metaPath };
  } catch {
    return { meta: null, metaPath };
  }
}

// ── Folder format (Track 4.2/4.3) doctor ────────────────────────────────────

async function readFolderManifest(folderPath) {
  const manifestPath = path.join(folderPath, 'manifest.json');
  try {
    const raw = await fs.readFile(manifestPath, 'utf8');
    return { manifest: JSON.parse(raw), manifestPath };
  } catch {
    return { manifest: null, manifestPath };
  }
}

/**
 * Validate Track 4.2/4.3 folder structure.
 */
async function doctorFolder(folderPath, options, logger) {
  const slug = path.basename(folderPath);
  const result = {
    ok: true,
    target: folderPath,
    format: 'folder',
    slug,
    issues: [],
    warnings: [],
    references: { declared: 0, found: 0, missing: [] }
  };

  // 1. SKILL.md exists
  const skillMdPath = path.join(folderPath, 'SKILL.md');
  if (!(await fileExists(skillMdPath))) {
    result.ok = false;
    result.issues.push(`SKILL.md not found at ${skillMdPath}`);
    if (!options.json) logger.log(`SKILL.md: MISSING`);
    return result;
  }
  if (!options.json) logger.log(`SKILL.md: OK`);

  // 2. manifest.json exists and parses
  const { manifest, manifestPath } = await readFolderManifest(folderPath);
  if (!manifest) {
    result.ok = false;
    result.issues.push(`manifest.json missing or invalid at ${manifestPath}`);
    if (!options.json) logger.log(`manifest.json: MISSING or INVALID`);
    return result;
  }
  if (!options.json) logger.log(`manifest.json: OK`);

  // Collect basic metadata for output
  result.track = manifest.track || null;
  result.type = manifest.type || null;
  result.language = manifest.language || null;
  result.fidelity_score = manifest.fidelity_score != null ? manifest.fidelity_score : null;
  result.advisor_ready = Boolean(manifest.advisor_ready);
  result.viability_score = manifest.viability_score != null ? manifest.viability_score : null;

  if (!options.json) {
    logger.log(`Track: ${result.track || '?'}`);
    logger.log(`Type: ${result.type || '?'}`);
    logger.log(`Language: ${result.language || '?'}`);
    if (result.fidelity_score != null) logger.log(`Fidelity score: ${result.fidelity_score}`);
    if (result.viability_score != null) logger.log(`Viability score: ${result.viability_score}`);
    logger.log(`Advisor ready: ${result.advisor_ready ? 'yes' : 'no'}`);
  }

  // 3. Validate references[] array — each declared file must exist
  if (Array.isArray(manifest.references)) {
    result.references.declared = manifest.references.length;
    if (!options.json) logger.log(`\nReferences (${manifest.references.length} declared):`);
    for (const ref of manifest.references) {
      if (!ref.file) {
        result.issues.push(`Reference "${ref.id || '?'}" missing 'file' field`);
        if (!options.json) logger.log(`  ${ref.id || '?'}: MISSING file field`);
        continue;
      }
      const refPath = path.join(folderPath, ref.file);
      if (await fileExists(refPath)) {
        result.references.found += 1;
        if (!options.json) logger.log(`  ${ref.id} (${ref.file}): OK`);
      } else {
        result.references.missing.push(ref.file);
        result.ok = false;
        if (!options.json) logger.log(`  ${ref.id} (${ref.file}): MISSING`);
      }
    }
  } else {
    result.warnings.push(`manifest.references is not an array (or missing)`);
  }

  // 4. Track 4.2 advisor-ready checklist
  if (result.advisor_ready) {
    if (!options.json) logger.log(`\nAdvisor-Ready Checklist:`);
    const checks = [
      { name: 'consultation-playbook.md', path: path.join(folderPath, 'references', 'consultation-playbook.md') },
      { name: 'voice-dna.md', path: path.join(folderPath, 'references', 'voice-dna.md') }
    ];
    for (const c of checks) {
      if (await fileExists(c.path)) {
        if (!options.json) logger.log(`  ${c.name}: OK`);
      } else {
        result.warnings.push(`advisor_ready=true but missing ${c.name}`);
        if (!options.json) logger.log(`  ${c.name}: MISSING (advisor mode may degrade)`);
      }
    }
    // anchor_prompt check (in manifest or SKILL.md frontmatter)
    if (!manifest.anchor_prompt) {
      result.warnings.push(`advisor_ready=true but anchor_prompt missing in manifest`);
      if (!options.json) logger.log(`  anchor_prompt: MISSING (re-anchor in multi-turn may fail)`);
    } else if (!options.json) {
      logger.log(`  anchor_prompt: OK`);
    }
    // not_for list
    if (!Array.isArray(manifest.not_for) || manifest.not_for.length < 3) {
      result.warnings.push(`advisor_ready=true but not_for list missing or has < 3 items`);
      if (!options.json) logger.log(`  not_for list (≥3 items): MISSING or INSUFFICIENT`);
    } else if (!options.json) {
      logger.log(`  not_for list (${manifest.not_for.length} items): OK`);
    }
    // fidelity_score >= 0.70
    if (result.fidelity_score != null && result.fidelity_score < 0.70) {
      result.warnings.push(`advisor_ready=true but fidelity_score < 0.70`);
      if (!options.json) logger.log(`  fidelity_score >= 0.70: WARNING (current ${result.fidelity_score})`);
    } else if (result.fidelity_score != null) {
      if (!options.json) logger.log(`  fidelity_score >= 0.70: OK (${result.fidelity_score})`);
    }
  }

  // 5. Track 4.3 specific validations
  if (result.track === '4.3') {
    if (!options.json) logger.log(`\nTrack 4.3 Cognitive Pipeline checks:`);

    // sources array (objects, not strings)
    if (Array.isArray(manifest.sources)) {
      const allObjects = manifest.sources.every((s) => typeof s === 'object' && s.id);
      if (allObjects) {
        if (!options.json) logger.log(`  sources array (objects with id): OK (${manifest.sources.length} sources)`);
      } else {
        result.warnings.push(`Track 4.3 expects sources array of objects with id; some entries are strings or lack id`);
        if (!options.json) logger.log(`  sources array structure: WARNING`);
      }
    } else {
      result.warnings.push(`Track 4.3 expects sources array — found none`);
      if (!options.json) logger.log(`  sources array: MISSING`);
    }

    // quality_report with sub-scores
    if (manifest.quality_report && typeof manifest.quality_report === 'object') {
      const qr = manifest.quality_report;
      const required = [
        'source_quality_score', 'voice_consistency_score', 'decision_heuristics_score',
        'mental_models_score', 'identity_core_score', 'cross_layer_coherence_score', 'safety_score'
      ];
      const missing = required.filter((k) => qr[k] == null);
      if (missing.length === 0) {
        if (!options.json) logger.log(`  quality_report (7 sub-scores): OK (status: ${qr.status || '?'})`);
      } else {
        result.warnings.push(`Track 4.3 quality_report missing sub-scores: ${missing.join(', ')}`);
        if (!options.json) logger.log(`  quality_report sub-scores: INCOMPLETE (missing ${missing.length})`);
      }
    } else {
      result.warnings.push(`Track 4.3 expects quality_report with sub-scores`);
      if (!options.json) logger.log(`  quality_report: MISSING`);
    }

    // pipeline_state
    if (manifest.pipeline_state && Array.isArray(manifest.pipeline_state.completed_layers)) {
      const layers = manifest.pipeline_state.completed_layers;
      if (!options.json) logger.log(`  pipeline_state: ${layers.length} layers complete (${manifest.pipeline_state.current_phase || '?'})`);
    } else {
      result.warnings.push(`Track 4.3 expects pipeline_state with completed_layers`);
      if (!options.json) logger.log(`  pipeline_state: MISSING or INCOMPLETE`);
    }

    // viability_score >= 50
    if (result.viability_score != null && result.viability_score < 50) {
      result.warnings.push(`Track 4.3 viability_score < 50 (genome generated despite low viability)`);
      if (!options.json) logger.log(`  viability_score >= 50: WARNING (current ${result.viability_score})`);
    }

    // recommended Track 4.3 references presence
    const t43Refs = ['viability-assessment.md', 'cognitive-architecture.md', 'latticework.md', 'quality-report.md'];
    for (const r of t43Refs) {
      const refPath = path.join(folderPath, 'references', r);
      if (await fileExists(refPath)) {
        if (!options.json) logger.log(`  references/${r}: OK`);
      } else {
        result.warnings.push(`Track 4.3 reference references/${r} missing`);
        if (!options.json) logger.log(`  references/${r}: MISSING (Track 4.3 recommended)`);
      }
    }
  }

  // 6. Dependencies (skills + genomes referenced by this genome)
  const projectRoot = await findProjectRoot(folderPath);
  const deps = manifest.dependencies || {};
  const skillDeps = Array.isArray(deps.skills) ? deps.skills : [];
  const genomeDeps = Array.isArray(deps.genomes) ? deps.genomes : [];

  if (skillDeps.length === 0 && genomeDeps.length === 0) {
    if (!options.json) logger.log(`\nDependencies: none declared`);
  } else {
    if (!options.json) logger.log(`\nChecking dependencies...`);
    const missingSkills = [];
    const missingGenomes = [];
    for (const s of skillDeps) {
      const c = await isSkillAvailable(projectRoot, s);
      if (c.found) {
        if (!options.json) logger.log(`  skill "${s}": OK (${c.path})`);
      } else {
        missingSkills.push(s);
        if (!options.json) logger.log(`  skill "${s}": MISSING`);
      }
    }
    for (const s of genomeDeps) {
      const c = await isGenomeAvailable(projectRoot, s);
      if (c.found) {
        if (!options.json) logger.log(`  genome "${s}": OK (${c.format}, ${c.path})`);
      } else {
        missingGenomes.push(s);
        if (!options.json) logger.log(`  genome "${s}": MISSING`);
      }
    }
    result.dependencies = {
      skills: skillDeps,
      genomes: genomeDeps,
      missing: { skills: missingSkills, genomes: missingGenomes }
    };
    if (missingSkills.length > 0 || missingGenomes.length > 0) {
      result.ok = false;
    }
  }

  // 7. Final summary
  if (!options.json) {
    logger.log('');
    if (result.issues.length > 0) {
      logger.log(`❌ Issues: ${result.issues.length}`);
      for (const i of result.issues) logger.log(`  - ${i}`);
    }
    if (result.warnings.length > 0) {
      logger.log(`⚠️  Warnings: ${result.warnings.length}`);
      for (const w of result.warnings) logger.log(`  - ${w}`);
    }
    if (result.ok && result.issues.length === 0 && result.warnings.length === 0) {
      logger.log(`✅ Genome folder validation passed.`);
    } else if (result.ok) {
      logger.log(`✅ Genome folder validation passed (with ${result.warnings.length} warning(s)).`);
    } else {
      logger.log(`❌ Genome folder validation FAILED.`);
    }
  }

  return result;
}

// ── Single-file genome doctor (legacy / Track 2.0/3.0/4.0/4.1) ──────────────

async function doctorSingleFile(filePath, options, logger) {
  const raw = await fs.readFile(filePath, 'utf8');
  const loaded = loadCompatibleGenome(raw, { filePath });

  const result = {
    ok: true,
    file: filePath,
    format: 'single-file',
    detectedFormat: loaded.format,
    migrated: loaded.migrated,
    slug: loaded.document.slug,
    type: loaded.document.type,
    depth: loaded.document.depth,
    evidenceMode: loaded.document.evidenceMode,
    dependencies: {
      skills: [],
      genomes: [],
      missing: { skills: [], genomes: [] }
    }
  };

  // Check for .meta.json companion
  const { meta, metaPath } = await readGenomeMeta(filePath);
  const hasMeta = Boolean(meta);
  result.hasMeta = hasMeta;

  if (!options.json) {
    logger.log(`Genome file: ${filePath}`);
    logger.log(`Format: ${result.detectedFormat} (single-file)`);
    logger.log(`Migrated internally: ${result.migrated ? 'yes' : 'no'}`);
    logger.log(`Slug: ${result.slug}`);
    logger.log(`Type: ${result.type}`);
    logger.log(`Depth: ${result.depth}`);
    logger.log(`Evidence mode: ${result.evidenceMode}`);
    logger.log(`Meta file: ${hasMeta ? path.relative(process.cwd(), metaPath) : 'not found'}`);
  }

  // Dependency check
  const deps = hasMeta && meta.dependencies
    ? {
        skills: Array.isArray(meta.dependencies.skills) ? meta.dependencies.skills : [],
        genomes: Array.isArray(meta.dependencies.genomes) ? meta.dependencies.genomes : []
      }
    : { skills: [], genomes: [] };

  result.dependencies.skills = deps.skills;
  result.dependencies.genomes = deps.genomes;

  if (deps.skills.length === 0 && deps.genomes.length === 0) {
    if (!options.json) logger.log('\nDependencies: none declared');
    return result;
  }

  const projectRoot = await findProjectRoot(path.dirname(filePath));
  const missingSkills = [];
  const missingGenomes = [];

  if (!options.json) logger.log('\nChecking dependencies...');

  for (const slug of deps.skills) {
    const check = await isSkillAvailable(projectRoot, slug);
    if (check.found) {
      if (!options.json) logger.log(`  skill "${slug}": OK (${check.path})`);
    } else {
      missingSkills.push(slug);
      if (!options.json) logger.log(`  skill "${slug}": MISSING`);
    }
  }

  for (const slug of deps.genomes) {
    const check = await isGenomeAvailable(projectRoot, slug);
    if (check.found) {
      if (!options.json) logger.log(`  genome "${slug}": OK (${check.format}, ${check.path})`);
    } else {
      missingGenomes.push(slug);
      if (!options.json) logger.log(`  genome "${slug}": MISSING`);
    }
  }

  result.dependencies.missing = { skills: missingSkills, genomes: missingGenomes };

  const hasMissing = missingSkills.length > 0 || missingGenomes.length > 0;
  if (hasMissing) {
    result.ok = false;
    if (!options.json) {
      logger.log('\nMissing dependencies detected.');
      if (missingSkills.length > 0) {
        logger.log('Install missing skills:');
        for (const slug of missingSkills) {
          logger.log(`  aioson skill:install --slug=${slug}`);
        }
      }
      if (missingGenomes.length > 0) {
        logger.log('Install missing genomes:');
        for (const slug of missingGenomes) {
          logger.log(`  aioson genome:install --slug=${slug}`);
        }
      }
    }
  } else if (!options.json) {
    logger.log('\nAll dependencies satisfied.');
  }

  return result;
}

// ── Main entry point ────────────────────────────────────────────────────────

async function runGenomeDoctor({ args, options = {}, logger }) {
  const target = args[0];
  if (!target) {
    throw new Error('Usage: aioson genome:doctor <file-or-folder>');
  }

  const targetPath = path.resolve(process.cwd(), target);

  let stat;
  try {
    stat = await fs.stat(targetPath);
  } catch (err) {
    throw new Error(`Target not found: ${targetPath}`);
  }

  // Folder format (Track 4.2/4.3)
  if (stat.isDirectory()) {
    return await doctorFolder(targetPath, options, logger);
  }

  // Single-file format
  return await doctorSingleFile(targetPath, options, logger);
}

module.exports = {
  runGenomeDoctor,
  // Exported for testing/reuse
  doctorFolder,
  doctorSingleFile,
  isGenomeAvailable
};
