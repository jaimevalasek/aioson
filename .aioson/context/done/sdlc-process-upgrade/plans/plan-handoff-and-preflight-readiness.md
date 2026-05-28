# Phase 5 — Handoff and Preflight Readiness

## Problem

`preflight` retorna `READY` para agentes sem contexto suficiente, e `@orchestrator` nao consome todos os artefatos tecnicos necessarios.

## Scope

- Expandir readiness por agente oficial.
- Corrigir context package por agente.
- Corrigir inputs do `@orchestrator`.
- Fazer `artifact:validate` recomendar proximo agente.

## Acceptance criteria

- AC-SDLC-19: `preflight --agent=sheldon --feature=<slug>` inclui PRD e enrichment quando existir.
- AC-SDLC-20: `preflight --agent=orchestrator --feature=<slug>` bloqueia se requirements/spec/Gate C estiverem ausentes.
- AC-SDLC-21: `@orchestrator` le `requirements-{slug}.md` e corpo de `spec-{slug}.md`.
- AC-SDLC-22: `artifact:validate` mostra "next_missing" e "next_agent".
- AC-SDLC-23: Falso READY vira BLOCKED ou READY_WITH_WARNINGS.

## Implementation notes

- Candidatos: `src/preflight-engine.js`, `src/commands/preflight.js`, `src/commands/artifact-validate.js`, `.aioson/agents/orchestrator.md`.

## QA notes

- Testar preflight de `sheldon`, `pm`, `orchestrator`, `dev`, `qa`.
