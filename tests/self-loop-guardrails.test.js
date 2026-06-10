'use strict';

/**
 * Integração loop-guardrails Fase 1 (success metric nº 1 do PRD):
 * violação proposital de escopo é detectada e o loop pausa/abre o circuito
 * antes de qualquer feature:close.
 *
 * O mock intercepta `execFileSync('aioson', ['agent:prompt', ...])` mutando o
 * export de node:child_process ANTES de carregar o módulo do loop (o
 * destructuring no topo do módulo captura a referência patched). Chamadas git
 * passam para a implementação real.
 */

const { test, describe, before, after, beforeEach } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const cp = require('node:child_process');
const realExecFileSync = cp.execFileSync;

let agentBehavior = null; // (projectDir) => string output — definido por teste
let agentCalls = 0;

cp.execFileSync = function patchedExecFileSync(cmd, cmdArgs, opts) {
  if (cmd === 'aioson' && Array.isArray(cmdArgs) && cmdArgs[0] === 'agent:prompt') {
    agentCalls += 1;
    if (typeof agentBehavior !== 'function') throw new Error('test: agentBehavior not set');
    return agentBehavior(opts && opts.cwd ? opts.cwd : process.cwd());
  }
  return realExecFileSync.apply(this, arguments);
};

// requer DEPOIS do patch — o destructuring interno captura o mock
const { runSelfLoop } = require('../src/commands/self-implement-loop');

const silentLogger = { log: () => {}, error: () => {} };

function gitIn(repoDir, args) {
  realExecFileSync('git', args, { cwd: repoDir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

function makeRepo() {
  const repoDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aioson-selfloop-'));
  gitIn(repoDir, ['init', '-q']);
  gitIn(repoDir, ['config', 'user.email', 'test@aioson.dev']);
  gitIn(repoDir, ['config', 'user.name', 'AIOSON Test']);
  fs.mkdirSync(path.join(repoDir, 'src'), { recursive: true });
  fs.writeFileSync(path.join(repoDir, 'src', 'index.js'), 'module.exports = 1;\n');
  gitIn(repoDir, ['add', '.']);
  gitIn(repoDir, ['commit', '-q', '-m', 'init', '--no-gpg-sign']);
  return repoDir;
}

function writeContract(repoDir, contract) {
  const planDir = path.join(repoDir, '.aioson', 'plans', contract.feature);
  fs.mkdirSync(planDir, { recursive: true });
  const contractPath = path.join(planDir, 'harness-contract.json');
  fs.writeFileSync(contractPath, JSON.stringify(contract, null, 2), 'utf8');
  return { planDir, contractPath };
}

function baseContract(extra = {}) {
  return {
    feature: 'demo',
    contract_mode: 'BALANCED',
    governor: { max_steps: 4, error_streak_limit: 5, cost_ceiling_tokens: null },
    criteria: [],
    ...extra
  };
}

function readProgress(planDir) {
  return JSON.parse(fs.readFileSync(path.join(planDir, 'progress.json'), 'utf8'));
}

describe('self:loop guardrails — integração Fase 1', () => {
  const repos = [];

  beforeEach(() => {
    agentCalls = 0;
    agentBehavior = null;
  });

  after(() => {
    cp.execFileSync = realExecFileSync;
    for (const dir of repos) {
      try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* win race */ }
    }
  });

  test('violação proposital: detecta, injeta rollback e abre o circuito na reincidência (REQ-6)', async () => {
    const repoDir = makeRepo();
    repos.push(repoDir);
    const { planDir, contractPath } = writeContract(repoDir, baseContract({ allowed_files: ['src/**'] }));

    agentBehavior = (projectDir) => {
      // agente "malicioso": escreve em path proibido por default (REQ-4)
      fs.mkdirSync(path.join(projectDir, 'secrets'), { recursive: true });
      fs.writeFileSync(path.join(projectDir, 'secrets', 'leak.txt'), `attempt ${agentCalls}\n`);
      return 'done';
    };

    const result = await runSelfLoop({
      args: [repoDir],
      options: { agent: 'dev', task: 'implement feature', contract: contractPath },
      logger: silentLogger
    });

    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.verdict, 'BLOCKED');
    assert.strictEqual(result.reason, 'scope_violation_repeat');
    assert.strictEqual(agentCalls, 2, 'primeira violação dá chance de rollback; segunda bloqueia');

    const progress = readProgress(planDir);
    assert.strictEqual(progress.circuit_state, 'OPEN');
    assert.strictEqual(progress.status, 'circuit_open');
    assert.match(progress.last_error, /scope_violation/);

    // rollback feedback foi registrado para a iteração seguinte
    assert.strictEqual(result.feedback.length, 1);
    assert.strictEqual(result.feedback[0].verdict, 'SCOPE_VIOLATION');
    assert.match(result.feedback[0].issues[0].message, /SCOPE VIOLATION/);

    // artefatos por tentativa (REQ-9) + baseline (REQ-2)
    assert.ok(fs.existsSync(path.join(planDir, 'baseline.json')));
    for (const attempt of ['1', '2']) {
      const changedPath = path.join(planDir, 'attempts', attempt, 'changed-files.json');
      assert.ok(fs.existsSync(changedPath), `attempts/${attempt}/changed-files.json`);
      const changed = JSON.parse(fs.readFileSync(changedPath, 'utf8'));
      assert.ok(changed.files.some((f) => f.path === 'secrets/leak.txt'));
    }
  });

  test('agente dentro do escopo passa; budget acumulado em progress.json (D3)', async () => {
    const repoDir = makeRepo();
    repos.push(repoDir);
    const { planDir, contractPath } = writeContract(repoDir, baseContract({ allowed_files: ['src/**'] }));

    agentBehavior = (projectDir) => {
      fs.writeFileSync(path.join(projectDir, 'src', 'feature.js'), 'module.exports = 2;\n');
      return 'implemented the feature correctly';
    };

    const result = await runSelfLoop({
      args: [repoDir],
      options: { agent: 'dev', task: 'implement feature', contract: contractPath },
      logger: silentLogger
    });

    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.iterations, 1);

    const progress = readProgress(planDir);
    assert.strictEqual(progress.circuit_state, 'CLOSED');
    assert.ok(progress.budget, 'budget accumulator must exist');
    assert.ok(progress.budget.tokens_estimated > 0, 'tokens chars/4 accumulated');
    assert.ok(fs.existsSync(path.join(planDir, 'attempts', '1', 'changed-files.json')));
  });

  test('contrato inválido bloqueia no preflight, antes de qualquer execução (REQ-1)', async () => {
    const repoDir = makeRepo();
    repos.push(repoDir);
    const contract = baseContract();
    contract.allowed_filez = ['src/**']; // typo proposital
    const { contractPath } = writeContract(repoDir, contract);

    agentBehavior = () => 'should never run';

    const result = await runSelfLoop({
      args: [repoDir],
      options: { agent: 'dev', task: 'implement feature', contract: contractPath },
      logger: silentLogger
    });

    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.verdict, 'BLOCKED');
    assert.strictEqual(result.reason, 'contract_schema_invalid');
    assert.strictEqual(result.errors[0].field, 'allowed_filez');
    assert.strictEqual(agentCalls, 0, 'agent must not execute with invalid contract');
  });

  test('cost_ceiling_tokens enforced: pausa com budget_exceeded (REQ-7)', async () => {
    const repoDir = makeRepo();
    repos.push(repoDir);
    const contract = baseContract({ allowed_files: ['src/**'] });
    contract.governor.cost_ceiling_tokens = 10; // 40 chars de output já estouram
    const { contractPath } = writeContract(repoDir, contract);

    agentBehavior = (projectDir) => {
      fs.writeFileSync(path.join(projectDir, 'src', 'feature.js'), 'ok\n');
      return 'x'.repeat(400); // ~100 tokens estimados
    };

    const result = await runSelfLoop({
      args: [repoDir],
      options: { agent: 'dev', task: 'implement feature', contract: contractPath },
      logger: silentLogger
    });

    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.verdict, 'BLOCKED');
    assert.strictEqual(result.reason, 'budget_exceeded');
    assert.strictEqual(agentCalls, 1);
  });

  test('contrato legado sem campos novos roda sem guards extras (REQ-11 retrocompat)', async () => {
    const repoDir = makeRepo();
    repos.push(repoDir);
    // shape exata do harness:init antigo
    const { planDir, contractPath } = writeContract(repoDir, {
      feature: 'demo',
      contract_mode: 'BALANCED',
      governor: { max_steps: 4, error_streak_limit: 5, cost_ceiling_tokens: null },
      criteria: [{ id: 'C1', description: 'x', assertion: 'y', binary: true }]
    });

    agentBehavior = (projectDir) => {
      // path qualquer (não proibido) — sem allowlist, deve passar
      fs.writeFileSync(path.join(projectDir, 'anywhere.js'), 'ok\n');
      return 'done';
    };

    const result = await runSelfLoop({
      args: [repoDir],
      options: { agent: 'dev', task: 'implement feature', contract: contractPath },
      logger: silentLogger
    });

    assert.strictEqual(result.ok, true);
    const progress = readProgress(planDir);
    assert.strictEqual(progress.circuit_state, 'CLOSED');
  });

  test('default proibido não-removível mesmo em contrato legado (REQ-4)', async () => {
    const repoDir = makeRepo();
    repos.push(repoDir);
    const { contractPath } = writeContract(repoDir, baseContract());

    agentBehavior = (projectDir) => {
      fs.writeFileSync(path.join(projectDir, '.env'), 'SECRET=leaked\n');
      return 'done';
    };

    const result = await runSelfLoop({
      args: [repoDir],
      options: { agent: 'dev', task: 'implement feature', contract: contractPath },
      logger: silentLogger
    });

    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.reason, 'scope_violation_repeat');
  });

  // ─── Fase 2 ────────────────────────────────────────────────────────────────

  test('human gate end-to-end: detecção, EC-9, approve e retomada (REQ-12/14/15)', async () => {
    const { runHarnessApprove } = require('../src/commands/harness-gate');
    const { runHarnessStatus } = require('../src/commands/harness-status');

    const repoDir = makeRepo();
    repos.push(repoDir);
    const { planDir, contractPath } = writeContract(repoDir, baseContract({
      allowed_files: ['src/**'],
      human_gate: { required_for: ['auth_permission_change'] }
    }));

    agentBehavior = (projectDir) => {
      fs.mkdirSync(path.join(projectDir, 'src', 'auth'), { recursive: true });
      fs.writeFileSync(path.join(projectDir, 'src', 'auth', 'roles.js'), 'module.exports = [];\n');
      return 'changed auth roles';
    };

    const loopOptions = { agent: 'dev', task: 'change auth', contract: contractPath };

    // 1ª execução: detecta tema, cria gate, encerra
    const first = await runSelfLoop({ args: [repoDir], options: loopOptions, logger: silentLogger });
    assert.strictEqual(first.ok, false);
    assert.strictEqual(first.reason, 'human_gate_pending');
    assert.strictEqual(agentCalls, 1);

    const gateFile = path.join(planDir, 'gates', 'auth_permission_change-1.json');
    assert.ok(fs.existsSync(gateFile));
    let progress = readProgress(planDir);
    assert.strictEqual(progress.status, 'human_gate');
    assert.deepStrictEqual(progress.pending_gates, ['auth_permission_change-1']);

    // harness:status agrega o gate pendente (REQ-18)
    const status = await runHarnessStatus({ args: [repoDir], options: { slug: 'demo', json: true }, logger: silentLogger });
    assert.strictEqual(status.pending_gates.length, 1);
    assert.match(status.next_action, /harness:approve/);

    // 2ª execução SEM decisão: gate reapresentado, agente NÃO roda (EC-9)
    const represented = await runSelfLoop({ args: [repoDir], options: loopOptions, logger: silentLogger });
    assert.strictEqual(represented.reason, 'human_gate_pending');
    assert.strictEqual(agentCalls, 1, 'agent must not run while gate is pending');

    // approve persiste decisão e restaura o estado (REQ-14/15)
    const approval = await runHarnessApprove({
      args: [repoDir],
      options: { slug: 'demo', gate: 'auth_permission_change-1', by: 'tester' },
      logger: silentLogger
    });
    assert.strictEqual(approval.ok, true);
    const gate = JSON.parse(fs.readFileSync(gateFile, 'utf8'));
    assert.strictEqual(gate.status, 'approved');
    assert.strictEqual(gate.decided_by, 'tester');
    progress = readProgress(planDir);
    assert.strictEqual(progress.status, 'in_progress');
    assert.deepStrictEqual(progress.pending_gates, []);

    // approve repetido é no-op idempotente (REQ-14)
    const again = await runHarnessApprove({
      args: [repoDir],
      options: { slug: 'demo', gate: 'auth_permission_change-1', by: 'someone-else' },
      logger: silentLogger
    });
    assert.strictEqual(again.idempotent, true);

    // retomada: baseline novo absorve o arquivo já alterado — sem re-trigger
    const resumed = await runSelfLoop({ args: [repoDir], options: loopOptions, logger: silentLogger });
    assert.strictEqual(resumed.ok, true);
    assert.strictEqual(agentCalls, 2);
  });

  test('criteria com verification: mesma assinatura 2x no run para e escala (REQ-16/17)', async () => {
    const repoDir = makeRepo();
    repos.push(repoDir);
    const contract = baseContract({ allowed_files: ['src/**'] });
    contract.criteria = [{
      id: 'C1',
      description: 'check determinístico que sempre falha igual',
      verification: 'node -e "console.error(\'boom\'); process.exit(3)"'
    }];
    const { planDir, contractPath } = writeContract(repoDir, contract);

    agentBehavior = (projectDir) => {
      fs.writeFileSync(path.join(projectDir, 'src', 'feature.js'), `attempt ${agentCalls}\n`);
      return 'done';
    };

    const result = await runSelfLoop({
      args: [repoDir],
      options: { agent: 'dev', task: 'implement', contract: contractPath },
      logger: silentLogger
    });

    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.verdict, 'BLOCKED');
    assert.strictEqual(result.reason, 'failure_signature_repeat');
    assert.strictEqual(agentCalls, 2, '1ª falha vira feedback; 2ª com mesma assinatura escala');

    const progress = readProgress(planDir);
    assert.strictEqual(progress.circuit_state, 'OPEN');
    assert.strictEqual(progress.failure_signatures.length, 2);
    assert.strictEqual(progress.failure_signatures[0].signature, progress.failure_signatures[1].signature);

    // log do check gravado por tentativa (REQ-9/16)
    const log = fs.readFileSync(path.join(planDir, 'attempts', '1', 'checks', 'C1.log'), 'utf8');
    assert.match(log, /# exit_code: 3/);
    assert.match(log, /boom/);
  });

  test('gate publish intercepta feature:close sem aprovação (REQ-13)', async () => {
    const { runFeatureClose } = require('../src/commands/feature-close');
    const { decideGate } = require('../src/harness/human-gate');

    const repoDir = makeRepo();
    repos.push(repoDir);
    const { planDir } = writeContract(repoDir, baseContract({
      human_gate: { required_for: ['publish'] }
    }));
    fs.writeFileSync(path.join(planDir, 'progress.json'), JSON.stringify({
      feature: 'demo', status: 'in_progress', circuit_state: 'CLOSED', ready_for_done_gate: true
    }, null, 2));

    const blocked = await runFeatureClose({
      args: [repoDir],
      options: { feature: 'demo', verdict: 'PASS', json: true },
      logger: silentLogger
    });
    assert.strictEqual(blocked.ok, false);
    assert.strictEqual(blocked.reason, 'publish_gate_pending');
    assert.strictEqual(blocked.gate, 'publish-1');

    // segunda chamada reapresenta o MESMO gate (sem duplicar)
    const blockedAgain = await runFeatureClose({
      args: [repoDir],
      options: { feature: 'demo', verdict: 'PASS', json: true },
      logger: silentLogger
    });
    assert.strictEqual(blockedAgain.gate, 'publish-1');
    const gateFiles = fs.readdirSync(path.join(planDir, 'gates')).filter((f) => f.startsWith('publish'));
    assert.strictEqual(gateFiles.length, 1);

    // aprovado → interceptação libera (o restante do close segue o fluxo normal)
    decideGate(planDir, 'publish-1', { decision: 'approved', by: 'tester' });
    const afterApprove = await runFeatureClose({
      args: [repoDir],
      options: { feature: 'demo', verdict: 'PASS', json: true },
      logger: silentLogger
    });
    assert.notStrictEqual(afterApprove.reason, 'publish_gate_pending');
  });

  // ─── QA findings (Gate D) ──────────────────────────────────────────────────

  test('QA-H-01: contrato ativo em disco é descoberto sem --spec/--contract — guards nunca silenciosamente inativos (PRD happy path + REQ-1)', async () => {
    const repoDir = makeRepo();
    repos.push(repoDir);
    // contrato ativo: progress.json in_progress, mesma heurística do
    // findActiveContract do git:guard (REQ-20)
    const { planDir } = writeContract(repoDir, baseContract({ allowed_files: ['src/**'] }));
    fs.writeFileSync(path.join(planDir, 'progress.json'), JSON.stringify({
      feature: 'demo', status: 'in_progress', circuit_state: 'CLOSED',
      iterations: 0, consecutive_errors: 0, ready_for_done_gate: false,
      last_updated: new Date().toISOString()
    }, null, 2));

    agentBehavior = (projectDir) => {
      // violação proposital: path proibido por default (REQ-4)
      fs.writeFileSync(path.join(projectDir, '.env'), 'SECRET=leaked\n');
      return 'done';
    };

    // invocação exata do user flow do PRD: sem --spec e sem --contract.
    // harness:approve e budget-guard instruem "re-run self:loop" sem flag —
    // a retomada documentada NÃO pode voltar sem guards.
    const result = await runSelfLoop({
      args: [repoDir],
      options: { agent: 'dev', task: 'implement feature', 'max-iterations': 3 },
      logger: silentLogger
    });

    assert.strictEqual(result.ok, false, 'loop must not succeed with a default-forbidden write while an active contract exists on disk');
    assert.strictEqual(result.verdict, 'BLOCKED');
    assert.strictEqual(result.reason, 'scope_violation_repeat');
  });

  test('git:guard mescla forbidden_files do contrato ativo (REQ-20)', async () => {
    const { runGitGuard } = require('../src/commands/git-guard');

    const repoDir = makeRepo();
    repos.push(repoDir);
    const contract = baseContract({ forbidden_files: ['internal/**'] });
    const { planDir } = writeContract(repoDir, contract);
    fs.writeFileSync(path.join(planDir, 'progress.json'), JSON.stringify({
      feature: 'demo', status: 'in_progress', circuit_state: 'CLOSED',
      last_updated: new Date().toISOString()
    }, null, 2));

    fs.mkdirSync(path.join(repoDir, 'internal'), { recursive: true });
    fs.writeFileSync(path.join(repoDir, 'internal', 'config-prod.js'), 'module.exports = 1;\n');
    gitIn(repoDir, ['add', 'internal/config-prod.js']);

    const savedExitCode = process.exitCode;
    try {
      const result = await runGitGuard({
        args: [repoDir],
        options: { json: true },
        logger: silentLogger
      });
      assert.strictEqual(result.ok, false);
      const finding = result.errors.find((e) => e.id === 'contract_forbidden_file');
      assert.ok(finding, 'must flag the contract-forbidden staged file');
      assert.match(finding.reason, /internal\/\*\*/);
      assert.match(finding.reason, /"demo"/);
      assert.strictEqual(result.contractPolicy.slug, 'demo');

      // arquivo fora do forbidden do contrato passa pelo merge sem finding extra
      gitIn(repoDir, ['reset']);
      fs.writeFileSync(path.join(repoDir, 'src', 'ok.js'), 'module.exports = 2;\n');
      gitIn(repoDir, ['add', 'src/ok.js']);
      const clean = await runGitGuard({
        args: [repoDir],
        options: { json: true },
        logger: silentLogger
      });
      assert.ok(!clean.errors.some((e) => e.id === 'contract_forbidden_file'));
    } finally {
      process.exitCode = savedExitCode; // runGitGuard marca exitCode=1 em bloqueio
    }
  });

  test('QA-C-02: presets do contract_mode alcançam o breaker e o teto de iterações (REQ-19)', async () => {
    const repoDir = makeRepo();
    repos.push(repoDir);
    // governor vazio: TODOS os limites vêm do preset `safe`
    // (max_steps 10, error_streak_limit 3)
    const { planDir, contractPath } = writeContract(repoDir, baseContract({
      contract_mode: 'safe',
      governor: {}
    }));
    // run anterior acumulou 3 erros consecutivos — o preset deve negar já no check()
    fs.writeFileSync(path.join(planDir, 'progress.json'), JSON.stringify({
      feature: 'demo', status: 'in_progress', circuit_state: 'CLOSED',
      iterations: 0, consecutive_errors: 3, ready_for_done_gate: false,
      last_updated: new Date().toISOString()
    }, null, 2));

    const lines = [];
    const captureLogger = { log: (m) => lines.push(String(m)), error: (m) => lines.push(String(m)) };
    agentBehavior = () => 'done';

    const result = await runSelfLoop({
      args: [repoDir],
      options: { agent: 'dev', task: 'implement feature', contract: contractPath },
      logger: captureLogger
    });

    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.verdict, 'BLOCKED');
    assert.strictEqual(result.reason, 'error_streak_limit_reached');
    assert.strictEqual(agentCalls, 0, 'breaker com governor efetivo nega antes de executar o agente');
    assert.ok(
      lines.some((l) => l.includes('Max iterations set by contract: 10')),
      'max_steps do preset deve virar o teto de iterações'
    );
  });

  test('QA-C-03: git:guard não bloqueia lockfile humano via defaults do contrato — só globs declarados (REQ-20)', async () => {
    const { runGitGuard } = require('../src/commands/git-guard');

    const repoDir = makeRepo();
    repos.push(repoDir);
    // contrato ativo SEM forbidden_files declarado — os defaults não-removíveis
    // (package-lock.json etc.) valem para o LOOP, não para o commit humano
    const { planDir } = writeContract(repoDir, baseContract({ allowed_files: ['src/**'] }));
    fs.writeFileSync(path.join(planDir, 'progress.json'), JSON.stringify({
      feature: 'demo', status: 'in_progress', circuit_state: 'CLOSED',
      last_updated: new Date().toISOString()
    }, null, 2));

    fs.writeFileSync(path.join(repoDir, 'package-lock.json'), '{ "lockfileVersion": 3 }\n');
    gitIn(repoDir, ['add', 'package-lock.json']);

    const savedExitCode = process.exitCode;
    try {
      const result = await runGitGuard({
        args: [repoDir],
        options: { json: true },
        logger: silentLogger
      });
      assert.ok(
        !result.errors.some((e) => e.id === 'contract_forbidden_file'),
        'lockfile staged por humano não pode virar erro de contrato no pre-commit'
      );
      assert.strictEqual(result.contractPolicy.slug, 'demo');
      assert.strictEqual(result.contractPolicy.findings, 0);
    } finally {
      process.exitCode = savedExitCode;
    }
  });
});
