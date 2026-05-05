'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const {
  PATTERNS,
  FORBIDDEN_FILES,
  isAllowedByMarkers,
  isAllowedByPath
} = require('../lib/security/secrets-regex');
const {
  EXIT_CODES,
  resolveExitCode
} = require('../lib/security/exit-codes');
const {
  writeFindings,
  buildFindingId
} = require('../lib/security/findings-writer');
const { emitSecurityRuntimeEvent } = require('../lib/security/runtime-events');

const VERSION = '1.0.0';
const GENERATOR = `aioson security:scan@${VERSION}`;
const VALID_STAGES = new Set(['analyst', 'dev', 'qa', 'all']);

const SCAN_EXTENSIONS = new Set([
  '.js', '.mjs', '.cjs', '.ts', '.tsx', '.jsx',
  '.json', '.yaml', '.yml', '.md', '.txt',
  '.env', '.sh', '.py', '.rb', '.php', '.go', '.rs'
]);

const SKIP_DIRS = new Set([
  'node_modules', '.git', '.aioson', 'dist', 'build', 'coverage',
  '.next', '.cache', 'tmp', '.turbo', '.vercel', 'researchs'
]);

const MAX_FILE_BYTES = 512 * 1024; // 512 KB per file

function defaultRuntimeAgentName(stage) {
  if (stage === 'analyst') return 'analyst';
  if (stage === 'qa') return 'qa';
  return 'dev';
}

async function* walk(dir, baseDir) {
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch (err) {
    if (err && err.code === 'ENOENT') return;
    throw err;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      yield* walk(full, baseDir);
    } else if (entry.isFile()) {
      const ext = path.extname(entry.name).toLowerCase();
      const base = entry.name;
      const isForbiddenName = FORBIDDEN_FILES.includes(base);
      if (!isForbiddenName && ext && !SCAN_EXTENSIONS.has(ext)) continue;
      yield { fullPath: full, relPath: path.relative(baseDir, full).split(path.sep).join('/'), name: base };
    }
  }
}

function regexFindingsForLine({ line, lineNumber, relPath }) {
  if (isAllowedByMarkers(line)) return [];
  if (isAllowedByPath(relPath)) return [];
  const out = [];
  for (const def of PATTERNS) {
    def.pattern.lastIndex = 0;
    let m;
    while ((m = def.pattern.exec(line)) !== null) {
      out.push({
        source: 'security-scan',
        control_id: def.control,
        severity: def.severity,
        scope: `${relPath}:${lineNumber}`,
        affected_artifacts: [relPath],
        preconditions: [`File ${relPath} is staged or committed`],
        reproduction_steps: [`grep -nE on ${relPath}: pattern ${def.id}`],
        evidence: [`Pattern "${def.name}" matched at ${relPath}:${lineNumber}`],
        impact: `Possible exposed credential (${def.name}).`,
        suggested_fix: 'Move to environment variable or vault. Rotate the credential. Add to .gitignore.',
        recommended_owner: 'dev'
      });
    }
  }
  return out;
}

async function scanFileContent({ fullPath, relPath }) {
  let stat;
  try {
    stat = await fs.stat(fullPath);
  } catch {
    return [];
  }
  if (stat.size > MAX_FILE_BYTES) return [];
  let content;
  try {
    content = await fs.readFile(fullPath, 'utf8');
  } catch {
    return [];
  }
  const lines = content.split(/\r?\n/);
  const findings = [];
  for (let i = 0; i < lines.length; i += 1) {
    const lineFindings = regexFindingsForLine({
      line: lines[i],
      lineNumber: i + 1,
      relPath
    });
    findings.push(...lineFindings);
  }
  return findings;
}

function forbiddenFileFinding({ relPath, name }) {
  if (isAllowedByPath(relPath)) return null;
  return {
    source: 'security-scan',
    control_id: 'SEC-SBD-05',
    severity: 'high',
    scope: relPath,
    affected_artifacts: [relPath],
    preconditions: [`File ${name} is present in the workspace`],
    reproduction_steps: [`Inspect ${relPath}`],
    evidence: [`File ${relPath} is one of the forbidden filenames (${name}).`],
    impact: 'Sensitive file may be committed; secrets at risk of leakage.',
    suggested_fix: `Move ${name} out of the working tree, add to .gitignore, and rotate any contained secrets.`,
    recommended_owner: 'dev'
  };
}

function npmAuditFinding(stdout, exitCode) {
  let parsed;
  try {
    parsed = JSON.parse(stdout);
  } catch {
    return null;
  }
  const meta = parsed && parsed.metadata;
  const vulns = meta && meta.vulnerabilities;
  if (!vulns) return null;
  const high = (vulns.high || 0) + (vulns.critical || 0);
  const moderate = vulns.moderate || 0;
  if (high === 0 && moderate === 0) return null;
  const severity = high > 0 ? 'high' : 'medium';
  return {
    source: 'security-scan',
    control_id: 'SEC-SBD-05',
    severity,
    scope: 'package-lock.json:npm-audit',
    affected_artifacts: ['package-lock.json'],
    preconditions: ['package-lock.json exists'],
    reproduction_steps: ['npm audit --json --omit=dev'],
    evidence: [`npm audit reported ${high} high/critical, ${moderate} moderate (exit ${exitCode}).`],
    impact: 'Known vulnerable dependency in production tree.',
    suggested_fix: 'Run `npm audit fix` or upgrade affected packages.',
    recommended_owner: 'dev'
  };
}

function npmAuditInconclusive(stderr) {
  return {
    source: 'security-scan',
    control_id: 'SEC-SBD-05',
    severity: 'inconclusive',
    status: 'needs_validation',
    scope: 'package-lock.json:npm-audit-network',
    affected_artifacts: ['package-lock.json'],
    preconditions: ['npm audit was attempted'],
    reproduction_steps: ['npm audit --json --omit=dev'],
    evidence: [`npm audit failed (likely network): ${(stderr || '').slice(0, 200)}`],
    impact: 'Cannot determine dependency vulnerability state at this time.',
    suggested_fix: 'Re-run when network is available.',
    recommended_owner: 'dev',
    recommended_gate_status: 'review'
  };
}

function runNpmAudit(targetDir) {
  const result = spawnSync('npm', ['audit', '--json', '--omit=dev'], {
    cwd: targetDir,
    encoding: 'utf8',
    timeout: 60_000,
    shell: process.platform === 'win32'
  });
  if (result.error) {
    const networkLike = /ENOTFOUND|ETIMEDOUT|network/i.test(String(result.error.message || ''));
    return { ok: false, network: networkLike, stderr: String(result.error.message || ''), exitCode: -1 };
  }
  const stderr = result.stderr || '';
  const networkLike = /ENOTFOUND|ETIMEDOUT|network/i.test(stderr);
  return {
    ok: true,
    network: networkLike,
    stdout: result.stdout || '',
    stderr,
    exitCode: result.status === null ? -1 : result.status
  };
}

async function gatherFindings({ targetDir, stage }) {
  const findings = [];
  let inconclusive = false;

  for await (const file of walk(targetDir, targetDir)) {
    if (FORBIDDEN_FILES.includes(file.name)) {
      const f = forbiddenFileFinding({ relPath: file.relPath, name: file.name });
      if (f) findings.push(f);
    }
    const fileFindings = await scanFileContent(file);
    findings.push(...fileFindings);
  }

  if (stage === 'dev' || stage === 'qa' || stage === 'all') {
    const lockPath = path.join(targetDir, 'package-lock.json');
    let hasLock = false;
    try {
      await fs.access(lockPath);
      hasLock = true;
    } catch {
      hasLock = false;
    }
    if (hasLock) {
      const audit = runNpmAudit(targetDir);
      if (!audit.ok || audit.network || audit.exitCode === -1) {
        findings.push(npmAuditInconclusive(audit.stderr));
        inconclusive = true;
      } else {
        const f = npmAuditFinding(audit.stdout, audit.exitCode);
        if (f) findings.push(f);
      }
    }
  }

  return { findings, inconclusive };
}

async function runSecurityScan({ args, options = {}, logger }) {
  const targetDir = path.resolve(process.cwd(), args[0] || '.');
  const stage = String(options.stage || 'all').toLowerCase();
  const slug = options.feature || options.slug || null;
  const classification = String(options.classification || 'MEDIUM').toUpperCase();
  const strict = Boolean(options.strict);
  const format = String(options.format || 'json').toLowerCase();

  if (!VALID_STAGES.has(stage)) {
    const out = { ok: false, exitCode: EXIT_CODES.BAD_INPUT, reason: 'invalid_stage', stage };
    process.exitCode = out.exitCode;
    logger.error(`security:scan: invalid --stage=${stage}. Valid: ${[...VALID_STAGES].join(', ')}`);
    return out;
  }

  let stat;
  try {
    stat = await fs.stat(targetDir);
  } catch {
    const out = { ok: false, exitCode: EXIT_CODES.BAD_INPUT, reason: 'project_not_found', targetDir };
    process.exitCode = out.exitCode;
    logger.error(`security:scan: project path not found: ${targetDir}`);
    return out;
  }
  if (!stat.isDirectory()) {
    const out = { ok: false, exitCode: EXIT_CODES.BAD_INPUT, reason: 'project_not_directory', targetDir };
    process.exitCode = out.exitCode;
    logger.error(`security:scan: project path is not a directory: ${targetDir}`);
    return out;
  }

  const generatedAt = options.now || new Date().toISOString();
  const { findings, inconclusive } = await gatherFindings({ targetDir, stage });

  const writeResult = await writeFindings({
    targetDir,
    slug,
    source: 'security-scan',
    generator: GENERATOR,
    generatedAt,
    scopeMode: slug ? 'feature' : 'project',
    findings
  });

  if (!writeResult.ok && writeResult.reason === 'contract_violation_too_many_findings') {
    process.exitCode = EXIT_CODES.CONTRACT_VIOLATION;
    logger.error(`security:scan: too many findings (${writeResult.count} > ${writeResult.max}). Split scope.`);
    await emitSecurityRuntimeEvent({
      targetDir,
      eventType: 'security_scan_completed',
      message: `security:scan completed with contract violation for ${slug || 'project'} (stage=${stage}, exit=${EXIT_CODES.CONTRACT_VIOLATION})`,
      status: 'completed',
      agentName: options.runtimeAgentName || defaultRuntimeAgentName(stage),
      source: options.runtimeSource || 'direct',
      workflowState: options.runtimeState || null,
      workflowStage: options.runtimeWorkflowStage || stage,
      payload: {
        command: 'security:scan',
        slug: slug || 'project',
        classification,
        stage,
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

  const exitCode = resolveExitCode({
    classification,
    findings: writeResult.payload.findings,
    hasInconclusive: inconclusive,
    strict
  });
  process.exitCode = exitCode;

  const summary = writeResult.payload.summary;
  const result = {
    ok: exitCode === EXIT_CODES.PASS,
    exitCode,
    artifactPath: writeResult.artifactPath,
    summary,
    findingsCount: writeResult.payload.findings.length,
    classification,
    stage,
    strict,
    slug: slug || null
  };

  await emitSecurityRuntimeEvent({
    targetDir,
    eventType: 'security_scan_completed',
    message: `security:scan completed for ${slug || 'project'} (stage=${stage}, exit=${exitCode})`,
    status: 'completed',
    agentName: options.runtimeAgentName || defaultRuntimeAgentName(stage),
    source: options.runtimeSource || 'direct',
    workflowState: options.runtimeState || null,
    workflowStage: options.runtimeWorkflowStage || stage,
    payload: {
      command: 'security:scan',
      slug: slug || 'project',
      classification,
      stage,
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
  const summaryLine = `security:scan: ${summary.critical} critical, ${summary.high} high, ${summary.medium} medium, ${summary.low} low, ${summary.inconclusive} inconclusive (exit ${exitCode}).`;
  logger.log(summaryLine);
  for (const f of writeResult.payload.findings) {
    if (f.status !== 'open' && f.status !== 'needs_validation') continue;
    logger.log(`  [${f.severity}] ${f.control_id} ${f.scope}`);
  }
  return result;
}

module.exports = { runSecurityScan, GENERATOR, VERSION };
