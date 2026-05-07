'use strict';

/**
 * aioson self:loop — Autonomous implement + verify loop
 *
 * Runs an agent task, verifies with verify-gate in a fresh context,
 * and retries with feedback injection on failure.
 *
 * Usage:
 *   aioson self:loop . --agent=dev --task="implement stripe webhook handler" --max-iterations=3
 *   aioson self:loop . --agent=dev --task="..." --verification-criteria="all tests pass"
 *   aioson self:loop . --agent=dev --task="..." --spec=briefs/phase-1.md --artifact=src/
 *
 * Integrates with:
 *   - verify-gate.js for tiered verification (tiers 1–4)
 *   - intra-bus.js for recording attempts
 *   - state-manager.js for recording final result
 */

const path = require('node:path');
const { execSync, execFileSync } = require('node:child_process');
const { randomUUID } = require('node:crypto');
const fs = require('node:fs');
const fsp = require('node:fs/promises');

const bus = require('../squad/intra-bus');
const stateManager = require('../squad/state-manager');
const { createCircuitBreaker } = require('../harness/circuit-breaker');

// ─── Agent execution ─────────────────────────────────────────────────────────

/**
 * Execute an agent task via the aioson CLI.
 * Returns { ok, output, error }.
 */
function executeAgent(projectDir, agent, task, feedbackContext, timeoutMs) {
  const prompt = feedbackContext
    ? `${task}\n\n---\nPrevious attempt feedback:\n${feedbackContext}`
    : task;

  try {
    // SF-project-13: use execFileSync with array args so an attacker-controlled
    // agent name cannot break out of the shell.
    const output = execFileSync(
      'aioson',
      ['agent:prompt', agent, '.', '--tool=claude'],
      {
        cwd: projectDir,
        input: prompt,
        timeout: timeoutMs,
        encoding: 'utf8',
        maxBuffer: 1024 * 1024 * 5,
        stdio: ['pipe', 'pipe', 'pipe']
      }
    );
    return { ok: true, output: output.trim() };
  } catch (err) {
    return { ok: false, output: '', error: err.message.slice(0, 500) };
  }
}

/**
 * Run verify-gate on the result.
 * Returns { ok, verdict, issues }.
 */
async function runVerification(projectDir, spec, artifact, criteria) {
  if (!spec || !artifact) {
    // Fallback: criteria-only verification
    return criteriaOnlyVerify(projectDir, artifact, criteria);
  }

  try {
    // SF-project-13: array-arg form — embedded shell metacharacters in spec
    // or artifact stay literal arguments to verify:gate.
    const output = execFileSync(
      'aioson',
      ['verify:gate', '.', `--spec=${spec}`, `--artifact=${artifact}`, '--json'],
      {
        cwd: projectDir,
        timeout: 30_000,
        encoding: 'utf8',
        maxBuffer: 1024 * 1024
      }
    );
    const result = JSON.parse(output);
    return {
      ok: result.verdict === 'PASS' || result.verdict === 'PASS_WITH_NOTES',
      verdict: result.verdict,
      issues: result.issues || []
    };
  } catch (err) {
    return { ok: false, verdict: 'BLOCKED', issues: [{ message: err.message.slice(0, 200) }] };
  }
}

/**
 * Simple criteria-based verification when no spec/artifact is given.
 * Checks if verification criteria strings are present in the output directory.
 */
async function criteriaOnlyVerify(projectDir, artifactPath, criteria) {
  if (!criteria) {
    return { ok: true, verdict: 'PASS', issues: [] };
  }

  const issues = [];
  const criteriaList = criteria.split(',').map((c) => c.trim());

  for (const criterion of criteriaList) {
    if (/test/i.test(criterion)) {
      // Check if tests pass
      try {
        execSync('npm test --if-present 2>&1', {
          cwd: projectDir,
          timeout: 60_000,
          encoding: 'utf8'
        });
      } catch {
        issues.push({ message: `Test criterion failed: "${criterion}"` });
      }
    }
  }

  return {
    ok: issues.length === 0,
    verdict: issues.length === 0 ? 'PASS' : 'FAIL_WITH_ISSUES',
    issues
  };
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Run the self-implement loop.
 *
 * @param {object} params
 * @returns {Promise<object>}  — { ok, iterations, verdict, feedback[] }
 */
async function runSelfLoop({ args, options = {}, logger }) {
  const targetDir = path.resolve(process.cwd(), args[0] || '.');
  const agent = String(options.agent || options.a || 'dev').trim();
  const task = String(options.task || options.t || '').trim();
  const spec = options.spec ? String(options.spec).trim() : null;
  const artifact = options.artifact ? String(options.artifact).trim() : null;
  const criteria = options['verification-criteria'] || options.criteria || '';
  const squad = options.squad ? String(options.squad).trim() : null;
  const timeoutMs = (Number(options.timeout) || 300) * 1000;

  // Harness Integration — Discover contract
  let cb = null;
  let contractPath = options.contract;

  // Auto-discover contract if not provided but feature slug is known
  if (!contractPath && spec) {
    const slug = path.basename(spec, '.md').replace(/^spec-/, '');
    const autoPath = path.join(targetDir, '.aioson', 'plans', slug, 'harness-contract.json');
    if (fs.existsSync(autoPath)) contractPath = autoPath;
  }

  if (contractPath && fs.existsSync(contractPath)) {
    const progressPath = path.join(path.dirname(contractPath), 'progress.json');
    cb = createCircuitBreaker(contractPath, progressPath);
    await cb.load();
    logger.log(`[Harness] Contract loaded: ${path.relative(targetDir, contractPath)}`);
  }

  // Set max iterations: Contract policy takes precedence over flag
  let maxIterations = Math.min(Math.max(Number(options['max-iterations'] || 3), 1), 5);
  if (cb && cb.contract && cb.contract.governor && cb.contract.governor.max_steps > 0) {
    maxIterations = cb.contract.governor.max_steps;
    logger.log(`[Harness] Max iterations set by contract: ${maxIterations}`);
  }

  if (!task) {
    logger.error('Error: --task is required');
    return { ok: false, error: 'missing_task' };
  }

  const sessionId = randomUUID();
  const feedbackHistory = [];

  logger.log(`Self-implement loop: @${agent} — "${task.slice(0, 60)}${task.length > 60 ? '...' : ''}"`);
  logger.log(`Max iterations: ${maxIterations}`);
  if (spec) logger.log(`Spec: ${spec}`);
  if (artifact) logger.log(`Artifact: ${artifact}`);
  logger.log('');

  for (let iteration = 1; iteration <= maxIterations; iteration++) {
    // Harness Check
    if (cb) {
      const { allowed, reason } = cb.check();
      if (!allowed) {
        logger.log(`── Harness Block ──────────────────────────────────────────`);
        logger.log(`  ✗ Execution paused: ${reason}`);
        logger.log(`  Intervenção humana necessária antes de retomar.`);
        return { ok: false, iterations: iteration - 1, verdict: 'BLOCKED', reason };
      }
    }

    logger.log(`── Iteration ${iteration}/${maxIterations} ──────────────────────────`);

    // Step 1: Execute agent
    const feedbackContext = feedbackHistory.length > 0
      ? feedbackHistory.map((f) => `[Iteration ${f.iteration}] ${f.verdict}: ${f.issues.map((i) => i.message).join('; ')}`).join('\n')
      : null;

    logger.log(`  Running @${agent}...`);
    const agentResult = executeAgent(targetDir, agent, task, feedbackContext, timeoutMs);

    if (!agentResult.ok) {
      logger.log(`  ✗ Agent execution failed: ${agentResult.error?.slice(0, 100)}`);
      // Record on bus if squad context
      if (squad) {
        await bus.post(targetDir, squad, sessionId, {
          from: 'self-loop',
          type: 'status',
          content: `Iteration ${iteration} — agent failed: ${agentResult.error?.slice(0, 200)}`
        }).catch(() => {});
      }
      continue;
    }

    // Step 2: Verify (fresh context)
    logger.log('  Verifying...');
    const verifyResult = await runVerification(targetDir, spec, artifact, criteria);

    // Record on bus
    if (squad) {
      await bus.post(targetDir, squad, sessionId, {
        from: 'self-loop',
        type: verifyResult.ok ? 'result' : 'gap_closure_attempt',
        content: `Iteration ${iteration}: ${verifyResult.verdict}`,
        metadata: {
          iteration,
          verdict: verifyResult.verdict,
          issues_count: verifyResult.issues.length
        }
      }).catch(() => {});
    }

    // Step 3: Check result
    if (verifyResult.ok) {
      logger.log(`  ✓ PASS${iteration > 1 ? ` (after ${iteration} iteration${iteration > 1 ? 's' : ''})` : ''}`);

      if (cb) await cb.recordSuccess();

      // Record success in state
      if (squad) {
        await stateManager.updateState(targetDir, squad, {
          addDecision: [`self-loop: "${task.slice(0, 50)}" completed in ${iteration} iteration(s)`]
        }).catch(() => {});
      }

      if (options.json) {
        return { ok: true, iterations: iteration, verdict: verifyResult.verdict, feedback: feedbackHistory };
      }

      return { ok: true, iterations: iteration, verdict: verifyResult.verdict };
    }

    // Step 4: Collect feedback for next iteration
    logger.log(`  ✗ ${verifyResult.verdict} — ${verifyResult.issues.length} issue(s)`);
    for (const issue of verifyResult.issues.slice(0, 5)) {
      logger.log(`    - ${issue.message}`);
    }

    if (cb) {
      const firstIssue = verifyResult.issues[0]?.message || verifyResult.verdict;
      await cb.recordError(firstIssue);
    }

    feedbackHistory.push({
      iteration,
      verdict: verifyResult.verdict,
      issues: verifyResult.issues
    });
  }

  // Step 5: Exhausted — escalate
  logger.log('');
  logger.log(`✗ Max iterations (${maxIterations}) exhausted — escalating to user`);

  if (squad) {
    await bus.post(targetDir, squad, sessionId, {
      from: 'self-loop',
      type: 'block',
      content: `Self-implement loop exhausted ${maxIterations} iterations for: "${task.slice(0, 100)}"`,
      metadata: { exhausted: true, iterations: maxIterations }
    }).catch(() => {});

    await stateManager.updateState(targetDir, squad, {
      addBlocker: [`self-loop exhausted: "${task.slice(0, 50)}" (${maxIterations} iterations)`]
    }).catch(() => {});
  }

  const result = {
    ok: false,
    iterations: maxIterations,
    verdict: 'EXHAUSTED',
    feedback: feedbackHistory
  };

  if (options.json) return result;
  return result;
}

module.exports = { runSelfLoop };
