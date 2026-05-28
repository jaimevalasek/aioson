# Phase 8 — Memory, Observability, Docs and Regression Tests

## Problem

Bootstrap, devlogs, runtime, brains, docs e help existem, mas nao estao completamente alinhados ou testados.

## Scope

- Completar bootstrap com quatro arquivos.
- Corrigir refresh do `@discover`.
- Validar `devlog:process` em fixture.
- Definir destino/ponte de brains/learnings.
- Atualizar help e docs depois do comportamento real.
- Criar testes de regressao para os bugs deste plano.

## Acceptance criteria

- AC-SDLC-34: Bootstrap sempre tem `what-is.md`, `what-it-does.md`, `how-it-works.md`, `current-state.md`.
- AC-SDLC-35: `@discover` refresh cria arquivos faltantes.
- AC-SDLC-36: `devlog:process` tem teste sem modificar devlogs reais.
- AC-SDLC-37: `agent:done`/`pulse:update` deixam rastreio suficiente para retomar.
- AC-SDLC-38: Help principal lista flags reais de `workflow:execute`, incluindo `--feature`.
- AC-SDLC-39: Docs so sao atualizadas apos CLI/prompts estarem alinhados.
- AC-SDLC-40: Suite de testes cobre path contract, gate approval, preflight readiness, Sheldon RF-01, plan precedence e PM ownership.

## Implementation notes

- Candidatos: `.aioson/agents/discover.md`, `src/commands/devlog-process.js`, `src/commands/runtime.js`, `src/cli.js`, i18n messages, docs finais.

## QA notes

- Rodar `npm test`.
- Rodar testes especificos de contratos textuais dos agentes.
