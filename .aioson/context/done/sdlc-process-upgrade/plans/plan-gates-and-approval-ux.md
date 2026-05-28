# Phase 2 — Gates and Approval UX

## Problem

Agentes dizem que um gate precisa ser aprovado, mas nao explicam como aprovar. Isso trava o usuario entre fases.

## Scope

- Criar ou alinhar comando `aioson gate:approve`.
- Atualizar mensagens de handoff dos agentes para incluir aprovacao concreta.
- Padronizar formato machine-readable de gates.
- Corrigir docs e help.

## Acceptance criteria

- AC-SDLC-05: Quando Gate A/B/C esta pronto, o agente mostra comando exato de aprovacao.
- AC-SDLC-06: `gate:approve` falha se `gate:check` falharia.
- AC-SDLC-07: `gate:approve` atualiza `spec-{slug}.md` no formato que `gate:check`, `preflight` e handoff-contract realmente leem.
- AC-SDLC-08: Fallback manual informa arquivo, campo e valor exatos.
- AC-SDLC-09: YAML nested em `phase_gates` nao e usado como contrato se o parser nao suportar YAML nested.

## Implementation notes

- Candidatos: `src/commands/gate-check.js`, novo `src/commands/gate-approve.js`, `src/preflight-engine.js`, `src/cli.js`, i18n help.
- Atualizar `approval-gates.md` e prompts de `@analyst`, `@architect`, `@pm`, `@dev`, `@qa`.

## QA notes

- Testar Gate A/B/C com spec sem gate, pending e approved.
- Testar parser com formato flat e com formato antigo para evitar regressao silenciosa.
