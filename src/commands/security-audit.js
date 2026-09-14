'use strict';

const path = require('node:path');
const fs = require('node:fs/promises');

const {
  readSlugArtifacts,
  extractClassification,
  extractAttackSurfaceFlags
} = require('../lib/security/artifact-reader');
const { EXIT_CODES, resolveExitCode } = require('../lib/security/exit-codes');
const { writeFindings } = require('../lib/security/findings-writer');
const { emitSecurityRuntimeEvent } = require('../lib/security/runtime-events');
const { resolveTargetDir } = require('../lib/project-root');

const VERSION = '1.0.0';
const GENERATOR = `aioson security:audit@${VERSION}`;

const AUDIT_ARTIFACT_KEYS = ['prd', 'implementation_plan', 'requirements', 'spec'];

const SURFACE_TO_CONTROLS = Object.freeze({
  auth: ['SEC-SBD-08', 'SEC-SBD-03'],
  ownership: ['SEC-SBD-03'],
  money: ['SEC-SBD-04'],
  uploads: ['SEC-SBD-02'],
  external_urls: ['SEC-SBD-06'],
  secrets: ['SEC-SBD-05'],
  storage: ['SEC-SBD-07']
});

function missingArtifactFinding(key, filePath, owner) {
  return {
    source: 'security-audit',
    control_id: 'SEC-SBD-00',
    severity: 'inconclusive',
    status: 'needs_validation',
    scope: `${key}:${filePath}`,
    affected_artifacts: [filePath],
    preconditions: [`Artifact ${key} expected at ${filePath}`],
    reproduction_steps: [`stat ${filePath}`],
    evidence: [`Artifact ${key} not found at ${filePath}`],
    impact: `Cannot audit feature without ${key} artifact.`,
    suggested_fix: `Generate ${key} via @${owner} before running audit.`,
    recommended_owner: owner,
    recommended_gate_status: 'review'
  };
}

function attackSurfaceMissingFinding(slug, filePath) {
  return {
    source: 'security-audit',
    control_id: 'SEC-SBD-03',
    severity: 'medium',
    scope: `${slug}:attack-surface-map`,
    affected_artifacts: [filePath],
    preconditions: [`Scope artifact present at ${filePath}`],
    reproduction_steps: [`Search ${filePath} for "Attack Surface Map" section`],
    evidence: [`No Attack Surface Map section found in ${filePath}.`],
    impact: 'Without an Attack Surface Map, ownership/IDOR coverage cannot be verified.',
    suggested_fix: 'Record the feature attack surfaces in the PRD via @product.',
    recommended_owner: 'product',
    recommended_gate_status: 'review'
  };
}

function controlEvidenceFinding({ slug, controlId, surface, scopePath, evidencePath, owner }) {
  return {
    source: 'security-audit',
    control_id: controlId,
    severity: 'high',
    scope: `${slug}:${surface}:${controlId}`,
    affected_artifacts: [evidencePath],
    preconditions: [`Surface "${surface}" present in ${scopePath}`],
    reproduction_steps: [`Search ${evidencePath} for ${controlId} evidence or N/A rationale`],
    evidence: [`Surface "${surface}" present but no ${controlId} evidence or N/A rationale found in ${evidencePath}.`],
    impact: `Control ${controlId} is required for surface "${surface}" but its evidence is missing.`,
    suggested_fix: `Record ${controlId} evidence (or explicit N/A rationale) in ${evidencePath} via @${owner}.`,
    recommended_owner: owner,
    recommended_gate_status: 'block'
  };
}

function mentionsControl(content, controlId) {
  if (!content) return false;
  const re = new RegExp(`\\b${controlId.replace(/-/g, '[-]')}\\b`);
  return re.test(content);
}

function specDeclaresNoSensitiveSurface(specContent) {
  if (!specContent) return false;
  return /\bno sensitive attack surface\b/i.test(specContent);
}

function buildAuditFindings({ slug, bundle }) {
  const findings = [];
  const { artifacts } = bundle;
  const { prd, requirements, spec, implementation_plan: plan } = artifacts;
  if (!prd.present) {
    findings.push(missingArtifactFinding('prd', prd.path, 'product'));
  }

  // Old projects used a stub PRD plus requirements/spec. Keep those as optional
  // compatibility evidence, but never let them override a current PRD/plan.
  const prdSurface = extractAttackSurfaceFlags(prd.content);
  const canonical = plan.present || !requirements.present || prdSurface.hasMap
    || /^(?:##\s+Feature Capability Map\b|product_scope:|prd_ready:)/m.test(prd.content || '');
  const scope = canonical ? prd : requirements;
  const evidence = canonical || !spec.present ? plan : spec;
  const classification = extractClassification(prd.content)
    || extractClassification(scope.content)
    || extractClassification(plan.content)
    || (!canonical && extractClassification(spec.content))
    || 'MICRO';
  const { hasMap, surfaces } = canonical ? prdSurface : extractAttackSurfaceFlags(scope.content);
  const hasNoSensitiveSurface = !canonical && specDeclaresNoSensitiveSurface(spec.content);

  if (classification === 'MEDIUM' && scope.content && !hasMap) {
    findings.push(attackSurfaceMissingFinding(slug, scope.path));
  }

  if (classification === 'MEDIUM' && !hasNoSensitiveSurface) {
    if (surfaces.length > 0 && !evidence.present) {
      findings.push(missingArtifactFinding('implementation_plan', plan.path, 'planner'));
      return { findings, classification };
    }
    for (const surface of surfaces) {
      const controls = SURFACE_TO_CONTROLS[surface] || [];
      for (const controlId of controls) {
        if (!mentionsControl(evidence.content, controlId)) {
          findings.push(controlEvidenceFinding({
            slug, controlId, surface, scopePath: scope.path, evidencePath: evidence.path,
            owner: evidence === plan ? 'planner' : 'dev'
          }));
        }
      }
    }
  }

  return { findings, classification };
}

async function runSecurityAudit({ args, options = {}, logger }) {
  const targetDir = resolveTargetDir(args);
  const slug = options.slug || options.feature || null;
  const strict = Boolean(options.strict);
  const format = String(options.format || 'json').toLowerCase();

  if (!slug) {
    const out = { ok: false, exitCode: EXIT_CODES.BAD_INPUT, reason: 'missing_slug' };
    process.exitCode = out.exitCode;
    logger.error('security:audit: --slug=<slug> is required.');
    return out;
  }

  let stat;
  try {
    stat = await fs.stat(targetDir);
  } catch {
    const out = { ok: false, exitCode: EXIT_CODES.BAD_INPUT, reason: 'project_not_found', targetDir };
    process.exitCode = out.exitCode;
    logger.error(`security:audit: project path not found: ${targetDir}`);
    return out;
  }
  if (!stat.isDirectory()) {
    const out = { ok: false, exitCode: EXIT_CODES.BAD_INPUT, reason: 'project_not_directory', targetDir };
    process.exitCode = out.exitCode;
    logger.error(`security:audit: project path is not a directory: ${targetDir}`);
    return out;
  }

  const bundle = await readSlugArtifacts(targetDir, slug);
  const requiredAllMissing = AUDIT_ARTIFACT_KEYS.every((k) => !bundle.artifacts[k] || !bundle.artifacts[k].present);
  if (requiredAllMissing) {
    const out = {
      ok: false,
      exitCode: EXIT_CODES.BAD_INPUT,
      reason: 'slug_artifacts_missing',
      slug,
      baseDir: bundle.baseDir
    };
    process.exitCode = out.exitCode;
    logger.error(`security:audit: no artifacts found for slug "${slug}" under ${bundle.baseDir}.`);
    return out;
  }

  const { findings, classification } = buildAuditFindings({ slug, bundle });
  const generatedAt = options.now || new Date().toISOString();

  const writeResult = await writeFindings({
    targetDir,
    slug,
    source: 'security-audit',
    generator: GENERATOR,
    generatedAt,
    scopeMode: 'feature',
    findings
  });

  if (!writeResult.ok && writeResult.reason === 'contract_violation_too_many_findings') {
    process.exitCode = EXIT_CODES.CONTRACT_VIOLATION;
    logger.error(`security:audit: too many findings (${writeResult.count} > ${writeResult.max}).`);
    await emitSecurityRuntimeEvent({
      targetDir,
      eventType: 'security_audit_completed',
      message: `security:audit completed with contract violation for ${slug} (exit=${EXIT_CODES.CONTRACT_VIOLATION})`,
      status: 'completed',
      agentName: options.runtimeAgentName || 'qa',
      source: options.runtimeSource || 'direct',
      workflowState: options.runtimeState || null,
      workflowStage: options.runtimeWorkflowStage || 'qa',
      payload: {
        command: 'security:audit',
        slug,
        classification,
        exitCode: EXIT_CODES.CONTRACT_VIOLATION,
        findingsCount: writeResult.count,
        artifactPath: writeResult.artifactPath || null,
        reason: 'too_many_findings',
        strict
      }
    });
    return {
      ok: false,
      exitCode: EXIT_CODES.CONTRACT_VIOLATION,
      reason: 'too_many_findings',
      ...writeResult
    };
  }

  const hasInconclusive = writeResult.payload.findings.some(
    (f) => (f.status === 'open' || f.status === 'needs_validation') && f.severity === 'inconclusive'
  );
  const exitCode = resolveExitCode({
    classification,
    findings: writeResult.payload.findings,
    hasInconclusive,
    strict
  });
  process.exitCode = exitCode;

  const summary = writeResult.payload.summary;
  const result = {
    ok: exitCode === EXIT_CODES.PASS,
    exitCode,
    slug,
    classification,
    artifactPath: writeResult.artifactPath,
    summary,
    findingsCount: writeResult.payload.findings.length,
    strict
  };

  await emitSecurityRuntimeEvent({
    targetDir,
    eventType: 'security_audit_completed',
    message: `security:audit completed for ${slug} (exit=${exitCode})`,
    status: 'completed',
    agentName: options.runtimeAgentName || 'qa',
    source: options.runtimeSource || 'direct',
    workflowState: options.runtimeState || null,
    workflowStage: options.runtimeWorkflowStage || 'qa',
    payload: {
      command: 'security:audit',
      slug,
      classification,
      exitCode,
      findingsCount: result.findingsCount,
      artifactPath: writeResult.artifactPath,
      summary,
      strict
    }
  });

  if (format === 'json' || options.json) {
    return result;
  }
  const summaryLine = `security:audit (${slug}, ${classification}): ${summary.critical} critical, ${summary.high} high, ${summary.medium} medium, ${summary.low} low, ${summary.inconclusive} inconclusive (exit ${exitCode}).`;
  logger.log(summaryLine);
  for (const f of writeResult.payload.findings) {
    if (f.status !== 'open' && f.status !== 'needs_validation') continue;
    logger.log(`  [${f.severity}] ${f.control_id} ${f.scope}`);
  }
  return result;
}

module.exports = { runSecurityAudit, GENERATOR, VERSION };
