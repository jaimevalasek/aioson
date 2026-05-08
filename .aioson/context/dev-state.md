---
last_updated: 2026-05-07
active_feature: harness-driven-aioson
active_phase: 3
next_step: "Fase 3 COMPLETA. Próxima ação: rodar @qa para Gate D contra os ACs HD-06/11/13/14/15, depois aioson feature:close . --feature=harness-driven-aioson --verdict=PASS quando aprovado."
status: ready_for_qa
---

# Dev State

**Feature:** harness-driven-aioson (reaberta 2026-05-07 após Round 2 sheldon)
**Phase:** 3 of 3 — Multi-Agent Validation Loop
**Status:** in_progress — Tarefa T4 concluída; T1 é o próximo slice
**Plan:** `.aioson/plans/harness-driven-aioson/manifest.md`
**Phase doc:** `.aioson/plans/harness-driven-aioson/plan-multi-agent-validation-loop.md`

## Tarefas residuais (Round 2 sheldon — ordem T4→T1→T3→T2→T5→T6)

- [x] **T4** — propagar AC-HD-06 para `sheldon.md` (workspace+template) — DONE 2026-05-07
- [x] **T1** — `qa.md` recomenda `@validator` quando contrato existe (cobre AC-HD-13) — DONE 2026-05-07
- [x] **T3** — `harness:validate` router + `harness:apply-validation` + `agent:prompt --headless` (AC-HD-15) — DONE 2026-05-07
- [x] **T2** — `workflow:next` direciona para `@validator` quando `progress.status==waiting_validation` (AC-HD-14) — DONE 2026-05-07
- [x] **T5** — `feature:close` consulta `progress.ready_for_done_gate` (AC-HD-11 refinado) — DONE 2026-05-07
- [x] **T6** — alinhar docs PT/EN com agentes reais — DONE 2026-05-07

## Context package (próxima sessão — @qa Gate D)

1. `.aioson/context/project.context.md`
2. `.aioson/context/done/harness-driven-aioson/prd-harness-driven-aioson.md` (12 ACs originais + AC-HD-11 refinado + AC-HD-13/14/15 novos)
3. `.aioson/context/sheldon-enrichment-harness-driven-aioson.md` (Round 2 trail)
4. `.aioson/plans/harness-driven-aioson/plan-multi-agent-validation-loop.md` — Tarefas residuais T1-T6 (todas done)

@qa deve mapear AC coverage 1:1 contra os 6 tests novos (harness-apply-validation.test.js, workflow-next-validator-routing.test.js, feature-close.test.js T5 block) + os 2 backports (qa.md handoff, sheldon.md RF-05). Quando aprovado: `aioson feature:close . --feature=harness-driven-aioson --verdict=PASS`.

## History

- 2026-05-07 T6 — done. Alinhamento de docs PT/EN com a realidade dos agentes pós-T1-T5: (1) docs/pt/4-agentes/validator.md "Saídas em disco" corrigido (era `last-handoff.json` único; agora reflete `last-validator-output.json` + `validator-runs/{ISO}.json` arquivado + `progress.json` atualizado pelo apply); (2) seção "Como rodar (modo CLI/headless)" adicionada com fluxo end-to-end de 3 passos (validate → externa LLM → apply); (3) "Handoff típico" expandido com auto-routing via workflow:next e gate em feature:close. (4) docs/pt/1-entender/mapa-do-ecossistema.md e docs/en/1-understand/ecosystem-map.md: célula do @validator atualizada (sandbox de contexto explícito + outputs reais). docs/pt/4-agentes/qa.md já estava promissivo (linha 66, 116, 122) e agora bate com a realidade — sem mudança necessária. docs/en/4-agents/README.md já listava @validator corretamente — sem mudança. Suite 2102/2105 verde — 3 falhas idênticas a HEAD; zero regressão.

- 2026-05-07 T5 — done. Adicionado Harness Done Gate em src/commands/feature-close.js (Step 0a, antes do dossier guarantee): só ativa em verdict=PASS; checa `.aioson/plans/{slug}/harness-contract.json` + `progress.json` via `readFileSafe` (consistente com o resto do arquivo, sem fs.existsSync); se contrato presente AND `ready_for_done_gate !== true` AND sem `--force` → return {ok:false, reason:'harness_done_gate_blocked', last_error, error}. Mensagem de erro inclui `progress.last_error` quando presente (formato "Cn: reason" do tradutor T3). `--force` permite override emergencial e registra `harness done gate: BYPASSED` em updates com last_error para audit trail. Verdict=FAIL skippa o gate (QA já rejeitou). Parse error em progress.json: fail-safe, registra warning em updates e procede (não bloqueia). 6 tests novos em tests/feature-close.test.js: regression sem contrato, PASS com gate=true, BLOCKED com gate=false (verifica spec.md NÃO mutado), --force bypass com audit, FAIL skip, corrupted JSON fail-safe. Suite 2102/2105 verde — 3 falhas idênticas a HEAD.

- 2026-05-07 T2 — done. (1) `runHarnessValidate` em src/commands/harness.js seta `progress.status = 'waiting_validation'` após gerar prompt do validator (com novo timestamp em last_updated). (2) `runHarnessApplyValidation` ganhou helper `clearWaitingValidationStatus(cb)` chamado após recordSuccess/recordError; reset apenas se status ainda é 'waiting_validation' (preserva 'circuit_open' setado por recordError quando error_streak_limit dispara). (3) src/commands/workflow-next.js: helper `shouldRouteToValidator(targetDir, state)` exportado — checa state.mode='feature' AND featureSlug AND contract+progress files exist AND progress.status='waiting_validation'; fail-safe em parse error retorna false (preserva fluxo padrão). (4) Em runWorkflowNext, antes de activateStage: se !requestedAgent && shouldRouteToValidator → requestedAgent='validator'. activateStage cria detour automaticamente quando explicitAgent != state.next (linha 880-896 existente — reutilizado, sem mudança). Detour preserva returnTo=state.next, então após validator o workflow volta ao agente original. 4 tests novos em harness-apply-validation.test.js (status set/clear PASS, clear FAIL non-circuit-open, preserve circuit_open). 9 tests novos em workflow-next-validator-routing.test.js (5 do helper isolado + 4 integration: routes-when-waiting, no-route-without-contract, no-route-when-in_progress, explicit-override). Decisão: test do override usa --agent=dev em vez de --agent=qa porque qa+MEDIUM+feature dispara runSecurityAudit que tem leak de async resource pré-existente em HEAD (exit 11) — confirmado via `git stash + node -e` que o exit 11 existe sem minhas mudanças. Suite total 2096/2099 verde — 3 falhas idênticas a HEAD; +13 testes adicionados sem regressão.

- 2026-05-07 T3 — done. Re-arquitetura do `harness:validate` para refletir realidade do aioson (orquestrador de prompts, não runner de LLM): (a) `agent:prompt --headless --output=<file>` em src/commands/agents.js — gera prompt sem launch de editor e sem registrar live session; quando `--output` presente, escreve em arquivo; sem `--output`, imprime em stdout; pula `bootstrapDirectAgentPrompt`. (b) `runHarnessApplyValidation` novo em src/commands/harness.js — consome JSON do @validator de qualquer fonte (default `.aioson/plans/{slug}/last-validator-output.json` ou `--input=<path>`), valida schema (validateValidatorOutput helper), traduz primeira falha para `progress.last_error` no formato `"<id>: <reason>"` (translateValidatorOutputToLastError helper), chama `cb.recordSuccess()` ou `cb.recordError(msg)` conforme overall_score, arquiva input em `validator-runs/<ISO-stamp>.json` após consumo (skipável via `--archive=false` / `archive: false`). (c) `runHarnessValidate` refatorado como router: se `last-validator-output.json` existe → delega para apply-validation; senão → invoca `runAgentPrompt` headless, escreve `validator-prompt.txt`, imprime instruções de 3 passos. (d) Validator adicionado a AGENT_DEFINITIONS + MANAGED_FILES (src/constants.js). (e) CLI: `harness:apply-validation` registrado em src/cli.js (require + known-commands + dispatch). 16 tests novos em tests/harness-apply-validation.test.js cobrindo helpers, PASS, FAIL, missing input, invalid JSON, invalid schema, --input override, archive opt-out, router-no-output (gera prompt), router-with-output (consome). 2 tests novos em tests/agents-command.test.js cobrindo --headless --output e --headless sem output. Suite total 2083/2086 verde — 3 falhas pré-existentes idênticas a HEAD; +18 testes adicionados sem regressão.

- 2026-05-07 T1 — done. Adicionou bloco "Recommend `@validator`" em "Specialized agent triggers" e linha em "Recommended next agents" do qa.md (workspace+template). Trigger: `.aioson/plans/{slug}/harness-contract.json` exists AND verdict trending PASS. Mensagem template referencia schema em `.aioson/docs/sheldon/harness-contract.md`. CLI invocation `aioson agent:invoke validator . --feature={slug}` adicionada à nota CLI compartilhada com pentester. Drift conhecido em "Feature closure" (workspace usa `aioson feature:close`, template usa manual edit) NÃO tocado — reconhecido pelo brain sheldon-001 como legitimate preexisting diff. Sizes: workspace 19637→20338 (+701), template 19228→19937 (+709). Suite: 2065/2068 verde — zero regressão (3 falhas idênticas a HEAD). sync-agents-preflight verde (## Feature dossier section em paridade preservada). docs/pt/4-agentes/qa.md já promete o handoff (gap-1 da auditoria fechado nesta T1).

- 2026-05-07 T4 — done. Propagou AC-HD-06 para sheldon.md (workspace+template em paridade total). Adicionou seção `## Harness contract generation (RF-05) — MEDIUM only` com trigger compacto + referência on-demand para `.aioson/docs/sheldon/harness-contract.md`. Doc novo (criado em workspace+template) detalha: when-to-run gate por classification, populate criteria binary vs advisory, contract_mode/governor selection por risk surface, schemas canônicos de harness-contract.json + progress.json, failure modes. Backportou ao mesmo tempo 2 enhancements workspace-only (RF-01 expandido + done/MANIFEST.md em Required input) ao template — drift identificado via diff antes do edit; fix preventivo dado brain sheldon-001 q=5 (sync template→workspace apaga workspace-only changes). Adicionou `.aioson/docs/sheldon/harness-contract.md` em `MANAGED_FILES` (src/constants.js). Sheldon size: 11804→13342 bytes (sob 15K target). Suite: 2065/2068 verde — 3 falhas pré-existentes confirmadas em HEAD (test 10 product/dev kernel size pré-existente; 2 tests json-schema também pré-existentes). Zero regressão.

## Files modified this session (T5 + T6)

**T5 (Harness Done Gate em feature-close):**
- `src/commands/feature-close.js` (modified — adicionado Step 0a entre validação e dossier guarantee; readFileSafe consistente; --force flag; fail-safe em parse error)
- `tests/feature-close.test.js` (modified — +6 tests T5: regression sem contrato, PASS com gate, BLOCKED, --force, FAIL skip, corrupted JSON)

**T6 (alinhamento de docs):**
- `docs/pt/4-agentes/validator.md` (modified — Saídas em disco corretas + nova seção "Como rodar (modo CLI/headless)" + Handoff típico expandido)
- `docs/pt/1-entender/mapa-do-ecossistema.md` (modified — célula @validator atualizada)
- `docs/en/1-understand/ecosystem-map.md` (modified — célula @validator atualizada)

## Files modified previous sessions (T2)

- `src/commands/harness.js` (modified — set `waiting_validation` em validate, helper `clearWaitingValidationStatus` em apply-validation)
- `src/commands/workflow-next.js` (modified — `shouldRouteToValidator` helper exportado + injeção do override de requestedAgent antes de activateStage)
- `tests/harness-apply-validation.test.js` (modified — +4 tests para status state machine)
- `tests/workflow-next-validator-routing.test.js` (new — 9 tests de routing)
- `.aioson/context/bootstrap/current-state.md` (modified — 2 entries append-only)
- `.aioson/context/dev-state.md` (este arquivo)

## Files modified previous sessions (T3)

- `src/commands/agents.js` (modified — `--headless` flag + opcional `--output=<file>`; pula bootstrap; novo campo `headlessOutputPath` no return)
- `src/commands/harness.js` (rewritten — `runHarnessApplyValidation` novo + `validateValidatorOutput` + `translateValidatorOutputToLastError` + `runHarnessValidate` virou router; init mantido idêntico)
- `src/cli.js` (modified — require runHarnessApplyValidation + registro `harness:apply-validation` em known-commands + dispatch)
- `src/constants.js` (modified — `validator` adicionado a AGENT_DEFINITIONS + `.aioson/agents/validator.md` em MANAGED_FILES)
- `tests/harness-apply-validation.test.js` (new — 16 tests cobrindo helpers, apply (PASS/FAIL/erros), router (no-output/with-output))
- `tests/agents-command.test.js` (modified — +2 tests para `--headless --output` e `--headless` standalone)
- `.aioson/context/bootstrap/current-state.md` (modified — 3 entries append-only)
- `.aioson/context/dev-state.md` (este arquivo)

## Files modified previous sessions (T1)

- `.aioson/agents/qa.md` (modified — bloco @validator em Specialized triggers + linha em Recommended next agents)
- `template/.aioson/agents/qa.md` (modified — paridade idêntica nas seções não-conflitantes; "Feature closure" drift preservado)

## Files modified previous sessions (T4)

- `.aioson/agents/sheldon.md` (modified — RF-05 compact + RF-01 expansion já presente)
- `template/.aioson/agents/sheldon.md` (modified — paridade idêntica + backport RF-01 expansion + done/MANIFEST.md)
- `.aioson/docs/sheldon/harness-contract.md` (new — full procedure on-demand, ~3.5KB)
- `template/.aioson/docs/sheldon/harness-contract.md` (new — paridade idêntica)
- `src/constants.js` (modified — adicionou .aioson/docs/sheldon/harness-contract.md em MANAGED_FILES)
- `.aioson/context/bootstrap/current-state.md` (modified — append-only entry sob "What the system already has")
- `.aioson/context/dev-state.md` (este arquivo — reset para harness-driven-aioson)

## Recommended commit before next session (T4)

```
git add .aioson/agents/sheldon.md \
        template/.aioson/agents/sheldon.md \
        .aioson/docs/sheldon/harness-contract.md \
        template/.aioson/docs/sheldon/harness-contract.md \
        src/constants.js \
        .aioson/context/bootstrap/current-state.md \
        .aioson/plans/harness-driven-aioson/plan-multi-agent-validation-loop.md \
        .aioson/context/done/harness-driven-aioson/prd-harness-driven-aioson.md \
        .aioson/context/sheldon-enrichment-harness-driven-aioson.md \
        .aioson/context/features.md \
        .aioson/brains/_index.json \
        .aioson/brains/sheldon/architecture-decisions.brain.json \
        .aioson/context/dev-state.md
```

Mensagem sugerida:
- `feat(harness-driven-aioson): T4 — sheldon.md generates harness-contract.json on MEDIUM (AC-HD-06)`
