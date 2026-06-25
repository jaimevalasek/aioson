'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const { resolveInsideRoot } = require('./path-policy');
const { createCounter, redactText, redactJson, totalRedactions } = require('./redaction');

const ARTIFACT_PREVIEW_CHARS = 700;
const ARTIFACT_PREVIEW_TOTAL_CHARS = 8000;
const ARTIFACT_SUMMARY_LIMIT = 60;

function runGit(rootDir, args) {
  try {
    return {
      ok: true,
      output: execFileSync('git', args, {
        cwd: rootDir,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe']
      }).trim()
    };
  } catch (error) {
    return {
      ok: false,
      output: '',
      error: error.message
    };
  }
}

async function fileExists(rootDir, relPath) {
  const safe = resolveInsideRoot(rootDir, relPath);
  if (!safe.ok) return false;
  try {
    const stat = await fs.stat(safe.path);
    return stat.isFile() || stat.isDirectory();
  } catch {
    return false;
  }
}

async function fileStat(rootDir, relPath) {
  const safe = resolveInsideRoot(rootDir, relPath);
  if (!safe.ok) return { ok: false, reason: safe.reason };
  try {
    const stat = await fs.stat(safe.path);
    return { ok: true, path: safe.path, stat };
  } catch {
    return { ok: false, reason: 'not_found' };
  }
}

function evidencePathsFromLedger(ledger) {
  if (!ledger || !Array.isArray(ledger.claims)) return [];
  const paths = [];
  for (const claim of ledger.claims) {
    if (!claim || !Array.isArray(claim.evidence)) continue;
    for (const evidence of claim.evidence) {
      if (evidence && evidence.path) paths.push(evidence.path);
    }
  }
  return [...new Set(paths)];
}

async function knownChecks(rootDir, slug, ledger, policy = 'standard') {
  const checks = [];
  const addCheck = (candidate) => {
    if (!candidate || !candidate.command) return;
    const existing = checks.find((check) => check.command === candidate.command);
    if (!existing) {
      checks.push(candidate);
      return;
    }
    existing.required = Boolean(existing.required || candidate.required);
    existing.source = existing.source === candidate.source
      ? existing.source
      : `${existing.source},${candidate.source}`;
    existing.last_status = candidate.last_status || existing.last_status || null;
  };

  if (await fileExists(rootDir, 'package.json')) {
    addCheck({ command: 'npm test', source: 'package.json', required: false });
  }
  if (await fileExists(rootDir, 'scripts/check-js.js')) {
    addCheck({ command: 'node scripts/check-js.js', source: 'scripts/check-js.js', required: false });
  }
  if (await fileExists(rootDir, `.aioson/context/prd-${slug}.md`)) {
    const strictFlag = policy === 'strict' ? ' --strict' : '';
    addCheck({ command: `aioson prototype:check . --feature=${slug}${strictFlag}`, source: 'prototype_contract', required: false });
  }
  if (await fileExists(rootDir, `.aioson/plans/${slug}/harness-contract.json`)) {
    addCheck({ command: `aioson harness:check . --slug=${slug}`, source: 'harness_contract', required: false });
  }
  if (ledger && Array.isArray(ledger.verification_commands)) {
    for (const item of ledger.verification_commands) {
      if (item && item.command) {
        addCheck({
          command: item.command,
          source: 'ledger',
          required: Boolean(item.required),
          last_status: item.last_status || null
        });
      }
    }
  }
  return checks;
}

function commandPlan(commands) {
  return (commands || []).map((command, index) => ({
    order: index + 1,
    command: command.command,
    required: Boolean(command.required),
    source: command.source || 'unknown',
    last_status: command.last_status || null,
    run_by: 'developer_or_clean_auditor',
    expectation: command.required ? 'must be run or explicitly justified' : 'run when relevant to touched surface'
  }));
}

function dirtyWorktree(statusOutput) {
  return Boolean(String(statusOutput || '').trim());
}

function artifactCanPreview(relPath) {
  return /\.(md|txt|json|js|ts|tsx|jsx|html|css|yaml|yml)$/i.test(String(relPath || ''));
}

async function artifactSummaries(rootDir, artifacts, redactionCounter) {
  const summaries = [];
  let usedPreviewChars = 0;

  for (const artifact of (artifacts || []).slice(0, ARTIFACT_SUMMARY_LIMIT)) {
    const relPath = artifact.path;
    const stat = await fileStat(rootDir, relPath);
    const summary = {
      type: artifact.type,
      role: artifact.role,
      path: relPath,
      exists: stat.ok,
      size_bytes: stat.ok ? stat.stat.size : null
    };

    if (!stat.ok) {
      summary.omitted_reason = stat.reason;
      summaries.push(summary);
      continue;
    }
    if (!stat.stat.isFile()) {
      summary.omitted_reason = 'not_file';
      summaries.push(summary);
      continue;
    }
    if (!artifactCanPreview(relPath)) {
      summary.omitted_reason = 'unsupported_preview_type';
      summaries.push(summary);
      continue;
    }
    if (usedPreviewChars >= ARTIFACT_PREVIEW_TOTAL_CHARS) {
      summary.omitted_reason = 'preview_budget_exhausted';
      summaries.push(summary);
      continue;
    }

    const remaining = ARTIFACT_PREVIEW_TOTAL_CHARS - usedPreviewChars;
    const limit = Math.min(ARTIFACT_PREVIEW_CHARS, remaining);
    const handle = await fs.open(stat.path, 'r');
    try {
      const buffer = Buffer.alloc(limit);
      const { bytesRead } = await handle.read(buffer, 0, limit, 0);
      const preview = buffer.subarray(0, bytesRead).toString('utf8');
      usedPreviewChars += preview.length;
      summary.preview = redactText(preview, redactionCounter);
      summary.preview_truncated = stat.stat.size > bytesRead;
    } finally {
      await handle.close();
    }
    summaries.push(summary);
  }

  if ((artifacts || []).length > ARTIFACT_SUMMARY_LIMIT) {
    summaries.push({
      type: 'budget_notice',
      role: 'artifact_summary',
      path: null,
      exists: false,
      omitted_reason: `artifact_summary_limit_${ARTIFACT_SUMMARY_LIMIT}`,
      omitted_count: artifacts.length - ARTIFACT_SUMMARY_LIMIT
    });
  }

  return summaries;
}

async function buildEvidenceBundle(rootDir, slug, ledger, sourceArtifacts, policy) {
  const redactionCounter = createCounter();
  const branch = runGit(rootDir, ['rev-parse', '--abbrev-ref', 'HEAD']);
  const status = runGit(rootDir, ['status', '--short']);
  const diffStat = runGit(rootDir, ['diff', '--stat']);
  const artifactPaths = (sourceArtifacts || []).map((artifact) => artifact.path);
  const evidencePaths = evidencePathsFromLedger(ledger);
  const touchedPaths = [...new Set([...artifactPaths, ...evidencePaths])].filter(Boolean).slice(0, 25);
  const recentCommits = touchedPaths.length > 0
    ? runGit(rootDir, ['log', '--oneline', '-n', '5', '--', ...touchedPaths])
    : { ok: true, output: '' };

  const verificationCommands = redactJson(await knownChecks(rootDir, slug, ledger, policy), redactionCounter);
  const sanitizedLedgerClaims = redactJson(ledger && Array.isArray(ledger.claims) ? ledger.claims : [], redactionCounter);
  const sanitizedKnownGaps = redactJson(ledger && Array.isArray(ledger.known_gaps) ? ledger.known_gaps : [], redactionCounter);
  const summaries = await artifactSummaries(rootDir, sourceArtifacts || [], redactionCounter);
  const git = {
    branch: branch.ok ? redactText(branch.output, redactionCounter) : null,
    branch_error: branch.ok ? null : branch.error,
    status: status.ok ? redactText(status.output, redactionCounter) : null,
    dirty_worktree: status.ok ? dirtyWorktree(status.output) : null,
    status_error: status.ok ? null : status.error,
    diff_stat: diffStat.ok ? redactText(diffStat.output, redactionCounter) : null,
    diff_stat_error: diffStat.ok ? null : diffStat.error,
    recent_commits: recentCommits.ok ? redactText(recentCommits.output, redactionCounter) : null,
    recent_commits_error: recentCommits.ok ? null : recentCommits.error
  };

  return {
    feature_slug: slug,
    policy,
    git,
    source_artifacts: sourceArtifacts || [],
    artifact_summaries: summaries,
    ledger_claims: sanitizedLedgerClaims,
    known_gaps: sanitizedKnownGaps,
    verification_commands: verificationCommands,
    command_plan: commandPlan(verificationCommands),
    redactions: {
      ...redactionCounter,
      total: totalRedactions(redactionCounter)
    },
    preview_budget: {
      artifact_preview_chars: ARTIFACT_PREVIEW_CHARS,
      artifact_preview_total_chars: ARTIFACT_PREVIEW_TOTAL_CHARS,
      artifact_summary_limit: ARTIFACT_SUMMARY_LIMIT
    },
    generated_at: new Date().toISOString(),
    project_root: path.resolve(rootDir)
  };
}

module.exports = {
  buildEvidenceBundle
};
