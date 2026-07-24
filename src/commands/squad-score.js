'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const {
  findCurrentEvidencePack,
  flattenGenomeBindings
} = require('../squad/manifest-validator');
const { runSquadValidate } = require('./squad-validate');
const { isValidSlug } = require('../dossier/schema');

async function readJsonIfExists(filePath) {
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    return JSON.parse(raw);
  } catch { return null; }
}

async function resolveInvestigationEvidence(projectDir, slug, manifest) {
  const investigation = manifest && typeof manifest.investigation === 'object'
    ? manifest.investigation
    : null;

  if (investigation && (investigation.slug || investigation.path)) {
    const relPath = investigation.path
      ? String(investigation.path).replace(/\\/g, '/').replace(/^\.\//, '')
      : null;
    let existsOnDisk = false;
    if (relPath) {
      try {
        await fs.access(path.resolve(projectDir, relPath));
        existsOnDisk = true;
      } catch {
        existsOnDisk = false;
      }
    }

    return {
      present: true,
      source: 'manifest',
      slug: investigation.slug || slug,
      path: relPath,
      existsOnDisk
    };
  }

  const legacyDir = path.join(projectDir, 'squad-searches', slug);
  try {
    await fs.access(legacyDir);
    return {
      present: true,
      source: 'legacy-dir',
      slug,
      path: path.relative(projectDir, legacyDir).replace(/\\/g, '/'),
      existsOnDisk: true
    };
  } catch {
    return {
      present: false,
      source: null,
      slug: null,
      path: null,
      existsOnDisk: false
    };
  }
}

function scoreCompletude(manifest) {
  let score = 0;
  const details = {};
  const executors = Array.isArray(manifest.executors) ? manifest.executors : [];
  const workflows = Array.isArray(manifest.workflows) ? manifest.workflows : [];
  const checklists = Array.isArray(manifest.checklists) ? manifest.checklists : [];

  // Executors typed (5pts)
  const allTyped = executors.length > 0 && executors.every(e => e.type);
  if (allTyped) { score += 5; details.executorsTyped = true; }

  // Workflow defined (5pts)
  const hasWorkflow = workflows.some(w => Array.isArray(w.phases) && w.phases.length >= 2);
  if (hasWorkflow) { score += 5; details.workflowDefined = true; }

  // Checklists present (3pts)
  if (checklists.length > 0) { score += 3; details.checklistsPresent = true; }

  // Tasks decomposed (5pts)
  const hasTask = executors.some(e => Array.isArray(e.tasks) && e.tasks.length > 0);
  if (hasTask) { score += 5; details.tasksDecomposed = true; }

  // Workers present (2pts)
  const hasWorker = executors.some(e => e.type === 'worker' || e.usesLLM === false);
  if (hasWorker) { score += 2; details.workersPresent = true; }

  // Current evidence (3pts)
  if (manifest._hasCurrentEvidence) {
    score += 3;
    details.currentEvidence = manifest._evidencePath || true;
  }

  // Model tiering (2pts)
  const allTiered = executors.length > 0 && executors.every(e => e.modelTier);
  if (allTiered) { score += 2; details.modelTiering = true; }

  return { score, max: 25, details };
}

function scoreProfundidade(manifest) {
  let score = 0;
  const details = {};
  const executors = Array.isArray(manifest.executors) ? manifest.executors : [];

  // Executor focus areas avg >= 3 (5pts)
  const focusCounts = executors.map(e => (Array.isArray(e.focus) ? e.focus : []).length);
  const avgFocus = focusCounts.length > 0 ? focusCounts.reduce((a, b) => a + b, 0) / focusCounts.length : 0;
  if (avgFocus >= 3) { score += 5; details.focusAreas = true; }

  // Task quality criteria avg >= 3 (5pts)
  const allTasks = executors.flatMap(e => Array.isArray(e.tasks) ? e.tasks : []);
  if (allTasks.length > 0) { score += 5; details.taskCriteria = true; }

  // Veto conditions (5pts)
  const workflows = Array.isArray(manifest.workflows) ? manifest.workflows : [];
  const hasVeto = workflows.some(w =>
    (Array.isArray(w.phases) ? w.phases : []).some(p =>
      Array.isArray(p.vetoConditions) && p.vetoConditions.length > 0
    )
  );
  if (hasVeto) { score += 5; details.vetoConditions = true; }

  // Content blueprints with 3+ sections (5pts)
  const blueprints = Array.isArray(manifest.contentBlueprints) ? manifest.contentBlueprints : [];
  const hasBp = blueprints.some(bp => Array.isArray(bp.sections) && bp.sections.length >= 3);
  if (hasBp) { score += 5; details.contentBlueprints = true; }

  // Skills declared >= 2 (5pts)
  const skills = Array.isArray(manifest.skills) ? manifest.skills : [];
  if (skills.length >= 2) { score += 5; details.skillsDeclared = true; }

  return { score, max: 25, details };
}

function scoreQualidadeEstrutural(manifest) {
  let score = 0;
  const details = {};
  const executors = Array.isArray(manifest.executors) ? manifest.executors : [];
  const workflows = Array.isArray(manifest.workflows) ? manifest.workflows : [];

  // Review loops (5pts)
  const hasReview = workflows.some(w =>
    (Array.isArray(w.phases) ? w.phases : []).some(p => p.review)
  );
  if (hasReview) { score += 5; details.reviewLoops = true; }

  // Human gates (5pts)
  const hasGate = workflows.some(w =>
    (Array.isArray(w.phases) ? w.phases : []).some(p => p.humanGate)
  );
  if (hasGate) { score += 5; details.humanGates = true; }

  // Cross-squad awareness (3pts) — orchestrator mentions cross-squad
  // Simplified: check if ports are defined
  if (manifest.ports && (Array.isArray(manifest.ports.inputs) || Array.isArray(manifest.ports.outputs))) {
    score += 3; details.crossSquad = true;
  }

  // Output strategy configured (4pts)
  const os = manifest.outputStrategy;
  if (os && os.mode && os.mode !== 'hybrid') { score += 4; details.outputStrategy = true; }
  else if (os && os.mode === 'hybrid') { score += 4; details.outputStrategy = true; }

  // Genome bindings (3pts) — operational effect, not metadata presence.
  const bindings = flattenGenomeBindings(manifest);
  const compiled = bindings.length > 0 && bindings.every((binding) => (
    binding.status === 'compiled' && binding.compilationId
  ));
  if (compiled) {
    score += 3;
    details.compiledGenomeBindings = true;
  } else if (bindings.length > 0) {
    details.genomeBindingsPending = true;
  } else if (manifest.genomes) {
    details.legacyGenomeMetadata = true;
  }

  // Format references (5pts)
  const hasFormat = executors.some(e => Array.isArray(e.formats) && e.formats.length > 0);
  if (hasFormat) { score += 5; details.formatReferences = true; }

  return { score, max: 25, details };
}

function scorePotencial(manifest) {
  let score = 0;
  const details = {};
  const workflows = Array.isArray(manifest.workflows) ? manifest.workflows : [];

  // Anti-pattern guards via veto conditions (5pts)
  const hasVeto = workflows.some(w =>
    (Array.isArray(w.phases) ? w.phases : []).some(p =>
      Array.isArray(p.vetoConditions) && p.vetoConditions.length > 0
    )
  );
  if (hasVeto) { score += 5; details.antiPatternGuards = true; }

  // Domain vocabulary — current Evidence Pack (5pts)
  if (manifest._hasCurrentEvidence) {
    score += 5;
    details.domainVocabulary = manifest._evidencePath || true;
  }

  // Structural patterns — content blueprints (5pts)
  const blueprints = Array.isArray(manifest.contentBlueprints) ? manifest.contentBlueprints : [];
  if (blueprints.length > 0) { score += 5; details.structuralPatterns = true; }

  // Executor coherence + output realism come from executable eval evidence.
  if (manifest._latestEval?.source_rubric?.status === 'pass') {
    score += 5;
    details.executorCoherence = true;
  }
  if (manifest._latestEval?.held_out?.status === 'pass') {
    score += 5;
    details.outputRealism = true;
  }
  if (!manifest._latestEval) details.evaluationPending = true;

  return { score, max: 25, details };
}

function gradeFromScore(total) {
  if (total >= 90) return 'S (Exceptional)';
  if (total >= 80) return 'A (Excellent)';
  if (total >= 70) return 'B (Good)';
  if (total >= 50) return 'C (Adequate)';
  return 'D (Needs work)';
}

function suggestQuickWins(d1, d2, d3, d4) {
  const wins = [];
  if (!d3.details.reviewLoops) wins.push({ action: 'Add review loop to a workflow phase', pts: 5 });
  if (!d1.details.tasksDecomposed) wins.push({ action: 'Decompose at least 1 executor into tasks', pts: 5 });
  if (!d3.details.formatReferences) wins.push({ action: 'Add a format reference to an executor', pts: 5 });
  if (!d2.details.vetoConditions) wins.push({ action: 'Add veto conditions to a workflow phase', pts: 5 });
  if (!d1.details.modelTiering) wins.push({ action: 'Assign modelTier to all executors', pts: 2 });
  if (!d1.details.workersPresent) wins.push({ action: 'Add a worker executor (no LLM)', pts: 2 });
  return wins.slice(0, 3);
}

async function runSquadScore({ args = [], options = {}, logger = console, translator } = {}) {
  const projectDir = path.resolve(process.cwd(), args[0] || '.');
  const slug = options.squad || args[1];

  if (!slug) {
    logger.error('Usage: aioson squad:score [path] --squad=<slug>');
    return { valid: false, error: 'No slug provided' };
  }
  if (!isValidSlug(slug)) {
    logger.error(`Invalid squad slug: "${slug}"`);
    return { valid: false, error: 'invalid_slug' };
  }

  const manifestPath = path.join(projectDir, '.aioson', 'squads', slug, 'squad.manifest.json');
  const manifest = await readJsonIfExists(manifestPath);

  if (!manifest) {
    logger.error(`Squad "${slug}" not found or invalid manifest`);
    return { valid: false, error: 'Manifest not found' };
  }

  const investigationEvidence = await resolveInvestigationEvidence(projectDir, slug, manifest);
  manifest._hasInvestigation = investigationEvidence.present;
  manifest._investigationSource = investigationEvidence.source;
  manifest._investigationPath = investigationEvidence.path;
  const researchPolicy = manifest.researchPolicy?.policy;
  const policyDefaultHours = researchPolicy === 'live-required'
    ? 6
    : researchPolicy === 'live-check'
      ? 24
      : 168;
  const declaredHours = manifest.researchPolicy?.maxAgeHours !== undefined
    ? Number(manifest.researchPolicy.maxAgeHours)
    : manifest.researchPolicy?.maxAgeDays !== undefined
      ? Number(manifest.researchPolicy.maxAgeDays) * 24
      : policyDefaultHours;
  const evidence = await findCurrentEvidencePack(projectDir, slug, {
    maxAgeHours: Math.min(
      Number.isFinite(declaredHours) && declaredHours > 0 ? declaredHours : policyDefaultHours,
      policyDefaultHours
    ),
    expectedPolicy: researchPolicy || null,
    expectedSquad: slug
  });
  manifest._hasCurrentEvidence = evidence.current
    && evidence.pack?.status === 'pass'
    && evidence.pack?.provider?.available === true;
  manifest._evidencePath = evidence.path || null;
  manifest._latestEval = await readJsonIfExists(
    path.join(projectDir, '.aioson', 'squads', slug, 'evals', 'latest.json')
  );

  const d1 = scoreCompletude(manifest);
  const d2 = scoreProfundidade(manifest);
  const d3 = scoreQualidadeEstrutural(manifest);
  const d4 = scorePotencial(manifest);

  const rawTotal = d1.score + d2.score + d3.score + d4.score;
  const maxTotal = d1.max + d2.max + d3.max + d4.max;
  const declaresPremium = Boolean(
    manifest.evaluation
    || manifest.composition
    || manifest.researchPolicy
    || manifest.genomeBindings
  );
  let strictValidation = null;
  if (declaresPremium) {
    strictValidation = await runSquadValidate({
      args: [projectDir],
      options: { squad: slug, strict: true, json: true },
      logger: { log() {}, error() {} }
    });
  }
  const caps = [];
  if (declaresPremium && strictValidation && !strictValidation.valid) {
    caps.push({ reason: 'strict-premium-gate-failed', maximum: 69 });
  }
  if (manifest._latestEval && (
    ['FAIL', 'UNVERIFIED'].includes(manifest._latestEval.verdict)
    || Number(manifest._latestEval.critical_failures || 0) > 0
  )) {
    caps.push({ reason: 'critical-eval-failure', maximum: 49 });
  }
  const total = caps.reduce((value, cap) => Math.min(value, cap.maximum), rawTotal);
  const grade = gradeFromScore(total);
  const wins = suggestQuickWins(d1, d2, d3, d4);

  logger.log('');
  logger.log(`  Squad: ${slug}`);
  logger.log('');
  logger.log(`  Completude:              ${String(d1.score).padStart(2)}/${d1.max}`);
  logger.log(`  Profundidade:            ${String(d2.score).padStart(2)}/${d2.max}`);
  logger.log(`  Qualidade Estrutural:    ${String(d3.score).padStart(2)}/${d3.max}`);
  logger.log(`  Potencial de Resultado:  ${String(d4.score).padStart(2)}/${d4.max}*`);
  logger.log(`  ${'─'.repeat(40)}`);
  logger.log(`  TOTAL:                   ${String(total).padStart(2)}/${maxTotal}`);
  if (total !== rawTotal) logger.log(`  Raw score:               ${String(rawTotal).padStart(2)}/${maxTotal} (capped by delivery evidence)`);
  logger.log(`  Grade: ${grade}`);
  logger.log('');
  logger.log('  * Dimensão 4 parcial (sem LLM assessment)');

  if (wins.length > 0) {
    logger.log('');
    logger.log('  Quick wins:');
    wins.forEach((w, i) => logger.log(`    ${i + 1}. ${w.action} → +${w.pts} pts`));
  }

  logger.log('');

  // Store in runtime if available. `openRuntimeDb` is async — without `await`
  // the destructure unpacks the Promise (db === undefined), the try block
  // throws on db.prepare, the catch swallows the error, AND the underlying
  // Promise still resolves and leaks a never-closed handle. On Windows that
  // leak is what made `fs.rm(tmpDir)` fail with EBUSY in test fixtures.
  try {
    const { openRuntimeDb } = require('../runtime-store');
    const { db } = await openRuntimeDb(projectDir);
    try {
      const now = new Date().toISOString();
      const stmt = db.prepare('INSERT OR REPLACE INTO squad_scores (squad_slug, dimension, score, max_score, details_json, scored_at) VALUES (?, ?, ?, ?, ?, ?)');
      stmt.run(slug, 'completude', d1.score, d1.max, JSON.stringify(d1.details), now);
      stmt.run(slug, 'profundidade', d2.score, d2.max, JSON.stringify(d2.details), now);
      stmt.run(slug, 'qualidade', d3.score, d3.max, JSON.stringify(d3.details), now);
      stmt.run(slug, 'potencial', d4.score, d4.max, JSON.stringify(d4.details), now);
    } finally {
      db.close();
    }
  } catch { /* runtime not available */ }

  return {
    slug,
    total,
    rawTotal,
    max: maxTotal,
    grade,
    dimensions: { completude: d1, profundidade: d2, qualidade: d3, potencial: d4 },
    quickWins: wins,
    assurance: {
      strict: strictValidation ? {
        valid: strictValidation.valid,
        errors: strictValidation.errors
      } : null,
      eval: manifest._latestEval ? {
        verdict: manifest._latestEval.verdict,
        criticalFailures: manifest._latestEval.critical_failures
      } : null,
      evidence: {
        current: Boolean(manifest._hasCurrentEvidence),
        path: manifest._evidencePath
      },
      caps
    }
  };
}

module.exports = { runSquadScore, scoreCompletude, scoreProfundidade, scoreQualidadeEstrutural, scorePotencial, gradeFromScore };
