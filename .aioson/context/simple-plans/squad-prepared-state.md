---
slug: squad-prepared-state
status: done
owner: dev
created_at: 2026-09-25
---

# Preparação e execução observáveis

## Scope
Persistir preparação Agent Teams sem contabilizar conclusão e preservar execução real dos hooks nas plataformas suportadas.

## Context selected
Contexto e regras do incremento pipeline; handlers autorun, hook-protocol e learning inspecionados. Teste real encontrou hook ignorado no Windows na chamada via sh: o comando de negação não produzia o exit code esperado.

## Implementation intelligence
Reusar mutatePlan, STATE.md e spawnSync; shell nativo no Windows e sh no Unix. Falha de lançamento não autoriza execução. Sem serviço externo novo.

## Expected paths
- behavior: src/commands/squad-autorun.js
- behavior: src/lib/hook-protocol.js
- behavior: template/.aioson/tasks/squad-learning-review.md
- support: .aioson/tasks/squad-learning-review.md (espelho)
- support: tests/squad-autorun.test.js
- support: tests/squad-prompt-cli-reachability.test.js
- support: este plano e bootstrap/current-state.md

## Useful options considered
- Include now: prepared em plano/STATE/JSON; preparação sem hooks nem sessão concluída; shell nativo e diagnóstico de falha de lançamento; exemplos CLI reais.
- Defer: execução nativa externa e comparação de modelos exigem ambiente medido.
- Escalate: nenhuma mudança de política externa.

## Verification
Autorun e exemplos CLI com SQLite real; somente disponibilidade do host Agent Teams simulada. Hook de negação real impede worker; protocolo de hooks existente e sintaxe/lint na integração.

## Evidências
46 testes passaram; sintaxe 661 arquivos; lint 1199 arquivos, 530 baseline e zero novos. Preparação preserva eventos, tarefas pendentes e contador de sessões. Hook negado e timeout bloqueiam execução.

