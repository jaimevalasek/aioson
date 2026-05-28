# Phase 3 — State Continuity and Next Step

## Problem

O usuario abre novo chat, aciona o agente sugerido, e o sistema diz que a etapa anterior nao foi feita. Isso acontece quando handoff, features registry, workflow state, pulse e preflight discordam.

## Scope

- Definir uma fonte deterministica para "proximo agente".
- Fazer `workflow:status`, `workflow:execute --dry-run`, `preflight` e `project-pulse` concordarem.
- Detectar `dev-state.md` stale ou de outra feature.
- Melhorar mensagens finais dos agentes.

## Acceptance criteria

- AC-SDLC-10: Ao fim de cada agente, a resposta final inclui "Proximo agente", "Por que", "Artefatos criados" e "Comando/acao".
- AC-SDLC-11: Novo chat consegue retomar lendo `project-pulse.md` + `preflight`.
- AC-SDLC-12: `dev-state.md` de outra feature nao aparece como contexto ativo sem warning.
- AC-SDLC-13: Feature `in_progress` em `features.md` bate com `project-pulse.md`.
- AC-SDLC-14: Se um agente anterior realmente concluiu, o proximo agente consegue provar isso por artefato, nao por historico do chat.

## Implementation notes

- Candidatos: `src/commands/preflight.js`, `src/preflight-engine.js`, `src/commands/workflow-status.js`, `src/commands/workflow-execute.js`, `src/commands/pulse-update.js`, `src/commands/runtime.js`.

## QA notes

- Criar fixture com feature nova apos feature antiga done.
- Criar fixture com `dev-state.md` stale e garantir warning.
