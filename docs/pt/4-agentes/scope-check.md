# @scope-check (aposentado)

> Este agente foi aposentado; o trabalho dele agora vive em [@qa](./qa.md).

- **"O que foi entregue confere com o pedido?":** o `@qa` verifica scope drift (`.aioson/docs/qa/scope-drift.md`) como parte do veredito.
- **Gate automático:** o `workflow:next` roda sempre um gate de scope drift. `--scope-mode` e os modos do scope-check não existem mais.
