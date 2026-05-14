---
phase: 2
slug: active-learning-loop
created: 2026-05-14
status: resolved
resolved_at: 2026-05-14
resolved_by: dev
reviewer: qa
---

> **Status update (2026-05-14 — @dev, auto-cycle cycle 1):** H-01 applied — early-return on
> empty sanitized query in `searchProjectLearnings`, new i18n key `query_unparseable` × 4
> locales, command-layer mapping in `runMemorySearch`. `tests/qa-memory-search.test.js` 3/3
> green; `tests/memory-search.test.js` 17/17 green (no regression); Phase 1 suites
> 18/18 green. Optional M-01/M-02/L-01/L-02 deferred per scope. Awaiting @qa re-verification.

# Corrections Plan — Phase 2 (memory-search-fts5) — 2026-05-14

## Contexto
QA revisou a Phase 2 (`memory-search-fts5`) em 2026-05-14. Cobertura de ACs: 5/5
(AC-ALL-201..205) Covered pelo suite `tests/memory-search.test.js` (17/17 verde).
Comportamento esperado em `EC-ALL-08` é parcial: o suite cobre special chars (`DROP
TABLE; --`), aspas embarcadas, length-cap (>500) e empty/whitespace, mas **não cobre
o subcaso em que toda a query reduz-se a vazio após sanitização**. Esse subcaso quebra
a contrato CLI/JSON de retorno estruturado e é tratado como bloqueador (High).

Veredicto Gate D: **FAIL** até a correção mandatória ser aplicada e o teste de
regressão `tests/qa-memory-search.test.js` ficar verde.

## Correções mandatórias

### H-01 — Queries reduzidas a vazio após sanitização quebram `memory:search`
Arquivos:
- `src/learning-loop-fts5.js:94-114` (`searchProjectLearnings`)
- `src/commands/memory-search.js:80-101` (chamada e tratamento de erro)

Problema:
`sanitizeFtsQuery` retorna `''` quando todos os tokens caem em chars stripados (por
exemplo `+ - * ( ) ^ :` ou `" " "`). `validateQuery` aceita esses inputs (não vazios
em entrada), e o SQL gerado é `... WHERE project_learnings_fts MATCH ''`, o que faz
SQLite lançar `fts5: syntax error near ""`. A exceção propaga acima de
`searchProjectLearnings`; `runMemorySearch` só tem `try/finally` para `db.close()`,
nada captura a exceção. Resultado prático:
- Em CLI normal o processo termina com stack trace (UX ruim).
- Em modo `--json` o objeto `{ ok:false, reason }` esperado nunca é retornado.

Confirmado por probe manual (`fts5: syntax error near ""`) e por
`tests/qa-memory-search.test.js` (3/3 verm. com `SQLITE_ERROR`).

AC afetada:
- AC-ALL-201 indireto — contrato "retorna top N hits ou erro estruturado" não vale
  para esse subcaso.
- EC-ALL-08 — o requisito "special chars / SQL injection" cobre o lado de segurança,
  mas a sanitização hoje converte ataques em queries inválidas que crasham o
  command em vez de retornar erro.

Correção esperada (escolher uma):
1. Em `sanitizeFtsQuery` (ou `searchProjectLearnings`), detectar `sanitized === ''`
   e retornar `{ ok: false, reason: 'query_unparseable' }` (nova chave i18n) antes
   de chamar `db.prepare(sql).all(...)`. Atualizar `runMemorySearch` para mapear
   esse retorno para output text+JSON estruturado.
2. Alternativa equivalente: envolver a chamada de `db.prepare(sql).all(...)` em
   try/catch dentro de `searchProjectLearnings` e mapear `SQLITE_ERROR` para o mesmo
   retorno estruturado.

Adicionar a chave i18n nova `memory_search.query_unparseable` nos 4 locales (en,
pt-BR, es, fr) — mesmo padrão de `query_empty`/`query_too_long`. Atualizar o branch
de erro em `src/commands/memory-search.js` para acionar essa chave.

Teste de regressão (já escrito por @qa, atualmente vermelho):
- `tests/qa-memory-search.test.js`
  - `QA-H-01: operator-only query returns structured error`
  - `QA-H-01 cont: quote-only query returns structured error`
  - `QA-H-01 cont: text-mode (non-JSON) operator-only query also returns ok=false`

Severidade: **High** — quebra contrato user-facing, fácil de disparar acidentalmente
(usuário digita `***` ou aspas extras), não envolve segurança/auth (sem keywords
Critical) e portanto cabe no auto-cycle qa→dev (cycle 1).

## Correções opcionais (não-blocantes)

### M-01 — DD-4 doc-drift: `decision-search-ranking.md` ainda descreve "phrase-only"
Arquivo: `.aioson/plans/active-learning-loop/decision-search-ranking.md:43-45`

Problema:
O guardrail #2 documenta:
> Default V1: trate o input como **phrase query** — escape `"` e wrap em aspas:
> `const fts = '"' + raw.replace(/"/g, '""').trim() + '"'`. Operadores FTS5 ficam
> opt-in via flag futura `--fts-syntax` (não em V1).

Implementação shipada faz **token-AND** (`tokenize-on-whitespace, strip operator
chars per token, wrap cada token como phrase, AND across tokens`). O Agent Trail
no `spec-active-learning-loop.md:30-31` registra o refinamento e o motivo
(phrase-only literal alcançava ≤7/10 precision na fixture canônica), mas a decisão
canônica (DD-4) não foi atualizada.

Fix esperado:
- Adicionar uma subseção "Refinement adopted at implementation time" no final de
  `decision-search-ranking.md` documentando: (1) o que mudou, (2) por que (precision
  ≤7/10 no literal phrase-only), (3) que o envelope de segurança é o mesmo
  (operadores FTS5 neutralizados, bind parameters obrigatório). Manter o histórico
  original imutável (consistência com PMD-6 evolution_log append-only spirit).

Severidade: **Medium** — afeta re-leitura por agente futuro (@architect/@analyst
em DDs subsequentes) e por humano em audit. Não bloqueia código.

### M-02 — `--include-archived` semântica ambígua em Phase 2
Arquivo: `src/learning-loop-fts5.js:55-71`

Problema:
A flag se chama `--include-archived` mas em Phase 2 o filtro real é
`status IN ('active', 'promoted')`. Quando a flag é setada, o filtro é removido —
incluindo entries com `status='stale'`, `status='archived'` e qualquer outro
status não-canônico. O nome sugere "incluir as arquivadas" mas o efeito é
"incluir todas as não-ativas".

O código tem um comentário inline que documenta que Phase 3 vai swappar para
`JOIN evolution_log WHERE end_at IS NULL`, momento em que a flag passa a casar
com o nome. Até lá há ambiguidade.

Fix esperado (escolher uma):
1. Documentar a transitional behavior no help de CLI: i18n `help_memory_search`
   pode mencionar "(Phase 2: also surfaces stale; Phase 3 will narrow to true
   archived)" — mas isso polui help.
2. Em Phase 3 (quando entrar end_at), renomear `--include-archived` para um nome
   neutro ou adicionar alias. Opcionalmente filtrar explicitamente status NOT IN
   ('stale') por padrão também em Phase 2 — alinhando comportamento com o nome.

Severidade: **Medium** — afeta UX e expectativa do usuário, mas a divergência só
fica visível quando há rows com `status='stale'` (raro hoje). Não bloqueia.

### L-01 — Sem stress test para latência p99 com 1000+ entries
Arquivo: `tests/memory-search.test.js` (suite atual)

Observação:
`plan-memory-search-fts5.md` explicitamente listou em "Notes para @qa":
> Stress test: 1000 entries em `project_learnings`, query latency p99 ≤50ms.

O dev shipou 17 testes funcionais mas nenhum stress test. A precision metric
(AC-ALL-205) está coberta com 10 fixtures, mas o budget de performance da Phase 2
não foi medido. Phase 1 mediu p99 de telemetria (32ms vs 100ms SLA) — Phase 2 não
tem equivalente.

Fix esperado:
- Adicionar `tests/qa-memory-search-perf.test.js` (ou estender o suite existente)
  com fixture de ≥1000 entries (geradas em loop, com text gerado para evitar
  matches degenerados) e medir `p50/p95/p99/max` de 100+ queries. Assert p99 ≤50ms.
- Não-bloqueante: o budget é meta de qualidade, não AC binária; pode aceitar
  como gap documentado e plotar em corrections futura.

Severidade: **Low** — observabilidade, não correctness.

### L-02 — `aioson` CLI ausente do PATH (recorrência do L-01 de Phase 1)
Observação:
Mesma situação reportada em `corrections-2026-05-14.md` (Phase 1). `aioson` não
está em PATH neste host de dev, então `aioson workflow:next --complete=qa`,
`aioson preflight`, `aioson security:audit` e `aioson agent:done` não rodaram.
Dashboard de runtime continua cego para este slice.

Fix:
- Fora do escopo de Phase 2. Sugestão: `npm link` no repo antes de Phase 3 começar
  para destravar a telemetria do dashboard. Sem efeito em correctness.

Severidade: **Low** — telemetria de dashboard, não código.

## Artefatos de verificação QA

- `tests/qa-memory-search.test.js` — 3 testes novos para H-01 (atualmente todos
  vermelhos com `SQLITE_ERROR`; passam quando a correção mandatória for aplicada).
- `tests/memory-search.test.js` (dev) — 17/17 verde (cobertura existente
  preservada).
- `tests/telemetry-foundation.test.js` + `tests/qa-telemetry-foundation.test.js`
  re-rodados após mudanças do Phase 2 — 18/18 verde (sem regressão em Phase 1).

## Próximo agente

Auto-cycle qa→dev (cycle 1 of 2 max) está autorizado pelo protocolo:
- H-01 é High mas **sem keywords Critical security** (`auth/secret/credential/...`).
- `.aioson/runtime/qa-dev-cycle.json` foi escrito com `slug=active-learning-loop`,
  `cycle=1`, apontando para este plano.
- @dev deve aplicar a correção mandatória H-01, rodar `tests/qa-memory-search.test.js`
  até verde, rodar `tests/memory-search.test.js` para confirmar zero regressão, e
  retornar a @qa para re-verificação. M-01/M-02/L-01/L-02 podem ser folded ou
  deferidos.
