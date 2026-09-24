# @deyvin (aposentado)

> Este agente foi aposentado; o trabalho dele agora vive em [@dev](./dev.md). O alias `@pair` também aponta para `@dev`, e `--agent=deyvin` ainda resolve na CLI como `dev`.

- **Simple Plan e correções pequenas:** o `@dev` executa o Simple Plan e as correções diretas abaixo da lane (até 2 arquivos de comportamento, sem decisão pendente, verificação conhecida — sem arquivo de plano).
- **Continuidade de sessão:** retome com `@dev` (lê `dev-state` com `--context=simple-plan` e segue `.aioson/docs/dev/continuity-recovery.md`); uma ativação simples de `@dev` mantém o contexto enxuto de continuidade.
- **Sub-task scout:** agora é do `@dev` (`aioson scout:prep --parent-agent=dev`) — veja [Sub-task scout do @dev](../deyvin-subtask-scout/README.md).
