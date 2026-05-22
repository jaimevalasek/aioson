---
slug: neural-chain
classification: SMALL
status: in_progress
created_at: 2026-05-21
created_by: analyst
prd_source: prd-neural-chain.md
briefing_source: neural-chain
sheldon_enrichment: sheldon-enrichment-neural-chain.md
---

# Requirements — Neural Chain (impact-aware code editing)

## Feature summary

Camada de awareness estrutural sobre código que detecta impactos cross-file (events, listeners, hooks, classes, tests) ao fim de cada sessão de agente editor, materializando saída dupla — auto-fixable TODOs marcados no noise file + items abertos pra revisão humana, com deletion-on-close automática — pra prevenir o anti-padrão "fiz mudança → bug silencioso → segunda chamada pra correção" documentado no caso uninstall-app-button do briefing.

## New entities and fields

### Table: `chain_edges` (nova em `.aioson/runtime/aios.sqlite`)

| Field | Type | Nullable | Constraints |
|-------|------|----------|-------------|
| id | INTEGER PK | no | autoincrement |
| source_path | TEXT | no | path relative to project root, file-level granularity |
| target_path | TEXT | no | path relative to project root, file-level granularity |
| edge_type | TEXT | no | CHECK IN ('git_co_edit', 'agent_event') |
| confidence | REAL | no | 0.0 ≤ x ≤ 1.0; per BR-NC-01 |
| start_at | TEXT | no | ISO 8601 datetime; validity-window start |
| end_at | TEXT | yes | NULL = active; M1 sempre NULL (sem M2 pruning) |
| hit_count | INTEGER | no | DEFAULT 1; incrementa em ingest subsequente do mesmo combo |
| last_seen_at | TEXT | no | ISO 8601 datetime; atualizado em todo hit |
| metadata | JSON | yes | optional (e.g., `commit_sha` p/ git_co_edit; `agent_event_id` array p/ agent_event) |

**Indexes:**
- `idx_chain_edges_source ON (source_path, end_at)` — query path do chain:audit on source-side edits
- `idx_chain_edges_target ON (target_path, end_at)` — reverse query pra impact propagation
- `uniq_chain_active ON (source_path, target_path, edge_type) WHERE end_at IS NULL` — uniqueness só em arestas ativas (permite archive via end_at preserving history)

### Config field: `chain_auto_threshold` em `.aioson/config.md` schema

REAL, default `0.8`, range [0.0, 1.0]. Usado por BR-NC-02 regra (c). Auto-migration runtime: se ausente em config legado → usa default sem force-edit do config.md.

## Changes to existing entities

### Table `agent_event` em `aios.sqlite` (existing)
**No schema change.** Edges são **derivadas** de agent_event reads — não modificação. Ingest hook em `runAgentDone` lê agent_event rows da sessão corrente (source_files do agente) e popula `chain_edges` com `edge_type='agent_event'`.

### Table `runtime_events` em `aios.sqlite` (existing)
**No schema change.** Audit telemetry reusa o pattern existente `runtime:emit` com novo `event_type='chain_audit'`. Payload JSON:
```json
{
  "feature_slug": "string | null",
  "source_files": ["string"],
  "impacts_found": "integer",
  "auto_fixable_count": "integer",
  "noise_file": "string | null",
  "tokens_used": "integer",
  "duration_ms": "integer",
  "error": "string | null"
}
```

### Config `.aioson/config.md` schema
**Add field** `chain_auto_threshold: 0.8`. Auto-migration runtime (não força edit em legacy).

### `runAgentDone` em `src/commands/runtime.js`
**Add hook:** após registrar agent:done telemetry, executar `chain:audit` **síncrono** pra sessão corrente (todos file edits aggregated). Bloqueia agent:done completion até audit terminar (target ≤ 200ms; abort se > 5s per BR-NC-11). Mesma file que tem o `agent:done` integrity check do hotfix v1.9.3 — wiring single-point.

### `@neo` agent (`.aioson/agents/neo.md` + `template/.aioson/agents/neo.md`)
**Add activation step:** leitura de `.aioson/context/noises/*.md` pendentes. Surfar count + paths no dashboard como **blocker** (mesmo nível do harness contract section já existente). Sync template per brain sheldon-001 (workspace + template).

## Relationships

| Entity A | Relation | Entity B | Cardinality | Nature |
|---|---|---|---|---|
| `chain_edges` | derived-from | `agent_event` (existing) | many edges per agent session | logical (no FK) |
| `chain_edges` | references | filesystem paths (source_path, target_path) | many edges per file | logical |
| `runtime_events` (type=chain_audit) | reports-on | `chain_edges` (impacts query) | one event per audit run | logical |
| `runtime_events` (type=chain_audit) | references | `features.md` row (feature_slug) | many events per feature | logical |
| `noises/*.md` files | linked-from | `runtime_events.payload.noise_file` | one file per audit (or NULL) | filesystem ↔ logical |
| Auto-fixable TODO items | handoff-to | next agent session | many items per noise file | content-based handoff (BR-NC-04) |

Multi-table FKs são fracas e derivadas. AIOSON não usa FKs em runtime sqlite (pattern do discovery.md).

## Migration additions (ordered)

1. `CREATE TABLE chain_edges (...)` (campos per § New entities)
2. `CREATE INDEX idx_chain_edges_source ON chain_edges(source_path, end_at)`
3. `CREATE INDEX idx_chain_edges_target ON chain_edges(target_path, end_at)`
4. `CREATE UNIQUE INDEX uniq_chain_active ON chain_edges(source_path, target_path, edge_type) WHERE end_at IS NULL`

Migration entry novo no diretório de migrations existente (@dev confirma exact path no slice 1). Single migration file — feature inteira é 1 nova table + 3 indexes.

## Business rules

### BR-NC-01 — Confidence ranking
- `git_co_edit`: `confidence = min(1.0, co_edit_count_last_90d / 10)` — saturação em 10 co-edits
- `agent_event`: `confidence = min(1.0, event_link_count_last_30d / 5)` — saturação em 5 hits
- Combinação quando ambos os tipos existem para mesmo `(source, target)`: reportar **`max(c_git, c_event)`** — não soma; evita double-count entre fontes

### BR-NC-02 — Threshold rules para `autonomy: standard`
Aresta marcada como **auto-fixable** IF qualquer uma:
- **(a)** target é teste com filename matching módulo source (`foo.test.js` ↔ `foo.js`, `foo.spec.ts` ↔ `foo.ts`, `test_foo.py` ↔ `foo.py`)
- **(b)** target contém string literal igual a identifier removido/renomeado em source (listener literal match via grep sobre o diff)
- **(c)** `confidence > chain_auto_threshold` AND `edge_type = 'agent_event'` AND `hit_count > 5`

### BR-NC-03 — Autonomy mode semantics
- **`guarded`**: BR-NC-02 ignorado; **nenhum** item marca auto-fixable; todos viram noise pra revisão manual
- **`standard`**: BR-NC-02 aplicado; matches → marcados `[AUTO-FIXABLE]` no noise file; restante → noise normal
- **`autonomous`**: BR-NC-02 aplicado + items abaixo do threshold também marcam `[AUTO-FIXABLE-BEST-EFFORT]` no noise file

### BR-NC-04 — Auto-correção via handoff TODO (não execução direta)
Audit **nunca modifica código diretamente**. Em vez disso:
1. Itens marcados como auto-fixable recebem prefix `[AUTO-FIXABLE]` (ou `[AUTO-FIXABLE-BEST-EFFORT]` em modo `autonomous`) no noise file
2. **Próxima sessão de agente** (ou continuação via `/deyvin`) lê o noise file ANTES de prosseguir com nova tarefa
3. Agente executa items `[AUTO-FIXABLE]` primeiro (mecanicamente, lendo motivo); marca `- [x]` ao completar
4. Items não-auto-fixable ficam abertos pra revisão manual humana

**Justificativa:** auditável (markdown legível), reversível (não modifica código direto), separation of concerns (audit ≠ execução), zero LLM in-loop em audit.

### BR-NC-05 — Hook granularidade temporal (per-session)
`chain:audit` roda **uma vez por sessão de agente** via `runAgentDone`, agregando todos os edits da sessão. **Não há hook per-edit individual em M1.** Justificativa: evita N audits redundantes em sessões longas; noise file agrega impactos da sessão completa.

### BR-NC-06 — Noise file lifecycle
- **Path:** `.aioson/context/noises/{feature-slug}-{YYYYMMDD-HHMM}.md`
- **Fallback:** `.aioson/context/noises/unspecified-{timestamp}.md` quando edit acontece fora de feature ativa
- **Frontmatter:** `slug, edit_at, autonomy_mode, source_files, total_items, resolved_items`
- **Items:** markdown checkboxes — `- [ ]` (pending) ou `- [x]` (resolved)
- **Auto-fixable items** carry prefix `[AUTO-FIXABLE]` ou `[AUTO-FIXABLE-BEST-EFFORT]`
- **`resolved_items` no frontmatter**: lazy-recomputado toda vez que `chain:audit` ou `@neo` lê o arquivo (no file watcher, no nova dep)
- **Deletion-on-close trigger:** quando todos items `- [x]` OR body sem items pendentes → sistema deleta o arquivo automaticamente no próximo audit/@neo read (idempotent unlink — EC-NC-10)

### BR-NC-07 — Validity-window discipline
- `start_at` setado no primeiro ingest do combo `(source_path, target_path, edge_type)`
- `end_at` **NULL em M1** (append-only); reservado pra M2 pruning futuro
- `hit_count` incrementa em ingest subsequente do mesmo combo; `last_seen_at` atualiza

### BR-NC-08 — Hard cap enforcement (10k por nó)
No ingest, se `(SELECT count(*) FROM chain_edges WHERE source_path = ? AND end_at IS NULL) >= 10000`:
1. Encontrar oldest active edge by `last_seen_at` ASC (com `source_path = ?`)
2. Set `end_at = now()` (archive — preserva history via validity-window)
3. Insert new edge

Cap value (`10000`) é hardcoded em V1; exposição via config (`chain_node_cap`) fica out-of-scope V1.

### BR-NC-09 — File-level granularidade em M1
- Items no noise file usam `{target_path}` (sem `:symbol` ou `:line`)
- Symbol resolution via AST fica explicitly out-of-scope V1 — entra com M2/V2 via `tree-sitter` (pre-decision sheldon I4)

### BR-NC-10 — Telemetry obligation
Toda execução de `chain:audit` (incluindo failures) DEVE emitir `runtime:emit --type=chain_audit --payload=...`. Sem isso, guardrail metric não funciona e o pulse alert > 2x/mês não dispara. Audits com falha emitem payload com `impacts_found=null` + `error=...`.

### BR-NC-11 — Audit failure non-blocking
Se `chain:audit` falhar (SQLite locked após 3 retries com backoff exponencial 100/200/500ms, OR timeout > 5s):
- Log warning em stderr
- Emit `runtime:emit --type=chain_audit` com `impacts_found=null` + `error="..."`
- **Permite agent:done completar** (não bloqueia agent session)
- `@neo` na próxima activation surfa "⚠ Last audit failed" no dashboard (ler último chain_audit event)

## Edge cases

### EC-NC-01 — File renamed/moved em git
Edges apontam pra source/target path antigo. Em M1 (append-only) acumulam edges órfãos. **Decisão V1:** aceitável como noise; M2 vai limpar via dead-target check. Documentar em spec `## Notes` pra @dev não tentar "consertar".

### EC-NC-02 — File deletado
Mesmo caso EC-NC-01: edges órfãos acumulam até M2. Aceitável V1.

### EC-NC-03 — Agente edita file nunca-antes-visto
Primeiro edit cria edges com `hit_count=1`, `start_at=now()`. Caminho feliz do ingest; sem tratamento especial.

### EC-NC-04 — SQLite locked durante audit
Retry com backoff exponencial: 3 tentativas (100ms, 200ms, 500ms). Se ainda locked após 3 retries → abort audit com warning log; emit chain_audit event com error; agent:done completa normal (BR-NC-11).

**V1 ACCEPTABLE DEVIATION (hotfix v1.17.1):** retry/backoff NÃO implementado em V1. Single-attempt `try/catch` é suficiente porque BR-NC-11 (non-blocking) é o contrato load-bearing — audit failure jamais propaga pra `runAgentDone`, agent:done completa normal de qualquer jeito. Path sequencial via `runAgentDone` não tem contenção real hoje (apenas Living Memory reflect-prepare + Neural Chain hook sequenciais). Helper `withRetry({attempts:3, backoffMs:[100,200,500]})` deferido pra M1.5/M2 quando concorrência aparecer (squad mode EC-NC-08).

### EC-NC-05 — `agent_event` sem source_files (ex: dossier:add-finding, agent:done sem edits)
Hook `chain:audit` é **skipped no-op** quando agent_event da sessão não inclui file edit operations. Reduz overhead pra agents que só fazem CLI calls sem editar (e.g., @neo activation, dossier finds).

### EC-NC-06 — Bootstrap sem git history (< 50 commits)
Skip bootstrap auto-scan; info message log. Agent-event ingest cobre a partir do primeiro `@dev` run. Documentado no PRD sheldon section "Pre-made decisions" item 3.

### EC-NC-07 — Config sem `chain_auto_threshold`
Auto-migration runtime: lê config, se field ausente → usa default `0.8`. Não força edit ao `.aioson/config.md` (zero migration burden em projetos legados).

### EC-NC-08 — Multi-agent / squad concurrent edits no mesmo arquivo
SQLite WAL handles write race natively. Audit lê pós-edit (sem race condition real). **OUT-OF-SCOPE V1**: squad/parallel testing NÃO está no acceptance criteria do `@qa` Gate D.

### EC-NC-09 — Noise file YAML frontmatter corrupted
Audit ao ler o noise file: se frontmatter parse fail → trata como "novo noise file" (re-cria com frontmatter limpo, preserva items do body se readable). Não bloqueia audit.

### EC-NC-10 — Two agents tentando deletar o mesmo noise file (race)
Deletion-on-close é `fs.unlink; catch ENOENT silently`. Idempotent.

## Out of scope for this feature

Conforme PRD `## Out of scope`:
- M2 graph maintenance (skill LLM-judged + heurística determinística de poda + `chain:prune`)
- AST drill-down (symbol-level granularity)
- Multi-language AST (`tree-sitter` integration → V2)
- Obsidian-style visualization
- Auto-correção LLM-mediated em tempo real (M1 só auto-marca; execução fica pro próximo agente)
- Mudança no `feature-dossier`/`brains`/`living-memory`/`operator-memory` (camadas existentes intocadas)
- Concurrent/multi-agent squad edit testing (EC-NC-08)
- Configurabilidade do `chain_node_cap` em V1 (hardcoded 10k)

## Classification (per analyst.md scoring)

| Critério | Valor | Pontos |
|---|---|---|
| User types | 2 (LLM agents + dev humano) | 1 |
| External integrations | 0 novos (SQLite + git são infra existente) | 0 |
| Business rule complexity | 11 BRs com state machines + threshold rules + lifecycle + cap enforcement + telemetry obligation | 2 (complex) |
| **Total** | | **3 → SMALL** |

Confirma sheldon enrichment + PRD frontmatter. Cadeia: `@analyst → @dev → @qa`. `@architect` skipped (sheldon-002 brain default; architect-territory OQs closed in-place no enrichment).

## Visual identity

N/A — feature CLI/runtime sem UI direta.

## Risks identified

- **R1 (Viability):** tokens consumidos por `chain:audit` crescer descontroladamente sem M2. **Mitigation:** BR-NC-10 telemetry + pulse alert > 2x/mês.
- **R2 (Feasibility):** hook latency > 200ms degrada UX. **Mitigation:** § Performance budget no PRD + perf test obrigatório > 50k edges + abort em > 5s (BR-NC-11).
- **R3 (Usability):** noise files acumulando sem fechar (TODO graveyard). **Mitigation:** BR-NC-06 deletion-on-close + `@neo` surfacing como blocker.
- **R4 (Value):** agentes ignoram noise file mesmo surfado por `@neo`. **Mitigation:** surfacing como **BLOCKER** (não info) — `@neo` trata como impede progresso. Métrica primary monitora.

## Open questions

**Zero.** Sheldon enrichment fechou as 5 do briefing; analyst pass fechou as 6 técnicas via BRs/ECs explicitos. `@dev` herda zero OQs abertas — implementação direto.
