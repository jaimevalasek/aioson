---
feature: loop-guardrails
status: in_progress
started: 2026-06-09
phase_gates:
  requirements: approved
  design: approved
  plan: pending
gate_requirements: approved
gate_design: approved
gate_plan: approved
---

# Spec — Loop Guardrails

## What was built

### Fase 1 (2026-06-09) — guards no preflight + hook pós-attempt

Criados (módulos puros em `src/harness/`, padrão circuit-breaker):

- `src/harness/glob-match.js` — matcher subset estrito `**`/`*`/`?` (D1); `validateGlobPattern` rejeita extglob; pattern sem `/` casa basename em qualquer profundidade (estilo gitignore — ver Key decisions)
- `src/harness/contract-schema.js` — `validateContract` (REQ-1, erros `{field, reason}`, unknown-field em todos os níveis) + `resolveContract` (presets REQ-19, merge dos defaults proibidos REQ-4, EC-5, mapa tema→paths)
- `src/harness/git-baseline.js` — `captureBaseline` (REQ-2 + hashes D2), `computeChangedSet` (REQ-3: porcelain `-uall` − dirty baseline + re-hash D2), `captureDiffPatch`; única fronteira `child_process` da Fase 1
- `src/harness/scope-guard.js` — `checkScope` (REQ-4/5/6, deny vence allow), `checkDiffLimits` (REQ-10), `buildRollbackFeedback`
- `src/harness/budget-guard.js` — `estimateTokens` (chars/4), acumulador `progress.json.budget` (D3), `checkBudget` (política 80/100% REQ-7, EC-11; `max_runtime_minutes` REQ-8)
- `src/harness/attempt-artifacts.js` — writer único de `attempts/{n}/` (REQ-9)
- `src/harness/guard-events.js` — emissor best-effort dos 10 event types novos (D6; ver Key decisions)

Alterados:

- `src/commands/self-implement-loop.js` — preflight (schema → baseline → budget novo por run) + hook pós-attempt na ordem D5 (helper `runPostAttemptGuards`); hook roda ANTES de aceitar sucesso
- `src/commands/harness.js` — template do `harness:init` ganha `forbidden_files`, `max_runtime_minutes`/`max_changed_files`/`max_diff_lines` e valida o contrato gerado

Testes: `tests/harness-{glob-match,contract-schema,scope-guard,budget-guard}.test.js` + `tests/self-loop-guardrails.test.js` (integração end-to-end com `execFileSync` mockado para `agent:prompt`; violação proposital → rollback feedback → circuito aberto na reincidência — success metric nº 1 do PRD). 66 testes novos.

### Fase 2 (2026-06-09) — gates, critérios e visibilidade

Criados:

- `src/harness/human-gate.js` — detecção por tema (REQ-12; `publish` nunca por diff), `gates/{id}.json` (§2.4 + campo aditivo `run_id`), `enterHumanGate`/`resolveGateState` (D4), `decideGate` idempotente (REQ-14, EC-8), `hasApprovedPublishGate`
- `src/harness/criteria-runner.js` — `runCriteria` via `executeInSandbox` (REQ-16, EC-7), `failureSignature` D7 (sha1 + normalização de paths/dígitos), `registerFailureSignatures` (2x no run → repeat, EC-13), `startRunSignatures`
- `src/commands/harness-gate.js` — `harness:approve`/`harness:reject` (REQ-14/15; `--by` fallback git user.name; reject exige `--reason`; reconcilia `progress.json`)
- `src/commands/harness-status.js` — `harness:status [--json]` (REQ-18; circuito, iteração N/M, budget, checks da última tentativa, gates pendentes, next action; rodapé referencia `spec:status`)

Alterados:

- `src/harness/circuit-breaker.js` — `check()` nega com `human_gate_pending` quando `status='human_gate'` ou `pending_gates[]` não-vazio (D4)
- `src/commands/self-implement-loop.js` — preflight: gates pendentes reapresentados antes de detecção nova (EC-9) + `startRunSignatures`; hook D5 passos 4 (gates → processo encerra) e 5 (criteria → logs em `checks/`, feedback em falha, repeat escala)
- `src/commands/feature-close.js` — interceptação `publish` early-return antes do Done Gate (REQ-13); `--force` NÃO bypassa (ver decisões)
- `src/commands/git-guard.js` — merge best-effort dos `forbidden_files` do contrato ativo (progress `in_progress`/`human_gate` mais recente) na verificação (REQ-20); finding `contract_forbidden_file`
- `src/cli.js` — registro `harness:approve`/`harness:reject`/`harness:status` (requires inline, lazy-load)

Testes: `tests/harness-human-gate.test.js`, `tests/harness-criteria-runner.test.js` + 4 cenários novos na integração (gate end-to-end com approve/retomada, failure signature repeat, publish gate, git:guard merge). 28 testes novos na fase.

## Entities added

Schemas em disco (sem tabelas novas — ver `requirements-loop-guardrails.md` §2 para campos completos):

- `harness-contract.json` — campos novos: `allowed_files[]`, `forbidden_files[]`, `governor.max_runtime_minutes`, `governor.max_changed_files`, `governor.max_diff_lines`, `human_gate.{required_for[], themes[]}`, `criteria[].verification`, presets de `contract_mode`
- `.aioson/plans/{slug}/baseline.json` — HEAD + dirty_paths capturados no preflight
- `.aioson/plans/{slug}/attempts/{n}/` — `changed-files.json`, `checks/{id}.log`, `diff.patch`
- `.aioson/plans/{slug}/gates/{id}.json` — decisão humana persistida (pending/approved/rejected)
- Eventos novos em `execution_events` (sem migration): scope_violation, budget_warning, budget_exceeded, runtime_exceeded, human_gate_requested, human_gate_decision, criteria_check_failed, failure_signature_repeat, contract_invalid, diff_limit_exceeded; produção de `token_count` (chars/4)

## Key decisions

- [2026-06-09] Detecção de escopo via `git status --porcelain` vs baseline do preflight — `git diff --name-only` não vê untracked (sheldon)
- [2026-06-09] Validação de schema do contrato no preflight é pré-requisito dos guards — typo em `allowed_files` não pode desligar o guard silenciosamente (sheldon)
- [2026-06-09] Estimativa de tokens chars/4 gravada em `execution_events.token_count` (coluna já existe) — sem dependência nova; `tokenx` como upgrade path
- [2026-06-09] Check-runner reusa `executeInSandbox` de `src/sandbox.js` — não criar runner novo
- [2026-06-09] `forbidden_files` deny vence `allowed_files` allow; defaults proibidos não-removíveis
- [2026-06-09] Assinatura de falha conta 2 ocorrências no run (não precisa consecutivas) — diferente do `error_streak`
- [2026-06-09] EC-2 resolvida (architect D2): baseline grava `git hash-object` dos dirty paths que casam `forbidden_files`; re-hash por tentativa, hash mudou → `scope_violation`. Warning no preflight mantido
- [2026-06-09] Globs sem dependência nova (architect D1): `src/harness/glob-match.js` com subset estrito (`**`,`*`,`?`); schema rejeita sintaxe fora do subset; `picomatch` como upgrade path
- [2026-06-09] Enforcement de orçamento lê acumulador em `progress.json` (architect D3); `execution_events.token_count` segue como telemetria

### Decisões do @dev — Fase 1 (deferred decisions resolvidas)

- [2026-06-09] **Semântica de glob sem `/`**: casa contra o basename em qualquer profundidade (estilo gitignore) — `*.pem` pega `certs/server.pem`. Pattern com `/` casa o caminho relativo completo. Necessário para os defaults proibidos serem efetivos em qualquer nível.
- [2026-06-09] **Módulo extra `guard-events.js`** (não previsto na lista do design-doc): emissor único best-effort dos eventos D6, espelho de `neural-chain-telemetry.js`. Mantém os módulos de guard puros (retornam veredictos; wiring emite) e o command fino.
- [2026-06-09] **`.aioson/**` excluído do changed-set** (`FRAMEWORK_STATE_GLOB` em git-baseline): o próprio loop escreve `progress.json`/`baseline.json`/`attempts/` durante a execução — sem a exclusão, qualquer allowlist geraria falsa violação imediata. Mesmo precedente do git ingest do neural-chain. Risco residual: agente alterar `.aioson/git-guard.json` não é detectado pelo scope guard (camada 2 `git:guard` REQ-20 cobre no pre-commit).
- [2026-06-09] **`git status --porcelain -uall`**: sem `-uall` o porcelain colapsa diretórios untracked (`?? secrets/`) e `secrets/**` não casaria — violação passaria despercebida em dir novo.
- [2026-06-09] **Reincidência de violação = 2ª no mesmo run (processo)**: contador em memória por run; 1ª violação → `cb.recordError` + rollback feedback + próxima iteração; 2ª → `circuit_state=OPEN` + `status=circuit_open` + retorno `BLOCKED/scope_violation_repeat`.
- [2026-06-09] **Valores dos presets REQ-19** (safe/builder/autopilot) definidos em `CONTRACT_PRESETS` (contract-schema.js): safe 10 steps/200k tokens/30min/20 files/1500 lines; builder 30/1M/120min/60/6000; autopilot 50/3M/360min/sem limites de diff. `BALANCED` não preenche nada (default inalterado). Explícito (inclusive `null`) sempre vence.
- [2026-06-09] **Git indisponível no preflight** → warning "scope guard inactive for this run" e loop segue sem scope guard (retrocompat: self:loop nunca exigiu git). Budget/schema seguem ativos.
- [2026-06-09] **Fonte do chars/4** (warning 3 do readiness): `executeAgent` retorna `output.trim()` completo do `execFileSync` (maxBuffer 5MB) — estimativa sobre o output bruto disponível; truncamento só ocorre acima de 5MB (estimativa honesta documentada).
- [2026-06-09] **Tokens acumulam mesmo em tentativa com violação** — o gasto já ocorreu; ordem D5 mantida para o JULGAMENTO, acumulação é registro.
- [2026-06-09] **Hook não roda quando `executeAgent` falha** (timeout/crash): o `continue` existente pula verificação e hook — âncora D5 é pós-`runVerification`. Mudanças de arquivo de tentativa aborted são detectadas no attempt seguinte (changed-set é cumulativo vs baseline).

### Decisões do @dev — Fase 2

- [2026-06-09] **Campo aditivo `run_id` em `gates/{id}.json`** (extensão do schema §2.4): suprime re-detecção do mesmo tema dentro do run (gate aprovado/pendente do run atual não re-dispara); gates de runs anteriores não suprimem — mas o baseline novo já absorve as mudanças antigas como dirty, então não há re-trigger espúrio na retomada.
- [2026-06-09] **`--force` do feature:close NÃO bypassa o gate `publish`**: o Done Gate mantém o `--force` (emergência técnica); o gate publish é decisão humana por definição — bypass anularia o propósito. Destravamento é trivial (`harness:approve`).
- [2026-06-09] **Criteria falhos (sem repeat) = feedback, não pausa**: tentativa com check falho não conta como sucesso; injeta o erro como feedback (`CRITERIA_FAILED`) e segue a iteração — alinhado ao loop de reparo existente. Repeat (2x mesma assinatura) abre o circuito como o scope repeat.
- [2026-06-09] **Detecção de gate pulada quando a tentativa já vai para rollback** (violação de escopo) — D5: arquivo fora do escopo merece rollback, não aprovação; criteria também pulados quando gate dispara (processo encerra).
- [2026-06-09] **EC-8 interpretado como "gate inexistente"**: `harness:approve` com gate id inexistente → `gate_not_found` sem efeito colateral. Approve de gate publish criado pelo `feature:close` é válido mesmo sem loop pausado (gate de comando não pausa loop).
- [2026-06-09] **REQ-20 no nível do comando** (`git-guard.js`), não na lib `git-commit-guard.js`: helper `applyActiveContractPolicy` pós-`inspectStagedChanges`, best-effort, contrato inválido ignorado (preflight do loop já bloqueia), paths `.aioson/**` isentos (estado do framework precisa ser commitável).
- [2026-06-09] **i18n**: os comandos novos usam strings inglesas diretas (sem `t()` + fallback como `harness.js`). Residual registrado para @qa decidir se exige chaves nos 4 locales antes do Gate D.

## Decisões do ciclo de correções QA (2026-06-09, C-01..C-03)

- [2026-06-09] **C-01 — descoberta de contrato ativo extraída para `src/harness/active-contract.js`**: heurística única (`progress.status in_progress|human_gate`, `last_updated` mais recente) compartilhada por `git:guard` e `self:loop`. Sem `--contract`/`--spec`, o `self:loop` descobre o contrato ativo em disco; sem contrato ativo, loga `[Harness] guardrails inactive — no harness contract loaded` (REQ-1: guard nunca desliga em silêncio). Descoberta é best-effort (try/catch) — nunca derruba o loop.
- [2026-06-09] **C-02 — governor efetivo injetado no breaker**: após validação de schema, `cb.contract.governor = resolved.governor` (presets do `contract_mode` aplicados); `maxIterations` derivado do governor resolvido no mesmo ponto (movido para depois do `resolveContract`, dentro do preflight dos guards). `check()`/`recordError()` do circuit-breaker não mudaram — leem o objeto já resolvido.
- [2026-06-09] **C-03 — camada de commit aplica só globs DECLARADOS**: `applyActiveContractPolicy` usa `contract.forbidden_files` cru (já glob-validado pelo schema), não `resolveContract().forbidden_files`. Os defaults não-removíveis continuam valendo dentro do loop (scope guard); no pre-commit pegariam mudanças humanas legítimas (lockfile após `npm install`). Segredos (`.env*`, `*.pem`, `*.key`, `secrets/**`) seguem bloqueados pela policy baseline do próprio git-guard.
- Testes novos: `QA-C-02` (preset `safe` nega no `check()` com streak pré-existente + teto 10 logado) e `QA-C-03` (lockfile humano staged não gera `contract_forbidden_file`); `QA-H-01` passou a verde. O-01..O-04 (opcionais do plano de correções) ficam para decisão do @qa.

## Residuals / follow-ups

- i18n dos comandos `harness:approve|reject|status` (ver decisão acima).
- `aioson help` não lista os comandos novos (registro feito só em `KNOWN_COMMANDS` + dispatch; help text é gerado em outra seção do cli.js — verificar no Gate D se obrigatório).
- 2 falhas pré-existentes na suíte completa (`AC-CTPK-06`) são artefato CRLF do checkout Windows (`core.autocrlf=true`) — passam em CI Linux; sem relação com esta feature.

## Edge cases handled

Ver `requirements-loop-guardrails.md` §7 (EC-loop-guardrails-1..13). Destaques: untracked em path proibido, tree sujo no preflight, rename/deleção, `allowed_files: []`, separadores Windows, timeout de verification, Ctrl+C durante HUMAN_GATE.

## Dependencies

- Reads: `harness-contract.json`, `progress.json`, `baseline.json`, estado git (porcelain), `execution_events` (agregação de token_count por slug)
- Writes: `progress.json` (estado HUMAN_GATE + pending_gate), `attempts/{n}/*`, `gates/{id}.json`, `execution_events` (eventos novos + token_count); should-have: política do git:guard em tempo de verificação

## QA Sign-off

- **Verdict:** PASS
- Date: 2026-06-09
- Re-verificação do plano de correções `corrections-2026-06-09.md`: C-01 (High), C-02, C-03 (Medium) — todas RESOLVED, cada uma com teste binário (`QA-H-01`, `QA-C-02`, `QA-C-03`) verde. Verificação independente: governor resolvido não é persistido no contrato (`CircuitBreaker._save` escreve só `progress.json`); camada de commit usa apenas globs declarados com isenção `.aioson/**` mantida; descoberta de contrato é best-effort e nunca derruba o loop.
- AC coverage: 20 REQs / 13 ECs cobertos (review completo de 2026-06-09 + re-verificação); suíte completa 3105 testes, 3102 pass, 2 fail pré-existentes (AC-CTPK-06, artefato CRLF Windows — verdes em CI), 1 skipped.
- Residual risks (Low, abertos — não bloqueiam):
  - O-01: colisão de gate id após deleção manual de arquivo de gate (perda de auditoria) — derivar id de `max(sufixos)+1`.
  - O-02: warning de falha de baseline subdeclara o que fica desativado (human-gate detection e diff limits, não só scope guard).
  - O-03: `diff.patch` omite untracked files — artefato de rollback incompleto para arquivos novos.
  - O-04: i18n dos comandos `harness:approve|reject|status` (strings inglesas diretas; chaves precisam do prefixo `cli.`) + `aioson help` não lista os comandos novos.

## Notes

- Hook de ancoragem da Fase 1: `src/commands/self-implement-loop.js`, após o verify (~linha 224) — todos os guards da Fase 1 vivem aí
- Retrocompat é REQ (REQ-loop-guardrails-11): contratos antigos válidos, `npm test` verde a cada fase
- EC-loop-guardrails-2 (path sujo proibido re-modificado) tem decisão fina pendente com @architect — mínimo aceitável: warning no preflight
- Tema `publish` é gate de comando (intercepta `feature:close`), nunca diff
