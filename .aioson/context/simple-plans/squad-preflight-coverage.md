---
slug: squad-preflight-coverage
status: done
owner: dev
created_at: 2026-09-25
---

# Cobertura de operações do preflight

## Scope
Fazer as operações públicas já anunciadas por @squad resolverem tarefas e módulos determinísticos no preflight (primeiro trecho do item 1.6).

## Context selected
Projeto validado; context:brief dev/executing e regras de idioma, disco, squad-driver e concisão aplicadas. Workflow onboarding preservado. Kernel e cinco tarefas canônicas inspecionados.

## Implementation intelligence
Estender o mapa existente sem adicionar novos comandos. Review/profile/decomposição são protocolos de agente com suporte CLI específico, sem inventar execução automática. Alias documentado learning review resolve explicitamente para learning-review. Testes extraem operações do kernel distribuído, verificam existência das tarefas/módulos e comandos no registro real.

## Expected paths
- behavior: src/lib/squad-preflight.js
- behavior: src/commands/squad-preflight.js
- support: tests/squad-preflight.test.js
- support: tests/squad-prompt-cli-reachability.test.js
- support: este plano, dev-state.md e bootstrap/current-state.md

## Useful options considered
- Include now: cinco operações ausentes, alias documentado, módulos mínimos, tipo de execução e suporte CLI explícitos; resumo de done sem alegar criação de agentes para qualquer operação.
- Defer: pipeline guiado e Agent Teams precisam corrigir estados de preparação em incremento próprio; pipeline também confirma handoffs prematuramente e exige regressões específicas.
- Escalate: nenhuma nova operação ou decisão de produto.

## Verification
Preflight real via CLI para operações novas e alias; comparação kernel → tarefa → módulos → registro CLI, regressões existentes, sintaxe e lint. Não executar comandos de modelos/serviços pagos.

## Entrega
- Cinco operações públicas ausentes foram adicionadas com suas tarefas canônicas e módulos mínimos. Alias `learning review` resolve para `learning-review`, preservando `requestedOperation` na resposta.
- `execution.kind`, `execution.commands` e `execution.note` distinguem protocolos guiados e autoria de tarefas do suporte CLI efetivamente disponível. O formato textual também expõe essa fronteira.
- Review/profile/learning-review/pipeline não exigem reconstruir ou avaliar o pacote inteiro como efeito colateral do preflight. A mensagem de agent:done pede resultado verificado da operação, sem afirmar que agentes foram montados em qualquer operação.
- A regressão lê a tabela pública do kernel distribuído e cruza operação/tarefa/módulos; comandos sugeridos e gates são confrontados com o registro real. CLI foi exercitado para cada operação nova e o alias, sem chamadas a modelos.

## Evidências
- Antes: teste do kernel falhava em operação pública ausente; teste de alias falhava por mapa inexistente.
- Depois: 16 testes passaram, zero falhas (`.aioson/runtime/preflight-final-tests.log`). Sintaxe: 661 arquivos. Lint: 1199 arquivos, 530 apontamentos de baseline, zero novos.

## Pendências do item 1.6
- `squad:pipeline --sub=run` consome handoffs antes da execução e informa running ao apenas orientar. Corrigir handler, evidência de conclusão e instruções canônicas juntos, com regressões de estado.
- Autorun Agent Teams precisa expor prepared em vez de sugerir execução concluída; o snapshot de eventos já não confirma consumo nessa preparação.
- O task `squad-learning-review.md` anuncia argumentos posicionais sem o path esperado pelo handler; corrigir exemplos canônicos para `aioson squad:learning . --sub=... --squad=...` e sincronizar o espelho.
- Este incremento não encerra o item 1.6 nem o ciclo completo de confiabilidade.
