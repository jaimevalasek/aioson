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

const VERSION = '1.0.0';
const GENERATOR = `aioson security:audit@${VERSION}`;

const REQUIRED_ARTIFACT_KEYS = ['prd', 'requirements', 'spec'];

const SURFACE_TO_CONTROLS = Object.freeze({
  auth: ['SEC-SBD-08', 'SEC-SBD-03'],
  ownership: ['SEC-SBD-03'],
  money: ['SEC-SBD-04'],
  uploads: ['SEC-SBD-02'],
  external_urls: ['SEC-SBD-06'],
  secrets: ['SEC-SBD-05'],
  storage: ['SEC-SBD-07']
});

function missingArtifactFinding(key, filePath) {
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
    suggested_fix: `Generate ${key} via the appropriate agent before running audit.`,
    recommended_owner: 'analyst',
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
    preconditions: ['requirements artifact present'],
    reproduction_steps: ['Search requirements for "Attack Surface Map" section'],
    evidence: ['No Attack Surface Map section found in requirements.'],
    impact: 'Without an Attack Surface Map, ownership/IDOR coverage cannot be verified.',
    suggested_fix: 'Add an Attack Surface Map section to requirements (analyst).',
    recommended_owner: 'analyst',
    recommended_gate_status: 'review'
  };
}

function controlEvidenceFinding({ slug, controlId, surface, specPath }) {
  return {
    source: 'security-audit',
    control_id: controlId,
    severity: 'high',
    scope: `${slug}:${surface}:${controlId}`,
    affected_artifacts: [specPath],
    preconditions: [`Surface "${surface}" present in requirements`],
    reproduction_steps: [`Search spec-${slug}.md for ${controlId} evidence or N/A rationale`],
    evidence: [`Surface "${surface}" present but no ${controlId} evidence or N/A rationale found in spec.`],
    impact: `Control ${controlId} is required for surface "${surface}" but its evidence is missing.`,
    suggested_fix: `Add evidence (or explicit N/A rationale) for ${controlId} in spec-${slug}.md.`,
    recommended_owner: 'dev',
    recommended_gate_status: 'block'
  };
}

function specMentionsControl(specContent, controlId) {
  if (!specContent) return false;
  const re = new RegExp(`\\b${controlId.replace(/-/g, '[-]')}\\b`);
  return re.test(specContent);
}

function specDeclaresNoSensitiveSurface(specContent) {
  if (!specContent) return false;
  return /\bno sensitive attack surface\b/i.test(specContent);
}

function buildAuditFindings({ slug, bundle }) {
  const findings = [];
  const { artifacts } = bundle;

  for (const key of REQUIRED_ARTIFACT_KEYS) {
    const a = artifacts[key];
    if (!a || !a.present) {
      findings.push(missingArtifactFinding(key, a ? a.path : `${key}-${slug}.md`));
    }
  }

  const requirements = artifacts.requirements && artifacts.requirements.content;
  const spec = artifacts.spec && artifacts.spec.content;
  const specPath = artifacts.spec ? artifacts.spec.path : `spec-${slug}.md`;

  const { hasMap, surfaces } = extractAttackSurfaceFlags(requirements);

  const classification = extractClassification(requirements) || extractClassification(spec) || 'MICRO';
  const hasNoSensitiveSurface = specDeclaresNoSensitiveSurface(spec);

  if (classification === 'MEDIUM' && requirements && !hasMap) {
    findings.push(attackSurfaceMissingFinding(slug, artifacts.requirements.path));
  }

  if (classification === 'MEDIUM' && !hasNoSensitiveSurface) {
    for (const surface of surfaces) {
      const controls = SURFACE_TO_CONTROLS[surface] || [];
      for (const controlId of controls) {
        if (!specMentionsControl(spec, controlId)) {
          findings.push(controlEvidenceFinding({ slug, controlId, surface, specPath }));
        }
      }
    }
  }

  return { findings, classification };
}

async function runSecurityAudit({ args, options = {}, logger }) {
  const targetDir = path.resolve(process.cwd(), args[0] || '.');
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
  const requiredAllMissing = REQUIRED_ARTIFACT_KEYS.every((k) => !bundle.artifacts[k] || !bundle.artifacts[k].present);
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
