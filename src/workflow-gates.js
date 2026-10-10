'use strict';

/**
 * workflow-gates — technical compilation/test gates enforced by the workflow engine.
 *
 * DEV owns compilation. QA owns one comprehensive verification pass.
 * Successful evidence is reused only while the git-backed implementation
 * fingerprint and selected commands remain unchanged.
 */

const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');
const { execSync } = require('node:child_process');
const { readFileSafe, fileExists } = require('./preflight-engine');
const { ensureDir } = require('./utils');
const { readConfiguration, runChecks } = require('./lib/quality/checks');
const { computeImplementationFingerprint, checkIdentity, MAX_FINGERPRINT_FILE_BYTES, MAX_FINGERPRINT_TOTAL_BYTES } = require('./lib/implementation-fingerprint');

const MAX_OUTPUT_LINES = 60;
const EVIDENCE_RELATIVE_PATH = '.aioson/runtime/technical-evidence.json';
const MAX_EVIDENCE_ENTRIES = 20;

async function detectStack(targetDir) {
  const checks = [];

  // TypeScript
  if (await fileExists(path.join(targetDir, 'tsconfig.json'))) {
    checks.push({ id: 'tsc', kind: 'compile', name: 'TypeScript compilation', command: 'npx tsc --noEmit', files: ['tsconfig.json'] });
  }

  // Rust
  if (await fileExists(path.join(targetDir, 'Cargo.toml'))) {
    checks.push({ id: 'cargo-check', kind: 'compile', name: 'Rust compilation', command: 'cargo check', files: ['Cargo.toml'] });
    checks.push({ id: 'cargo-test', kind: 'verify', name: 'Rust tests', command: 'cargo test', files: ['Cargo.toml'], optional: true });
  }

  // Node.js / package.json based
  const pkgPath = path.join(targetDir, 'package.json');
  if (await fileExists(pkgPath)) {
    const pkgRaw = await readFileSafe(pkgPath);
    let pkg = null;
    try { pkg = JSON.parse(pkgRaw); } catch { /* ignore */ }

    if (pkg && pkg.scripts) {
      const scripts = pkg.scripts;
      const isRunnable = (script) => typeof script === 'string' && !/\becho\b/i.test(script);
      if (isRunnable(scripts.ci)) {
        checks.push({ id: 'npm-ci', kind: 'verify', name: 'npm ci verification', command: 'npm run ci', files: ['package.json'], optional: true });
      } else if (isRunnable(scripts['test:ci'])) {
        checks.push({ id: 'npm-test-ci', kind: 'verify', name: 'npm test:ci', command: 'npm run test:ci', files: ['package.json'], optional: true });
      } else {
        if (isRunnable(scripts.test)) {
          checks.push({ id: 'npm-test', kind: 'verify', name: 'npm test', command: 'npm test', files: ['package.json'], optional: true });
        } else if (isRunnable(scripts['test:unit'])) {
          checks.push({ id: 'npm-test-unit', kind: 'verify', name: 'npm test:unit', command: 'npm run test:unit', files: ['package.json'], optional: true });
        }
        if (isRunnable(scripts.lint)) {
          checks.push({ id: 'npm-lint', kind: 'verify', name: 'npm lint', command: 'npm run lint', files: ['package.json'], optional: true });
        }
      }
    }
  }

  // Python
  if (await fileExists(path.join(targetDir, 'pytest.ini')) || await fileExists(path.join(targetDir, 'pyproject.toml'))) {
    checks.push({ id: 'pytest', kind: 'verify', name: 'Pytest', command: 'pytest', files: ['pytest.ini', 'pyproject.toml'], optional: true });
  }

  return checks;
}

function truncateOutput(stdout, stderr) {
  const combined = [stdout, stderr].filter(Boolean).join('\n').trim();
  if (!combined) return '';
  const lines = combined.split('\n');
  if (lines.length <= MAX_OUTPUT_LINES) return combined;
  return lines.slice(0, MAX_OUTPUT_LINES).join('\n') + '\n... (truncated)';
}

function runCheck(targetDir, check) {
  const startedAt = Date.now();
  try {
    const stdout = execSync(check.command, {
      cwd: targetDir,
      encoding: 'utf8',
      maxBuffer: 4 * 1024 * 1024,
      timeout: 300000, // 5 minutes
      stdio: ['ignore', 'pipe', 'pipe']
    });
    return {
      ok: true,
      status: 'pass',
      exit_code: 0,
      check: check.id,
      name: check.name,
      command: check.command,
      duration_ms: Date.now() - startedAt,
      output: truncateOutput(stdout, '')
    };
  } catch (err) {
    return {
      ok: false,
      status: Number.isInteger(err.status) ? 'fail' : 'error',
      exit_code: err.status ?? null,
      check: check.id,
      name: check.name,
      command: check.command,
      duration_ms: Date.now() - startedAt,
      output: truncateOutput(err.stdout || '', err.stderr || '')
    };
  }
}

function hashParts(parts) {
  const hash = crypto.createHash('sha256');
  for (const part of parts) {
    hash.update(Buffer.isBuffer(part) ? part : Buffer.from(String(part)));
    hash.update('\0');
  }
  return hash.digest('hex');
}


async function readEvidence(targetDir) {
  try {
    const raw = await fs.readFile(path.join(targetDir, EVIDENCE_RELATIVE_PATH), 'utf8');
    const parsed = JSON.parse(raw);
    return parsed && parsed.version === 1 && parsed.entries && typeof parsed.entries === 'object'
      ? parsed
      : { version: 1, entries: {} };
  } catch {
    return { version: 1, entries: {} };
  }
}

async function writeEvidence(targetDir, payload) {
  const evidencePath = path.join(targetDir, EVIDENCE_RELATIVE_PATH);
  await ensureDir(path.dirname(evidencePath));
  await fs.writeFile(evidencePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

function evidenceKey(stage, checks) {
  return hashParts([stage, JSON.stringify(checks.map(checkIdentity))]);
}

async function selectTechnicalChecks(targetDir, stage) {
  const configuration = ['dev', 'qa'].includes(stage)
    ? await readConfiguration(path.join(targetDir, '.aioson/quality.json'), false) : null;
  const detected = await detectStack(targetDir);
  if (!detected.length && !configuration) return { checks: [], reason: 'No detectable stack — skipping technical gate.' };
  const configured = configuration?.checks.filter(check => (check.stage || 'qa') === stage) || [];
  if (configuration && (stage === 'qa' || configured.length)) {
    return { checks: configured, configured: true, reason: 'No configured verification command for this stage.' };
  }
  if (stage === 'dev') {
    return { checks: detected.filter(check => check.kind === 'compile'), reason: 'No compile gate for this stack; focused implementation checks remain DEV-owned.' };
  }
  if (stage === 'qa') {
    const verification = detected.filter(check => check.kind === 'verify');
    return { checks: verification.length ? verification : detected.filter(check => check.kind === 'compile'), reason: 'No comprehensive verification command detected.' };
  }
  return { checks: [], reason: 'No technical gate for this stage.' };
}

async function measureTechnicalChecks(targetDir, stage, selection) {
  if (selection.configured) {
    const measured = await runChecks(targetDir, { stage });
    const results = await Promise.all(measured.result.checks.map(async result => {
      const log = JSON.parse(await fs.readFile(path.join(targetDir, result.log), 'utf8'));
      return { ...result, check: result.id, name: result.id, command: JSON.stringify(result.argv), ok: result.status === 'pass', output: truncateOutput(log.stdout, log.stderr) };
    }));
    const reasons = results.filter(result => !result.ok && result.required).map(result => result.name + ' ' + result.status);
    if (measured.result.reason) reasons.push(measured.result.reason);
    if (!measured.ok && !reasons.length) reasons.push('No configured checks executed.');
    return { ok: measured.ok, status: measured.result.status, results, reasons, fingerprint: measured.result.source.fingerprint, result_path: measured.output };
  }
  const results = selection.checks.map(check => runCheck(targetDir, check));
  const failures = results.filter(result => !result.ok);
  return {
    ok: !failures.length,
    status: results.some(result => result.status === 'error') ? 'error' : failures.length ? 'fail' : 'pass',
    results,
    reasons: failures.map(result => result.name + ' failed'),
    fingerprint: null,
    result_path: null
  };
}

async function cacheTechnicalEvidence(targetDir, cacheKey, entry) {
  const evidence = await readEvidence(targetDir);
  evidence.entries[cacheKey] = entry;
  evidence.entries = Object.fromEntries(Object.entries(evidence.entries)
    .sort(([, left], [, right]) => String(right.completed_at || '').localeCompare(String(left.completed_at || '')))
    .slice(0, MAX_EVIDENCE_ENTRIES));
  await writeEvidence(targetDir, evidence);
}

async function runTechnicalGate(targetDir, stage, options = {}) {
  if (options.force) return { ok: true, status: 'not_run', stage, forced: true, results: [] };
  let selection;
  try { selection = await selectTechnicalChecks(targetDir, stage); }
  catch (error) { return { ok: false, status: 'error', stage, blocked: true, reasons: ['Invalid quality configuration: ' + error.message], results: [] }; }
  if (!selection.checks.length) return { ok: true, status: 'not_run', stage, results: [], reason: selection.reason };

  const checks = selection.checks;
  const fingerprint = options.fingerprint || computeImplementationFingerprint(targetDir, checks);
  const cacheKey = evidenceKey(stage, checks);
  if (fingerprint && options.cache !== false) {
    const evidence = await readEvidence(targetDir);
    const cached = evidence.entries[cacheKey];
    if (cached && cached.ok === true && cached.status === 'pass' && cached.fingerprint === fingerprint && Array.isArray(cached.results)) {
      return {
        ok: true, status: 'pass', stage, cached: true, fingerprint,
        evidence_path: EVIDENCE_RELATIVE_PATH, result_path: cached.result_path || null,
        completed_at: cached.completed_at,
        results: cached.results.map(result => ({ ...result, cached: true }))
      };
    }
  }

  let measured;
  try { measured = await measureTechnicalChecks(targetDir, stage, selection); }
  catch (error) { return { ok: false, status: 'error', stage, blocked: true, reasons: [error.message], results: [] }; }
  const finishedFingerprint = options.fingerprint || computeImplementationFingerprint(targetDir, checks);
  const sourceChanged = fingerprint && (finishedFingerprint !== fingerprint || (measured.fingerprint && measured.fingerprint !== fingerprint));
  if (sourceChanged && !measured.reasons.includes('implementation_changed_during_checks')) measured.reasons.push('implementation_changed_during_checks');
  const status = sourceChanged ? 'error' : measured.status;
  if (!measured.ok || sourceChanged) {
    return {
      ok: false, status, stage, blocked: true, reasons: measured.reasons,
      fingerprint, finished_fingerprint: finishedFingerprint,
      result_path: measured.result_path, results: measured.results
    };
  }

  const completedAt = new Date().toISOString();
  const cacheable = fingerprint && status === 'pass' && options.cache !== false;
  if (cacheable) {
    await cacheTechnicalEvidence(targetDir, cacheKey, {
      stage, fingerprint, ok: true, status, completed_at: completedAt,
      result_path: measured.result_path, checks: checks.map(checkIdentity), results: measured.results
    });
  }
  return {
    ok: true, status, stage, cached: false, fingerprint,
    evidence_path: cacheable ? EVIDENCE_RELATIVE_PATH : null,
    result_path: measured.result_path, completed_at: completedAt, results: measured.results
  };
}

function formatGateError(gateResult) {
  const lines = [
    '[Technical Gate BLOCKED]',
    `Stage: @${gateResult.stage}`,
    'Reasons:',
    ...gateResult.reasons.map((r) => `  - ${r}`),
    '',
    'Fix the errors above before completing this stage.',
    'Use --force to override (not recommended).',
    '',
    '=== Command output ==='
  ];
  for (const r of gateResult.results) {
    if (!r.ok) {
      lines.push(`\n[${r.name}] ${r.command}`);
      lines.push(r.output || '(no output)');
    }
  }
  return lines.join('\n');
}

module.exports = {
  MAX_FINGERPRINT_FILE_BYTES,
  MAX_FINGERPRINT_TOTAL_BYTES,
  EVIDENCE_RELATIVE_PATH,
  detectStack,
  computeImplementationFingerprint,
  runTechnicalGate,
  formatGateError
};
