---
feature: workflow-handoff-integrity
status: approved
created_by: pm
created_at: 2026-05-20
classification: MEDIUM
gate: C
gate_status: approved
---

# Implementation Plan — Workflow Handoff Integrity

## Gate C Summary

Gate A + Gate B approved. Pré-requisitos satisfeitos:
- 10 RFs formalizados (`requirements-workflow-handoff-integrity.md`)
- 44 ACs binárias entre 5 phase plans + 5 cross-cutting (44/44 cobertura — incluindo AC-F2-09/10, AC-F1-08, AC-T5-08 adicionados em Gate B)
- 5 DDs resolved em `architecture-workflow-handoff-integrity.md` § DD-01..05
- Release strategy: **progressive** (`F2 → F3 → F1 → T5 → T6` em `v1.9.5 → v1.9.6 → v1.9.7 → v1.9.8 → v1.10.0`)
- Brain sheldon-006 ★5 wiring audit codified como PMD-07 + RF-09 + BR-05 (gate hard de Gate D)
- Manifest status: `ready`

## Required Context Package (per phase)

`@dev` lê em ordem de execução:

| Phase | Files (mandatory read) |
|---|---|
| Phase 1 (F2) | plan-f2-agent-done-auto-emit.md → architecture § Phase 1 + DD-01 → `src/commands/runtime.js` (runAgentDone) → `tests/agent-runtime-alignment.test.js` (token map source for `agent-artifact-map.js`) |
| Phase 2 (F3) | plan-f3-cli-gate-pending-decisions.md → architecture § Phase 2 + DD-02 → `src/commands/workflow-next.js` (runWorkflowNext) — depende de F2 estável |
| Phase 3 (F1) | plan-f1-stale-devstate-interactive.md → architecture § Phase 3 → `src/preflight.js` + `src/commands/state-save.js` — depende de F2 estável |
| Phase 4 (T5) | plan-t5-semantic-sync-preflight.md → architecture § Phase 4 + DD-03 → `src/commands/sync-agents-preflight.js` — independente, pode paralelizar com F1 |
| Phase 5 (T6) | plan-t6-ci-smoke-pre-publish.md → architecture § Phase 5 + DD-04 → fixtures + smoke runner + CI workflow — depende de F2/F3/T5 estáveis |

Universal: `spec-workflow-handoff-integrity.md` (key decisions) + `requirements-workflow-handoff-integrity.md` (BRs/ECs).

## Pre-Taken Decisions (don't re-discuss)

Todas em [manifest 7 PMDs] + [architecture 5 DDs] + [requirements 8 BRs]. Highlights operacionais:

- **PMD-01 + DD-01:** F2 imperativo via `runAgentDone`; gating por presence de `workflow.state.json` ativo; override é `--no-auto-advance` (opt-out, não opt-in).
- **PMD-02 + DD-02:** F3 hard error (exit != 0); regex `^pending-(.+)-decisions$` + whitelist `[architect, product, pm, qa]` para warn em estados unknown.
- **PMD-03:** F1 warning acionável NUNCA cleanup silencioso. TTY interativo / non-TTY structured warning.
- **PMD-04 + DD-03:** T5 section-level + token-aware code blocks + frontmatter field-level. Skip plain text body. Warning local; hard fail em `AIOSON_PREPUBLISH=true`.
- **PMD-05 + DD-04:** T6 mock-only mode (sem LLM real); fixture greenfield fresh a cada CI run via `npm pack + aioson setup`.
- **PMD-06:** Este plan é o canonical implementation plan (AC-SDLC-15).
- **PMD-07 + BR-05:** Wiring audit doc obrigatório PRÉ-closure; sem ele Gate D blocked.
- **BR-01 idempotency:** `last_workflow_event_at` no state file; window 1s.
- **BR-03 backward-compat:** presence-detection pattern; baseline file versionado.

## Execution Sequence

| Phase | Release | Scope | Primary files (NEW marked) | Done criteria |
|---|---|---|---|---|
| 1 | v1.9.5 | F2 — agent:done auto-emit | `src/handoff-contract.js` (EXTEND with helper), `src/commands/runtime.js`, `tests/agent-done-auto-emit.test.js` ⭐NEW, `tests/baselines/agent-done-stdout.txt` ⭐NEW (✓ created in Slice 1) | AC-F2-01..10 pass + baseline locked + wiring audit § Phase 1 |
| 2 | v1.9.6 | F3 — CLI pending guard | `src/commands/workflow-next.js`, `tests/workflow-next-pending-guard.test.js` ⭐NEW | AC-F3-01..07 pass + composto F2+F3 test + wiring audit § Phase 2 |
| 3 | v1.9.7 | F1 — stale dev-state interactive | `src/preflight.js`, `src/commands/state-save.js` (extend), `tests/preflight-stale-devstate.test.js` ⭐NEW | AC-F1-01..08 pass + TTY + non-TTY both + wiring audit § Phase 3 |
| 4 | v1.9.8 | T5 — semantic sync preflight | `src/commands/sync-agents-preflight.js` (refactor), `src/lib/agent-semantic-diff.js` ⭐NEW, `tests/sync-agents-preflight-semantic.test.js` ⭐NEW | AC-T5-01..08 pass + regression guard (981a8fd-style diff caught) + wiring audit § Phase 4 |
| 5 | v1.10.0 | T6 — CI smoke pre-publish | `.github/workflows/release-smoke.yml` ⭐NEW, `scripts/smoke-run-chain.js` ⭐NEW, `tests/fixtures/medium-feature-mock/` ⭐NEW, `tests/scripts/smoke-run-chain.test.js` ⭐NEW | AC-T6-01..10 pass + workflow triggers em PR rascunho com label `release` + **cross-phase wiring audit doc completo (todas as 5 phases)** + Gate D final |

## Checkpoints (after each phase)

Antes do release de cada fase:

1. **Update `spec-workflow-handoff-integrity.md` § What was built** com decisões reais + desvios do plan.
2. **Append entry em `wiring-audit-workflow-handoff-integrity.md`:**
   - Phase X: output literal de `grep` confirmando call sites do código novo
   - Test file + test names cobrindo caminho real (não unit isolado)
   - Smoke test status (N/A para phases 1-4; PASS para phase 5)
3. **`npm test`** — toda suite passa, sem flakes.
4. **`aioson dev:state:write` + `aioson agent:done`** per CLAUDE.md convention.
5. **Manual smoke test** em fixture greenfield ANTES de `npm publish` (gate manual até T6 landar; v1.10.0+ substitui via T6 CI automation).
6. **Release flow** per memory `feedback_commit_publish_autonomy.md`:
   - Commit + push + annotated tag (autônomo após approval explícito do user)
   - `npm publish` manual (auth/2FA)
   - `project-pulse.md` update com phase done + release notes em CHANGELOG.md

Gate D fecha **incrementalmente per phase** (atualização de `## QA Sign-off` no spec); **Gate D final no v1.10.0** marca feature `done` em `features.md` + arquiva via `feature:archive`.

## Risks active during implementation

- **Risk-09 (inception, CRITICAL para Phase 1):** F2 broken hoje. Implementar F2 via cadeia AIOSON completa = recursão problemática. **Mitigação:** Phase 1 via `/deyvin` direto (continuity mode, single small batch) ou developer chamando `workflow:next` manual. Phases 2-5 podem usar cadeia normal `/dev → /qa`.
- **Risk-10 (AC GAP):** Mitigado em Gate B — 4 ACs adicionados antes de implementação.
- **Risk-11 (baseline fragility):** Mitigado por `tests/baselines/agent-done-stdout.txt` versionado em git + nota explícita em key decisions quando atualizar.

## Handoff

Implementation plan written: `.aioson/context/implementation-plan-workflow-handoff-integrity.md`
Gate C: approved
Next agent (per phase, sequential):
- **Phase 1 (v1.9.5):** `/deyvin` direto (per Risk-09 inception mitigation) OU developer manual chain
- **Phases 2-5:** `/dev → /qa` per phase, com `/committer` para release prep

**Não recomendo `/orchestrator`** — as 5 phases são sequenciais por design (DD-05 progressive release); paralelização não agrega valor e contradiz o release sequencing.

Action sugerida para próxima sessão: `/deyvin` para começar Phase 1 (F2 — `agent:done` auto-emit) trabalhando em pequenas slices validadas, atingindo v1.9.5.
