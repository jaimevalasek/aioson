---
phase: 2
slug: f3-cli-gate-pending-decisions
parent_manifest: .aioson/plans/workflow-handoff-integrity/manifest.md
severity: high
estimated_sessions: 1
suggested_release: v1.9.6
depends_on: [phase 1 — F2 stable]
---

# Phase 2 — F3: CLI guard recusa avançar com manifest pending

## Scope

`aioson workflow:next --complete=<agent>` lê o sheldon manifest (`.aioson/plans/{slug}/manifest.md` frontmatter) e recusa avançar se `status` matchar `pending-.*-decisions`. Mensagem de erro recomenda o agente correto.

Defesa em camadas — não substitui correção dos prompts (que continuam apontando próximo agente), mas previne deadlock observado em `aioson-com` 2026-05-19 onde `/analyst` roteou para `/dev` mesmo com manifest `pending-architect-decisions`.

## New or modified entities

Nenhuma entidade de domínio. Mudanças em código:

- `src/commands/workflow-next.js` — função `runWorkflowNext` ganha pre-check
- Manifest schema (frontmatter): documentar oficialmente `pending-architect-decisions`, `pending-product-decisions`, `pending-pm-decisions` como valores válidos de `status`

## User flows covered

- **PRD Flow 2** — Tentativa de skip de agente é prevenida pelo CLI

## Acceptance criteria

- **AC-F3-01:** `aioson workflow:next --complete=analyst` em projeto com `.aioson/plans/<slug>/manifest.md` cujo frontmatter tem `status: pending-architect-decisions` retorna exit code não-zero + mensagem stderr: `"Gate B incompleto: <slug> manifest tem status 'pending-architect-decisions'. Próximo agente recomendado: @architect."`
- **AC-F3-02 (regex generic match):** mesmo comportamento para `pending-product-decisions`, `pending-pm-decisions`, e qualquer `pending-<X>-decisions` futuro. Regex `^pending-(.+)-decisions$` captura `<X>` para uso na mensagem.
- **AC-F3-03 (override explícito):** flag `--force` em `workflow:next --complete=<agent> --force` permite avançar com manifest pending. Loga warning, não bloqueia. Para casos de emergência.
- **AC-F3-04 (no manifest case):** se manifest.md não existe (feature MICRO sem sheldon, ou início de feature), `workflow:next` segue sem o guard. Não bloqueia features que legitimamente não passam por sheldon.
- **AC-F3-05 (precedence):** guard roda ANTES da lógica existente de `workflow:next` que valida sequence + emite event. Ordem: pre-check pending → existing validation → emit.
- **AC-F3-06 (test coverage):** test em `tests/workflow-next-pending-guard.test.js` cobrindo: (a) bloqueio com pending-architect; (b) regex generic em pending-pm; (c) `--force` override; (d) ausência de manifest.
- **AC-F3-07 (wiring audit per PMD-07):** `runWorkflowNext` call sites grepados (CLI command + qualquer chamada interna pós-F2); guard ativo em TODOS os call sites.

## Implementation sequence

1. Estender `runWorkflowNext` com pre-check function `assertManifestNotPending(slug)`.
2. Implementar regex match + lookup de feature slug atual (via `workflow.state.json`).
3. Adicionar flag `--force` parsing.
4. Criar `tests/workflow-next-pending-guard.test.js` com 4 cenários AC-F3-06.
5. Atualizar documentação do CLI command (`bin/aioson.js` help) — listar nova behavior.
6. Smoke test inline: fixture com sheldon manifest pending, rodar `workflow:next --complete=analyst`, esperar exit code != 0.
7. Wiring audit: grep `runWorkflowNext` → todos call sites ativam o guard (inclui call interno de F2).

## External dependencies

- Phase 1 (F2) DEVE estar estável e released. F2 introduziu `runWorkflowNext` chamado internamente por `agent:done` — F3 guard ativa nesse caminho também.

## Notes for @dev

- DD-02 (regex vs whitelist) pertence a `@architect`. Default proposto aqui é regex genérico — espera confirmação.
- A mensagem de erro deve ser **acionável**: dizer qual agente ativar, não só "blocked". Padrão de UX já estabelecido pelo dev preflight error messages.
- Coordenar com F2: o guard deve disparar mesmo quando `runWorkflowNext` é chamado via auto-emit (F2). Test esse caminho composto.

## Notes for @qa

- Test composto F2 + F3: cadeia simulada `/analyst` termina + auto-emite via F2 + manifest pending → guard de F3 bloqueia. Cenário realista da falha original.
- Test que prova guard NÃO over-blocks: feature MICRO sem manifest → workflow:next passa.

## Phase-specific reference sources

- Briefing Theme 3 (F3) — observação original em aioson-com 2026-05-19
- PRD F3 + Sheldon R1 enrichment (regex generic)
- Plan: phase 1 (F2 dependency)
