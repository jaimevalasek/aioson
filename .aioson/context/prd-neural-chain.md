---
slug: neural-chain
classification: SMALL
status: in_progress
created_at: 2026-05-21
briefing_source: neural-chain
---

# PRD — Neural Chain (impact-aware code editing)

## Vision

Camada de awareness estrutural de código que mostra ligações implícitas (eventos, listeners, hooks, jobs, classes, testes) a cada edit, pra LLM agents pararem de "fazer mudança → bug silencioso → segunda chamada pra correção".

## Problem

Quando um agente LLM (`@dev`, `@deyvin`) ou developer humano via AIOSON edita um arquivo, ele lê o arquivo + context pack mas **não enxerga vínculos cross-file** — sistema de eventos, listeners nominais, hooks, jobs, classes dependentes, testes que validam aquele comportamento. Esses vínculos existem no código mas ficam invisíveis à LLM editora, que então deixa órfãos, dead references ou impactos não-propagados.

**Evidência observada (sessão 2026-05-21):** app de uma categoria foi desinstalado; LLM aplicou a mudança no arquivo de app mas não detectou que existia um sistema de eventos que removeria o botão associado. Resultado: botão órfão na UI → segunda chamada explícita pra correção → LLM aí enxergou o sistema de eventos e corrigiu. Caso real, não-hipótese.

Cada miss = correction loop (2-3x token cost da operação original) + risco real de bug silencioso passar pra produção em casos menos óbvios que o do botão. AIOSON tem 5 layers de memória (`feature-dossier`, `brains`, `living-memory`, `active-learning-loop`, `operator-memory`) mas é cego pro grafo de código no momento da edição — gap visível.

## Users

- **LLM code-editor agents (`@dev`, `@deyvin`, e quaisquer outros downstream que editem código):** precisam enxergar impacto cross-file após editar pra não missar listeners/eventos/hooks. Consumem output do `chain:audit` automaticamente via hook post-edit; não precisam ativar manualmente.
- **Developer humano via AIOSON:** precisa ver noises pendentes (surfados via `@neo` dashboard como blocker, não invisíveis) e revisar correções automáticas quando o modo `autonomy` permitir auto-fix. Quer que segunda chamada de correção pare de acontecer.

## MVP scope

### Must-have 🔴 (M1 — impact propagation per-edit)

- **Edge index em SQLite** (`.aioson/runtime/aios.sqlite` — infra existente, sem nova database) com pelo menos 2 tipos de aresta no V1: **git co-edit** (frequência: X mudou junto com Y em N commits) e **agent event** (toda execução de agente que tocou X registra também o que mais foi tocado na mesma operação).
- **Granularidade file-level via grep/heurística** — linguagem-agnóstico, baixo custo. AST drill-down explicitamente fora de M1.
- **Comando `aioson chain:audit <file>`** que consulta o grafo e retorna impactos rankeados por confiança (top-N).
- **Hook post-edit em `@dev`/`@deyvin`** que dispara `chain:audit` automaticamente após cada operação de edit (extensão em `src/commands/runtime.js` — mesmo arquivo do `agent:done` integrity check).
- **Saída dupla conforme `autonomy` do `.aioson/config.md`:**
  - `guarded` → sempre escreve `.aioson/context/noises/{edit-slug}.md` (TODO list humano-legível).
  - `standard` → threshold de confiança alta (regras concretas defer pra `@architect`): óbvias auto-corrigem; ambíguas viram noise.
  - `autonomous` → tenta corrigir todos os impactos; só registra noise pros que falharem.
- **Noise file lifecycle:** deletion-on-close obrigatório. Todos os items resolvidos → sistema deleta o arquivo automaticamente. Não acumula lixo igual `// TODO: fix this`.
- **`@neo` surfa noises pendentes no dashboard como blocker** (segue o padrão do `harness contract` já existente em `@neo`). Noises não ficam invisíveis entre sessões.
- **Validity-window per aresta** (`start_at` + `end_at` ao invés de mutação destrutiva — padrão Zep validado via `researchs/agent-memory-backends-2026`). Permite arquivamento auditável de arestas obsoletas quando M2 entrar no follow-up.
- **Hard cap em arestas por nó** (default 10k, configurável). Pattern de produção de Engram/MNEMOS (`agent-memory-backends-2026`). Sem cap = grafo cresce sem bound enquanto M2 não existir.

### Should-have 🟡

- **Ingest histórico opcional** do git log na primeira execução (`aioson chain:bootstrap`) — não-bloqueante pro V1; pode rodar em background ou ser pulado em projeto pequeno.
- **Comando `aioson chain:show <file>`** read-only pra dev humano consultar manualmente o grafo de um arquivo (debugging do próprio neural-chain).
- **Métricas de saúde do grafo** (`aioson chain:stats`) — total de arestas, distribuição por tipo, média de arestas por nó, top-10 nós mais conectados. Sem essa instrumentação ninguém detecta quando o grafo começa a degradar antes do M2 chegar.

## Out of scope

- **Mecanismo 2 — graph maintenance (poda)** — skill LLM-judged + heurística determinística de poda (TTL, frequency, dead-symbol check) + comando `chain:prune`. **Vira feature follow-up** após M1 estabilizar e dados reais mostrarem padrões de ruído. Justificativa: briefing single-voice flag + decisão @product de shippar valor antes; briefing confirmou que M1 pode operar 1-2 ciclos de feature sem M2. Métrica guardrail (tokens estáveis por `chain:audit`) detecta se a janela sem M2 está ficando perigosa.
- **AST drill-down (symbol-level)** — granularity por função/classe/listener via parser por linguagem. M1 fica file-level only. AST entra junto com M2 ou em feature separada.
- **Multi-language AST suporte** — fora de M1 inteiramente. Quando AST entrar, JS/TS é tier-1 (Node parser nativo); outras linguagens viram tier-2.
- **Visualização tipo Obsidian** (grafo navegável visual interativo) — parked permanentemente até demanda real aparecer. MVP é LLM consumption only.
- **Auto-correção LLM-mediated em tempo real** — M1 só auto-corrige no modo `standard`/`autonomous` via heurística determinística (regras simples sem chamada extra ao LLM). Chamada LLM-judged por edit fica fora de scope (custo viability).
- **Mudança no `feature-dossier`/`brains`/`living-memory`/`operator-memory`** — neural-chain é camada nova lateral, não estende as existentes. Coexistência, não merge.

## User flows

### Flow 1 — Agent edit triggers impact audit

1. `@dev` (ou `@deyvin`) edita `src/foo.js` como parte normal do trabalho dele.
2. Sistema executa hook post-edit automaticamente: `aioson chain:audit src/foo.js` (sem agente precisar lembrar).
3. Grafo retorna lista rankeada de arestas afetadas (top-N por confiança decrescente).
4. Conforme `autonomy` do `.aioson/config.md`:
   - `guarded` → sistema escreve `.aioson/context/noises/{edit-slug}.md` com items pendentes, agente continua o trabalho.
   - `standard` → items com confiança alta auto-corrigem (agente recebe instrução interna de aplicar correção); ambíguos viram noise.
   - `autonomous` → agente tenta corrigir todos os items; só registra noise pros que falharem.
5. Agente registra no `agent-event` (SQLite) a operação + impactos detectados (alimenta o próprio grafo — closure loop).
6. Próxima sessão / próximo agente: ao ativar `@neo`, noises pendentes aparecem no dashboard como blocker (`⛔ Noises: 3 pending in src/foo.js`).

### Flow 2 — Developer humano fecha noise file

1. Dev abre `.aioson/context/noises/{edit-slug}.md` (humano-legível, markdown narrativo).
2. Resolve cada item — manualmente ou via segunda chamada ao agente (`/deyvin` continua de onde parou).
3. Marca item como resolved (formato exato defer pra `@architect`; provavelmente checkbox markdown ou deleção de linha).
4. Quando todos os items estiverem resolvidos, sistema deleta o arquivo automaticamente (deletion-on-close).
5. `@neo` deixa de surfar como blocker; dev continua o próximo trabalho.

### Flow 3 — Bootstrap em projeto existente

1. Dev roda `aioson chain:bootstrap .` (opcional / Should-have).
2. Sistema ingesta git log (últimos N commits, default a definir por `@architect`) → arestas de co-edit com confiança proporcional à frequência.
3. Sistema ingesta agent-event history de `aios.sqlite` (sessões anteriores quando aplicável).
4. Grafo nasce com baseline de relações; M1 fica utilizável de cara em vez de aprender do zero ao longo de semanas.

## Success metrics

- **Primary:** redução de % de "second-call correction loops" comparado a baseline pre-feature.
  - **Baseline:** instrumentar N sessões pre-shipping (`@qa` define N) que rastreiem casos onde uma segunda chamada explícita ao agente foi necessária pra corrigir impacto missado na primeira.
  - **Target:** **-50% em 30 dias pós-release** (caso o user-test mostre que essa magnitude é alcançável; revisar com `@qa` em Gate D).
  - **Owner do measurement:** `@qa` + telemetria runtime SQLite.

- **Guardrail (viability):** tokens consumidos por `chain:audit` estáveis ao longo do tempo (não-crescentes em escala log).
  - **Alert threshold:** crescimento > 2x/mês dispara warning — sinal de que o grafo está acumulando ruído sem M2 e o tempo de M2 chegou.
  - Garante que ausência de M2 no MVP não vira armadilha viability silenciosa.

## Open questions

> _**(sheldon — enrichment 2026-05-21)**_ **Todas as 5 OQs abaixo foram resolvidas in-place neste enrichment pass.** Veja `## Threshold rules — autonomy mode (sheldon)`, `## Noise file format (sheldon)`, `## Pre-made decisions for V2 (sheldon)`, `## Data model (sheldon)`. Mantenho a lista original como histórico de decisão (não foram esquecidas — foram fechadas). `@analyst` herda zero OQs abertas no PRD.

Todas deferred conforme decisão de `@product` (briefing single-voice flag → resolução por agentes técnicos downstream com second-voice).

- **[decision-required] Skill owner do Mecanismo 2** (quando virar feature follow-up): `@neo` estendido vs `@sheldon` estendido vs agente novo `@chain-keeper`. → defer pra `@architect` no momento de abrir M2.
- **[decision-required] Threshold rules concretos no modo `autonomy: standard`** — quais regras determinísticas (nome de teste bate exato com módulo, listener literal bate com evento) decidem "corrige direto" vs "vira noise". → defer pra `@architect`.
- **[research-able] Multi-language priority quando AST entrar (V2):** quais linguagens além de JS/TS no tier-1? → defer pra `@architect` no momento de scopar V2.
- **[research-able] Bootstrap initial scan completo vs incremental:** trade-off entre tempo de instalação inicial e cobertura. → defer pra `@architect`.
- **[decision-required] Formato exato do noise file:** markdown narrativo deletável vs JSON estruturado machine-readable vs híbrido (markdown com frontmatter YAML estruturado). Hipótese inicial: híbrido (pattern já validado em `feature-dossier`). → defer pra `@architect` + iteração com `@product` durante implementação.

(Visual identity section omitted — feature CLI/runtime sem UI direta, per quality-lens "omit only when visual requirements were truly not discussed and no design skill was selected".)

---

## Data model _(sheldon)_

Single new table na infra SQLite existente (`.aioson/runtime/aios.sqlite`):

```sql
CREATE TABLE chain_edges (
  id INTEGER PRIMARY KEY,
  source_path TEXT NOT NULL,
  target_path TEXT NOT NULL,
  edge_type TEXT NOT NULL CHECK (edge_type IN ('git_co_edit','agent_event')),
  confidence REAL NOT NULL,
  start_at TEXT NOT NULL,    -- ISO datetime; validity-window start
  end_at TEXT,               -- NULL = active; M1 sempre NULL (sem M2 pruning no V1)
  hit_count INTEGER NOT NULL DEFAULT 1,
  last_seen_at TEXT NOT NULL,
  metadata JSON
);
CREATE INDEX idx_chain_edges_source ON chain_edges(source_path, end_at);
CREATE INDEX idx_chain_edges_target ON chain_edges(target_path, end_at);
CREATE UNIQUE INDEX uniq_chain_active ON chain_edges(source_path, target_path, edge_type) WHERE end_at IS NULL;
```

**Hard cap enforcement (10k edges por nó):** no ingest, se `(count edges where source_path = X) > 10000` → archive a aresta mais antiga por `last_seen_at` (set `end_at = now`). Pattern de produção validado em `agent-memory-backends-2026` (Engram/MNEMOS).

**Validity-window discipline:** schema está pronto pra M2, mas M1 é append-only — `end_at` permanece NULL para todas as arestas até M2 follow-up chegar. _(R2)_

## Confidence ranking _(sheldon)_

- `git_co_edit`: `confidence = min(1.0, co_edit_count_last_90d / 10)` — saturação em 10 co-edits
- `agent_event`: `confidence = min(1.0, event_link_count_last_30d / 5)` — saturação em 5 hits
- Quando ambos os tipos existem para o mesmo `(source, target)`: **reportar `max(c_git, c_event)`** — não soma; evita double-count entre fontes

## Threshold rules — autonomy mode _(sheldon)_ — fecha briefing OQ #3

Modo `standard` aplica **heurísticas determinísticas** (sem chamada LLM in-loop — evita custo viability extra):

- **AUTO-CORRECT** se qualquer uma:
  - **(a)** target é teste com filename matching módulo source (`foo.test.js` ↔ `foo.js`, `foo.spec.ts` ↔ `foo.ts`, `test_foo.py` ↔ `foo.py`)
  - **(b)** target contém string literal igual a identifier removido/renomeado em source (listener literal match via grep sobre o diff)
  - **(c)** `confidence > 0.8` AND `edge_type = 'agent_event'` AND `hit_count > 5` (alta confiança histórica)
- **ELSE** → noise file

Modo `guarded` **ignora** as 3 regras — sempre noise.
Modo `autonomous` aplica as 3 regras + tenta correção via agent prompt para tudo abaixo do threshold; falhas viram noise.

Threshold `0.8` tuneável via `.aioson/config.md` — adicionar campo `chain_auto_threshold` (default `0.8`) ao schema do config.

## Hook execution model _(sheldon)_

**Synchronous.** Agente bloqueia até `chain:audit` retornar; recebe impactos como continuation context na mesma sessão. Async (queue + noise only) foi rejeitado — perde a feedback loop in-session que é o ponto da feature (uninstall-app-button case).

**Integration point:** extends `runAgentDone` em `src/commands/runtime.js` — mesmo arquivo que já tem o `agent:done` integrity check do hotfix v1.9.3. Wiring single-point.

## Noise file format _(sheldon)_ — fecha briefing OQ #7

**Híbrido** (padrão `feature-dossier` validado em produção):

```markdown
---
slug: {feature-slug}
edit_at: {ISO-datetime}
autonomy_mode: {guarded|standard|autonomous}
source_files: [list of edited files]
total_items: N
resolved_items: M
---

# Pending impacts — {feature-slug}

- [ ] {target_path}:{symbol or line range} — {aresta detectada / motivo}
- [ ] ...
```

**Path:** `.aioson/context/noises/{feature-slug}-{YYYYMMDD-HHMM}.md` — agrega múltiplos edits da mesma sessão da mesma feature em um arquivo só. _(C5)_
**Fallback** quando edit acontece fora de feature ativa: `.aioson/context/noises/unspecified-{timestamp}.md`.

**Deletion-on-close trigger:** todos items `- [x]` (checked) OR body sem items pendentes → sistema deleta o arquivo automaticamente (check no próximo `chain:audit` ou no próximo `@neo` activation).

## Pre-made decisions for V2 / M2 follow-up _(sheldon)_

Resolvidas aqui pra reduzir churn arquitetural quando M2 / AST / multi-language entrarem:

1. **Skill owner do Mecanismo 2** → estender `@neo`. Justificativa: `@neo` já é router + dashboard surfacer; já lê estado global; já tem ciclo periódico via activation. Cohesão > proliferação. **NÃO criar `@chain-keeper` novo**; **NÃO usar `@sheldon`** (sheldon scope é PRD enrichment, não runtime). _Fecha briefing OQ #2._
2. **Multi-language parser** → `tree-sitter` (Node binding) em vez de parser-por-linguagem. Tier-1 V2: JS/TS. Tier-2: Python (mesma `tree-sitter` infra). Tier-3+: conforme demanda real. Uniformiza deps + multi-lang com mesma API. _Fecha briefing OQ #4._
3. **Bootstrap initial strategy** → incremental por default. `chain:bootstrap` opt-in roda em background se `zero edges` AND `git log > 50 commits` (sinal de projeto existente). Ingest top 1000 commits mais recentes, exponential decay (recente vale mais), warn > 60s. _(I1)_ Sem git history substancial → skip bootstrap, info message, agent-event ingest cobre a partir do primeiro `@dev` run. _(R3)_ _Fecha briefing OQ #5._

## Performance budget _(sheldon)_

- `chain:audit` ≤ **200ms** p/ grafo até 10k edges (target normal de operação)
- `chain:audit` ≤ **1s** p/ grafo até 50k edges (warning threshold — alerta dispara)
- > 50k edges → flag pra `@qa` validar com perf test in-spec
- Implementação: SQLite WAL + prepared statements + indexed lookups (infra padrão AIOSON, sem novas deps)

## Telemetry hooks _(sheldon)_

- `chain:audit` emite `runtime:emit --type=chain_audit --tokens=N --duration_ms=M` via `aios.sqlite` (mecanismo existente, sem nova infra)
- `aioson chain:stats` agrega mensalmente: total audits, avg tokens, p95 duration, total edges, distribuição por tipo
- Alert via pulse system se `tokens_avg_per_audit` cresce > 2x mês-a-mês — sinal explícito de que **M2 follow-up precisa abrir** (guardrail metric do PRD operacionalizado)

## Concurrent edits / multi-agent races _(sheldon — R1)_

SQLite WAL handles writes corretamente. Race no audit é leitura pós-edit (sem race condition real).
**Squad / parallel edits explicitly out-of-scope V1** — `@qa` não testa essa surface no Gate D.

## Done gate — audit wiring meta-AC _(sheldon — sheldon-006 brain default)_

Feature **não pode** ser marcada `done` em `features.md` antes do `@qa` verificar (AC-AUDIT-NC):

1. `chain:audit` hook integrado em `runAgentDone` (`src/commands/runtime.js`)
2. `@neo` activation surfa `noises/*.md` pendentes no dashboard como blocker (extensão da harness contract section em neo.md)
3. `autonomy` mode lido de `.aioson/config.md` por chain logic (campo `chain_auto_threshold` adicionado ao schema)
4. Schema migration `chain_edges` aplicada via runner existente
5. Test coverage ≥ 80% nas paths críticas: detecção de impacto + confidence ranking + threshold rules + noise file lifecycle
6. `CHANGELOG.md` entry para a versão
7. `template/` parity (sheldon-001): se qualquer `.aioson/agents/*.md` foi modificado (provável em `@neo`/`@dev`/`@deyvin` pelos hooks), mirror em `template/.aioson/agents/*.md`

`@qa` cita explicitamente este meta-AC no QA report como **AC-AUDIT-NC** (Neural-Chain audit). Sem ele, feature está apenas design-complete, não execution-complete (sheldon-006 anti-pattern).

## Reference sources _(sheldon)_

**Research cache reused (zero new web search this session):**
- `researchs/agent-memory-backends-2026/summary.md` (2026-05-13, +8d near-fresh; tópico storage stable) — SQLite+FTS5+WAL padrão de produção (Engram, MNEMOS, BrainCTL); Zep validity-window pattern (`start_at`/`end_at` por fato); hard cap ~10k memórias/agent
- `researchs/multi-agent-token-budget-2026/summary.md` (2026-05-13, +8d near-fresh; tópico token-economics stable) — multi-agent 4-15x token amplification sem disciplina; valida guardrail metric e necessidade de M2 follow-up

**Brain `sheldon/architecture-decisions` (q≥4 defaults applied):**
- `sheldon-001` workspace/template parity → done gate item 7
- `sheldon-002` classification gates → confirmed SMALL é correto (sizing score 2)
- `sheldon-004` discovery before architecture → 5 OQs deferred fechadas in-place (single-voice flag honored — `@analyst` herda zero OQs)
- `sheldon-005` CLI-first integration → todas interfaces neural-chain via `aioson chain:*` commands
- `sheldon-006` design-complete ≠ execution-complete → `## Done gate` meta-AC

**Source attestation:** zero novas pesquisas web nesta sessão. Caches a 8d (near-fresh, threshold de freshness 7d ultrapassado em 1d em tópicos de alta estabilidade; risco aceitável).
