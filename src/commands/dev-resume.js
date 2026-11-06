'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const { buildDevResumeData } = require('../lib/dev-resume');
const { buildPhaseCapsule } = require('../lib/phase-capsule');
const { readFeatureArtifactSafe } = require('../preflight-engine');
const { isValidSlug } = require('../dossier/schema');
const { openForFeature } = require('../lib/observations');

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
async function runPhaseCapsule({ targetDir, options, logger }) {
  const slug = options.feature ? String(options.feature).trim() : '';
  const phase = options.phase === undefined || options.phase === true ? '' : String(options.phase).trim();
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
  const observations = await openForFeature(targetDir, slug).catch(() => []);
  const capsule = buildPhaseCapsule({
    targetDir,
    slug,
    phaseId: phase,
    plan,
    prd: prd || '',
    observations,
    base: options.base && options.base !== true ? String(options.base) : ''
  });
  if (!capsule.ok) return refuse(capsule.reason, `Phase ${phase} is not in the plan. Phases: ${capsule.phases.join(', ') || 'none'}.`, { phases: capsule.phases });

  let out = null;
  if (options.out && options.out !== true) {
    const file = path.resolve(targetDir, String(options.out));
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, capsule.capsule, 'utf8');
    out = path.relative(targetDir, file).split(path.sep).join('/');
  }
  const result = { ...capsule, out };
  if (options.json || !logger) return result;

  if (!out) logger.log(capsule.capsule);
  const { capsule: size, plan_and_prd: sources, percent_of_sources: percent } = capsule.bytes;
  logger.log(`${out ? `Capsule written to ${out}: ` : 'Capsule: '}${size} bytes, against ${sources} bytes of plan plus PRD (${percent}%).`);
  if (capsule.acs.missing.length > 0) logger.error(`No PRD row found for: ${capsule.acs.missing.join(', ')}.`);
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
