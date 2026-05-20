---
phase: 4
slug: t5-semantic-sync-preflight
parent_manifest: .aioson/plans/workflow-handoff-integrity/manifest.md
severity: medium
estimated_sessions: 1-2
suggested_release: v1.9.8
depends_on: []
---

# Phase 4 — T5: `sync-agents-preflight` estende check semântico

## Scope

Estender `src/commands/sync-agents-preflight.js` (introduzido em `ca15f55`) para detectar divergência semântica entre `template/.aioson/agents/<agent>.md` e `.aioson/agents/<agent>.md`, além do check atual de `## Feature dossier` length.

**Causa-raiz que motivou:** migração `981a8fd` (v1.9.0) atualizou workspace `pm.md` mas não template. `sync-agents-preflight.js` existente passou silenciosamente porque só checa `## Feature dossier`. Resultado: deadlock em `aioson-com` v1.9.2.

## New or modified entities

Nenhuma entidade de domínio. Mudanças em código:

- `src/commands/sync-agents-preflight.js` — estender check
- Possivelmente novo `src/lib/agent-semantic-diff.js` (helper isolável)
- `.github/workflows/*.yml` — adicionar invocation em pipeline (se ainda não invocado)

## User flows covered

- **PRD Flow 4** — CI rejeita publish com drift estrutural (parte da defesa em camadas)

## Acceptance criteria

- **AC-T5-01 (semantic diff scope):** check compara entre workspace e template:
  - todos os headers `##` e `###` (presença + ordem)
  - blocos de código (verbatim) que contenham strings testáveis (tokens listed em `tests/agent-runtime-alignment.test.js`)
  - frontmatter (campos canônicos)
- **AC-T5-02 (warn vs fail):** comportamento varia por mode:
  - **local mode** (rodando em dev workstation): warning informativo, não bloqueante (exit 0)
  - **CI mode** (env var `CI=true`): warning ainda não bloqueante POR DEFAULT
  - **pre-publish mode** (env var `AIOSON_PREPUBLISH=true`, setado pelo T6 workflow): hard fail, exit != 0
- **AC-T5-03 (exclusion list):** seções explicitamente excluídas do check (variantes legítimas entre workspace e template): nenhuma por default; lista configurável em `.aioson-sync-ignore.yml` se precisar. v1: lista vazia.
- **AC-T5-04 (signal richness):** quando detecta divergência, output indica:
  - arquivo divergente
  - tipo de divergência (header missing, code block changed, frontmatter mismatch)
  - linha aproximada
  - sugestão de ação ("propagate? `cp <source> <target>`")
- **AC-T5-05 (test coverage):** test em `tests/sync-agents-preflight-semantic.test.js` cobrindo: (a) workspace e template idênticos → green; (b) header missing no template → warning detectado; (c) code block diff → warning; (d) frontmatter mismatch → warning.
- **AC-T5-06 (regression guard):** test que injeta um diff conhecido (similar a 981a8fd) e prova que check pegaria. Repro do bug histórico.
- **AC-T5-07 (wiring audit per PMD-07):** confirmar que pipeline CI atual chama o script estendido em algum ponto.
- **AC-T5-08 (missing template file detection):** `template/.aioson/agents/<X>.md` removido enquanto `.aioson/agents/<X>.md` ainda existe (drift inverso) → categorizado como "missing template file" warning de severidade média (não fail bloqueante, exceto em pre-publish mode). Test: fixture remove template file → script reporta missing template + sugere `git add template/.aioson/agents/<X>.md` OR remoção do workspace correspondente. (Adicionado por @architect Gate B per Q11 analyst.)

## Implementation sequence

1. Refatorar `sync-agents-preflight.js` para ter check pluggable architecture (current dossier check vira plugin entre outros).
2. Implementar semantic diff helper isolável.
3. Adicionar header diff check.
4. Adicionar code block diff check (token-aware).
5. Adicionar frontmatter check.
6. Adicionar mode detection (local / CI / pre-publish) com env vars.
7. Tests AC-T5-05 + regression guard AC-T5-06.
8. Wiring audit: confirmar CI workflow chama o script.

## External dependencies

- Phase 1 (F2) NÃO é dependency — T5 pode rodar em paralelo a F2/F3 se priorizado, desde que F2 esteja released antes. Recomendação: ordem default `F2 → F3 → F1 → T5 → T6` para minimizar concorrência.
- Phase 5 (T6) depende parcialmente de T5: smoke test pre-publish pode usar T5 como uma de suas checks.

## Notes for @dev

- DD-03 (token-by-token vs section-level vs hash) é decisão de `@architect`. Default proposto: section-level + token-aware code blocks. Espera confirmação.
- NÃO bloquear development. T5 é defesa estrutural — útil mas não pode adicionar fricção a workflow normal de dev.
- Manter check atual de `## Feature dossier` length funcionando (compatibilidade). Adicionar checks novos, não substituir.

## Notes for @qa

- Regression test AC-T5-06 é crítico: injetar diff que reproduza 981a8fd → check pega. Sem isso, T5 pode passar mas falhar em catch real.
- Test que prova local mode é não-intrusivo: rodar script em workspace clean, exit code 0, output minimal.

## Phase-specific reference sources

- Briefing G13 (gap original — sync-agents-preflight só checa Feature dossier)
- PRD T5 must-have
- `src/commands/sync-agents-preflight.js` (código atual)
- Commit `ca15f55` (Phase 4 chain-continuity — introduziu o script atual)
- `tests/agent-runtime-alignment.test.js` (tokens canônicos a proteger)
