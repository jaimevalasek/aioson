---
slug: squad-local-revision
status: done
owner: dev
created_at: 2026-09-25
---

# Revisão localizada de uma sessão

## Scope
Preparar uma nova sessão com feedback para tarefas escolhidas e seus derivados, preservando a sessão aceita.

## Context selected
Session entry, plan-store, delivery-artifacts e autorun inspecionados. Secure-tdd: identificadores e referências locais validados. User autorizou implementação completa incremental.

## Implementation intelligence
Reusar acquireExecution para congelar leitura, saveSnapshot e referências por hash; sem alterar o plano original. Revisão é prepared, não executa efeitos. Dependências transitivas voltam a pending; outros resultados ficam aceitos com referência original.

## Expected paths
- behavior: src/squad/session-revision.js
- behavior: src/commands/squad-session.js
- behavior: src/commands/squad-autorun.js
- behavior: template/.aioson/docs/squad/session-operations.md
- support: .aioson/docs/squad/session-operations.md
- support: tests/squad-session-revision.test.js
- support: este plano e bootstrap/current-state.md

## Useful options considered
- Include now: feedback e escopo explícitos; original imutável; referências de saída anterior e dependências para workers; nenhum evento novo capturado pela revisão.
- Defer: diff semântico automático e backup de arquivos externos; workers devem honrar o escopo do feedback.
- Escalate: nenhum replay externo automático autorizado pela preparação.

## Verification
CLI real revisa abertura, preserva corpo e ramo independente, regenera derivado uma vez, mantém saída original e recusa sessão incompleta/artefato adulterado. Sem usar modelos externos.

## Evidências
45 testes passaram: revisão real pelo CLI encurtou abertura preservando corpo, atualizou derivado, não reexecutou ramo independente nem consumiu novo evento. Original byte a byte preservado; adulteração bloqueou fork. Sintaxe 664 arquivos; lint 1205 arquivos, zero novos.
