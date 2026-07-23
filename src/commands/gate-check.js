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
  fileExists,
  parseFrontmatter,
  readPhaseGates,
  detectClassification,
  GATE_NAMES,
  GATE_ALIASES
} = require('../preflight-engine');

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
  const specFile = path.join(dir, `spec-${slug}.md`);
  const specContent = await readFileSafe(specFile);
  const gates = await readPhaseGates(targetDir, slug);
  const classification = await detectClassification(targetDir, slug);

  const gateName = GATE_NAMES[gateLetter];
  const gateStatus = gates[gateName] || 'pending';
  const prerequisites = GATE_PREREQUISITES[gateLetter] || [];

  const evidence = [];
  const missing = [];

  const completeness = await analyzeFeatureCompleteness(targetDir, slug, {
    classification,
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

  // Check required artifacts
  const requiredFiles = GATE_REQUIRED_ARTIFACTS[gateLetter](slug, classification);
  for (const fileName of requiredFiles) {
    const filePath = path.join(dir, fileName);
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
          const pass = verdict === 'pass' || /(?:\*\*)?verdict(?:\*\*)?\s*:\s*PASS\b/i.test(content);
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
    const qaReport = await readFileSafe(path.join(dir, `qa-report-${slug}.md`));
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
      requireAssertions: completeness.applicable
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
  }

  const allOk = missing.length === 0;
  const result = allOk ? 'PASS' : 'BLOCKED';

  let recommendation = '';
  if (result === 'PASS') {
    const nextAgents = {
      A: '@product',
      B: '@planner',
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
    recommendation = `BLOCKED — ${fixAgents[gateLetter] || 'resolve missing items'}`;
  }

  return {
    gate: gateLetter,
    gate_name: gateName,
    feature: slug,
    status: gateStatus,
    result,
    evidence,
    missing,
    recommendation
  };
}

async function runGateCheck({ args, options = {}, logger }) {
  const targetDir = path.resolve(process.cwd(), args[0] || '.');
  const slug = options.feature ? String(options.feature) : null;
  let gateLetter = options.gate ? String(options.gate).toUpperCase() : null;

  if (!slug) {
    if (options.json) return { ok: false, reason: 'missing_feature' };
    logger.log('--feature=<slug> is required.');
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

  const qaEvidence = check.evidence.filter((e) => e.type === 'qa_signoff' || e.type === 'checkpoint' || e.type === 'gate_field' || e.type === 'ac_test_audit');
  if (qaEvidence.length > 0) {
    for (const q of qaEvidence) {
      const icon = q.ok ? '  ✓' : '  ✗';
      if (q.type === 'qa_signoff') logger.log(`${icon} QA sign-off: ${q.exists === false ? 'missing' : `verdict ${q.verdict || 'unclear'}`}`);
      if (q.type === 'checkpoint') logger.log(`  ✓ last_checkpoint: "${q.value}"`);
      if (q.type === 'gate_field') logger.log(`${icon} gate_execution: ${q.value}`);
      if (q.type === 'ac_test_audit') {
        const s = q.summary || {};
        const missing = q.missing && q.missing.length ? ` (missing: ${q.missing.join(', ')})` : '';
        logger.log(`${icon} AC test audit: ${s.covered || 0}/${s.acs_total || 0} covered${missing}`);
      }
    }
  }

  logger.log('');
  const resultIcon = check.result === 'PASS' ? '✓' : '✗';
  logger.log(`Result: ${resultIcon} ${check.result} — ${check.recommendation}`);
  logger.log('');

  return result;
}

module.exports = { runGateCheck };
