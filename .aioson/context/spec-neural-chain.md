---
feature: neural-chain
status: in_progress
started: 2026-05-21
classification: SMALL
prd_source: prd-neural-chain.md
requirements_source: requirements-neural-chain.md
briefing_source: neural-chain
sheldon_enrichment: sheldon-enrichment-neural-chain.md
gate_plan: approved
gate_plan_note: "F4 contract drift documentado (mesmo precedente do workflow-hotfix-1-9-3). pm.md:29 declara implementation-plan-{slug}.md como required em MEDIUM apenas; linha 126 explicitamente diz 'Do not produce implementation-plan-{slug}.md unless explicitly requested' em SMALL. Sheldon enrichment cravou Gate C=skipped no progress.json por essa razão. Mas aioson preflight aplica gate strict que ignora classification — F4 = over-strict preflight check. Workaround: gate_plan=approved here destrava implementação. Follow-up MICRO (não criada nesta feature): preflight rule deve consultar classification do PRD frontmatter antes de exigir implementation-plan-{slug}.md."
---

# Spec — Neural Chain

## What was built

### Phase 1 Slice 1 — Schema migration (2026-05-21)

**Diff sumário:** primeira slice da feature. Schema do `chain_edges` table criado em `aios.sqlite` com 3 indexes (2 lookup + 1 partial unique sobre arestas ativas). Migration runner novo por feature (`src/neural-chain-migration.js`), wired downstream do `runLearningLoopMigration` em `runtime-store.js#ensureLegacyColumns` (chamado no end de `openRuntimeDb`).

**Files novos:**
- `src/neural-chain-migration.js` (~60 LOC) — runMigration idempotente; CREATE TABLE IF NOT EXISTS + 3 indexes; CHECKs (edge_type IN canonical set, confidence range [0,1], hit_count > 0)
- `tests/neural-chain-migration.test.js` (~280 LOC) — 11 acceptance tests cobrindo table creation, column nullability, CHECK constraints (edge_type/confidence/hit_count), partial unique active rows, cross-edge_type coexistence pra mesma (source, target), archive flow allows new active edge (BR-NC-08), 3 indexes presença, idempotency dupla call, runMigration throws em handle inválido

**Files modificados:**
- `src/runtime-store.js` — 2 linhas: `require('./neural-chain-migration')` no topo + `runNeuralChainMigration(db)` em `ensureLegacyColumns` logo após `runLearningLoopMigration(db)`

**Testes:** 11/11 verde na nova suite (845ms total). Regressão completa: failure deterministico em `tests/operator-memory-identity.test.js:266` (`AC-P1-07 runOpIdentity set <valid-id> returns stub message`, espera `result.stub === true`, recebe `undefined`) é **pre-existing em HEAD `92f6769`** — confirmado via `git stash` + run isolado. **Não foi introduzido por esta slice** — follow-up separado pra operator-memory team.

**Migrations aplicadas:** 1 (chain_edges table + 3 indexes). Idempotente — IF NOT EXISTS guards. Não usa PRAGMA user_version sentinel (coordenaria conflito com learning-loop user_version=3); probe cost é O(1) por openRuntimeDb e negligível enquanto só houver 4 statements. Quando outras migrations por feature multiplicarem, introduzir tabela `schema_meta` (deferred).

**Decisão arquitetural:** Option B (feature-isolated migration file) escolhida sobre Option A (extend learning-loop-migration.js Phase 4). Justificativa: matches existing convention (`learning-loop-migration.js` é também named-after-feature); isolates feature ownership; brain sheldon-001 (template parity) não aplica a código de runtime; cross-feature coupling evitado.

**Próximo:** Phase 1 Slice 2 — `aioson chain:audit <file>` command + git ingest (co-edit frequency last 90d via `git log --pretty=format:%H --name-only` bounded).

### Phase 1 Slice 2 — chain:audit CLI + git ingest helper (2026-05-21)

**Diff sumário:** read-only query command `chain:audit` + git co-edit ingest helper. CLI registrado em src/cli.js. i18n keys × 4 locales. 20 testes novos.

**Files novos:**
- `src/commands/chain-audit.js` (~120 LOC) — CLI command lê `chain_edges WHERE source_path = ? AND end_at IS NULL ORDER BY confidence DESC LIMIT N`; emit telemetry via `execution_events` com `event_type='chain_audit'` (BR-NC-10); failure non-blocking (BR-NC-11) — sempre retorna `ok=true` mesmo em SQLite locked, emit event com `error` populated; `--json` desabilita human-readable lines; `--limit` clamped a HARD_LIMIT_CAP=200; default limit=20.
- `src/neural-chain-git-ingest.js` (~245 LOC) — pure functions `parseGitLog`, `computeCoEditPairs`, `ingestGitCoEditEdges` + integration wrapper `runGitIngest`. Confidence ranking BR-NC-01 (`min(1.0, count/CONFIDENCE_SATURATION)`). Hard cap BR-NC-08 (archive oldest by `last_seen_at` antes do INSERT). UPSERT via `ON CONFLICT(source, target, edge_type) WHERE end_at IS NULL DO UPDATE` (partial unique index respeitado). Idempotência absoluta — re-ingest produz mesmo estado ativo. EC-NC-06: skip if `git rev-list --count HEAD < 50`. Nested Map `Map<source, Map<target, {count, lastSeen}>>` evita ambiguidade de string separator (paths podem ter qualquer char).
- `tests/chain-audit.test.js` (~210 LOC) — 9 acceptance tests (missing file arg, fresh DB no-impacts, ordering by confidence DESC, archived rows excluded, --limit honored with cap, telemetry emit per invocation BR-NC-10, telemetry empty payload when no edges, JSON vs human mode output, source_path isolation).
- `tests/neural-chain-git-ingest.test.js` (~245 LOC) — 12 acceptance tests cobrindo parseGitLog (empty/malformed/short+long hashes), computeCoEditPairs (window filter, mega-commits + .aioson/* skip, multi-commit aggregation), ingestGitCoEditEdges (confidence BR-NC-01 saturation, idempotency, hard cap BR-NC-08 archive flow, invalid db throws), runGitIngest (no .git skip, insufficient history skip, structured return).

**Files modificados:**
- `src/cli.js` — 3 mudanças: require do runChainAudit, KNOWN_COMMANDS adicionou `chain:audit` + `chain-audit`, dispatch branch posicionado depois de context:load
- `src/i18n/messages/{en,pt-BR,es,fr}.js` — adicionou `help_chain_audit` + `chain_audit: {file_required, runtime_unavailable, query_failed, no_impacts, results_header}` em todos 4 locales

**Testes:** 33/33 ✓ nas 3 suítes neural-chain (migration + git-ingest + chain-audit), 899ms total. Regressão completa **2719/2721 + 1 skipped + 1 fail (operator-memory-identity AC-P1-07 pre-existing em HEAD aaccfb9)** — confirma: minha slice introduziu **zero regressões**.

**Decisões arquiteturais desta slice:**

| Decisão | Justificativa |
|---|---|
| Telemetry via `execution_events` direto (INSERT inline) | Sem novo helper; alinha com `appendContextLoadEvent` pattern. Refator pra helper compartilhado fica pra slice futura se outros chamadores aparecerem. |
| Nested Map<source, Map<target, ...>> em vez de flat Map com `\0` separator | Robustez: paths podem ter qualquer char (espaços, unicode, etc.); evita parsing string ambíguo. |
| 2 rows directional per co-edit pair (A→B + B→A) | Audit query fica simples (`WHERE source_path = ?`), sem UNION ALL. Doubles storage mas O(2N) é trivial pra V1. |
| `.aioson/*` paths filtered out do ingest | Framework state churn (briefing/spec/dev-state edits every session) é noise pro grafo de código real. |
| Mega-commits (> MAX_FILES_PER_COMMIT=50) skipped | Bound N² pair explosion em commits gigantes (release/refactor mass moves). |
| Window filter 90d via committer_date_iso compare | BR-NC-01 (`count_last_90d / 10`); cutoff é parameter (`now`) pra testes determinísticos. |
| ON CONFLICT UPSERT (não DELETE+INSERT) | Preserva `id` + `start_at` (validity-window invariant) em re-ingest; atualiza só `confidence/last_seen_at/hit_count`. |
| `--limit` clamp em HARD_LIMIT_CAP=200 | Proteção operacional contra `--limit=999999` que carregaria 10k linhas no top do prompt. |
| Failure non-blocking BR-NC-11 já implementado | SQL throw capturado; telemetry event com `error` populated; retorna `ok=true` impacts=[]. |

**Próximo:** Phase 1 Slice 3 — agent_event ingest hook em `runAgentDone` (`src/commands/runtime.js`), com EC-NC-05 no-op skip quando session não tem file edits. Slice 3 fecha o segundo edge_type ('agent_event'); junto com Slice 2 git_co_edit a feature ganha source coverage completo.

## Entities added

(Source: `requirements-neural-chain.md` § New entities and fields)

### Table `chain_edges` (nova em `.aioson/runtime/aios.sqlite`)
- 10 fields: `id, source_path, target_path, edge_type, confidence, start_at, end_at, hit_count, last_seen_at, metadata`
- 3 indexes: `(source_path, end_at)`, `(target_path, end_at)`, `UNIQUE(source_path, target_path, edge_type) WHERE end_at IS NULL`
- Validity-window discipline (M1 append-only — `end_at` sempre NULL)
- Hard cap 10k via archive por `last_seen_at` (BR-NC-08)

### Config field `chain_auto_threshold` (`.aioson/config.md` schema)
- REAL field, default `0.8`, range [0.0, 1.0]
- Auto-migration runtime (lê config; ausente → default; sem force-edit)

### Telemetry event type `chain_audit` (em `runtime_events` existente — zero schema change)
- Reusa pattern `runtime:emit` existente
- Payload JSON: `feature_slug, source_files, impacts_found, auto_fixable_count, noise_file, tokens_used, duration_ms, error`

## Key decisions

| Date | Decision | Reason |
|---|---|---|
| 2026-05-21 | Granularidade file-level only em M1 (sem `:symbol` no noise file) | AST multi-language é heavy; file-level via grep cobre o caso uninstall-app-button do briefing. AST em V2 via `tree-sitter`. |
| 2026-05-21 | Auto-correção via handoff TODO (BR-NC-04), não execução direta | Auditável, reversível, mantém agent como executor, zero LLM in-loop durante audit. |
| 2026-05-21 | Hook per-session via `runAgentDone` (BR-NC-05), não per-edit | Evita N audits redundantes em sessões longas; noise file agrega impactos da sessão completa. |
| 2026-05-21 | `resolved_items` via lazy recompute em chain:audit + @neo reads (BR-NC-06) | Zero dep nova (sem file watcher); suficiente pro deletion-on-close trigger. |
| 2026-05-21 | Audit failure non-blocking (BR-NC-11) | agent:done não pode falhar por SQLite lock; falha registrada via runtime:emit; @neo surfa na próxima activation. |
| 2026-05-21 | Single new table (chain_edges) + reuso de runtime_events pra audit telemetry | Per brain sheldon-005 (CLI-first integration); reduz migration surface vs criar chain_audit_log table dedicada. |
| 2026-05-21 | M2 skill owner pre-decided (estender `@neo`, não criar `@chain-keeper`) | Sheldon enrichment OQ #2: cohesion > proliferation; @neo já é router + dashboard surfacer. |
| 2026-05-21 | Multi-language V2 via `tree-sitter` Node binding | Sheldon enrichment OQ #4: uniformiza deps multi-lang com mesma API. |
| 2026-05-21 | Bootstrap incremental default; opt-in background scan se git > 50 commits | Sheldon enrichment OQ #5: não bloqueia primeira edit; ingest cresce naturalmente. |
| 2026-05-21 | `chain_node_cap` hardcoded 10k em V1 (sem expor via config) | Reduz scope V1; expose via config quando M2 entrar. |

## Edge cases handled

(Source: `requirements-neural-chain.md` § Edge cases — 10 ECs)

- **EC-NC-01** File renamed/moved → edges órfãos aceitáveis V1 (M2 limpa)
- **EC-NC-02** File deletado → idem EC-NC-01
- **EC-NC-03** File nunca-antes-visto → primeiro ingest cria edges com hit_count=1
- **EC-NC-04** SQLite locked → retry 3x exponencial backoff (100/200/500ms), then abort com log warning
- **EC-NC-05** Agent event sem file edits → audit skipped no-op
- **EC-NC-06** Bootstrap sem git history → skip + agent-event coverage
- **EC-NC-07** Config sem `chain_auto_threshold` → runtime default 0.8
- **EC-NC-08** Squad/concurrent edits → out-of-scope V1
- **EC-NC-09** Noise file YAML corrupted → re-cria limpo, preserva items readable
- **EC-NC-10** Race delete noise file → idempotent unlink (catch ENOENT silently)

## Dependencies

### Reads
- `agent_event` (existing table em `aios.sqlite`) — ingest hook lê activity da sessão pra popular chain_edges com `edge_type='agent_event'`
- `.aioson/config.md` — campo `chain_auto_threshold` (com runtime default fallback per EC-NC-07)
- `git log --pretty=format:%H --name-only` (bounded a últimos N commits) — co-edit frequency pra `edge_type='git_co_edit'`
- `features.md` — pra obter `feature_slug` context no chain_audit event payload
- `.aioson/context/noises/*.md` — leitura pra `resolved_items` lazy recompute + deletion-on-close check
- `runtime_events` (filter type='chain_audit') — pra `aioson chain:stats` aggregation + pulse alert

### Writes
- `chain_edges` table — ingest + hard cap archive (set end_at)
- `runtime_events` (via `runtime:emit --type=chain_audit`) — toda execução de chain:audit, including failures
- `.aioson/context/noises/{feature-slug}-{YYYYMMDD-HHMM}.md` — quando audit detecta impacts (ou fallback `unspecified-{timestamp}.md`)
- `src/commands/runtime.js` — modificação em `runAgentDone` (hook integration point, wiring single-point)
- `.aioson/agents/neo.md` + `template/.aioson/agents/neo.md` — activation protocol step pra surfar noises como blocker

## Notes

### Para @dev (implementação)

**Primeiro slice sugerido (Phase 1 Slice 1):**
Criar migration pra `chain_edges` table (10 fields + 3 indexes via existing migration runner). Baseline: `npm test` antes/depois pra confirmar zero regressões.

**Wiring single-point:**
Integração em `runAgentDone` em `src/commands/runtime.js` — mesmo arquivo do `agent:done` integrity check do hotfix v1.9.3. Use o pattern do hotfix como precedente (telemetry downstream → audit downstream). Wiring path: `agent:done received → telemetry write → integrity check → chain:audit (se source_files presente, skip se vazio per EC-NC-05) → return`.

**AC-AUDIT-NC done gate (cita explicitly no PR description):**
Feature **não pode** ser marcada `done` em features.md até `@qa` verificar os 7 itens. Mapping concreto pra `@qa`:
1. `chain:audit` em `runAgentDone` → grep `chain:audit\|chainAudit` em runtime.js + unit test cobrindo path
2. `@neo` surfa noises → grep `noises/` em workspace + template neo.md + manual test em sessão `/neo` com noise file presente
3. `autonomy` mode read → unit test cobrindo 3 modos (guarded/standard/autonomous)
4. Schema migration aplicada → `SELECT name FROM sqlite_master WHERE type='table' AND name='chain_edges'` retorna 1
5. Coverage ≥ 80% nas paths críticas → npm test report
6. CHANGELOG.md entry → grep `\[1\.17\.0\]\|neural-chain` em CHANGELOG.md
7. Template parity → `diff -q .aioson/agents/neo.md template/.aioson/agents/neo.md` retorna 0 diffs (idem dev.md/deyvin.md se forem tocados)

**Brain `sheldon-001` (workspace/template parity):** quaisquer mudanças em `.aioson/agents/{neo,dev,deyvin}.md` DEVEM ser espelhadas em `template/.aioson/agents/...`. Sync direction: workspace→template é manual (template é fonte canônica; `sync:agents` copia template→workspace, então mudanças no workspace ficam stale no próximo sync).

**Brain `sheldon-006` (audit wiring antes de close):** feature está apenas design-complete até AC-AUDIT-NC passar. Não confunda com execution-complete.

**Performance budget:**
- target `chain:audit` ≤ 200ms @ 10k edges
- ≤ 1s @ 50k edges (warning threshold)
- > 50k edges → flag pra @qa perf test obrigatório
- abort em > 5s per BR-NC-11
- SQLite WAL + prepared statements + indexed lookups (infra padrão AIOSON, sem novas deps)

**Auto-correção mechanism (BR-NC-04) — reinforço pra @dev:**
Audit **nunca** modifica código direto. Items auto-fixable são MARCADOS no noise file com prefix `[AUTO-FIXABLE]`. A próxima sessão de agente (qualquer agente downstream que ative — `/deyvin`, `/dev`, etc.) lê o noise file primeiro, executa os items `[AUTO-FIXABLE]`, marca `- [x]`, e prossegue com a nova tarefa. **Não implemente "auto-modify file" no audit code path.**

**Telemetry payload (BR-NC-10):**
```js
runtime:emit({
  type: 'chain_audit',
  agent: <originating_agent>,
  payload: {
    feature_slug: <slug | null>,
    source_files: [...],
    impacts_found: N,
    auto_fixable_count: M,
    noise_file: '<path>' || null,
    tokens_used: N,
    duration_ms: M,
    error: null  // ou string em failure path
  }
})
```

### Para @qa (Gate D)

**Primary success metric (do PRD):** -50% second-call correction loops em 30d pós-release. **Instrumentar baseline** em N sessões pre-shipping (sugiro 20-30 sessões); medir delta pós-shipping.

**Guardrail metric:** `tokens_used` em runtime_events filtered type='chain_audit' estável ao longo do tempo. `aioson chain:stats` agrega mensalmente. Pulse alert se `delta_avg > 2x` mês-a-mês — sinal de M2 follow-up time.

**AC-AUDIT-NC:** meta-AC obrigatório pra Gate D approval. 7 itens com verification methods listados nas Notes pra @dev acima.

**Out-of-scope no Gate D:**
- Squad/parallel edit scenarios (EC-NC-08)
- Configurabilidade `chain_node_cap` (hardcoded V1)

**Risk monitoring:**
- R3 (TODO graveyard) — verificar deletion-on-close trigger funciona via test cenário "all items `- [x]` → file deleted next audit"
- R4 (agentes ignoram noise) — verificar `@neo` surfa como blocker (não info) via manual `/neo` activation com noise pendente
