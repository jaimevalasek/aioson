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
const { validateContract, resolveContract } = require('../harness/contract-schema');
const { captureBaseline, computeChangedSet, captureDiffPatch } = require('../harness/git-baseline');
const { checkScope, checkDiffLimits, buildRollbackFeedback } = require('../harness/scope-guard');
const { estimateTokens, startRunBudget, recordAttemptTokens, checkBudget, buildBudgetSummary } = require('../harness/budget-guard');
const { writeAttemptArtifacts } = require('../harness/attempt-artifacts');
const { emitGuardEvent } = require('../harness/guard-events');
const { detectGates, createGate, enterHumanGate, resolveGateState, pendingGates, loadGates } = require('../harness/human-gate');
const { runCriteria, registerFailureSignatures, startRunSignatures } = require('../harness/criteria-runner');
const { findActiveContract } = require('../harness/active-contract');

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

// ─── Loop Guardrails (loop-guardrails) ───────────────────────────────────────

/**
 * Hook pós-attempt na ordem D5: (1) artifacts → (2) scope guard + re-hash D2 →
 * (3) diff limits → (4) human gates (Fase 2) → (5) criteria (Fase 2) →
 * (6) budget/runtime. Registrar primeiro, julgar depois.
 *
 * Retorna { blocked, reason, feedback, issues } — `blocked` encerra o run;
 * `feedback` injeta instrução de rollback e segue para a próxima iteração.
 */
async function runPostAttemptGuards({ targetDir, guards, cb, logger, attempt, agentOutput }) {
  const { resolved, planDir } = guards;
  const slug = resolved.feature;

  // (1) registrar sempre, mesmo em falha
  let changed = { files: [], rehashViolations: [] };
  let diffPatch = '';
  if (guards.baseline) {
    try {
      changed = computeChangedSet(targetDir, guards.baseline);
      diffPatch = captureDiffPatch(targetDir);
    } catch { /* git indisponível neste attempt — artifacts parciais */ }
  }
  writeAttemptArtifacts(planDir, attempt, { changedFiles: changed.files, diffPatch });

  // tokens da tentativa acumulam sempre — o gasto já ocorreu (D3)
  recordAttemptTokens(cb.progress, estimateTokens(agentOutput));

  const outcome = { blocked: false, reason: null, feedback: null, issues: [] };

  // (2) scope guard + re-hash D2 (REQ-4/5/6)
  if (guards.baseline) {
    const scope = checkScope({
      changedFiles: changed.files,
      rehashViolations: changed.rehashViolations,
      allowedGlobs: resolved.allowed_files,
      forbiddenGlobs: resolved.forbidden_files
    });
    if (!scope.ok) {
      guards.scopeViolationCount += 1;
      const fileList = scope.violations.map((v) => v.path);
      logger.log(`  ✗ Scope violation (${fileList.length} file(s)): ${fileList.slice(0, 5).join(', ')}`);
      await emitGuardEvent(targetDir, {
        eventType: 'scope_violation',
        message: `scope violation on attempt ${attempt}`,
        payload: { slug, attempt, violations: scope.violations }
      });
      if (guards.scopeViolationCount >= 2) {
        // reincidência abre o circuito e escala para humano (REQ-6)
        cb.progress.circuit_state = 'OPEN';
        cb.progress.status = 'circuit_open';
        cb.progress.last_error = `scope_violation_repeat: ${fileList.slice(0, 3).join(', ')}`;
        await cb._save();
        outcome.blocked = true;
        outcome.reason = 'scope_violation_repeat';
        return outcome;
      }
      outcome.reason = 'scope_violation';
      outcome.feedback = buildRollbackFeedback(scope.violations);
      outcome.issues = [{ message: outcome.feedback }];
    }
  }

  // (3) diff limits (REQ-10) — não julga se a tentativa já vai para rollback
  if (!outcome.feedback) {
    const limits = checkDiffLimits({
      changedFiles: changed.files,
      diffPatch,
      maxChangedFiles: resolved.governor.max_changed_files ?? null,
      maxDiffLines: resolved.governor.max_diff_lines ?? null
    });
    if (!limits.ok) {
      const detail = limits.exceeded.map((e) => `${e.limit}: ${e.actual} > ${e.max}`).join('; ');
      logger.log(`  ✗ Diff limit exceeded — ${detail}`);
      await emitGuardEvent(targetDir, {
        eventType: 'diff_limit_exceeded',
        message: `diff limits exceeded on attempt ${attempt} (${detail})`,
        payload: { slug, attempt, exceeded: limits.exceeded }
      });
      outcome.blocked = true;
      outcome.reason = 'diff_limit_exceeded';
    }
  }

  // (4) human gates (REQ-12, D4) — violação de escopo precede gate: arquivo
  // fora do escopo merece rollback, não aprovação humana
  if (!outcome.feedback && !outcome.blocked && guards.baseline) {
    const detections = detectGates({
      changedFiles: changed.files,
      requiredFor: resolved.human_gate.required_for,
      themePaths: resolved.human_gate.theme_paths,
      existingGates: loadGates(planDir),
      runId: cb.progress.budget ? cb.progress.budget.run_id : null
    });
    if (detections.length > 0) {
      const created = [];
      for (const detection of detections) {
        const gate = createGate(planDir, {
          theme: detection.theme,
          attempt,
          triggeredBy: detection.triggeredBy,
          diffSummary: `${detection.triggeredBy.length} file(s): ${detection.triggeredBy.slice(0, 3).join(', ')}`,
          runId: cb.progress.budget ? cb.progress.budget.run_id : null
        });
        created.push(gate);
        await emitGuardEvent(targetDir, {
          eventType: 'human_gate_requested',
          message: `human gate ${gate.id} requested on attempt ${attempt}`,
          payload: { slug, attempt, gate_id: gate.id, theme: gate.theme, triggered_by: gate.triggered_by }
        });
      }
      enterHumanGate(cb.progress, created.map((g) => g.id));
      await cb._save();
      logger.log(`  ✗ Human gate requerido (${created.length}):`);
      for (const gate of created) {
        logger.log(`    - ${gate.id} [${gate.theme}] — ${gate.diff_summary}`);
        logger.log(`      aioson harness:approve . --slug=${slug} --gate=${gate.id}`);
      }
      outcome.blocked = true;
      outcome.reason = 'human_gate_pending';
    }
  }

  // (5) criteria checks (REQ-16/17, D7) — pulado se a tentativa já vai para
  // rollback ou gate (processo encerra)
  if (!outcome.feedback && !outcome.blocked) {
    const checks = await runCriteria({ criteria: resolved.criteria, cwd: targetDir });
    if (checks.length > 0) {
      writeAttemptArtifacts(planDir, attempt, { checks });
      const failed = checks.filter((c) => !c.ok);
      for (const check of failed) {
        await emitGuardEvent(targetDir, {
          eventType: 'criteria_check_failed',
          message: `criterion ${check.id} failed on attempt ${attempt} (exit ${check.exitCode}${check.timedOut ? ', timeout' : ''})`,
          payload: { slug, attempt, criterion_id: check.id, exit_code: check.exitCode, timed_out: check.timedOut, signature: check.signature }
        });
      }
      const repeats = registerFailureSignatures(cb.progress, failed);
      if (repeats.length > 0) {
        // mesma assinatura 2x no run (EC-13) → para e escala para humano
        cb.progress.circuit_state = 'OPEN';
        cb.progress.status = 'circuit_open';
        cb.progress.last_error = `failure_signature_repeat: ${repeats.map((r) => r.criterion_id).join(', ')}`;
        await cb._save();
        for (const repeat of repeats) {
          await emitGuardEvent(targetDir, {
            eventType: 'failure_signature_repeat',
            message: `criterion ${repeat.criterion_id} failed twice with the same signature in this run`,
            payload: { slug, attempt, criterion_id: repeat.criterion_id, signature: repeat.signature }
          });
        }
        logger.log(`  ✗ Mesma falha 2x no run (${repeats.map((r) => r.criterion_id).join(', ')}) — escalando para humano`);
        outcome.blocked = true;
        outcome.reason = 'failure_signature_repeat';
      } else if (failed.length > 0) {
        logger.log(`  ✗ Criteria checks falharam: ${failed.map((c) => c.id).join(', ')}`);
        outcome.reason = 'criteria_check_failed';
        outcome.feedback = failed
          .map((c) => `Criterion ${c.id} failed (exit ${c.exitCode}${c.timedOut ? ', timeout' : ''}): ${(c.stderr || c.stdout || '').split('\n').find((l) => l.trim()) || 'no output'}`)
          .join('\n');
        outcome.issues = [{ message: outcome.feedback }];
      }
    }
  }

  // (6) budget/runtime (REQ-7/8, EC-11) — sempre avaliado e persistido
  const budget = checkBudget(cb.progress, {
    costCeilingTokens: resolved.governor.cost_ceiling_tokens ?? null,
    maxRuntimeMinutes: resolved.governor.max_runtime_minutes ?? null
  });
  for (const event of budget.events) {
    logger.log(`  ${event.type === 'budget_warning' ? '⚠' : '✗'} ${event.message}`);
    await emitGuardEvent(targetDir, {
      eventType: event.type,
      message: event.message,
      payload: { slug, attempt, ...event.payload },
      tokenCount: cb.progress.budget.tokens_estimated
    });
  }
  await cb._save();
  if (budget.pause && !outcome.blocked) {
    logger.log(buildBudgetSummary(cb.progress, { maxIterations: resolved.governor.max_steps }));
    outcome.blocked = true;
    outcome.reason = budget.events.find((e) => e.type !== 'budget_warning')?.type || 'budget_exceeded';
  }

  return outcome;
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

  // C-01 (QA 2026-06-09): sem --contract e sem --spec, descobre o contrato
  // ATIVO em disco (mesma heurística do git:guard). O happy path do PRD e a
  // retomada instruída por harness:approve/budget-guard re-entram sem flags —
  // um contrato ativo nunca pode ficar silenciosamente fora do loop (REQ-1).
  if (!contractPath) {
    try {
      const active = findActiveContract(targetDir);
      if (active) contractPath = active.contractPath;
    } catch { /* best-effort: descoberta nunca derruba o loop */ }
  }

  if (contractPath && fs.existsSync(contractPath)) {
    const progressPath = path.join(path.dirname(contractPath), 'progress.json');
    cb = createCircuitBreaker(contractPath, progressPath);
    await cb.load();
    logger.log(`[Harness] Contract loaded: ${path.relative(targetDir, contractPath)}`);
  } else {
    logger.log('[Harness] guardrails inactive — no harness contract loaded');
  }

  // Teto de iterações pela flag; o contrato (governor EFETIVO) sobrescreve no
  // preflight dos guards, após validação de schema (C-02 / REQ-19).
  let maxIterations = Math.min(Math.max(Number(options['max-iterations'] || 3), 1), 5);

  if (!task) {
    logger.error('Error: --task is required');
    return { ok: false, error: 'missing_task' };
  }

  const sessionId = randomUUID();
  const feedbackHistory = [];

  // Loop Guardrails — preflight (REQ-1/2 + D3): valida o schema do contrato,
  // captura o baseline git e zera o orçamento do run. Sem contrato = sem
  // guards (retrocompat REQ-11).
  let guards = null;
  if (cb) {
    const schemaResult = validateContract(cb.contract);
    if (!schemaResult.ok) {
      logger.log(`── Harness Block ──────────────────────────────────────────`);
      for (const err of schemaResult.errors) {
        logger.log(`  ✗ contract schema invalid: ${err.field} — ${err.reason}`);
      }
      await emitGuardEvent(targetDir, {
        eventType: 'contract_invalid',
        message: 'harness-contract.json failed schema validation',
        payload: { slug: (cb.contract && cb.contract.feature) || null, errors: schemaResult.errors }
      });
      return { ok: false, iterations: 0, verdict: 'BLOCKED', reason: 'contract_schema_invalid', errors: schemaResult.errors };
    }
    for (const warning of schemaResult.warnings) {
      logger.log(`  ⚠ contract: ${warning.field} — ${warning.reason}`);
    }

    const resolved = resolveContract(cb.contract);
    const planDir = path.dirname(contractPath);

    // C-02 (REQ-19): o breaker (check/recordError) e o teto de iterações leem
    // `contract.governor` — injeta o governor EFETIVO (presets do contract_mode
    // aplicados) para que `builder`/`autopilot` valham fora de budget/diff.
    cb.contract.governor = resolved.governor;
    if (resolved.governor && resolved.governor.max_steps > 0) {
      maxIterations = resolved.governor.max_steps;
      logger.log(`[Harness] Max iterations set by contract: ${maxIterations}`);
    }

    // (EC-9) gates pendentes de run anterior são REAPRESENTADOS antes de
    // qualquer detecção nova; aprovação prévia restaura a retomada (REQ-15)
    resolveGateState(cb.progress, planDir);
    const pendingFromBefore = pendingGates(planDir);
    if (pendingFromBefore.length > 0) {
      enterHumanGate(cb.progress, pendingFromBefore.map((g) => g.id));
      await cb._save();
      logger.log(`── Harness Block ──────────────────────────────────────────`);
      logger.log(`  ✗ Human gate pendente (${pendingFromBefore.length}):`);
      for (const gate of pendingFromBefore) {
        logger.log(`    - ${gate.id} [${gate.theme}] attempt ${gate.attempt} — ${gate.diff_summary || (gate.triggered_by || []).join(', ')}`);
        logger.log(`      aioson harness:approve . --slug=${resolved.feature} --gate=${gate.id}`);
        logger.log(`      aioson harness:reject . --slug=${resolved.feature} --gate=${gate.id} --reason="..."`);
      }
      return { ok: false, iterations: 0, verdict: 'BLOCKED', reason: 'human_gate_pending', gates: pendingFromBefore.map((g) => g.id) };
    }

    let baseline = null;
    try {
      const captured = captureBaseline(targetDir, planDir, { forbiddenGlobs: resolved.forbidden_files });
      baseline = captured.baseline;
      for (const warning of captured.warnings) {
        logger.log(`  ⚠ baseline: ${warning.path} — ${warning.reason}`);
      }
    } catch (err) {
      logger.log(`  ⚠ scope guard inactive for this run: git baseline unavailable (${String(err.message || err).slice(0, 80)})`);
    }

    startRunBudget(cb.progress, sessionId);
    startRunSignatures(cb.progress); // D7: assinaturas de falha são por run
    await cb._save();
    guards = { resolved, planDir, baseline, scopeViolationCount: 0 };
  }

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

    // Loop Guardrails — hook pós-attempt (ordem D5). Roda ANTES de aceitar o
    // sucesso: violação de escopo em tentativa "verde" ainda bloqueia.
    if (guards) {
      const guardOutcome = await runPostAttemptGuards({
        targetDir,
        guards,
        cb,
        logger,
        attempt: iteration,
        agentOutput: agentResult.output
      });
      if (guardOutcome.blocked) {
        logger.log(`── Harness Block ──────────────────────────────────────────`);
        logger.log(`  ✗ Loop paused by guardrail: ${guardOutcome.reason}`);
        return { ok: false, iterations: iteration, verdict: 'BLOCKED', reason: guardOutcome.reason, feedback: feedbackHistory };
      }
      if (guardOutcome.feedback) {
        const guardVerdict = guardOutcome.reason === 'scope_violation' ? 'SCOPE_VIOLATION' : 'CRITERIA_FAILED';
        feedbackHistory.push({ iteration, verdict: guardVerdict, issues: guardOutcome.issues });
        await cb.recordError(guardOutcome.reason);
        continue;
      }
    }

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
