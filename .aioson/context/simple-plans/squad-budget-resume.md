---
slug: squad-budget-resume
status: done
owner: dev
created_at: 2026-09-24
classification: MICRO
risk: medium
source: direct-user-request
---

# Squad — pausa por orçamento e retomada

## Scope
Aplicar orçamento estimado por tarefa/sessão antes de cada tentativa, persistir pausa retomável e apresentar resultado parcial verdadeiro (item 1.4).

## Context selected
Contexto validado e context:brief dev/executing. Regras disk-first, output-brevity, source-code-language e fronteira squad-driver já carregadas. Revisão do Squad, plano de confiabilidade e incrementos 1.1–1.3 concluídos; workflow onboarding preservado.

## Implementation intelligence
Reusar mutatePlan e exclusão da sessão para contadores persistidos. Hook opcional no worker-runner cobre tentativas internas e handlers especiais. O runner não fornece uso autenticado do provider; manter measured_tokens=null e explicar estimativa/reserva por despacho. Limite é uma barreira de admissão estimada, não teto financeiro. Consulta de status lê o mesmo plano, sem gravar. Nenhuma dependência nova.

## Expected files
- behavior: src/squad/execution-budget.js (novo)
- behavior: src/commands/squad-autorun.js
- behavior: src/worker-runner.js
- behavior: src/commands/squad-status.js
- support: tests/squad-autorun.test.js
- support: tests/squad-status-command.test.js
- support: este plano e dev-state.md

## Done criteria
Limites zero/por tarefa/sessão respeitados antes do despacho; configuração inválida não desativa orçamento. Pausa não vira skipped nem sucesso. Saldo sobrevive à retomada. Concluídas não repetem; pausa durante revisão/votação preserva candidatos já produzidos. Retry e ondas paralelas não ultrapassam reservas. JSON/texto/status mostram causa e estimativa, com medição indisponível explícita. Skipped legado por orçamento recupera; skipped intencional permanece.

## Useful options considered
- Include now: reserva persistida por tentativa, histórico legado rotulado como incompleto, checkpoints de revisão/votação, status de sessão na consulta existente.
- Defer: medição de provider inexistente, novo modelo de preços, daemon, novos comandos e interface (demais incrementos).
- Escalate: nenhuma decisão de produto necessária; compatibilidade permanece aditiva.

## Verification
node --require ./tests/setup/windows-fs-retries.js --test --test-concurrency=4 tests/squad-autorun.test.js tests/squad-status-command.test.js tests/squad-worker.test.js
CLI real com pausa/retomada e contagem de efeitos. Sintaxe/lint; ampliar aos consumidores de runner se necessário.

## Session state
Concluído. action_on_exceed=abort interrompe a invocação e conserva trabalho; pause também termina de forma retomável. Retomar a mesma sessão não zera consumo; alterar o orçamento explicitamente é necessário quando o saldo continua insuficiente.

## Entrega e evidências
- execution-budget.js usa mutatePlan para reservar estimativas antes de cada tentativa de worker. Limites por tarefa e sessão incluem tentativas internas, gap closure, instâncias de votação e revisor (cobrado à tarefa principal). Não se mantém transação durante execução.
- plan.json preserva budget_state e execution_status. paused_budget conserva pendências e o motivo; resume via --plan mantém saldo e resultados concluídos. Contadores inválidos falham explicitamente.
- Limite zero bloqueia despacho. Null/ausência preserva a configuração ilimitada dos scaffolds existentes; número negativo/tipo inválido não desativa orçamento. Fallback para manifest legado somente quando o canônico não existe.
- Resume de revisão reaproveita artefato do gerador. Resume de votação reaproveita candidatos já executados. Checkpoints em result.budget_resume evitam repetição do trabalho confirmado durante uma pausa normal.
- Skipped legado com skip_reason=budget_exceeded recupera para pending; skipped intencional permanece. Histórico anterior sem budget_state é reconstruído de maneira aproximada, com history_complete=false.
- budget_used permanece como campo compatível de estimativa; budget_usage explicita accounting=estimated_dispatch_reservations, measured_tokens=null e measurement=unavailable. Reservas não são fatura. Payload enviado ao runner compõe a estimativa, com overhead fixo; saída real e operações internas de providers não são medidas. Cache/handlers especiais podem consumir menos que o reservado.
- squad:status expõe autorun_sessions lendo o mesmo plano sem alterá-lo. Sucesso da consulta (ok=true) não significa sucesso de execução; status=paused_budget permanece explícito. JSON e texto mostram motivo/limite/retomada.
- STATE.md não registra pausa como sessão concluída; retomadas sem trabalho não duplicam contadores. Projeção histórica continua separada do plano; consolidação das fontes de progresso pertence ao ciclo 2.
- CLI real: pausa retorna exit 1, zero concluídas e medição indisponível; limite ajustado retoma a mesma sessão e retorna exit 0 com efeito único.
- Suíte ampliada: 595 testes passaram, zero falhas/skips (`.aioson/runtime/squad-budget-suite.log`). Depois do ajuste final de STATE.md: 61 testes focados passaram (`.aioson/runtime/squad-budget-final-tests.log`).
- Sintaxe: 660 arquivos. Lint: 1197 arquivos, 531 apontamentos de baseline e zero novos. git diff --check sem erros. Ambiente Windows, sem APIs pagas, publicação ou escrita em projetos consumidores.

## Limites e próximo incremento
O controle cobre o despacho real pelo runner legado. Agent Teams permanece preparação guiada; medição e imposição de teto pelo provider não foram adicionadas. Hooks e confirmação de eventos precisam de suas próprias garantias de efeito e recuperação; item 1.5 é o próximo incremento. Interrupção abrupta mantém reservas conservadoras e tarefas em execução exigem a reconciliação prevista no item 1.1. Não é prometida execução exatamente uma vez de efeitos externos.
