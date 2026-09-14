'use strict';

/**
 * aioson gate:check — check if a phase gate is approved for a feature.
 *
 * Reads spec-{slug}.md frontmatter and artifact chain to verify gate status.
 * Returns PASS or BLOCKED with evidence. No LLM calls.
 *
 * Usage:
 *   aioson gate:check . --feature=checkout --gate=C
 *   aioson gate:check . --feature=checkout --gate=D
 *   aioson gate:check . --feature=checkout --gate=C --json
 */

const path = require('node:path');
const { auditAcceptanceCriteriaTests } = require('../lib/ac-test-audit');
const {
  analyzeFeatureCompleteness,
  findingsThroughStage
} = require('../lib/feature-completeness');
const {
  contextDir,
  readFileSafe,
  readFeatureArtifactSafe,
  featureDoneDir,
  fileExists,
  parseFrontmatter,
  readPhaseGates,
  detectClassification,
  GATE_NAMES,
  GATE_ALIASES
} = require('../preflight-engine');
const { resolveGateCBaseline } = require('../lib/gate-checkpoint');
const { runTechnicalGate } = require('../workflow-gates');
const { validateCurrentSheldonReview } = require('../lib/sheldon-review');
const { resolveTargetDir } = require('../lib/project-root');
const { evaluateFollowups, VERDICT: FOLLOWUP_VERDICT } = require('../lib/delivery-followups');

const BAR = '━'.repeat(35);

const GATE_PREREQUISITES = {
  A: [],
  B: [],
  C: [],
  D: ['C']
};

const GATE_REQUIRED_ARTIFACTS = {
  A: (slug) => [`prd-${slug}.md`],
  B: (slug) => [`prd-${slug}.md`],
  C: (slug) => [`implementation-plan-${slug}.md`],
  D: (slug) => [`qa-report-${slug}.md`]
};

const GATE_DESCRIPTIONS = {
  A: 'product scope',
  B: 'PRD readiness',
  C: 'plan',
  D: 'execution'
};

async function checkGate(targetDir, slug, gateLetter) {
  const dir = contextDir(targetDir);
  // A6: artefatos de feature fechada caem para .aioson/context/done/{slug}/
  const specContent = await readFeatureArtifactSafe(targetDir, slug, `spec-${slug}.md`);
  const gates = await readPhaseGates(targetDir, slug);
  const classification = await detectClassification(targetDir, slug);

  const gateName = GATE_NAMES[gateLetter];
  const gateStatus = gates[gateName] || 'pending';
  const prerequisites = GATE_PREREQUISITES[gateLetter] || [];
  const planPath = path.join(dir, `implementation-plan-${slug}.md`);
  const gateCBaseline = gateLetter === 'C'
    ? await resolveGateCBaseline(targetDir, slug, planPath)
    : null;

  const evidence = [];
  const missing = [];
  const followups = gateLetter === 'D' ? await evaluateFollowups(targetDir, slug) : null;

  const completeness = await analyzeFeatureCompleteness(targetDir, slug, {
    classification,
    // Exact create/modify path-state checks describe the planning baseline.
    // Planner writes `status: approved` before the first Gate C check, so the
    // durable checkpoint — fresh relative to the plan — is the transition to
    // execution semantics. A later plan edit invalidates that checkpoint.
    preImplementation: gateLetter === 'C' && gateCBaseline.pre_implementation,
    implementationBaseline: gateCBaseline,
    includeExecution: gateLetter === 'D'
  });
  if (completeness.applicable) {
    const stageByGate = { A: 'product', B: 'specification', C: 'plan', D: 'execution' };
    const completenessFindings = findingsThroughStage(completeness, stageByGate[gateLetter]);
    evidence.push({
      type: 'feature_completeness',
      ok: completenessFindings.length === 0,
      stage: stageByGate[gateLetter],
      summary: completeness.summary,
      findings: completenessFindings
    });
    for (const item of completenessFindings) {
      missing.push(`feature completeness [${item.check}]: ${item.message}`);
    }
  }
  if (gateLetter === 'C') {
    evidence.push({
      type: 'gate_c_baseline',
      ok: !gateCBaseline.blocking,
      mode: gateCBaseline.mode,
      cause: gateCBaseline.cause,
      owner: gateCBaseline.owner,
      recovery: gateCBaseline.recovery || null,
      plan_sha256: gateCBaseline.plan_sha256 || null,
      plan_mtime: gateCBaseline.plan_mtime || null
    });
    if (gateCBaseline.blocking) {
      missing.push(`Gate C recovery [${gateCBaseline.cause}]: ${gateCBaseline.recommendation}`);
    }
    const sheldonReview = await validateCurrentSheldonReview(
      targetDir,
      slug,
      path.join(dir, `prd-${slug}.md`)
    );
    evidence.push({
      type: 'sheldon_review',
      ok: sheldonReview.ok,
      report_path: sheldonReview.report_path || null,
      reason: sheldonReview.reason || null
    });
    if (!sheldonReview.ok) missing.push(`Sheldon review: ${sheldonReview.message}`);

    // §2c no plano (A5): uma feature runtime detectável (prototype-manifest /
    // migrações) precisa do harness-contract com RG-* — descobrir isso só no
    // feature:close custa o retrabalho inteiro. Avaliação estática apenas
    // (runChecks:false): nada é executado no gate de plano.
    const { evaluateContractIntegrityGate } = require('../harness/contract-integrity-gate');
    const harnessGate = await evaluateContractIntegrityGate(targetDir, slug, {
      runChecks: false, stage: 'planning', planContent: await readFileSafe(planPath)
    });
    evidence.push({
      type: 'harness_contract',
      ok: harnessGate.ok,
      has_contract: harnessGate.has_contract,
      planned: harnessGate.planned === true,
      runtime_signals: (harnessGate.runtime && harnessGate.runtime.signals) || [],
      errors: harnessGate.errors
    });
    if (!harnessGate.ok) {
      for (const err of harnessGate.errors || []) {
        missing.push(`harness contract [${err.code}]: ${err.message}`);
      }
    }
  }

  // Check prerequisites
  for (const prereq of prerequisites) {
    const prereqName = GATE_NAMES[prereq];
    const prereqStatus = gates[prereqName] || 'pending';
    if (prereqStatus === 'approved') {
      evidence.push({ type: 'prereq', gate: prereq, name: prereqName, status: 'approved', ok: true });
    } else {
      evidence.push({ type: 'prereq', gate: prereq, name: prereqName, status: prereqStatus, ok: false });
      missing.push(`Gate ${prereq} (${prereqName}) not approved: ${prereqStatus}`);
    }
  }

  // Check required artifacts (raiz com fallback para done/{slug} — A6)
  const requiredFiles = GATE_REQUIRED_ARTIFACTS[gateLetter](slug, classification);
  for (const fileName of requiredFiles) {
    const rootPath = path.join(dir, fileName);
    const archivedPath = path.join(featureDoneDir(targetDir, slug), fileName);
    const filePath = (await fileExists(rootPath)) ? rootPath : archivedPath;
    const exists = await fileExists(filePath);
    if (exists) {
      let detail = null;
      let ok = true;
      const content = await readFileSafe(filePath);
      if (content) {
        const fileFm = parseFrontmatter(content);
        const status = fileFm.status ? String(fileFm.status).toLowerCase() : null;
        if (status) detail = `status: ${status}`;

        if (gateLetter === 'B') {
          const prdReady = String(fileFm.prd_ready || '').toLowerCase();
          detail = `prd_ready: ${prdReady || 'missing'}`;
        }
        if (gateLetter === 'C' && status && !['pending', 'approved'].includes(status)) {
          ok = false;
          missing.push(`${fileName} status must be approved (or pending approval), found: ${status}`);
        }
        // Gate B/C checks validate whether the artifact is ready to approve.
        // gate:approve writes the approval marker itself, so a pending marker
        // cannot be treated as a prerequisite for its own approval.
        if (gateLetter === 'D') {
          const verdict = String(fileFm.verdict || fileFm.status || '').toLowerCase();
          const pass = (verdict === FOLLOWUP_VERDICT && followups?.eligible) || verdict === 'pass' || /(?:\*\*)?verdict(?:\*\*)?\s*:\s*PASS\b/i.test(content);
          if (!pass) {
            ok = false;
            missing.push(`${fileName} must record a PASS verdict`);
          }
          detail = `verdict: ${verdict || (pass ? 'pass' : 'missing')}`;
        }
      }
      evidence.push({ type: 'artifact', file: fileName, exists: true, detail, ok });
    } else {
      evidence.push({ type: 'artifact', file: fileName, exists: false, ok: false });
      missing.push(`${fileName} not found`);
    }
  }

  // Gate D: QA report is the canonical delivery verdict. Legacy spec sign-off
  // remains accepted only when no QA report was produced.
  if (gateLetter === 'D') {
    const qaReport = await readFeatureArtifactSafe(targetDir, slug, `qa-report-${slug}.md`);
    if (!qaReport && specContent && specContent.includes('## QA Sign-off')) {
      // Check verdict
      const passMatch = specContent.match(/\*\*Verdict:\*\*\s*(PASS|FAIL)/i);
      const passVerdict = passMatch ? passMatch[1].toUpperCase() : null;
      if (passVerdict === 'PASS') {
        evidence.push({ type: 'qa_signoff', verdict: 'PASS', ok: true });
      } else if (passVerdict === 'FAIL') {
        evidence.push({ type: 'qa_signoff', verdict: 'FAIL', ok: false });
        missing.push('QA sign-off verdict: FAIL');
      } else {
        evidence.push({ type: 'qa_signoff', verdict: null, ok: false });
        missing.push('QA sign-off found but verdict unclear');
      }
    } else if (!qaReport) {
      // A generic implementation checkpoint is not QA evidence. Gate D needs
      // the role-owned sign-off even when the implementation says "done".
      evidence.push({ type: 'qa_signoff', exists: false, ok: false });
      missing.push(`No qa-report-${slug}.md with PASS verdict`);
    }

    // Also check spec version for explicit gate_execution
    if (gates.execution && gates.execution !== 'pending') {
      const gateD = gates.execution;
      evidence.push({ type: 'gate_field', field: 'gate_execution', value: gateD, ok: gateD === 'approved' });
      if (gateD !== 'approved') missing.push(`gate_execution: ${gateD}`);
    }

    const acAudit = await auditAcceptanceCriteriaTests(targetDir, slug, {
      requireCriteria: completeness.applicable,
      requireAssertions: completeness.applicable,
      // Mirrors feature:close so a close-readiness check and the close itself
      // apply one evidence standard.
      acceptQaEvidence: true
    });
    evidence.push({
      type: 'ac_test_audit',
      ok: acAudit.ok,
      summary: acAudit.summary,
      missing: acAudit.missing
    });
    if (!acAudit.ok) {
      missing.push(`AC test audit failed: missing tests for ${acAudit.missing.join(', ')}`);
    }

    // Run the comprehensive suite only after cheap artifact/AC checks pass.
    // gate:approve and workflow:next consume the same fingerprinted evidence,
    // so the QA suite executes once per implementation state.
    if (missing.length === 0) {
      const technicalGate = await runTechnicalGate(targetDir, 'qa');
      evidence.push({
        type: 'technical_gate',
        ok: technicalGate.ok,
        cached: technicalGate.cached === true,
        fingerprint: technicalGate.fingerprint || null,
        evidence_path: technicalGate.evidence_path || null,
        completed_at: technicalGate.completed_at || null,
        results: technicalGate.results || []
      });
      if (!technicalGate.ok) {
        for (const reason of technicalGate.reasons || ['technical verification failed']) {
          missing.push(`technical gate: ${reason}`);
        }
      }
    }
  }

  if (gateLetter === 'D' && followups?.active) {
    evidence.push({ type: 'closure_followups', ok: followups.eligible, disposition: followups.disposition, deferred_acs: followups.deferred_acs });
  }
  const allOk = missing.length === 0;
  const result = allOk ? 'PASS' : 'BLOCKED';
  const disposition = allOk && followups?.eligible ? FOLLOWUP_VERDICT : null;

  let recommendation = '';
  if (result === 'PASS') {
    const nextAgents = {
      A: '@product',
      B: '@sheldon',
      C: '@dev',
      D: 'feature complete'
    };
    recommendation = `${nextAgents[gateLetter] || 'proceed'} can proceed`;
  } else {
    const fixAgents = {
      A: `activate @product to produce prd-${slug}.md`,
      B: `activate @product to complete acceptance criteria and approve prd-${slug}.md`,
      C: `activate @planner to produce and approve implementation-plan-${slug}.md`,
      D: `activate @qa for final verification; if QA passes, run: aioson gate:approve . --feature=${slug} --gate=D`
    };
    if (gateLetter === 'C') {
      const completenessFindings = evidence
        .filter((item) => item.type === 'feature_completeness')
        .flatMap((item) => item.findings || []);
      const sheldon = evidence.find((item) => item.type === 'sheldon_review');
      const planArtifact = evidence.find(
        (item) => item.type === 'artifact'
          && item.file === `implementation-plan-${slug}.md`
      );
      const hasPlanArtifactDefect = !planArtifact?.ok;
      const hasPlanContentDefect = completenessFindings.some(
        (item) => item.stage === 'plan' && !item.check.startsWith('source_')
      );
      if (completenessFindings.some((item) => item.check.startsWith('source_'))) {
        recommendation = `BLOCKED — run aioson briefing:migrate-lineage . --slug=${slug}, then revalidate`;
      } else if (hasPlanArtifactDefect) {
        recommendation = `BLOCKED — ${fixAgents.C}`;
      } else if (gateCBaseline && gateCBaseline.blocking) {
        recommendation = `BLOCKED — ${gateCBaseline.recommendation}`;
      } else if (hasPlanContentDefect) {
        recommendation = `BLOCKED — ${fixAgents.C}`;
      } else if (sheldon && !sheldon.ok) {
        recommendation = 'BLOCKED — activate @sheldon to produce a current hash-bound PASS';
      } else {
        recommendation = `BLOCKED — ${fixAgents.C}`;
      }
    } else {
      recommendation = `BLOCKED — ${fixAgents[gateLetter] || 'resolve missing items'}`;
    }
  }

  return {
    gate: gateLetter,
    gate_name: gateName,
    feature: slug,
    status: gateStatus,
    result,
    disposition,
    evidence,
    missing,
    recommendation
  };
}

async function runGateCheck({ args, options = {}, logger }) {
  const targetDir = resolveTargetDir(args);
  const slug = options.feature ? String(options.feature) : (options.slug ? String(options.slug) : null);
  let gateLetter = options.gate ? String(options.gate).toUpperCase() : null;

  if (!slug) {
    if (options.json) return { ok: false, reason: 'missing_feature' };
    logger.log('--feature=<slug> is required (--slug is accepted as an alias).');
    return { ok: false };
  }

  if (!gateLetter) {
    if (options.json) return { ok: false, reason: 'missing_gate' };
    logger.log('--gate=<A|B|C|D> is required.');
    return { ok: false };
  }

  // Allow gate name aliases (requirements → A, etc.)
  if (GATE_ALIASES[gateLetter.toLowerCase()]) {
    gateLetter = GATE_ALIASES[gateLetter.toLowerCase()];
  }

  if (!GATE_NAMES[gateLetter]) {
    if (options.json) return { ok: false, reason: 'invalid_gate', gate: gateLetter };
    logger.log(`Invalid gate: ${gateLetter}. Use A, B, C, or D.`);
    return { ok: false };
  }

  const check = await checkGate(targetDir, slug, gateLetter);

  const result = { ok: check.result === 'PASS', ...check };

  if (options.json) return result;

  logger.log('');
  logger.log(`Gate ${gateLetter} (${check.gate_name}) — ${slug}`);
  logger.log(BAR);
  logger.log(`Status: ${check.status}`);

  const prereqs = check.evidence.filter((e) => e.type === 'prereq');
  if (prereqs.length > 0) {
    logger.log('Prerequisites met:');
    for (const p of prereqs) {
      const icon = p.ok ? '  ✓' : '  ✗';
      logger.log(`${icon} Gate ${p.gate} (${p.name}): ${p.status}`);
    }
  }

  const artifacts = check.evidence.filter((e) => e.type === 'artifact');
  if (artifacts.length > 0) {
    logger.log('Artifacts:');
    for (const a of artifacts) {
      const icon = a.ok ? '  ✓' : '  ✗';
      const detail = a.detail ? ` (${a.detail})` : '';
      logger.log(`${icon} ${a.file}${a.ok ? ' exists' : ' missing'}${detail}`);
    }
  }

  const completenessEvidence = check.evidence.filter((e) => e.type === 'feature_completeness');
  if (completenessEvidence.length > 0) {
    for (const item of completenessEvidence) {
      const icon = item.ok ? '  ✓' : '  ✗';
      const errors = item.findings ? item.findings.length : 0;
      logger.log(`${icon} Feature completeness (${item.stage}): ${errors} blocking gap(s)`);
    }
  }

  const qaEvidence = check.evidence.filter((e) => e.type === 'qa_signoff' || e.type === 'checkpoint' || e.type === 'gate_field' || e.type === 'ac_test_audit' || e.type === 'technical_gate' || e.type === 'harness_contract');
  if (qaEvidence.length > 0) {
    for (const q of qaEvidence) {
      const icon = q.ok ? '  ✓' : '  ✗';
      if (q.type === 'harness_contract') {
        const signals = q.runtime_signals && q.runtime_signals.length ? ` (runtime: ${q.runtime_signals.join(', ')})` : '';
        logger.log(`${icon} Harness contract: ${q.ok ? (q.has_contract ? 'valid' : q.planned ? 'planned for DEV; required at delivery' : 'not required') : 'blocking'}${signals}`);
      }
      if (q.type === 'qa_signoff') logger.log(`${icon} QA sign-off: ${q.exists === false ? 'missing' : `verdict ${q.verdict || 'unclear'}`}`);
      if (q.type === 'checkpoint') logger.log(`  ✓ last_checkpoint: "${q.value}"`);
      if (q.type === 'gate_field') logger.log(`${icon} gate_execution: ${q.value}`);
      if (q.type === 'ac_test_audit') {
        const s = q.summary || {};
        const missing = q.missing && q.missing.length ? ` (missing: ${q.missing.join(', ')})` : '';
        logger.log(`${icon} AC test audit: ${s.covered || 0}/${s.acs_total || 0} covered${s.deferred ? `; ${s.deferred} deferred with followups` : ''}${missing}`);
      }
      if (q.type === 'technical_gate') {
        const source = q.cached ? 'cached evidence' : 'executed now';
        logger.log(`${icon} Technical verification: ${source}`);
      }
    }
  }

  logger.log('');
  const resultIcon = check.result === 'PASS' ? '✓' : '✗';
  if (check.disposition) logger.log(`Disposition: ${check.disposition} — pending work is preserved in linked Simple Plans at close`);
  logger.log(`Result: ${resultIcon} ${check.result} — ${check.recommendation}`);
  logger.log('');

  return result;
}

module.exports = { runGateCheck };
