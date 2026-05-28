# Phase 7 — Product and Sheldon Flow

## Problem

`@product` pode deixar registro incompleto, e `@sheldon` pode aplicar early-exit antes de selecionar o PRD alvo.

## Scope

- Corrigir RF-01 do Sheldon.
- Fortalecer update de `features.md`.
- Garantir que handoff Product -> Sheldon -> Analyst seja objetivo.
- Impedir nova feature sem resolver `in_progress`, salvo confirmacao explicita.

## Acceptance criteria

- AC-SDLC-29: `@sheldon` lista PRDs primeiro e so depois verifica status do PRD selecionado.
- AC-SDLC-30: `spec.md` project-level nao bloqueia enrichment de `prd-{slug}.md`.
- AC-SDLC-31: PRD existente fora de `features.md` gera warning e reparo sugerido, nao bloqueio automatico.
- AC-SDLC-32: `@product` sempre registra feature nova em `features.md`.
- AC-SDLC-33: Handoff do `@product` informa proximo agente e criterio de passagem.

## Implementation notes

- Candidatos: `.aioson/agents/product.md`, `.aioson/agents/sheldon.md`, templates correspondentes.

## QA notes

- Criar testes textuais para RF-01 e features registry.
