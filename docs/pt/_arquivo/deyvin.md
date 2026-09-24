# [Arquivado] Deyvin

> **Este agente foi aposentado; o trabalho dele agora vive em `@dev`.**
> O id antigo ainda resolve na CLI (`--agent=deyvin` e o alias `@pair` agem como `dev`), e `aioson update` remove os arquivos do agente aposentado.

Onde cada parte vive agora:

- **Continuidade e retomada:** uma ativação simples de `@dev` mantém o contexto enxuto de continuidade; a recuperação fica em `.aioson/docs/dev/continuity-recovery.md` e a retomada via dev-state com `--context=simple-plan`.
- **Simple Plan e correções pequenas:** o `@dev` faz correções diretas abaixo da lane (até 2 arquivos de comportamento, sem decisão pendente, verificação conhecida) sem arquivo de plano — veja `.aioson/docs/dev/simple-plan-lane.md`.
- **Scout de sub-tarefa:** agora em `.aioson/docs/dev/scout.md`, preparado com `aioson scout:prep --parent-agent=dev`.
- **Sessão viva / runtime direto:** `live:start`, `runtime:emit` e `live:handoff` com `--agent=dev`, documentados em `.aioson/docs/dev/runtime-handoffs.md`.

Ficha atual do agente: [`../4-agentes/dev.md`](../4-agentes/dev.md).
