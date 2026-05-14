---
phase: 3
slug: memory-archive-with-evolution-log
manifest: .aioson/plans/active-learning-loop/manifest.md
depends_on: [telemetry-foundation]
status: done
completed_at: 2026-05-14
completed_by: dev
---

# Phase 3 — Memory Archive with Evolution Log

## Scope

Implementar `aioson memory:archive --id=<id>` como comando **tier-2 humano-acionado** que move artefatos (rules, learnings, brains) para `_archived/` e registra evento em `evolution_log` com padrão validity-window estilo Zep (start_at + end_at, append-only, nunca muta). Inclui `memory:restore` para reverter (cria novo `start_at`, preserva history).

## New or modified entities

- **Tabela `evolution_log`** (criar se não existir, ou estender):
  ```sql
  CREATE TABLE IF NOT EXISTS evolution_log (
    entry_id INTEGER PRIMARY KEY AUTOINCREMENT,
    event_type TEXT NOT NULL CHECK(event_type IN ('promoted', 'archived', 'restored', 'auto_distillation', 'distillation_failed')),
    target_type TEXT NOT NULL CHECK(target_type IN ('rule', 'learning', 'brain')),
    target_id TEXT NOT NULL,
    start_at TEXT NOT NULL,
    end_at TEXT,  -- NULL while active; set on archive/supersede
    reason TEXT,
    actor TEXT NOT NULL,  -- 'human' | 'auto' | agent_name
    feature_slug TEXT,
    payload_json TEXT
  );
  CREATE INDEX idx_evolution_log_target ON evolution_log(target_type, target_id);
  CREATE INDEX idx_evolution_log_active ON evolution_log(target_type, target_id, end_at) WHERE end_at IS NULL;
  ```
- **Comandos CLI**:
  - `src/commands/memory-archive.js` — `aioson memory:archive --id=<id> --reason="<text>" [--dry-run]`
  - `src/commands/memory-restore.js` — `aioson memory:restore --id=<id> [--reason="<text>"]`
- **Folder schema**:
  - `.aioson/rules/_archived/{YYYY-MM-DD}/{rule-slug}.md`
  - `.aioson/brains/_archived/{YYYY-MM-DD}/{brain-id}.brain.json`
  - `.aioson/context/_archived/{YYYY-MM-DD}/{learning-id}.json` (learning snapshot)
- **Tier-2 notify integration**: `aioson notify --level=warn --topic=memory --message="..."` (já existe).

## User flows covered

PRD § "Stale rule surfacing" steps 3-5 (memory:archive invocation + folder move + evolution_log record).

## Acceptance criteria

- **AC-ALL-301** (binary): `memory:archive --id=<id> --reason=<text>` move o artefato para `_archived/YYYY-MM-DD/`, define `end_at=now()` na última entry ativa de `evolution_log`, e cria nova entry `event_type='archived'`.
- **AC-ALL-302** (binary): Comando é **tier-2**: emite `notify --level=warn` antes de executar; nunca auto-executa via hook (PMD-4 / Article VII).
- **AC-ALL-303** (binary): `evolution_log` entries são append-only — nenhuma UPDATE muta `start_at` ou `reason` de entries existentes; apenas `end_at` é setado quando supersede.
- **AC-ALL-304** (binary): `memory:restore --id=<id>` move o artefato de volta + cria entry com `event_type='restored'` e novo `start_at`. History preservada (entry archived original mantém `end_at`).
- **AC-ALL-305** (binary): Integridade referencial — `dossier:link-rule` em features fechadas continua resolvível mesmo após archive (resolve via `evolution_log` join, não via filesystem).
- **AC-ALL-306** (binary): `--dry-run` flag mostra o que seria feito sem mutar disco ou DB.

## Implementation sequence

1. **@analyst** confirma schema `evolution_log` final em `requirements-active-learning-loop.md`.
2. **@dev** adiciona migration helper em `runtime-store.js` (CREATE IF NOT EXISTS para tabela + índices).
3. **@dev** implementa `src/commands/memory-archive.js` + `memory-restore.js` com:
   - Validation: `id` existe? está active? actor=human (não pode ser chamado de hook).
   - Folder move via `fs.rename` + fallback `fs.copy+unlink` para cross-drive.
   - `notify --level=warn` BEFORE execution (não block).
   - Idempotency: archive já archived → no-op com warning.
4. **@dev** registra comandos em `src/cli.js` (Brain sheldon-005 / sheldon-006).
5. **@dev** mirror `src/commands/` e `template/.aioson/context/_archived/.gitkeep` para template.
6. **@dev** i18n keys em todos os 4 idiomas.
7. **@dev** fixture `tests/memory-archive.test.js` cobrindo AC-301..306.
8. **@qa** valida edge case: restore depois de schema migration que mudou rule structure.

## External dependencies

Nenhuma. `fs.rename` + better-sqlite3.

## Notes para @dev

- Brain `sheldon-006` (design-complete ≠ execution-complete): comando deve estar em `src/cli.js` AND `template/src/cli.js`. Audit fixture em Phase 6.
- Atomicity: file move + DB update **devem** ser transacionais. Usar SQLite transaction wrapping fs.rename + INSERT.
- Caso fs.rename falhe pós-DB write: rollback transaction + log em evolution_log com event_type='distillation_failed'.
- `actor` field obrigatório — preencher com 'human' quando vier de CLI direto; agentes não podem chamar este comando.

## Notes para @qa

- Concurrency: dois `memory:archive --id=X` simultâneos → segundo retorna "already archived, no-op". Usar SQLite SELECT ... WHERE end_at IS NULL antes de DELETE.
- Restore após mudança de schema: rule archived com schema v1, restored quando rules em produção estão v2 → restore alerta usuário e cria entry com `payload_json.schema_version`.
- Dry-run: validar que zero side effects (nenhuma row inserted, nenhum file moved).

## Reference sources

- `researchs/agent-memory-backends-2026/` — Zep validity-window pattern, MNEMOS aiosqlite+WAL
- `researchs/anthropic-dreaming-2026/` — Dreaming auto-archives; AIOSON diverge para tier-2
- Internal sweep §3 — `evolution_log` existe em squad_learnings context, padrão append-only
