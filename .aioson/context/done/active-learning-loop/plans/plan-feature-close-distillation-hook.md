---
phase: 5
slug: feature-close-distillation-hook
manifest: .aioson/plans/active-learning-loop/manifest.md
depends_on: [telemetry-foundation, memory-archive-with-evolution-log, doctor-curation-checks]
status: done
completed_at: 2026-05-14
completed_by: dev
---

# Phase 5 — Feature Close Distillation Hook

## Scope

Adicionar hook em `aioson feature:close` que orquestra a pipeline de aprendizado (`pattern:detect` → `learning:auto-promote` → write-back para `.aioson/rules/`/brains) e emite **uma única** notificação tier-2 com resumo do que aconteceu. **Esta é a integração que fecha o loop** — sem ela, todas as outras fases são primitivos sem trigger.

## New or modified entities

- **Novo módulo** `src/learning-loop-engine.js`:
  - `runDistillation(slug, options)` — orquestra pipeline, retorna `DistillationResult { promoted: [], for_review: [], merge_candidates: [], errors: [] }`
  - Reuso de `learning-evolve.js`, `learning-auto-promote.js`, `pattern-detect.js` (existentes)
- **Hook em `src/commands/feature-close.js`** após gate validation + dossier finalize:
  - Skip se `classification == 'MICRO'` (PMD-5)
  - Skip se `--no-distill` flag presente (escape valve manual)
  - Lock acquired (DD-3 decision)
  - Foreground OR background per DD-2
  - Single `notify --level=info` com summary
- **`evolution_log` events emitidos**:
  - `auto_distillation` (success) — `payload_json: { promoted_count, review_count, merge_candidate_count, duration_ms }`
  - `distillation_failed` (silent failure) — `payload_json: { error_phase, error_message }`
- **Config opcional** `.aioson/config/learning-loop.json` (template default):
  ```json
  {
    "enabled": true,
    "skip_on_classification": ["MICRO"],
    "execution_mode": "background",  // or "foreground" — DD-2
    "lock_strategy": "sqlite-row",   // DD-3
    "auto_promote_threshold": 3
  }
  ```

## User flows covered

PRD § "Closing a feature with active distillation" (6 steps, todos cobertos por esta phase).

## Acceptance criteria

- **AC-ALL-501** (binary): `aioson feature:close --slug=<X>` em feature non-MICRO dispara `runDistillation(X)` que executa `pattern:detect --feature=X` + `learning:auto-promote --feature=X` em sequência.
- **AC-ALL-502** (binary): Resultado emite **exatamente 1** notification tier-2 (`notify --level=info --topic=learning-loop`) com summary `"N promoted, M for review, K merge candidates"`. Nunca múltiplas notificações.
- **AC-ALL-503** (binary): Falha em qualquer sub-step é **silent** — `feature:close` retorna exit code 0; falha registrada em `evolution_log` com `event_type='distillation_failed'`. Best-effort (Article: Living Memory reflection never blocks workflows).
- **AC-ALL-504** (binary): Concurrency lock (DD-3 mechanism) previne double-distillation da mesma feature. Segundo invocador retorna no-op com warning.
- **AC-ALL-505** (binary): Feature com `classification: MICRO` (de `prd-{slug}.md` frontmatter) **não dispara** o hook. Validation: feature close em MICRO produces zero `evolution_log` events.
- **AC-ALL-506** (binary): Cada distillation produces 1 entry em `evolution_log` (`auto_distillation` OR `distillation_failed`) **dentro de 5s** do `feature:close` retornar. (Foreground: garantido; background: tracked via runtime:emit completion event.)

## Implementation sequence

1. **@architect resolve DD-2** (foreground vs background) e **DD-3** (lock primitive), grava em `decision-execution-mode.md` e `decision-concurrency.md`.
2. **@architect resolve DD-5** (Brain merge S1 em Phase 4 ou follow-up) — pode mudar shape de `merge_candidates` no output.
3. **@analyst** valida concurrency strategy em `requirements-active-learning-loop.md`.
4. **@dev** implementa `src/learning-loop-engine.js` reusando existing commands via internal API.
5. **@dev** adiciona hook em `src/commands/feature-close.js` (pós dossier-finalize, pre exit).
6. **@dev** cria `template/.aioson/config/learning-loop.json` default.
7. **@dev** i18n keys: `learning_loop.distillation_complete`, `.distillation_failed_silent`, `.skipped_micro`.
8. **@dev** mirror `src/learning-loop-engine.js` para `template/src/` (note: este é arquivo NOVO no `template/src/`).
9. **@dev** fixture `tests/feature-close-distillation.test.js`:
   - Setup: feature SMALL/MEDIUM com 3 learnings frequency≥3
   - Run: `feature:close --slug=X`
   - Assert: exactly 1 notify, 1 evolution_log entry, target rules created
   - Edge: simulate failure in pattern:detect → assert silent + evolution_log distillation_failed
10. **@qa** valida concurrency: spawn 2 `feature:close --slug=X` simultâneos via child_process; segundo no-ops.

## External dependencies

Nenhuma. Apenas reuso de commands existentes.

## Notes para @dev

- Brain `sheldon-003` (validator sandbox): este hook NÃO pode poluir validator context. Distillation roda DEPOIS de gate validation (validator já fez seu trabalho).
- Brain `sheldon-006` (design-complete ≠ execution-complete): wiring obrigatório — hook deve aparecer em `src/commands/feature-close.js`, NÃO ser um daemon separado.
- Concurrency: para DD-3 SQLite row strategy, considerar `INSERT OR IGNORE INTO evolution_log (...) VALUES ('auto_distillation', ..., 'in_progress')` antes de executar; commit ao final.
- Performance: distillation deve completar em <5s para 95% das features. Se exceder, `notify --level=warn`.
- Background mode (se DD-2 escolher): NÃO usar setTimeout/setImmediate de Node.js — usar child_process detached para garantir isolation. Aioson é CLI, processo pode terminar.

## Notes para @qa

- MICRO skip: criar fixture de feature MICRO + verificar zero evolution_log events.
- Notification deduplication: spawn 5 sequential `feature:close` em features distintas → 5 notifications distintas, nenhuma duplicada para mesma feature.
- Failure injection: stub `pattern:detect` para throw → verify silent failure path.
- CI compatibility: `feature:close` em CI (TTY=false, no human present) deve completar sem hang.
- Stress: 50 features fechadas em sequência rápida → all 50 distillations completam, evolution_log tem 50 entries.

## Reference sources

- `researchs/anthropic-dreaming-2026/` — Dreaming async + collective aggregation (futuro)
- `researchs/hermes-agent-architecture-2026/` — Hermes background process pattern
- Internal sweep §3 — learning-evolve.js, learning-auto-promote.js, pattern-detect.js existing
- `.aioson/docs/autonomy-protocol.md` — tier-2 notify contract
