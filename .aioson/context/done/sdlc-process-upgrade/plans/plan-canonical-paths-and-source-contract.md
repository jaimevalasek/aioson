# Phase 1 — Canonical Paths and Source Contract

## Problem

Os agentes confundem fonte, plano operacional e documentacao. Isso permite erros como criar plano em `docs/pt/` ou tratar `plans/` root como plano real.

## Scope

- Atualizar regras/protocolos para tornar path canonical obrigatorio para agentes que criam artefatos.
- Reforcar que `plans/` root e read-only source area, exceto `plans/source-manifest.md`.
- Reforcar que `docs/pt/` e documentacao do sistema.
- Incluir `product`, `sheldon`, `pm`, `orchestrator` e `discover` no consumo do `project-map.md` ou mover a regra para rule universal.

## Acceptance criteria

- AC-SDLC-01: Quando o usuario fala "docs/pt", o agente trata como documentacao do sistema e nao cria plano operacional ali.
- AC-SDLC-02: Quando o usuario fala "plans", o agente distingue `plans/` root de `.aioson/plans/{slug}/`.
- AC-SDLC-03: Agentes que produzem artefatos consultam path map ou regra equivalente antes de escrever.
- AC-SDLC-04: `plans/` root recebe apenas fontes pre-producao e `source-manifest.md`.

## Implementation notes

- Candidatos: `.aioson/context/project-map.md`, `.aioson/rules/`, `template/.aioson/agents/*.md`.
- Sincronizar `template/.aioson/agents/` junto com `.aioson/agents/`.

## QA notes

- Criar teste textual que falha se `docs/pt` for descrito como local para planos operacionais.
- Criar teste textual que exige distincao entre `plans/` e `.aioson/plans/{slug}/`.
