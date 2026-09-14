'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const {
  openRuntimeDb,
  upsertImplementationPlan,
  getImplementationPlan,
  listImplementationPlans,
  updateImplementationPlanStatus,
  upsertPlanPhase,
  updatePlanPhaseStatus,
  getPlanPhases
} = require('../runtime-store');
const { resolveTargetDir } = require('../lib/project-root');
const { parseFrontmatter } = require('../preflight-engine');
const { parsePlanPhases, setPlanField, readProjectFile, sourcePrdPath, contentHash, planSourceStatus } = require('../lib/plan-document');

const CONTEXT_DIR = path.join('.aioson', 'context');
const PLANS_DIR = path.join('.aioson', 'plans');

async function pathExists(targetPath) {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Resolve the best path for an implementation plan given a slug.
 */
async function resolvePlanPath(projectDir, featureSlug) {
  if (featureSlug) {
    // Canonical Planner output wins; retain the old harness manifest fallback.
    const canonicalPath = path.join(projectDir, CONTEXT_DIR, `implementation-plan-${featureSlug}.md`);
    if (await pathExists(canonicalPath)) return canonicalPath;
    const structuredPath = path.join(projectDir, PLANS_DIR, featureSlug, 'manifest.md');
    if (await pathExists(structuredPath)) return structuredPath;
    return canonicalPath;
  }

  // No slug -> implementation-plan.md in context
  return path.join(projectDir, CONTEXT_DIR, 'implementation-plan.md');
}

/**
 * Compute a simple hash of an array of files for staleness detection.
 */
async function computeSourceHash(projectDir, filePaths) {
  const hash = crypto.createHash('sha256');
  for (const fp of filePaths) {
    const abs = path.resolve(projectDir, fp);
    try {
      hash.update(fp);
      hash.update(await fs.readFile(abs));
    } catch {
      hash.update(`${fp}:missing`);
    }
  }
  return hash.digest('hex').slice(0, 16);
}

/**
 * Detect plan files in the context directory.
 */
async function detectPlanFiles(projectDir) {
  const contextDir = path.resolve(projectDir, CONTEXT_DIR);
  const plansDir = path.resolve(projectDir, PLANS_DIR);
  const plans = [];

  // Scan context (legacy/simple)
  try {
    const files = await fs.readdir(contextDir);
    for (const f of files) {
      if (f.startsWith('implementation-plan') && f.endsWith('.md')) {
        const slug = f === 'implementation-plan.md'
          ? null
          : f.replace('implementation-plan-', '').replace('.md', '');
        plans.push({ file: f, featureSlug: slug, path: path.join(CONTEXT_DIR, f), type: 'legacy' });
      }
    }
  } catch { /* ignore */ }

  // Scan structured plans
  try {
    const entries = await fs.readdir(plansDir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        const manifest = path.join(plansDir, entry.name, 'manifest.md');
        if (await pathExists(manifest)) {
          plans.push({ file: 'manifest.md', featureSlug: entry.name, path: path.join(PLANS_DIR, entry.name, 'manifest.md'), type: 'structured' });
        }
      }
    }
  } catch { /* ignore */ }

  return plans;
}

/**
 * Parse plan frontmatter to extract status and metadata.
 */
function parsePlanFrontmatter(content) { return parseFrontmatter(String(content || '')); }

function countPhases(content) { return parsePlanPhases(content).length; }

/**
 * Subcommand: show [slug]
 * Shows the current implementation plan.
 */
async function handleShow(projectDir, featureSlug, { logger, t }) {
  const planPath = await resolvePlanPath(projectDir, featureSlug);

  if (!(await pathExists(planPath))) {
    logger.error(t('implementation_plan.not_found', { file: path.basename(planPath) }));
    return { found: false };
  }

  const content = await fs.readFile(planPath, 'utf8');
  const meta = parsePlanFrontmatter(content);
  const phases = countPhases(content);

  logger.log(`Plan: ${path.basename(planPath)}`);
  logger.log(`Status: ${meta.status || 'unknown'}`);
  logger.log(`Classification: ${meta.classification || 'unknown'}`);
  logger.log(`Phases: ${phases}`);
  logger.log('');
  logger.log(content);

  return { found: true, meta, phases };
}

/**
 * Subcommand: status [slug]
 * Shows progress of the implementation plan from SQLite.
 */
async function handleStatus(projectDir, featureSlug, { logger, t }) {
  const handle = await openRuntimeDb(projectDir, { mustExist: true });
  if (!handle) {
    logger.error(t('implementation_plan.no_runtime'));
    return { found: false };
  }
  const { db } = handle;
  try {
    const rows = listImplementationPlans(db);
    const match = featureSlug
      ? rows.find(r => r.feature_slug === featureSlug)
      : rows.find(r => r.scope === 'project') || rows[0];

    if (!match) {
      logger.error(t('implementation_plan.no_plans'));
      return { found: false };
    }

    const phases = getPlanPhases(db, match.plan_id);
    logger.log(`Plan: ${match.plan_id}`);
    logger.log(`Status: ${match.status}`);
    logger.log(`Progress: ${match.phases_completed}/${match.phases_total}`);
    logger.log('');
    for (const ph of phases) {
      const icon = ph.status === 'completed' ? '✓' : ph.status === 'in_progress' ? '▸' : '○';
      logger.log(`  ${icon} Phase ${ph.phase_number}: ${ph.title} [${ph.status}]`);
    }
    return { found: true, plan: match, phases };
  } finally {
    db.close();
  }
}

/**
 * Subcommand: checkpoint [slug] <phase-number>
 * Marks a phase as completed.
 */
async function handleCheckpoint(projectDir, featureSlug, phaseNumber, { logger, t }) {
  if (!phaseNumber || isNaN(Number(phaseNumber))) {
    logger.error(t('implementation_plan.checkpoint_usage'));
    return { updated: false };
  }
  const handle = await openRuntimeDb(projectDir, { mustExist: true });
  if (!handle) {
    logger.error(t('implementation_plan.no_runtime'));
    return { updated: false };
  }
  const { db } = handle;
  try {
    const rows = listImplementationPlans(db);
    const match = featureSlug
      ? rows.find(r => r.feature_slug === featureSlug)
      : rows.find(r => r.scope === 'project') || rows[0];

    if (!match) {
      logger.error(t('implementation_plan.no_plans'));
      return { updated: false };
    }

    const updated = updatePlanPhaseStatus(db, match.plan_id, Number(phaseNumber), 'completed');
    if (updated) {
      logger.log(t('implementation_plan.phase_completed', { phase: phaseNumber }));
    } else {
      logger.error(t('implementation_plan.phase_not_found', { phase: phaseNumber }));
    }
    return { updated };
  } finally {
    db.close();
  }
}

/**
 * Subcommand: stale [slug]
 * Checks if source artifacts changed after the plan was created.
 */
async function handleStale(projectDir, featureSlug, { logger, t }) {
  const planPath = await resolvePlanPath(projectDir, featureSlug);

  if (!(await pathExists(planPath))) {
    logger.error(t('implementation_plan.not_found', { file: path.basename(planPath) }));
    return { found: false, stale: false };
  }

  const content = await fs.readFile(planPath, 'utf8');
  const meta = parsePlanFrontmatter(content);
  const binding = await planSourceStatus(projectDir, featureSlug, content);
  if (meta.source_prd_sha256 || meta.source_prd) {
    if (binding.freshness !== 'unknown' || !meta.created) {
      logger.log(`Plan source: ${binding.freshness}`);
      return { found: true, ...binding };
    }
  }
  if (!meta.created || !Number.isFinite(Date.parse(meta.created))) {
    logger.log(t('implementation_plan.no_created_date'));
    return { found: true, stale: false, freshness: 'unknown', reason: 'source_baseline_missing' };
  }
  const sourceFiles = ['project.context.md', 'architecture.md', featureSlug ? `prd-${featureSlug}.md` : 'prd.md', 'discovery.md', 'ui-spec.md'];
  let stale = false;
  for (const source of sourceFiles) {
    try {
      const stat = await fs.stat(path.join(projectDir, CONTEXT_DIR, source));
      if (stat.mtimeMs > Date.parse(meta.created)) stale = true;
    } catch { /* Legacy optional sources may be absent. */ }
  }
  logger.log(t(stale ? 'implementation_plan.is_stale' : 'implementation_plan.is_fresh'));
  return { found: true, stale, freshness: stale ? 'stale' : 'timestamp_only' };
}

async function handleBind(projectDir, featureSlug, { logger }) {
  try {
    if (featureSlug && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(featureSlug)) throw new Error('Invalid feature slug');
    const planPath = await resolvePlanPath(projectDir, featureSlug);
    const relative = path.relative(projectDir, planPath);
    let content = await readProjectFile(projectDir, relative);
    const source = sourcePrdPath(parsePlanFrontmatter(content), featureSlug);
    const hash = contentHash(await readProjectFile(projectDir, source));
    content = setPlanField(content, 'source_prd', source);
    content = setPlanField(content, 'source_prd_sha256', hash);
    await require('../lib/delivery-followups').safeWrite(projectDir, relative, content);
    logger.log(`Plan bound to ${source}: ${hash}`);
    return { ok: true, source, hash };
  } catch (error) {
    logger.error(error.message);
    return { ok: false, reason: 'plan_binding_failed', error: error.message };
  }
}

/**
 * Subcommand: register
 * Registers an existing plan file into the runtime SQLite.
 */
async function handleRegister(projectDir, featureSlug, { logger, t }) {
  const planPath = await resolvePlanPath(projectDir, featureSlug);

  if (!(await pathExists(planPath))) {
    logger.error(t('implementation_plan.not_found', { file: path.basename(planPath) }));
    return { registered: false };
  }

  const content = await fs.readFile(planPath, 'utf8');
  const meta = parsePlanFrontmatter(content);
  const phases = countPhases(content);

  const contextDir = path.resolve(projectDir, CONTEXT_DIR);
  const sourceFiles = ['project.context.md', 'architecture.md', path.basename(sourcePrdPath(meta, featureSlug))];
  const existingSources = [];
  for (const sf of sourceFiles) {
    if (await pathExists(path.join(contextDir, sf))) existingSources.push(sf);
  }
  const sourceHash = await computeSourceHash(projectDir, existingSources.map(s => path.join(CONTEXT_DIR, s)));
  const hash = contentHash(sourceHash + content);
  const phaseRows = parsePlanPhases(content);
  if (new Set(phaseRows.map(phase => phase.id)).size !== phaseRows.length) return { registered: false, reason: 'duplicate_phase' };

  const handle = await openRuntimeDb(projectDir);
  const { db } = handle;
  try {
    const current = listImplementationPlans(db).find(row => row.feature_slug === (meta.feature_slug || featureSlug || null)
      && row.project_name === (meta.project || path.basename(projectDir)));
    if (current?.source_hash === hash) {
      const existing = new Set(getPlanPhases(db, current.plan_id).map(row => row.phase_number));
      for (const phase of phaseRows) if (!existing.has(Number(phase.id))) upsertPlanPhase(db, current.plan_id, Number(phase.id), phase.title, 'pending');
      return { registered: true, planId: current.plan_id, reused: true };
    }
    const planId = upsertImplementationPlan(db, {
      projectName: meta.project || path.basename(projectDir),
      scope: meta.scope || 'project',
      featureSlug: meta.feature_slug || featureSlug || null,
      status: meta.status || 'draft',
      classification: meta.classification || null,
      phasesTotal: phases,
      phasesCompleted: 0,
      sourceArtifacts: existingSources,
      sourceHash: hash
    });
    for (const phase of phaseRows) upsertPlanPhase(db, planId, Number(phase.id), phase.title, 'pending');
    logger.log(t('implementation_plan.registered', { planId, phases }));
    return { registered: true, planId };
  } finally {
    db.close();
  }
}

/**
 * Main router for implementation-plan subcommands.
 */
async function run(projectDir, args, context) {
  const sub = args[0] || 'show';
  const rest = args.slice(1);

  switch (sub) {
    case 'show':
      return handleShow(projectDir, rest[0] || null, context);
    case 'status':
      return handleStatus(projectDir, rest[0] || null, context);
    case 'checkpoint':
      return handleCheckpoint(projectDir, rest[0] || null, rest[1], context);
    case 'stale':
      return handleStale(projectDir, rest[0] || null, context);
    case 'bind':
      return handleBind(projectDir, rest[0] || null, context);
    case 'register':
      return handleRegister(projectDir, rest[0] || null, context);
    default:
      context.logger.error(`Unknown subcommand: ${sub}. Available: show, status, checkpoint, stale, register, bind`);
      return { error: true };
  }
}

/**
 * Entry point for CLI integration (same signature as other commands).
 */
async function runImplementationPlan({ args = [], options = {}, logger = console, t = (k) => k } = {}) {
  const projectDir = resolveTargetDir(args);
  const sub = options.sub || args[1] || 'show';
  const slug = options.feature || options.slug || args[2] || null;
  const context = { logger, t };

  if (sub === 'show') return handleShow(projectDir, slug, context);
  if (sub === 'status') return handleStatus(projectDir, slug, context);
  if (sub === 'checkpoint') {
    const phase = args[3] || options.phase;
    return handleCheckpoint(projectDir, slug, phase, context);
  }
  if (sub === 'stale') return handleStale(projectDir, slug, context);
  if (sub === 'bind') return handleBind(projectDir, slug, context);
  if (sub === 'register') return handleRegister(projectDir, slug, context);

  logger.error(`Unknown subcommand: ${sub}. Available: show, status, checkpoint, stale, register, bind`);
  return { error: true };
}

module.exports = { run, runImplementationPlan, handleShow, handleStatus, handleCheckpoint, handleStale, handleRegister, handleBind };
