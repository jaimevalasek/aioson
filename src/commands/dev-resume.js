'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const { buildDevResumeData } = require('../lib/dev-resume');
const { buildPhaseCapsule, openObservations } = require('../lib/phase-capsule');
const { readFeatureArtifactSafe } = require('../preflight-engine');
const { isValidSlug } = require('../dossier/schema');
const { writeAtomically } = require('../lib/feature-registry-storage');

/**
 * aioson dev:resume-data .
 *
 * Returns JSON that @dev consumes when starting a new chat to know which
 * feature is in progress, what the active phase is, which artifacts were
 * already consumed, and where the code map / plan currently live.
 *
 * Returns ok=true with data=null when there is no in-progress feature.
 * Always machine-readable: omitting --json defaults to pretty JSON output.
 *
 * With --feature=<slug> --phase=<n> --capsule [--base=<ref>] [--out=<file>] it
 * compiles the phase capsule instead: printed, or in the --json payload, and
 * written to the project only when --out names a file.
 */
function isInsideFolder(folder, file) {
  const rel = path.relative(folder, file);
  return rel === '' || (rel !== '..' && !rel.startsWith(`..${path.sep}`) && !path.isAbsolute(rel));
}

// Resolve missing leaves against their existing parent, including directory
// links. A dangling link cannot prove where an eventual write would land.
async function locationOnDisk(file) {
  try {
    return await fs.realpath(file);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    const present = await fs.lstat(file).then(() => true, (failure) => {
      if (failure.code !== 'ENOENT') throw failure;
      return false;
    });
    if (present) return null;
    const parent = path.dirname(file);
    if (parent === file) throw error;
    const realParent = await locationOnDisk(parent);
    return realParent ? path.join(realParent, path.basename(file)) : null;
  }
}

// A flag with no value parses as `true`, and that is no value here.
function optionText(value) {
  return typeof value === 'string' || typeof value === 'number' ? String(value).trim() : '';
}

// The capsule is compiled from these folders and never replaces what is in them.
async function writeCapsule(targetDir, target, text) {
  const file = path.resolve(targetDir, target);
  const sources = ['context', 'briefings'].map((folder) => path.resolve(targetDir, '.aioson', folder));
  if (sources.some((folder) => isInsideFolder(folder, file))) return null;
  const realSources = await Promise.all(sources.map(locationOnDisk));
  const realFile = await locationOnDisk(file);
  if (!realFile || realSources.some((folder) => !folder || isInsideFolder(folder, realFile))) return null;
  await fs.mkdir(path.dirname(file), { recursive: true });
  // Replacing the output also leaves a hard-linked source inode untouched.
  await writeAtomically(file, text);
  return path.relative(targetDir, file).split(path.sep).join('/');
}

function printCapsule(logger, capsule, out) {
  if (!out) logger.log(capsule.capsule);
  const { capsule: size, plan_and_prd: sources, percent_of_sources: percent } = capsule.bytes;
  logger.log(`${out ? `Capsule written to ${out}: ` : 'Capsule: '}${size} bytes, against ${sources} bytes of plan plus PRD (${percent}%).`);
  if (capsule.acs.missing.length > 0) logger.error(`No PRD row found for: ${capsule.acs.missing.join(', ')}.`);
}

async function runPhaseCapsule({ targetDir, options, logger }) {
  const slug = optionText(options.feature);
  const phase = optionText(options.phase);
  const target = optionText(options.out);
  const refuse = (reason, message, extra = {}) => {
    if (!options.json && logger) logger.error(message);
    return { ok: false, reason, ...extra };
  };
  if (!slug) return refuse('missing_feature', '--feature=<slug> is required with --capsule.');
  if (!isValidSlug(slug)) return refuse('invalid_feature', `Not a feature slug: ${slug}`);
  if (!/^\d+$/.test(phase)) return refuse('missing_phase', '--phase=<n> is required with --capsule.');

  const plan = await readFeatureArtifactSafe(targetDir, slug, `implementation-plan-${slug}.md`);
  if (!plan) return refuse('plan_not_found', `No implementation plan for ${slug}.`);
  const prd = await readFeatureArtifactSafe(targetDir, slug, `prd-${slug}.md`);
  const observations = await openObservations(targetDir, slug);
  const capsule = buildPhaseCapsule({
    targetDir,
    slug,
    phaseId: phase,
    plan,
    prd: prd || '',
    observations,
    base: optionText(options.base)
  });
  if (!capsule.ok) return refuse(capsule.reason, `Phase ${phase} is not in the plan. Phases: ${capsule.phases.join(', ') || 'none'}.`, { phases: capsule.phases });

  const out = target ? await writeCapsule(targetDir, target, capsule.capsule) : null;
  if (target && !out) return refuse('out_inside_sources', `--out would write among the plan and the PRD it reads (${target}). Name a file elsewhere.`);
  const result = { ...capsule, out };
  if (!options.json && logger) printCapsule(logger, capsule, out);
  return result;
}

async function runDevResumeData({ args = [], options = {}, logger } = {}) {
  const targetDir = args[0] || '.';
  if (options.capsule) return runPhaseCapsule({ targetDir, options, logger });
  const data = await buildDevResumeData(targetDir);

  if (options.json || !logger) {
    return { ok: true, data };
  }

  if (data === null) {
    logger.log('No in-progress feature detected — cold start.');
    return { ok: true, data: null };
  }

  logger.log(JSON.stringify(data, null, 2));
  return { ok: true, data };
}

module.exports = { runDevResumeData };
