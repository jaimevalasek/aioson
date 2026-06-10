'use strict';

/**
 * aioson harness:status . --slug=X [--json] — visibilidade do estado do loop
 * (loop-guardrails REQ-18).
 *
 * Agrega: circuito, iteração N/M, budget, checks da última tentativa,
 * última falha, gates pendentes e a próxima ação. Escopo distinto de
 * `spec:status` (planos+learnings) — referenciado no rodapé.
 */

const fs = require('node:fs');
const path = require('node:path');

const { resolveContract, validateContract } = require('../harness/contract-schema');
const { pendingGates } = require('../harness/human-gate');

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

/** Última tentativa = maior diretório numérico em attempts/. */
function latestAttempt(planDir) {
  const dir = path.join(planDir, 'attempts');
  if (!fs.existsSync(dir)) return null;
  const numbers = fs.readdirSync(dir)
    .map((name) => Number(name))
    .filter((n) => Number.isInteger(n) && n > 0);
  return numbers.length ? Math.max(...numbers) : null;
}

/** Conta checks pass/fail da tentativa pelos logs `# exit_code:`. */
function readChecks(planDir, attempt) {
  const checksDir = path.join(planDir, 'attempts', String(attempt), 'checks');
  if (!fs.existsSync(checksDir)) return { total: 0, passed: 0, failed: 0, failed_ids: [] };
  const summary = { total: 0, passed: 0, failed: 0, failed_ids: [] };
  for (const file of fs.readdirSync(checksDir)) {
    if (!file.endsWith('.log')) continue;
    summary.total += 1;
    try {
      const content = fs.readFileSync(path.join(checksDir, file), 'utf8');
      const match = content.match(/^# exit_code: (.+)$/m);
      if (match && match[1].trim() === '0') {
        summary.passed += 1;
      } else {
        summary.failed += 1;
        summary.failed_ids.push(file.replace(/\.log$/, ''));
      }
    } catch {
      summary.failed += 1;
    }
  }
  return summary;
}

function nextAction(progress, pending, slug) {
  if (pending.length > 0) {
    return `aioson harness:approve . --slug=${slug} --gate=${pending[0].id} (ou harness:reject --reason="...")`;
  }
  const status = progress?.status || 'unknown';
  if (status === 'circuit_open' || progress?.circuit_state === 'OPEN') {
    return 'circuito aberto — revisar last_error e corrigir antes de novo run';
  }
  if (status === 'waiting_validation') {
    return `aioson harness:validate . --slug=${slug}`;
  }
  if (progress?.ready_for_done_gate) {
    return `pronto para o done gate — aioson feature:close . --feature=${slug}`;
  }
  return `re-executar self:loop para continuar (iteração persiste em progress.json)`;
}

async function runHarnessStatus({ args, options = {}, logger }) {
  const targetDir = path.resolve(process.cwd(), args?.[0] || '.');
  const slug = String(options.slug || '').trim();

  if (!slug) {
    logger.error('Error: --slug is required');
    return { ok: false, error: 'missing_slug' };
  }

  const planDir = path.join(targetDir, '.aioson', 'plans', slug);
  const contract = readJson(path.join(planDir, 'harness-contract.json'));
  if (!contract) {
    logger.error(`Contract not found for slug: ${slug}`);
    return { ok: false, error: 'contract_not_found' };
  }

  const progress = readJson(path.join(planDir, 'progress.json'));
  const schema = validateContract(contract);
  const resolved = schema.ok ? resolveContract(contract) : null;
  const pending = pendingGates(planDir);
  const attempt = latestAttempt(planDir);
  const checks = attempt ? readChecks(planDir, attempt) : { total: 0, passed: 0, failed: 0, failed_ids: [] };

  const maxSteps = resolved ? resolved.governor.max_steps : (contract.governor && contract.governor.max_steps) || null;
  const ceiling = resolved ? (resolved.governor.cost_ceiling_tokens ?? null) : null;
  const budget = progress?.budget || null;

  const report = {
    ok: true,
    slug,
    contract_mode: contract.contract_mode || 'BALANCED',
    contract_schema_ok: schema.ok,
    circuit_state: progress?.circuit_state || 'CLOSED',
    status: progress?.status || 'unknown',
    iterations: progress?.iterations ?? 0,
    max_steps: maxSteps,
    budget: budget ? {
      tokens_estimated: budget.tokens_estimated || 0,
      cost_ceiling_tokens: ceiling,
      run_id: budget.run_id || null,
      run_started_at: budget.run_started_at || null
    } : null,
    last_attempt: attempt,
    checks,
    last_error: progress?.last_error || null,
    pending_gates: pending.map((g) => ({ id: g.id, theme: g.theme, attempt: g.attempt, requested_at: g.requested_at })),
    next_action: nextAction(progress, pending, slug)
  };

  if (options.json) {
    logger.log(JSON.stringify(report, null, 2));
    return report;
  }

  logger.log(`Harness status — ${slug}`);
  logger.log(`  Mode: ${report.contract_mode}${schema.ok ? '' : '  (⚠ contract schema invalid)'}`);
  logger.log(`  Circuit: ${report.circuit_state} | status: ${report.status}`);
  logger.log(`  Iteration: ${report.iterations}${maxSteps ? `/${maxSteps}` : ''}`);
  if (budget) {
    logger.log(`  Budget: ${report.budget.tokens_estimated} tokens estimados${ceiling ? ` / ${ceiling} (${Math.round((report.budget.tokens_estimated / ceiling) * 100)}%)` : ' (sem teto)'}`);
  }
  if (attempt) {
    logger.log(`  Last attempt: ${attempt} — checks ${checks.passed}/${checks.total} pass${checks.failed ? ` (failed: ${checks.failed_ids.join(', ')})` : ''}`);
  }
  if (report.last_error) logger.log(`  Last error: ${report.last_error}`);
  if (pending.length > 0) {
    logger.log(`  ⛔ Pending gates (${pending.length}):`);
    for (const gate of pending) {
      logger.log(`    - ${gate.id} [${gate.theme}] attempt ${gate.attempt}`);
    }
  }
  logger.log(`  Next: ${report.next_action}`);
  logger.log('');
  logger.log('  Planos e learnings: aioson spec:status');

  return report;
}

module.exports = {
  runHarnessStatus
};
