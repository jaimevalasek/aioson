---
classification: MEDIUM
source: video-transcript-hermes-insights-2026-05
generated_at: 2026-05-13
---

# PRD — Active Learning Loop

## Vision
Fechar o loop entre os primitivos de aprendizado que AIOSON já tem (`learning`, `pattern:detect`, brains, evolution_log) e o ciclo real de desenvolvimento de features, de modo que rules, brains e learnings se autocurem com visibilidade humana — sem deixar o framework virar um cemitério de artefatos `.md` desatualizados.

## Problem
AIOSON acumula learnings, rules e brain nodes a cada feature, mas o loop está aberto em três pontos: (1) distillation (`learning:evolve`, `pattern:detect`, `learning:auto-promote`) só roda manualmente, (2) não há telemetria de **uso real** de rules e brain nodes — quality scores e frequência são estáticos ou só refletem criação, e (3) não há mecanismo de archive proposto pelo sistema. Em projetos MEDIUM/large, isso vira prompt-budget desperdiçado em rules que ninguém carrega há 5 features e dor de curadoria que o autor do vídeo do Hermes explicitamente cita ("tenho tantas skills e algumas são parecidas — como refinar?").

## Differentiation _(sheldon)_

Closed-loop learning não é mais novidade. Anthropic shipou **Dreaming** (Managed Agents) em 6-mai-2026 e **Auto Dream** (Claude Code) está rolando desde mar/2026. Harvey reportou **6× completion rate sem mudar modelo** apenas com Dreaming ativo. Hermes Agent é #1 OpenRouter (224B tokens/dia vs OpenClaw 186B em 10-mai-2026). Active-learning-loop não compete em "tem learning loop" — compete em **como o loop é desenhado**:

| Eixo | Anthropic Dreaming | Hermes Agent | Claude Code Auto Dream | AIOSON active-learning-loop |
|---|---|---|---|---|
| Harness | Managed Agents only | Local/VPS, MIT | Claude Code only | **Harness-agnostic via template** |
| Escopo | Account/agent | Per-session DB | Per-`MEMORY.md` | **Per-projeto + per-feature** |
| Archive | Automático | Automático (reflective) | Automático 24h | **Tier-2 humano-no-loop** |
| Lógica do loop | LLM-driven | LLM summarization | LLM consolidation | **Heurística determinística (no-LLM)** |
| Unidade de fechamento | On-demand | ≥5 tool calls | 24h + ≥5 sessões | **`feature:close` (SDD unit)** |
| Self-test | n/a | n/a | n/a | **Inception — framework usa o próprio loop** |

**Por que `feature:close` como unidade**: tool-call thresholds drift conforme o agente; time-windows são arbitrários; on-demand depende de disciplina humana. `feature:close` é o único trigger **observável, contratual e SDD-aligned** — é a única certeza de que uma unidade de trabalho terminou. Constitution Article III (Observable Work) e Article V (Clean Handoffs) reforçam essa escolha.

**Por que heurística sem LLM no loop**: Letta (LLM-driven memory) tem expressividade maior mas é caro, não-determinístico e exige rede. AIOSON optou por barato + determinístico + offline-capable + auditável. Trade-off explícito: menos expressividade na consolidação semântica, mais previsibilidade.

## Users
- **AIOSON dev no inception-mode (o próprio repo)**: precisa fechar features sem deixar learnings órfãos e quer ver doctor avisar quando rules ficam stale.
- **Desenvolvedor consumindo o template em projeto MEDIUM cliente**: precisa que `feature:close` consolide aprendizado sozinho e que `memory:search` deixe o conhecimento da feature anterior acessível na próxima.
- **Agente downstream (`@dev`, `@qa`, `@architect`)**: carrega rules/brains hoje sem feedback se aquele artefato ajudou ou só queimou tokens.

## MVP scope
### Must-have 🔴
- **M1. `feature:close` distillation hook** — ao fechar uma feature (`aioson feature:close --slug=...`), executa em sequência `pattern:detect`, `learning:auto-promote` e o write-back para `.aioson/rules/`/brains. Emite uma única notificação tier 2 com resumo ("3 learnings promovidos, 2 padrões marcados para revisão humana, 1 brain candidato a merge"). Falha non-blocking (best-effort, mesmo princípio do Living Memory reflect).
- **M2. Telemetria de uso de rules e brain nodes** — quando um agente carrega uma rule (via frontmatter match em `.aioson/rules/*.md`) ou consulta um brain via `query.js`, emite `runtime:emit --type=context_load --target=<rule|brain> --id=<...>`. **Reuso de `execution_events` com `event_type='rule_loaded'` ou `'brain_loaded'`** + índice parcial em `(event_type, agent_name)` — sem tabela nova, sem migração para instalações existentes _(sheldon)_. **Mecanismo de instrumentação fica como decisão deferred do @architect** (opções: per-agente inline, CLI verb `context:load`, rule-loader skill central) — registrada em `.aioson/plans/active-learning-loop/manifest.md#DD-1`. Sem essa telemetria, doctor não tem sinal real.
- **M3. Doctor curation checks (warning-level)** — três novos checks em `src/doctor.js`:
  - `living-memory:rule_staleness` — rule não carregada em últimas N features. **Threshold flexível _(sheldon)_**: `N = max(5, avg_days_last_5_features / 7)` — projetos low-velocity não penalizados.
  - `living-memory:learning_orphans` — entrada em `learnings` promovida a rule mas sem nenhum `context_load` posterior (a rule "promovida" nunca foi consumida).
  - `living-memory:distillation_lag` — última distillation aconteceu há ≥ 5 features fechadas (escape valve se o hook M1 falhou silenciosamente).
- **M4. `memory:search "<query>"`** — comando CLI com FTS5 sobre `content_items` + `learnings` (texto + tags). Retorna top 5 hits com `target_type`, `id`, snippet, score, e o agente/feature de origem. Sem isso, a curadoria fica invisível e o loop não recompensa o uso.
- **M5. `memory:archive --id=<id>` (tier 2)** — comando humano-acionado que move uma rule, learning ou brain node para `.aioson/{rules|brains|context}/_archived/{date}/`. Registra evento em `evolution_log` **com padrão validity-window estilo Zep _(sheldon)_**: cada entry tem `start_at` (criação/promoção) e `end_at` (archive/supersede), nunca muta. Audit trail permanente. Doctor propõe; humano executa. Reversível via `memory:restore --id=<id>` (define novo `start_at`, preserva history).
- **M6. Inception mirror** — toda mudança em `src/commands/`, `src/doctor.js` e em arquivos do template deve aterrissar **simultaneamente** em `template/` (para projetos cliente recém-setupados receberem o mesmo loop). Validar com teste de paridade.

### Should-have 🟡
- **S1. Brain merge proposal (heurística)** — quando dois brain nodes têm ≥ 70% de overlap de tags e mesmo `verdict`, doctor sinaliza `brain_overlap_candidate`. Apenas proposta — humano consolida manualmente.
- **S2. `memory:why --id=<id>`** — explica trajetória de um artefato a partir do `evolution_log` (criado em feature X, promovido em feature Y, carregado N vezes desde então). Audit trail.
- **S3. Threshold configurável** — `staleness_window_features` em `.aioson/config/learning-loop.json` (default 5).

## Out of scope
- **Auto-archive sem aprovação humana** — nunca. Memória curada é tier 2 por design; auto-prune contradiz a constitution.
- **Auto-merge de brains** — apenas proposta em S1. Aplicação fica manual nesta versão.
- **LLM-driven clustering / semantic embedding** — heurísticas determinísticas apenas (frequency, tag overlap, `evolution_log` proximity). Compatível com o princípio "CLI/runtime owns deterministic state".
- **Cross-projeto / `~/.aioson/global/`** — escopo isolado por projeto. Aprendizado de projeto A não vaza para B. Feature futura separada, com tratamento de privacidade próprio.
- **Skill consolidation em `.aioson/installed-skills/`** — out-of-scope V1. Skills são install-action explícito; pressão de curadoria é menor.
- **FTS5 sobre brains** — `query.js` por tags resolve para o tamanho atual (5-14 nós/agent). Reindexar depois se brain DB crescer.
- **Multi-channel gateway** (Telegram/Discord/Slack do Hermes) — fora da identidade do AIOSON como CLI local.
- **Auto-distillation em `agent:done`** — apenas frequency counter silencioso continua (já existe via `hooks:emit`). Loop pesado só em `feature:close`.
- **Vector retrieval (sqlite-vec / embeddings) _(sheldon)_** — V1 fica em FTS5 puro. Hybrid retrieval (vector + FTS + graph walk) é o padrão de produção (Engram/MNEMOS), mas adiciona dependência nativa, custo de indexação e LLM-call para embeddings. Deferido para V2 só se `memory:search` precision medir abaixo de threshold em uso real.
- **Per-category half-life (identity 1y / integration 1mo / process 6mo) _(sheldon)_** — V1 usa threshold único (formula em M3). Sofisticação por-categoria é padrão Engram/MNEMOS mas overengineering antes de ter dado de uso.
- **Squad-aware loop _(sheldon)_** — `squad_learnings` é tabela separada de `project_learnings`. Esta feature consolida apenas project-scope. Aggregação cross-squad (multi-agent collective learning estilo Dreaming) é feature futura distinta.
- **Atropos-style RL trajectory export _(sheldon)_** — Hermes pluga em pipeline de fine-tuning. AIOSON é framework de processo, não de treinamento de modelo. Fora do escopo permanentemente.
- **Loop em projetos MICRO _(sheldon)_** — feature classification MICRO pula o loop inteiro (resolução da open question). Consistente com brain `sheldon-002` (classification gates scale process depth).

## User flows

### Closing a feature with active distillation
1. Dev finaliza trabalho, roda `aioson feature:close --slug=user-auth`.
2. CLI completa o close padrão (gate validation, dossier finalize, features.md update).
3. **Novo:** dispara `learning-loop:run --feature=user-auth` em background best-effort.
4. Engine executa `pattern:detect --feature=user-auth`, `learning:auto-promote --feature=user-auth`, registra em `evolution_log`.
5. Notificação tier 2 aparece: "active-learning-loop: 3 learnings promovidos a rule, 2 padrões para revisão humana em `.aioson/context/learning-loop/user-auth.review.md`, 1 brain candidato a merge."
6. Dev decide se age agora ou ignora. `doctor` lembrará se ficar stale.

### Stale rule surfacing
1. Dev roda `aioson doctor` rotineiramente (ou doctor é chamado como parte de preflight do próximo agente).
2. Output: `[warning] living-memory:rule_staleness — rule 'prisma-migration-discipline' não foi carregada em 6 features fechadas. Proposta: archive.`
3. Dev investiga via `aioson memory:why --id=rule-prisma-migration-discipline` — vê histórico.
4. Decide arquivar: `aioson memory:archive --id=rule-prisma-migration-discipline --reason="migrações agora geridas por @architect via design-doc"`.
5. Rule move para `.aioson/rules/_archived/2026-05-13/`. Evento registrado. Reversível.

### Searching curated memory across features
1. Dev começa nova feature, quer saber o que já foi decidido sobre Prisma migrations.
2. Roda `aioson memory:search "prisma migration"`.
3. Retorna: rule X (score 0.92, feature `db-baseline`), learning Y (score 0.81, feature `schema-refactor`, status `promoted`), brain node Z (score 0.74, agent `architect`, q:4).
4. Dev abre os hits relevantes via path direto. Não precisou perguntar a um agente nem reler dossiers antigos.

## Success metrics

**Anchor externo _(sheldon)_**: Harvey reportou **6× completion-rate gain** com Anthropic Dreaming, sem mudar modelo. Demonstra que upside de memória curada é real e medível. AIOSON não busca paridade quantitativa (heurístico vs LLM-driven), mas usa o dado como baseline de expectativa qualitativa.

- **Inception self-test _(sheldon)_**: depois de fechar 5 features no próprio AIOSON com o loop ativo, `doctor` reporta **zero** curation candidates não surfaceados. **Fixture concreto**: `tests/active-learning-loop-inception.test.js` simula 5 `feature:close` em tmpdir e verifica `aioson doctor --json` retorna `curation_candidates: []`.
- **Distillation coverage**: 100% das features fechadas via `feature:close` produzem entrada em `evolution_log` com `event_type=auto_distillation` e `start_at` populado.
- **Search retrieval**: `memory:search` com 10 queries representativas (definidas em `tests/fixtures/memory-search-queries.json`) retorna ≥1 hit relevante em ≥ 8 delas (medido em projeto teste com 5 features simuladas).
- **Inception parity**: `aioson setup` em projeto greenfield expõe os mesmos 3 doctor checks novos (M3) e os 2 comandos novos (`memory:search`, `memory:archive`) — verificável por test fixture em `tests/inception-parity-active-learning-loop.test.js`.
- **Prompt-budget**: rules archivadas via M5 reduzem soma de tamanho de rules carregadas por sessão em ≥ 10% após 5 features (medido via `agent:audit --json`). Métrica alternativa aceitável: `memory:search` precision ≥ 0.8 em queries do fixture (caso pouca rule seja archivada por baixo volume).

## Open questions

**Resolvidas durante o enrichment _(sheldon)_:**
- ~~Comportamento em projetos MICRO~~ → **Resolvido**: loop OFF em MICRO (added to Out of scope).
- ~~Threshold default de `staleness_window_features`~~ → **Resolvido**: formula flexível `max(5, avg_days_last_5_features / 7)` (M3).
- ~~Schema (`context_load_events` nova vs reuso)~~ → **Resolvido**: reuso `execution_events` com `event_type='rule_loaded'`/`'brain_loaded'` (M2).

**Deferidas para o phased plan** (`.aioson/plans/active-learning-loop/manifest.md#deferred-decisions`):
- **DD-1**: mecanismo de instrumentação para rule loading — @architect escolhe (per-agente / CLI verb / rule-loader skill central).
- **DD-2**: `feature:close` distillation em foreground (~2s) vs background com notify — implicação UX e CI.
- **DD-3**: lock de concorrência para `feature:close` simultâneos — SQLite row-level / filesystem flock / sqlite advisory.
- **DD-4**: ranking de `memory:search` — BM25 default vs pesos custom por surface.
- **DD-5**: Brain merge (S1) entra na Phase 4 ou vira follow-up MICRO feature.

## Delivery plan _(sheldon)_

Sizing score: **15** (entidades 6, fases 6, integrações 0, flows 4, AC complexity alta). Path B obrigatório (≥7).

Plano externo faseado em **6 fases independentemente implementáveis**, em `.aioson/plans/active-learning-loop/`:

| # | Phase slug | Depende de | Saída principal |
|---|------------|------------|-----------------|
| 1 | `telemetry-foundation` | — | `execution_events` instrumentado para rule/brain loads, decisão DD-1 fechada |
| 2 | `memory-search-fts5` | Phase 1 | virtual table FTS5, comando `aioson memory:search` |
| 3 | `memory-archive-with-evolution-log` | Phase 1 | schema validity-window, comando `aioson memory:archive` tier 2 |
| 4 | `doctor-curation-checks` | Phases 1+3 | 3 novos checks em `src/doctor.js` |
| 5 | `feature-close-distillation-hook` | Phases 1+3+4 | hook integrado em `feature:close`, tier-2 notify |
| 6 | `inception-mirror-parity` | todas anteriores | fixture test + extensão `sync:agents` preflight |

Manifest e plan-files em `.aioson/plans/active-learning-loop/`.

## Reference sources (sheldon)

**Research consultado:**
- `researchs/anthropic-dreaming-2026/` — Dreaming shipou 6-mai-2026, Harvey 6× anchor, recalibra differentiation
- `researchs/hermes-agent-architecture-2026/` — confirma SQLite+FTS5 baseline, cadência 5-tool-calls vs feature:close
- `researchs/agent-memory-backends-2026/` — valida FTS5 V1, surface V2 trajectory (sqlite-vec, Zep validity-window)
- `researchs/skill-consolidation-patterns-2026/` — Auto Dream cadência + per-file size budget
- `researchs/multi-agent-token-budget-2026/` — efficiency baseline (já citado em deyvin-subtask-scout)
- `researchs/sub-agent-patterns-2026/` — cross-LLM orchestration confirma harness-agnostic edge

**Brains aplicáveis (q:5):**
- `sheldon-001` workspace/template parity → enforce M6 + Phase 6
- `sheldon-002` classification gates → MICRO out-of-scope decision
- `sheldon-003` validator sandbox → Phase 5 hook não pode poluir validator context
- `sheldon-004` discovery before architecture → @analyst antes de @architect (DD-1 não decidir antes)
- `sheldon-005` CLI over direct file write → todos os 3 comandos novos seguem este padrão
- `sheldon-006` design-complete ≠ execution-complete → Phase 6 audit wiring antes de `feature:close`

**Constitution articles direta:**
- Article II (Right-Sized Process) — MICRO opt-out
- Article III (Observable Work) — todos os comandos emitem `runtime:emit`
- Article IV (Testable Behavior) — fixture tests obrigatórios
- Article V (Clean Handoffs) — `feature:close` é o handoff natural
- Article VI (Simplicity Over Ceremony) — reuso `execution_events` ao invés de tabela nova
- Article VII (Zero Trust by Default) — tier-2 obrigatório em `memory:archive`

**Docs internas:**
- `.aioson/docs/autonomy-protocol.md` — tier-2 contract para M5
- `.aioson/docs/LAYERS.md` — qual layer cada artefato pertence
- `.aioson/context/architecture-living-memory.md` — pipeline existente que estendemos
