'use strict';

/**
 * aioson preflight — consolidated pre-flight analysis for any agent session.
 *
 * Replaces 10+ manual file checks with one command. Returns mode, context package,
 * readiness, phase gates, and next step — deterministically, with no LLM calls.
 *
 * Usage:
 *   aioson preflight . --agent=dev --feature=checkout
 *   aioson preflight . --agent=qa --feature=checkout --json
 *   aioson preflight .   (project-level, no feature)
 */

const path = require('node:path');
const {
  loadProjectContext,
  scanArtifacts,
  scanActiveManifest,
  readPhaseGates,
  readDevState,
  readProjectPulse,
  detectClassification,
  detectFramework,
  detectTestRunner,
  discoverRules,
  discoverDesignDocs,
  buildContextPackage,
  evaluateReadiness,
  detectStaleDevState,
  detectStaleDevStateRich,
  extractSpecVersion,
  extractLastCheckpoint,
  GATE_NAMES
} = require('../preflight-engine');
const {
  analyzeFeatureCompleteness,
  findingsThroughStage
} = require('../lib/feature-completeness');

const BAR = '━'.repeat(55);

function gateIcon(status) {
  if (!status) return '○';
  if (status === 'approved') return '✓';
  if (status === 'pending') return '○';
  return '✗';
}

async function runPreflight({ args, options = {}, logger }) {
  const targetDir = path.resolve(process.cwd(), args[0] || '.');
  const agent = options.agent ? String(options.agent) : null;
  const slug = options.feature ? String(options.feature) : null;

  // --- Gather all data ---
  const ctx = await loadProjectContext(targetDir);
  const artifacts = await scanArtifacts(targetDir, slug);
  const manifest = await scanActiveManifest(targetDir, slug);
  const phaseGates = await readPhaseGates(targetDir, slug);
  const devState = await readDevState(targetDir);
  const pulse = await readProjectPulse(targetDir);

  let classification = await detectClassification(targetDir, slug);
  const framework = ctx.data.framework || ctx.data.stack || await detectFramework(targetDir);
  const testRunnerInfo = await detectTestRunner(targetDir);
  const testRunner = testRunnerInfo ? testRunnerInfo.name : (ctx.data.test_runner || null);
  const rules = agent ? await discoverRules(targetDir, agent) : [];
  const designDocs = agent ? await discoverDesignDocs(targetDir, agent) : [];
  const contextPackage = buildContextPackage(agent || 'dev', slug, classification, artifacts, devState, manifest);
  let readiness = evaluateReadiness(artifacts, phaseGates, classification, agent, devState, slug);
  let completeness = null;
  if (slug && (agent === 'dev' || agent === 'qa')) {
    completeness = await analyzeFeatureCompleteness(targetDir, slug, {
      artifacts,
      classification,
      includeExecution: agent === 'qa'
    });
    if (completeness.applicable) {
      const completenessFindings = findingsThroughStage(
        completeness,
        agent === 'qa' ? 'execution' : 'plan'
      );
      if (completenessFindings.length > 0) {
        readiness = {
          status: 'BLOCKED',
          blockers: [
            ...(readiness.blockers || []),
            ...completenessFindings.map((item) => `feature completeness [${item.check}]: ${item.message}`)
          ],
          warnings: readiness.warnings || []
        };
      }
    }
  }

  // Determine active execution artifact (AC-SDLC-24)
  const activeExecutionArtifact = manifest && manifest.exists && manifest.is_active
    ? manifest.path
    : (artifacts.implementation_plan.exists ? artifacts.implementation_plan.path : null);

  // Stale dev-state detection (AC-SDLC-12 + F1 workflow-handoff-integrity v1.9.7).
  // Use rich variant: cross-references features.md (orphan/done detection) and applies 30d TTL.
  const staleDevStateWarning = devState.exists
    ? await detectStaleDevStateRich(devState, slug, targetDir)
    : null;

  // Determine mode
  const hasFeatureArtifacts = artifacts.prd.exists
    || artifacts.requirements.exists
    || artifacts.spec.exists
    || artifacts.implementation_plan.exists
    || (manifest && manifest.exists);
  const mode = slug
    ? (artifacts.prd.exists ? 'feature' : (hasFeatureArtifacts ? 'continuation' : 'unframed_feature'))
    : (artifacts.project_context.exists ? 'project' : 'greenfield');

  // Spec version + checkpoint
  const specVersion = extractSpecVersion(artifacts.spec);
  const lastCheckpoint = extractLastCheckpoint(artifacts.spec);

  const result = {
    ok: true,
    mode,
    feature_slug: slug,
    agent,
    classification,
    framework: framework || null,
    test_runner: testRunner,
    artifacts: {
      project_context: { exists: artifacts.project_context.exists, path: artifacts.project_context.path || null },
      prd: { exists: artifacts.prd.exists, path: artifacts.prd.path || null },
      sheldon_enrichment: { exists: artifacts.sheldon_enrichment.exists },
      requirements: { exists: artifacts.requirements.exists, path: artifacts.requirements.path || null },
      spec: {
        exists: artifacts.spec.exists,
        path: artifacts.spec.path || null,
        version: specVersion,
        last_checkpoint: lastCheckpoint
      },
      architecture: { exists: artifacts.architecture.exists },
      design_doc: { exists: artifacts.design_doc.exists, path: artifacts.design_doc.path || null },
      readiness: { exists: artifacts.readiness.exists, path: artifacts.readiness.path || null },
      implementation_plan: {
        exists: artifacts.implementation_plan.exists,
        path: artifacts.implementation_plan.path || null,
        status: artifacts.implementation_plan.exists ? (artifacts.implementation_plan.frontmatter.status || null) : null
      },
      conformance: { exists: artifacts.conformance.exists },
      dev_state: {
        exists: devState.exists,
        next_step: devState.next_step || null
      }
    },
    phase_gates: {
      requirements: phaseGates.requirements || 'pending',
      design: phaseGates.design || 'pending',
      plan: phaseGates.plan || 'pending',
      execution: phaseGates.execution || 'pending'
    },
    active_execution_artifact: activeExecutionArtifact,
    manifest: manifest ? {
      exists: manifest.exists,
      path: manifest.path || null,
      status: manifest.status || null,
      is_active: manifest.is_active || false,
      next_pending_phase: manifest.next_pending_phase || null
    } : { exists: false },
    context_package: contextPackage,
    rules,
    design_governance: designDocs,
    context_layers: {
      rules,
      design_governance: designDocs
    },
    readiness: readiness.status,
    readiness_blockers: readiness.blockers,
    readiness_warnings: readiness.warnings || [],
    feature_completeness: completeness ? {
      applicable: completeness.applicable,
      ok: completeness.ok,
      summary: completeness.summary
    } : null,
    stale_dev_state: staleDevStateWarning || null,
    pulse: {
      last_agent: pulse.last_agent || null,
      last_gate: pulse.last_gate || null,
      blockers: pulse.blockers || 'none'
    },
    dev_state: {
      active_feature: devState.active_feature || null,
      active_phase: devState.active_phase || null,
      next_step: devState.next_step || null,
      last_spec_version: devState.last_spec_version || null
    }
  };

  if (options.json) return result;

  // --- Human output ---
  const header = agent && slug
    ? `AIOSON Pre-flight — @${agent} / ${slug}`
    : agent
      ? `AIOSON Pre-flight — @${agent}`
      : 'AIOSON Pre-flight';

  logger.log('');
  logger.log(header);
  logger.log(BAR);
  logger.log('');
  logger.log(`Mode: ${mode}${classification ? ' | Classification: ' + classification : ''}${framework ? ' | Framework: ' + framework : ''}${testRunner ? ' | Test runner: ' + testRunner : ''}`);
  logger.log('');

  logger.log('Artifacts:');
  const checks = [
    ['project.context.md', artifacts.project_context.exists, null],
    slug ? [`prd-${slug}.md`, artifacts.prd.exists, null] : null,
    slug ? [`sheldon-enrichment-${slug}.md`, artifacts.sheldon_enrichment.exists, 'optional'] : null,
    slug ? [`requirements-${slug}.md`, artifacts.requirements.exists, null] : null,
    slug
      ? [`spec-${slug}.md`, artifacts.spec.exists, specVersion ? `version: ${specVersion}${lastCheckpoint ? ', last: "' + lastCheckpoint + '"' : ''}` : null]
      : null,
    ['architecture.md', artifacts.architecture.exists, null],
    ['design-doc.md', artifacts.design_doc.exists, classification === 'MICRO' ? 'SMALL/MEDIUM pre-dev only' : null],
    ['readiness.md', artifacts.readiness.exists, classification === 'MICRO' ? 'SMALL/MEDIUM pre-dev only' : null],
    slug ? [`implementation-plan-${slug}.md`, artifacts.implementation_plan.exists, artifacts.implementation_plan.exists ? `status: ${artifacts.implementation_plan.frontmatter.status || 'unknown'}` : null] : null,
    slug ? [`conformance-${slug}.yaml`, artifacts.conformance.exists, classification === 'SMALL' || classification === 'MICRO' ? 'MEDIUM only — not required' : null] : null
  ].filter(Boolean);

  for (const [name, exists, note] of checks) {
    const icon = exists ? '  ✓' : '  ✗';
    const suffix = note ? ` (${note})` : '';
    logger.log(`${icon} ${name}${suffix}`);
  }

  logger.log('');
  logger.log('Phase gates:');
  for (const [letter, name] of Object.entries(GATE_NAMES)) {
    const status = phaseGates[name] || 'pending';
    logger.log(`  ${gateIcon(status)} Gate ${letter} (${name}): ${status}`);
  }

  if (manifest && manifest.exists) {
    logger.log('');
    logger.log('Active execution artifact:');
    const manifestIcon = manifest.is_active ? '  ✓' : '  ○';
    logger.log(`${manifestIcon} ${manifest.path} (status: ${manifest.status || 'unknown'})${manifest.is_active ? ' [PRIMARY]' : ' [complete — not active]'}`);
    if (manifest.is_active && manifest.next_pending_phase) {
      const p = manifest.next_pending_phase;
      logger.log(`  → Next pending phase: Phase ${p.phase} — ${p.file} (status: ${p.status})`);
    }
    if (!manifest.is_active && artifacts.implementation_plan.exists) {
      logger.log(`  ✓ ${artifacts.implementation_plan.path || `implementation-plan-${slug}.md`} [primary — manifest complete]`);
    }
  }

  if (devState.exists) {
    logger.log('');
    logger.log('Dev state:');
    if (devState.active_feature) logger.log(`  active_feature: ${devState.active_feature}`);
    if (devState.active_phase) logger.log(`  active_phase: ${devState.active_phase}`);
    if (devState.next_step) logger.log(`  next_step: "${devState.next_step}"`);
    if (devState.last_spec_version) logger.log(`  last_spec_version: ${devState.last_spec_version}`);
    if (devState.status) logger.log(`  status: ${devState.status}`);
    if (staleDevStateWarning) {
      logger.log(`  ⚠ STALE: ${staleDevStateWarning}`);
    }
  }

  if (contextPackage.length > 0) {
    logger.log('');
    logger.log('Context package (load these):');
    contextPackage.forEach((p, i) => logger.log(`  ${i + 1}. ${p}`));
  }

  if (rules.length > 0) {
    logger.log('');
    logger.log(`Rules loaded: ${rules.join(', ')}`);
  }

  if (designDocs.length > 0) {
    logger.log('');
    logger.log('Design governance (load if implementation or structural planning touches code):');
    designDocs.forEach((p, i) => logger.log(`  ${i + 1}. ${p}`));
  }

  if (pulse.last_agent) {
    logger.log('');
    logger.log('Project pulse:');
    if (pulse.last_agent) logger.log(`  last_agent: @${pulse.last_agent}`);
    if (pulse.last_gate) logger.log(`  last_gate: ${pulse.last_gate}`);
    logger.log(`  blockers: ${pulse.blockers || 'none'}`);
  }

  logger.log('');
  if (readiness.status === 'READY') {
    logger.log(`Readiness: READY — proceed`);
  } else if (readiness.status === 'READY_WITH_WARNINGS') {
    logger.log(`Readiness: READY_WITH_WARNINGS — can proceed but review warnings`);
    for (const w of readiness.warnings || []) logger.log(`  ⚠ ${w}`);
  } else {
    logger.log(`Readiness: BLOCKED`);
    for (const b of readiness.blockers) logger.log(`  ✗ ${b}`);
    if ((readiness.warnings || []).length > 0) {
      logger.log('  Warnings:');
      for (const w of readiness.warnings) logger.log(`    ⚠ ${w}`);
    }
  }
  logger.log('');

  return result;
}

module.exports = { runPreflight };
