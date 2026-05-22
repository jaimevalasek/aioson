---
generated: "2026-05-22T00:00:00.000Z"
agent: "tester"
scope: "Neural Chain feature (Phase 1, Slices 1-6) — post Gate D defensive gap-fill"
strategy: "Risk-first Gap Filling — bounded scope, no new deps, no production code changes"
supersedes: "2026-05-14 squad audit test-plan (closed)"
---

# Test Plan — Neural Chain (post Gate D defensive gap-fill)

## Strategy escolhida

**Risk-first Gap Filling** com scope TIGHT. Justificativa:

- `@qa` já aprovou Gate D com Verdict PASS (81/81 verde, ratio test/source 1.61).
- 2 Medium findings residuais do QA (M-01 EC-NC-04 retry + M-02 BR-NC-01 max combination) são **implementation gaps**, não test gaps — pertencem a `@dev`.
- Os gaps reais de teste são **defensivos**: 2 invariants arquiteturais críticos sem tripwire automatizado (BR-NC-04 anti-execution + BR-NC-10 telemetry schema).
- Golden rule do projeto: "small project, small solution" — não inflar com Stryker mutation testing / fast-check property quando coverage quantitativa já é alta.

Deliverable: **2 tests novos** (A.1 + A.2) totalizando 4 test cases em `tests/neural-chain-invariants.test.js`. Zero novas dependencies. Zero modificações em production code. 81 → 85 testes neural-chain.

## Phase 4 — Tests novos shipados

### A.1 — BR-NC-04 anti-execution invariant (2 test cases)

**Risk endereçado:** se algum slice futuro acidentalmente introduzir `fs.writeFileSync` ou `fs.unlinkSync` fora de `.aioson/context/noises/`, audit code pode passar a modificar arquivos de usuário — violação direta do contrato fundamental "audit nunca modifica código". Hoje a invariant é respeitada (grep confirma única superfície em `noise-file.js`), mas sem tripwire automatizado a regressão seria silenciosa.

**Test cases shipados:**

1. **A.1 (static)** — Lê os 6 source files de neural-chain (5 `src/neural-chain-*.js` + 1 `src/commands/chain-audit.js`), grep `fs\.(writeFile|writeFileSync|unlink|unlinkSync|rm|rmSync|appendFile|appendFileSync|copyFile|copyFileSync|rename|renameSync|truncate|truncateSync|chmod|chmodSync|chown|chownSync)`. Asserta: APENAS `neural-chain-noise-file.js` contém matches, e SÓ os 2 esperados (`fs.writeFileSync` + `fs.unlinkSync`). Qualquer novo fs mutation call em qualquer outro neural-chain source file → test fail.

2. **A.1 (functional)** — Monkey-patch `fs.writeFileSync` + `fs.unlinkSync` durante uma chamada de `runChainHookOnAgentDone` (com seed garantindo impacts → noise file gerado) + subsequente `maybeDeleteNoiseFile` (com items marcados resolved). Captura todos os paths tocados. Asserta: todos os paths começam com `path.join(targetDir, '.aioson', 'context', 'noises')`.

### A.2 — BR-NC-10 telemetry schema completeness (2 test cases)

**Risk endereçado:** BR-NC-10 spec lista 8 fields no payload de `chain_audit` events. Dois emitters distintos (CLI em `chain-audit.js` + hook em `agent-ingest.js`) drift entre si — futuro `aioson chain:stats` ou dashboard agregador vai assumir shape consistente e quebrar quando field esperado faltar.

**Test cases shipados:**

3. **A.2 (hook)** — Após `runChainHookOnAgentDone` exercitando ambas as branches (per-artifact emit + EC-NC-05 no-op), asserta que cada `execution_events` row com `event_type='chain_audit'` tem o subset universal `{feature_slug, impacts_found}` E o subset operational `{duration_ms}` quando `skipped_reason !== 'no_artifacts'`.

4. **A.2 (CLI)** — Após `runChainAudit` CLI invocation (com `--feature=neural-chain --json`), asserta que o event payload tem `{feature_slug, impacts_found, duration_ms}` + `feature_slug` propaga corretamente o `--feature` flag.

**Conservative subset:** A.2 testa só os campos truly universal hoje. Os outros 5 da spec BR-NC-10 (`noise_file`, `auto_fixable_count`, `tokens_used`, `source_files`, `error`) drift entre emitters — tracked em `[bug-found-003]` abaixo.

**Results:** 4/4 verde (302ms isolado). Cumulative regression: 2773/2771 + 1 skipped + 1 fail (AC-P1-07 pré-existente, sem relação). **Zero novas regressões.**

## Phase 4.5 — Test smell self-audit (81 → 85 tests)

Checklist do agent file aplicado a todos os 7 test files neural-chain (incluindo invariants novo):

| Smell | Verificação | Result |
|---|---|---|
| **Eager Test** (> 5 unrelated assertions/test) | Assertion-per-test ratio por suite: agent-ingest 4.0, autonomy 3.6, git-ingest 2.9, invariants 3.75, migration 3.0, noise-file 5.2 (borderline mas assertions agrupadas em frontmatter+body shape verification — aceitável), chain-audit 3.0 | ✓ Pass (1 borderline justificado) |
| **Mystery Guest** (`Date.now()`, `new Date()` sem arg, `process.env`, `fetch(`) | Grep retornou 0 occurrences nos 7 files. Todos os tests usam `new Date('2026-05-21T14:30:00Z')` com timestamp fixo explícito | ✓ Pass |
| **Test Run War** (flakes em paralelo) | Cada test usa `mkdtempSync` para temp dir isolado + close db no `finally` block. Sem shared state cross-test | ✓ Pass |
| **Conditional Test Logic** (if/else/loops dentro do test body) | 7 occurrences de `for`/`if` matchadas: agent-ingest 3 (parametrização — `for (let i=0;i<5;i++)` em saturation tests), autonomy 2 (`for (const mode of [...])` parametrização), git-ingest 1, invariants 2 (`for (const rel of FILES)` + `for (const ev of events)` — iteração sobre resultado esperado), chain-audit 1. Nenhum é `if (cond) expect(...)` branching logic | ✓ Pass |
| **Redundant Assertion** (`x === x`, repeated) | Grep visual scan: nenhum redundant assertion encontrado | ✓ Pass |
| **Mock Overdose** (> 50% setup é mock) | Tests usam temp dirs (not mocks) + real `openRuntimeDb` SQLite. Invariants test monkey-patches `fs.writeFileSync` mas APENAS pra captura observacional (não simula comportamento), restore no `finally`. Aceitável | ✓ Pass |

**Conclusão smell audit:** 0 smells críticos. 1 borderline (noise-file.js assertion ratio 5.2 — justificado por frontmatter+body shape combinada). 81 + 4 novos = 85 tests neural-chain, todos limpos.

## Coverage report (Phase 5)

**Quantitativa (heurística sem coverage tool — node:test não tem cobertura built-in nativa):**
- 85 tests / 1252 source LOC ≈ 0.068 tests/LOC (vs typical 0.030 baseline)
- Test LOC / source LOC = 2057/1252 = 1.64 (acima do baseline industrial 1.0)
- BRs cobertas: 9/11 directly + 2 partial (BR-NC-01 partial — max combination não implementado; BR-NC-02 rule b deferida)
- ECs cobertas: 6/10 directly + 2 OUT-OF-SCOPE V1 + 1 partial (EC-NC-04 retry não implementado) + 2 accepted-as-noise (EC-NC-01/02)

**Tier ladder posição:**
- Tier 1 (line coverage ≥ 80% overall, ≥ 90% critical paths): **inferido alcançado** (sem coverage tool baseline mas ratio test/source 1.64 sugere bem acima)
- Tier 2 (branch coverage ≥ 60% overall, ≥ 80% critical): **provavelmente alcançado** (classifyImpact 7 modo×rule combinações + EC-NC-05/09/10 branches cobertas)
- Tier 3 (mutation score ≥ 80% critical): **NOT MEASURED** — Stryker não instalado no repo; recomendação deferida (ver below)
- Tier 4 (property-based invariants): **NOT MEASURED** — fast-check não instalado; recomendação deferida

**Critical paths neural-chain identificados:**
- `maybeDeleteNoiseFile` — irreversible (unlink); coberto por 2 tests (deletion-on-close + EC-NC-10 race)
- `chain_edges` state machine (active → archived) — coberto por migration archive-flow test
- `aioson chain:audit` CLI — public API, coberto por 9 chain-audit tests + A.2 CLI integration
- `classifyImpact` — state-machine-like decision, coberto por 7 modo×rule combinações

**Residual coverage gaps (low priority, deferred):**
- Mutation testing em `classifyImpact` + `maybeDeleteNoiseFile` (Tier 3) — requer Stryker dep + config
- Property-based em saturation formula + classifier invariants (Tier 4) — requer fast-check dep

## Bug findings (encontrados, NOT fixed esta sessão — `@dev` ownership)

### `[bug-found-001]` EC-NC-04 retry/backoff não implementado

- **Source:** `src/neural-chain-agent-ingest.js`, `src/commands/chain-audit.js`
- **Spec:** BR-NC-11 + EC-NC-04 — "Retry com backoff exponencial: 3 tentativas (100ms, 200ms, 500ms). Se ainda locked após 3 retries → abort com warning log; emit chain_audit event com error"
- **Atual:** single-attempt try/catch sem retry. BR-NC-11 non-blocking IS honored mas survival a transient lock é mais fraco que spec.
- **Severity:** Medium (já documentado como M-01 no QA report)
- **Fix proposto:** helper `withRetry({attempts: 3, backoffMs: [100,200,500]})` ao redor de queryImpacts + emit OU amend spec aceitando V1 single-attempt como acceptable
- **Owner:** `@dev` quando endereçar M1.5 / próximo neural-chain slice

### `[bug-found-002]` BR-NC-01 `max(c_git, c_event)` combination não implementado

- **Source:** `src/neural-chain-agent-ingest.js#queryImpacts`, `src/commands/chain-audit.js`
- **Spec:** BR-NC-01 — "Quando ambos os tipos existem para o mesmo (source, target): reportar `max(c_git, c_event)` — não soma; evita double-count entre fontes"
- **Atual:** SQL `WHERE source_path = ? AND end_at IS NULL ORDER BY confidence DESC` retorna AMBAS as rows separadas → duplicação de mesmo `target_path` no noise file (motivos diferentes)
- **Verified live:** QA session confirmou 2 rows retornadas em vez de 1
- **Severity:** Medium (já documentado como M-02 no QA report)
- **Fix proposto:** SQL `SELECT target_path, MAX(confidence) AS confidence, ... GROUP BY target_path ORDER BY confidence DESC` + propagar `edge_type` via window function ou MAX
- **Test ausente:** dual-source case (mesmo (source, target) com ambos edge_types) — não existe teste hoje porque o behavior atual é "errado mas estável"; quando fix entrar, escrever test cobrindo
- **Owner:** `@dev` próximo slice

### `[bug-found-003]` chain_audit event payload schema drift entre emitters (NOVO)

- **Source:** `src/commands/chain-audit.js` (CLI emit) vs `src/neural-chain-agent-ingest.js` (hook emit)
- **Spec:** BR-NC-10 — payload deve ter `{feature_slug, source_files, impacts_found, auto_fixable_count, noise_file, tokens_used, duration_ms, error}` (8 fields)
- **Atual drift (3 sub-issues):**
  - **3a — Field set drift entre emitters:** CLI emite `{source_file, feature_slug, impacts_found, limit_applied, duration_ms, error}` (faltando 4: source_files plural, auto_fixable_count, noise_file, tokens_used). Hook per-artifact emite `{agent, source_file, feature_slug, impacts_found, auto_fixable_count, duration_ms, ingest_stats, noise_file, autonomy_mode, chain_auto_threshold, error}` (faltando 2: source_files plural, tokens_used; mas tem 4 EXTRA: agent, ingest_stats, autonomy_mode, chain_auto_threshold). Sem schema validation, `aioson chain:stats` (Should-have feature futura) vai assumir shape e quebrar.
  - **3b — Singular vs plural drift:** spec diz `source_files: [...]` (plural array); ambos emitters usam `source_file: <string>` (singular). Quebra agregação por session.
  - **3c — `tokens_used` field nunca emitido:** spec lista mas nenhum emit code path populates. Quebra primary metric instrumentation (PRD guardrail "tokens estáveis por chain:audit").
  - **3d — EC-NC-05 no-op event omite `duration_ms` + `error`:** quando artifacts vazio, emit envia payload sem esses 2 fields (mesmo que como 0/null). Detected via A.2 hook test que precisou relaxar assertion pra esse caso especial.
- **Detectado em:** `@tester` invariant test A.2 (em runtime real, não só leitura de código)
- **Severity:** Medium (downstream impact — break futuro consumer)
- **Fix proposto:** consolidar emitTelemetry helper compartilhado (em `src/neural-chain-telemetry.js` novo OU em `agent-ingest.js` exportado) com schema completo per BR-NC-10; CLI + hook ambos usam; EC-NC-05 no-op preenche duration_ms=0 + error=null
- **Test que vai precisar atualização após fix:** A.2 pode promover REQUIRED_BASE + REQUIRED_OPERATIONAL pra mesma constante (REQUIRED_BR_NC_10_FIELDS = todos os 8 spec fields)
- **Owner:** `@dev` próximo neural-chain slice (provavelmente junto com bug-found-002 num mesmo PR — ambos tocam queryImpacts + emit)

## Verification Triplet (BR-NC-04 invariant)

**truths (behavioral):**
- ✓ `runChainHookOnAgentDone` em modo guarded escreve noise file APENAS em `.aioson/context/noises/` — test A.1 (functional) confirma
- ✓ `maybeDeleteNoiseFile` unlink APENAS sobre paths em `.aioson/context/noises/` — test A.1 (functional) confirma

**artifacts (structural):**
- ✓ `src/neural-chain-noise-file.js` — 311 LOC, exports writeNoiseFile + readNoiseFileAndRecompute + maybeDeleteNoiseFile + helpers
- ✓ `src/neural-chain-agent-ingest.js` — 385 LOC, zero fs mutation calls (test A.1 static confirma)
- ✓ `src/neural-chain-config.js` + `src/neural-chain-migration.js` + `src/neural-chain-git-ingest.js` + `src/commands/chain-audit.js` — todos zero fs mutation (test A.1 static confirma)

**key_links (integration):**
- ✓ `runChainHookOnAgentDone` invocado em `src/commands/runtime.js:1246` (live_event) + `:1319` (standalone) — verificado por QA
- ✓ `@neo` lê `noises/*.md` via Step 1.5 (workspace + template parity) — verificado por QA
- ✓ `readChainConfig` lê `.aioson/config.md` frontmatter — testado em 6 readChainConfig tests

## Recommendations to `@dev` (próximo neural-chain slice)

Priority order (consolidar num PR se possível, todos tocam mesmo módulo):

1. **bug-found-002 (M-02)** — fix `queryImpacts` SQL com GROUP BY + MAX(confidence) para deduplicar (source, target) cross edge_type. **+ 1 test caso dual-source.**
2. **bug-found-003 (3a/3b/3c/3d)** — extract `emitChainAuditEvent` helper compartilhado entre CLI + hook; schema completo per BR-NC-10 (8 fields); EC-NC-05 no-op preenche duration_ms=0 + error=null. **+ promover A.2 REQUIRED_BASE pra full BR-NC-10 schema.**
3. **bug-found-001 (M-01)** — decidir: implementar `withRetry({attempts:3, backoffMs:[100,200,500]})` helper OU amend spec aceitando V1 single-attempt. Se implementar, **+ 1 test cobrindo retry behavior + abort após 3 fails**.

Slices 7/8 sugeridos não-prioritários (defer pra M1.5/M2):
- Stryker mutation testing infra (Tier 3 ladder) — adicionar `npm install --save-dev @stryker-mutator/core @stryker-mutator/api`; targets críticos `classifyImpact` + `maybeDeleteNoiseFile`
- fast-check property-based (Tier 4 ladder) — adicionar `npm install --save-dev fast-check`; targets `confidence saturation formula` + `classifyImpact invariants`

## Residual risks (acceptable for V1)

- **EC-NC-01/02** file rename/delete edges órfãos → spec accepts as noise V1 (M2 graph maintenance limpa)
- **EC-NC-08** squad/parallel concurrent edits → spec out-of-scope V1
- **Stryker mutation / fast-check property** → low marginal value pra SMALL feature com ratio coverage 1.64 já alto

## Next agent

- `@dev` — apply bug-found-002 + bug-found-003 fixes (M2-prep PR scope) + bug-found-001 decision
- OU `@qa` re-verify after fixes land (auto-cycle se Critical/High aparecer; Medium-only não dispara cycle)

Sessão `@tester` registrada via `aioson agent:done`.
