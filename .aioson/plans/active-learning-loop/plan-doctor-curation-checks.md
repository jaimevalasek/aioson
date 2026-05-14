---
phase: 4
slug: doctor-curation-checks
manifest: .aioson/plans/active-learning-loop/manifest.md
depends_on: [telemetry-foundation, memory-archive-with-evolution-log]
status: done
completed_at: 2026-05-14
completed_by: dev
---

# Phase 4 — Doctor Curation Checks

## Scope

Adicionar 3 novos checks warning-level em `src/doctor.js` que detectam dívida de curadoria automaticamente e propõem `memory:archive`. Sem doctor proativo, telemetria de Phase 1 fica invisível e dívida acumula silenciosamente.

## New or modified entities

- **Extensão de `src/doctor.js`** com 3 funções de check:
  - `assessRuleStaleness(db, ctx)` — retorna rules com zero `rule_loaded` em últimas `N` features
  - `assessLearningOrphans(db, ctx)` — retorna learnings `status='promoted'` sem `context_load` posterior à promoção
  - `assessDistillationLag(db, ctx)` — retorna features fechadas (em `features.md` status=done) sem `evolution_log` event `auto_distillation`
- **Threshold formula** (PMD-formula): `N_features = max(5, ceil(avg_days_last_5_features / 7))`
  - Projetos low-velocity (1 feature/mês) → `N = ceil(30/7) = 5` (minimum mantido)
  - Projetos high-velocity (5 features/semana) → `N = 5` (minimum mantido)
  - Projetos médios (1 feature/semana) → `N = max(5, 1) = 5`
  - Logic: a fórmula evita que projetos lentos disparem staleness por mera passagem de calendário; a porta é "features sem load", não dias.
- **i18n keys** em `src/i18n/messages/{en,pt-BR,es,fr}.js`:
  - `doctor.living_memory.rule_staleness`, `.rule_staleness_hint`
  - `doctor.living_memory.learning_orphans`, `.learning_orphans_hint`
  - `doctor.living_memory.distillation_lag`, `.distillation_lag_hint`

## User flows covered

PRD § "Stale rule surfacing" steps 1-2 (doctor invocation, warning output).

## Acceptance criteria

- **AC-ALL-401** (binary): `living-memory:rule_staleness` warning fires para qualquer rule sem `rule_loaded` event nas últimas `N = max(5, ceil(avg_days_last_5_features / 7))` features fechadas. Hint inclui `target_id`, `last_loaded_date`, e `propose: aioson memory:archive --id=<id>`.
- **AC-ALL-402** (binary): `living-memory:learning_orphans` warning fires para learnings `status='promoted'` cuja `promoted_to` rule não tem `context_load` event posterior à promoção (rule promovida e nunca usada).
- **AC-ALL-403** (binary): `living-memory:distillation_lag` warning fires quando ≥5 features estão `status='done'` em `features.md` mas `evolution_log` não tem 5 entries `event_type='auto_distillation'` correspondentes (escape valve para hook M1 falhado).
- **AC-ALL-404** (binary): Todos 3 checks ao nível `severity='warning'`. `aioson doctor` continua retornando exit code 0 quando apenas warnings presentes (não bloqueia).
- **AC-ALL-405** (binary): `aioson doctor --json` inclui novos checks em `checks[]` com fields `id, severity, message_key, params, ok, hint_key, target_id?, propose?`.
- **AC-ALL-406** (binary): i18n keys presentes em en, pt-BR, es, fr. `aioson doctor` em projeto pt-BR mostra messages em pt-BR.

## Implementation sequence

1. **@analyst** confirma threshold formula final + edge cases em `requirements-active-learning-loop.md`.
2. **@dev** implementa 3 funções em `src/doctor.js` seguindo pattern existente (assessScoutPruning como referência, linhas 388-420).
3. **@dev** adiciona i18n keys em 4 arquivos `src/i18n/messages/*.js`.
4. **@dev** registra checks em `runDoctor()` orchestrator.
5. **@dev** mirror `src/doctor.js` e i18n para `template/src/`.
6. **@dev** fixture `tests/doctor-curation-checks.test.js`:
   - Setup: tmpdir com aios.sqlite populated (5 features, mix de rules carregadas/não-carregadas)
   - Assert: cada check fires nas condições corretas
   - Assert: i18n switching pt-BR ↔ en
7. **@qa** valida com `aioson doctor --fix` se aplicável (3 checks não são auto-fixable; --fix deve no-op com hint).

## External dependencies

Nenhuma. Tudo via SQLite query.

## Notes para @dev

- Brain `sheldon-005`: doctor checks seguem schema rígido — não inventar novo output format. Reuse `checks.push({ id, severity, key, params, ok, hintKey })`.
- Threshold formula: implementar como pure function `computeStalenessThreshold(featureCloseDates: Date[]): number` para testabilidade isolada.
- Performance: query de check deve usar `idx_execution_events_context_load` (Phase 1). Sem índice, scan é O(events). Asserts em fixture: latency p99 ≤200ms para 10k events.
- Output do hint inclui template ready-to-copy: `aioson memory:archive --id=<rule-slug> --reason="..."` para que humano só preencha o reason.

## Notes para @qa

- Test matrix:
  - 0 features fechadas → N undefined → check skipped (no warning)
  - 1-4 features fechadas → N = 5 mínimo → check usa N=5 mesmo se poucos dados
  - 5+ features fechadas → N segue formula
- Validate que warnings não causam falsos positivos em primeira sessão pós-install (zero events ainda).
- Validate i18n: rodar `LANG=pt aioson doctor` vs `LANG=en aioson doctor`.

## Reference sources

- `.aioson/brains/sheldon/architecture-decisions.brain.json` node 005
- Internal sweep §4 — doctor check pattern, src/doctor.js:273-363
- `researchs/agent-memory-backends-2026/` — staleness as production concern
