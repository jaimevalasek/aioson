# Phase 4 — Implementation Plan Ownership

## Problem

O sistema exige `implementation-plan-{slug}.md` em MEDIUM, mas os arquivos discordam sobre quem deve produzir.

## Scope

- Definir ownership canonico do `implementation-plan-{slug}.md`.
- Alinhar `@pm`, SDD artifact map, handoff contract, docs e CLI.
- Garantir Gate C sem ambiguidade.

## Recommended decision

`@pm` deve ser dono do `implementation-plan-{slug}.md` em MEDIUM. `@architect` fornece decisoes tecnicas. `@orchestrator` consome o plano. `@dev` executa e registra progresso.

## Acceptance criteria

- AC-SDLC-15: `@pm` gera `implementation-plan-{slug}.md` quando a feature e MEDIUM.
- AC-SDLC-16: `artifact-map.md`, rules, docs e `handoff-contract.js` concordam sobre ownership.
- AC-SDLC-17: Gate C informa claramente se falta plano e qual agente deve produzi-lo.
- AC-SDLC-18: `@dev` nao precisa inventar plano para comecar uma feature MEDIUM.

## Implementation notes

- Candidatos: `.aioson/agents/pm.md`, `template/.aioson/agents/pm.md`, `.aioson/skills/process/aioson-spec-driven/references/artifact-map.md`, `handoff-contract.js`, `artifact-validate.js`.

## QA notes

- Testar feature MEDIUM sem implementation-plan: proximo agente deve ser `@pm`, nao `@dev`.
