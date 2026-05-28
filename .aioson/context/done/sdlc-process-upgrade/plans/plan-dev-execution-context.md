# Phase 6 — Dev Execution Context

## Problem

`@dev` pode iniciar perdido, seguir artefato errado ou pedir reexplicacao porque o contexto existe mas esta fraco, stale ou mal priorizado.

## Scope

- Definir precedencia entre Sheldon manifest e implementation-plan.
- Expor `active_execution_artifact` no preflight/state.
- Melhorar context package para `@dev` e `@deyvin`.
- Garantir que manifest ativo seja respeitado.

## Acceptance criteria

- AC-SDLC-24: Se `.aioson/plans/{slug}/manifest.md` existe e nao esta complete/done, ele e o artefato ativo.
- AC-SDLC-25: Se manifest ativo existe, implementation-plan e contexto auxiliar, nao guia primario.
- AC-SDLC-26: `@dev` recebe exatamente os arquivos necessarios para a fase atual.
- AC-SDLC-27: `@dev` nao reexecuta fase marcada como done.
- AC-SDLC-28: `@deyvin` segue a mesma precedencia em sessao de continuidade.

## Implementation notes

- Candidatos: `.aioson/agents/dev.md`, `.aioson/agents/deyvin.md`, `src/preflight-engine.js`, `src/commands/state-save.js`, `src/commands/implementation-plan.js`.

## QA notes

- Criar fixture com manifest ativo + implementation-plan coexistindo.
